#!/usr/bin/env node
/**
 * V8.2-10.07 需求 3 · 每周场景卡「重做」（2026-10-07 · 第二版）
 * =================================================================
 * 用户口径修正（2026-10-07 17:15）：
 *   「30 秒学一个知识点」= 融合一整个案例，
 *   不是把技能说明书拆成 8 个知识点碎片；并需链接至相关案例。
 *
 * 本脚本做两件事：
 *   ① 把第一版 8 张碎片卡（SC-W41-01 ~ 08）下线（status=OFFLINE，后台可重新发布，不软删）；
 *   ② 新增 3 张「一张卡 = 一个完整案例场景」的卡，全部 source_case_id = W10
 *      《恋爱式哄客销售技巧》（徐航 · 销售提效 · Season3 一等奖）。
 *
 * 单张卡写法（完整案例闭环，非说明书目录）：
 *   场景（客户原话）→ 判断（属于哪类阻力）→ 动作（怎么做）→ 结果/边界 → 照做
 *
 * 用法：
 *   node scripts/apply-v84.mjs                 # 干跑（打印计划 + 字数校验）
 *   node scripts/apply-v84.mjs --apply         # 写本机 server/data/state.json（先备份）
 *   node scripts/apply-v84.mjs --apply --push  # 写本机 + PUT 线上（409 自动重试 3 次）
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const STATE_FILE = path.join(ROOT, 'server', 'data', 'state.json');
const SITE = process.env.SITE || 'https://aihrbp.yunzhangfang.com';
const BY = 'V8.2-10.07 场景卡重做（融合完整案例）';
const TODAY = '2026-10-07';
const WEEK = '2026-W41';
const CREATED_BY = '赵冰艳';
const NOW = `${TODAY} 17:20`;

/** 关联案例：W10 恋爱式哄客销售技巧（徐航） */
const CASE_ID = 'W10';

const APPLY = process.argv.includes('--apply');
const PUSH = process.argv.includes('--push');

const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
const prev = raw.data ?? raw;
const next = structuredClone(prev);

const CASE = (prev.cases ?? []).find((c) => c.id === CASE_ID);
if (!CASE) {
  console.error(`❌ 案例 ${CASE_ID} 不存在，无法关联。请确认 state.json 的 cases。`);
  process.exit(1);
}

/* ================================================================
 * ① 下线：第一版 8 张碎片卡（说明书目录式，不符合「一个完整案例」口径）
 * ============================================================== */
const OFFLINE_IDS = ['SC-W41-01', 'SC-W41-02', 'SC-W41-03', 'SC-W41-04', 'SC-W41-05', 'SC-W41-06', 'SC-W41-07', 'SC-W41-08'];

/* ================================================================
 * ② 新增：3 张完整案例卡
 * ============================================================== */
const CARDS = [
  {
    id: 'SC-W41-11',
    emoji: '💞',
    title: '「我们再考虑考虑」：三句话把拒绝变下一步',
    summary: '客户没说出口的阻力先诊断再回应，别一上来就追问或让价',
    content: [
      '客户回「我们再考虑考虑」，多数人的第一反应是追问或让价——在《恋爱式哄客销售技巧》里，这叫还没听懂对方在顾虑什么就先表白。',
      '正确顺序四步：复述他的话 → 分类阻力（价值价格／风险信任／时机／权限流程／适配／信息理解／体验不满／沉默）→ 用一句澄清去验证 → 只回应最阻塞的那一类。',
      '例：客户真正担心的是上线周期拖累季度报税，那么回应的不是价格，而是「先跑 2 家试点、两周出结果、不达标不续费」。',
      '收尾只推进一小步并请求同意：周三我把试点范围发你确认，行就下周启动——他随时可以说不。',
    ].join('\n'),
    tags: ['恋爱式哄客', '异议处理', '同意式推进'],
  },
  {
    id: 'SC-W41-12',
    emoji: '💬',
    title: '客户说「太贵了」：先别降价，先重建价值链',
    summary: '价格异议多半不是价格问题，先路由到根因再决定怎么回应',
    content: [
      '报价后一句「太贵了」，直接降价会同时丢掉利润和信任。《恋爱式哄客销售技巧》把它当成关系里的一次考验：先搞清他真正在比对什么。',
      '用价值三问重排：为什么现在处理（不做已经发生的成本）／为什么需要解决（目标与能力缺口）／为什么选这个方案（与其他可行路径的差异）。',
      '证据要让客户自己能核验——同规模客户的耗时对比、政策原文、退费条款，数字一字不改；成本、限制和不适用的情况一起说，并留出「先不买」的出口。',
      '如果确实是预算天花板，就调方案或诚实淘汰，不靠假倒计时和假稀缺施压：一次虚假承诺，会把前面所有好感清零。',
    ].join('\n'),
    tags: ['恋爱式哄客', '价格异议', '诚信门'],
  },
  {
    id: 'SC-W41-13',
    emoji: '📵',
    title: '客户已读不回：不空手催促，带新价值再出现',
    summary: '沉默也是一类阻力，没有新价值时就不要发第二条消息',
    content: [
      '已读不回、回复越来越短，是最容易被误判的一类阻力——要么被当成没兴趣而放弃，要么被连环追问彻底消耗掉关系。',
      '《恋爱式哄客销售技巧》的处理和关系里的冷淡期一样：先判断是时机窗口没到，还是真的不适配。',
      '动作只有两个：一是带一个他此刻用得上的新价值（同行做法、政策变化、他提过的那个问题的解法）；二是约定明确的触发条件（「账期调整有结果我第一时间告诉你」）。',
      '两者都没有，就停止联系、等真实节点。每次触达都要让客户觉得「这条有用」，否则宁可不发。',
    ].join('\n'),
    tags: ['恋爱式哄客', '沉默客户', '关系节奏'],
  },
];

/* ---------------- 计划输出 + 字数校验（对齐后台表单上限） ---------------- */
const LIM = { title: 40, summary: 60, content: 300 };
console.log('=== V8.2-10.07 需求 3 · 场景卡重做（融合完整案例） ===');
console.log(`关联案例：${CASE_ID}《${CASE.title}》· ${CASE.author_name} · ${CASE.track}`);
console.log(`下线第一版碎片卡：${OFFLINE_IDS.join('、')}\n`);

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
const toOffline = (next.sceneCards ?? []).filter((s) => OFFLINE_IDS.includes(s.id) && s.status !== 'OFFLINE');
console.log(`\n合计：新增 ${toAdd.length} 张｜下线 ${toOffline.length} 张`);
console.log(`统一属性：track=销售提效｜week=${WEEK}｜status=PUBLISHED｜source_case_id=${CASE_ID}｜created_by=${CREATED_BY}`);

if (!APPLY) {
  console.log('\n[干跑] 未写入。加 --apply 写本机，--apply --push 同步线上。');
  process.exit(0);
}

/* ---------------- 落库 ---------------- */
next.sceneCards = (next.sceneCards ?? []).map((s) => (
  OFFLINE_IDS.includes(s.id) && s.status !== 'OFFLINE'
    ? { ...s, status: 'OFFLINE', offline_at: NOW }
    : s
));

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
    /** 首页胶囊点击 → /cases/W10 案例详情 */
    source_case_id: CASE_ID,
  })),
  ...next.sceneCards,
];

const bak = `${STATE_FILE}.bak-${Date.now()}`;
copyFileSync(STATE_FILE, bak);
writeFileSync(STATE_FILE, JSON.stringify({ ...raw, data: next }, null, 2), 'utf8');
console.log(`\n已写本机：${STATE_FILE}（备份 ${bak}）`);
console.log(`本机 sceneCards = ${next.sceneCards.length}｜已发布 = ${next.sceneCards.filter((s) => s.status === 'PUBLISHED' && !s.is_deleted).length}`);

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
