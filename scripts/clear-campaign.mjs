#!/usr/bin/env node
/**
 * 清空「进行中届次」及其名下业务数据（V7.1）
 * =================================================================
 * 背景：V7.1 上一轮清的是 25 个业务集合，但保留了届次配置骨架
 *       （campaigns 2 条：C2026Q4 进行中 / C2026Q3 已结束）。
 *       用户本轮要求：「针对已经进行中的届次也进行数据清除，
 *       待组织者自行创建届次」——即届次本身也交给组织者在系统里创建。
 *
 * 做法（只做减法，不碰真实资产）：
 *   - campaigns          → 清空（届次由组织者在「届次与配置」页创建）
 *   - 届次名下业务数据   → 全部清零（提报/评分/积分/资产/榜单/社区/预约等）
 *   - 解除届次绑定       → assignmentTypes / boardConfigs 的 campaign_id 置空
 *                          （否则会指向一个已不存在的届次）
 *   - 保留               → users / depts / tags / cases / topics /
 *                          scoreCards / shopItems / announcements /
 *                          submitFlowRules（配置骨架与真实内容资产不动）
 *
 * 崩溃防线：campaigns 清空后 store 的 campaign 派生必须有兜底。
 *          已在 src/mock/types.ts 加 EMPTY_CAMPAIGN、
 *          在 store.tsx 的 campaign 派生最后一步返回它，
 *          并在页面用 hasCampaign 渲染「尚未创建届次」空态。
 *          没有这个兜底，11 个组件读 campaign.id 会整页白屏。
 *
 * 用法：
 *   node scripts/clear-campaign.mjs            # 只打印计划（干跑）
 *   node scripts/clear-campaign.mjs --apply    # 写本机 server/data/state.json
 *   node scripts/clear-campaign.mjs --push     # PUT 到线上（SITE 环境变量可覆盖）
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const STATE_FILE = path.join(ROOT, 'server', 'data', 'state.json');
const SITE = process.env.SITE || 'https://aihrbp.yunzhangfang.com';
const BY = '清空进行中届次';

/** 届次名下业务数据：清空（与 build-real-state.mjs 的 CLEARED 口径一致） */
const CLEARED = [
  'bounties', 'periods', 'submits', 'scoreResults', 'experts', 'schedules',
  'bookings', 'reviews', 'assetApplies', 'assets', 'pointRecords', 'shopOrders',
  'posts', 'comments', 'wbUsage', 'topicSelections', 'importJobs', 'importJobItems',
  'submitFlowLogs', 'reviewOverrides', 'sceneCards', 'attachmentFiles', 'scheduleRequests',
];

/** 保留不动：配置骨架 + 真实内容资产 */
const KEEP = [
  'users', 'depts', 'tags', 'cases', 'topics',
  'scoreCards', 'shopItems', 'announcements', 'submitFlowRules', 'boards', 'assignmentTypes', 'boardConfigs',
];

const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
const prev = raw.data ?? raw;
const before = { ...prev };

const next = { ...prev };

// 1) 届次本身清空
const removed = (prev.campaigns ?? []).map((c) => `${c.id} ${c.name}（${c.status}）`);
next.campaigns = [];

// 2) 届次名下业务数据清零
const clearedStat = [];
for (const k of CLEARED) {
  const n = (prev[k] ?? []).length;
  if (n) clearedStat.push(`${k} ${n}→0`);
  next[k] = [];
}

// 3) 解除届次绑定（作业类型 / 看板配置原本挂在 C2026Q4）
let unbound = 0;
if (Array.isArray(next.assignmentTypes)) {
  next.assignmentTypes = next.assignmentTypes.map((x) => (x.campaign_id ? { ...x, campaign_id: '' } : x));
  unbound += next.assignmentTypes.filter((x) => x.campaign_id === '').length;
}
if (Array.isArray(next.boardConfigs)) {
  next.boardConfigs = next.boardConfigs.map((x) => (x.campaign_id ? { ...x, campaign_id: '' } : x));
  unbound += next.boardConfigs.filter((x) => x.campaign_id === '').length;
}

// 4) 留痕：让组织者打开系统就能看到是谁清的
next.auditLogs = [
  {
    id: `A${Date.now()}`,
    operator: '赵冰艳',
    action: '清空届次',
    target: '全部届次',
    detail: removed.length
      ? `移除 ${removed.length} 个届次：${removed.join('、')}；业务数据清零；作业类型/看板配置解除届次绑定 ${unbound} 条。届次由组织者在「届次与配置」页自行创建。`
      : '届次本就为空，业务数据复核清零。',
    ip: '10.12.3.11',
    created_at: new Date().toISOString().slice(0, 10),
  },
  ...(prev.auditLogs ?? []),
].slice(0, 200);

console.log('=== 清空计划 ===');
console.log(`移除届次  ${removed.length ? removed.join('\n          ') : '（无）'}`);
console.log(`清空集合  ${clearedStat.length ? clearedStat.join(' / ') : '（本就全为 0）'}`);
console.log(`解除绑定  ${unbound} 条（assignmentTypes / boardConfigs 的 campaign_id 置空）`);
console.log(`保留      ${KEEP.map((k) => `${k} ${(next[k] ?? []).length}`).join(' / ')}`);

/* ---------- 写本机 ---------- */
if (process.argv.includes('--apply')) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  if (existsSync(STATE_FILE)) copyFileSync(STATE_FILE, `${STATE_FILE}.bak-${stamp}`);
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ data: next, version: (raw.version ?? 0) + 1, updated_by: BY, updated_at: new Date().toISOString() }, null, 2),
    'utf8'
  );
  console.log(`✅ 已写入本机 ${STATE_FILE}（旧版本备份 .bak-${stamp}）`);
}

/* ---------- 推线上（409 冲突自动重试 3 次） ---------- */
if (process.argv.includes('--push')) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const cur = await fetch(`${SITE}/api/state/version`).then((r) => r.json()).catch(() => null);
    const baseVersion = cur?.version ?? 0;
    const res = await fetch(`${SITE}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: next, baseVersion, by: BY }),
    });
    const j = await res.json();
    if (j.ok) {
      console.log(`✅ 线上推送成功 ${SITE} -> version ${j.version}`);
      break;
    }
    console.log(`⚠️ 第 ${attempt} 次推送冲突（线上 version=${baseVersion}，${j.error ?? ''}）`);
    if (attempt === 3) {
      console.log('❌ 三次均冲突，已放弃（未做任何强覆盖）。等线上无人操作时重跑 --push');
    } else {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
