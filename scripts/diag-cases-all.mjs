/* 一次性诊断：全库案例清单 + 搜索「开票/消耗量/看板」相关案例 */
import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

const s = createStateStore(process.env);
await s.init();
if (s.name !== 'pg') { console.error('!! 驱动不是 pg，退出'); process.exit(1); }
const { data, version } = await s.read();
console.log('VERSION=' + version);
console.log('== 全部未软删案例（id/status/track/author/sort/created） ==');
for (const c of (data.cases ?? [])) {
  if (c.is_deleted) continue;
  console.log(`${c.id} | ${c.status} | ${c.track} | ${c.author_name} | sort=${String(c.sort)} | ${c.created_at} | ${c.title}`);
}
console.log('== 搜索 开票/消耗量/看板/AI ==');
const hit = (data.cases ?? []).filter((c) => /开票|消耗量|看板/.test(c.title + (c.summary ?? '') + (c.prompt ?? '')));
for (const c of hit) {
  console.log(`HIT ${c.id} | ${c.status} | ${c.track} | ${c.author_name} | sort=${String(c.sort)} | ${c.title}`);
}
if (!hit.length) console.log('(无命中)');
console.log('== 场景卡 week/status 分布 ==');
const dist = {};
for (const x of data.sceneCards ?? []) {
  const k = `week=${String(x.week)} status=${String(x.status)} deleted=${String(!!x.is_deleted)}`;
  dist[k] = (dist[k] ?? 0) + 1;
}
console.log(JSON.stringify(dist, null, 1));
process.exit(0);
