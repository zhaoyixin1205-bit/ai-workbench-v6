#!/usr/bin/env node
/**
 * V8-10.07 补：公司悬赏归属修正（2026-10-07）
 * =================================================================
 * 现象：悬赏大厅 11 条「公司」悬赏没有「认领」按钮。
 * 根因：认领条件 `status === 'PUBLISHED' && owner_union_id !== me.union_id`，
 *       而脚本把 owner_name 写成「公司」、owner_union_id 仍落为组织者本人 unionId，
 *       默认登录身份即组织者 → 11 条全被判定为「我发布的」，按钮不渲染且无提示。
 *
 * 修法（方案 A）：owner_union_id 改为公司虚拟主体 `COMPANY`（非任何自然人），
 *   owner_name 保持「公司」→ 所有成员（含组织者本人）均可认领。
 *   配套代码已同步：后台审核可见性放行 COMPANY；大厅增加不可认领原因提示。
 *
 * 用法：
 *   node scripts/fix-bounty-owner-company.mjs            # 干跑（读线上，只打印计划）
 *   node scripts/fix-bounty-owner-company.mjs --apply    # 写本机 server/data/state.json（先备份）
 *   node scripts/fix-bounty-owner-company.mjs --push     # PUT 线上（409 自动重试 3 次）
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const STATE_FILE = path.join(ROOT, 'server', 'data', 'state.json');
const SITE = process.env.SITE || 'https://aihrbp.yunzhangfang.com';
const BY = 'V8-10.07 悬赏归属修正';
const COMPANY_UNION_ID = 'COMPANY';

const APPLY = process.argv.includes('--apply');
const PUSH = process.argv.includes('--push');

/** 线上 PG 为真数据源，一律以线上为准 */
const online = await fetch(`${SITE}/api/state`).then((r) => r.json());
const data = online.data ?? online;
const me = (data.users ?? []).find((u) => (u.roles ?? []).includes('ORGANIZER'));

/** 只命中「展示名为公司」的悬赏，避免误改组织者以个人名义发布的悬赏 */
const targets = (data.bounties ?? []).filter((b) => b.owner_name === '公司');
const personal = (data.bounties ?? []).filter(
  (b) => b.owner_union_id === me?.union_id && b.owner_name !== '公司'
);
if (personal.length) {
  console.log(`⚠ 另有 ${personal.length} 条组织者以个人名义发布的悬赏，保持不动：${personal.map((b) => b.id).join('、')}`);
}

console.log(`— 悬赏归属修正（线上 version ${online.version}）—`);
console.log(`组织者：${me ? me.name + ' / ' + me.union_id : '未找到'}`);
console.log(`命中 ${targets.length} 条：owner_union_id ${[...new Set(targets.map((b) => b.owner_union_id))].join('、')} → ${COMPANY_UNION_ID}`);
for (const b of targets) console.log(`  ${b.id} ${b.title.slice(0, 24)} · ${b.status} · ${b.points} 分 · 截止 ${b.due_date}`);

if (!APPLY && !PUSH) {
  console.log('\n[干跑] 未写入。--apply 写本机；--push 同步线上。');
  process.exit(0);
}

const nextBounties = (data.bounties ?? []).map((b) =>
  targets.some((t) => t.id === b.id)
    ? { ...b, owner_union_id: COMPANY_UNION_ID, owner_name: '公司' }
    : b
);
const next = { ...data, bounties: nextBounties };

if (APPLY) {
  const bak = `${STATE_FILE}.bak-${Date.now()}`;
  const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  copyFileSync(STATE_FILE, bak);
  writeFileSync(STATE_FILE, JSON.stringify({ ...raw, data: next }, null, 2), 'utf8');
  console.log(`\n已写本机：${STATE_FILE}（备份 ${bak}）`);
}

if (!PUSH) process.exit(0);

for (let attempt = 1; attempt <= 3; attempt += 1) {
  const cur = await fetch(`${SITE}/api/state`).then((r) => r.json());
  const res = await fetch(`${SITE}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: next, baseVersion: cur.version, updated_by: BY }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`✅ 线上已更新 → version ${body.version ?? '?'}（第 ${attempt} 次尝试）`);
    process.exit(0);
  }
  console.log(`第 ${attempt} 次失败 ${res.status}：${body.message ?? JSON.stringify(body).slice(0, 200)}`);
  await new Promise((r) => setTimeout(r, 1500));
}
console.log('❌ 线上同步失败');
process.exit(1);
