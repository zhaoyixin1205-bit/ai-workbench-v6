/**
 * 导入容错冒烟（V8.3-10.08 需求③.2）
 *
 * 运行：npm run smoke:import
 *
 * 背景：运营方反馈「下载的模板填完传不上去」。真因有三个，都不是「文件格式不对」：
 *   ① 表头判断过于严格（原 `rows[0].join() === cols.join()`）——Excel 另存后表头带空格、
 *      或多了「序号」列，整张表被当成数据；
 *   ② 日期列只认 YYYY-MM-DD —— Excel 另存会写成 2026/10/8 或日期序列号；
 *   ③ 合并单元格在 CSV 里只剩左上角值，其余行留空。
 * 这个脚本把三条口径钉死，避免以后又收紧回去。
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(mkdtempSync(join(tmpdir(), 'wbcsv-')), 'csv.cjs');
buildSync({ entryPoints: ['src/constants/csv.ts'], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
const { normalizeDateCell, matchHeader, parseCsv } = require(out);

const results = [];
const check = (name, fn) => {
  try {
    const r = fn();
    results.push({ name, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (e) {
    results.push({ name, ok: false, detail: `EXCEPTION ${e.message}` });
  }
};

const COLS = ['专家工号', '专家姓名', '日期', '时段', '形式', '容量', '地点链接', '状态'];

/* ---------------- A. 日期归一化 ---------------- */
check('A1 标准格式原样（补零到两位）', () => normalizeDateCell('2026-10-08') === '2026-10-08' ? true : normalizeDateCell('2026-10-08'));
check('A2 斜杠格式 2026/10/8 → 2026-10-08', () => normalizeDateCell('2026/10/8') === '2026-10-08' ? true : normalizeDateCell('2026/10/8'));
check('A3 点格式 2026.10.8', () => normalizeDateCell('2026.10.8') === '2026-10-08' ? true : normalizeDateCell('2026.10.8'));
check('A4 中文 2026年10月8日', () => normalizeDateCell('2026年10月8日') === '2026-10-08' ? true : normalizeDateCell('2026年10月8日'));
check('A5 Excel 日期序列号 46027', () => {
  const got = normalizeDateCell('46027');
  return /^\d{4}-\d{2}-\d{2}$/.test(got) ? true : `得到 ${got}`;
});
check('A6 空值原样返回', () => normalizeDateCell('') === '' ? true : '空值被改写');
check('A7 认不出来的原样返回（交给业务校验报错，不瞎猜）', () => {
  const got = normalizeDateCell('下周三');
  return got === '下周三' ? true : `得到 ${got}`;
});
check('A8 纯数字但不在日期区间 → 不误判', () => {
  const got = normalizeDateCell('12345');
  return got === '12345' ? true : `被误判为 ${got}`;
});

/* ---------------- B. 表头容错 ---------------- */
check('B1 完全一致 → 命中', () => {
  const m = matchHeader(COLS, COLS);
  return m && m.length === COLS.length ? true : '未命中';
});
check('B2 表头带空格 → 仍命中（Excel 另存常见）', () => {
  const m = matchHeader(COLS.map((c) => ` ${c} `), COLS);
  return m ? true : '未命中';
});
check('B3 多出「序号」列 → 命中并返回偏移映射', () => {
  const m = matchHeader(['序号', ...COLS], COLS);
  return m && m[0] === 1 && m.length === COLS.length ? true : JSON.stringify(m);
});
check('B4 列数不对 → 不命中（当作无表头，交业务校验报错）', () => {
  const m = matchHeader(['姓名', '日期'], COLS);
  return m === null ? true : '不应命中';
});
check('B5 表头顺序不同 → 不命中（宁可报错也不要错列取值）', () => {
  const m = matchHeader([...COLS].reverse(), COLS);
  return m === null ? true : '不应命中';
});

/* ---------------- C. 解析基础能力（回归） ---------------- */
check('C1 跳过 # 开头的口径说明行', () => {
  const rows = parseCsv('#说明：日期用 YYYY-MM-DD\n2026-10-08,张三');
  return rows.length === 1 && rows[0][0] === '2026-10-08' ? true : JSON.stringify(rows);
});
check('C2 跳过全空行', () => {
  const rows = parseCsv('a,b\n\n\nc,d');
  return rows.length === 2 ? true : `得到 ${rows.length} 行`;
});
check('C3 带引号的逗号不拆列', () => {
  const rows = parseCsv('"公司 3 楼, 会议室 A",张三');
  return rows[0][0] === '公司 3 楼, 会议室 A' ? true : rows[0][0];
});
check('C4 全流程：Excel 风格文件能被解析 + 表头命中 + 日期归一化', () => {
  const csv = '序号, 专家工号, 专家姓名, 日期, 时段, 形式, 容量, 地点链接, 状态\r\n'
    + '1, E00001, 张三, 2026/10/8, 上午, 1v1, 1, 3F-A, OPEN\r\n';
  const rows = parseCsv(csv);
  const map = matchHeader(rows[0], COLS);
  if (!map) return '表头未命中';
  const body = rows.slice(1).map((r) => map.map((i) => r[i] ?? ''));
  const d = normalizeDateCell(body[0][2]);
  return d === '2026-10-08' && body[0][1] === '张三' ? true : `日期=${d} 姓名=${body[0][1]}`;
});

/* ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n导入容错冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);