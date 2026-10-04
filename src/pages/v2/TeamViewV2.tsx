/**
 * 我的团队 v2（P3-4）
 *
 * 功能对等清单（对照 v1 pages/c/TeamView.tsx，逐条保留）：
 *   ①管辖部门并集去重（副职 / 多部门负责人取并集）→ 成员收敛
 *   ②四指标（团队人数 / 已提报 / 未提报 / 平均分）
 *   ③五档进度分布（未提报→已提交→评分与复核中→已复核→已完成），止于「已完成」
 *   ④人员清单表格（姓名 / 状态 / 最近提报 / 得分 / 操作）
 *   ⑤一键催办（仅未提报成员，写 messages + log）
 *   ⑥空态（无管辖成员时不渲染统计与表格）
 *
 * 🚨 硬约束（U-6 拍板，v1 注释原文照抄）：
 *   本页**不展示**「已公示 / 已共识 / 入库」三类环节 —— 这些是组织者的运营后动作，
 *   不是团队进度的一部分。五档进度止于「已完成」，页面内不读取 is_published / ASSET_* 任何字段。
 *
 * 刻意没改：tierOf 五档归集映射、latestSubmit 口径（草稿与撤回不算）、催办文案与 channel。
 */
import { Button, Table, App as AntApp } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useMemo } from 'react';
import { useStore } from '@/store/store';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { AssignmentSubmit, SubmitStatus, User } from '@/mock/types';
import '../../theme/v2/template.css';

type Tier = '未提报' | '已提交' | '评分与复核中' | '已复核' | '已完成';

const TIER_ORDER: Tier[] = ['未提报', '已提交', '评分与复核中', '已复核', '已完成'];

/** v2：不再用 antd Tag 的 color，改为语义色类（无投影、低饱和） */
const TIER_CLASS: Record<Tier, string> = {
  未提报: '',
  已提交: 't-blue',
  评分与复核中: 't-cyan',
  已复核: 't-purple',
  已完成: 't-green',
};

function tierOf(status?: SubmitStatus): Tier {
  switch (status) {
    case undefined:
      return '未提报';
    case 'DRAFT':
    case 'WITHDRAWN':
      return '未提报';
    case 'SUBMITTED':
    case 'SCORING_AI':
    case 'SCORE_FAILED':
      return '已提交';
    case 'AI_SCORED':
    case 'REVIEWING':
      return '评分与复核中';
    case 'REVIEWED':
    case 'SPOT_CHECK':
    case 'PASSED':
    case 'REJECTED':
      return '已复核';
    default:
      return '已完成';
  }
}

function latestSubmit(list: AssignmentSubmit[], uid: string): AssignmentSubmit | undefined {
  return list
    .filter((s) => s.union_id === uid && s.status !== 'DRAFT' && s.status !== 'WITHDRAWN')
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0];
}

export default function TeamViewV2() {
  const { db, me, setDb, log } = useStore();
  const { message } = AntApp.useApp();

  const managed = useMemo(() => {
    const ids = me.managed_dept_ids?.length ? me.managed_dept_ids : me.dept_id_list;
    return new Set(ids);
  }, [me.managed_dept_ids, me.dept_id_list]);

  const members = useMemo(
    () => db.users.filter((u) => u.union_id !== me.union_id && u.dept_id_list.some((d) => managed.has(d))),
    [db.users, managed, me.union_id]
  );

  const rows = useMemo(
    () => members.map((u: User) => {
      const s = latestSubmit(db.submits, u.union_id);
      return { user: u, submit: s, tier: tierOf(s?.status) };
    }),
    [members, db.submits]
  );

  const submitted = rows.filter((r) => r.tier !== '未提报');
  const pending = rows.filter((r) => r.tier === '未提报');
  const scored = rows.filter((r) => r.submit?.final_score !== undefined);
  const avgScore = scored.length
    ? Math.round((scored.reduce((a, b) => a + (b.submit?.final_score ?? 0), 0) / scored.length) * 10) / 10
    : 0;

  const dist = TIER_ORDER.map((t) => ({ tier: t, count: rows.filter((r) => r.tier === t).length }));

  const nudge = (uids: string[]) => {
    if (uids.length === 0) { message.info('全部成员都已提报，无需催办'); return; }
    const now = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    setDb((p) => ({
      ...p,
      messages: [
        ...uids.map((uid, i) => ({
          id: `MSG-NUDGE-${Date.now()}-${i}`,
          union_id: uid,
          type: '催办提醒',
          title: '作业提报催办',
          content: `${me.name} 提醒你：本期作业尚未提报，请在截止前完成提交。`,
          channel: '钉钉待办' as const,
          status: '未读' as const,
          sent_at: now,
        })),
        ...p.messages,
      ],
    }));
    log('一键催办', `${uids.length} 人`, `钉钉待办：${me.name} 对未提报成员发送提报提醒`);
    message.success(`已向 ${uids.length} 位未提报成员发送钉钉待办`);
  };

  /* ⑥ 空态：无管辖成员 —— Hooks 之后早退 */
  if (members.length === 0) {
    return (
      <div>
        <div className="wb2-ph">
          <div>
            <div className="wb2-ph-t">我的团队</div>
            <div className="wb2-ph-d">本团队提报进度（按管辖部门收敛）</div>
          </div>
        </div>
        <div className="wb2-empty">
          <div className="t">当前身份没有管辖的团队成员</div>
          <div className="d">若你认为这是误判，请联系组织者核对部门负责人属性</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">我的团队</div>
          <div className="wb2-ph-d">
            本团队提报进度 · {me.dept_names[0]}
            {me.managed_dept_ids && me.managed_dept_ids.length > 1 ? ` 等 ${me.managed_dept_ids.length} 个部门` : ''}
          </div>
        </div>
        <div className="wb2-ph-a">
          <Button type="primary" icon={<BellOutlined />} disabled={pending.length === 0}
            onClick={() => nudge(pending.map((r) => r.user.union_id))}>
            一键催办（{pending.length}）
          </Button>
        </div>
      </div>

      {/* ② 四指标 */}
      <div className="wb2-metrics">
        <div className="wb2-metric">
          <div className="lb">团队人数</div>
          <div className="vl">{members.length}</div>
        </div>
        <div className="wb2-metric">
          <div className="lb">已提报</div>
          <div className="vl">{submitted.length}</div>
        </div>
        <div className="wb2-metric">
          <div className="lb">未提报</div>
          <div className="vl">{pending.length}</div>
        </div>
        <div className="wb2-metric">
          <div className="lb">平均分</div>
          <div className="vl">{avgScore || '—'}</div>
        </div>
      </div>

      {/* ③ 五档进度分布 */}
      <div className="wb2-card" style={{ marginTop: 'var(--wb-space-4)' }}>
        <div className="wb2-card-pad">
          <div className="wb2-card-t">进度分布</div>
          {dist.map((d) => {
            const pct = members.length ? Math.round((d.count / members.length) * 100) : 0;
            return (
              <div className="wb2-dist" key={d.tier}>
                <span className={`wb2-tag ${TIER_CLASS[d.tier]}`} style={{ flex: '0 0 92px', justifyContent: 'center' }}>{d.tier}</span>
                <span className="bar">
                  <span className="wb2-prog"><i style={{ width: `${pct}%` }} /></span>
                </span>
                <span className="vv">{d.count} 人</span>
              </div>
            );
          })}
          <div className="wb2-note" style={{ marginTop: 'var(--wb-space-3)' }}>
            口径：进度止于「已完成」；公示、共识与入库属于组织者的运营后动作，不在本页展示。
          </div>
        </div>
      </div>

      {/* ④ 人员清单 */}
      <div className="wb2-card" style={{ marginTop: 'var(--wb-space-4)' }}>
        <div className="wb2-card-pad">
          <div className="wb2-card-t">人员清单（{rows.length}）</div>
          <Table
            size="small" rowKey={(r) => r.user.union_id} pagination={{ pageSize: 10 }} dataSource={rows}
            columns={[
              { title: '姓名', dataIndex: ['user', 'name'], width: 120 },
              {
                title: '状态', dataIndex: 'tier', width: 110,
                render: (t: Tier) => <span className={`wb2-tag ${TIER_CLASS[t]}`}>{t}</span>,
              },
              {
                title: '最近提报', width: 180,
                render: (_, r) => (r.submit
                  ? <span style={{ fontSize: 'var(--wb-fs-label)' }}>{r.submit.submitted_at}</span>
                  : <span style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-3)' }}>尚未提报</span>),
              },
              { title: '得分', width: 90, render: (_, r) => r.submit?.final_score ?? '—' },
              {
                title: '操作', width: 90,
                render: (_, r) => (r.tier === '未提报'
                  ? <Button size="small" type="link" onClick={() => nudge([r.user.union_id])}>催办</Button>
                  : <span style={{ color: 'var(--wb-ink-4)' }}>—</span>),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
