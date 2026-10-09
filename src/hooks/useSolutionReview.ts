/**
 * V8.3-10.09 悬赏方案审核（口径 2=B：**组织者 + 悬赏发布者**双通道）
 *
 * 原来只有 `/admin/bounty` 一条审核路径，且仅 ORGANIZER/ADMIN 可进 ——
 * 悬赏发布者想审自己那条的方案，没有任何入口。
 * 现在：C 端 `actionsOf` 里给发布者补「审核方案」按钮，复用同一份审核逻辑，
 * 避免后台与C 端两处实现漂移。
 *
 * 回避原则（与后台一致）：**发布者不能审自己发布的悬赏方案**。
 * 典型场景：组织者自己发了悬赏又去认领/组织评审 —— 既当发布者又当评审，
 * 不能自己给自己通过。所以即使发布者点进来也要拦。
 */
import { App as AntApp } from 'antd';
import { useStore } from '@/store/store';
import type { Bounty } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';

export function useSolutionReview() {
  const { db, me, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();

  /** 能不能由「当前身份」审这条悬赏的方案：必须是发布者本人在 SUBMITTED 态 */
  const canReviewAsOwner = (b: Bounty): boolean =>
    b.owner_union_id === me.union_id && b.status === 'SUBMITTED';

  /** 通过：入账到认领人 */
  const approve = (b: Bounty) => {
    if (b.owner_union_id === me.union_id) {
      message.warning('回避原则：你不能审核自己发布的悬赏方案');
      return;
    }
    modal.confirm({
      title: '方案审核通过？',
      content: `通过后按悬赏积分 ${b.points} 自动入账到 ${b.claimant_name}，来源标记 bounty。`,
      onOk: () => {
        setDb((p) => ({
          ...p,
          bounties: p.bounties.map((x) => (x.id === b.id ? { ...x, status: 'APPROVED' } : x)),
          pointRecords: [{
            id: `PR${Date.now()}`, union_id: b.claimant_union_id!, name: b.claimant_name!,
            source: '悬赏通过', points: b.points,
            /** 优先按悬赏所属届次记账，历史数据缺字段时回退当前届次（V8.3-10.09 修硬编码） */
            campaign_id: b.campaign_id || db.campaigns?.[0]?.id || '',
            remark: `${b.title} 方案审核通过`, created_at: DEMO_TODAY,
          }, ...p.pointRecords],
        }));
        log('悬赏方案通过（发布者通道）', b.title, `积分 ${b.points} 入账 ${b.claimant_name}`);
        message.success('已通过，积分已入账');
      },
    });
  };

  /** 驳回：退回 CLAIMED 让认领人重新提交（口径 1=A） */
  const reject = (b: Bounty, reason: string) => {
    if (b.owner_union_id === me.union_id) {
      message.warning('回避原则：你不能审核自己发布的悬赏方案');
      return;
    }
    if (reason.trim().length < 10) { message.error('驳回理由至少 10 字'); return; }
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) => (x.id === b.id
        ? { ...x, status: 'CLAIMED', reject_reason: reason, solution: undefined, solution_fields: undefined }
        : x)),
    }));
    log('方案驳回（发布者通道）', b.title, `理由：${reason}（已退回认领人，可重新提交）`);
    message.success('已驳回，方案退回认领人，可重新提交');
  };

  return { canReviewAsOwner, approve, reject };
}
