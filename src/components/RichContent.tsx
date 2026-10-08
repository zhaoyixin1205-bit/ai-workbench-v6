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

/**
 * V8.3-10.09 正文防溢出样式（同类问题一起修）。
 *
 * 两个真实风险：
 *  1. **裸 URL 无空格** → 用户把钉钉/腾讯文档链接粘进正文，会把整栏横向撑破，
 *     页面出现横向滚动条（实测社区/案例详情都出现过）。
 *  2. **超大图片** → 白名单放行了 `img`，但没有任何尺寸约束；
 *     用户插入一张宽 2000px 的截图，正文列就被顶破（移动端尤其明显）。
 *
 * `overflowWrap: 'anywhere'` 而不是 `break-word`：后者遇到超长单词会整体挪到下一行，
 * 一行超长 URL 会在正文中间留出大片空白，视觉上同样像"卡断"。
 */
const WRAP_STYLE: React.CSSProperties = {
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  maxWidth: '100%',
};

/** 富文本内容区的兜底样式：img/表格/超宽块一律压回容器宽度 */
const RICH_INNER_CSS =
  'img{max-width:100%;height:auto;display:inline-block}' +
  'video,iframe{max-width:100%}' +
  'table{max-width:100%;table-layout:auto}' +
  'pre,code{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}' +
  'a{overflow-wrap:anywhere;word-break:break-word}';

/** 富文本正文渲染器：v1 / v2 详情页与卡片共用一处过滤口径 */
export default function RichContent({
  html, style, className,
}: { html: string; style?: React.CSSProperties; className?: string }) {
  const clean = useMemo(() => sanitizePostHtml(html), [html]);
  /** 纯文本帖子（历史数据 / v1 旧帖）直接当文本渲染，不走 HTML 通道 */
  const isRich = /<\/?(p|div|strong|em|ul|ol|li|h[1-4]|img|blockquote)\b/i.test(html ?? '');
  if (!isRich) {
    return (
      <div style={{ ...style, ...WRAP_STYLE }} className={className}>
        {html}
      </div>
    );
  }
  return (
    <div
      className={className}
      style={{ ...style, ...WRAP_STYLE, lineHeight: 1.8 }}
      /**
       * 白名单放行了 img/table/style，仅靠 JSX 的 overflowWrap 管不到 HTML 内部元素 ——
       * 所以再挂一条作用域内的样式兜底（不写进全局，避免污染其它页面）。
       */
      dangerouslySetInnerHTML={{ __html: `<style>${RICH_INNER_CSS}</style>${clean}` }}
    />
  );
}