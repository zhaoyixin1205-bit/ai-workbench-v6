/**
 * 一次性诊断：查看线上提报的 ai_score 分布、评分卡权重、AI 评分记录，
 * 定位「AI 分列显示 21.9/24.5（疑似 ai_weight 加权后的值）」的根因。
 */
import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

const s = createStateStore(process.env);
await s.init();
const { data, version } = await s.read();

const cards = (data.scoreCards ?? []).filter((c) => !c.is_deleted);
console.log('=== scoreCards（权重） ===');
for (const c of cards) {
  console.log(`${c.id} ${c.name} v${c.version} status=${c.status} ai_weight=${c.ai_weight} judge_weight=${c.judge_weight} total_rule=${c.total_rule}`);
}

console.log('\n=== submits 的 ai_score ===');
for (const x of data.submits ?? []) {
  console.log(`${x.id} ${x.name} status=${x.status} ai_score=${x.ai_score} card=${x.score_card_version} final=${x.final_score ?? '—'}`);
}

console.log('\n=== scoreResults 中 source=AI 的记录 ===');
for (const r of (data.scoreResults ?? []).filter((r) => r.source === 'AI')) {
  console.log(`${r.target_id} total=${r.total} scorer=${r.scorer_name} model=${r.ai_model ?? '—'} degraded=${r.ai_degraded ?? '—'}`);
}

console.log('\n=== version =', version);

process.exit(0);
