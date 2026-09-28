import { Alert, Button, Card, Col, Input, InputNumber, Modal, Row, Select, Space, Statistic, Table, Tabs, Tag, Typography, Form, App as AntApp } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker, { ScopeText, useScopeCommit } from '@/components/ScopePicker';
import type { ScopeSubject, ShopItem } from '@/mock/types';

/** '待核销'/'已核销'/'已取消' 为 V3.0 原值；'已发货'/'已完成' 为 V4.0 CR-05 新增 */
const STATUS_COLOR: Record<string, string> = {
  待核销: 'orange', 已核销: 'cyan', 已发货: 'blue', 已完成: 'green', 已取消: 'default',
};

export default function ShopAdmin() {
  const { db, setDb, me, hasRole, log, flags } = useStore();
  const { message, modal } = AntApp.useApp();
  /** V4.0 CR-05：兑换四段闭环（下单 → 核销 → 发货 → 完成） */
  const shopV2 = flags.shopV2Flow !== false;
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
  const orders = db.shopOrders;

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
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" disabled={!isAdmin} onClick={() => { form.resetFields(); setScopeSubjects([]); setOpen(true); }}>新建商品</Button>
                    {!isAdmin && <Typography.Text type="secondary" style={{ fontSize: 12 }}>商品编辑需 ADMIN 权限</Typography.Text>}
                  </Space>
                  <Table
                    size="small" rowKey="id" pagination={false} dataSource={db.shopItems}
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
                            <Button size="small" type="link" disabled={!isAdmin} onClick={() => message.info('库存扣减使用原子操作（乐观锁），防止并发超卖')}>编辑</Button>
                            <Button size="small" type="link" disabled={!isAdmin} onClick={() => {
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
    </Space>
  );
}
