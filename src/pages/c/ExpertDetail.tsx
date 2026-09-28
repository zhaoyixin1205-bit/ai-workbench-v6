import { Avatar, Button, Card, Col, Empty, List, Progress, Rate, Row, Space, Statistic, Tag, Typography, Divider, App as AntApp, Modal, Input } from 'antd';
import { ArrowLeftOutlined, MedicineBoxOutlined, StarFilled, TrophyOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { SoftTag, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';

export default function ExpertDetail() {
  const { id } = useParams();
  const { db, me, setDb, log } = useStore();
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');

  const e = db.experts.find((x) => x.id === id);
  if (!e) return <Card>专家不存在</Card>;

  const reviews = db.reviews.filter((r) => r.expert_id === e.id && !r.hidden);
  const schedules = db.schedules.filter((s) => s.expert_id === e.id && s.status === 'OPEN').slice(0, 8);
  const minutes = [
    { id: 'M1', title: '提示词调优：让输出从「像财报」变成「人话」', date: '2026-09-22', tags: ['提示词', '客户赋能'], views: 128 },
    { id: 'M2', title: 'Skill 包结构校验失败的 5 个常见原因', date: '2026-09-19', tags: ['Skill 打包'], views: 96 },
    { id: 'M3', title: '企业知识库怎么用才不「答非所问」', date: '2026-09-15', tags: ['知识库'], views: 74 },
  ];

  const book = () => {
    if (question.trim().length < 5) { message.warning('请填写卡点描述'); return; }
    const sc = schedules[0];
    if (!sc) { message.warning('暂无可约号源'); return; }
    setDb((p) => ({
      ...p,
      bookings: [{
        id: `BK${Date.now()}`, schedule_id: sc.id, expert_id: e.id, expert_name: e.name,
        union_id: me.union_id, name: me.name, question, date: sc.date, slot: sc.slot,
        type: sc.capacity > 1 ? '直播' : '1v1', status: '待就诊', reviewed: false,
      }, ...p.bookings],
      schedules: p.schedules.map((x) => (x.id === sc.id ? { ...x, booked: x.booked + 1 } : x)),
    }));
    log('预约专家号源', `${e.name} ${sc.date} ${sc.slot}`, '从专家主页发起');
    message.success('预约成功');
    setOpen(false); setQuestion('');
  };

  return (
    <div style={{ paddingBottom: 72 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Link to="/clinic" style={{ color: COLOR.textSub, fontSize: 13, fontWeight: 500 }}>
          <ArrowLeftOutlined /> 返回专家门诊
        </Link>

        <Card styles={{ body: { padding: 0 } }}>
          <div style={{ padding: '22px 24px', background: GRADIENT.metric, borderBottom: `1px solid ${COLOR.borderLight}` }}>
          <Row gutter={16} align="middle">
            <Col>
              <Avatar size={64} style={{ background: GRADIENT.primary, fontWeight: 700, fontSize: 26, boxShadow: SHADOW.button }}>{e.name.slice(0, 1)}</Avatar>
            </Col>
            <Col flex="auto">
              <Space size={8} wrap>
                <Typography.Title level={4} style={{ margin: 0, fontSize: 21 }}>{e.name}</Typography.Title>
                <SoftTag text={e.title} tone="gray" />
                {e.cert.map((c) => <SoftTag key={c} text={c} tone="purple" />)}
                {e.status === '停诊' && <SoftTag text="停诊中" tone="red" />}
              </Space>
              <div style={{ color: COLOR.textSub, fontSize: 13, marginTop: 6 }}>{e.dept_name}</div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {e.expertise_tags.map((t) => <SoftTag key={t} text={t} tone="primary" />)}
              </div>
              <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0, color: COLOR.textSub, lineHeight: 1.75 }}>
                {e.intro}
              </Typography.Paragraph>
            </Col>
          </Row>
          </div>

          <div style={{ padding: 20 }}>
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={8}>
              <StatCard
                icon={<StarFilled />} label="综合评分" tone="primary"
                value={e.rating_avg} sub={`基于 ${reviews.length} 条评价`}
              />
            </Col>
            <Col xs={24} sm={8}>
              <StatCard icon={<MedicineBoxOutlined />} label="累计接诊" tone="blue" value={e.serve_count} sub="次" />
            </Col>
            <Col xs={24} sm={8}>
              <StatCard icon={<TrophyOutlined />} label="接诊积分" tone="purple" value={e.points} sub="积分入账" />
            </Col>
          </Row>
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: COLOR.textSub, marginBottom: 6 }}>
              <span>好评率</span>
              <span className="num" style={{ fontWeight: 700, color: COLOR.text }}>
                {Math.round((reviews.filter((r) => r.rating >= 4).length / Math.max(1, reviews.length)) * 100)}%
              </span>
            </div>
            <Progress percent={Math.round((reviews.filter((r) => r.rating >= 4).length / Math.max(1, reviews.length)) * 100)} strokeColor={COLOR.primary} size="small" />
          </div>
          </div>
        </Card>

        <Row gutter={16}>
          <Col xs={24} lg={14}>
            <Card title={<Space><TrophyOutlined />就诊评价（最新 {Math.min(10, reviews.length)} 条）</Space>}>
              {reviews.length === 0 ? <Empty description="暂无评价" /> : (
                <List
                  dataSource={reviews}
                  renderItem={(r) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<Avatar style={{ background: r.anonymous ? '#94A3B8' : COLOR.primary }}>
                          {r.anonymous ? '匿' : (db.users.find((u) => u.union_id === r.rater_union_id)?.name ?? '?').slice(0, 1)}
                        </Avatar>}
                        title={<Space size={8}>
                          <span>{r.anonymous ? '匿名用户' : db.users.find((u) => u.union_id === r.rater_union_id)?.name}</span>
                          <Rate disabled allowHalf value={r.rating / 1} style={{ fontSize: 12 }} />
                          <span style={{ fontSize: 12, color: COLOR.textSub }}>
                            专业 {r.dim_scores.专业度} · 响应 {r.dim_scores.响应速度} · 解决 {r.dim_scores.解决问题程度}
                          </span>
                        </Space>}
                        description={<>{r.comment}<div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{r.created_at}</div></>}
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="历史答疑纪要（可检索）">
              {minutes.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    padding: '10px 8px', margin: '0 -8px', borderRadius: 10,
                    borderBottom: i === minutes.length - 1 ? 'none' : '1px dashed #EFF0F3',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.background = COLOR.primaryLight; }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{m.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: COLOR.textMuted, marginTop: 6, flexWrap: 'wrap' }}>
                    <span>{m.date}</span><span>{m.views} 次检索</span>
                    {m.tags.map((t) => <SoftTag key={t} text={t} tone="gray" />)}
                  </div>
                </div>
              ))}
            </Card>
            <Card title="近期可约号源" style={{ marginTop: 16 }}>
              <Space wrap>
                {schedules.map((s) => (
                  <span key={s.id} style={{
                    background: COLOR.primaryLight, color: '#C2410C', fontSize: 12, fontWeight: 600,
                    padding: '5px 10px', borderRadius: 8, display: 'inline-block',
                  }}>
                    {s.date.slice(5)} {s.slot}（{s.capacity > 1 ? '直播' : '1v1'}）
                  </span>
                ))}
                {schedules.length === 0 && <Typography.Text type="secondary">暂无号源</Typography.Text>}
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 95,
        background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(10px)',
        borderTop: `1px solid ${COLOR.borderLight}`, boxShadow: '0 -4px 20px rgba(31, 41, 55, 0.06)',
        padding: '12px 16px', display: 'flex', justifyContent: 'center',
      }}>
        <Button type="primary" size="large" icon={<MedicineBoxOutlined />} disabled={e.status === '停诊'} onClick={() => setOpen(true)}>
          {e.status === '停诊' ? '该专家已停诊' : '预约挂号'}
        </Button>
      </div>

      <Modal open={open} title={`预约挂号 · ${e.name}`} onCancel={() => setOpen(false)} onOk={book} okText="确认预约">
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          将为你分配最近的可用号源：{schedules[0] ? `${schedules[0].date} ${schedules[0].slot}` : '暂无'}
        </Typography.Paragraph>
        <Input.TextArea rows={4} value={question} onChange={(ev) => setQuestion(ev.target.value)}
          placeholder="卡点描述（必填，≤200 字）" maxLength={200} showCount />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>演示日期 {DEMO_TODAY}</Typography.Text>
      </Modal>
    </div>
  );
}
