import { useEffect, useMemo, useState } from 'react';
import { Grid, Space, Tag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { NotificationOutlined, PushpinOutlined } from '@ant-design/icons';
import { COLOR } from '@/theme';

export interface TickerItem {
  id: string;
  title: string;
  /** 点击后的落地页：有原帖走帖子详情，否则进公告区 */
  to: string;
  pinned?: boolean;
}

const ROW_H = 26;

/**
 * V6.0 CR-13：首页公告条（置顶通栏窄条 + 文字垂直轮转）
 * 规则：≥2 条才轮转；hover 暂停；移动端间隔 4s（桌面 3s）；超长标题截断带 Tooltip。
 * 无数据时由调用方决定是否渲染（本组件不渲染空壳）。
 */
export default function AnnounceTicker({ items }: { items: TickerItem[] }) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const interval = isMobile ? 4000 : 3000;

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const multi = items.length > 1;
  const count = items.length;

  useEffect(() => {
    if (!multi || paused || count === 0) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % count), interval);
    return () => window.clearInterval(t);
  }, [multi, paused, count, interval]);

  // 数据变少时避免下标越界（如组织者下线了公告）
  const safeIdx = useMemo(() => (count ? idx % count : 0), [idx, count]);
  const current = items[safeIdx];

  if (!current) return null;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: COLOR.primaryLight,
        border: `1px solid ${COLOR.borderLight}`,
        borderRadius: 10,
        padding: '8px 14px',
        minHeight: 44,
      }}
    >
      <Space size={6} style={{ flex: '0 0 auto' }}>
        <NotificationOutlined style={{ color: COLOR.primary }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#C2410C' }}>公告</span>
      </Space>

      <div style={{ flex: 1, minWidth: 0, height: ROW_H, overflow: 'hidden' }}>
        <div
          style={{
            transform: `translateY(-${safeIdx * ROW_H}px)`,
            transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {items.map((it) => (
            <div key={it.id} style={{ height: ROW_H, lineHeight: `${ROW_H}px`, overflow: 'hidden' }}>
              <Space size={6} style={{ maxWidth: '100%' }}>
                {it.pinned && <PushpinOutlined style={{ color: COLOR.primary, fontSize: 12 }} />}
                <Typography.Text
                  ellipsis={{ tooltip: it.title }}
                  style={{ fontSize: 13, maxWidth: '100%' }}
                >
                  <Link to={it.to} style={{ color: COLOR.textSub }}>{it.title}</Link>
                </Typography.Text>
              </Space>
            </div>
          ))}
        </div>
      </div>

      {/* 轮转位置指示器：让用户知道还有几条，而不是以为只有一条 */}
      {multi && (
        <Space size={4} style={{ flex: '0 0 auto' }}>
          {items.map((it, i) => (
            <Tooltip key={it.id} title={it.title}>
              <span
                onClick={() => setIdx(i)}
                style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: 999, cursor: 'pointer',
                  background: i === safeIdx ? COLOR.primary : COLOR.borderLight,
                  transition: 'background 0.2s ease',
                }}
              />
            </Tooltip>
          ))}
        </Space>
      )}

      {!multi && (
        <Tag color="orange" style={{ marginInlineEnd: 0, flex: '0 0 auto' }}>最新</Tag>
      )}
    </div>
  );
}
