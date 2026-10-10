/**
 * AI 规则评分（确定性）—— 作为 `aiScorer` 的**降级兜底**。
 *
 * 为什么保留它：
 *  1. 模型未配置 / 超时 / 输出不合格时，提交链路不能因此失败 ——
 *     「AI 评分」是提交流水的关键一步，不能让员工的作业卡住。
 *  2. 原实现（src/service/submitPipeline.ts 的 aiScoreOf）在前端也用，
 *     这里保持同一套算法，避免降级后分数与原口径不一致。
 *
 * ⚠️ 它的局限正是我们要换掉它的原因：按「字数 / 数字个数」算 ratio，
 *    同样字数就给同样分，理由也是机械的（"量化证据 0 处；场景描述 14 字"）。
 *    真模型会给「引用作品具体信息」的理由。所以配置了 AI_API_KEY 后优先走模型。
 */

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const round1 = (n) => Math.round(n * 10) / 10;

export const RULE_SCORER_NAME = 'AI 规则引擎';

function countNumbers(text) {
  return (String(text ?? '').match(/\d+(\.\d+)?/g) ?? []).length;
}

/** 把维度名归到四类证据信号（与前端 evidenceKindOf 同口径） */
function evidenceKindOf(name) {
  const n = String(name ?? '');
  if (/真实|可信|现场|验证/.test(n)) return '真实性';
  if (/价值|业务|收益|效率|降本|提效/.test(n)) return '业务价值';
  if (/复用|可复现|Skill|工具|沉淀|通用/.test(n)) return '可复用性';
  return '呈现完整度';
}

export function aiScoreOf(s, card) {
  const dims = card?.dimensions ?? [];
  if (dims.length === 0) {
    return { dimScores: {}, total: 0, reason: '评分卡未配置维度，跳过自动评分' };
  }

  const beforeAfter = s?.before_after ?? '';
  const sceneDesc = s?.scene_desc ?? '';
  const output = s?.output_sample ?? '';
  const skill = String(s?.skill_used ?? '').trim();
  const files = s?.attachments?.length ?? 0;
  const hasTopic = !!(s?.topic_id || s?.custom_topic);

  const nums = countNumbers(beforeAfter);
  const quantRatio = clamp01(nums / 4)
    * (/(使用前|使用后|之前|之后|提升|下降|降低)/.test(beforeAfter) ? 1 : 0.7);
  const valueRatio = clamp01((sceneDesc.length / 120) * 0.4 + (nums / 4) * 0.6);
  const reuseRatio = clamp01(
    (files >= 2 ? 0.4 : files === 1 ? 0.25 : 0) + (skill ? 0.35 : 0) + (hasTopic ? 0.2 : 0),
  );
  const presentRatio = clamp01(
    (output.length / 260) * 0.5
    + (/([\n\r]|；|;|[1-9]、|[1-9]\.)/.test(output) ? 0.3 : 0)
    + (s?.desensitized ? 0.2 : 0),
  );

  const kindRatio = {
    真实性: clamp01(0.45 + quantRatio * 0.55),
    业务价值: clamp01(0.45 + valueRatio * 0.55),
    可复用性: clamp01(0.45 + reuseRatio * 0.55),
    呈现完整度: clamp01(0.45 + presentRatio * 0.55),
  };

  const dimScores = {};
  const ratios = {};
  dims.forEach((d) => {
    const ratio = kindRatio[evidenceKindOf(d.name)];
    ratios[d.name] = ratio;
    dimScores[d.name] = round1(ratio * (d.max_score || 100));
  });

  let total;
  if (card.total_rule === '去极值平均' && dims.length >= 3) {
    const arr = dims.map((d) => ratios[d.name]);
    const kept = [...arr].sort((a, b) => a - b).slice(1, -1);
    total = round1((kept.reduce((a, b) => a + b, 0) / kept.length) * 100);
  } else {
    const weightSum = dims.reduce((a, d) => a + (d.weight || 0), 0) || 100;
    total = round1(dims.reduce((a, d) => a + ratios[d.name] * (d.weight || 0), 0) * 100 / weightSum);
  }

  const reason = [
    `AI 规则评分（${card.name} ${card.version}）`,
    `量化证据 ${nums} 处（${round1(quantRatio * 100)}%）`,
    `场景描述 ${sceneDesc.length} 字`,
    `产出样本 ${output.length} 字`,
    skill ? `所用 Skill「${skill}」` : '未填写所用 Skill',
    `附件 ${files} 个`,
    hasTopic ? '已关联选题' : '未关联选题',
    s?.desensitized ? '已通过脱敏校验' : '未通过脱敏校验',
  ].join('；') + `。总分 ${total}（百分制，${card.total_rule}）。`;

  return { dimScores, total, reason };
}