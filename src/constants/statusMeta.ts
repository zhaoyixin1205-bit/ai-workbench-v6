/**
 * 作业状态中文文案 —— 全站唯一真源（V7.0 CR-33）
 *
 * 背景：此前 STATUS_META 定义在 C 端 WorkList.tsx 内部，B 端作业管理（AssignmentAdmin）
 * 另写了一套裸英文（SUBMITTED / AI_SCORED / REVIEWING…），造成「前后端看到的不是同一句话」。
 * 本次把它抽到公共层，B/C 端同时引用；纯展示层重构，零行为变化。
 *
 * 原则：状态机只增不改。本文件只做「枚举 → 中文 + 颜色」的映射，不参与任何流转判定。
 */
import type { SubmitStatus } from '@/mock/types';

export interface StatusMeta {
  text: string;
  color: string;
}

export const STATUS_META: Record<SubmitStatus, StatusMeta> = {
  DRAFT: { text: '草稿', color: 'default' },
  SUBMITTED: { text: '已提交', color: 'blue' },
  SCORING_AI: { text: 'AI 评分中', color: 'cyan' },
  AI_SCORED: { text: 'AI 已出分', color: 'cyan' },
  REVIEWING: { text: '复核中', color: 'purple' },
  REVIEWED: { text: '已复核', color: 'purple' },
  SPOT_CHECK: { text: '抽查中', color: 'gold' },
  PASSED: { text: '抽查通过', color: 'green' },
  REJECTED: { text: '不通过', color: 'red' },
  PUBLISHED: { text: '已公示', color: 'green' },
  ASSET_APPLYING: { text: '入库申请中', color: 'geekblue' },
  ASSET_ONLINE: { text: '已入库', color: 'green' },
  ASSET_REJECTED: { text: '入库驳回', color: 'red' },
  WITHDRAWN: { text: '已撤回', color: 'default' },
  SCORE_FAILED: { text: '评分失败', color: 'red' },
  /** V6.0 CR-19 新增两态 */
  COMPLETED: { text: '已完成', color: 'green' },
  CONSENSUS: { text: '已共识', color: 'geekblue' },
};

/** 取中文文案；未知状态回退为原值（不吞掉新状态，便于发现漏配）。允许 undefined（可选字段场景） */
export function statusText(s: string | undefined): string {
  return (s !== undefined && (STATUS_META as Record<string, StatusMeta>)[s]?.text) || s || '—';
}

/** 取标签颜色；未知状态回退为 default */
export function statusColor(s: string): string {
  return (STATUS_META as Record<string, StatusMeta>)[s]?.color ?? 'default';
}

/** 全量状态枚举（顺序 = 业务流程顺序，供下拉筛选复用） */
export const ALL_SUBMIT_STATUSES: SubmitStatus[] = [
  'DRAFT', 'SUBMITTED', 'SCORING_AI', 'AI_SCORED', 'REVIEWING', 'REVIEWED',
  'SPOT_CHECK', 'PASSED', 'REJECTED', 'PUBLISHED', 'ASSET_APPLYING',
  'ASSET_ONLINE', 'ASSET_REJECTED', 'WITHDRAWN', 'SCORE_FAILED',
  'COMPLETED', 'CONSENSUS',
];

/**
 * 作业类型（AssignmentType）状态中文映射 —— CR-33 第 2 处不一致。
 * 与作业提报状态是两套枚举，不要混用。
 */
export const TYPE_STATUS_TEXT: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  CLOSED: '已截止',
  ARCHIVED: '已归档',
};

/**
 * V8.3-10.07：哪些状态下「员工可申请入库」—— 全站唯一口径。
 *
 * 此前 WorkList / WorkDetail 各自写了一份 `['PASSED','PUBLISHED','REVIEWED'].includes(status)`，
 * 而 V6.0 CR-19 之后链路终点改成了 COMPLETED（公示不再是前置条件），
 * 两条口径一旦漂移，就会出现「作业完成了但入口没有」。四个入口统一读这里。
 */
export const ASSET_APPLY_STATUSES: SubmitStatus[] = [
  'PASSED', 'PUBLISHED', 'REVIEWED', 'COMPLETED', 'CONSENSUS',
];

export function canApplyAsset(status: SubmitStatus | string | undefined): boolean {
  return ASSET_APPLY_STATUSES.includes(status as SubmitStatus);
}

/** 生成下拉选项：value 保持原枚举（不改动筛选逻辑），label 为中文 */
export function statusOptions(extra?: SubmitStatus[]) {
  return [...ALL_SUBMIT_STATUSES, ...(extra ?? [])].map((v) => ({
    value: v as string,
    label: statusText(v),
  }));
}

/**
 * 专家排班状态中文映射 —— V7.0 裸编码治理。
 * ExpertSchedule.status 是 OPEN/FULL/CLOSED/HOLIDAY 英文枚举，此前在排班表格与
 * 管理下拉里直接显示裸编码；本映射与门诊页 SLOT_STATUS 的文案口径保持一致。
 */
export const SCHEDULE_STATUS_TEXT: Record<string, string> = {
  OPEN: '可预约',
  FULL: '已约满',
  CLOSED: '已关闭',
  HOLIDAY: '休诊',
};

/** 取排班状态中文；未知值回退为原值。允许 undefined（表单可选字段场景） */
export function scheduleStatusText(s: string | undefined): string {
  return (s !== undefined && SCHEDULE_STATUS_TEXT[s]) || s || '—';
}

/**
 * 内容实体（公告 Announcement / 场景卡 SceneCard）状态中文映射 —— V7.0 裸编码治理。
 * 注意与「作业提报状态」（STATUS_META）和「作业类型状态」（TYPE_STATUS_TEXT）是三套枚举，不要混用。
 */
export const CONTENT_STATUS_TEXT: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  OFFLINE: '已下线',
};

/** 取内容状态中文；未知值回退为原值。允许 undefined（表单可选字段场景） */
export function contentStatusText(s: string | undefined): string {
  return (s !== undefined && CONTENT_STATUS_TEXT[s]) || s || '—';
}
