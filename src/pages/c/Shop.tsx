import { Badge, Button, Card, Col, Empty, InputNumber, Modal, Progress, Row, Space, Statistic, Tag, Typography, App as AntApp, message as staticMsg } from 'antd';
import { GiftOutlined, ShoppingOutlined, WalletOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { ShopItem } from '@/mock/types';

export default function Shop() {
  const { db, me, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();
  const [detail, setDetail] = useState<ShopItem | null>(null);

  const myPoints = me.points;
  const myOrders = db.shopOrders.filter((o) => o.union_id === me.union_id);
  const myExchanged = (itemId: string) => myOrders.filter((o) => o.item_id === itemId && o.status !== '已取消').length;

  const exchange = (item: ShopItem) => {
    if (item.stock <= 0) { message.error('库存不足'); return; }
    if (myPoints < item.points) { message.error(`积分不足，还需 ${item.points - myPoints} 积分`); return; }
    if (myExchanged(item.id) >= item.limit_per_user) { message.error(`已达每人限购 ${item.limit_per_user} 件`); return; }
    modal.confirm({
      title: '确认兑换',
      content: (
        <div style={{ fontSize: 13 }}>
          <div>商品：{item.name}</div>
          <div>所需积分：<b>{item.points}</b></div>
          <div>兑换后余额：<b>{myPoints - item.points}</b></div>
          <div>核销方式：{item.verify_type}</div>
        </div>
      ),
      okText: '确认兑换',
      onOk: () => {
        const code = `VF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        setDb((p) => ({
          ...p,
          shopOrders: [{
            id: `O${Date.now()}`, item_id: item.id, item_name: item.name, union_id: me.union_id,
            name: me.name, points_cost: item.points, status: '待核销', code, created_at: DEMO_TODAY,
          }, ...p.shopOrders],
          shopItems: p.shopItems.map((x) => (x.id === item.id ? { ...x, stock: x.stock - 1, exchanged_count: x.exchanged_count + 1, status: x.stock - 1 === 0 ? '售罄' : x.status } : x)),
          pointRecords: [{ id: `PR${Date.now()}`, union_id: me.union_id, name: me.name, source: '兑换扣减', points: -item.points, campaign_id: 'C2026Q4', remark: `兑换 ${item.name}`, created_at: DEMO_TODAY }, ...p.pointRecords],
          users: p.users.map((u) => (u.union_id === me.union_id ? { ...u, points: u.points - item.points } : u)),
        }));
        log('积分兑换', item.name, `扣减 ${item.points} 积分，核销码 ${code}`);
        message.success(`兑换成功！核销码 ${code}，请在 30 天内联系组织者核销`);
        setDetail(null);
      },
    });
  };

  const items = db.shopItems.filter((i) => i.status === '上架' || i.status === '售罄');

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row justify="space-between" align="bottom">
        <Col>
          <Typography.Title level={3} style={{ marginBottom: 6, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>积分兑换商城</Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: COLOR.textSub }}>
            把积分从「数字」变成「可感知的回报」；兑换物品以系统管理员编辑为准
          </Typography.Text>
        </Col>
        <Col><Link to="/me?tab=orders"><Button size="large">我的订单</Button></Link></Col>
      </Row>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="wb-card" style={{ padding: 18, background: GRADIENT.primary, color: '#fff', border: 'none', boxShadow: SHADOW.button }}>
          <div style={{ fontSize: 13, opacity: 0.92 }}><WalletOutlined /> 我的可用积分</div>
          <div className="num" style={{ fontSize: 34, fontWeight: 800, marginTop: 6, letterSpacing: '-0.02em' }}>{myPoints}</div>
          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>排名还会继续变，快去做任务</div>
        </div>
        <div className="wb-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: COLOR.textSub }}>待核销订单</div>
          <div className="num wb-metric" style={{ marginTop: 6 }}>{myOrders.filter((o) => o.status === '待核销').length}</div>
          <div style={{ fontSize: 11, color: COLOR.textMuted }}>30 天内有效</div>
        </div>
        <div className="wb-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: COLOR.textSub }}>可兑换商品</div>
          <div className="num wb-metric" style={{ marginTop: 6 }}>{db.shopItems.filter((i) => i.status === '上架').length}</div>
          <div style={{ fontSize: 11, color: COLOR.textMuted }}>库存实时更新</div>
        </div>
        <div className="wb-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: COLOR.textSub }}>赚积分方式</div>
          <div style={{ fontSize: 12, color: COLOR.textSub, marginTop: 8, lineHeight: 1.9 }}>
            提报作业 <b className="num" style={{ color: COLOR.primary }}>+50</b> ｜ 认领悬赏 <b className="num" style={{ color: COLOR.primary }}>+30</b><br />
            专家接诊 <b className="num" style={{ color: COLOR.primary }}>+20</b> ｜ 社区发帖 <b className="num" style={{ color: COLOR.primary }}>+2</b>
          </div>
        </div>
      </div>

      {items.length === 0 ? <Card><Empty description="暂无上架商品" /></Card> : (
        <Row gutter={[16, 16]}>
          {items.map((i) => {
            const sold = i.status === '售罄' || i.stock <= 0;
            const limited = myExchanged(i.id) >= i.limit_per_user;
            const notEnough = myPoints < i.points;
            return (
              <Col xs={12} sm={8} lg={6} key={i.id}>
                <div
                  className="wb-card wb-card-hover"
                  style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', opacity: sold ? 0.72 : 1 }}
                  onClick={() => setDetail(i)}
                >
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 52, background: GRADIENT.metric,
                    }}>{i.cover}</div>
                    <span style={{
                      position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 600,
                      background: sold ? '#F3F4F6' : '#FFF1EB', color: sold ? COLOR.textSub : '#C2410C',
                      padding: '2px 8px', borderRadius: 6,
                    }}>{sold ? '已售罄' : `库存 ${i.stock}`}</span>
                  </div>
                  <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography.Text strong style={{ fontSize: 14, lineHeight: 1.45 }}>{i.name}</Typography.Text>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
                      <span className="num" style={{ fontSize: 24, fontWeight: 800, color: COLOR.primary, letterSpacing: '-0.02em' }}>{i.points}</span>
                      <span style={{ fontSize: 12, color: COLOR.textMuted }}>积分</span>
                    </div>
                    <div style={{ fontSize: 11, color: COLOR.textMuted, marginTop: 6 }}>
                      限购 {i.limit_per_user} 件/人 · {i.verify_type}
                    </div>
                    <Button
                      block type={sold || limited ? 'default' : 'primary'} style={{ marginTop: 12 }}
                      disabled={sold || limited}
                      icon={<ShoppingOutlined />}
                      onClick={(e) => { e.stopPropagation(); setDetail(i); }}
                    >
                      {sold ? '已售罄' : limited ? '已达限购' : notEnough ? `还需 ${i.points - myPoints} 积分` : '立即兑换'}
                    </Button>
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      )}

      <Modal
        open={!!detail} title={detail?.name} onCancel={() => setDetail(null)}
        footer={[
          <Button key="c" onClick={() => setDetail(null)}>关闭</Button>,
          <Button
            key="e" type="primary" disabled={!detail || detail.stock === 0 || myExchanged(detail.id) >= detail.limit_per_user}
            onClick={() => exchange(detail!)}
          >立即兑换</Button>,
        ]}
      >
        {detail && (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <div style={{ fontSize: 40, textAlign: 'center', padding: 12, background: COLOR.primaryLight, borderRadius: 8 }}>{detail.cover}</div>
            <Typography.Paragraph>{detail.desc}</Typography.Paragraph>
            <Space wrap>
              <Tag color="orange">{detail.points} 积分</Tag>
              <Tag>库存 {detail.stock}</Tag>
              <Tag>每人限购 {detail.limit_per_user}</Tag>
              <Tag>核销方式：{detail.verify_type}</Tag>
              <Tag>适用人群：{detail.scope}</Tag>
            </Space>
            <div style={{ fontSize: 12, color: COLOR.textSub }}>
              上下架时间：{detail.on_sale_at} ~ {detail.off_sale_at}
            </div>
            {myPoints < detail.points && (
              <div style={{ padding: 8, background: '#FFF7ED', borderRadius: 8, fontSize: 12, color: '#B45309' }}>
                积分不足，还需 <b>{detail.points - myPoints}</b> 积分。去做任务赚积分：提报作业 / 认领悬赏 / 社区发帖。
              </div>
            )}
            <Progress percent={Math.min(100, Math.round((myPoints / detail.points) * 100))} size="small" strokeColor={COLOR.primary} />
          </Space>
        )}
      </Modal>
    </Space>
  );
}
