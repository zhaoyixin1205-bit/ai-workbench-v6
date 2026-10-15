import { Button, Descriptions, Divider, Modal, Progress, Table, Tag, Typography } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/store';
import { SubmitStatusTag } from '@/pages/c/WorkList';
import { TrackTag, SoftTag } from '@/components/ui';
import AttachmentLinks from '@/components/AttachmentLinks';
import type { AssignmentSubmit, ScoreCard } from '@/mock/types';

/**
 * V10.10 作业详情弹窗（只读）。
 * 评委复核与作业管理两处共用：给评委 / 组织者一个**不离开当前页**就能看全
 * 员工作业内容（业务场景 / 前后对比 / 产出样本 / 附件 / 评分明细 / 真实性结论）的入口，
 * 避免此前「评委只能看 AI 评分详情、看不到作业本身」的盲区。
 * 纯展示、无写操作，对现有流程零侵入。
 */
const EMPTY_CARD: ScoreCard = {
  id: '—', name: '未配置评分卡', version: 'v0', total_rule: '加权求和', pass_line: 60,
  ai_weight: 40, judge_weight: 60, status: '草稿', bind_target: '未绑定',
  dimensions: [], updated_at: '',
};

export default function SubmitDetailModal({
  open,
  submitId,
  onClose,
}: {
  open: boolean;
  submitId: string | null;
  onClose: () => void;
}) {
  const { db } = useStore();
  const navigate = useNavigate();
  const s: AssignmentSubmit | undefined = submitId
    ? db.submits.find((x) => x.id === submitId)
    : undefined;

  const card = s
    ? (db.scoreCards.find((c) => c.id === 'SC1' && c.version === s.score_card_version)
      ?? db.scoreCards.find((c) => !c.is_deleted)
      ?? db.scoreCards[0]
      ?? EMPTY_CARD)
    : EMPTY_CARD;

  const results = s ? db.scoreResults.filter((r) => r.target_id === s.id) : [];
  const aiResult = results.find((r) => r.source === 'AI');
  const judgeResults = results.filter((r) => r.source === 'JUDGE' && !r.superseded);

  const dimRows = card.dimensions.map((d) => ({
    key: d.id,
    dim: d.name,
    weight: `${d.weight}%`,
    ai: aiResult?.dim_scores[d.name] ?? '—',
    judge: judgeResults.length
      ? (judgeResults.map((j) => j.dim_scores[d.name]).filter((v) => v !== undefined).pop() ?? '—')
      : '—',
    max: d.max_score,
    standard: d.standard,
  }));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>关闭</Button>,
        <Button
          key="jump" type="primary" icon={<ExportOutlined />} disabled={!s}
          onClick={() => { if (s) navigate(`/work/${s.id}`); }}
        >
          跳转到完整提报页
        </Button>,
      ]}
      width={760}
      style={{ top: '4vh' }}
      title={s ? `作业详情 · ${s.code} ${s.name}` : '作业详情'}
      destroyOnClose
    >
      {!s ? (
        <Typography.Text type="secondary">提报不存在或已删除</Typography.Text>
      ) : (
        <div style={{ maxHeight: '82vh', overflowY: 'auto', paddingRight: 4 }}>
          {/* 标题 + 状态 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <Typography.Title level={4} style={{ margin: 0, fontSize: 19 }}>{s.title}</Typography.Title>
            <SubmitStatusTag status={s.status} />
            <TrackTag track={s.track} />
            <SoftTag text={s.channel} tone="gray" />
          </div>

          <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} colon={false} bordered>
            <Descriptions.Item label="提报编号"><span className="num">{s.code}</span></Descriptions.Item>
            <Descriptions.Item label="提报人">{s.name}（{s.dept_name}）</Descriptions.Item>
            <Descriptions.Item label="提交时间">{s.submitted_at}</Descriptions.Item>
            <Descriptions.Item label="所用 Skill">{s.skill_used}</Descriptions.Item>
            <Descriptions.Item label="评分卡版本">{card.name} {s.score_card_version}</Descriptions.Item>
            <Descriptions.Item label="可见范围">{s.visible_scope}</Descriptions.Item>
          </Descriptions>

          <Divider orientation="left" style={{ fontSize: 14, marginTop: 18 }}>业务场景说明</Divider>
          <Typography.Paragraph style={{ color: '#4B5060', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
            {s.scene_desc || '—'}
          </Typography.Paragraph>

          {s.before_after && (
            <>
              <Divider orientation="left" style={{ fontSize: 14 }}>{s.channel?.startsWith('通道一') ? '前后对比' : '实测记录'}</Divider>
              <Typography.Paragraph style={{ color: '#4B5060', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                {s.before_after}
              </Typography.Paragraph>
            </>
          )}

          <Divider orientation="left" style={{ fontSize: 14 }}>产出样本</Divider>
          <Typography.Paragraph style={{ color: '#4B5060', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
            {s.output_sample || '—'}
          </Typography.Paragraph>

          <div style={{ marginBottom: 8 }}>
            <AttachmentLinks items={s.attachments} />
          </div>

          {/* 评分明细：已出分才展示，未出分保持「尚未评分」提示，与员工端一致 */}
          <Divider orientation="left" style={{ fontSize: 14 }}>评分明细</Divider>
          {s.final_score === undefined ? (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              尚未评分，组织者触发评分后将在此展示
            </Typography.Text>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <ScoreBlock label="AI 分（百分制）" value={s.ai_score ?? '—'} />
                <ScoreBlock label={`评委分（${card.judge_weight}%）`} value={s.judge_score ?? '—'} />
                <ScoreBlock label={`最终分（及格线 ${card.pass_line}）`} value={s.final_score} highlight />
              </div>
              <Progress
                percent={Math.round(((s.final_score ?? 0) / 100) * 100)}
                strokeColor={s.final_score >= card.pass_line ? '#16A34A' : '#DC2626'}
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
                <div style={{ marginTop: 14, background: '#FAFBFC', borderRadius: 12, padding: '12px 14px', fontSize: 13 }}>
                  <Typography.Text strong>AI 评分理由：</Typography.Text>
                  <Typography.Paragraph style={{ color: '#4B5060', marginTop: 4, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                    {aiResult.reason}
                  </Typography.Paragraph>
                </div>
              )}
            </>
          )}

          {/* 真实性结论（防代笔） */}
          <Divider orientation="left" style={{ fontSize: 14 }}>真实性结论</Divider>
          {s.confirmed ? (
            <div style={{ background: '#FAFBFC', borderRadius: 12, padding: '12px 14px', fontSize: 13 }}>
              <Tag color={s.confirmed.result === '真实' ? 'green' : 'red'}>
                {s.confirmed.result}（确认人 {s.confirmed.by} · {s.confirmed.at}）
              </Tag>
              {s.confirmed.note && <div style={{ marginTop: 6, color: '#4B5060' }}>备注：{s.confirmed.note}</div>}
            </div>
          ) : s.spot_check ? (
            <div style={{ background: '#FAFBFC', borderRadius: 12, padding: '12px 14px', fontSize: 13 }}>
              {[
                { q: '① 真实输入是什么', a: s.spot_check.q1 },
                { q: '② 中途改过什么', a: s.spot_check.q2 },
                { q: '③ 同事用的反馈', a: s.spot_check.q3 },
              ].map((item) => (
                <div key={item.q} style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 700 }}>{item.q}</div>
                  <div style={{ color: '#4B5060' }}>{item.a}</div>
                </div>
              ))}
              <Tag color="green">结论：{s.spot_check.result}（抽查人 {s.spot_check.by}）</Tag>
            </div>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>尚未完成真实性确认 / 抽查</Typography.Text>
          )}
        </div>
      )}
    </Modal>
  );
}

function ScoreBlock({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{
      flex: '1 1 150px', padding: '12px 16px', borderRadius: 14,
      background: highlight ? '#FFF1E9' : '#FAFBFC',
      border: highlight ? '1px solid #FFD9C2' : '1px solid #F0F1F4',
    }}>
      <div className="num" style={{ fontSize: 26, fontWeight: 800, color: highlight ? '#FF6B35' : '#2B2A33' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 6 }}>{label}</div>
    </div>
  );
}
