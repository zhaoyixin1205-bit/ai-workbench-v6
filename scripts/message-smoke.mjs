/**
 * 消息中心口径冒烟（V8.3-10.08 需求⑤）
 *
 * 运行：npm run smoke:message
 *
 * 锁两条口径：
 *   ① 个人红点只算「发给本人」的未读；全员广播（union_id='all'）不占红点，
 *      但仍出现在消息列表里（看得见、点不动）。
 *   ② 点击整行即已读；「全部已读」只翻本人的，广播与别人的消息不动。
 *
 * 这两条一旦被改回去，用户看到的就是「点完了红点还在」/「别人的未读被我一键清掉」。
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(mkdtempSync(join(tmpdir(), 'wbmsg-')), 'messageCenter.cjs');
buildSync({ entryPoints: ['src/service/messageCenter.ts'], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
const M = require(out);

const results = [];
const check = (name, fn) => {
  try {
    const r = fn();
    results.push({ name, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (e) {
    results.push({ name, ok: false, detail: `EXCEPTION ${e.message}` });
  }
};

const ME = { union_id: 'u_me' };
const mk = (o = {}) => ({
  id: 'M1', union_id: 'u_me', type: 't', title: '标题', content: '内容',
  channel: '站内', status: '未读', sent_at: '2026-10-08 10:00', ...o,
});

/* ---------------- A. 未读数口径 ---------------- */
check('A1 本人未读 → 计数', () => M.countMyUnread([mk()], ME) === 1);
check('A2 本人已读 → 不计', () => M.countMyUnread([mk({ status: '已读' })], ME) === 0);
check('A3 全员广播未读 → 不占个人红点（本次修的核心口径）', () =>
  M.countMyUnread([mk({ id: 'b', union_id: 'all' })], ME) === 0);
check('A4 别人的未读 → 不计', () => M.countMyUnread([mk({ id: 'o', union_id: 'u_other' })], ME) === 0);
check('A5 混合：只数本人未读', () => {
  const got = M.countMyUnread([
    mk({ id: 'a' }), mk({ id: 'b', union_id: 'all' }), mk({ id: 'c', union_id: 'u_other' }), mk({ id: 'd', status: '已读' }),
  ], ME);
  return got === 1 ? true : `得到 ${got}`;
});
check('A6 undefined → 0，不炸', () => M.countMyUnread(undefined, ME) === 0);

/* ---------------- B. 可见列表 ---------------- */
check('B1 列表 = 本人 + 广播', () => {
  const got = M.visibleMessages([mk({ id: 'a' }), mk({ id: 'b', union_id: 'all' }), mk({ id: 'c', union_id: 'u_x' })], ME);
  return got.length === 2 ? true : `得到 ${got.map((m) => m.id)}`;
});
check('B2 时间倒序（最新在前）', () => {
  const got = M.visibleMessages([
    mk({ id: 'old', sent_at: '2026-10-01 09:00' }), mk({ id: 'new', sent_at: '2026-10-08 09:00' }),
  ], ME);
  return got[0].id === 'new' ? true : got.map((m) => m.id).join(',');
});

/* ---------------- C. 标记已读 ---------------- */
check('C1 点整行 → 该条变已读', () => {
  const got = M.markRead([mk()], 'M1', ME);
  return got[0].status === '已读' ? true : got[0].status;
});
check('C2 广播点了不改状态（避免半读半未读的自相矛盾）', () => {
  const got = M.markRead([mk({ id: 'b', union_id: 'all' })], 'b', ME);
  return got[0].status === '未读' ? true : `被改成了 ${got[0].status}`;
});
check('C3 别人的消息不被点改', () => {
  const got = M.markRead([mk({ id: 'o', union_id: 'u_x' })], 'o', ME);
  return got[0].status === '未读' ? true : `被改成了 ${got[0].status}`;
});
check('C4 全部已读：只翻本人未读', () => {
  const got = M.markAllMyRead([
    mk({ id: 'a' }), mk({ id: 'b', union_id: 'all' }), mk({ id: 'c', union_id: 'u_x' }), mk({ id: 'd', status: '已读' }),
  ], ME);
  const st = Object.fromEntries(got.map((m) => [m.id, m.status]));
  return st.a === '已读' && st.b === '未读' && st.c === '未读' && st.d === '已读'
    ? true
    : JSON.stringify(st);
});
check('C5 全部已读后红点归零', () => {
  const list = [mk({ id: 'a' }), mk({ id: 'b' })];
  return M.countMyUnread(M.markAllMyRead(list, ME), ME) === 0 ? true : '仍有未读';
});

/* ---------------- D. 排序（未读置顶） ---------------- */
check('D1 未读排在前、已读下沉', () => {
  const got = M.sortForInbox([mk({ id: 'r', status: '已读' }), mk({ id: 'u' })], ME);
  return got[0].id === 'u' ? true : got.map((m) => m.id).join(',');
});

/* ---------------- E. UI 契约（渲染层别写歪） ---------------- */
const src = (p) => readFileSync(p, 'utf8');
const v1 = src('src/pages/c/Profile.tsx');
const v2 = src('src/pages/v2/ProfileV2.tsx');
const l1 = src('src/layouts/CLayout.tsx');
const l2 = src('src/layouts/v2/CLayoutV2.tsx');

check('E1 v1/v2 个人中心都接了共享口径（不再各自 filter）', () => {
  const bad = [v1, v2].filter((s) => /messages\.filter\(\(m\) => m\.status === '未读'\)/.test(s));
  return bad.length === 0 ? true : '仍有页面在自己算未读数';
});
check('E2 两处布局红点都走 countMyUnread', () =>
  /countMyUnread/.test(l1) && /countMyUnread/.test(l2) ? true : '布局红点没走共享口径');
check('E3 v1/v2 都提供「全部已读」', () =>
  /全部已读/.test(v1) && /全部已读/.test(v2) ? true : '缺「全部已读」');
check('E4 v1/v2 消息行都可点（整行已读）', () =>
  /markRead\(p\.messages/.test(v1) && /markRead\(p\.messages/.test(v2) ? true : '有版本没接整行已读');

/* ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n消息口径冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);