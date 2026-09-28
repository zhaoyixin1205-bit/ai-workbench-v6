/**
 * V4.0 U-2 结案 · 数据范围受限提示（统一口径）
 *
 * 背景：CR-02 后「角色并集只放大功能入口、不放大数据范围」，导致 EXPERT（scope=SELF）
 * 进入后台页时看到的数据极少，容易被误认为「系统没数据 / 坏了」。
 * 冰艳拍板口径：**严格本人 + 用文案解释清楚**，不放开数据范围（避免专家看到同事作业的公平性质疑）。
 *
 * 设计要点：
 * 1. 四个后台页（进度看板 / 作业管理 / 评分卡管理 / 悬赏审核）共用这一套文案，避免同一件事四种说法；
 * 2. 命中 EXPERT 身份时，额外说明「专家默认仅本人」这条规则，并给出求助出口；
 * 3. 受 flags.scopeNotice 控制，关闭 ≡ V3.0（完全不显示）。
 */
import { Alert } from 'antd';
import { useStore } from '@/store/store';

export function ScopeNotice({ count, unit = '条' }: { count: number; unit?: string }) {
  const { me, flags } = useStore();
  if (flags.scopeNotice === false) return null;
  if (me.scope_type === 'ALL') return null;

  const isSelf = me.scope_type === 'SELF';
  const isExpert = me.roles.includes('EXPERT');
  const label = isSelf ? '仅本人' : '本部门及以下';

  const expertLine = isExpert
    ? '专家身份的数据范围默认为「本人」，因此本页只统计您本人的记录；如需查看部门数据，请联系组织者开通。'
    : '如需查看更多数据，请联系组织者调整数据范围。';

  return (
    <Alert
      type={isSelf ? 'info' : 'warning'}
      showIcon
      message={`数据范围：${label} · 当前可见 ${count} ${unit}`}
      description={`V4.0 CR-02：角色并集只放大功能入口，不放大数据范围；导出与批量操作同样只作用于范围内的记录。${isSelf ? ` ${expertLine}` : ''}`}
    />
  );
}

export default ScopeNotice;
