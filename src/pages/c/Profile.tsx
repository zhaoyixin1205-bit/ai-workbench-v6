import { Avatar, Badge, Button, Card, Col, Empty, List, Progress, Row, Space, Statistic, Switch, Table, Tabs, Tag, Typography, App as AntApp } from 'antd';
import { TrophyOutlined, WalletOutlined, BellOutlined, InboxOutlined, CalendarOutlined, FileTextOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { SoftTag, StatCard } from '@/components/ui';
import TeamBoard from '@/components/TeamBoard';
import MyTopics from '@/components/MyTopics';
import { ROLE_LABEL } from '@/mock/types';
import { SubmitStatusTag } from './WorkList';
import { useNoteVisible } from '@/auth/annotation';

/** V4.0 CR-05：兑换订单状态色
 * '待核销' / '已核销' / '已取消' 为 V3.0 原值；'已发货' / '已完成' 为 CR-05 新增 */
const STATUS_COLOR: Record<string, string> = {
  待核销: 'orange', 已核销: 'cyan', 已发货: 'blue', 已完成: 'green', 已取消: 'default',
};

export default function Profile() {
  const { db, me, setDb, flags } = useStore();
  /** V8.6-10.08：技术标识与不可编辑说明仅运营方与管理员可见 */
  const note = useNoteVisible();
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
  /** V4.0 CR-05：兑换四段闭环（下单 → 核销 → 发货 → 完成） */
  const shopV2 = flags.shopV2Flow !== false;

  const rank = [...db.users].sort((a, b) => b.points - a.points).findIndex((u) => u.union_id === me.union_id) + 1;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="wb-card" style={{ padding: 24, background: GRADIENT.primary, color: '#fff', border: 'none', boxShadow: SHADOW.button, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0) 70%)',
        }} />
        <Row gutter={16} align="middle" style={{ position: 'relative', zIndex: 1 }}>
          <Col>
            <Avatar size={64} style={{ background: 'rgba(255,255,255,0.22)', color: '#fff', fontSize: 26, fontWeight: 700, border: '2px solid rgba(255,255,255,0.4)' }}>
              {me.name.slice(0, 1)}
            </Avatar>
          </Col>
          <Col flex="auto">
            <Space size={6} wrap>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{me.name}</span>
              {me.roles.map((r) => (
                <span key={r} style={{
                  background: 'rgba(255,255,255,0.22)', color: '#fff', fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 6,
                }}>{ROLE_LABEL[r]}</span>
              ))}
              {me.tags.map((t) => (
                <span key={t} style={{
                  background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 11,
                  padding: '2px 8px', borderRadius: 6,
                }}>{db.tags.find((x) => x.id === t)?.name}</span>
              ))}
            </Space>
            <div style={{ fontSize: 13, opacity: 0.92, marginTop: 6 }}>
              {me.dept_names[0]} · {me.title} · 工号 {me.job_number}
            </div>
            {note && (
              <div style={{ fontSize: 11, opacity: 0.78, marginTop: 2 }}>
                unionId {me.union_id} · 数据范围 {me.scope_type} · 身份来自钉钉，姓名不可编辑
              </div>
            )}
          </Col>
          <Col>
            <Space size={36}>
              <div style={{ textAlign: 'center' }}>
                <div className="num" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>{me.points}</div>
                <div style={{ fontSize: 11, opacity: 0.9 }}>可用积分</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className="num" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>{rank ? `No.${rank}` : '—'}</div>
                <div style={{ fontSize: 11, opacity: 0.9 }}>本届排名</div>
              </div>
            </Space>
          </Col>
        </Row>
      </div>

      {/* V4.0 CR-01：我的团队（属性驱动，不带团队时整块不渲染） */}
      <TeamBoard />

      <Card>
        <Tabs
          activeKey={tab}
          onChange={(k) => setQs({ tab: k })}
          items={[
            {
              key: 'progress', label: '我的进度',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {[
                    { label: '① 选定场景，提交选题卡', done: mySubmits.length > 0, to: '/cases' },
                    { label: '② 完成第 1 期作业提报', done: mySubmits.some((s) => s.status !== 'DRAFT'), to: '/work' },
                    { label: '③ 优秀作品申请入库', done: db.assetApplies.some((a) => a.applicant_union_id === me.union_id), to: '/assets' },
                  ].map((t) => (
                    <div key={t.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>{t.label}</span>
                        <SoftTag text={t.done ? '已完成' : '待完成'} tone={t.done ? 'green' : 'gray'} />
                      </div>
                      <Progress percent={t.done ? 100 : 0} size="small" strokeColor={COLOR.primary} />
                    </div>
                  ))}
                  <Link to="/work"><Button type="primary">继续做作业</Button></Link>
                </Space>
              ),
            },
            /** V4.0 CR-04：开关 topic.myTopics 关闭时不渲染该 Tab（回到 V3.0） */
            ...(flags.topicMyTopics !== false ? [{
              key: 'topics',
              label: `我的选题（${db.topicSelections.filter((s) => s.union_id === me.union_id).length}）`,
              children: <MyTopics />,
            }] : []),
            {
              key: 'points', label: '我的积分',
              children: (
                <>
                  <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                    <Col xs={24} sm={8}><StatCard label="累计获得" value={earned} tone="green" sub="积分入账合计" /></Col>
                    <Col xs={24} sm={8}><StatCard label="累计消耗" value={Math.abs(spent)} tone="purple" sub="兑换与核销合计" /></Col>
                    <Col xs={24} sm={8}><StatCard label="当前余额" value={me.points} tone="primary" sub="可用于积分商城兑换" /></Col>
                  </Row>
                  <Table
                    size="small" pagination={false} rowKey="id"
                    dataSource={myPoints}
                    columns={[
                      { title: '来源', dataIndex: 'source' },
                      { title: '积分', dataIndex: 'points', render: (v: number) => <span className="num" style={{ color: v > 0 ? COLOR.success : COLOR.error }}>{v > 0 ? '+' : ''}{v}</span> },
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
                <List
                  dataSource={mySubmits}
                  renderItem={(s) => (
                    <List.Item actions={[<SubmitStatusTag key="s" status={s.status} />]}>
                      <List.Item.Meta
                        title={<Link to={`/work/${s.id}`}>{s.title}</Link>}
                        description={<span style={{ fontSize: 12 }}>编号 {s.code} · {s.track} · {s.channel}{s.final_score !== undefined ? ` · ${s.final_score} 分` : ''}</span>}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'booking', label: `我的预约（${myBookings.length}）`,
              children: myBookings.length === 0 ? <Empty description="暂无预约" /> : (
                <List
                  dataSource={myBookings}
                  renderItem={(b) => (
                    <List.Item actions={[<Tag key="s" color={b.status === '已完成' ? 'green' : 'orange'}>{b.status}</Tag>]}>
                      <List.Item.Meta
                        avatar={<CalendarOutlined />}
                        title={`${b.expert_name} · ${b.date} ${b.slot}`}
                        description={b.question}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'posts', label: `我的帖子（${myPosts.length}）`,
              children: myPosts.length === 0 ? <Empty description="还没发过帖" /> : (
                <List
                  dataSource={myPosts}
                  renderItem={(p) => (
                    <List.Item actions={[<Tag key="a">{p.anonymous ? '匿名' : '实名'}</Tag>]}>
                      <List.Item.Meta
                        avatar={<FileTextOutlined />}
                        title={<Link to={`/community/${p.id}`}>{p.title}</Link>}
                        description={<span style={{ fontSize: 12 }}>{p.board_name} · 👍{p.like_count} · 💬{p.comment_count}</span>}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'bounty', label: `我的悬赏（${myBounties.length}）`,
              children: myBounties.length === 0 ? <Empty description="暂无悬赏" /> : (
                <List
                  dataSource={myBounties}
                  renderItem={(b) => (
                    <List.Item actions={[<Tag key="p" color="orange">{b.points} 分</Tag>]}>
                      <List.Item.Meta
                        title={b.owner_union_id === me.union_id ? `我发布：${b.title}` : `我认领：${b.title}`}
                        description={<span style={{ fontSize: 12 }}>{b.status} · 截止 {b.due_date}</span>}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'orders', label: `我的兑换（${myOrders.length}）`,
              children: myOrders.length === 0 ? <Empty description="暂无兑换订单" /> : (
                <List
                  dataSource={myOrders}
                  renderItem={(o) => (
                    <List.Item
                      actions={[
                        <Tag key="s" color={STATUS_COLOR[o.status] ?? 'default'}>{o.status}</Tag>,
                        o.status === '待核销' ? (
                          <Button key="c" size="small" danger onClick={() => {
                            setDb((p) => ({
                              ...p,
                              shopOrders: p.shopOrders.map((x) => (x.id === o.id ? { ...x, status: '已取消' } : x)),
                              pointRecords: [{ id: `PR${Date.now()}`, union_id: me.union_id, name: me.name, source: '取消兑换退回', points: o.points_cost, campaign_id: 'C2026Q4', remark: `取消 ${o.item_name}`, created_at: '2026-09-25' }, ...p.pointRecords],
                            }));
                            message.success('已取消，积分原额退回');
                          }}>取消</Button>
                        ) : null,
                        shopV2 && o.status === '已发货' ? (
                          <Button key="r" size="small" type="primary" onClick={() => {
                            setDb((p) => ({
                              ...p,
                              shopOrders: p.shopOrders.map((x) => (x.id === o.id ? { ...x, status: '已完成' } : x)),
                            }));
                            message.success('已确认收货，兑换闭环完成');
                          }}>确认收货</Button>
                        ) : null,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<InboxOutlined />}
                        title={o.item_name}
                        description={(
                          <span style={{ fontSize: 12 }}>
                            核销码 <b>{o.code}</b> · {o.points_cost} 积分 · {o.created_at}
                            {/* V4.0 CR-05：兑换闭环物流信息 */}
                            {shopV2 && o.shipping_no && <> · 物流单号 <b>{o.shipping_no}</b>（{o.shipping_at}）</>}
                            {shopV2 && o.status === '已发货' && <span style={{ color: '#2563EB' }}> · 已发货，收货后请确认</span>}
                          </span>
                        )}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'message', label: <Badge count={myMessages.filter((m) => m.status === '未读').length} size="small">消息中心</Badge>,
              children: (
                <>
                  <List
                    dataSource={myMessages}
                    renderItem={(m) => (
                      <List.Item actions={[<Tag key="c">{m.channel}</Tag>, m.status === '未读' ? <Tag key="u" color="orange">未读</Tag> : null]}>
                        <List.Item.Meta
                          avatar={<BellOutlined />}
                          title={m.title}
                          description={<span style={{ fontSize: 12 }}>{m.content}（{m.sent_at}）</span>}
                        />
                      </List.Item>
                    )}
                  />
                  <Card size="small" title="消息订阅设置" style={{ marginTop: 12 }}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {[
                        { k: '提报截止提醒', required: true },
                        { k: '评分完成', required: true },
                        { k: '抽查通知', required: true },
                        { k: '新案例 / 场景卡', required: false },
                        { k: '社区互动（1 小时聚合）', required: false },
                        { k: '商城上新', required: false },
                      ].map((s) => (
                        <div key={s.k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13 }}>
                            {s.k}
                            {s.required && <Tag color="orange" style={{ marginLeft: 6 }}>关键节点·不可关闭</Tag>}
                          </span>
                          <Switch size="small" defaultChecked disabled={s.required} />
                        </div>
                      ))}
                    </Space>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      同一用户同一类型消息 24 小时内最多触发 1 次；群通知失败自动降级为待办。
                    </Typography.Text>
                  </Card>
                </>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
