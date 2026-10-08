/**
 * 首页「本周高频场景卡」口径冒烟
 *
 * 运行：npm run smoke:scene
 * 退出码：0 = 全绿；1 = 有失败（逐条打印）
 *
 * 为什么锁这一块：这个板块历史上改过三次口径（cases 派生 → sceneCards 实体 → 本周 + 已发布），
 * v1 与 v2 又各有一份渲染。口径一漂就是「首页两个版本长得不一样」。
 * 这里直接 esbuild 现场打包 src/service/sceneBoard.ts，不复制判定到脚本里。
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
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
/* C. 按赛道分组                                                       */
/* ------------------------------------------------------------------ */
check('C1 空组不返回（本周只有销售提效）', () => {
  const bands = S.groupSceneByTrack([mk({ id: 'x', track: '销售提效' })]);
  return bands.length === 1 && bands[0].track === '销售提效' ? true : JSON.stringify(bands.map((b) => b.track));
});
check('C2 分组顺序固定为 TRACKS（客户赋能 → 团队提效 → 销售提效）', () => {
  const bands = S.groupSceneByTrack([
    mk({ id: '3', track: '销售提效' }), mk({ id: '1', track: '客户赋能' }), mk({ id: '2', track: '团队提效' }),
  ]);
  return JSON.stringify(bands.map((b) => b.track)) === JSON.stringify(['客户赋能', '团队提效', '销售提效'])
    ? true
    : JSON.stringify(bands.map((b) => b.track));
});
check('C3 三赛道以外的脏数据单独成组、排在最后，不静默丢卡', () => {
  const bands = S.groupSceneByTrack([
    mk({ id: 'z', track: '未知赛道' }), mk({ id: '1', track: '客户赋能' }),
  ]);
  const last = bands[bands.length - 1];
  return bands.length === 2 && last.track === '未知赛道' && last.cards[0].id === 'z' ? true : JSON.stringify(bands.map((b) => b.track));
});
check('C4 组内按发布时间倒序', () => {
  const bands = S.groupSceneByTrack([
    mk({ id: 'old', track: '客户赋能', published_at: '2026-10-05 09:00' }),
    mk({ id: 'new', track: '客户赋能', published_at: '2026-10-07 09:00' }),
  ]);
  return bands[0].cards[0].id === 'new' ? true : bands[0].cards.map((c) => c.id).join(',');
});
check('C5 每张都带配色（gradient + ink）', () => {
  const bands = S.groupSceneByTrack([mk({ track: '客户赋能' })]);
  return !!bands[0].gradient && !!bands[0].ink ? true : JSON.stringify(bands[0]);
});

/* ------------------------------------------------------------------ */
/* D. 落点与总数                                                       */
/* ------------------------------------------------------------------ */
check('D1 有来源案例 → 进案例详情', () => {
  const b = S.groupSceneByTrack([mk({ source_case_id: 'W10' })]);
  return b[0].cards[0].href === '/cases/W10' ? true : b[0].cards[0].href;
});
check('D2 无来源案例 → 落到案例库', () => {
  const b = S.groupSceneByTrack([mk()]);
  return b[0].cards[0].href === '/cases' ? true : b[0].cards[0].href;
});
check('D3 total = 本周已发布卡数（不掺案例、不做兜底填充）', () => {
  const all = [mk({ id: 'a' }), mk({ id: 'b', status: 'DRAFT' }), mk({ id: 'c', week: '2026-W40' })];
  const board = S.buildSceneBoard(all, new Date(2026, 9, 8));
  return board.total === 1 && board.bands.length === 1 ? true : JSON.stringify({ total: board.total, bands: board.bands.length });
});
check('D4 本周为空 → total 0 / bands 空（首页走空态文案）', () => {
  const board = S.buildSceneBoard([mk({ week: '2026-W40' })], new Date(2026, 9, 8));
  return board.total === 0 && board.bands.length === 0 ? true : JSON.stringify(board);
});
check('D5 同一赛道本周发 6 张 → 全部出场、自动换行，不截断', () => {
  const all = Array.from({ length: 6 }, (_, i) => mk({ id: `s${i}`, track: '客户赋能' }));
  const board = S.buildSceneBoard(all, new Date(2026, 9, 8));
  return board.total === 6 && board.bands[0].cards.length === 6 ? true : JSON.stringify({ total: board.total });
});

/* ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n场景卡口径冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
