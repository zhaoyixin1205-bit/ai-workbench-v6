import { Alert, Button, Card, Col, Progress, Row, Select, Space, Table, Tag, Typography, App as AntApp } from 'antd';
import { TeamOutlined, BellOutlined, DownloadOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';

/**
 * V4.0 CR-01：「我的团队」板块（属性驱动，不是可切换身份）
 *
 * 渲染条件（三条全满足才渲染，否则完全不渲染 —— 不是置灰、不是空态）：
 *   ① flags.homeTeamBoard = true
 *   ② hasTeam = true（is_dept_leader / 有下级 / 有管辖部门）
 *   ③ 管辖部门内至少有 1 名其他在册成员
 */

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

export default function TeamBoard({ compact = false }: { compact?: boolean }) {
  const { db, me, hasTeam, managedDeptIds, flags, log } = useStore();
  const { message } = AntApp.useApp();
  const [deptId, setDeptId] = useState<string>('');

  useEffect(() => {
    if (!deptId && managedDeptIds.length > 0) setDeptId(managedDeptIds[0]);
  }, [managedDeptIds, deptId]);

  const dept = db.depts.find((d) => d.dept_id === deptId);

  /** 管辖范围内全部在册成员（不含本人） */
  const members = useMemo(() => {
    if (!deptId) return [];
    return db.users.filter((u) =>
      u.union_id !== me.union_id && u.status !== 99 &&
      u.dept_id_list.some((d) => d === deptId || d.startsWith(deptId))
    );
  }, [db.users, deptId, me.union_id]);

  const doneIds = useMemo(() => new Set(
    db.submits.filter((s) => s.status !== 'DRAFT' && s.status !== 'WITHDRAWN').map((s) => s.union_id)
  ), [db.submits]);

  const undone = useMemo(() => members.filter((u) => !doneIds.has(u.union_id)), [members, doneIds]);
  const rate = members.length ? Math.round(((members.length - undone.length) / members.length) * 100) : 0;

  // 三条渲染条件（hooks 全部调用完后再判断，保证 hook 顺序稳定）
  if (!flags.homeTeamBoard || !hasTeam || managedDeptIds.length === 0 || members.length === 0) return null;

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['姓名', '部门', '是否已提报', '最新状态', '积分'],
      ...members.map((u) => [
        u.name, u.dept_names[0] ?? '', doneIds.has(u.union_id) ? '已提报' : '未提报',
        db.submits.find((s) => s.union_id === u.union_id)?.status ?? '—', u.points,
      ]),
    ];
    const blob = new Blob([`\uFEFF${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `团队进度_${dept?.name ?? deptId}_${DEMO_TODAY}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    log('导出团队进度', dept?.name ?? deptId, `${members.length} 人 · CSV`);
    message.success(`已导出 ${members.length} 人明细（含口径说明）`);
  };

  const urge = () => {
    if (undone.length === 0) { message.info('本部门已全部提报，无需催办'); return; }
    log('催办未提报', `${dept?.name ?? deptId} · ${undone.length} 人`, '钉钉待办 + 群通知');
    message.success(`已向 ${undone.length} 人发送催办（钉钉待办 + 群通知）`);
  };

  return (
    <Card
      styles={{ body: { padding: compact ? 16 : 20 } }}
      title={
        <Space size={8}>
          <TeamOutlined style={{ color: COLOR.primary }} />
          <span style={{ fontWeight: 700 }}>我的团队</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: COLOR.textMuted }}>
            CR-01：带团队是属性，不是身份，无需切换
          </span>
        </Space>
      }
      extra={
        <Space size={8} wrap>
          {managedDeptIds.length > 1 && (
            <Select
              size="small" value={deptId} onChange={setDeptId} style={{ width: 200 }}
              options={managedDeptIds.map((id) => ({
                value: id, label: db.depts.find((d) => d.dept_id === id)?.path ?? id,
              }))}
            />
          )}
          <Button size="small" icon={<BellOutlined />} onClick={urge}>催办（{undone.length}）</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={exportCsv}>导出</Button>
          {/* V6.0 CR-30：权限收窄后的替代入口 —— 负责人看团队进度走这里，不进后台 */}
          {flags.teamView !== false && (
            <Link to="/team">
              <Button size="small" type="primary">团队视图 <ArrowRightOutlined /></Button>
            </Link>
          )}
        </Space>
      }
    >
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}>
          <StatCard label="部门人数" value={members.length} sub={dept?.name ?? deptId} tone="blue" />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard label="已提报" value={members.length - undone.length} sub={`未提报 ${undone.length} 人`} tone="green" />
        </Col>
        <Col xs={24} sm={12}>
          <div className="wb-card" style={{ padding: 16, height: '100%' }}>
            <div style={{ fontSize: 13, color: COLOR.textSub, fontWeight: 500, marginBottom: 8 }}>
              本部门进度
            </div>
            <Progress percent={rate} strokeColor={COLOR.primary} />
            <div style={{ fontSize: 11, color: COLOR.textMuted, marginTop: 6 }}>
              口径：已提报人数 ÷ 部门在册人数（不含本人，不含停用账号）
            </div>
          </div>
        </Col>
      </Row>

      <div style={{ marginTop: 14 }}>
        <Space size={8} style={{ marginBottom: 8 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>未提报名单（{undone.length}）</Typography.Text>
          {undone.length === 0 && <Tag color="green">全部完成 🎉</Tag>}
        </Space>
        {undone.length > 0 && (
          <Table
            size="small" rowKey="union_id" pagination={false} dataSource={undone}
            scroll={{ y: 220 }}
            columns={[
              { title: '姓名', dataIndex: 'name', width: 90 },
              { title: '部门', dataIndex: 'dept_names', render: (v: string[]) => v[0], ellipsis: true },
              { title: '人群标签', dataIndex: 'tags', width: 120, render: (v: string[]) => (
                <Space size={4} wrap>{v.map((t) => <Tag key={t} style={{ marginInlineEnd: 0 }}>{db.tags.find((x) => x.id === t)?.name ?? t}</Tag>)}</Space>
              ) },
              { title: '积分', dataIndex: 'points', width: 80, render: (v: number) => <span className="num">{v}</span> },
            ]}
          />
        )}
      </div>

      <Alert
        style={{ marginTop: 12 }} type="info" showIcon
        message={<span style={{ fontSize: 12 }}>
          导出口径：姓名 / 部门 / 是否已提报 / 最新状态 / 积分；仅含 {dept?.name ?? deptId} 在册人员，不含本人与停用账号。数据截止 {DEMO_TODAY}（T-1）。
        </span>}
      />
    </Card>
  );
}
