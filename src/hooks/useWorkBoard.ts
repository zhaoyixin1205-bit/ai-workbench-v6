import { useMemo } from 'react';
import { App as AntApp } from 'antd';
import { useStore } from '@/store/store';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { AssignmentSubmit } from '@/mock/types';
import dayjs from 'dayjs';

/**
 * 作业提报列表逻辑（P3-4 从 `pages/c/WorkList.tsx` :34-73 原样抽出）
 *
 * 与 P3-3 同范式：v1 一行未改，v2 复用同一份派生与写入逻辑，
 * 保证两版的分组口径、额度计算、撤回与入库申请行为完全一致。
 *
 * 仅额外补了两处空库保护（type / period 可能不存在），因为 v2 要在线上真实数据下运行。
 */
export function useWorkBoard() {
  const { db, me, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();

  const type = db.assignmentTypes[0];
  const period = type
    ? db.periods.find((p) => p.type_id === type.id && p.status === 'OPEN')
    : undefined;
  const daysLeft = period ? dayjs(period.end_at).diff(dayjs(DEMO_TODAY), 'day') : 0;
  const scoreCard = type ? db.scoreCards.find((c) => c.id === type.score_card_id) : undefined;

  const mine = useMemo(
    () =>
      db.submits
        .filter((s) => s.union_id === me.union_id)
        .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)),
    [db.submits, me.union_id]
  );

  const teamSubmits = useMemo(
    () => db.submits.filter((s) => s.dept_name.includes(me.dept_names[0]?.split('/').pop() ?? '')),
    [db.submits, me.dept_names]
  );

  const usedTimes = type && period
    ? mine.filter((s) => s.period_id === period.id && s.status !== 'DRAFT' && s.status !== 'WITHDRAWN').length
    : 0;
  const canSubmit = !!type && usedTimes < type.max_times;

  const groups: { key: string; title: string; items: AssignmentSubmit[] }[] = [
    { key: 'todo', title: '待提报', items: mine.filter((s) => s.status === 'DRAFT') },
    { key: 'done', title: '已提报', items: mine.filter((s) => !['DRAFT', 'WITHDRAWN'].includes(s.status)) },
    { key: 'withdrawn', title: '已撤回', items: mine.filter((s) => s.status === 'WITHDRAWN') },
  ];

  /** 撤回：释放一次提报额度，截止前可重新提报 */
  const withdraw = (s: AssignmentSubmit) => {
    modal.confirm({
      title: '撤回该提报？',
      content: '撤回后将释放一次提报额度，可在截止前重新提报。',
      okText: '确认撤回',
      okButtonProps: { danger: true },
      onOk: () => {
        setDb((p) => ({ ...p, submits: p.submits.map((x) => (x.id === s.id ? { ...x, status: 'WITHDRAWN' } : x)) }));
        log('撤回提报', s.code, '释放一次提报额度');
        message.success('已撤回');
      },
    });
  };

  /** 申请入库：达标作品进入待初审队列 */
  const applyAsset = (s: AssignmentSubmit) => {
    setDb((p) => ({
      ...p,
      assetApplies: [
        {
          id: `AA${Date.now()}`,
          submit_id: s.id,
          submit_title: s.title,
          applicant_union_id: me.union_id,
          applicant_name: me.name,
          status: '待初审',
          visible_scope: '全员',
          apply_reason: '作品已达标，申请入库供全员复用',
          created_at: DEMO_TODAY + ' 12:00',
        },
        ...p.assetApplies,
      ],
      submits: p.submits.map((x) => (x.id === s.id ? { ...x, status: 'ASSET_APPLYING' } : x)),
    }));
    log('发起入库申请', s.code, '进入待初审队列');
    message.success('入库申请已提交');
  };

  return {
    type, period, scoreCard, daysLeft,
    mine, teamSubmits, usedTimes, canSubmit, groups,
    withdraw, applyAsset,
  };
}
