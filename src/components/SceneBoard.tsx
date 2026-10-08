/**
 * 首页「本周高频场景卡」渲染件（v1 / v2 共用同一份 DOM 与样式）
 *
 * 为什么抽组件：这个板块 v1（AntD Card 外壳）和 v2（wb2-card 外壳）都要长一个样；
 * 把卡片 DOM 复制两份，改文案改样式就得改两处 —— 和之前的「同一句文案两版漂移」是同一类坑。
 * 判定（什么算本周、怎么分组、什么配色）在 @/service/sceneBoard.ts，这里只负责画。
 *
 * 样式随组件自带 CSS 引入，保证 v1 页面即使没手动引 v2 模板也不会掉样式；
 * 选择器全部 wb2- 前缀，不会污染 v1 其它区块。
 */
import { Link } from 'react-router-dom';
import { CheckCircleOutlined, ClockCircleOutlined, ReadOutlined } from '@ant-design/icons';
import type { SceneBandVM } from '@/service/sceneBoard';
import { useNoteVisible } from '@/auth/annotation';
import '../theme/v2/template.css';

/** 参考同款加压黑色弯箭头（纯 SVG，无依赖） */
function Arrow() {
  return (
    <svg className="wb2-farw" viewBox="0 0 22 16" width="20" height="15" aria-hidden>
      <path d="M2 13 C7 13 12 11 17 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10.5 3.5 L17.5 4.5 L14.5 11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface SceneBoardProps {
  /** 本周周次，如 2026-W41（空态文案要用） */
  week: string;
  /** 本周已发布卡数 */
  total: number;
  /** 一行为一个案例 的分行结果 */
  bands: SceneBandVM[];
}

export default function SceneBoard({ week, total, bands }: SceneBoardProps) {
  /** V8.6-10.08：埋点口径说明仅运营方与管理员可见 */
  const note = useNoteVisible();

  /* 本周一张都没发：给真话，不用旧 chip 的假热闹兜场 */
  if (total === 0) {
    return (
      <div className="wb2-note">
        <ClockCircleOutlined /> 本周（{week}）暂未发布场景卡，下周一更新 · 先去
        <Link to="/cases" style={{ marginLeft: 4 }}>案例库看看 ›</Link>
      </div>
    );
  }

  return (
    <>
      {bands.map((band) => (
        <div key={band.key} className="wb2-scband" style={{ background: band.gradient }}>
          {/* 案例名小标志：一行=一个案例，靠它区分不同来源 */}
          <Link to={band.caseHref} className="wb2-scpill" style={{ color: band.ink }} title={band.caseName}>
            <ReadOutlined className="wb2-scpill-ico" />
            <span className="wb2-scpill-tx">{band.caseName}</span>
          </Link>
          <span className="wb2-scmeta">
            {band.authorName ? <span className="wb2-scmeta-au">作者 {band.authorName}</span> : null}
            <span className="wb2-scmeta-em">{band.authorName ? ' ' : ''}· {band.track} · {band.count} 张</span>
          </span>
          <div className="wb2-scgrid">
            {band.cards.map((c) => (
              <Link key={c.id} to={c.href} className="wb2-fcard" title={c.summary}>
                <span className="wb2-ftab"><span className="wb2-fico">{c.emoji}</span></span>
                <span className="wb2-fti">{c.title}</span>
                <span className="wb2-fsub">
                  <span className="wb2-ftx">{c.summary}</span>
                  <Arrow />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
      {note && (
        <div className="wb2-note" style={{ marginTop: 14 }}>
          <CheckCircleOutlined /> 本周已发布 {total} 张场景卡 · 阅读埋点计入个人活跃
        </div>
      )}
    </>
  );
}
