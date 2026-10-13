/** 一次性诊断：查看「代账客户拜访地图」案例与场景卡现状 + 本周场景卡排序态势 */
import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

function isoWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

if (!process.env.DATABASE_URL) { console.error('!! no DATABASE_URL'); process.exit(1); }
const store = createStateStore({ DATABASE_URL: process.env.DATABASE_URL, PGSSLMODE: process.env.PGSSLMODE });
await store.init();
const { data, version } = await store.read();
console.log(`version=${version} updated_by=${version && ''}${''}`);
console.log(`today week = ${isoWeekKey()}`);

console.log('\n== 案例：代账客户拜访地图 ==');
(data.cases ?? []).filter((c) => c.title.includes('代账客户拜访')).forEach((c) => {
  console.log(JSON.stringify({ id: c.id, title: c.title, status: c.status, track: c.track, author: c.author_name, sort: c.sort, is_deleted: !!c.is_deleted, created_at: c.created_at }, null, 0));
});
console.log('(以上为空则该案例不存在)');

console.log('\n== 全部未软删场景卡（含 sort/week/status/source） ==');
(data.sceneCards ?? []).filter((s) => !s.is_deleted).forEach((s) => {
  console.log(`${s.id} sort=${s.sort} week=${s.week} status=${s.status} case=${s.source_case_id ?? '-'} ${s.title}`);
});

console.log('\n== 本周 PUBLISHED 场景卡（首页实际展示池） ==');
const wk = isoWeekKey();
(data.sceneCards ?? []).filter((s) => !s.is_deleted && s.status === 'PUBLISHED' && (s.week ?? '') === wk).forEach((s) => {
  console.log(`${s.id} sort=${s.sort} published_at=${s.published_at} case=${s.source_case_id ?? '-'} ${s.title}`);
});
await store.close();
