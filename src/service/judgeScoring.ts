/**
 * V8.3-10.09 多人评委评分口径（运营方拍板：多个评委均可评价，最终分取**平均值**）
 *
 * 为什么要有这个模块：原来每位评委打���都是「直接覆写 final_score」，
 * 多人评同一条作业时**互相覆盖** —— 最后打分的人说了算，
 * 且前端只存了最后一次，看不到「有几个人评过、各打了多少」。
 *
 * 三条口径（v1 / v2 与后端共用同一份实现，避免两版漂移）：
 * 1. **同一评委只能算一次**：他再次打分 → 替换自己上一条（旧的标 superseded），
 *    不重复累加。否则一个人点多次就能把平均分拉偏。
 * 2. **最终分取所有有效评委分的算术平均**，没有并列/去重/取最高。
 * 3. **合成仍按评分卡权重**：`final = ai_score × ai_weight% + 评委均分 × judge_weight%`
 *    —— 评委多打一人不改变 AI 与评委的权重比例，只让人数的那一份更稳。
 */

type JudgeScoreLike = {
  target_id: string;
  source: string;
  scorer_union_id: string;
  scorer_name?: string;
  total: number;
  superseded?: boolean;
};

/** 一条作业/悬赏的有效评委分（同一 target下、未被取代的 JUDGE 记录） */
export function effectiveJudgeScores(results: JudgeScoreLike[], targetId: string) {
  return results
    .filter((r) => r.target_id === targetId && r.source === 'JUDGE' && !r.superseded)
    .map((r) => ({ unionId: r.scorer_union_id, name: r.scorer_name, total: r.total }));
}

/** 评委均分（无评委分时返回 null，调用方决定回退策略 —— 不要用 0 冒充） */
export function averageJudgeScore(results: JudgeScoreLike[], targetId: string): number | null {
  const list = effectiveJudgeScores(results, targetId);
  if (list.length === 0) return null;
  const sum = list.reduce((a, r) => a + r.total, 0);
  return sum / list.length;
}

/**
 * 按评分卡权重合成最终分。
 * @param aiScore AI 自评分（可空）
 * @param judgeAvg 评委均分（可空 —— 没人评时用 ai 单独成���）
 * @param aiWeight AI 权重百分比
 * @param judgeWeight 评委权重百分比
 */
export function composeFinalScore(
  aiScore: number | null | undefined,
  judgeAvg: number | null,
  aiWeight: number,
  judgeWeight: number,
): number {
  const ai = aiScore ?? 0;
  if (judgeAvg === null) return Math.round(ai * 10) / 10;
  const raw = (ai * aiWeight) / 100 + (judgeAvg * judgeWeight) / 100;
  return Math.round(raw * 10) / 10;
}

/** 展示用文案：给组织者/员工看「几个评委打了、平均多少」 */
export function judgeScoreSummary(results: JudgeScoreLike[], targetId: string): {
  count: number;
  avg: number | null;
  names: string[];
} {
  const list = effectiveJudgeScores(results, targetId);
  const names = list.map((r) => r.name ?? '').filter(Boolean);
  return {
    count: list.length,
    avg: list.length ? list.reduce((a, r) => a + r.total, 0) / list.length : null,
    names,
  };
}
