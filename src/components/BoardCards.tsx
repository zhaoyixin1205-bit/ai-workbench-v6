/**
 * V4.0 CR-06 · 进度看板配置化（卡片配置驱动）
 *
 * 设计约定：
 * 1. `useBoardData()` 是看板所有指标的**唯一计算口径**，V3.0 固定布局与 V4.0 配置化布局共用，
 *    避免「关掉开关前后数字不一致」；
 * 2. `renderCard()` 按 config.card.chart 渲染，支持 number / progress / line / bar / table / rank；
 * 3. 关闭 `board.configurable` 开关 → 完全回到 V3.0 §11.1 固定分区，本文件不参与渲染。
 */
import type { BoardCardConfig } from '@/mock/types';
import { COLOR } from '@/theme';
import { Card, Col, Progress, Row, Space, Table, Tag, Typography } from 'antd';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { useMemo } from 'react';
import { useStore } from '@/store/store';
import { deptName } from '@/mock/seedOrg';

export interface BoardData {
  /** 当前口径标签名 */
  tagName: string;
  /** 应参与人数（分母） */
  scopeCount: number;
  activated: number;
  submitted: number;
  validWorks: number;
  assets: number;
  assetReuse: number;
  schedules: number;
  bookings: number;
  /** [{dept, rate, avg, sub, total}] */
  deptRank: { dept: string; rate: number; avg: number; sub: number; total: number }[];
  /** [{name, value}] */
  trackDist: { name: string; value: number }[];
  /** [{label, n, color}] */
  scoreProgress: { label: string; n: number; color: string }[];
  submitsTotal: number;
  top10: { id: string; name: string; dept_name: string; title: string; final_score?: number }[];
}

/** 看板指标计算：与 V3.0 固定布局完全同口径 */
export function useBoardData(): BoardData {
  const { db, scopeRows, visibleUsers } = useStore();
  return useMemo(() => {
    const users = visibleUsers();
    const submits = scopeRows(db.submits);
    const usage = scopeRows(db.wbUsage);
    const tag = db.tags.find((t) => t.code === 'CADRE');
    const scopeUsers = tag ? users.filter((u) => u.tags.includes(tag.id)) : users;
    const scopeIds = new Set(scopeUsers.map((u) => u.union_id));
    const submittedSet = new Set(submits.filter((s) => !['DRAFT', 'WITHDRAWN'].includes(s.status)).map((s) => s.union_id));
    const activatedSet = new Set(usage.filter((w) => w.active_days > 0).map((w) => w.union_id));
    const inScope = (set: Set<string>) => [...set].filter((id) => scopeIds.has(id)).length;

    const deptRank = Object.entries(
      users.reduce<Record<string, { total: number; sub: number; score: number[] }>>((acc, u) => {
        const d = deptName(u.dept_id_list[0]);
        acc[d] ??= { total: 0, sub: 0, score: [] };
        acc[d].total += 1;
        if (submittedSet.has(u.union_id)) acc[d].sub += 1;
        const s = submits.filter((x) => x.union_id === u.union_id && x.final_score !== undefined);
        s.forEach((x) => acc[d].score.push(x.final_score!));
        return acc;
      }, {})
    ).map(([name, v]) => ({
      dept: name.split('/').pop() ?? name,
      rate: Math.round((v.sub / v.total) * 100),
      avg: v.score.length ? Math.round(v.score.reduce((a, b) => a + b, 0) / v.score.length) : 0,
      sub: v.sub, total: v.total,
    })).sort((a, b) => b.rate - a.rate);

    const trackDist = (['客户赋能', '团队提效', '销售提效'] as const).map((t) => ({
      name: t, value: submits.filter((s) => s.track === t).length,
    }));

    const scoreProgress = [
      { label: '已提报', n: submits.length, color: '#E5E7EB' },
      { label: '已跑分', n: submits.filter((s) => s.ai_score !== undefined).length, color: '#2563EB' },
      { label: '已复核', n: submits.filter((s) => s.judge_score !== undefined).length, color: '#7C3AED' },
      { label: '已公示', n: submits.filter((s) => ['PUBLISHED', 'ASSET_APPLYING', 'ASSET_ONLINE'].includes(s.status)).length, color: '#059669' },
    ];

    const top10 = [...submits].filter((s) => s.final_score !== undefined)
      .sort((a, b) => b.final_score! - a.final_score!).slice(0, 10)
      .map((s) => ({
        id: s.id, name: s.name, dept_name: s.dept_name, title: s.title, final_score: s.final_score,
      }));

    return {
      tagName: tag?.name ?? '全部人员',
      scopeCount: scopeUsers.length,
      activated: inScope(activatedSet),
      submitted: inScope(submittedSet),
      validWorks: submits.filter((s) => (s.final_score ?? 0) >= 60).length,
      assets: db.assets.length,
      assetReuse: db.assets.reduce((a, b) => a + b.reuse_count, 0),
      schedules: db.schedules.filter((s) => s.booked > 0).length,
      bookings: db.bookings.length,
      deptRank, trackDist, scoreProgress,
      submitsTotal: submits.length,
      top10,
    };
  }, [db, scopeRows, visibleUsers]);
}

export type Payload =
  | { kind: 'value'; value: number; sub?: string }
  | { kind: 'progress'; value: number; total: number; sub?: string }
  | { kind: 'rows'; rows: { name: string; value: number }[] }
  | { kind: 'rank'; rows: { name: string; score: number; sub: string }[] };

/** 指标 → 展示载荷；未知指标降级为数值 0 并在标题上体现，避免白屏 */
export function metricPayload(metric: string, d: BoardData): Payload {
  const pctOf = (n: number) => `${Math.round((n / Math.max(1, d.scopeCount)) * 1000) / 10}%`;
  switch (metric) {
    case 'scopeCount': return { kind: 'value', value: d.scopeCount, sub: `标签：${d.tagName}` };
    case 'activated': return { kind: 'progress', value: d.activated, total: d.scopeCount, sub: `激活率 ${pctOf(d.activated)}` };
    case 'submitted': return { kind: 'progress', value: d.submitted, total: d.scopeCount, sub: `提交率 ${pctOf(d.submitted)}` };
    case 'validWorks': return { kind: 'value', value: d.validWorks, sub: '≥60 分且确认真实' };
    case 'assets': return { kind: 'value', value: d.assets, sub: `复用 ${d.assetReuse} 次` };
    case 'schedules': return { kind: 'value', value: d.schedules, sub: `预约 ${d.bookings} 人次` };
    case 'deptRank': return { kind: 'rows', rows: d.deptRank.map((r) => ({ name: r.dept, value: r.rate })) };
    case 'trackDist': return { kind: 'rows', rows: d.trackDist.map((r) => ({ name: r.name, value: r.value })) };
    case 'scoreProgress': return { kind: 'rows', rows: d.scoreProgress.map((r) => ({ name: r.label, value: r.n })) };
    case 'top10': return {
      kind: 'rank',
      rows: d.top10.map((r) => ({ name: r.name, score: r.final_score ?? 0, sub: r.title })),
    };
    default: return { kind: 'value', value: 0, sub: '未知指标（请在系统管理中检查配置）' };
  }
}

function ChartRows({ rows, chart, unit }: { rows: { name: string; value: number }[]; chart: 'line' | 'bar'; unit?: string }) {
  const fmt = (v: number) => `${v}${unit ?? ''}`;
  if (chart === 'line') {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#EEF0F4" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <RTooltip formatter={(v: number) => fmt(v)} />
          <Line type="monotone" dataKey="value" stroke={COLOR.primary} strokeWidth={2.5} dot={{ r: 3, fill: COLOR.primary }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="wbCfgBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF8F5E" />
            <stop offset="100%" stopColor="#FF6B35" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#EEF0F4" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <RTooltip formatter={(v: number) => fmt(v)} />
        <Bar dataKey="value" fill="url(#wbCfgBarGrad)" radius={[7, 7, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 单张卡片渲染（仅负责「怎么画」，数据来自 metricPayload） */
export function BoardCard({ card, data }: { card: BoardCardConfig; data: BoardData }) {
  const p = metricPayload(card.metric, data);
  const unit = card.unit ?? '';

  const inner = () => {
    if (p.kind === 'value') {
      return (
        <div>
          <div className="num wb-metric" style={{ fontSize: 30 }}>{p.value}{unit && <span style={{ fontSize: 14, marginLeft: 4 }}>{unit}</span>}</div>
          {p.sub && <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 6 }}>{p.sub}</div>}
        </div>
      );
    }
    if (p.kind === 'progress') {
      const percent = Math.round((p.value / Math.max(1, p.total)) * 100);
      return (
        <div>
          <div className="num wb-metric" style={{ fontSize: 30 }}>{p.value}{unit && <span style={{ fontSize: 14, marginLeft: 4 }}>{unit}</span>}</div>
          <Progress percent={percent} strokeColor={COLOR.primary} size="small" style={{ marginTop: 8 }} />
          <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 4 }}>{p.sub}</div>
        </div>
      );
    }
    if (p.kind === 'rows') {
      if (card.chart === 'bar' || card.chart === 'line') {
        return <ChartRows rows={p.rows} chart={card.chart === 'line' ? 'line' : 'bar'} unit={unit} />;
      }
      return (
        <Table
          size="small" rowKey="name" pagination={false} dataSource={p.rows}
          columns={[
            { title: '项目', dataIndex: 'name' },
            { title: '数值', dataIndex: 'value', width: 90, render: (v: number) => <span className="num">{v}{unit}</span> },
          ]}
        />
      );
    }
    return (
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {p.rows.map((r, i) => (
          <div key={r.name + i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 12 }}>
            <span>
              <span className="num" style={{ color: COLOR.textMuted, marginRight: 8 }}>{i + 1}</span>
              {r.name}
              <span style={{ color: COLOR.textMuted, marginLeft: 8, fontSize: 12 }}>{r.sub}</span>
            </span>
            <span className="num" style={{ color: COLOR.primary, fontWeight: 600 }}>{r.score}{unit}</span>
          </div>
        ))}
      </Space>
    );
  };

  const span = (() => {
    if (p.kind === 'value' || p.kind === 'progress') return { xs: 12, sm: 8, lg: 4 };
    if (card.chart === 'rank' || card.chart === 'table') return { xs: 24, lg: 14 };
    return { xs: 24, lg: 12 };
  })();

  return (
    <Col {...span}>
      <Card size="small" title={card.title} styles={{ body: { padding: 16 } }}>
        {inner()}
      </Card>
    </Col>
  );
}

/** 卡片网格：只渲染 enabled 且按 order 排序；空配置时给出提示而不是白屏 */
export function BoardCards() {
  const { db, campaign } = useStore();
  const data = useBoardData();
  const cfg = db.boardConfigs.find((c) => c.campaign_id === campaign.id) ?? db.boardConfigs[0];
  const cards = [...(cfg?.cards ?? [])].filter((c) => c.enabled).sort((a, b) => a.order - b.order);

  if (cards.length === 0) {
    return (
      <Card>
        <Typography.Text type="secondary">
          当前看板配置为空（全部卡片已停用）。请在「系统管理 → 看板配置」中启用至少一张卡片，或点击「还原默认模板」。
        </Typography.Text>
      </Card>
    );
  }

  return (
    <>
      <Row gutter={[16, 16]}>
        {cards.map((c) => <BoardCard key={c.id} card={c} data={data} />)}
      </Row>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        看板由「卡片配置」驱动（配置版本 {cfg?.version ?? '1.0'} · 更新人 {cfg?.updated_by ?? '系统默认'} · {cfg?.updated_at ?? '—'}）；关闭 board.configurable 开关即回到 V3.0 固定分区。
      </Typography.Text>
    </>
  );
}

export const CHART_LABEL: Record<string, string> = {
  number: '数值', progress: '进度条', line: '折线图', bar: '柱状图', table: '表格', rank: '排行榜',
};

export function scopeLabel(scope: string) {
  return scope === 'ALL' ? '全部人员' : scope.startsWith('TAG:') ? `标签 ${scope.slice(4)}` : scope;
}
