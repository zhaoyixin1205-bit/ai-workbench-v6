/**
 * 首页「本周高频场景卡」共享判定层
 *
 * 为什么单独开文件：v1（pages/c/Home）与 v2（pages/v2/HomeV2）各画了一份同名板块，
 * 只要两边各写一遍筛选条件（算不算本周 / 要不要发布态 / 按什么分组 / 用什么配色），
 * 迟早漂移成两个口径 —— 用户会看到两个版本长得不一样。这里收口成纯函数，两个版本只负责渲染。
 *
 * 口径（组织者 2026-10-08 拍板）：
 *   ① 只展示「本周发布的已发布场景卡」，不再用案例列表兜底凑数；
 *      本周为空时展示空态文案 + 去案例库的入口，不留旧 chip 的假热闹。
 *   ② 按赛道分组，组内 3 列铺开，后续有新发布自动往九宫格补齐（不设上限，避免丢数据）。
 *   ③ 「本周」按真实今天的 ISO 周计算（不用 DEMO_TODAY —— 演示基准日会让「本周」失真）。
 */
import type { SceneCard } from '@/mock/types';
import { TRACKS } from '@/mock/types';

/** 卡片视图模型：在实体之上只补一个落点地址 */
export interface SceneCardVM extends SceneCard {
  /** 有来源案例 → 进案例详情；否则落到案例库 */
  href: string;
}

/** 赛道分组视图模型：配色随组下发，避免 v1/v2 各写一份色值 */
export interface SceneBandVM {
  track: string;
  cards: SceneCardVM[];
  /** 横带渐变底 */
  gradient: string;
  /** 赛道 pill 文字色 */
  ink: string;
}

/** 赛道 → 视觉：三赛道各一色（参考图：蓝紫 / 绿 / 橙） */
export const SCENE_BAND_STYLE: Record<string, { gradient: string; ink: string }> = {
  客户赋能: { gradient: 'linear-gradient(105deg,#e8ecff 0%,#f3e9ff 55%,#ffe9f3 100%)', ink: '#4B5BD7' },
  团队提效: { gradient: 'linear-gradient(105deg,#e6f9ec 0%,#eefbe6 55%,#dff5f0 100%)', ink: '#12845F' },
  销售提效: { gradient: 'linear-gradient(105deg,#fff3e0 0%,#ffe7cc 60%,#ffd9b8 100%)', ink: '#C2410C' },
};
/** 历史脏数据出现三赛道以外的 track 时用它兜底，不静默丢卡 */
const SCENE_BAND_FALLBACK: { gradient: string; ink: string } = {
  gradient: 'linear-gradient(105deg,#eef1f7 0%,#e9edf5 55%,#e6eaf2 100%)',
  ink: '#44546B',
};

export function bandStyleOf(track: string): { gradient: string; ink: string } {
  return SCENE_BAND_STYLE[track] ?? SCENE_BAND_FALLBACK;
}

/** ISO 周次键，如 '2026-W41'（周一定周、跨年按 ISO-8601 归属） */
export function isoWeekKey(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); // 移到本周四，跨年归属以此为基准
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function hrefOf(c: SceneCard): string {
  return c.source_case_id ? `/cases/${c.source_case_id}` : '/cases';
}

/** 本周可展示的场景卡：已发布 + 未软删 + 周次命中 */
export function selectThisWeekSceneCards(all: SceneCard[] | undefined, week: string = isoWeekKey()): SceneCard[] {
  return (all ?? []).filter((c) => c.status === 'PUBLISHED' && !c.is_deleted && (c.week ?? '') === week);
}

/**
 * 按赛道分组：三赛道顺序固定（与 TRACKS 一致），空组不返回；
 * 组内先 latest published_at，其次 id 升序（确定性，便于截图比对）。
 */
export function groupSceneByTrack(cards: SceneCard[]): SceneBandVM[] {
  const byTime = (a: SceneCard, b: SceneCard) => {
    const ta = a.published_at ?? a.created_at ?? '';
    const tb = b.published_at ?? b.created_at ?? '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  };
  const vm = (c: SceneCard): SceneCardVM => ({ ...c, href: hrefOf(c) });
  const known = new Set<string>(TRACKS);
  const bands: SceneBandVM[] = [];

  for (const track of TRACKS) {
    const hit = cards.filter((c) => (c.track ?? '') === track).sort(byTime);
    if (hit.length) bands.push({ track, cards: hit.map(vm), ...bandStyleOf(track) });
  }
  /* 三赛道以外的 track（历史脏数据）单独成组排在最后，宁可多一组也不丢卡 */
  const others = Array.from(new Set(cards.map((c) => c.track ?? '').filter((t) => t && !known.has(t))));
  for (const track of others) {
    const hit = cards.filter((c) => (c.track ?? '') === track).sort(byTime);
    if (hit.length) bands.push({ track, cards: hit.map(vm), ...bandStyleOf(track) });
  }
  return bands;
}

/** 页面一次性拿齐：本周周次 + 命中卡片总数 + 分组结果 */
export function buildSceneBoard(all: SceneCard[] | undefined, d: Date = new Date()) {
  const week = isoWeekKey(d);
  const cards = selectThisWeekSceneCards(all, week);
  return { week, total: cards.length, bands: groupSceneByTrack(cards) };
}
