/**
 * V8.3-10.10 评委复核列表的展示口径（v1 / v2 共用，避免两处漂移）
 *
 * 背景：运营方要求评委复核页两张表按固定字段展示：
 *   待评分：序号 / 作业类型名称 / 期数 / 提报人姓名 / AI 分 / 操作
 *   历史评分：序号 / 作业类型名称 / 期数 / 提报人姓名 / 我的评分 / 评分卡名称 / 评分时间
 *
 * 原来这两张表直接渲染 `submit.code`（WB-A1-P1-0001）与 `card_id`（SC1 v2）——
 * 那是**内部编号**，业务方看不懂。这份文件负责把它们翻译成业务语言。
 */

/** 序号：分页连续编号（1/2/3），不是数据里的 code */
export function seqNo(index: number): number {
  return index + 1;
}

/**
 * 作业类型名称，如「2026 Q4 AI 应用实践作业」。
 * ⚠️ 不能回退到 `submit.title` —— title 是「本次提交作业时自填的作品名」，
 * 同一期所有人 title 都不同，列表会看起来每人一个作业类型。
 */
export function typeNameOf(
  submit: { type_id?: string; title?: string } | undefined,
  types: { id: string; name: string }[] | undefined,
): string {
  if (!submit) return '—';
  return types?.find((t) => t.id === submit.type_id)?.name || '未登记类型';
}

/**
 * 期数，如「第1期」。
 * periods 里只有 `seq`（序号），没有「第 X 期」这个字符串，统一在这里拼，
 * 免得两个页面各拼一次、格式还不一样。
 */
export function periodLabelOf(
  submit: { period_id?: string } | undefined,
  periods: { id: string; seq: number }[] | undefined,
): string {
  if (!submit) return '—';
  const p = periods?.find((x) => x.id === submit.period_id);
  return p ? `第${p.seq}期` : '—';
}

/**
 * AI 分。
 *
 * ⚠️ 坑：AI 分有两个来源 ——
 *   1. `submit.ai_score`（提交时算好的快照，最常用）
 *   2. `scoreResults` 里 `source === 'AI'` 的记录（规则引擎补算的）
 * 线上出现过两者不一致的情况，且有条作业 `ai_score` 是 undefined 但 scoreResults 里有 AI 记录。
 * 这里**优先取 submit.ai_score，为空时回退到 AI 记录**，避免显示「—」让评委以为没跑 AI。
 */
export function aiScoreOf(
  submit: { id: string; ai_score?: number } | undefined,
  scoreResults: { target_id: string; source: string; total: number }[] | undefined,
): number | null {
  if (!submit) return null;
  if (typeof submit.ai_score === 'number') return submit.ai_score;
  const fromAI = scoreResults?.find((r) => r.target_id === submit.id && r.source === 'AI');
  return fromAI ? fromAI.total : null;
}

/**
 * 评分卡名称，如「应用实践作业思维评分卡 v3」。
 * ⚠️ 原来显示的是 `${card_id} ${card_version}`（SC1 v2）—— 内部编号，业务方看不懂。
 */
export function scoreCardLabelOf(
  result: { card_id: string; card_version: string } | undefined,
  cards: { id: string; name: string; version: string }[] | undefined,
): string {
  if (!result) return '—';
  const card = cards?.find((c) => c.id === result.card_id);
  const name = card?.name || result.card_id;
  // 优先用卡片自己的 version，缺失时回退到评分记录里的快照版本
  return `${name} ${card?.version || result.card_version}`.trim();
}

/** 提报人姓名（字段就是 name，直接给出兜底避免空白格） */
export function submitterNameOf(submit: { name?: string } | undefined): string {
  return submit?.name?.trim() || '—';
}