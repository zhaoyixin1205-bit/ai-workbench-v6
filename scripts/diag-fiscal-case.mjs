/**
 * 只读诊断：财税体检报告 Skill 案例化前的线上现状盘点。
 * 不写库、不停服务。DATABASE_URL 必须来自 systemd 环境。
 * 运行（服务器上）：sudo systemctl stop 不需要；直接：
 *   DATABASE_URL=... node scripts/diag-fiscal-case.mjs
 */
import { createStateStore } from '/data/ai-workbench/server/lib/stateStore.mjs';

if (!process.env.DATABASE_URL) {
  console.error('!! 缺少 DATABASE_URL（必须来自 systemd 环境），退出');
  process.exit(1);
}
const store = createStateStore({ DATABASE_URL: process.env.DATABASE_URL });
await store.init();
if (store.name !== 'pg') {
  console.error(`!! 驱动不是 pg（${store.name}），退出`);
  process.exit(1);
}
const { data, version } = await store.read();
console.log(`version=${version}`);

/* 1. 是否已有财税体检相关案例（先诊断后动手：用户常自己建架子） */
const hit = (data.cases ?? []).filter((c) => !c.is_deleted
  && /财税|体检|fiscal|风险提示/i.test(`${c.title}${c.summary}${c.prompt}${c.pain_point}`));
console.log(`\n== 1. 财税体检相关案例：${hit.length} 条 ==`);
hit.forEach((c) => console.log(`   ${c.id} | ${c.title} | ${c.author_name} | ${c.track} | ${c.status} | sort=${c.sort} | 卡=${(data.sceneCards ?? []).filter((s) => s.source_case_id === c.id && !s.is_deleted).length}`));

/* 2. 本周（真实今天 ISO 周）场景卡全景 */
function isoWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
const week = isoWeekKey();
console.log(`\n== 2. 本周 ${week} 场景卡（按 sort）==`);
(data.sceneCards ?? [])
  .filter((s) => !s.is_deleted && s.week === week)
  .sort((a, b) => (a.sort ?? Infinity) - (b.sort ?? Infinity))
  .forEach((s) => console.log(`   sort=${s.sort} | ${s.id} | ${s.status} | ${s.title} | case=${s.source_case_id} | by=${s.created_by}`));

/* 3. 全部未删案例（sort 景观 + 找重复） */
console.log(`\n== 3. 未删案例 ${(data.cases ?? []).filter((c) => !c.is_deleted).length} 条（按 sort）==`);
(data.cases ?? [])
  .filter((c) => !c.is_deleted)
  .sort((a, b) => (a.sort ?? Infinity) - (b.sort ?? Infinity))
  .forEach((c) => console.log(`   sort=${c.sort} | ${c.id} | ${c.title} | ${c.author_name} | ${c.status}`));

/* 4. 时海龙是否在通讯录 */
console.log(`\n== 4. 通讯录匹配「时海龙」==`);
(data.users ?? [])
  .filter((u) => /时海龙/.test(u.name ?? ''))
  .forEach((u) => console.log(`   ${u.union_id} | ${u.name} | roles=${(u.roles ?? []).join(',')}`));

/* 5. 场景卡 ID 序列现状（防撞号） */
const w43 = (data.sceneCards ?? []).filter((s) => /^SC-W43-/.test(s.id)).map((s) => s.id).sort();
console.log(`\n== 5. 已占用的 SC-W43-* ID：${w43.join(' ') || '（无）'}`);

/* 6. 已有 skill_packages 形态参考（找一条挂了 skill 的案例看结构） */
const withSkill = (data.cases ?? []).find((c) => (c.skill_packages ?? []).length > 0);
console.log(`\n== 6. skill_packages 结构参考（${withSkill?.id ?? '无'}）==`);
if (withSkill) console.log(JSON.stringify(withSkill.skill_packages[0], null, 2));

await store.close();
