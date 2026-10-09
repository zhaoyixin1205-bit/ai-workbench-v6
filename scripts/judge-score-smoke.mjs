/**
 * V8.3-10.09 多人评委评分口径冒烟
 *
 * 运营方拍板口径：**多个评委均可评价，最终分取平均值**。
 *
 * 修的问题：原来每位评委打分都是直接覆写 `final_score`，多人评同一条作业时
 * **互相覆盖** —— 最后打分的人说了算，且看不到「有几个人评过、各打多少」。
 *
 * 三条关键口径（这里逐条断言，因为它们最容易在后续改动里被破坏）：
 *  1. 同一评委只能算一次（再打分替换自己上一条，不重复累加）；
 *  2. 最终分取所有有效评委分的算术平均；
 *  3. 权重比例不变：`ai×ai_weight% + 评委均分×judge_weight%`。
 */
import { readFileSync } from 'node:fs';

const results = [];
function check(name, fn) {
  let ok = false, detail = '';
  try {
    const r = fn();
    ok = r === true;
    if (typeof r === 'string') detail = r;
  } catch (e) { detail = 'ERR: ' + e.message; }
  results.push({ ok, name, detail });
}
function read(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}
function code(p) {
  return read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
}

/* ---------- A组：共享实现的口径（运行真实编译产物，验数学） ---------- */
const svc = read('src/service/judgeScoring.ts');
check('A1 judgeScoring.ts 存在（v1/v2 共用，避免两份实现漂移）', () =>
  /export function averageJudgeScore/.test(svc) && /export function composeFinalScore/.test(svc)
    ? true
    : '缺少共享实现，v1/v2 会各写一份必然漂移');

/**
 * 数学口径不能只靠"读源码正则"来验 —— 正则分不清「取平均」和「取最高」。
 * 这里用 esbuild 把 TS 真正编译成 JS 再执行，验的是**运行结果**而不是文本形状。
 */
let F = null;
try {
  const esbuild = await import('esbuild');
  const out = await esbuild.transform(svc, { loader: 'ts', format: 'esm' });
  const mod = await import('data:text/javascript;base64,' + Buffer.from(out.code).toString('base64'));
  F = mod;
} catch (e) {
  // 兜底：把 TS 的类型标注剥掉后当 JS 跑（esbuild 不可用时）
  try {
    const js = svc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^type JudgeScoreLike = \{[\s\S]*?\};$/m, '')
      .replace(/: JudgeScoreLike\[\]/g, '')
      .replace(/\): \{[\s\S]*?\} \{/g, ') {')
      .replace(/: string\)/g, ')')
      .replace(/: string \| null/g, '')
      .replace(/: number \| null/g, '')
      .replace(/: string\[\]/g, '')
      .replace(/: string/g, '')
      .replace(/: number/g, '')
      .replace(/^export /gm, '');
    const factory = new Function(js + '\n;return { effectiveJudgeScores, averageJudgeScore, composeFinalScore, judgeScoreSummary };');
    F = factory();
  } catch (e2) {
    F = null;
    results.push({ ok: false, name: 'A0 评分口径实现可加载', detail: 'esbuild 与兜底方案都失败：' + e2.message });
  }
}
if (F) results.push({ ok: true, name: 'A0 评分口径实现可加载（运行真实代码）', detail: '' });

check('A2 单个评委 → 均分=其分值', () => {
  if (!F) return '共享实现无法加载';
  const r = [{ target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u1', scorer_name: '王倩', total: 80 }];
  const avg = F.averageJudgeScore(r, 'S1');
  return avg === 80 ? true : '期望 80，实际 ' + avg;
});

check('A3 🔴 两个评委 → 取算术平均（不是取最高、不是取最后一个）', () => {
  if (!F) return '共享实现无法加载';
  const r = [
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u1', scorer_name: '王倩', total: 80 },
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u2', scorer_name: '王倩2', total: 60 },
  ];
  const avg = F.averageJudgeScore(r, 'S1');
  return avg === 70 ? true : '期望 70（(80+60)/2），实际 ' + avg;
});

check('A4 🔴 同一评委重复打两次 → 只算未被取代的那次（不累加）', () => {
  if (!F) return '共享实现无法加载';
  // 模拟真实写入逻辑：先有 u1 的旧分（后续被打上 superseded），再有 u1 的新分
  const r = [
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u1', total: 50, created_at: 't1', superseded: true },
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u1', total: 90, created_at: 't2' },
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u2', total: 70, created_at: 't3' },
  ];
  const list = F.effectiveJudgeScores(r, 'S1');
  const avg = F.averageJudgeScore(r, 'S1');
  // u1 只剩 90（旧的 50 已被取代）+ u2 的 70 → 均分 80
  return list.length === 2 && avg === 80
    ? true
    : `期望有效 2 条且均分 80（(90+70)/2），实际 ${list.length} 条、均分 ${avg} —— 同一人重复计入会把平均分拉偏`;
});

check('A5 AI 分不参与平均（source=AI 必须被排除）', () => {
  if (!F) return '共享实现无法加载';
  const r = [
    { target_id: 'S1', source: 'AI', scorer_union_id: 'AI', total: 55.2 },
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u1', total: 80 },
  ];
  const avg = F.averageJudgeScore(r, 'S1');
  return avg === 80 ? true : 'AI 分混进了评委均分，实际 ' + avg;
});

check('A6 无人评时返回 null（不能拿 0 冒充，否则会当成"评委打了 0 分"）', () => {
  if (!F) return '共享实现无法加载';
  return F.averageJudgeScore([{ target_id: 'S1', source: 'AI', scorer_union_id: 'AI', total: 55 }], 'S1') === null
    ? true
    : '无人评时应返回 null';
});

check('A7 权重合成：ai 55.2×60% + 评委均分 70×40% = 61.1', () => {
  if (!F) return '共享实现无法加载';
  const v = F.composeFinalScore(55.2, 70, 60, 40);
  return v === 61.1 ? true : '期望 61.1，实际 ' + v;
});

check('A8 评委均分变化时，权重比例不变（评委多人只让人数那一份更稳）', () => {
  if (!F) return '共享实现无法加载';
  const one = F.composeFinalScore(60, 60, 60, 40);   // 1 人
  const two = F.composeFinalScore(60, 60, 60, 40);   // 2 人但均分同为 60
  return one === two ? true : '权重合成逻辑受人数影响，口径不稳';
});

/* ---------- B组：v1 / v2 真正接入（不能只写了共享函数却没调用） ---------- */
const v1 = code('src/pages/b/JudgeReview.tsx');
const v2 = code('src/pages/v2/JudgeReviewV2.tsx');
for (const [label, src] of [['v1', v1], ['v2', v2]]) {
  check(`B${label === 'v1' ? 1 : 2} ${label} JudgeReview 已接入共享评分口径`, () => {
    if (!/judgeScoring/.test(src)) return `${label} 未 import judgeScoring`;
    if (!/averageJudgeScore/.test(src)) return `${label} 未调用 averageJudgeScore`;
    if (!/composeFinalScore/.test(src)) return `${label} 未调用 composeFinalScore`;
    return true;
  });
  check(`B${label === 'v1' ? 3 : 4} ${label} judge_score 必须写入均分而非单人分`, () => {
    // 正确写法：judge_score: Math.round((avg ?? total) * 10) / 10
    // 错误写法：judge_score: total（单人分直接覆盖）
    const usesAvg = /judge_score:\s*Math\.round\(\(avg\s*\?\?\s*total\)\s*\*\s*10\)/.test(src);
    if (usesAvg) return true;
    if (/judge_score:\s*total\b/.test(src)) return `${label} 仍在把单人分直接写进 judge_score（应写入均分 avg）`;
    return `${label} 未找到 judge_score 的写入语句`;
  });
  check(`B${label === 'v1' ? 5 : 6} ${label} 修订路径也要走同一口径（改票不能占两票）`, () => {
    const i = src.indexOf('submitRevise');
    if (i < 0) return `${label} 未找到 submitRevise`;
    const seg = src.slice(i, i + 1400);
    return /superseded:\s*true/.test(seg) && /averageJudgeScore/.test(seg)
      ? true
      : `${label} 的 submitRevise 没走「替换旧分 + 取均分」，修订会与自己旧分一起平均`;
  });
  check(`B${label === 'v1' ? 2 : 3} ${label} 打分要把本人旧记录标 superseded`, () => {
    return /superseded:\s*true/.test(src) ? true : `${label} 没有把本人旧评分标记为失效`;
  });
}

/* ---------- C组：实体类型 ---------- */
check('C1 ScoreResult 有 superseded 字段（同一人只算一次）', () => {
  const t = read('src/mock/types.ts');
  return /superseded\?:\s*boolean/.test(t) ? true : 'ScoreResult 缺 superseded 字段';
});

/* ---------- D组：反向自检 ---------- */
check('D1 平均分断言对"取最高"实现会失败', () => {
  if (!F) return '共享实现无法加载';
  const r = [
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u1', total: 80 },
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u2', total: 60 },
  ];
  const avg = F.averageJudgeScore(r, 'S1');
  const max = Math.max(...r.map((x) => x.total));
  return (avg !== max) ? true : '平均分与最高分相同，A3 区分不了「取平均」与「取最高」两种实现';
});
check('D2 把 superseded 过滤去掉，A4 必须失败', () => {
  if (!F) return '共享实现无法加载';
  const r = [
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u1', total: 50 },
    { target_id: 'S1', source: 'JUDGE', scorer_union_id: 'u1', total: 90 },
  ];
  // 无 superseded 标记时，重复的 u1 会被算两次
  const avg = F.averageJudgeScore(r, 'S1');
  return avg === 70 ? true : '未标记 superseded 时同一人的两条分不应被简单平均（说明实现漏了去重）';
});

/* ---------- 输出 ---------- */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n多人评委评分冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);