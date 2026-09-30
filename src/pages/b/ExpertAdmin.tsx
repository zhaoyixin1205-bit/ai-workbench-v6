import { Alert, Avatar, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, List, Modal, Row, Select, Space, Statistic, Switch, Table, Tabs, Tag, Typography, App as AntApp } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { ExpertSchedule } from '@/mock/types';
import BatchImport from '@/components/BatchImport';
import dayjs from 'dayjs';

export default function ExpertAdmin() {
  const { db, setDb, log, me, flags } = useStore();
  const { message, modal } = AntApp.useApp();
  /** V6.0 CR-26：排班批量维护与已发布排班直改 */
  const batchOn = flags.expertScheduleBatch !== false;
  const [leadDays, setLeadDays] = useState(7);
  const [duration, setDuration] = useState(30);
  const [capacity, setCapacity] = useState(1);

  const totalBookings = db.bookings.length;
  const done = db.bookings.filter((b) => b.status === '已完成').length;
  const noShow = db.bookings.filter((b) => b.status === '爽约').length;
  const avgRating = db.reviews.length
    ? Math.round((db.reviews.reduce((a, b) => a + b.rating, 0) / db.reviews.length) * 10) / 10 : 0;

  /** V6.0 CR-26：已发布排班直接修改（有预约时必须二次确认并触发改约通知） */
  const [editTarget, setEditTarget] = useState<ExpertSchedule | null>(null);
  const [editForm] = Form.useForm();

  const editSchedule = (s: ExpertSchedule) => {
    setEditTarget(s);
    editForm.resetFields();
    editForm.setFieldsValue({
      date: dayjs(s.date), slot: s.slot, capacity: s.capacity,
      type: s.type, place_or_link: s.place_or_link, status: s.status,
    });
  };

  const commitEdit = async () => {
    const s = editTarget!;
    let vals: {
      date?: { format: (f: string) => string };
      slot?: string; capacity?: number; type?: ExpertSchedule['type'];
      place_or_link?: string; status?: ExpertSchedule['status'];
    };
    try {
      vals = await editForm.validateFields();
    } catch {
      message.error('请填写完整');
      return;
    }
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    const next = {
      date: vals.date?.format('YYYY-MM-DD') ?? s.date,
      slot: vals.slot ?? s.slot,
      capacity: Number(vals.capacity ?? s.capacity),
      type: vals.type ?? s.type,
      place_or_link: vals.place_or_link ?? s.place_or_link,
      status: vals.status ?? s.status,
    };

    const write = () => {
      setDb((p) => ({
        ...p,
        schedules: p.schedules.map((x) => (x.id === s.id
          ? { ...x, ...next, source: 'MANUAL' as const, updated_by: me.name, updated_at: at }
          : x)),
      }));
      log('修改已发布排班', `${db.experts.find((e) => e.id === s.expert_id)?.name ?? s.expert_id} ${s.date} ${s.slot}`,
        `改为 ${next.date} ${next.slot} / 容量 ${next.capacity}；原已约 ${s.booked} 人${s.booked > 0 ? '，已触发改约通知' : ''}`);
      message.success(s.booked > 0 ? '已保存并向已预约成员发送改约通知' : '已保存（该时段暂无预约）');
      setEditTarget(null);
      editForm.resetFields();
    };

    /** 已产生预约 → 二次确认 + 复用停诊通知通道 */
    if ((s.booked ?? 0) > 0) {
      modal.confirm({
        title: '该时段已有预约，确认修改？',
        content: `当前已约 ${s.booked} 人，修改后将为他们发送改约通知（复用停诊通知通道）。`,
        okText: '确认修改并通知',
        onOk: write,
      });
      return;
    }
    write();
  };

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
                  {/* V6.0 CR-26：排班批量上传（模板下载 + 三态回执，沿用 CR-11 交互） */}
                  {batchOn && (
                    <Card size="small" title="排班批量维护">
                      <Space size={8} wrap>
                        <BatchImport
                          title="排班批量导入"
                          columns={['专家ID', '日期', '时段', '容量', '形式', '地点或链接']}
                          hint="口径：按 专家ID+日期+时段 去重，冲突行在回执中单列并跳过；导入失败不回滚已成功行（可重入）"
                          sample={[[db.experts[0]?.id ?? 'E1', '2026-10-08', '09:00-10:00', '1', '1v1', '线上-钉钉']]}
                          maxRows={200}
                          validate={(rows) => rows.map((r, i) => {
                            const [expertId, date, slot, cap, type, place] = r;
                            const expert = db.experts.find((e) => e.id === expertId);
                            if (!expert) return { row: i + 2, name: expertId || `第 ${i + 2} 行`, result: '失败' as const, reason: '专家 ID 不存在' };
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                              return { row: i + 2, name: expert.name, result: '失败' as const, reason: `日期格式应为 YYYY-MM-DD（收到 ${date || '空'}）` };
                            }
                            const typeOk = (['1v1', '直播', '线下'] as const).find((v) => v === type);
                            if (!typeOk) {
                              return { row: i + 2, name: expert.name, result: '失败' as const, reason: `形式「${type || '空'}」不在枚举内` };
                            }
                            const capN = Number(cap);
                            if (!Number.isFinite(capN) || capN < 1) {
                              return { row: i + 2, name: expert.name, result: '失败' as const, reason: '容量必须 ≥1' };
                            }
                            /** 按 expert_id + date + slot 去重：已存在则跳过（不覆盖已有预约） */
                            const dup = db.schedules.some((s) => s.expert_id === expertId && s.date === date && s.slot === slot);
                            if (dup) {
                              return { row: i + 2, name: `${expert.name} ${date} ${slot}`, result: '跳过' as const, reason: '该专家该时段已有排班（未覆盖）' };
                            }
                            return {
                              row: i + 2, name: `${expert.name} ${date} ${slot}`, result: '成功' as const,
                              data: { expert_id: expertId, date, slot, capacity: capN, type: typeOk, place_or_link: place ?? '' },
                            };
                          })}
                          onCommit={(items) => {
                            const batchId = `BS${Date.now()}`;
                            const list = items.map((it) => it.data!);
                            setDb((p) => ({
                              ...p,
                              schedules: [
                                ...list.map((d, i) => ({
                                  id: `SCH-${batchId}-${i}`,
                                  expert_id: d.expert_id, date: d.date, slot: d.slot,
                                  capacity: d.capacity, booked: 0, type: d.type,
                                  place_or_link: d.place_or_link,
                                  status: 'OPEN' as const,
                                  source: 'BATCH' as const, batch_id: batchId,
                                  updated_by: me.name,
                                  updated_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
                                })),
                                ...p.schedules,
                              ],
                            }));
                            log('批量导入排班', `${list.length} 条`, `批次 ${batchId}；去重口径 专家+日期+时段，冲突行已跳过`);
                            message.success(`已导入 ${list.length} 条排班（冲突行已跳过，可在回执中下载核对）`);
                          }}
                        />
                      </Space>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                        单次导入上限 200 行；导入不覆盖已有排班，冲突行在回执中单列，可下载修正后重导。
                      </Typography.Text>
                    </Card>
                  )}
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
                        title: '操作', width: 160,
                        render: (_, r) => (
                          <Space size={4}>
                            <Button size="small" type="link" onClick={() => { log('排班审批', `${r.date} ${r.slot}`, '审批通过'); message.success('排班已审批'); }}>审批</Button>
                            {/* V6.0 CR-26：已发布排班直接修改（有预约时二次确认 + 改约通知） */}
                            {batchOn && (
                              <Button size="small" type="link" onClick={() => editSchedule(r)}>修改</Button>
                            )}
                          </Space>
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

      {/* V6.0 CR-26：已发布排班直接修改 */}
      <Modal
        open={!!editTarget}
        title={`修改排班 · ${db.experts.find((e) => e.id === editTarget?.expert_id)?.name ?? ''}`}
        onCancel={() => setEditTarget(null)}
        onOk={commitEdit}
        okText="保存"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="date" label="日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="slot" label="时段" rules={[{ required: true }]}>
            <Input placeholder="如 09:00-10:00" />
          </Form.Item>
          <Form.Item name="capacity" label="容量" rules={[{ required: true }]}>
            <InputNumber min={1} max={20} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="type" label="形式" rules={[{ required: true }]}>
            <Select options={['1v1', '直播', '线下'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="place_or_link" label="地点或链接">
            <Input placeholder="线上填会议链接，线下填地点" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={['OPEN', 'FULL', 'CLOSED', 'HOLIDAY'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          已产生预约的排班修改时会二次确认，并向已预约成员发送改约通知（复用停诊通知通道）。
        </Typography.Text>
      </Modal>
    </Space>
  );
}
