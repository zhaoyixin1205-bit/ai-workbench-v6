import { Alert, Button, Card, Col, Modal, Row, Select, Space, Statistic, Steps, Table, Tag, Typography, App as AntApp, Input, InputNumber } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import type { Asset, AssetApply, ScopeSubject } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker, { ScopeText, parseScope, useScopeCommit } from '@/components/ScopePicker';
import { ReuseLabel, sumReuse } from '@/components/ReuseStat';
import BatchImport from '@/components/BatchImport';

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
            <BatchImport
              title="资产台账批量导入"
              columns={['资产ID', '可见范围', '复用次数', '复用人数']}
              hint="口径：复用次数为「总量」不是增量，导入后覆盖写入（U-3 口径）；可见范围填「全员/本部门/仅组织者」或指定主体名"
              sample={[[db.assets[0]?.id ?? 'AS1', '全员', '128', '36']]}
              validate={(rows) => rows.map((r, i) => {
                const [assetId, scope, reuse, users] = r;
                const asset = db.assets.find((a) => a.id === assetId);
                if (!asset) return { row: i + 2, name: assetId || `第 ${i + 2} 行`, result: '失败' as const, reason: '资产 ID 不存在（请从台账复制准确 ID）' };
                if (!Number.isFinite(Number(reuse)) || Number(reuse) < 0) {
                  return { row: i + 2, name: asset.name, result: '失败' as const, reason: '复用次数必须为 ≥0 的数字' };
                }
                if (!Number.isFinite(Number(users)) || Number(users) < 0) {
                  return { row: i + 2, name: asset.name, result: '失败' as const, reason: '复用人数必须为 ≥0 的数字' };
                }
                /** 已产生复用记录的资产允许覆盖更新（这是台账维护的本意），不做跳过 */
                return {
                  row: i + 2, name: asset.name, result: '成功' as const,
                  data: { id: asset.id, visible_scope: scope || asset.visible_scope, reuse_count: Number(reuse), reuse_user_count: Number(users) },
                };
              })}
              onCommit={(items) => {
                const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
                const map = new Map(items.map((it) => [it.data!.id, it.data!]));
                setDb((p) => ({
                  ...p,
                  assets: p.assets.map((a) => {
                    const d = map.get(a.id);
                    if (!d) return a;
                    return {
                      ...a,
                      visible_scope: d.visible_scope,
                      reuse_count: d.reuse_count,
                      reuse_user_count: d.reuse_user_count,
                      reuse_source: 'MANUAL' as const,
                      reuse_synced_at: at,
                    };
                  }),
                }));
                log('批量导入资产台账', `${items.length} 条`, `覆盖写入而非累加（U-3 口径），来源 MANUAL，同步于 ${at}`);
                message.success(`已覆盖更新 ${items.length} 条台账（复用次数为总量口径）`);
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
    </Space>
  );
}
