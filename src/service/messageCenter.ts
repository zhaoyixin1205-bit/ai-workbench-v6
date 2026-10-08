/**
 * 消息中心口径层（V8.3-10.08 · 需求⑤）
 *
 * 为什么单独开文件：未读数这一个口径，全站有 4 处各算一遍
 * （CLayout、CLayoutV2、Profile、ProfileV2），外加「点一下就变已读」的写库动作。
 * 只要有一处漏改，用户就会看到「点完了红点还在」或者「没点的也变已读」。
 * 这里收口成纯函数，四个调用点只负责渲染与写库。
 *
 * 两条口径（组织者拍板「顺带处理群通知」）：
 *   ① **个人红点只算发给本人的消息**（union_id === me.union_id）。
 *      群/全员通知（union_id === 'all'）是广播，不是「我的待办」——
 *      旧口径把它算进个人红点，结果 501 人的红点谁也消不掉（每条广播都要各自点开一遍）。
 *      现在广播仍出现在消息列表里（看得见），但不再挂红点。
 *   ② 点击整行即已读；已读消息保留在列表（不做「读后即焚」），
 *      但视觉上要与未读区分得出来，否则用户不知道点没点成功。
 */
import type { AppMessage, User } from '@/mock/types';

/** 广播消息的收件人标识 */
export const BROADCAST = 'all';

/** 消息列表：本人收到的 + 全员广播（按时间倒序，最新在上） */
export function visibleMessages(messages: AppMessage[] | undefined, me: Pick<User, 'union_id'>): AppMessage[] {
  return (messages ?? [])
    .filter((m) => m.union_id === me.union_id || m.union_id === BROADCAST)
    .slice()
    .sort((a, b) => (a.sent_at === b.sent_at ? (a.id < b.id ? 1 : -1) : a.sent_at < b.sent_at ? 1 : -1));
}

/** 是否是「我的未读」：只算本人专属，广播不进个人红点（口径①） */
export function isMyUnread(m: AppMessage, me: Pick<User, 'union_id'>): boolean {
  return m.status === '未读' && m.union_id === me.union_id;
}

/** 个人未读数：布局红点与个人中心 Tab 徽标必须用同一个函数，否则两处对不上 */
export function countMyUnread(messages: AppMessage[] | undefined, me: Pick<User, 'union_id'>): number {
  return (messages ?? []).filter((m) => isMyUnread(m, me)).length;
}

/** 本人未读消息 id：用于「全部已读」只改自己的，不误伤别人的 */
export function myUnreadIds(messages: AppMessage[] | undefined, me: Pick<User, 'union_id'>): string[] {
  return (messages ?? []).filter((m) => isMyUnread(m, me)).map((m) => m.id);
}

/**
 * 标记单条已读。
 * 两条约束（都是纵深防御，UI 层的 visibleMessages 已过滤，这里再挡一层）：
 *   ① 只改「发给本人」的 —— 别人的消息不该被我的点击改状态；
 *   ② 广播不改状态 —— 它不属于任何人的未读，改了会出现半读半未读的自相矛盾。
 */
export function markRead(messages: AppMessage[] | undefined, id: string, me: Pick<User, 'union_id'>): AppMessage[] {
  return (messages ?? []).map((m) =>
    m.id === id && m.union_id === me.union_id && m.status === '未读' ? { ...m, status: '已读' as const } : m
  );
}

/** 全部已读：只翻转本人的未读消息，广播保持原状 */
export function markAllMyRead(messages: AppMessage[] | undefined, me: Pick<User, 'union_id'>): AppMessage[] {
  const ids = new Set(myUnreadIds(messages, me));
  return (messages ?? []).map((m) => (ids.has(m.id) ? { ...m, status: '已读' as const } : m));
}

/** 未读行的展示权重：未读排前、同组内时间倒序（点开已读的下沉，列表更有秩序） */
export function sortForInbox(messages: AppMessage[], me: Pick<User, 'union_id'>): AppMessage[] {
  return messages
    .slice()
    .sort((a, b) => {
      const ua = isMyUnread(a, me) ? 0 : 1;
      const ub = isMyUnread(b, me) ? 0 : 1;
      if (ua !== ub) return ua - ub;
      return a.sent_at === b.sent_at ? (a.id < b.id ? 1 : -1) : a.sent_at < b.sent_at ? 1 : -1;
    });
}