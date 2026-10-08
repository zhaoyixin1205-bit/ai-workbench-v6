import { noticeCancelToExpert } from '@/service/bookingNotice';
import { App as AntApp, Button, Input, Modal, Rate, Switch } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { SoftTag } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { Booking } from '@/mock/types';
import '../../theme/v2/template.css';

/**
 * 我的预约 v2（P3-4）
 *
 * 路由 /clinic/mine 保留（旧链接不死）；同时在 ClinicV2 提供摘要入口，实现 P3-2 拍板的「合并」。
 *
 * 功能对等（对照 v1 `pages/c/MyBooking.tsx`）：
 *   预约列表（专家、状态、类型、日期时段、卡点描述）
 *   取消预约（确认弹窗，含「开始前 2 小时内不可取消」口径）
 *   已完成未评价 → 去评价；已评价 → 已评价标记
 *   评价弹窗：三维度打分、文字评价（≤300 字）、匿名开关、24 小时内可改一次的说明
 * 行为与 v1 同源，v1 一行未改。
 */
const STATUS: Record<Booking['status'], string> = {
  待就诊: 'run',
  已完成: 'ok',
  已取消: 'id',
  爽约: 'er',
};

export default function MyBookingV2() {
  const { db, me, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();
  const [reviewing, setReviewing] = useState<Booking | null>(null);
  const [dim, setDim] = useState({ 专业度: 5, 响应速度: 5, 解决问题程度: 5 });
  const [comment, setComment] = useState('');
  const [anon, setAnon] = useState(false);

  const list = db.bookings.filter((x) => x.union_id === me.union_id);

  const cancel = (bk: Booking) => {
    modal.confirm({
      title: '取消该预约？',
      content: '开始前 2 小时内不可取消（记为已使用）；因专家原因取消不计入学员。',
      onOk: () => {
        setDb((p) => {
          /** V8.3-10.08 需求③.4：取消要「回补号源 + 通知专家」。
            * 原实现只改 status，却提示「号源已释放」—— 号源其实没回补，
            * 专家那边该时段的名额被永久占掉（数据与提示不符的真 bug）。 */
          const expert = p.experts.find((e) => e.id === bk.expert_id);
          return {
            ...p,
            schedules: p.schedules.map((sc) =>
              sc.id === bk.schedule_id
                ? { ...sc, booked: Math.max(0, (sc.booked ?? 1) - 1), status: 'OPEN' as const }
                : sc
            ),
            messages: expert
              ? noticeCancelToExpert(p.messages, {
                  expertUnionId: expert.union_id, expertName: expert.name, actorName: me.name,
                  date: bk.date, slot: bk.slot,
                }, '学员主动取消')
              : p.messages,
            bookings: p.bookings.map((x) => (x.id === bk.id ? { ...x, status: '已取消' } : x)),
          };
        });
        message.success('已取消，号源已回补并通知专家');
      },
    });
  };

  const submitReview = () => {
    const bk = reviewing!;
    const rating = Math.round(((dim.专业度 + dim.响应速度 + dim.解决问题程度) / 3) * 10) / 10;
    setDb((p) => ({
      ...p,
      reviews: [{
        id: `R${Date.now()}`, booking_id: bk.id, expert_id: bk.expert_id, rater_union_id: me.union_id,
        dim_scores: dim, rating, comment, anonymous: anon, created_at: DEMO_TODAY + ' 18:00',
      }, ...p.reviews],
      bookings: p.bookings.map((x) => (x.id === bk.id ? { ...x, reviewed: true } : x)),
    }));
    log('提交就诊评价', `${bk.expert_name} ${bk.date}`, `评分 ${rating}${anon ? '（匿名）' : ''}`);
    message.success('评价已提交，感谢反馈');
    setReviewing(null); setComment(''); setAnon(false);
  };

  return (
    <div>
      <Link to="/clinic" className="wb2-note" style={{ display: 'inline-block', marginBottom: 'var(--wb-space-3)' }}>
        <ArrowLeftOutlined /> 返回专家门诊
      </Link>

      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">我的预约</div>
          <div className="wb2-ph-d">共 {list.length} 条预约记录 · 演示日期 {DEMO_TODAY}</div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="wb2-empty">
          <div className="ic"><CalendarOutlined /></div>
          <div className="t">还没有预约记录</div>
          <div className="d">找到合适的专家，把卡点一次性问清楚</div>
          <Link to="/clinic"><Button type="primary">去挂号</Button></Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wb-space-4)' }}>
          {list.map((bk) => (
            <div className="wb2-card" key={bk.id}>
              <div className="wb2-card-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--wb-space-3)', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--wb-fs-lg)', fontWeight: 700, color: 'var(--wb-ink-1)' }}>{bk.expert_name}</span>
                      <span className={`wb2-tag ${STATUS[bk.status]}`}><i className="d" />{bk.status}</span>
                      <SoftTag text={bk.type} tone="blue" />
                    </div>
                    <div style={{
                      display: 'flex', gap: 'var(--wb-space-4)', marginTop: 'var(--wb-space-2)',
                      fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-2)', flexWrap: 'wrap',
                    }}>
                      <span><CalendarOutlined /> {bk.date}</span>
                      <span><ClockCircleOutlined /> {bk.slot}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--wb-space-2)', alignItems: 'flex-start' }}>
                    {bk.status === '待就诊' && <Button size="small" danger onClick={() => cancel(bk)}>取消预约</Button>}
                    {bk.status === '已完成' && !bk.reviewed && (
                      <Button size="small" type="primary" onClick={() => setReviewing(bk)}>去评价</Button>
                    )}
                    {bk.status === '已完成' && bk.reviewed && <SoftTag text="✓ 已评价" tone="green" />}
                  </div>
                </div>
                <div className="wb2-quote" style={{ marginTop: 'var(--wb-space-3)' }}>
                  <span className="wb2-note">卡点描述：</span>{bk.question}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!reviewing} title={`就诊评价 · ${reviewing?.expert_name}`} onCancel={() => setReviewing(null)} onOk={submitReview} okText="提交评价">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wb-space-3)' }}>
          {(['专业度', '响应速度', '解决问题程度'] as const).map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 96, fontSize: 'var(--wb-fs-label)', fontWeight: 600 }}>{k}</span>
              <Rate value={dim[k]} onChange={(v) => setDim({ ...dim, [k]: v })} />
            </div>
          ))}
          <Input.TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="文字评价（选填，≤300 字）" maxLength={300} showCount />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch checked={anon} onChange={setAnon} size="small" />
            <span style={{ fontSize: 'var(--wb-fs-label)' }}>匿名评价（后端仍留真实 unionId，可双人授权追溯）</span>
          </div>
          <div className="wb2-note">提交后 24 小时内可修改一次；不可自行删除，需删除由组织者处理并留痕。</div>
        </div>
      </Modal>
    </div>
  );
}
