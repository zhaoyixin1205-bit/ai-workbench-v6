/**
 * 一次性数据修复：AI 评分总分改百分制（V10.15）
 *
 * 背景：服务端 composeTotal 加权分支漏了「按维度满分归一化」，导致维度满分
 * 非 100 的评分卡（v4：30/30/25/15）总分被算成加权小分——线上两条 AI 记录
 * total=24.5/21.9，实际应为 92.0/81.0（dim_scores 本身就是对的：29/30 等）。
 *
 * 本脚本用修复后的 composeTotal 对每条 source=AI 记录重算 total，
 * 同步更新 scoreResults.total / reason 文本里的「总分 X」 / submits.ai_score。
 * 幂等：重算值与现值一致则 SKIP。
 */
import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';
import { composeTotal } from '/data/ai-workbench/server/lib/aiScorer.mjs';

const store = createStateStore(process.env);
await store.init();

const cur = await store.read();
const data = cur.data;
const version = cur.version;

const aiResults = (data.scoreResults ?? []).filter((r) => r.source === 'AI');
if (aiResults.length === 0) {
  console.log('没有 source=AI 的评分记录，无需修复');
  process.exit(0);
}

const round1 = (n) => Math.round(n * 10) / 10;
const patches = [];
for (const r of aiResults) {
  const card = (data.scoreCards ?? []).find(
    (c) => !c.is_deleted && c.version === r.card_version,
  ) ?? (data.scoreCards ?? []).find((c) => !c.is_deleted && c.status === '启用');
  if (!card) {
    console.log(`SKIP ${r.target_id}：找不到评分卡（card_version=${r.card_version}）`);
    continue;
  }
  const nextTotal = composeTotal(r.dim_scores ?? {}, card);
  if (round1(nextTotal) === round1(r.total)) {
    console.log(`SKIP ${r.target_id}：total 已正确（${r.total}）`);
    continue;
  }
  const reason = String(r.reason ?? '').replace(
    new RegExp(`总分\\s*${r.total}(?=\\s|$)`),
    `总分 ${round1(nextTotal)}`,
  );
  patches.push({
    target_id: r.target_id,
    from: r.total,
    to: round1(nextTotal),
    card: `${card.name} ${card.version}`,
    dim_scores: r.dim_scores,
    reason,
  });
  console.log(`FIX ${r.target_id}（${card.name} ${card.version}）：total ${r.total} -> ${round1(nextTotal)}，dim=${JSON.stringify(r.dim_scores)}`);
}

if (patches.length === 0) {
  console.log('全部记录已是百分制，无需修复');
  process.exit(0);
}

const byTarget = new Map(patches.map((p) => [p.target_id, p]));
const nextResults = (data.scoreResults ?? []).map((r) => {
  const p = byTarget.get(r.target_id);
  if (!p || r.source !== 'AI') return r;
  return { ...r, total: p.to, reason: p.reason };
});
const nextSubmits = (data.submits ?? []).map((x) => {
  const p = byTarget.get(x.id);
  return p ? { ...x, ai_score: p.to } : x;
});

await store.write({ ...data, scoreResults: nextResults, submits: nextSubmits }, version, '赵冰艳');

console.log(`\n写入完成 version ${version} -> ${version + 1}，修复 ${patches.length} 条`);
process.exit(0);
