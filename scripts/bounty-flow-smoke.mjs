/**
 * V8.3-10.09 悬赏流程修复冒烟（对应 TEST_REPORT 的 BUG-01 / 03 / 04 / 09 / 10）
 *
 * 运营方口径：
 *   1=A 方案驳回后回 CLAIMED，认领人可重新提交（P0 死锁）
 *   2=B 方案审核 = 组织者 **或悬赏发布者** 双通道，且发布者不能审自己那条
 *
 * 每条断言都写清「为什么这条不能被破坏」，因为它们都是"看起来能跑、实际断链"的类型：
 * 单测全绿、业务走不通。
 */
import { readFileSync } from 'node:fs';

const results = [];
function check(name, fn) {
  let ok = false, detail = '';
  try {
    const r = fn();
    ok = r === true;
    if (typeof r === 'string') detail = r;
  } catch (e) { detail = 'ERR: ' + e.message; }
  results.push({ ok, name, detail });
}
function read(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}
function code(p) {
  return read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
}

const v1r = code('src/pages/b/BountyReview.tsx');
const v2r = code('src/pages/v2/BountyReviewV2.tsx');
const v1l = code('src/pages/c/BountyList.tsx');
const v2l = code('src/pages/v2/BountyListV2.tsx');
const board = code('src/hooks/useBountyBoard.ts');

/* ---------- A组：P0 死锁（BUG-01，口径 1=A） ---------- */
check('A1 方案驳回与悬赏驳回必须分开（原来共用一个 reject → 死锁）', () => {
  if (!/rejectKind/.test(v1r)) return 'v1 未区分驳回类型（rejectKind）';
  const fn = /const reject = \(kind: 'PUBLISH' \| 'SOLUTION'\)/.exec(v1r);
  return fn ? true : 'v1 reject 未按 kind 分支';
});
check('A2 🔴 方案驳回必须回 CLAIMED（让认领人能重新提交）', () => {
  const fn = /const reject = \(kind[\s\S]{0,1200}?\n};/.exec(v1r);
  if (!fn) return '未找到 v1 reject 实现';
  return /'SOLUTION'\s*\?\s*'CLAIMED'\s*:\s*'REJECTED'/.test(fn[0])
    ? true
    : "方案驳回没有回 CLAIMED —— 会重演「认领人页面无任何按钮」的线上死锁";
});
check('A3 🔴 方案驳回要清掉已提交痕迹，否则重提会带上旧方案', () => {
  return /kind === 'SOLUTION'[\s\S]{0,120}?solution:\s*undefined/.test(v1r)
    ? true
    : '方案驳回未清空 solution/solution_fields';
});
check('A4 两处驳回入口分别标 PUBLISH / SOLUTION', () => {
  const pub = (v1r.match(/setRejectKind\('PUBLISH'\)/g) || []).length;
  const sol = (v1r.match(/setRejectKind\('SOLUTION'\)/g) || []).length;
  if (pub !== 1 || sol !== 1) return `v1 标注数不对：PUBLISH=${pub} SOLUTION=${sol}（各应 1 处）`;
  const pub2 = (v2r.match(/setRejectKind\('PUBLISH'\)/g) || []).length;
  const sol2 = (v2r.match(/setRejectKind\('SOLUTION'\)/g) || []).length;
  return pub2 === 1 && sol2 === 1 ? true : `v2 标注数不对：PUBLISH=${pub2} SOLUTION=${sol2}`;
});
check('A5 v2 的方案驳回同样回 CLAIMED（v1/v2 零 diff 红线）', () => {
  return /'SOLUTION'\s*\?\s*'CLAIMED'\s*:\s*'REJECTED'/.test(v2r) ? true : 'v2 未按方案驳回回 CLAIMED';
});
check('A6 驳回弹窗标题要能区分（避免以为驳错了对象）', () => {
  const a = /rejectKind === 'SOLUTION'[\s\S]{0,80}驳回方案/.test(v1r);
  const b = /rejectKind === 'SOLUTION'[\s\S]{0,80}驳回方案/.test(v2r);
  return a && b ? true : '驳回弹窗标题未区分「驳回悬赏 / 驳回方案」';
});

/* ---------- B组：双通道审核（BUG-03，口径 2=B） ---------- */
check('B1 发布者能在 C 端审方案（原来只有 /admin/bounty 一条路）', () => {
  const hook = read('src/hooks/useSolutionReview.ts');
  if (!/canReviewAsOwner/.test(hook)) return '缺 useSolutionReview 共享 hook';
  return /通过方案/.test(v1l) && /通过方案/.test(v2l)
    ? true
    : 'C 端列表/详情未接发布者审核入口';
});
check('B2 🔴 发布者不能审自己发布的方案（回避原则）', () => {
  const hook = read('src/hooks/useSolutionReview.ts');
  const guards = (hook.match(/owner_union_id === me\.union_id/g) || []).length;
  if (guards < 2) return `useSolutionReview 只有 ${guards} 处回避校验（approve + reject 各需 1 处）`;
  return /approve[\s\S]{0,300}?回避/.test(hook) && /reject[\s\S]{0,300}?回避/.test(hook)
    ? true
    : 'approve/reject 未各自做回避校验';
});
check('B3 后台方案审核也要补回避（原来只有发布审核有 disabled）', () => {
  const a = /approveSolution[\s\S]{0,400}?owner_union_id === me\.union_id/.test(v1r);
  const b = /approveSolution[\s\S]{0,400}?owner_union_id === me\.union_id/.test(v2r);
  return a && b ? true : 'v1/v2 的 approveSolution 缺 owner!==me 回避校验（自审=自己给自己打分）';
});
check('B4 C 端要明示「不能审自己的方案」，不能只藏按钮', () => {
  const a = /你是发布人，不能审自己的方案/.test(v1l);
  const b = /你是发布人，不能审自己的方案/.test(v2l);
  return a && b ? true : '缺少「你是发布人，不能审自己的方案」提示，用户会以为漏配了权限';
});
check('B5 驳回理由仍需 ≥10 字（两条通道口径一致）', () => {
  const hook = read('src/hooks/useSolutionReview.ts');
  const v1lOk = /ownerReason\.trim\(\)\.length < 10/.test(v1l);
  const v2lOk = /ownerReason\.trim\(\)\.length < 10/.test(v2l);
  return hook && v1lOk && v2lOk ? true : '发布者驳回未做 10 字校验';
});

/* ---------- C组：v2 详情可见性（BUG-04） ---------- */
check('C1 🔴 v2 详情可见性不能缺取反符（缺了组织者反而看不到待审悬赏）', () => {
  // 真实写法是三行：const hidden = / [...].includes(...) && !mine / && !me.roles...；
  // 锚点用 `const hidden =` 而不是 `const hidden = [`（后者跨行匹配不到）
  const seg = /const hidden =[\s\S]{0,260}?;/.exec(v2l);
  if (!seg) return '未找到 v2 的 hidden 判断';
  if (/&&\s*me\.roles\.includes\('ORGANIZER'\)\s*;/.test(seg[0])) {
    return "缺 `!` —— v2 与 v1(BountyList.tsx) 口径相反，组织者访问 PENDING_REVIEW/REJECTED 详情会被判成对外不可见";
  }
  return /&&\s*!me\.roles\.includes\('ORGANIZER'\)\s*;/.test(seg[0]) ? true : 'v2 hidden 判断未按组织者放行';
});
check('C2 v1 的口径不能被改坏（v1 是正确的参照）', () => {
  const seg = /const detailHidden = \(b: Bounty\) =>[\s\S]{0,240}?;/m.exec(v1l);
  return seg && /!me\.roles\.includes\('ORGANIZER'\)/.test(seg[0]) ? true : 'v1 detailHidden 口径被改动';
});

/* ---------- D组：下架过滤与届次记账（BUG-09 / 10） ---------- */
check('D1 大厅要过滤 OFFLINE（下架后仍展示还能认领）', () => {
  const seg = /tab === 'all'[\s\S]{0,340}?\}/.exec(board);
  if (!seg) return '未找到大厅过滤段';
  return /status !== 'OFFLINE'/.test(seg[0]) ? true : "大厅过滤未含 OFFLINE —— 组织者下架的悬赏仍展示且可点认领";
});
check('D2 积分入账不能硬编码届次（换届次会记到错的活动上）', () => {
  const hook = read('src/hooks/useSolutionReview.ts');
  const hard1 = /campaign_id:\s*'C2026Q4'/.test(v1r);
  const hard2 = /campaign_id:\s*'C2026Q4'/.test(v2r);
  if (hard1 || hard2) return '后台审核页仍硬编码 C2026Q4';
  return /campaign_id: b\.campaign_id \|\|/.test(hook) ? true : '发布者通道未按悬赏所属届次记账';
});
check('D3 新建悬赏要写入 campaign_id（否则只能靠兜底）', () => {
  const a = /campaign_id:\s*db\.campaigns/.test(read('src/pages/c/BountyCreate.tsx'))
    || /campaign_id: db\.campaigns/.test(read('src/pages/c/BountyCreate.tsx'));
  const b = /campaign_id: p\.campaigns/.test(read('src/pages/v2/BountyCreateV2.tsx'));
  return a && b ? true : '新建悬赏未写入 campaign_id';
});
check('D4 Bounty 实体要有 campaign_id 字段（字段只增不删）', () => {
  return /campaign_id\?:\s*string/.test(read('src/mock/types.ts')) ? true : 'Bounty 缺 campaign_id 声明';
});

/* ---------- E组：反向自检 ---------- */
check('E1 把方案驳回改回 REJECTED，A2 必须失败', () => {
  const broken = v1r.replace(/'SOLUTION'\s*\?\s*'CLAIMED'\s*:\s*'REJECTED'/, "'SOLUTION' ? 'REJECTED' : 'REJECTED'");
  const fn = /const reject = \(kind[\s\S]{0,1200}?\n};/.exec(broken);
  return fn && /'SOLUTION'\s*\?\s*'CLAIMED'/.test(fn[0]) === false ? true : '断言无效';
});
check('E2 把 v2 的 ! 去掉，C1 必须失败', () => {
  const broken = v2l.replace(/&&\s*!me\.roles\.includes\('ORGANIZER'\)\s*;/, "&& me.roles.includes('ORGANIZER');");
  const seg = /const hidden =[\s\S]{0,260}?;/.exec(broken);
  return seg && /&&\s*!me\.roles\.includes\('ORGANIZER'\)\s*;/.test(seg[0]) === false ? true : '断言无效';
});

/* ---------- 输出 ---------- */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n悬赏流程修复冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);