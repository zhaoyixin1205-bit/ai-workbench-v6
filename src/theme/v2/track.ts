/** 赛道 → 令牌变量（v2 唯一取色处，页面里禁止再写裸 hex） */
export const TRACK_VAR: Record<string, string> = {
  客户赋能: 'var(--wb-track-1)',
  团队提效: 'var(--wb-track-2)',
  销售提效: 'var(--wb-track-3)',
};

/** 赛道 → 中文短名以外的兜底色 */
export const TRACK_FALLBACK = 'var(--wb-ink-4)';

export const trackVar = (track?: string) => TRACK_VAR[track ?? ''] ?? TRACK_FALLBACK;

/**
 * V11.23 方案S 定稿：色块标签配色（软底 + 深字，截图定稿样式）。
 * 供案例/选题/悬赏卡的 .wb2-tag.tint 使用；未知赛道兜底中性灰。
 */
export const TRACK_TINT: Record<string, { bg: string; ink: string }> = {
  客户赋能: { bg: 'var(--wb-track-1-soft)', ink: 'var(--wb-track-1-ink)' },
  团队提效: { bg: 'var(--wb-track-2-soft)', ink: 'var(--wb-track-2-ink)' },
  销售提效: { bg: 'var(--wb-track-3-soft)', ink: 'var(--wb-track-3-ink)' },
};

export const trackTint = (track?: string): { bg: string; ink: string } =>
  TRACK_TINT[track ?? ''] ?? { bg: 'var(--wb-surface-sunken)', ink: 'var(--wb-ink-2)' };
