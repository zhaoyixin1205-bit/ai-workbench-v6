import { App as AntApp, Button, Table, Timeline } from 'antd';
import { ArrowLeftOutlined, InboxOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '@/store/store';
import { SubmitStatusTag } from '@/pages/c/WorkList';
import { TrackTag, SoftTag } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { SubmitStatus } from '@/mock/types';
import '../../theme/v2/template.css';

/**
 * 提报详情 v2（P3-4）
 *
 * 功能对等（对照 v1 `pages/c/WorkDetail.tsx`）：
 *   页头（标题 + 状态 + 赛道 + 渠道）+ 6 项元信息
 *   业务场景说明 / 前后对比（或实测记录）/ 产出样本 / 附件
 *   评分明细：AI 分 / 评委分 / 最终分 三块 + 及格线进度 + 维度表 + AI 评分理由 + 公示口径说明
 *   真实性确认（或 3 问抽查，受 judgeConfirmMode 开关控制）+ 状态流转时间线
 *   底部操作：申请入库 / 修改提报
 * 「提报不存在」由 v1 的一行文案升级为 404 空态页，其余逻辑完全同源。
 */
const FLOW: { status: SubmitStatus[]; label: string; color: string }[] = [
  { status: ['DRAFT'], label: '草稿', color: 'gray' },
  { status: ['SUBMITTED'], label: '已提交', color: 'blue' },
  { status: ['SCORING_AI', 'AI_SCORED'], label: 'AI 已出分', color: 'cyan' },
  { status: ['REVIEWING', 'REVIEWED'], label: '评委复核', color: 'purple' },
  { status: ['SPOT_CHECK', 'PASSED', 'REJECTED'], label: '3 问抽查', color: 'gold' },
  { status: ['PUBLISHED'], label: '已公示', color: 'green' },
  { status: ['ASSET_APPLYING', 'ASSET_ONLINE', 'ASSET_REJECTED'], label: '入库', color: 'geekblue' },
];

export default function WorkDetailV2() {
  const { id } = useParams();
  const { db, me, log, flags } = useStore();
  const { message } = AntApp.useApp();
  /** V4.0 CR-07：确认制开关（关闭时沿用 V3.0 的三问抽查文案与流程） */
  const confirmMode = flags.judgeConfirmMode !== false;

  const s = db.submits.find((x) => x.id === id);

  if (!s) {
    return (
      <div className="wb2-empty">
        <div className="ic"><InboxOutlined /></div>
        <div className="t">提报不存在</div>
        <div className="d">该提报可能已被撤回或删除</div>
        <Link to="/work"><Button>返回作业提报</Button></Link>
      </div>
    );
  }

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
    <div>
      <Link to="/work" className="wb2-note" style={{ display: 'inline-block', marginBottom: 'var(--wb-space-3)' }}>
        <ArrowLeftOutlined /> 返回作业提报
      </Link>

      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">{s.title}</div>
          <div style={{ display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap', marginTop: 'var(--wb-space-2)' }}>
            <SubmitStatusTag status={s.status} />
            <TrackTag track={s.track} />
            <SoftTag text={s.channel} tone="gray" />
          </div>
        </div>
      </div>

      {/* 元信息 */}
      <div className="wb2-card" style={{ marginBottom: 'var(--wb-space-5)' }}>
        <div className="wb2-card-pad">
          <div className="wb2-metrics c6">
            {[
              ['提报编号', s.code],
              ['提报人', `${s.name}（${s.dept_name}）`],
              ['提交时间', s.submitted_at],
              ['所用 Skill', s.skill_used],
              ['评分卡版本', `${card.name} ${s.score_card_version}`],
              ['可见范围', s.visible_scope],
            ].map(([k, v]) => (
              <div className="wb2-metric" key={k}>
                <div className="lb">{k}</div>
                <div className="vl" style={{ fontSize: 'var(--wb-fs-body)', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="wb2-grid2">
        <div>
          {/* 正文内容 */}
          <div className="wb2-card" style={{ marginBottom: 'var(--wb-space-5)' }}>
            <div className="wb2-card-t">业务场景说明</div>
            <div className="wb2-card-pad">
              <div className="wb2-kv">{s.scene_desc}</div>
              {s.before_after && (
                <>
                  <div className="wb2-card-t" style={{ marginTop: 'var(--wb-space-5)' }}>
                    {s.channel.startsWith('通道一') ? '前后对比' : '实测记录'}
                  </div>
                  <div className="wb2-kv">{s.before_after}</div>
                </>
              )}
              <div className="wb2-card-t" style={{ marginTop: 'var(--wb-space-5)' }}>产出样本</div>
              <div className="wb2-kv">{s.output_sample}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--wb-space-2)', marginTop: 'var(--wb-space-4)' }}>
                {s.attachments.map((a) => <SoftTag key={a.name} text={`📎 ${a.name}（${a.size}）`} tone="gray" />)}
              </div>
            </div>
          </div>

          {/* 评分明细 */}
          <div className="wb2-card">
            <div className="wb2-card-t">评分明细（与提报时绑定的评分卡版本一致）</div>
            <div className="wb2-card-pad">
              {s.final_score === undefined ? (
                <div className="wb2-note">尚未评分，组织者触发评分后将在此展示</div>
              ) : (
                <>
                  <div className="wb2-metrics c3">
                    <div className="wb2-metric">
                      <div className="lb">AI 分（{card.ai_weight}%）</div>
                      <div className="vl">{s.ai_score ?? '—'}</div>
                    </div>
                    <div className="wb2-metric">
                      <div className="lb">评委分（{card.judge_weight}%）</div>
                      <div className="vl">{s.judge_score ?? '—'}</div>
                    </div>
                    <div className="wb2-metric">
                      <div className="lb">最终分（及格线 {card.pass_line}）</div>
                      <div className="vl accent">{s.final_score}</div>
                    </div>
                  </div>
                  <div className="wb2-prog" style={{ marginTop: 'var(--wb-space-4)' }}>
                    <i style={{
                      width: `${Math.round(((s.final_score ?? 0) / 100) * 100)}%`,
                      background: (s.final_score ?? 0) >= card.pass_line ? 'var(--wb-success)' : 'var(--wb-error)',
                    }} />
                  </div>
                  <Table
                    size="small" pagination={false} dataSource={dimRows} style={{ marginTop: 'var(--wb-space-4)' }}
                    columns={[
                      { title: '维度', dataIndex: 'dim' },
                      { title: '权重', dataIndex: 'weight', width: 70 },
                      { title: 'AI', dataIndex: 'ai', width: 60 },
                      { title: '评委', dataIndex: 'judge', width: 60 },
                      { title: '满分', dataIndex: 'max', width: 60 },
                      { title: '评分标准', dataIndex: 'standard' },
                    ]}
                  />
                  {aiResult && (
                    <div className="wb2-quote" style={{ marginTop: 'var(--wb-space-4)' }}>
                      <b>AI 评分理由：</b>{aiResult.reason}
                    </div>
                  )}
                  <div className="wb2-note" style={{ marginTop: 'var(--wb-space-4)' }}>
                    评语默认不公示（Q9）；当前展示遵循公示配置：提报详情「{db.campaigns[0]?.visibility.workDetail ?? '按配置'}可见」
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div>
          {/* 真实性确认 / 3 问抽查 */}
          <div className="wb2-card" style={{ marginBottom: 'var(--wb-space-5)' }}>
            <div className="wb2-card-t">{confirmMode ? '真实性确认（防代笔）' : '3 问抽查（防代笔）'}</div>
            <div className="wb2-card-pad">
              {confirmMode && s.confirmed ? (
                <>
                  <div className="wb2-quote">
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>确认结论</div>
                    {s.confirmed.result === '真实' ? '本人真实作品' : '存疑，已退回重新复核'}
                    {s.confirmed.note ? ` · ${s.confirmed.note}` : ''}
                  </div>
                  <div style={{ marginTop: 'var(--wb-space-3)' }}>
                    <span className={`wb2-tag ${s.confirmed.result === '真实' ? 'ok' : 'er'}`}>
                      <i className="d" />
                      <CheckCircleOutlined /> {s.confirmed.result}（确认人 {s.confirmed.by} · {s.confirmed.at}）
                    </span>
                  </div>
                </>
              ) : s.spot_check ? (
                <>
                  {[
                    { q: '① 真实输入是什么', a: s.spot_check.q1 },
                    { q: '② 中途改过什么', a: s.spot_check.q2 },
                    { q: '③ 同事用的反馈', a: s.spot_check.q3 },
                  ].map((item) => (
                    <div className="wb2-quote" key={item.q} style={{ marginBottom: 'var(--wb-space-2)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.q}</div>
                      {item.a}
                    </div>
                  ))}
                  <span className={`wb2-tag ${s.spot_check.result === '通过' ? 'ok' : 'er'}`}>
                    <i className="d" />
                    <CheckCircleOutlined /> 结论：{s.spot_check.result}（抽查人 {s.spot_check.by}）
                  </span>
                </>
              ) : (
                <div className="wb2-note">
                  {confirmMode ? '尚未完成真实性确认（前 10 名必做）' : '未进入抽查（前 10 名必做）'}
                </div>
              )}
            </div>
          </div>

          {/* 状态流转 */}
          <div className="wb2-card">
            <div className="wb2-card-t">状态流转</div>
            <div className="wb2-card-pad">
              <Timeline
                items={FLOW.map((f, i) => ({
                  color: i <= currentStep ? f.color : 'gray',
                  children: (
                    <span style={{
                      color: i <= currentStep ? 'var(--wb-ink-1)' : 'var(--wb-ink-4)',
                      fontWeight: i === currentStep ? 700 : 400,
                      fontSize: 'var(--wb-fs-label)',
                    }}>
                      {f.label === '3 问抽查' && confirmMode ? '真实性确认' : f.label}
                    </span>
                  ),
                }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 底部操作 */}
      <div className="wb2-actbar">
        <Button
          icon={<InboxOutlined />}
          disabled={!['PASSED', 'PUBLISHED', 'REVIEWED'].includes(s.status)}
          onClick={() => { log('发起入库申请', s.code, '进入待初审队列'); }}
        >申请入库</Button>
        <Button
          disabled={!['SUBMITTED', 'AI_SCORED'].includes(s.status)}
          onClick={() => message.info('修改窗口：未被批改且未到截止前可反复修改，不消耗次数')}
        >修改提报</Button>
        <span className="wb2-note">演示日期 {DEMO_TODAY} · 当前身份 {me.name}</span>
      </div>
    </div>
  );
}
