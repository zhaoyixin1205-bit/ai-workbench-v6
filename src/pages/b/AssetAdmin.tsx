import { Alert, Button, Card, Col, Form, Modal, Row, Select, Space, Statistic, Steps, Switch, Table, Tag, Typography, App as AntApp, Input, InputNumber } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import type { Asset, AssetApply, ScopeSubject } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker, { ScopeText, parseScope, useScopeCommit } from '@/components/ScopePicker';
import { ReuseLabel, sumReuse } from '@/components/ReuseStat';
import BatchImport from '@/components/BatchImport';
/* V7.0 CR-37：资产台账字段契约（模板与校验同源） */
import { assetSchema, ASSET_TYPES, ASSET_STATUSES, parseYesNo, parseSubjects } from '@/constants/importSchemas';

/**
 * V7.0 CR-37：把模板里「;」分隔的主体文本转成 ScopeSubject[]。
 * 「全员」映射为 ALL；其余主体名以 DEPT 作为载体类型（界面展示取 name）。
 */
const toSubjects = (raw: string): ScopeSubject[] =>
  parseSubjects(raw).map((name) => (name === '全员'
    ? { type: 'ALL' as const, id: 'ALL', name }
    : { type: 'DEPT' as const, id: name, name }));

/** V7.0 CR-37：台账导入行（显式泛型，避免 TS 从三态联合里推断成 {}） */
interface AssetRow {
  id?: string;
  name: string;
  type: Asset['type'];
  author_name: string;
  version: string;
  visible_scope: string;
  reuse?: number;
  users?: number;
  restricted: boolean;
}

export default function AssetAdmin() {
  const { db, setDb, me, log, flags } = useStore();
  const { message, modal } = AntApp.useApp();
  /** V4.0 CR-10：复用次数取外部数据源（开关关闭即回到 V3.0 自算口径） */
  const external = flags.assetReuseExternal !== false;
  const [cur, setCur] = useState<AssetApply | null>(null);
  /** V4.0 CR-08：真正落库的可见范围主体（旧实现只存了「指定部门/指定人群」文案） */
  const [subjects, setSubjects] = useState<ScopeSubject[]>([]);
  const [restricted, setRestricted] = useState(false);
  const commitScope = useScopeCommit();
  /** V4.0 CR-10 + U-3：手工导入复用台账（reuse_source=MANUAL + 同步时间）。U-3 拍板「仅手工触发」，不做定时同步 */
  const [imp, setImp] = useState<Asset | null>(null);
  const [cnt, setCnt] = useState<number>(0);
  const [cntUsers, setCntUsers] = useState<number>(0);
  /** V6.0 CR-27：台账批量导入 / 批量调整可见范围 / 批量软删 */
  const batchOn = flags.assetLedgerBatch !== false;
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  /** V7.0 CR-37：台账单行直接修改（全字段） */
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [editSubjects, setEditSubjects] = useState<ScopeSubject[]>([]);
  const [editForm] = Form.useForm();

  const openEditAsset = (a: Asset) => {
    setEditAsset(a);
    setEditSubjects(parseScope(a.visible_subjects ?? a.visible_scope));
    editForm.resetFields();
    editForm.setFieldsValue({
      name: a.name, type: a.type, author_name: a.author_name, version: a.version,
      visible_scope: a.visible_scope,
      reuse_count: a.reuse_count, reuse_user_count: a.reuse_user_count,
      restricted: a.restricted, status: a.status,
    });
  };

  /**
   * V7.0 CR-37：提交修改（拍板 5-A）
   * 复用次数/人数允许批量与单条修改，但一旦改动即强制标记来源为「手工维护」（MANUAL）
   * 并写入同步时间，避免把后台同步来的真实值悄悄覆盖掉。
   */
  const commitEditAsset = async () => {
    let vals: {
      name?: string; type?: Asset['type']; author_name?: string; version?: string;
      visible_scope?: string; reuse_count?: number; reuse_user_count?: number;
      restricted?: boolean; status?: Asset['status'];
    };
    try {
      vals = await editForm.validateFields();
    } catch {
      message.error('请填写完整');
      return;
    }
    const a = editAsset!;
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    const reuseChanged = Number(vals.reuse_count) !== a.reuse_count || Number(vals.reuse_user_count) !== a.reuse_user_count;
    const label = editSubjects.map((s) => s.name).join('、');

    setDb((p) => ({
      ...p,
      assets: p.assets.map((x) => (x.id === a.id ? {
        ...x,
        name: vals.name ?? x.name,
        type: vals.type ?? x.type,
        author_name: vals.author_name ?? x.author_name,
        version: vals.version ?? x.version,
        visible_scope: label || vals.visible_scope || x.visible_scope,
        visible_subjects: editSubjects.length ? editSubjects : x.visible_subjects,
        reuse_count: Number(vals.reuse_count ?? x.reuse_count),
        reuse_user_count: Number(vals.reuse_user_count ?? x.reuse_user_count),
        restricted: vals.restricted ?? x.restricted,
        status: vals.status ?? x.status,
        /** 拍板 5-A：改动复用统计即强制 MANUAL + 留痕 */
        reuse_source: reuseChanged ? 'MANUAL' as const : x.reuse_source,
        reuse_synced_at: reuseChanged ? at : x.reuse_synced_at,
      } : x)),
    }));
    log('修改资产台账', a.name,
      `${vals.name ?? a.name}｜${vals.type ?? a.type}｜${vals.version ?? a.version}｜可见范围 ${label || '不变'}${reuseChanged ? '；复用统计已改为手工维护并覆盖后台同步值' : ''}`);
    message.success(reuseChanged ? '已保存（复用统计标记为「手工维护」）' : '已保存');
    setEditAsset(null);
  };

  /** 批量调整可见范围（不改复用数据） */
  const batchScope = (scope: string) => {
    setDb((p) => ({
      ...p,
      assets: p.assets.map((a) => (selectedAssetIds.includes(a.id) ? { ...a, visible_scope: scope } : a)),
    }));
    log('批量调整可见范围', `${selectedAssetIds.length} 个资产`, `统一调整为「${scope}」`);
    message.success(`已将 ${selectedAssetIds.length} 个资产的可见范围调整为「${scope}」`);
    setSelectedAssetIds([]);
  };

  /** 删除为软删；已产生复用记录的资产禁止删除，仅可下线 */
  const batchDeleteAssets = () => {
    const blocked = db.assets.filter((a) => selectedAssetIds.includes(a.id) && a.reuse_count > 0);
    if (blocked.length) {
      message.error(`${blocked.length} 个资产已产生复用记录，禁止删除，仅可下线：${blocked.map((b) => b.name).join('、')}`);
      return;
    }
    modal.confirm({
      title: `删除 ${selectedAssetIds.length} 个资产？`,
      content: '删除为软删（置为「已下线」），台账记录保留可追溯。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: () => {
        setDb((p) => ({
          ...p,
          assets: p.assets.map((a) => (selectedAssetIds.includes(a.id) ? { ...a, status: '已下线' as Asset['status'] } : a)),
        }));
        log('批量删除资产', `${selectedAssetIds.length} 个`, 'V6.0 CR-27：软删（置为已下线），已产生复用记录的资产不在内');
        message.success(`已删除 ${selectedAssetIds.length} 个资产（软删）`);
        setSelectedAssetIds([]);
      },
    });
  };

  const review = (a: AssetApply) => {
    if (a.status === '待初审') {
      setDb((p) => ({
        ...p,
        assetApplies: p.assetApplies.map((x) => (x.id === a.id ? { ...x, status: '待上架', reviewer_union_id: me.union_id } : x)),
      }));
      log('入库初审通过', a.submit_title, '提交技能管理员上架');
      message.success('初审通过，已转技能管理员上架');
      return true;
    }
    if (a.status === '待上架') {
      const label = subjects.map((s) => s.name).join('、');
      const ok = commitScope(subjects, (p) => ({
        ...p,
        assetApplies: p.assetApplies.map((x) => (x.id === a.id
          ? { ...x, status: '已入库', visible_scope: label, visible_subjects: subjects } : x)),
        assets: [{
          id: `AS${Date.now()}`, apply_id: a.id, name: a.submit_title, type: 'Skill 包', version: 'v1.0',
          author_name: a.applicant_name, author_dept: db.users.find((u) => u.union_id === a.applicant_union_id)?.dept_names[0] ?? '',
          track: '客户赋能', visible_scope: label, visible_subjects: subjects, reuse_count: 0, reuse_user_count: 0,
          online_at: DEMO_TODAY, status: '已上架', restricted,
        }, ...p.assets],
        submits: p.submits.map((s) => (s.id === a.submit_id ? { ...s, status: 'ASSET_ONLINE' } : s)),
        pointRecords: [{
          id: `PR${Date.now()}`, union_id: a.applicant_union_id, name: a.applicant_name,
          source: '作品入库', points: 100, campaign_id: 'C2026Q4', remark: a.submit_title, created_at: DEMO_TODAY,
        }, ...p.pointRecords],
      }), '已上架企业 Skill 库并回写台账');
      if (ok) log('入库上架', a.submit_title, `可见范围 ${label}${restricted ? '（受限）' : ''}`);
      return ok;
    }
    return false;
  };

  /** V4.0 CR-10：导入后台拉取到的真实复用数据；本系统永不自算、永不累加 */
  const importReuse = () => {
    if (!imp) return;
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    setDb((p) => ({
      ...p,
      assets: p.assets.map((x) => (x.id === imp.id
        ? { ...x, reuse_count: cnt, reuse_user_count: cntUsers, reuse_source: 'MANUAL' as const, reuse_synced_at: at }
        : x)),
    }));
    log('导入复用台账', imp.name, `调用 ${cnt} 次 / ${cntUsers} 人，来源：管理员手工导入`);
    message.success(`已导入并标记同步于 ${at}`);
    setImp(null);
  };

  const rejectApply = (a: AssetApply) => {
    modal.confirm({
      title: '驳回该入库申请？',
      content: '驳回后将通知申请人并说明原因。',
      onOk: () => {
        setDb((p) => ({
          ...p,
          assetApplies: p.assetApplies.map((x) => (x.id === a.id ? { ...x, status: '已驳回' } : x)),
          submits: p.submits.map((s) => (s.id === a.submit_id ? { ...s, status: 'ASSET_REJECTED' } : s)),
        }));
        log('入库驳回', a.submit_title, '不符合入库标准');
        message.success('已驳回');
      },
    });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="入库管理" desc="申请 → 审核 → 上架 / 驳回状态回写，与调用情况回写" />

      <Alert type="info" showIcon
        message="Q2 决策：不新增企业版权限申请"
        description="平台只做两件事：① 入库情况回写（申请 → 审核 → 上架 / 驳回的状态与时间戳）；② 调用情况回写（复用次数、被复用人数，管理员导入或手工维护）。实际上架动作仍由技能管理员在企业版后台完成。" />
      {external && (
        <Alert type="success" showIcon
          message="V4.0 CR-10：复用次数为「已同步的真实数据」，本系统不自算、不累加"
          description="每行标注数据来源与同步时间；新入库但未同步的资产显示「待测」而非 0；历史自算值标注「估算」。U-3 口径：同步方式为手工触发，系统不会定时自动拉取，需要更新请点「导入复用台账」覆盖。关闭 asset.reuseExternal 开关即回到 V3.0 的自算展示。" />
      )}

      <Row gutter={12}>
        {[
          { t: '待初审', v: db.assetApplies.filter((a) => a.status === '待初审').length },
          { t: '待上架', v: db.assetApplies.filter((a) => a.status === '待上架').length },
          { t: '已入库', v: db.assetApplies.filter((a) => a.status === '已入库').length },
          { t: '资产总数', v: db.assets.length },
          { t: '累计复用', v: sumReuse(db.assets, external) },
          { t: '去重复用人数', v: db.assets.reduce((a, b) => a + b.reuse_user_count, 0) },
        ].map((m) => (
          <Col xs={12} sm={4} key={m.t}>
            <StatCard label={m.t} value={m.v} />
          </Col>
        ))}
      </Row>

      <Card size="small" title="入库申请队列">
        <Table
          size="small" rowKey="id" pagination={false} dataSource={db.assetApplies}
          columns={[
            { title: '作品', dataIndex: 'submit_title' },
            { title: '申请人', dataIndex: 'applicant_name', width: 90 },
            { title: '申请理由', dataIndex: 'apply_reason', ellipsis: true },
            { title: '可见范围', dataIndex: 'visible_scope', width: 140, render: (_, r) => <ScopeText value={r.visible_subjects ?? r.visible_scope} /> },
            {
              title: '状态', dataIndex: 'status',
              render: (v: string) => <Tag color={v === '已入库' ? 'green' : v === '待上架' ? 'blue' : v === '已驳回' ? 'red' : 'gold'}>{v}</Tag>,
            },
            { title: '申请时间', dataIndex: 'created_at', width: 140 },
            {
              title: '操作', width: 160,
              render: (_, r) => (
                <Space size={4}>
                  {['待初审', '待上架'].includes(r.status) && (
                    <>
                      <Button size="small" type="primary" onClick={() => {
                        setCur(r);
                        setSubjects(parseScope(r.visible_subjects ?? r.visible_scope));
                        setRestricted(false);
                      }}>
                        {r.status === '待初审' ? '初审通过' : '上架'}
                      </Button>
                      <Button size="small" danger onClick={() => rejectApply(r)}>驳回</Button>
                    </>
                  )}
                  {r.status === '已入库' && <Tag color="green">已完成</Tag>}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card
        size="small" title="资产库台账（可见范围与复用统计）"
        extra={batchOn ? (
          <Space size={8} wrap>
            {/* V6.0 CR-27：台账批量导入 —— 字段 = asset_id + 可见范围 + 复用次数 + 复用人数，覆盖写入而非累加 */}
            <BatchImport<AssetRow>
              title="资产台账批量导入"
              /* V7.0 CR-37：模板与校验共用同一份字段契约（全字段，含新增/更新两种模式） */
              schema={assetSchema}
              validate={(rows) => rows.map((r, i) => {
                const [assetId, name, type, author, version, scope, reuse, users, restricted] = r;
                const display = name || assetId || `第 ${i + 2} 行`;
                /** 填了 ID = 更新已有资产；留空 = 新增 */
                const target = assetId ? db.assets.find((a) => a.id === assetId) : undefined;
                if (assetId && !target) {
                  return { row: i + 2, name: display, result: '失败' as const, reason: `资产ID「${assetId}」不存在（更新请填台账中的准确 ID，新增请留空）` };
                }
                const typeOk = ASSET_TYPES.find((v) => v === type);
                if (!typeOk) {
                  return { row: i + 2, name: display, result: '失败' as const, reason: `类型「${type || '空'}」不在可选项内（${ASSET_TYPES.join(' / ')}）` };
                }
                if (!author) return { row: i + 2, name: display, result: '失败' as const, reason: '作者为空' };
                if (!version) return { row: i + 2, name: display, result: '失败' as const, reason: '版本为空' };
                if (!scope) return { row: i + 2, name: display, result: '失败' as const, reason: '可见范围为空（全员 / 本部门 / 仅组织者，或多个主体用 ; 分隔）' };
                const reuseN = reuse === '' ? undefined : Number(reuse);
                const usersN = users === '' ? undefined : Number(users);
                if (reuseN !== undefined && (!Number.isFinite(reuseN) || reuseN < 0)) {
                  return { row: i + 2, name: display, result: '失败' as const, reason: '复用次数必须为 ≥0 的数字' };
                }
                if (usersN !== undefined && (!Number.isFinite(usersN) || usersN < 0)) {
                  return { row: i + 2, name: display, result: '失败' as const, reason: '复用人数必须为 ≥0 的数字' };
                }
                return {
                  row: i + 2, name: display, result: '成功' as const,
                  data: {
                    id: target?.id, name, type: typeOk, author_name: author, version,
                    visible_scope: scope, reuse: reuseN, users: usersN,
                    restricted: parseYesNo(restricted),
                  },
                };
              })}
              onCommit={(items) => {
                const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
                setDb((p) => {
                  const updates = items.filter((it) => it.data!.id);
                  const creates = items.filter((it) => !it.data!.id);
                  const map = new Map(updates.map((it) => [it.data!.id!, it.data!]));
                  return {
                    ...p,
                    assets: [
                      /** 新增模式：ID 留空 */
                      ...creates.map((it, idx) => {
                        const d = it.data!;
                        return {
                          id: `AS-${Date.now()}-${idx}`,
                          apply_id: '', name: d.name, type: d.type, version: d.version,
                          author_name: d.author_name, author_dept: '',
                          track: '客户赋能' as Asset['track'],
                          visible_scope: d.visible_scope, visible_subjects: toSubjects(d.visible_scope),
                          reuse_count: d.reuse ?? 0, reuse_user_count: d.users ?? 0,
                          /** 拍板 5-A：填了复用数据即标记「手工维护」 */
                          reuse_source: ((d.reuse !== undefined || d.users !== undefined) ? 'MANUAL' : 'LEGACY') as Asset['reuse_source'],
                          reuse_synced_at: (d.reuse !== undefined || d.users !== undefined) ? at : undefined,
                          online_at: DEMO_TODAY, status: '已上架' as Asset['status'], restricted: d.restricted,
                        };
                      }),
                      ...p.assets.map((a) => {
                        const d = map.get(a.id);
                        if (!d) return a;
                        const reuseChanged = d.reuse !== undefined || d.users !== undefined;
                        return {
                          ...a,
                          name: d.name, type: d.type, author_name: d.author_name, version: d.version,
                          visible_scope: d.visible_scope, visible_subjects: toSubjects(d.visible_scope),
                          reuse_count: d.reuse ?? a.reuse_count,
                          reuse_user_count: d.users ?? a.reuse_user_count,
                          restricted: d.restricted,
                          reuse_source: reuseChanged ? 'MANUAL' as const : a.reuse_source,
                          reuse_synced_at: reuseChanged ? at : a.reuse_synced_at,
                        };
                      }),
                    ],
                  };
                });
                log('批量导入资产台账', `${items.length} 条`, '全字段契约校验；填 ID 更新 / 留空新增；改动复用统计的强制标记来源 MANUAL');
                message.success(`已处理 ${items.length} 条台账（新增/更新按 ID 自动判定）`);
              }}
            />
            {/* V6.0 CR-27：批量调整可见范围 */}
            <Select
              size="small" placeholder="批量调整可见范围" style={{ width: 160 }}
              value={undefined}
              onChange={(v) => batchScope(String(v))}
              options={['全员', '本部门', '仅组织者'].map((v) => ({ value: v, label: v }))}
              disabled={selectedAssetIds.length === 0}
            />
            <Button size="small" danger disabled={selectedAssetIds.length === 0} onClick={batchDeleteAssets}>
              删除{selectedAssetIds.length ? `（${selectedAssetIds.length}）` : ''}
            </Button>
          </Space>
        ) : undefined}
      >
        <Table
          size="small" rowKey="id" pagination={false} dataSource={db.assets}
          rowSelection={batchOn ? {
            selectedRowKeys: selectedAssetIds,
            onChange: (keys) => setSelectedAssetIds(keys as string[]),
          } : undefined}
          columns={[
            { title: '资产名称', dataIndex: 'name' },
            { title: '类型', dataIndex: 'type', render: (v: string) => <Tag color={v === 'Skill 包' ? 'purple' : v === '智能体' ? 'geekblue' : 'blue'}>{v}</Tag> },
            { title: '作者', dataIndex: 'author_name', width: 90 },
            { title: '版本', dataIndex: 'version', width: 70 },
            { title: '可见范围', dataIndex: 'visible_scope', width: 140, render: (_, r) => <ScopeText value={r.visible_subjects ?? r.visible_scope} /> },
            { title: '复用次数', dataIndex: 'reuse_count', width: 260, render: (_, r) => <ReuseLabel asset={r} external={external} /> },
            { title: '复用人数', dataIndex: 'reuse_user_count', width: 90, render: (v: number) => <span className="num">{v}</span> },
            {
              title: '受限', dataIndex: 'restricted', width: 70,
              render: (v: boolean) => v ? <Tag color="red">受限</Tag> : <Tag>否</Tag>,
            },
            {
              title: '操作', width: 120,
              render: (_, r) => (
                <Space size={4}>
                  {/* V7.0 CR-37：台账直接修改（全字段） */}
                  {batchOn && (
                    <Button size="small" type="link" onClick={() => openEditAsset(r)}>修改</Button>
                  )}
                  <Button size="small" type="link" onClick={() => { setImp(r); setCnt(r.reuse_count); setCntUsers(r.reuse_user_count); }}>
                    {external ? '导入复用台账' : '更新复用数据'}
                  </Button>
                  <Button size="small" type="link" danger onClick={() => {
                    setDb((p) => ({ ...p, assets: p.assets.map((x) => (x.id === r.id ? { ...x, status: x.status === '已上架' ? '已下架' : '已上架' } : x)) }));
                    message.success('上架状态已回写');
                  }}>{r.status === '已上架' ? '下架' : '上架'}</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!cur} title={`入库处理 · ${cur?.submit_title}`}
        onCancel={() => setCur(null)}
        onOk={() => { if (review(cur!)) setCur(null); }}
        okText={cur?.status === '待初审' ? '确认初审通过' : subjects.length === 0 ? '请先选择可见范围' : '确认上架'}
        okButtonProps={{ disabled: cur?.status === '待上架' && subjects.length === 0 }}
      >
        <Steps size="small" current={cur?.status === '待初审' ? 0 : 1}
          items={[{ title: '组织者初审' }, { title: '技能管理员上架' }, { title: '回写台账并公示' }]} />
        {cur?.status === '待上架' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, fontSize: 13 }}>可见范围</div>
            <ScopePicker value={subjects} onChange={setSubjects} />
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Space>
            <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} id="rst" />
            <label htmlFor="rst" style={{ fontSize: 13 }}>标记为受限可见（涉客户数据 / 对外文案必须勾选）</label>
          </Space>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          申请门槛：最终分 ≥ 60 且抽查通过；组织者可为特例放行并记理由。演示日期 {DEMO_TODAY}
        </Typography.Text>
      </Modal>

      {/* V4.0 CR-10：复用台账导入（MANUAL 来源），覆盖写入而非累加 */}
      <Modal
        open={!!imp} title={`导入复用台账 · ${imp?.name}`}
        onCancel={() => setImp(null)} onOk={importReuse} okText="确认导入"
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          数据来自 WorkBuddy 管理员后台导出。<b>U-3 口径：本系统不做定时自动同步，仅在您手工导入时更新</b>；此处为<b>覆盖写入</b>，本系统不自算、不累加。导入后该资产标记为「管理员手工导入」并写入同步时间。
        </Typography.Paragraph>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>调用次数</div>
            <InputNumber min={0} value={cnt} onChange={(v) => setCnt(Number(v ?? 0))} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>去重复用人数</div>
            <InputNumber min={0} value={cntUsers} onChange={(v) => setCntUsers(Number(v ?? 0))} style={{ width: '100%' }} />
          </div>
        </Space>
      </Modal>

      {/* V7.0 CR-37：台账单行直接修改（全字段） */}
      <Modal
        open={!!editAsset} title={`修改资产台账 · ${editAsset?.name ?? ''}`}
        onCancel={() => setEditAsset(null)} onOk={commitEditAsset}
        okText="保存" destroyOnClose width={560}
      >
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="资产名称" rules={[{ required: true, message: '请填写资产名称' }]}>
            <Input maxLength={40} />
          </Form.Item>
          <Space size={12} wrap>
            <Form.Item name="type" label="类型" rules={[{ required: true }]}>
              <Select style={{ width: 150 }} options={ASSET_TYPES.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="author_name" label="作者" rules={[{ required: true }]}>
              <Input style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="version" label="版本" rules={[{ required: true }]}>
              <Input style={{ width: 100 }} placeholder="v1.0" />
            </Form.Item>
          </Space>
          <Form.Item label="可见范围">
            <ScopePicker value={editSubjects} onChange={setEditSubjects} />
          </Form.Item>
          <Space size={12} wrap>
            <Form.Item name="reuse_count" label="复用次数" rules={[{ required: true }]}>
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="reuse_user_count" label="复用人数" rules={[{ required: true }]}>
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select style={{ width: 120 }} options={ASSET_STATUSES.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="restricted" label="受限" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          拍板 5-A：复用次数/人数可以改，但一旦改动该资产即标记为「手工维护（MANUAL）」并写入同步时间，
          与后台同步来的真实值区分开，避免悄悄覆盖。当前来源：{editAsset?.reuse_source ?? 'LEGACY'}
          {editAsset?.reuse_synced_at ? `（同步于 ${editAsset.reuse_synced_at}）` : ''}
        </Typography.Text>
      </Modal>
    </Space>
  );
}
