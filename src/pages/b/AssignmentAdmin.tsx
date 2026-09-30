import { Button, Card, Space, Table, Tabs, Tag, Typography, Input, Select, App as AntApp, Modal, Form, Switch, InputNumber, Row, Col, Statistic, Alert } from 'antd';
import { DownloadOutlined, UploadOutlined, PlusOutlined, CopyOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, TRACK_COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { SubmitStatusTag } from '@/pages/c/WorkList';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker, { ScopeText, useScopeCommit } from '@/components/ScopePicker';
import type { AssignmentType, ScopeSubject, SubmitStatus } from '@/mock/types';
/* V7.0 CR-33：状态文案走唯一真源（B 端不再显示裸英文） */
import { statusText, statusOptions, TYPE_STATUS_TEXT } from '@/constants/statusMeta';
/* V7.0 CR-35：评分结果回写改为真实「下载模板 → 上传解析 → 三态回执」 */
import BatchImport from '@/components/BatchImport';

/** V6.0 CR-23：流程编排的操作对象（最小必要字段） */
type BountyFlowTarget = {
  id: string; code: string; status: SubmitStatus; final_score?: number;
} | null;
import { useSkillAdminConverge } from '@/auth/converge';
import { ScopeNotice } from '@/components/ScopeNotice';

export default function AssignmentAdmin() {
  const { db, setDb, log, campaign, scopeRows, me, flags } = useStore();
  /** V6.0 CR-19：状态机 V2 开关（关闭=不出现 COMPLETED / CONSENSUS 与公示标记位） */
  const flowV2 = flags.submitFlowV2 !== false;
  const [selected, setSelected] = useState<string[]>([]);
  const { message, modal } = AntApp.useApp();
  /** V4.0 CR-09：技能管理员在本页为只读浏览者（§6.2 矩阵 ◐） */
  const readOnly = useSkillAdminConverge().isReadOnly('/admin/assignment');
  const [kw, setKw] = useState('');
  const [status, setStatus] = useState('全部');
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  /** V4.0 CR-08：真正落库的提报对象主体（旧实现只存了文案，导致「配了但不生效」） */
  const [targetSubjects, setTargetSubjects] = useState<ScopeSubject[]>([]);
  const commitScope = useScopeCommit();

  /** V4.0 A-3：先按数据范围收敛，再做搜索/状态过滤（角色并集不放大数据范围） */
  const inScope = scopeRows(db.submits);
  const submits = inScope.filter((s) => {
    if (kw && !`${s.name}${s.title}${s.code}`.includes(kw)) return false;
    if (status !== '全部' && s.status !== status) return false;
    return true;
  });
  const scopeIds = new Set(inScope.map((s) => s.id));

  /**
   * V7.0 CR-35：当前生效评分卡（与评委复核页同一口径：启用的卡优先，其次未软删的卡）。
   * 评分模板的列由此卡维度动态生成，保证「模板列」与「评分卡配置」同源。
   */
  const scoreCard = db.scoreCards.find((c) => c.status === '启用' && !c.is_deleted)
    ?? db.scoreCards.find((c) => !c.is_deleted)
    ?? db.scoreCards[0];

  /** V4.0 CR-08：真正创建作业类型，并落库 target_subjects（保存前回读校验，不一致则阻断） */
  const createType = async () => {
    let vals: { name?: string; form_template?: string; max_times?: number; allow_multi?: boolean; need_review?: boolean; visible_scope?: '全员' | '本部门' | '仅组织者' };
    try {
      vals = await form.validateFields();
    } catch {
      message.error('请先填写必填项');
      return;
    }
    const card = db.scoreCards[0];
    const ok = commitScope(targetSubjects, (p) => ({
      ...p,
      assignmentTypes: [{
        id: `AT${Date.now()}`, code: `T${p.assignmentTypes.length + 1}`, name: vals.name ?? '未命名作业类型',
        campaign_id: campaign.id,
        /** 旧字段回写为可读摘要，保证旧代码/旧数据可读；真实生效主体为 target_subjects */
        target_scope: targetSubjects.map((s) => s.name).join('、'),
        target_subjects: targetSubjects,
        form_template: (vals.form_template ?? '通用作业模板') as AssignmentType['form_template'],
        custom_fields: [],
        allow_multi: vals.allow_multi ?? true,
        max_times: vals.max_times ?? 1,
        allow_override: true,
        late_rule: '截止后不可提交（组织者可为单人临时放开）',
        score_card_id: card?.id ?? 'SC1',
        score_card_version: card?.version ?? 'v2',
        points_rule: '基础分 + 加分项',
        need_review: vals.need_review ?? true,
        visible_scope: vals.visible_scope ?? '全员',
        version: 1,
        status: 'DRAFT',
      }, ...p.assignmentTypes],
    }), '作业类型已创建（配置驱动，无需改代码）');
    if (ok) {
      log('新建作业类型', vals.name ?? '', targetSubjects.map((s) => s.name).join('、'));
      setOpen(false);
      form.resetFields();
      setTargetSubjects([]);
    }
  };

  /**
   * V7.0 CR-35：修复假按钮 —— 原实现只有 modal.confirm + message.success，
   * 点完「下载评分模板」后**没有任何文件产出**。改为真实生成 CSV 并触发下载。
   */
  const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const scoreCols = () => [
    '提报编号', '提报标题',
    ...scoreCard.dimensions.map((d) => `${d.name}(0-${d.max_score})`),
    '评分说明',
  ];

  const downloadScoreTemplate = () => {
    const rows = inScope.filter((s) => s.status === 'SUBMITTED');
    if (rows.length === 0) { message.info('当前没有「已提交」状态的作业需要评分'); return; }
    const csv = [
      `# 口径：按评分卡「${scoreCard.name} ${scoreCard.version}」逐维度打分（填 0-满分 的数字）；导入后状态流转为「${statusText('AI_SCORED')}」`,
      scoreCols().map(csvCell).join(','),
      ...rows.map((s) => [s.code, s.title, ...scoreCard.dimensions.map(() => ''), ''].map(csvCell).join(',')),
    ].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `AI评分模板-${DEMO_TODAY}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    log('导出评分模板', `${rows.length} 条待评分`, `含评分卡 ${scoreCard.name} ${scoreCard.version} 的 ${scoreCard.dimensions.length} 个维度与满分`);
    message.success(`评分模板已下载：${rows.length} 条待评分 × ${scoreCard.dimensions.length} 个维度`);
  };

  const toStatus = (id: string, next: SubmitStatus) => {
    setDb((p) => ({ ...p, submits: p.submits.map((s) => (s.id === id ? { ...s, status: next } : s)) }));
    message.success('状态已流转');
  };

  /** 公示口径兼容：新标记位优先，旧 PUBLISHED 状态仍算已公示（历史数据） */
  const isPublished = (s: { status: SubmitStatus; is_published?: boolean }) => s.is_published === true || s.status === 'PUBLISHED';

  /**
   * V6.0 CR-19：批量公示 / 取消公示（公示与状态机解耦后的逐条动作）
   * 约束：公示总闸关闭时逐条公示不生效（Q9），避免「组织者以为公示了其实没生效」。
   */
  const batchPublish = (publish: boolean) => {
    if (selected.length === 0) { message.warning('请先勾选要操作的提报'); return; }
    if (publish && campaign.publicSwitch === false) {
      message.error('公示总闸已关闭，逐条公示不生效（请先在「届次与配置」开启公示总闸）');
      return;
    }
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    setDb((p) => ({
      ...p,
      submits: p.submits.map((s) => (selected.includes(s.id)
        ? {
          ...s,
          is_published: publish,
          published_by: publish ? me.name : undefined,
          published_at: publish ? at : undefined,
        }
        : s)),
    }));
    log(publish ? '批量公示' : '批量取消公示', `${selected.length} 条`, `U-6 口径：组织者手动标记 + 留痕，无自动触发条件（操作人 ${me.name}）`);
    message.success(publish ? `已公示 ${selected.length} 条（即时生效并留痕）` : `已取消公示 ${selected.length} 条`);
  };

  /** V6.0 CR-19：批量标记「已完成 / 已共识」—— 公示不再是前置条件 */
  const batchStatus = (next: 'COMPLETED' | 'CONSENSUS') => {
    if (selected.length === 0) { message.warning('请先勾选要操作的提报'); return; }
    const label = next === 'COMPLETED' ? '已完成' : '已共识';
    setDb((p) => ({
      ...p,
      submits: p.submits.map((s) => (selected.includes(s.id)
        ? {
          ...s,
          status: next,
          consensus_by: next === 'CONSENSUS' ? me.name : s.consensus_by,
          consensus_at: next === 'CONSENSUS' ? `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}` : s.consensus_at,
        }
        : s)),
    }));
    log(`批量标记${label}`, `${selected.length} 条`, `组织者手动标记，未设自动触发条件（操作人 ${me.name}）`);
    message.success(`已标记 ${selected.length} 条为「${label}」`);
  };

  /** V6.0 CR-19：统计口径同步改造 —— 已公示 = 标记位 ∪ 旧 PUBLISHED 状态 */
  const publishedCount = inScope.filter(isPublished).length;

  /* ---------- V6.0 CR-23：流程编排（退回 / 转移，白名单约束 + 理由必填 + 留痕） ---------- */
  const flowControlOn = flags.submitFlowControl !== false;
  const [flowTarget, setFlowTarget] = useState<BountyFlowTarget>(null);
  const [flowForm] = Form.useForm();

  /** 白名单：只允许规则表里登记的转移路径，杜绝「草稿直接跳到入库」这类越级 */
  const allowedTargets = (from: SubmitStatus) =>
    db.submitFlowRules.find((r) => r.enabled && r.from_status === from)?.to_status ?? [];

  const openFlow = (s: { id: string; code: string; status: SubmitStatus; final_score?: number }) => {
    setFlowTarget(s);
    flowForm.resetFields();
    flowForm.setFieldsValue({ to_status: undefined, reason: '' });
  };

  const doFlow = async () => {
    const s = flowTarget!;
    let vals: { to_status?: SubmitStatus; reason?: string };
    try {
      vals = await flowForm.validateFields();
    } catch {
      message.error('请选择目标环节并填写理由');
      return;
    }
    const to = vals.to_status!;
    const reason = (vals.reason ?? '').trim();
    if (!allowedTargets(s.status).includes(to)) {
      message.error('该流转路径不在白名单内，已拒绝（请在「系统管理 · 流程规则」中确认）');
      return;
    }
    if (reason.length < 10) { message.error('理由必填且不少于 10 字'); return; }

    const commit = () => {
      const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
      setDb((p) => ({
        ...p,
        submits: p.submits.map((x) => (x.id === s.id ? { ...x, status: to } : x)),
        /** 只增不改：流转日志独立实体，便于外置与审计 */
        submitFlowLogs: [{
          id: `FL${Date.now()}`, submit_id: s.id,
          from_status: s.status, to_status: to,
          operator: me.name, reason, created_at: at,
        }, ...p.submitFlowLogs],
      }));
      log('流程编排', `${s.code} ${s.status} → ${to}`, `理由：${reason}（白名单校验通过，操作人 ${me.name}）`);
      message.success(`已流转：${s.status} → ${to}（已留痕）`);
      setFlowTarget(null);
      flowForm.resetFields();
    };

    /** 已完成作业退回 / 涉及已入账积分 → 二次确认并提示积分回退 */
    const risky = s.status === 'COMPLETED' || s.status === 'CONSENSUS' || (s.final_score ?? 0) > 0;
    if (risky) {
      modal.confirm({
        title: '确认退回该作业？',
        content: `该作业已完成（或已有评分记录 ${s.final_score ?? '—'}），退回后需重新走流程，积分将同步回退。`,
        okText: '确认退回',
        okButtonProps: { danger: true },
        onOk: commit,
      });
      return;
    }
    commit();
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="作业管理" desc="作业类型、期次与评分卡绑定配置" />

      {/* U-2 结案：范围受限提示（含专家身份说明），四个后台页共用同一套口径 */}
      <ScopeNotice count={inScope.length} unit="条提报" />

      <Tabs
        items={[
          {
            key: 'types', label: '作业类型',
            children: (
              <Card
                size="small"
                extra={<Space>
                  <Button disabled={readOnly} icon={<CopyOutlined />} onClick={() => { log('复制作业类型', db.assignmentTypes[0].name, '一键复制开新一期'); message.success('已复制为新的作业类型草稿'); }}>复制上届</Button>
                  <Button disabled={readOnly} type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setTargetSubjects([]); setOpen(true); }}>新建作业类型</Button>
                </Space>}
              >
                <Table
                  size="small" rowKey="id" pagination={false} dataSource={db.assignmentTypes}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    { title: '编码', dataIndex: 'code' },
                    { title: '提报对象', dataIndex: ['target_subjects', 'target_scope'], render: (_, r) => <ScopeText value={r.target_subjects ?? r.target_scope} /> },
                    { title: '模板', dataIndex: 'form_template' },
                    { title: '次数/期', render: (_, r) => <span className="num">{r.max_times}{r.allow_multi ? '（可多期）' : ''}</span> },
                    { title: '评分卡', render: (_, r) => `${db.scoreCards.find((c) => c.id === r.score_card_id)?.name} ${r.score_card_version}` },
                    { title: '版本', dataIndex: 'version', render: (v: number) => <Tag>v{v}</Tag> },
                    /* V7.0 CR-33：作业类型状态列显示中文（DRAFT → 草稿 等） */
                    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'PUBLISHED' ? 'green' : 'default'}>{TYPE_STATUS_TEXT[v] ?? v}</Tag> },
                  ]}
                />
                <Alert style={{ marginTop: 12 }} type="info" showIcon
                  message="作业类型配置变更会生成新版本，历史期次沿用旧版本；已截止期次的规则与评分不变。" />
              </Card>
            ),
          },
          {
            key: 'submits', label: `提报清单（${submits.length}）`,
            children: (
              <Card size="small">
                <Space wrap style={{ marginBottom: 12 }}>
                  <Input.Search placeholder="搜索姓名 / 标题 / 编号" style={{ width: 220 }} value={kw} onChange={(e) => setKw(e.target.value)} allowClear />
                  {/* V7.0 CR-33：筛选项显示中文（value 仍为枚举，筛选逻辑零变化） */}
                  <Select
                    value={status} onChange={setStatus} style={{ width: 180 }}
                    options={[
                      { value: '全部', label: '全部状态' },
                      /** V6.0 CR-19 新增两态（开关关闭时不出现在筛选项里） */
                      ...statusOptions(flowV2 ? (['COMPLETED', 'CONSENSUS'] as SubmitStatus[]) : []),
                    ]}
                  />
                  {/* V6.0 CR-19：公示与状态机解耦后的批量动作 */}
                  {flowV2 && (
                    <>
                      <Button disabled={readOnly || selected.length === 0} onClick={() => batchPublish(true)}>
                        批量公示{selected.length ? `（${selected.length}）` : ''}
                      </Button>
                      <Button disabled={readOnly || selected.length === 0} onClick={() => batchPublish(false)}>
                        取消公示
                      </Button>
                      <Button disabled={readOnly || selected.length === 0} onClick={() => batchStatus('COMPLETED')}>
                        标记已完成
                      </Button>
                      <Button disabled={readOnly || selected.length === 0} onClick={() => batchStatus('CONSENSUS')}>
                        标记已共识
                      </Button>
                    </>
                  )}
                  {/* V7.0 CR-35：模板导出改为真实下载 CSV（原为无文件产出的假按钮） */}
                  <Button disabled={readOnly} icon={<DownloadOutlined />} onClick={downloadScoreTemplate}>
                    下载评分模板（Q1）
                  </Button>
                  {/* V7.0 CR-35：模拟导入改为真实解析上传（原为 Math.random 造分的假按钮） */}
                  <BatchImport
                    title="AI 评分回写"
                    disabled={readOnly}
                    buttonText="导入跑分结果"
                    columns={scoreCols()}
                    hint={`口径：按提报编号定位；每列填 0-满分的数字；仅「${statusText('SUBMITTED')}」状态的作业可回写`}
                    validate={(rows) => rows.map((r, i) => {
                      const [code, title, ...rest] = r;
                      const dimCount = scoreCard.dimensions.length;
                      const dims = rest.slice(0, dimCount);
                      const s = inScope.find((x) => x.code === code);
                      if (!s) return { row: i + 2, name: code || `第 ${i + 2} 行`, result: '失败' as const, reason: `提报编号「${code || '空'}」不存在或不在数据范围内` };
                      if (s.status !== 'SUBMITTED') {
                        return { row: i + 2, name: `${s.code} ${title ?? ''}`, result: '跳过' as const, reason: `当前状态为「${statusText(s.status)}」，仅「${statusText('SUBMITTED')}」可回写` };
                      }
                      const vals: Record<string, number> = {};
                      for (let k = 0; k < dimCount; k += 1) {
                        const d = scoreCard.dimensions[k];
                        const n = Number(dims[k]);
                        if (!Number.isFinite(n) || n < 0 || n > d.max_score) {
                          return { row: i + 2, name: s.code, result: '失败' as const, reason: `维度「${d.name}」分数须为 0-${d.max_score} 的数字（收到 ${dims[k] || '空'}）` };
                        }
                        vals[d.name] = n;
                      }
                      /** 百分制合成：Σ(得分/满分 × 权重)，与评委端「四维合计」口径一致 */
                      const ai = Math.round(scoreCard.dimensions.reduce((a, d) => a + (vals[d.name] / Math.max(1, d.max_score)) * d.weight, 0) * 10) / 10;
                      return {
                        row: i + 2, name: `${s.code} ${s.title}`, result: '成功' as const,
                        data: { id: s.id, ai, dims: vals },
                      };
                    })}
                    onCommit={(items) => {
                      const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
                      setDb((p) => ({
                        ...p,
                        submits: p.submits.map((s) => {
                          const d = items.find((it) => it.data!.id === s.id);
                          return d ? { ...s, status: 'AI_SCORED' as SubmitStatus, ai_score: d.data!.ai } : s;
                        }),
                        /** 回写同时留一份评分记录（含卡版本），便于事后追溯「按哪版标准评的」 */
                        scoreResults: [...p.scoreResults, ...items.map((it) => ({
                          id: `SR-${it.data!.id}-AI-${Date.now()}-${it.row}`,
                          target_type: 'submit' as const, target_id: it.data!.id,
                          card_id: scoreCard.id, card_version: scoreCard.version, source: 'AI' as const,
                          dim_scores: it.data!.dims, total: it.data!.ai, reason: '批量导入回写',
                          scorer_union_id: me.union_id, scorer_name: me.name, created_at: at,
                        }))],
                      }));
                      log('批量导入评分', `${items.length} 条`, `按评分卡 ${scoreCard.name} ${scoreCard.version} 逐维校验后回写，状态流转为「${statusText('AI_SCORED')}」`);
                      message.success(`已回写 ${items.length} 条（逐维度校验通过，含评分卡版本留痕）`);
                    }}
                  />
                </Space>
                <Table
                  size="small" rowKey="id" dataSource={submits} pagination={{ pageSize: 8 }}
                  rowSelection={{
                    selectedRowKeys: selected,
                    onChange: (keys) => setSelected(keys as string[]),
                  }}
                  columns={[
                    { title: '编号', dataIndex: 'code', width: 150 },
                    { title: '姓名', dataIndex: 'name', width: 80 },
                    { title: '部门', dataIndex: 'dept_name', width: 160 },
                    { title: '作业标题', dataIndex: 'title', ellipsis: true },
                    { title: '赛道', dataIndex: 'track', render: (v: string) => <Tag color={TRACK_COLOR[v]} style={{ border: 'none' }}>{v}</Tag> },
                    { title: 'AI 分', dataIndex: 'ai_score', width: 70, render: (v?: number) => <span className="num">{v ?? '—'}</span> },
                    { title: '最终分', dataIndex: 'final_score', width: 80, render: (v?: number) => <span className="num" style={{ color: COLOR.primary }}>{v ?? '—'}</span> },
                    { title: '状态', dataIndex: 'status', render: (v, r) => <SubmitStatusTag status={v} published={isPublished(r)} /> },
                    {
                      title: '操作', width: 150,
                      render: (_, r) => (readOnly
                        ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>只读</Typography.Text>
                        : (
                          <Space size={4}>
                            {r.status === 'SUBMITTED' && <Button size="small" type="link" onClick={() => toStatus(r.id, 'AI_SCORED')}>标记已跑分</Button>}
                            {r.status === 'AI_SCORED' && <Button size="small" type="link" onClick={() => toStatus(r.id, 'REVIEWING')}>送复核</Button>}
                            {/* V6.0 CR-19：复核完 → 已完成（公示不再是前置条件）→ 可选标记已共识 */}
                            {flowV2 && r.status === 'REVIEWED' && <Button size="small" type="link" onClick={() => toStatus(r.id, 'COMPLETED')}>标记已完成</Button>}
                            {flowV2 && r.status === 'COMPLETED' && <Button size="small" type="link" onClick={() => toStatus(r.id, 'CONSENSUS')}>标记已共识</Button>}
                            {!flowV2 && r.status === 'PASSED' && <Button size="small" type="link" onClick={() => toStatus(r.id, 'PUBLISHED')}>公示</Button>}
                            {flowV2 && (
                              <Button
                                size="small" type="link"
                                onClick={() => { setSelected([r.id]); batchPublish(!isPublished(r)); }}
                              >
                                {isPublished(r) ? '取消公示' : '公示'}
                              </Button>
                            )}
                            {r.status === 'SCORE_FAILED' && <Button size="small" type="link" onClick={() => message.info('单条重试，不影响其他提报')}>重试</Button>}
                            {/* V6.0 CR-23：流程编排（白名单约束，禁止任意跳转） */}
                            {flowControlOn && allowedTargets(r.status).length > 0 && (
                              <Button size="small" type="link" onClick={() => openFlow(r)}>流转</Button>
                            )}
                          </Space>
                        )),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'stats', label: '提报统计',
            children: (
              <Row gutter={12}>
                {[
                  { t: '总提报数', v: inScope.length },
                  { t: '待评分', v: inScope.filter((s) => s.status === 'SUBMITTED').length },
                  { t: '已跑分', v: inScope.filter((s) => s.ai_score !== undefined).length },
                  { t: '待复核', v: inScope.filter((s) => s.status === 'AI_SCORED').length },
                  { t: '已完成', v: inScope.filter((s) => s.status === 'COMPLETED' || s.status === 'CONSENSUS').length },
                  /* V6.0 CR-19：已公示口径 = 标记位 ∪ 旧 PUBLISHED 状态，防止「作业完成了但看板显示未公示」 */
                  { t: '已公示', v: publishedCount },
                  { t: '迟交', v: inScope.filter((s) => s.late).length },
                ].map((m) => (
                  <Col xs={12} sm={4} key={m.t}>
                    <StatCard label={m.t} value={m.v} />
                  </Col>
                ))}
              </Row>
            ),
          },
        ]}
      />

      {/* V6.0 CR-23：流程编排弹窗 —— 目标环节只给白名单内的选项，理由必填 */}
      <Modal
        open={!!flowTarget}
        title={`流程编排 · ${flowTarget?.code}`}
        onCancel={() => setFlowTarget(null)}
        onOk={doFlow}
        okText="确认流转"
        destroyOnClose
      >
        <Form form={flowForm} layout="vertical" preserve={false}>
          <Form.Item label="当前环节">
            <Tag color="blue">{flowTarget?.status}</Tag>
          </Form.Item>
          <Form.Item
            name="to_status" label="目标环节"
            rules={[{ required: true, message: '请选择目标环节' }]}
            extra="仅显示白名单内允许的路径，未登记的路径无法流转"
          >
            <Select
              placeholder={allowedTargets(flowTarget?.status ?? 'DRAFT').length ? '选择目标环节' : '当前环节没有允许的流转路径'}
              options={allowedTargets(flowTarget?.status ?? 'DRAFT').map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item
            name="reason" label="流转理由"
            rules={[{ required: true, message: '请填写理由' }, { min: 10, message: '不少于 10 字' }]}
          >
            <Input.TextArea rows={3} placeholder="说明为什么要退回或转移（≥10 字，写入流转日志）" maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={open} title="新建作业类型" width={680}
        onCancel={() => setOpen(false)}
        onOk={createType}
        /* 本弹窗目前**只有新建**，所以「必选」直接生效是安全的。
           若将来加「编辑作业类型」入口，必须把这里收窄为 `!isEditing && targetSubjects.length === 0`：
           编辑已有数据时该字段常常为空，会让主按钮恒灰、功能形同虚设
           （ContentAdmin 的「编辑案例」就踩过这个坑，见 V4.1 §6）。 */
        okButtonProps={{ disabled: targetSubjects.length === 0 }}
        okText={targetSubjects.length === 0 ? '请先选择提报对象' : '创建'}
      >
        <Form form={form} layout="vertical" initialValues={{ max_times: 1, allow_multi: true, need_review: true, visible_scope: '本部门' }}>
          <Form.Item name="name" label="作业名称" rules={[{ required: true }]}><Input placeholder="如：11 月主题作业" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="form_template" label="提交物模板"><Select options={['通用作业模板', '双通道大赛模板', 'Skill 包模板'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
          </Row>
          <Form.Item label="提报对象范围" required>
            <ScopePicker value={targetSubjects} onChange={setTargetSubjects} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="max_times" label="每人提报次数"><InputNumber min={1} max={99} /></Form.Item></Col>
            <Col span={8}><Form.Item name="allow_multi" label="允许多期" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="need_review" label="需要审核" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Form.Item name="visible_scope" label="可见范围"><Select options={['全员', '本部门', '仅组织者'].map((v) => ({ value: v, label: v }))} /></Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>演示日期 {DEMO_TODAY} · 组织者可为单人临时放开次数上限</Typography.Text>
      </Modal>
    </Space>
  );
}
