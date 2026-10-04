/**
 * 首页 v2（P3-4 C 端域）
 *
 * 改版原则（沿用 P3-3 范式）：
 *   ①业务口径、数据源、开关语义与 v1 完全一致（announcements / sceneCards / 待办 / 评委复核）
 *   ②仅换视觉外壳：Hero 品牌带、指标卡令牌化、区块标题统一、卡片零投影
 *   ③AnnounceTicker / TeamBoard 为 v1 既有组件，直接复用不复制
 */
import { Button, Empty, Progress } from 'antd';
import {
  ArrowRightOutlined, CheckCircleOutlined, ClockCircleOutlined,
  FireOutlined, RocketOutlined, TeamOutlined, TrophyOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useStore, useStats } from '@/store/store';
import TeamBoard from '@/components/TeamBoard';
import AnnounceTicker, { type TickerItem } from '@/components/AnnounceTicker';
import { DEMO_TODAY } from '@/mock/seedBiz';
import dayjs from 'dayjs';
import '../../theme/v2/template.css';

/** V4.1 P4：趋势为演示用固定序列（与 v1 同源，确定性便于截图核验） */
const SPARK = {
  submit: [18, 26, 24, 34, 42, 51, 58, 63],
  points: [120, 180, 240, 300, 340, 420, 480, 520],
  rank: [8, 7, 9, 6, 5, 6, 4, 3],
  activate: [41, 48, 52, 57, 61, 64, 68, 72],
};

/** 8 点迷你趋势（与 v1 MetricCard 同款，纯 SVG 无依赖） */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 64},${16 - ((v - min) / span) * 14}`).join(' ');
  return (
    <svg width="64" height="18" viewBox="0 0 64 18" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return <span style={{ color: up ? 'var(--wb-success)' : 'var(--wb-ink-3)', fontSize: 'var(--wb-fs-caption)', fontWeight: 600 }}>{up ? '↑' : '↓'} {Math.abs(v)}%</span>;
}

export default function HomeV2() {
  const { db, me, campaign, flags, hasRole } = useStore();
  const stats = useStats();

  const daysLeft = dayjs(campaign.end_date).diff(dayjs(DEMO_TODAY), 'day');
  const mySubmits = db.submits.filter((s) => s.union_id === me.union_id);
  const mySubmitDone = mySubmits.filter((s) => s.status !== 'DRAFT' && s.status !== 'WITHDRAWN').length;
  const myPoints = db.pointRecords.filter((p) => p.union_id === me.union_id).reduce((a, b) => a + b.points, 0) + me.points;
  const rank = [...db.users].sort((a, b) => b.points - a.points).findIndex((u) => u.union_id === me.union_id) + 1;

  /** V4.1 Moka §7：文案 = 事实 + 一个动作，不写状态 */
  const myTodos = [
    { key: 'topic', done: mySubmits.length > 0, text: '还没选定场景', action: '去挑一个', to: '/cases' },
    { key: 'submit', done: mySubmitDone > 0, text: `第 1 期作业还没交（${campaign.end_date} 截止）`, action: '去提报', to: '/work' },
    { key: 'asset', done: db.assetApplies.some((a) => a.applicant_union_id === me.union_id), text: '作品还没申请入库', action: '去申请', to: '/assets' },
  ].filter((t) => !t.done).slice(0, 3);

  const hotCases = [...db.cases].sort((a, b) => b.view_count - a.view_count).slice(0, 5);
  const bounties = db.bounties.filter((b) => b.status === 'PUBLISHED').slice(0, 4);
  const hotPosts = [...db.posts]
    .filter((p) => p.status === '正常')
    .sort((a, b) => b.like_count + b.comment_count * 3 - (a.like_count + a.comment_count * 3))
    .slice(0, 3);

  /** V6.0 CR-13：公告独立实体为唯一数据源；置顶优先、其次发布时间倒序 */
  const announcements = db.announcements
    .filter((a) => a.status === 'PUBLISHED')
    .filter((a) => !a.published_at || !dayjs(a.published_at).isAfter(dayjs(DEMO_TODAY).endOf('day')))
    .filter((a) => !a.offline_at || !dayjs(a.offline_at).isBefore(dayjs(DEMO_TODAY).startOf('day')))
    .sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return dayjs(b.published_at).valueOf() - dayjs(a.published_at).valueOf();
    })
    .slice(0, 5);

  /** V6.0 CR-28：场景卡读 sceneCards 实体，为空时回落到 cases 派生（旧库不出现空壳） */
  const sceneCards = (db.sceneCards ?? []).filter((c) => c.status === 'PUBLISHED' && !c.is_deleted);
  const sceneFallback = sceneCards.length === 0
    ? db.cases.slice(0, 6).map((c) => ({ id: c.id, title: c.title, summary: c.summary, emoji: c.cover, source_case_id: c.id })) as typeof sceneCards
    : sceneCards;

  const tickerItems: TickerItem[] = announcements.map((a) => ({
    id: a.id,
    title: a.title,
    to: a.source_post_id ? `/community/${a.source_post_id}` : '/community',
    pinned: a.pinned,
  }));

  /** CR-13：开关关闭 ≡ V5.0（公告回右下角列表，首页无独立公告条） */
  const tickerOn = flags.homeAnnounceTicker !== false;
  /** CR-14：社区关闭时悬赏榜独占整行 */
  const rightColOn = flags.community || !tickerOn;

  /** CR-15：评委复核入口仅 JUDGE 渲染，非 JUDGE 身份 DOM 中不存在 */
  const judgeEntryOn = flags.homeJudgeEntry !== false && hasRole('JUDGE');
  const judgePendingCount = db.submits.filter(
    (s) => (s.status === 'AI_SCORED' || s.status === 'REVIEWING')
      && !db.scoreResults.some(
        (r) => r.target_type === 'submit' && r.target_id === s.id
          && r.source === 'JUDGE' && r.scorer_union_id === me.union_id
      )
  ).length;

  const TRACK_COLOR: Record<string, string> = {
    '效率提升': 'var(--wb-track-1)',
    '业务增长': 'var(--wb-track-2)',
    '组织发展': 'var(--wb-track-3)',
  };

  return (
    <div className="wb2-page">
      {/* Hero */}
      <div className="wb2-hero">
        <div className="row">
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <span className="pill"><RocketOutlined /> {campaign.status}</span>
            <span className="sub" style={{ marginLeft: 10 }}>W3 · 制作陪跑阶段</span>
            <h1>{campaign.name}</h1>
            <div className="desc">{campaign.start_date} ~ {campaign.end_date} ｜ 做出属于你的一件作品，让别人照着就能用</div>
            <div className="pg">
              <div className="lab">
                <span>我的进度 · 提报 {mySubmitDone}/1</span>
                <span style={{ fontWeight: 600 }}>距截止 {daysLeft} 天</span>
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
          </div>
          <div className="acts">
            <Link className="act" to="/work">去提报 <ArrowRightOutlined /></Link>
            <Link className="act ghost" to="/cases">看案例</Link>
          </div>
        </div>
      </div>

      {/* CR-13：公告条置于 Hero 之下、待办之上；无公告时整条不渲染 */}
      {tickerOn && tickerItems.length > 0 && <AnnounceTicker items={tickerItems} />}

      {/* 我的待办 */}
      <section className="wb2-card">
        <div className="wb2-sechd">
          <div className="t"><ClockCircleOutlined style={{ color: 'var(--wb-primary)' }} /> 我的待办</div>
          <Link className="more" to="/me">全部 <ArrowRightOutlined /></Link>
        </div>
        {myTodos.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="全部完成，干得漂亮 🎉" />
        ) : (
          <div className="wb2-list">
            {myTodos.map((t) => (
              <div key={t.key} className="wb2-li">
                <div className="wb2-li-m">
                  <div className="wb2-li-t">{t.text}</div>
                </div>
                <div className="wb2-li-r">
                  <Link to={t.to}><Button size="small" type="link">{t.action} <ArrowRightOutlined /></Button></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 数据条 */}
      <div className="wb2-metrics">
        <div className="wb2-metric">
          <div className="lb">本届提交率</div>
          <div className="vl accent">{stats.submitRate}%</div>
          <div className="sb"><Delta v={12.4} /><Sparkline data={SPARK.submit} color="var(--wb-track-1)" /></div>
          <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 6 }}>
            {stats.submitted}/{stats.cadreCount} 人 · 口径：干部
          </div>
        </div>
        <div className="wb2-metric">
          <div className="lb">我的积分</div>
          <div className="vl">{myPoints}</div>
          <div className="sb"><Delta v={8.6} /><Sparkline data={SPARK.points} color="var(--wb-track-2)" /></div>
          <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 6 }}>可用 {me.points} 分</div>
        </div>
        <div className="wb2-metric">
          <div className="lb">我的排名</div>
          <div className="vl">{rank ? `No.${rank}` : '—'}</div>
          <div className="sb"><Delta v={2} /><Sparkline data={SPARK.rank} color="var(--wb-track-3)" /></div>
          <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 6 }}>共 {db.users.length} 人参与</div>
        </div>
        <div className="wb2-metric">
          <div className="lb">激活率</div>
          <div className="vl">{stats.activateRate}%</div>
          <div className="sb"><Delta v={6.2} /><Sparkline data={SPARK.activate} color="var(--wb-info)" /></div>
          <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 6 }}>
            {stats.activated}/{stats.cadreCount} 人已激活
          </div>
        </div>
      </div>

      {/* CR-01：我的团队（属性驱动，不带团队时整块不渲染） */}
      <TeamBoard />

      {/* 案例精选 */}
      <section>
        <div className="wb2-sechd">
          <div className="t">案例精选 <span className="s">30 秒看懂别人做成了什么</span></div>
          <Link className="more" to="/cases">查看全部 <ArrowRightOutlined /></Link>
        </div>
        <div className="wb2-hscroll">
          {hotCases.map((c) => {
            const skillN = flags.caseSkillPackage !== false ? (c.skill_packages?.length ?? 0) : 0;
            return (
              <Link key={c.id} to={`/cases/${c.id}`} style={{ display: 'block' }}>
                <div className="wb2-ccard" style={{ borderLeft: `3px solid ${TRACK_COLOR[c.track] ?? 'var(--wb-track-1)'}` }}>
                  <div className="ct">{c.title}</div>
                  <div className="cd" style={{ marginTop: 8 }}>{c.author_name} · {c.duration}</div>
                  <div className="cf">
                    <span className="grow"><FireOutlined /> {c.view_count} · 👍 {c.like_count}</span>
                    {skillN > 0 && <span style={{ color: 'var(--wb-primary-ink)', fontWeight: 600 }}>🧩 {skillN}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* CR-15：评委复核入口 */}
      {judgeEntryOn && (
        <section className="wb2-card">
          <div className="wb2-sechd">
            <div className="t">
              <CheckCircleOutlined style={{ color: 'var(--wb-primary)' }} /> 评委复核
              <span className="s">待你复核 {judgePendingCount} 条</span>
            </div>
            <Link className="more" to="/admin/judge">去复核 <ArrowRightOutlined /></Link>
          </div>
          {judgePendingCount === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无待复核作业，新的作业送出后会在这里出现"
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-2)' }}>
                有 <b>{judgePendingCount}</b> 条作业已出 AI 分，等待你完成复核与真实性确认。
              </div>
              <Link to="/admin/judge">
                <Button type="primary" size="small">开始复核（{judgePendingCount}）</Button>
              </Link>
            </div>
          )}
        </section>
      )}

      {/* CR-14：场景卡 */}
      <section className="wb2-card">
        <div className="wb2-sechd">
          <div className="t">本周高频场景卡 <span className="s">30 秒学一个</span></div>
        </div>
        <div className="wb2-chips">
          {sceneFallback.map((c) => (
            <Link key={c.id} to={c.source_case_id ? `/cases/${c.source_case_id}` : '/cases'} title={c.summary}>
              <span className="wb2-chip">{c.emoji} {c.title}</span>
            </Link>
          ))}
        </div>
        <div className="wb2-note" style={{ marginTop: 14 }}>
          <CheckCircleOutlined /> 本周已发布 {sceneFallback.length} 张场景卡 · 阅读埋点计入个人活跃
        </div>
      </section>

      {/* CR-14：悬赏榜与社区热帖一行 2 列 */}
      <div className="wb2-grid2">
        <section className="wb2-card">
          <div className="wb2-sechd">
            <div className="t"><TrophyOutlined style={{ color: 'var(--wb-primary)' }} /> 悬赏榜</div>
            <Link className="more" to="/bounty">查看全部 <ArrowRightOutlined /></Link>
          </div>
          <div className="wb2-list">
            {bounties.map((b) => (
              <Link key={b.id} to="/bounty" style={{ display: 'block', color: 'inherit' }}>
                <div className="wb2-li">
                  <div className="wb2-li-m">
                    <div className="wb2-li-t">{b.title}</div>
                    <div className="wb2-li-s">{b.track} · 截止 {b.due_date} · {b.source}</div>
                  </div>
                  <div className="wb2-li-r">
                    <span style={{ color: 'var(--wb-primary-ink)', fontWeight: 700 }}>{b.points} 分</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {rightColOn && (
          <div>
            {!tickerOn && (
              <section className="wb2-card" style={{ marginBottom: 'var(--wb-space-5)' }}>
                <div className="wb2-sechd"><div className="t">📢 公告</div></div>
                <div className="wb2-list">
                  {announcements.map((a) => (
                    <Link key={a.id} to={a.source_post_id ? `/community/${a.source_post_id}` : '/community'} style={{ display: 'block', color: 'inherit' }}>
                      <div className="wb2-li"><div className="wb2-li-m"><div className="wb2-li-t">{a.title}</div></div></div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {flags.community && (
              <section className="wb2-card">
                <div className="wb2-sechd">
                  <div className="t"><TeamOutlined style={{ color: 'var(--wb-primary)' }} /> 社区热帖</div>
                  <Link className="more" to="/community">进入社区 <ArrowRightOutlined /></Link>
                </div>
                <div className="wb2-list">
                  {hotPosts.map((p) => (
                    <Link key={p.id} to={`/community/${p.id}`} style={{ display: 'block', color: 'inherit' }}>
                      <div className="wb2-li">
                        <div className="wb2-li-m">
                          <div className="wb2-li-t">{p.title}</div>
                          <div className="wb2-li-s">
                            {p.anonymous ? p.anon_no : p.author_name} · 👍 {p.like_count} · 💬 {p.comment_count}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
