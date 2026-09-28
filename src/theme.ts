import type { ThemeConfig } from 'antd';

/** PRD 第 9 章 UI/UE 设计规范 — 色彩体系（表 79）
 *  参考 getdesign.md 提升质感：保持浅色主战场，但加入更深的阴影、渐变、更克制的辅助色
 */
export const COLOR = {
  primary: '#FF6B35',
  primaryPressed: '#E55D2B',
  primaryLight: '#FFF1EB',
  primarySoft: '#FFE4D9',
  info: '#2563EB',
  ai: '#7C3AED',
  success: '#059669',
  warning: '#F59E0B',
  error: '#DC2626',
  bg: '#F5F7FB',
  bgDeep: '#EEF0F4',
  card: '#FFFFFF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  text: '#1F2937',
  textSub: '#6B7280',
  textMuted: '#9CA3AF',
  darkHeader: '#111827',
  darkHeaderText: '#F9FAFB',
} as const;

export const GRADIENT = {
  primary: 'linear-gradient(135deg, #FF6B35 0%, #FF8F5E 55%, #FF9D70 100%)',
  primaryDark: 'linear-gradient(135deg, #E85A28 0%, #FF6B35 100%)',
  hero: 'linear-gradient(135deg, #FF6B35 0%, #FF7B47 40%, #FF9A6C 100%)',
  subtle: 'linear-gradient(180deg, #FFFFFF 0%, #FAFBFC 100%)',
  metric: 'linear-gradient(135deg, #FFFFFF 0%, #FFF8F5 100%)',
};

export const SHADOW = {
  card: '0 2px 8px rgba(31, 41, 55, 0.06), 0 1px 2px rgba(31, 41, 55, 0.04)',
  cardHover: '0 12px 28px rgba(31, 41, 55, 0.10), 0 4px 8px rgba(31, 41, 55, 0.05)',
  elevated: '0 8px 24px rgba(31, 41, 55, 0.08), 0 2px 4px rgba(31, 41, 55, 0.04)',
  button: '0 4px 12px rgba(255, 107, 53, 0.22)',
  buttonHover: '0 6px 16px rgba(255, 107, 53, 0.30)',
  dropdown: '0 8px 30px rgba(31, 41, 55, 0.12)',
  inset: 'inset 0 1px 2px rgba(31, 41, 55, 0.05)',
  /* ---- V4.1 Moka 复刻：阴影不用纯黑，强调元素用品牌色光晕代替灰影 ---- */
  /** 极轻浮起（列表行、小卡默认态） */
  flat: 'rgba(133, 138, 180, 0.14) 0 2px 4px',
  /** 悬浮卡 / 下拉 / hover 预览 */
  float: 'rgba(30, 36, 53, 0.16) 0 7px 14px',
  /** 品牌色光晕：被强调的元素看起来在「发光」而不是「浮起来」 */
  glow: 'rgba(255, 138, 96, 0.28) 0 14px 28px, rgba(255, 138, 96, 0.16) 0 6px 10px',
  glowSoft: 'rgba(255, 138, 96, 0.20) 0 8px 20px',
};

/** V4.1 圆角四档制（源自 Moka 规格：4/8 → 12/16 → 20+ → 胶囊） */
export const RADIUS = {
  xs: 4,   // 图标角、进度条
  sm: 6,   // 标签、表格内控件
  md: 10,  // 输入框、小按钮
  lg: 16,  // 内容卡、浮层
  xl: 20,  // 页面级大区块
  capsule: 999, // 主 CTA、搜索框、悬浮条
} as const;

/** V4.1 微动效规范（Moka §6：只表达空间关系与因果，不做装饰动画） */
export const MOTION = {
  /** hover / 按压 */
  fast: '120ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  /** 面板展开、浮层出现 */
  base: '240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  /** 页面转场上限 */
  page: '300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  /** 退场用 ease-in */
  out: '200ms ease-in',
  /** 内容切换淡入 */
  fade: '150ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: COLOR.primary,
    colorInfo: COLOR.info,
    colorSuccess: COLOR.success,
    colorWarning: COLOR.warning,
    colorError: COLOR.error,
    colorText: COLOR.text,
    colorTextSecondary: COLOR.textSub,
    colorBorder: COLOR.border,
    colorBgLayout: COLOR.bg,
    colorBgContainer: COLOR.card,
    borderRadius: 10,
    borderRadiusLG: 16,
    fontSize: 14,
    fontFamily:
      "'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
    controlHeight: 38,
    lineHeight: 1.6,
  },
  components: {
    Card: {
      borderRadiusLG: 16,
      paddingLG: 20,
      boxShadow: SHADOW.card,
      colorBorderSecondary: COLOR.borderLight,
    },
    Button: {
      primaryShadow: SHADOW.button,
      defaultShadow: 'none',
      borderRadius: 10,
    },
    Table: { headerBg: '#FAFBFC', borderColor: COLOR.borderLight },
    Layout: { bodyBg: COLOR.bg, headerBg: COLOR.card, headerHeight: 64 },
    Tabs: { itemSelectedColor: COLOR.primary, inkBarColor: COLOR.primary, margin: 8 },
    Menu: { itemSelectedBg: COLOR.primaryLight, itemSelectedColor: COLOR.primary },
    Tag: { borderRadius: 6, defaultBg: COLOR.primaryLight, defaultColor: COLOR.primary },
    Progress: { defaultColor: COLOR.primary },
    Input: { borderRadius: 10 },
    Select: { borderRadius: 10, controlHeight: 38 },
    Modal: { borderRadius: 16, boxShadow: SHADOW.elevated },
  },
};

/** 赛道 / 状态 语义色映射 */
export const TRACK_COLOR: Record<string, string> = {
  客户赋能: '#FF6B35',
  团队提效: '#2563EB',
  销售提效: '#7C3AED',
};

/** 更现代的浅色 tag 配色：低饱和背景 + 深色文字 */
export const TRACK_TAG: Record<string, { bg: string; color: string }> = {
  客户赋能: { bg: '#FFF1EB', color: '#C2410C' },
  团队提效: { bg: '#EFF6FF', color: '#1D4ED8' },
  销售提效: { bg: '#F3E8FF', color: '#7E22CE' },
};
