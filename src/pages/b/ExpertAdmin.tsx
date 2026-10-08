import { noticeRescheduleToStudents } from '@/service/bookingNotice';
import { Alert, AutoComplete, Avatar, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, List, Modal, Row, Select, Space, Statistic, Switch, Table, Tabs, Tag, Typography, App as AntApp } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { ExpertSchedule, ScheduleRequest } from '@/mock/types';
import BatchImport from '@/components/BatchImport';
import dayjs from 'dayjs';
/* V7.0 CR-36：排班字段契约 + 时段预置枚举（拍板 8-C：预置优先、允许自定义） */
import { scheduleSchema, SCHEDULE_SLOTS, SCHEDULE_TYPES } from '@/constants/importSchemas';

/** V7.0 CR-36：排班导入行（显式泛型，避免 TS 从三态联合里推断成 {}） */
interface ScheduleRow {
  expert_id: string;
  date: string;
  slot: string;
  capacity: number;
  type: ExpertSchedule['type'];
  place_or_link: string;
  status: ExpertSchedule['status'];
  /** 是否命中预置时段（拍板 8-C：允许自定义，仅作统计与提示） */
  slotKnown: boolean;
}

export default function ExpertAdmin() {
  const { db, setDb, log, me, flags } = useStore();
  const { message, modal } = AntApp.useApp();
  /** V6.0 CR-26：排班批量维护与已发布排班直改 */
  const batchOn = flags.expertScheduleBatch !== false;
  /** V7.0 CR-36：专家自助排班申请（拍板 7-C：提交为申请，组织者审核后生效） */
  const selfScheduleOn = flags.expertSelfSchedule !== false;
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
        /** V8.3-10.08 需求③.4：改期要真的通知已预约学员。
         *  原实现只在 log 里写了「已触发改约通知」，没有任何消息落库 —— 学员那头毫无感知。 */
        messages: noticeRescheduleToStudents(
          p.messages,
          p.bookings
            .filter((b) => b.schedule_id === s.id && b.status === '待就诊')
            .map((b) => ({ union_id: b.union_id, name: b.name })),
          { date: s.date, slot: s.slot, nextDate: next.date, nextSlot: next.slot }
        ),
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

  /**
   * V7.0 CR-36：审核专家自助排班申请（拍板 7-C）。
   * 通过 → 生成排班（source=EXPERT_APPLY，回写 request_id）并通知专家；
   * 撞车 → 不静默覆盖，要求组织者先在下方的排班表里处理已有排班；
   * 驳回 → 申请单只增不改，专家需重新提交。
   */
  const reviewRequest = (r: ScheduleRequest, pass: boolean) => {
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    const expert = db.experts.find((e) => e.id === r.expert_id);
    const who = `${expert?.name ?? r.expert_id} ${r.date} ${r.slot}`;
    /**
     * V8.4-10.07：消息收件人必须是申请人本人。原写法 `?? 'all'` 在申请人 union_id 缺失时
     * 会把内部排班信息广播给全员 501 人 —— 宁可不发，也不能错发给不相干的人。
     */
    const applicantId = r.applicant_union_id;

    if (pass) {
      const exists = db.schedules.some((s) => s.expert_id === r.expert_id && s.date === r.date && s.slot === r.slot);
      if (exists) {
        message.error(`${who} 已有排班，请先在下方排班表中修改或删除后再通过（不覆盖已有预约）`);
        return;
      }
      setDb((p) => ({
        ...p,
        schedules: [{
          id: `SCH-REQ-${r.id}`, expert_id: r.expert_id, date: r.date, slot: r.slot,
          capacity: r.capacity, booked: 0, type: r.type, place_or_link: r.place_or_link,
          status: 'OPEN' as const, source: 'EXPERT_APPLY' as const, request_id: r.id,
          updated_by: me.name, updated_at: at,
        }, ...p.schedules],
        scheduleRequests: p.scheduleRequests.map((x) => (x.id === r.id
          ? { ...x, status: '已通过' as const, reviewed_by: me.name, reviewed_at: at } : x)),
        messages: applicantId ? [{
          id: `MSG-SR-${Date.now()}`, union_id: applicantId, type: '排班申请',
          title: '你提交的排班申请已通过', content: `${r.date} ${r.slot}（${r.type}）已开放预约。`,
          channel: '站内' as const, status: '未读' as const, sent_at: at,
        }, ...p.messages] : p.messages,
      }));
      log('审核排班申请', who, applicantId
        ? '通过并生成排班（来源 EXPERT_APPLY，已通知申请人）'
        : '通过并生成排班（来源 EXPERT_APPLY；该单无申请人账号，未发送站内通知）');
      message.success(applicantId ? '已通过并生成排班，已通知申请人' : '已通过并生成排班（该单缺少申请人账号，未发送通知）');
      return;
    }

    setDb((p) => ({
      ...p,
      scheduleRequests: p.scheduleRequests.map((x) => (x.id === r.id
        ? { ...x, status: '已驳回' as const, reviewed_by: me.name, reviewed_at: at } : x)),
      messages: applicantId ? [{
        id: `MSG-SR-${Date.now()}`, union_id: applicantId, type: '排班申请',
        title: '你提交的排班申请未通过', content: `${r.date} ${r.slot} 已被组织者驳回，请重新选择时间提交。`,
        channel: '站内' as const, status: '未读' as const, sent_at: at,
      }, ...p.messages] : p.messages,
    }));
    log('审核排班申请', who, applicantId
      ? '驳回（申请单保留，需专家重新提交；已通知申请人）'
      : '驳回（申请单保留，需专家重新提交；该单无申请人账号，未发送站内通知）');
    message.success(applicantId ? '已驳回并通知申请人' : '已驳回（该单缺少申请人账号，未发送通知）');
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
                        <BatchImport<ScheduleRow>
                          title="排班批量导入"
                          /* V7.0 CR-36：模板与校验共用同一份字段契约（含新增的「专家姓名」「状态」列） */
                          schema={scheduleSchema}
                          maxRows={200}
                          validate={(rows) => rows.map((r, i) => {
                            const [expertId, expertName, date, slot, type, cap, place, status] = r;
                            /** 工号或姓名二选一定位专家 */
                            const expert = db.experts.find((e) => e.id === expertId)
                              ?? db.experts.find((e) => e.name === expertName);
                            if (!expert) {
                              return { row: i + 2, name: expertId || expertName || `第 ${i + 2} 行`, result: '失败' as const, reason: '专家工号/姓名均匹配不到（请从专家名录复制）' };
                            }
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                              return { row: i + 2, name: expert.name, result: '失败' as const, reason: `日期格式应为 YYYY-MM-DD（收到 ${date || '空'}）` };
                            }
                            /** 拍板 8-C：时段预置枚举优先，允许自定义；此处只提醒不拦截 */
                            const slotKnown = SCHEDULE_SLOTS.includes(slot);
                            const typeOk = SCHEDULE_TYPES.find((v) => v === type);
                            if (!typeOk) {
                              return { row: i + 2, name: expert.name, result: '失败' as const, reason: `形式「${type || '空'}」不在可选项内（${SCHEDULE_TYPES.join(' / ')}）` };
                            }
                            const capN = Number(cap);
                            if (!Number.isFinite(capN) || capN < 1) {
                              return { row: i + 2, name: expert.name, result: '失败' as const, reason: '容量必须 ≥1' };
                            }
                            /** 按 expert_id + date + slot 去重：已存在则跳过（不覆盖已有预约） */
                            const dup = db.schedules.some((s) => s.expert_id === expert.id && s.date === date && s.slot === slot);
                            if (dup) {
                              return { row: i + 2, name: `${expert.name} ${date} ${slot}`, result: '跳过' as const, reason: '该专家该时段已有排班（未覆盖）' };
                            }
                            return {
                              row: i + 2, name: `${expert.name} ${date} ${slot}`, result: '成功' as const,
                              data: {
                                expert_id: expert.id, date, slot, capacity: capN, type: typeOk,
                                place_or_link: place ?? '',
                                status: (['OPEN', 'FULL', 'CLOSED', 'HOLIDAY'] as const).find((v) => v === status) ?? 'OPEN' as const,
                                slotKnown,
                              },
                            };
                          })}
                          onCommit={(items) => {
                            const batchId = `BS${Date.now()}`;
                            const list = items.map((it) => it.data!);
                            const custom = list.filter((d) => !d.slotKnown).length;
                            setDb((p) => ({
                              ...p,
                              schedules: [
                                ...list.map((d, i) => ({
                                  id: `SCH-${batchId}-${i}`,
                                  expert_id: d.expert_id, date: d.date, slot: d.slot,
                                  capacity: d.capacity, booked: 0, type: d.type,
                                  place_or_link: d.place_or_link,
                                  status: d.status,
                                  source: 'BATCH' as const, batch_id: batchId,
                                  updated_by: me.name,
                                  updated_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
                                })),
                                ...p.schedules,
                              ],
                            }));
                            log('批量导入排班', `${list.length} 条`, `批次 ${batchId}；去重口径 专家+日期+时段，冲突行已跳过${custom ? `；其中 ${custom} 行使用了自定义时段` : ''}`);
                            message.success(`已导入 ${list.length} 条排班（冲突行已跳过，可在回执中下载核对）${custom ? `；${custom} 行为自定义时段` : ''}`);
                          }}
                        />
                      </Space>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                        单次导入上限 200 行；导入不覆盖已有排班，冲突行在回执中单列，可下载修正后重导。
                      </Typography.Text>
                    </Card>
                  )}
                  {/* V7.0 CR-36：专家自助排班申请审核（拍板 7-C） */}
                  {selfScheduleOn && (
                    <Card size="small" title={`专家排班申请（${db.scheduleRequests.filter((r) => r.status === '待审核').length} 待审核）`}>
                      {db.scheduleRequests.length === 0 ? (
                        <Empty description="暂无专家提交的排班申请" />
                      ) : (
                        <Table
                          size="small" rowKey="id" pagination={{ pageSize: 5 }} dataSource={db.scheduleRequests}
                          columns={[
                            { title: '专家', render: (_, r: ScheduleRequest) => db.experts.find((e) => e.id === r.expert_id)?.name ?? r.expert_id },
                            { title: '日期', dataIndex: 'date', width: 110 },
                            { title: '时段', dataIndex: 'slot', width: 120 },
                            { title: '形式', dataIndex: 'type', width: 80 },
                            { title: '容量', dataIndex: 'capacity', width: 70, render: (v: number) => <span className="num">{v}</span> },
                            { title: '地点/链接', dataIndex: 'place_or_link', ellipsis: true },
                            {
                              title: '冲突', width: 80,
                              render: (_, r: ScheduleRequest) => (r.conflict
                                ? <Tag color="red">撞车</Tag>
                                : <Tag>无</Tag>),
                            },
                            {
                              title: '状态', dataIndex: 'status', width: 90,
                              render: (v: string) => <Tag color={v === '已通过' ? 'green' : v === '已驳回' ? 'red' : 'gold'}>{v}</Tag>,
                            },
                            {
                              title: '操作', width: 140,
                              render: (_, r: ScheduleRequest) => (r.status === '待审核' ? (
                                <Space size={4}>
                                  <Button size="small" type="link" onClick={() => reviewRequest(r, true)}>通过</Button>
                                  <Button size="small" type="link" danger onClick={() => reviewRequest(r, false)}>驳回</Button>
                                </Space>
                              ) : <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.reviewed_by} {r.reviewed_at}</Typography.Text>),
                            },
                          ]}
                        />
                      )}
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        拍板 7-C：专家自助选择的时段以「申请」形式提交，经组织者审核后才生成排班；与已有排班撞车的申请标红，需先处理原排班再通过（不静默覆盖）。
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
          {/* 拍板 8-C：时段预置枚举优先，同时允许手工输入 */}
          <Form.Item name="slot" label="时段" rules={[{ required: true }]}>
            <AutoComplete
              options={SCHEDULE_SLOTS.map((v) => ({ value: v }))}
              placeholder="选择预置时段，或手工输入"
              filterOption={(input, option) => String(option?.value ?? '').includes(input)}
            />
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
