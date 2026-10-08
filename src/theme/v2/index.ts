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

  /** V9.0 IP 彩色系点缀：只做小面积强调（圆点 / 左条 / 浅底标签 / 渐变 CTA） */
  purple: 'var(--wb-accent-purple)',
  purpleDeep: 'var(--wb-accent-purple-deep)',
  purpleSoft: 'var(--wb-accent-purple-soft)',
  magenta: 'var(--wb-accent-magenta)',
  magentaSoft: 'var(--wb-accent-magenta-soft)',
  amber: 'var(--wb-accent-amber)',
  amberSoft: 'var(--wb-accent-amber-soft)',
  sky: 'var(--wb-accent-sky)',
  skySoft: 'var(--wb-accent-sky-soft)',
  /** 品牌渐变：橙 → 粉紫 → 紫 */
  gradientBrand: 'var(--wb-gradient-brand)',

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
  xl: 'var(--wb-radius-xl)',
  pill: 'var(--wb-radius-pill)',
} as const;

export const SHADOW = {
  none: 'var(--wb-shadow-none)',
  card: 'var(--wb-shadow-card)',
  cardHover: 'var(--wb-shadow-card-hover)',
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
 * 暖影常量：与 tokens.css 的 --wb-shadow-* 同源。
 * AntD token 只吃字面量（不吃 var()），所以值与 CSS 必须手工保持一致 —— 改一处要改两边。
 */
const WARM_SHADOW_CARD = '0 1px 2px rgba(120,70,20,0.05), 0 6px 16px rgba(120,70,20,0.06)';
const WARM_SHADOW_MODAL = '0 16px 40px rgba(120,70,20,0.16)';

/**
 * AntD 主题 v2
 *
 * 与 v1（src/theme.ts）并存，由 UIVersionGate 按版本二选一。
 * 关键差异 4 处（标 ★）：
 *   ★1 cssVar: true            —— 开启后 AntD 自身产出 --ant-* 变量，是运行时换肤的前提
 *   ★2 Card.boxShadow          —— V9.0 起由 none 改为暖调柔影（原「零投影 + 描边」的冷平质感）
 *   ★3 borderRadius 10/16 → 8/16（SM 6）
 *   ★4 colorWarning #F59E0B → #D97706（原值黄底白字对比不足）
 *
 * V9.0-10.08 暖白迁移：字体色 / 描边 / 底色整体换暖（#2B2A33 墨、#F2EBDD 描边、#FFFDFA 页底），
 * 并保持与 tokens.css 的 --wb-* 一一对应 —— CSS 变量是唯一色源，这里只是把同一组值喂给 AntD。
 */
export const themeV2: ThemeConfig = {
  cssVar: true,
  token: {
    colorPrimary: '#FF6B35',
    colorInfo: '#2563EB',
    colorSuccess: '#059669',
    colorWarning: '#D97706',
    colorError: '#DC2626',

    colorText: '#2B2A33',
    colorTextSecondary: '#514B5B',
    colorTextTertiary: '#857E90',
    colorTextQuaternary: '#BAB3C1',

    colorBorder: '#F2EBDD',
    colorBorderSecondary: '#F7F1E6',
    colorBgLayout: '#FFFDFA',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',

    borderRadius: 8, // ★3
    borderRadiusLG: 16, // ★3
    borderRadiusSM: 6,

    fontSize: 14,
    controlHeight: 36,
    lineHeight: 1.5714,
    fontFamily:
      "'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
  },
  components: {
    Card: {
      boxShadow: WARM_SHADOW_CARD, // ★2
      borderRadiusLG: 16,
      paddingLG: 24, // V9.0：卡片四面留白加大（原 20）
      colorBorderSecondary: '#F7F1E6',
    },
    Button: {
      borderRadius: 6,
      primaryShadow: 'none', // 主按钮不再发橙光
      defaultShadow: 'none',
      controlHeight: 36,
      fontWeight: 500,
    },
    Table: {
      headerBg: '#FBF6EF',
      headerColor: '#857E90',
      headerSplitColor: 'transparent',
      borderColor: '#F7F1E6',
      /* V9.0：行高 / 行宽都放松一档 —— 表格是最容易挤的信息密度
         12/16 → 16/20，视觉行数减少但可读性提升，配合暖白底不显空 */
      cellPaddingBlock: 16,
      cellPaddingInline: 20,
      rowHoverBg: '#FDF8F1',
    },
    /* V9.0 新增：列表呼吸感。v1 页面大量直接使用 AntD List，
       这里把行距一次性放松，避免每页单独覆写 CSS 导致两版漂移。 */
    List: {
      itemPadding: '18px 20px',
      metaMarginBottom: 6,
      descriptionFontSize: 12,
    },
    Layout: {
      bodyBg: '#F5F7FC',
      headerBg: '#FFFFFF',
      headerHeight: 56,
      headerPadding: '0 24px',
    },
    Menu: {
      itemSelectedBg: '#FFF3E8',
      itemSelectedColor: '#FF6B35',
      itemBorderRadius: 8,
      groupTitleFontSize: 11,
    },
    Tabs: {
      itemSelectedColor: '#FF6B35',
      inkBarColor: '#FF6B35',
    },
    Tag: {
      borderRadiusSM: 6,
      defaultBg: '#FBF6EF',
      defaultColor: '#514B5B',
    },
    Input: { borderRadius: 8, controlHeight: 36 },
    Select: { borderRadius: 8, controlHeight: 36 },
    Modal: { borderRadiusLG: 16, contentBg: '#FFFFFF', titleFontSize: 16, boxShadow: WARM_SHADOW_MODAL },
    Drawer: { colorBgElevated: '#FFFFFF' },
    Segmented: { itemSelectedBg: '#FFFFFF', trackBg: '#FBF6EF' },
    Empty: { colorTextDescription: '#857E90' },
    Statistic: { contentFontSize: 24, titleFontSize: 12 },
  },
};
