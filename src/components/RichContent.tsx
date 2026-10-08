/**
 * V8.3-10.08 需求⑥：富文本正文安全渲染
 *
 * 为什么必须过 DOMPurify：社区发帖升级为所见即所得编辑器后，正文存的是 HTML。
 * 直接 dangerouslySetInnerHTML 渲染 = 任何人发一个 <img onerror> 或 <script>，
 * 其他人打开帖子即中招（存储型 XSS）。内网工具同样不能豁免 —— 转发一个链接就够。
 *
 * 白名单策略：**只放行排版与图片**，其余（script/iframe/on* 事件/style 表达式）全删。
 * 图片额外约束：只允许站内文件服务的 /api/files/ 与 data:，堵掉「外站图片追踪」。
 */
import { useMemo } from 'react';
import DOMPurify from 'dompurify';

/** 允许的标签：排版 + 图片 + 链接，其余一律剥离 */
const ALLOWED_TAGS = [
  'p', 'br', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a', 'img', 'hr', 'code', 'pre',
];

/** 允许的属性：只留排版与图片所需，on* 事件天然不在列 */
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'title', 'style', 'class'];

export function sanitizePostHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    /** 外链一律新窗口打开并断开 opener，防 tabnabbing */
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'link'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'formaction', 'srcset'],
  });
}

/** 是否含图片（列表页决定要不要显示「含图」标记，避免整段 HTML 塞进卡片） */
export function hasImages(html: string): boolean {
  return /<img\b/i.test(html ?? '');
}

/** 富文本正文渲染器：v1 / v2 详情页与卡片共用一处过滤口径 */
export default function RichContent({
  html, style, className,
}: { html: string; style?: React.CSSProperties; className?: string }) {
  const clean = useMemo(() => sanitizePostHtml(html), [html]);
  /** 纯文本帖子（历史数据 / v1 旧帖）直接当文本渲染，不走 HTML 通道 */
  const isRich = /<\/?(p|div|strong|em|ul|ol|li|h[1-4]|img|blockquote)\b/i.test(html ?? '');
  if (!isRich) return <div style={style} className={className}>{html}</div>;
  return (
    <div
      className={className}
      style={{ ...style, lineHeight: 1.8, wordBreak: 'break-word' }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}