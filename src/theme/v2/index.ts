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
  sticker: 'var(--wb-radius-sticker)',
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
 * V10.20 方案S：内容卡零阴影（发丝边承载结构），悬浮层用中性墨影 rgba(42,46,69,…)。
 */
const WARM_SHADOW_CARD = 'none';
const WARM_SHADOW_MODAL = '0 16px 40px rgba(42,46,69,0.18)';

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
 * V9.0-10.08 暖白迁移：字体色 / 描边 / 底色整体换暖（#2a2e45 墨、#ece5da 描边、#fbf8f3 页底），
 * 并保持与 tokens.css 的 --wb-* 一一对应 —— CSS 变量是唯一色源，这里只是把同一组值喂给 AntD。
 */
export const themeV2: ThemeConfig = {
  cssVar: true,
  token: {
    // V11.23 融合版：主色回归品牌橙 #FF6B35（值与 tokens.css 同源）；信息色留品牌蓝
    colorPrimary: '#FF6B35',
    colorInfo: '#2563EB',
    colorSuccess: '#059669',
    colorWarning: '#D97706',
    colorError: '#DC2626',

    colorText: '#2A2E45',
    colorTextSecondary: '#4C5168',
    colorTextTertiary: '#8A8FA6',
    colorTextQuaternary: '#C2C6D6',

    colorBorder: '#ECE5DA',
    colorBorderSecondary: '#F3EEE5',
    colorBgLayout: '#FBF8F3',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',

    borderRadius: 8,
    borderRadiusLG: 16,
    borderRadiusSM: 6,

    fontSize: 14,
    controlHeight: 36,
    lineHeight: 1.5714,
    fontFamily:
      "'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
  },
  components: {
    Card: {
      boxShadow: WARM_SHADOW_CARD, // ★2 方案S：零阴影 + 发丝边
      borderRadiusLG: 16,
      paddingLG: 24,
      colorBorderSecondary: '#ECE5DA',
    },
    Button: {
      borderRadius: 6,
      primaryShadow: 'none',
      defaultShadow: 'none',
      controlHeight: 36,
      fontWeight: 500,
    },
    Table: {
      headerBg: '#F5F1EA',
      headerColor: '#8A8FA6',
      headerSplitColor: 'transparent',
      borderColor: '#F3EEE5',
      cellPaddingBlock: 16,
      cellPaddingInline: 20,
      rowHoverBg: '#F8F4EC',
    },
    /* V9.0 新增：列表呼吸感。v1 页面大量直接使用 AntD List，
       这里把行距一次性放松，避免每页单独覆写 CSS 导致两版漂移。 */
    List: {
      itemPadding: '18px 20px',
      metaMarginBottom: 6,
      descriptionFontSize: 12,
    },
    Layout: {
      bodyBg: '#FBF8F3',
      headerBg: '#FFFFFF',
      headerHeight: 56,
      headerPadding: '0 24px',
    },
    Menu: {
      itemSelectedBg: '#EAF3FC',
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
      defaultBg: '#F5F1EA',
      defaultColor: '#4C5168',
    },
    Input: { borderRadius: 8, controlHeight: 36 },
    Select: { borderRadius: 8, controlHeight: 36 },
    Modal: { borderRadiusLG: 16, contentBg: '#FFFFFF', titleFontSize: 16, boxShadow: WARM_SHADOW_MODAL },
    Drawer: { colorBgElevated: '#FFFFFF' },
    Segmented: { itemSelectedBg: '#FFFFFF', trackBg: '#F5F1EA' },
    Empty: { colorTextDescription: '#8A8FA6' },
    Statistic: { contentFontSize: 24, titleFontSize: 12 },
  },
};
