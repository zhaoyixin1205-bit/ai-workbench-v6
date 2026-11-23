/**
 * IP 值守 · 功能板块（方案S · V10.20）
 *
 * 一域一色 + 一域一 IP（用户确认的四板块布局，资源库→悬赏榜）：
 *   ① 作业提报   = 冲线宇航员（橙 #F7A325）—— 举旗冲线，任务在旗上
 *   ② 案例与选题 = 帐Sir（紫 #8B7FD7）—— 猫队长带路，30 秒看懂别人做成了什么
 *   ③ 社区问答   = 云小税（青 #6FC8BC）—— 有问必答（community 开关关闭时整卡不渲染）
 *   ④ 悬赏榜     = 小R（粉 #FF8FA3）—— 任务管家，接单赚积分（V10.20 由「资源库」换防）
 *   全站主形象 AI 宇航员（mascot-ai.jpg）驻守 Logo 与首页 Hero，不占四板块席位。
 *
 * 贴纸卡（方案H 骨架 + S 纪律）：2px 墨描边 + 域色顶条 + hover 微旋转；
 * 数据为实时口径（与首页同源 store），不做假数据。v1 / v2 通用：样式自带，
 * 只消费 --wb-* 令牌（main.tsx 已全局注入 tokens.css）。
 */
import { ArrowRightOutlined, TrophyOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/store';
import { submitDeadlineOf } from '@/utils/campaignTime';
import { myPendingRequired } from '@/utils/assignmentParticipants';
import './DutyBoard.css';

export default function DutyBoard() {
  const { db, me, campaign, flags } = useStore();

  /* —— 作业提报：与首页 Hero 同口径（必修未报 > 通用未交）—— */
  const deadline = submitDeadlineOf(db.periods ?? [], db.assignmentTypes ?? [], campaign);
  const mySubmits = db.submits.filter((s) => s.union_id === me.union_id);
  const mySubmitDone = mySubmits.filter((s) => s.status !== 'DRAFT' && s.status !== 'WITHDRAWN').length;
  const requiredN = myPendingRequired(db.assignmentTypes ?? [], db.submits, me.union_id).length;
  const workStat = requiredN > 0
    ? `${requiredN} 项必修待提报`
    : mySubmitDone > 0
      ? '本轮作业已提报 ✓'
      : deadline.date
        ? `截止 ${deadline.date}`
        : '本期提报进行中';

  /* —— 案例与选题 —— */
  const caseN = db.cases.length;

  /* —— 社区问答（开关关闭 ≡ 不值守，整卡不渲染） —— */
  const communityOn = flags.community !== false;
  const postN = db.posts.filter((p) => p.status === '正常').length;

  /* —— 悬赏榜（PUBLISHED = 可认领） —— */
  const bountyN = db.bounties.filter((b) => b.status === 'PUBLISHED').length;
  const bountyPoints = db.bounties
    .filter((b) => b.status === 'PUBLISHED')
    .reduce((a, b) => a + (b.points ?? 0), 0);

  interface Duty {
    key: string;
    domain: string;
    name: string;
    ip: string;
    ipAlt: string;
    title: string;
    duty: string;
    stat: string;
    to: string;
    cta: string;
  }

  const duties: Duty[] = [
    {
      key: 'work', domain: 'work', name: '冲线宇航员', ip: '/ip/astronaut.png', ipAlt: '冲线宇航员',
      title: '作业提报', duty: '旗已插好，冲线就在这周', stat: workStat, to: '/work', cta: '去提报',
    },
    {
      key: 'case', domain: 'case', name: '帐Sir', ip: '/ip/zhangsir.png', ipAlt: '帐Sir',
      title: '案例与选题', duty: '猫队长带路，先抄后超', stat: `${caseN} 个精选案例`, to: '/cases', cta: '看案例',
    },
    ...(communityOn
      ? [{
          key: 'community', domain: 'community', name: '云小税', ip: '/ip/yunxiaoshui.png', ipAlt: '云小税',
          title: '社区问答', duty: '有问必答，答案不下班', stat: `${postN} 条热帖`, to: '/community', cta: '去提问',
        } as Duty]
      : []),
    {
      key: 'bounty', domain: 'bounty', name: '小R', ip: '/ip/xiaor.png', ipAlt: '小R',
      title: '悬赏榜', duty: '任务管家：接单就赚积分', stat: bountyN > 0 ? `${bountyN} 个悬赏 · ${bountyPoints} 分待领` : '暂无进行中悬赏', to: '/bounty', cta: '去接单',
    },
  ];

  return (
    <section className="wb-duty" aria-label="IP 值守功能板块">
      {/* V11.23 方案S 定稿：板块头对齐截图 ——「功能域 · 伙伴值守」+ 右侧认识伙伴 */}
      <div className="wb-duty-head">
        <span className="wb-duty-title">功能域 · <b>伙伴值守</b></span>
        <span className="wb-duty-sub">一个板块一位值守 IP，缺啥点啥</span>
        <Link className="wb-duty-more" to="/community">认识伙伴 <ArrowRightOutlined /></Link>
      </div>
      <div className="wb-duty-grid">
        {duties.map((d) => (
          <Link key={d.key} to={d.to} className="wb-duty-card" data-domain={d.domain}>
            <div className="wb-duty-top">
              <span className="wb-duty-name">{d.title}</span>
              <span className="wb-duty-mascot">{d.name}</span>
            </div>
            <div className="wb-duty-figure">
              <img src={d.ip} alt={d.ipAlt} loading="lazy" draggable={false} />
            </div>
            <div className="wb-duty-duty">{d.duty}</div>
            <div className="wb-duty-foot">
              <span className="wb-duty-stat">{d.stat}</span>
              <span className="wb-duty-cta">{d.cta} <ArrowRightOutlined /></span>
            </div>
            {d.key === 'bounty' && bountyN > 0 && (
              <span className="wb-duty-badge"><TrophyOutlined /> 赚积分</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
