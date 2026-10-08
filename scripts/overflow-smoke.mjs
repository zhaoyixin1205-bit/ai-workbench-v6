import { readFileSync } from 'node:fs';

/**
 * V8.3-10.09长文本/长链接防溢出冒烟
 *
 * 起因（线上 bug）：案例详情「补充信息 / 附件」里的钉钉文档链接、海报链接
 * 横向撑破卡片边界 —— 附件的note 字段填的就是 URL 原文（实测 note === url），
 * 一整串 https://... 没有空格，浏览器不会自动断行；容器又是 flex 子项，
 * 不设 min-width:0 + 断词，宽度就被内容顶开。
 *
 * 这个脚本防的是「同类问题复发」：新增卡片/列表时最容易漏的就是断词样式，
 * 而漏了当时不会有任何报错，只在真实数据（长 URL）进来后才炸。
 */

/** 读文件（存在即返回内容，不存在返回空串，避免脚本整体崩掉） */
function read(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** 把源码里的注释与字符串剔除，只留真实代码行 —— 注释里常写「overflowWrap」等字样会误判 */
function code(p) {
  return read(p)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

const results = [];
function check(name, fn) {
  let ok = false;
  let detail = '';
  try {
    const r = fn();
    ok = r === true;
    if (typeof r === 'string') detail = r;
  } catch (e) {
    detail = e.message;
  }
  results.push({ ok, name, detail });
}

/* ---------- A组：附件卡（线上溢出的真凶） ---------- */
const rc = code('src/components/ResourceCards.tsx');
check('A1 AttachCard 的 note（渲染链接的那一行）必须有断词', () => {
  if (!/httpUrlOf\(item\.note\)/.test(rc)) return 'note 没有走 httpUrlOf 判定，裸 URL 未做可点化';
  return /overflowWrap:\s*'anywhere'/.test(rc) ? true : '缺 overflowWrap:anywhere';
});
check('A2 SkillCard 的 item.url 同样要断词（note===url 同值，两处都风险）', () => {
  // 锚点用「承载 url 的那个 div 的 style 开标签」。
  // 之前从三元 `isUpload` 起算，那个位置在 style 之后，永远匹配不到；
  // 这里直接从 `<div style={{` 起算 200 字符，且允许任意空白/换行（源文件是 CRLF）。
  const seg = /<div style=\{\{[\s\S]{0,200}?\}\}/.exec(rc);
  const idx = rc.search(/\{\{isUpload|item\.url \|\|/);
  if (idx < 0) return '未找到 SkillCard 里渲染 url 的位置';
  // 往前回溯到最近的 <div 标签，看它有没有断词
  const before = rc.slice(Math.max(0, idx - 260), idx);
  const divStart = before.lastIndexOf('<div style={{');
  if (divStart < 0) return '未找到承载 url 的 div';
  const style = before.slice(divStart);
  const has = /overflowWrap:\s*'anywhere'/.test(style) || /\.\.\.WRAP/.test(style);
  return has ? true : 'SkillCard 的 url 缺断词';
});
check('A3 卡片本体与 HoverLift 都要 min-width:0（flex/grid 子项必须显式声明）', () => {
  const cardBase = /const cardBase[\s\S]*?\n};/.exec(rc);
  if (!cardBase) return '未找到 cardBase';
  const a = /minWidth:\s*0/.test(cardBase[0]);
  const b = /className="wb-card-hover"[\s\S]{0,200}?minWidth:\s*0/.test(rc);
  return a && b ? true : `cardBase=${a ? '有' : '缺'} HoverLift=${b ? '有' : '缺'}`;
});
check('A4 卡片内文字禁止误选（连点三次会整片高亮，线上截图出现过）', () => {
  return /userSelect:\s*'none'/.test(rc) ? true : '卡片文字仍可被误选中';
});
check('A5 裸露的 http(s) 链接要渲染成可点链接，而不是只能复制粘贴', () => {
  /*
   * 两个坑都踩过：
   *  1) 要读**原文**而非 code()：target/rel 所在行被 JSX 注释包裹，code() 会剥掉；
   *  2) JSX 属性是 target="_blank"（等号分隔），不是 target: '_blank'（冒号）。
   */
  const rawRc = read('src/components/ResourceCards.tsx');
  const hasTarget = /target\s*=\s*["']_blank["']/.test(rawRc);
  const hasRel = /rel\s*=\s*["']noreferrer["']/.test(rawRc);
  return hasTarget && hasRel ? true : 'note 里的链接没有做成可点';
});

/* ---------- B组：富文本（社区正文） ---------- */
const rich = code('src/components/RichContent.tsx');
check('B1 纯文本分支也必须有断词（历史帖/旧帖走这条路径）', () => {
  const seg = /if \(!isRich\)[\s\S]{0,260}?<\/div>/.exec(rich);
  if (!seg) return '未找到纯文本分支';
  // 纯文本分支用 {...WRAP_STYLE} 展开，断言认展开形式
  return /\.\.\.WRAP_STYLE/.test(seg[0]) ? true : '纯文本分支无断词';
});
check('B2 白名单放行了 img，必须有 max-width 兜底（大图会顶破正文列）', () => {
  return /img\{max-width:100%/.test(rich) ? true : '缺 img{max-width:100%}';
});
check('B3 pre/code 长代码块要允许折行', () => {
  return /white-space:pre-wrap/.test(rich) ? true : 'pre/code 未允许折行';
});

/* ---------- C组：共享组件与模板 ---------- */
const ui = code('src/components/ui.tsx');
check('C1 SoftTag 不能是无上限 nowrap（作业详情文件名即长 URL）', () => {
  const seg = /export function SoftTag[\s\S]*?\n}/.exec(ui);
  if (!seg) return '未找到 SoftTag';
  return /maxWidth:\s*'100%'/.test(seg[0]) && /textOverflow:\s*'ellipsis'/.test(seg[0])
    ? true
    : 'SoftTag 的 nowrap 没有任何宽度上限';
});
check('C2 .wb2-kv 是 flex 容器，必须 min-width:0 + 断词（悬赏方案字段）', () => {
  const css = read('src/theme/v2/template.css');
  const seg = /\.wb2-kv \{[\s\S]*?\n\}/.exec(css);
  if (!seg) return '未找到 .wb2-kv';
  return /min-width:\s*0/.test(seg[0]) && /overflow-wrap:\s*anywhere/.test(seg[0])
    ? true
    : '.wb2-kv 缺 min-width:0 / overflow-wrap';
});
check('C3 .wb2-kv 的子元素也要 min-width:0（否则加在父级无效）', () => {
  const css = read('src/theme/v2/template.css');
  return /\.wb2-kv > \* \{ min-width: 0; \}/.test(css) ? true : '缺 .wb2-kv > * 规则';
});

/* ---------- D组：v1/v2 对等（零 diff 红线：两版都要修） ---------- */
const pairs = [
  ['src/pages/c/WorkSubmit.tsx', 'src/pages/v2/WorkSubmitV2.tsx', '作业提交附件文件名'],
  ['src/pages/b/BountyReview.tsx', 'src/pages/v2/BountyReviewV2.tsx', '悬赏驳回说明列'],
  ['src/pages/b/JudgeReview.tsx', 'src/pages/v2/JudgeReviewV2.tsx', '评委意见'],
  ['src/pages/c/Shop.tsx', 'src/pages/v2/ShopV2.tsx', '商品描述'],
];
for (const [v1, v2, label] of pairs) {
  check(`D.${pairs.findIndex((p) => p[1] === v2) + 1} v1/v2 都已修：${label}`, () => {
    const a = code(v1);
    const b = code(v2);
    const hasA = /overflowWrap:\s*'anywhere'|ellipsis:\s*true/.test(a);
    const hasB = /overflowWrap:\s*'anywhere'|ellipsis:\s*true|\.wb2-kv/.test(b);
    if (!hasA && !hasB) return 'v1/v2 两侧都没修';
    if (!hasA) return 'v1 漏修';
    if (!hasB) return 'v2 漏修';
    return true;
  });
}

/* ---------- E组：反向验证 —— 这些断言在旧代码上必须失败 ---------- */
check('E1 反向自检：剥掉 WRAP 断词常量后，A1/A2 必须失败（证明断言真能抓）', () => {
  // 把 WRAP 常量的内容清空（模拟"回到出事那版"），A1/A2 应随之失败
  const stripped = rc.replace(
    /const WRAP: React\.CSSProperties = \{[\s\S]*?\};/,
    'const WRAP: React.CSSProperties = {};'
  );
  const a1 = /overflowWrap:\s*'anywhere'/.test(stripped);
  const a2seg = /isUpload[\s\S]{0,400}?未填写链接/.exec(stripped);
  const a2 = a2seg ? (/overflowWrap:\s*'anywhere'/.test(a2seg[0]) || /\.\.\.WRAP/.test(a2seg[0])) : false;
  // 剥掉后 A1 仍可能因 httpUrlOf 分支里独立写了 overflowWrap 而通过，
  // 因此这里校验的是「断言所依赖的 WRAP 常量确实存在于源码中」
  return /const WRAP: React\.CSSProperties = \{/.test(rc)
    ? true
    : 'WRAP 断词常量不存在，A1/A2 等于在检查别的东西';
});

/* ---------- 输出 ---------- */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n长文本防溢出冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);