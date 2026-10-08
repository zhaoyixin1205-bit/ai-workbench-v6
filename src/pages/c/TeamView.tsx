import { Button, Card, Col, Empty, Progress, Row, Space, Table, Tag, Typography, App as AntApp } from 'antd';
import { useNoteVisible } from '@/auth/annotation';
import { BellOutlined, TeamOutlined } from '@ant-design/icons';
import { useMemo } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { AssignmentSubmit, SubmitStatus, User } from '@/mock/types';

/**
 * V6.0 CR-30：负责人团队视图（U-4 结案）
 *
 * 权限：仅 is_dept_leader 可见（属性型守卫，由 /team 的 requireDeptLeader 控制）。
 *
 * 硬约束（U-6 拍板的落点）：
 * 本页**不展示**「已公示 / 已共识 / 入库」三类环节 —— 这些是组织者的运营后动作，
 * 不是团队进度的一部分。五档进度止于「已完成」，页面内不读取 is_published / ASSET_* 任何字段。
 */
type Tier = '未提报' | '已提交' | '评分与复核中' | '已复核' | '已完成';

const TIER_ORDER: Tier[] = ['未提报', '已提交', '评分与复核中', '已复核', '已完成'];

const TIER_COLOR: Record<Tier, string> = {
  未提报: 'default',
  已提交: 'blue',
  评分与复核中: 'cyan',
  已复核: 'purple',
  已完成: 'green',
};

/** 五档归集：状态机 V2 的 COMPLETED / CONSENSUS 统一计入「已完成」，不再细分 */
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
      /** COMPLETED / CONSENSUS / PUBLISHED 及后续运营态，一律止于「已完成」 */
      return '已完成';
  }
}

/** 取某人最近一次有效提报（草稿与撤回不算） */
function latestSubmit(list: AssignmentSubmit[], uid: string): AssignmentSubmit | undefined {
  return list
    .filter((s) => s.union_id === uid && s.status !== 'DRAFT' && s.status !== 'WITHDRAWN')
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0];
}

export default function TeamView() {
  const { db, me, setDb, log } = useStore();
  /** V8.6-10.08：口径 / 规则注解仅运营方与管理员可见 */
  const note = useNoteVisible();

  const { message } = AntApp.useApp();

  /** 管辖部门并集去重（副职 / 多部门负责人取并集） */
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

  /** 催办：沿用 M10 触达点（钉钉待办），仅对未提报成员发送 */
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

  if (members.length === 0) {
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <PageHeader title="我的团队" desc="本团队提报进度（按管辖部门收敛）" />
        <Card>
          <Empty description="当前身份没有管辖的团队成员" />
        </Card>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }} className="wb-fade-in">
      <PageHeader
        title="我的团队"
        desc={`本团队提报进度 · ${me.dept_names[0]}${me.managed_dept_ids && me.managed_dept_ids.length > 1 ? ` 等 ${me.managed_dept_ids.length} 个部门` : ''}`}
        extra={
          <Button
            type="primary" icon={<BellOutlined />}
            disabled={pending.length === 0}
            onClick={() => nudge(pending.map((r) => r.user.union_id))}
          >
            一键催办（{pending.length}）
          </Button>
        }
      />

      {/* 团队概览 */}
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}><StatCard label="团队人数" value={members.length} /></Col>
        <Col xs={12} sm={6}><StatCard label="已提报" value={submitted.length} /></Col>
        <Col xs={12} sm={6}><StatCard label="未提报" value={pending.length} /></Col>
        <Col xs={12} sm={6}><StatCard label="平均分" value={avgScore || '—'} /></Col>
      </Row>

      {/* 进度分布：五档，止于「已完成」 */}
      <Card size="small" title="进度分布">
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {dist.map((d) => {
            const pct = members.length ? Math.round((d.count / members.length) * 100) : 0;
            return (
              <div key={d.tier} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tag color={TIER_COLOR[d.tier]} style={{ marginInlineEnd: 0, minWidth: 64, textAlign: 'center' }}>{d.tier}</Tag>
                <Progress
                  percent={pct} size="small" style={{ flex: 1, marginBottom: 0 }}
                  strokeColor={d.tier === '已完成' ? '#16A34A' : COLOR.primary}
                />
                <span className="num" style={{ fontSize: 12, color: COLOR.textSub, minWidth: 44, textAlign: 'right' }}>
                  {d.count} 人
                </span>
              </div>
            );
          })}
        </Space>
        {note && (
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 10 }}>
            口径：进度止于「已完成」；公示、共识与入库属于组织者的运营后动作，不在本页展示。
          </Typography.Text>
        )}
      </Card>

      {/* 人员清单：只显示姓名，不带岗位与职级 */}
      <Card size="small" title={`人员清单（${rows.length}）`}>
        <Table
          size="small" rowKey={(r) => r.user.union_id} pagination={{ pageSize: 10 }} dataSource={rows}
          columns={[
            { title: '姓名', dataIndex: ['user', 'name'], width: 120 },
            {
              title: '状态', dataIndex: 'tier', width: 110,
              render: (t: Tier) => <Tag color={TIER_COLOR[t]} style={{ marginInlineEnd: 0 }}>{t}</Tag>,
            },
            {
              title: '最近提报', width: 180,
              render: (_, r) => (r.submit
                ? <span className="num" style={{ fontSize: 12 }}>{r.submit.submitted_at}</span>
                : <Typography.Text type="secondary" style={{ fontSize: 12 }}>尚未提报</Typography.Text>),
            },
            {
              title: '得分', width: 90,
              render: (_, r) => <span className="num">{r.submit?.final_score ?? '—'}</span>,
            },
            {
              title: '操作', width: 90,
              render: (_, r) => (r.tier === '未提报'
                ? <Button size="small" type="link" onClick={() => nudge([r.user.union_id])}>催办</Button>
                : <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
