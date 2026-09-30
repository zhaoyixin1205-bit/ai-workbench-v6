import { Alert, Button, Card, DatePicker, Empty, Input, InputNumber, Modal, Space, Table, Tag, Typography, App as AntApp } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, TRACK_COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import type { Bounty } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import dayjs from 'dayjs';
import { useSkillAdminConverge } from '@/auth/converge';
import { ScopeNotice } from '@/components/ScopeNotice';

export default function BountyReview() {
  const { db, me, setDb, log, visibleUsers } = useStore();
  const { message, modal } = AntApp.useApp();
  /** V4.0 CR-09：技能管理员在本页为只读浏览者（§6.2 矩阵 ◐） */
  const readOnly = useSkillAdminConverge().isReadOnly('/admin/bounty');
  const [approving, setApproving] = useState<Bounty | null>(null);
  const [points, setPoints] = useState(200);
  const [due, setDue] = useState<dayjs.Dayjs>(dayjs('2026-10-15'));
  const [rejecting, setRejecting] = useState<Bounty | null>(null);
  const [reason, setReason] = useState('');

  /**
   * V4.0 A-3：悬赏按「发布人 / 认领人」是否落在数据范围内过滤
   * （Bounty 没有 union_id 字段，故不走通用 scopeRows，单独按关联人判定）
   */
  const inScope = (b: Bounty) => {
    if (me.scope_type === 'ALL') return true;
    const ids = new Set(visibleUsers().map((u) => u.union_id));
    return ids.has(b.owner_union_id) || (!!b.claimant_union_id && ids.has(b.claimant_union_id)) || b.owner_union_id === me.union_id;
  };
  const pending = db.bounties.filter((b) => b.status === 'PENDING_REVIEW' && inScope(b));
  const submitted = db.bounties.filter((b) => b.status === 'SUBMITTED' && inScope(b));
  /** U-2 结案：范围提示的可见总数 */
  const visible = db.bounties.filter((b) => inScope(b));

  const approve = () => {
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((b) => (b.id === approving!.id
        ? { ...b, status: 'PUBLISHED', points, due_date: due.format('YYYY-MM-DD') } : b)),
    }));
    log('悬赏审核通过', approving!.title, `积分调整为 ${points}，截止 ${due.format('YYYY-MM-DD')}`);
    message.success('已通过并对外展示');
    setApproving(null);
  };

  const reject = () => {
    if (reason.trim().length < 10) { message.error('驳回理由至少 10 字'); return; }
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((b) => (b.id === rejecting!.id ? { ...b, status: 'REJECTED', reject_reason: reason } : b)),
    }));
    log('悬赏驳回', rejecting!.title, `理由：${reason}`);
    message.success('已驳回，通知发布人（发布人可修改后重提）');
    setRejecting(null); setReason('');
  };

  const approveSolution = (b: Bounty) => {
    modal.confirm({
      title: '方案审核通过？',
      content: `通过后按悬赏积分 ${b.points} 自动入账到 ${b.claimant_name}，来源标记 bounty。`,
      onOk: () => {
        setDb((p) => ({
          ...p,
          bounties: p.bounties.map((x) => (x.id === b.id ? { ...x, status: 'APPROVED' } : x)),
          pointRecords: [{
            id: `PR${Date.now()}`, union_id: b.claimant_union_id!, name: b.claimant_name!,
            source: '悬赏通过', points: b.points, campaign_id: 'C2026Q4',
            remark: `${b.title} 方案审核通过`, created_at: DEMO_TODAY,
          }, ...p.pointRecords],
        }));
        log('悬赏方案通过', b.title, `积分 ${b.points} 入账 ${b.claimant_name}`);
        message.success('已通过，积分已入账');
      },
    });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="悬赏审核" desc="成员发布的悬赏需组织者审核后方可对外展示" />
      <Alert type="warning" showIcon
        message="审核时效默认 2 个工作日，超时自动提醒组织者；超 5 个工作日未处理自动升级通知 ADMIN"
        description="驳回理由必填（≥10 字）且对发布人可见；同一悬赏连续 2 次被驳回后需线下沟通后再发起。成员不可审核自己发布的悬赏。" />

      {/* U-2 结案：范围受限提示（含专家身份说明），四个后台页共用同一套口径 */}
      <ScopeNotice count={visible.length} unit="条悬赏" />

      <Card size="small" title={`成员发起 · 待审核（${pending.length}）`}>
        {pending.length === 0 ? <Empty description="没有待审核的悬赏" /> : (
          <Table
            size="small" rowKey="id" pagination={false} dataSource={pending}
            columns={[
              { title: '标题', dataIndex: 'title' },
              { title: '发布人', dataIndex: 'owner_name', width: 90 },
              { title: '赛道', dataIndex: 'track', render: (v: string) => <Tag color={TRACK_COLOR[v]} style={{ border: 'none' }}>{v}</Tag> },
              { title: '建议积分', dataIndex: 'points', width: 90, render: (v: number) => <span className="num">{v}</span> },
              { title: '痛点', dataIndex: 'pain_point', ellipsis: true },
              {
                title: '操作', width: 150,
                render: (_, r) => (readOnly
                  ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>只读</Typography.Text>
                  : (
                    <Space size={4}>
                      <Button size="small" type="primary" disabled={r.owner_union_id === me.union_id}
                        onClick={() => { setApproving(r); setPoints(r.points); setDue(dayjs(r.due_date)); }}>通过</Button>
                      <Button size="small" danger disabled={r.owner_union_id === me.union_id}
                        onClick={() => setRejecting(r)}>驳回</Button>
                    </Space>
                  )),
              },
            ]}
          />
        )}
      </Card>

      <Card size="small" title={`方案待审核（${submitted.length}）`}>
        {submitted.length === 0 ? <Empty description="暂无待审核方案" /> : (
          <Table
            size="small" rowKey="id" pagination={false} dataSource={submitted}
            columns={[
              { title: '悬赏', dataIndex: 'title' },
              { title: '认领人', dataIndex: 'claimant_name', width: 90 },
              { title: '积分', dataIndex: 'points', width: 70, render: (v: number) => <span className="num">{v}</span> },
              {
                title: '方案', dataIndex: 'solution', ellipsis: true,
                /* V6.0 CR-20：结构化字段优先，旧单文本框数据仍可读 */
                render: (_, r) => r.solution_fields?.scene_desc ?? r.solution ?? '—',
              },
              {
                title: '版本', width: 140,
                /* V6.0 CR-21：让组织者一眼看出「这是改过的第几版 / 有没有补充」 */
                render: (_, r) => {
                  const v = r.solution_versions?.length ?? 0;
                  const s = r.supplements?.length ?? 0;
                  if (v <= 1 && s === 0) return <Typography.Text type="secondary" style={{ fontSize: 12 }}>首版</Typography.Text>;
                  return (
                    <Space size={4}>
                      {v > 1 && <Tag color="orange" style={{ marginInlineEnd: 0 }}>修改 {v - 1} 次</Tag>}
                      {s > 0 && <Tag color="blue" style={{ marginInlineEnd: 0 }}>补充 {s}</Tag>}
                    </Space>
                  );
                },
              },
              {
                title: '操作', width: 140,
                render: (_, r) => (readOnly
                  ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>只读</Typography.Text>
                  : (
                    <Space size={4}>
                      <Button size="small" type="primary" onClick={() => approveSolution(r)}>通过并入账</Button>
                      <Button size="small" danger onClick={() => setRejecting(r)}>驳回</Button>
                    </Space>
                  )),
              },
            ]}
          />
        )}
      </Card>

      <Card size="small" title="已处理记录">
        <Table
          size="small" rowKey="id" pagination={false}
          dataSource={db.bounties.filter((b) => ['REJECTED', 'APPROVED'].includes(b.status) && inScope(b))}
          columns={[
            { title: '标题', dataIndex: 'title' },
            { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'APPROVED' ? 'green' : 'red'}>{v}</Tag> },
            { title: '说明', render: (_, r) => r.reject_reason ? <span style={{ color: '#B91C1C' }}>驳回：{r.reject_reason}</span> : `积分 ${r.points} 已入账` },
          ]}
        />
      </Card>

      <Modal open={!!approving} title={`审核通过 · ${approving?.title}`} onCancel={() => setApproving(null)} onOk={approve} okText="通过并发布">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div>
            <span>积分调整</span>
            <InputNumber min={10} max={500} value={points} onChange={(v) => setPoints(Number(v))} style={{ marginLeft: 8 }} />
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              原建议 {approving?.points}；积分成本计入发布人所在部门积分池
            </Typography.Text>
          </div>
          <div>
            <span>截止时间</span>
            <DatePicker value={due} onChange={(d) => d && setDue(d)} style={{ marginLeft: 8 }} />
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            发布人自动成为关注人，可查看方案提交进度，但不参与评审打分（回避原则）。
          </Typography.Text>
        </Space>
      </Modal>

      <Modal open={!!rejecting} title={`驳回 · ${rejecting?.title}`} onCancel={() => setRejecting(null)} onOk={reject} okText="确认驳回" okButtonProps={{ danger: true }}>
        <Input.TextArea
          rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="驳回理由（≥10 字，对发布人可见）" maxLength={200} showCount
        />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          驳回后成员可修改重提（保留驳回记录，次数上限可配置）。演示日期 {DEMO_TODAY}
        </Typography.Text>
      </Modal>
    </Space>
  );
}
