import { Button, Card, Space, Table, Tabs, Tag, Typography, Input, Select, App as AntApp, Modal, Form, Switch, InputNumber, Row, Col, Statistic, Alert } from 'antd';
import { DownloadOutlined, UploadOutlined, PlusOutlined, CopyOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, TRACK_COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { SubmitStatusTag } from '@/pages/c/WorkList';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker, { ScopeText, useScopeCommit } from '@/components/ScopePicker';
import type { AssignmentType, ScopeSubject } from '@/mock/types';
import { useSkillAdminConverge } from '@/auth/converge';
import { ScopeNotice } from '@/components/ScopeNotice';

export default function AssignmentAdmin() {
  const { db, setDb, log, campaign, scopeRows, me } = useStore();
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

  const triggerAi = () => {
    modal.confirm({
      title: '触发 AI 评分',
      content: 'Q1 决策：本期走「模板下载 + 批量导入」。将导出评分模板（含评分卡维度与标准），外部跑分后再上传 CSV/XLSX 回写。',
      okText: '下载评分模板',
      onOk: () => {
        log('导出评分模板', inScope.filter((s) => s.status === 'SUBMITTED').length + ' 条待评分', '含评分卡维度与标准');
        message.success('评分模板已导出（含大赛四维评分卡 v2 的维度、权重与档位标准）');
      },
    });
  };

  const toStatus = (id: string, next: 'AI_SCORED' | 'REVIEWING' | 'PUBLISHED') => {
    setDb((p) => ({ ...p, submits: p.submits.map((s) => (s.id === id ? { ...s, status: next } : s)) }));
    message.success('状态已流转');
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
                    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'PUBLISHED' ? 'green' : 'default'}>{v}</Tag> },
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
                  <Select
                    value={status} onChange={setStatus} style={{ width: 150 }}
                    options={['全部', 'SUBMITTED', 'AI_SCORED', 'REVIEWING', 'REVIEWED', 'PASSED', 'PUBLISHED', 'ASSET_APPLYING', 'ASSET_ONLINE', 'SCORE_FAILED']
                      .map((v) => ({ value: v, label: v }))}
                  />
                  <Button disabled={readOnly} icon={<DownloadOutlined />} onClick={triggerAi}>评分模板导出 / 批量导入（Q1）</Button>
                  <Button disabled={readOnly} icon={<UploadOutlined />} onClick={() => {
                    setDb((p) => ({
                      ...p,
                      submits: p.submits.map((s) => (s.status === 'SUBMITTED' && scopeIds.has(s.id)
                        ? { ...s, status: 'AI_SCORED', ai_score: Math.round((18 + Math.random() * 12) * 10) / 10 } : s)),
                    }));
                    log('批量导入评分', 'CSV 回写', '单维分数校验 + 档位匹配校验通过');
                    message.success('批量导入成功，已按双轨权重合成最终分');
                  }}>模拟导入跑分结果</Button>
                </Space>
                <Table
                  size="small" rowKey="id" dataSource={submits} pagination={{ pageSize: 8 }}
                  columns={[
                    { title: '编号', dataIndex: 'code', width: 150 },
                    { title: '姓名', dataIndex: 'name', width: 80 },
                    { title: '部门', dataIndex: 'dept_name', width: 160 },
                    { title: '作业标题', dataIndex: 'title', ellipsis: true },
                    { title: '赛道', dataIndex: 'track', render: (v: string) => <Tag color={TRACK_COLOR[v]} style={{ border: 'none' }}>{v}</Tag> },
                    { title: 'AI 分', dataIndex: 'ai_score', width: 70, render: (v?: number) => <span className="num">{v ?? '—'}</span> },
                    { title: '最终分', dataIndex: 'final_score', width: 80, render: (v?: number) => <span className="num" style={{ color: COLOR.primary }}>{v ?? '—'}</span> },
                    { title: '状态', dataIndex: 'status', render: (v) => <SubmitStatusTag status={v} /> },
                    {
                      title: '操作', width: 130,
                      render: (_, r) => (readOnly
                        ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>只读</Typography.Text>
                        : (
                          <Space size={4}>
                            {r.status === 'SUBMITTED' && <Button size="small" type="link" onClick={() => toStatus(r.id, 'AI_SCORED')}>标记已跑分</Button>}
                            {r.status === 'AI_SCORED' && <Button size="small" type="link" onClick={() => toStatus(r.id, 'REVIEWING')}>送复核</Button>}
                            {r.status === 'PASSED' && <Button size="small" type="link" onClick={() => toStatus(r.id, 'PUBLISHED')}>公示</Button>}
                            {r.status === 'SCORE_FAILED' && <Button size="small" type="link" onClick={() => message.info('单条重试，不影响其他提报')}>重试</Button>}
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
                  { t: '已公示', v: inScope.filter((s) => s.status === 'PUBLISHED').length },
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
