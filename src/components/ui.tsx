import { Button, Empty, Popover, Space, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { COLOR, RADIUS, SHADOW, TRACK_TAG } from '@/theme';

/** 低饱和赛道标签：低饱和底 + 深色字，替代大面积色块（参考 getdesign.md 的克制用色） */
export function TrackTag({ track, level }: { track: string; level?: string }) {
  const t = TRACK_TAG[track] ?? { bg: COLOR.primaryLight, color: COLOR.primary };
  return (
    <Space size={4}>
      <span style={{
        background: t.bg, color: t.color, fontSize: 11, fontWeight: 600,
        padding: '2px 8px', borderRadius: 6, lineHeight: '18px', whiteSpace: 'nowrap',
      }}>{track}</span>
      {level && (
        <span style={{
          background: '#F3F4F6', color: COLOR.textSub, fontSize: 11, fontWeight: 500,
          padding: '2px 8px', borderRadius: 6, lineHeight: '18px', whiteSpace: 'nowrap',
        }}>{level}</span>
      )}
    </Space>
  );
}

/** 通用状态软标签 */
export function SoftTag({ text, tone = 'primary' }: { text: string; tone?: 'primary' | 'blue' | 'purple' | 'green' | 'red' | 'gray' | 'gold' }) {
  const map = {
    primary: { bg: '#FFF1EB', color: '#C2410C' },
    blue: { bg: '#EFF6FF', color: '#1D4ED8' },
    purple: { bg: '#F3E8FF', color: '#7E22CE' },
    green: { bg: '#ECFDF5', color: '#047857' },
    red: { bg: '#FEF2F2', color: '#B91C1C' },
    gold: { bg: '#FFFBEB', color: '#B45309' },
    gray: { bg: '#F3F4F6', color: '#6B7280' },
  }[tone];
  return (
    <span style={{
      background: map.bg, color: map.color, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 6, lineHeight: '18px', whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

/** 指标卡 */
export function StatCard({
  icon, label, value, sub, tone = 'primary',
}: {
  icon?: React.ReactNode; label: string; value: React.ReactNode; sub?: string;
  tone?: 'primary' | 'blue' | 'purple' | 'green' | 'gold' | 'red';
}) {
  const toneColor = {
    primary: COLOR.primary, blue: COLOR.info, purple: COLOR.ai,
    green: COLOR.success, gold: COLOR.warning, red: COLOR.error,
  }[tone];
  return (
    <div className="wb-card wb-card-hover" style={{ padding: 18, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: COLOR.textSub, fontWeight: 500 }}>{label}</span>
        {icon && (
          <span style={{
            width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: `${toneColor}14`, color: toneColor, fontSize: 16,
          }}>{icon}</span>
        )}
      </div>
      <div className="wb-metric num" style={{ color: toneColor, marginTop: 10, fontSize: 30 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLOR.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** 区块标题 */
export function SectionTitle({ icon, title, sub, moreTo, moreText }: {
  icon?: React.ReactNode; title: string; sub?: string; moreTo?: string; moreText?: string;
}) {
  return (
    <div className="wb-section-title">
      <Space size={8}>
        {icon}
        <span>{title}</span>
        {sub && <span style={{ fontSize: 13, fontWeight: 400, color: COLOR.textMuted }}>{sub}</span>}
      </Space>
      {moreTo && (
        <Link to={moreTo} style={{ fontSize: 13, fontWeight: 500, color: COLOR.primary }}>
          {moreText ?? '查看全部'} →
        </Link>
      )}
    </div>
  );
}

/** 页面级标题区 */
export function PageHeader({ title, desc, extra }: { title: string; desc?: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>
          {title}
        </Typography.Title>
        {desc && <div style={{ fontSize: 13, color: COLOR.textSub, marginTop: 6 }}>{desc}</div>}
      </div>
      {extra}
    </div>
  );
}

/** 封面图标块的赛道底色：比 chip 更实，保证在白卡上可辨识 */
export const TRACK_ICON: Record<string, { bg: string; border: string }> = {
  客户赋能: { bg: 'linear-gradient(135deg, #FFEADF 0%, #FFD4BE 100%)', border: '#FFD0BB' },
  团队提效: { bg: 'linear-gradient(135deg, #E8F0FF 0%, #D4E2FF 100%)', border: '#CFE0FF' },
  销售提效: { bg: 'linear-gradient(135deg, #F2E9FF 0%, #E3D2FF 100%)', border: '#E0CCFF' },
};

/** 卡片封面图标块：带赛道色调的圆角方形 */
export function CoverBlock({ emoji, track, size = 44 }: { emoji: string; track?: string; size?: number }) {
  const t = (track ? TRACK_ICON[track] : undefined) ?? { bg: 'linear-gradient(135deg, #FFEADF 0%, #FFD4BE 100%)', border: '#FFD0BB' };
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28),
      background: t.bg, border: `1px solid ${t.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.5), lineHeight: 1, flexShrink: 0,
    }}>{emoji}</div>
  );
}

/* ==========================================================================
   V4.1 · Moka 交互模式库组件（源自《Moka_交互系统逻辑_复刻参考.md》）
   复用优先级：新增页面先查本节，再查上面的基础件，最后才自己写
   ========================================================================== */

/**
 * P4 · 迷你趋势 sparkline
 * 纯 SVG 渲染，不引入任何图表依赖；同数据渲染结果恒定，便于截图核验。
 */
export function Sparkline({
  data, color = COLOR.primary, width = 68, height = 22, fill = true,
}: { data: number[]; color?: string; width?: number; height?: number; fill?: boolean }) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = (width - 2) / (data.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const pts = data.map((v, i) => [1 + i * stepX, y(v)] as const);
  const line = pts.map(([x, yy], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yy.toFixed(1)}`).join(' ');
  const area = `${line} L${(width - 1).toFixed(1)},${height} L1,${height} Z`;
  const gid = `sg${Math.abs(data.reduce((a, b) => a * 31 + b, 7)) % 99999}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  );
}

/**
 * P4 · 环比标记
 * 涨跌色遵循中国市场惯例：涨=红，跌=绿。
 * 对「涨是坏事」的指标（如驳回率）传 invert，语义反转但颜色规则不变。
 */
export function TrendTag({ value, suffix = '%', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  if (!Number.isFinite(value) || value === 0) {
    return <span className="wb-trend-flat num" style={{ fontSize: 12, fontWeight: 600 }}>持平</span>;
  }
  const up = value > 0;
  const good = invert ? !up : up;
  const cls = good ? 'wb-trend-up' : 'wb-trend-down';
  return (
    <span className={`${cls} num`} style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {up ? '↑' : '↓'} {Math.abs(value)}
      {suffix}
    </span>
  );
}

/**
 * P4 · 进阶指标卡 = 大数字 + 环比 + 迷你趋势 + 口径说明
 * 比 StatCard 多三件套；Moka 认为「数据可信度」是 B 端信任的核心，故口径说明必填可选但强烈建议给。
 */
export function MetricCard({
  icon, label, value, delta, deltaLabel = '较上期', spark, hint, tone = 'primary', extra,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  /** 环比百分比（正=涨） */
  delta?: number;
  deltaLabel?: string;
  spark?: number[];
  /** 口径说明：hover 「这个数字怎么算的」 */
  hint?: string;
  tone?: 'primary' | 'blue' | 'purple' | 'green' | 'gold' | 'red';
  extra?: React.ReactNode;
}) {
  const toneColor = {
    primary: COLOR.primary, blue: COLOR.info, purple: COLOR.ai,
    green: COLOR.success, gold: COLOR.warning, red: COLOR.error,
  }[tone];
  const title = (
    <span style={{ fontSize: 13, color: COLOR.textSub, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {label}
      {hint && (
        <Tooltip title={hint}>
          <span
            aria-label="口径说明"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 14, height: 14, borderRadius: '50%', fontSize: 10,
              background: '#F3F4F6', color: COLOR.textMuted, cursor: 'help', fontWeight: 700,
            }}
          >?</span>
        </Tooltip>
      )}
    </span>
  );
  return (
    <div className="wb-metric-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {title}
        {icon && (
          <span style={{
            width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: `${toneColor}14`, color: toneColor, fontSize: 16, flexShrink: 0,
          }}>{icon}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
        <div>
          <div className="wb-metric num" style={{ color: toneColor, fontSize: 30, lineHeight: 1.1 }}>{value}</div>
          {delta !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11, color: COLOR.textMuted }}>
              <TrendTag value={delta} />
              <span>{deltaLabel}</span>
            </div>
          )}
        </div>
        {spark && spark.length > 1 && <Sparkline data={spark} color={toneColor} />}
      </div>
      {extra && <div style={{ marginTop: 8, fontSize: 11, color: COLOR.textMuted }}>{extra}</div>}
    </div>
  );
}

/**
 * P1 · 悬浮预览（Hover Preview）
 * 触发：hover 停留 200ms 后显示，离开延迟 100ms 隐藏（防抖动穿越）。
 * 内容约定：只放「决策需要的最小信息集」，禁止在预览里再套二级预览。
 */
export function HoverCard({
  content, children, placement = 'top',
}: { content: React.ReactNode; children: React.ReactNode; placement?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Popover
      content={<div className="wb-hovercard">{content}</div>}
      placement={placement}
      mouseEnterDelay={0.2}
      mouseLeaveDelay={0.1}
      overlayInnerStyle={{ padding: 0, background: 'transparent', boxShadow: 'none' }}
      styles={{ body: { padding: 0 } }}
    >
      {children}
    </Popover>
  );
}

/** §5 · 空状态：图标 + 一句话说明 + 一个主行动按钮，禁止空白页 */
export function EmptyState({
  icon, title, desc, actionText, onAction, to,
}: {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  actionText?: string;
  onAction?: () => void;
  to?: string;
}) {
  return (
    <div style={{ padding: '40px 16px', textAlign: 'center' }}>
      {icon && <div style={{ fontSize: 34, lineHeight: 1, marginBottom: 10 }}>{icon}</div>}
      <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.text }}>{title}</div>
      {desc && <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 6 }}>{desc}</div>}
      {actionText && (
        <div style={{ marginTop: 14 }}>
          {to
            ? <Link to={to}><Button type="primary" shape="round">{actionText}</Button></Link>
            : <Button type="primary" shape="round" onClick={onAction}>{actionText}</Button>}
        </div>
      )}
    </div>
  );
}

/** §5 · 空状态的 antd Empty 兼容封装（列表内使用，保持 antd 高度） */
export function ListEmpty({ title, desc, actionText, onAction, to }: {
  title: string; desc?: string; actionText?: string; onAction?: () => void; to?: string;
}) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={<span style={{ fontSize: 13, color: COLOR.textMuted }}>{desc ?? title}</span>}
    >
      {actionText && (to
        ? <Link to={to}><Button type="primary" shape="round" size="small">{actionText}</Button></Link>
        : <Button type="primary" shape="round" size="small" onClick={onAction}>{actionText}</Button>)}
    </Empty>
  );
}

/** P9 · 聚焦浮层卡：要强调的元素「提升」为品牌色描边卡，不用遮罩+箭头 */
export function Spotlight({
  children, badge, style,
}: { children: React.ReactNode; badge?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="wb-spotlight" style={style}>
      {badge && (
        <span style={{
          position: 'absolute', top: -10, left: 16,
          background: COLOR.primary, color: '#fff', fontSize: 11, fontWeight: 700,
          padding: '2px 10px', borderRadius: RADIUS.capsule,
          boxShadow: SHADOW.button,
        }}>{badge}</span>
      )}
      {children}
    </div>
  );
}

/** P6 · 主动提醒条：事实 + 一个动作按钮，不做纯告知 */
export function Nudge({
  text, action, onAction, to, tone = 'primary',
}: {
  text: React.ReactNode;
  action?: string;
  onAction?: () => void;
  to?: string;
  tone?: 'primary' | 'warning';
}) {
  const bg = tone === 'warning' ? '#FFFBEB' : '#FFF1EB';
  const body = (
    <>
      <span className="wb-nudge-icon" style={tone === 'warning' ? { background: COLOR.warning, boxShadow: '0 0 0 3px rgba(245,158,11,0.16)' } : undefined} />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: COLOR.text, minWidth: 0 }}>{text}</span>
      {action && (
        <span style={{ fontSize: 13, fontWeight: 600, color: COLOR.primary, whiteSpace: 'nowrap' }}>
          {action} →
        </span>
      )}
    </>
  );
  const cls = 'wb-nudge';
  if (to) return <Link to={to}><div className={cls} style={{ background: bg }}>{body}</div></Link>;
  return <div className={cls} style={{ background: bg }} onClick={onAction}>{body}</div>;
}

/**
 * P10 · 右侧悬浮帮助条：常驻但不挡内容（≤64px 宽）
 * 主动气泡只出现一次且可关闭，关闭后本次会话不再弹（关闭态写 sessionStorage）。
 */
export function HelperBar({
  items, bubble, bubbleKey = 'wb-helper-bubble',
}: {
  items: { icon: React.ReactNode; label: string; onClick?: () => void }[];
  bubble?: { title: string; desc: string };
  bubbleKey?: string;
}) {
  const [bubbleOpen, setBubbleOpen] = useState(() => {
    try { return sessionStorage.getItem(bubbleKey) !== 'closed'; } catch { return true; }
  });
  const [showBar, setShowBar] = useState(true);
  const closeBubble = () => {
    setBubbleOpen(false);
    try { sessionStorage.setItem(bubbleKey, 'closed'); } catch { /* ignore */ }
  };
  if (!showBar) return null;
  return (
    <>
      <div className="wb-helper">
        {items.map((it) => (
          <div
            key={it.label}
            className="wb-helper-item"
            onClick={it.onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') it.onClick?.(); }}
          >
            {it.icon}
            <span>{it.label}</span>
          </div>
        ))}
      </div>
      {bubble && bubbleOpen && (
        <div style={{
          position: 'fixed', right: 84, bottom: 24, zIndex: 81, width: 224,
          background: '#fff', border: '1px solid #f0f1f4', borderRadius: 14,
          boxShadow: SHADOW.float, padding: 14,
          animation: 'wbPopIn 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{bubble.title}</span>
            <span
              onClick={closeBubble}
              role="button"
              tabIndex={0}
              style={{ fontSize: 12, color: COLOR.textMuted, cursor: 'pointer', lineHeight: 1 }}
            >✕</span>
          </div>
          <div style={{ fontSize: 12, color: COLOR.textSub, marginTop: 6, lineHeight: 1.6 }}>{bubble.desc}</div>
        </div>
      )}
    </>
  );
}

/** §1.2 胶囊主 CTA：每屏唯一，页面级主行动使用 */
export function CapsuleButton({
  children, onClick, to, icon, size = 'large', type = 'primary',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  to?: string;
  icon?: React.ReactNode;
  size?: 'large' | 'middle';
  type?: 'primary' | 'default';
}) {
  const btn = (
    <Button type={type} shape="round" size={size} icon={icon} onClick={onClick} style={{ fontWeight: 700 }}>
      {children}
    </Button>
  );
  return to ? <Link to={to}>{btn}</Link> : btn;
}

/**
 * §5 · 骨架屏：形状对齐最终内容，超过 300ms 才显示（CSS animation-delay 实现）
 * 用于替代全屏转圈；rows=0 时渲染块占位。
 */
export function SkeletonBlock({ rows = 3, block = false }: { rows?: number; block?: boolean }) {
  const widths = ['100%', '82%', '64%', '90%', '72%'];
  if (block) return <span className="wb-skeleton wb-skeleton-block" style={{ display: 'block' }} />;
  return (
    <span style={{ display: 'block' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="wb-skeleton wb-skeleton-line" style={{ width: widths[i % widths.length] }} />
      ))}
    </span>
  );
}

/**
 * P2 · 左 Tab 右内容联动的内容容器
 * 内容切换配 150ms 淡入 + 12px 上移；高度锁定由调用方给 minHeight，防切换时页面跳动。
 */
export function SwapPanel({ dep, minHeight, children }: {
  dep: unknown; minHeight?: number; children: React.ReactNode;
}) {
  /** key 随 dep 变化 → 重新挂载 → 触发 150ms 淡入 + 12px 上移 */
  return (
    <div key={String(dep)} className="wb-swap-in" style={{ minHeight }}>
      {children}
    </div>
  );
}
