/**
 * 一次性脚本：新建「财税体检——客户风险提示报告」案例，挂 Skill 包，
 * 并在「本周高频场景卡」第一行铺 3 张 W43 卡。
 *
 * 背景（2026-10-19 组织者需求，4 项已拍板）：
 *   ① 场景卡放第一行 —— 新卡 sort 0/1/2，现有 9 张（开票 0-2 / 看板 3-5 / 代账 6-8）全部 +3 顺延；
 *   ② 案例状态 = 已发布；
 *   ③ 只挂 Skill 包（宣传图为内部物料，不进员工可见附件区）；
 *   ④ 标题口径 = 「财税体检——客户风险提示报告」。
 * 署名：author_union_id 用时海龙真实 unionId（与他现有案例 W01 同口径，积分归属不漂移）。
 *
 * 输入（scp 到服务器）：/data/ai-workbench/tmp-upload/fiscal-health-report.zip
 *   （本地由 skill案例包/财税体检报告 打成，SKILL.md 在根目录，已过 validateSkillZip）
 *
 * 铁律：
 *  - DATABASE_URL 必须来自 systemd 环境；缺失直接退出，绝不回退文件影子库；
 *  - 执行前需先 systemctl stop ai-workbench（服务内存缓存不感知外部写入）；
 *  - 写入走 PgStateStore 乐观锁（baseVersion 不一致即失败，不静默覆盖）；
 *  - 幂等：案例已存在 / 卡已存在 → 不重复创建、不重复让位；
 *  - 文件落库顺序必须是先 writeMeta 后 put（PgDriver put 按 object_key 做 UPDATE）。
 */

import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';
import { createFileRepository, newFileMeta, makeObjectKey } from '/data/ai-workbench/server/lib/fileRepo.mjs';
import { validateSkillZip } from '/data/ai-workbench/server/lib/zip.mjs';
import { readFileSync } from 'node:fs';

const ZIP_PATH = process.argv[2] || '/data/ai-workbench/tmp-upload/fiscal-health-report.zip';
const CASE_TITLE = '财税体检——客户风险提示报告';
const SHI_UNION = 'cUzNv40hn77peRiPu6KM7PQiEiE';
const SHI_NAME = '时海龙';
const CARD_IDS = ['SC-W43-07', 'SC-W43-08', 'SC-W43-09'];

/** ISO 周次键，与 src/service/sceneBoard.ts isoWeekKey 逐行等价 */
function isoWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
/** 与现数据同构的时间串：YYYY-MM-DD HH:mm（后台 now() 同款格式，真实今天） */
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

if (!process.env.DATABASE_URL) {
  console.error('!! 缺少 DATABASE_URL（必须来自 systemd 环境），拒绝回退文件影子库，退出');
  process.exit(1);
}

/* ---- zip 预校验（与服务端上传同规则，缺 SKILL.md 直接退出） ---- */
const zipBuf = readFileSync(ZIP_PATH);
const zipCheck = validateSkillZip(zipBuf);
if (!zipCheck.ok) {
  console.error(`!! zip 缺少必含文件：${zipCheck.missing.join('、')}，退出`);
  process.exit(1);
}
console.log(`zip 预校验通过：${zipCheck.entries.length} 个条目，${kb(zipBuf.length)}`);

const store = createStateStore({ DATABASE_URL: process.env.DATABASE_URL });
await store.init();
if (store.name !== 'pg') {
  console.error(`!! 存储驱动不是 pg（${store.name}），有走影子库风险，退出`);
  process.exit(1);
}

const { data, version } = await store.read();
if (!data) { console.error('!! app_state 为空，退出'); process.exit(1); }
const cases = data.cases ?? [];
const cardsAll = data.sceneCards ?? [];

/* ---- 幂等守卫 ---- */
if (cases.some((c) => !c.is_deleted && c.title === CASE_TITLE)) {
  console.log('SKIP 案例已存在（标题命中），视为已执行');
  await store.close();
  process.exit(0);
}
const haveIds = new Set(cardsAll.map((s) => s.id));
if (CARD_IDS.some((id) => haveIds.has(id))) {
  console.log(`SKIP 场景卡已存在（${CARD_IDS.filter((id) => haveIds.has(id)).join(',')}），不重复创建/让位`);
  await store.close();
  process.exit(0);
}

const at = stamp();
const week = isoWeekKey();
const caseId = `CS${Date.now()}`;

/* ---- 1. Skill 包落文件库（CASE_SKILL 公开可下载，url 无需短签名） ---- */
const repo = createFileRepository({ DATABASE_URL: process.env.DATABASE_URL });
await repo.init();
if (repo.name !== 'pg') {
  console.error(`!! 文件驱动不是 pg（${repo.name}），退出`);
  process.exit(1);
}
const objKey = makeObjectKey('CASE_SKILL', 'zip');
const fmeta = newFileMeta({
  bizType: 'CASE_SKILL', bizId: caseId, name: '财税体检报告.zip', ext: 'zip',
  size: zipBuf.length, driver: repo.name, objectKey: objKey, uploadedBy: SHI_NAME,
});
fmeta.zip_checked = true;
fmeta.zip_valid = true;
await repo.writeMeta(fmeta);   // 顺序铁律：先元数据后内容
await repo.put(objKey, zipBuf);
await repo.close();
console.log(`Skill 包已落文件库：${fmeta.id}（${kb(zipBuf.length)}，by ${SHI_NAME}）`);

/* ---- 2. 新案例（字段口径见交付说明；visible_subjects 缺省 = 全员可见） ---- */
const newCase = {
  id: caseId,
  track: '客户赋能',
  title: CASE_TITLE,
  summary: '把客户的账套、申报表、发票明细，变成一份能当面给老板看的《财税体检·风险提示报告》——单文件 HTML、A4 可直接打印。风险怎么讲、金额怎么算、哪些话不能说，全部写成硬规则，装上就能用。',
  pain_point: '给客户做风险提示，老难题有三个：① 报告怎么写都不像样——满纸术语老板看不懂；敢下「存在偷税」的结论，出具方先把自己赔进去。② 风险金额靠手算——罚款倍数、滞纳金天数一错就是十倍级误导，还没法向老板复算。③ 自家账务的不规范处写不写、怎么写全靠个人把握，写错了等于自曝。做一次全面梳理要一周，换个人下次又从零开始。',
  input: '客户账套资料：科目余额表、明细账、财务报表（资产负债表/利润表）、增值税与企业所得税申报表、工资表、进销项发票清单；辅以工商登记信息。给 ★ 的 4 项（科目余额表 / 利润表 / 增值税申报表 / 工资表）即可出首版，资料不全不构成不分析的理由。',
  prompt: '你是资深财税顾问，擅长把企业账套资料整理成给老板看的《财税体检·风险提示报告》。我会提供客户的科目余额表、申报表、工资表、发票清单等资料，请按固定结构输出：① 资料清点回执（✓/✗，缺项不影响分析、对应结论降级）；② 企业基本信息 15 项（缺数据保留字段名并标「需贵司补充提供」）；③ 总体评估（增值税合规 / 企业所得税合规 / 发票与成本凭证 / 社保与个税四维健康度）；④ 每条风险按「现象→白话解释→风险性质→潜在风险值（四列表+可复算推导行）→法规依据」五段式撰写；⑤ 只列风险与风险值、绝不下结论。纪律：罚款倍数分档（征管法 63 条 0.5–5 倍 / 69 条 0.5–3 倍），滞纳金 0.5‰/日；金额一律脚本计算、可复算；不可量化的给「—」并写明原因；对外化红线词（规则库条目数 / 数据商品牌名 / 媒体来源 / 内部科目编号）零出现。',
  output: '一份自包含单文件 HTML《财税体检·风险提示报告》：封面 + 报告说明 + 企业基本信息（15 项）+ 总体评估（四维健康度雷达图）+ 核查范围与覆盖 + 风险事项明细（五段式）+ 附录，A4 可直接打印 PDF。',
  acceptance: [
    '报告为单文件 HTML、无外部依赖、无 script，A4 打印章节不错页',
    '每条风险按「现象→白话解释→风险性质→潜在风险值（四列表+推导）→法规依据」五段式呈现，金额可复算',
    '只列风险与风险值、绝不下结论；对外化红线零命中（规则库条目数 / 数据商品牌名 / 媒体来源 / 内部科目编号）',
    '企业基本信息 15 字段齐备，缺数据项保留字段名并标「需贵司补充提供」',
  ],
  level: '骨干层',
  tags: ['财税体检', '风险提示', '客户交付'],
  author_union_id: SHI_UNION,
  author_name: SHI_NAME,
  like_count: 0, view_count: 0, reuse_count: 0,
  duration: '约 60 分钟',
  cover: '🩺',
  status: '已发布',
  visible_subjects: [],
  created_at: at,
  skill_packages: [{
    id: `SK${Date.now()}`,
    type: 'UPLOAD',
    name: '财税体检报告',
    version: '1.4.3',
    note: '装上后在对话中说「财税体检」并提供客户资料（直接拖 Excel 或给目录路径）即可；零资料时会先列出资料清单，★4 项即可出首版',
    file_name: '财税体检报告.zip',
    file_size: kb(zipBuf.length),
    url: `/api/files/${fmeta.id}`,
  }],
  attachments: [],
  sort: cases.reduce((m, c) => Math.max(m, typeof c.sort === 'number' ? c.sort : -1), -1) + 1,
};

/* ---- 3. 三张 W43 卡（第一行；口径：≤40 字 summary / ≤300 字 content） ---- */
const cards = [
  {
    id: 'SC-W43-07',
    title: '体检报告怎么让老板看得懂：先给风险值，再讲为什么',
    summary: '每条风险五段讲，金额必须带可复算的推导行',
    content: '给老板看的体检报告，重证据、重推导。每条风险按「现象→白话解释→风险性质→潜在风险值→法规依据」五段写，金额必须附一行可复算的推导——把「749.7 万怎么来的」写清楚，比写十页术语都管用。老板不见计算过程不信，报告的可信度是靠一行行算式攒出来的。',
    emoji: '🩺',
    tags: ['财税体检', '报告写法'],
  },
  {
    id: 'SC-W43-08',
    title: '对外报告三条铁律：只列风险、不下结论、不曝家底',
    summary: '只写「若被认定…则…」，不写「存在偷税」',
    content: '对外交付的报告，话怎么说决定能不能出手：① 只列风险与风险值，绝不下「存在偷税」这类结论，统一用「若被认定…则…」；② 规则库条目数、数据商品牌名、媒体来源、内部科目编号一律不出现；③ 自家账务的不规范处不写进报告——那是出具方自己的事，老板看不懂也无从行动。红线写进 skill，比每次靠人记靠谱。',
    emoji: '🛡️',
    tags: ['财税体检', '合规红线'],
  },
  {
    id: 'SC-W43-09',
    title: '一张四列表算清风险金额：补税、罚款、滞纳金各归各',
    summary: '罚款倍数分档别混，滞纳金 0.5‰/日',
    content: '风险金额用四列表呈现：补税/费、罚款、滞纳金各归各，再附一行推导。两个最易错的点：罚款倍数分档——偷税（征管法 63 条）0.5–5 倍、应扣未扣（69 条）0.5–3 倍，混用就错；滞纳金 0.5‰/日，写成 0.005 结果放大十倍。算不出的给「—」并写明原因，绝不拍数字。',
    emoji: '🧮',
    tags: ['财税体检', '风险测算'],
  },
].map((c, i) => ({
  ...c,
  track: '客户赋能',
  status: 'PUBLISHED',
  week,
  view_count: 0,
  published_at: at,
  created_by: SHI_NAME,
  created_at: at,
  source_case_id: caseId,
  sort: i,
}));

/* ---- 4. 让位：现有全部未删卡 sort +3（保持各行相对顺序，新行占 0/1/2） ---- */
const shifted = cardsAll.filter((s) => !s.is_deleted && typeof s.sort === 'number').length;

const next = {
  ...data,
  cases: [...cases, newCase],
  sceneCards: [
    ...cards,
    ...cardsAll.map((s) => (!s.is_deleted && typeof s.sort === 'number' ? { ...s, sort: s.sort + 3 } : s)),
  ],
};

const res = await store.write(next, version, '赵冰艳');
if (!res.ok) {
  console.error(`!! 乐观锁冲突（version ${version} → 当前 ${res.current?.version}），未写入，重跑即可`);
  await store.close();
  process.exit(2);
}

/* ---- read-back 验证 ---- */
const after = await store.read();
const bc = (after.data.cases ?? []).find((c) => c.id === caseId);
const back = (after.data.sceneCards ?? []).filter((s) => s.source_case_id === caseId && !s.is_deleted);
const okCase = !!bc && bc.status === '已发布' && bc.author_union_id === SHI_UNION
  && bc.summary && bc.pain_point && bc.input && bc.prompt && bc.output
  && bc.acceptance.length === 4 && bc.duration && bc.skill_packages.length === 1;
const okCards = back.length === 3 && back.every((s) => s.status === 'PUBLISHED' && s.week === week && s.sort >= 0 && s.sort <= 2);
const others = (after.data.sceneCards ?? []).filter((s) => s.source_case_id !== caseId && !s.is_deleted && typeof s.sort === 'number');
const okShift = others.every((s) => s.sort >= 3);
console.log(`OK version ${version} -> ${res.version}`);
console.log(`OK 案例「${CASE_TITLE}」${bc?.id} sort=${bc?.sort} status=${bc?.status} author=${bc?.author_name} Skill=${bc?.skill_packages[0]?.name}`);
back.sort((a, b) => a.sort - b.sort).forEach((s) => console.log(`   - [${s.emoji}] sort=${s.sort} ${s.title}`));
console.log(`OK 让位：${shifted} 张旧卡 sort +3（最小值现为 ${Math.min(...others.map((s) => s.sort))}）`);
if (!okCase || !okCards || !okShift) {
  console.error(`!! read-back 异常 okCase=${okCase} okCards=${okCards} okShift=${okShift}`);
  await store.close();
  process.exit(3);
}
await store.close();
