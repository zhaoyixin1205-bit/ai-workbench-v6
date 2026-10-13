/* 一次性诊断：案例 CS1791891128624 全字段 + 全库 status/is_deleted 分布 */
import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

const s = createStateStore(process.env);
await s.init();
if (s.name !== 'pg') { console.error('!! 驱动不是 pg，退出'); process.exit(1); }
const { data, version } = await s.read();
const st = { data };
console.log('VERSION=' + version);
const c = (st.data.cases ?? []).find((x) => x.id === 'CS1791891128624');
console.log('CASE=' + JSON.stringify(c, null, 1));
const dist = {};
for (const x of st.data.cases ?? []) {
  const k = `status=${String(x.status)} deleted=${String(!!x.is_deleted)}`;
  dist[k] = (dist[k] ?? 0) + 1;
}
console.log('DIST=' + JSON.stringify(dist));
console.log('IDS=' + JSON.stringify((st.data.cases ?? []).map((x) => x.id)));
process.exit(0);
