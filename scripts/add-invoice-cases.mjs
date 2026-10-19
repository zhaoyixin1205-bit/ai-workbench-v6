/**
 * 一次性脚本：给两条已有案例补本周场景卡，排进「本周高频场景卡」第一/二行。
 *
 * 背景（2026-10-19 组织者需求 + 线上实测）：
 *   案例 CS1792058968779「AI开票——客户使用分析报告」（刘琪琪 / 客户赋能）与
 *   CS1792146063730「AI 开票消耗量动态看板」（郭彦柳 / 团队提效）组织者已建好
 *   （Skill 包已挂、已发布），但库里没有任何关联场景卡 → 首页没有这两行。
 *   本脚本各补 3 张本周（真实今天 ISO 周）PUBLISHED 卡：
 *     · 第一行 = AI开票——客户使用分析报告（sort 0/1/2，bandSort=0）
 *     · 第二行 = AI 开票消耗量动态看板（sort 3/4/5，bandSort=3）
 *     · 原「代账客户拜访地图」行（SC-W42-01~03，现 sort 0/1/2）顺延为第三行（6/7/8）
 *   顺带补两条案例的空正文字段（summary/pain_point/input/prompt/output/
 *   acceptance/duration）——与 10-13「代账客户拜访地图」同款问题：架子已搭、
 *   正文全空，员工点进去是空壳页。只补空字段，已有值一律不动。
 *
 * 铁律：
 *  - DATABASE_URL 必须来自 systemd 环境（生产 PG）；缺失直接退出，绝不回退文件影子库；
 *  - 写入走 PgStateStore 乐观锁（baseVersion 不一致即失败，不静默覆盖）；
 *  - 幂等：卡已存在则跳过；案例不存在才新建（兜底）；
 *  - 执行前需先 systemctl stop ai-workbench（服务内存缓存不感知外部写入）。
 */

import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

const CASE_1 = { id: 'CS1792058968779', title: 'AI开票——客户使用分析报告', author: '刘琪琪', track: '客户赋能' };
const CASE_2 = { id: 'CS1792146063730', title: 'AI 开票消耗量动态看板', author: '郭彦柳', track: '团队提效' };
const VISIT_CASE_ID = 'CS1791891128624'; // 代账客户拜访地图（第三行，让位）

/** ISO 周次键，与 src/service/sceneBoard.ts isoWeekKey 逐行等价 */
function isoWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** 与现数据同构的时间串：YYYY-MM-DD HH:mm（后台 now() 同款格式，日期用真实今天） */
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

if (!process.env.DATABASE_URL) {
  console.error('!! 缺少 DATABASE_URL（必须来自 systemd 环境），拒绝回退文件影子库，退出');
  process.exit(1);
}

const store = createStateStore({
  DATABASE_URL: process.env.DATABASE_URL,
  PGSSLMODE: process.env.PGSSLMODE,
});
await store.init();
if (store.name !== 'pg') {
  console.error(`!! 存储驱动不是 pg（${store.name}），有走影子库风险，退出`);
  process.exit(1);
}

const { data, version } = await store.read();
if (!data) { console.error('!! app_state 为空，退出'); process.exit(1); }

const cases = data.cases ?? [];
const c1 = cases.find((c) => c.id === CASE_1.id);
const c2 = cases.find((c) => c.id === CASE_2.id);
if (!c1 || !c2) { console.error(`!! 案例不在库中 c1=${!!c1} c2=${!!c2}，退出`); process.exit(1); }

/* ---- 幂等：两案例各已有 3 张卡 → 不重复创建 ---- */
const mine1 = (data.sceneCards ?? []).filter((s) => s.source_case_id === CASE_1.id && !s.is_deleted);
const mine2 = (data.sceneCards ?? []).filter((s) => s.source_case_id === CASE_2.id && !s.is_deleted);
const needCreate = (mine1.length < 3 ? 3 - mine1.length : 0) + (mine2.length < 3 ? 3 - mine2.length : 0);
if (needCreate === 0) {
  console.log(`SKIP 两案例已有场景卡（${mine1.length}/${mine2.length}），无需重复创建`);
  await store.close();
  process.exit(0);
}

const at = stamp();
const week = isoWeekKey();

/* ---- 6 张场景卡（与后台新建同构；id 用 SC-W43-xx 序列） ---- */
const cards = [
  /* ===== 第一行：AI开票——客户使用分析报告（刘琪琪 / 客户赋能）===== */
  {
    id: 'SC-W43-01',
    title: '用量下滑先别慌：分清是客户不用了，还是不会用',
    summary: '开票量掉了，先看登录和功能使用，再下结论',
    content: 'AI 开票的用量突然下滑，先别急着判断「客户不用了」。把三个数摆在一起看：登录频次、月开票量、功能使用种类。三个都掉 = 真流失，要谈续费风险；只有开票量掉 = 多半是业务淡季，或者不会用新功能。分清原因，跟进动作才不一样——一个要救关系，一个只要教功能。',
    track: CASE_1.track,
    emoji: '\u{1F9ED}',
    status: 'PUBLISHED',
    tags: ['AI开票', '客户报告'],
    week,
    view_count: 0,
    published_at: at,
    created_by: CASE_1.author,
    created_at: at,
    source_case_id: CASE_1.id,
    sort: 0,
  },
  {
    id: 'SC-W43-02',
    title: '三个信号认出「开着没用」的客户：登录、开票、功能',
    summary: '沉睡客户不是骂醒的，是先拿数据指给他看',
    content: '哪些客户属于「买了没用」？看三个信号：近 30 天登录少于 2 次、月开票量持续走低、高级功能一次没用过。三个信号命中两个，就列进本月重点跟进名单。带着数据去聊，比一句「你们用得不太好」有说服力得多——客户第一个问题往往是「真的吗」，数据就是答案。',
    track: CASE_1.track,
    emoji: '\u{1F50D}',
    status: 'PUBLISHED',
    tags: ['AI开票', '客户经营'],
    week,
    view_count: 0,
    published_at: at,
    created_by: CASE_1.author,
    created_at: at,
    source_case_id: CASE_1.id,
    sort: 1,
  },
  {
    id: 'SC-W43-03',
    title: '拿使用报告谈客户：先讲趋势，再讲同行，最后才讲方案',
    summary: '开口先给他看他家的使用情况，别一上来就推销',
    content: '约客户沟通前，把使用分析报告缩成一页：先讲他家的用量趋势（哪里在涨、哪里在掉），再讲同规模同行的对标（别人用起来了、收益多少），最后才落到「我们可以帮你把哪块用起来」。顺序别反——一上来就推方案，客户只觉得你想卖东西；先给价值，方案才有人听。',
    track: CASE_1.track,
    emoji: '\u{1F4AC}',
    status: 'PUBLISHED',
    tags: ['AI开票', '客户沟通'],
    week,
    view_count: 0,
    published_at: at,
    created_by: CASE_1.author,
    created_at: at,
    source_case_id: CASE_1.id,
    sort: 2,
  },
  /* ===== 第二行：AI 开票消耗量动态看板（郭彦柳 / 团队提效）===== */
  {
    id: 'SC-W43-04',
    title: '一张看板三个口径：按天、按客户、按渠道',
    summary: '别只盯总量——三个口径分开看，才知道量从哪来、到哪去',
    content: '消耗量看板最怕只有一个总数。按天看趋势（有没有异常波动）、按客户看集中度（是不是一两个大客户撑着）、按渠道看结构（自然增长和活动拉动各占多少）。三个口径摆进同一块看板，量的来龙去脉一眼看清，汇报也不用现拼图。',
    track: CASE_2.track,
    emoji: '\u{1F4CA}',
    status: 'PUBLISHED',
    tags: ['AI开票', '数据看板'],
    week,
    view_count: 0,
    published_at: at,
    created_by: CASE_2.author,
    created_at: at,
    source_case_id: CASE_2.id,
    sort: 3,
  },
  {
    id: 'SC-W43-05',
    title: '给看板设预警线：环比跌两成自动标红',
    summary: '不用天天盯盘，红了再看不迟',
    content: '盯消耗量最费人。设一条预警线：任一口径环比跌超 20% 自动标红，跌超 40% 直接推送到负责人。平时看绿色就行，红了再打开看板下钻到客户。把「天天看」变成「红了再看」，团队每周能省出半天，也不会再出现「月底才发现量掉了一个月」。',
    track: CASE_2.track,
    emoji: '\u{1F6A8}',
    status: 'PUBLISHED',
    tags: ['AI开票', '预警'],
    week,
    view_count: 0,
    published_at: at,
    created_by: CASE_2.author,
    created_at: at,
    source_case_id: CASE_2.id,
    sort: 4,
  },
  {
    id: 'SC-W43-06',
    title: '看板不是摆设：周例会照着红黄绿分跟进',
    summary: '数据不落到动作，看板就成了墙上的画',
    content: '每周例会拿看板过一遍：红色的客户当场定责任人和动作、黄色的排进下周计划、绿色的总结可复制的做法。散会时跟进清单已经出来了。看板的价值不在「看见」，在每次看完都有人认领一件事——没人认领的数据，只是一张好看的图。',
    track: CASE_2.track,
    emoji: '\u{1F5FA}',
    status: 'PUBLISHED',
    tags: ['AI开票', '周例会'],
    week,
    view_count: 0,
    published_at: at,
    created_by: CASE_2.author,
    created_at: at,
    source_case_id: CASE_2.id,
    sort: 5,
  },
];

/* ---- 案例空正文补全（只补空字段；已有值一律不动） ---- */
const FILL = {
  [CASE_1.id]: {
    summary: '把客户的 AI 开票使用数据做成一份分析报告：用量趋势、沉睡信号、同行对标一页看清，让客成跟进有据可依',
    pain_point: '客户买了 AI 开票却用不起来，客成只能凭感觉猜原因；续费沟通时拿不出使用数据，说不出这一年帮他省了什么',
    input: '客户近 6 个月 AI 开票使用数据：登录记录、月开票量、功能使用明细',
    prompt: '你是客户成功分析师。我会给你一个客户的 AI 开票使用数据（登录频次、月开票量、功能使用记录），请输出一份《客户使用分析报告》：① 用量趋势与异常点；② 「沉睡信号」判定（登录/开票/功能三维度）；③ 同规模同行对标；④ 三条可执行的激活建议。每一条结论都要引用数据，不要空话。',
    output: '一页纸《AI 开票客户使用分析报告》：趋势、信号、对标、建议四段式',
    acceptance: [
      '报告包含用量趋势与至少一处异常点说明',
      '沉睡信号按登录/开票/功能三维度判定，有明确结论',
      '含同规模同行对标，基准数据来源可溯',
      '激活建议可执行，每条建议对应报告中的具体发现',
    ],
    duration: '约 30 分钟',
  },
  [CASE_2.id]: {
    summary: '把团队/客户的 AI 开票消耗量汇成一块动态看板：按天、按客户、按渠道三个口径跟踪，异常自动预警，周例会照着分跟进',
    pain_point: '消耗量靠月底导表手工拼，等发现下滑已经过了两周；群里问一句「最近量怎么样」，要半小时才能凑出答案',
    input: 'AI 开票消耗量流水数据（按天、按客户、按渠道三个维度）',
    prompt: '你是数据分析师。我会给你 AI 开票消耗量流水（按天、按客户、按渠道），请设计一块动态看板并给出更新机制：① 三个核心口径的图表选型与刷新频率；② 预警规则（环比阈值与通知方式）；③ 周例会使用流程（红黄绿如何分跟进）。输出看板结构说明 + 维护清单。',
    output: '动态看板（日/周趋势 + 客户排行 + 渠道结构 + 预警清单）+ 每周维护清单',
    acceptance: [
      '看板含按天/按客户/按渠道三个口径，刷新频率明确',
      '预警规则含环比阈值与通知对象，可自动触发',
      '附周例会使用流程，红黄绿各有对应动作',
      '数据口径在报告中有定义，换人可维护',
    ],
    duration: '约 40 分钟',
  },
};

const isEmptyVal = (v) => v === undefined || v === null || v === '' || v === '—' || (Array.isArray(v) && v.length === 0);
function fillCase(c) {
  const f = FILL[c.id];
  if (!f) return c;
  const next = { ...c };
  for (const [k, v] of Object.entries(f)) {
    if (isEmptyVal(next[k])) next[k] = v;
  }
  return next;
}

/* ---- 让位：代账拜访行原 sort 0/1/2 与新卡 0..5 冲突 → 顺延为 6/7/8（保持现有序） ---- */
const visitCards = (data.sceneCards ?? [])
  .filter((s) => s.source_case_id === VISIT_CASE_ID && !s.is_deleted)
  .sort((a, b) => ((a.sort ?? Infinity) - (b.sort ?? Infinity)) || (a.id < b.id ? -1 : 1));
const conflict = visitCards.some((s) => typeof s.sort === 'number' && s.sort >= 0 && s.sort <= 5);
const visitShift = new Map();
if (conflict) visitCards.forEach((s, i) => visitShift.set(s.id, 6 + i));

/* ---- 组装写入 ---- */
const haveIds = new Set((data.sceneCards ?? []).map((s) => s.id));
const adding = cards.filter((c) => !haveIds.has(c.id));
if (adding.length === 0) {
  console.log('SKIP 计划内的卡都已存在');
  await store.close();
  process.exit(0);
}

const next = {
  ...data,
  cases: cases.map((c) => fillCase(c)),
  sceneCards: [
    ...adding,
    ...(data.sceneCards ?? []).map((s) => (visitShift.has(s.id) ? { ...s, sort: visitShift.get(s.id) } : s)),
  ],
};

const res = await store.write(next, version, '赵冰艳');
if (!res.ok) {
  console.error(`!! 乐观锁冲突（version ${version} 已被改），未写入，重跑即可`);
  await store.close();
  process.exit(2);
}

/* ---- read-back 验证 ---- */
const after = await store.read();
const back1 = (after.data.sceneCards ?? []).filter((s) => s.source_case_id === CASE_1.id && !s.is_deleted);
const back2 = (after.data.sceneCards ?? []).filter((s) => s.source_case_id === CASE_2.id && !s.is_deleted);
const backV = (after.data.sceneCards ?? []).filter((s) => s.source_case_id === VISIT_CASE_ID && !s.is_deleted);
const ok1 = back1.length === 3 && back1.every((s) => s.status === 'PUBLISHED' && s.week === week);
const ok2 = back2.length === 3 && back2.every((s) => s.status === 'PUBLISHED' && s.week === week);
const okV = backV.every((s) => typeof s.sort === 'number' && s.sort >= 6);
const bc1 = (after.data.cases ?? []).find((c) => c.id === CASE_1.id);
const bc2 = (after.data.cases ?? []).find((c) => c.id === CASE_2.id);
const okFill = bc1.summary && bc1.prompt && bc2.summary && bc2.prompt;
console.log(`OK version ${version} -> ${res.version}`);
console.log(`OK 第一行「${CASE_1.title}」${back1.length} 张 week=${week} sort=0..2：`);
back1.sort((a, b) => a.sort - b.sort).forEach((s) => console.log(`   - [${s.emoji}] ${s.title}`));
console.log(`OK 第二行「${CASE_2.title}」${back2.length} 张 week=${week} sort=3..5：`);
back2.sort((a, b) => a.sort - b.sort).forEach((s) => console.log(`   - [${s.emoji}] ${s.title}`));
console.log(`OK 第三行「代账客户拜访地图」sort -> ${backV.map((s) => s.sort).join(',')}（原 0,1,2）`);
console.log(`OK 案例正文补全 c1=${!!okFill ? 'done' : 'MISS'}（summary/prompt 等空字段）`);
if (!ok1 || !ok2 || !okV || !okFill) {
  console.error(`!! read-back 异常 ok1=${ok1} ok2=${ok2} okV=${okV} okFill=${okFill}`);
  await store.close();
  process.exit(3);
}
await store.close();
