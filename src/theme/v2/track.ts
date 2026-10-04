/** 赛道 → 令牌变量（v2 唯一取色处，页面里禁止再写裸 hex） */
export const TRACK_VAR: Record<string, string> = {
  客户赋能: 'var(--wb-track-1)',
  团队提效: 'var(--wb-track-2)',
  销售提效: 'var(--wb-track-3)',
};

/** 赛道 → 中文短名以外的兜底色 */
export const TRACK_FALLBACK = 'var(--wb-ink-4)';

export const trackVar = (track?: string) => TRACK_VAR[track ?? ''] ?? TRACK_FALLBACK;
