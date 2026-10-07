#!/usr/bin/env node
/**
 * V8-10.07 需求数据装配（2026-10-07）
 * =================================================================
 * 来源：钉钉文档《AI赋能需求优化方案》→ 「# V8-10.07」四条
 *
 *   1. 案例精选：所有案例外框大小一致；新增案例「远程数据分析报告（王磊）」
 *   2. 用户标签：按钉钉表格《用户标签》52 人名单梳理；干部 + 核心骨干 = 进度看板默认分母
 *   3. 悬赏大厅：按《WorkBuddy 悬赏案例集》补 11 条；积分统一 200 分；悬赏人默认「公司」
 *   4. 积分商城：清空现有商品，录入「WorkBuddy 企业版积分」500 / 1000 / 2000 三档
 *
 * 用法：
 *   node scripts/apply-v8.mjs            # 干跑（只打印计划）
 *   node scripts/apply-v8.mjs --apply    # 写本机 server/data/state.json（先备份）
 *   node scripts/apply-v8.mjs --apply --push   # 写本机 + PUT 线上（409 自动重试 3 次）
 *
 * 素材文件（不入库）：
 *   ../_tmp/labels.json        钉钉表格《用户标签》A1:G53 原始响应
 *   ../_tmp/bounty-src.txt     《WorkBuddy 悬赏案例集》docx 提取的 11 条正文
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const STATE_FILE = path.join(ROOT, 'server', 'data', 'state.json');
const LABELS_FILE = path.join(ROOT, '..', '_tmp', 'labels.json');
const SITE = process.env.SITE || 'https://aihrbp.yunzhangfang.com';
const BY = 'V8-10.07 需求装配';
const TODAY = '2026-10-07';

const APPLY = process.argv.includes('--apply');
const PUSH = process.argv.includes('--push');

const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
const prev = raw.data ?? raw;
const next = structuredClone(prev);

/* ================================================================
 * 2) 用户标签：按钉钉表格 52 人名单梳理
 * ============================================================== */
const labelRows = JSON.parse(readFileSync(LABELS_FILE, 'utf8'))
  .cells.slice(1)
  .map((r) => r.map((c) => (c.value ?? '').toString().trim()))
  .filter((v) => v[0]);

/** 表格列：0姓名 1干部 2核心骨干 3评委 4专家 5组织者 6系统管理员 */
const TAG_OF_COL = { 1: '干部', 2: '核心骨干', 3: '评委', 4: '专家', 5: '组织者', 6: '系统管理员' };

/** 标签字典：code 稳定不变（代码按 code 取），name / 成员可随表格变 */
const TAG_DEFS = [
  { id: 'T1', code: 'CADRE', name: '干部', is_default: true, is_assessment_scope: true },
  { id: 'T2', code: 'CORE39', name: '核心39人', is_default: true, is_assessment_scope: true },
  { id: 'T3', code: 'BACKBONE', name: '核心骨干', is_default: false, is_assessment_scope: true },
  { id: 'T4', code: 'JUDGE_TAG', name: '评委', is_default: false, is_assessment_scope: false },
  { id: 'T5', code: 'EXPERT_TAG', name: '专家', is_default: false, is_assessment_scope: false },
  { id: 'T6', code: 'ORGANIZER_TAG', name: '组织者', is_default: false, is_assessment_scope: false },
  { id: 'T7', code: 'SYSADMIN_TAG', name: '系统管理员', is_default: false, is_assessment_scope: false },
];
const ID_OF_NAME = Object.fromEntries(TAG_DEFS.map((t) => [t.name, t.id]));

const byName = new Map(next.users.map((u) => [u.name, u]));
const planTags = [];   // {name, tags}
const unmatched = [];

for (const row of labelRows) {
  const u = byName.get(row[0]);
  if (!u) { unmatched.push(row[0]); continue; }
  const tags = [];
  for (const [col, label] of Object.entries(TAG_OF_COL)) {
    if (row[col] === '是') tags.push(ID_OF_NAME[label]);
  }
  planTags.push({ name: row[0], tags });
  u.tags = tags;
}

/** 表格外的人：旧钉钉派生标签（T1/T2/T3）作废 —— 表格是本轮唯一权威口径 */
let cleared = 0;
const inTable = new Set(labelRows.map((r) => r[0]));
for (const u of next.users) {
  if (!inTable.has(u.name)) {
    if ((u.tags ?? []).length > 0) cleared += 1;
    u.tags = [];
  }
}

/** 标签字典回写（保留已有字段，只改 name / 口径 / 人数） */
next.tags = TAG_DEFS.map((def) => {
  const old = prev.tags.find((t) => t.id === def.id) ?? {};
  return { ...old, ...def, status: old.status ?? '启用', member_count: 0 };
});
for (const u of next.users) for (const t of u.tags ?? []) {
  const def = next.tags.find((x) => x.id === t);
  if (def) def.member_count += 1;
}

/* ================================================================
 * 1) 案例精选：新增「远程数据分析报告（王磊）」
 * ============================================================== */
const CASE_URL = 'https://alidocs.dingtalk.com/i/nodes/NZQYprEoWoebex2lSQgklv5MJ1waOeDk';
const wanglei = next.users.find((u) => u.name === '王磊');

const NEW_CASE = {
  id: 'W13',
  track: '团队提效',
  title: '远程数据分析报告',
  summary: '远程办公场景下，把散落各处的数据汇总成一份能直接发出去的分析报告：AI 负责取数口径整理、图表解读与结论生成，人只做判断与把关。',
  pain_point: '远程协作时数据分散在多个系统与同事手里，汇总靠人工来回传表；报告撰写耗时长，且容易写成数据罗列，缺少「下一步该做什么」的结论。',
  input: '业务原始数据（Excel / 系统导出）+ 本次分析要回答的问题',
  prompt: '本作品为 WorkBuddy 应用实践真实作品（远程数据分析场景）。\n复用方式：打开下方「原文分享」链接照做；如需改造请先联系作者 王磊。',
  output: '可直接发出的分析报告',
  acceptance: [],
  level: '干部层',
  tags: ['数据分析', '远程办公', '中小微事业群'],
  author_union_id: wanglei?.union_id ?? '',
  author_name: '王磊',
  like_count: 0,
  view_count: 0,
  reuse_count: 0,
  duration: '',
  cover: '🧠',
  status: '已发布',
  created_at: `${TODAY} 14:00`,
  attachments: [{
    id: 'W13-F1', ext: 'link', url: CASE_URL,
    name: 'AI应用之远程AI数据分析报告分享', note: CASE_URL, size: '-', driver: 'demo',
  }],
};
const caseExists = next.cases.some((c) => c.id === NEW_CASE.id);
if (!caseExists) next.cases = [...next.cases, NEW_CASE];

/* ================================================================
 * 3) 悬赏大厅：11 条（积分统一 200，悬赏人默认「公司」）
 * ============================================================== */
const OWNER_UNION = next.users.find((u) => u.roles?.includes('ORGANIZER'))?.union_id ?? '';
const BOUNTY_POINTS = 200;   // 需求口径：统一 200（案例集原文写 500，以需求文档为准）
const DUE = '2026-10-31';

const BOUNTIES = [
  {
    title: 'WorkBuddy 优秀使用场景直接沉淀、一键共享给全员',
    track: '团队提效',
    pain_point: '一线骨干各自摸索 WorkBuddy 用法，好的用法散落在个人手里，没有统一沉淀和共享；新人不知道工具能干什么，只能重复试错，经验靠口口相传、随人流失。代价：工具激活率低，骨干大量时间耗在重复摸索上，平台价值没被用起来。',
    expected_output: '形式：一份结构化的《WorkBuddy 优秀使用场景库/案例文档》（Word 或在线文档）。可用标准：按岗位与场景分类（客成、销售、财税顾问等），每个场景写清「做什么、怎么用、提示词或操作步骤、达到的效果」，全员可检索、可直接套用。',
  },
  {
    title: '客户问到不熟业务，AI 一键生成可落地应答方案',
    track: '客户赋能',
    pain_point: '区域一线客成/销售骨干几乎每天遇到客户问到自己不熟悉的业务场景（新财税政策、疑难账务、客户经营问题等）。目前靠个人经验临时憋话术，或翻资料、请教同事，来回要等半小时以上，新人、转岗同事尤其发怵。代价：回复慢且不专业，客户觉得不够专业，影响成单与续费。',
    expected_output: '形式：一套可复用的模板文档（Word/网页版均可），即《陌生客户问题快速应答模板/提示词》。可用标准：输入任意客户提问，按模板即可产出①问题拆解与涉及知识点；②可借鉴的专业思路；③可直接发给客户的话术＋落地动作；④风险提示。',
  },
  {
    title: '重点客户 BI 报告自动生成并附 AI 经营建议',
    track: '客户赋能',
    pain_point: '片区客成负责人服务老客户/重点客户时，需要定期出客户经营分析（BI）报告，但手工拉数、做表、写解读非常耗时，且报告偏数据罗列、缺「下一步该怎么做」的建议。代价：报告出得慢、对客价值有限，重点客户经营深度不够，续费与增购缺少抓手。',
    expected_output: '形式：自动生成的重点客户 BI 经营报告（Excel、Word 或网页均可）。可用标准：自动整合重点客户经营数据，生成结构化报告，并附 AI 给出的场景化建议（该提醒客户什么、客成该做什么动作）；成稿可直接发给客户或用于客成复盘。',
  },
  {
    title: '财报科目异常自动关联涉税风险并给出减损建议',
    track: '客户赋能',
    pain_point: '代账公司财税顾问日常靠人工翻看客户财报、凭经验找涉税风险点再提醒客户，核对慢、易漏，且缺少可对外讲的案例佐证，提醒显得空。代价：风险提示不及时、不专业，客户不买单，直接影响续费与增值业务转化。',
    expected_output: '形式：现成工具 / Skill / 专家智能体。可用标准：输入企业财务报表或科目数据，自动识别异常科目并关联对应涉税风险提示，给出可能造成的损失影响、配案例佐证、如何规避/减轻企业损失的建议，以及下一步行动建议；输出内容可直接用于对客沟通。',
  },
  {
    title: 'AI 辅助区域市场分析与新商业模式探索',
    track: '销售提效',
    pain_point: '城市负责人要判断区域市场机会、探索新的业务与商业模式，但目前靠零散经验和人工搜集信息，不成体系、反应慢。代价：决策凭感觉，新增长点找不准，团队业务方向模糊，错过市场窗口。',
    expected_output: '形式：现成工具 / Skill / 专家智能体。可用标准：输入区域或行业背景，AI 能辅助输出市场分析框架、竞争与机会判断，以及新商业模式/增长点建议；结论有依据、可用于团队讨论和落地排期。',
  },
  {
    title: '客户高频新诉求快速落地为可用小工具',
    track: '客户赋能',
    pain_point: '客成经理常遇到客户提出云帐房现有产品没有的功能诉求，反复出现却只能靠人工临时应付或记工单排队等开发，响应慢。代价：客户诉求积压、体验差，一线只能口头解释，满意度与续约受影响。',
    expected_output: '形式：现成小工具 / Skill / 智能体。可用标准：把高频、重复出现的客户诉求快速做成一线能直接用的小工具/小应用，无需等产品排期；操作简单，能直接解决对应业务场景。',
  },
  {
    title: '高频重复的表格处理工作模板化、自动化',
    track: '团队提效',
    pain_point: '城市负责人日常有大量重复性表格处理（整理、清洗、合并、汇总），手工做费时又易错。代价：大量时间耗在「表格搬砖」上，效率低、容易出错，挤占高价值客户工作。',
    expected_output: '形式：可复用模板（Excel 等模板文档）或自动化处理流程。可用标准：把高频表格处理动作做成可套用模板或几步完成的自动化流程，自动完成清洗与汇总，明显减少手工操作和出错率。',
  },
  {
    title: '客成基础服务环节接入 AI 智能客服',
    track: '客户赋能',
    pain_point: '片区客成负责人在基础服务中要应对大量重复的客户咨询，人工反复作答、占用大量精力。代价：基础问题响应慢，客成人力被低价值咨询占满，没时间做深度经营。',
    expected_output: '形式：智能客服方案/配置。可用标准：在客成基础服务流程中接入 AI 智能客服，自动应答常见问题、自动分流复杂问题，提升首次响应速度与问题拦截率，人工只处理疑难。',
  },
  {
    title: '按业务需求智能推荐最适配的专家或专家团队',
    track: '团队提效',
    pain_point: '内部/平台行业专家数量多、标签杂，一线遇到问题时不知道该找哪位专家，靠人脉询问、来回找人。代价：匹配慢、常找错人，专家资源用不起来，问题解决周期被拉长。',
    expected_output: '形式：现成工具 / Skill。可用标准：输入业务指令或需求描述，自动推荐最适配的专家或专家团队（含擅长领域、可对接方式），推荐准确、可直接对接。',
  },
  {
    title: '代账老板管理工作台搭建：给可直接抄的提示词',
    track: '客户赋能',
    pain_point: '代账公司老板需要一个管客户、管账务、管员工、管收款的管理工作台，但不知道怎么用 AI/工具搭出来，也没有现成话术，目前靠表格和脑子管。代价：管理效率低、不系统，老板们缺一个趁手的经营抓手。',
    expected_output: '形式：可直接抄的提示词。可用标准：给出一套现成提示词，输入后即可帮代账老板搭出管理工作台（客户、账务、人员、收款看板与提醒），一线复制粘贴就能用，无需额外培训。',
  },
  {
    title: '经验知识库自动沉淀并导入扣子、自动训练全流程',
    track: '团队提效',
    pain_point: '服务中心目前靠人工根据经验提炼知识，再手动录入扣子知识库，人工维护耗时、更新不及时，导致智能客服答不准、拦截率低。代价：知识库越用越旧，智能客服效果上不去，人工兜底多。',
    expected_output: '形式：现成工具 / Skill / 自动化流程。可用标准：打通「一线经验/工单 → 自动提炼 → 导入扣子知识库 → 自动训练」的全流程，减少人工维护，并可量化看到智能客服拦截率的提升。',
  },
];

const bountyRows = BOUNTIES.map((b, i) => ({
  id: `B${String(i + 1).padStart(2, '0')}`,
  title: b.title,
  pain_point: b.pain_point,
  expected_output: b.expected_output,
  points: BOUNTY_POINTS,
  track: b.track,
  owner_union_id: OWNER_UNION,
  owner_name: '公司',              // 需求：悬赏人均默认为「公司」
  source: '组织者发布',
  status: 'PUBLISHED',
  due_date: DUE,
  desensitized: true,
  created_at: `${TODAY} 14:00`,
}));
const bountyBefore = next.bounties.length;
next.bounties = bountyRows;

/* ================================================================
 * 4) 积分商城：清空现有商品，录入企业版积分三档
 * ============================================================== */
const SHOP = [
  { id: 'PTS500', name: 'WorkBuddy 企业版积分 · 500 分', points: 500, cover: '💰' },
  { id: 'PTS1000', name: 'WorkBuddy 企业版积分 · 1000 分', points: 1000, cover: '🎁' },
  { id: 'PTS2000', name: 'WorkBuddy 企业版积分 · 2000 分', points: 2000, cover: '🏆' },
].map((s) => ({
  id: s.id,
  name: s.name,
  cover: s.cover,
  desc: `WorkBuddy 企业版积分 ${s.points} 分，积分 1:1 兑换，线上发放，全员可参与。兑换后由组织者线上发放到账。`,
  points: s.points,
  stock: 9999,
  limit_per_user: 10,
  scope: '全员',
  on_sale_at: TODAY,
  off_sale_at: '2027-12-31',
  status: '上架',
  verify_type: '线上发放',
  exchanged_count: 0,
}));
const shopBefore = next.shopItems.length;
const orderBefore = next.shopOrders.length;
next.shopItems = SHOP;
/** 旧商品的兑换订单一并作废（旧商品已下架，订单留着会指向不存在的商品） */
next.shopOrders = [];

/* ================================================================
 * 干跑输出
 * ============================================================== */
const count = (arr, id) => arr.filter((x) => (x.tags ?? []).includes(id)).length;
console.log('— V8-10.07 装配计划 —');
console.log(`标签：名单 ${labelRows.length} 人，未匹配 ${unmatched.length} 人${unmatched.length ? ' → ' + unmatched.join('、') : ''}`);
console.log(`      表格外清除旧标签 ${cleared} 人`);
for (const t of next.tags) console.log(`      ${t.id} ${t.name}（${t.code}）→ ${count(next.users, t.id)} 人，考核分母=${t.is_assessment_scope}`);
console.log(`      进度看板默认分母 = 干部 + 核心骨干 = ${count(next.users, 'T1') + count(next.users, 'T3')} 人`);
console.log(`案例：${prev.cases.length} → ${next.cases.length}（新增 ${caseExists ? '跳过，已存在' : NEW_CASE.title}｜作者 ${NEW_CASE.author_name}${wanglei ? '' : ' ⚠ 通讯录未找到'}）`);
console.log(`悬赏：${bountyBefore} → ${next.bounties.length} 条，积分统一 ${BOUNTY_POINTS} 分，悬赏人「公司」，截止 ${DUE}`);
console.log(`商城：${shopBefore} 件 → ${SHOP.length} 档（${SHOP.map((s) => s.points).join('/')} 分，1:1，全员，线上发放）；兑换订单 ${orderBefore} → 0`);

if (!APPLY) {
  console.log('\n[干跑] 未写入。加 --apply 写本机，--apply --push 同步线上。');
  process.exit(0);
}

/* 写本机（先备份） */
const bak = `${STATE_FILE}.bak-${Date.now()}`;
copyFileSync(STATE_FILE, bak);
writeFileSync(STATE_FILE, JSON.stringify({ ...raw, data: next }, null, 2), 'utf8');
console.log(`\n已写本机：${STATE_FILE}（备份 ${bak}）`);

if (!PUSH) process.exit(0);

/* PUT 线上（409 冲突自动重取版本号重试） */
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
console.log(ok ? '✅ 线上同步完成' : '❌ 线上同步失败（本机已写入，可重试 --push）');
process.exit(ok ? 0 : 1);
