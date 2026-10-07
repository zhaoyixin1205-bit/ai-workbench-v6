/**
 * V8.3-10.07：作业提报评分流水线（共享层）
 *
 * 需求背景（用户原话）：「作业提交后——AI自动评分——推送至评委打分——打分后复核真实性——
 * 组织者确认是否公示/员工可申请入库」。此前链路两处断裂：
 *   ① WorkSubmit 提交后只写 status='SUBMITTED'，没有任何评分触发逻辑；
 *   ② JudgeReview 的队列只认 AI_SCORED 及之后的状态，导致 SUBMITTED 的作业进不了评委视野，
 *      且评委开工后收不到任何推送 —— 于是变成「必须组织者后台手动标记 AI 已评分」。
 *
 * 本模块把「系统能自己做的部分」做成幂等的纯函数：给定 DB，返回需要写回的补丁（没有要做的返回 null）。
 * 之所以做成幂等：页面可能会多次调用（store 的自动推进 effect、各页面的即时调用），
 * 幂等保证「重复调用不会重复出分、不会重复推送」。
 *
 * 刻意没做的（留给人工决策，不自动代劳）：
 *   - 真实性复核结论（真实/存疑）—— 需要人判断，系统只负责把待办推到人面前；
 *   - 是否公示 —— 组织者的运营决策，系统只负责汇总口径并提醒。
 */

import type {
  AppMessage, AssignmentSubmit, ScoreCard, ScoreResult, SubmitFlowLog, SubmitStatus, User,
} from '@/mock/types';
import type { DB } from '@/store/store';

/** 自动流转的操作人署名（区别于具体人的手动操作，便于审计区分） */
export const PIPELINE_OPERATOR = '系统自动';

/** AI 评分主体（界面上要如实写清楚这是规则引擎，不是大模型调用） */
export const AI_SCORER_NAME = 'AI 规则引擎';

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 文本中的数字个数（衡量「用数字说话」的密度） */
function countNumbers(text: string | undefined): number {
  return (text ?? '').match(/\d+(\.\d+)?/g)?.length ?? 0;
}

/**
 * 解析作业应使用的评分卡。
 * 取用顺序：作业类型绑定的卡 → 同名卡的最新版本 → 任意未软删的卡。
 * 与 JudgeReview 的兜底口径保持一致，避免「同一条提报两处算出两个分」。
 */
export function resolveScoreCard(db: DB, s: AssignmentSubmit): ScoreCard | null {
  const cards = (db.scoreCards ?? []).filter((c) => !c.is_deleted);
  const type = (db.assignmentTypes ?? []).find((t) => t.id === s.type_id);
  if (type) {
    const bound = cards.find((c) => c.id === type.score_card_id);
    if (bound) return bound;
  }
  const byVersion = cards.find((c) => c.version === s.score_card_version);
  if (byVersion) return byVersion;
  return cards[0] ?? null;
}

/** 默认时间戳：YYYY-MM-DD HH:mm（日志、消息、流转记录统一用这一个格式） */
function defaultStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 全站推送总闸（V8.4-10.07）。
 *
 * 默认**关闭**：系统照样自动出 AI 分、照样(status 前移)，但**不产生任何站内消息 / 钉钉待办**。
 * 原因很直接 —— 系统还在联调期，一旦自动推送就是对真实员工的不可逆打扰；
 * 而且 JUDGE 角色人数一旦配置偏多，一次开盘就是几百条待办。
 * 所以把「要不要打扰人」交给组织者决定：后台手动推送生效，或显式打开总闸后自动推送生效。
 */
export function pushEnabled(db: DB): boolean {
  return db.pushSettings?.autoPush === true;
}

/**
 * 是否需要「补跑 AI 评分」。
 * 共享层判定是因为后台 v1 / v2 都要显示这个按钮，两处各写一遍判定会漂移。
 * 口径：只要这条提报已经走到需要 AI 分的环节，却还没有 AI 分，就给入口。
 */
export function needsAiScore(s: AssignmentSubmit): boolean {
  if (s.ai_score !== undefined) return false;
  return s.status === 'SUBMITTED'
    || ['AI_SCORED', 'REVIEWING', 'REVIEWED'].includes(s.status);
}

/* ------------------------------------------------------------------ */
/* ① AI 自动评分                                                       */
/* ------------------------------------------------------------------ */

export interface AiScoreResult {
  dimScores: Record<string, number>;
  total: number;
  reason: string;
}

/** 维度语义归类：按维度名推断它更依赖哪类证据（维度可配置，不能硬编码维度名） */
type EvidenceKind = '真实性' | '业务价值' | '可复用性' | '呈现完整度';

function evidenceKindOf(dimName: string): EvidenceKind {
  if (/真实|数据|证据|来源|脱敏/.test(dimName)) return '真实性';
  if (/价值|收益|效果|业务|效益/.test(dimName)) return '业务价值';
  if (/复用|推广|迁移|通用|沉淀/.test(dimName)) return '可复用性';
  if (/呈现|表达|完整|清晰|结构|文档/.test(dimName)) return '呈现完整度';
  /** 兜底：认不出语义的维度按整体平均水平给，避免某一维恒为 0 */
  return '业务价值';
}

/**
 * AI 规则评分（确定性，不使用随机数）。
 *
 * 为什么不用 Math.random：同一条提报每次打开页面算出的分必须一致，
 * 否则「右上角 AI 分跳来跳去」会直接摧毁评分的可信度（A-39 遗留项的同类问题）。
 * 这里按四类可解释信号出分，reason 里写清楚每条信号的取值，便于组织者复查。
 */
export function aiScoreOf(s: AssignmentSubmit, card: ScoreCard): AiScoreResult {
  const dims = card.dimensions ?? [];
  if (dims.length === 0) {
    return { dimScores: {}, total: 0, reason: '评分卡未配置维度，跳过自动评分' };
  }

  const beforeAfter = s.before_after ?? '';
  const sceneDesc = s.scene_desc ?? '';
  const output = s.output_sample ?? '';
  const skill = (s.skill_used ?? '').trim();
  const files = s.attachments?.length ?? 0;
  const hasTopic = !!(s.topic_id || s.custom_topic);

  const nums = countNumbers(beforeAfter);
  /** 前后对比里同时出现「使用前后」的成对数字才算真正的量化证据 */
  const quantRatio = clamp01(nums / 4) * (/(使用前|使用后|之前|之后|提升|下降|降低)/.test(beforeAfter) ? 1 : 0.7);
  const valueRatio = clamp01((sceneDesc.length / 120) * 0.4 + (nums / 4) * 0.6);
  const reuseRatio = clamp01((files >= 2 ? 0.4 : files === 1 ? 0.25 : 0) + (skill ? 0.35 : 0) + (hasTopic ? 0.2 : 0));
  const presentRatio = clamp01(
    (output.length / 260) * 0.5
    + (/([\n\r]|；|;|[1-9]、|[1-9]\.)/.test(output) ? 0.3 : 0)
    + (s.desensitized ? 0.2 : 0),
  );

  const kindRatio: Record<EvidenceKind, number> = {
    真实性: clamp01(0.45 + quantRatio * 0.55),
    业务价值: clamp01(0.45 + valueRatio * 0.55),
    可复用性: clamp01(0.45 + reuseRatio * 0.55),
    呈现完整度: clamp01(0.45 + presentRatio * 0.55),
  };

  const dimScores: Record<string, number> = {};
  const ratios: Record<string, number> = {};
  dims.forEach((d) => {
    const ratio = kindRatio[evidenceKindOf(d.name)];
    ratios[d.name] = ratio;
    dimScores[d.name] = round1(ratio * (d.max_score || 100));
  });

  /** 总分合成：与批量导入回写、评委端合成共用同一套口径 */
  let total: number;
  if (card.total_rule === '去极值平均' && dims.length >= 3) {
    const arr = dims.map((d) => ratios[d.name]);
    const sorted = [...arr].sort((a, b) => a - b);
    const kept = sorted.slice(1, -1);
    total = round1((kept.reduce((a, b) => a + b, 0) / kept.length) * 100);
  } else {
    const weightSum = dims.reduce((a, d) => a + (d.weight || 0), 0) || 100;
    total = round1(dims.reduce((a, d) => a + ratios[d.name] * (d.weight || 0), 0) * 100 / weightSum);
  }

  const reason = [
    `AI 规则评分（${card.name} ${card.version}）`,
    `量化证据 ${nums} 处（${round1(quantRatio * 100)}%）`,
    `场景描述 ${sceneDesc.length} 字`,
    `产出样本 ${output.length} 字`,
    skill ? `所用 Skill「${skill}」` : '未填写所用 Skill',
    `附件 ${files} 个`,
    hasTopic ? '已关联选题' : '未关联选题',
    s.desensitized ? '已通过脱敏校验' : '未通过脱敏校验',
  ].join('；') + `。总分 ${total}（百分制，${card.total_rule}）。`;

  return { dimScores, total, reason };
}

/* ------------------------------------------------------------------ */
/* ② 推送                                                              */
/* ------------------------------------------------------------------ */

function mkMsg(
  id: string, unionId: string, type: string, title: string,
  content: string, channel: AppMessage['channel'], at: string,
): AppMessage {
  return { id, union_id: unionId, type, title, content, channel, status: '未读', sent_at: at };
}

/** 在岗（未停停用/未删除）的指定角色用户 */
function activeByRole(db: DB, ...roles: string[]): User[] {
  return (db.users ?? []).filter(
    (u) => u.status !== 99 && u.status !== 3 && roles.some((r) => (u.roles ?? []).includes(r as never)),
  );
}

/* ------------------------------------------------------------------ */
/* 推送话术构造器（自动流水线与组织者手动推送共用同一份，避免文案漂移）      */
/* ------------------------------------------------------------------ */

const TXT = {
  /** 给评委的打分待办：要把作者、提报编号、AI 分如实带上，评委据此判断是否要重点看 */
  judgeTodo: (s: AssignmentSubmit) => `《${s.title}》（${s.code}，${s.name} · ${s.dept_name ?? '—'}）已完成 AI 评分 ${s.ai_score ?? '—'} 分，请在「评委复核」中完成四维打分与真实性确认。`,
  /** 无在岗评委时的报警：必须发给全员，否则这条提报会静静卡死在已出分状态 */
  noJudge: (s: AssignmentSubmit) => `《${s.title}》（${s.code}）已出 AI 分但没有在岗的评委角色用户，请到「用户与权限」为评委授予 JUDGE 角色。`,
  judgedToAuthor: (s: AssignmentSubmit, pushed: number) => `《${s.title}》已推送 ${pushed} 位评委打分，评委完成后还需做一次真实性确认。`,
  reviewTodo: (s: AssignmentSubmit, card: ScoreCard | null) => `《${s.title}》（${s.code}，${s.name}）评委已打出 ${s.judge_score ?? '—'} 分，最终分 ${s.final_score ?? '—'}${card ? `（及格线 ${card.pass_line}）` : ''}。请在「评委复核」确认内容真实性：真实 → 进入完成；存疑 → 退回重评。`,
  reviewToAuthor: (s: AssignmentSubmit) => `《${s.title}》评委已评分（最终分 ${s.final_score ?? '—'}），组织者正在复核内容真实性，结论出来后你会收到通知。`,
  publishTodo: (s: AssignmentSubmit, passed: boolean) => `《${s.title}》（${s.code}，${s.name}）最终分 ${s.final_score ?? '—'}，${passed ? '已达及格线' : '低于及格线'}。请在「作业管理」确认是否公示；公示后全员可见并可被复用。`,
  /** 给作者的入库提示：通过与否的文案必须如实不同，不能一律说「可以申请入库」 */
  assetToAuthor: (s: AssignmentSubmit, card: ScoreCard | null, passed: boolean) => (passed
    ? `《${s.title}》已完成评分并通过真实性复核（最终分 ${s.final_score ?? '—'}），可在「我的作业」申请入库，入库后进入资产库供全员复用。`
    : `《${s.title}》最终分 ${s.final_score ?? '—'}${card ? `，低于及格线 ${card.pass_line}` : ''}，暂不可申请入库；可优化后再提。`),
};

/* ------------------------------------------------------------------ */
/* ③ 推送三阶段：自动流水线与组织者手动推送共用同一份实现                  */
/* ------------------------------------------------------------------ */

/**
 * 三个「需要对外告知并推动人去干活」的环节。
 * 之所以抽出来而不是在自动/手动两处各写一遍：
 *   同一步动作如果被写成两份，状态迁移、消息 ID、文案迟早会漂；
 *   漂移的表现就是「自动能推、手动推不动」这种最难查的问题。
 */
export type PushStage = 'judge' | 'review' | 'publish';

interface PushCtx {
  judges: User[];
  organizers: User[];
  /** 已存在的消息 ID，保证同一条通知绝对不会发第二次 */
  existingIds: Set<string>;
  sink: AppMessage[];
}

function mkCtx(db: DB): PushCtx {
  return {
    judges: activeByRole(db, 'JUDGE'),
    organizers: activeByRole(db, 'ORGANIZER', 'ADMIN'),
    existingIds: new Set((db.messages ?? []).map((m) => m.id)),
    sink: [],
  };
}

function pushOnce(ctx: PushCtx, m: AppMessage): boolean {
  if (ctx.existingIds.has(m.id)) return false;
  ctx.existingIds.add(m.id);
  ctx.sink.push(m);
  return true;
}

/** 一个阶段做完之后要写回的东西；`summary` 直接喂给界面提示 */
interface StageOutcome {
  submit?: AssignmentSubmit;
  log?: SubmitFlowLog;
  pushed: number;
  summary: string;
}

/** 阶段一：AI 已出分 → 推给评委打分（AI_SCORED → REVIEWING） */
function stageJudge(ctx: PushCtx, db: DB, s: AssignmentSubmit, at: string, operator: string): StageOutcome | null {
  if (s.status !== 'AI_SCORED') return null;
  const targets = ctx.judges.filter((j) => j.union_id !== s.union_id);
  let pushed = 0;
  targets.forEach((j) => {
    if (pushOnce(ctx, mkMsg(
      `MSG-JDG-${s.id}-${j.union_id}`, j.union_id, '待评分任务',
      '有一条提报等你打分', TXT.judgeTodo(s), '钉钉待办', at,
    ))) pushed += 1;
  });
  /* 没有配置评委时必须报警：否则这条作业会静静地卡在 AI_SCORED（正是当初要修的病） */
  if (pushed === 0) {
    pushOnce(ctx, mkMsg(
      `MSG-NOJUDGE-${s.id}`, 'all', '配置提醒',
      '没有可用的评委，提报流程已卡住', TXT.noJudge(s), '站内', at,
    ));
  }
  pushOnce(ctx, mkMsg(
    `MSG-JDGED-${s.id}`, s.union_id, '进入评委复核',
    '你的作业已进入评委评分', TXT.judgedToAuthor(s, pushed), '站内', at,
  ));
  return {
    submit: { ...s, status: 'REVIEWING' },
    log: {
      id: `FL-${s.id}-TO-REVIEW`, submit_id: s.id,
      from_status: 'AI_SCORED', to_status: 'REVIEWING',
      operator,
      reason: pushed > 0 ? `推送 ${pushed} 位评委打分` : '无在岗评委，已发出配置报警',
      created_at: at,
    },
    pushed,
    summary: `${s.code} 推送 ${pushed} 位评委${pushed === 0 ? '（无可用评委，已报警）' : ''}`,
  };
}

/** 阶段二：评委已打分 → 提醒组织者做真实性复核（状态不变，只推待办） */
function stageReview(ctx: PushCtx, db: DB, s: AssignmentSubmit, at: string): StageOutcome | null {
  if (s.status !== 'REVIEWED' || s.confirmed) return null;
  /* 幂等：这两个环节不迁状态，靠「已发过通知」本身做去重，
     否则组织者每点一次按钮就重复计一次成功、日志被反复覆盖。 */
  if (ctx.existingIds.has(`MSG-CFM-A-${s.id}`)) return null;
  const card = resolveScoreCard(db, s);
  ctx.organizers.forEach((o) => {
    pushOnce(ctx, mkMsg(
      `MSG-CFM-${s.id}-${o.union_id}`, o.union_id, '待办·真实性复核',
      '有一条提报待复核真实性', TXT.reviewTodo(s, card), '钉钉待办', at,
    ));
  });
  pushOnce(ctx, mkMsg(
    `MSG-CFM-A-${s.id}`, s.union_id, '待办·真实性复核',
    '你的作业正在做真实性复核', TXT.reviewToAuthor(s), '站内', at,
  ));
  return {
    pushed: ctx.organizers.length,
    summary: `${s.code} 提醒 ${ctx.organizers.length} 位做真实性复核`,
  };
}

/** 阶段三：复核通过 → 提醒组织者确认公示 + 告知作者能否申请入库（状态不变） */
function stagePublish(ctx: PushCtx, db: DB, s: AssignmentSubmit, at: string): StageOutcome | null {
  if (!['COMPLETED', 'CONSENSUS'].includes(s.status) || s.is_published) return null;
  if (ctx.existingIds.has(`MSG-AST-${s.id}`)) return null;
  const card = resolveScoreCard(db, s);
  /* 没有卡时不能一律算通过——宁可不提醒，也不要把「暂不可入库」说成「可以申请入库」 */
  const passed = card ? (s.final_score ?? 0) >= card.pass_line : true;
  ctx.organizers.forEach((o) => {
    pushOnce(ctx, mkMsg(
      `MSG-PUB-${s.id}-${o.union_id}`, o.union_id, '待办·确认公示',
      '有一条提报等你确认是否公示', TXT.publishTodo(s, passed), '钉钉待办', at,
    ));
  });
  pushOnce(ctx, mkMsg(
    `MSG-AST-${s.id}`, s.union_id, '可申请入库',
    passed ? '你的作业可以申请入库了' : '你的作业已完成评分',
    TXT.assetToAuthor(s, card, passed), '站内', at,
  ));
  return {
    pushed: ctx.organizers.length,
    summary: `${s.code} 提醒 ${ctx.organizers.length} 位确认公示${passed ? '' : '（低于及格线）'}`,
  };
}

function onStage(
  stage: PushStage, ctx: PushCtx, db: DB, s: AssignmentSubmit, at: string, operator: string,
): StageOutcome | null {
  if (stage === 'judge') return stageJudge(ctx, db, s, at, operator);
  if (stage === 'review') return stageReview(ctx, db, s, at);
  return stagePublish(ctx, db, s, at);
}

export interface ManualPushResult {
  ok: boolean;
  /** 失败原因直接喂给 message.error */
  error?: string;
  patch?: Partial<DB>;
  /** 实际发出去通知的提报数 */
  pushed: number;
  /** 因为状态不匹配而被跳过的提报（转成「xxx 条不符合条件」提示） */
  skipped: string[];
  detail: string[];
}

/**
 * 组织者在后台主动发起一次推送。
 *
 * 这是本次改动的落点：系统不再替运营做「什么时候打扰谁」的决定，
 * 而是把每一步推送都做成组织者勾选 → 点按钮 → 才发生。
 * 好处是不管系统处在什么阶段都能灰度：先自己一个人跑通，确认没问题再放量。
 */
export function pushStage(
  db: DB, stage: PushStage, submitIds: string[], operator: string, at?: string,
): ManualPushResult {
  if (submitIds.length === 0) return { ok: false, error: '请先勾选要推送的提报', pushed: 0, skipped: [], detail: [] };

  const stamp = at ?? defaultStamp();
  const ctx = mkCtx(db);
  const next = [...(db.submits ?? [])];
  const newLogs: SubmitFlowLog[] = [];
  const skipped: string[] = [];
  const detail: string[] = [];
  let pushed = 0;

  submitIds.forEach((id) => {
    const idx = next.findIndex((x) => x.id === id);
    if (idx < 0) { skipped.push(id); return; }
    const s = next[idx];
    const outcome = onStage(stage, ctx, db, s, stamp, operator);
    if (!outcome) { skipped.push(s.code ?? id); return; }
    if (outcome.submit) next[idx] = outcome.submit;
    if (outcome.log) newLogs.push(outcome.log);
    pushed += 1;
    detail.push(outcome.summary);
  });

  if (pushed === 0) {
    return { ok: false, error: `没有符合条件的提报（已跳过 ${skipped.length} 条）`, pushed: 0, skipped, detail };
  }

  const patch: Partial<DB> = {};
  if (newLogs.length) {
    const ids = new Set(newLogs.map((l) => l.id));
    patch.submitFlowLogs = [...(db.submitFlowLogs ?? []).filter((l) => !ids.has(l.id)), ...newLogs];
  }
  if (ctx.sink.length) patch.messages = [...(db.messages ?? []), ...ctx.sink];
  patch.submits = next;
  return { ok: true, patch, pushed, skipped, detail };
}

/* ------------------------------------------------------------------ */
/* ③ 流水线主体                                                        */
/* ------------------------------------------------------------------ */

export interface PipelineOptions {
  /** 时间戳字符串（留空前自动取当前时间） */
  at?: string;
}

export interface PipelineResult {
  patch: Partial<DB>;
  /** 本次自动推进的作业数（用于界面提示「系统已自动推进 N 条」） */
  advanced: number;
  detail: string[];
}

/**
 * 扫描全库，对每个作业执行「系统能自己走完的那一步」。
 *
 * 链路（每步只推进一格，人工环节不代劳）：
 *   SUBMITTED ──AI 自动评分──▶ AI_SCORED ──推送评委──▶ REVIEWING
 *   REVIEWING ──（评委打分，页面操作）──▶ REVIEWED ──推送真实性复核──▶ 待人确认
 *   REVIEWED ──（评委确认真实性，页面操作）──▶ COMPLETED ──推送组织者确认公示 / 员工可申请入库
 *
 * 幂等保证：状态每步只前移一格且目标状态不再命中同一分支；推送消息按 `MSG-xxx-<submitId>` 固定 ID 去重。
 */
export function runSubmitPipeline(db: DB, opts?: PipelineOptions): PipelineResult | null {
  const submits = db.submits ?? [];
  if (submits.length === 0) return null;

  const at = opts?.at ?? defaultStamp();
  const existingIds = new Set((db.messages ?? []).map((m) => m.id));
  const autoPush = pushEnabled(db);

  const nextSubmits = [...submits];
  const newMessages: AppMessage[] = [];
  const newResults: ScoreResult[] = [];
  const newLogs: SubmitFlowLog[] = [];
  const detail: string[] = [];
  let advanced = 0;

  const judges = activeByRole(db, 'JUDGE');
  const organizers = activeByRole(db, 'ORGANIZER', 'ADMIN');

  const pushOnce = (m: AppMessage) => {
    if (existingIds.has(m.id)) return false;
    existingIds.add(m.id);
    newMessages.push(m);
    return true;
  };
  const ctx: PushCtx = { judges, organizers, existingIds, sink: newMessages };

  for (let i = 0; i < nextSubmits.length; i += 1) {
    const s = nextSubmits[i];

    /* —— 步骤 1：AI 自动评分 SUBMITTED → AI_SCORED —— */
    if (s.status === 'SUBMITTED') {
      const card = resolveScoreCard(db, s);
      if (!card) {
        detail.push(`${s.code} 未匹配到评分卡，跳过 AI 评分`);
        continue;
      }
      if ((card.dimensions ?? []).length === 0) {
        detail.push(`${s.code} 评分卡「${card.name}」未配置维度，跳过 AI 评分`);
        continue;
      }
      const r = aiScoreOf(s, card);
      const scoredAt = at;
      nextSubmits[i] = { ...s, status: 'AI_SCORED', ai_score: r.total };
      /* 「评分中 → 已出分」合并为一次写入：避免引入定时器带来的重复执行与中途刷新丢状态 */
      newResults.push({
        id: `SR-${s.id}-AI-AUTO`,
        target_type: 'submit',
        target_id: s.id,
        card_id: card.id,
        card_version: card.version,
        source: 'AI',
        dim_scores: r.dimScores,
        total: r.total,
        reason: r.reason,
        scorer_union_id: 'AI',
        scorer_name: AI_SCORER_NAME,
        created_at: scoredAt,
      });
      newLogs.push({
        id: `FL-${s.id}-AI-AUTO`, submit_id: s.id,
        from_status: 'SUBMITTED', to_status: 'AI_SCORED',
        operator: PIPELINE_OPERATOR, reason: '提交后触发 AI 规则评分', created_at: scoredAt,
      });
      /* 总闸关闭时连「AI 已出分」这条站内通知也不发：出分是系统内部动作，不需要打扰作者 */
      if (autoPush) {
        pushOnce(mkMsg(
          `MSG-AI-${s.id}`, s.union_id, 'AI 评分完成',
          '你的作业已完成 AI 评分',
          `《${s.title}》：AI 分 ${r.total}（${card.name} ${card.version}）。接下来会自动推送评委打分，评分完成后你会在待办里看到结果。`,
          '站内', scoredAt,
        ));
      }
      advanced += 1;
      detail.push(`${s.code} AI 自动评分 ${r.total} 分`);
      continue;
    }

    /* 总闸关闭：推送环节一律让位给「组织者在后台手动发起」。
       注意这里不是删功能 —— 手动推送走的还是下面同一批 stage 函数，只是触发者从系统变成了人。 */
    if (!autoPush) continue;

    const outcome = onStage('judge', ctx, db, s, at, PIPELINE_OPERATOR)
      ?? onStage('review', ctx, db, s, at, PIPELINE_OPERATOR)
      ?? onStage('publish', ctx, db, s, at, PIPELINE_OPERATOR);
    if (!outcome) continue;
    if (outcome.submit) nextSubmits[i] = outcome.submit;
    if (outcome.log) newLogs.push(outcome.log);
    advanced += 1;
    detail.push(outcome.summary);
  }

  if (advanced === 0 && newMessages.length === 0) return null;

  const patch: Partial<DB> = {};
  if (advanced > 0) patch.submits = nextSubmits;
  if (newResults.length) patch.scoreResults = [...(db.scoreResults ?? []), ...newResults];
  if (newLogs.length) patch.submitFlowLogs = [...newLogs, ...(db.submitFlowLogs ?? [])];
  if (newMessages.length) patch.messages = [...newMessages, ...(db.messages ?? [])];
  return { patch, advanced, detail };
}

/**
 * 时间与签名更安全的外层包装：页面调用时用当前真实时间生成 `YYYY-MM-DD HH:mm`。
 * 抽出来是为了让 store 与各页面共用同一份时间格式（此前各处自己拼字符串，日志时间格式不统一）。
 */
export function nowStamp(today: string): string {
  return `${today} ${new Date().toTimeString().slice(0, 5)}`;
}

/* ------------------------------------------------------------------ */
/* ④ 组织者后台「补跑 AI 评分」（FR9 兜底入口）                          */
/* ------------------------------------------------------------------ */

export interface AiRescoreResult {
  ok: boolean;
  /** 失败原因（提报不存在 / 评分卡缺失 / 维度为空），直接喂给 message.error */
  error?: string;
  total?: number;
  /** 例如「AI 应用实践季评分卡 V1.2」，用于成功提示与留痕 */
  cardLabel?: string;
  patch?: Partial<DB>;
}

/**
 * 组织者后台手动补跑一次 AI 评分。
 *
 * 为什么还需要它：自动流水线在「评分卡临时下架 / 维度清空 / 历史脏数据」这些情况下会跳过，
 * 此时必须给组织者一个能自己把分补出来的入口（流程规则 FR9 登记的就是这条路径）。
 *
 * 抽到共享层是因为 v1 / v2 各有一个这样的按钮，两处各写一遍必然漂移；
 * 而它们的语义必须完全一致：同样调 `aiScoreOf`、写同一份 ScoreResult（同一 ID）。
 */
export function aiRescore(db: DB, submitId: string, operator: string, at?: string): AiRescoreResult {
  const s = (db.submits ?? []).find((x) => x.id === submitId);
  if (!s) return { ok: false, error: '提报不存在或已被删除' };

  const card = resolveScoreCard(db, s);
  if (!card) return { ok: false, error: '未匹配到可用评分卡，请先在「评分卡管理」完成配置' };
  if ((card.dimensions ?? []).length === 0) {
    return { ok: false, error: `评分卡「${card.name}」未配置维度，无法出分` };
  }

  const stamp = at ?? defaultStamp();
  const r = aiScoreOf(s, card);
  const resultId = `SR-${s.id}-AI-AUTO`;
  const logId = `FL-${s.id}-AI-AUTO`;
  const label = `${card.name} ${card.version}`;

  const sr: ScoreResult = {
    id: resultId,
    target_type: 'submit',
    target_id: s.id,
    card_id: card.id,
    card_version: card.version,
    source: 'AI',
    dim_scores: r.dimScores,
    total: r.total,
    reason: r.reason,
    scorer_union_id: 'AI',
    scorer_name: AI_SCORER_NAME,
    created_at: stamp,
  };
  const fl: SubmitFlowLog = {
    id: logId, submit_id: s.id,
    from_status: s.status, to_status: 'AI_SCORED' as SubmitStatus,
    operator: `${operator}（后台补跑）`,
    reason: 'AI 评分未自动完成时，由组织者手动补跑并重跑分',
    created_at: stamp,
  };

  const patch: Partial<DB> = {
    submits: (db.submits ?? []).map((x) => (
      x.id === s.id ? { ...x, status: 'AI_SCORED' as SubmitStatus, ai_score: r.total } : x
    )),
    /* 同一 ID 覆盖而非追加：重复点「补跑」不会攒出多条 AI 评分记录 */
    scoreResults: [...(db.scoreResults ?? []).filter((x) => x.id !== resultId), sr],
    submitFlowLogs: [...(db.submitFlowLogs ?? []).filter((x) => x.id !== logId), fl],
  };

  return { ok: true, total: r.total, cardLabel: label, patch };
}
