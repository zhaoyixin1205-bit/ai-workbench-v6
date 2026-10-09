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
import { isCompanyBounty } from '@/constants/bounty';
import BountyManage from '@/components/BountyManage';

export default function BountyReview() {
  const { db, me, setDb, log, visibleUsers } = useStore();
  const { message, modal } = AntApp.useApp();
  /** V4.0 CR-09：技能管理员在本页为只读浏览者（§6.2 矩阵 ◐） */
  const readOnly = useSkillAdminConverge().isReadOnly('/admin/bounty');
  const [approving, setApproving] = useState<Bounty | null>(null);
  const [points, setPoints] = useState(200);
  const [due, setDue] = useState<dayjs.Dayjs>(dayjs('2026-10-15'));
  const [rejecting, setRejecting] = useState<Bounty | null>(null);
  /**
   * V8.3-10.09：当前驳回的是「悬赏发布」还是「已提交方案」——
   * 两者语义不同（见 reject() 的注释），决定 status 落到 REJECTED 还是 CLAIMED。
   */
  const [rejectKind, setRejectKind] = useState<'PUBLISH' | 'SOLUTION'>('PUBLISH');
  const [reason, setReason] = useState('');

  /**
   * V4.0 A-3：悬赏按「发布人 / 认领人」是否落在数据范围内过滤
   * （Bounty 没有 union_id 字段，故不走通用 scopeRows，单独按关联人判定）
   */
  const inScope = (b: Bounty) => {
    if (me.scope_type === 'ALL') return true;
    const ids = new Set(visibleUsers().map((u) => u.union_id));
    /** V8-10.07 补：公司虚拟主体发布的悬赏不在 visibleUsers 内，需显式放行，否则后台看不到 */
    return ids.has(b.owner_union_id) || (!!b.claimant_union_id && ids.has(b.claimant_union_id)) || b.owner_union_id === me.union_id || isCompanyBounty(b);
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

  /**
 * 驳回。**两种语义必须分开**（V8.3-10.09 修 P0 死锁）：
 *
 * - `kind='PUBLISH'`：驳回的是「悬赏本身」（发布审核）→ status = REJECTED。
 *   发布人可以「修改后重提」，这是终态，没有后续动作。
 * - `kind='SOLUTION'`：驳回的是「已提交的方案」→ status 回到 **CLAIMED**（口径 1=A）。
 *   认领人必须能重新提交，否则三个入口（提交/修改/补充）会同时关闭 → 永久死锁。
 *
 * 原来两者共用同一个 reject() 置 REJECTED，方案一被驳回就再也无法重提（线上已复现）。
 */
const reject = (kind: 'PUBLISH' | 'SOLUTION') => {
  if (reason.trim().length < 10) { message.error('驳回理由至少 10 字'); return; }
  const nextStatus = kind === 'SOLUTION' ? 'CLAIMED' : 'REJECTED';
  setDb((p) => ({
    ...p,
    bounties: p.bounties.map((b) => (b.id === rejecting!.id
      ? {
          ...b,
          status: nextStatus,
          reject_reason: reason,
          /** 方案驳回时清掉「已提交」痕迹，认领人重新提交会写新的 solution_versions */
          ...(kind === 'SOLUTION' ? { solution: undefined, solution_fields: undefined } : {}),
        }
      : b)),
  }));
  log(kind === 'SOLUTION' ? '方案驳回' : '悬赏驳回', rejecting!.title,
    `理由：${reason}${kind === 'SOLUTION' ? '（已退回认领人，可重新提交方案）' : ''}`);
  message.success(kind === 'SOLUTION'
    ? '已驳回，方案退回认领人，可重新提交'
    : '已驳回，通知发布人（发布人可修改后重提）');
  setRejecting(null); setReason('');
};

  const approveSolution = (b: Bounty) => {
    /**
     * V8.3-10.09 补回避校验（BUG-03）：
     * 发布审核那边有 `disabled={r.owner_union_id === me.union_id}`，方案审核这边却没有 ——
     * 组织者既能发布悬赏又能审方案，等于自己给自己打分。口径：方案审核人=组织者或发布者，
     * 但**发布者不能审自己那条**的方案（若他同时是组织者身份也一样回避）。
     */
    if (b.owner_union_id === me.union_id) {
      message.warning('回避原则：你不能审核自己发布的悬赏方案');
      return;
    }
    modal.confirm({
      title: '方案审核通过？',
      content: `通过后按悬赏积分 ${b.points} 自动入账到 ${b.claimant_name}，来源标记 bounty。`,
      onOk: () => {
        setDb((p) => ({
          ...p,
          bounties: p.bounties.map((x) => (x.id === b.id ? { ...x, status: 'APPROVED' } : x)),
          pointRecords: [{
            id: `PR${Date.now()}`, union_id: b.claimant_union_id!, name: b.claimant_name!,
            /**
             * V8.3-10.09 修BUG-10：原来硬编码 'C2026Q4'，换届次后积分会记到错的活动上。
             * 优先取悬赏所属届次，兜底才用当前届次。
             */
            source: '悬赏通过', points: b.points,
            campaign_id: b.campaign_id || p.campaigns?.[0]?.id || '',
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
                        onClick={() => { setRejectKind('PUBLISH'); setRejecting(r); }}>驳回</Button>
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
                      <Button size="small" danger onClick={() => { setRejectKind('SOLUTION'); setRejecting(r); }}>驳回</Button>
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
            /* V8.3-10.09：驳回理由是用户输入的长文本，列宽固定，需 ellipsis（与本表其它列一致） */
            { title: '说明', ellipsis: true, render: (_, r) => r.reject_reason ? <span style={{ color: '#B91C1C' }}>驳回：{r.reject_reason}</span> : `积分 ${r.points} 已入账` },
          ]}
        />
      </Card>

      {/* V8.2-10.07：悬赏全量台账（含 11 条公司悬赏）—— 改字段 / 审核 / 下架 / 重新上架 */}
      <Card size="small" title="悬赏管理（全量）">
        <BountyManage readOnly={readOnly} />
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

      <Modal open={!!rejecting} title={rejectKind === 'SOLUTION' ? `驳回方案 · ${rejecting?.title}` : `驳回悬赏 · ${rejecting?.title}`} onCancel={() => setRejecting(null)} onOk={() => reject(rejectKind)} okText="确认驳回" okButtonProps={{ danger: true }}>
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
