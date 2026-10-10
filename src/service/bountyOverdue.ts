/**
 * V8.3-10.10 超期悬赏判定（口径 A：**只提醒组织者，不做自动流转**）
 *
 * 运营方 2026-10-10 拍板：悬赏到期后不加自动流转、不改业务状态，只提醒组织者。
 *
 * 为什么不自动流转（曾评估过，做了记录以免后人重复讨论）：
 *  - 需要定时任务，而项目目前**没有后台调度器**（systemd 只起了 node 服务）；
 *    靠「请求时惰性判断」会让「谁先打开页面谁改状态」，属隐式副作用，线上不好排查。
 *  - 误伤成本高：自动置EXPIRED 会**释放已认领人的名额**，若组织者本意是延期，
 *    成员的动作就白做了，且要手工恢复。
 *  - 线上实测（10-10）：11 条悬赏**全部未超期**，实际问题为 0，
 *    收益不足以支撑引入定时任务的风险。
 *
 * 所以只做提醒：组织者首页待办里看到「N 个悬赏已超期」，点进去一键「开放认领」。
 *
 * ⚠️ 判定口径（写清楚以免两版漂移）：
 *  - 「已超期」= due_date **早于今天**（当天到期算还在期内，不算超期）
 *  - 只统计**仍开放**的：PUBLISHED / CLAIMED
 *    （EXPIRED 已经是终态、APPROVED/REJECTED 是决策结果，都不该再提醒）
 */

export type OverdueBounty = {
  id: string;
  title: string;
  due_date: string;
  /** 是否有人已认领（有的话提醒语要说「释放名额」，没有则是「无人认领」） */
  claimed: boolean;
};

/**
 * @param bounties 悬赏列表
 * @param today 今天（YYYY-MM-DD）。显式传入而不是内部取`new Date()`——
 *   演示态与截图核验要能固定「今天」，否则同一天两次跑结果不同。
 */
export function overdueBountiesOf(
  bounties: { id: string; title: string; due_date: string; status: string; claimant_union_id?: string }[] | undefined,
  today: string,
): OverdueBounty[] {
  return (bounties ?? [])
    .filter((b) => b.status === 'PUBLISHED' || b.status === 'CLAIMED')
    .filter((b) => !!b.due_date && b.due_date < today)
    .map((b) => ({
      id: b.id,
      title: b.title,
      due_date: b.due_date,
      claimed: !!b.claimant_union_id,
    }));
}

/** 组织者待办文案：区分有无认领人 —— 组织者要据此判断是「延期」还是「释放名额」 */
export function overdueTodoText(list: OverdueBounty[]): string {
  if (list.length === 0) return '';
  if (list.length === 1) {
    const b = list[0];
    return b.claimed
      ? `悬赏「${truncate(b.title, 12)}」已超期，认领名额待释放`
      : `悬赏「${truncate(b.title, 12)}」已超期，无人认领`;
  }
  const claimed = list.filter((b) => b.claimed).length;
  return claimed > 0
    ? `${list.length} 个悬赏已超期（其中 ${claimed} 个需释放认领名额）`
    : `${list.length} 个悬赏已超期，均无人认领`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}