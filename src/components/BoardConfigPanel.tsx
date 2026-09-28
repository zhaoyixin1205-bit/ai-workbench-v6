/**
 * V4.0 CR-06 · 进度看板配置面板
 *
 * 挂载点：系统管理 → 看板配置（不新增路由，避免改动 auth/access.ts）。
 * 能力：卡片启停 / 排序 / 标题 / 单位 / 图表类型 / 统计范围；
 *      一键还原默认模板（= V3.0 §11.1 分区）；配置变更写审计日志；
 *      提供 JSON 预览，便于后续迁移到后台存储。
 * 开关：board.configurable 关闭时提示「当前为 V3.0 固定分区」并禁用编辑。
 */
import { Alert, Button, Card, Input, Select, Space, Switch, Table, Tag, Typography, App as AntApp } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { DEMO_TODAY, BOARD_CONFIGS } from '@/mock/seedBiz';
import type { BoardCardConfig } from '@/mock/types';
import { CHART_LABEL } from '@/components/BoardCards';
import { PageHeader } from '@/components/ui';

const METRIC_LABEL: Record<string, string> = {
  scopeCount: '应参与人数（分母）',
  activated: '已激活人数',
  submitted: '已提交人数',
  validWorks: '有效作业数',
  assets: '入库资产数',
  schedules: '坐诊场次',
  deptRank: '部门提交率排行',
  trackDist: '赛道分布',
  scoreProgress: '评分进度',
  top10: '优秀作业 TOP10',
};

const cloneDefault = (): BoardCardConfig[] =>
  JSON.parse(JSON.stringify(BOARD_CONFIGS[0].cards)) as BoardCardConfig[];

export default function BoardConfigPanel() {
  const { db, setDb, me, log, campaign, flags } = useStore();
  const { message, modal } = AntApp.useApp();
  const editable = flags.boardConfigurable !== false;

  const stored = db.boardConfigs.find((c) => c.campaign_id === campaign.id) ?? db.boardConfigs[0];
  const [cards, setCards] = useState<BoardCardConfig[]>(
    () => JSON.parse(JSON.stringify(stored?.cards ?? [])) as BoardCardConfig[]
  );
  const [dirty, setDirty] = useState(false);

  const patch = (id: string, p: Partial<BoardCardConfig>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)));
    setDirty(true);
  };

  const move = (idx: number, delta: number) => {
    const next = [...cards];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setCards(next.map((c, i) => ({ ...c, order: i + 1 })));
    setDirty(true);
  };

  const save = () => {
    const cfg = {
      campaign_id: campaign.id,
      version: String(Number(stored?.version ?? '1.0') + 0.1).slice(0, 3),
      updated_by: me.name,
      updated_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
      cards: cards.map((c, i) => ({ ...c, order: i + 1 })),
    };
    setDb((p) => ({
      ...p,
      boardConfigs: p.boardConfigs.some((c) => c.campaign_id === campaign.id)
        ? p.boardConfigs.map((c) => (c.campaign_id === campaign.id ? cfg : c))
        : [...p.boardConfigs, cfg],
    }));
    log('看板配置变更', `届次 ${campaign.name}`, `版本 ${cfg.version}；启用 ${cfg.cards.filter((c) => c.enabled).length}/${cfg.cards.length} 张卡片`);
    message.success(`看板配置已保存（v${cfg.version}），无需发版即刻生效`);
    setDirty(false);
  };

  const restore = () => {
    modal.confirm({
      title: '还原默认模板？',
      content: '将恢复为 V3.0 §11.1 看板分区（10 张默认卡片），当前自定义配置会被覆盖。',
      onOk: () => { setCards(cloneDefault()); setDirty(true); message.success('已载入默认模板，点「保存配置」后生效'); },
    });
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <PageHeader
        title="进度看板配置"
        desc="卡片启停、排序、指标、图表类型由系统管理员统一配置，改完即刻生效、无需发版"
        extra={<Space>
          <Button icon={<ReloadOutlined />} disabled={!editable} onClick={restore}>还原默认模板</Button>
          <Button type="primary" icon={<SaveOutlined />} disabled={!editable || !dirty} onClick={save}>保存配置</Button>
        </Space>}
      />

      {!editable && (
        <Alert type="warning" showIcon
          message="board.configurable 开关已关闭"
          description="当前看板为 V3.0 §11.1 固定分区，下方配置不生效。如需配置化，请在功能开关中启用 board.configurable。" />
      )}

      <Alert type="info" showIcon
        message="验收口径"
        description="关闭一张卡片 → 看板即时少一张且不错位；切换图表类型 → 同数据不同呈现（数值/进度条/折线/柱状/表格/排行榜）；导出随配置变化。" />

      <Table
        size="small" rowKey="id" pagination={false} dataSource={cards}
        columns={[
          { title: '顺序', dataIndex: 'order', width: 96, render: (_, __, i) => (
            <Space size={2}>
              <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={!editable || i === 0} onClick={() => move(i, -1)} />
              <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={!editable || i === cards.length - 1} onClick={() => move(i, 1)} />
            </Space>
          ) },
          {
            title: '卡片标题', dataIndex: 'title', width: 180,
            render: (v: string, r) => <Input size="small" disabled={!editable} value={v} onChange={(e) => patch(r.id, { title: e.target.value })} />,
          },
          {
            title: '指标', dataIndex: 'metric', width: 160,
            render: (v: string) => <span style={{ fontSize: 12 }}>{METRIC_LABEL[v] ?? v}</span>,
          },
          {
            title: '图表类型', dataIndex: 'chart', width: 130,
            render: (v: string, r) => (
              <Select
                size="small" disabled={!editable} value={v} style={{ width: 110 }}
                options={Object.entries(CHART_LABEL).map(([k, label]) => ({ value: k, label }))}
                onChange={(nv) => patch(r.id, { chart: nv as BoardCardConfig['chart'] })}
              />
            ),
          },
          {
            title: '单位', dataIndex: 'unit', width: 96,
            render: (v: string, r) => <Input size="small" disabled={!editable} value={v ?? ''} placeholder="% / 人" onChange={(e) => patch(r.id, { unit: e.target.value })} />,
          },
          {
            title: '统计范围', dataIndex: 'scope', width: 140,
            render: (v: string, r) => (
              <Select
                size="small" disabled={!editable} value={v} style={{ width: 120 }}
                options={[{ value: 'ALL', label: '全部人员' }, { value: 'TAG:CADRE', label: '标签 干部' }]}
                onChange={(nv) => patch(r.id, { scope: nv })}
              />
            ),
          },
          {
            title: '启用', dataIndex: 'enabled', width: 80,
            render: (v: boolean, r) => <Switch size="small" disabled={!editable} checked={v} onChange={(nv) => patch(r.id, { enabled: nv })} />,
          },
          {
            title: '状态', width: 90,
            render: (_, r) => (r.enabled ? <Tag color="green">展示中</Tag> : <Tag>已停用</Tag>),
          },
        ]}
      />

      <Card size="small" title="卡片配置 JSON（便于迁移到后台存储）">
        <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', color: '#475569' }}>
{JSON.stringify({
  version: stored?.version ?? '1.0',
  updated_by: stored?.updated_by ?? '系统默认',
  updated_at: stored?.updated_at ?? '—',
  cards: cards.map((c, i) => ({ ...c, order: i + 1 })),
}, null, 2)}
        </pre>
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          当前配置版本 {stored?.version ?? '1.0'} · 更新人 {stored?.updated_by ?? '系统默认'} · {stored?.updated_at ?? '—'}
          {dirty && <span style={{ color: '#B45309' }}> ｜ 有未保存的修改</span>}
        </Typography.Text>
      </Card>
    </Space>
  );
}
