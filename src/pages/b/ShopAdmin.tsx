import { Alert, Button, Card, Col, Input, InputNumber, Modal, Row, Select, Space, Statistic, Table, Tabs, Tag, Typography, Form, App as AntApp } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker, { ScopeText, parseScope, useScopeCommit } from '@/components/ScopePicker';
import type { ScopeSubject, ShopItem } from '@/mock/types';
import BatchImport from '@/components/BatchImport';
/* V7.0 CR-38：商品字段契约（模板与校验同源） */
import { shopSchema, VERIFY_TYPES, SHOP_STATUSES, parseSubjects } from '@/constants/importSchemas';

/** V7.0 CR-38：商品导入行（显式泛型，避免 TS 从三态联合里推断成 {}） */
interface ShopRow {
  id?: string;
  name: string;
  points: number;
  stock: number;
  limit_per_user: number;
  scope: string;
  verify_type: ShopItem['verify_type'];
  status: ShopItem['status'];
}

/** 把模板里「;」分隔的主体文本转成 ScopeSubject[]（全员 → ALL，其余以 DEPT 作载体） */
const toSubjects = (raw: string): ScopeSubject[] =>
  parseSubjects(raw).map((name) => (name === '全员'
    ? { type: 'ALL' as const, id: 'ALL', name }
    : { type: 'DEPT' as const, id: name, name }));

/** '待核销'/'已核销'/'已取消' 为 V3.0 原值；'已发货'/'已完成' 为 V4.0 CR-05 新增 */
const STATUS_COLOR: Record<string, string> = {
  待核销: 'orange', 已核销: 'cyan', 已发货: 'blue', 已完成: 'green', 已取消: 'default',
};

export default function ShopAdmin() {
  const { db, setDb, me, hasRole, log, flags } = useStore();
  const { message, modal } = AntApp.useApp();
  /** V4.0 CR-05：兑换四段闭环（下单 → 核销 → 发货 → 完成） */
  const shopV2 = flags.shopV2Flow !== false;
  /** V6.0 CR-29：批量导入 / 批量删除 */
  const shopBatchOn = flags.shopBatch !== false;
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  /** V6.0 CR-29：删除为软删（status=下架）；已产生兑换订单的商品禁止删除，仅可下架 */
  const batchDeleteItems = () => {
    const blocked = db.shopItems.filter((i) => selectedItemIds.includes(i.id) && i.exchanged_count > 0);
    if (blocked.length) {
      message.error(`${blocked.length} 件商品已产生兑换订单，禁止删除，仅可下架：${blocked.map((b) => b.name).join('、')}`);
      return;
    }
    modal.confirm({
      title: `删除 ${selectedItemIds.length} 件商品？`,
      content: '删除为软删（置为「下架」），记录保留可追溯。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: () => {
        setDb((p) => ({
          ...p,
          shopItems: p.shopItems.map((i) => (selectedItemIds.includes(i.id) ? { ...i, status: '下架' } : i)),
        }));
        log('批量删除商品', `${selectedItemIds.length} 件`, 'V6.0 CR-29：软删（置为下架），已产生兑换订单的商品不在内');
        message.success(`已删除 ${selectedItemIds.length} 件（软删）`);
        setSelectedItemIds([]);
      },
    });
  };
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [verifyCode, setVerifyCode] = useState('');
  /** V4.0 CR-05：发货（邮寄类订单）—— 核销后的第三段 */
  const [shipOrder, setShipOrder] = useState<{ id: string; item_name: string; name: string } | null>(null);
  const [shipNo, setShipNo] = useState('');
  /** V4.0 CR-08：真正落库的适用人群主体（旧实现只存了「标签：干部」这类文案） */
  const [scopeSubjects, setScopeSubjects] = useState<ScopeSubject[]>([]);
  const commitScope = useScopeCommit();

  const isAdmin = hasRole('ADMIN');
  /**
   * V7.0 CR-38：拍板 6-B —— 默认维持「商品编辑仅 ADMIN」（与既有对账口径一致）。
   * 开关 shopOrgEditable 打开后，组织者也可编辑已发布商品，并在审计日志中标明身份。
   */
  const orgEditable = flags.shopOrgEditable === true;
  const canEdit = isAdmin || (orgEditable && hasRole('ORGANIZER'));
  const orders = db.shopOrders;

  /** V7.0 CR-38：商品全字段编辑（原「编辑」按钮只有提示、无实际弹窗） */
  const [editItem, setEditItem] = useState<ShopItem | null>(null);
  const [editForm] = Form.useForm();

  const openEditItem = (it: ShopItem) => {
    setEditItem(it);
    setScopeSubjects(parseScope(it.scope_subjects ?? it.scope));
    editForm.resetFields();
    editForm.setFieldsValue({
      name: it.name, points: it.points, stock: it.stock,
      limit_per_user: it.limit_per_user, verify_type: it.verify_type, status: it.status,
    });
  };

  const commitEditItem = async () => {
    let vals: {
      name?: string; points?: number; stock?: number; limit_per_user?: number;
      verify_type?: ShopItem['verify_type']; status?: ShopItem['status'];
    };
    try {
      vals = await editForm.validateFields();
    } catch {
      message.error('请填写完整');
      return;
    }
    const it = editItem!;
    const label = scopeSubjects.map((s) => s.name).join('、');
    setDb((p) => ({
      ...p,
      shopItems: p.shopItems.map((x) => (x.id === it.id ? {
        ...x,
        name: vals.name ?? x.name,
        points: Number(vals.points ?? x.points),
        stock: Number(vals.stock ?? x.stock),
        limit_per_user: Number(vals.limit_per_user ?? x.limit_per_user),
        scope: label || x.scope,
        scope_subjects: scopeSubjects.length ? scopeSubjects : x.scope_subjects,
        verify_type: vals.verify_type ?? x.verify_type,
        status: vals.status ?? x.status,
      } : x)),
    }));
    log('修改商品', it.name,
      `积分 ${vals.points ?? it.points}｜库存 ${vals.stock ?? it.stock}｜限购 ${vals.limit_per_user ?? it.limit_per_user}｜适用人群 ${label || '不变'}｜核销 ${vals.verify_type ?? it.verify_type}｜状态 ${vals.status ?? it.status}${!isAdmin ? '（组织者编辑，shopOrgEditable 已开启）' : ''}`);
    message.success('商品信息已更新');
    setEditItem(null);
  };

  /** V4.0 CR-08：新建商品，落库 scope_subjects 并在保存前回读校验 */
  const createItem = async () => {
    let vals: { name?: string; desc?: string; points?: number; stock?: number; limit_per_user?: number; verify_type?: ShopItem['verify_type'] };
    try {
      vals = await form.validateFields();
    } catch {
      message.error('请先填写必填项');
      return;
    }
    const label = scopeSubjects.map((s) => s.name).join('、');
    const ok = commitScope(scopeSubjects, (p) => ({
      ...p,
      shopItems: [{
        id: `SI${Date.now()}`, name: vals.name ?? '未命名商品', cover: '🎁',
        desc: vals.desc ?? '', points: vals.points ?? 500, stock: vals.stock ?? 10,
        limit_per_user: vals.limit_per_user ?? 1,
        /** 旧字段回写为可读摘要；真实生效主体为 scope_subjects */
        scope: label, scope_subjects: scopeSubjects,
        on_sale_at: DEMO_TODAY, off_sale_at: DEMO_TODAY,
        status: '草稿', verify_type: vals.verify_type ?? '线下领取', exchanged_count: 0,
      }, ...p.shopItems],
    }), '商品已创建（草稿状态，需上架后可见）');
    if (ok) {
      log('新建商品', vals.name ?? '', `适用人群 ${label}`);
      setOpen(false);
      form.resetFields();
      setScopeSubjects([]);
    }
  };

  const verify = () => {
    const o = orders.find((x) => x.code === verifyCode.trim().toUpperCase());
    if (!o) { message.error('核销码不存在'); return; }
    if (o.status !== '待核销') { message.warning(`该订单当前状态：${o.status}`); return; }
    setDb((p) => ({ ...p, shopOrders: p.shopOrders.map((x) => (x.id === o.id ? { ...x, status: '已核销', verify_by: me.name, verify_at: DEMO_TODAY } : x)) }));
    log('兑换核销', o.item_name, `核销码 ${o.code}，核销人 ${me.name}`);
    message.success(`核销成功：${o.item_name}（${o.name}）`);
    setVerifyCode('');
  };

  /** V4.0 CR-05：发货（邮寄类）—— 已核销 → 已发货，写入物流单号与留痕 */
  const ship = () => {
    if (!shipOrder) return;
    if (shipNo.trim().length < 6) { message.error('请输入不少于 6 位的物流单号'); return; }
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    setDb((p) => ({
      ...p,
      shopOrders: p.shopOrders.map((x) => (x.id === shipOrder.id
        ? { ...x, status: '已发货', shipping_no: shipNo.trim(), shipping_by: me.name, shipping_at: at } : x)),
    }));
    log('兑换发货', shipOrder.item_name, `物流单号 ${shipNo.trim()}，发货人 ${me.name}`);
    message.success(`已发货：${shipOrder.item_name}（${shipOrder.name}），物流单号已回写到「我的兑换」`);
    setShipOrder(null); setShipNo('');
  };

  /** V4.0 CR-05：四段闭环对账导出（下单 / 核销 / 发货 / 完成） */
  const exportReconcile = () => {
    const summary = [
      ['环节', '订单数', '积分'],
      ['待核销', orders.filter((o) => o.status === '待核销').length, orders.filter((o) => o.status === '待核销').reduce((a, b) => a + b.points_cost, 0)],
      ['已核销', orders.filter((o) => o.status === '已核销').length, orders.filter((o) => o.status === '已核销').reduce((a, b) => a + b.points_cost, 0)],
      ['已发货', orders.filter((o) => o.status === '已发货').length, orders.filter((o) => o.status === '已发货').reduce((a, b) => a + b.points_cost, 0)],
      ['已完成', orders.filter((o) => o.status === '已完成').length, orders.filter((o) => o.status === '已完成').reduce((a, b) => a + b.points_cost, 0)],
      ['已取消', orders.filter((o) => o.status === '已取消').length, orders.filter((o) => o.status === '已取消').reduce((a, b) => a + b.points_cost, 0)],
    ];
    log('兑换对账导出', '全部订单', `四段闭环 ${orders.length} 单；口径：标签=${'全部'}，含已取消`);
    message.success(`对账表已导出：待核销 ${summary[1][1]} / 已核销 ${summary[2][1]} / 已发货 ${summary[3][1]} / 已完成 ${summary[4][1]}（CSV 表头带口径标注）`);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="商城管理" desc="商品维护、库存与核销对账" />
      <Alert
        type={isAdmin ? 'success' : 'warning'} showIcon
        message={`Q6 决策：可兑换物品以系统管理员编辑为准；组织者负责核销与对账。当前身份${isAdmin ? '为系统管理员，可编辑商品' : '无商品编辑权限（仅可核销）'}`}
        description="防超卖：库存扣减使用原子操作；兑换有效期默认 30 天，超时自动关闭并退回积分。"
      />

      <Row gutter={12}>
        {[
          { t: '上架商品', v: db.shopItems.filter((i) => i.status === '上架').length },
          { t: '累计兑换', v: db.shopItems.reduce((a, b) => a + b.exchanged_count, 0) },
          { t: '待核销订单', v: orders.filter((o) => o.status === '待核销').length },
          { t: '已核销', v: orders.filter((o) => o.status === '已核销').length },
          { t: '积分消耗合计', v: Math.abs(db.pointRecords.filter((p) => p.source === '兑换扣减').reduce((a, b) => a + b.points, 0)) },
          { t: '取消退回', v: db.pointRecords.filter((p) => p.source === '取消兑换退回').reduce((a, b) => a + b.points, 0) },
        ].map((m) => (
          <Col xs={12} sm={4} key={m.t}>
            <StatCard label={m.t} value={m.v} />
          </Col>
        ))}
      </Row>

      <Card>
        <Tabs
          items={[
            {
              key: 'items', label: `商品管理（${db.shopItems.length}）`,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }} wrap>
                    <Button type="primary" disabled={!isAdmin} onClick={() => { form.resetFields(); setScopeSubjects([]); setOpen(true); }}>新建商品</Button>
                    {/* V6.0 CR-29：批量上传（模板下载 + 三态回执）与批量删除（软删） */}
                    {shopBatchOn && (
                      <>
                        <BatchImport<ShopRow>
                          title="商品批量导入"
                          disabled={!canEdit}
                          /* V7.0 CR-38：模板补齐「适用人群」「状态」「商品ID」三列，与上传校验同源 */
                          schema={shopSchema}
                          validate={(rows) => rows.map((r, i) => {
                            const [itemId, name, points, stock, limit, scope, verify, status] = r;
                            const display = name || itemId || `第 ${i + 2} 行`;
                            /** 填了 ID = 更新已有商品；留空 = 新增 */
                            const target = itemId ? db.shopItems.find((x) => x.id === itemId) : undefined;
                            if (itemId && !target) {
                              return { row: i + 2, name: display, result: '失败' as const, reason: `商品ID「${itemId}」不存在（更新请填准确 ID，新增请留空）` };
                            }
                            const verifyType = VERIFY_TYPES.find((v) => v === verify);
                            if (!verifyType) {
                              return { row: i + 2, name: display, result: '失败' as const, reason: `核销方式「${verify || '空'}」不在可选项内（${VERIFY_TYPES.join(' / ')}）` };
                            }
                            if (!scope) {
                              return { row: i + 2, name: display, result: '失败' as const, reason: '适用人群为空（全员 / 本部门，或多个主体用 ; 分隔）' };
                            }
                            const statusOk = status ? SHOP_STATUSES.find((v) => v === status) : '草稿';
                            if (!statusOk) {
                              return { row: i + 2, name: display, result: '失败' as const, reason: `状态「${status}」不在可选项内（${SHOP_STATUSES.join(' / ')}）` };
                            }
                            return {
                              row: i + 2, name: display, result: '成功' as const,
                              data: {
                                id: target?.id, name,
                                points: Number(points),
                                stock: Number(stock) || 0,
                                limit_per_user: Number(limit) || 1,
                                scope,
                                verify_type: verifyType,
                                /** 新增一律草稿（防超卖）；更新时按模板指定状态 */
                                status: (statusOk ?? '草稿') as ShopItem['status'],
                              },
                            };
                          })}
                          onCommit={(items) => {
                            setDb((p) => {
                              const creates = items.filter((it) => !it.data!.id);
                              const updates = items.filter((it) => it.data!.id);
                              const map = new Map(updates.map((it) => [it.data!.id!, it.data!]));
                              return {
                                ...p,
                                shopItems: [
                                  ...creates.map((it, i) => ({
                                    id: `SI-${Date.now()}-${i}`,
                                    name: it.data!.name, cover: '🎁',
                                    desc: '批量导入商品（待组织者补充描述）',
                                    points: it.data!.points, stock: it.data!.stock,
                                    limit_per_user: it.data!.limit_per_user,
                                    scope: it.data!.scope, scope_subjects: toSubjects(it.data!.scope),
                                    on_sale_at: DEMO_TODAY, off_sale_at: '2026-12-31',
                                    /** 导入新增统一为「草稿」，需人工确认上架（防超卖） */
                                    status: '草稿' as const,
                                    verify_type: it.data!.verify_type, exchanged_count: 0,
                                  })),
                                  ...p.shopItems.map((x) => {
                                    const d = map.get(x.id);
                                    if (!d) return x;
                                    return {
                                      ...x,
                                      name: d.name, points: d.points, stock: d.stock,
                                      limit_per_user: d.limit_per_user,
                                      scope: d.scope, scope_subjects: toSubjects(d.scope),
                                      verify_type: d.verify_type, status: d.status,
                                    };
                                  }),
                                ],
                              };
                            });
                            log('批量导入商品', `${items.length} 件`, 'V7.0 CR-38：全字段契约校验；新增为草稿态（防超卖），更新按模板状态写入');
                            message.success(`已处理 ${items.length} 件商品（新增为草稿态，需逐件确认上架）`);
                          }}
                        />
                        <Button
                          danger disabled={!isAdmin || selectedItemIds.length === 0}
                          onClick={batchDeleteItems}
                        >
                          批量删除{selectedItemIds.length ? `（${selectedItemIds.length}）` : ''}
                        </Button>
                      </>
                    )}
                    {!canEdit && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        商品编辑当前仅系统管理员可用（拍板 6-B）；如需放开给组织者，请在系统管理开启开关 shopOrgEditable。
                      </Typography.Text>
                    )}
                  </Space>
                  <Table
                    size="small" rowKey="id" pagination={false} dataSource={db.shopItems}
                    rowSelection={shopBatchOn ? {
                      selectedRowKeys: selectedItemIds,
                      onChange: (keys) => setSelectedItemIds(keys as string[]),
                    } : undefined}
                    columns={[
                      { title: '商品', render: (_, r) => <Space><span style={{ fontSize: 20 }}>{r.cover}</span>{r.name}</Space> },
                      { title: '所需积分', dataIndex: 'points', width: 90, render: (v: number) => <span className="num">{v}</span> },
                      { title: '库存', dataIndex: 'stock', width: 70, render: (v: number) => <span className="num">{v}</span> },
                      { title: '限购', dataIndex: 'limit_per_user', width: 70, render: (v: number) => <span className="num">{v}</span> },
                      { title: '适用人群', dataIndex: 'scope', render: (_, r) => <ScopeText value={r.scope_subjects ?? r.scope} /> },
                      { title: '核销方式', dataIndex: 'verify_type' },
                      {
                        title: '状态', dataIndex: 'status',
                        render: (v: string) => <Tag color={v === '上架' ? 'green' : v === '售罄' ? 'default' : v === '草稿' ? 'gold' : 'gray'}>{v}</Tag>,
                      },
                      {
                        title: '操作', width: 120,
                        render: (_, r) => (
                          <Space size={4}>
                            {/* V7.0 CR-38：编辑改为真实弹窗（原实现只有一句提示，改不了任何字段） */}
                            <Button size="small" type="link" disabled={!canEdit} onClick={() => openEditItem(r)}>编辑</Button>
                            <Button size="small" type="link" disabled={!canEdit} onClick={() => {
                              setDb((p) => ({ ...p, shopItems: p.shopItems.map((x) => (x.id === r.id ? { ...x, status: x.status === '上架' ? '下架' : '上架' } : x)) }));
                              message.success('上下架状态已更新（不影响已生成订单）');
                            }}>{r.status === '上架' ? '下架' : '上架'}</Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'orders', label: `订单核销（${orders.length}）`,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }} wrap>
                    <Space.Compact style={{ maxWidth: 420 }}>
                      <Input placeholder="输入核销码（如 VF-8K3M2P）" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} />
                      <Button type="primary" onClick={verify}>核销</Button>
                    </Space.Compact>
                    {shopV2 && <Button onClick={exportReconcile}>对账导出（CSV）</Button>}
                  </Space>
                  <Table
                    size="small" rowKey="id" pagination={false} dataSource={orders}
                    columns={[
                      { title: '订单', render: (_, r) => <b>{r.item_name}</b> },
                      { title: '兑换人', dataIndex: 'name', width: 90 },
                      { title: '积分', dataIndex: 'points_cost', width: 80, render: (v: number) => <span className="num">{v}</span> },
                      { title: '核销码', dataIndex: 'code', width: 130, render: (v: string) => <code>{v}</code> },
                      {
                        title: '状态', dataIndex: 'status',
                        render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'orange'}>{v}</Tag>,
                      },
                      { title: '核销人', dataIndex: 'verify_by', width: 90 },
                      { title: '时间', dataIndex: 'created_at', width: 110 },
                      ...(shopV2 ? [{
                        title: '物流', dataIndex: 'shipping_no', width: 140,
                        render: (v?: string, r?: { shipping_at?: string }) => (v
                          ? <span style={{ fontSize: 12 }}><code>{v}</code><br />{r?.shipping_at}</span>
                          : <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>),
                      }] : []),
                      {
                        title: '操作', width: 180,
                        render: (_, r) => (
                          <Space size={4}>
                            {r.status === '待核销' && (
                              <Button size="small" type="link" onClick={() => { setVerifyCode(r.code); message.info(`已填入核销码 ${r.code}`); }}>填入核销</Button>
                            )}
                            {shopV2 && r.status === '已核销' && (
                              <Button size="small" type="link" onClick={() => { setShipOrder({ id: r.id, item_name: r.item_name, name: r.name }); setShipNo(''); }}>发货</Button>
                            )}
                            {shopV2 && r.status === '已发货' && (
                              <Button size="small" type="link" onClick={() => {
                                setDb((p) => ({ ...p, shopOrders: p.shopOrders.map((x) => (x.id === r.id ? { ...x, status: '已完成' } : x)) }));
                                log('兑换完成', r.item_name, '用户已收货，闭环完成');
                                message.success('已标记完成');
                              }}>完成</Button>
                            )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'stats', label: '兑换统计',
              children: (
                <Table
                  size="small" rowKey="id" pagination={false} dataSource={db.shopItems}
                  columns={[
                    { title: '商品', dataIndex: 'name' },
                    { title: '已兑换件数', dataIndex: 'exchanged_count', render: (v: number) => <span className="num">{v}</span> },
                    { title: '消耗积分', render: (_, r) => <span className="num">{r.points * r.exchanged_count}</span> },
                    { title: '剩余库存', dataIndex: 'stock', render: (v: number) => <span className="num">{v}</span> },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={open} title="新建兑换商品" onCancel={() => setOpen(false)}
        onOk={createItem}
        okText={scopeSubjects.length === 0 ? '请先选择适用人群' : '创建'}
        /* 同 AssignmentAdmin：这里只有「新建」入口，必选直接生效是安全的。
           将来若加商品编辑，必须收窄为 `!isEditing && scopeSubjects.length === 0`。 */
        okButtonProps={{ disabled: scopeSubjects.length === 0 }}
      >
        <Form form={form} layout="vertical" initialValues={{ points: 500, stock: 10, limit_per_user: 1, verify_type: '线下领取' }}>
          <Form.Item name="name" label="商品名称" rules={[{ required: true }]}><Input maxLength={30} /></Form.Item>
          <Form.Item name="desc" label="商品描述"><Input.TextArea rows={2} /></Form.Item>
          <Space>
            <Form.Item name="points" label="所需积分"><InputNumber min={1} /></Form.Item>
            <Form.Item name="stock" label="库存"><InputNumber min={0} /></Form.Item>
            <Form.Item name="limit_per_user" label="每人限购"><InputNumber min={1} /></Form.Item>
          </Space>
          <Form.Item label="适用人群" required>
            <ScopePicker value={scopeSubjects} onChange={setScopeSubjects} />
          </Form.Item>
          <Form.Item name="verify_type" label="核销方式"><Select options={['线下领取', '邮寄', '线上发放'].map((v) => ({ value: v, label: v }))} /></Form.Item>
        </Form>
      </Modal>

      {/* V4.0 CR-05：发货（邮寄类）——第三段 */}
      <Modal
        open={!!shipOrder} title={`发货登记 · ${shipOrder?.item_name}`}
        onCancel={() => setShipOrder(null)} onOk={ship} okText="确认发货"
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          兑换人：<b>{shipOrder?.name}</b>；发货后订单进入「已发货」，物流单号回写到用户「我的兑换」，用户确认收货或管理员点「完成」后闭环。
        </Typography.Paragraph>
        <Input placeholder="物流单号（≥6 位）" value={shipNo} onChange={(e) => setShipNo(e.target.value)} />
      </Modal>

      {/* V7.0 CR-38：商品全字段编辑（含适用人群、核销方式、状态） */}
      <Modal
        open={!!editItem} title={`修改商品 · ${editItem?.name ?? ''}`}
        onCancel={() => setEditItem(null)} onOk={commitEditItem}
        okText="保存" destroyOnClose width={560}
      >
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="商品名称" rules={[{ required: true, message: '请填写商品名称' }]}>
            <Input maxLength={30} />
          </Form.Item>
          <Space size={12} wrap>
            <Form.Item name="points" label="所需积分" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="stock" label="库存" rules={[{ required: true }]}>
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="limit_per_user" label="限购（每人限兑）" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
          </Space>
          <Form.Item name="verify_type" label="核销方式" rules={[{ required: true }]}>
            <Select options={VERIFY_TYPES.map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={SHOP_STATUSES.map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item label="适用人群">
            <ScopePicker value={scopeSubjects} onChange={setScopeSubjects} />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {isAdmin
            ? '库存扣减使用原子操作（乐观锁），防止并发超卖。'
            : '拍板 6-B：当前由组织者编辑（shopOrgEditable 已开启），本次修改会写入审计日志。'}
        </Typography.Text>
      </Modal>
    </Space>
  );
}
