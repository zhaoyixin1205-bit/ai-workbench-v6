import { noticeCancelToExpert } from '@/service/bookingNotice';
import { Button, Card, Empty, Rate, Space, Typography, Modal, Input, Switch, App as AntApp } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CalendarOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, SoftTag } from '@/components/ui';
import type { Booking } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';

const STATUS: Record<Booking['status'], { tone: 'primary' | 'green' | 'gray' | 'red'; text: string }> = {
  待就诊: { tone: 'primary', text: '待就诊' },
  已完成: { tone: 'green', text: '已完成' },
  已取消: { tone: 'gray', text: '已取消' },
  爽约: { tone: 'red', text: '爽约' },
};

export default function MyBooking() {
  const { db, me, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();
  const [reviewing, setReviewing] = useState<Booking | null>(null);
  const [dim, setDim] = useState({ 专业度: 5, 响应速度: 5, 解决问题程度: 5 });
  const [comment, setComment] = useState('');
  const [anon, setAnon] = useState(false);

  const list = db.bookings.filter((b) => b.union_id === me.union_id);

  const cancel = (b: Booking) => {
    modal.confirm({
      title: '取消该预约？',
      content: '开始前 2 小时内不可取消（记为已使用）；因专家原因取消不计入学员。',
      onOk: () => {
        setDb((p) => {
          /** V8.3-10.08 需求③.4：取消要「回补号源 + 通知专家」。
            * 原实现只改 status，却提示「号源已释放」—— 号源其实没回补，
            * 专家那边该时段的名额被永久占掉（数据与提示不符的真 bug）。 */
          const expert = p.experts.find((e) => e.id === b.expert_id);
          return {
            ...p,
            schedules: p.schedules.map((sc) =>
              sc.id === b.schedule_id
                ? { ...sc, booked: Math.max(0, (sc.booked ?? 1) - 1), status: 'OPEN' as const }
                : sc
            ),
            messages: expert
              ? noticeCancelToExpert(p.messages, {
                  expertUnionId: expert.union_id, expertName: expert.name, actorName: me.name,
                  date: b.date, slot: b.slot,
                }, '学员主动取消')
              : p.messages,
            bookings: p.bookings.map((x) => (x.id === b.id ? { ...x, status: '已取消' } : x)),
          };
        });
        message.success('已取消，号源已回补并通知专家');
      },
    });
  };

  const submitReview = () => {
    const b = reviewing!;
    const rating = Math.round(((dim.专业度 + dim.响应速度 + dim.解决问题程度) / 3) * 10) / 10;
    setDb((p) => ({
      ...p,
      reviews: [{
        id: `R${Date.now()}`, booking_id: b.id, expert_id: b.expert_id, rater_union_id: me.union_id,
        dim_scores: dim, rating, comment, anonymous: anon, created_at: DEMO_TODAY + ' 18:00',
      }, ...p.reviews],
      bookings: p.bookings.map((x) => (x.id === b.id ? { ...x, reviewed: true } : x)),
    }));
    log('提交就诊评价', `${b.expert_name} ${b.date}`, `评分 ${rating}${anon ? '（匿名）' : ''}`);
    message.success('评价已提交，感谢反馈');
    setReviewing(null); setComment(''); setAnon(false);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Link to="/clinic" style={{ color: COLOR.textSub, fontSize: 13, fontWeight: 500 }}>
        <ArrowLeftOutlined /> 返回专家门诊
      </Link>
      <PageHeader title="我的预约" desc={`共 ${list.length} 条预约记录 · 演示日期 ${DEMO_TODAY}`} />

      {list.length === 0 ? (
        <Card><Empty description="还没有预约记录"><Link to="/clinic"><Button type="primary">去挂号</Button></Link></Empty></Card>
      ) : (
        list.map((b) => {
          const st = STATUS[b.status];
          return (
            <div key={b.id} className="wb-card wb-card-hover" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Space size={8} wrap>
                    <Typography.Text strong style={{ fontSize: 15 }}>{b.expert_name}</Typography.Text>
                    <SoftTag text={st.text} tone={st.tone} />
                    <SoftTag text={b.type} tone="blue" />
                  </Space>
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: COLOR.textSub, flexWrap: 'wrap' }}>
                    <span><CalendarOutlined style={{ marginRight: 4 }} />{b.date}</span>
                    <span><ClockCircleOutlined style={{ marginRight: 4 }} />{b.slot}</span>
                  </div>
                </div>
                <Space>
                  {b.status === '待就诊' && <Button size="small" danger onClick={() => cancel(b)}>取消预约</Button>}
                  {b.status === '已完成' && !b.reviewed && (
                    <Button size="small" type="primary" onClick={() => setReviewing(b)}>去评价</Button>
                  )}
                  {b.status === '已完成' && b.reviewed && (
                    <SoftTag text="✓ 已评价" tone="green" />
                  )}
                </Space>
              </div>
              <div style={{
                marginTop: 12, padding: '10px 12px', background: '#FAFBFC',
                borderRadius: 12, fontSize: 13, color: COLOR.textSub, lineHeight: 1.7,
              }}>
                <span style={{ color: COLOR.textMuted, fontSize: 12 }}>卡点描述：</span>{b.question}
              </div>
            </div>
          );
        })
      )}

      <Modal open={!!reviewing} title={`就诊评价 · ${reviewing?.expert_name}`} onCancel={() => setReviewing(null)} onOk={submitReview} okText="提交评价">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {(['专业度', '响应速度', '解决问题程度'] as const).map((k) => (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#FAFBFC', borderRadius: 12, padding: '8px 14px',
            }}>
              <span style={{ width: 96, fontSize: 13, fontWeight: 600 }}>{k}</span>
              <Rate value={dim[k]} onChange={(v) => setDim({ ...dim, [k]: v })} />
            </div>
          ))}
          <Input.TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="文字评价（选填，≤300 字）" maxLength={300} showCount />
          <Space>
            <Switch checked={anon} onChange={setAnon} size="small" />
            <span style={{ fontSize: 13 }}>匿名评价（后端仍留真实 unionId，可双人授权追溯）</span>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            提交后 24 小时内可修改一次；不可自行删除，需删除由组织者处理并留痕。
          </Typography.Text>
        </Space>
      </Modal>
    </Space>
  );
}
