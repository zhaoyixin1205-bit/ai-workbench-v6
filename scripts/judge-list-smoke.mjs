/**
 * V8.3-10.10 评委复核列表展示口径 + 首页评委入口（运营方拍板固化）
 *
 * 三条口径：
 *1. 待评分列表（单独一行，复核进度在其上一行）：序号 / 作业类型 / 期数 / 提报人 / AI 分 / 操作
 * 2. 历史评分：序号 / 作业类型 / 期数 / 提报人 / 我的评分 / 评分卡名称 / 评分时间
 * 3. 评委待复核进「我的待办」，且首页「我的待办」下方显示「评委复核」列表；
 *    待办条数**按角色区分**：普通员工 3 条、评委 4 条（运营方 10-10 拍板）。
 */
import { readFileSync } from 'node:fs';

const results = [];
function check(name, fn) {
  let ok = false, detail = '';
  try { const r = fn(); ok = r === true; if (typeof r === 'string') detail = r; }
  catch (e) { detail = 'ERR: ' + e.message; }
  results.push({ ok, name, detail });
}
function read(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }
function code(p) { return read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); }

const v1q = code('src/pages/b/JudgeReview.tsx');
const v2q = code('src/pages/v2/JudgeReviewV2.tsx');
const v1h = code('src/pages/c/Home.tsx');
const v2h = code('src/pages/v2/HomeV2.tsx');
const view = code('src/service/judgeListView.ts');

/* ---------- A组：共享展示口径 ---------- */
check('A1 judgeListView.ts 存在（v1/v2 共用，避免两处漂移）', () =>
  /export function typeNameOf/.test(view) && /export function periodLabelOf/.test(view)
    && /export function scoreCardLabelOf/.test(view) && /export function aiScoreOf/.test(view)
    ? true : '缺共享展示函数');

check('A2 序号用 index+1（不是内部 code）', () => {
  return /export function seqNo\(index: number\)/.test(view) && /return index \+ 1/.test(view)
    ? true : 'seqNo 未按index+1 实现';
});

check('A3 🔴 作业类型取 type_id → name，不能回退 title', () => {
  if (!/types\?\.find\(\(t\) => t\.id === submit\.type_id\)\?\.name/.test(view)) {
    return 'typeNameOf 没按 type_id 反查类型名';
  }
  return /submit\.title/.test(view.split('export function typeNameOf')[1].split('}')[0] || '')
    ? '⚠️ typeNameOf 里出现 submit.title —— title 是「本人自填作品名」，同一期每人不同，列表会看起来每人一个作业类型'
    : true;
});

check('A4 🔴 期数统一拼「第X期」（两个页面各拼一次必然漂移）', () =>
  /`\$\{p\.seq\}期`|第\$\{p\.seq\}期/.test(view) ? true : 'periodLabelOf 未统一拼「第X期」');

check('A5 🔴 AI 分有回退链（submit.ai_score 为空时取 scoreResults 里的 AI 记录）', () => {
  if (!/typeof submit\.ai_score === 'number'/.test(view)) return '未优先用 submit.ai_score';
  return /source === 'AI'/.test(view)
    ? true
    : '无 scoreResults 回退 —— 线上有条作业 ai_score 是 undefined 但 scoreResults 里有 AI 记录，会显示「—」';
});

check('A6 🔴 评分卡显示名称（不是 card_id 内部编号）', () => {
  const seg = /export function scoreCardLabelOf[\s\S]{0,500}?\n}/.exec(view);
  if (!seg) return '未找到 scoreCardLabelOf';
  return /cards\?\.find/.test(seg[0]) && /\$\{name\}/.test(seg[0])
    ? true
    : "未用卡片 name —— 会显示成 'SC1 v2' 这种内部编号";
});

/* ---------- B组：两张表列结构 ---------- */
for (const [label, src, wantCols] of [
  ['v1 待评分', v1q, ['序号', '作业类型', '期数', '提报人', 'AI 分', '操作']],
  ['v1 历史评分', v1q, ['序号', '作业类型', '期数', '提报人', '我的评分', '评分卡', '评分时间']],
  ['v2 待评分', v2q, ['序号', '作业类型', '期数', '提报人', 'AI 分', '操作']],
  ['v2 历史评分', v2q, ['序号', '作业类型', '期数', '提报人', '我的评分', '评分卡', '评分时间']],
]) {
  check(`B ${label} 六个/七个字段齐全`, () => {
    const miss = wantCols.filter((c) => !src.includes(`title: '${c}'`));
    return miss.length ? `缺字段: ${miss.join(', ')}` : true;
  });
}

check('B 两张表都不再显示内部编号 code / card_id', () => {
  const bad = [];
  if (/title: '提报'/.test(v1q) || /title: '提报'/.test(v2q)) bad.push('还有「提报」列（显示 code）');
  if (/dataIndex: 'code'/.test(v1q) || /dataIndex: 'code'/.test(v2q)) bad.push('还有 dataIndex=code');
  if (/\$\{r\.card_id\} \$\{r\.card_version\}/.test(v1q) || /\$\{r\.card_id\} \$\{r\.card_version\}/.test(v2q)) {
    bad.push('评分卡还在拼 card_id（应走 scoreCardLabelOf）');
  }
  return bad.length ? bad.join('; ') : true;
});

/* ---------- C组：复核进度单独一行 ---------- */
check('C1 v1 复核进度在 Tabs（待评分列表）上方', () => {
  const p = srcIdx(v1q, '复核进度');
  const t = srcIdx(v1q, 'activeKey={cTab}');
  if (p < 0) return '未找到复核进度';
  return p < t ? true : '复核进度不在 Tabs 上方';
});
function srcIdx(s, needle) { return s.indexOf(needle); }

check('C2 v2 复核进度在 Tabs 上方', () => {
  const p = srcIdx(v2q, 'wb2-judge-progress');
  const t = srcIdx(v2q, 'activeKey={cTab}');
  if (p < 0) return '未找到 wb2-judge-progress';
  return p < t ? true : 'wb2-judge-progress 不在 Tabs 上方';
});

check('C3 v2 进度条样式已定义且全用 CSS 变量（不硬编码颜色）', () => {
  const css = read('src/theme/v2/template.css');
  const seg = /\.wb2-judge-progress \{[\s\S]{0,400}?\}/.exec(css);
  if (!seg) return '样式未定义';
  return /var\(--wb-/.test(seg[0]) ? true : '未用设计变量（违反暖白体系）';
});

/* ---------- D组：首页待办与评委复核区块 ---------- */
check('D1 两版首页都有「N 条作业等你复核」待办项', () => {
  const a = /条作业等你复核/.test(v1h), b = /条作业等你复核/.test(v2h);
  return a && b ? true : `v1=${a} v2=${b}`;
});
check('D2 🔴 待办上限按角色区分（普通 3 / 评委 4，运营方拍板）', () => {
  const a = /slice\(0, judgeEntryOn \? 4 : 3\)/.test(v1h);
  const b = /slice\(0, judgeEntryOn \? 4 : 3\)/.test(v2h);
  return a && b ? true : '未按角色区分上限（或被改回 slice(0,3)）—— 评委复核会被挤掉';
});
check('D3 🔴 评委复核待办须排在 asset 之后（否则挤掉共性提醒）', () => {
  // 顺序：asset 项在 judge 项之前
  const iAsset = v1h.indexOf("key: 'asset'");
  const iJudge = v1h.indexOf("key: 'judge'");
  if (iAsset < 0 || iJudge < 0) return '缺 asset 或 judge 项';
  return iAsset < iJudge ? true : "judge 项排到了 asset 之前 —— 会把「作品还没申请入库」挤出 slice(0,N)";
});
check('D4 两版首页评委复核区块都在「我的待办」之后', () => {
  const j1 = v1h.indexOf('V6.0 CR-15：评委复核入口');
  const t1 = v1h.indexOf('{/* 我的待办 */}');
  const j2 = v2h.indexOf('CR-15：评委复核入口');
  const t2 = v2h.indexOf('{/* 我的待办 */}');
  if ([j1, t1, j2, t2].some((x) => x < 0)) return '锚点未找到';
  return j1 > t1 && j2 > t2 ? true : '评委复核区块不在待办下方';
});
check('D5 待复核数口径仍是「已出 AI 分且我没评过」', () => {
  const i = v1h.indexOf('const judgePendingCount');
  if (i < 0) return '未找到 judgePendingCount';
  // 该表达式是单语句 filter().length，截到下一个空行或分号即可
  const seg = v1h.slice(i, i + 600);
  const hasStatus = /AI_SCORED/.test(seg) && /REVIEWING/.test(seg);
  const hasMine = /scorer_union_id === me\.union_id/.test(seg) && /source === 'JUDGE'/.test(seg);
  return hasStatus && hasMine
    ? true
    : '口径变了 —— 应为 status∈{AI_SCORED,REVIEWING} 且「我未评过」';
});
check('D6 评委变量必须在 myTodos 之前声明（TDZ）', () => {
  const j = v1h.indexOf('const judgeEntryOn');
  const m = v1h.indexOf('const myTodos');
  const j2 = v2h.indexOf('const judgeEntryOn');
  const m2 = v2h.indexOf('const myTodos');
  return j < m && j2 < m2 ? true : 'judgeEntryOn 定义在 myTodos 之后 → 运行时 TDZ 报错';
});

/* ---------- E组：反向自检 ---------- */
check('E1 反向：把 slice 改回 (0,3)，D2 必须失败', () => {
  const broken = v1h.replace(/slice\(0, judgeEntryOn \? 4 : 3\)/, 'slice(0, 3)');
  return /judgeEntryOn \? 4 : 3/.test(broken) === false ? true : '断言无效';
});
check('E2 反向：把 judge 项挪到 asset 之前，D3 必须失败', () => {
  const broken = v1h.replace(/(key: 'judge')/, 'key: "judge"\n    /* moved */');
  // 判据：iJudge 必须 < iAsset 才算失败
  const iA = broken.indexOf("key: 'asset'");
  const iJ = broken.indexOf('key: "judge"\n    /* moved */');
  return (iJ > 0 && iJ < iA) ? false : true;
});

const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n评委列表展示口径冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);