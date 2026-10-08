/**
 * 首页「本周高频场景卡」口径冒烟
 *
 * 运行：npm run smoke:scene
 * 退出码：0 = 全绿；1 = 有失败（逐条打印）
 *
 * 为什么锁这一块：这个板块历史上改过多次口径（cases 派生 → sceneCards 实体 → 本周 + 已发布 → 按赛道分组 → 一行为一个案例），
 * v1 与 v2 又各有一份渲染。口径一漂就是「首页两个版本长得不一样」。
 * 这里直接 esbuild 现场打包 src/service/sceneBoard.ts，不复制判定到脚本里。
 *
 * V8.8-10.08 增补：
 *   E 组锁「一行为一个案例」的分组 / 命名 / 作者 / 赛道 / 排序；
 *   F 组锁 UI 契约（不显示发布时间、案例名胶囊、作者·赛道·N 张、v1/v2 都传了 cases），
 *   防止 service 层对了但渲染层又写成老样子。
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(mkdtempSync(join(tmpdir(), 'wbsc-')), 'sceneBoard.cjs');
buildSync({ entryPoints: ['src/service/sceneBoard.ts'], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
const S = require(out);

const results = [];
const check = (name, fn) => {
  try {
    const r = fn();
    results.push({ name, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (e) {
    results.push({ name, ok: false, detail: `EXCEPTION ${e.message}` });
  }
};

const mk = (o = {}) => ({
  id: 'SC-1', title: '标题', summary: '摘要', content: '', track: '客户赋能',
  emoji: '💡', status: 'PUBLISHED', week: '2026-W41', view_count: 0,
  published_at: '2026-10-06 09:00', ...o,
});
/** 案例桩：只给 sidewalk 需要的字段 */
const mkCase = (o = {}) => ({
  id: 'W1', track: '客户赋能', title: '案例甲', summary: '', pain_point: '', input: '', prompt: '',
  output: '', acceptance: [], level: '骨干层', tags: [], author_union_id: 'u1', author_name: '张三',
  like_count: 0, view_count: 0, reuse_count: 0, duration: '', cover: '', status: '已发布', created_at: '2026-10-01 09:00', ...o,
});

/* ------------------------------------------------------------------ */
/* A. ISO 周次                                                         */
/* ------------------------------------------------------------------ */
check('A1 普通周：2026-10-08 → 2026-W41', () => S.isoWeekKey(new Date(2026, 9, 8)) === '2026-W41' || S.isoWeekKey(new Date(2026, 9, 8)));
check('A2 周首：2026-10-05（周一）→ 2026-W41', () => S.isoWeekKey(new Date(2026, 9, 5)) === '2026-W41' || S.isoWeekKey(new Date(2026, 9, 5)));
check('A3 跨年归属：2027-01-01（周五）属上一个 ISO 年', () => {
  const got = S.isoWeekKey(new Date(2027, 0, 1));
  return got === '2026-W53' ? true : `得到 ${got}`;
});
check('A4 补零：周数小于 10 时两位', () => {
  const got = S.isoWeekKey(new Date(2026, 1, 5));
  return /^2026-W\d{2}$/.test(got) ? (got === '2026-W06' ? true : `得到 ${got}`) : `格式不对 ${got}`;
});

/* ------------------------------------------------------------------ */
/* B. 本周筛选                                                         */
/* ------------------------------------------------------------------ */
check('B1 本周 + 已发布 → 命中', () => S.selectThisWeekSceneCards([mk()], '2026-W41').length === 1);
check('B2 非本周 → 不进首页', () => S.selectThisWeekSceneCards([mk({ week: '2026-W40' })], '2026-W41').length === 0);
check('B3 草稿 / 下线 → 不进首页', () => {
  const got = S.selectThisWeekSceneCards([
    mk({ id: 'a', status: 'DRAFT' }), mk({ id: 'b', status: 'OFFLINE' }), mk({ id: 'c' }),
  ], '2026-W41');
  return got.length === 1 && got[0].id === 'c' ? true : `命中 ${got.map((x) => x.id)}`;
});
check('B4 软删 → 不进首页', () => S.selectThisWeekSceneCards([mk({ is_deleted: true })], '2026-W41').length === 0);
check('B5 无 week 字段 → 不当本周（不冒充新鲜）', () => S.selectThisWeekSceneCards([mk({ week: undefined })], '2026-W41').length === 0);
check('B6 数据源 undefined → 不炸，返回空', () => S.selectThisWeekSceneCards(undefined, '2026-W41').length === 0);

/* ------------------------------------------------------------------ */
/* C. 按赛道分组（历史口径，仅脚本对照，页面已不再调用）               */
/* ------------------------------------------------------------------ */
check('C1 [历史] 空组不返回（本周只有销售提效）', () => {
  const bands = S.groupSceneByTrack([mk({ id: 'x', track: '销售提效' })]);
  return bands.length === 1 && bands[0].track === '销售提效' ? true : JSON.stringify(bands.map((b) => b.track));
});
check('C2 [历史] 分组顺序固定为 TRACKS', () => {
  const bands = S.groupSceneByTrack([
    mk({ id: '3', track: '销售提效' }), mk({ id: '1', track: '客户赋能' }), mk({ id: '2', track: '团队提效' }),
  ]);
  return JSON.stringify(bands.map((b) => b.track)) === JSON.stringify(['客户赋能', '团队提效', '销售提效'])
    ? true
    : JSON.stringify(bands.map((b) => b.track));
});
check('C3 [历史] 三赛道以外脏数据单独成组排最后，不丢卡', () => {
  const bands = S.groupSceneByTrack([
    mk({ id: 'z', track: '未知赛道' }), mk({ id: '1', track: '客户赋能' }),
  ]);
  const last = bands[bands.length - 1];
  return bands.length === 2 && last.track === '未知赛道' && last.cards[0].id === 'z' ? true : JSON.stringify(bands.map((b) => b.track));
});
check('C4 [历史] 组内按发布时间倒序', () => {
  const bands = S.groupSceneByTrack([
    mk({ id: 'old', track: '客户赋能', published_at: '2026-10-05 09:00' }),
    mk({ id: 'new', track: '客户赋能', published_at: '2026-10-07 09:00' }),
  ]);
  return bands[0].cards[0].id === 'new' ? true : bands[0].cards.map((c) => c.id).join(',');
});

/* ------------------------------------------------------------------ */
/* D. 落点与总数                                                       */
/* ------------------------------------------------------------------ */
check('D1 有来源案例 → 进案例详情', () => {
  const b = S.groupSceneByCase([mk({ source_case_id: 'W10' })], [mkCase({ id: 'W10' })]);
  return b[0].cards[0].href === '/cases/W10' ? true : b[0].cards[0].href;
});
check('D2 无来源案例 → 落到案例库', () => {
  const b = S.groupSceneByCase([mk()], []);
  return b[0].cards[0].href === '/cases' ? true : b[0].cards[0].href;
});
check('D3 total = 本周已发布卡数（不掺案例、不做兜底填充）', () => {
  const all = [mk({ id: 'a' }), mk({ id: 'b', status: 'DRAFT' }), mk({ id: 'c', week: '2026-W40' })];
  const board = S.buildSceneBoard(all, [], new Date(2026, 9, 8));
  return board.total === 1 && board.bands.length === 1 ? true : JSON.stringify({ total: board.total, bands: board.bands.length });
});
check('D4 本周为空 → total 0 / bands 空（首页走空态文案）', () => {
  const board = S.buildSceneBoard([mk({ week: '2026-W40' })], [], new Date(2026, 9, 8));
  return board.total === 0 && board.bands.length === 0 ? true : JSON.stringify(board);
});
check('D5 同一案例本周发 6 张 → 全部出场、自动换行，不截断', () => {
  const all = Array.from({ length: 6 }, (_, i) => mk({ id: `s${i}`, source_case_id: 'W1' }));
  const board = S.buildSceneBoard(all, [mkCase({ id: 'W1' })], new Date(2026, 9, 8));
  return board.total === 6 && board.bands[0].cards.length === 6 ? true : JSON.stringify({ total: board.total });
});
check('D6 分行不丢卡：各行 count 之和 == total', () => {
  const all = [
    mk({ id: 'a', source_case_id: 'W1' }), mk({ id: 'b', source_case_id: 'W1' }),
    mk({ id: 'c', source_case_id: 'W2' }), mk({ id: 'd' }), mk({ id: 'e', track: '未知赛道' }),
  ];
  const board = S.buildSceneBoard(all, [mkCase({ id: 'W1' }), mkCase({ id: 'W2' })], new Date(2026, 9, 8));
  const sum = board.bands.reduce((n, b) => n + b.count, 0);
  return sum === board.total && sum === 5 ? true : JSON.stringify({ sum, total: board.total });
});

/* ------------------------------------------------------------------ */
/* E. 一行为一个案例（V8.8-10.08 现行口径）                            */
/* ------------------------------------------------------------------ */
check('E1 同一案例的多张卡 → 合并成一行', () => {
  const bands = S.groupSceneByCase([
    mk({ id: 'a', source_case_id: 'W1' }), mk({ id: 'b', source_case_id: 'W1' }),
  ], [mkCase({ id: 'W1' })]);
  return bands.length === 1 && bands[0].count === 2 ? true : JSON.stringify(bands.map((b) => [b.key, b.count]));
});
check('E2 不同案例 → 各成一行', () => {
  const bands = S.groupSceneByCase([
    mk({ id: 'a', source_case_id: 'W1' }), mk({ id: 'b', source_case_id: 'W2' }),
  ], [mkCase({ id: 'W1' }), mkCase({ id: 'W2', title: '案例乙' })]);
  return bands.length === 2 && bands[0].caseName === '案例甲' && bands[1].caseName === '案例乙'
    ? true
    : JSON.stringify(bands.map((b) => b.caseName));
});
check('E3 行头案例名取案例标题', () => {
  const b = S.groupSceneByCase([mk({ source_case_id: 'W7' })], [mkCase({ id: 'W7', title: '远程AI数据分析报告' })]);
  return b[0].caseName === '远程AI数据分析报告' ? true : b[0].caseName;
});
check('E4 未关联案例 → 单独成行标「未关联案例」且排最后，不静默丢弃', () => {
  const bands = S.groupSceneByCase([
    mk({ id: 'x' }), mk({ id: 'a', source_case_id: 'W1' }),
  ], [mkCase({ id: 'W1' })]);
  const last = bands[bands.length - 1];
  return bands.length === 2 && last.key === S.NO_CASE_KEY && last.caseName === '未关联案例' && last.cards[0].id === 'x'
    ? true
    : JSON.stringify(bands.map((b) => [b.key, b.caseName]));
});
check('E5 案例 id 指向已删/不存在的案例 → 兜底「案例 <id>」，落案例库', () => {
  const b = S.groupSceneByCase([mk({ source_case_id: 'W-404' })], []);
  return b[0].caseName === '案例 W-404' && b[0].caseHref === '/cases' ? true : JSON.stringify({ n: b[0].caseName, h: b[0].caseHref });
});
check('E6 行顺序：本行最新发布倒序（新案例在上）', () => {
  const bands = S.groupSceneByCase([
    mk({ id: 'c1', source_case_id: 'W1', published_at: '2026-10-05 09:00' }),
    mk({ id: 'c2', source_case_id: 'W2', published_at: '2026-10-07 09:00' }),
    mk({ id: 'c3', source_case_id: 'W3', published_at: '2026-10-06 09:00' }),
  ], [mkCase({ id: 'W1' }), mkCase({ id: 'W2' }), mkCase({ id: 'W3' })]);
  return JSON.stringify(bands.map((b) => b.key)) === JSON.stringify(['W2', 'W3', 'W1'])
    ? true
    : JSON.stringify(bands.map((b) => b.key));
});
check('E7 行内按发布时间倒序', () => {
  const b = S.groupSceneByCase([
    mk({ id: 'old', source_case_id: 'W1', published_at: '2026-10-05 09:00' }),
    mk({ id: 'new', source_case_id: 'W1', published_at: '2026-10-07 09:00' }),
  ], [mkCase({ id: 'W1' })]);
  return b[0].cards[0].id === 'new' ? true : b[0].cards.map((c) => c.id).join(',');
});
check('E8 作者：案例作者优先', () => {
  const b = S.groupSceneByCase([mk({ source_case_id: 'W1', created_by: '李四' })], [mkCase({ id: 'W1', author_name: '王磊' })]);
  return b[0].authorName === '王磊' ? true : b[0].authorName;
});
check('E9 作者：无关联案例时取场景卡创建人', () => {
  const b = S.groupSceneByCase([mk({ id: 'a', created_by: '李四' }), mk({ id: 'b', created_by: '李四' })], []);
  return b[0].authorName === '李四' ? true : b[0].authorName;
});
check('E10 赛道：案例自带 track 优先', () => {
  const b = S.groupSceneByCase([mk({ track: '客户赋能', source_case_id: 'W1' })], [mkCase({ id: 'W1', track: '团队提效' })]);
  return b[0].track === '团队提效' && b[0].ink === '#0369A1' ? true : JSON.stringify({ t: b[0].track, i: b[0].ink });
});
check('E11 赛道：无案例时按组内多数赛道兜底', () => {
  const b = S.groupSceneByCase([
    mk({ id: 'a', track: '销售提效' }), mk({ id: 'b', track: '销售提效' }), mk({ id: 'c', track: '客户赋能' }),
  ], []);
  return b[0].track === '销售提效' ? true : b[0].track;
});
check('E12 每行都带配色（gradient + ink）', () => {
  const bands = S.groupSceneByCase([
    mk({ id: 'a', source_case_id: 'W1' }), mk({ id: 'b', source_case_id: 'W2' }),
  ], [mkCase({ id: 'W1' }), mkCase({ id: 'W2', track: '未知赛道' })]);
  return bands.every((b) => !!b.gradient && !!b.ink) ? true : JSON.stringify(bands.map((b) => !!b.ink));
});
check('E13 cases 传 undefined / 空 → 不炸', () => {
  const a = S.groupSceneByCase([mk({ source_case_id: 'W1' })], undefined);
  const b = S.groupSceneByCase([mk({ source_case_id: 'W1' })], []);
  return a.length === 1 && b.length === 1 ? true : JSON.stringify({ a: a.length, b: b.length });
});
check('E14 source_case_id 为空串 / 空白 → 归入未关联行', () => {
  const b = S.groupSceneByCase([mk({ id: 'a', source_case_id: '   ' })], []);
  return b.length === 1 && b[0].key === S.NO_CASE_KEY ? true : JSON.stringify(b.map((x) => x.key));
});

/* ------------------------------------------------------------------ */
/* F. UI 契约（渲染层不得把口径写歪）                                  */
/* ------------------------------------------------------------------ */
const readSrc = (p) => readFileSync(p, 'utf8');
const boardSrc = readSrc('src/components/SceneBoard.tsx');
const cssSrc = readSrc('src/theme/v2/template.css');
const homeV1 = readSrc('src/pages/c/Home.tsx');
const homeV2 = readSrc('src/pages/v2/HomeV2.tsx');

check('F1 渲染层不显示发布时间（按 10-08 拍板）', () => {
  return !/published_at|created_at/.test(boardSrc) ? true : 'SceneBoard.tsx 里出现了发布时间字段';
});
check('F2 渲染层把案例名当行头小标志', () => {
  return /band\.caseName/.test(boardSrc) && /wb2-scpill/.test(boardSrc) && /wb2-scpill-tx/.test(boardSrc)
    ? true
    : '缺少 band.caseName / wb2-scpill 胶囊';
});
check('F3 meta 三项齐全：作者 · 赛道 · N 张', () => {
  return /band\.authorName/.test(boardSrc) && /band\.track/.test(boardSrc) && /band\.count/.test(boardSrc)
    ? true
    : 'meta 缺字段';
});
check('F4 CSS 提供 wb2-scmeta 样式（右上信息不裸奔）', () => {
  return /\.wb2-scmeta\s*\{/.test(cssSrc) ? true : 'template.css 缺 .wb2-scmeta';
});
check('F5 v1 与 v2 都传了 cases（防版本漂移）', () => {
  return /buildSceneBoard\(db\.sceneCards[^)]*db\.cases/.test(homeV1) && /buildSceneBoard\(db\.sceneCards[^)]*db\.cases/.test(homeV2)
    ? true
    : '某一版首页没传 cases，案例名会取不到';
});

/* ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n场景卡口径冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
