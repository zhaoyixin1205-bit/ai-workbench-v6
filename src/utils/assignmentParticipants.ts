import type { AssignmentParticipant, AssignmentSubmit, AssignmentType } from '@/mock/types';

/**
 * V8.2-10.07：作业参加人员（必修 / 选修）口径工具
 * ------------------------------------------------------------------
 * 背景：需求原文 —— 作业提报可以增加「必须参加人员名单」，首页以 To Do 提醒，
 * 后台可手动提醒未提报人员；作业可公开给其他人，其他人主动加入后按「选修」展示。
 *
 * 这里把「谁必修 / 谁已提报 / 谁待催办」的判断收敛成纯函数，
 * 后台（参加人员 Tab）、首页（To Do）、前端（加入作业）共用同一口径，
 * 避免出现「后台显示未提报、首页却没提醒」的两套算法。
 */

/** 已提报名单：草稿与已撤回不算完成提报 */
const isSubmitted = (s: AssignmentSubmit) => s.status !== 'DRAFT' && s.status !== 'WITHDRAWN';

export const hasSubmitted = (
  submits: AssignmentSubmit[], typeId: string, unionId: string
): boolean => submits.some((s) => s.type_id === typeId && s.union_id === unionId && isSubmitted(s));

/** 作业类型的参加人员（兼容旧数据缺省） */
export const participantsOf = (t?: AssignmentType): AssignmentParticipant[] => t?.participants ?? [];

/** 必修名单 */
export const requiredOf = (t?: AssignmentType): AssignmentParticipant[] =>
  participantsOf(t).filter((p) => p.kind === 'REQUIRED');

/** 选修名单（含自主加入） */
export const electiveOf = (t?: AssignmentType): AssignmentParticipant[] =>
  participantsOf(t).filter((p) => p.kind === 'ELECTIVE');

/**
 * 我「必须参加且尚未提报」的作业 —— 首页 To Do 的数据源。
 * 只统计已发布（PUBLISHED）的作业类型，草稿作业不该进成员待办。
 */
export const myPendingRequired = (
  types: AssignmentType[], submits: AssignmentSubmit[], unionId: string
): { type: AssignmentType; participant: AssignmentParticipant }[] => {
  const out: { type: AssignmentType; participant: AssignmentParticipant }[] = [];
  for (const t of types) {
    if (t.status !== 'PUBLISHED') continue;
    const p = requiredOf(t).find((x) => x.union_id === unionId);
    if (!p) continue;
    if (hasSubmitted(submits, t.id, unionId)) continue;
    out.push({ type: t, participant: p });
  }
  return out;
};

/** 已加入（必修或选修）判断 —— 用于「加入作业」按钮的显示与去重 */
export const hasJoined = (t: AssignmentType, unionId: string): boolean =>
  participantsOf(t).some((p) => p.union_id === unionId);

/** 可主动加入的作业：已发布 + 开放他人加入 + 我尚未加入 */
export const joinableOf = (
  types: AssignmentType[], unionId: string
): AssignmentType[] => types.filter(
  (t) => t.status === 'PUBLISHED' && t.open_join === true && !hasJoined(t, unionId)
);

/** 后台催办名单：必修（或选修）且尚未提报 */
export const unsubmittedOf = (
  t: AssignmentType, submits: AssignmentSubmit[]
): AssignmentParticipant[] =>
  participantsOf(t).filter((p) => !hasSubmitted(submits, t.id, p.union_id));
