import { Avatar, Button, Card, Col, Empty, List, Progress, Row, Space, Statistic, Table, Tabs, Tag, Typography, App as AntApp, Rate, Popconfirm } from 'antd';
import { CalendarOutlined, CheckCircleOutlined, StarFilled, TeamOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { SoftTag, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';

export default function ExpertWorkbench() {
  const { db, me, setDb, log } = useStore();
  const { message } = AntApp.useApp();
  const expert = db.experts.find((e) => e.union_id === me.union_id);

  if (!expert) {
    return (
      <Card>
        <Empty description="当前身份不是问诊专家，请切换为专家身份（如刘晓东 / 李慧敏）查看专家工作台">
          <Link to="/clinic"><Button type="primary">去专家门诊</Button></Link>
        </Empty>
      </Card>
    );
  }

  const schedules = db.schedules.filter((s) => s.expert_id === expert.id);
  const bookings = db.bookings.filter((b) => b.expert_id === expert.id);
  const pending = bookings.filter((b) => b.status === '待就诊');
  const reviews = db.reviews.filter((r) => r.expert_id === expert.id);
  const openSlots = schedules.filter((s) => s.status === 'OPEN').length;
  const doneRate = Math.round((bookings.filter((b) => b.status === '已完成').length / Math.max(1, bookings.length)) * 100);

  const finish = (bookingId: string) => {
    setDb((p) => ({
      ...p,
      bookings: p.bookings.map((b) => (b.id === bookingId ? { ...b, status: '已完成' } : b)),
    }));
    log('标记就诊完成', bookingId, '触发学员评价提醒（24 小时内可评）');
    message.success('已标记完成，学员将收到评价提醒');
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={16} align="middle" style={{
        background: GRADIENT.hero, borderRadius: 20, padding: '22px 24px',
        color: '#fff', boxShadow: '0 8px 24px rgba(255, 107, 53, 0.22)',
      }}>
        <Col>
          <Avatar size={56} style={{ background: 'rgba(255,255,255,0.22)', color: '#fff', fontWeight: 700, fontSize: 22, border: '2px solid rgba(255,255,255,0.5)' }}>
            {expert.name.slice(0, 1)}
          </Avatar>
        </Col>
        <Col flex="auto">
          <Space size={8} wrap>
            <Typography.Title level={4} style={{ margin: 0, color: '#fff', fontSize: 21 }}>{expert.name} · 专家工作台</Typography.Title>
            <span style={{
              background: 'rgba(255,255,255,0.22)', color: '#fff', fontSize: 11, fontWeight: 600,
              padding: '2px 8px', borderRadius: 6,
            }}>{expert.title}</span>
            {expert.cert.map((c) => (
              <span key={c} style={{
                background: 'rgba(255,255,255,0.22)', color: '#fff', fontSize: 11, fontWeight: 600,
                padding: '2px 8px', borderRadius: 6,
              }}>{c}</span>
            ))}
          </Space>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 6 }}>
            {expert.dept_name} · 擅长：{expert.expertise_tags.join(' / ')}
          </div>
        </Col>
        <Col>
          <Space size={28}>
            {[
              { l: '综合评分', v: expert.rating_avg.toFixed(1), icon: <StarFilled /> },
              { l: '累计接诊', v: expert.serve_count },
              { l: '接诊积分', v: expert.points },
            ].map((m) => (
              <div key={m.l} style={{ textAlign: 'center' }}>
                <div className="num" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
                  {m.v}{m.icon}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>{m.l}</div>
              </div>
            ))}
          </Space>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}><StatCard icon={<CalendarOutlined />} label="可约号源" value={openSlots} tone="primary" /></Col>
        <Col xs={12} sm={6}><StatCard icon={<TeamOutlined />} label="待接诊" value={pending.length} tone="blue" /></Col>
        <Col xs={12} sm={6}><StatCard icon={<StarFilled />} label="评价条数" value={reviews.length} tone="purple" /></Col>
        <Col xs={12} sm={6}><StatCard icon={<CheckCircleOutlined />} label="履约率" value={`${doneRate}%`} tone="green" /></Col>
      </Row>

      <Card>
        <Tabs
          items={[
            {
              key: 'pending', label: `待接诊（${pending.length}）`,
              children: pending.length === 0 ? <Empty description="暂无待接诊" /> : (
                <List
                  dataSource={pending}
                  renderItem={(b) => (
                    <List.Item
                      actions={[
                        <Popconfirm key="f" title="标记为已完成？" onConfirm={() => finish(b.id)}>
                          <Button size="small" type="primary" icon={<CheckCircleOutlined />}>标记完成</Button>
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Avatar style={{ background: GRADIENT.primary, fontWeight: 700 }}>{b.name.slice(0, 1)}</Avatar>}
                        title={<span>{b.name} · {b.date} {b.slot} · {b.type}</span>}
                        description={<span style={{ fontSize: 13 }}>卡点：{b.question}</span>}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'schedule', label: `我的排班与号源（${schedules.length}）`,
              children: (
                <Table
                  size="small" rowKey="id" pagination={{ pageSize: 8 }} dataSource={schedules}
                  columns={[
                    { title: '日期', dataIndex: 'date' },
                    { title: '时段', dataIndex: 'slot' },
                    { title: '形式', dataIndex: 'type' },
                    { title: '容量', dataIndex: 'capacity', render: (v: number, r) => <span className="num">{r.booked}/{v}</span> },
                    { title: '地点/链接', dataIndex: 'place_or_link' },
                    {
                      title: '状态', dataIndex: 'status',
                      render: (v: string) => <SoftTag text={v} tone={v === 'OPEN' ? 'primary' : v === 'FULL' ? 'gray' : v === 'HOLIDAY' ? 'gold' : 'gray'} />,
                    },
                    {
                      title: '操作',
                      render: (_, r) => (
                        <Button
                          size="small" type="link"
                          onClick={() => {
                            setDb((p) => ({
                              ...p,
                              schedules: p.schedules.map((x) => (x.id === r.id
                                ? { ...x, status: x.status === 'CLOSED' ? 'OPEN' : 'CLOSED' } : x)),
                            }));
                            message.success('排班状态已更新');
                          }}
                        >{r.status === 'CLOSED' ? '开放' : '停诊'}</Button>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'reviews', label: `我的评价（${reviews.length}）`,
              children: reviews.length === 0 ? <Empty description="暂无评价" /> : (
                <List
                  dataSource={reviews}
                  renderItem={(r) => (
                    <List.Item actions={[<Rate key="r" disabled allowHalf value={r.rating} style={{ fontSize: 12 }} />]}>
                      <List.Item.Meta
                        avatar={<Avatar style={r.anonymous ? { background: '#94A3B8' } : { background: GRADIENT.primary, fontWeight: 700 }}>
                          {r.anonymous ? '匿' : (db.users.find((u) => u.union_id === r.rater_union_id)?.name ?? '?').slice(0, 1)}
                        </Avatar>}
                        title={r.anonymous ? '匿名用户' : db.users.find((u) => u.union_id === r.rater_union_id)?.name}
                        description={<span style={{ fontSize: 13 }}>{r.comment}（{r.created_at}）</span>}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'stats', label: '接诊统计',
              children: (
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span>好评率</span><span className="num">{Math.round((reviews.filter((r) => r.rating >= 4).length / Math.max(1, reviews.length)) * 100)}%</span>
                        </div>
                        <Progress percent={Math.round((reviews.filter((r) => r.rating >= 4).length / Math.max(1, reviews.length)) * 100)} strokeColor={COLOR.primary} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span>履约率</span><span className="num">{doneRate}%</span>
                        </div>
                        <Progress percent={doneRate} strokeColor={COLOR.primary} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span>号源使用率</span>
                          <span className="num">{Math.round((schedules.reduce((a, b) => a + b.booked, 0) / Math.max(1, schedules.reduce((a, b) => a + b.capacity, 0))) * 100)}%</span>
                        </div>
                        <Progress percent={Math.round((schedules.reduce((a, b) => a + b.booked, 0) / Math.max(1, schedules.reduce((a, b) => a + b.capacity, 0))) * 100)} strokeColor={COLOR.primary} />
                      </div>
                    </Space>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Card size="small" title="接诊记录">
                      <List
                        size="small"
                        dataSource={bookings.filter((b) => b.status === '已完成')}
                        locale={{ emptyText: '暂无' }}
                        renderItem={(b) => (
                          <List.Item>
                            <Space size={8}><TeamOutlined /><span>{b.name} · {b.date} {b.slot}</span></Space>
                          </List.Item>
                        )}
                      />
                    </Card>
                  </Col>
                </Row>
              ),
            },
          ]}
        />
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        演示日期 {DEMO_TODAY} · 专家不可接诊本人作业相关评分场景（回避原则）
      </Typography.Text>
    </Space>
  );
}
