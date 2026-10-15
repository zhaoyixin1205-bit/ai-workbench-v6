/**
 * 一次性诊断：用线上真实数据跑 buildSceneBoard 等价逻辑，
 * 打印首页「本周高频场景卡」每个 band 的 caseHref 与每张卡的 href。
 * 逻辑逐行对照 src/service/sceneBoard.ts（V10.13 版本）。
 */
import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

if (!process.env.DATABASE_URL) { console.error('!! 缺 DATABASE_URL，退出'); process.exit(1); }
const store = createStateStore(process.env);
await store.init();
if (store.name !== 'pg') { console.error('!! 驱动不是 pg，退出'); process.exit(1); }
const { data } = await store.read();
await store.close();

const TRACKS = ['客户赋能', '团队提效', '销售提效'];
const NO_CASE_KEY = '__NO_CASE__';
const NO_CASE_NAME = '未关联案例';
const SCENE_BAND_STYLE = {
  客户赋能: { gradient: 'a', ink: '#4B5BD7' },
  团队提效: { gradient: 'b', ink: '#12845F' },
  销售提效: { gradient: 'c', ink: '#C2410C' },
};
const FALLBACK = { gradient: 'f', ink: '#44546B' };
const bandStyleOf = (t) => SCENE_BAND_STYLE[t] ?? FALLBACK;

function isoWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
const hrefOf = (c) => (c.source_case_id ? `/cases/${c.source_case_id}` : '/cases');
const timeKey = (c) => c.published_at ?? c.created_at ?? '';
function byTimeDesc(a, b) {
  const ta = timeKey(a); const tb = timeKey(b);
  if (ta !== tb) return ta < tb ? 1 : -1;
  return a.id < b.id ? -1 : 1;
}
const sortRank = (c) => (typeof c.sort === 'number' ? c.sort : Number.POSITIVE_INFINITY);
function bySortThenTime(a, b) {
  const sa = sortRank(a); const sb = sortRank(b);
  if (sa !== sb) return sa < sb ? -1 : 1;
  return byTimeDesc(a, b);
}
function bandSort(band) {
  const ranks = band.map(sortRank).filter((r) => Number.isFinite(r));
  return ranks.length ? Math.min(...ranks) : undefined;
}
function latestAt(cards) {
  return cards.reduce((acc, c) => { const t = timeKey(c); return t > acc ? t : acc; }, '');
}
function trackOfRow(cards, fromCase) {
  if (fromCase && TRACKS.includes(fromCase)) return fromCase;
  const tally = new Map();
  for (const c of cards) { const t = (c.track ?? '').trim(); if (t) tally.set(t, (tally.get(t) ?? 0) + 1); }
  let best = (cards[0]?.track ?? '').trim(); let bestN = 0;
  for (const [t, n] of tally) { if (n > bestN) { best = t; bestN = n; } }
  return best || TRACKS[0];
}

const week = isoWeekKey();
const cards = (data.sceneCards ?? []).filter((c) => c.status === 'PUBLISHED' && !c.is_deleted && (c.week ?? '') === week);
console.log(`TODAY_WEEK=${week} 本周 PUBLISHED 卡=${cards.length}`);

const idx = new Map();
for (const c of data.cases ?? []) if (c && c.id) idx.set(c.id, c);
const buckets = new Map();
for (const c of cards) {
  const key = (c.source_case_id ?? '').trim() || NO_CASE_KEY;
  const b = buckets.get(key);
  if (b) b.push(c); else buckets.set(key, [c]);
}
const bands = [];
for (const [key, list] of buckets) {
  const sorted = [...list].sort(bySortThenTime);
  const cs = idx.get(key);
  const isNoCase = key === NO_CASE_KEY;
  const track = trackOfRow(sorted, cs?.track);
  const cardAuthors = Array.from(new Set(sorted.map((c) => (c.created_by ?? '').trim()).filter(Boolean)));
  const authorName = (cs?.author_name ?? '').trim() || cardAuthors.join('、');
  const caseName = cs?.title?.trim() ? cs.title.trim() : isNoCase ? NO_CASE_NAME : `案例 ${key}`;
  bands.push({
    key,
    caseId: isNoCase ? undefined : key,
    caseName,
    caseHref: isNoCase || !cs ? '/cases' : `/cases/${key}`,
    authorName, track, count: sorted.length,
    cards: sorted.map((c) => ({ ...c, href: hrefOf(c) })),
    ...bandStyleOf(track),
  });
}
bands.sort((a, b) => {
  const aNo = a.key === NO_CASE_KEY; const bNo = b.key === NO_CASE_KEY;
  if (aNo !== bNo) return aNo ? 1 : -1;
  const sa = bandSort(a.cards); const sb = bandSort(b.cards);
  if (sa !== undefined && sb !== undefined) return sa - sb;
  if (sa !== undefined) return -1;
  if (sb !== undefined) return 1;
  const ta = latestAt(a.cards); const tb = latestAt(b.cards);
  if (ta !== tb) return ta < tb ? 1 : -1;
  return a.key < b.key ? -1 : 1;
});

for (const [i, b] of bands.entries()) {
  console.log(`\n[行${i + 1}] caseName=${b.caseName} | caseHref=${b.caseHref} | author=${b.authorName} | track=${b.track} | bandSort=${bandSort(b.cards)} | caseInDb=${idx.has(b.key)}`);
  for (const c of b.cards) console.log(`   卡 ${c.id} href=${c.href} | ${c.title}`);
}
process.exit(0);
