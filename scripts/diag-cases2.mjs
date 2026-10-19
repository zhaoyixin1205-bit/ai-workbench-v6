/* 一次性诊断：dump 两条开票相关案例全字段 */
import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

const s = createStateStore(process.env);
await s.init();
if (s.name !== 'pg') { console.error('!! 驱动不是 pg，退出'); process.exit(1); }
const { data, version } = await s.read();
console.log('VERSION=' + version);
for (const id of ['CS1792058968779', 'CS1792146063730']) {
  const c = (data.cases ?? []).find((x) => x.id === id);
  console.log('==== ' + id + ' ====');
  console.log(JSON.stringify(c, null, 1));
}
process.exit(0);
