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
 *   ② **一行为一个案例**：同一来源案例的场景卡归到同一条横带，横带上用案例名做标志区分；
 *      一名多卡是常态（一个案例能拆出好几张卡），按赛道分组会让同一个案例被切成多行。
 *   ③ 「本周」按真实今天的 ISO 周计算（不用 DEMO_TODAY —— 演示基准日会让「本周」失真）。
 *   ④ 缺失 source_case_id 的卡不静默丢弃，单独成一行并标注「未关联案例」。
 */
import type { CaseItem, SceneCard } from '@/mock/types';
import { TRACKS } from '@/mock/types';

/** 卡片视图模型：在实体之上只补一个落点地址 */
export interface SceneCardVM extends SceneCard {
  /** 有来源案例 → 进案例详情；否则落到案例库 */
  href: string;
}

/** 未关联案例的场景卡统一落到这一行（key 固定，UI 与测试都靠它识别） */
export const NO_CASE_KEY = '__NO_CASE__';
/** 未关联行的行头文案 */
export const NO_CASE_NAME = '未关联案例';

/**
 * 一行=一个案例 的行视图模型：配色随行下发，避免 v1/v2 各写一份色值
 *
 * 刻意**不带发布时间**：2026-10-08 拍板「不显示发布时间」——
 * 卡片强调的是当下能用的招式，日期会把注意力拉走；要看时间进案例详情。
 */
export interface SceneBandVM {
  /** 行标识：案例 id，未关联时为 NO_CASE_KEY */
  key: string;
  /** 有来源案例时 = 案例 id，便于 UI 决定要不要给「查看案例」入口 */
  caseId?: string;
  /** 行头案例名（未关联时为「未关联案例」） */
  caseName: string;
  /** 行头点击落点：/cases/<id> 或 /cases */
  caseHref: string;
  /** 作者名（案例作者优先，其次场景卡创建人；都没有则空串） */
  authorName: string;
  /** 本行所属赛道（用于 meta 文字与渐变配色） */
  track: string;
  /** 本行卡片数（UI 显示「N 张」） */
  count: number;
  cards: SceneCardVM[];
  /** 横带渐变底 */
  gradient: string;
  /** 行头胶囊文字色 */
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

/** 卡的排序时间：发布时间优先，其次创建时间 */
function timeKey(c: SceneCard): string {
  return c.published_at ?? c.created_at ?? '';
}

/** 组内 / 行内排序：先发布 later 优先，其次 id 升序（确定性，便于截图比对） */
function byTimeDesc(a: SceneCard, b: SceneCard): number {
  const ta = timeKey(a);
  const tb = timeKey(b);
  if (ta !== tb) return ta < tb ? 1 : -1;
  return a.id < b.id ? -1 : 1;
}

/** 一行的时间基准 = 组内最新一张的时间（用于行倒序） */
function latestAt(cards: SceneCard[]): string {
  return cards.reduce((acc, c) => {
    const t = timeKey(c);
    return t > acc ? t : acc;
  }, '');
}

/**
 * 行所属赛道：案例自带 track 优先（案例是归属主体）；
 * 没有关联案例或案例无 track 时，按组内卡片的多数赛道兜底。
 */
function trackOfRow(cards: SceneCard[], fromCase?: string): string {
  if (fromCase && (TRACKS as string[]).includes(fromCase)) return fromCase;
  const tally = new Map<string, number>();
  for (const c of cards) {
    const t = (c.track ?? '').trim();
    if (t) tally.set(t, (tally.get(t) ?? 0) + 1);
  }
  let best = (cards[0]?.track ?? '').trim();
  let bestN = 0;
  for (const [t, n] of tally) {
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best || TRACKS[0];
}

/** 本周可展示的场景卡：已发布 + 未软删 + 周次命中 */
export function selectThisWeekSceneCards(all: SceneCard[] | undefined, week: string = isoWeekKey()): SceneCard[] {
  return (all ?? []).filter((c) => c.status === 'PUBLISHED' && !c.is_deleted && (c.week ?? '') === week);
}

/**
 * 按来源案例分组：一行为一个案例。
 *
 * · 行顺序：本行最新发布时间倒序（新案例在上），未关联行固定在最后；
 * · 行内顺序：发布时间倒序，其次 id 升序；
 * · 案例名取 cases 里的 title，找不到案例时用 `案例 <id>` 兜底（不显示空白行头）。
 */
export function groupSceneByCase(cards: SceneCard[], cases: CaseItem[] = []): SceneBandVM[] {
  const idx = new Map<string, CaseItem>();
  for (const c of cases ?? []) {
    if (c && c.id) idx.set(c.id, c);
  }
  const buckets = new Map<string, SceneCard[]>();
  for (const c of cards) {
    const key = (c.source_case_id ?? '').trim() || NO_CASE_KEY;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(c);
    else buckets.set(key, [c]);
  }

  const bands: SceneBandVM[] = [];
  for (const [key, list] of buckets) {
    const sorted = [...list].sort(byTimeDesc);
    const cs = idx.get(key);
    const isNoCase = key === NO_CASE_KEY;
    const track = trackOfRow(sorted, cs?.track);
    /** 作者：案例作者优先；没有案例时取场景卡创建人（多人去重后顿号连接） */
    const cardAuthors = Array.from(new Set(sorted.map((c) => (c.created_by ?? '').trim()).filter(Boolean)));
    const authorName = (cs?.author_name ?? '').trim() || cardAuthors.join('、');
    const caseName = cs?.title?.trim()
      ? cs.title.trim()
      : isNoCase
        ? NO_CASE_NAME
        : `案例 ${key}`;
    bands.push({
      key,
      caseId: isNoCase ? undefined : key,
      caseName,
      caseHref: isNoCase || !cs ? '/cases' : `/cases/${key}`,
      authorName,
      track,
      count: sorted.length,
      cards: sorted.map((c) => ({ ...c, href: hrefOf(c) })),
      ...bandStyleOf(track),
    });
  }

  /* 未关联案例的一行排最后：它只是兜底容器，不该抢在真实案例前面 */
  bands.sort((a, b) => {
    const aNo = a.key === NO_CASE_KEY;
    const bNo = b.key === NO_CASE_KEY;
    if (aNo !== bNo) return aNo ? 1 : -1;
    const ta = latestAt(a.cards);
    const tb = latestAt(b.cards);
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.key < b.key ? -1 : 1;
  });
  return bands;
}

/**
 * @deprecated 早期口径：按赛道分组。2026-10-08 起首页改为「一行为一个案例」（groupSceneByCase），
 * 本函数仅为排查对照 / 数据口径验证保留，页面不再调用。
 */
export function groupSceneByTrack(cards: SceneCard[]): { track: string; cards: SceneCardVM[]; gradient: string; ink: string }[] {
  const vm = (c: SceneCard): SceneCardVM => ({ ...c, href: hrefOf(c) });
  const known = new Set<string>(TRACKS);
  const bands: { track: string; cards: SceneCardVM[]; gradient: string; ink: string }[] = [];

  for (const track of TRACKS) {
    const hit = cards.filter((c) => (c.track ?? '') === track).sort(byTimeDesc);
    if (hit.length) bands.push({ track, cards: hit.map(vm), ...bandStyleOf(track) });
  }
  /* 三赛道以外的 track（历史脏数据）单独成组排在最后，宁可多一组也不丢卡 */
  const others = Array.from(new Set(cards.map((c) => c.track ?? '').filter((t) => t && !known.has(t))));
  for (const track of others) {
    const hit = cards.filter((c) => (c.track ?? '') === track).sort(byTimeDesc);
    if (hit.length) bands.push({ track, cards: hit.map(vm), ...bandStyleOf(track) });
  }
  return bands;
}

/** 页面一次性拿齐：本周周次 + 命中卡片总数 + 按案例分组的行 */
export function buildSceneBoard(all: SceneCard[] | undefined, cases: CaseItem[] = [], d: Date = new Date()) {
  const week = isoWeekKey(d);
  const cards = selectThisWeekSceneCards(all, week);
  return { week, total: cards.length, bands: groupSceneByCase(cards, cases) };
}
