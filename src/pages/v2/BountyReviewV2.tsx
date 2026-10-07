import { Button, DatePicker, Input, InputNumber, Table, Typography, App as AntApp } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme/v2';
import { trackVar } from '@/theme/v2/track';
import type { Bounty } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import dayjs from 'dayjs';
import { useSkillAdminConverge } from '@/auth/converge';
import { ScopeNotice } from '@/components/ScopeNotice';
import { Dialog, DialogField, useConfirm } from '@/components/v2/Dialog';
import { isCompanyBounty } from '@/constants/bounty';
import '../../theme/v2/template.css';

/**
 * 悬赏审核 v2（P3-5 后台域）
 *
 * 相对 v1 的纯视觉变化：
 *   ① 顶部 Alert（warning 整块黄底）→ `.wb2-alert warn`（中性底 + 左 3px 橙条）
 *   ② 三张 `Card size="small"` → 三张 `.wb2-tcard`（头含标题 + 计数，表体统一内边距）
 *   ③ 空态用 `.wb2-empty`（v1 直接塞 AntD Empty，与卡片边框叠在一起）
 *   ④ 赛道 Tag `color={TRACK_COLOR[v]}` → `.wb2-tag` + 圆点取赛道令牌色
 *   ⑤ 两个 Modal 与 approveSolution 的 modal.confirm → `Dialog` / `useConfirm()`
 *      （驳回属危险操作：主按钮 danger + 禁点遮罩 + 默认聚焦取消）
 *   ⑥ 裸 `#B91C1C` → 令牌 `var(--wb-error)`
 *
 * 业务：inScope 范围过滤、积分调整、驳回理由 ≥10 字校验、方案通过自动入账——
 * 逐行沿用 v1，未改任何判定与写入字段。
 */

export default function BountyReviewV2() {
  const { db, me, setDb, log, visibleUsers } = useStore();
  const { message } = AntApp.useApp();
  const confirm = useConfirm();
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
    confirm({
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
    <div>
      <div className="wb2-ph">
        <div>
          <h2 className="wb2-ph-t">悬赏审核</h2>
          <div className="wb2-ph-d">成员发布的悬赏需组织者审核后方可对外展示</div>
        </div>
      </div>

      <div className="wb2-alert warn">
        <div className="bd">
          <div className="t">审核时效默认 2 个工作日，超时自动提醒组织者；超 5 个工作日未处理自动升级通知 ADMIN</div>
          <div className="d">
            驳回理由必填（≥10 字）且对发布人可见；同一悬赏连续 2 次被驳回后需线下沟通后再发起。成员不可审核自己发布的悬赏。
          </div>
        </div>
      </div>

      {/* U-2 结案：范围受限提示（含专家身份说明），四个后台页共用同一套口径 */}
      <ScopeNotice count={visible.length} unit="条悬赏" />

      {/* ---------- 成员发起 · 待审核 ---------- */}
      <div className="wb2-tcard">
        <div className="hd">
          <span className="t">成员发起 · 待审核<span className="n">{pending.length}</span></span>
        </div>
        <div className="bd">
          {pending.length === 0 ? (
            <div className="wb2-empty">
              <div className="ic">◇</div>
              <div className="t">没有待审核的悬赏</div>
            </div>
          ) : (
            <Table
              size="small" rowKey="id" pagination={false} dataSource={pending}
              columns={[
                { title: '标题', dataIndex: 'title' },
                { title: '发布人', dataIndex: 'owner_name', width: 90 },
                {
                  title: '赛道', dataIndex: 'track',
                  render: (v: string) => <span className="wb2-tag"><i className="d" style={{ background: trackVar(v) }} />{v}</span>,
                },
                { title: '建议积分', dataIndex: 'points', width: 90, render: (v: number) => <span className="num">{v}</span> },
                { title: '痛点', dataIndex: 'pain_point', ellipsis: true },
                {
                  title: '操作', width: 150,
                  render: (_, r) => (readOnly
                    ? <span className="wb2-tag id"><i className="d" />只读</span>
                    : (
                      <div style={{ display: 'flex', gap: 'var(--wb-space-2)' }}>
                        <Button size="small" type="primary" disabled={r.owner_union_id === me.union_id}
                          onClick={() => { setApproving(r); setPoints(r.points); setDue(dayjs(r.due_date)); }}>通过</Button>
                        <Button size="small" danger disabled={r.owner_union_id === me.union_id}
                          onClick={() => setRejecting(r)}>驳回</Button>
                      </div>
                    )),
                },
              ]}
            />
          )}
        </div>
      </div>

      {/* ---------- 方案待审核 ---------- */}
      <div className="wb2-tcard">
        <div className="hd">
          <span className="t">方案待审核<span className="n">{submitted.length}</span></span>
        </div>
        <div className="bd">
          {submitted.length === 0 ? (
            <div className="wb2-empty">
              <div className="ic">◇</div>
              <div className="t">暂无待审核方案</div>
            </div>
          ) : (
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
                  title: '版本', width: 150,
                  /* V6.0 CR-21：让组织者一眼看出「这是改过的第几版 / 有没有补充」 */
                  render: (_, r) => {
                    const v = r.solution_versions?.length ?? 0;
                    const s = r.supplements?.length ?? 0;
                    if (v <= 1 && s === 0) return <Typography.Text type="secondary" style={{ fontSize: 12 }}>首版</Typography.Text>;
                    return (
                      <div style={{ display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap' }}>
                        {v > 1 && <span className="wb2-tag wa"><i className="d" />修改 {v - 1} 次</span>}
                        {s > 0 && <span className="wb2-tag run"><i className="d" />补充 {s}</span>}
                      </div>
                    );
                  },
                },
                {
                  title: '操作', width: 150,
                  render: (_, r) => (readOnly
                    ? <span className="wb2-tag id"><i className="d" />只读</span>
                    : (
                      <div style={{ display: 'flex', gap: 'var(--wb-space-2)' }}>
                        <Button size="small" type="primary" onClick={() => approveSolution(r)}>通过并入账</Button>
                        <Button size="small" danger onClick={() => setRejecting(r)}>驳回</Button>
                      </div>
                    )),
                },
              ]}
            />
          )}
        </div>
      </div>

      {/* ---------- 已处理记录 ---------- */}
      <div className="wb2-tcard">
        <div className="hd"><span className="t">已处理记录</span></div>
        <div className="bd">
          <Table
            size="small" rowKey="id" pagination={false}
            dataSource={db.bounties.filter((b) => ['REJECTED', 'APPROVED'].includes(b.status) && inScope(b))}
            columns={[
              { title: '标题', dataIndex: 'title' },
              {
                title: '状态', dataIndex: 'status',
                render: (v: string) => <span className={`wb2-tag ${v === 'APPROVED' ? 'ok' : 'er'}`}><i className="d" />{v}</span>,
              },
              {
                title: '说明',
                render: (_, r) => r.reject_reason
                  ? <span style={{ color: COLOR.error }}>驳回：{r.reject_reason}</span>
                  : `积分 ${r.points} 已入账`,
              },
            ]}
          />
        </div>
      </div>

      {/* ---------- 通过弹窗（统一操作层） ---------- */}
      <Dialog
        open={!!approving} title={`审核通过 · ${approving?.title}`}
        sub="通过后悬赏立即对外展示，发布人自动成为关注人但不参与评审打分（回避原则）。"
        okText="通过并发布"
        onCancel={() => setApproving(null)}
        onOk={approve}
      >
        <DialogField label="积分调整" hint={`原建议 ${approving?.points ?? '—'}；积分成本计入发布人所在部门积分池`}>
          <InputNumber min={10} max={500} value={points} onChange={(v) => setPoints(Number(v))} />
        </DialogField>
        <DialogField label="截止时间">
          <DatePicker value={due} onChange={(d) => d && setDue(d)} />
        </DialogField>
      </Dialog>

      {/* ---------- 驳回弹窗（危险操作：danger + 默认聚焦取消） ---------- */}
      <Dialog
        open={!!rejecting} title={`驳回 · ${rejecting?.title}`}
        sub="驳回后成员可修改重提（保留驳回记录，次数上限可配置）。"
        okText="确认驳回" danger okDisabled={reason.trim().length < 10}
        onCancel={() => setRejecting(null)}
        onOk={reject}
      >
        <DialogField label="驳回理由（≥10 字，对发布人可见）" hint={`演示日期 ${DEMO_TODAY}`}>
          <Input.TextArea
            rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="驳回理由（≥10 字，对发布人可见）" maxLength={200} showCount
          />
        </DialogField>
        {reason.trim().length > 0 && reason.trim().length < 10 && (
          <div className="hint warn">还差 {10 - reason.trim().length} 字才可提交驳回。</div>
        )}
      </Dialog>
    </div>
  );
}
