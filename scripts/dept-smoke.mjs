/**
 * 部门树口径冒烟（V8.3-10.08 需求②）
 *
 * 运行：npm run smoke:dept
 *
 * 锁三件事：
 *   ① 选父部门 = 含全部下级（组织者拍板口径）
 *   ② 多选取并集，不是「取第一个」
 *   ③ 不再使用 startsWith 前缀匹配 —— 钉钉真实部门 id 是数字串，
 *      `'11123'.startsWith('111')` 会误命中别的部门（权限范围看得过多）。
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(mkdtempSync(join(tmpdir(), 'wbdept-')), 'deptTree.cjs');
buildSync({ entryPoints: ['src/service/deptTree.ts'], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
const T = require(out);

const results = [];
const check = (name, fn) => {
  try {
    const r = fn();
    results.push({ name, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (e) {
    results.push({ name, ok: false, detail: `EXCEPTION ${e.message}` });
  }
};

/**
 * 关键：部门 id 用**真实钉钉形态的数字串**，且刻意让 id 之间存在前缀关系
 * （111 与 11123），用来证明 startsWith 会误命中、而显式子树不会。
 */
const DEPTS = [
  { dept_id: '1', parent_id: '', name: '云帐房', level: 1, path: '云帐房' },
  { dept_id: '111', parent_id: '1', name: '中小微事业群', level: 2, path: '云帐房/中小微事业群' },
  { dept_id: '1112', parent_id: '111', name: '商业侧', level: 3, path: '云帐房/中小微事业群/商业侧' },
  /* 陷阱部门：id 以 111 开头，但**不在** 111 的子树里（父节点是 2） */
  { dept_id: '11123', parent_id: '2', name: '别的部门同名陷阱', level: 3, path: '另一条线/别的部门同名陷阱' },
  { dept_id: '2', parent_id: '', name: '另一条线', level: 1, path: '另一条线' },
  { dept_id: '21', parent_id: '2', name: '区域一', level: 2, path: '另一条线/区域一' },
];

/* ---------------- A. 子树计算 ---------------- */
check('A1 选父含子：111 子树 = {111, 1112}', () => {
  const s = T.deptSubtreeIds(DEPTS, '111');
  return s.size === 2 && s.has('111') && s.has('1112') ? true : [...s].join(',');
});
check('A2 子树含自身', () => T.deptSubtreeIds(DEPTS, '1').has('1') ? true : '缺自身');
check('A3 不误命中前缀相同的兄弟部门（111 ≠ 11123）', () => {
  const s = T.deptSubtreeIds(DEPTS, '111');
  return !s.has('11123') ? true : '把 11123 误判成下级';
});
check('A4 空 id → 空集合', () => T.deptSubtreeIds(DEPTS, '').size === 0 ? true : '非空');
check('A5 成环数据不爆栈', () => {
  const cyc = [
    { dept_id: 'a', parent_id: 'b', name: 'A', level: 2, path: 'A' },
    { dept_id: 'b', parent_id: 'a', name: 'B', level: 2, path: 'B' },
  ];
  return T.deptSubtreeIds(cyc, 'a').size === 2 ? true : '环未收敛';
});

/* ---------------- B. 多选并集 ---------------- */
check('B1 多选取并集', () => {
  const s = T.deptSubtreeUnion(DEPTS, ['111', '21']);
  return s.has('111') && s.has('1112') && s.has('21') && !s.has('11123')
    ? true
    : [...s].join(',');
});
check('B2 多选命中人数 = 各子树之和（不重复计数）', () => {
  const users = [
    { dept_id_list: ['1112'] },
    { dept_id_list: ['21'] },
    { dept_id_list: ['11123'] }, // 陷阱：不该被 111 命中
  ];
  const union = T.deptSubtreeUnion(DEPTS, ['111', '21']);
  const n = users.filter((u) => u.dept_id_list.some((d) => union.has(d))).length;
  return n === 2 ? true : `得到 ${n}`;
});
check('B3 空选 = 不筛（全部命中）', () => T.matchDepts(['1112'], [], DEPTS) === true ? true : '空选却筛掉了人');

/* ---------------- C. 树构建 ---------------- */
check('C1 treeData 按层级嵌套', () => {
  const tree = T.buildDeptTreeData(DEPTS);
  const root = tree.find((n) => n.value === '1');
  const mid = root?.children?.find((n) => n.value === '111');
  return root && mid && mid.children?.some((n) => n.value === '1112') ? true : JSON.stringify(tree).slice(0, 120);
});
check('C2 restrictTo 只显示限定范围内的部门（我的团队口径）', () => {
  const tree = T.buildDeptTreeData(DEPTS, ['111']);
  const ids = JSON.stringify(tree);
  return ids.includes('111') && !ids.includes('"2"') ? true : ids.slice(0, 120);
});
check('C3 restrictTo 保留祖先链（选中末级也能看出挂在哪条线下）', () => {
  const tree = T.buildDeptTreeData(DEPTS, ['1112']);
  const ids = JSON.stringify(tree);
  return tree.length === 1 && ids.includes('"1112"') && !ids.includes('"21"') && !ids.includes('"11123"')
    ? true
    : JSON.stringify(tree).slice(0, 140);
});
check('C4 脏 parent_id（父不存在）不丢节点', () => {
  const bad = [{ dept_id: 'x', parent_id: 'not-exist', name: '孤儿', level: 9, path: '孤儿' }];
  return T.buildDeptTreeData(bad).length === 1 ? true : '孤儿节点被丢了';
});

/* ---------------- D. 旧口径必须已被替换 ---------------- */
/* 检测代码行时必须剥掉注释 —— 这些文件里本来就留了「旧实现是 startsWith」的说明注释 */
const code = (p) => readFileSync(p, 'utf8')
  .split(String.fromCharCode(10))
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join(String.fromCharCode(10));

check('D1 store 权限范围不再用 startsWith 前缀匹配', () => {
  const s = code('src/store/store.tsx');
  return !/startsWith\(/.test(s) ? true : 'store.tsx 代码里仍有 startsWith 部门匹配';
});
check('D2 ScopePicker 不再用 startsWith 解析部门', () => {
  const s = code('src/components/ScopePicker.tsx');
  return !/startsWith\(/.test(s) ? true : 'ScopePicker 代码里仍有 startsWith 部门匹配';
});
check('D3 三个页面都接了 DeptTreeSelect', () => {
  const files = [
    'src/components/TeamBoard.tsx',
    'src/components/ScopePicker.tsx',
    'src/pages/b/UserAdmin.tsx',
    'src/pages/v2/UserAdminV2.tsx',
  ];
  const miss = files.filter((f) => !readFileSync(f, 'utf8').includes('DeptTreeSelect'));
  return miss.length === 0 ? true : `未接：${miss.join(', ')}`;
});

/* ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n部门树口径冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);