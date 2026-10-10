/**
 * V8.3-10.10 AI 评分：接入 workbuddy-hy3（OpenAI 兼容协议）
 *
 * 为什么换掉原「规则引擎」：
 * 原来按「量化证据 N 处 / 场景描述 N 字」这类信号算 ratio —— 同样的字数就给同样的分，
 * 理由也是机械的（"量化证据 0 处；场景描述 14 字"）。业务方评价是「随意填的也有 51 分」，
 * 因为它根本没看作品内容。改成真模型后，理由会引用作品里的具体信息。
 *
 * 接口：腾讯云 TokenHub，OpenAI 兼容
 *   POST https://tokenhub.tencentmaas.com/v1/chat/completions
 *   { model: 'hy3', messages: [...], temperature, max_tokens }
 *
 * ⚠️ 凭证只从环境变量读，**绝不进代码库**：
 *   AI_BASE_URL（默认 tokenhub）、AI_API_KEY、AI_MODEL（默认 hy3）
 *
 * 失败策略：降级到调用方传入的 fallback（规则引擎结果），并在 reason 里标明降级原因。
 * 绝不因为模型不可用就让「AI 评分」这个环节整个失败 —— 那是提交链路上的关键一步。
 */
import { aiScoreOf as ruleScoreOf, RULE_SCORER_NAME as RULE_SCORER } from './aiScoreFallback.mjs';

const DEFAULT_BASE = 'https://tokenhub.tencentmaas.com/v1';
const DEFAULT_MODEL = 'hy3';

/** 模型名（列表展示用）：区分「AI 规则引擎」与真模型，避免评分来源混淆 */
export const AI_MODEL_SCORER_NAME = 'AI 评分（workbuddy-hy3）';

/** 打分落库时署名的评分主体：跟随实际模型名，避免界面把 qwen 分写成 hy3 */
export function modelScorerName() {
  return `AI 评分（${config().model}）`;
}

function config() {
  return {
    baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, ''),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || DEFAULT_MODEL,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
  };
}

export function aiScorerReady() {
  return !!config().apiKey;
}

/**
 * 组装 prompt。
 * 严格按运营方给定的要求：逐维度给分 + 引用作品具体信息的理由 + 只输出 JSON。
 */
function buildPrompt({ submit, card }) {
  const dims = card.dimensions ?? [];
  const dimSpec = dims
    .map((d) => `- ${d.name}（满分 ${d.max_score}，权重 ${d.weight}%${d.desc ? `，含义：${d.desc}` : ''}）`)
    .join('\n');

  const works = [
    `选题：${submit.topic_title || submit.custom_topic || '（未关联选题）'}`,
    `场景描述：${submit.scene_desc || '（未填写）'}`,
    `使用前：${(submit.before_after || '（未填写）').slice(0, 800)}`,
    `产出样本：${(submit.output_sample || '（未填写）').slice(0, 1200)}`,
    `所用 Skill：${submit.skill_used || '（未填写）'}`,
    `附件：${(submit.attachments || []).map((a) => a.name).join('、') || '（无）'}`,
  ].join('\n');

  return `你是「AI 评分」的评委。请根据员工提交的作品方案，参考所属评分卡分别打分。

## 所属评分卡
卡名：${card.name}（${card.version}）
评分维度：
${dimSpec}

## 员工提交的作品方案
${works}

## 严格要求
- 每个维度必须给出分数和具体评分理由，理由要引用作品内容中的具体信息，说明为什么给这个分数（有理有据）；
- 只输出一个评分结果，格式：{"scores":{"${dims[0]?.name ?? '维度1'}":XX,"${dims[1]?.name ?? '维度2'}":XX,"${dims[2]?.name ?? '维度3'}":XX,"${dims[3]?.name ?? '维度4'}":XX},"reasons":{"${dims[0]?.name ?? '维度1'}":"理由...","${dims[1]?.name ?? '维度2'}":"理由...","${dims[2]?.name ?? '维度3'}":"理由...","${dims[3]?.name ?? '维度4'}":"理由..."},"summary":"总体评价一句话"}；
- 不要输出 JSON 以外的任何内容。`;
}

/** 从模型回复里抠出 JSON。模型常带 markdown 代码块或前后废话，这里逐层剥离。 */
export function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  // ```json ... ``` / ``` ... ```
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  // 找第一个 { 到最后一个 }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1);
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/**
 * 校验模型输出：维度齐全、分数在 [0, max_score]、理由非空。
 * ⚠️ 任一维度不合格就整体降级 —— 半截结果写进库比不写更糟，
 * 因为组织者/评委看到「AI 打了 3 个维度」会以为是漏评。
 */
export function validateAiOutput(parsed, card) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, why: '模型输出不是合法 JSON' };
  const { scores, reasons } = parsed;
  if (!scores || typeof scores !== 'object') return { ok: false, why: '缺少 scores' };
  if (!reasons || typeof reasons !== 'object') return { ok: false, why: '缺少 reasons' };

  const dims = card.dimensions ?? [];
  const dimScores = {};
  for (const d of dims) {
    const v = Number(scores[d.name]);
    if (!Number.isFinite(v)) return { ok: false, why: `维度「${d.name}」缺分数` };
    const max = d.max_score || 100;
    if (v < 0 || v > max) return { ok: false, why: `维度「${d.name}」分数 ${v} 越界（0~${max}）` };
    const r = String(reasons[d.name] ?? '').trim();
    if (r.length < 4) return { ok: false, why: `维度「${d.name}」理由过短` };
    dimScores[d.name] = Math.round(v * 10) / 10;
  }
  return {
    ok: true,
    dimScores,
    reasons,
    summary: String(parsed.summary ?? '').trim(),
  };
}

/** 按卡片的 total_rule 合成总分（与前端 judgeScoring / submitPipeline 同一套口径） */
export function composeTotal(dimScores, card) {
  const dims = card.dimensions ?? [];
  const round1 = (n) => Math.round(n * 10) / 10;
  if (card.total_rule === '去极值平均' && dims.length >= 3) {
    const arr = dims.map((d) => dimScores[d.name] / (d.max_score || 100));
    const sorted = [...arr].sort((a, b) => a - b).slice(1, -1);
    return round1((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 100);
  }
  const weightSum = dims.reduce((a, d) => a + (d.weight || 0), 0) || 100;
  const total = dims.reduce((a, d) => a + dimScores[d.name] * (d.weight || 0), 0) / weightSum;
  return round1(total);
}

/** 把「理由 + 总体评价」拼成写库用的 reason 文本（详情页会结构化展示，这里存纯文本兜底） */
function buildReason(parsed, card, total) {
  const lines = [
    `AI 评分（${card.name} ${card.version}，模型 ${config().model}）`,
    `总分 ${total}`,
    '',
  ];
  for (const d of card.dimensions ?? []) {
    lines.push(`【${d.name}】${parsed.dimScores[d.name]} / ${d.max_score}`);
    lines.push(parsed.reasons[d.name]);
    lines.push('');
  }
  if (parsed.summary) {
    lines.push(`总体评价：${parsed.summary}`);
  }
  return lines.join('\n');
}

/**
 * 调模型评分。
 * @param submit 提报（含作品内容与附件名）
 * @param card评分卡
 * @param force true=评委点「重新评分」，强制重调（忽略已有缓存由调用方处理）
 * @returns {{ ok, total, dimScores, reason, scorerName, degraded, why }}
 */
export async function scoreWithModel({ submit, card, force = false }) {
  const cfg = config();
  const fallback = () => {
    const r = ruleScoreOf(submit, card);
    return {
      ok: false,
      total: r.total,
      dimScores: r.dimScores,
      reason: `【降级：${r.reason}】\n\n（AI 模型未返回可用结果，本次沿用规则引擎分数。配置 AI_API_KEY 后可获得逐维度理由。）`,
      scorerName: RULE_SCORER,
      degraded: true,
    };
  };

  if (!cfg.apiKey) {
    return { ...fallback(), why: '未配置 AI_API_KEY' };
  }
  if (!card?.dimensions?.length) {
    return { ...fallback(), why: '评分卡未配置维度' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2, // 评分要稳定，不要creative
        max_tokens: 2000,
        messages: [
          { role: 'system', content: '你是严谨的评审，只输出 JSON，不输出任何解释性文字。' },
          { role: 'user', content: buildPrompt({ submit, card }) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ...fallback(), why: `模型返回 HTTP ${res.status}：${body.slice(0, 120)}` };
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(content);
    const v = validateAiOutput(parsed, card);
    if (!v.ok) {
      return { ...fallback(), why: `模型输出不合格：${v.why}` };
    }

    const total = composeTotal(v.dimScores, card);
    return {
      ok: true,
      total,
      dimScores: v.dimScores,
      reasons: v.reasons,
      summary: v.summary,
      reason: buildReason({ ...v }, card, total),
      scorerName: modelScorerName(),
      model: cfg.model,
      degraded: false,
    };
  } catch (e) {
    const why = e?.name === 'AbortError' ? `模型超时（${cfg.timeoutMs}ms）` : `调用失败：${e?.message}`;
    return { ...fallback(), why };
  } finally {
    clearTimeout(timer);
  }
}