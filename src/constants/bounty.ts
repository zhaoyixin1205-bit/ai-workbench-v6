import type { Bounty } from '@/mock/types';

/**
 * 公司虚拟发布主体（V8-10.07 补：悬赏「悬赏人」口径）
 *
 * 需求要求 11 条公司悬赏的悬赏人显示为「公司」。此前脚本把 owner_name 写成「公司」、
 * 但 owner_union_id 仍落成了组织者个人的 unionId，导致：
 *   认领按钮条件 `status === 'PUBLISHED' && owner_union_id !== me.union_id`
 *   对组织者本人恒为 false —— 11 条全部不渲染「认领」，且没有任何解释。
 *
 * 现统一：公司发布的悬赏 owner_union_id 用 COMPANY_UNION_ID（非任何自然人），
 * 于是所有成员（含组织者本人）均可认领；后台审核可见性需同步放行该虚拟主体。
 */
export const COMPANY_UNION_ID = 'COMPANY';
export const COMPANY_OWNER_NAME = '公司';

/** 是否为「公司发布」的悬赏（非任何个人所有） */
export function isCompanyBounty(b: Pick<Bounty, 'owner_union_id'>): boolean {
  return b.owner_union_id === COMPANY_UNION_ID;
}

/**
 * 大厅卡片上「为什么不能认领」的解释文案（可认领时返回 null）。
 * v1 / v2 共用，避免再次出现「没按钮又没解释」的黑盒感。
 */
export function claimHint(b: Bounty, meUnionId: string): string | null {
  if (b.status === 'PUBLISHED') {
    if (b.owner_union_id === meUnionId) return '我发布的，不可认领';
    return null;
  }
  if (b.status === 'CLAIMED') {
    return b.claimant_union_id === meUnionId ? null : `已被 ${b.claimant_name ?? '他人'} 认领`;
  }
  if (b.status === 'MEMBER_DRAFT') return '草稿，尚未提交审核';
  if (b.status === 'PENDING_REVIEW') return '组织者审核中，尚未开放认领';
  if (b.status === 'REJECTED') return '已驳回，发布人修改后可重提';
  if (b.status === 'SUBMITTED') return '方案已提交，组织者审核中';
  if (b.status === 'APPROVED') return '已通过，本轮已结束';
  if (b.status === 'EXPIRED') return '已超期释放，等待组织者重新开放';
  return null;
}
