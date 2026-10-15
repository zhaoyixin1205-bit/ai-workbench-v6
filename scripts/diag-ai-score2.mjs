/**
 * 一次性诊断：dump 两条 AI 评分记录的完整字段，确定 21.9/24.5 的加权口径。
 */
import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

const s = createStateStore(process.env);
await s.init();
const { data } = await s.read();

for (const r of (data.scoreResults ?? []).filter((r) => r.source === 'AI')) {
  console.log('=====', r.target_id, '=====');
  console.log(JSON.stringify(r, null, 1));
}

process.exit(0);
