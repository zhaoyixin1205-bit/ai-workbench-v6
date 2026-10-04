/*
 * P4+ 深度回归 · 表单校验规则逐条比对（只读，不改任何源码）
 *
 * 用法：node scripts/eq-validate.cjs
 *
 * 补 eq-audit / eq-write 没覆盖的一维：v2 有没有把 v1 的**校验规则**原样搬过来。
 * 这一维很关键——校验漏了不会报错、不会白屏，只会让脏数据进库，是最容易漏网的功能丢失。
 *
 * 主信号 ①（阈值/必填 token，抗文案改写）：
 *   长度阈值 `.length < 20`、非空 `!x`、required、min/max/len、pattern 正则源码。
 *   取的是「规则形状」而不是提示语，所以 v2 改了文案也不会误报。
 * 次信号 ②（校验文案，会误报，仅参考）：
 *   message.error/warning 与 rules 里的 message。v2 若改写过提示语会产生误报，需人工确认。
 *
 * v2 侧 = v2 页 + 该页 import 的 src/hooks/*（逻辑抽到 hook 不算丢失）。
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

/** ① 规则形状 token */
function ruleTokens(s) {
  const o = new Set();
  // 长度阈值：.length < 20 / >= 5 / === 0
  for (const m of s.matchAll(/\.\s*length\s*(<=|>=|<|>|===|==)\s*(\d+)/g)) {
    o.add('length' + m[1] + m[2]);
  }
  // 非空/取反守卫：if (!x) / !x.trim() / if (!x.length)
  for (const m of s.matchAll(/!\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*\)/g)) {
    const k = m[1];
    if (['undefined', 'null'].includes(k)) continue;
    o.add('!' + k);
  }
  // AntD 规则
  for (const m of s.matchAll(/required:\s*true/g)) o.add('required');
  for (const m of s.matchAll(/\bmin:\s*(\d+)/g)) o.add('min:' + m[1]);
  for (const m of s.matchAll(/\bmax:\s*(\d+)/g)) o.add('max:' + m[1]);
  for (const m of s.matchAll(/\blen:\s*(\d+)/g)) o.add('len:' + m[1]);
  for (const m of s.matchAll(/pattern:\s*(\/[^/\n]{1,80}\/[gimsuy]*)/g)) o.add('re:' + m[1]);
  for (const m of s.matchAll(/\btype:\s*['"](email|url|number|array|string)['"]/g)) {
    o.add('type:' + m[1]);
  }
  return o;
}

/** ② 校验文案：error/warning 提示语 + rules 里的 message */
function ruleMsgs(s) {
  const o = new Set();
  for (const m of s.matchAll(/message\.(?:error|warning)\(\s*['"`]([^'"`]{2,60})/g)) {
    o.add(m[1].trim());
  }
  for (const m of s.matchAll(
    /message\.(?:error|warning)\(\s*\{[^}]{0,200}?content:\s*['"`]([^'"`]{2,60})/g
  )) {
    o.add(m[1].trim());
  }
  for (const m of s.matchAll(/\bmessage:\s*['"`]([^'"`]{2,60})/g)) o.add(m[1].trim());
  return o;
}

/** v2 侧 = 页面 + 它 import 的 hooks */
function v2Side(file) {
  const src0 = R(path.join('src/pages/v2', file));
  const hooks = [
    ...new Set(
      [...src0.matchAll(/from\s+['"](?:@\/)?(?:.*\/)?hooks\/([A-Za-z0-9_]+)['"]/g)].map((x) => x[1])
    ),
  ];
  let src = src0;
  for (const h of hooks) {
    const hp = path.join('src/hooks', h + '.ts');
    if (fs.existsSync(hp)) src += '\n' + R(hp);
  }
  return { src, hooks };
}

const files = fs.readdirSync('src/pages/v2').filter((f) => f.endsWith('V2.tsx'));
const rows = [];
let t = [0, 0];
let pairCount = 0;
let cov = [0, 0, 0, 0]; // v1规则数 / v2规则数 / v1文案数 / v2文案数（证明比对非空）
const extra = new Map(); // v2 新增的规则 token → 出现在哪些页

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
  if (!v1p) continue;
  pairCount++;

  const A = v2Side(f).src;
  const B = R(v1p);

  const tkA = ruleTokens(A);
  const tkB = ruleTokens(B);
  const msA = ruleMsgs(A);
  const msB = ruleMsgs(B);

  const missTk = [...tkB].filter((x) => !tkA.has(x));
  const missMs = [...msB].filter((x) => !msA.has(x));

  cov[0] += tkB.size;
  cov[1] += tkA.size;
  cov[2] += msB.size;
  cov[3] += msA.size;

  // v2 多出来的规则：新增校验可能挡住用户（过度校验），同样要看
  for (const x of tkA) if (!tkB.has(x)) (extra.get(x) || extra.set(x, []).get(x)).push(base);

  t[0] += missTk.length;
  t[1] += missMs.length;
  if (missTk.length || missMs.length) {
    rows.push([base, missTk.join(' '), missMs.join(' | ')]);
  }
}

const P = (s, w) => {
  const len = [...String(s)].reduce((n, c) => n + (/[\u4e00-\u9fa5]/.test(c) ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(1, w - len));
};

console.log('比对页面数 ' + pairCount + '（v2 页 + 其 hooks　vs　v1 同名页）\n');
console.log(P('页面', 20) + P('① v1 有 v2 缺的校验规则', 46) + '② v1 有 v2 缺的校验文案（含误报）');
console.log('-'.repeat(150));
for (const r of rows) {
  console.log(P(r[0], 20) + P(r[1].slice(0, 70), 46) + r[2].slice(0, 80));
}
console.log(
  '\n候选：① 缺规则 ' + t[0] + ' · ② 缺文案 ' + t[1] + '（① 是主信号，② 会因文案改写误报，需人工判定）'
);
console.log(
  '覆盖量：规则 v1 ' + cov[0] + ' / v2 ' + cov[1] + ' · 文案 v1 ' + cov[2] + ' / v2 ' + cov[3] +
    '（若两边都为 0 说明提取器失效，结果是假阴性）'
);
if (extra.size) {
  console.log('\nv2 新增的校验规则（需确认不是过度校验挡住用户）：');
  [...extra.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([k, v]) => console.log('  ' + P(k, 28) + '← ' + [...new Set(v)].join(' ')));
}
