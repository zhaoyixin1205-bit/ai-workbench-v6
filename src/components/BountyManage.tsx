import { Button, DatePicker, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography, App as AntApp } from 'antd';
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useStore } from '@/store/store';
import type { Bounty, BountyStatus, Track } from '@/mock/types';
import { TRACKS } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { BOUNTY_STATUS_META } from '@/hooks/useBountyBoard';
import { COMPANY_OWNER_NAME, COMPANY_UNION_ID, isCompanyBounty } from '@/constants/bounty';

/**
 * V8.2-10.07：悬赏全量管理（v1 / v2 共用）
 * ------------------------------------------------------------------
 * 需求原文：11 个公司悬赏也同步至管理后台，未来可以用于管理、审核、通过、下架、
 * 修改悬赏信息（悬赏发起人、悬赏积分、悬赏内容等所有字段）等不同操作。
 *
 * 与「悬赏审核」页的分工：
 *   审核页  = 流程（待审 / 方案待审 / 已处理记录）
 *   本组件  = 台账（全部悬赏，含 11 条公司悬赏），支持改字段 + 改状态 + 下架/上架/删除
 *
 * 落库：db.bounties；编辑/下架/上架写 updated_at / updated_by / offline_at 留痕 + 审计日志。
 */
export default function BountyManage({ readOnly, variant = 'card' }: { readOnly: boolean; variant?: 'card' | 'tcard' }) {
  const { db, me, setDb, log, visibleUsers } = useStore();
  const { message, modal } = AntApp.useApp();

  const [kw, setKw] = useState('');
  const [fStatus, setFStatus] = useState<BountyStatus | 'ALL'>('ALL');
  const [fTrack, setFTrack] = useState<Track | 'ALL'>('ALL');
  const [fSource, setFSource] = useState<'ALL' | 'COMPANY' | 'MEMBER'>('ALL');
  const [editing, setEditing] = useState<Bounty | null>(null);
  const [form, setForm] = useState<Bounty | null>(null);

  /** 与审核页同口径的范围过滤（公司虚拟主体显式放行） */
  const inScope = (b: Bounty) => {
    if (me.scope_type === 'ALL') return true;
    const ids = new Set(visibleUsers().map((u) => u.union_id));
    return ids.has(b.owner_union_id)
      || (!!b.claimant_union_id && ids.has(b.claimant_union_id))
      || b.owner_union_id === me.union_id
      || isCompanyBounty(b);
  };

  const rows = useMemo(() => db.bounties.filter((b) => {
    if (!inScope(b)) return false;
    if (fStatus !== 'ALL' && b.status !== fStatus) return false;
    if (fTrack !== 'ALL' && b.track !== fTrack) return false;
    if (fSource === 'COMPANY' && !isCompanyBounty(b)) return false;
    if (fSource === 'MEMBER' && isCompanyBounty(b)) return false;
    if (kw.trim()) {
      const k = kw.trim();
      if (!(`${b.title}${b.pain_point}${b.owner_name}${b.claimant_name ?? ''}`.includes(k))) return false;
    }
    return true;
  }), [db.bounties, fStatus, fTrack, fSource, kw, me.union_id, me.scope_type]);

  const stat = useMemo(() => {
    const all = db.bounties.filter(inScope);
    return {
      total: all.length,
      company: all.filter(isCompanyBounty).length,
      open: all.filter((b) => b.status === 'PUBLISHED').length,
      offline: all.filter((b) => b.status === 'OFFLINE').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.bounties, me.union_id, me.scope_type]);

  const now = () => `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;

  const patch = (b: Bounty, changes: Partial<Bounty>, action: string, detail: string) => {
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) => (x.id === b.id
        ? { ...x, ...changes, updated_at: now(), updated_by: me.name } : x)),
    }));
    log(action, b.title, detail);
  };

  /** 审核通过（草稿 / 待审 / 已驳回 → 可认领） */
  const publish = (b: Bounty) => {
    modal.confirm({
      title: `通过并发布「${b.title}」？`,
      content: `通过后立即对外展示，成员即可认领（当前积分 ${b.points}，截止 ${b.due_date}）。`,
      okText: '通过并发布',
      onOk: () => {
        patch(b, { status: 'PUBLISHED', reject_reason: undefined }, '悬赏审核通过', `积分 ${b.points}，截止 ${b.due_date}（操作人 ${me.name}）`);
        message.success('已通过并对外展示');
      },
    });
  };

  /** 下架：大厅不再展示，后台仍可管理 / 重新上架 */
  const offline = (b: Bounty) => {
    modal.confirm({
      title: `下架「${b.title}」？`,
      content: b.claimant_name
        ? `该悬赏已被 ${b.claimant_name} 认领，下架后大厅不再展示，但已认领记录保留（可在「方案待审核」继续跟进）。`
        : '下架后悬赏大厅不再展示，成员不可再认领；后台可随时重新上架。',
      okText: '确认下架', okButtonProps: { danger: true },
      onOk: () => {
        patch(b, { status: 'OFFLINE', offline_at: now() }, '悬赏下架', `原状态 ${BOUNTY_STATUS_META[b.status]?.text ?? b.status}；操作人 ${me.name}`);
        message.success('已下架，悬赏大厅不再展示');
      },
    });
  };

  /** 重新上架（已下架 / 已超期释放 → 可认领） */
  const republish = (b: Bounty) => {
    patch(b, { status: 'PUBLISHED', offline_at: undefined }, '悬赏重新上架', `恢复对外展示并可认领（操作人 ${me.name}）`);
    message.success('已重新上架，成员可认领');
  };

  const remove = (b: Bounty) => {
    modal.confirm({
      title: `删除「${b.title}」？`,
      content: '删除后不可恢复；若只是暂时不想展示，建议改用「下架」。',
      okText: '确认删除', okButtonProps: { danger: true },
      onOk: () => {
        setDb((p) => ({ ...p, bounties: p.bounties.filter((x) => x.id !== b.id) }));
        log('悬赏删除', b.title, `${b.status} · 积分 ${b.points}（操作人 ${me.name}）`);
        message.success('已删除');
      },
    });
  };

  const openEdit = (b: Bounty) => { setEditing(b); setForm({ ...b }); };
  const setF = <K extends keyof Bounty>(k: K, v: Bounty[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = () => {
    if (!editing || !form) return;
    if (!form.title?.trim()) { message.error('悬赏标题不能为空'); return; }
    if (!form.pain_point?.trim()) { message.error('痛点描述不能为空'); return; }
    if (!form.expected_output?.trim()) { message.error('预期产出不能为空'); return; }
    if (!form.points || form.points < 10) { message.error('悬赏积分需 ≥ 10'); return; }
    const diffs: string[] = [];
    (['title', 'owner_name', 'points', 'track', 'due_date', 'status', 'pain_point', 'expected_output'] as const)
      .forEach((k) => {
        const a = String(editing[k] ?? ''); const c = String(form[k] ?? '');
        if (a !== c) diffs.push(`${k}：${a || '空'} → ${c || '空'}`);
      });
    if (diffs.length === 0) { message.info('没有改动'); setEditing(null); return; }
    patch(editing, {
      title: form.title.trim(),
      pain_point: form.pain_point.trim(),
      expected_output: form.expected_output.trim(),
      points: Number(form.points),
      track: form.track,
      owner_union_id: form.owner_union_id,
      owner_name: form.owner_name,
      source: isCompanyBounty(form) ? '组织者发布' : form.source,
      due_date: form.due_date,
      status: form.status,
      desensitized: form.desensitized,
    }, '编辑悬赏信息', `${diffs.join('；')}（操作人 ${me.name}）`);
    message.success('已保存悬赏信息');
    setEditing(null);
  };

  const ownerOptions = [
    { value: COMPANY_UNION_ID, label: `${COMPANY_OWNER_NAME}（公司发布 · 全体可认领）` },
    ...db.users.map((u) => ({ value: u.union_id, label: `${u.name}（${u.dept_names?.[0] ?? '—'}）` })),
  ];

  const toolbar = (
    <Space size={8} wrap>
      <Input.Search
        allowClear placeholder="搜索标题 / 痛点 / 发起人"
        style={{ width: 220 }} value={kw}
        onChange={(e) => setKw(e.target.value)} onSearch={setKw}
      />
      <Select
        value={fStatus} onChange={setFStatus} style={{ width: 130 }}
        options={[{ value: 'ALL', label: '全部状态' }, ...(Object.keys(BOUNTY_STATUS_META) as BountyStatus[]).map((s) => ({ value: s, label: BOUNTY_STATUS_META[s].text }))]}
      />
      <Select
        value={fTrack} onChange={setFTrack} style={{ width: 120 }}
        options={[{ value: 'ALL', label: '全部赛道' }, ...TRACKS.map((t) => ({ value: t, label: t }))]}
      />
      <Select
        value={fSource} onChange={setFSource} style={{ width: 130 }}
        options={[{ value: 'ALL', label: '全部来源' }, { value: 'COMPANY', label: '公司悬赏' }, { value: 'MEMBER', label: '成员发布' }]}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        共 <b className="num">{rows.length}</b> 条
      </Typography.Text>
    </Space>
  );

  const summary = (
    <Space size={12} wrap style={{ margin: '10px 0' }}>
      <Typography.Text style={{ fontSize: 12 }}>全部 <b className="num">{stat.total}</b> 条</Typography.Text>
      <Typography.Text style={{ fontSize: 12 }}>公司悬赏 <b className="num">{stat.company}</b> 条</Typography.Text>
      <Typography.Text style={{ fontSize: 12 }}>可认领 <b className="num">{stat.open}</b> 条</Typography.Text>
      <Typography.Text style={{ fontSize: 12 }} type="secondary">已下架 <b className="num">{stat.offline}</b> 条</Typography.Text>
    </Space>
  );

  const table = (
    <Table
      size="small" rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }}
      locale={{ emptyText: '没有符合筛选条件的悬赏' }}
      columns={[
        {
          title: '标题', dataIndex: 'title',
          render: (v: string, r: Bounty) => (
            <Space size={4} direction="vertical" style={{ gap: 2 }}>
              <span>{v}</span>
              {r.desensitized && <Tag color="default" style={{ marginInlineEnd: 0, fontSize: 11 }}>已脱敏</Tag>}
            </Space>
          ),
        },
        {
          title: '悬赏发起人', dataIndex: 'owner_name', width: 130,
          render: (v: string, r: Bounty) => (isCompanyBounty(r)
            ? <Tag color="volcano" style={{ border: 'none' }}>{v}</Tag>
            : v),
        },
        { title: '赛道', dataIndex: 'track', width: 90, render: (v: string) => <Tag style={{ border: 'none' }}>{v}</Tag> },
        { title: '积分', dataIndex: 'points', width: 70, render: (v: number) => <span className="num">{v}</span> },
        { title: '截止', dataIndex: 'due_date', width: 100 },
        {
          title: '状态', dataIndex: 'status', width: 100,
          render: (v: BountyStatus) => <Tag color={BOUNTY_STATUS_META[v]?.color}>{BOUNTY_STATUS_META[v]?.text ?? v}</Tag>,
        },
        {
          title: '认领人', dataIndex: 'claimant_name', width: 90,
          render: (v?: string) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
        },
        {
          title: '最近更新', width: 130,
          render: (_: unknown, r: Bounty) => (r.updated_at
            ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.updated_at.slice(5)} · {r.updated_by ?? '—'}</Typography.Text>
            : <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>),
        },
        {
          title: '操作', width: 240,
          render: (_: unknown, r: Bounty) => (readOnly
            ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>只读</Typography.Text>
            : (
              <Space size={0}>
                <Button size="small" type="link" onClick={() => openEdit(r)}>编辑</Button>
                {['MEMBER_DRAFT', 'PENDING_REVIEW', 'REJECTED'].includes(r.status) && (
                  <Button size="small" type="link" onClick={() => publish(r)}>通过</Button>
                )}
                {r.status !== 'OFFLINE'
                  ? <Button size="small" type="link" onClick={() => offline(r)}>下架</Button>
                  : <Button size="small" type="link" onClick={() => republish(r)}>重新上架</Button>}
                {r.status === 'EXPIRED' && <Button size="small" type="link" onClick={() => republish(r)}>开放认领</Button>}
                <Button size="small" type="link" danger onClick={() => remove(r)}>删除</Button>
              </Space>
            )),
        },
      ]}
    />
  );

  const editModal = (
    <Modal
      open={!!editing} title={`编辑悬赏 · ${editing?.title ?? ''}`} width={640}
      onCancel={() => setEditing(null)} onOk={save} okText="保存" cancelText="取消"
    >
      {form && (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>悬赏标题</div>
            <Input value={form.title} onChange={(e) => setF('title', e.target.value)} maxLength={60} showCount />
          </div>
          <Space size={8} wrap>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>悬赏发起人</div>
              <Select
                showSearch style={{ width: 260 }} value={form.owner_union_id}
                filterOption={(input, opt) => String(opt?.label ?? '').includes(input)}
                options={ownerOptions}
                onChange={(v) => {
                  const isCompany = v === COMPANY_UNION_ID;
                  const u = db.users.find((x) => x.union_id === v);
                  setF('owner_union_id', v);
                  setF('owner_name', isCompany ? COMPANY_OWNER_NAME : (u?.name ?? form.owner_name));
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>悬赏积分</div>
              <InputNumber min={10} max={2000} value={form.points} onChange={(v) => setF('points', Number(v) ?? 10)} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>赛道</div>
              <Select value={form.track} style={{ width: 120 }} options={TRACKS.map((t) => ({ value: t, label: t }))} onChange={(v) => setF('track', v)} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>截止日期</div>
              <DatePicker value={dayjs(form.due_date)} onChange={(d) => d && setF('due_date', d.format('YYYY-MM-DD'))} />
            </div>
          </Space>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>状态</div>
            <Select
              value={form.status} style={{ width: 160 }}
              options={(Object.keys(BOUNTY_STATUS_META) as BountyStatus[]).map((s) => ({ value: s, label: BOUNTY_STATUS_META[s].text }))}
              onChange={(v) => setF('status', v)}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              直接改状态等价于流程操作，同样留痕
            </Typography.Text>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>痛点描述</div>
            <Input.TextArea rows={2} value={form.pain_point} onChange={(e) => setF('pain_point', e.target.value)} maxLength={200} showCount />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>预期产出</div>
            <Input.TextArea rows={2} value={form.expected_output} onChange={(e) => setF('expected_output', e.target.value)} maxLength={200} showCount />
          </div>
          <Space size={8}>
            <Switch checked={form.desensitized} onChange={(v) => setF('desensitized', v)} />
            <Typography.Text style={{ fontSize: 12 }}>内容脱敏展示（隐藏客户敏感信息）</Typography.Text>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            发起人改为「公司」后，全体成员（含组织者）均可认领；改为具体成员则该成员本人不可认领。演示日期 {DEMO_TODAY}
          </Typography.Text>
        </Space>
      )}
    </Modal>
  );

  return (
    <>
      {variant === 'tcard' ? (
        <div className="wb2-tcard">
          <div className="hd"><span className="t">悬赏管理（全量）<span className="n">{rows.length}</span></span></div>
          <div className="bd">
            {toolbar}
            {summary}
            {table}
          </div>
          <div className="ft">公司悬赏由虚拟主体「公司」发布，全体可认领；下架后大厅不展示，可随时重新上架。</div>
        </div>
      ) : (
        <div>
          {toolbar}
          {summary}
          {table}
        </div>
      )}
      {editModal}
    </>
  );
}
