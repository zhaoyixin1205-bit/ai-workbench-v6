import { Avatar, AutoComplete, Button, DatePicker, Form, Input, InputNumber, Rate, Select, Table, Tabs, App as AntApp } from 'antd';
import { CalendarOutlined, CheckCircleOutlined, StarFilled, TeamOutlined, PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { DEMO_TODAY } from '@/mock/seedBiz';
/* V7.0 CR-36：时段预置枚举 + 三种形式（拍板 8-C / 确认项 4） */
import { SCHEDULE_SLOTS, SCHEDULE_TYPES } from '@/constants/importSchemas';
/* V7.0 裸编码治理：排班状态显示中文 */
import { scheduleStatusText } from '@/constants/statusMeta';
import { Dialog, useConfirm } from '@/components/v2/Dialog';
import '../../theme/v2/template.css';

/**
 * 专家工作台 v2（P3-6 清理期补齐）
 * ------------------------------------------------------------------
 * 对应 v1：src/pages/e/ExpertWorkbench.tsx（343 行）
 * 只换视觉与弹窗层，业务逻辑逐行沿用：
 *   - CR-36 专家自助排班申请（提交为「申请」，撞车标记 conflict，组织者审核后生效）
 *   - finish 标记就诊完成（触发学员评价提醒）
 *   - 排班 OPEN/CLOSED 直改（专家自助停诊/复诊）
 * 视觉：Hero → .wb2-hero；4 张 StatCard → .wb2-metrics；List → .wb2-list 细线行；
 *       Progress → .wb2-prog；Popconfirm → useConfirm；Modal → Dialog。
 */
export default function ExpertWorkbenchV2() {
  const { db, me, setDb, log, flags } = useStore();
  const { message } = AntApp.useApp();
  const ask = useConfirm();
  /** V7.0 CR-36：专家自助排班申请（拍板 7-C） */
  const selfScheduleOn = flags.expertSelfSchedule !== false;
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm] = Form.useForm();
  const expert = db.experts.find((e) => e.union_id === me.union_id);

  if (!expert) {
    return (
      <div className="wb2-empty">
        <div className="ic"><TeamOutlined /></div>
        <div className="t">当前身份不是问诊专家</div>
        <div className="d">请切换为专家身份（如刘晓东 / 李慧敏）查看专家工作台</div>
        <Link to="/clinic"><Button type="primary">去专家门诊</Button></Link>
      </div>
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

  const askFinish = (b: { id: string; name: string; date: string; slot: string }) => {
    ask({
      title: '标记为已完成？',
      content: `${b.name} · ${b.date} ${b.slot}`,
      okText: '标记完成',
      onOk: () => finish(b.id),
    });
  };

  /** 排班状态四档语义（替代 v1 的 SoftTag 多色） */
  const schedTone = (v: string) => (v === 'OPEN' ? 'ok' : v === 'FULL' ? 'id' : v === 'HOLIDAY' ? 'wa' : 'id');
  /** 申请状态四档语义（替代 v1 的 Tag green/red/gold） */
  const reqTone = (v: string) => (v === '已通过' ? 'ok' : v === '已驳回' ? 'er' : 'wa');

  const goodRate = Math.round((reviews.filter((r) => r.rating >= 4).length / Math.max(1, reviews.length)) * 100);
  const usedRate = Math.round(
    (schedules.reduce((a, b) => a + b.booked, 0) / Math.max(1, schedules.reduce((a, b) => a + b.capacity, 0))) * 100,
  );

  return (
    <div>
      {/* ---------- Hero：专家身份 + 三项个人指标 ---------- */}
      <div className="wb2-hero">
        <div className="row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--wb-space-5)', flex: '1 1 420px', minWidth: 0 }}>
            <div
              className="wb2-av lg"
              style={{ background: 'rgba(255,255,255,0.22)', color: '#fff', border: '2px solid rgba(255,255,255,0.5)' }}
            >
              {expert.name.slice(0, 1)}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ marginBottom: 6 }}>{expert.name} · 专家工作台</h1>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                <span className="pill">{expert.title}</span>
                {expert.cert.map((c) => <span key={c} className="pill">{c}</span>)}
              </div>
              <div className="desc">{expert.dept_name} · 擅长：{expert.expertise_tags.join(' / ')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--wb-space-7)' }}>
            {[
              { l: '综合评分', v: expert.rating_avg.toFixed(1), icon: <StarFilled /> },
              { l: '累计接诊', v: expert.serve_count },
              { l: '接诊积分', v: expert.points },
            ].map((m) => (
              <div key={m.l} style={{ textAlign: 'center' }}>
                <div className="num" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, color: '#fff' }}>
                  {m.v}{m.icon}
                </div>
                <div className="sub" style={{ marginTop: 4 }}>{m.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="wb2-metrics" style={{ marginTop: 'var(--wb-space-5)' }}>
        {[
          { lb: '可约号源', vl: openSlots, sb: '当前「可预约」状态的排班', accent: true },
          { lb: '待接诊', vl: pending.length, sb: '状态为「待就诊」' },
          { lb: '评价条数', vl: reviews.length, sb: '含匿名评价' },
          { lb: '履约率', vl: `${doneRate}%`, sb: '已完成 / 全部预约' },
        ].map((m) => (
          <div key={m.lb} className="wb2-metric">
            <div className="lb">{m.lb}</div>
            <div className={`vl${m.accent ? ' accent' : ''}`}>{m.vl}</div>
            <div className="sb">{m.sb}</div>
          </div>
        ))}
      </div>

      <div className="wb2-tabs">
        <Tabs
          items={[
            {
              key: 'pending', label: `待接诊（${pending.length}）`,
              children: pending.length === 0 ? (
                <div className="wb2-empty" style={{ background: 'transparent', border: 'none' }}>
                  <div className="ic"><CalendarOutlined /></div>
                  <div className="d" style={{ marginBottom: 0 }}>暂无待接诊</div>
                </div>
              ) : (
                <div className="wb2-list">
                  {pending.map((b) => (
                    <div key={b.id} className="wb2-li">
                      <Avatar style={{ background: 'var(--wb-primary)', fontWeight: 700 }}>{b.name.slice(0, 1)}</Avatar>
                      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--wb-fs-body)', color: 'var(--wb-ink-1)' }}>
                          {b.name} · {b.date} {b.slot} · {b.type}
                        </div>
                        <div style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-3)', marginTop: 2 }}>
                          卡点：{b.question}
                        </div>
                      </div>
                      <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => askFinish(b)}>
                        标记完成
                      </Button>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'schedule', label: `我的排班与号源（${schedules.length}）`,
              children: (
                <>
                  {/* V7.0 CR-36：专家自助申请开放时段（拍板 7-C：提交为申请，组织者审核后生效） */}
                  {selfScheduleOn && (
                    <div style={{ marginBottom: 'var(--wb-space-5)' }}>
                      <div className="wb2-tools" style={{ marginBottom: 'var(--wb-space-3)' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setApplyOpen(true)}>
                          申请开放时段
                        </Button>
                        <span style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)' }}>
                          自行选择日期、时段、形式与容量；提交后由组织者审核，通过后才会开放预约。
                        </span>
                      </div>
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
                              title: '状态', dataIndex: 'status', width: 140,
                              render: (v: string, r) => (
                                <span style={{ display: 'inline-flex', gap: 4 }}>
                                  <span className={`wb2-tag ${reqTone(v)}`}><i className="d" />{v}</span>
                                  {r.conflict && <span className="wb2-tag er"><i className="d" />撞车</span>}
                                </span>
                              ),
                            },
                            { title: '提交时间', dataIndex: 'created_at', width: 150 },
                          ]}
                        />
                      )}
                    </div>
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
                        render: (v: string) => <span className={`wb2-tag ${schedTone(v)}`}><i className="d" />{scheduleStatusText(v)}</span>,
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
              children: reviews.length === 0 ? (
                <div className="wb2-empty" style={{ background: 'transparent', border: 'none' }}>
                  <div className="ic"><StarFilled /></div>
                  <div className="d" style={{ marginBottom: 0 }}>暂无评价</div>
                </div>
              ) : (
                <div className="wb2-list">
                  {reviews.map((r) => (
                    <div key={r.id} className="wb2-li">
                      <div
                        className={`wb2-av${r.anonymous ? ' mute' : ''}`}
                        style={r.anonymous ? undefined : { background: 'var(--wb-primary)', color: '#fff', fontWeight: 700 }}
                      >
                        {r.anonymous ? '匿' : (db.users.find((u) => u.union_id === r.rater_union_id)?.name ?? '?').slice(0, 1)}
                      </div>
                      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--wb-fs-body)', color: 'var(--wb-ink-1)' }}>
                          {r.anonymous ? '匿名用户' : db.users.find((u) => u.union_id === r.rater_union_id)?.name}
                        </div>
                        <div style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-3)', marginTop: 2 }}>
                          {r.comment}（{r.created_at}）
                        </div>
                      </div>
                      <Rate disabled allowHalf value={r.rating} style={{ fontSize: 12 }} />
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'stats', label: '接诊统计',
              children: (
                <div className="wb2-grid2">
                  <div>
                    {[
                      { l: '好评率', v: goodRate, sb: '4 星及以上 / 全部评价' },
                      { l: '履约率', v: doneRate, sb: '已完成 / 全部预约' },
                      { l: '号源使用率', v: usedRate, sb: '已约 / 总容量' },
                    ].map((m) => (
                      <div key={m.l} style={{ marginBottom: 'var(--wb-space-5)' }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                          fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-2)',
                        }}>
                          <span>{m.l}</span><span className="num" style={{ fontSize: 'var(--wb-fs-body)', color: 'var(--wb-ink-1)' }}>{m.v}%</span>
                        </div>
                        <div className="wb2-prog"><i style={{ width: `${m.v}%`, background: 'var(--wb-primary)' }} /></div>
                        <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 4 }}>{m.sb}</div>
                      </div>
                    ))}
                  </div>
                  <div className="wb2-card">
                    <div className="hd" style={{ fontWeight: 600, marginBottom: 'var(--wb-space-3)' }}>接诊记录</div>
                    {bookings.filter((b) => b.status === '已完成').length === 0 ? (
                      <div style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-3)' }}>暂无</div>
                    ) : (
                      <div>
                        {bookings.filter((b) => b.status === '已完成').map((b) => (
                          <div key={b.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 0', borderBottom: '1px solid var(--wb-border-subtle)',
                            fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-2)',
                          }}>
                            <TeamOutlined /><span>{b.name} · {b.date} {b.slot}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>

      <div className="wb2-quote">
        演示日期 {DEMO_TODAY} · 专家不可接诊本人作业相关评分场景（回避原则）
      </div>

      {/* V7.0 CR-36：专家自助排班申请（拍板 7-C） */}
      <Dialog
        open={applyOpen}
        title="申请开放时段"
        sub="提交后进入组织者审核队列；通过后才会开放预约。与该时段已有排班撞车时会标记「撞车」，由组织者决定如何处理。"
        okText="提交申请"
        onOk={() => { void submitApply(); }}
        onCancel={() => setApplyOpen(false)}
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
      </Dialog>
    </div>
  );
}
