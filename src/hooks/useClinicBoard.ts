import { useMemo, useState } from 'react';
import { App as AntApp } from 'antd';
import { useStore } from '@/store/store';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { noticeBookedToExpert } from '@/service/bookingNotice';
import type { ExpertSchedule } from '@/mock/types';

/**
 * 专家门诊逻辑（P3-4 从 `pages/c/Clinic.tsx` :19-59 原样抽出）
 *
 * 覆盖：专家检索（姓名 / 擅长 / 部门）、三种排序、排班按日期归组、号源原子扣减预约。
 * v1 一行未改，v2 复用同一份，两版写入结果（bookings / schedules / pointRecords）完全一致。
 */

export const SLOT_STATUS: Record<ExpertSchedule['status'], { text: string; color: string; bg: string }> = {
  OPEN: { text: '可约', color: '#FF6B35', bg: '#FFF1EB' },
  FULL: { text: '已满', color: '#6B7280', bg: '#F3F4F6' },
  CLOSED: { text: '停诊', color: '#9CA3AF', bg: '#F9FAFB' },
  HOLIDAY: { text: '休假', color: '#F59E0B', bg: '#FFF7ED' },
};

export function useClinicBoard() {
  const { db, me, setDb, log } = useStore();
  const { message } = AntApp.useApp();

  const [kw, setKw] = useState('');
  const [sort, setSort] = useState('评分');
  const [expertId, setExpertId] = useState(db.experts.filter((e) => !e.is_deleted)[0]?.id ?? '');
  const [booking, setBooking] = useState<ExpertSchedule | null>(null);
  const [question, setQuestion] = useState('');

  const experts = useMemo(() => {
    /** V8.3-10.08 需求③.1：已删除的专家不再出现在门诊列表（软删，不物理删） */
    let arr = db.experts.filter(
      (e) => !e.is_deleted && (!kw || e.name.includes(kw) || e.expertise_tags.some((t) => t.includes(kw)) || e.dept_name.includes(kw))
    );
    arr = [...arr].sort((a, b) =>
      sort === '评分' ? b.rating_avg - a.rating_avg : sort === '接诊量' ? b.serve_count - a.serve_count : 0
    );
    return arr;
  }, [db.experts, kw, sort]);

  const expert = db.experts.find((e) => e.id === expertId) ?? db.experts.filter((e) => !e.is_deleted)[0];
  const schedules = useMemo(
    () => db.schedules.filter((s) => s.expert_id === expertId).slice(0, 14),
    [db.schedules, expertId]
  );
  const dates = useMemo(() => [...new Set(schedules.map((s) => s.date))].sort(), [schedules]);

  /** 某专家的近期可约号数（列表卡上展示） */
  const openCount = (id: string) => db.schedules.filter((s) => s.expert_id === id && s.status === 'OPEN').length;

  /** 预约：号源原子扣减 + 生成预约单 + 专家接诊积分入账 */
  const book = () => {
    if (question.trim().length < 5) { message.warning('请填写卡点描述（≥5 字），禁止空预约'); return; }
    const sc = booking!;
    if (!expert) { message.warning('未选择专家'); return; }
    setDb((p) => ({
      ...p,
      // V8.3-10.08 需求③.4：预约成功后给专家发站内消息（原来只有一句「已推送钉钉待办」的文案）
      messages: noticeBookedToExpert(p.messages, {
        expertUnionId: expert.union_id, expertName: expert.name, actorName: me.name,
        date: sc.date, slot: sc.slot,
      }),
      schedules: p.schedules.map((x) =>
        x.id === sc.id
          ? { ...x, booked: x.booked + 1, status: x.booked + 1 >= x.capacity ? 'FULL' : 'OPEN' }
          : x
      ),
      bookings: [
        {
          id: `BK${Date.now()}`,
          schedule_id: sc.id,
          expert_id: expert.id,
          expert_name: expert.name,
          union_id: me.union_id,
          name: me.name,
          question,
          date: sc.date,
          slot: sc.slot,
          type: sc.capacity > 1 ? '直播' : '1v1',
          status: '待就诊',
          reviewed: false,
        },
        ...p.bookings,
      ],
      pointRecords: [
        {
          id: `PR${Date.now()}`,
          union_id: expert.union_id,
          name: expert.name,
          source: '专家接诊',
          points: 20,
          campaign_id: 'C2026Q4',
          remark: `接诊 ${me.name}`,
          created_at: DEMO_TODAY,
        },
        ...p.pointRecords,
      ],
    }));
    log('预约专家号源', `${expert.name} ${sc.date} ${sc.slot}`, '号源原子扣减成功');
    message.success(`预约成功！已通知 ${expert.name}（钉钉待办将在免登打通后接入）`);
    setBooking(null);
    setQuestion('');
  };

  return {
    kw, setKw, sort, setSort,
    expertId, setExpertId, expert, experts,
    schedules, dates, openCount,
    booking, setBooking, question, setQuestion, book,
  };
}
