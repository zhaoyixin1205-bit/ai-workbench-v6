/**
 * V8.3-10.08 需求③.4：预约链路站内消息
 *
 * 背景：预约/取消/改期三处原本只在 UI 上弹「已推送钉钉待办」的文案，
 * **一条消息都没写**（全库仅排班审批、入库驳回三处写 messages）。
 * 组织者要求「预约/取消/改期后通知对应专家」，钉钉待办需等免登打通后另做，
 * 本期只落**站内消息**（就是「我的消息」里能看到的那些）。
 *
 * 为什么单独开文件：这三个动作分散在 useClinicBoard（预约）、
 * MyBooking/MyBookingV2（取消）、ExpertAdmin(V2)（改期）三处，
 * 各写一遍格式必然漂移（有的带 type、有的不带；有的是群通知、有的发给本人）。
 */
import type { AppMessage } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';

/** 统一的消息 id 生成：同一毫秒内可能有多条，用随机后缀避免撞号 */
const mid = (prefix: string) => `${prefix}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;

/** 追加一条站内消息（返回新数组，不改原对象） */
function push(list: AppMessage[] | undefined, msg: Omit<AppMessage, 'id' | 'status' | 'sent_at' | 'channel'>): AppMessage[] {
  return [{
    id: mid('MSG'),
    channel: '站内',
    status: '未读',
    sent_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
    ...msg,
  }, ...(list ?? [])];
}

export interface BookingNoticeInput {
  /** 收件人（专家）的 union_id */
  expertUnionId: string;
  expertName: string;
  /** 操作人（学员） */
  actorName: string;
  date: string;
  slot: string;
}

/**
 * ⚠️ 通知口径（组织者 2026-10-08 拍板，勿擅自扩大范围）：
 *
 *   ① 员工预约 → 通知**该被预约的专家**
 *   ② 员工取消 → 通知**该被预约的专家**（并回补号源）
 *   ③ 专家被删除 → 通知**已预约该专家的学员**（人没了，必须让人改约）
 *   ④ 专家修改排期（改期 / 容量 / 时段）→ **不通知任何人**，组织者在后台留痕即可
 *
 * ④ 曾经实现过「改期通知学员」，被明确否掉了：排期调整是内部运营动作，
 * 学员不需要为此被打扰（本文件已删除 noticeRescheduleToStudents，避免后来人误用）。
 */

/** 学员预约成功 → 通知专家 */
export function noticeBookedToExpert(list: AppMessage[] | undefined, n: BookingNoticeInput): AppMessage[] {
  return push(list, {
    union_id: n.expertUnionId,
    type: '预约通知',
    title: `新的预约：${n.actorName} 预约了 ${n.date} ${n.slot}`,
    content: `${n.actorName} 预约了你 ${n.date} ${n.slot} 的号源，请按时接诊。若需调整，请在「专家与排班管理」中修改该时段。`,
  });
}

/** 学员取消 → 通知专家（号源已回补） */
export function noticeCancelToExpert(
  list: AppMessage[] | undefined,
  n: BookingNoticeInput,
  reason: string,
): AppMessage[] {
  return push(list, {
    union_id: n.expertUnionId,
    type: '取消通知',
    title: `预约已取消：${n.actorName} 取消了 ${n.date} ${n.slot}`,
    content: `${n.actorName} 取消了 ${n.date} ${n.slot} 的预约（${reason}），该号源已释放回可约池。`,
  });
}

/** 专家被停诊 → 通知已预约学员 */
export function noticeStopToStudents(
  list: AppMessage[] | undefined,
  students: { union_id: string; name: string }[],
  expertName: string,
): AppMessage[] {
  if (!students.length) return list ?? [];
  return students.reduce<AppMessage[]>(
    (acc, s) => push(acc, {
      union_id: s.union_id,
      type: '停诊通知',
      title: `${expertName} 暂停接诊，你的预约需要改约`,
      content: `${expertName} 已暂停接诊，你与其相关的预约需要重新安排，请关注后续通知或选择其他专家。`,
    }),
    list ?? []
  );
}