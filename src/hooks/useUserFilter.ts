/**
 * V8.3-10.07：用户与权限 —— 筛选 / 批量修改 / 批量删除 的共享逻辑。
 *
 * 为什么抽成 hook：v1（pages/b/UserAdmin.tsx）与 v2（pages/v2/UserAdminV2.tsx）是同一份业务的两套视觉，
 * 若各自实现一套筛选与批量写入，迟早会出现「v1 能筛、v2 筛不出来」的漂移。
 * 这里只放**判定与写入**，页面负责渲染层（antd Card vs .wb2-*）。
 */
import { useMemo } from 'react';
import type { Dept, Role, User } from '@/mock/types';
import { effectiveRoles, isDeptLeader } from '@/mock/types';

/** 筛选条件（全空 = 不筛选） */
export interface UserFilterState {
  keyword: string;
  deptId: string;
  /** 部门筛选是否包含子部门（默认勾选：组织者按部门看人时通常要含下级） */
  includeSub: boolean;
  role: Role | '';
  tag: string;
  status: number | '';
  source: '' | 'DINGTALK' | 'MANUAL';
  leader: '' | 'Y' | 'N';
}

export const EMPTY_USER_FILTER: UserFilterState = {
  keyword: '', deptId: '', includeSub: true, role: '', tag: '', status: '', source: '', leader: '',
};

export function hasUserFilter(f: UserFilterState): boolean {
  return !!(f.keyword || f.deptId || f.role || f.tag || f.status !== '' || f.source || f.leader);
}

/**
 * 部门子树 ID 集合（含自己）。
 * 钉钉部门是树，直接按 parent_id 精确匹配会把「选中层级的下级」漏掉 —— 这是最常见的筛选漏人口径。
 */
export function deptSubtreeIds(depts: Dept[], rootId: string): Set<string> {
  const out = new Set<string>();
  if (!rootId || depts.length === 0) return out;
  const childrenOf = new Map<string, string[]>();
  depts.forEach((d) => {
    const key = d.parent_id || '#ROOT#';
    const list = childrenOf.get(key) ?? [];
    list.push(d.dept_id);
    childrenOf.set(key, list);
  });
  const walk = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    (childrenOf.get(id) ?? []).forEach(walk);
  };
  walk(rootId);
  return out;
}

/** 单条用户是否命中筛选（不含软删与关键字，关键字由页面按原口径处理） */
export function matchUserFilter(u: User, f: UserFilterState, subTree: Set<string>): boolean {
  if (f.deptId) {
    // includeSub 时命中子树中任一部门；否则只认主部门（多部门任职按主部门口径，避免重复计数）
    const hit = f.includeSub
      ? (u.dept_id_list ?? []).some((id) => subTree.has(id))
      : (u.dept_id_list?.[0] ?? '') === f.deptId;
    if (!hit) return false;
  }
  if (f.role && !effectiveRoles(u).includes(f.role)) return false;
  if (f.tag && !(u.tags ?? []).includes(f.tag)) return false;
  if (f.status !== '' && u.status !== f.status) return false;
  if (f.source && (u.source ?? 'DINGTALK') !== f.source) return false;
  if (f.leader === 'Y' && !isDeptLeader(u)) return false;
  if (f.leader === 'N' && isDeptLeader(u)) return false;
  return true;
}

/** 页面侧：把 hook 结果缓存起来，避免每次渲染重算子部门树 */
export function useUserFilter(users: User[], depts: Dept[], f: UserFilterState) {
  return useMemo(() => {
    const subTree = deptSubtreeIds(depts ?? [], f.deptId);
    return { rows: users.filter((u) => matchUserFilter(u, f, subTree)), subTree };
  }, [users, depts, f]);
}

/** 筛选口径文案（导出表头与留痕共用，保证「导出去的东西能看到自己筛了什么」） */
export function userFilterSummary(
  f: UserFilterState,
  depts: Dept[],
  tags: { id: string; name: string }[],
  roleLabel: Record<string, string>,
): string {
  const parts: string[] = [];
  if (f.keyword) parts.push(`关键字「${f.keyword}」`);
  if (f.deptId) {
    parts.push(`${depts.find((d) => d.dept_id === f.deptId)?.name ?? f.deptId}${f.includeSub ? '及下级' : '（仅本级）'}`);
  }
  if (f.role) parts.push(`角色 ${roleLabel[f.role] ?? f.role}`);
  if (f.tag) parts.push(`标签 ${tags.find((t) => t.id === f.tag)?.name ?? f.tag}`);
  if (f.status !== '') {
    parts.push(`状态 ${['预注册', '已激活', '已停用', '已离职回收', '已删除'][f.status] ?? String(f.status)}`);
  }
  if (f.source) parts.push(f.source === 'MANUAL' ? '来源 手工' : '来源 钉钉映射');
  if (f.leader === 'Y') parts.push('仅部门负责人');
  if (f.leader === 'N') parts.push('非部门负责人');
  return parts.length ? parts.join(' · ') : '全部用户（不含已删除）';
}

/* ---------------- 批量修改 ---------------- */

export interface UserBatchPatch {
  /** 目标部门；null / undefined = 不变更 */
  dept?: { dept_id: string; name: string } | null;
  /** 追加角色 */
  addRoles?: Role[];
  /** 移除角色（撤销＝从 roles 摘掉，effectiveRoles 会自动兜底成普通成员） */
  removeRoles?: Role[];
  addTags?: string[];
  removeTags?: string[];
  /** 目标状态 null/空 = 不变更 */
  status?: number | null;
  /** 是否部门负责人 null = 不变更 */
  leader?: boolean | null;
  /** 是否同步管辖范围（仅在 Leader=true 时生效） */
  syncManaged?: boolean;
}

/**
 * 把批量补丁落到单个用户上，返回新对象（**不可写原对象**）。
 * 刻意没做的：不删除用户任何历史数据、不改 source（手工/钉钉来源不由批量修改决定）。
 */
export function applyUserBatchPatch(u: User, p: UserBatchPatch): User {
  const next: User = { ...u };
  if (p.dept) {
    next.dept_id_list = [p.dept.dept_id];
    next.dept_names = [p.dept.name];
    next.scope_dept_ids = [p.dept.dept_id];
    next.scope_type = 'DEPT_TREE';
  }
  if (p.addRoles?.length) {
    next.roles = [...new Set([...next.roles, ...p.addRoles])];
  }
  if (p.removeRoles?.length) {
    const drop = new Set(p.removeRoles);
    next.roles = next.roles.filter((r) => !drop.has(r));
    /** U-1：摘掉负责人派生标志时，管辖范围一并释放，避免「不是负责人却还管着」 */
    if (drop.has('LEADER')) { next.is_dept_leader = false; next.managed_dept_ids = []; }
  }
  if (p.addTags?.length) next.tags = [...new Set([...(next.tags ?? []), ...p.addTags])];
  if (p.removeTags?.length) {
    const dropT = new Set(p.removeTags);
    next.tags = (next.tags ?? []).filter((t) => !dropT.has(t));
  }
  if (p.status !== null && p.status !== undefined) next.status = p.status as User['status'];
  if (p.leader === true) {
    next.is_dept_leader = true;
    next.roles = [...new Set<Role>([...next.roles, 'LEADER' as Role])];
    if (p.syncManaged) next.managed_dept_ids = next.dept_id_list.slice(0, 1);
  }
  if (p.leader === false) {
    next.is_dept_leader = false;
    next.roles = next.roles.filter((r) => r !== 'LEADER');
    next.managed_dept_ids = [];
  }
  return next;
}

/** 批量补丁的人话摘要（留痕用：组织者事后要能看懂自己当时改了什么） */
export function describeBatchPatch(p: UserBatchPatch, dept?: Dept, roleLabel?: Record<string, string>, tagName?: (id: string) => string): string {
  const L = (r: Role) => roleLabel?.[r] ?? r;
  const parts: string[] = [];
  if (p.dept) parts.push(`部门改为 ${p.dept.name}`);
  if (p.addRoles?.length) parts.push(`追加角色 ${p.addRoles.map(L).join('、')}`);
  if (p.removeRoles?.length) parts.push(`移除角色 ${p.removeRoles.map(L).join('、')}`);
  if (p.addTags?.length) parts.push(`追加标签 ${p.addTags.map((t) => tagName?.(t) ?? t).join('、')}`);
  if (p.removeTags?.length) parts.push(`移除标签 ${p.removeTags.map((t) => tagName?.(t) ?? t).join('、')}`);
  if (p.status !== null && p.status !== undefined) {
    parts.push(`状态改为 ${['预注册', '已激活', '已停用', '已离职回收', '已删除'][p.status] ?? String(p.status)}`);
  }
  if (p.leader === true) parts.push(`设为部门负责人${p.syncManaged ? '（管辖范围同步）' : '（管辖范围保留原值）'}`);
  if (p.leader === false) parts.push('取消部门负责人');
  void dept;
  return parts.length ? parts.join('；') : '无有效变更';
}
