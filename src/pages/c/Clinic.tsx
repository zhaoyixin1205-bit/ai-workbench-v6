import { Avatar, Badge, Button, Card, Col, Empty, Input, Modal, Rate, Row, Segmented, Space, Tag, Typography, App as AntApp, Tooltip } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, SearchOutlined, StarFilled, VideoCameraOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { PageHeader, SoftTag } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { ExpertSchedule } from '@/mock/types';
import dayjs from 'dayjs';

const SLOT_STATUS: Record<ExpertSchedule['status'], { text: string; color: string; bg: string }> = {
  OPEN: { text: '可约', color: '#FF6B35', bg: '#FFF1EB' },
  FULL: { text: '已满', color: '#6B7280', bg: '#F3F4F6' },
  CLOSED: { text: '停诊', color: '#9CA3AF', bg: '#F9FAFB' },
  HOLIDAY: { text: '休假', color: '#F59E0B', bg: '#FFF7ED' },
};

export default function Clinic() {
  const { db, me, setDb, log, flags } = useStore();
  const { message } = AntApp.useApp();
  /** V6.0 CR-16：专家工作台入口开关 + 仅问诊专家可见 */
  const clinicWorkbenchOn = flags.clinicWorkbench !== false;
  const isExpert = db.experts.some((e) => e.union_id === me.union_id);
  const [kw, setKw] = useState('');
  const [sort, setSort] = useState('评分');
  const [expertId, setExpertId] = useState(db.experts[0].id);
  const [booking, setBooking] = useState<ExpertSchedule | null>(null);
  const [question, setQuestion] = useState('');

  const experts = useMemo(() => {
    let arr = db.experts.filter((e) => !kw || e.name.includes(kw) || e.expertise_tags.some((t) => t.includes(kw)) || e.dept_name.includes(kw));
    arr = [...arr].sort((a, b) =>
      sort === '评分' ? b.rating_avg - a.rating_avg : sort === '接诊量' ? b.serve_count - a.serve_count : 0
    );
    return arr;
  }, [db.experts, kw, sort]);

  const expert = db.experts.find((e) => e.id === expertId)!;
  const schedules = db.schedules.filter((s) => s.expert_id === expertId).slice(0, 14);
  const dates = [...new Set(schedules.map((s) => s.date))].sort();

  const book = () => {
    if (question.trim().length < 5) { message.warning('请填写卡点描述（≥5 字），禁止空预约'); return; }
    const sc = booking!;
    setDb((p) => ({
      ...p,
      schedules: p.schedules.map((x) => (x.id === sc.id ? { ...x, booked: x.booked + 1, status: x.booked + 1 >= x.capacity ? 'FULL' : 'OPEN' } : x)),
      bookings: [{
        id: `BK${Date.now()}`, schedule_id: sc.id, expert_id: expertId, expert_name: expert.name,
        union_id: me.union_id, name: me.name, question, date: sc.date, slot: sc.slot,
        type: sc.capacity > 1 ? '直播' : '1v1', status: '待就诊', reviewed: false,
      }, ...p.bookings],
      pointRecords: [{ id: `PR${Date.now()}`, union_id: expert.union_id, name: expert.name, source: '专家接诊', points: 20, campaign_id: 'C2026Q4', remark: `接诊 ${me.name}`, created_at: DEMO_TODAY }, ...p.pointRecords],
    }));
    log('预约专家号源', `${expert.name} ${sc.date} ${sc.slot}`, '号源原子扣减成功');
    message.success('预约成功！开始前 24 小时与 1 小时各推送一次钉钉待办');
    setBooking(null); setQuestion('');
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="专家门诊"
        desc="医院专家门诊模式：看专家 → 看排班 → 约号源 → 就诊 → 评价，卡点不过夜"
        extra={
          <Space>
            {/* V6.0 CR-16：专家工作台下沉入口，仅问诊专家可见（非专家不渲染，避免无效点击） */}
            {clinicWorkbenchOn && isExpert && (
              <Link to="/clinic/workbench"><Button type="primary">我的专家工作台</Button></Link>
            )}
            <Link to="/clinic/mine"><Button>我的预约</Button></Link>
          </Space>
        }
      />

      <div className="wb-card" style={{ padding: 14, background: GRADIENT.subtle }}>
        <Space wrap size={12}>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索专家姓名 / 擅长领域 / 部门"
            style={{ width: 240 }} value={kw} onChange={(e) => setKw(e.target.value)} />
          <Segmented value={sort} onChange={(v) => setSort(String(v))} options={['评分', '接诊量', '可约时间']} />
          <span style={{ fontSize: 12, color: COLOR.textMuted }}>共 {experts.length} 位专家</span>
        </Space>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={10}>
          {experts.length === 0 ? <Empty description="没有匹配的专家" /> : (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {experts.map((e) => {
                const open = db.schedules.filter((s) => s.expert_id === e.id && s.status === 'OPEN').length;
                return (
                  <div
                    key={e.id}
                    className="wb-card wb-card-hover"
                    style={{
                      padding: 16, cursor: 'pointer',
                      borderColor: e.id === expertId ? COLOR.primary : undefined,
                      background: e.id === expertId ? GRADIENT.metric : undefined,
                      boxShadow: e.id === expertId ? SHADOW.button : undefined,
                    }}
                    onClick={() => setExpertId(e.id)}
                  >
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Avatar size={44} style={{ background: GRADIENT.primary, flex: '0 0 44px', fontWeight: 700 }}>{e.name.slice(0, 1)}</Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Space size={6} wrap>
                          <Typography.Text strong style={{ fontSize: 15 }}>{e.name}</Typography.Text>
                          <SoftTag text={e.title} tone="gray" />
                          {e.cert.map((c) => <SoftTag key={c} text={c} tone="purple" />)}
                          {e.status === '停诊' && <SoftTag text="停诊中" tone="gray" />}
                        </Space>
                        <div style={{ fontSize: 12, color: COLOR.textSub, marginTop: 2 }}>{e.dept_name}</div>
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {e.expertise_tags.map((t) => <SoftTag key={t} text={t} tone="primary" />)}
                        </div>
                        <Space size={12} style={{ marginTop: 6, fontSize: 12 }}>
                          <span><StarFilled style={{ color: '#F59E0B' }} /> <b className="num">{e.rating_avg}</b></span>
                          <span>已接诊 <b className="num">{e.serve_count}</b> 次</span>
                          <span style={{ color: open ? COLOR.primary : COLOR.textSub }}>
                            <CalendarOutlined /> 近期可约 {open} 个号
                          </span>
                        </Space>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, borderTop: `1px dashed ${COLOR.borderLight}`, paddingTop: 8 }}>
                      <Link to={`/clinic/expert/${e.id}`}><Button size="small" type="link" style={{ paddingLeft: 0 }}>专家主页与评价 →</Button></Link>
                    </div>
                  </div>
                );
              })}
            </Space>
          )}
        </Col>

        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={<Space size={8}><CalendarOutlined style={{ color: COLOR.primary }} /><span>{expert.name} · 未来两周排班</span></Space>}
            extra={<Space size={12}>
              {Object.entries(SLOT_STATUS).map(([k, v]) => (
                <span key={k} style={{ fontSize: 11, color: COLOR.textSub }}>
                  <Badge color={v.color} /> {v.text}
                </span>
              ))}
            </Space>}
          >
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
              {expert.intro}
            </Typography.Paragraph>
            {dates.map((d) => (
              <div key={d} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  {dayjs(d).format('MM-DD')} · 周{'日一二三四五六'[dayjs(d).day()]}
                  {d === DEMO_TODAY && <Tag color="orange" style={{ marginLeft: 6 }}>今天</Tag>}
                </div>
                <Space wrap size={6}>
                  {schedules.filter((s) => s.date === d).map((s) => {
                    const meta = SLOT_STATUS[s.status];
                    const disabled = s.status !== 'OPEN';
                    return (
                      <Tooltip key={s.id} title={`${s.type} · ${s.place_or_link} · 已约 ${s.booked}/${s.capacity}`}>
                        <Button
                          size="small"
                          disabled={disabled}
                          onClick={() => setBooking(s)}
                          style={{
                            background: meta.bg, borderColor: meta.color,
                            color: disabled ? '#9CA3AF' : meta.color, minWidth: 96,
                          }}
                        >
                          <ClockCircleOutlined /> {s.slot}
                          <div style={{ fontSize: 10 }}>
                            {meta.text} {s.capacity > 1 ? `(${s.booked}/${s.capacity})` : ''}
                          </div>
                        </Button>
                      </Tooltip>
                    );
                  })}
                </Space>
              </div>
            ))}
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              放号规则：默认提前 7 天放号（每周一 10:00 放下周号源）；开始前 2 小时内不可取消（记为已使用）
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Modal
        open={!!booking}
        title={`预约挂号 · ${expert.name} ${booking?.date} ${booking?.slot}`}
        onCancel={() => setBooking(null)}
        onOk={book}
        okText="确认预约"
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            形式：{booking && booking.capacity > 1 ? '直播公开课' : '1v1'} · {booking?.place_or_link}
          </Typography.Text>
          <Typography.Text strong>卡点描述（必填，≤200 字）</Typography.Text>
          <Input.TextArea
            rows={4} value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="说清你卡在哪：做了什么、期望什么、实际得到什么"
            maxLength={200} showCount
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            同一时段同一用户仅可约 1 次；累计 3 次爽约将限制预约 30 天。
          </Typography.Text>
        </Space>
      </Modal>
    </Space>
  );
}
