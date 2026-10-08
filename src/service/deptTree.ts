/**
 * V8.3-10.08 需求②：部门树共享口径层
 *
 * 为什么要单独一层：全站有 5 处都在回答同一个问题「这个人算不算在选中的部门里」，
 * 而历史实现分裂成两套：
 *   · 后台用户管理走 deptSubtreeIds()：按 parent_id 递归，语义正确；
 *   · 我的团队 / 可见范围 / store.visibleUsers 走 `d.startsWith(deptId)`前缀匹配 ——
 *     这在种子数据（部门 id 是 1 / 11 / 111 的层级串）里恰好成立，
 *     但钉钉真实部门 id 是数字串，`'11123'.startsWith('111')` 会**误命中**别的部门。
 * 多选之后更明显：选 3 个部门，命中人数会虚高。
 * 这里收口成一套显式树计算，所有调用方共用，谁也不许再自己写前缀匹配。
 */
import type { Dept } from '@/mock/types';

/** 虚拟根：钉钉顶级部门的 parent_id 为空 */
const ROOT = '#ROOT#';

/** parent_id → 子部门 id 列表（一次构建多处复用，别在循环里反复建） */
export function childrenIndex(depts: Dept[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const d of depts) {
    const key = d.parent_id || ROOT;
    const list = map.get(key);
    if (list) list.push(d.dept_id);
    else map.set(key, [d.dept_id]);
  }
  return map;
}

/**
 * 部门子树 ID 集合（含自己）。
 * 「选父部门= 含全部下级」是组织者明确要求（2026-10-08 拍板），这里就是唯一实现。
 */
export function deptSubtreeIds(depts: Dept[], rootId: string, children?: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  if (!rootId || depts.length === 0) return out;
  const idx = children ?? childrenIndex(depts);
  const walk = (id: string) => {
    if (out.has(id)) return; // 脏数据成环时兜底，别把递归打爆
    out.add(id);
    for (const c of idx.get(id) ?? []) walk(c);
  };
  walk(rootId);
  return out;
}

/** 多个部门的子树并集（多选场景用） */
export function deptSubtreeUnion(depts: Dept[], rootIds: string[]): Set<string> {
  if (!rootIds.length) return new Set();
  const idx = childrenIndex(depts);
  const out = new Set<string>();
  for (const r of rootIds) for (const id of deptSubtreeIds(depts, r, idx)) out.add(id);
  return out;
}

/**
 * 某人是否命中所选部门（多选 + 含下级）。
 * @param userDeptIds 该人的部门 id 列表（可能挂多个部门）
 * @param selectedIds  选中的部门 id 列表（空 = 不按部门筛）
 */
export function matchDepts(userDeptIds: string[] | undefined, selectedIds: string[], depts: Dept[]): boolean {
  if (!selectedIds.length) return true;
  const union = deptSubtreeUnion(depts, selectedIds);
  return (userDeptIds ?? []).some((d) => union.has(d));
}

/**
 * TreeSelect 的 treeData：把扁平部门表按 parent_id 组树。
 *
 * @param restrictTo 限定可选范围（例：我的团队只显示本人管辖部门）。
 *   范围外的部门整支剔除，但**保留所选部门的祖先节点**——否则选「商业侧」时
 *   树上只剩一个孤零零的叶子，用户看不出它挂在哪条线下。
 * @param fullPath 节点标题用「一级 / 二级 / …」全路径（同名部门分不清时用；默认只显示部门名）
 */
export interface DeptTreeNode {
  title: string;
  value: string;
  key: string;
  children?: DeptTreeNode[];
}

export function buildDeptTreeData(depts: Dept[], restrictTo?: string[], fullPath = false): DeptTreeNode[] {
  const all = new Map(depts.map((d) => [d.dept_id, d]));

  /** 需要保留的节点 = 选中部门 + 其祖先链 */
  let keep: Set<string> | null = null;
  if (restrictTo && restrictTo.length) {
    keep = new Set<string>();
    for (const id of restrictTo) {
      let cur: string | undefined = id;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        const node = all.get(cur);
        if (!node) break;
        keep.add(cur);
        cur = node.parent_id || undefined;
      }
    }
  }

  const byId = new Map<string, DeptTreeNode>();
  for (const d of depts) {
    if (keep && !keep.has(d.dept_id)) continue;
    byId.set(d.dept_id, { title: fullPath ? d.path || d.name : d.name, value: d.dept_id, key: d.dept_id });
  }

  const childrenOf = new Map<string, DeptTreeNode[]>();
  const roots: DeptTreeNode[] = [];
  for (const d of depts) {
    if (!byId.has(d.dept_id)) continue;
    const node = byId.get(d.dept_id)!;
    // 父节点被剔除（限定范围）或本身不存在时，本节点上提一层挂上去
    const parentId = d.parent_id && byId.has(d.parent_id) ? d.parent_id : '';
    if (parentId) {
      const list = childrenOf.get(parentId) ?? [];
      list.push(node);
      childrenOf.set(parentId, list);
    } else {
      roots.push(node);
    }
  }
  const attach = (nodes: DeptTreeNode[]) => {
    for (const n of nodes) {
      const kids = childrenOf.get(n.value);
      if (kids?.length) {
        n.children = kids;
        attach(kids);
      }
    }
  };
  attach(roots);
  return roots;
}

/** TreeSelect 回显用：把已选 id 补成「从根到该节点」的路径，否则多选框里显示成一串裸 id */
export function withPathTitles(depts: Dept[], selectedIds: string[]): string[] {
  const nameOf = new Map(depts.map((d) => [d.dept_id, d.name]));
  const parentOf = new Map(depts.map((d) => [d.dept_id, d.parent_id || '']));
  const full = (id: string): string => {
    const parts: string[] = [];
    let cur = id;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      parts.unshift(nameOf.get(cur) ?? cur);
      cur = parentOf.get(cur) ?? '';
    }
    return parts.join(' / ');
  };
  return (selectedIds ?? []).map(full);
}