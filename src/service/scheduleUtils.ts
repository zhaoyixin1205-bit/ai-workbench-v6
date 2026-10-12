import dayjs from 'dayjs';
import type { ExpertSchedule } from '@/mock/types';

/**
 * 排班时间工具（2026-10-12 需求：专家排班策略 + 数据格式兼容）
 *
 * 背景：原时段是自由文本字符串（如 "09:00-10:00"），预置枚举只有整点 1 小时档；
 * 现要求「0 点 - 24 点任意时间段、不限制 1 小时」，且「过期号源员工端不展示、不可预约」。
 * 这里统一提供：过期判定 + 日期归一化 + 字符串↔时间区间的双向转换，供员工端过滤与后台录入共用。
 *
 * ⚠️ 数据现状（2026-10-12 线上实测）：历史排班的 date 存的是 UTC ISO 串
 * （如 "2026-10-12T16:00:00.000Z" = 北京时间 2026-10-13 00:00，真实业务日期是 10-13），
 * 而新后台录入的是纯 "YYYY-MM-DD"。所有展示与判定必须先过 scheduleLocalDate 归一化，
 * 严禁直接 date.slice(5) 或拿 ISO 串手工拼时间。
 */

/** 解析 slot 的结束时间：支持 "HH:mm-HH:mm"（中英文冒号、空格、多种分隔符 - – ~ ～ 容错） */
export function parseSlotEndTime(slot: string): { h: number; m: number } | null {
  const m = String(slot ?? '').trim().match(/(\d{1,2})[:：](\d{2})\s*[-–~～]\s*(\d{1,2})[:：](\d{2})/);
  if (!m) return null;
  return { h: Number(m[3]), m: Number(m[4]) };
}

/**
 * 归一化排班日期 → 本地时区 "YYYY-MM-DD" 键。
 * 兼容三种存储形态：
 *   ① 纯 "YYYY-MM-DD"（新后台录入）→ 原样返回，不做时区换算；
 *   ② ISO 串（历史 seed，如 "2026-10-12T16:00:00.000Z"）→ 按本地时区换算出真实业务日期；
 *   ③ 其它可解析日期 → 本地年月日；完全不可解析 → 前缀兜底或 null。
 */
export function scheduleLocalDate(date: string): string | null {
  const s = String(date ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** 排班日期 → 展示标签 "MM-DD · 周X"（与门诊页「未来两周排班」同口径） */
export function formatScheduleDay(date: string): string {
  const key = scheduleLocalDate(date) ?? String(date ?? '');
  const d = dayjs(key);
  if (!d.isValid()) return key;
  return `${d.format('MM-DD')} · 周${'日一二三四五六'[d.day()]}`;
}

function todayStr(now: Date): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * 判断某排班是否已过期（相对真实当前时间）。
 * - 日期先过 scheduleLocalDate 归一化（修复历史 ISO 串导致 Invalid Date、过滤永不命中的缺陷）；
 * - 能解析结束时间：以「归一化日期 + 结束时间」为准，早于 now 即过期（进行中 / 未开始的不算）；
 * - 不能解析结束时间：退化为按归一化日期判断，日期早于今天才算过期（当天不误删未知格式）；
 * - 日期完全不可解析：不过滤（宁可多展示也不误删）。
 * 注意：使用真实 new Date()，与演示基准日 DEMO_TODAY 无关 —— 线上为正式发布系统，以真实时间为准。
 */
export function isSchedulePast(s: Pick<ExpertSchedule, 'date' | 'slot'>, now: Date = new Date()): boolean {
  const key = scheduleLocalDate(s.date);
  if (!key) return false;
  const end = parseSlotEndTime(s.slot);
  if (end) {
    const dt = new Date(`${key}T${String(end.h).padStart(2, '0')}:${String(end.m).padStart(2, '0')}:00`);
    return dt.getTime() < now.getTime();
  }
  return key < todayStr(now);
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
