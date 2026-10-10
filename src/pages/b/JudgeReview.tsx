import { Button, Card, Col, Form, Input, InputNumber, Modal, Progress, Radio, Row, Select, Slider, Space, Table, Tabs, Tag, Typography, App as AntApp, Alert, Divider, Empty } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader } from '@/components/ui';
import type { AssignmentSubmit, ScoreCard, ScoreResult } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { statusText, statusColor } from '@/constants/statusMeta';
import { averageJudgeScore, composeFinalScore, effectiveJudgeScores } from '@/service/judgeScoring';
import { aiScoreOf, periodLabelOf, seqNo, submitterNameOf, typeNameOf } from '@/service/judgeListView';
import { useNoteVisible } from '@/auth/annotation';
import AiScoreDetail, { aiResultOf, buildAiDetail } from '@/components/AiScoreDetail';

/**
 * V7.0 CR-32：兜底空卡。原实现对 SC1 用了非空断言（`!`），一旦没有启用的卡就白屏；
 * 改为回退到本对象，页面照常渲染并提示「未配置评分卡」，不再崩溃。
 */
const EMPTY_CARD: ScoreCard = {
  id: '—', name: '未配置评分卡', version: 'v0', total_rule: '加权求和', pass_line: 60,
  ai_weight: 40, judge_weight: 60, status: '草稿', bind_target: '未绑定',
  dimensions: [], updated_at: '',
};

/** V4.0 CR-07：抽查三问 → 一次「真实性确认」 */
interface ConfirmDraft {
  agree: boolean;
  result: '真实' | '存疑';
  note: string;
  /** judge.deepSpotCheck 开启时才需要（可选高级问卷） */
  q1?: string;
  q2?: string;
  q3?: string;
}

/**
 * V7.0 CR-32：本组件被两处复用 ——
 *  - variant='admin'（默认）：后台「评委复核」，自带 PageHeader；
 *  - variant='c'：C 端「评委评分」（/judge），由外层页面提供标题，
 *    且按确认项 5 拆成「待我评分」+「我的历史评分（可修改）」两个 Tab。
 */
export default function JudgeReview({ variant = 'admin' }: { variant?: 'admin' | 'c' }) {
  const isC = variant === 'c';
  const { db, me, setDb, log, hasRole, flags } = useStore();
  /** V8.6-10.08：口径 / 规则注解仅运营方与管理员可见 */
  const note = useNoteVisible();
  const { message } = AntApp.useApp();
  /** V8.4-10.07：提示文案必须跟总闸一致，不能开关关着还说「已推送」 */
  const autoPush = db.pushSettings?.autoPush === true;
  const [current, setCurrent] = useState<AssignmentSubmit | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [opinion, setOpinion] = useState('');
  const [spot, setSpot] = useState<{ q1: string; q2: string; q3: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmDraft | null>(null);
  /** V7.0 CR-32：历史评分修订目标（确认项 5：能看到历史评分并进行修改） */
  const [reviseTarget, setReviseTarget] = useState<ScoreResult | null>(null);
  const [cTab, setCTab] = useState<'pending' | 'history'>('pending');
  /** V8.3-10.10 AI 评分详情弹窗：记录当前查看的提报 id */
  const [aiDetailId, setAiDetailId] = useState<string | null>(null);

  /** PRD V4.0 §6.2：ADMIN 可进入本页查看（菜单可见），但无业务审批权，操作入口禁用 */
  const canOperate = hasRole('JUDGE', 'ORGANIZER');
  /** 开关：judge.confirmMode 关闭 → 回到 V3.0 的三问抽查；judge.deepSpotCheck 开启 → 展开高级问卷 */
  const confirmMode = flags.judgeConfirmMode !== false;
  const deepSpot = flags.judgeDeepSpotCheck === true;

  /** V4.0 CR-07：已做真实性确认的作业保留在队列内（便于截止前撤回重评），仅本开关路径下才会出现 confirmed 字段 */
  /**
   * V7.0 CR-32：去掉对 SC1 的硬编码非空断言 —— 原写法在未启用 SC1 时会直接白屏，
   * C 端复用后触发概率更高。改为「启用的卡 → 任意未软删的卡」两级回退。
   */
  const card = db.scoreCards.find((c) => c.id === 'SC1' && c.status === '启用' && !c.is_deleted)
    ?? db.scoreCards.find((c) => c.status === '启用' && !c.is_deleted)
    ?? db.scoreCards.find((c) => !c.is_deleted)
    ?? EMPTY_CARD;

  /** 我已评分过的提报（用于 C 端区分「待我评分」与「已评分」） */
  const myJudgedIds = new Set(
    db.scoreResults.filter((r) => r.source === 'JUDGE' && r.scorer_union_id === me.union_id).map((r) => r.target_id),
  );
  /** V7.0 CR-32：我的历史评分记录（最新在前），供 C 端「历史评分」Tab 展示与修改 */
  const myHistory = db.scoreResults
    .filter((r) => r.source === 'JUDGE' && r.scorer_union_id === me.union_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const baseQueue = db.submits.filter(
    (s) => (['AI_SCORED', 'REVIEWING', 'REVIEWED', 'SPOT_CHECK'].includes(s.status) || !!s.confirmed)
      && s.union_id !== me.union_id,
  );
  /** C 端「待我评分」= 队列里我还没打过分的；后台保持原口径不变（兼容既有行为） */
  const queue = isC ? baseQueue.filter((s) => !myJudgedIds.has(s.id)) : baseQueue;

  const total = card.dimensions.reduce((a, d) => a + (scores[d.name] ?? 0), 0);
  const now = () => `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;

  /** V7.0 CR-32：历史评分修订入口（确认项 5）—— 预填原分与原意见 */
  const openRevise = (r: ScoreResult) => {
    const s = db.submits.find((x) => x.id === r.target_id);
    if (!s) { message.error('原提报不存在，无法修订'); return; }
    setReviseTarget(r);
    setCurrent(s);
    setScores({ ...r.dim_scores });
    setOpinion(r.reason ?? '');
  };

  /**
   * V7.0 CR-32：提交修订 —— 遵循项目「覆盖不覆写」原则：
   * 原评分记录保持不可变，修订以**新记录**追加，提报上的分数指向最新一次。
   */
  const submitRevise = () => {
    const r = reviseTarget!;
    const s = current!;
    /**
     * V8.3-10.09 修订同样走「替换本人旧分 + 取均分」口径 ——
     * 修订是「同一评委改自己的分」，若把旧分留着一起平均，等于让一个人占两票。
     */
    setDb((p) => {
      const prevOfMe = p.scoreResults.filter(
        (x) => x.target_id === s.id && x.source === 'JUDGE' && x.scorer_union_id === me.union_id,
      );
      const kept = p.scoreResults.map((x) =>
        prevOfMe.some((o) => o.id === x.id) ? { ...x, superseded: true } : x,
      );
      const next = [...kept, {
        id: `SR-${s.id}-JD-${me.union_id}-${Date.now()}`, target_type: 'submit' as const, target_id: s.id,
        card_id: card.id, card_version: card.version, source: 'JUDGE' as const,
        dim_scores: scores, total, reason: opinion,
        scorer_union_id: me.union_id, scorer_name: me.name, created_at: now(),
      }];
      const avg = averageJudgeScore(next, s.id);
      const final = composeFinalScore(s.ai_score, avg, card.ai_weight, card.judge_weight);
      return {
        ...p,
        submits: p.submits.map((x) => (x.id === s.id
          ? { ...x, judge_score: Math.round((avg ?? total) * 10) / 10, final_score: final } : x)),
        scoreResults: next,
      };
    });
    log('修订历史评分', s.code,
      `原 ${r.total} 分（${r.created_at}）→ 现 ${total} 分；修订不覆写，原记录保留可追溯`);
    message.success(`已修订为 ${total} 分（原 ${r.total} 分记录保留）`);
    setReviseTarget(null); setCurrent(null); setScores({}); setOpinion('');
  };

  const submitScore = () => {
    if (card.dimensions.length === 0) { message.warning('评分卡未配置维度，请先到「评分卡管理」配置'); return; }
    if (Object.keys(scores).length < card.dimensions.length) { message.warning('请完成所有维度打分'); return; }
    if (opinion.trim().length < 10) { message.warning('复核意见至少 10 字'); return; }
    /** 修订态走另一条分支：新增记录而非覆写 */
    if (reviseTarget) { submitRevise(); return; }
    const scoredAt = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    /**
     * V8.3-10.09 多人评委：同一评委再打分 → 替换自己上一条（标 superseded），
     * 不重复累加；最终分取所有有效评委分的**平均**（口径：多个评委均可评价，取平均值）。
     */
    setDb((p) => {
      const prevOfMe = p.scoreResults.filter(
        (r) => r.target_id === current!.id && r.source === 'JUDGE' && r.scorer_union_id === me.union_id,
      );
      const kept = p.scoreResults.map((r) =>
        prevOfMe.some((o) => o.id === r.id) ? { ...r, superseded: true } : r,
      );
      const mine = {
        id: `SR-${current!.id}-JD-${me.union_id}-${Date.now()}`, target_type: 'submit' as const,
        target_id: current!.id, card_id: card.id, card_version: card.version, source: 'JUDGE' as const,
        dim_scores: scores, total, reason: opinion,
        scorer_union_id: me.union_id, scorer_name: me.name, created_at: scoredAt,
      };
      const nextResults = [...kept, mine];
      const avg = averageJudgeScore(nextResults, current!.id);
      const final = composeFinalScore(current!.ai_score, avg, card.ai_weight, card.judge_weight);
      const judgeCount = effectiveJudgeScores(nextResults, current!.id).length;
      return {
        ...p,
        submits: p.submits.map((s) => (s.id === current!.id
          ? { ...s, status: 'REVIEWED', judge_score: Math.round((avg ?? total) * 10) / 10, final_score: final }
          : s)),
        scoreResults: nextResults,
        /** V8.3-10.07：打分是链路上的一环，必须留流转痕；随后由流水线自动推送「真实性复核」待办 */
        submitFlowLogs: [{
          id: `FL${Date.now()}`, submit_id: current!.id,
          from_status: current!.status, to_status: 'REVIEWED',
          operator: me.name,
          reason: `${card.name} ${card.version} 四维合计 ${total}（第 ${judgeCount} 位评委，当前均分 ${(avg ?? total).toFixed(1)}）`,
          created_at: scoredAt,
        }, ...p.submitFlowLogs],
      };
    });
    log('评委复核打分', current!.code, `四维合计 ${total}，意见：${opinion.slice(0, 20)}…`);
    const cnt = (db.scoreResults.filter((r) => r.target_id === current!.id && r.source === 'JUDGE' && !r.superseded).length) + 1;
    message.success(
      `复核完成，最终分按 AI ${card.ai_weight}% + 评委 ${card.judge_weight}% 合成` +
      `（当前 ${cnt} 位评委，取平均）` +
      `${autoPush ? '；已推送组织者做真实性复核' : '；组织者不会自动收到提醒，需到「作业管理」手动发起推送'}`,
    );
    setCurrent(null); setScores({}); setOpinion('');
  };

  /** V3.0 保留路径：judge.confirmMode 关闭时的三问抽查 */
  const submitSpot = () => {
    if (!spot || !spot.q1 || !spot.q2 || !spot.q3) { message.warning('3 问必须全部填写'); return; }
    /**
     * V8.3-10.07：三问抽查是「真实性复核」的另一条表单形态，链路终点必须与 confirmMode 路径一致
     * （旧实现写 PASSED，导致这条路的作业永远触发不到「确认公示 / 可申请入库」的推送）。
     */
    const spotAt = now();
    setDb((p) => ({
      ...p,
      submits: p.submits.map((s) => (s.id === current!.id
        ? { ...s, status: 'COMPLETED', spot_check: { ...spot, result: '通过', by: me.name } } : s)),
      submitFlowLogs: [{
        id: `FL${Date.now()}`, submit_id: current!.id,
        from_status: current!.status, to_status: 'COMPLETED',
        operator: me.name, reason: '三问抽查结论：通过', created_at: spotAt,
      }, ...p.submitFlowLogs],
    }));
    log('3 问抽查', current!.code, '结论：通过');
    message.success(`抽查结论：通过，已进入「已完成」${autoPush ? '；已推送组织者确认公示' : '；如需提醒组织者确认公示，请到「作业管理」手动发起推送'}`);
    setSpot(null); setCurrent(null);
  };

  /** V4.0 CR-07：确认真实性 —— 确认即代表复核结束，可在评分截止前撤回重评 */
  const submitConfirm = () => {
    if (!confirm?.agree) { message.error('请先勾选「确认为本人真实作品」'); return; }
    if (confirm.result === '存疑' && (confirm.note?.trim().length ?? 0) < 10) {
      message.error('标记为「存疑」时必须填写不少于 10 字的说明');
      return;
    }
    const prevStatus = current!.status;
    /**
     * V8.3-10.07：链路末端的统一”—— 真实 → COMPLETED（V6.0 CR-19 口径，公示不再是前置条件），
     * 而不是老的 PASSED。走到 COMPLETED 后流水线会自动推送「组织者确认公示 / 员工可申请入库」。
     */
    const nextStatus: AssignmentSubmit['status'] = confirm.result === '真实' ? 'COMPLETED' : 'REVIEWING';
    const confirmedAt = now();
    setDb((p) => ({
      ...p,
      submits: p.submits.map((s) => (s.id === current!.id
        ? {
            ...s, status: nextStatus,
            confirmed: { by: me.name, at: confirmedAt, result: confirm.result, note: confirm.note || undefined },
            /** deepSpotCheck 开启且已填写时，仍写入 deprecated 的三问字段（保留历史读取） */
            spot_check: deepSpot && confirm.q1 && confirm.q2 && confirm.q3
              ? { q1: confirm.q1, q2: confirm.q2, q3: confirm.q3, result: '通过', by: me.name }
              : s.spot_check,
          } : s)),
      submitFlowLogs: [{
        id: `FL${Date.now()}`, submit_id: current!.id,
        from_status: prevStatus, to_status: nextStatus,
        operator: me.name,
        reason: `真实性确认：${confirm.result}${confirm.note ? `（${confirm.note.slice(0, 20)}…）` : ''}`,
        created_at: confirmedAt,
      }, ...p.submitFlowLogs],
    }));
    log(
      confirm.result === '真实' ? '真实性确认通过' : '真实性确认存疑',
      current!.code,
      `确认人 ${me.name}（钉钉身份不可编辑）· ${prevStatus} → ${nextStatus}${confirm.note ? ` · 备注：${confirm.note.slice(0, 20)}…` : ''}`,
    );
    message.success(confirm.result === '真实' ? '已确认真实性，复核完成' : '已标记存疑，退回重新复核并通知组织者');
    setConfirm(null); setCurrent(null);
  };

  /** 撤回确认（评分截止前可重评，全程留痕） */
  const retractConfirm = (r: AssignmentSubmit) => {
    setDb((p) => ({
      ...p,
      submits: p.submits.map((s) => {
        if (s.id !== r.id) return s;
        const { confirmed: _drop, ...rest } = s;
        return { ...rest, status: 'REVIEWED' };
      }),
    }));
    log('撤回真实性确认', r.code, `原确认人 ${r.confirmed?.by ?? '—'}，退回 REVIEWED 可重新复核`);
    message.success('已撤回确认，退回待复核状态（已留痕）');
  };

  const confirmOkDisabled = !confirm?.agree
    || (confirm?.result === '存疑' && (confirm?.note?.trim().length ?? 0) < 10);

  /* ---------- V6.0 CR-25：组织者覆盖复核结论（覆盖不覆写，新增记录） ---------- */
  const overrideOn = flags.judgeOverride !== false;
  const canOverride = hasRole('ORGANIZER', 'ADMIN');
  const [overrideTarget, setOverrideTarget] = useState<AssignmentSubmit | null>(null);
  const [overrideForm] = Form.useForm();

  /** 已复核结论：优先展示最新一次覆盖结果，同时保留原始分 */
  const lastOverride = (submitId: string) =>
    db.reviewOverrides.filter((o) => o.submit_id === submitId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const openOverride = (r: AssignmentSubmit) => {
    setOverrideTarget(r);
    overrideForm.resetFields();
    overrideForm.setFieldsValue({
      new_result: r.confirmed?.result ?? r.status,
      new_score: r.final_score ?? r.judge_score ?? 0,
      reason: '',
    });
  };

  const doOverride = async () => {
    const r = overrideTarget!;
    let vals: { new_result?: string; new_score?: number; reason?: string };
    try {
      vals = await overrideForm.validateFields();
    } catch {
      message.error('请填写调整后结论与理由');
      return;
    }
    const reason = (vals.reason ?? '').trim();
    if (reason.length < 10) { message.error('覆盖理由必填且不少于 10 字'); return; }

    /** 原结论不可变：只新增 review_override 记录，不改写原 review_confirm */
    const original = r.confirmed?.result ?? r.status;
    const originalScore = r.final_score ?? r.judge_score ?? 0;
    const newScore = Number(vals.new_score ?? originalScore);
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;

    setDb((p) => ({
      ...p,
      submits: p.submits.map((s) => (s.id === r.id ? { ...s, final_score: newScore } : s)),
      reviewOverrides: [{
        id: `RO${Date.now()}`, submit_id: r.id,
        original_result: `${original}（${originalScore} 分）`,
        new_result: `${vals.new_result}（${newScore} 分）`,
        reason, operator: me.name, created_at: at,
      }, ...p.reviewOverrides],
      /* V8.4-10.07：只通知当事人（作者 + 原评委），不再 union_id:'all' 全员广播。
         广播会把「谁的结论被组织者覆盖了」这种内部评审细节推给 501 个无关的人。 */
      messages: [
        {
          id: `MSG-OV-${Date.now()}-1`, union_id: r.union_id, type: '复核结果调整',
          title: '你的作业复核结论已被调整',
          content: `${r.code}：${original} → ${vals.new_result}。理由：${reason}`,
          channel: '站内' as const, status: '未读' as const, sent_at: at,
        },
        ...(r.confirmed?.by
          ? (db.users ?? [])
            .filter((u) => u.name === r.confirmed?.by)
            .slice(0, 1)
            .map((u) => ({
              id: `MSG-OV-${Date.now()}-2`, union_id: u.union_id, type: '复核结果调整',
              title: '你的复核结论被组织者覆盖',
              content: `${r.code}：你给出的结论 ${original} 已被覆盖为 ${vals.new_result}。理由：${reason}`,
              channel: '站内' as const, status: '未读' as const, sent_at: at,
            }))
          : []),
        ...p.messages,
      ],
    }));
    log('覆盖复核结论', r.code, `${original}（${originalScore} 分）→ ${vals.new_result}（${newScore} 分）；理由：${reason}（覆盖不覆写，原记录保留）`);
    message.success('已覆盖并留痕，原结论保留可追溯；已通知作者与原评委');
    setOverrideTarget(null);
    overrideForm.resetFields();
  };

  /** V7.0 CR-32：待我评分队列（后台=待复核队列；C 端=我还没评过的） */
  const queueTable = (
            <Table
              size="small" rowKey="id" pagination={{ pageSize: 6 }} dataSource={queue}
              scroll={{ x: 760 }}
              columns={[
                /**
                 * V8.3-10.10 运营方口径：编号改为**序号**（1/2/3）。
                 * 原来的 `code`（WB-A1-P1-0001）是内部编号，业务方看不懂；
                 * 分页时序号要用 AntD 的 index，跨页会从1 重新开始 —— 如需全局连续
                 * 可改成`(index + 1) + (current - 1) * pageSize`。
                 */
                {
                  title: '序号', width: 60, align: 'center',
                  render: (_: unknown, __: unknown, index: number) => <span className="num">{seqNo(index)}</span>,
                },
                {
                  /**
           * V8.3-10.10不给 ellipsis —— 作业类型名是本表最长的业务字段
           * （「2026 Q4 AI 应用实践作业」），截断成「2026...」等于没改。
           * 用 minWidth + 表格横向滚动，让它完整可读。
           */
          title: '作业类型', width: 200,
                  render: (_: unknown, r: AssignmentSubmit) => typeNameOf(r, db.assignmentTypes),
                },
                {
                  title: '期数', width: 80,
                  render: (_: unknown, r: AssignmentSubmit) => periodLabelOf(r, db.periods),
                },
                {
                  title: '提报人', width: 90,
                  render: (_: unknown, r: AssignmentSubmit) => submitterNameOf(r),
                },
                {
                  title: 'AI 分', dataIndex: 'ai_score', width: 80,
                  render: (_: unknown, r: AssignmentSubmit) => {
                    const v = aiScoreOf(r, db.scoreResults);
                    return <span className="num">{v ?? '—'}</span>;
                  },
                },
                {
                  /**
                   * V8.3-10.10 业务方要求：最后一列是「AI评分详情」。
                   * 放在操作列**之前** —— 「查看详情」是只读动作，
                   * 排在会改数据的「打分/确认」左边更符合阅读顺序。
                   */
                  title: 'AI评分详情', width: 110,
                  render: (_: unknown, r: AssignmentSubmit) => (
                    <Button size="small" type="link" onClick={() => setAiDetailId(r.id)}>查看详情</Button>
                  ),
                },
                {
                  title: '操作', width: confirmMode ? 180 : 140,
                  render: (_, r) => (
                    <Space size={4}>
                      <Button size="small" type="link" disabled={!canOperate} onClick={() => { setReviseTarget(null); setScores({}); setOpinion(''); setCurrent(r); }}>打分</Button>
                      {confirmMode ? (
                        r.confirmed ? (
                          <Button size="small" type="link" disabled={!canOperate} onClick={() => retractConfirm(r)}>撤回确认</Button>
                        ) : (
                          <Button
                            size="small" type="link" disabled={!canOperate}
                            onClick={() => {
                              setCurrent(r);
                              setConfirm({ agree: false, result: '真实', note: '' });
                            }}
                          >
                            确认真实性
                          </Button>
                        )
                      ) : (
                        r.ai_score !== undefined && r.ai_score >= 80 && (
                          <Button size="small" type="link" disabled={!canOperate} onClick={() => { setCurrent(r); setSpot({ q1: '', q2: '', q3: '' }); }}>抽查</Button>
                        )
                      )}
                      {/* V6.0 CR-25：组织者可覆盖复核结论（覆盖不覆写） */}
                      {overrideOn && canOverride && (
                        <Button size="small" type="link" onClick={() => openOverride(r)}>覆盖结论</Button>
                      )}
                    </Space>
                  ),
                },
              ]}
              expandable={confirmMode ? {
                expandedRowRender: (r) => r.confirmed ? (
                  <div style={{ fontSize: 12, color: COLOR.textSub }}>
                    <SafetyCertificateOutlined style={{ color: COLOR.success }} />{' '}
                    已确认：{r.confirmed.result} · 确认人 {r.confirmed.by} · {r.confirmed.at}
                    {r.confirmed.note && ` · 备注：${r.confirmed.note}`}
                    {/* V6.0 CR-25：同时展示「原始结论 / 调整后结论」，不让覆盖抹掉事实 */}
                    {(() => {
                      const ov = lastOverride(r.id);
                      return ov ? (
                        <div style={{ marginTop: 4, color: '#B45309' }}>
                          组织者已覆盖：{ov.original_result} → {ov.new_result}（{ov.operator} · {ov.created_at}）· 理由：{ov.reason}
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : <span style={{ fontSize: 12, color: COLOR.textMuted }}>尚未确认真实性</span>,
                rowExpandable: (r) => confirmMode,
              } : undefined}
            />
  );

  /** V7.0 CR-32：我的历史评分（确认项 5：能看到历史评分并进行修改） */
  const historyTable = (
    <Table
      size="small" rowKey="id" pagination={{ pageSize: 6 }} dataSource={myHistory}
      scroll={{ x: 820 }}
      locale={{ emptyText: <Empty description="还没有评分记录" /> }}
      columns={[
        /**
         * V8.3-10.10 运营方口径：序号（1/2/3）。
         * 原来第一列是「提报」显示 code（WB-A1-P1-0001）—— 内部编号，业务方看不懂。
         */
        {
          title: '序号', width: 60, align: 'center',
          render: (_: unknown, __: ScoreResult, index: number) => <span className="num">{seqNo(index)}</span>,
        },
        {
          /**
           * V8.3-10.10不给 ellipsis —— 作业类型名是本表最长的业务字段
           * （「2026 Q4 AI 应用实践作业」），截断成「2026...」等于没改。
           * 用 minWidth + 表格横向滚动，让它完整可读。
           */
          title: '作业类型', width: 200,
          render: (_: unknown, r: ScoreResult) =>
            typeNameOf(db.submits.find((s) => s.id === r.target_id), db.assignmentTypes),
        },
        {
          title: '期数', width: 80,
          render: (_: unknown, r: ScoreResult) =>
            periodLabelOf(db.submits.find((s) => s.id === r.target_id), db.periods),
        },
        {
          title: '提报人', width: 90,
          render: (_: unknown, r: ScoreResult) =>
            submitterNameOf(db.submits.find((s) => s.id === r.target_id)),
        },
        { title: '我的评分', dataIndex: 'total', width: 90, render: (v: number) => <span className="num">{v}</span> },
        /**
         * V8.3-10.10运营方要求**去掉「评分卡」字段**。
         * 之前给的是名称「应用实践作业思维评分卡 v3」，在 1.5fr 左栏里被压成竖排单字，
         * 反而看不清。评分卡本身是配置项（评分时用的那一版），
         * 评委自己知道即可，历史列表里占位不划算。
         * 字段仍在 `scoreResults.card_id/card_version` 里保留，只是不展示。
         */
        { title: '评分时间', dataIndex: 'created_at', width: 150 },
        {
          title: '操作', width: 100,
          render: (_, r: ScoreResult) => (
            <Button size="small" type="link" disabled={!canOperate} onClick={() => openRevise(r)}>修改评分</Button>
          ),
        },
        {
          /**
           * V8.3-10.10 业务方要求：历史评分表的**最后一列**是「AI评分详情」。
           * 从 scoreResult.target_id 拿到提报 id，再反查那条的 AI 评分记录 ——
           * 历史评分行本身是「评委的评分」，AI 分是另一个来源，不能混为一谈。
           */
          title: 'AI评分详情', width: 110,
          render: (_: unknown, r: ScoreResult) => (
            <Button size="small" type="link" onClick={() => setAiDetailId(r.target_id)}>查看详情</Button>
          ),
        },
      ]}
      expandable={{
        expandedRowRender: (r: ScoreResult) => (
          <div style={{ fontSize: 12, color: COLOR.textSub }}>
            <Space size={12} wrap>
              {Object.entries(r.dim_scores).map(([k, v]) => (
                <span key={k}>{k}：{v}</span>
              ))}
            </Space>
            {r.reason && <div style={{ marginTop: 4, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>意见：{r.reason}</div>}
          </div>
        ),
      }}
    />
  );

  /** V8.3-10.10：详情弹窗标题里显示是哪条提报 */
  const aiDetailSubmit = aiDetailId ? db.submits.find((s) => s.id === aiDetailId) : undefined;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="评委复核" desc="AI 预评分 + 评委复核，最终分按权重合成" />
      {!canOperate && (
        <Alert type="warning" showIcon
          message="当前身份为只读浏览"
          description="PRD V3.0 §3.2：系统管理员无业务数据审批权，仅可查看复核队列与进度；打分、抽查与真实性确认需评委（JUDGE）或组织者（ORGANIZER）身份。" />
      )}
      <Alert type="info" showIcon
        message={`最终分 = AI 分 × ${card.ai_weight}% + 评委均分 × ${card.judge_weight}%（多评委取均值，公式后台可配置）`}
        description={note ? '评委姓名从钉钉读取、不可编辑；评委不能复核自己的作业，系统自动过滤。' : undefined} />
      {note && confirmMode && (
        <Alert type="success" showIcon
          message="V4.0 CR-07：抽查已简化为一次「真实性确认」"
          description="确认人取钉钉身份不可编辑，确认即代表复核结束；评分截止前可撤回重评（全程留痕）。原三问字段保留为可选高级项，由开关 judge.deepSpotCheck 控制。" />
      )}

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          {isC ? (
            <Card size="small">
              {/**
               * V8.3-10.10 运营方口径：复核进度**单独一行，显示在待评分列表上一行**
               * （原来它在页面右侧面板底部，要滚动到底才看得到）。
               */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  marginBottom: 10, paddingBottom: 10,
                  borderBottom: '1px solid #F2EBDD',
                }}
              >
                <Typography.Text strong style={{ fontSize: 13 }}>复核进度</Typography.Text>
                <Progress
                  percent={Math.round(
                    (db.submits.filter((s) => s.judge_score !== undefined).length / Math.max(1, db.submits.length)) * 100,
                  )}
                  strokeColor={COLOR.primary}
                  size="small"
                  style={{ flex: 1, margin: 0 }}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {db.submits.filter((s) => s.judge_score !== undefined).length}/{db.submits.length}
                </Typography.Text>
              </div>
              <Tabs
                activeKey={cTab}
                onChange={(k) => setCTab(k as 'pending' | 'history')}
                items={[
                  { key: 'pending', label: `待我评分（${queue.length}）`, children: queueTable },
                  { key: 'history', label: `我的历史评分（${myHistory.length}）`, children: historyTable },
                ]}
              />
            </Card>
          ) : (
            <Card size="small" title={`待复核队列（${queue.length}）`}>{queueTable}</Card>
          )}
        </Col>

        <Col xs={24} lg={10}>
          {current ? (
            <Card size="small" title={`打分面板 · ${current.code}`}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                提报人：{current.name}（{current.dept_name}）· AI 分 {current.ai_score} · 评分卡 {card.name} {current.score_card_version}
              </Typography.Text>
              <div style={{ marginTop: 12 }}>
                {card.dimensions.map((d) => (
                  <div key={d.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>{d.name}（权重 {d.weight}%）</span>
                      <span className="num">{scores[d.name] ?? 0} / {d.max_score}</span>
                    </div>
                    <Slider
                      min={0} max={d.max_score} value={scores[d.name] ?? 0}
                      onChange={(v) => setScores({ ...scores, [d.name]: Number(v) })}
                      tooltip={{ formatter: (v) => `${v} 分` }}
                    />
                    <div style={{ fontSize: 11, color: COLOR.textSub }}>{d.standard}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>评委合计</span><span className="num" style={{ color: COLOR.primary, fontSize: 20 }}>{total}</span>
              </div>
              <Input.TextArea
                rows={3} style={{ marginTop: 8 }} placeholder={reviseTarget ? '修订意见（≥10 字，说明为什么改分）' : '复核意见（≥10 字）'}
                value={opinion} onChange={(e) => setOpinion(e.target.value)}
              />
              <Space style={{ marginTop: 8 }}>
                <Button type="primary" disabled={!canOperate} onClick={submitScore}>
                  {reviseTarget ? '提交修订' : '提交复核'}
                </Button>
                <Button onClick={() => { setCurrent(null); setReviseTarget(null); setScores({}); setOpinion(''); }}>取消</Button>
              </Space>
            </Card>
          ) : (
            <Card size="small">
              <Progress percent={Math.round((db.submits.filter((s) => s.judge_score !== undefined).length / Math.max(1, db.submits.length)) * 100)} strokeColor={COLOR.primary} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                复核进度：{db.submits.filter((s) => s.judge_score !== undefined).length}/{db.submits.length}；复核通过后自动流转「已完成」，再由组织者确认是否公示、员工可申请入库
              </Typography.Text>
              <div style={{ marginTop: 12 }}>
                {confirmMode ? (
                  <>
                    <Typography.Text strong>真实性确认</Typography.Text>
                    <div style={{ fontSize: 13, color: COLOR.textSub, marginTop: 4 }}>
                      一次勾选确认替代原三问抽查：勾选「确认为本人真实作品」+ 可选备注 → 提交。
                      前 10 名必做；组织者可对任意作业发起；存疑时必须写明原因。
                    </div>
                    <div style={{ fontSize: 13, color: COLOR.textSub, marginTop: 8 }}>
                      已确认 {db.submits.filter((s) => s.confirmed).length} 件
                      {deepSpot && ' · 高级三问问卷已开启'}
                    </div>
                  </>
                ) : (
                  <>
                    <Typography.Text strong>3 问抽查</Typography.Text>
                    <div style={{ fontSize: 13, color: COLOR.textSub, marginTop: 4 }}>
                      ① 真实输入是什么 ② 中途改过什么 ③ 同事用的反馈<br />
                      前 10 名必做；组织者可对任意作业发起。
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}
        </Col>
      </Row>

      {/* V4.0 CR-07：真实性确认弹窗 */}
      <Modal
        open={!!confirm} title={`真实性确认 · ${current?.code}`}
        onCancel={() => setConfirm(null)} onOk={submitConfirm}
        okText="提交确认" okButtonProps={{ disabled: confirmOkDisabled }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ fontSize: 13, color: COLOR.textSub }}>
            提报人：{current?.name}（{current?.dept_name}）· AI 分 {current?.ai_score} · 评委分 {current?.judge_score ?? '—'}
          </div>

          {/* 二次焦点确认：默认不勾选，必须人工勾选 */}
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirm?.agree ?? false}
              onChange={(e) => setConfirm({ ...confirm!, agree: e.target.checked })}
            />
            <span style={{ fontSize: 13 }}>
              确认为本人真实作品（本人独立完成，AI 仅作辅助工具）
            </span>
          </label>

          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>确认结论</div>
            <Radio.Group
              value={confirm?.result ?? '真实'}
              onChange={(e) => setConfirm({ ...confirm!, result: e.target.value })}
            >
              <Radio value="真实">真实</Radio>
              <Radio value="存疑">存疑（退回重新复核）</Radio>
            </Radio.Group>
          </div>

          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              备注{confirm?.result === '存疑' ? '（必填，≥10 字，说明存疑原因）' : '（可选）'}
            </div>
            <Input.TextArea
              rows={3} value={confirm?.note ?? ''}
              placeholder={confirm?.result === '存疑' ? '请说明存疑原因（≥10 字）' : '补充说明（可选）'}
              onChange={(e) => setConfirm({ ...confirm!, note: e.target.value })}
            />
          </div>

          {deepSpot && (
            <>
              <Divider style={{ margin: '4px 0' }} />
              <div style={{ fontSize: 12, color: COLOR.textMuted }}>
                高级问卷（judge.deepSpotCheck 已开启，选填；填写后将一并留档）
              </div>
              <div>① 真实输入是什么</div>
              <Input.TextArea rows={2} value={confirm?.q1 ?? ''} onChange={(e) => setConfirm({ ...confirm!, q1: e.target.value })} />
              <div>② 中途改过什么</div>
              <Input.TextArea rows={2} value={confirm?.q2 ?? ''} onChange={(e) => setConfirm({ ...confirm!, q2: e.target.value })} />
              <div>③ 同事用的反馈</div>
              <Input.TextArea rows={2} value={confirm?.q3 ?? ''} onChange={(e) => setConfirm({ ...confirm!, q3: e.target.value })} />
            </>
          )}

          {note && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              确认人取钉钉身份（{me.name}）不可编辑；确认后可在评分截止前撤回重评，全程留痕。
            </Typography.Text>
          )}
        </Space>
      </Modal>

      {/* V3.0 保留路径：judge.confirmMode 关闭时的三问抽查 */}
      <Modal
        open={!!spot} title={`3 问抽查 · ${current?.code}`} onCancel={() => setSpot(null)} onOk={submitSpot}
        okText="提交抽查结论"
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div>① 真实输入是什么</div>
          <Input.TextArea rows={2} value={spot?.q1} onChange={(e) => setSpot({ ...spot!, q1: e.target.value })} />
          <div>② 中途改过什么</div>
          <Input.TextArea rows={2} value={spot?.q2} onChange={(e) => setSpot({ ...spot!, q2: e.target.value })} />
          <div>③ 同事用的反馈</div>
          <Input.TextArea rows={2} value={spot?.q3} onChange={(e) => setSpot({ ...spot!, q3: e.target.value })} />
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            不通过则取消评奖资格并标记，结果通知本人与其团队负责人。
          </Typography.Text>
        </Space>
      </Modal>

      {/* V6.0 CR-25：覆盖复核结论 —— 新增记录，不覆写原结论 */}
      <Modal
        open={!!overrideTarget}
        title={`覆盖复核结论 · ${overrideTarget?.code}`}
        onCancel={() => setOverrideTarget(null)}
        onOk={doOverride}
        okText="确认覆盖"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message="覆盖不覆写"
          description="原复核记录保持不可变，本次操作以新记录追加；页面同时展示「原始结论 / 调整后结论」。覆盖后将通知原评委与作者。"
        />
        <div style={{ fontSize: 12, color: COLOR.textSub, marginBottom: 12 }}>
          原始结论：{overrideTarget?.confirmed?.result ?? overrideTarget?.status}
          （{overrideTarget?.final_score ?? overrideTarget?.judge_score ?? '—'} 分）
          {overrideTarget?.confirmed?.by ? ` · 确认人 ${overrideTarget.confirmed.by}` : ''}
        </div>
        <Form form={overrideForm} layout="vertical" preserve={false}>
          <Form.Item name="new_result" label="调整后结论" rules={[{ required: true }]}>
            <Select options={['真实', '存疑', '通过', '不通过'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="new_score" label="调整后分数" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="reason" label="覆盖理由"
            rules={[{ required: true, message: '请填写理由' }, { min: 10, message: '不少于 10 字' }]}
          >
            <Input.TextArea rows={3} placeholder="说明为什么要调整（≥10 字，写入审计日志）" maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* V8.3-10.10 AI 评分详情：逐维度分数 + 引用作品内容的理由 + 总体评价 */}
      <AiScoreDetail
        open={!!aiDetailId}
        onClose={() => setAiDetailId(null)}
        title={`AI 评分详情${aiDetailSubmit ? ` · ${aiDetailSubmit.code} ${aiDetailSubmit.name}` : ''}`}
        model={buildAiDetail(
          db.scoreCards?.find((c) => c.status === '启用'),
          aiDetailId ? aiResultOf(db.scoreResults, aiDetailId) : null,
        )}
      />
    </Space>
  );
}
