import { Badge, Button, Card, Col, Progress, Row, Space, Tag, Typography, Empty, List } from 'antd';
import { useNoteVisible } from '@/auth/annotation';
import {
  ArrowRightOutlined, FireOutlined, TrophyOutlined, ClockCircleOutlined,
  CheckCircleOutlined, TeamOutlined, RocketOutlined, WalletOutlined,
  RiseOutlined, ThunderboltOutlined, BulbOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useStore, useStats } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { CoverBlock, HoverCard, MetricCard, Nudge, TrackTag } from '@/components/ui';
import TeamBoard from '@/components/TeamBoard';
import SceneBoard from '@/components/SceneBoard';
import { buildSceneBoard } from '@/service/sceneBoard';
import AnnounceTicker, { type TickerItem } from '@/components/AnnounceTicker';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { currentStageOf, stageLabel, submitDeadlineOf } from '@/utils/campaignTime';
/* V8.2-10.07：必修作业 To Do */
import { myPendingRequired } from '@/utils/assignmentParticipants';
import dayjs from 'dayjs';

export default function Home() {
  const { db, me, campaign, flags, hasRole } = useStore();
  /** V8.6-10.08：口径 / 规则注解仅运营方与管理员可见 */
  const note = useNoteVisible();

  const stats = useStats();

  /* V7.1：距截止读「作业提报周期」（OPEN 期次）→ 当前阶段 → 届次结束日兜底；倒计时按真实今天 */
  const deadline = submitDeadlineOf(db.periods ?? [], db.assignmentTypes ?? [], campaign);
  const daysLeft = deadline.date ? dayjs(deadline.date).diff(dayjs(), 'day') : null;
  /* 当前阶段按真实今天派生（此前硬编码「W3 · 制作陪跑阶段」，阶段改配置后会失真） */
  const curStage = currentStageOf(campaign.stages);
  const mySubmits = db.submits.filter((s) => s.union_id === me.union_id);
  const mySubmitDone = mySubmits.filter((s) => s.status !== 'DRAFT' && s.status !== 'WITHDRAWN').length;
  const myPoints = db.pointRecords.filter((p) => p.union_id === me.union_id).reduce((a, b) => a + b.points, 0) + me.points;
  const rank = [...db.users].sort((a, b) => b.points - a.points).findIndex((u) => u.union_id === me.union_id) + 1;

  /**
   * V4.1 Moka §7：文案 = 事实 + 一个动作，不写状态
   * 「还没选定场景 → 去挑一个」比「待办：选题」更接近人说话的方式
   */
  /**
   * V8.2-10.07：组织者在「作业管理 · 参加人员」中把我设为「必修」且我尚未提报的作业，
   * 以 To Do 形式置顶提醒（需求原文：必须参加人员名单 → 首页以 TO DO 提醒）。
   */
  const myRequiredTodos = myPendingRequired(db.assignmentTypes ?? [], db.submits, me.union_id)
    .map(({ type }) => ({
      key: `req-${type.id}`, done: false,
      text: `${type.name} 指定你参加（${deadline.date ?? '日期待定'} 前提交）`,
      action: '去提报', to: '/work',
    }));

  const myTodos = [
    ...myRequiredTodos,
    { key: 'topic', done: mySubmits.length > 0, text: '还没选定场景', action: '去挑一个', to: '/cases' },
    /* 已有必修提醒时不再重复展示通用「作业还没交」 */
    ...(myRequiredTodos.length ? [] : [{ key: 'submit', done: mySubmitDone > 0, text: `作业还没交（${deadline.date ?? '日期待定'} 截止）`, action: '去提报', to: '/work' }]),
    { key: 'asset', done: db.assetApplies.some((a) => a.applicant_union_id === me.union_id), text: '作品还没申请入库', action: '去申请', to: '/assets' },
  ].filter((t) => !t.done).slice(0, 3);

  /** V4.1 P4：趋势为演示用固定序列（确定性，便于截图核验与复现） */
  const SPARK = {
    submit: [18, 26, 24, 34, 42, 51, 58, 63],
    points: [120, 180, 240, 300, 340, 420, 480, 520],
    rank: [8, 7, 9, 6, 5, 6, 4, 3],
    activate: [41, 48, 52, 57, 61, 64, 68, 72],
  };

  /** V8-10.07：案例精选改「最新发布优先」—— 新案例（如远程数据分析报告）能在首页露出，而非被 0 热度埋没 */
  const hotCases = [...db.cases].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 5);
  const bounties = db.bounties.filter((b) => b.status === 'PUBLISHED').slice(0, 4);
  const hotPosts = [...db.posts].filter((p) => p.status === '正常').sort((a, b) => b.like_count + b.comment_count * 3 - (a.like_count + a.comment_count * 3)).slice(0, 3);
  /**
   * V6.0 CR-13：公告独立为 announcement 实体，首页公告条以它为唯一数据源。
   * 口径：仅「已发布」且未过期（offline_at 为空＝长期有效）、且已到发布时间。
   * 排序：置顶优先，其次发布时间倒序。
   */
  const announcements = db.announcements
    .filter((a) => a.status === 'PUBLISHED')
    .filter((a) => !a.published_at || !dayjs(a.published_at).isAfter(dayjs(DEMO_TODAY).endOf('day')))
    .filter((a) => !a.offline_at || !dayjs(a.offline_at).isBefore(dayjs(DEMO_TODAY).startOf('day')))
    .sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return dayjs(b.published_at).valueOf() - dayjs(a.published_at).valueOf();
    })
    .slice(0, 5);

  /**
   * V8.5-10.08：场景卡判定搬到共享层 @/service/sceneBoard.ts，v1 / v2 同源。
   * 口径变化（组织者 2026-10-08 拍板）：
   *   ①只展示「本周」发布的已发布卡，不再用案例列表兜底凑数；
   *   ②本周为空时给空态文案 + 案例库入口，不留 chip 的假热闹；
   *   ③「本周」按真实今天的 ISO 周计算（不用 DEMO_TODAY，否则演示基准日会让周次失真）。
   *   ④ V8.8-10.08：分组由「按赛道」改为「一行为一个案例」，行头是案例名小标志，
   *      同一案例的多张卡不再被切到不同行（判定见 service/sceneBoard.ts 的 groupSceneByCase）。
   */
  const sceneBoard = buildSceneBoard(db.sceneCards ?? [], db.cases ?? []);

  const tickerItems: TickerItem[] = announcements.map((a) => ({
    id: a.id,
    title: a.title,
    // 有原帖的公告复用帖子详情页；CR-28 后新建的公告进公告区
    to: a.source_post_id ? `/community/${a.source_post_id}` : '/community',
    pinned: a.pinned,
  }));

  /** CR-13：开关关闭 ≡ V5.0 —— 公告回到右下角列表，首页无独立公告条 */
  const tickerOn = flags.homeAnnounceTicker !== false;
  /** CR-14：社区关闭时悬赏榜独占整行，不得出现半边空白 */
  const rightColOn = flags.community || !tickerOn;

  /**
   * V6.0 CR-15：评委复核入口（仅 JUDGE 角色）。
   * 非 JUDGE 身份下该区块在 DOM 中完全不存在（不是置灰）。
   * 待复核数 = status ∈ {AI_SCORED, REVIEWING} 且当前评委未复核的条数；
   * 为 0 时展示空态而不隐藏卡片，避免评委以为入口消失。
   */
  const judgeEntryOn = flags.homeJudgeEntry !== false && hasRole('JUDGE');
  const judgePendingCount = db.submits.filter(
    (s) => (s.status === 'AI_SCORED' || s.status === 'REVIEWING')
      && !db.scoreResults.some(
        (r) => r.target_type === 'submit' && r.target_id === s.id
          && r.source === 'JUDGE' && r.scorer_union_id === me.union_id
      )
  ).length;

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }} className="wb-fade-in">
      {/* Hero */}
      <div className="wb-banner">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Row align="middle" justify="space-between" gutter={[24, 20]}>
            <Col xs={24} lg={15}>
              <Space size={8} wrap>
                <span style={{
                  background: 'rgba(255,255,255,0.22)', color: '#fff', fontSize: 12, fontWeight: 600,
                  padding: '3px 10px', borderRadius: 8, backdropFilter: 'blur(4px)',
                }}>
                  <RocketOutlined /> {campaign.status}
                </span>
                <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 12 }}>
                  {curStage ? `${stageLabel(curStage.stage)}阶段` : ''}
                </span>
              </Space>

              <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', marginTop: 12, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                {campaign.name}
              </div>
              <div style={{ color: 'rgba(255,255,255,.88)', marginTop: 8, fontSize: 13 }}>
                {campaign.start_date} ~ {campaign.end_date}
                {deadline.date ? ` ｜ 作业提报截止 ${deadline.date}` : ''} ｜ 做出属于你的一件作品，让别人照着就能用
              </div>

              <div style={{ marginTop: 20, maxWidth: 460 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: 12, marginBottom: 6 }}>
                  <span>我的进度 · 提报 {mySubmitDone}/1</span>
                  <span className="num" style={{ fontWeight: 600 }}>
                    {daysLeft === null ? '' : `距截止 ${Math.max(0, daysLeft)} 天`}
                  </span>
                </div>
                <Progress
                  percent={Math.min(100, mySubmitDone * 100)}
                  strokeColor="#fff"
                  trailColor="rgba(255,255,255,.32)"
                  showInfo={false}
                  size={{ height: 8 }}
                  style={{ marginBottom: 0 }}
                />
              </div>
            </Col>

            <Col xs={24} lg={9}>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Link to="/work">
                  <Button
                    size="large" shape="round"
                    style={{
                      background: '#fff', color: COLOR.primary, border: 'none',
                      fontWeight: 700, height: 46, paddingInline: 28, boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                    }}
                  >
                    去提报 <ArrowRightOutlined />
                  </Button>
                </Link>
                <Link to="/cases">
                  <Button
                    size="large" shape="round" ghost
                    style={{ height: 46, paddingInline: 24, borderColor: 'rgba(255,255,255,.6)', color: '#fff' }}
                  >
                    看案例
                  </Button>
                </Link>
              </div>
            </Col>
          </Row>
        </div>
      </div>

      {/* V6.0 CR-13：公告条置顶（Hero 之下、我的待办之上）；无公告时整条不渲染 */}
      {tickerOn && tickerItems.length > 0 && <AnnounceTicker items={tickerItems} />}

      {/* 我的待办 */}
      <Card
        styles={{ body: { padding: 20 } }}
        title={<Space size={8}><ClockCircleOutlined style={{ color: COLOR.primary }} /><span style={{ fontWeight: 700 }}>我的待办</span></Space>}
        extra={<Link to="/me" style={{ color: COLOR.primary, fontSize: 13 }}>全部 <ArrowRightOutlined /></Link>}
      >
        {myTodos.length === 0 ? (
          <Empty description="全部完成，干得漂亮 🎉" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            {myTodos.map((t) => (
              /* V4.1 Moka P6：主动提醒 = 事实 + 一个动作按钮，不做纯告知 */
              <Nudge key={t.key} text={t.text} action={t.action} to={t.to} />
            ))}
          </Space>
        )}
      </Card>

      {/* 数据条 · V4.1 Moka P4：大数字 + 环比 + 迷你趋势 + 口径说明 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <MetricCard
            icon={<RiseOutlined />} label="本届提交率" value={`${stats.submitRate}%`}
            delta={12.4} spark={SPARK.submit}
            hint="分母＝带「干部」或「核心骨干」标签且在职的人数（默认 47 人，来自钉钉《用户标签》名单）；提交过任意一期作业即计入分子，草稿不算。"
            extra={note ? `${stats.submitted}/${stats.cadreCount} 人 · 口径：干部+核心骨干` : `${stats.submitted}/${stats.cadreCount} 人`}
            tone="primary"
          />
        </Col>
        <Col xs={12} lg={6}>
          <MetricCard
            icon={<WalletOutlined />} label="我的积分" value={myPoints}
            delta={8.6} spark={SPARK.points}
            hint="累计积分＝历史积分 ＋ 本届新增；可兑换余额以「可用 X 分」为准。"
            extra={`可用 ${me.points} 分`}
            tone="green"
          />
        </Col>
        <Col xs={12} lg={6}>
          <MetricCard
            icon={<TrophyOutlined />} label="我的排名" value={rank ? `No.${rank}` : '—'}
            delta={2} deltaLabel="较上周提升" spark={SPARK.rank}
            hint="按累计积分降序；同分时按最近一次提报时间先后排列。"
            extra={`共 ${db.users.length} 人参与`}
            tone="purple"
          />
        </Col>
        <Col xs={12} lg={6}>
          <MetricCard
            icon={<ThunderboltOutlined />} label="激活率" value={`${stats.activateRate}%`}
            delta={6.2} spark={SPARK.activate}
            hint="激活＝WorkBuddy 管理后台同步到「活跃天数 > 0」。本系统不自算，取后台同步值。"
            extra={note ? `${stats.activated}/${stats.cadreCount} 人已激活 · 口径：干部+核心骨干` : `${stats.activated}/${stats.cadreCount} 人已激活`}
            tone="blue"
          />
        </Col>
      </Row>

      {/* V4.0 CR-01：我的团队（属性驱动，不带团队时整块不渲染） */}
      <TeamBoard />

      {/* 案例精选 */}
      <div>
        <div className="wb-section-title">
          <Space size={8}>
            <BulbOutlined style={{ color: COLOR.primary }} />
            <span>案例精选</span>
            <span style={{ fontSize: 13, fontWeight: 400, color: COLOR.textMuted }}>30 秒看懂别人做成了什么</span>
          </Space>
          <Link to="/cases" style={{ fontSize: 13, fontWeight: 500, color: COLOR.primary }}>查看全部 <ArrowRightOutlined /></Link>
        </div>
        <div className="wb-scroll-x">
          {hotCases.map((c) => {
            const skillN = flags.caseSkillPackage !== false ? (c.skill_packages?.length ?? 0) : 0;
            return (
              /* V4.1 Moka P1：hover 出最小信息集，省掉「点进去看一眼再退出来」 */
              <HoverCard
                key={c.id}
                placement="bottom"
                content={
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: COLOR.textSub, lineHeight: 1.7 }}>
                      <div>作者：{c.author_name}</div>
                      <div>耗时：{c.duration} · 复用：{c.reuse_count} 次</div>
                      {skillN > 0
                        ? <div style={{ color: '#C2410C', fontWeight: 600 }}>🧩 可直接安装 {skillN} 个 Skill</div>
                        : <div>照着提示词做，30 分钟能出稿</div>}
                    </div>
                  </div>
                }
              >
                {/* V8-10.07：外框大小一致 —— 固定宽 216 + 固定高 196，底部数据条 marginTop:auto 吸底 */}
                <Link to={`/cases/${c.id}`} style={{ flex: '0 0 216px', display: 'block' }}>
                  <div className="wb-card wb-card-hover" style={{ padding: 16, height: 196, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8 }}>
                      <CoverBlock emoji={c.cover} track={c.track} size={40} />
                      <TrackTag track={c.track} level={c.level} />
                    </div>
                    <div style={{
                      fontWeight: 700, fontSize: 15, lineHeight: 1.45, height: 44,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{c.title}</div>
                    <div style={{ color: COLOR.textMuted, fontSize: 12, marginTop: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span><FireOutlined /> {c.view_count}</span>
                      <span>👍 {c.like_count}</span>
                      <span>⏱ {c.duration}</span>
                      {skillN > 0 && <span style={{ color: '#C2410C', fontWeight: 600 }}>🧩 {skillN}</span>}
                    </div>
                  </div>
                </Link>
              </HoverCard>
            );
          })}
        </div>
      </div>

      {/* V6.0 CR-15：评委复核入口（仅 JUDGE 渲染；非 JUDGE 身份 DOM 中不存在） */}
      {judgeEntryOn && (
        <Card
          styles={{ body: { padding: 16 } }}
          title={
            <Space size={8}>
              <CheckCircleOutlined style={{ color: COLOR.primary }} />
              <span style={{ fontWeight: 700 }}>评委复核</span>
              <span style={{ fontSize: 13, fontWeight: 400, color: COLOR.textMuted }}>
                待你复核 {judgePendingCount} 条
              </span>
            </Space>
          }
          extra={<Link to="/admin/judge" style={{ color: COLOR.primary, fontSize: 13 }}>去复核 <ArrowRightOutlined /></Link>}
        >
          {judgePendingCount === 0 ? (
            /* 规则③：为 0 时展示空态而不隐藏卡片，避免评委以为入口消失 */
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无待复核作业，新的作业送出后会在这里出现"
            />
          ) : (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <div style={{ fontSize: 13, color: COLOR.textSub }}>
                有 <b className="num">{judgePendingCount}</b> 条作业已出 AI 分，等待你完成复核与真实性确认。
              </div>
              <Link to="/admin/judge">
                <Button type="primary" size="small">开始复核（{judgePendingCount}）</Button>
              </Link>
            </Space>
          )}
        </Card>
      )}

      {/* V6.0 CR-14：场景卡上移至「案例精选」正下方；V8.5-10.08 改文件夹页签卡九宫格 */}
      <Card
        title={<Space size={8}><span style={{ fontWeight: 700 }}>本周高频场景卡</span><span style={{ fontSize: 13, fontWeight: 400, color: COLOR.textMuted }}>30 秒学一个</span></Space>}
        extra={<Link to="/cases" style={{ fontSize: 13, color: COLOR.primary }}>全部案例 ›</Link>}
      >
        <SceneBoard week={sceneBoard.week} total={sceneBoard.total} bands={sceneBoard.bands} />
      </Card>

      {/* V6.0 CR-14：悬赏榜与社区热帖一行 2 列（各 12 栅格，取消 14/10 非对称） */}
      <Row gutter={[20, 20]}>
        {/* 悬赏榜 */}
        <Col xs={24} lg={rightColOn ? 12 : 24}>
          <Card
            styles={{ body: { paddingTop: 8 } }}
            title={<Space size={8}><TrophyOutlined style={{ color: COLOR.primary }} /><span style={{ fontWeight: 700 }}>悬赏榜</span></Space>}
            extra={<Link to="/bounty" style={{ color: COLOR.primary, fontSize: 13 }}>查看全部</Link>}
          >
            <List
              dataSource={bounties}
              renderItem={(b) => (
                <List.Item
                  actions={[
                    <span key="p" style={{
                      color: '#C2410C', background: COLOR.primaryLight, fontWeight: 700,
                      padding: '4px 10px', borderRadius: 8, fontSize: 13,
                    }} className="num">{b.points} 分</span>,
                  ]}
                  style={{ paddingInline: 0 }}
                >
                  <List.Item.Meta
                    title={<Link to="/bounty" style={{ fontWeight: 600 }}>{b.title}</Link>}
                    description={<Space size={8} style={{ fontSize: 12, color: COLOR.textMuted }}>
                      <TrackTag track={b.track} />
                      <span>截止 {b.due_date}</span>
                      <span>· {b.source}</span>
                    </Space>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* 右列：社区热帖（公告已上移至顶部公告条；开关关闭时公告回到此处 ≡ V5.0） */}
        {rightColOn && (
          <Col xs={24} lg={12}>
            {!tickerOn && (
              <Card
                styles={{ body: { paddingTop: 8 } }}
                title={<Space size={8}><span style={{ fontWeight: 700 }}>📢 公告</span></Space>}
              >
                {announcements.map((a) => (
                  <div key={a.id} style={{ padding: '10px 0', borderBottom: `1px dashed ${COLOR.borderLight}`, fontSize: 13 }}>
                    <Link to={a.source_post_id ? `/community/${a.source_post_id}` : '/community'} style={{ fontWeight: 500 }}>
                      {a.title}
                    </Link>
                  </div>
                ))}
              </Card>
            )}
            {flags.community && (
              <Card
                style={{ marginTop: tickerOn ? 0 : 20 }}
                styles={{ body: { paddingTop: 8 } }}
                title={<Space size={8}><TeamOutlined style={{ color: COLOR.primary }} /><span style={{ fontWeight: 700 }}>社区热帖</span></Space>}
                extra={<Link to="/community" style={{ color: COLOR.primary, fontSize: 13 }}>进入社区</Link>}
              >
                {hotPosts.map((p) => (
                  <Link key={p.id} to={`/community/${p.id}`}>
                    <div style={{ padding: '10px 0', borderBottom: `1px dashed ${COLOR.borderLight}` }}>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{p.title}</div>
                      <Space size={10} style={{ fontSize: 11, color: COLOR.textMuted, marginTop: 4 }}>
                        <span>{p.anonymous ? p.anon_no : p.author_name}</span>
                        <span>👍 {p.like_count}</span>
                        <span>💬 {p.comment_count}</span>
                      </Space>
                    </div>
                  </Link>
                ))}
              </Card>
            )}
          </Col>
        )}
      </Row>
    </Space>
  );
}
