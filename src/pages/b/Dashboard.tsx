import { Card, Col, Progress, Row, Segmented, Space, Statistic, Table, Tag, Typography, Alert, Button, App as AntApp } from 'antd';
import { useNoteVisible } from '@/auth/annotation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useState } from 'react';
import { useStore, useStats } from '@/store/store';
import { COLOR, TRACK_COLOR } from '@/theme';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { deptNameIn } from '@/mock/seedOrg';
import { StatCard } from '@/components/ui';
import { useSkillAdminConverge } from '@/auth/converge';
import { BoardCards } from '@/components/BoardCards';
import { ScopeNotice } from '@/components/ScopeNotice';

export default function Dashboard() {
  const { db, log, me, scopeRows, visibleUsers, flags, campaign } = useStore();
  /** V8.6-10.08：口径 / 规则注解仅运营方与管理员可见 */
  const note = useNoteVisible();

  const stats = useStats();
  /** V4.0 CR-09：技能管理员在本页为只读浏览者（§6.2 矩阵 ◐） */
  const skillAdminReadOnly = useSkillAdminConverge().isReadOnly('/admin');
  /** V4.0 CR-06：看板由卡片配置驱动；开关关闭即回到 V3.0 §11.1 固定分区 */
  const configurable = flags.boardConfigurable !== false;
  const enabled = campaign && (db.boardConfigs.find((c) => c.campaign_id === campaign.id) ?? db.boardConfigs[0])?.cards
    .filter((c) => c.enabled).map((c) => c.title);
  const { message } = AntApp.useApp();
  const [tagCode, setTagCode] = useState('CADRE');

  /** V4.0 A-3：数据可见范围（角色并集只放大入口，不放大数据范围） */
  const users = visibleUsers();
  const submits = scopeRows(db.submits);
  const usage = scopeRows(db.wbUsage);

  const tag = db.tags.find((t) => t.code === tagCode)!;
  const scopeUsers = users.filter((u) => u.tags.includes(tag.id));
  const scopeIds = new Set(scopeUsers.map((u) => u.union_id));
  const submitted = new Set(submits.filter((s) => !['DRAFT', 'WITHDRAWN'].includes(s.status)).map((s) => s.union_id));
  const activated = new Set(usage.filter((w) => w.active_days > 0).map((w) => w.union_id));
  const inScope = (set: Set<string>) => [...set].filter((id) => scopeIds.has(id)).length;
  const pct = (n: number) => Math.round((n / Math.max(1, scopeUsers.length)) * 1000) / 10;

  const deptRank = Object.entries(
    users.reduce<Record<string, { total: number; sub: number; score: number[] }>>((acc, u) => {
      const d = deptNameIn(db.depts, u.dept_id_list[0]);
      acc[d] ??= { total: 0, sub: 0, score: [] };
      acc[d].total += 1;
      if (submitted.has(u.union_id)) acc[d].sub += 1;
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

  const top10 = [...submits].filter((s) => s.final_score !== undefined).sort((a, b) => b.final_score! - a.final_score!).slice(0, 10);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info" showIcon
        message={`当前统计口径：标签 = ${tag.name}，分母 = ${scopeUsers.length} 人`}
        description={note ? '口径一致性要求：同一份报表分母必须唯一；切换标签时全页口径同步变化，导出文件表头自动带口径标注。' : undefined}
        action={
          <Segmented
            value={tagCode}
            onChange={(v) => setTagCode(String(v))}
            options={db.tags.filter((t) => t.status === '启用').map((t) => ({ label: `${t.name}（${users.filter((u) => u.tags.includes(t.id)).length}）`, value: t.code }))}
          />
        }
      />

      {/* U-2 结案：范围受限提示（含专家身份说明），四个后台页共用同一套口径 */}
      <ScopeNotice count={users.length} unit="人" />

      {/* V4.0 CR-06：配置驱动；开关关闭时渲染下方 V3.0 固定分区 */}
      {configurable && <BoardCards />}

      {!configurable && (
        <>
      {/* 总览 */}
      <Row gutter={[16, 16]}>
        {[
          { t: '应参与人数', v: scopeUsers.length, s: `标签：${tag.name}`, tone: 'primary' as const },
          { t: '已激活人数', v: inScope(activated), s: `激活率 ${pct(inScope(activated))}%`, tone: 'green' as const },
          { t: '已提交人数', v: inScope(submitted), s: `提交率 ${pct(inScope(submitted))}%`, tone: 'blue' as const },
          { t: '有效作业', v: stats.validWorks, s: '≥60 分且抽查通过', tone: 'purple' as const },
          { t: '入库资产', v: db.assets.length, s: `复用 ${db.assets.reduce((a, b) => a + b.reuse_count, 0)} 次`, tone: 'primary' as const },
          { t: '坐诊场次', v: db.schedules.filter((s) => s.booked > 0).length, s: `预约 ${db.bookings.length} 人次`, tone: 'blue' as const },
        ].map((m) => (
          <Col xs={12} sm={8} lg={4} key={m.t}>
            <StatCard label={m.t} value={m.v} sub={m.s} tone={m.tone} />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card size="small" title="部门提交率排行（红榜 / 待改进）">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={deptRank} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="wbBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF8F5E" />
                    <stop offset="100%" stopColor="#FF6B35" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#EEF0F4" />
                <XAxis dataKey="dept" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <RTooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="rate" fill="url(#wbBarGrad)" radius={[7, 7, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="赛道分布">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                <Pie
                  data={trackDist} dataKey="value" nameKey="name"
                  innerRadius={50} outerRadius={74} paddingAngle={3} stroke="none"
                  label={({ percent, x, y }: { percent?: number; x?: number; y?: number }) => (
                    <text
                      x={x} y={y} fill="#6B7280" fontSize={11} fontWeight={600}
                      textAnchor="middle" dominantBaseline="central"
                    >{`${Math.round((percent ?? 0) * 100)}%`}</text>
                  )}
                  labelLine={false}
                >
                  {trackDist.map((t) => <Cell key={t.name} fill={TRACK_COLOR[t.name]} />)}
                </Pie>
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card size="small" title="评分进度">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {scoreProgress.map((p) => (
                <div key={p.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{p.label}</span><span className="num">{p.n} / {submits.length}</span>
                  </div>
                  <Progress percent={Math.round((p.n / Math.max(1, submits.length)) * 100)} strokeColor={p.color} size="small" />
                </div>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            size="small" title="前 10 名（待抽查清单）"
            extra={<Button size="small" disabled={skillAdminReadOnly} onClick={() => {
              const cardsLine = configurable
                ? `随配置导出 ${enabled?.length ?? 0} 张卡片：${(enabled ?? []).slice(0, 4).join('、')}${(enabled?.length ?? 0) > 4 ? '…' : ''}`
                : 'V3.0 固定分区（前 10 名）';
              log('导出待抽查清单', '前 10 名', `CSV 导出，表头带口径标注；${cardsLine}`);
              message.success(`已导出（统计口径：标签=${tag.name}；${cardsLine}）`);
            }}>导出</Button>}
          >
            <Table
              size="small" rowKey="id" pagination={false} dataSource={top10}
              columns={[
                { title: '#', render: (_, __, i) => <span className="num">{i + 1}</span>, width: 40 },
                { title: '姓名', dataIndex: 'name' },
                { title: '部门', dataIndex: 'dept_name' },
                { title: '作业', dataIndex: 'title', ellipsis: true },
                { title: '最终分', dataIndex: 'final_score', render: (v: number) => <span className="num" style={{ color: COLOR.primary, fontWeight: 600 }}>{v}</span> },
                { title: '真实性确认', render: (_, r) => (r.confirmed
                  ? <Tag color={r.confirmed.result === '真实' ? 'green' : 'red'}>{r.confirmed.result}</Tag>
                  : <Tag color="gold">待确认</Tag>) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="部门明细">
        <Table
          size="small" rowKey="dept" pagination={false} dataSource={deptRank}
          columns={[
            { title: '部门', dataIndex: 'dept' },
            { title: '提交/应参与', render: (_, r) => <span className="num">{r.sub}/{r.total}</span> },
            { title: '提交率', dataIndex: 'rate', render: (v: number) => <Progress percent={v} size="small" strokeColor={COLOR.primary} /> },
            { title: '平均分', dataIndex: 'avg', render: (v: number) => <span className="num">{v}</span> },
            { title: '评价', render: (_, r) => r.rate >= 60 ? <Tag color="green">红榜</Tag> : <Tag color="orange">待改进</Tag> },
          ]}
        />
      </Card>

      {note && (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          数据截止 {DEMO_TODAY}（T-1）· 一期为定时预计算 + 5 分钟缓存；二期切自建库后实时计算，两种实现对外口径一致
        </Typography.Text>
      )}
        </>
      )}
    </Space>
  );
}
