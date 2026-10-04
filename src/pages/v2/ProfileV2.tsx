/**
 * 个人中心 v2（P3-4 C 端域）
 *
 * 业务口径与 v1 一致：8 个 Tab（我的选题受 flags.topicMyTopics 控制是否渲染）、
 * 兑换四段闭环（下单 → 核销 → 发货 → 完成，受 flags.shopV2Flow 控制）、
 * 取消订单原额退回、消息订阅三项关键节点不可关闭。
 */
import { Badge, Button, Empty, Progress, Switch, Table, Tabs, Tag, Typography, App as AntApp } from 'antd';
import { BellOutlined, CalendarOutlined, FileTextOutlined, InboxOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/store';
import { SoftTag } from '@/components/ui';
import TeamBoard from '@/components/TeamBoard';
import MyTopics from '@/components/MyTopics';
import { ROLE_LABEL } from '@/mock/types';
import { SubmitStatusTag } from '@/pages/c/WorkList';
import '../../theme/v2/template.css';

/** CR-05：兑换订单状态色（'已发货' / '已完成' 为 CR-05 新增） */
const STATUS_COLOR: Record<string, string> = {
  待核销: 'orange', 已核销: 'cyan', 已发货: 'blue', 已完成: 'green', 已取消: 'default',
};

export default function ProfileV2() {
  const { db, me, setDb, flags } = useStore();
  const { message } = AntApp.useApp();
  const [qs, setQs] = useSearchParams();
  const tab = qs.get('tab') ?? 'progress';

  const myPoints = db.pointRecords.filter((p) => p.union_id === me.union_id);
  const earned = myPoints.filter((p) => p.points > 0).reduce((a, b) => a + b.points, 0);
  const spent = myPoints.filter((p) => p.points < 0).reduce((a, b) => a + b.points, 0);
  const mySubmits = db.submits.filter((s) => s.union_id === me.union_id);
  const myPosts = db.posts.filter((p) => p.union_id === me.union_id);
  const myBookings = db.bookings.filter((b) => b.union_id === me.union_id);
  const myOrders = db.shopOrders.filter((o) => o.union_id === me.union_id);
  const myBounties = db.bounties.filter((b) => b.owner_union_id === me.union_id || b.claimant_union_id === me.union_id);
  const myMessages = db.messages.filter((m) => m.union_id === 'all' || m.union_id === me.union_id);
  /** CR-05：兑换四段闭环开关 */
  const shopV2 = flags.shopV2Flow !== false;

  const rank = [...db.users].sort((a, b) => b.points - a.points).findIndex((u) => u.union_id === me.union_id) + 1;

  return (
    <div className="wb2-page">
      {/* 身份卡（品牌带 + 零投影） */}
      <div className="wb2-hero">
        <div className="row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--wb-space-5)', flex: '1 1 420px', minWidth: 0 }}>
            <div className="wb2-av lg" style={{
              background: 'rgba(255,255,255,0.22)', color: '#fff',
              border: '2px solid rgba(255,255,255,0.4)', fontSize: 26,
            }}>{me.name.slice(0, 1)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>{me.name}</span>
                {me.roles.map((r) => <span key={r} className="pill">{ROLE_LABEL[r]}</span>)}
                {me.tags.map((t) => (
                  <span key={t} className="pill" style={{ background: 'rgba(255,255,255,0.14)', fontWeight: 400 }}>
                    {db.tags.find((x) => x.id === t)?.name}
                  </span>
                ))}
              </div>
              <div className="sub" style={{ marginTop: 6 }}>
                {me.dept_names[0]} · {me.title} · 工号 {me.job_number}
              </div>
              <div className="sub" style={{ opacity: 0.78 }}>
                unionId {me.union_id} · 数据范围 {me.scope_type} · 身份来自钉钉，姓名不可编辑
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--wb-space-8)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{me.points}</div>
              <div className="sub">可用积分</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{rank ? `No.${rank}` : '—'}</div>
              <div className="sub">本届排名</div>
            </div>
          </div>
        </div>
      </div>

      {/* CR-01：我的团队（属性驱动，不带团队时整块不渲染） */}
      <TeamBoard />

      <section className="wb2-card">
        <Tabs
          activeKey={tab}
          onChange={(k) => setQs({ tab: k })}
          items={[
            {
              key: 'progress', label: '我的进度',
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wb-space-4)' }}>
                  {[
                    { label: '① 选定场景，提交选题卡', done: mySubmits.length > 0, to: '/cases' },
                    { label: '② 完成第 1 期作业提报', done: mySubmits.some((s) => s.status !== 'DRAFT'), to: '/work' },
                    { label: '③ 优秀作品申请入库', done: db.assetApplies.some((a) => a.applicant_union_id === me.union_id), to: '/assets' },
                  ].map((t) => (
                    <div key={t.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--wb-fs-label)', marginBottom: 6 }}>
                        <span>{t.label}</span>
                        <SoftTag text={t.done ? '已完成' : '待完成'} tone={t.done ? 'green' : 'gray'} />
                      </div>
                      <Progress percent={t.done ? 100 : 0} size="small" strokeColor="var(--wb-primary)" />
                    </div>
                  ))}
                  <Link to="/work"><Button type="primary">继续做作业</Button></Link>
                </div>
              ),
            },
            /** CR-04：开关 topicMyTopics 关闭时不渲染该 Tab（回到 V3.0） */
            ...(flags.topicMyTopics !== false ? [{
              key: 'topics',
              label: `我的选题（${db.topicSelections.filter((s) => s.union_id === me.union_id).length}）`,
              children: <MyTopics />,
            }] : []),
            {
              key: 'points', label: '我的积分',
              children: (
                <>
                  <div className="wb2-metrics c3" style={{ marginBottom: 'var(--wb-space-5)' }}>
                    <div className="wb2-metric">
                      <div className="lb">累计获得</div>
                      <div className="vl" style={{ color: 'var(--wb-success)' }}>{earned}</div>
                      <div className="sb">积分入账合计</div>
                    </div>
                    <div className="wb2-metric">
                      <div className="lb">累计消耗</div>
                      <div className="vl">{Math.abs(spent)}</div>
                      <div className="sb">兑换与核销合计</div>
                    </div>
                    <div className="wb2-metric">
                      <div className="lb">当前余额</div>
                      <div className="vl accent">{me.points}</div>
                      <div className="sb">可用于积分商城兑换</div>
                    </div>
                  </div>
                  <Table
                    size="small" pagination={false} rowKey="id" dataSource={myPoints}
                    columns={[
                      { title: '来源', dataIndex: 'source' },
                      { title: '积分', dataIndex: 'points', render: (v: number) => <span style={{ color: v > 0 ? 'var(--wb-success)' : 'var(--wb-error)' }}>{v > 0 ? '+' : ''}{v}</span> },
                      { title: '说明', dataIndex: 'remark' },
                      { title: '时间', dataIndex: 'created_at' },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'works', label: `我的作品（${mySubmits.length}）`,
              children: mySubmits.length === 0 ? <Empty description="还没有提报记录" /> : (
                <div className="wb2-list">
                  {mySubmits.map((s) => (
                    <Link key={s.id} to={`/work/${s.id}`} style={{ display: 'block', color: 'inherit' }}>
                      <div className="wb2-li">
                        <div className="wb2-li-m">
                          <div className="wb2-li-t">{s.title}</div>
                          <div className="wb2-li-s">编号 {s.code} · {s.track} · {s.channel}{s.final_score !== undefined ? ` · ${s.final_score} 分` : ''}</div>
                        </div>
                        <div className="wb2-li-r"><SubmitStatusTag status={s.status} /></div>
                      </div>
                    </Link>
                  ))}
                </div>
              ),
            },
            {
              key: 'booking', label: `我的预约（${myBookings.length}）`,
              children: myBookings.length === 0 ? <Empty description="暂无预约" /> : (
                <div className="wb2-list">
                  {myBookings.map((b) => (
                    <div key={b.id} className="wb2-li">
                      <div className="wb2-li-m">
                        <div className="wb2-li-t"><CalendarOutlined /> {b.expert_name} · {b.date} {b.slot}</div>
                        <div className="wb2-li-s">{b.question}</div>
                      </div>
                      <div className="wb2-li-r">
                        <Tag color={b.status === '已完成' ? 'green' : 'orange'}>{b.status}</Tag>
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'posts', label: `我的帖子（${myPosts.length}）`,
              children: myPosts.length === 0 ? <Empty description="还没发过帖" /> : (
                <div className="wb2-list">
                  {myPosts.map((p) => (
                    <Link key={p.id} to={`/community/${p.id}`} style={{ display: 'block', color: 'inherit' }}>
                      <div className="wb2-li">
                        <div className="wb2-li-m">
                          <div className="wb2-li-t"><FileTextOutlined /> {p.title}</div>
                          <div className="wb2-li-s">{p.board_name} · 👍{p.like_count} · 💬{p.comment_count}</div>
                        </div>
                        <div className="wb2-li-r"><Tag>{p.anonymous ? '匿名' : '实名'}</Tag></div>
                      </div>
                    </Link>
                  ))}
                </div>
              ),
            },
            {
              key: 'bounty', label: `我的悬赏（${myBounties.length}）`,
              children: myBounties.length === 0 ? <Empty description="暂无悬赏" /> : (
                <div className="wb2-list">
                  {myBounties.map((b) => (
                    <div key={b.id} className="wb2-li">
                      <div className="wb2-li-m">
                        <div className="wb2-li-t">{b.owner_union_id === me.union_id ? `我发布：${b.title}` : `我认领：${b.title}`}</div>
                        <div className="wb2-li-s">{b.status} · 截止 {b.due_date}</div>
                      </div>
                      <div className="wb2-li-r"><Tag color="orange">{b.points} 分</Tag></div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'orders', label: `我的兑换（${myOrders.length}）`,
              children: myOrders.length === 0 ? <Empty description="暂无兑换订单" /> : (
                <div className="wb2-list">
                  {myOrders.map((o) => (
                    <div key={o.id} className="wb2-li" style={{ alignItems: 'flex-start' }}>
                      <div className="wb2-li-m">
                        <div className="wb2-li-t"><InboxOutlined /> {o.item_name}</div>
                        <div className="wb2-li-s">
                          核销码 <b>{o.code}</b> · {o.points_cost} 积分 · {o.created_at}
                          {shopV2 && o.shipping_no && <> · 物流单号 <b>{o.shipping_no}</b>（{o.shipping_at}）</>}
                          {shopV2 && o.status === '已发货' && <span style={{ color: 'var(--wb-info)' }}> · 已发货，收货后请确认</span>}
                        </div>
                      </div>
                      <div className="wb2-li-r" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Tag color={STATUS_COLOR[o.status] ?? 'default'}>{o.status}</Tag>
                        {o.status === '待核销' && (
                          <Button size="small" danger onClick={() => {
                            setDb((p) => ({
                              ...p,
                              shopOrders: p.shopOrders.map((x) => (x.id === o.id ? { ...x, status: '已取消' } : x)),
                              pointRecords: [{ id: `PR${Date.now()}`, union_id: me.union_id, name: me.name, source: '取消兑换退回', points: o.points_cost, campaign_id: 'C2026Q4', remark: `取消 ${o.item_name}`, created_at: '2026-09-25' }, ...p.pointRecords],
                            }));
                            message.success('已取消，积分原额退回');
                          }}>取消</Button>
                        )}
                        {shopV2 && o.status === '已发货' && (
                          <Button size="small" type="primary" onClick={() => {
                            setDb((p) => ({
                              ...p,
                              shopOrders: p.shopOrders.map((x) => (x.id === o.id ? { ...x, status: '已完成' } : x)),
                            }));
                            message.success('已确认收货，兑换闭环完成');
                          }}>确认收货</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'message',
              label: <Badge count={myMessages.filter((m) => m.status === '未读').length} size="small">消息中心</Badge>,
              children: (
                <>
                  <div className="wb2-list">
                    {myMessages.map((m) => (
                      <div key={m.id} className="wb2-li">
                        <div className="wb2-li-m">
                          <div className="wb2-li-t"><BellOutlined /> {m.title}</div>
                          <div className="wb2-li-s">{m.content}（{m.sent_at}）</div>
                        </div>
                        <div className="wb2-li-r" style={{ display: 'flex', gap: 6 }}>
                          <Tag>{m.channel}</Tag>
                          {m.status === '未读' && <Tag color="orange">未读</Tag>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <section className="wb2-card" style={{ marginTop: 'var(--wb-space-5)', background: 'var(--wb-surface-sunken)' }}>
                    <div className="wb2-sechd"><div className="t">消息订阅设置</div></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wb-space-3)' }}>
                      {[
                        { k: '提报截止提醒', required: true },
                        { k: '评分完成', required: true },
                        { k: '抽查通知', required: true },
                        { k: '新案例 / 场景卡', required: false },
                        { k: '社区互动（1 小时聚合）', required: false },
                        { k: '商城上新', required: false },
                      ].map((s) => (
                        <div key={s.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 'var(--wb-fs-label)' }}>
                            {s.k}
                            {s.required && <Tag color="orange" style={{ marginLeft: 6 }}>关键节点·不可关闭</Tag>}
                          </span>
                          <Switch size="small" defaultChecked disabled={s.required} />
                        </div>
                      ))}
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 10 }}>
                      同一用户同一类型消息 24 小时内最多触发 1 次；群通知失败自动降级为待办。
                    </Typography.Text>
                  </section>
                </>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
