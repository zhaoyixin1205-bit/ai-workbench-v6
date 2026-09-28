/**
 * V4.0 CR-09 · 技能管理员（SKILL_ADMIN）权限收敛
 *
 * 与 auth/access.ts 的关系（重要）：
 * - access.ts 是「单一真源」且已在 CR-12 冻结，本模块**不修改**它；
 * - 本模块只在 access.ts 已放行的结果之上做「收敛 / 只读 / 回收」；
 * - 两个开关全部关闭时完全等价于 V3.0 行为，无半生效。
 *
 * 口径依据：PRD V4.0 §6.2 矩阵 —— SKILL_ADMIN 在 进度看板 / 作业管理 /
 * 评分卡管理 / 悬赏审核 上标记为 ◐（可进入、数据受限、不可写），
 * 内容管理标记为 —（CR-09 收敛，默认 403）；CR-09 文本中的
 * 「后台只见概览 + 入库管理」落为菜单层的白名单。
 */
import { useStore } from '@/store/store';
import type { Role } from '@/mock/types';

/** 具备更高阶管理/审批权的角色；同时具备时不视为「纯技能管理员」 */
const SENIOR_ROLES: Role[] = ['ORGANIZER', 'ADMIN', 'JUDGE'];

/** CR-09：收敛态下，纯技能管理员后台 menus 只保留这些板块 */
export const SKILL_ADMIN_MENU = ['/admin', '/admin/asset'];

/** §6.2 矩阵中的 ◐ 页面：可进入但只读 */
export const SKILL_ADMIN_READONLY = [
  '/admin',
  '/admin/assignment',
  '/admin/scorecard',
  '/admin/bounty',
];

export function isPureSkillAdmin(roles: Role[]): boolean {
  return roles.includes('SKILL_ADMIN') && !SENIOR_ROLES.some((r) => roles.includes(r));
}

export interface ConvergeInput {
  roles: Role[];
  /** flags.skillAdminConverge */
  converge: boolean;
  /** flags.skillAdminGrantContent */
  grantContent: boolean;
}

export interface ConvergeResult {
  /** 是否处于收敛态（纯技能管理员 + 开关开启） */
  converged: boolean;
  /** 非 null：菜单只显示该白名单；null：不过滤 */
  menuKeys: string[] | null;
  /** 内容管理是否开放（grantContent） */
  canContent: boolean;
  /** 该路由是否为「可进不可写」的只读页 */
  isReadOnly: (path: string) => boolean;
}

export function resolveSkillAdminConverge(i: ConvergeInput): ConvergeResult {
  const converged = i.converge && isPureSkillAdmin(i.roles);
  const menuKeys = converged
    ? [...SKILL_ADMIN_MENU, ...(i.grantContent ? ['/admin/content'] : [])]
    : null;
  return {
    converged,
    menuKeys,
    canContent: converged && i.grantContent,
    isReadOnly: (path) => converged && SKILL_ADMIN_READONLY.includes(path),
  };
}

/**
 * 页面内使用：返回当前身份的 CR-09 收敛结果。
 * 纯函数的轻量封装，不做 memo（计算成本可忽略）。
 */
export function useSkillAdminConverge(): ConvergeResult {
  const { me, flags } = useStore();
  return resolveSkillAdminConverge({
    roles: me.roles,
    converge: flags.skillAdminConverge !== false,
    grantContent: flags.skillAdminGrantContent === true,
  });
}

/**
 * CR-10：资产「写」权限 = {ORGANIZER, SKILL_ADMIN, ADMIN}，
 * 其余角色在资产库只有查看 / 复制链接 / 查看复用说明。
 */
export function canWriteAsset(roles: Role[]): boolean {
  const writers: Role[] = ['ORGANIZER', 'SKILL_ADMIN', 'ADMIN'];
  return writers.some((r) => roles.includes(r));
}

export function useAssetWritable(): boolean {
  const { me } = useStore();
  return canWriteAsset(me.roles);
}
