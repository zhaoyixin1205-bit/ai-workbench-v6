/**
 * 一次性脚本：把线上「代账客户拜访地图」案例 + 3 张场景卡注入本地 state.json，
 * 供本地 vite dev + 浏览器自动化复现「首页场景卡点击跳转案例详情」。
 * 数据字段照抄 2026-10-13 线上 PG 实况（version 298）。
 *
 * ⚠️ 2026-10-13 实测：工作区在钉钉云盘同步目录（dingpan_sync.exe）下，
 * 写入会被同步客户端回滚成云端旧版。本地测试必须用 STATE_FILE 指到
 * 工作区外的路径（如 ~/.workbuddy/tmp/state-test.json），用法：
 *   node scripts/seed-local-visit-map.mjs <目标 state.json 路径>
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'server/data/state.json');
const FILE = process.argv[2] ? path.resolve(process.argv[2]) : SRC;
console.log('DEBUG argv2=' + JSON.stringify(process.argv[2]) + ' FILE=' + FILE + ' exists=' + existsSync(FILE));
if (process.argv[2] && !existsSync(FILE)) copyFileSync(SRC, FILE);
const st = JSON.parse(readFileSync(FILE, 'utf8'));
console.log('DEBUG st.cases=' + st.cases.length + ' st.sceneCards=' + st.sceneCards.length);

const CASE_ID = 'CS1791891128624';
const now = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

/* ISO 周（真实今天） */
function isoWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

if (!st.cases) st.cases = [];
if (!st.sceneCards) st.sceneCards = [];

if (!st.cases.some((c) => c.id === CASE_ID)) {
  st.cases.unshift({
    id: CASE_ID,
    sort: 0,
    tags: ['销售提效', '团队赋能', '线索拓展'],
    cover: '📘',
    input: '',
    level: '干部层',
    title: '代账客户拜访地图',
    track: '销售提效',
    output: '',
    prompt: '',
    status: '已发布',
    summary: '',
    duration: '—',
    acceptance: [],
    created_at: '2026-09-25',
    like_count: 0,
    pain_point: '',
    view_count: 0,
    attachments: [],
    author_name: '王磊',
    reuse_count: 0,
    skill_packages: [],
    author_union_id: 'uQAkcBWeXVgDWRa3ZFiiUxgiEiE',
    visible_subjects: [{ id: 'ALL', name: '全员', type: 'ALL' }],
  });
  console.log('案例已注入');
} else {
  console.log('案例已存在，跳过');
}

const cards = [
  { id: 'SC-W42-01', title: '拜访前 10 分钟：先摸清客户底细再上门', summary: '别空着手去：账情、工商变更、上次遗留事项先过一遍', emoji: '🧭' },
  { id: 'SC-W42-02', title: '拜访中：先给「账单健康报告」，再谈续费', summary: '开口先讲你替他发现了什么，而不是问今年还续不续', emoji: '💼' },
  { id: 'SC-W42-03', title: '拜访后 48 小时：把口头承诺落成书面跟进', summary: '聊得再好也会凉：约定事项、责任人、下次时间当场写下来', emoji: '📅' },
];
let added = 0;
for (const c of cards) {
  if (st.sceneCards.some((s) => s.id === c.id)) continue;
  st.sceneCards.unshift({
    ...c,
    track: '销售提效',
    source_case_id: CASE_ID,
    week: isoWeekKey(),
    status: 'PUBLISHED',
    sort: -1,
    created_by: '赵冰艳',
    created_at: stamp,
    published_at: stamp,
  });
  added++;
}
console.log(`场景卡注入 ${added} 张（week=${isoWeekKey()}）`);

writeFileSync(FILE, JSON.stringify(st, null, 2));
console.log('state.json 已写回');
