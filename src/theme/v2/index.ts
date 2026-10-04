/**
 * 设计令牌 v2 · TS 侧出口
 *
 * 与 ./tokens.css 同源（值必须一致）。给「暂时还不能改成 class 的内联样式」提供出口，
 * 目的是让 P3 分期替换 829 处 `style={{}}` 时有东西可替换，而不是继续散写 hex。
 *
 * 用法：style={{ color: WB.color.ink2, borderRadius: WB.radius.md }}
 */
import type { ThemeConfig } from 'antd';

export const COLOR = {
  primary: 'var(--wb-primary)',
  primaryHover: 'var(--wb-primary-hover)',
  primaryActive: 'var(--wb-primary-active)',
  primarySoft: 'var(--wb-primary-soft)',
  primarySubtle: 'var(--wb-primary-subtle)',

  info: 'var(--wb-info)',
  infoHover: 'var(--wb-info-hover)',
  infoSoft: 'var(--wb-info-soft)',

  ink1: 'var(--wb-ink-1)',
  ink2: 'var(--wb-ink-2)',
  ink3: 'var(--wb-ink-3)',
  ink4: 'var(--wb-ink-4)',

  page: 'var(--wb-surface-page)',
  card: 'var(--wb-surface-card)',
  band: 'var(--wb-surface-band)',
  brand: 'var(--wb-surface-brand)',
  cool: 'var(--wb-surface-cool)',
  sunken: 'var(--wb-surface-sunken)',

  border: 'var(--wb-border)',
  borderStrong: 'var(--wb-border-strong)',
  borderSubtle: 'var(--wb-border-subtle)',

  success: 'var(--wb-success)',
  successSoft: 'var(--wb-success-soft)',
  warning: 'var(--wb-warning)',
  warningSoft: 'var(--wb-warning-soft)',
  error: 'var(--wb-error)',
  errorSoft: 'var(--wb-error-soft)',

  /** 赛道标识色：只允许用于圆点与 3px 左条，不做整块底色 */
  track1: 'var(--wb-track-1)',
  track2: 'var(--wb-track-2)',
  track3: 'var(--wb-track-3)',
} as const;

export const FONT = {
  caption: 'var(--wb-fs-caption)',
  label: 'var(--wb-fs-label)',
  body: 'var(--wb-fs-body)',
  subtitle: 'var(--wb-fs-subtitle)',
  section: 'var(--wb-fs-section)',
  display: 'var(--wb-fs-display)',
} as const;

export const SPACE = {
  s1: 'var(--wb-space-1)',
  s2: 'var(--wb-space-2)',
  s3: 'var(--wb-space-3)',
  s4: 'var(--wb-space-4)',
  s5: 'var(--wb-space-5)',
  s6: 'var(--wb-space-6)',
  s7: 'var(--wb-space-7)',
  s8: 'var(--wb-space-8)',
  s9: 'var(--wb-space-9)',
} as const;

export const RADIUS = {
  sm: 'var(--wb-radius-sm)',
  md: 'var(--wb-radius-md)',
  lg: 'var(--wb-radius-lg)',
  pill: 'var(--wb-radius-pill)',
} as const;

export const SHADOW = {
  none: 'var(--wb-shadow-none)',
  popover: 'var(--wb-shadow-popover)',
  modal: 'var(--wb-shadow-modal)',
} as const;

export const Z = {
  sticky: 'var(--wb-z-sticky)',
  tabbar: 'var(--wb-z-tabbar)',
  drawer: 'var(--wb-z-drawer)',
  modal: 'var(--wb-z-modal)',
  message: 'var(--wb-z-message)',
  popover: 'var(--wb-z-popover)',
} as const;

/** 一次性取用，避免每次写 WB.color.primary */
export const WB = { color: COLOR, font: FONT, space: SPACE, radius: RADIUS, shadow: SHADOW, z: Z } as const;

/**
 * AntD 主题 v2
 *
 * 与 v1（src/theme.ts）并存，由 UIVersionGate 按版本二选一。
 * 关键差异只有 4 处（标 ★）：
 *   ★1 cssVar: true            —— 开启后 AntD 自身产出 --ant-* 变量，是运行时换肤的前提
 *   ★2 Card.boxShadow: 'none'  —— 卡片零投影，层级靠底色反差 + 1px 描边
 *   ★3 borderRadius 10/16 → 6/12
 *   ★4 colorWarning #F59E0B → #D97706（原值黄底白字对比不足）
 */
export const themeV2: ThemeConfig = {
  cssVar: true,
  token: {
    colorPrimary: '#FF6B35',
    colorInfo: '#2563EB',
    colorSuccess: '#059669',
    colorWarning: '#D97706',
    colorError: '#DC2626',

    colorText: '#0F172A',
    colorTextSecondary: '#44546B',
    colorTextTertiary: '#7C8CA6',
    colorTextQuaternary: '#BCC8DC',

    colorBorder: '#D6DFEE',
    colorBorderSecondary: '#E9EFF9',
    colorBgLayout: '#F5F7FC',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',

    borderRadius: 6, // ★3
    borderRadiusLG: 12, // ★3
    borderRadiusSM: 4,

    fontSize: 14,
    controlHeight: 36,
    lineHeight: 1.5714,
    fontFamily:
      "'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
  },
  components: {
    Card: {
      boxShadow: 'none', // ★2
      borderRadiusLG: 12,
      paddingLG: 20,
      colorBorderSecondary: '#E9EFF9',
    },
    Button: {
      borderRadius: 6,
      primaryShadow: 'none', // 主按钮不再发橙光
      defaultShadow: 'none',
      controlHeight: 36,
      fontWeight: 500,
    },
    Table: {
      headerBg: '#E8EEF9',
      headerColor: '#7C8CA6',
      headerSplitColor: 'transparent',
      borderColor: '#E9EFF9',
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
      rowHoverBg: '#F5F7FC',
    },
    Layout: {
      bodyBg: '#F5F7FC',
      headerBg: '#FFFFFF',
      headerHeight: 56,
      headerPadding: '0 24px',
    },
    Menu: {
      itemSelectedBg: '#FFF1EB',
      itemSelectedColor: '#FF6B35',
      itemBorderRadius: 6,
      groupTitleFontSize: 11,
    },
    Tabs: {
      itemSelectedColor: '#FF6B35',
      inkBarColor: '#FF6B35',
    },
    Tag: {
      borderRadiusSM: 4,
      defaultBg: '#E8EEF9',
      defaultColor: '#44546B',
    },
    Input: { borderRadius: 6, controlHeight: 36 },
    Select: { borderRadius: 6, controlHeight: 36 },
    Modal: { borderRadiusLG: 12, contentBg: '#FFFFFF', titleFontSize: 16 },
    Drawer: { colorBgElevated: '#FFFFFF' },
    Segmented: { itemSelectedBg: '#FFFFFF', trackBg: '#E8EEF9' },
    Empty: { colorTextDescription: '#7C8CA6' },
    Statistic: { contentFontSize: 24, titleFontSize: 12 },
  },
};
