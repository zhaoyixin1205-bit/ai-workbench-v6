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
