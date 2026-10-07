/**
 * V8.3-10.07 评分链路冒烟：提交 → AI 自动评分 → 推送评委 → 打分 → 真实性复核 → 公示 / 可申请入库。
 *
 * 运行：npm run smoke:pipeline
 * 退出码：0 = 全绿；1 = 有失败（逐条打印）
 *
 * 背景：用户跑了一条真实数据后发现「AI 评分未自动触发、评委没收到评分、
 * 必须组织者后台手动标记 AI 已评分」。这条用例把整条链路锁住，
 * 以后谁改坏了其中一个环节，这里会立刻红。
 *
 * 与 v7-smoke.mjs 同思路：直接 esbuild 现场打包 src/service/submitPipeline.ts，
 * 绝不复制一份判定到脚本里 —— 否则「测试口径」和「代码口径」迟早漂移。
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(mkdtempSync(join(tmpdir(), 'wbpl-')), 'pipeline.cjs');
buildSync({ entryPoints: ['src/service/submitPipeline.ts'], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
const P = require(out);

const results = [];
const check = (name, fn) => {
  try {
    const r = fn();
    results.push({ name, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (e) {
    results.push({ name, ok: false, detail: `EXCEPTION ${e.message}` });
  }
};

/* ------------------------------------------------------------------ */
/* 夹具                                                                */
/* ------------------------------------------------------------------ */

const CARD = {
  id: 'SC1', name: 'AI 应用实践季评分卡', version: 'V1.2',
  total_rule: '归一化百分制', pass_line: 70, ai_weight: 40, judge_weight: 60,
  status: '启用', bind_target: '提报', updated_at: '2026-10-07 10:00',
  dimensions: [
    { id: 'D1', name: '数据真实性', weight: 30, max_score: 100, standard: '', levels: [], sort: 1 },
    { id: 'D2', name: '业务价值', weight: 30, max_score: 100, standard: '', levels: [], sort: 2 },
    { id: 'D3', name: '可复用性', weight: 20, max_score: 100, standard: '', levels: [], sort: 3 },
    { id: 'D4', name: '呈现完整度', weight: 20, max_score: 100, standard: '', levels: [], sort: 4 },
  ],
};

const mkSubmit = (o = {}) => ({
  id: 'S1', code: 'AI2026-S1', type_id: 'T1', period_id: 'P1',
  union_id: 'u-author', name: '张小明', dept_name: '南京分公司',
  seq_no: 1, track: '效率提升', channel: '个人',
  title: '用 WorkBuddy 自动生成月度账单核对报告',
  scene_desc: '每月初需要从 ERP 导出账单明细，人工核对差异，平均耗时 6 小时且容易漏项。',
  before_after: '使用前：单次核对耗时 6 小时，差错率 3%；使用后：单次核对耗时 1.5 小时，差错率 0.2%。已累计运行 12 次。',
  output_sample: '1、核对结果清单；2、差异明细表；3、异常标记汇总。\n输出示例：共核对 4821 条，发现差异 7 条。',
  skill_used: '账单核对 Skill',
  attachments: [{ name: '结果.xlsx', size: '1.2MB' }, { name: '截图.png', size: '300KB' }],
  desensitized: true, visible_scope: '全员',
  status: 'SUBMITTED', score_card_version: 'V1.2',
  submitted_at: '2026-10-07 09:30', late: false, topic_id: 'TP1',
  ...o,
});

const USERS = [
  { union_id: 'u-author', name: '张小明', roles: ['MEMBER'], status: 1 },
  { union_id: 'u-judge1', name: '李评委', roles: ['JUDGE'], status: 1 },
  { union_id: 'u-judge2', name: '王评委', roles: ['JUDGE'], status: 1 },
  { union_id: 'u-org', name: '赵冰艳', roles: ['ORGANIZER'], status: 1 },
  { union_id: 'u-out', name: '离职评委', roles: ['JUDGE'], status: 3 },
];

/**
 * 链路风味：pushSettings.autoPush 为 false（默认）时，**只有 AI 评分是自动的**，
 * 所有对外推送（评委 / 复核 / 公示）都由组织者在后台勾选后手动发起。
 * 因此 B 段锁的是「手动路径」，D 段锁的是「打开总闸后的自动路径」——两条都必须绿。
 */
const BASE = {
  submits: [mkSubmit()], users: USERS, scoreCards: [CARD],
  assignmentTypes: [{ id: 'T1', score_card_id: 'SC1' }],
  scoreResults: [], submitFlowLogs: [], messages: [],
  pushSettings: { autoPush: false },
};
/** 同一个场景、但打开了自动推送总闸 */
const BASE_AUTO = { ...BASE, pushSettings: { autoPush: true } };

const merge = (db, patch) => ({ ...db, ...(patch ?? {}) });
const one = (db) => db.submits.find((s) => s.id === 'S1');
const to = (db, uid) => (db.messages ?? []).filter((m) => m.union_id === uid);
const has = (db, id, uid) => (db.messages ?? []).some((m) => m.id === id && (uid === undefined || m.union_id === uid));
const patchTo = (s, over) => ({ ...s, ...over });

/* ------------------------------------------------------------------ */
/* A. AI 规则评分本身                                                   */
/* ------------------------------------------------------------------ */

check('[A1] resolveScoreCard 命中作业类型绑定的卡', () => {
  const c = P.resolveScoreCard(BASE, BASE.submits[0]);
  return c?.id === 'SC1' || `got=${c?.id}`;
});

check('[A2] AI 评分确定性：同一条提报两次结果一致（不用随机数）', () => {
  const c = P.resolveScoreCard(BASE, BASE.submits[0]);
  return P.aiScoreOf(BASE.submits[0], c).total === P.aiScoreOf(BASE.submits[0], c).total || '两次分数不一致';
});

check('[A3] AI 分落在 0-100 且不恒等于边界', () => {
  const c = P.resolveScoreCard(BASE, BASE.submits[0]);
  const t = P.aiScoreOf(BASE.submits[0], c).total;
  return (t > 0 && t <= 100) || `got=${t}`;
});

check('[A4] 四个维度全部出分且不超过各自满分', () => {
  const { dimScores } = P.aiScoreOf(BASE.submits[0], CARD);
  const ks = Object.keys(dimScores);
  const over = CARD.dimensions.filter((d) => dimScores[d.name] > d.max_score);
  return (ks.length === 4 && over.length === 0) || `dims=${ks.length}, over=${over.map((d) => d.name)}`;
});

check('[A5] 评分理由写明信号来源（可复查）', () => {
  const { reason } = P.aiScoreOf(BASE.submits[0], CARD);
  return (reason.includes('量化证据') && reason.includes('评分卡')) || reason;
});

check('[A6] 不同质量的提报有区分度（不是写啥都 90 分）', () => {
  const poor = P.aiScoreOf(mkSubmit({ before_after: '', scene_desc: '', output_sample: '', skill_used: '', attachments: [], desensitized: false, topic_id: undefined }), CARD);
  const good = P.aiScoreOf(BASE.submits[0], CARD);
  return (poor.total < good.total - 15) || `poor=${poor.total}, good=${good.total}`;
});

check('[A7] 评分卡无维度时不出分且说明原因', () => {
  return P.aiScoreOf(BASE.submits[0], { ...CARD, dimensions: [] }).total === 0 || '应跳过评分';
});

/* ------------------------------------------------------------------ */
/* B. 默认口径（总闸 OFF）：AI 自动出分，推送全部由组织者手动发起        */
/* ------------------------------------------------------------------ */

const step1 = P.runSubmitPipeline(BASE);
check('[B1] 提交后第 1 次扫描有产出（AI 评分必须仍然自动）', () => step1 !== null || '返回 null，AI 评分未触发');
const db1 = merge(BASE, step1?.patch);

check('[B2] 提交后自动流转为「AI 已出分」', () => one(db1).status === 'AI_SCORED' || `got=${one(db1).status}`);
check('[B3] 自动写出 AI 分', () => typeof one(db1).ai_score === 'number' || `got=${one(db1).ai_score}`);
check('[B4] 落一条 AI 评分明细', () => step1.patch.scoreResults?.length === 1 || `got=${step1.patch.scoreResults?.length}`);
check('[B5] 评分主体如实写为「AI 规则引擎」', () => step1.patch.scoreResults?.[0]?.scorer_name === P.AI_SCORER_NAME || '未如实标注评分主体');
check('[B6] 留一条流转痕（提交后触发 AI 规则评分）', () => step1.patch.submitFlowLogs?.length === 1 || '无流转痕');

check('[B7] 总闸 OFF：系统不自动打扰任何人（一条消息都不发）', () => (
  (db1.messages ?? []).length === 0
) || `发了 ${(db1.messages ?? []).length} 条`);

check('[B8] 总闸 OFF：重复扫描不再推进（停在已出分等人来推）', () => P.runSubmitPipeline(db1) === null || '仍在自动往下走');

/* —— 组织者勾选后手动「推送评委复核」 —— */
const pushJudge = P.pushStage(db1, 'judge', ['S1'], '赵冰艳', '2026-10-07 11:00');
check('[B9] 手动推送评委成功执行', () => pushJudge.ok === true || `err=${pushJudge.error}`);
const db2 = merge(db1, pushJudge?.patch);

check('[B10] 手动推送后状态变为「复核中」', () => one(db2).status === 'REVIEWING' || `got=${one(db2).status}`);
check('[B11] 两位评委各收到 1 条待评分待办', () => (
  to(db2, 'u-judge1').length === 1 && to(db2, 'u-judge2').length === 1
) || `j1=${to(db2, 'u-judge1').length}, j2=${to(db2, 'u-judge2').length}`);
check('[B12] 评委消息走「钉钉待办」通道', () => to(db2, 'u-judge1')[0]?.channel === '钉钉待办' || `got=${to(db2, 'u-judge1')[0]?.channel}`);
check('[B13] 已停用评委（status=3）不收消息', () => to(db2, 'u-out').length === 0 || '停用人不应收到推送');
check('[B14] 作者收到「已进入评委评分」通知', () => has(db2, 'MSG-JDGED-S1', 'u-author') || '作者不知情');
check('[B15] 手动推送留痕，操作人是真人不是「系统自动」', () => (
  (db2.submitFlowLogs ?? []).some((l) => l.id === 'FL-S1-TO-REVIEW' && l.operator === '赵冰艳')
) || '流转日志未记录真实操作人');

check('[B16] 幂等：重复手动推送同一批返回失败而不是重复发', () => (
  P.pushStage(db2, 'judge', ['S1'], '赵冰艳').ok === false
) || '重复推送竟然成功了');

check('[B17] 未勾选任何提报时给出提示而不是静默无操作', () => {
  const r = P.pushStage(db2, 'judge', [], '赵冰艳');
  return (r.ok === false && String(r.error).includes('勾选')) || JSON.stringify(r);
});

/* 评委打分：页面操作，这里直接模拟结果 */
const aiScore = one(db2).ai_score;
const finalScore = Math.round((aiScore * 0.4 + 88 * 0.6) * 10) / 10;
const db3 = { ...db2, submits: db2.submits.map((s) => patchTo(s, { status: 'REVIEWED', judge_score: 88, final_score: finalScore })) };

check('[B18] 总闸 OFF：评委打完分后系统不会自动骚扰组织者', () => P.runSubmitPipeline(db3) === null || '仍自动推送了复核待办');

const pushReview = P.pushStage(db3, 'review', ['S1'], '赵冰艳', '2026-10-07 14:00');
check('[B19] 手动「提醒真实性复核」成功', () => pushReview.ok === true || `err=${pushReview.error}`);
const db4 = merge(db3, pushReview?.patch);

check('[B20] 组织者收到「真实性复核」待办', () => has(db4, 'MSG-CFM-S1-u-org', 'u-org') || '组织者未收到复核待办');
check('[B21] 作者收到「正在做真实性复核」通知', () => has(db4, 'MSG-CFM-A-S1', 'u-author') || '作者不知情');
check('[B22] 未确认前状态保持不变（不自动代劳人工决策）', () => one(db4).status === 'REVIEWED' || `got=${one(db4).status}`);

/* 确认真实性：页面操作 */
const db5base = {
  ...db4,
  submits: db4.submits.map((s) => patchTo(s, { status: 'COMPLETED', confirmed: { by: '李评委', at: '2026-10-07 15:00', result: '真实' } })),
};
const pushPublish = P.pushStage(db5base, 'publish', ['S1'], '赵冰艳', '2026-10-07 15:30');
check('[B23] 手动「提醒确认公示」成功', () => pushPublish.ok === true || `err=${pushPublish.error}`);
const db5 = merge(db5base, pushPublish?.patch);

check('[B24] 组织者收到「确认是否公示」待办', () => has(db5, 'MSG-PUB-S1-u-org', 'u-org') || '组织者未收到公示待办');
check('[B25] 达标提报 → 作者被告知「可以申请入库」', () => {
  const m = to(db5, 'u-author').find((x) => x.id === 'MSG-AST-S1');
  return m?.title === '你的作业可以申请入库了' || `got=${m?.title}`;
});
check('[B26] 链路走完后不再重复推送', () => P.pushStage(db5, 'publish', ['S1'], '赵冰艳').ok === false || '仍重复推送');

check('[B27] 状态不符的提报被跳过并如实回报（不静默失败）', () => {
  const r = P.pushStage(db5, 'judge', ['S1'], '赵冰艳');
  return (r.ok === false && r.skipped.length === 1) || JSON.stringify(r);
});

/* ------------------------------------------------------------------ */
/* C. 异常分支                                                          */
/* ------------------------------------------------------------------ */

check('[C1] 没有在岗评委时报警（避免作业静默卡死）', () => {
  const noJudge = { ...BASE, users: USERS.filter((u) => !u.roles.includes('JUDGE')) };
  const s1 = P.runSubmitPipeline(noJudge);
  const d1 = merge(noJudge, s1?.patch);
  const d2 = merge(d1, P.pushStage(d1, 'judge', ['S1'], '赵冰艳')?.patch);
  return has(d2, 'MSG-NOJUDGE-S1', 'all') || '无评委时无告警';
});

check('[C2] 低于及格线 → 不承诺入库', () => {
  let d = BASE;
  const s1 = P.runSubmitPipeline(d); if (s1) d = merge(d, s1.patch);
  const j = P.pushStage(d, 'judge', ['S1'], '赵冰艳'); if (j.ok) d = merge(d, j.patch);
  d = { ...d, submits: d.submits.map((s) => patchTo(s, { status: 'COMPLETED', final_score: 42 })) };
  const p = P.pushStage(d, 'publish', ['S1'], '赵冰艳'); if (p.ok) d = merge(d, p.patch);
  const m = to(d, 'u-author').find((x) => x.id === 'MSG-AST-S1');
  return m?.title === '你的作业已完成评分' || `got=${m?.title}`;
});

check('[C3] 无评分卡时跳过评分而不是写 0 分污染数据', () => {
  const noCard = { ...BASE, scoreCards: [] };
  const r = P.runSubmitPipeline(noCard);
  return r === null || '无评分卡却仍在推进状态';
});

check('[C4] needsAiScore：已急需补跑的三种情形', () => {
  return (
    P.needsAiScore(mkSubmit()) === true
    && P.needsAiScore(mkSubmit({ status: 'AI_SCORED' })) === true
    && P.needsAiScore(mkSubmit({ status: 'REVIEWED' })) === true
  ) || '判定不符';
});

check('[C5] needsAiScore：已有分则不需要补跑', () => {
  return P.needsAiScore(mkSubmit({ status: 'AI_SCORED', ai_score: 80 })) === false || '已有分仍要求补跑';
});

check('[C6] 补跑 AI 评分的分与流水线自动分一致（同一算法）', () => {
  const rs = P.aiRescore(BASE, 'S1', '赵冰艳', '2026-10-07 18:00');
  const auto = P.aiScoreOf(BASE.submits[0], CARD).total;
  return rs.total === auto || `manual=${rs.total}, auto=${auto}`;
});

check('[C7] 补跑后状态为 AI_SCORED 且日志署名区分于「系统自动」', () => {
  const rs = P.aiRescore(BASE, 'S1', '赵冰艳', '2026-10-07 18:00');
  const d = merge(BASE, rs.patch);
  const log = (d.submitFlowLogs ?? []).find((x) => x.id === 'FL-S1-AI-AUTO');
  return (one(d).status === 'AI_SCORED' && log?.operator.includes('赵冰艳')) || `status=${one(d).status}, op=${log?.operator}`;
});

check('[C8] 重复补跑不产生第二条评分记录 / 流转日志', () => {
  let d = merge(BASE, P.aiRescore(BASE, 'S1', '赵冰艳').patch);
  d = merge(d, P.aiRescore(d, 'S1', '赵冰艳').patch);
  return ((d.scoreResults ?? []).length === 1 && (d.submitFlowLogs ?? []).length === 1)
    || `sr=${(d.scoreResults ?? []).length}, fl=${(d.submitFlowLogs ?? []).length}`;
});

check('[C9] 补跑失败时给出可读原因', () => {
  const bad = P.aiRescore({ ...BASE, scoreCards: [] }, 'S1', '赵冰艳');
  return (bad.ok === false && typeof bad.error === 'string' && bad.error.length > 0) || JSON.stringify(bad);
});

check('[C10] 提报不存在时补跑安全失败', () => {
  return P.aiRescore(BASE, 'NOT-EXIST', '赵冰艳').ok === false || '应返回失败';
});

/* ------------------------------------------------------------------ */
/* D. 总闸 ON：恢复全自动链路（组织者确认正式运转后会打开）                */
/* ------------------------------------------------------------------ */

check('[D1] pushEnabled 默认关闭（未配置时也必须是 false）', () => (
  P.pushEnabled(BASE) === false && P.pushEnabled({ ...BASE, pushSettings: undefined }) === false
) || '默认竟然是开启');

check('[D2] 总闸 ON 时识别为开启', () => P.pushEnabled(BASE_AUTO) === true || '开关读不出来');

check('[D3] 总闸 ON：全自动跑完「出分 → 推评委 → 复核 → 公示/入库」', () => {
  let d = BASE_AUTO;
  const s1 = P.runSubmitPipeline(d);
  if (!s1) return 'AI 评分未触发';
  d = merge(d, s1.patch);
  if (one(d).status !== 'AI_SCORED') return `第一步状态=${one(d).status}`;

  const s2 = P.runSubmitPipeline(d);
  if (!s2) return '未自动推送评委';
  d = merge(d, s2.patch);
  if (one(d).status !== 'REVIEWING') return `第二步状态=${one(d).status}`;
  if (to(d, 'u-judge1').length !== 1) return '评委未收到待办';

  if (P.runSubmitPipeline(d) !== null) return '同一步未幂等';

  d = { ...d, submits: d.submits.map((s) => patchTo(s, { status: 'REVIEWED', judge_score: 88, final_score: 88 })) };
  const s3 = P.runSubmitPipeline(d);
  if (!s3) return '未自动推真实性复核';
  d = merge(d, s3.patch);
  if (!has(d, 'MSG-CFM-S1-u-org', 'u-org')) return '组织者未收到复核待办';

  d = { ...d, submits: d.submits.map((s) => patchTo(s, { status: 'COMPLETED', confirmed: { by: '李评委', at: '2026-10-07 15:00', result: '真实' } })) };
  const s4 = P.runSubmitPipeline(d);
  if (!s4) return '未自动推公示/入库';
  d = merge(d, s4.patch);
  if (!has(d, 'MSG-PUB-S1-u-org', 'u-org')) return '组织者未收到公示待办';
  if (to(d, 'u-author').find((x) => x.id === 'MSG-AST-S1')?.title !== '你的作业可以申请入库了') return '作者未被告知可入库';

  return P.runSubmitPipeline(d) === null || '收尾仍未幂等';
});

check('[D4] 总闸 ON 时作者才收到「AI 评分完成」通知', () => {
  const d = merge(BASE_AUTO, P.runSubmitPipeline(BASE_AUTO)?.patch);
  return has(d, 'MSG-AI-S1', 'u-author') || 'ON 状态下作者没收通知';
});

/* ------------------------------------------------------------------ */
/* 汇总                                                                 */
/* ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
console.log(`\nV8.4 评分链路冒烟：共 ${results.length} 项断言`);
console.log(`通过 ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('\n失败项：');
  failed.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
  process.exit(1);
}
console.log('✅ 全绿');
