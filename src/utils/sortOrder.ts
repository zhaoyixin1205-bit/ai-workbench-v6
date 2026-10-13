/**
 * V10.13：后台「场景卡 / 案例」排序共用的纯函数层。
 *
 * 背景（线上 bug 复盘）：V8.3-10.10（提交 21983ef）上的拖拽排序只把 `sort = 下标`
 * 写进每条记录，**从不重排数组**，而后台列表按数组原序渲染 —— 拖完松手列表
 * 一动不动，用户看到的就是「拖了没反应 / 顺序没变化」。员工端（sceneBoard 的
 * bySortThenTime、useCaseFilters）其实按 sort 排，所以数据半生效但后台零反馈，
 * 等于盲操作；叠加「新建/复制前插数组」后数组序与 sort 序持续漂移，拖拽的
 * 位置语义越来越错。
 *
 * 本文件把「顺序」收口成三个纯函数，后台渲染、拖拽落库、数字调位共用同一把尺子：
 *   ① bySortAsc       渲染用：sort 升序，缺省垫底，NaN 安全；
 *   ② reorderWithSort 落库用：按新 id 顺序重排数组，并把 sort 重写为 0..n-1；
 *   ③ moveIdTo        数字调位用：把某个 id 移到 1-based 目标位，返回新 id 顺序。
 *
 * 纯函数、零依赖：冒烟脚本（scripts/scene-smoke.mjs）直接 esbuild 打包后单测。
 */

/** 排序键：缺省 / 非有限数字一律垫底（Infinity），与员工端 sceneBoard.sortRank 同口径 */
function sortKey(x: { sort?: number }): number {
  return typeof x.sort === 'number' && Number.isFinite(x.sort) ? x.sort : Number.POSITIVE_INFINITY;
}

/**
 * 渲染排序：sort 越小越靠前；都缺省时返回 0（保持原相对序）。
 * ⚠️ 必须显式处理 `sa === sb`：Infinity - Infinity = NaN，传给 Array.sort
 * 是未定义行为（员工端 useCaseFilters 老写法就有这个隐患，本次一并修）。
 */
export function bySortAsc<T extends { sort?: number }>(a: T, b: T): number {
  const sa = sortKey(a);
  const sb = sortKey(b);
  if (sa === sb) return 0;
  return sa < sb ? -1 : 1;
}

/**
 * 落库：把 list 按 ids 的顺序重排，并给排中的条目重写 sort = 下标（0..n-1）。
 * 不在 ids 里的条目（已软删，任何前台都不可见）保持原相对序垫在末尾，sort 不动。
 * 返回新数组，不改入参。
 */
export function reorderWithSort<T extends { id: string; sort?: number }>(list: T[], ids: string[]): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const ordered = [...list].sort((a, b) => {
    const ia = rank.get(a.id);
    const ib = rank.get(b.id);
    if (ia === undefined && ib === undefined) return 0;
    if (ia === undefined) return 1;
    if (ib === undefined) return -1;
    return ia - ib;
  });
  return ordered.map((x) => (rank.has(x.id) ? { ...x, sort: rank.get(x.id)! } : x));
}

/**
 * 数字调位：把 id 移到 1-based 目标位（越界自动夹到 [1, ids.length]），返回新 id 顺序。
 * 语义 = 「把这个对象放到第 N 位」，随后由 reorderWithSort 统一重排 + 重编号，
 * 不会产出并列值，也就不会出现「两个第 3」这种谁也说不清的态。
 */
export function moveIdTo(ids: string[], id: string, pos1: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  const to = Math.max(0, Math.min(ids.length - 1, Math.round(pos1) - 1));
  if (to === from) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
