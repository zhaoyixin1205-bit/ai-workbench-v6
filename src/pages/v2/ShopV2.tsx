/**
 * 积分兑换商城 v2（P3-4 C 端域）
 *
 * 业务口径与 v1 一致：库存 / 限购 / 积分三道校验、扣减积分写 pointRecords 与 users、
 * 生成核销码、售罄与已达限购的禁用态文案。仅换商品卡与指标卡视觉。
 */
import { Button, Empty, Modal, Progress, Space, Tag, Typography, App as AntApp } from 'antd';
import { ShoppingOutlined, WalletOutlined } from '@ant-design/icons';
import { Link , useSearchParams} from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useStore } from '@/store/store';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { ShopItem } from '@/mock/types';
import '../../theme/v2/template.css';

export default function ShopV2() {
  const { db, me, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();
  const [detail, setDetail] = useState<ShopItem | null>(null);

  /**
   * V8.3-10.09：支持深链 `/shop?item=<商品id>` 自动打开该商品详情。
   * 个人中心「我的兑换」里的每一行都跳到这里 —— 兑换记录没有独立详情页，
   * 能对应到的只有它买的那件商品。
   */
  /**
   * ⚠️ 必须用 useSearchParams 而不是 window.location.search：
   * 全站是 **HashRouter**（见 main.tsx），`#/shop?item=x` 里的 query 在 hash 内，
   * `location.search` 永远是空字符串 —— 实测踩过，深链静默失效。
   */
  const [sp] = useSearchParams();
  const deepLinkItem = sp.get('item');
  useEffect(() => {
    if (!deepLinkItem) return;
    const item = db.shopItems.find((i) => i.id === deepLinkItem);
    if (item) setDetail(item);
  }, [deepLinkItem, db.shopItems]);

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
        <div style={{ fontSize: 'var(--wb-fs-label)' }}>
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
    <div>
      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">积分兑换商城</div>
          <div className="wb2-ph-d">把积分从「数字」变成「可感知的回报」；兑换物品以系统管理员编辑为准</div>
        </div>
        <div className="wb2-ph-a">
          <Link to="/me?tab=orders"><Button>我的订单</Button></Link>
        </div>
      </div>

      <div className="wb2-metrics">
        <div className="wb2-metric" style={{ background: 'linear-gradient(120deg, var(--wb-primary) 0%, #ff8f5e 100%)', color: '#fff' }}>
          <div className="lb" style={{ color: 'rgba(255,255,255,.92)' }}><WalletOutlined /> 我的可用积分</div>
          <div className="vl" style={{ color: '#fff' }}>{myPoints}</div>
          <div className="sb" style={{ color: 'rgba(255,255,255,.9)' }}>排名还会继续变，快去做任务</div>
        </div>
        <div className="wb2-metric">
          <div className="lb">待核销订单</div>
          <div className="vl">{myOrders.filter((o) => o.status === '待核销').length}</div>
          <div className="sb">30 天内有效</div>
        </div>
        <div className="wb2-metric">
          <div className="lb">可兑换商品</div>
          <div className="vl">{db.shopItems.filter((i) => i.status === '上架').length}</div>
          <div className="sb">库存实时更新</div>
        </div>
        <div className="wb2-metric">
          <div className="lb">赚积分方式</div>
          <div className="vl" style={{ fontSize: 'var(--wb-fs-label)', lineHeight: 1.9, color: 'var(--wb-ink-2)' }}>
            提报作业 <b style={{ color: 'var(--wb-primary-ink)' }}>+50</b> ｜ 认领悬赏 <b style={{ color: 'var(--wb-primary-ink)' }}>+30</b><br />
            专家接诊 <b style={{ color: 'var(--wb-primary-ink)' }}>+20</b> ｜ 社区发帖 <b style={{ color: 'var(--wb-primary-ink)' }}>+2</b>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="wb2-empty">
          <div className="ic">🎁</div>
          <div className="t">暂无上架商品</div>
          <div className="d">管理员上架后会出现在这里</div>
        </div>
      ) : (
        <div className="wb2-sgrid">
          {items.map((i) => {
            const sold = i.status === '售罄' || i.stock <= 0;
            const limited = myExchanged(i.id) >= i.limit_per_user;
            const notEnough = myPoints < i.points;
            return (
              <div key={i.id} className={`wb2-gcard${sold ? ' off' : ''}`} onClick={() => setDetail(i)}>
                <div className="cv">
                  {i.cover}
                  <span className="stk">{sold ? '已售罄' : `库存 ${i.stock}`}</span>
                </div>
                <div className="cb">
                  <Typography.Text strong style={{ fontSize: 'var(--wb-fs-body)', lineHeight: 1.45, color: 'var(--wb-ink-1)' }}>
                    {i.name}
                  </Typography.Text>
                  <div className="wb2-price">{i.points}<u>积分</u></div>
                  <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 6 }}>
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
            );
          })}
        </div>
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
            <div style={{
              fontSize: 40, textAlign: 'center', padding: 12,
              background: 'var(--wb-surface-brand)', borderRadius: 'var(--wb-radius-md)',
            }}>{detail.cover}</div>
            {/* V8.3-10.09：商品描述可能含长链接，需断词防撑破弹窗 */}
            <Typography.Paragraph style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{detail.desc}</Typography.Paragraph>
            <Space wrap>
              <Tag color="orange">{detail.points} 积分</Tag>
              <Tag>库存 {detail.stock}</Tag>
              <Tag>每人限购 {detail.limit_per_user}</Tag>
              <Tag>核销方式：{detail.verify_type}</Tag>
              <Tag>适用人群：{detail.scope}</Tag>
            </Space>
            <div className="wb2-fhint">上下架时间：{detail.on_sale_at} ~ {detail.off_sale_at}</div>
            {myPoints < detail.points && (
              <div className="wb2-quote warn">
                积分不足，还需 <b>{detail.points - myPoints}</b> 积分。去做任务赚积分：提报作业 / 认领悬赏 / 社区发帖。
              </div>
            )}
            <Progress percent={Math.min(100, Math.round((myPoints / detail.points) * 100))} size="small" strokeColor="var(--wb-primary)" />
          </Space>
        )}
      </Modal>
    </div>
  );
}
