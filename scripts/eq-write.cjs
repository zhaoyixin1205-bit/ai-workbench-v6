/*
 * P4+ 深度回归 · 写库 payload 逐字段比对（只读，不改任何源码）
 *
 * 用法：node scripts/eq-write.cjs
 *
 * 与 eq-audit.cjs 的区别：
 *   - eq-audit 比「有没有这个 handler」；本脚本比「写进去的字段少了没有」——更贴近零功能丢失红线。
 *   - 本项目的写库入口是 store 的 `setDb(...)`，所以按 handler 逐个提取 setDb 的对象字面量键。
 *   - v2 侧 = v2 页 + 该页 import 的 src/hooks/*（逻辑抽到 hook 不算丢失，消除误报）。
 *   - 按**同名 handler** 比对（v1 的 rejectApply 对 v2 的 rejectApply），比整页并集精确得多。
 *
 * 输出三列：
 *   ① v2 无同名写入 handler（动作可能整个丢了）
 *   ② v1 写了但 v2 没写的字段（红线：功能丢失）
 *   ③ v2 写了但 v1 没写的字段（需确认是增强还是误写）
 *
 * 这是**候选清单**，不是结论。改名、拆函数、条件分支里的字段都会产生误报，需人工判定。
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

/** 花括号配对，返回匹配的 `}` 下标；粗略跳过字符串/模板串/行注释 */
function matchBrace(s, i) {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '/' && s[k + 1] === '/') {
      while (k < s.length && s[k] !== '\n') k++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      k++;
      while (k < s.length && s[k] !== q) {
        if (s[k] === '\\') k++;
        k++;
      }
      continue;
    }
    if (c === '{') d++;
    else if (c === '}') {
      d--;
      if (d === 0) return k;
    }
  }
  return -1;
}

/** 对象字面量顶层键（含 `...spread` 标记） */
function topKeys(body) {
  const keys = new Set();
  let d = 0;
  let buf = '';
  const flush = () => {
    const t = buf.trim();
    buf = '';
    if (!t) return;
    const m = t.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (m) return void keys.add(m[1]);
    const sp = t.match(/^\.\.\.(.+)$/);
    if (sp) return void keys.add('…' + sp[1].trim().replace(/\s+/g, ' ').slice(0, 20));
    const sh = t.match(/^([A-Za-z_$][\w$]*)$/);
    if (sh) keys.add(sh[1]);
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      buf += c;
      i++;
      while (i < body.length && body[i] !== q) {
        if (body[i] === '\\') buf += body[i++];
        buf += body[i++];
      }
      buf += q;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') d++;
    if (c === '}' || c === ')' || c === ']') d--;
    if (c === ',' && d === 0) flush();
    else buf += c;
  }
  flush();
  return keys;
}

/** 从 `(` 或 `,` 或 `return ` 引导处往后找对象字面量，返回 [start, end] */
function findObject(s, from, limit) {
  for (let k = from; k < s.length && k < limit; k++) {
    if (s[k] !== '{') continue;
    let j = k - 1;
    while (j >= from && /\s/.test(s[j])) j--;
    const prev = j >= 0 ? s[j] : '';
    const tail = s.slice(Math.max(0, j - 7), j + 1);
    if (prev === '(' || prev === ',' || /return\s*$/.test(tail)) {
      const end = matchBrace(s, k);
      if (end > 0) return [k, end];
    }
  }
  return null;
}

/** 跳过字符串地找 `(` 的配对 `)` */
function matchParen(s, i) {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      k++;
      while (k < s.length && s[k] !== q) {
        if (s[k] === '\\') k++;
        k++;
      }
      continue;
    }
    if (c === '(') d++;
    else if (c === ')') {
      d--;
      if (d === 0) return k;
    }
  }
  return -1;
}

/**
 * 切出 handler 块：const NAME = (…) => { … }
 * 必须走「配对参数括号 → 定位 => → 取块」三步，否则
 * `const fileMeta = (): Attachment[] => solAtts;` 这类表达式箭头会把块错延到下一个函数。
 */
function handlers(src) {
  const out = new Map();
  const re = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g;
  let m;
  while ((m = re.exec(src))) {
    const next = m.index + m[0].length;
    const open = next - 1; // 指向 `(`
    const close = matchParen(src, open);
    if (close < 0) {
      re.lastIndex = next;
      continue;
    }
    let arrow = -1;
    for (let j = close + 1; j < Math.min(src.length, close + 500); j++) {
      if (src[j] === '=' && src[j + 1] === '>') {
        arrow = j;
        break;
      }
      if (src[j] === ';') break; // 不是箭头函数（如类型声明）
    }
    if (arrow < 0) {
      re.lastIndex = next;
      continue;
    }
    const b = src.indexOf('{', arrow);
    const sEnd = src.indexOf(';', arrow); // 语句边界：表达式箭头没有块体
    if (b < 0 || (sEnd > 0 && b > sEnd)) {
      re.lastIndex = next;
      continue;
    }
    const end = matchBrace(src, b);
    if (end < 0) {
      re.lastIndex = next;
      continue;
    }
    out.set(m[1], src.slice(b, end + 1));
    // 从名字之后继续扫，不跳到块尾——否则前一个 handler 解析错位会吞掉后面所有 handler
    re.lastIndex = next;
  }
  return out;
}

/** 单个 handler 内所有 setDb 写入的字段并集 */
function writeKeys(body) {
  const keys = new Set();
  const re = /\bsetDb\s*\(/g;
  let m;
  while ((m = re.exec(body))) {
    const obj = findObject(body, m.index + m[0].length - 1, m.index + 2000);
    if (!obj) continue;
    topKeys(body.slice(obj[0] + 1, obj[1])).forEach((k) => keys.add(k));
    re.lastIndex = obj[1];
  }
  return keys;
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
const seen = new Set(); // 名字在 v2 侧存在但没解析出写入的（非丢失，供核对）
let t = [0, 0, 0];
let pairCount = 0;

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

  const side = v2Side(f);
  const A = handlers(side.src);
  const B = handlers(R(v1p));
  const seen = new Set(); // 解析不出写入但名字确实存在于 v2 侧的，不算丢失

  const noCall = [];
  const miss = [];
  const extra = [];

  for (const [name, bodyB] of B) {
    const keysB = writeKeys(bodyB);
    if (!keysB.size) continue; // 该 handler 不写库，不参与比对
    if (!A.has(name)) {
      // 兜底：名字在 v2 侧出现过（可能解析错位或写法不同）→ 只记录，不判丢失
      if (new RegExp('\\b' + name + '\\b').test(side.src)) {
        seen.add(name);
        continue;
      }
      noCall.push(name);
      continue;
    }
    const keysA = writeKeys(A.get(name));
    const m = [...keysB].filter((k) => !keysA.has(k));
    const x = [...keysA].filter((k) => !keysB.has(k));
    if (m.length) miss.push(name + '缺少[' + m.join(',') + ']');
    if (x.length) extra.push(name + '多出[' + x.join(',') + ']');
  }

  t[0] += noCall.length;
  t[1] += miss.length;
  t[2] += extra.length;
  if (noCall.length || miss.length || extra.length) {
    rows.push([base, noCall.join(' '), miss.join(' '), extra.join(' ')]);
  }
}

const P = (s, w) => {
  const len = [...String(s)].reduce((n, c) => n + (/[\u4e00-\u9fa5]/.test(c) ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(1, w - len));
};

console.log(
  '比对页面数 ' + pairCount + '（v2 页 + 其 hooks　vs　v1 同名页，仅比有 setDb 写入的 handler）\n'
);
console.log(
  P('页面', 20) + P('① v2 无同名写入handler', 34) + P('② v1 有 v2 缺字段', 60) + '③ v2 多出字段'
);
console.log('-'.repeat(160));
for (const r of rows) {
  console.log(
    P(r[0], 20) + P(r[1].slice(0, 52), 34) + P(r[2].slice(0, 88), 60) + r[3].slice(0, 60)
  );
}
console.log(
  '\n候选：① 无同名 handler ' + t[0] + ' · ② 缺字段 ' + t[1] + ' · ③ 多字段 ' + t[2] + '（需人工判定）'
);
if (seen.size) console.log('同名存在但未解析出写入（非丢失，供核对）：' + [...seen].join(' '));
