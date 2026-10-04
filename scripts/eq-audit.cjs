/*
 * P4 功能对等回归 · 对账脚本（只读，不改任何源码）
 *
 * 用法：node scripts/eq-audit.cjs
 *
 * 从四个维度自动 diff v1 页与 v2 页，找出「v1 有而 v2 没有」的功能面：
 *   ① handler 名    —— 业务动作是否丢失
 *   ② 按钮/菜单文案 —— 用户可见动作是否丢失
 *   ③ 表头/字段     —— 可见字段是否丢失
 *   ④ flags 读取点  —— 业务开关是否被忽略（决定「关 ≡ 旧版」是否成立）
 *
 * 说明：这是**候选清单**，不是结论。文案被改写、handler 被内联、字段名被合并
 * 都会产生误报，需人工逐条判定后写入收尾报告。
 */
const fs = require('fs');
const path = require('path');

const R = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return '';
  }
};

/** 业务 handler 名：const x = (…) | const x = async (…) | function x(…) */
const handlers = (s) => [
  ...new Set(
    [...s.matchAll(/(?:const|let)\s+([a-zA-Z][\w]*)\s*=\s*(?:async\s*)?\(/g)]
      .map((m) => m[1])
      .concat([...s.matchAll(/function\s+([a-zA-Z][\w]*)\s*\(/g)].map((m) => m[1]))
  ),
];

/** 用户可见文案：<Button>…</Button>、text:'…'、okText:'…'、label:'…' */
const labels = (s) => {
  const o = new Set();
  const cn = /[\u4e00-\u9fa5]/;
  [...s.matchAll(/<Button[^>]*>\s*([^<>{}\n]{1,30}?)\s*<\/Button>/g)].forEach((m) => {
    if (cn.test(m[1])) o.add(m[1].trim());
  });
  [...s.matchAll(/>\s*([^{}<>\n]{2,20}?)\s*<\/Button>/g)].forEach((m) => {
    if (cn.test(m[1])) o.add(m[1].trim());
  });
  [...s.matchAll(/\b(?:text|okText|cancelText|label|title)\s*[:=]\s*['"]([^'"]{2,24})['"]/g)].forEach(
    (m) => {
      if (cn.test(m[1])) o.add(m[1].trim());
    }
  );
  [...s.matchAll(/children:\s*['"]([^'"]{2,24})['"]/g)].forEach((m) => {
    if (cn.test(m[1])) o.add(m[1].trim());
  });
  return o;
};

/** 字段：表格列 title / dataIndex / Form 项 label */
const cols = (s) => {
  const o = new Set();
  [...s.matchAll(/title:\s*['"]([^'"]{1,24})['"]/g)].forEach((m) => o.add(m[1]));
  [...s.matchAll(/dataIndex:\s*['"]([\w.]+)['"]/g)].forEach((m) => o.add(m[1]));
  return o;
};

/** 业务开关读取点 */
const flags = (s) => new Set([...s.matchAll(/flags\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]));

/** 纯展示用小组件名，缺了不算功能丢失 */
const VIEW_ONLY =
  /^(Sub|Row|Tag|Pill|Card|Item|Cell|Head|Foot|Wrap|Box|Txt|Note|Tip|Bar|Chip|List|Empty|Kv|Mini|Icon|Av|Sec|Grid|Tabs|Dialog|Field|Metric|Panel|Block|Label|Desc|Title|Content|Body|Header|Footer|Div|Sp|Spacer|Col|Line|Dot|Badge|Stat|Num|Time|User|Name|Text|Link|Btn|BtnGroup|Actions|Toolbar|Section|Group|Slot|Option|Select|Input|Form|Table|Modal|Drawer|Steps|Progress|Avatar|Seg|Radio|Check|Switch|Slider|Rate|Tree|Menu|Dropdown|Popover|Tooltip|Collapse|Timeline|Calendar|Upload|Download|Export|Import|Preview|Search|Filter|Sort|Page|Pager|Nav|Bread|Sider|Layout|Shell|Main|Aside|Hero|Quote|Alert|Toast|Msg|Confirm|Ask|Do|Go|To|Is|Has|Get|Set|On|Of|By|In|At|For|With|From|New|Old|Cur|Prev|Next|Last|First|All|Any|Some|None|Null|True|False)$/;

const dir = 'src/pages/v2';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('V2.tsx'));
const rows = [];
let total = 0;

for (const f of files) {
  const base = f.replace(/V2\.tsx$/, '');
  let v1p = null;
  for (const d of ['a', 'b', 'c', 'e']) {
    const p = path.join('src/pages', d, base + '.tsx');
    if (fs.existsSync(p)) {
      v1p = p;
      break;
    }
  }
  if (!v1p) {
    rows.push([base, '(无 v1 同名页)', '-', '-', '-']);
    continue;
  }
  const A = R(path.join(dir, f));
  const B = R(v1p);
  const miss = (a, b) => [...a].filter((x) => !new Set(b).has(x));

  const mh = miss(handlers(B), handlers(A)).filter((x) => !VIEW_ONLY.test(x));
  const ml = miss(labels(B), labels(A));
  const mc = miss(cols(B), cols(A));
  const mf = miss(flags(B), flags(A));
  total += mh.length + ml.length + mc.length + mf.length;

  rows.push([
    base,
    mh.length ? mh.join(' ') : '·',
    ml.length ? ml.join(' ') : '·',
    mc.length ? mc.join(' ') : '·',
    mf.length ? mf.join(' ') : '·',
  ]);
}

const P = (s, w) => {
  // 中文按 2 宽补齐
  const len = [...String(s)].reduce((n, c) => n + (/[\u4e00-\u9fa5]/.test(c) ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(1, w - len));
};

console.log(P('页面', 22) + P('① 缺 handler', 40) + P('② 缺文案', 40) + P('③ 缺字段', 34) + '④ 缺开关');
console.log('-'.repeat(150));
for (const r of rows) {
  console.log(P(r[0], 22) + P(r[1].slice(0, 60), 40) + P(r[2].slice(0, 60), 40) + P(r[3].slice(0, 50), 34) + r[4].slice(0, 40));
}
console.log('\n候选差异总数：' + total + '（需人工判定，改写/内联会产生误报）');
