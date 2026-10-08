import { Alert, Button, Segmented, Table, Tag, App as AntApp } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { BoardCards } from '@/components/BoardCards';
import { ScopeNotice } from '@/components/ScopeNotice';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { COLOR } from '@/theme/v2';
import { useNoteVisible } from '@/auth/annotation';
import '../../theme/v2/template.css';

/**
 * 后台看板 v2（P3-3 样板页 ④：看板模板）
 *
 * 相对 v1 的**纯视觉**变化：
 *   ① 6 个 StatCard（带渐变/阴影）→ `.wb2-metric`（无投影、圆角 12、数字统一 24px）
 *   ② 口径 Alert 保留但去掉默认蓝底，改中性卡 + 左 3px 主色条（口径是必须看见的信息）
 *   ③ 评分进度由 AntD Progress → 6px 细条 + 令牌色（v1 用了 4 个裸 hex）
 *   ④ 图表配色改令牌；部门排行条由渐变改纯色主色（去掉 v1 的 SVG 渐变 defs）
 *
 * 业务：`useDashboardStats` 与 v1 同源，口径（标签分母 / scopeRows）完全一致；
 * BoardCards（V4.0 CR-06 配置驱动）原组件复用，未重写。
 */

const TRACK_FILL = [COLOR.track1, COLOR.track2, COLOR.track3];

/** 部门明细行（`useDashboardStats().deptRank` 的行形状） */
interface DeptRow {
  dept: string;
  rate: number;
  avg: number;
  sub: number;
  total: number;
}

export default function DashboardV2() {
  const s = useDashboardStats();
  /** V8.6-10.08：口径 / 规则注解仅运营方与管理员可见 */
  const note = useNoteVisible();

  const { message } = AntApp.useApp();

  return (
    <div>
      {/* ---------- 口径条 ---------- */}
      <div className="wb2-card" style={{
        borderLeft: `3px solid ${COLOR.primary}`, padding: 'var(--wb-space-4) var(--wb-space-5)',
        marginBottom: 'var(--wb-space-5)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 'var(--wb-space-5)', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 'var(--wb-fs-body)', fontWeight: 500, color: COLOR.ink1 }}>
            当前统计口径：标签 = {s.tag.name}，分母 = {s.scopeUsers.length} 人
          </div>
          <div style={{ fontSize: 'var(--wb-fs-caption)', color: COLOR.ink3, marginTop: 4, lineHeight: 1.6 }}>
            {note && '口径一致性要求：同一份报表分母必须唯一；切换标签时全页口径同步变化，导出文件表头自动带口径标注。'}
          </div>
        </div>
        <Segmented
          value={s.tagCode}
          onChange={(v) => s.setTagCode(String(v))}
          options={s.db.tags.filter((t) => t.status === '启用').map((t) => ({
            label: `${t.name}（${s.users.filter((u) => u.tags.includes(t.id)).length}）`,
            value: t.code,
          }))}
        />
      </div>

      {/* U-2 结案：范围受限提示（含专家身份说明），四个后台页共用同一套口径 */}
      <ScopeNotice count={s.users.length} unit="人" />

      {/* V4.0 CR-06：配置驱动；开关关闭时渲染下方 V3.0 固定分区 */}
      {s.configurable && <BoardCards />}

      {!s.configurable && (
        <div style={{ marginTop: 'var(--wb-space-5)' }}>
          {/* ---------- 指标条 ---------- */}
          <div className="wb2-metrics c6">
            {[
              { t: '应参与人数', v: s.scopeUsers.length, sb: `标签：${s.tag.name}`, accent: true },
              { t: '已激活人数', v: s.inScope(s.activated), sb: `激活率 ${s.pct(s.inScope(s.activated))}%` },
              { t: '已提交人数', v: s.inScope(s.submitted), sb: `提交率 ${s.pct(s.inScope(s.submitted))}%` },
              { t: '有效作业', v: s.stats.validWorks, sb: '≥60 分且抽查通过' },
              { t: '入库资产', v: s.db.assets.length, sb: `复用 ${s.db.assets.reduce((a, b) => a + b.reuse_count, 0)} 次` },
              { t: '坐诊场次', v: s.db.schedules.filter((x) => x.booked > 0).length, sb: `预约 ${s.db.bookings.length} 人次` },
            ].map((m) => (
              <div className="wb2-metric" key={m.t}>
                <div className="lb">{m.t}</div>
                <div className={`vl${m.accent ? ' accent' : ''}`}>{m.v}</div>
                <div className="sb">{m.sb}</div>
              </div>
            ))}
          </div>

          {/* ---------- 图表区 ---------- */}
          <div className="wb2-grid2" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
            <div className="wb2-card wb2-card-pad">
              <div className="wb2-card-t">部门提交率排行（红榜 / 待改进）</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={s.deptRank} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={COLOR.borderSubtle} />
                  <XAxis dataKey="dept" tick={{ fontSize: 11, fill: COLOR.ink3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: COLOR.ink4 }} axisLine={false} tickLine={false} />
                  <RTooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="rate" fill={COLOR.primary} radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="wb2-card wb2-card-pad">
              <div className="wb2-card-t">赛道分布</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                  <Pie
                    data={s.trackDist} dataKey="value" nameKey="name"
                    innerRadius={50} outerRadius={74} paddingAngle={3} stroke="none"
                    label={({ percent, x, y }: { percent?: number; x?: number; y?: number }) => (
                      <text x={x} y={y} fill={COLOR.ink3} fontSize={11} fontWeight={600}
                        textAnchor="middle" dominantBaseline="central">
                        {`${Math.round((percent ?? 0) * 100)}%`}
                      </text>
                    )}
                    labelLine={false}
                  >
                    {s.trackDist.map((t, i) => <Cell key={t.name} fill={TRACK_FILL[i % 3]} />)}
                  </Pie>
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ---------- 评分进度 + 前 10 名 ---------- */}
          <div className="wb2-grid2" style={{ gridTemplateColumns: '1fr 1.4fr', marginTop: 'var(--wb-space-5)' }}>
            <div className="wb2-card wb2-card-pad">
              <div className="wb2-card-t">评分进度</div>
              {s.scoreProgress.map((p) => (
                <div key={p.label} style={{ marginBottom: 'var(--wb-space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--wb-fs-label)', color: COLOR.ink2 }}>
                    <span>{p.label}</span>
                    <span className="num">{p.n} / {s.submits.length}</span>
                  </div>
                  <div className="wb2-prog">
                    <i style={{ width: `${Math.round((p.n / Math.max(1, s.submits.length)) * 100)}%`, background: p.color }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="wb2-card wb2-card-pad">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--wb-space-4)' }}>
                <div className="wb2-card-t" style={{ marginBottom: 0 }}>前 10 名（待抽查清单）</div>
                <Button size="small" disabled={s.skillAdminReadOnly} onClick={() => {
                  const cardsLine = s.configurable
                    ? `随配置导出 ${s.enabled?.length ?? 0} 张卡片：${(s.enabled ?? []).slice(0, 4).join('、')}${(s.enabled?.length ?? 0) > 4 ? '…' : ''}`
                    : 'V3.0 固定分区（前 10 名）';
                  s.log('导出待抽查清单', '前 10 名', `CSV 导出，表头带口径标注；${cardsLine}`);
                  message.success(`已导出（统计口径：标签=${s.tag.name}；${cardsLine}）`);
                }}>导出</Button>
              </div>
              <Table
                size="small" rowKey="id" pagination={false} dataSource={s.top10}
                columns={[
                  { title: '#', render: (_: unknown, __: unknown, i: number) => <span className="num">{i + 1}</span>, width: 40 },
                  { title: '姓名', dataIndex: 'name' },
                  { title: '部门', dataIndex: 'dept_name' },
                  { title: '作业', dataIndex: 'title', ellipsis: true },
                  { title: '最终分', dataIndex: 'final_score', render: (v: number) => <span className="num" style={{ color: COLOR.primary, fontWeight: 600 }}>{v}</span> },
                  {
                    title: '真实性确认',
                    render: (_: unknown, r: { confirmed?: { result: string } }) => (r.confirmed
                      ? <span className={`wb2-tag ${r.confirmed.result === '真实' ? 'ok' : 'er'}`}><i className="d" />{r.confirmed.result}</span>
                      : <span className="wb2-tag wa"><i className="d" />待确认</span>),
                  },
                ]}
              />
            </div>
          </div>

          {/* ---------- 部门明细 ---------- */}
          <div className="wb2-card wb2-card-pad" style={{ marginTop: 'var(--wb-space-5)' }}>
            <div className="wb2-card-t">部门明细</div>
            <Table<DeptRow>
              size="small" rowKey="dept" pagination={false} dataSource={s.deptRank}
              columns={[
                { title: '部门', dataIndex: 'dept' },
                { title: '提交/应参与', render: (_: unknown, r: { sub: number; total: number }) => <span className="num">{r.sub}/{r.total}</span> },
                {
                  title: '提交率', dataIndex: 'rate',
                  render: (v: number) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="wb2-prog" style={{ flex: 1, marginTop: 0 }}>
                        <i style={{ width: `${v}%`, background: COLOR.primary }} />
                      </div>
                      <span className="num" style={{ fontSize: 'var(--wb-fs-label)', color: COLOR.ink2 }}>{v}%</span>
                    </div>
                  ),
                },
                { title: '平均分', dataIndex: 'avg', render: (v: number) => <span className="num">{v}</span> },
                {
                  title: '评价',
                  render: (_: unknown, r: { rate: number }) => (r.rate >= 60
                    ? <span className="wb2-tag ok"><i className="d" />红榜</span>
                    : <span className="wb2-tag wa"><i className="d" />待改进</span>),
                },
              ]}
            />
          </div>

          {note && (
            <div style={{ fontSize: 'var(--wb-fs-caption)', color: COLOR.ink3, marginTop: 'var(--wb-space-4)' }}>
              数据截止 {DEMO_TODAY}（T-1）· 一期为定时预计算 + 5 分钟缓存；二期切自建库后实时计算，两种实现对外口径一致
            </div>
          )}
        </div>
      )}
    </div>
  );
}
