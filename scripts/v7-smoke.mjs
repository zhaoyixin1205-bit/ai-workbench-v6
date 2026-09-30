/**
 * V7.0 逻辑冒烟：只测「纯逻辑层」（字段契约、状态文案、CSV 解析），不涉及 UI。
 *
 * 运行：node scripts/v7-smoke.mjs
 * 退出码：0 = 全绿；1 = 有失败（逐条打印）
 *
 * 与 guard-regression.mjs 同思路：直接复用 src 下的源码（esbuild 现场打包），
 * 不复制一份判定/映射，杜绝「测试口径」与「代码口径」漂移。
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function load(entry, name) {
  const out = join(mkdtempSync(join(tmpdir(), 'v7-')), `${name}.cjs`);
  buildSync({ entryPoints: [entry], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
  return require(out);
}

const S = load('src/constants/importSchemas.ts', 'schemas');
const M = load('src/constants/statusMeta.ts', 'status');
const C = load('src/constants/csv.ts', 'csv');

const results = [];
const check = (name, fn) => {
  try {
    const r = fn();
    results.push({ name, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (e) {
    results.push({ name, ok: false, detail: `EXCEPTION ${e.message}` });
  }
};

/* ---------- A. 状态文案唯一真源（CR-33） ---------- */
const EXPECTED = {
  DRAFT: '草稿', SUBMITTED: '已提交', SCORING_AI: 'AI 评分中', AI_SCORED: 'AI 已出分',
  REVIEWING: '复核中', REVIEWED: '已复核', SPOT_CHECK: '抽查中', PASSED: '抽查通过',
  REJECTED: '不通过', PUBLISHED: '已公示', ASSET_APPLYING: '入库申请中', ASSET_ONLINE: '已入库',
  ASSET_REJECTED: '入库驳回', WITHDRAWN: '已撤回', SCORE_FAILED: '评分失败',
  COMPLETED: '已完成', CONSENSUS: '已共识',
};
for (const [k, v] of Object.entries(EXPECTED)) {
  check(`[状态文案] ${k} → ${v}`, () => M.statusText(k) === v || `got=${M.statusText(k)}`);
}
check('[状态文案] 17 态齐全', () => M.ALL_SUBMIT_STATUSES.length === 17 || `got=${M.ALL_SUBMIT_STATUSES.length}`);
check('[状态文案] 未知状态回退原值', () => M.statusText('XYZ') === 'XYZ' || '未知状态不应被吞掉');
check('[作业类型] DRAFT/PUBLISHED/CLOSED/ARCHIVED 有中文', () => {
  const t = M.TYPE_STATUS_TEXT;
  return (t.DRAFT === '草稿' && t.PUBLISHED === '已发布' && t.CLOSED === '已截止' && t.ARCHIVED === '已归档')
    || JSON.stringify(t);
});
check('[状态选项] value 保持枚举、label 为中文', () => {
  const o = M.statusOptions().find((x) => x.value === 'REVIEWING');
  return (o && o.value === 'REVIEWING' && o.label.includes('复核中')) || JSON.stringify(o);
});

/* ---------- B. 排班契约（CR-36） ---------- */
const sch = S.scheduleSchema;
check('[排班] 列顺序含 专家工号/姓名/日期/时段/形式/容量/地点链接/状态', () => {
  const c = S.schemaColumns(sch);
  return c.join('|') === '专家工号|专家姓名|日期|时段|形式|容量|地点/链接|状态' || c.join('|');
});
check('[排班] 工号与姓名都空 → 失败', () => {
  const r = S.validateRowBySchema(sch, ['', '', '2026-10-08', '09:00-10:00', '1v1', '1', '', 'OPEN']);
  return (r.ok === false && r.reason.includes('至少填一项')) || JSON.stringify(r);
});
check('[排班] 只填姓名 → 通过', () => {
  const r = S.validateRowBySchema(sch, ['', '刘晓东', '2026-10-08', '09:00-10:00', '1v1', '1', '', 'OPEN']);
  return r.ok === true || JSON.stringify(r);
});
check('[排班] 日期格式错 → 失败', () => {
  const r = S.validateRowBySchema(sch, ['E1', '', '2026/10/08', '09:00-10:00', '1v1', '1', '', 'OPEN']);
  return (r.ok === false && r.reason.includes('YYYY-MM-DD')) || JSON.stringify(r);
});
check('[排班] 形式不在 3 种内 → 失败', () => {
  const r = S.validateRowBySchema(sch, ['E1', '', '2026-10-08', '09:00-10:00', '团建', '1', '', 'OPEN']);
  return r.ok === false || '形式应受枚举约束';
});
check('[排班] 容量 0 → 失败', () => {
  const r = S.validateRowBySchema(sch, ['E1', '', '2026-10-08', '09:00-10:00', '1v1', '0', '', 'OPEN']);
  return (r.ok === false && r.reason.includes('容量')) || JSON.stringify(r);
});
check('[排班] 拍板 8-C：自定义时段允许通过', () => {
  const r = S.validateRowBySchema(sch, ['E1', '', '2026-10-08', '13:30-14:00', '1v1', '1', '', 'OPEN']);
  return r.ok === true || '自定义时段应被允许';
});
check('[排班] 确认项 4：形式仅 3 种', () => S.SCHEDULE_TYPES.join('/') === '1v1/直播/线下' || S.SCHEDULE_TYPES.join('/'));

/* ---------- C. 资产契约（CR-37） ---------- */
const as = S.assetSchema;
check('[资产] 全字段 9 列', () => S.schemaColumns(as).length === 9 || S.schemaColumns(as).length);
check('[资产] 缺名称 → 失败', () => {
  const r = S.validateRowBySchema(as, ['', '', 'Skill 包', '王建国', 'v1.0', '全员', '', '', '否']);
  return (r.ok === false && r.reason.includes('资产名称')) || JSON.stringify(r);
});
check('[资产] 类型不在枚举 → 失败', () => {
  const r = S.validateRowBySchema(as, ['', '话术包', 'PPT', '王建国', 'v1.0', '全员', '', '', '否']);
  return r.ok === false || '类型应受枚举约束';
});
check('[资产] 复用次数填非数字 → 失败', () => {
  const r = S.validateRowBySchema(as, ['', '话术包', 'Skill 包', '王建国', 'v1.0', '全员', '很多', '', '否']);
  return (r.ok === false && r.reason.includes('复用次数')) || JSON.stringify(r);
});
check('[资产] 复用列留空 → 通过（选填）', () => {
  const r = S.validateRowBySchema(as, ['', '话术包', 'Skill 包', '王建国', 'v1.0', '全员', '', '', '']);
  return r.ok === true || JSON.stringify(r);
});
check('[资产] 受限填「未知」→ 失败', () => {
  const r = S.validateRowBySchema(as, ['', '话术包', 'Skill 包', '王建国', 'v1.0', '全员', '', '', '不知道']);
  return r.ok === false || '受限应为是/否';
});

/* ---------- D. 商城契约（CR-38） ---------- */
const sh = S.shopSchema;
check('[商城] 全字段 8 列（补齐适用人群与状态）', () => {
  const c = S.schemaColumns(sh);
  return (c.includes('适用人群') && c.includes('状态') && c.length === 8) || c.join('|');
});
check('[商城] 所需积分 0 → 失败', () => {
  const r = S.validateRowBySchema(sh, ['', '耳机', '0', '20', '1', '全员', '线下领取', '草稿']);
  return r.ok === false || '积分须为正数';
});
check('[商城] 核销方式不在枚举 → 失败', () => {
  const r = S.validateRowBySchema(sh, ['', '耳机', '3200', '20', '1', '全员', '面交', '草稿']);
  return r.ok === false || '核销方式应受枚举约束';
});
check('[商城] 状态不在枚举 → 失败', () => {
  const r = S.validateRowBySchema(sh, ['', '耳机', '3200', '20', '1', '全员', '线下领取', '热卖']);
  return r.ok === false || '状态应受枚举约束';
});
check('[商城] 合法行 → 通过', () => {
  const r = S.validateRowBySchema(sh, ['', '耳机', '3200', '20', '1', '全员', '线下领取', '草稿']);
  return r.ok === true || JSON.stringify(r);
});

/* ---------- E. 多主体解析（确认项 2） ---------- */
check('[多主体] 分号分隔去重去空', () => {
  const r = S.parseSubjects('销售部; 市场部 ;销售部;');
  return r.join('|') === '销售部|市场部' || r.join('|');
});
check('[多主体] 单人', () => S.parseSubjects('全员').join('') === '全员' || S.parseSubjects('全员').join(''));
check('[是否] 是/Y/TRUE/1 为真，否/N/0 为假', () => (
  S.parseYesNo('是') && S.parseYesNo('Y') && S.parseYesNo('TRUE') && S.parseYesNo('1')
  && !S.parseYesNo('否') && !S.parseYesNo('N') && !S.parseYesNo('0')
) || 'yesNo 解析不符预期');

/* ---------- F. CSV 下载模板 ↔ 上传解析 往返一致（CR-35） ---------- */
check('[CSV] 含逗号的字段往返不丢列', () => {
  const rows = [['E1', '刘晓东', '2026-10-08', '09:00-10:00', '线下', '3', '公司 3 楼, 会议室 A', 'OPEN']];
  const back = C.parseCsv(C.toCsv(rows));
  return (back.length === 1 && back[0].length === 8 && back[0][6] === '公司 3 楼, 会议室 A') || JSON.stringify(back);
});
check('[CSV] 含双引号的字段往返正确', () => {
  const rows = [['标题带"引号"', '第二列']];
  const back = C.parseCsv(C.toCsv(rows));
  return back[0][0] === '标题带"引号"' || JSON.stringify(back);
});
check('[CSV] 空字段保留占位（列不错位）', () => {
  const rows = [['a', '', 'c']];
  const back = C.parseCsv(C.toCsv(rows));
  return (back[0].length === 3 && back[0][1] === '') || JSON.stringify(back);
});
check('[CSV] # 说明行被跳过', () => {
  const back = C.parseCsv('# 这是口径说明\r\n"a","b"');
  return (back.length === 1 && back[0].join('|') === 'a|b') || JSON.stringify(back);
});
check('[CSV] 三模块模板往返后列数与契约一致', () => {
  for (const sch of [S.scheduleSchema, S.assetSchema, S.shopSchema]) {
    const cols = S.schemaColumns(sch);
    const back = C.parseCsv(C.toCsv([cols, ...(sch.sample ?? [])]));
    if (back[0].join('|') !== cols.join('|')) return `${sch.title}: ${back[0].join('|')}`;
    if (sch.sample?.length && back.length !== sch.sample.length + 1) return `${sch.title} 行数不符`;
  }
  return true;
});

/* ---------- 汇总 ---------- */
const failed = results.filter((r) => !r.ok);
console.log(`\nV7.0 逻辑冒烟：共 ${results.length} 项断言`);
console.log(`通过 ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('\n失败项：');
  failed.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
  process.exit(1);
}
console.log('✅ 全绿');
