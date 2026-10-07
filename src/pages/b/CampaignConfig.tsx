import { Alert, Button, Card, Checkbox, Col, DatePicker, Divider, Form, Input, InputNumber, Modal, Radio, Row, Segmented, Space, Steps, Switch, Table, Tag, Typography, App as AntApp, message as staticMsg } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { useCampaignOps, prevCampaign } from '@/hooks/useCampaignOps';
import dayjs from 'dayjs';

export default function CampaignConfig() {
  const { db, campaign, setDb, setFlags, flags, log, currentCampaignId, setCurrentCampaignId, hasCampaign } = useStore();
  const [visibility, setVisibility] = useState(campaign.visibility);
  const { message } = AntApp.useApp();
  const ops = useCampaignOps();

  /* ---------- V7.1：届次新建 / 复制（此前只有 message.success，点了毫无效果） ---------- */
  type Mode = null | 'create' | 'copy';
  const [mode, setMode] = useState<Mode>(null);
  const [form] = Form.useForm();
  /** 复制来源：默认「上一届」（按开始时间排在当前的之前且最接近的一条） */
  const prev = useMemo(() => prevCampaign(db.campaigns ?? [], campaign.id), [db.campaigns, campaign.id]);
  const [startV, setStartV] = useState<string>(campaign.start_date);
  const [endV, setEndV] = useState<string>(campaign.end_date);
  const [pubOn, setPubOn] = useState<boolean>(campaign.publicSwitch);
  const [rules, setRules] = useState(campaign.pointRules);

  /* 切届次 / 库更新后，把编辑中的值同步成该届次的实际值 */
  useEffect(() => {
    setVisibility(campaign.visibility);
    setStartV(campaign.start_date);
    setEndV(campaign.end_date);
    setPubOn(campaign.publicSwitch);
    setRules(campaign.pointRules);
  }, [campaign.id, campaign.visibility, campaign.start_date, campaign.end_date, campaign.publicSwitch, campaign.pointRules]);

  const openCreate = () => {
    form.setFieldsValue({
      name: '',
      range: [dayjs().startOf('month'), dayjs().add(3, 'month').endOf('month')],
      status: '未开始',
    });
    setMode('create');
  };
  const openCopy = () => {
    const src = prev ?? campaign;
    form.setFieldsValue({
      name: `${src.name} 副本`,
      range: [dayjs(src.start_date || undefined), dayjs(src.end_date || undefined)],
      status: '未开始',
      fromId: src.id,
      copyStages: true,
      copyPointRules: true,
      copyVisibility: true,
      copyPublicSwitch: true,
    });
    setMode('copy');
  };
  const submitCampaign = async () => {
    let v: { name?: string; range?: [dayjs.Dayjs, dayjs.Dayjs]; status?: '进行中' | '已结束' | '未开始'; fromId?: string; copyStages?: boolean; copyPointRules?: boolean; copyVisibility?: boolean; copyPublicSwitch?: boolean };
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const [s, e] = v.range ?? [];
    const id = ops.createCampaign({
      name: v.name ?? '',
      start_date: s ? s.format('YYYY-MM-DD') : '',
      end_date: e ? e.format('YYYY-MM-DD') : '',
      status: v.status ?? '未开始',
      fromId: mode === 'copy' ? (v.fromId ?? prev?.id) : undefined,
      copyStages: !!v.copyStages,
      copyPointRules: !!v.copyPointRules,
      copyVisibility: !!v.copyVisibility,
      copyPublicSwitch: !!v.copyPublicSwitch,
    });
    if (!id) {
      message.error('请填写届次名称，且结束日必须晚于开始日');
      return;
    }
    message.success(mode === 'copy' ? '已按所选配置复制为新届次，并设为当前届次' : '新届次已创建，并设为当前届次');
    setMode(null);
  };

  const saveVisibility = () => {
    if (!hasCampaign) { message.warning('请先创建届次'); return; }
    setDb((p) => ({
      ...p,
      campaigns: p.campaigns.map((c) => (c.id === campaign.id ? { ...c, visibility } : c)),
    }));
    log('公示口径变更', campaign.name, `榜单 ${visibility.leaderboard} / 提报详情 ${visibility.workDetail} / 评语 ${visibility.comment}`);
    message.success('公示口径已保存并即时生效（变更留痕）');
  };

  const toggleFlag = (k: keyof typeof flags, label: string) => {
    setFlags((f) => ({ ...f, [k]: !f[k] }));
    log('功能开关变更', label, `${flags[k] ? 'ON → OFF' : 'OFF → ON'}（关闭后导航隐藏、接口 404 语义、不删数据）`);
    message.success(`${label} 已${flags[k] ? '关闭' : '开启'}`);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="届次与配置" desc="多届支持，历史届次数据可回溯" />

      <Card size="small" title={`当前届次：${campaign.name}`}>
        <Space wrap>
          <Tag color="orange">{campaign.status}</Tag>
          <span>{campaign.start_date || '—'} ~ {campaign.end_date || '—'}</span>
          {/* V7.1：复制上届需有历史届次可复制；完全空库时禁用并提示先创建 */}
          <Button disabled={!hasCampaign} onClick={openCopy} title={hasCampaign ? undefined : '尚无届次可复制，请先创建新届次'}>
            一键复制上届{prev ? `（${prev.name}）` : ''}
          </Button>
          <Button type="primary" onClick={openCreate}>创建新届次</Button>
        </Space>
        {campaign.stages.length > 0 ? (
          <Steps
            style={{ marginTop: 16 }}
            size="small"
            current={2}
            items={campaign.stages.map((s) => ({ title: s.name, description: `${s.start} ~ ${s.end}` }))}
          />
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
            尚未配置阶段 —— 点「创建新届次」后将自动生成 W1~W4 四阶段模板。
          </Typography.Text>
        )}

        {/* 多届列表：可切换当前届次 / 归档。此前页面只显示一条，无法回溯历史届次 */}
        {(db.campaigns ?? []).length > 0 && (
          <Table
            size="small" rowKey="id" pagination={false} style={{ marginTop: 16 }}
            dataSource={db.campaigns ?? []}
            columns={[
              {
                title: '届次', dataIndex: 'name',
                render: (v: string, r) => (
                  <Space size={6}>
                    {r.id === campaign.id && <Tag color="orange">当前</Tag>}
                    <span>{v}</span>
                  </Space>
                ),
              },
              { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag>{v}</Tag> },
              { title: '周期', width: 190, render: (_: unknown, r) => `${r.start_date} ~ ${r.end_date}` },
              { title: '阶段', width: 70, render: (_: unknown, r) => r.stages.length },
              { title: '积分规则', width: 80, render: (_: unknown, r) => r.pointRules.length },
              {
                title: '操作', width: 140,
                render: (_: unknown, r) => (
                  <Space size={4}>
                    <Button size="small" type="link" disabled={r.id === campaign.id}
                      onClick={() => { ops.switchCampaign(r.id); message.success(`已切换到「${r.name}」`); }}>设为当前</Button>
                    <Button size="small" type="link" disabled={r.status !== '进行中'}
                      onClick={() => { ops.archiveCampaign(r.id); message.success(`「${r.name}」已归档`); }}>归档</Button>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={mode !== null}
        title={mode === 'copy' ? '复制上一届次 · 生成新届次' : '创建新届次'}
        okText="创建并设为当前届次"
        cancelText="取消"
        onOk={submitCampaign}
        onCancel={() => setMode(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="届次名称" rules={[{ required: true, message: '请填写届次名称' }]}>
            <Input placeholder="如：2026 Q4 · AI 应用实践季" />
          </Form.Item>
          <Form.Item name="range" label="起止日期" rules={[{ required: true, message: '请选择起止日期' }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Radio.Group
              options={[
                { label: '未开始', value: '未开始' },
                { label: '进行中', value: '进行中' },
              ]}
            />
          </Form.Item>
          {mode === 'copy' && (
            <>
              <Form.Item name="fromId" label="复制来源" hidden><Input /></Form.Item>
              <Form.Item label="复制内容" style={{ marginBottom: 0 }}>
                <Space direction="vertical">
                  <Form.Item name="copyStages" valuePropName="checked" noStyle><Checkbox>阶段划分（W1~W4）</Checkbox></Form.Item>
                  <Form.Item name="copyPointRules" valuePropName="checked" noStyle><Checkbox>积分规则</Checkbox></Form.Item>
                  <Form.Item name="copyVisibility" valuePropName="checked" noStyle><Checkbox>公示口径</Checkbox></Form.Item>
                  <Form.Item name="copyPublicSwitch" valuePropName="checked" noStyle><Checkbox>公示总闸</Checkbox></Form.Item>
                </Space>
              </Form.Item>
            </>
          )}
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          创建后自动设为当前届次；若状态选「进行中」，原有进行中届次会自动归档为「已结束」。
        </Typography.Text>
      </Modal>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="时间窗配置">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space>
                <span>启动日</span>
                <DatePicker value={startV ? dayjs(startV) : undefined}
                  onChange={(d) => setStartV(d ? d.format('YYYY-MM-DD') : '')} />
                <span>结束日</span>
                <DatePicker value={endV ? dayjs(endV) : undefined}
                  onChange={(d) => setEndV(d ? d.format('YYYY-MM-DD') : '')} />
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                影响提报与榜单，不影响历史数据；演示基准日 {DEMO_TODAY}
              </Typography.Text>
              <Button type="primary" onClick={() => {
                if (!hasCampaign) { message.warning('请先创建届次'); return; }
                if (!ops.saveTimeWindow(campaign.id, startV, endV)) { message.error('结束日必须晚于开始日'); return; }
                message.success('时间窗已保存');
              }}>保存时间窗</Button>
            </Space>
          </Card>

          <Card size="small" title="积分规则" style={{ marginTop: 16 }}>
            <Table
              size="small" rowKey="action" pagination={false} dataSource={campaign.pointRules}
              columns={[
                { title: '行为', dataIndex: 'action' },
                {
                  title: '积分', dataIndex: 'points', width: 100,
                  render: (v: number, r) => (
                    <InputNumber size="small" value={v} min={0}
                      onChange={(n) => setRules((prev) => prev.map((x) => (x.action === r.action ? { ...x, points: Number(n ?? 0) } : x)))} />
                  ),
                },
                { title: '上限', dataIndex: 'cap', width: 90, render: (v?: number) => v ? <span className="num">{v}</span> : '—' },
              ]}
            />
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              规则变更仅对新行为生效；设置个人与部门积分上限防止积分超发导致成本失控。
            </Typography.Text>
            <Button style={{ marginTop: 8 }} onClick={() => {
              if (!hasCampaign) { message.warning('请先创建届次'); return; }
              ops.savePointRules(campaign.id, rules);
              message.success('积分规则已保存');
            }}>保存规则</Button>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title="公示口径（Q9：默认 + 管理员可配）">
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="默认：榜单全员可见、提报/作业详情仅本部门可见；评语默认不公示"
              description="分数与排名可公示；涉及客户信息的内容一律不公示。" />
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {[
                { k: 'leaderboard' as const, label: '榜单（排名与分数）' },
                { k: 'workDetail' as const, label: '提报 / 作业详情' },
                { k: 'comment' as const, label: '评语' },
              ].map((item) => (
                <div key={item.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{item.label}</span>
                  <Segmented
                    size="small"
                    value={visibility[item.k]}
                    onChange={(v) => setVisibility({ ...visibility, [item.k]: String(v) as never })}
                    options={[...(item.k === 'comment' ? ['全员', '本部门', '不公示'] : ['全员', '本部门', '仅组织者'])].map((x) => ({ label: x, value: x }))}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>公示总闸（关闭则所有榜单与优秀作品对外不可见）</span>
                <Switch checked={pubOn} onChange={(c) => {
                  setPubOn(c);
                  if (!hasCampaign) { message.warning('请先创建届次'); return; }
                  ops.savePublicSwitch(campaign.id, c);
                  message.success(c ? '公示已开启' : '公示总闸已关闭，榜单与优秀作品对外不可见');
                }} />
              </div>
              <Button type="primary" onClick={saveVisibility}>保存公示口径</Button>
            </Space>
          </Card>

          <Card size="small" title="功能开关与灰度（PRD 8.4）" style={{ marginTop: 16 }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {[
                { k: 'community' as const, label: '用户社区 M11' },
                { k: 'shop' as const, label: '积分商城 M8' },
                { k: 'clinic' as const, label: '专家门诊 M4' },
                { k: 'wbAdmin' as const, label: '管理员数据 M12' },
                { k: 'anonymousPost' as const, label: '社区匿名发帖（特性级）' },
                { k: 'homeAnnounceTicker' as const, label: 'V6.0 CR-13 首页公告条置顶轮播（关闭=公告回右下角 ≡ V5.0）' },
              ].map((f) => (
                <div key={f.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{f.label}</span>
                  <Space>
                    <Tag color={flags[f.k] ? 'green' : 'default'}>{flags[f.k] ? 'ON' : 'OFF'}</Tag>
                    <Switch size="small" checked={flags[f.k]} onChange={() => toggleFlag(f.k, f.label)} />
                  </Space>
                </div>
              ))}

              <Divider style={{ margin: '10px 0' }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.textSub }}>V6.0 增量开关（关闭即回 V5.0 行为）</div>
              {[
                { k: 'topicCustom' as const, label: 'CR-17 选题「其他·自定义」与私有可见' },
                { k: 'workNoTopic' as const, label: 'CR-18 提报支持「不选选题」直提' },
                { k: 'submitFlowV2' as const, label: 'CR-19 状态机 V2（已完成/已共识 + 公示解耦）' },
                { k: 'bountySolutionV2' as const, label: 'CR-20/21 悬赏方案结构化 + 修改/补充双通道' },
                { k: 'homeJudgeEntry' as const, label: 'CR-15 首页评委复核入口（仅 JUDGE）' },
                { k: 'clinicWorkbench' as const, label: 'CR-16 专家工作台下沉 /clinic/workbench' },
                {
                  k: 'adminCoreConverge' as const,
                  label: 'CR-22 后台三板块收窄为组织者/管理员（⚠ 必须与 CR-30 团队视图同批）',
                },
                { k: 'teamView' as const, label: 'CR-30 负责人团队视图 /team（收窄后的补偿入口）' },
                { k: 'submitFlowControl' as const, label: 'CR-23 作业流转编排（白名单 + 理由必填 + 二次确认）' },
                { k: 'scoreCardLifecycle' as const, label: 'CR-24 评分卡生命周期（新建/复制/停用/删除）' },
                { k: 'judgeOverride' as const, label: 'CR-25 组织者覆盖评委复核（覆盖非覆写）' },
                { k: 'expertScheduleBatch' as const, label: 'CR-26 专家排班批量导入与直接改约' },
                { k: 'assetLedgerBatch' as const, label: 'CR-27 资产台账批量导入 / 批量调整 / 软删' },
                { k: 'contentFullCrud' as const, label: 'CR-28 内容管理四 Tab 全维度 CRUD' },
                { k: 'shopBatch' as const, label: 'CR-29 商城商品批量导入与批量软删' },
                {
                  k: 'realFileService' as const,
                  label: 'CR-31 真实文件服务（关闭 ≡ A-39 演示态：只登记文件名，无法下载）',
                },
              ].map((f) => (
                <div key={f.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>{f.label}</span>
                  <Space>
                    <Tag color={flags[f.k] ? 'green' : 'default'}>{flags[f.k] ? 'ON' : 'OFF'}</Tag>
                    <Switch size="small" checked={flags[f.k]} onChange={() => toggleFlag(f.k, f.label)} />
                  </Space>
                </div>
              ))}
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              灰度路径：开关默认 OFF → 灰度 1（仅组织者与管理员）→ 灰度 2（按部门放量）→ 灰度 3（按人群）→ 全量 ON。
              任意阶段发现严重问题：开关 OFF 即秒级回滚，数据保留不丢失。
            </Typography.Text>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
