/**
 * V8.3-10.09个人中心「明细行可点进详情」冒烟
 *
 * 需求：个人中心 9 个 Tab（我的进度/选题/积分/作品/预约/帖子/悬赏/兑换/消息中心）
 * 里，**标签下方有数据的明细行都能点进对应详情页**（例：我的悬赏 → 该悬赏详情页）。
 *
 * 本脚本防两类复发：
 *  1. 某Tab 的明细行退回成不可点的<div>（看着像列表但点不动，最容易被当成"已完成"）；
 *  2. 深链参数用错 API —— 全站 HashRouter，`window.location.search` 恒为空，
 *     用它读 query 会**静默失效**（不报错，只是深链不生效），极难排查。
 */

import { readFileSync } from 'node:fs';

function read(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** 剥掉注释，只留真实代码行（注释里会写 to="/bounty/..." 等字样会误判） */
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

const p2 = code('src/pages/v2/ProfileV2.tsx');
const p1 = code('src/pages/c/Profile.tsx');
const s2 = code('src/pages/v2/ShopV2.tsx');
const s1 = code('src/pages/c/Shop.tsx');

/* ---------- A组：v2 明细行可点 ---------- */
check('A1 v2 我的悬赏 → 悬赏详情（/bounty/:id）', () => {
  const seg = /我的悬赏/.exec(p2) ? p2.slice(p2.indexOf('我的悬赏')) : '';
  if (!seg) return '未找到我的悬赏 Tab';
  const body = seg.slice(0, 1200);
  return /to=\{`\/bounty\/\$\{b\.id\}`\}/.test(body) ? true : '悬赏明细行不是 Link，点不动';
});
check('A2 v2 我的预约 → 该专家详情（/clinic/expert/:id）', () => {
  const i = p2.indexOf('我的预约');
  if (i < 0) return '未找到我的预约 Tab';
  const body = p2.slice(i, i + 1400);
  return /to=\{expert \? `\/clinic\/expert\/\$\{expert\.id\}`/.test(body)
    ? true
    : '预约明细行不可点，或未按 expert_id 定位专家';
});
check('A3 v2 我的兑换 → 商品详情（/shop?item=深链）', () => {
  const i = p2.indexOf('我的兑换');
  if (i < 0) return '未找到我的兑换 Tab';
  const body = p2.slice(i, i + 1600);
  return /nav\(`\/shop\?item=\$\{o\.item_id\}`\)/.test(body) ? true : '兑换明细行不可点';
});
check('A4 v2 我的兑换用 role=link + tabIndex（键盘可达，且与a 标签语义区分）', () => {
  const i = p2.indexOf('我的兑换');
  const body = p2.slice(i, i + 1600);
  return /role="link"/.test(body) && /tabIndex=\{0\}/.test(body)
    ? true
    : '缺role=link / tabIndex=0，键盘用户无法聚焦';
});
check('A5 v2 兑换行内按钮必须 stopPropagation（否则取消/确认收货会被导航吞掉）', () => {
  const i = p2.indexOf('我的兑换');
  // 切片要给足：兑换行里有核销码 / 物流 / 两个操作按钮，代码较长
  const body = p2.slice(i, i + 4200);
  const stops = (body.match(/e\.stopPropagation\(\)/g) || []).length;
  // 两个操作按钮（取消 / 确认收货）都要拦
  return stops >= 2 ? true : `只有 ${stops} 处 stopPropagation（应为 2：取消 + 确认收货）`;
});

/* ---------- B组：v1 对等（零 diff 红线） ---------- */
check('B1 v1 我的悬赏 → 悬赏详情', () => {
  const i = p1.indexOf('我的悬赏');
  if (i < 0) return '未找到我的悬赏 Tab';
  const body = p1.slice(i, i + 900);
  return /to=\{`\/bounty\/\$\{b\.id\}`\}/.test(body) ? true : 'v1 悬赏明细行不可点';
});
check('B2 v1 我的预约 → 该专家详情', () => {
  const i = p1.indexOf('我的预约');
  if (i < 0) return '未找到我的预约 Tab';
  const body = p1.slice(i, i + 1000);
  return /to=\{expert \? `\/clinic\/expert\/\$\{expert\.id\}`/.test(body) ? true : 'v1 预约明细行不可点';
});
check('B3 v1 我的兑换行onClick 跳转', () => {
  const i = p1.indexOf('我的兑换');
  if (i < 0) return '未找到我的兑换 Tab';
  const body = p1.slice(i, i + 1200);
  return /nav\(`\/shop\?item=\$\{o\.item_id\}`\)/.test(body) ? true : 'v1 兑换明细行不可点';
});

/* ---------- C组：深链参数必须用 useSearchParams（HashRouter 陷阱） ---------- */
for (const [label, src] of [['v2 ShopV2', s2], ['v1 Shop', s1]]) {
  check(`C.${label === 'v2 ShopV2' ? 1 : 2} ${label} 深链用 useSearchParams，不用 location.search`, () => {
    if (!/useSearchParams\(\)/.test(src)) return '未使用 useSearchParams';
    // 只要在深链读取处附近出现 location.search 就是错的
    const i = src.indexOf('deepLinkItem');
    const near = i >= 0 ? src.slice(Math.max(0, i - 700), i + 400) : src;
    return /location\.search/.test(near)
      ? '深链处仍在用 location.search —— HashRouter 下恒为空，链接会静默失效'
      : true;
  });
}
check('C3 商城深链 effect 依赖 deepLinkItem（换商品能重新打开）', () => {
  return /\[deepLinkItem, db\.shopItems\]/.test(s2) || /\[deepLinkItem, db\.shopItems\]/.test(s1)
    ? true
    : 'effect 依赖里没有 deepLinkItem';
});

/* ---------- D组：可点击行的视觉与可达性 ---------- */
check('D1 v1 链接行去掉下划线并保留 hover（.wb-list-row-link）', () => {
  const css = read('src/styles/global.css');
  const seg = /\.wb-list-row-link\{[\s\S]*?\}/.exec(css);
  if (!seg) return '未找到 .wb-list-row-link 样式';
  const s = seg[0];
  return /text-decoration:\s*none/.test(s) && /cursor:\s*pointer/.test(s)
    ? true
    : '缺 text-decoration:none / cursor:pointer';
});
check('D2 键盘聚焦要看得见（:focus-visible 有outline）', () => {
  const css2 = read('src/styles/global.css');
  const cssV2 = read('src/theme/v2/template.css');
  const a = /wb-list-row-link:focus-visible/.test(css2) || /wb-list-row-link:focus-visible/.test(css2);
  const b = /wb2-li\[role='link'\]:focus-visible/.test(cssV2);
  return a && b ? true : `v1=${a ? '有' : '缺'} v2=${b ? '有' : '缺'}（键盘用户会看不到焦点）`;
});
check('D3 v2 可点行 cursor:pointer（.wb2-li[role=link]）', () => {
  const cssV2 = read('src/theme/v2/template.css');
  return /\.wb2-li\[role='link'\]/.test(cssV2) && /cursor:\s*pointer/.test(cssV2)
    ? true
    : '缺 .wb2-li[role=link] 的 cursor:pointer';
});

/* ---------- E组：反向自检 ---------- */
check('E1 深链断言对旧实现会失败（用 location.search 时必须被抓）', () => {
  // 模拟旧写法：把 useSearchParams 换成 location.search
  const broken = s2.replace(/const \[sp\] = useSearchParams\(\);/, 'const id = new URLSearchParams(window.location.search).get("item");');
  const i = broken.indexOf('deepLinkItem');
  const near = i >= 0 ? broken.slice(Math.max(0, i - 700), i + 400) : broken;
  return /location\.search/.test(near) ? true : '把 useSearchParams 换成 location.search 后断言仍通过 → 断言无效';
});
check('E2 兑换行商品名要防溢出（商品名由运营填写，可能很长）', () => {
  const v2ok = /wb2-li-t" style=\{\{[^}]*overflowWrap:\s*'anywhere'/.test(p2);
  const v1ok = /wb-text-wrap/.test(p1);
  const cssOk = /\.wb-text-wrap\{[\s\S]*?overflow-wrap:\s*anywhere/.test(read('src/styles/global.css'));
  if (!v2ok) return 'v2 兑换行商品名无断词';
  if (!v1ok) return 'v1 兑换行商品名无断词（缺 wb-text-wrap）';
  if (!cssOk) return '.wb-text-wrap 定义缺 overflow-wrap';
  return true;
});

/* ---------- 输出 ---------- */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n个人中心明细跳转冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);