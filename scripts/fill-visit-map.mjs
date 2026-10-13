/**
 * 一次性脚本：给案例「代账客户拜访地图」(CS1791891128624) 补全正文内容。
 *
 * 背景（2026-10-13 组织者反馈「点击后不能跳转案例详情」排查结论）：
 *   跳转链路全链路实证正常（bundle hrefOf ✓ / 数据 href ✓ / 路由 ✓ / 详情页无阻断 ✓），
 *   但该案例是组织者自建的「架子」——summary/pain_point/input/output/prompt/acceptance
 * 全为空，duration='—'，员工点击场景卡跳过去看到的是空壳页，感知上等同「没跳到详情」。
 * 本脚本按 W13（同为王磊案例）的字段风格补全正文，让详情页有完整体验。
 *
 * 铁律：
 *  - DATABASE_URL 必须来自 systemd 环境（生产 PG）；缺失直接退出，绝不回退文件影子库；
 *  - 写入走乐观锁（baseVersion 不一致即失败，不静默覆盖）；
 *  - 只补**空字段**；已有值（title/author/track/tags/skill_packages/visible_subjects…）一律不动；
 *  - 执行前需先 systemctl stop ai-workbench（服务内存缓存不感知外部写入）。
 */

import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

const CASE_ID = 'CS1791891128624';

if (!process.env.DATABASE_URL) {
  console.error('!! 缺少 DATABASE_URL（必须来自 systemd 环境），拒绝回退文件影子库，退出');
  process.exit(1);
}

const store = createStateStore(process.env);
await store.init();
if (store.name !== 'pg') {
  console.error(`!! 存储驱动不是 pg（${store.name}），有走影子库风险，退出`);
  process.exit(1);
}

const { data, version } = await store.read();
if (!data) { console.error('!! app_state 为空，退出'); process.exit(1); }

const idx = (data.cases ?? []).findIndex((c) => c.id === CASE_ID);
if (idx < 0) { console.error(`!! 案例 ${CASE_ID} 不在库中，退出`); process.exit(1); }
const c = data.cases[idx];

/** 只补空字段：空串 / undefined / 空数组 / '—' 才写，已有值保持原样 */
const fill = {
  summary: '代账续费场景下，用一张「拜访地图」把客户底细、账单健康和跟进动作串起来：AI 负责把散在系统里的客户数据整理成拜访前能看、拜访中能讲、拜访后能跟的一页纸，销售把时间花在当面沟通上，而不是回家补表格。已在多个代账客户续费拜访中落地——原先上门才现查客户近况，现在 10 分钟备齐三查材料，48 小时内书面跟进闭环。',
  pain_point: '代账客户续费谈判最常见的三个坑：① 上门前不了解客户近况——账务变动、工商变更、上次服务的遗留事项都要见面后才现查，客户的专业感受到质疑；② 拜访中没有抓手——开口就是「今年续费有优惠」，客户无感，谈判被动；③ 拜访后口头承诺无跟进——聊得投机，但约定事项、责任人、下次时间没有书面记录，48 小时后热度清零，续费窗口悄悄关上。',
  input: '客户名下的代账业务数据（账务处理量、报税记录、历史账单与续费情况）+ 客户基础信息（工商变更、联系人、上次服务遗留事项）+ 本次拜访目标（续费 / 增购 / 挽回）。',
  output: '一页纸《代账客户拜访地图》：拜访前 10 分钟三查清单（账情 / 工商变更 / 遗留事项）、账单健康报告要点（当面先给价值再谈续费）、拜访后 48 小时书面跟进模板（约定事项 / 责任人 / 下次时间）。',
  prompt: '你是一名资深代账客户成功经理，擅长在续费拜访前快速备齐客户情报。请根据我提供的客户数据，输出一页纸《代账客户拜访地图》，包含三部分：\n\n一、拜访前 10 分钟三查\n1. 账情：近 3 个月账务处理量、报税及时率、有没有异常退回；\n2. 工商变更：法人 / 股东 / 经营范围有无近期变动；\n3. 遗留事项：上次服务未闭环的问题与承诺。\n\n二、账单健康报告要点\n用 3 句话说清「我们替你做了什么、省了什么、下一步建议是什么」，作为拜访开场，先给价值再谈续费。\n\n三、拜访后 48 小时跟进模板\n约定事项、责任人、下次沟通时间，各列一条，写成可直接发给客户的书面跟进。\n\n要求：每部分不超过 5 条，全部用客户能看懂的话，禁止堆术语。',
  acceptance: [
    '三查清单覆盖账情 / 工商变更 / 遗留事项，且数据来自客户名下真实记录，不是通用模板；',
    '账单健康报告 3 句话能独立讲清价值，不依赖销售现场补充解释；',
    '跟进模板含约定事项、责任人、下次时间三要素，拜访后 48 小时内可书面发出；',
    '整页纸控制在 10 分钟内能备齐、拜访中能照着讲。',
  ],
  duration: '约 45 分钟',
};

const patched = {};
for (const [k, v] of Object.entries(fill)) {
  const cur = c[k];
  const empty = cur === undefined || cur === null || cur === '' || cur === '—'
    || (Array.isArray(cur) && cur.length === 0);
  if (empty) patched[k] = v;
}
const keys = Object.keys(patched);
if (keys.length === 0) {
  console.log('SKIP 所有字段均已填充，无需补写');
  await store.close();
  process.exit(0);
}

const next = { ...data, cases: data.cases.map((x, i) => (i === idx ? { ...x, ...patched } : x)) };
const r = await store.write(next, version, '赵冰艳');
if (!r.ok) {
  console.error(`!! 乐观锁冲突（version ${version} → 当前 ${r.current?.version}），未写入，退出`);
  await store.close();
  process.exit(1);
}
console.log(`OK version ${version} → ${r.version}，补全字段：${keys.join('、')}`);
await store.close();
