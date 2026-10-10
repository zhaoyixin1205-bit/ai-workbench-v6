/**
 * V8.3-10.10「AI 评分详情」弹窗（v1 / v2 共用）
 *
 * 为什么单独抽组件：
 *  待我评分 / 历史评分两张表都要有这一列（业务方要求"最后一列"），
 *  两处各写一遍弹窗必然漂移 —— 与 judgeListView 同理。
 *
 * 设计要点：
 *  1. **如实展示降级**：若这条 AI 分是规则引擎兜底来的（ai_degraded=true），
 *     必须明确写出来。不能让组织者以为看到的是大模型的评审意见。
 *  2. **理由要能一眼看到对应维度**：按评分卡维度顺序展示「分数 + 理由」，
 *     而不是把长文本糊在总分下面。
 *  3. 无 AI 记录时给出可行动的空态（去评分 / 还没到 AI 评分环节）。
 */
import { Alert, Empty, Modal, Progress, Space, Tag, Typography } from 'antd';
import type { ScoreCard, ScoreResult } from '@/mock/types';

export type AiDetailSubmit = {
  id: string;
  code: string;
  name: string;
  /** 提报人自填的作品名 */
  title?: string;
};

/** 从 scoreResults 里取出某条提报的有效 AI 评分记录（最新一条） */
export function aiResultOf(
  scoreResults: ScoreResult[] | undefined,
  targetId: string,
): ScoreResult | null {
  const list = (scoreResults ?? []).filter(
    (r) => r.target_type === 'submit' && r.target_id === targetId && r.source === 'AI' && !r.superseded,
  );
  if (list.length === 0) return null;
  // 有 ai_model / ai_reasons 的优先（新写入的记录），否则取最后一条
  return [...list].reverse().find((r) => r.ai_model || r.ai_reasons) ?? list[list.length - 1];
}

export type AiDetailModel = {
  /** 总分（百分制） */
  total: number | null;
  /** 按评分卡顺序排好的「维度 / 分数 / 理由」 */
  rows: { name: string; max: number; score: number | null; reason: string | null }[];
  summary: string;
  /** 模型名（无则null —— 规则引擎那批） */
  model: string | null;
  /** 是否降级到规则引擎 */
  degraded: boolean;
  scorerName: string;
  createdAt: string;
  /** 无 AI 记录时的说明 */
  emptyHint: string;
};

/**
 * 组装详情模型。
 * @param card 提报对应的评分卡（决定维度顺序与满分）
 * @param result 该提报的 AI 评分记录（可为 null）
 */
export function buildAiDetail(
  card: ScoreCard | undefined,
  result: ScoreResult | null,
  opts?: { hasJudged?: boolean },
): AiDetailModel {
  const dims = card?.dimensions ?? [];
  if (!result) {
    return {
      total: null,
      rows: dims.map((d) => ({ name: d.name, max: d.max_score, score: null, reason: null })),
      summary: '',
      model: null,
      degraded: false,
      scorerName: '',
      createdAt: '',
      emptyHint: opts?.hasJudged
        ? '这条作业还没有 AI 评分记录。'
        : '这条作业还没进入 AI 评分环节（通常在提交后自动评分）。',
    };
  }
  const reasons = result.ai_reasons ?? null;
  const degraded = !!result.ai_degraded || !reasons;
  return {
    total: typeof result.total === 'number' ? result.total : null,
    rows: dims.map((d) => ({
      name: d.name,
      max: d.max_score,
      score: typeof result.dim_scores?.[d.name] === 'number' ? result.dim_scores[d.name] : null,
      reason: reasons?.[d.name] ?? null,
    })),
    summary: result.ai_summary ?? '',
    model: result.ai_model ?? null,
    degraded,
    scorerName: result.scorer_name,
    createdAt: result.created_at,
    emptyHint: '',
  };
}
/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

/**
 * AI 评分详情弹窗（v1 / v2 共用）。
 * @param model 由 buildAiDetail() 组装 —— 组件只负责渲染，不做业务判断
 */
export default function AiScoreDetail({
  open,
  onClose,
  title = 'AI 评分详情',
  model,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  model: AiDetailModel;
}) {
  const hasResult = model.total !== null;
  return (
    <Modal open={open} onCancel={onClose} footer={null} title={title} width={640} destroyOnClose>
      {!hasResult ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={model.emptyHint || '暂无 AI 评分记录'} />
      ) : (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          {/* 总分条 */}
          <div>
            <Space align="baseline" size={8} wrap>
              <Typography.Text strong style={{ fontSize: 15 }}>AI 总分</Typography.Text>
              <Typography.Text className="num" style={{ fontSize: 26, fontWeight: 700, color: '#FF6B35' }}>
                {model.total}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>/ 100 百分制</Typography.Text>
              {model.model && <Tag color="purple" style={{ marginInlineStart: 4 }}>模型 {model.model}</Tag>}
              <Tag style={{ marginInlineStart: 4 }}>{model.scorerName}</Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{model.createdAt}</Typography.Text>
            </Space>
            <Progress
              percent={Math.max(0, Math.min(100, Math.round(model.total ?? 0)))}
              strokeColor="#FF6B35"
              size="small"
              style={{ marginTop: 6 }}
            />
          </div>

          {/*
           * 降级提示：**必须如实展示**。
           * 规则引擎时代没有逐维度理由，这里若是降级数据，理由区会是空的，
           * 不说明的话组织者会以为「AI 就是没给出理由」。
           */}
          {model.degraded && (
            <Alert
              type="warning"
              showIcon
              message="本次评分为规则引擎兜底结果，不是大模型评审"
              description={
                <>
                  常见原因：未配置 AI_API_KEY、模型调用超时，或模型输出格式不合格。
                  配置后可在「AI评分详情」里重新评分。
                  {model.rows.some((r) => r.score !== null) && (
                    <>
                      <br />
                      下面是规则引擎按「量化证据数量 / 文本字数」等信号机械计算的结果，
                      <b>未阅读作品内容</b>，仅供参考。
                    </>
                  )}
                </>
              }
            />
          )}

          {/* 逐维度：分数 + 理由 */}
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {model.rows.map((r) => (
              <div
                key={r.name}
                style={{
                  border: '1px solid #F2EBDD', borderRadius: 8, padding: '10px 12px',
                  background: '#FFFDFA',
                }}
              >
                <Space align="baseline" size={8} wrap>
                  <Typography.Text strong>{r.name}</Typography.Text>
                  <Typography.Text className="num" style={{ color: '#FF6B35', fontWeight: 600 }}>
                    {r.score ?? '—'}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>/ {r.max}</Typography.Text>
                </Space>
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: '#2B2A33', overflowWrap: 'anywhere' }}>
                  {r.reason ?? (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      （本次无该维度理由{model.degraded ? '：规则引擎不产出理由' : ''}）
                    </Typography.Text>
                  )}
                </div>
              </div>
            ))}
          </Space>

          {/* 总体评价 */}
          {model.summary && (
            <div
              style={{
                border: '1px solid #F2EBDD', borderLeft: '3px solid #FF6B35',
                borderRadius: 8, padding: '10px 12px', background: '#FFFDFA',
              }}
            >
              <Typography.Text strong style={{ fontSize: 13 }}>总体评价</Typography.Text>
              <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.7, overflowWrap: 'anywhere' }}>
                {model.summary}
              </div>
            </div>
          )}
        </Space>
      )}
    </Modal>
  );
}
