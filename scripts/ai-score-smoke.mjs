/**
 * V8.3-10.10 AI 评分接入 workbuddy-hy3 冒烟
 *
 * 换掉原「规则引擎」的动因：原来按「量化证据 N 处 / 场景描述 N 字」算 ratio，
 * 同样字数就给同样分、理由也是机械的（业务方评价「随意填的也有 51 分」）。
 *
 * 三条要验的：
 *  1. 模型输出解析（模型常带 markdown 代码块与前后废话）+ 严格校验（缺维度/越界/理由过短都判不合格）
 *  2. 失败必须**降级到规则引擎**且如实标记 —— 不能让「AI 评分」这一环把提交链路卡住
 *  3. 凭证只在环境变量，且**绝不进代码库**
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

/* ============ A组：解析与校验（跑真实实现） ============ */
let M = null;
try {
  const m = await import('../server/lib/aiScorer.mjs');
  M = m;
} catch (e) {
  results.push({ ok: false, name: 'A0 aiScorer 可加载', detail: e.message });
}
if (M) results.push({ ok: true, name: 'A0 aiScorer 可加载', detail: '' });

const card = {
  name: '大赛四维评分卡', version: 'v2', total_rule: '加权求和',
  dimensions: [
    { name: '真实性', max_score: 30, weight: 30 },
    { name: '业务价值', max_score: 30, weight: 30 },
    { name: '可复用性', max_score: 25, weight: 25 },
    { name: '呈现完整度', max_score: 15, weight: 15 },
  ],
};

check('A1 extractJson 能剥 markdown 代码块', () => {
  if (!M) return '未加载';
  const r = M.extractJson('```json\n{"scores":{"真实性":20}}\n```');
  return r && r.scores?.真实性 === 20 ? true : '代码块没剥干净';
});
check('A2 extractJson 能剥前后废话（模型常加「好的，结果如下」）', () => {
  if (!M) return '未加载';
  const r = M.extractJson('好的，结果如下：{"scores":{"真实性":20}} 希望对你有帮助！');
  return r && r.scores?.真实性 === 20 ? true : '夹在中间的 JSON 没抠出来';
});
check('A3 🔴 完整合格输出 → 通过校验', () => {
  if (!M) return '未加载';
  const v = M.validateAiOutput({
    scores: { 真实性: 26, 业务价值: 24, 可复用性: 19, 呈现完整度: 12 },
    reasons: { 真实性: '引用了作品里的 3 个真实问答样例', 业务价值: '场景选在高频业务环节', 可复用性: '含完整 SKILL.md 可直接套用', 呈现完整度: '产出样本结构清晰但缺量化对比' },
    summary: '整体贴近真实场景。',
  }, card);
  return v.ok === true ? true : '合格输出被判不合格：' + v.why;
});
check('A4 🔴 缺一个维度 → 整体判不合格（不能半截写库）', () => {
  if (!M) return '未加载';
  const v = M.validateAiOutput({
    scores: { 真实性: 26, 业务价值: 24 },
    reasons: { 真实性: '引用了具体样例', 业务价值: '高频场景' },
    summary: 'x',
  }, card);
  return v.ok === false && /缺分数/.test(v.why) ? true : '缺维度竟通过了';
});
check('A5 🔴 分数越界 → 判不合格', () => {
  if (!M) return '未加载';
  const full = (sc) => ({
    scores: sc,
    reasons: { 真实性: '理由要够长一些', 业务价值: '理由要够长一些', 可复用性: '理由要够长一些', 呈现完整度: '理由要够长一些' },
    summary: 'x',
  });
  const over = M.validateAiOutput(full({ 真实性: 45, 业务价值: 24, 可复用性: 19, 呈现完整度: 12 }), card);
  if (over.ok !== false || !/越界/.test(over.why)) return '真实性 45>30 未被拦下';
  const neg = M.validateAiOutput(full({ 真实性: -5, 业务价值: 24, 可复用性: 19, 呈现完整度: 12 }), card);
  return neg.ok === false ? true : '负分未被拦下';
});
check('A6 🔴 理由过短 → 判不合格（运营方要求"有理有据"）', () => {
  if (!M) return '未加载';
  const v = M.validateAiOutput({
    scores: { 真实性: 26, 业务价值: 24, 可复用性: 19, 呈现完整度: 12 },
    reasons: { 真实性: '好', 业务价值: '理由要够长一些', 可复用性: '理由要够长一些', 呈现完整度: '理由要够长一些' },
    summary: 'x',
  }, card);
  return v.ok === false && /理由过短/.test(v.why) ? true : '过短理由竟通过';
});
check('A7 非 JSON 输出 → 判不合格并降级', () => {
  if (!M) return '未加载';
  if (M.extractJson('抱歉，我无法评价该作品。') !== null) return '纯文本被解析成了 JSON';
  const v = M.validateAiOutput(M.extractJson('抱歉，我无法评价。'), card);
  return v.ok === false ? true : '纯文本竟通过了校验';
});

/* ============ B组：降级与安全 ============ */
const sc = code('server/lib/aiScorer.mjs');

check('B1 🔴 未配置 API_KEY 时降级到规则引擎（不让提交链路失败）', () => {
  return /if \(!cfg\.apiKey\)[\s\S]{0,120}return \{ \.\.\.fallback\(\)/.test(sc)
    ? true
    : '未配置 key 时没有降级 —— AI 评分会把作业卡住';
});
check('B2 🔴 降级必须带原因（便于排查是未配置 / 超时 / 格式不合格）', () => {
  const whys = (sc.match(/why:/g) || []).length;
  return whys >= 3 ? true : `why 字段只有 ${whys} 处，应覆盖「未配置key / HTTP 错误 / 超时 / 格式不合格」`;
});
check('B3 🔴 凭证只从环境变量读，且代码库里不得有 key', () => {
  const readsEnv = /process\.env\.AI_API_KEY/.test(sc);
  if (!readsEnv) return '未从环境变量读 AI_API_KEY';
  // 硬编码 key 的典型形态
  const hardcoded = /(sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9\-_]{20,})/.test(sc);
  return hardcoded === false ? true : '🔴 代码里出现了疑似硬编码的 API Key';
});
check('B4 🔴 触发端点要鉴权（AI 评分会产生费用，不能让任何人刷）', () => {
  const idx = read('server/index.mjs');
  const seg = /pathname === '\/api\/ai\/score'[\s\S]{0,2200}/.exec(idx);
  if (!seg) return '未找到 /api/ai/score 端点';
  const has401 = /sendJson\(res,\s*401/.test(seg[0]);
  const hasRole = /ORGANIZER/.test(seg[0]) && /ADMIN/.test(seg[0]) && /JUDGE/.test(seg[0]);
  return has401 && hasRole ? true : '缺 401 或角色校验（任何人都能触发 = 可被刷费用）';
});
check('B5 超时可控（模型卡住不能拖死请求）', () => {
  return /AbortController/.test(sc) && /AI_TIMEOUT_MS/.test(sc) ? true : '未设超时';
});

/* ============ C组：详情页 ============ */
const detail = code('src/components/AiScoreDetail.tsx');

check('C1 🔴 降级数据必须醒目提示（不能让组织者误以为是大模型评审）', () => {
  return /规则引擎兜底/.test(detail) && /未阅读作品内容/.test(detail)
    ? true : '降级时没有明确提示 —— 组织者会误以为是模型评审意见';
});
check('C2 🔴 逐维度理由按评分卡维度顺序展示（不是把长文本糊在总分下）', () => {
  return /rows: dims\.map/.test(detail) && /reasons\?\.\[d\.name\]/.test(detail)
    ? true : '未按维度取理由';
});
check('C3 无AI 记录时给可行动的空态（不是空白弹窗）', () => {
  return /emptyHint/.test(detail) && /AI 评分/.test(detail) ? true : '空态缺引导文案';
});
check('C4 两版评分表都有「AI评分详情」列', () => {
  const v1 = (read('src/pages/b/JudgeReview.tsx').match(/AI评分详情/g) || []).length;
  const v2 = (read('src/pages/v2/JudgeReviewV2.tsx').match(/AI评分详情/g) || []).length;
  return v1 >= 2 && v2 >= 2 ? true : `v1=${v1} 处、v2=${v2} 处（各需≥2：两张表 + 弹窗）`;
});
check('C5 详情弹窗逻辑与 UI 分离（v1/v2 共用，不各写一遍）', () => {
  const v1 = /from '@\/components\/AiScoreDetail'/.test(read('src/pages/b/JudgeReview.tsx'));
  const v2 = /from '@\/components\/AiScoreDetail'/.test(read('src/pages/v2/JudgeReviewV2.tsx'));
  return v1 && v2 ? true : '两版未共用同一组件';
});

/* ============ D组：反向自检 ============ */
check('D1 反向：extractJson 不剥代码块，A1 必须失败', () => {
  if (!M) return '未加载';
  const naive = (t) => { try { return JSON.parse(String(t).trim()); } catch { return null; } };
  const withFence = naive('```json\n{"scores":{}}\n```');
  const real = M.extractJson('```json\n{"scores":{}}\n```');
  return (withFence === null) && (real !== null) ? true : '断言无效';
});
check('D2 反向：允许缺维度不降级，A4 必须失败', () => {
  if (!M) return '未加载';
  const partial = { scores: { 真实性: 26 }, reasons: { 真实性: '理由要够长一些' }, summary: 'x' };
  return M.validateAiOutput(partial, card).ok === false ? true : '断言无效';
});

const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\nAI 模型评分冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);