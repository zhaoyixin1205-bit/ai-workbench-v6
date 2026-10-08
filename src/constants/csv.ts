/**
 * CSV 编解码 —— V7.0 CR-35 抽取为纯函数（无 React / 无 antd 依赖），
 * 目的：让「模板输出」与「上传解析」共用同一份实现，并被冒烟脚本直接覆盖，
 * 避免「模板里带引号，解析器不认引号」这类只在真机上才暴露的往返错位。
 */

/** 单元格转义：含逗号/引号/换行时按 RFC4180 加双引号 */
export function csvCell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

/** 由二维数组生成 CSV 文本（自带 BOM，Excel 打开不乱码） */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/**
 * CSV 解析：支持 RFC4180 双引号转义，兼容逗号与制表符两种分隔。
 * 原实现按逗号硬切，字段内一旦含逗号（如地点「公司 3 楼, 会议室 A」）就会整行错位。
 * 仍保留：跳过空行与 `#` 开头的口径说明行。
 */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 1; } else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',' || c === '\t') {
      row.push(cur); cur = '';
    } else if (c === '\n') {
      row.push(cur); cur = ''; out.push(row); row = [];
    } else if (c !== '\r') {
      cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row); }
  return out
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c))
    .filter((r) => !(r[0] ?? '').startsWith('#'));
}

/**
 * V8.3-10.08 需求③.2：日期列容错 —— 「下载的模板填完传不上去」的真因之一。
 *
 * 运营方从 Excel 另存为 CSV 后，日期列会变成各种形态：
 *   2026-10-08（原样） / 2026/10/8 / 2026.10.8 / 10月8日 / 46027（Excel 日期序列号）
 * 原实现只认 `^\d{4}-\d{2}-\d{2}$`，于是**整批判失败**，用户完全看不出问题在哪。
 * 这里统一归一化为 YYYY-MM-DD；认不出来就原样返回，交给业务校验报错（信息更准确）。
 *
 * Excel 序列号换算：1899-12-30 为第 0 天（微软 1900 闰年 bug 的经典处理）。
 */
export function normalizeDateCell(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return s;

  // ① 标准格式直接返回
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // ② 斜杠 / 点 / 中文年月的斜杠写法
  const m1 = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m1) {
    const [, y, m, d] = m1;
    return `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }
  // ③ 中文「2026年10月8日」
  const m2 = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (m2) {
    const [, y, m, d] = m2;
    return `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }
  // ④ Excel 日期序列号（20000 约等于 1954 年，取值区间卡在 1990-2100 之间防止误伤纯数字）
  if (/^\d{5}$/.test(s)) {
    const n = Number(s);
    if (n >= 32874 && n <= 73415) {
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
  }
  // 认不出来 → 原样返回，让业务校验报「日期格式不对」并指出行号，比这里瞎猜好
  return s;
}

/**
 * 表头容错匹配：运营方常在表头里加空格/换行，或从别的表复制带了一列「序号」。
 * 规则：把表头行的每个单元格与模板列名做「去空格 + 去括号内容」后的比较，全等即视为表头行。
 * 返回命中的模板列序（用于把实际列映射到模板列），不是表头则返回 null。
 */
export function matchHeader(actual: string[], cols: string[]): number[] | null {
  const norm = (s: string) => (s ?? '').replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '');
  const a = actual.map(norm);
  const c = cols.map(norm);
  // 完全一致（允许顺序一致但单元格数相同）
  if (a.length === c.length && a.every((x, i) => x === c[i])) return cols.map((_, i) => i);
  // 「序号」列：表头比模板多一列时，尝试跳过首列再比
  if (a.length === c.length + 1 && (a[0] === '序号' || a[0] === 'No' || a[0] === '#') && a.slice(1).every((x, i) => x === c[i])) {
    return cols.map((_, i) => i + 1);
  }
  return null;
}
