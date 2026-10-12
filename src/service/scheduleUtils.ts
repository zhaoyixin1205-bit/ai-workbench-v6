import dayjs from 'dayjs';
import type { ExpertSchedule } from '@/mock/types';

/**
 * 排班时间工具（2026-10-12 需求：专家排班策略）
 *
 * 背景：原时段是自由文本字符串（如 "09:00-10:00"），预置枚举只有整点 1 小时档；
 * 现要求「0 点 - 24 点任意时间段、不限制 1 小时」，且「过期号源员工端不展示、不可预约」。
 * 这里统一提供：过期判定 + 字符串↔时间区间的双向转换，供员工端过滤与后台录入共用。
 */

/** 解析 slot 的结束时间：支持 "HH:mm-HH:mm"（中英文冒号、空格、多种分隔符 - – ~ ～ 容错） */
export function parseSlotEndTime(slot: string): { h: number; m: number } | null {
  const m = String(slot ?? '').trim().match(/(\d{1,2})[:：](\d{2})\s*[-–~～]\s*(\d{1,2})[:：](\d{2})/);
  if (!m) return null;
  return { h: Number(m[3]), m: Number(m[4]) };
}

function todayStr(now: Date): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * 判断某排班是否已过期（相对真实当前时间）。
 * - 能解析结束时间：以「日期 + 结束时间」为准，早于 now 即过期（进行中 / 未开始的不算）。
 * - 不能解析结束时间：退化为按日期判断，日期早于今天才算过期（当天不误删未知格式）。
 * 注意：使用真实 new Date()，与演示基准日 DEMO_TODAY 无关 —— 线上为正式发布系统，以真实时间为准。
 */
export function isSchedulePast(s: Pick<ExpertSchedule, 'date' | 'slot'>, now: Date = new Date()): boolean {
  const end = parseSlotEndTime(s.slot);
  if (end) {
    const dt = new Date(`${s.date}T${String(end.h).padStart(2, '0')}:${String(end.m).padStart(2, '0')}:00`);
    return dt.getTime() < now.getTime();
  }
  return s.date < todayStr(now);
}

/** 把 "HH:mm-HH:mm" 字符串转成 TimePicker.RangePicker 需要的两个 Dayjs（无法解析返回 null） */
export function slotToRange(slot: string): [dayjs.Dayjs, dayjs.Dayjs] | null {
  const m = String(slot ?? '').trim().match(/(\d{1,2})[:：](\d{2})\s*[-–~～]\s*(\d{1,2})[:：](\d{2})/);
  if (!m) return null;
  return [dayjs(`${m[1]}:${m[2]}`, 'HH:mm'), dayjs(`${m[3]}:${m[4]}`, 'HH:mm')];
}

/** 把 RangePicker 的 [Dayjs, Dayjs] 值转回 "HH:mm-HH:mm" 字符串（非区间返回 null） */
export function rangeToSlot(range: unknown): string | null {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const [a, b] = range as [{ format?: (f: string) => string }, { format?: (f: string) => string }];
  if (!a || !b || typeof a.format !== 'function' || typeof b.format !== 'function') return null;
  return `${a.format('HH:mm')}-${b.format('HH:mm')}`;
}
