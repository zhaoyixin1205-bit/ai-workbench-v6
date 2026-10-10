/**
 * V8.3-10.10 超期悬赏提醒冒烟（运营方拍板口径 A：**只提醒组织者，不自动流转**）
 *
 * 三条口径：
 *  1. 「已超期」= due_date **早于今天**；当天到期算还在期内
 *  2. 只统计仍开放的 PUBLISHED / CLAIMED；EXPIRED（终态）与 APPROVED/REJECTED（决策结果）不该再提醒
 *  3. 只对 ORGANIZER / ADMIN 显示（与 /admin/bounty 的审核动作权限一致）
 *     且**不做任何状态流转** —— 无定时任务、无请求时惰性改状态
 */
import { readFileSync } from 'node:fs';

const results = [];
function check(name, fn) {
  let ok = false, detail = '';
  try { const r = fn(); ok = r === true; if (typeof r === 'string') detail = r; }
  catch (e) { detail = 'ERR: ' + e.message; }
  results.push({ ok, name, detail });
}
function read(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }
function code(p) { return read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); }

/* ============ A组：判定逻辑（用 esbuild 跑真代码，验数学不是验文本） ============ */
let F = null;
try {
  const esbuild = await import('esbuild');
  const out = await esbuild.transform(read('src/service/bountyOverdue.ts'), { loader: 'ts', format: 'esm' });
  F = await import('data:text/javascript;base64,' + Buffer.from(out.code).toString('base64'));
} catch (e) {
  results.push({ ok: false, name: 'A0 超期判定实现可加载', detail: 'esbuild 失败：' + e.message });
}
if (F) results.push({ ok: true, name: 'A0 超期判定实现可加载（运行真实代码）', detail: '' });

const B = (o) => ({ id: o.id || 'B', title: o.title || '悬赏', due_date: o.due, status: o.status || 'PUBLISHED', claimant_union_id: o.claimed ? 'u1' : undefined });

check('A1 到期当天**不算**超期（当天仍在期内）', () => {
  if (!F) return '实现未加载';
  const r = F.overdueBountiesOf([B({ id: 'B1', due: '2026-10-10' })], '2026-10-10');
  return r.length === 0 ? true : `due=今天被算成超期了（${r.length} 条）`;
});
check('A2 🔴 昨天到期且仍 PUBLISHED → 超期', () => {
  if (!F) return '实现未加载';
  const r = F.overdueBountiesOf([B({ id: 'B1', due: '2026-10-09' })], '2026-10-10');
  return r.length === 1 && r[0].id === 'B1' ? true : '未识别为超期';
});
check('A3 🔴 CLAIMED 也算超期（认领人名额待释放，组织者要处理）', () => {
  if (!F) return '实现未加载';
  const r = F.overdueBountiesOf([B({ id: 'B1', due: '2026-10-01', status: 'CLAIMED', claimed: true })], '2026-10-10');
  return r.length === 1 && r[0].claimed === true ? true : 'CLAIMED 超期未被识别，或 claimed 标记丢失';
});
check('A4🔴 EXPIRED / APPROVED / REJECTED 不再提醒（终态或已决策）', () => {
  if (!F) return '实现未加载';
  const list = ['EXPIRED', 'APPROVED', 'REJECTED'].map((s, i) => B({ id: 'X' + i, due: '2026-09-01', status: s }));
  const r = F.overdueBountiesOf(list, '2026-10-10');
  return r.length === 0 ? true : `不该提醒却提醒了 ${r.length} 条`;
});
check('A5 🔴 未超期的不提醒', () => {
  if (!F) return '实现未加载';
  const r = F.overdueBountiesOf([B({ id: 'B1', due: '2026-10-20' })], '2026-10-10');
  return r.length === 0 ? true : '未来到期的被误判为超期';
});
check('A6 文案区分有无认领人（组织者据此判断延期还是释放名额）', () => {
  if (!F) return '实现未加载';
  const one = F.overdueTodoText([{ id: 'B', title: '很长的悬赏标题用来测试截断行为', due_date: '2026-10-01', claimed: true }]);
  const two = F.overdueTodoText([{ id: 'B', title: 'x', due_date: '2026-10-01', claimed: false }]);
  if (!/名额待释放/.test(one)) return '单个有认领人时未提示「名额待释放」：' + one;
  if (!/无人认领/.test(two)) return '单个无人认领时未提示「无人认领」：' + two;
  const many = F.overdueTodoText([
    { id: 'B1', title: 'a', due_date: '2026-10-01', claimed: true },
    { id: 'B2', title: 'b', due_date: '2026-10-01', claimed: true },
    { id: 'B3', title: 'c', due_date: '2026-10-01', claimed: false },
  ]);
  return /3 个悬赏已超期（其中 2 个需释放认领名额）/.test(many) ? true : '多条文案未区分认领数：' + many;
});
check('A7 空列表返回空串（不留空白待办）', () => {
  if (!F) return '实现未加载';
  return F.overdueTodoText([]) === '' ? true : '空列表应返回空串';
});
check('A8 today 是必填参数（演示态要能固定"今天"）', () => {
  // 内部取new Date() 会让同一天两次跑结果不同，截图核验就不可复现
  const sig = /export function overdueBountiesOf\([\s\S]{0,200}?today:\s*string/.test(read('src/service/bountyOverdue.ts'));
  return sig ? true : 'today 未显式传入 —— 演示/截图核验无法固定今天';
});

/* ============ B组：首页接入 ============ */
const v1h = code('src/pages/c/Home.tsx');
const v2h = code('src/pages/v2/HomeV2.tsx');

check('B1 两版首页都接了超期待办', () => {
  return /overdueTodoText\(overdueBounties\)/.test(v1h) && /overdueTodoText\(overdueBounties\)/.test(v2h)
    ? true : '有版本未接入超期待办';
});
check('B2 🔴 仅组织者/管理员可见', () => {
  const a = /organizerOn = hasRole\('ORGANIZER'\) \|\| hasRole\('ADMIN'\)/.test(v1h);
  const b = /organizerOn = hasRole\('ORGANIZER'\) \|\| hasRole\('ADMIN'\)/.test(v2h);
  return a && b ? true : '未做组织者判断 —— 普通员工会看到运营事项';
});
check('B3 🔴 超期待办排在个人提醒之后（不占员工/评委的待办位）', () => {
  const iAsset = v1h.indexOf("key: 'asset'");
  const iOver = v1h.indexOf("key: 'overdue'");
  if (iAsset < 0 || iOver < 0) return '锚点缺失';
  return iOver > iAsset ? true : "超期项排到了 asset 之前 —— 会挤掉全员共性提醒";
});
check('B4 🔴 变量声明在 myTodos 之前（TDZ）', () => {
  const o = v1h.indexOf('const organizerOn');
  const m = v1h.indexOf('const myTodos');
  const o2 = v2h.indexOf('const organizerOn');
  const m2 = v2h.indexOf('const myTodos');
  return o > 0 && o < m && o2 > 0 && o2 < m2 ? true : 'organizerOn 声明在 myTodos 之后 → 运行时 TDZ';
});
check('B5 跳转到 /admin/bounty（组织者在那里能一键「开放认领」）', () => {
  return /to: '\/admin\/bounty'/.test(v1h) && /to: '\/admin\/bounty'/.test(v2h)
    ? true : '未跳转到后台悬赏页';
});

/* ============ C组：口径 A 的核心 —— 绝不自动流转 ============ */
check('C1 🔴 不得在超期时改写 bounty.status（口径 A：只提醒不流转）', () => {
  // 任何「超期就把状态置成 EXPIRED」的写法都违反口径 A
  const auto = [
    /status:\s*'EXPIRED'/.test(v1h) || /status:\s*'EXPIRED'/.test(v2h),
    /overdueBounties[\s\S]{0,200}?setDb/.test(v1h),
  ];
  return auto[0] === false && auto[1] === false
    ? true
    : '首页出现「超期即置 EXPIRED / setDb」—— 违反口径 A（只提醒），且误伤会释放认领名额';
});
check('C2 🔴 不引入定时器（项目没有后台调度器，惰性改状态更不可排查）', () => {
  const src = v1h + v2h;
  const has = /setInterval|setTimeout\([^)]*overdue/i.test(src);
  return has === false ? true : '出现了针对超期的定时器 —— 口径 A 不做自动流转';
});
check('C3 决策记录留在代码里（后人别重复讨论要不要自动流转）', () => {
  const s = read('src/service/bountyOverdue.ts');
  return /口径 A|不自动流转|为什么不做自动流转/.test(s) ? true : '缺少「为什么不自动流转」的决策记录';
});

/* ============ D组：反向自检 ============ */
/*
 * 反向断言的写法说明（这里我写错过一次，留个提示）：
 * 判据是「**假设的错误实现**会被 A1/A4 的数据抓到吗」。
 * 抓到 → 说明 A1/A4 有区分力 → 返回 true（断言有效）。
 * 别把「buggy 数组非空」直接当失败 —— 那等于在说「错误实现没被识别」，
 * 语义正好相反。
 */
check('D1 反向：A1 有区分力（把「到期当天也判超期」的错误实现放进去，A1 的数据会变成 1 条）', () => {
  // 正确实现：due < today → 今天到期不算超期（0 条）
  const correct = [B({ id: 'B1', due: '2026-10-10' })].filter((b) => b.due_date < '2026-10-10');
  // 错误实现：due <= today → 今天到期被算超期（1 条）
  const buggy = [B({ id: 'B1', due: '2026-10-10' })].filter((b) => b.due_date <= '2026-10-10');
  return correct.length === 0 && buggy.length === 1
    ? true
    : `区分力不足：correct=${correct.length} buggy=${bugy.length}（应分别为 0 和 1）`;
});
check('D2 反向：A4 有区分力（漏掉 status 过滤的话 EXPIRED 会被误报）', () => {
  const one = [B({ id: 'X', due: '2026-09-01', status: 'EXPIRED' })];
  const correct = one.filter((b) => (b.status === 'PUBLISHED' || b.status === 'CLAIMED') && b.due_date < '2026-10-10');
  const buggy = one.filter((b) => b.due_date < '2026-10-10'); // 漏掉 status 过滤
  return correct.length === 0 && buggy.length === 1
    ? true
    : `区分力不足：correct=${correct.length} buggy=${bugy.length}（应分别为 0 和 1）`;
});

const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n超期悬赏提醒冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);