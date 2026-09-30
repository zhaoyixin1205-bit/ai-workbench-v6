import { Avatar, AutoComplete, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, List, Modal, Progress, Row, Select, Space, Statistic, Table, Tabs, Tag, Typography, App as AntApp, Rate, Popconfirm } from 'antd';
import { CalendarOutlined, CheckCircleOutlined, StarFilled, TeamOutlined, PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { SoftTag, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
/* V7.0 CR-36：时段预置枚举 + 三种形式（拍板 8-C / 确认项 4） */
import { SCHEDULE_SLOTS, SCHEDULE_TYPES } from '@/constants/importSchemas';

export default function ExpertWorkbench() {
  const { db, me, setDb, log, flags } = useStore();
  const { message } = AntApp.useApp();
  /** V7.0 CR-36：专家自助排班申请（拍板 7-C） */
  const selfScheduleOn = flags.expertSelfSchedule !== false;
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm] = Form.useForm();
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

  /**
   * V7.0 CR-36：专家自助选择开放时段 —— 拍板 7-C：提交为「申请」，组织者审核后生效。
   * 与已有排班撞车时不静默覆盖，标记 conflict 交给组织者处理。
   */
  const myRequests = db.scheduleRequests.filter((r) => r.expert_id === expert.id);

  const submitApply = async () => {
    let vals: {
      date?: { format: (f: string) => string }; slot?: string; capacity?: number;
      type?: '1v1' | '直播' | '线下'; place_or_link?: string;
    };
    try {
      vals = await applyForm.validateFields();
    } catch {
      message.error('请填写完整后再提交');
      return;
    }
    const date = vals.date?.format('YYYY-MM-DD') ?? DEMO_TODAY;
    const slot = vals.slot ?? '';
    const conflict = db.schedules.some((s) => s.expert_id === expert.id && s.date === date && s.slot === slot)
      || myRequests.some((r) => r.date === date && r.slot === slot && r.status === '待审核');
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    setDb((p) => ({
      ...p,
      scheduleRequests: [{
        id: `SRQ${Date.now()}`, expert_id: expert.id, date, slot,
        capacity: Number(vals.capacity ?? 1), type: vals.type ?? '1v1',
        place_or_link: vals.place_or_link ?? '',
        status: '待审核' as const, conflict,
        applicant_union_id: me.union_id, created_at: at,
      }, ...p.scheduleRequests],
    }));
    log('提交排班申请', `${date} ${slot}`, conflict ? '与已有排班撞车，已标记待组织者处理' : '待组织者审核后生效');
    message.success(conflict ? '已提交（该时段已有排班，已标记撞车待组织者处理）' : '已提交，组织者审核通过后开放预约');
    setApplyOpen(false);
    applyForm.resetFields();
  };

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
                <>
                  {/* V7.0 CR-36：专家自助申请开放时段（拍板 7-C：提交为申请，组织者审核后生效） */}
                  {selfScheduleOn && (
                    <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
                      <Space wrap>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setApplyOpen(true)}>
                          申请开放时段
                        </Button>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          自行选择日期、时段、形式与容量；提交后由组织者审核，通过后才会开放预约。
                        </Typography.Text>
                      </Space>
                      {myRequests.length > 0 && (
                        <Table
                          size="small" rowKey="id" pagination={false} dataSource={myRequests}
                          columns={[
                            { title: '申请日期', dataIndex: 'date', width: 110 },
                            { title: '时段', dataIndex: 'slot', width: 120 },
                            { title: '形式', dataIndex: 'type', width: 80 },
                            { title: '容量', dataIndex: 'capacity', width: 70, render: (v: number) => <span className="num">{v}</span> },
                            { title: '地点/链接', dataIndex: 'place_or_link', ellipsis: true },
                            {
                              title: '状态', dataIndex: 'status', width: 120,
                              render: (v: string, r: { conflict?: boolean; review_note?: string }) => (
                                <Space size={4}>
                                  <Tag color={v === '已通过' ? 'green' : v === '已驳回' ? 'red' : 'gold'}>{v}</Tag>
                                  {r.conflict && <Tag color="red">撞车</Tag>}
                                </Space>
                              ),
                            },
                            { title: '提交时间', dataIndex: 'created_at', width: 150 },
                          ]}
                        />
                      )}
                    </Space>
                  )}
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
                </>
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

      {/* V7.0 CR-36：专家自助排班申请（拍板 7-C） */}
      <Modal
        open={applyOpen} title="申请开放时段" onCancel={() => setApplyOpen(false)}
        onOk={submitApply} okText="提交申请" destroyOnClose
      >
        <Form form={applyForm} layout="vertical" preserve={false}
          initialValues={{ capacity: 1, type: '1v1' }}>
          <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          {/* 拍板 8-C：预置时段优先，允许手工输入 */}
          <Form.Item name="slot" label="时段" rules={[{ required: true, message: '请选择或填写时段' }]}>
            <AutoComplete
              options={SCHEDULE_SLOTS.map((v) => ({ value: v }))}
              placeholder="选择预置时段，或手工输入"
              filterOption={(input, option) => String(option?.value ?? '').includes(input)}
            />
          </Form.Item>
          {/* 确认项 4：形式仅保留 3 种 */}
          <Form.Item name="type" label="形式" rules={[{ required: true }]}>
            <Select options={SCHEDULE_TYPES.map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="capacity" label="容量" rules={[{ required: true }]}>
            <InputNumber min={1} max={20} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="place_or_link" label="地点/链接">
            <Input placeholder="线上填会议链接，线下填地点" />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          提交后进入组织者审核队列；通过后才会开放预约。与该时段已有排班撞车时会标记「撞车」，由组织者决定如何处理。
        </Typography.Text>
      </Modal>
    </Space>
  );
}
