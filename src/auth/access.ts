/**
 * 路由访问授权表 —— 全站页面级守卫的「单一真源」
 *
 * 设计约定（PRD V4.0 §6 / CR-12）：
 * 1. 后台菜单渲染、页内守卫、操作级判定共用同一份配置，避免两处定义漂移；
 * 2. 后台未在表中显式授权的路由按 fail-closed 处理（默认拒绝）；
 * 3. 任何变更都要能独立回滚：仅改动本表即可恢复 V3.0 行为。
 */
import type { Role } from '@/mock/types';

export type FlagKey = 'community' | 'shop' | 'clinic' | 'wbAdmin';

export interface RouteAccess {
  /** 路由路径（支持前缀匹配，如 /cases 覆盖 /cases/:id） */
  key: string;
  label: string;
  /** 允许进入的角色；空数组表示「所有已登录用户」 */
  roles?: Role[];
  /** 明确拒绝的角色，优先级高于 roles */
  denyRoles?: Role[];
  /** 依赖的功能开关，关闭时不可进入 */
  flag?: FlagKey;
  /**
   * 是否存在子路由（如 /cases/:id、/work/submit/:typeId）。
   * 只有声明 children 的 key 才允许前缀继承授权；未声明者仅精确匹配，
   * 这是后台 fail-closed 的实现基础（未登记的 /admin/xxx 一律拒绝）。
   */
  children?: boolean;
  /** 403 页展示的限制依据（对应 PRD 章节） */
  reason: string;
}

/** 管理后台路由授权表（fail-closed：未命中即为拒绝） */
export const ADMIN_ACCESS: RouteAccess[] = [
  {
    key: '/admin', label: '进度看板',
    roles: ['LEADER', 'EXPERT', 'ORGANIZER', 'SKILL_ADMIN', 'ADMIN'],
    reason: 'PRD V4.0 §6.2：进度看板仅 LEADER / EXPERT / ORGANIZER / SKILL_ADMIN / ADMIN 可见，数据范围仍按 §3.4 Scope 收敛。',
  },
  {
    key: '/admin/assignment', label: '作业管理',
    roles: ['LEADER', 'EXPERT', 'ORGANIZER', 'SKILL_ADMIN', 'ADMIN'],
    reason: 'PRD V4.0 §6.2：同「进度看板」行口径；EXPERT 进入后仅可见本人相关数据。',
  },
  {
    key: '/admin/scorecard', label: '评分卡管理',
    roles: ['LEADER', 'EXPERT', 'ORGANIZER', 'SKILL_ADMIN', 'ADMIN'],
    reason: 'PRD V4.0 §6.2：评分卡权重可配（Q8），开放给观察类与管理类角色。',
  },
  {
    key: '/admin/bounty', label: '悬赏审核',
    roles: ['LEADER', 'EXPERT', 'ORGANIZER', 'SKILL_ADMIN', 'ADMIN'],
    reason: 'PRD V4.0 §6.2：同「进度看板」行口径。',
  },
  {
    key: '/admin/judge', label: '评委复核',
    roles: ['JUDGE', 'ORGANIZER', 'ADMIN'],
    reason: 'PRD V3.0 §6.6 + V4.0 §6.2：复核与真实性确认仅评委 / 组织者可执行，管理员可见不可操作。',
  },
  {
    key: '/admin/expert', label: '专家与排班',
    roles: ['ORGANIZER', 'ADMIN'], flag: 'clinic',
    reason: 'PRD V3.0 §6.4.7：专家名单与忙闲排班由组织者维护；受 clinic 开关控制。',
  },
  {
    key: '/admin/asset', label: '入库管理',
    roles: ['ORGANIZER', 'SKILL_ADMIN', 'ADMIN'],
    reason: 'PRD V4.0 §6.2：入库审核与上架仅组织者 / 技能管理员 / 系统管理员。',
  },
  {
    key: '/admin/content', label: '内容管理',
    roles: ['ORGANIZER', 'ADMIN'],
    reason: 'PRD V4.0 CR-09：案例、选题池、场景卡等内容权限收敛为组织者与系统管理员；技能管理员不再具备编辑权。',
  },
  {
    key: '/admin/community', label: '社区管理',
    roles: ['ORGANIZER', 'ADMIN'], flag: 'community',
    reason: 'PRD V3.0 §6.11.6：内容审核与治理由组织者负责；受 community 开关控制。',
  },
  {
    key: '/admin/shop', label: '商城管理',
    roles: ['ORGANIZER', 'ADMIN'], flag: 'shop',
    reason: 'PRD V3.0 §6.8.2 + Q6：商品编辑以系统管理员为准，组织者负责核销与对账；受 shop 开关控制。',
  },
  {
    key: '/admin/users', label: '用户与权限',
    roles: ['ORGANIZER', 'ADMIN'],
    reason: 'PRD V3.0 §6.9.1 + V4.0 CR-11：用户、角色、手工导入与编制管理。',
  },
  {
    key: '/admin/campaign', label: '届次与配置',
    roles: ['ORGANIZER', 'ADMIN'],
    reason: 'PRD V3.0 §6.9.1：届次周期与规则配置由组织者维护。',
  },
  {
    key: '/admin/system', label: '系统管理',
    roles: ['ORGANIZER', 'ADMIN'],
    reason: 'PRD V3.0 §6.9.1：系统配置、日志审计与看板配置（V4.0 CR-06）。',
  },
  {
    key: '/admin/wb', label: '管理员数据',
    roles: ['ADMIN'], flag: 'wbAdmin',
    reason: 'PRD V3.0 §6.12.2：M12 为最高权限模块，仅系统管理员可访问，且首次访问需完成 WorkBuddy 管理员页登录验证。',
  },
  {
    key: '/admin/expert-workbench', label: '专家工作台',
    roles: ['EXPERT'], flag: 'clinic',
    reason: 'PRD V3.0 §6.4.7 + V4.0 §6.2：专家端工作台仅问诊专家可见，受 clinic 开关控制。',
  },
];

/** C 端路由授权表（默认放行：C 端 9 模块对全员开放） */
export const C_ACCESS: RouteAccess[] = [
  { key: '/', label: '首页', reason: '' },
  { key: '/cases', label: '案例与选题', reason: '', children: true },
  {
    key: '/bounty/create', label: '发布悬赏', denyRoles: ['VIEWER'], children: true,
    reason: 'PRD V3.0 §3.2：观众仅可浏览公示内容与作品展示，不参与发布与提交。',
  },
  { key: '/bounty', label: '悬赏榜', reason: '' },
  {
    key: '/work/submit', label: '作业提交', denyRoles: ['VIEWER'], children: true,
    reason: 'PRD V3.0 §3.2：观众不具备作业提交资格。',
  },
  { key: '/work', label: '作业提报', reason: '', children: true },
  { key: '/clinic', label: '专家门诊', flag: 'clinic', children: true, reason: 'PRD V3.0 §6.4：专家门诊由 clinic 开关控制。' },
  { key: '/community', label: '社区', flag: 'community', children: true, reason: 'PRD V3.0 §6.11：社区由 community 开关控制。' },
  { key: '/assets', label: '资产库', reason: '' },
  { key: '/shop', label: '积分商城', flag: 'shop', reason: 'PRD V3.0 §6.8.2：积分商城由 shop 开关控制。' },
  { key: '/me', label: '个人中心', reason: '' },
];

export interface GuardSubject {
  roles: Role[];
  flags: Record<FlagKey, boolean>;
}

export interface GuardDeny {
  kind: 'ROLE' | 'FLAG' | 'NOT_FOUND';
  /** 命中的路由授权定义 */
  access: RouteAccess;
  message: string;
}

export type GuardResult = { ok: true; access: RouteAccess } | ({ ok: false } & GuardDeny);

/** 按最长前缀匹配路由授权项 */
export function matchAccess(path: string, list: RouteAccess[]): RouteAccess | undefined {
  // 1) 精确匹配优先（同 key 取最长）
  let best: RouteAccess | undefined;
  for (const item of list) {
    if (item.key === path && (!best || item.key.length > best.key.length)) best = item;
  }
  if (best) return best;
  // 2) 前缀继承：仅对声明了 children 的 key 生效
  for (const item of list) {
    if (!item.children) continue;
    if (path.startsWith(item.key + '/') && (!best || item.key.length > best.key.length)) best = item;
  }
  return best;
}

/** 判定当前身份是否可访问某路由 */
export function checkAccess(path: string, subject: GuardSubject, list: RouteAccess[]): GuardResult {
  const access = matchAccess(path, list);
  if (!access) return { ok: false, kind: 'NOT_FOUND', message: '该页面未在授权表中登记', access: EMPTY };
  if (access.denyRoles?.some((r) => subject.roles.includes(r))) {
    return { ok: false, kind: 'ROLE', access, message: access.reason || '当前角色不允许访问该页面' };
  }
  if (access.roles?.length && !access.roles.some((r) => subject.roles.includes(r))) {
    return { ok: false, kind: 'ROLE', access, message: access.reason || '当前角色不允许访问该页面' };
  }
  if (access.flag && !subject.flags[access.flag]) {
    return { ok: false, kind: 'FLAG', access, message: `「${access.label}」模块当前未开启，请联系组织者在系统管理中启用。` };
  }
  return { ok: true, access };
}

/** 后台专用：未登记路由默认拒绝（fail-closed） */
export function checkAdminAccess(path: string, subject: GuardSubject): GuardResult {
  return checkAccess(path, subject, ADMIN_ACCESS);
}

/** C 端专用：未登记路由默认放行 */
export function checkCAccess(path: string, subject: GuardSubject): GuardResult {
  const access = matchAccess(path, C_ACCESS);
  if (!access) return { ok: true, access: { key: path, label: '工作台', reason: '' } };
  return checkAccess(path, subject, C_ACCESS);
}

const EMPTY: RouteAccess = { key: '', label: '', reason: '' };

/** 菜单渲染：过滤出当前身份可见的后台项 */
export function visibleAdminRoutes(subject: GuardSubject): RouteAccess[] {
  return ADMIN_ACCESS.filter((a) => checkAdminAccess(a.key, subject).ok);
}

/** 后台入口（右上角「后台」按钮）是否可见 */
export function canEnterAdmin(subject: GuardSubject & { isDeptLeader: boolean }): boolean {
  return visibleAdminRoutes(subject).length > 0 || subject.isDeptLeader;
}
