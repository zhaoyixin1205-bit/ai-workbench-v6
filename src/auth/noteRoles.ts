import type { Role } from '@/mock/types';

/**
 * V8.6-10.08：口径 / 规则 / 实现注解的可见角色白名单（纯判定，零依赖）
 *
 * 背景：页面里散落大量「CR-xx / 口径 / 数据来源 / 开关名 / 数据截止 T-1」这类
 * 面向实现者而非使用者的说明文案。需求口径：只有运营方需要知道「为什么这么算」，
 * 其余角色只看结论。因此统一收口到一个判定上，页面用 useNoteVisible() 条件渲染。
 *
 * 单独拆文件的原因：这里必须保持零依赖（不 import store / React），
 * 冒烟脚本 scripts/note-smoke.mjs 才能用 esbuild 直接现场打包校验，
 * 避免「把判定复制到脚本里」导致的双份漂移。
 */
export const NOTE_ROLES: Role[] = ['ORGANIZER', 'SKILL_ADMIN', 'ADMIN'];

/** 给定角色集合是否具备「看注解」资格 */
export function isNoteRole(roles: Role[] | undefined | null): boolean {
  return !!roles && roles.some((r) => NOTE_ROLES.includes(r));
}
