import { Button, Card, Empty, Progress, Space, Tag, Typography, Row, Col, Divider, App as AntApp } from 'antd';
import { FormOutlined, ClockCircleOutlined, CheckCircleOutlined, InboxOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, TRACK_COLOR } from '@/theme';
import { PageHeader } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { AssignmentSubmit, SubmitStatus } from '@/mock/types';
import dayjs from 'dayjs';

const STATUS_META: Record<SubmitStatus, { text: string; color: string }> = {
  DRAFT: { text: '草稿', color: 'default' },
  SUBMITTED: { text: '已提交', color: 'blue' },
  SCORING_AI: { text: 'AI 评分中', color: 'cyan' },
  AI_SCORED: { text: 'AI 已出分', color: 'cyan' },
  REVIEWING: { text: '复核中', color: 'purple' },
  REVIEWED: { text: '已复核', color: 'purple' },
  SPOT_CHECK: { text: '抽查中', color: 'gold' },
  PASSED: { text: '抽查通过', color: 'green' },
  REJECTED: { text: '不通过', color: 'red' },
  PUBLISHED: { text: '已公示', color: 'green' },
  ASSET_APPLYING: { text: '入库申请中', color: 'geekblue' },
  ASSET_ONLINE: { text: '已入库', color: 'green' },
  ASSET_REJECTED: { text: '入库驳回', color: 'red' },
  WITHDRAWN: { text: '已撤回', color: 'default' },
  SCORE_FAILED: { text: '评分失败', color: 'red' },
  /** V6.0 CR-19 新增两态 */
  COMPLETED: { text: '已完成', color: 'green' },
  CONSENSUS: { text: '已共识', color: 'geekblue' },
};

/**
 * V6.0 CR-19：公示由「状态」降级为「标记位」，所以单独渲染一个附加标签。
 * 这样「已完成 + 已公示」两个事实都能看见，不会互相掩盖。
 */
export function SubmitStatusTag({ status, published }: { status: SubmitStatus; published?: boolean }) {
  const m = STATUS_META[status] ?? { text: status, color: 'default' };
  return (
    <Space size={4}>
      <Tag color={m.color} style={{ marginInlineEnd: 0 }}>{m.text}</Tag>
      {published && <Tag color="green" style={{ marginInlineEnd: 0 }}>已公示</Tag>}
    </Space>
  );
}

export default function WorkList() {
  const { db, me, setDb, log } = useStore();
  const nav = useNavigate();
  const { message, modal } = AntApp.useApp();

  const type = db.assignmentTypes[0];
  const period = db.periods.find((p) => p.type_id === type.id && p.status === 'OPEN')!;
  const daysLeft = dayjs(period?.end_at).diff(dayjs(DEMO_TODAY), 'day');

  const mine = useMemo(
    () => db.submits.filter((s) => s.union_id === me.union_id).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)),
    [db.submits, me.union_id]
  );
  const teamSubmits = useMemo(
    () => db.submits.filter((s) => s.dept_name.includes(me.dept_names[0].split('/').pop() ?? '')),
    [db.submits, me.dept_names]
  );

  const usedTimes = mine.filter((s) => s.period_id === period?.id && s.status !== 'DRAFT' && s.status !== 'WITHDRAWN').length;
  const canSubmit = usedTimes < type.max_times;

  const withdraw = (s: AssignmentSubmit) => {
    modal.confirm({
      title: '撤回该提报？',
      content: '撤回后将释放一次提报额度，可在截止前重新提报。',
      okText: '确认撤回',
      okButtonProps: { danger: true },
      onOk: () => {
        setDb((p) => ({ ...p, submits: p.submits.map((x) => (x.id === s.id ? { ...x, status: 'WITHDRAWN' } : x)) }));
        log('撤回提报', s.code, '释放一次提报额度');
        message.success('已撤回');
      },
    });
  };

  const groups: { key: string; title: string; items: AssignmentSubmit[] }[] = [
    { key: 'todo', title: '待提报', items: mine.filter((s) => s.status === 'DRAFT') },
    { key: 'done', title: '已提报', items: mine.filter((s) => !['DRAFT', 'WITHDRAWN'].includes(s.status)) },
    { key: 'withdrawn', title: '已撤回', items: mine.filter((s) => s.status === 'WITHDRAWN') },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="作业提报"
        desc="按组织者配置的模板提报；默认每人每期 1 次，批改前且截止前可反复修改"
        extra={
          canSubmit ? (
            <Link to={`/work/submit/${type.id}`}>
              <Button type="primary" size="large" icon={<FormOutlined />}>去提报</Button>
            </Link>
          ) : (
            <Button size="large" disabled>本期已提报 {usedTimes} 次</Button>
          )
        }
      />

      {/* 当前作业任务卡 */}
      <div className="wb-card" style={{
        padding: 22, borderLeft: `4px solid ${COLOR.primary}`, background: GRADIENT.subtle,
      }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space size={8} wrap>
              <span style={{
                background: COLOR.primaryLight, color: '#C2410C', fontSize: 12, fontWeight: 700,
                padding: '3px 10px', borderRadius: 8,
              }}>{type.code} · 第 {period?.seq} 期</span>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{type.name}</span>
            </Space>
            <div style={{ marginTop: 10, color: COLOR.textSub, fontSize: 13 }}>
              提报对象：{type.target_scope} ｜ 时间窗 {period?.start_at} ~ {period?.end_at} ｜ 提交物模板：{type.form_template}
            </div>
            <div style={{ marginTop: 6, color: COLOR.textMuted, fontSize: 12 }}>
              绑定评分卡：{db.scoreCards.find((c) => c.id === type.score_card_id)?.name} {type.score_card_version} ｜ 迟交规则：{type.late_rule}
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Progress
                percent={Math.min(100, (usedTimes / type.max_times) * 100)}
                size={{ height: 8 }}
                style={{ flex: 1, maxWidth: 280, marginBottom: 0 }}
                strokeColor={COLOR.primary}
                trailColor="#F3F4F6"
              />
              <span style={{ fontSize: 12, color: COLOR.textSub }}>已用 {usedTimes}/{type.max_times} 次</span>
              <span style={{
                background: daysLeft <= 3 ? '#FEF2F2' : '#FFFBEB',
                color: daysLeft <= 3 ? '#B91C1C' : '#B45309',
                fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 8,
              }}>
                <ClockCircleOutlined /> 距截止 {daysLeft} 天
              </span>
            </div>
          </Col>
        </Row>
      </div>

      {groups.map((g) => (
        <Card key={g.key} size="small" title={g.title}>
          {g.items.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={g.key === 'todo' ? '没有待提报的作业' : '暂无记录'}
              style={{ padding: '12px 0' }}
            />
          ) : (
            g.items.map((s) => (
              <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid #F1F2F4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/work/${s.id}`}>
                    <Typography.Text strong>{s.title}</Typography.Text>
                  </Link>
                  <Space size={6}>
                    <SubmitStatusTag status={s.status} />
                    <Tag color={TRACK_COLOR[s.track]} style={{ border: 'none' }}>{s.track}</Tag>
                    {s.final_score !== undefined && <Tag color="orange">{s.final_score} 分</Tag>}
                  </Space>
                </div>
                <div style={{ fontSize: 12, color: COLOR.textSub, marginTop: 4 }}>
                  编号 {s.code} · {s.channel} · 提交于 {s.submitted_at}
                  {s.late && <Tag color="red" style={{ marginLeft: 6 }}>迟交</Tag>}
                  {s.status === 'ASSET_ONLINE' && <Tag color="green" style={{ marginLeft: 6 }}><InboxOutlined /> 已入库</Tag>}
                </div>
                <Space style={{ marginTop: 6 }}>
                  <Link to={`/work/${s.id}`}><Button size="small" type="link">查看详情</Button></Link>
                  {['SUBMITTED', 'AI_SCORED'].includes(s.status) && !s.late && (
                    <Button size="small" type="link" danger onClick={() => withdraw(s)}>撤回</Button>
                  )}
                  {['PASSED', 'PUBLISHED', 'REVIEWED'].includes(s.status) && (
                    <Button
                      size="small" type="link"
                      onClick={() => {
                        setDb((p) => ({
                          ...p,
                          assetApplies: [{
                            id: `AA${Date.now()}`, submit_id: s.id, submit_title: s.title,
                            applicant_union_id: me.union_id, applicant_name: me.name,
                            status: '待初审', visible_scope: '全员', apply_reason: '作品已达标，申请入库供全员复用',
                            created_at: DEMO_TODAY + ' 12:00',
                          }, ...p.assetApplies],
                          submits: p.submits.map((x) => (x.id === s.id ? { ...x, status: 'ASSET_APPLYING' } : x)),
                        }));
                        log('发起入库申请', s.code, '进入待初审队列');
                        message.success('入库申请已提交');
                      }}
                    >申请入库</Button>
                  )}
                </Space>
              </div>
            ))
          )}
        </Card>
      ))}

      {(me.scope_type !== 'SELF') && (
        <Card size="small" title={<Space><CheckCircleOutlined />本团队提报进度（可见范围：{me.scope_type === 'ALL' ? '全事业群' : '本部门及下级'}）</Space>}>
          <Row gutter={[12, 12]}>
            <Col xs={12} sm={6}>
              <div className="wb-metric num">{teamSubmits.length}</div>
              <div style={{ fontSize: 12, color: COLOR.textSub }}>本团队提报数</div>
            </Col>
            <Col xs={12} sm={6}>
              <div className="wb-metric num">{teamSubmits.filter((s) => s.final_score !== undefined).length}</div>
              <div style={{ fontSize: 12, color: COLOR.textSub }}>已出分</div>
            </Col>
            <Col xs={12} sm={6}>
              <div className="wb-metric num">
                {teamSubmits.filter((s) => (s.final_score ?? 0) >= 60).length}
              </div>
              <div style={{ fontSize: 12, color: COLOR.textSub }}>达标（≥60）</div>
            </Col>
            <Col xs={12} sm={6}>
              <div className="wb-metric num">
                {teamSubmits.length ? Math.round(teamSubmits.reduce((a, b) => a + (b.final_score ?? 0), 0) / teamSubmits.length) : 0}
              </div>
              <div style={{ fontSize: 12, color: COLOR.textSub }}>平均分</div>
            </Col>
          </Row>
          <Divider style={{ margin: '12px 0' }} />
          <Space wrap>
            {teamSubmits.slice(0, 20).map((s) => (
              <Tag key={s.id} color={s.final_score !== undefined ? 'green' : 'default'}>
                {s.name} {s.final_score !== undefined ? `${s.final_score} 分` : '待评分'}
              </Tag>
            ))}
          </Space>
        </Card>
      )}
    </Space>
  );
}
