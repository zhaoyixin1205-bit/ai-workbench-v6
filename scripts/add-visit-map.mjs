/**
 * 一次性脚本：给已有案例「代账客户拜访地图」补 3 张场景卡，排到「本周高频场景卡」第一行。
 *
 * 背景（2026-10-13 组织者需求 + 线上实测）：
 *   案例 CS1791891128624「代账客户拜访地图」（王磊 / 销售提效）组织者已建好，
 *   但库里没有任何关联场景卡 → 首页「本周高频场景卡」没有这一行。
 *   本脚本补 3 张本周（真实今天 ISO 周）PUBLISHED 卡，sort=-1 排到第一行
 *   （现有卡最小 sort=0；bandSort 取组内最小 sort，-1 < 0 稳第一）。
 *   顺带把案例从「草稿」改「已发布」（员工点进行情页才是正式态；后台可改回）。
 *
 * 铁律：
 *  - DATABASE_URL 必须来自 systemd 环境（生产 PG）；缺失直接退出，绝不回退文件影子库；
 *  - 写入走 PgStateStore 乐观锁（baseVersion 不一致即失败，不静默覆盖）；
 *  - 幂等：卡已存在则跳过；案例不存在才新建（兜底）；
 *  - 执行前需先 systemctl stop ai-workbench（服务内存缓存不感知外部写入）。
 */

import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

const CASE_TITLE = '代账客户拜访地图';
const CASE_ID = 'CS1791891128624';
const AUTHOR_NAME = '王磊';
const TRACK = '销售提效';

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

const existing = (data.cases ?? []).find((c) => c.id === CASE_ID)
  ?? (data.cases ?? []).find((c) => c.title === CASE_TITLE);
if (!existing) { console.error(`!! 案例「${CASE_TITLE}」(${CASE_ID}) 不在库中，退出`); process.exit(1); }
const caseId = existing.id;

/* ---- 幂等：3 张卡都已在 → 什么都不做 ---- */
const mine = (data.sceneCards ?? []).filter((s) => s.source_case_id === caseId && !s.is_deleted);
if (mine.length >= 3) {
  console.log(`SKIP 案例已有 ${mine.length} 张关联场景卡，无需重复创建`);
  await store.close();
  process.exit(0);
}

const at = stamp();
const week = isoWeekKey();

/* ---- 3 张场景卡（与后台新建同构；id 沿用 SC-W42-xx 序列；sort=-1 保第一行） ---- */
const cards = [
  {
    id: 'SC-W42-01',
    title: '拜访前 10 分钟：先摸清客户底细再上门',
    summary: '别空着手去：账情、工商变更、上次遗留事项先过一遍',
    content: '拜访不是碰运气。出发前花 10 分钟过三件事：①客户近 3 个月账情，有没有逾期未申报、有没有突然的业务增量；②工商和税务有没有刚发生的变更；③上次沟通答应的事办了没有。带着这三样进门，每个问题都踩在点上，客户也觉得“他懂我”。',
    track: TRACK,
    emoji: '\u{1F9ED}',
    status: 'PUBLISHED',
    tags: ['客户拜访'],
    week,
    view_count: 0,
    published_at: at,
    created_by: AUTHOR_NAME,
    created_at: at,
    source_case_id: caseId,
    sort: -1,
  },
  {
    id: 'SC-W42-02',
    title: '拜访中：先给「账单健康报告」，再谈续费',
    summary: '开口先讲你替他发现了什么，而不是问今年还续不续',
    content: '一进门别急着谈续费。先把一份「账单健康报告」放到桌上：哪些科目有异常、哪些优惠还没享受到、同规模同行的对标情况。先给价值，再谈合作——客户续费的理由从来不是价格，是“这个人真的在帮我看账”。',
    track: TRACK,
    emoji: '\u{1F4BC}',
    status: 'PUBLISHED',
    tags: ['客户拜访', '续费'],
    week,
    view_count: 0,
    published_at: at,
    created_by: AUTHOR_NAME,
    created_at: at,
    source_case_id: caseId,
    sort: -1,
  },
  {
    id: 'SC-W42-03',
    title: '拜访后 48 小时：把口头承诺落成书面跟进',
    summary: '聊得再好也会凉：约定事项、责任人、下次时间当场写下来',
    content: '拜访结束不等于跟进开始。48 小时内把三件事书面发给客户：本次约定的调整事项、双方责任人、下次沟通时间。口头承诺不落纸，一周后就只剩“那天聊得挺好”。写下来，这次拜访才算闭环。',
    track: TRACK,
    emoji: '\u{1F4C5}',
    status: 'PUBLISHED',
    tags: ['客户拜访'],
    week,
    view_count: 0,
    published_at: at,
    created_by: AUTHOR_NAME,
    created_at: at,
    source_case_id: caseId,
    sort: -1,
  },
];

/* 幂等补齐：已有部分卡时只补缺的（按 id 去重） */
const haveIds = new Set(mine.map((s) => s.id));
const adding = cards.filter((c) => !haveIds.has(c.id));

const next = {
  ...data,
  /* 案例：草稿 → 已发布（员工点进行情页是正式态；后台可改回） */
  cases: (data.cases ?? []).map((c) => (c.id === caseId && c.status !== '已发布' ? { ...c, status: '已发布' } : c)),
  sceneCards: [...adding, ...(data.sceneCards ?? [])],
};

const res = await store.write(next, version, '赵冰艳');
if (!res.ok) {
  console.error(`!! 乐观锁冲突（version ${version} 已被改），未写入，重跑即可`);
  await store.close();
  process.exit(2);
}

/* ---- read-back 验证 ---- */
const after = await store.read();
const c2 = (after.data.cases ?? []).find((c) => c.id === caseId);
const mine2 = (after.data.sceneCards ?? []).filter((s) => s.source_case_id === caseId);
const okCase = c2 && c2.status === '已发布';
const okCards = mine2.length === 3 && mine2.every((s) => s.status === 'PUBLISHED' && s.week === week && s.sort === -1);
console.log(`OK version ${version} -> ${res.version}`);
console.log(`OK 案例「${c2?.title}」(${caseId}) 状态 -> ${c2?.status}（原 ${existing.status}）`);
console.log(`OK 场景卡 ${mine2.length} 张 week=${week} sort=-1：`);
mine2.forEach((s) => console.log(`   - [${s.emoji}] ${s.title}`));
if (!okCase || !okCards) {
  console.error(`!! read-back 异常 case=${okCase} cards=${okCards}`);
  await store.close();
  process.exit(3);
}
await store.close();
