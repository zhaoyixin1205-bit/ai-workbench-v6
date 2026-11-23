import type { ThemeConfig } from 'antd';

/**
 * PRD 第 9 章 UI/UE 设计规范 — 色彩体系（表 79）
 *  参考 getdesign.md 提升质感：保持浅色主战场，但加入更深的阴影、渐变、更克制的辅助色
 *
 * ⚠️ V10.20 方案S落地（2026-11-20 用户确认《最优融合版》）：
 *   由「橙白 · IP彩色系」整体迁移为**方案S 暖纸纪律派**，与 v2 令牌（src/theme/v2/tokens.css）同源：
 *     ① 页面底改暖纸 #FBF8F3，发丝边 #ECE5DA，卡片零阴影（E/Notion 骨架）；
 *     ② 全站唯一饱和行动色 = IP 主行动蓝 #FF6B35（D 的纪律 + B 的 IP 色）；
 *     ③ 墨色换深空墨 #2A2E45（IP 全套描边色）；
 *     ④ 一域一色分类学：橙=作业 / 紫=案例 / 青=社区 / 粉=悬赏（见 IP 色组）。
 */
export const COLOR = {
  primary: '#FF6B35',
  primaryPressed: '#E55D2B',
  primaryLight: '#FFF1EB', // 行动蓝浅底
  primarySoft: '#DAEBFB',
  info: '#2563EB',
  ai: '#7C3AED',
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
  bg: '#FBF8F3', // 暖纸底（原 #fbf8f3）
  bgDeep: '#F5F1EA', // 暖纸凹陷（原 #f5f1ea）
  card: '#FFFFFF',
  border: '#ECE5DA', // 发丝边（原 #ece5da）
  borderLight: '#F3EEE5',
  text: '#2A2E45',
  textSub: '#4C5168',
  textMuted: '#8A8FA6',
  darkHeader: '#2A2E45',
  darkHeaderText: '#F9FAFB',
  /* ---- V10.20 方案S：功能域四色（一域一色分类学，小面积强调） ---- */
  purple: '#8B7FD7',
  purpleDeep: '#6C62B8',
  purpleLight: '#F0EEFB',
  magenta: '#FF8FA3',
  magentaLight: '#FFEDF2',
  amber: '#F7A325',
  amberLight: '#FEF4E2',
  sky: '#6FC8BC',
  skyLight: '#E9F7F4',
} as const;

export const GRADIENT = {
  primary: 'linear-gradient(135deg, #FF6B35 0%, #FF8F5E 100%)',
  primaryDark: 'linear-gradient(135deg, #E55D2B 0%, #FF6B35 100%)',
  /** 方案S：页面级大横幅 = 深空墨画布 + 行动蓝高光（贴纸宇宙的黑板时刻） */
  hero: 'linear-gradient(135deg, #FF6B35 0%, #EC4899 55%, #8B5CF6 100%)',
  subtle: 'linear-gradient(180deg, #FFFFFF 0%, #FBF8F3 100%)',
  metric: 'linear-gradient(135deg, #FFFFFF 0%, #FCFAF6 100%)',
  /** 方案S：与 hero 同源，用于 Hero / 主 CTA / 成就区 */
  brand: 'linear-gradient(135deg, #FF6B35 0%, #EC4899 55%, #8B5CF6 100%)',
  /** 行动蓝浅底渐变，用于辅区块 */
  soft: 'linear-gradient(135deg, #FFF1EB 0%, #F0EEFB 100%)',
};

/**
 * V10.20 方案S：内容卡零阴影（发丝边承载结构，E/Notion 骨架）；
 * 悬浮层用中性墨影 rgba(42,46,69,…)——深空墨上的影不发脏。
 * 保留原有四级强度语义（浮起 / 悬浮 / 抬升 / 发光）。
 */
export const SHADOW = {
  card: 'none',
  cardHover: '0 10px 24px rgba(42, 46, 69, 0.10)',
  elevated: '0 8px 24px rgba(42, 46, 69, 0.10)',
  button: 'none',
  buttonHover: '0 6px 16px rgba(62, 142, 222, 0.22)',
  dropdown: '0 8px 30px rgba(42, 46, 69, 0.12)',
  inset: 'inset 0 1px 2px rgba(42, 46, 69, 0.05)',
  /* ---- V4.1 Moka 复刻：阴影不用纯黑，强调元素用品牌色光晕代替灰影 ---- */
  /** 极轻浮起（列表行、小卡默认态） */
  flat: 'rgba(42, 46, 69, 0.14) 0 2px 4px',
  /** 悬浮卡 / 下拉 / hover 预览 */
  float: 'rgba(42, 46, 69, 0.16) 0 7px 14px',
  /** 品牌色光晕：被强调的元素看起来在「发光」而不是「浮起来」 */
  glow: 'rgba(62, 142, 222, 0.28) 0 14px 28px, rgba(62, 142, 222, 0.16) 0 6px 10px',
  glowSoft: 'rgba(62, 142, 222, 0.20) 0 8px 20px',
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
    Table: { headerBg: COLOR.bgDeep, borderColor: COLOR.borderLight, cellPaddingBlock: 16, cellPaddingInline: 20, rowHoverBg: '#f8f4ec' },
    Layout: { bodyBg: COLOR.bg, headerBg: COLOR.card, headerHeight: 64 },
    Tabs: { itemSelectedColor: COLOR.primary, inkBarColor: COLOR.primary, margin: 8 },
    /* V9.0：列表行距放松，与 v2 的 .wb2-li 卡片列表在尺度上对齐 */
    List: { itemPadding: '18px 20px', metaMarginBottom: 6 },
    Menu: { itemSelectedBg: COLOR.primaryLight, itemSelectedColor: COLOR.primary },
    Tag: { borderRadius: 6, defaultBg: COLOR.primaryLight, defaultColor: COLOR.primary },
    Progress: { defaultColor: COLOR.primary },
    Input: { borderRadius: 10 },
    Select: { borderRadius: 10, controlHeight: 38 },
    Modal: { borderRadius: 16, boxShadow: SHADOW.elevated },
  },
};

/** 赛道 / 状态 语义色映射（V10.20 方案S：对齐四域色系） */
export const TRACK_COLOR: Record<string, string> = {
  客户赋能: '#F7A325',
  团队提效: '#3E8EDE', /* 赛道蓝不随主色走（v2 track-2 同源） */
  销售提效: '#8B7FD7',
};

/** 更现代的浅色 tag 配色：低饱和背景 + 深色文字 */
export const TRACK_TAG: Record<string, { bg: string; color: string }> = {
  客户赋能: { bg: '#FEF4E2', color: '#B45309' },
  团队提效: { bg: '#EAF3FC', color: '#2F76BD' }, /* 赛道蓝浅底 */
  销售提效: { bg: '#F0EEFB', color: '#6C62B8' },
};
