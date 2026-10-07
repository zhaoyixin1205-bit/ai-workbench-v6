import dayjs from 'dayjs';
import type { Campaign } from '@/mock/types';

/**
 * 届次时间工具（V7.1）
 * ------------------------------------------------------------------
 * 背景：首页 Hero 的阶段标签此前硬编码「W3 · 制作陪跑阶段」、距截止写死读
 * `campaign.end_date` 且倒计时基准是演示基准日 DEMO_TODAY（2026-09-25）。
 * V7.1 真实数据 + 阶段可自行配置后，这两处必须改为派生：
 *
 *   ① 当前阶段：按真实今天命中 stages（start ≤ today ≤ end）
 *   ② 作业截止：OPEN 期次（作业提报周期）end_at → 当前阶段 end → 届次 end_date
 *
 * 倒计时基准一律用真实今天（dayjs()），不再用 DEMO_TODAY ——
 * 演示基准日只服务 seed 演示数据的确定性，真实届次的日程要以真实日期倒推。
 */

export type Stage = Campaign['stages'][number];

/** "W3 制作陪跑" → "W3 · 制作陪跑"（首个空格换成间隔点，其余原样） */
export function stageLabel(s: Stage): string {
  return s.name.includes(' ') ? s.name.replace(/\s+/, ' · ') : s.name;
}

/**
 * 当前阶段：today 落在 [start, end] 区间的阶段；
 * 无命中时取「开始日 ≤ today 的最后一个」（日程整体后移时仍能落在语义上最近的阶段）；
 * 全部在未来时取第一个；无阶段返回 null。
 */
export function currentStageOf(stages: Stage[], today: string = dayjs().format('YYYY-MM-DD')): { index: number; stage: Stage } | null {
  if (!stages.length) return null;
  const sorted = [...stages].sort((a, b) => a.start.localeCompare(b.start));
  const hit = sorted.findIndex((s) => s.start <= today && today <= s.end);
  if (hit >= 0) return { index: hit, stage: sorted[hit] };
  const past = sorted.filter((s) => s.start <= today);
  if (past.length) {
    const stage = past[past.length - 1];
    return { index: sorted.indexOf(stage), stage };
  }
  return { index: 0, stage: sorted[0] };
}

export interface DeadlineInfo {
  /** 截止日期 YYYY-MM-DD；全部缺失时为 null（如空届次） */
  date: string | null;
  /** 截止口径：作业提报周期 / 当前阶段 / 届次周期 */
  source: '作业提报周期' | '当前阶段' | '届次周期';
}

/**
 * 作业提报截止日兜底链：
 *   ① 当前届次名下作业类型（type.campaign_id === campaign.id）的 OPEN 期次中最近截止的一条
 *   ② 任意 OPEN 期次中最近截止的一条（作业类型尚未绑定届次时仍可读）
 *   ③ 当前阶段 end
 *   ④ 届次 end_date
 */
export function submitDeadlineOf(
  periods: { id: string; type_id: string; start_at: string; end_at: string; status: string }[],
  assignmentTypes: { id: string; campaign_id: string }[],
  campaign: Campaign,
  today: string = dayjs().format('YYYY-MM-DD')
): DeadlineInfo {
  const open = periods.filter((p) => p.status === 'OPEN' && p.end_at);
  const typesOfCampaign = new Set(assignmentTypes.filter((t) => t.campaign_id === campaign.id).map((t) => t.id));
  const mine = open
    .filter((p) => typesOfCampaign.has(p.type_id))
    .sort((a, b) => a.end_at.localeCompare(b.end_at));
  const any = open.slice().sort((a, b) => a.end_at.localeCompare(b.end_at));
  const period = mine[0] ?? any[0];
  if (period) return { date: period.end_at, source: '作业提报周期' };

  const cur = currentStageOf(campaign.stages, today);
  if (cur) return { date: cur.stage.end, source: '当前阶段' };

  if (campaign.end_date) return { date: campaign.end_date, source: '届次周期' };
  return { date: null, source: '届次周期' };
}
