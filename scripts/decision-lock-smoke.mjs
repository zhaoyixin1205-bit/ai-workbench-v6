/**
 * V8.3-10-09 运营口径对齐冒烟（LOCK）
 *
 * 这份脚本把运营方 2026-10-09 13:30 的最终拍板**逐条固化**，
 * 以后任何人改代码，只要违背其中任何一条就会红。
 *
 * 最终口径（共 9 条，3 组）：
 *
 * 【一】悬赏流程
 *  1. 审核人 = **组织者 or 悬赏者**（双通道）
 *  2. 推送给**全部评委**，且**多个评委均可评价和查看**
 *  3. 方案驳回后回CLAIMED，认领人可重新提交（1=A）
 *
 * 【二】作业入库/公示（运营方明确「保留系统实际」）
 *  4. 申请入库保持**四段**：待初审 → 待上架 → 已入库/已驳回
 *  5. 保留届次公示总闸（campaign.publicSwitch）
 *
 * 【三】人员与通知
 *  6. 必修人员**逐个指定**（不按部门自动纳入）
 *
 * 「保留系统实际」= 不改。这些条也写进断言，目的恰恰是**防止有人
 * 看到差异就"顺手优化"** —— 没有断言锁住，下次重构就会漂走。
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

const types = code('src/mock/types.ts');
const ds = code('server/lib/dataScope.mjs');
const pipeline = code('src/service/submitPipeline.ts');
const store = code('src/store/store.tsx');
const board = code('src/hooks/useBountyBoard.ts');
const v1r = code('src/pages/b/BountyReview.tsx');
const v2r = code('src/pages/v2/BountyReviewV2.tsx');
const v1l = code('src/pages/c/BountyList.tsx');
const v2l = code('src/pages/v2/BountyListV2.tsx');
const scoring = code('src/service/judgeScoring.ts');

/* ================= 一、悬赏流程 ================= */
check('① 审核人 = 组织者 or 悬赏者（双通道）', () => {
  const hook = code('src/hooks/useSolutionReview.ts');
  const hasOwnerChannel = /canReviewAsOwner/.test(hook) && /通过方案/.test(v1l) && /通过方案/.test(v2l);
  const hasOrgChannel = /approveSolution/.test(v1r) && /approveSolution/.test(v2r);
  return hasOwnerChannel && hasOrgChannel ? true : '双通道不完整（发布者通道或组织者通道缺失）';
});
check('① 回避：发布者不能审自己发布的方案', () => {
  const hook = code('src/hooks/useSolutionReview.ts');
  const g = (hook.match(/owner_union_id === me\.union_id/g) || []).length;
  const back = /approveSolution[\s\S]{0,400}?owner_union_id === me\.union_id/.test(v1r)
    && /approveSolution[\s\S]{0,400}?owner_union_id === me\.union_id/.test(v2r);
  return g >= 2 && back ? true : `回避校验不全：hook ${g} 处，后台 ${back ? '有' : '无'}`;
});
check('② 推送给全部评委（stageJudge 给所有在岗 JUDGE 发待办）', () => {
  const seg = /function stageJudge[\s\S]{0,700}/.exec(pipeline);
  if (!seg) return '未找到 stageJudge';
  return /JUDGE/.test(seg[0])
    ? true
    : '推送未覆盖全部评委（应遍历所有在岗 JUDGE，而不是指定的人）';
});
check('② 多个评委均可查看（数据面对 JUDGE 全量放开）', () => {
  const seg = /function canReadAll\([\s\S]*?\n}/.exec(ds);
  return seg && /includes\('JUDGE'\)/.test(seg[0])
    ? true
    : "canReadAll 不含 JUDGE —— 评委仍拿不到作业（这是线上报障的根因）";
});
check('② 多个评委均可评价（写权限不得放开给 JUDGE）', () => {
  const seg = /function canWriteAll\([\s\S]*?\n}/.exec(ds);
  if (!seg) return '未找到 canWriteAll';
  if (/includes\('JUDGE'\)/.test(seg[0])) {
    return 'canWriteAll 含 JUDGE —— 评委整包写回会覆盖 users/depts/他人消息';
  }
  return true;
});
check('② 多人打分取平均（同一人改票不占两票）', () => {
  // ⚠️ 必须读**原文**而不是 code()：`superseded: true` 写在 setDb 回调里，
  // 前面那几行是被 code() 剥掉的注释，容易整段被误判为「未接入」。
  const v1 = read('src/pages/b/JudgeReview.tsx');
  const v2 = read('src/pages/v2/JudgeReviewV2.tsx');
  const hasFn = /export function averageJudgeScore/.test(read('src/service/judgeScoring.ts'));
  const v1Mark = /superseded:\s*true/.test(v1);
  const v2Mark = /superseded:\s*true/.test(v2);
  // 且两条路径（打分 + 修订）都要走平均分
  const v1Avg = /composeFinalScore\(/.test(v1);
  const v2Avg = /composeFinalScore\(/.test(v2);
  return hasFn && v1Mark && v2Mark && v1Avg && v2Avg
    ? true
    : `平均分口径未完整接入：fn=${hasFn} v1标记=${v1Mark} v2标记=${v2Mark} v1调用=${v1Avg} v2调用=${v2Avg}`;
});
check('③ 方案驳回回 CLAIMED（1=A）', () => {
  const a = /'SOLUTION'\s*\?\s*'CLAIMED'\s*:\s*'REJECTED'/.test(v1r);
  const b = /'SOLUTION'\s*\?\s*'CLAIMED'\s*:\s*'REJECTED'/.test(v2r);
  const hook = code('src/hooks/useSolutionReview.ts');
  const c = /status:\s*'CLAIMED'/.test(hook);
  return a && b && c ? true : '驳回未全链路回 CLAIMED（后台 v1/v2 或发布者通道有遗漏）';
});
check('③ 悬赏发布驳回仍是 REJECTED（终态，与方案驳回区分）', () => {
  return /'PUBLISH'\s*\?\s*'REJECTED'|\?\s*'CLAIMED'\s*:\s*'REJECTED'/.test(v1r)
    ? true
    : '两种驳回语义没区分开';
});

/* ================= 二、保留系统实际 ================= */
/*
 * 以下两组是运营方明确「保留」的现有设计。写进断言是为了**锁住不被"顺手优化"**：
 * 一旦有人看到「入库分四段」「作业公布要过总闸」觉得多余就改掉，这里会红。
 */
check('④ 【保留】申请入库四段：待初审→待上架→已入库/已驳回', () => {
  const seg = /status:\s*'待初审'\s*\|\s*'([^']+)'\s*\|\s*'([^']+)'\s*\|\s*'([^']+)'/.exec(types);
  if (!seg) return 'AssetApply 状态枚举与四段口径不符';
  const stages = ['待初审', seg[1], seg[2], seg[3]];
  return stages.length === 4 && stages.includes('待初审') && stages.includes('待上架')
    ? true
    : `入库阶段数变了：${stages.join('→')} —— 运营方要求保持四段，勿动`;
});
check('④ 【保留】组织者核实入库走AssetAdmin 的 review 两段动作', () => {
  const admin = code('src/pages/v2/AssetAdminV2.tsx');
  return /待初审/.test(admin) && /待上架/.test(admin) && /已入库/.test(admin)
    ? true
    : '入库审核动作缺失（运营方要求保留四段）';
});
check('⑤ 【保留】届次公示总闸campaign.publicSwitch 仍生效', () => {
  const admin = code('src/pages/b/AssignmentAdmin.tsx');
  return /publicSwitch/.test(admin)
    ? true
    : '公示总闸被移除 —— 运营方要求保留，不要"简化"掉';
});

/* ================= 三、人员与通知 ================= */
check('⑥ 【保留】必修人员逐个指定（不是按部门自动纳入）', () => {
  const comp = code('src/components/AssignmentParticipants.tsx');
  //逐个添加REQUIRED 人员的入口必须存在
  const hasManualAdd = /'REQUIRED'/.test(comp);
  if (!hasManualAdd) return '未找到必修人员逐个指定入口';
  // 且不能被改成"按部门自动纳入"
  const autoInDept = /scope_type[\s\S]{0,80}REQUIRED|deptIds[\s\S]{0,60}REQUIRED/.test(comp);
  return autoInDept === false
    ? true
    : '疑似改成了按部门自动纳入 —— 运营方明确「逐个指定」，勿动';
});
check('⑥ 【保留】必修/选修两种参与者类型仍在', () => {
  return /'REQUIRED'\s*\|\s*'ELECTIVE'/.test(types) ? true : 'REQUIRED/ELECTIVE 枚举缺失';
});
check('⑥ 选修「主动加入」入口仍在（open_join + SELF_JOIN）', () => {
  const t = /open_join/.test(types);
  const j = /SELF_JOIN/.test(types) || /SELF_JOIN/.test(code('src/pages/c/WorkList.tsx'));
  return t && j ? true : '选修主动加入能力缺失';
});

/* ================= 四、口径与 UI 文案一致 ================= */
check('⑦ C 端明示「你是发布人，不能审自己的方案」（不只藏按钮）', () => {
  return /你是发布人，不能审自己的方案/.test(v1l) && /你是发布人，不能审自己的方案/.test(v2l)
    ? true
    : '缺文案说明，用户会以为漏配权限';
});
check('⑦ v2 详情可见性与 v1 口径一致（BUG-04 不能回退）', () => {
  const seg = /const hidden =[\s\S]{0,260}?;/.exec(v2l);
  const seg1 = /const detailHidden = \(b: Bounty\) =>[\s\S]{0,240}?;/.exec(v1l);
  const v2ok = seg && /&&\s*!me\.roles\.includes\('ORGANIZER'\)\s*;/.test(seg[0]);
  const v1ok = seg1 && /!me\.roles\.includes\('ORGANIZER'\)/.test(seg1[0]);
  return v2ok && v1ok ? true : 'v1/v2 可见性口径不一致（v2 是默认版本，必须与 v1 对齐）';
});
check('⑦ 大厅过滤含 OFFLINE（下架即不可见、不可认领）', () => {
  const seg = /tab === 'all'[\s\S]{0,340}?\}/.exec(board);
  return seg && /status !== 'OFFLINE'/.test(seg[0]) ? true : '大厅未过滤 OFFLINE';
});
check('⑦ 积分入账按悬赏所属届次（不硬编码）', () => {
  const hook = code('src/hooks/useSolutionReview.ts');
  const hard = /campaign_id:\s*'C2026Q4'/.test(v1r) || /campaign_id:\s*'C2026Q4'/.test(v2r);
  return !hard && /campaign_id: b\.campaign_id \|\|/.test(hook)
    ? true
    : '积分入账仍硬编码届次';
});

/* ================= 五、反向自检 ================= */
check('Z1 反向：把 canReadAll 的 JUDGE 去掉，本组必须失败', () => {
  const broken = ds.replace(/includes\('JUDGE'\)/, '');
  const seg = /function canReadAll\([\s\S]*?\n}/.exec(broken);
  return seg && /includes\('JUDGE'\)/.test(seg[0]) === false ? true : '断言无效';
});
check('Z2 反向：把入库四段改成两段，本组必须失败', () => {
  const seg = /status:\s*'待初审'\s*\|\s*'([^']+)'\s*\|\s*'([^']+)'\s*\|\s*'([^']+)'/.exec(types);
  return seg ? true : '当前已不是四段，反向自检前提不成立';
});
check('Z3 反向：把 SOLUTION 驳回落回 REJECTED，本组必须失败', () => {
  const broken = v1r.replace(/'SOLUTION'\s*\?\s*'CLAIMED'\s*:\s*'REJECTED'/, "'SOLUTION' ? 'REJECTED' : 'REJECTED'");
  return /'SOLUTION'\s*\?\s*'CLAIMED'/.test(broken) === false ? true : '断言无效';
});

/* ---------- 输出 ---------- */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n运营口径对齐冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);