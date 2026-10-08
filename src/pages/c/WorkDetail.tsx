import { Button, Card, Col, Descriptions, Row, Space, Tag, Timeline, Typography, Progress, Divider, App as AntApp, Table } from 'antd';
import { ArrowLeftOutlined, InboxOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { SubmitStatusTag } from './WorkList';
import { TrackTag, SoftTag } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { SubmitStatus } from '@/mock/types';
import { canApplyAsset } from '@/constants/statusMeta';

const FLOW: { status: SubmitStatus[]; label: string; color: string }[] = [
  { status: ['DRAFT'], label: '草稿', color: 'gray' },
  { status: ['SUBMITTED'], label: '已提交', color: 'blue' },
  { status: ['SCORING_AI', 'AI_SCORED'], label: 'AI 已出分', color: 'cyan' },
  { status: ['REVIEWING', 'REVIEWED'], label: '评委复核', color: 'purple' },
  { status: ['SPOT_CHECK', 'PASSED', 'REJECTED'], label: '3 问抽查', color: 'gold' },
  { status: ['PUBLISHED'], label: '已公示', color: 'green' },
  { status: ['ASSET_APPLYING', 'ASSET_ONLINE', 'ASSET_REJECTED'], label: '入库', color: 'geekblue' },
];

/** 评分数字块：统一三栏口径展示 */
function ScoreCell({ value, label, highlight }: { value: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14, height: '100%',
      background: highlight ? GRADIENT.metric : '#FAFBFC',
      border: highlight ? '1px solid #FFE4D9' : '1px solid #F0F1F4',
    }}>
      <div
        className="num"
        style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1,
          color: highlight ? COLOR.primary : COLOR.text,
        }}
      >{value}</div>
      <div style={{ fontSize: 12, color: COLOR.textSub, marginTop: 6 }}>{label}</div>
    </div>
  );
}

export default function WorkDetail() {
  const { id } = useParams();
  const { db, me, log, flags } = useStore();
  /** V4.0 CR-07：确认制开关（关闭时沿用 V3.0 的三问抽查文案与流程） */
  const confirmMode = flags.judgeConfirmMode !== false;
  const { message } = AntApp.useApp();

  const s = db.submits.find((x) => x.id === id);
  if (!s) return <Card>提报不存在</Card>;

  const card = db.scoreCards.find((c) => c.id === 'SC1' && c.version === s.score_card_version) ?? db.scoreCards[0];
  const results = db.scoreResults.filter((r) => r.target_id === s.id);
  const aiResult = results.find((r) => r.source === 'AI');
  const judgeResult = results.find((r) => r.source === 'JUDGE');
  const currentStep = Math.max(0, FLOW.findIndex((f) => f.status.includes(s.status)));

  const dimRows = card.dimensions.map((d) => ({
    key: d.id,
    dim: d.name,
    weight: `${d.weight}%`,
    ai: aiResult?.dim_scores[d.name] ?? '—',
    judge: judgeResult?.dim_scores[d.name] ?? '—',
    max: d.max_score,
    standard: d.standard,
  }));

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Link to="/work" style={{ color: COLOR.textSub, fontSize: 13, fontWeight: 500 }}>
        <ArrowLeftOutlined /> 返回作业提报
      </Link>

      <Card styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '22px 24px', background: GRADIENT.subtle, borderBottom: `1px solid ${COLOR.borderLight}` }}>
          <Space size={8} wrap style={{ marginBottom: 10 }}>
            <Typography.Title level={4} style={{ margin: 0, fontSize: 20 }}>{s.title}</Typography.Title>
            <SubmitStatusTag status={s.status} />
            <TrackTag track={s.track} />
            <SoftTag text={s.channel} tone="gray" />
          </Space>
          <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} colon={false}>
            <Descriptions.Item label="提报编号"><span className="num">{s.code}</span></Descriptions.Item>
            <Descriptions.Item label="提报人">{s.name}（{s.dept_name}）</Descriptions.Item>
            <Descriptions.Item label="提交时间">{s.submitted_at}</Descriptions.Item>
            <Descriptions.Item label="所用 Skill">{s.skill_used}</Descriptions.Item>
            <Descriptions.Item label="评分卡版本">{card.name} {s.score_card_version}</Descriptions.Item>
            <Descriptions.Item label="可见范围">{s.visible_scope}</Descriptions.Item>
          </Descriptions>
        </div>

        <div style={{ padding: 24 }}>
          <Divider orientation="left" style={{ fontSize: 14, marginTop: 0 }}>业务场景说明</Divider>
          <Typography.Paragraph style={{ color: COLOR.textSub, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{s.scene_desc}</Typography.Paragraph>
          {s.before_after && (
            <>
              <Divider orientation="left" style={{ fontSize: 14 }}>{s.channel.startsWith('通道一') ? '前后对比' : '实测记录'}</Divider>
              <Typography.Paragraph style={{ color: COLOR.textSub, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{s.before_after}</Typography.Paragraph>
            </>
          )}
          <Divider orientation="left" style={{ fontSize: 14 }}>产出样本</Divider>
          <Typography.Paragraph style={{ color: COLOR.textSub, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{s.output_sample}</Typography.Paragraph>
          <Space wrap>{s.attachments.map((a) => <SoftTag key={a.name} text={`📎 ${a.name}（${a.size}）`} tone="gray" />)}</Space>
        </div>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card title="评分明细（与提报时绑定的评分卡版本一致）">
            {s.final_score === undefined ? (
              <Typography.Text type="secondary">尚未评分，组织者触发评分后将在此展示</Typography.Text>
            ) : (
              <>
                <Row gutter={12} style={{ marginBottom: 18 }}>
                  <Col span={8}><ScoreCell value={s.ai_score ?? '—'} label={`AI 分（${card.ai_weight}%）`} /></Col>
                  <Col span={8}><ScoreCell value={s.judge_score ?? '—'} label={`评委分（${card.judge_weight}%）`} /></Col>
                  <Col span={8}><ScoreCell value={s.final_score} label={`最终分（及格线 ${card.pass_line}）`} highlight /></Col>
                </Row>
                <Progress
                  percent={Math.round(((s.final_score ?? 0) / 100) * 100)}
                  strokeColor={s.final_score >= card.pass_line ? COLOR.success : COLOR.error}
                  style={{ marginBottom: 16 }}
                />
                <Table
                  size="small" pagination={false} dataSource={dimRows}
                  columns={[
                    { title: '维度', dataIndex: 'dim' },
                    { title: '权重', dataIndex: 'weight', width: 70 },
                    { title: 'AI', dataIndex: 'ai', width: 60, render: (v: number | string) => <span className="num">{v}</span> },
                    { title: '评委', dataIndex: 'judge', width: 60, render: (v: number | string) => <span className="num">{v}</span> },
                    { title: '满分', dataIndex: 'max', width: 60, render: (v: number) => <span className="num">{v}</span> },
                    { title: '评分标准', dataIndex: 'standard' },
                  ]}
                />
                {aiResult && (
                  <div style={{ marginTop: 14, background: '#FAFBFC', borderRadius: 12, padding: '12px 14px' }}>
                    <Typography.Text strong>AI 评分理由：</Typography.Text>
                    <Typography.Paragraph style={{ color: COLOR.textSub, marginTop: 4, marginBottom: 0 }}>{aiResult.reason}</Typography.Paragraph>
                  </div>
                )}
                <Divider />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  评语默认不公示（Q9）；当前展示遵循公示配置：提报详情「{db.campaigns?.[0]?.visibility?.workDetail ?? '按配置'}可见」
                </Typography.Text>
              </>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title={confirmMode ? '真实性确认（防代笔）' : '3 问抽查（防代笔）'}>
            {confirmMode && s.confirmed ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ background: '#FAFBFC', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>确认结论</div>
                  <div style={{ color: COLOR.textSub, fontSize: 13 }}>
                    {s.confirmed.result === '真实' ? '本人真实作品' : '存疑，已退回重新复核'}
                    {s.confirmed.note ? ` · ${s.confirmed.note}` : ''}
                  </div>
                </div>
                <Tag color={s.confirmed.result === '真实' ? 'green' : 'red'}>
                  <CheckCircleOutlined /> {s.confirmed.result}（确认人 {s.confirmed.by} · {s.confirmed.at}）
                </Tag>
              </Space>
            ) : s.spot_check ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {[
                  { q: '① 真实输入是什么', a: s.spot_check.q1 },
                  { q: '② 中途改过什么', a: s.spot_check.q2 },
                  { q: '③ 同事用的反馈', a: s.spot_check.q3 },
                ].map((item) => (
                  <div key={item.q} style={{ background: '#FAFBFC', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.q}</div>
                    <div style={{ color: COLOR.textSub, fontSize: 13 }}>{item.a}</div>
                  </div>
                ))}
                <Tag color={s.spot_check.result === '通过' ? 'green' : 'red'}>
                  <CheckCircleOutlined /> 结论：{s.spot_check.result}（抽查人 {s.spot_check.by}）
                </Tag>
              </Space>
            ) : (
              <Typography.Text type="secondary">
                {confirmMode ? '尚未完成真实性确认（前 10 名必做）' : '未进入抽查（前 10 名必做）'}
              </Typography.Text>
            )}
          </Card>

          <Card title="状态流转" style={{ marginTop: 16 }}>
            <Timeline
              items={FLOW.map((f, i) => ({
                color: i <= currentStep ? f.color : 'gray',
                children: (
                  <span style={{ color: i <= currentStep ? COLOR.text : '#9CA3AF', fontWeight: i === currentStep ? 700 : 400 }}>
                    {f.label === '3 问抽查' && confirmMode ? '真实性确认' : f.label}
                  </span>
                ),
              }))}
            />
          </Card>

          <div className="wb-card" style={{ marginTop: 16, background: GRADIENT.metric, border: '1px solid #FFE4D9', boxShadow: SHADOW.card }}>
            <Space wrap>
              <Button
                icon={<InboxOutlined />} disabled={!canApplyAsset(s.status)}
                onClick={() => {
                  log('发起入库申请', s.code, '进入待初审队列');
                  message.success('入库申请已提交');
                }}
              >申请入库</Button>
              <Button
                disabled={!['SUBMITTED', 'AI_SCORED'].includes(s.status)}
                onClick={() => message.info('修改窗口：未被批改且未到截止前可反复修改，不消耗次数')}
              >修改提报</Button>
            </Space>
            <div style={{ marginTop: 10, fontSize: 12, color: COLOR.textSub }}>
              演示日期 {DEMO_TODAY} · 当前身份 {me.name}
            </div>
          </div>
        </Col>
      </Row>
    </Space>
  );
}
