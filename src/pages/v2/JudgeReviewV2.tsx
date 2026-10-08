import { Button, Checkbox, Form, Input, InputNumber, Radio, Select, Slider, Table, Tabs, App as AntApp } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, FONT } from '@/theme/v2';
import type { AssignmentSubmit, ScoreCard, ScoreResult, SubmitStatus } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { statusText, statusColor } from '@/constants/statusMeta';
import { Dialog, DialogField, DialogKV, useConfirm } from '@/components/v2/Dialog';
import { useNoteVisible } from '@/auth/annotation';
import '../../theme/v2/template.css';

/**
 * 评委复核 v2（P3-5 后台域）
 *
 * 相对 v1 的纯视觉变化：
 *   ① 三条 Alert（warning 只读 / info 公式 / success CR-07）→ `.wb2-alert`（warn / 默认 / ok）
 *      后台一页三条整块底色会把页面切成色带，改成中性底 + 左 3px 语义条
 *   ② `Row/Col + Card` → `.wb2-grid2`（左队列 1.5fr / 右打分面板 1fr）
 *   ③ 状态 Tag `<Tag color={statusColor(v)}>`（v1 用了 blue/cyan/purple/gold/green/red 六套）
 *      → `.wb2-tag` 四档语义，文案仍走 CR-33 唯一真源 `statusText`
 *   ④ 复核进度 AntD `Progress` → `.wb2-prog` 细条
 *   ⑤ 三个 Modal → `Dialog`：真实性确认（okDisabled 沿用勾选 + 存疑字数校验）、
 *      3 问抽查、覆盖结论（danger + 禁点遮罩 + 默认聚焦取消）
 *   ⑥ 覆盖弹窗里的 warning Alert → 弹窗 `sub` 口径行，不再在正文里堆第二条色块
 *   ⑦ 裸 `#B45309` → 令牌 `var(--wb-warning)`
 *
 * 业务：三级回退取卡、CR-07 真实性确认、CR-25 覆盖不覆写、CR-32 历史评分修订（新记录追加）、
 * 撤回确认——逐行沿用 v1，未改任何判定与写入字段。
 */

/** V7.0 CR-32：兜底空卡。原实现对 SC1 用了非空断言（`!`），一旦没有启用的卡就白屏。 */
const EMPTY_CARD: ScoreCard = {
  id: '—', name: '未配置评分卡', version: 'v0', total_rule: '加权求和', pass_line: 60,
  ai_weight: 40, judge_weight: 60, status: '草稿', bind_target: '未绑定',
  dimensions: [], updated_at: '',
};

/** CR-33 真源的 AntD 色 → v2 四档语义色（ok 完成 / run 进行 / wa 待处理 / er 拒绝 / id 中性）
 *  V7.0 用户反馈治理：「复核中」与「已复核」同色（purple→wa）在队列里看起来像重复；
 *  「已复核」单独走 ok 档（完成绿），与「复核中」一眼区分。 */
const STATUS_TONE: Record<string, string> = {
  default: 'id', blue: 'run', cyan: 'run', geekblue: 'run',
  purple: 'wa', gold: 'wa', green: 'ok', red: 'er',
};
const statusTone = (v: string) => (v === 'REVIEWED' ? 'ok' : STATUS_TONE[statusColor(v)] ?? 'id');

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
 *  - variant='admin'（默认）：后台「评委复核」，自带页头；
 *  - variant='c'：C 端「评委评分」（/judge），由外层页面提供页头，此处不再重复渲染
 *    （v1 两层页头「评委评分 / 评委复核」叠在一起，v2 由外壳统一）。
 */
export default function JudgeReviewV2({ variant = 'admin' }: { variant?: 'admin' | 'c' }) {
  const isC = variant === 'c';
  const { db, me, setDb, log, hasRole, flags } = useStore();
  /** V8.6-10.08：口径 / 规则注解仅运营方与管理员可见 */
  const note = useNoteVisible();
  /** V8.4-10.07：提示文案必须跟总闸一致，不能开关关着还说「已推送」 */
  const autoPush = db.pushSettings?.autoPush === true;
  const { message } = AntApp.useApp();
  const ask = useConfirm();
  const [current, setCurrent] = useState<AssignmentSubmit | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [opinion, setOpinion] = useState('');
  const [spot, setSpot] = useState<{ q1: string; q2: string; q3: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmDraft | null>(null);
  /** V7.0 CR-32：历史评分修订目标（确认项 5：能看到历史评分并进行修改） */
  const [reviseTarget, setReviseTarget] = useState<ScoreResult | null>(null);
  const [cTab, setCTab] = useState<'pending' | 'history'>('pending');

  /** PRD V4.0 §6.2：ADMIN 可进入本页查看（菜单可见），但无业务审批权，操作入口禁用 */
  const canOperate = hasRole('JUDGE', 'ORGANIZER');
  /** 开关：judge.confirmMode 关闭 → 回到 V3.0 的三问抽查；judge.deepSpotCheck 开启 → 展开高级问卷 */
  const confirmMode = flags.judgeConfirmMode !== false;
  const deepSpot = flags.judgeDeepSpotCheck === true;

  /** V4.0 CR-07：已做真实性确认的作业保留在队列内（便于截止前撤回重评） */
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
    const final = Math.round(((s.ai_score ?? 0) * card.ai_weight / 100 + total * card.judge_weight / 100) * 10) / 10;
    setDb((p) => ({
      ...p,
      submits: p.submits.map((x) => (x.id === s.id ? { ...x, judge_score: total, final_score: final } : x)),
      scoreResults: [...p.scoreResults, {
        id: `SR-${s.id}-JD-RV-${Date.now()}`, target_type: 'submit', target_id: s.id,
        card_id: card.id, card_version: card.version, source: 'JUDGE',
        dim_scores: scores, total, reason: opinion,
        scorer_union_id: me.union_id, scorer_name: me.name, created_at: now(),
      }],
    }));
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
    const scoredAt = now();
    setDb((p) => ({
      ...p,
      submits: p.submits.map((s) => (s.id === current!.id
        ? {
            ...s, status: 'REVIEWED', judge_score: total,
            final_score: Math.round(((s.ai_score ?? 0) * card.ai_weight / 100 + total * card.judge_weight / 100) * 10) / 10,
          } : s)),
      scoreResults: [...p.scoreResults, {
        id: `SR-${current!.id}-JD-${Date.now()}`, target_type: 'submit', target_id: current!.id,
        card_id: card.id, card_version: card.version, source: 'JUDGE',
        dim_scores: scores, total, reason: opinion,
        scorer_union_id: me.union_id, scorer_name: me.name, created_at: scoredAt,
      }],
      /** V8.3-10.07：打分是链路上的一环，必须留流转痕；随后由流水线自动推送「真实性复核」待办 */
      submitFlowLogs: [{
        id: `FL${Date.now()}`, submit_id: current!.id,
        from_status: current!.status, to_status: 'REVIEWED',
        operator: me.name, reason: `${card.name} ${card.version} 四维合计 ${total}`, created_at: scoredAt,
      }, ...p.submitFlowLogs],
    }));
    log('评委复核打分', current!.code, `四维合计 ${total}，意见：${opinion.slice(0, 20)}…`);
    message.success(`复核完成，最终分按 AI ${card.ai_weight}% + 评委 ${card.judge_weight}% 合成${autoPush ? '；已推送组织者做真实性复核' : '；组织者不会自动收到提醒，需到「作业管理」手动发起推送'}`);
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
     * V8.3-10.07：链路末端的统一 —— 真实 → COMPLETED（V6.0 CR-19 口径，公示不再是前置条件），
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
      `确认人 ${me.name}（钉钉身份不可编辑）· ${statusText(prevStatus)} → ${statusText(nextStatus)}${confirm.note ? ` · 备注：${confirm.note.slice(0, 20)}…` : ''}`,
    );
    message.success(confirm.result === '真实' ? '已确认真实性，复核完成' : '已标记存疑，退回重新复核并通知组织者');
    setConfirm(null); setCurrent(null);
  };

  /** 撤回确认（评分截止前可重评，全程留痕） */
  const retractConfirm = (r: AssignmentSubmit) => {
    ask({
      title: `撤回真实性确认 · ${r.code}`,
      content: `撤回后该作业退回「${statusText('REVIEWED')}」可重新复核，原确认记录保留在留痕中。`,
      okText: '确认撤回',
      onOk: () => {
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
      },
    });
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

  /**
   * V7.0 裸编码治理：原始结论的展示口径 —— 真实性确认结果（真实/存疑）已是中文直接用；
   * 未确认时回退的是状态枚举（REVIEWING 等），必须转中文，避免覆盖弹窗与留痕里出现裸编码。
   */
  const resultTextOf = (r: AssignmentSubmit) => r.confirmed?.result ?? statusText(r.status);

  const openOverride = (r: AssignmentSubmit) => {
    setOverrideTarget(r);
    overrideForm.resetFields();
    overrideForm.setFieldsValue({
      new_result: resultTextOf(r),
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
    const original = resultTextOf(r);
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
      /* V8.4-10.07：只通知当事人（作者 + 原评委），不再 union_id:'all' 全员广播（与 v1 对等） */
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
  /** V7.0 用户反馈治理：队列按状态分组过滤 —— 只加视图过滤，不改变队列数据口径
   *  （REVIEWED 保留在队列内以支持「撤回重评」，属既有业务设计）。 */
  const [queueFilter, setQueueFilter] = useState<'ALL' | SubmitStatus>('ALL');
  const queueStatusCount = (st: SubmitStatus) => queue.filter((s) => s.status === st).length;
  const filteredQueue = queueFilter === 'ALL' ? queue : queue.filter((s) => s.status === queueFilter);
  const queueTabs: { key: 'ALL' | SubmitStatus; label: string }[] = isC
    ? [{ key: 'ALL', label: '全部' }]
    : (['AI_SCORED', 'REVIEWING', 'REVIEWED'] as SubmitStatus[])
      .filter((st) => queueStatusCount(st) > 0)
      .map((st) => ({ key: st, label: `${statusText(st)} ${queueStatusCount(st)}` }));

  const queueTable = (
    <Table
      size="small" rowKey="id" pagination={{ pageSize: 6 }} dataSource={filteredQueue}
      locale={{
        emptyText: (
          <div className="wb2-empty">
            <div className="ic">◇</div>
            <div className="t">{isC ? '没有待我评分的作业' : '待复核队列为空'}</div>
          </div>
        ),
      }}
      columns={[
        { title: '编号', dataIndex: 'code', width: 140 },
        { title: '姓名', dataIndex: 'name', width: 80 },
        { title: '作业', dataIndex: 'title', ellipsis: true },
        { title: 'AI 分', dataIndex: 'ai_score', width: 70, render: (v?: number) => <span className="num">{v ?? '—'}</span> },
        /* V7.0 CR-33：状态列走唯一真源，不再显示裸英文 */
        {
          title: '状态', dataIndex: 'status',
          render: (v: string) => <span className={`wb2-tag ${statusTone(v)}`}><i className="d" />{statusText(v)}</span>,
        },
        {
          title: '操作', width: confirmMode ? 180 : 140,
          render: (_, r) => (
            <div style={{ display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap' }}>
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
            </div>
          ),
        },
      ]}
      expandable={confirmMode ? {
        expandedRowRender: (r) => r.confirmed ? (
          <div style={{ fontSize: FONT.caption, color: COLOR.ink3 }}>
            <SafetyCertificateOutlined style={{ color: COLOR.success }} />{' '}
            已确认：{r.confirmed.result} · 确认人 {r.confirmed.by} · {r.confirmed.at}
            {r.confirmed.note && ` · 备注：${r.confirmed.note}`}
            {/* V6.0 CR-25：同时展示「原始结论 / 调整后结论」，不让覆盖抹掉事实 */}
            {(() => {
              const ov = lastOverride(r.id);
              return ov ? (
                <div style={{ marginTop: 4, color: COLOR.warning }}>
                  组织者已覆盖：{ov.original_result} → {ov.new_result}（{ov.operator} · {ov.created_at}）· 理由：{ov.reason}
                </div>
              ) : null;
            })()}
          </div>
        ) : <span style={{ fontSize: FONT.caption, color: COLOR.ink4 }}>尚未确认真实性</span>,
        rowExpandable: () => confirmMode,
      } : undefined}
    />
  );

  /** V7.0 CR-32：我的历史评分（确认项 5：能看到历史评分并进行修改） */
  const historyTable = (
    <Table
      size="small" rowKey="id" pagination={{ pageSize: 6 }} dataSource={myHistory}
      locale={{
        emptyText: (
          <div className="wb2-empty">
            <div className="ic">◇</div>
            <div className="t">还没有评分记录</div>
          </div>
        ),
      }}
      columns={[
        {
          title: '提报', width: 140,
          render: (_, r: ScoreResult) => db.submits.find((s) => s.id === r.target_id)?.code ?? r.target_id,
        },
        {
          title: '作业', ellipsis: true,
          render: (_, r: ScoreResult) => db.submits.find((s) => s.id === r.target_id)?.title ?? '—',
        },
        { title: '我的评分', dataIndex: 'total', width: 90, render: (v: number) => <span className="num">{v}</span> },
        { title: '评分卡', width: 120, render: (_, r: ScoreResult) => `${r.card_id} ${r.card_version}` },
        { title: '评分时间', dataIndex: 'created_at', width: 150 },
        {
          title: '操作', width: 100,
          render: (_, r: ScoreResult) => (
            <Button size="small" type="link" disabled={!canOperate} onClick={() => openRevise(r)}>修改评分</Button>
          ),
        },
      ]}
      expandable={{
        expandedRowRender: (r: ScoreResult) => (
          <div style={{ fontSize: FONT.caption, color: COLOR.ink3 }}>
            <div style={{ display: 'flex', gap: 'var(--wb-space-4)', flexWrap: 'wrap' }}>
              {Object.entries(r.dim_scores).map(([k, v]) => (
                <span key={k}>{k}：{v}</span>
              ))}
            </div>
            {/* V8.3-10.09：评委意见为用户长文本，需断词防撑破卡片 */}
            {r.reason && <div style={{ marginTop: 4, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>意见：{r.reason}</div>}
          </div>
        ),
      }}
    />
  );

  const judgedCount = db.submits.filter((s) => s.judge_score !== undefined).length;
  const progressPct = Math.round((judgedCount / Math.max(1, db.submits.length)) * 100);

  return (
    <div>
      {/* variant='c' 时外壳已给页头，此处不重复渲染（v1 两层页头叠加） */}
      {!isC && (
        <div className="wb2-ph">
          <div>
            <h2 className="wb2-ph-t">评委复核</h2>
            {note && <div className="wb2-ph-d">AI 预评分 + 评委复核，最终分按权重合成</div>}
          </div>
        </div>
      )}

      {!canOperate && (
        <div className="wb2-alert warn">
          <div className="bd">
            <div className="t">当前身份为只读浏览</div>
            <div className="d">
              PRD V3.0 §3.2：系统管理员无业务数据审批权，仅可查看复核队列与进度；打分、抽查与真实性确认需评委（JUDGE）或组织者（ORGANIZER）身份。
            </div>
          </div>
        </div>
      )}

      <div className="wb2-alert">
        <div className="bd">
          <div className="t">{`最终分 = AI 分 × ${card.ai_weight}% + 评委均分 × ${card.judge_weight}%（多评委取均值，公式后台可配置）`}</div>
          {note && <div className="d">评委姓名从钉钉读取、不可编辑；评委不能复核自己的作业，系统自动过滤。</div>}
        </div>
      </div>

      {note && confirmMode && (
        <div className="wb2-alert ok">
          <div className="bd">
            <div className="t">V4.0 CR-07：抽查已简化为一次「真实性确认」</div>
            <div className="d">
              确认人取钉钉身份不可编辑，确认即代表复核结束；评分截止前可撤回重评（全程留痕）。原三问字段保留为可选高级项，由开关 judge.deepSpotCheck 控制。
            </div>
          </div>
        </div>
      )}

      <div className="wb2-grid2">
        <div>
          {isC ? (
            <div className="wb2-tabs">
              <Tabs
                activeKey={cTab}
                onChange={(k) => setCTab(k as 'pending' | 'history')}
                items={[
                  { key: 'pending', label: `待我评分（${queue.length}）`, children: queueTable },
                  { key: 'history', label: `我的历史评分（${myHistory.length}）`, children: historyTable },
                ]}
              />
            </div>
          ) : (
            <div className="wb2-tcard">
              <div className="hd">
                <span className="t">待复核队列<span className="n">{queue.length}</span></span>
                {/* V7.0 用户反馈治理：状态分组过滤 chips（各带计数），区分「复核中 / 已复核」不再混淆 */}
                {queueTabs.length > 1 && (
                  <div style={{ display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`wb2-chip${queueFilter === 'ALL' ? ' on' : ''}`}
                      onClick={() => setQueueFilter('ALL')}
                    >
                      全部 {queue.length}
                    </button>
                    {queueTabs.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`wb2-chip${queueFilter === t.key ? ' on' : ''}`}
                        onClick={() => setQueueFilter(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {queue.some((s) => s.status === 'REVIEWED') && (
                <div style={{ padding: 'var(--wb-space-2) var(--wb-space-5) 0', fontSize: FONT.caption, color: COLOR.ink3 }}>
                  队列含已复核作业（评分截止前可撤回重评）；「已复核」为绿色标签，可与「复核中」区分
                </div>
              )}
              <div className="bd">{queueTable}</div>
            </div>
          )}
        </div>

        <div>
          {current ? (
            <div className="wb2-card wb2-card-pad">
              <div className="wb2-card-t">{`打分面板 · ${current.code}`}</div>
              <div style={{ fontSize: FONT.caption, color: COLOR.ink3 }}>
                提报人：{current.name}（{current.dept_name}）· AI 分 {current.ai_score} · 评分卡 {card.name} {current.score_card_version}
              </div>
              <div style={{ marginTop: 'var(--wb-space-4)' }}>
                {card.dimensions.map((d) => (
                  <div key={d.id} style={{ marginBottom: 'var(--wb-space-4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT.body }}>
                      <span>{d.name}（权重 {d.weight}%）</span>
                      <span className="num">{scores[d.name] ?? 0} / {d.max_score}</span>
                    </div>
                    <Slider
                      min={0} max={d.max_score} value={scores[d.name] ?? 0}
                      onChange={(v) => setScores({ ...scores, [d.name]: Number(v) })}
                      tooltip={{ formatter: (v) => `${v} 分` }}
                    />
                    <div style={{ fontSize: FONT.caption, color: COLOR.ink3 }}>{d.standard}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
                <span>评委合计</span>
                <span className="num" style={{ color: COLOR.primary, fontSize: 'var(--wb-fs-display)' }}>{total}</span>
              </div>
              <Input.TextArea
                rows={3} style={{ marginTop: 'var(--wb-space-3)' }}
                placeholder={reviseTarget ? '修订意见（≥10 字，说明为什么改分）' : '复核意见（≥10 字）'}
                value={opinion} onChange={(e) => setOpinion(e.target.value)}
              />
              <div className="wb2-dlg-ft" style={{ marginTop: 'var(--wb-space-4)' }}>
                <Button onClick={() => { setCurrent(null); setReviseTarget(null); setScores({}); setOpinion(''); }}>取消</Button>
                <Button type="primary" disabled={!canOperate} onClick={submitScore}>
                  {reviseTarget ? '提交修订' : '提交复核'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="wb2-card wb2-card-pad">
              <div className="wb2-card-t">复核进度</div>
              <div className="wb2-prog" style={{ marginTop: 0 }}>
                <i style={{ width: `${progressPct}%`, background: COLOR.primary }} />
              </div>
              <div style={{ fontSize: FONT.caption, color: COLOR.ink3, marginTop: 'var(--wb-space-2)' }}>
                复核进度：{judgedCount}/{db.submits.length}（{progressPct}%）；复核通过后自动流转「已完成」，再由组织者确认是否公示、员工可申请入库
              </div>
              <div style={{ marginTop: 'var(--wb-space-4)' }}>
                {confirmMode ? (
                  <>
                    <div style={{ fontSize: FONT.body, fontWeight: 600, color: COLOR.ink1 }}>真实性确认</div>
                    <div style={{ fontSize: FONT.body, color: COLOR.ink3, marginTop: 4, lineHeight: 1.65 }}>
                      一次勾选确认替代原三问抽查：勾选「确认为本人真实作品」+ 可选备注 → 提交。
                      前 10 名必做；组织者可对任意作业发起；存疑时必须写明原因。
                    </div>
                    <div style={{ fontSize: FONT.body, color: COLOR.ink3, marginTop: 'var(--wb-space-3)' }}>
                      已确认 {db.submits.filter((s) => s.confirmed).length} 件
                      {deepSpot && ' · 高级三问问卷已开启'}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: FONT.body, fontWeight: 600, color: COLOR.ink1 }}>3 问抽查</div>
                    <div style={{ fontSize: FONT.body, color: COLOR.ink3, marginTop: 4, lineHeight: 1.65 }}>
                      ① 真实输入是什么 ② 中途改过什么 ③ 同事用的反馈<br />
                      前 10 名必做；组织者可对任意作业发起。
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- V4.0 CR-07：真实性确认弹窗（统一操作层） ---------- */}
      <Dialog
        open={!!confirm} title={`真实性确认 · ${current?.code}`}
        sub={note ? '确认人取钉钉身份不可编辑；确认后可在评分截止前撤回重评，全程留痕。' : undefined}
        okText="提交确认" okDisabled={confirmOkDisabled}
        onCancel={() => setConfirm(null)}
        onOk={submitConfirm}
      >
        <DialogKV
          k="对象"
          v={`提报人 ${current?.name}（${current?.dept_name}）· AI 分 ${current?.ai_score} · 评委分 ${current?.judge_score ?? '—'}`}
        />

        {/* 二次焦点确认：默认不勾选，必须人工勾选 */}
        <div className="fld">
          <Checkbox
            checked={confirm?.agree ?? false}
            onChange={(e) => setConfirm({ ...confirm!, agree: e.target.checked })}
          >
            确认为本人真实作品（本人独立完成，AI 仅作辅助工具）
          </Checkbox>
        </div>

        <DialogField label="确认结论">
          <Radio.Group
            value={confirm?.result ?? '真实'}
            onChange={(e) => setConfirm({ ...confirm!, result: e.target.value })}
          >
            <Radio value="真实">真实</Radio>
            <Radio value="存疑">存疑（退回重新复核）</Radio>
          </Radio.Group>
        </DialogField>

        <DialogField
          label={`备注${confirm?.result === '存疑' ? '（必填，≥10 字，说明存疑原因）' : '（可选）'}`}
        >
          <Input.TextArea
            rows={3} value={confirm?.note ?? ''}
            placeholder={confirm?.result === '存疑' ? '请说明存疑原因（≥10 字）' : '补充说明（可选）'}
            onChange={(e) => setConfirm({ ...confirm!, note: e.target.value })}
          />
        </DialogField>

        {deepSpot && (
          <div className="fld">
            <span className="lb">高级问卷（judge.deepSpotCheck 已开启，选填；填写后将一并留档）</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wb-space-2)' }}>
              <div style={{ fontSize: FONT.caption, color: COLOR.ink3 }}>① 真实输入是什么</div>
              <Input.TextArea rows={2} value={confirm?.q1 ?? ''} onChange={(e) => setConfirm({ ...confirm!, q1: e.target.value })} />
              <div style={{ fontSize: FONT.caption, color: COLOR.ink3 }}>② 中途改过什么</div>
              <Input.TextArea rows={2} value={confirm?.q2 ?? ''} onChange={(e) => setConfirm({ ...confirm!, q2: e.target.value })} />
              <div style={{ fontSize: FONT.caption, color: COLOR.ink3 }}>③ 同事用的反馈</div>
              <Input.TextArea rows={2} value={confirm?.q3 ?? ''} onChange={(e) => setConfirm({ ...confirm!, q3: e.target.value })} />
            </div>
          </div>
        )}

        <div className="hint">
          {note ? `当前确认人：${me.name}（钉钉身份，不可编辑）。` : confirm?.result === '存疑' ? ' 标记存疑将退回重新复核并通知组织者。' : ''}
        </div>
      </Dialog>

      {/* ---------- V3.0 保留路径：judge.confirmMode 关闭时的三问抽查 ---------- */}
      <Dialog
        open={!!spot} title={`3 问抽查 · ${current?.code}`}
        sub="不通过则取消评奖资格并标记，结果通知本人与其团队负责人。"
        okText="提交抽查结论"
        onCancel={() => setSpot(null)}
        onOk={submitSpot}
      >
        <DialogField label="① 真实输入是什么">
          <Input.TextArea rows={2} value={spot?.q1} onChange={(e) => setSpot({ ...spot!, q1: e.target.value })} />
        </DialogField>
        <DialogField label="② 中途改过什么">
          <Input.TextArea rows={2} value={spot?.q2} onChange={(e) => setSpot({ ...spot!, q2: e.target.value })} />
        </DialogField>
        <DialogField label="③ 同事用的反馈">
          <Input.TextArea rows={2} value={spot?.q3} onChange={(e) => setSpot({ ...spot!, q3: e.target.value })} />
        </DialogField>
        {(!spot?.q1 || !spot?.q2 || !spot?.q3) && (
          <div className="hint warn">3 问必须全部填写后才能提交抽查结论。</div>
        )}
      </Dialog>

      {/* ---------- V6.0 CR-25：覆盖复核结论 —— 危险操作：danger + 禁点遮罩 + 默认聚焦取消 ---------- */}
      <Dialog
        open={!!overrideTarget}
        title={`覆盖复核结论 · ${overrideTarget?.code}`}
        sub="覆盖不覆写：原复核记录保持不可变，本次操作以新记录追加；页面同时展示「原始结论 / 调整后结论」。覆盖后将通知原评委与作者。"
        okText="确认覆盖" danger
        onCancel={() => setOverrideTarget(null)}
        onOk={() => { void doOverride(); }}
      >
        <DialogKV
          k="原始结论"
          v={`${overrideTarget ? resultTextOf(overrideTarget) : '—'}（${overrideTarget?.final_score ?? overrideTarget?.judge_score ?? '—'} 分）${overrideTarget?.confirmed?.by ? ` · 确认人 ${overrideTarget.confirmed.by}` : ''}`}
        />
        <Form form={overrideForm} layout="vertical" preserve={false}>
          <Form.Item name="new_result" label="调整后结论" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
            <Select options={['真实', '存疑', '通过', '不通过'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="new_score" label="调整后分数" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
            <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="reason" label="覆盖理由"
            rules={[{ required: true, message: '请填写理由' }, { min: 10, message: '不少于 10 字' }]}
            style={{ marginBottom: 0 }}
          >
            <Input.TextArea rows={3} placeholder="说明为什么要调整（≥10 字，写入审计日志）" maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Dialog>
    </div>
  );
}
