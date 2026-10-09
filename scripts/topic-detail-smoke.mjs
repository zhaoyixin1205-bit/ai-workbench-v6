/**
 * V8.3-10.09 选题池「点行看详情」冒烟
 *
 * 需求：选题池要和悬赏池一样，点条目能查看详情。
 *
 * 关键设计决策（勿回退）：选题**不新建 /topics/:id 详情页**，改用弹层/浮层。
 * 原因：选题与案例是两批独立内容（标题完全不同），选题的 `case_id` 字段
 * 指向早已不存在的旧 id（线上 21 条全部对不上 A1/A2/A3…）且全代码库零使用 ——
 * 属历史废弃字段，不能拿它跳案例详情。
 *
 * 本脚本防两类复发：
 *  1. 选题行退回不可点（看着是列表但点不动，与悬赏池不一致）；
 *  2. 行内「选它」按钮没 stopPropagation —— 点按钮会连带弹出详情浮层，
 *     用户想选却先看到弹窗，是明显的体验事故。
 */

import { readFileSync } from 'node:fs';

function read(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** 剥注释：注释里常写 onClick/setTopicView 等字样，会让正则误判 */
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

const v2 = code('src/pages/v2/CaseListV2.tsx');
const v1 = code('src/pages/c/CaseList.tsx');

/* ---------- A组：v2 选题行可点 + 按钮防误触 ---------- */
check('A1 v2 选题行有 topicView state（点行打开详情）', () => {
  return /const \[topicView, setTopicView\] = useState<Topic \| null>\(null\)/.test(v2)
    ? true
    : '未声明 topicView state';
});
check('A2 v2 选题行整行可点（role=link + tabIndex + cursor）', () => {
  // 选题清单那段（wb2-list + topicList.map）里必须有可点语义
  const i = v2.indexOf('f.topicList.map');
  if (i < 0) return '未找到选题清单渲染段';
  const body = v2.slice(i, i + 2200);
  const hasRole = /role="link"/.test(body);
  const hasTab = /tabIndex=\{0\}/.test(body);
  const hasClick = /onClick=\{\(\) => setTopicView\(t\)\}/.test(body);
  const hasCursor = /cursor:\s*'pointer'/.test(body);
  if (!hasRole) return '选题行缺 role=link';
  if (!hasTab) return '选题行缺 tabIndex=0（键盘不可达）';
  if (!hasClick) return '选题行缺 onClick 打开详情';
  if (!hasCursor) return '选题行缺 cursor:pointer';
  return true;
});
check('A3 v2 选题行键盘可达（Enter/Space 打开详情）', () => {
  const i = v2.indexOf('f.topicList.map');
  const body = v2.slice(i, i + 2200);
  return /onKeyDown/.test(body) && /e\.key === 'Enter'/.test(body) ? true : '缺 Enter/Space 键盘处理';
});
check('A4 v2「选它」按钮必须 stopPropagation（否则点按钮会连带弹详情）', () => {
  const i = v2.indexOf('f.topicList.map');
  const body = v2.slice(i, i + 3200);
  return /e\.stopPropagation\(\)/.test(body)
    ? true
    : '「选它」按钮未拦冒泡 —— 点它会先弹出详情浮层，用户想选却看到弹窗';
});

/* ---------- B组：浮层内容完整性 ---------- */
check('B1 v2 浮层存在且标题为「选题详情」', () => {
  return /open=\{!!topicView\}/.test(v2) && /title="选题详情"/.test(v2) ? true : '浮层未正确绑定 topicView';
});
check('B2 v2 浮层展示关键字段（赛道/难度/状态/已选人数/期望产出/标签）', () => {
  const i = v2.indexOf('title="选题详情"');
  if (i < 0) return '未找到浮层';
  const body = v2.slice(i, i + 3000);
  const need = [
    ['赛道', /topicView\.track/],
    ['难度', /topicView\.difficulty/],
    ['状态', /topicView\.status/],
    ['已选人数', /pickedCount\(topicView\.id\)/],
    ['期望产出', /topicView\.expected_output/],
    ['标签', /topicView\.tags/],
  ];
  const miss = need.filter(([, re]) => !re.test(body)).map(([n]) => n);
  return miss.length === 0 ? true : `浮层缺少：${miss.join('、')}`;
});
check('B3 v2 浮层里保留「选它」入口（不只是只读）', () => {
  const i = v2.indexOf('title="选题详情"');
  const body = v2.slice(i, i + 3000);
  return /pickTopic\(topicView\)/.test(body) ? true : '浮层内没有选它入口，用户看完还得关掉再点外面';
});
check('B4 v2 自定义选题的可见性要在浮层里说清（CR-17 口径）', () => {
  const i = v2.indexOf('title="选题详情"');
  const body = v2.slice(i, i + 3000);
  return /仅本人与组织者可见/.test(body) ? true : '浮层未展示自定义选题的可见性';
});

/* ---------- C组：v1 对等（零 diff 红线） ---------- */
check('C1 v1 选题行整行可点', () => {
  const i = v1.indexOf('选它');
  const body = v1.slice(Math.max(0, i - 3000), i + 400);
  const hasRole = /role="link"/.test(body);
  const hasTab = /tabIndex=\{0\}/.test(body);
  const hasClick = /onClick=\{\(\) => setTopicView\(t\)\}/.test(body);
  if (!hasRole) return 'v1 选题行缺 role=link';
  if (!hasTab) return 'v1 选题行缺 tabIndex=0';
  if (!hasClick) return 'v1 选题行缺 onClick';
  return true;
});
check('C2 v1「选它」按钮 stopPropagation', () => {
  const i = v1.indexOf('选它');
  const body = v1.slice(Math.max(0, i - 900), i + 400);
  return /e\.stopPropagation\(\)/.test(body) ? true : 'v1「选它」按钮未拦冒泡';
});
check('C3 v1 浮层存在且字段完整', () => {
  return /open=\{!!topicView\}/.test(v1) && /title="选题详情"/.test(v1) && /topicView\.expected_output/.test(v1)
    ? true
    : 'v1 浮层不完整';
});

/* ---------- D组：不得引入错误的跳转假设 ---------- */
check('D1 选题不得用 case_id 跳案例详情（该字段是废弃数据）', () => {
  // 正确做法是弹层。若有人改成 nav(`/cases/${t.case_id}`) 会被这条抓住
  const bad = /nav\(`\/cases\/\$\{t\.case_id\}`\)/.test(v2) || /to=\{`\/cases\/\$\{t\.case_id\}`\}/.test(v1);
  return bad === false ? true : '选题在用 case_id 跳案例详情 —— 该字段指向不存在的旧 id，会 404';
});
check('D2 未新增 /topics 路由（本轮刻意用浮层，不新建页面）', () => {
  const app = read('src/App.tsx');
  return /path="\/topics/.test(app) ? '新增了 /topics 路由 —— 与本轮「浮层」方案不一致，需确认是否有意为之' : true;
});

/* ---------- E组：反向自检 ---------- */
check('E1 去掉 stopPropagation 后 A4 必须失败（证明断言真能抓）', () => {
  /**
   * ⚠️ 两个坑都踩过：
   *  1) 全代码库多处都有 e.stopPropagation()（个人中心兑换行也有），
   *     无脑 replace 第一处会命中别处 → 自检失效。必须**定位到选题那一段**再替换。
   *  2) code() 已剥掉注释，所以不能靠注释文字定位 —— 用「按钮的 disabled 紧邻 onClick」
   *     这段代码特征来定位（选题按钮独有）。
   */
  const i = v2.indexOf('f.topicList.map');
  if (i < 0) return '未找到选题清单渲染段';
  const seg = v2.slice(i, i + 3200);
  const at = seg.indexOf('e.stopPropagation();');
  if (at < 0) return '选题段内本就没有 stopPropagation，A4 断言与实际不符';
  const broken = v2.slice(0, i) + seg.slice(0, at) + ';' + seg.slice(at + 'e.stopPropagation();'.length);
  const body = broken.slice(broken.indexOf('f.topicList.map'), 0 + 3200);
  const stillHas = /e\.stopPropagation\(\)/.test(
    broken.slice(broken.indexOf('f.topicList.map'), broken.indexOf('f.topicList.map') + 3200)
  );
  return stillHas === false ? true : '剥掉选题按钮的 stopPropagation 后断言仍通过 → 断言无效';
});
check('E2 去掉 onClick 后 A2 必须失败', () => {
  const broken = v2.replace(/onClick=\{\(\) => setTopicView\(t\)\}/, '');
  const i = broken.indexOf('f.topicList.map');
  const body = broken.slice(i, i + 2200);
  return /onClick=\{\(\) => setTopicView\(t\)\}/.test(body) === false ? true : '剥掉 onClick 后断言仍通过 → 断言无效';
});

/* ---------- 输出 ---------- */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n选题池详情冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);