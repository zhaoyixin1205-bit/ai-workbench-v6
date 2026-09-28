import { Alert, Avatar, Button, Card, Col, Empty, InputNumber, List, Modal, Row, Space, Statistic, Switch, Table, Tabs, Tag, Typography, App as AntApp } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';

export default function ExpertAdmin() {
  const { db, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();
  const [leadDays, setLeadDays] = useState(7);
  const [duration, setDuration] = useState(30);
  const [capacity, setCapacity] = useState(1);

  const totalBookings = db.bookings.length;
  const done = db.bookings.filter((b) => b.status === '已完成').length;
  const noShow = db.bookings.filter((b) => b.status === '爽约').length;
  const avgRating = db.reviews.length
    ? Math.round((db.reviews.reduce((a, b) => a + b.rating, 0) / db.reviews.length) * 10) / 10 : 0;

  const hideReview = (id: string) => {
    modal.confirm({
      title: '隐藏该评价？',
      content: '专家申诉后经组织者核实可隐藏并注明原因，操作留痕。',
      onOk: () => {
        setDb((p) => ({ ...p, reviews: p.reviews.map((r) => (r.id === id ? { ...r, hidden: true } : r)) }));
        log('隐藏就诊评价', id, '专家申诉核实后隐藏');
        message.success('已隐藏并留痕');
      },
    });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="专家与排班管理" desc="专家名录、号源排班与履约监控" />

      <Row gutter={12}>
        {[
          { t: '在册专家', v: db.experts.filter((e) => e.status === '接诊中').length },
          { t: '累计预约', v: totalBookings },
          { t: '履约率', v: `${Math.round((done / Math.max(1, totalBookings)) * 100)}%` },
          { t: '爽约次数', v: noShow },
          { t: '平均满意度', v: avgRating },
          { t: '接诊积分发放', v: db.pointRecords.filter((p) => p.source === '专家接诊').reduce((a, b) => a + b.points, 0) },
        ].map((m) => (
          <Col xs={12} sm={4} key={m.t}>
            <StatCard label={m.t} value={m.v} />
          </Col>
        ))}
      </Row>

      <Card>
        <Tabs
          items={[
            {
              key: 'experts', label: '专家入驻与认证',
              children: (
                <Table
                  size="small" rowKey="id" pagination={false} dataSource={db.experts}
                  columns={[
                    {
                      title: '专家', render: (_, r) => (
                        <Space><Avatar size={32} style={{ background: COLOR.primary }}>{r.name.slice(0, 1)}</Avatar>
                          <div><b>{r.name}</b><div style={{ fontSize: 11, color: COLOR.textSub }}>{r.dept_name}</div></div>
                        </Space>
                      ),
                    },
                    { title: '头衔', dataIndex: 'title' },
                    {
                      title: '擅长领域', dataIndex: 'expertise_tags',
                      render: (v: string[]) => <Space size={2}>{v.map((t) => <Tag key={t}>{t}</Tag>)}</Space>,
                    },
                    {
                      title: '认证标识', dataIndex: 'cert',
                      render: (v: string[]) => v.length ? v.map((c) => <Tag key={c} color="purple">{c}</Tag>) : <Typography.Text type="secondary">未认证</Typography.Text>,
                    },
                    { title: '评分', dataIndex: 'rating_avg', render: (v: number) => <span className="num"><StarFilled style={{ color: '#F59E0B' }} /> {v}</span> },
                    { title: '接诊', dataIndex: 'serve_count', render: (v: number) => <span className="num">{v}</span> },
                    {
                      title: '状态', dataIndex: 'status',
                      render: (v: string) => <Tag color={v === '接诊中' ? 'green' : v === '停诊' ? 'default' : 'gold'}>{v}</Tag>,
                    },
                    {
                      title: '操作',
                      render: (_, r) => (
                        <Space size={4}>
                          <Button size="small" type="link" onClick={() => { log('授予认证标识', r.name, '官方认证'); message.success('已授予官方认证标识'); }}>授予认证</Button>
                          <Button size="small" type="link" danger onClick={() => {
                            setDb((p) => ({ ...p, experts: p.experts.map((x) => (x.id === r.id ? { ...x, status: x.status === '接诊中' ? '停诊' : '接诊中' } : x)) }));
                            message.success('排班状态已切换（停诊将自动通知已预约用户改约）');
                          }}>{r.status === '接诊中' ? '停诊' : '恢复接诊'}</Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'schedule', label: '排班审批与号源策略',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Card size="small" title="号源策略配置（仅影响放号后的新号源）">
                    <Space wrap size={24}>
                      <Space><span>放号提前天数</span><InputNumber min={1} max={30} value={leadDays} onChange={(v) => setLeadDays(Number(v))} /></Space>
                      <Space><span>单次时长（分钟）</span><InputNumber min={15} max={120} value={duration} onChange={(v) => setDuration(Number(v))} /></Space>
                      <Space><span>1v1 默认容量</span><InputNumber min={1} max={10} value={capacity} onChange={(v) => setCapacity(Number(v))} /></Space>
                      <Button type="primary" onClick={() => { log('号源策略变更', '放号规则', `提前 ${leadDays} 天 / ${duration} 分钟 / 容量 ${capacity}`); message.success('策略已保存'); }}>保存策略</Button>
                    </Space>
                  </Card>
                  <Table
                    size="small" rowKey="id" pagination={{ pageSize: 6 }} dataSource={db.schedules.slice(0, 40)}
                    columns={[
                      { title: '专家', render: (_, r) => db.experts.find((e) => e.id === r.expert_id)?.name },
                      { title: '日期', dataIndex: 'date' },
                      { title: '时段', dataIndex: 'slot' },
                      { title: '形式', dataIndex: 'type' },
                      { title: '已约/容量', render: (_, r) => <span className="num">{r.booked}/{r.capacity}</span> },
                      {
                        title: '状态', dataIndex: 'status',
                        render: (v: string) => <Tag color={v === 'OPEN' ? 'orange' : v === 'FULL' ? 'default' : v === 'HOLIDAY' ? 'gold' : 'gray'}>{v}</Tag>,
                      },
                      {
                        title: '操作',
                        render: (_, r) => (
                          <Button size="small" type="link" onClick={() => { log('排班审批', `${r.date} ${r.slot}`, '审批通过'); message.success('排班已审批'); }}>审批</Button>
                        ),
                      },
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: 'reviews', label: '评价监管',
              children: db.reviews.length === 0 ? <Empty description="暂无评价" /> : (
                <List
                  dataSource={db.reviews}
                  renderItem={(r) => (
                    <List.Item
                      actions={[
                        <Tag key="s" color={r.rating >= 4 ? 'green' : r.rating < 2 ? 'red' : 'gold'}>{r.rating} 星</Tag>,
                        r.hidden ? <Tag key="h">已隐藏</Tag> : <Button key="h" size="small" danger onClick={() => hideReview(r.id)}>隐藏</Button>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Avatar style={{ background: r.anonymous ? '#94A3B8' : COLOR.primary }}>
                          {r.anonymous ? '匿' : (db.users.find((u) => u.union_id === r.rater_union_id)?.name ?? '?').slice(0, 1)}
                        </Avatar>}
                        title={`专家：${db.experts.find((e) => e.id === r.expert_id)?.name} · 评价人：${r.anonymous ? '匿名' : db.users.find((u) => u.union_id === r.rater_union_id)?.name}`}
                        description={<span style={{ fontSize: 13 }}>{r.comment}（{r.created_at}）</span>}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'stats', label: '门诊统计',
              children: (
                <Row gutter={16}>
                  {db.experts.map((e) => (
                    <Col xs={24} sm={12} lg={8} key={e.id}>
                      <Card size="small" style={{ marginBottom: 12 }}>
                        <Space>
                          <Avatar style={{ background: COLOR.primary }}>{e.name.slice(0, 1)}</Avatar>
                          <div>
                            <b>{e.name}</b>
                            <div style={{ fontSize: 12, color: COLOR.textSub }}>
                              接诊 {e.serve_count} 次 · 评分 {e.rating_avg} · 积分 {e.points}
                            </div>
                          </div>
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              ),
            },
          ]}
        />
      </Card>

      <Alert type="info" showIcon
        message="专家供给不足时的兜底"
        description={`首批招募 5–10 名专家并设接诊激励积分；组织者可代排班；无号时推荐同领域专家。演示日期 ${DEMO_TODAY}`} />
    </Space>
  );
}
