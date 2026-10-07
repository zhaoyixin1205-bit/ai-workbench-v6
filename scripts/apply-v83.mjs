#!/usr/bin/env node
/**
 * V8.2-10.07 需求 3 · 每周场景卡装配（2026-10-07）
 * =================================================================
 * 需求原文：
 *   3. 管理后台-内容管理-每周场景卡，新建场景卡，
 *      依据 https://www.workbuddy.cn/space/d/o8EzH3IUahJdGBLyPw65ff 提炼后新建
 *
 * 素材来源：钉钉文档《xuhang-sales技能说明与使用指南》v6.1
 *   nodeId  ZgpG2NdyVXrarRANC79d1ZZ28MwvDqPk
 *   （源站 workbuddy.cn/space/d/o8EzH3IUahJdGBLyPw65ff 为同一份内容）
 *
 * 提炼口径：
 *   原文 8611 字 → 单张场景卡正文上限 300 字（30 秒可读完）。
 *   按原文的十个章节归并成 8 张「一个知识点一张卡」的系列卡，
 *   每张独立成文、可单独下线，不做超长截断。
 *
 * 用法：
 *   node scripts/apply-v83.mjs                 # 干跑（打印计划 + 字数校验）
 *   node scripts/apply-v83.mjs --apply         # 写本机 server/data/state.json（先备份）
 *   node scripts/apply-v83.mjs --apply --push  # 写本机 + PUT 线上（409 自动重试 3 次）
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const STATE_FILE = path.join(ROOT, 'server', 'data', 'state.json');
const SITE = process.env.SITE || 'https://aihrbp.yunzhangfang.com';
const BY = 'V8.2-10.07 场景卡装配';
const TODAY = '2026-10-07';
const WEEK = '2026-W41';
const CREATED_BY = '赵冰艳';
const NOW = `${TODAY} 16:55`;

const APPLY = process.argv.includes('--apply');
const PUSH = process.argv.includes('--push');

const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
const prev = raw.data ?? raw;
const next = structuredClone(prev);

/* ================================================================
 * 8 张场景卡（提炼自 xuhang-sales v6.1）
 * ============================================================== */
const CARDS = [
  {
    id: 'SC-W41-01',
    emoji: '🧭',
    title: 'xuhang-sales：把背景编译成销售语言',
    summary: '先判事实与阶段，再写能让当下客户听懂、且能推进下一步的话',
    content: [
      '一句话定位：把你给的业务背景，编译成当前任务的销售决策与语言。',
      '它消除四类通病：①脱离产品与客户背景的万能话术；②用共情词冒充理解；③用行动号召冒充建议；④用施压和虚假紧迫冒充成交推进。',
      '五条品味标准：关键内容能回指当前背景；客户目标与顾虑被准确回应；价值、证据、条件保持一致；下一步可执行且匹配阶段；换一个产品或客户，输出会实质变化。',
      '它不是：产品事实来源、报价审批者、合同决策者、成交概率预测器、固定话术库。',
    ].join('\n'),
    tags: ['销售对话', 'AI 技能', '背景编译'],
  },
  {
    id: 'SC-W41-02',
    emoji: '⚡',
    title: '五种模式：回复／教练／表达／模拟／复盘怎么选',
    summary: '先说清你手上这件事是什么，输出形态完全不同',
    content: [
      '极速回复｜要一条马上能发的：给可发正文 + 一个下一步 + 必要待确认项。',
      '单客户教练｜要判断客户和策略：给背景摘要、诊断、策略、正文、下一步。',
      '产品表达｜要做产品介绍或话术体系：给客户与产品背景、价值三问、分阶段内容、边界。',
      '问题模拟｜要预测客户会问什么：按角色、阶段、任务生成问题，不反向臆造业务问题。',
      '质检复盘｜要优化已有一句话或一段对话：给八维行为证据、硬门结果、修改优先级、修订稿。',
      '边界：普通通知、同事沟通、非销售文案润色，且没有客户决策目标时，不触发。',
    ].join('\n'),
    tags: ['销售对话', '工作模式'],
  },
  {
    id: 'SC-W41-03',
    emoji: '🔢',
    title: '七步流程：从背景到下一步的产出线',
    summary: 'Step0 路由资产 → Step1 编译背景 → …… → Step7 八维自检',
    content: [
      'Step0 路由资产：先看是否命中已沉淀的产品事实卡／场景处理卡，命中就调，但仍按当前客户重新生成语言。',
      'Step1 编译背景：区分已确认事实、客户原话、合理推测、关键未知、禁止带入项。',
      'Step2 判断客户任务与阶段：别把联系人当决策人，别把产品询问写成企业诊断。',
      'Step3 诊断真实阻力：路由到八类根因，本轮只处理最阻塞的一项。',
      'Step4 选价值与方案：用「为什么现在处理／为什么需要解决／为什么选这个方案」三问组织。',
      'Step5 生成语言：先答当前问题，用本轮具体信息证明理解，说明限制与未知。',
      'Step6 定义下一步：责任人、一个动作、时间或触发条件、完成标准、确认方式。',
    ].join('\n'),
    tags: ['销售对话', '执行流程'],
  },
  {
    id: 'SC-W41-04',
    emoji: '🛡️',
    title: '诚信门：一次编造，整条输出归零',
    summary: '虚假承诺可以抵消全部语言技巧，这条线没有商量余地',
    content: [
      '禁止：编造能力、证据、客户事实、价格、时限、名额、结果或第三方背书；假倒计时、假稀缺、隐藏成本与限制、默认客户同意、越权承诺。任一发生，整条输出失败，不能靠其他质量项抵消。',
      '事实取用顺序：①用户本轮明确确认的内容 → ②用户指定的产品卡／合同／报价 → ③当前对话中未被推翻的内容 → ④公开可核验的来源 → ⑤未知项保持未知。',
      '数字和条款（退费比例、手续费、服务承诺）一字不改；没有真实客户结果时，质量结论保持 no_verdict。',
    ].join('\n'),
    tags: ['销售对话', '合规', '诚信'],
  },
  {
    id: 'SC-W41-05',
    emoji: '🧩',
    title: 'AI 为什么会串台：背景注入门与案例隔离门',
    summary: '上一个客户的信息，不许出现在这一次的回复里',
    content: [
      '背景注入门：生成前必须先形成当前任务背景卡，至少识别说话人、产品事实、客户原话或任务、购买阶段、渠道、事实边界、本轮目标。你可以自然叙述，不用填表；也不必被反复追问已确认的信息。',
      '案例隔离门：不得保存或调用固定的产品、行业、金额、客户、称呼、人物设定或成段案例话术。跨任务时清空上一产品与客户的临时事实，不把历史示例迁移到新任务。',
      '可以保留的：固定结构、字段、行为锚点、空占位符。必须每次重新生成的：可直接发送的具体语言。',
    ].join('\n'),
    tags: ['销售对话', 'AI 技能', '隔离'],
  },
  {
    id: 'SC-W41-06',
    emoji: '🔍',
    title: '八类异议根因：先路由，再回应',
    summary: '客户说贵、说忙、说再看看，先判断是哪一类阻力',
    content: [
      '价值与价格｜谈价格、预算、比较、投入 → 重建价值—证据—成本链，必要时调整方案。',
      '风险与信任｜问资质、怕被骗、要承诺 → 给可核验证据、条件、限制与兜底。',
      '时机与优先级｜忙、以后再说 → 判断真实窗口，约定触发条件。',
      '权限与流程｜要请示、多人决策 → 支持他内部决策，不要求联系人越权。',
      '适配与能力｜功能、交付、资源不匹配 → 比较适配度，给替代路径。',
      '信息与理解｜听不懂、规则复杂 → 简化信息、核验理解、补权威来源。',
      '体验与不满｜延迟、投诉 → 先解决服务问题，再谈关系修复。',
      '沉默与低参与｜已读不回 → 只带新价值或真实节点触达，没有就停。',
    ].join('\n'),
    tags: ['销售对话', '异议处理'],
  },
  {
    id: 'SC-W41-07',
    emoji: '✍️',
    title: '去模板化：一眼看出是 AI 写的五件事',
    summary: '删掉「共情—转折—保证」三件套，具体才像人说的话',
    content: [
      '五条语言卫生规则：不用统一的「共情—转折—保证」结构；不用排比、金句、元话术和内部框架标签；不宣布「我即将说明／总结」再进入内容；不用泛化理解、空保证和夸张形容词；自然来自具体上下文——用客户本轮的事实、可核验数字、条件和核验方式。',
      '发散前先问自己：这一句删掉，客户会不会少知道一件事？',
      '另外三条边界：不主动开局就甩资质证件；不把客户的产品询问反写成对他的业务诊断；不把「有异议」自动解释成「想买」。',
    ].join('\n'),
    tags: ['销售对话', '话术质量'],
  },
  {
    id: 'SC-W41-08',
    emoji: '📊',
    title: '八维自检：给销售话术打分到底看什么',
    summary: '诚信硬门先于评分，通过之后才看这八个维度',
    content: [
      '先过诚信硬门：编造事实、隐瞒成本限制、冒充同意、假倒计时、越权承诺、带入历史任务事实——出现任一项，整条判定失败，不看分。',
      '再看八维：①理解与情绪对准（是不是本轮具体信息）②需求诊断（是否减少关键不确定性）③客户导向（有没有拒绝／改期的出口）④价值—证据—信任（客户能否自行核验）⑤清晰（一个主信息、先给结论）⑥异议诊断（复述→分类→澄清→回应→确认）⑦行动建议（一个低摩擦小步，含责任人／时点）⑧同意式推进（只前进一步，容易拒绝）。',
      '提醒：离线审阅单条文本时，依赖客户反馈的维度最高 3 分，4 分必须有真实对话证据；文本分数不得冒充成交概率。',
    ].join('\n'),
    tags: ['销售对话', '质检复盘'],
  },
];

/* ---------------- 计划输出 + 字数校验（对齐后台表单限制） ---------------- */
const LIM = { title: 40, summary: 60, content: 300 };
console.log('=== V8.2-10.07 需求 3 · 场景卡装配计划 ===');
console.log(`素材：钉钉文档《xuhang-sales技能说明与使用指南》v6.1（原文 8611 字）→ 提炼 8 张系列卡\n`);

let bad = 0;
const plan = CARDS.map((c) => {
  const t = c.title.length;
  const s = c.summary.length;
  const b = c.content.length;
  const over = [];
  if (t > LIM.title) over.push(`标题 ${t}>${LIM.title}`);
  if (s > LIM.summary) over.push(`摘要 ${s}>${LIM.summary}`);
  if (b > LIM.content) over.push(`正文 ${b}>${LIM.content}`);
  if (over.length) bad += 1;
  const exist = (next.sceneCards ?? []).some((x) => x.id === c.id && !x.is_deleted);
  console.log(`    ${c.emoji} ${c.id}｜${c.title}`);
  console.log(`           字数 标题${t} 摘要${s} 正文${b}${over.length ? '  ❌ ' + over.join(' / ') : '  ✅'}${exist ? '  ⚠ 已存在' : ''}`);
  return { ...c, action: exist ? '跳过（已存在）' : '新增' };
});

if (bad) {
  console.log(`\n❌ ${bad} 张卡超出后台表单字数上限，请先压缩再执行。`);
  process.exit(1);
}

const toAdd = plan.filter((c) => c.action === '新增');
console.log(`\n合计：待新增 ${toAdd.length} 张，跳过 ${plan.length - toAdd.length} 张`);
console.log(`统一属性：track=销售提效｜week=${WEEK}｜status=PUBLISHED｜created_by=${CREATED_BY}｜归属 ${NOW}`);

if (!APPLY) {
  console.log('\n[干跑] 未写入。加 --apply 写本机，--apply --push 同步线上。');
  process.exit(0);
}

/* ---------------- 落库 ---------------- */
next.sceneCards = [
  ...toAdd.map((c) => ({
    id: c.id,
    title: c.title,
    summary: c.summary,
    content: c.content,
    track: '销售提效',
    emoji: c.emoji,
    status: 'PUBLISHED',
    tags: c.tags,
    week: WEEK,
    view_count: 0,
    published_at: NOW,
    created_by: CREATED_BY,
    created_at: NOW,
  })),
  ...(next.sceneCards ?? []),
];

const bak = `${STATE_FILE}.bak-${Date.now()}`;
copyFileSync(STATE_FILE, bak);
writeFileSync(STATE_FILE, JSON.stringify({ ...raw, data: next }, null, 2), 'utf8');
console.log(`\n已写本机：${STATE_FILE}（备份 ${bak}）`);
console.log(`本机 sceneCards = ${next.sceneCards.length}`);

if (!PUSH) process.exit(0);

async function push() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const cur = await fetch(`${SITE}/api/state`).then((r) => r.json());
    const payload = { data: next, baseVersion: cur.version, updated_by: BY };
    const res = await fetch(`${SITE}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`线上已更新 → version ${body.version ?? '?'}（第 ${attempt} 次尝试）`);
      return true;
    }
    console.log(`第 ${attempt} 次失败 ${res.status}：${body.message ?? JSON.stringify(body).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

const ok = await push();
console.log(ok ? '线上同步完成' : '线上同步失败（本机已写入，可重试 --push）');
process.exit(ok ? 0 : 1);
