/**
 * 批量导入「字段契约」—— V7.0 CR-35/36/37/38 共用
 *
 * 目的：模板下载与上传校验共用同一份字段定义，从根上杜绝
 * 「下载的模板列」与「上传时要求的列」对不上（CR-35 提出的契约化要求）。
 *
 * 约定：
 * 1. 一份 schema = 一个业务对象的导入口径；columns 顺序即模板列顺序；
 * 2. required=true 的列为空 → 校验失败并注明原因；
 * 3. enum 非空的列 → 值必须在枚举内（拍板 8-C：预置枚举 + 允许自定义，由 allowCustom 控制）；
 * 4. 多主体（可见范围 / 适用人群）在单列内用英文分号 `;` 分隔（确认项 2 采纳建议）。
 */
import type { Asset, ShopItem, ExpertSchedule } from '@/mock/types';

export interface FieldSpec {
  /** 列标题（模板表头，同时也是校验时的定位依据） */
  name: string;
  required: boolean;
  /** 口径说明，写进模板首行提示 */
  desc: string;
  /** 枚举约束；为空表示自由文本 */
  enum?: string[];
  /** 拍板 8-C：预置枚举优先，但允许手工输入不在枚举内的值 */
  allowCustom?: boolean;
  /** 数值列：校验为非负数字 */
  numeric?: boolean;
  /** 整数列（容量、库存、次数等） */
  integer?: boolean;
  /** 日期列：校验 YYYY-MM-DD */
  date?: boolean;
  /** 多主体列：按 `;` 切分 */
  multiSubject?: boolean;
  /** 是否/否 布尔列 */
  yesNo?: boolean;
}

export interface ImportSchema {
  title: string;
  hint: string;
  fields: FieldSpec[];
  sample?: string[][];
  maxRows?: number;
}

/** 多主体分隔符（确认项 2：采纳 `;` 分隔的建议） */
export const SUBJECT_SEP = ';';

/** 拍板 8-C：排班时段预置枚举（允许自定义，见 allowCustom） */
export const SCHEDULE_SLOTS = [
  '09:00-10:00', '10:00-11:00', '11:00-12:00',
  '14:00-15:00', '15:00-16:00', '16:00-17:00',
  '19:00-20:00', '20:00-21:00',
];

/** 确认项 4：排班形式仅保留 3 种，不新增枚举 */
export const SCHEDULE_TYPES: ExpertSchedule['type'][] = ['1v1', '直播', '线下'];
/** 资产类型（CR-37：与 Asset.type 对齐） */
export const ASSET_TYPES: Asset['type'][] = ['Skill 包', '提示词模板', '智能体'];
/** 资产上架状态（CR-37 编辑弹窗用） */
export const ASSET_STATUSES: Asset['status'][] = ['已上架', '已下架', '已下线'];
/** 商城核销方式 */
export const VERIFY_TYPES: ShopItem['verify_type'][] = ['线下领取', '邮寄', '线上发放'];
/** 商城商品状态 */
export const SHOP_STATUSES: ShopItem['status'][] = ['草稿', '上架', '下架', '售罄'];

/* ---------------- 排班（CR-36） ---------------- */
export const scheduleSchema: ImportSchema = {
  title: '排班批量导入',
  hint: '口径：按 专家工号或姓名+日期+时段 定位；已存在则跳过（不覆盖已有预约）；日期 YYYY-MM-DD；多值列用英文分号分隔',
  fields: [
    { name: '专家工号', required: false, desc: '与「专家姓名」二选一必填' },
    { name: '专家姓名', required: false, desc: '与「专家工号」二选一必填' },
    { name: '日期', required: true, desc: 'YYYY-MM-DD', date: true },
    { name: '时段', required: true, desc: '建议从预置时段中选择，也可手工填写', enum: SCHEDULE_SLOTS, allowCustom: true },
    { name: '形式', required: true, desc: '仅 3 种', enum: SCHEDULE_TYPES },
    { name: '容量', required: true, desc: '≥1 的整数', numeric: true, integer: true },
    { name: '地点/链接', required: false, desc: '线下填地点，线上填会议链接' },
    { name: '状态', required: false, desc: '默认 OPEN', enum: ['OPEN', 'FULL', 'CLOSED', 'HOLIDAY'] },
  ],
  sample: [['E1', '', '2026-10-08', '09:00-10:00', '1v1', '1', '线上-钉钉', 'OPEN']],
};

/* ---------------- 资产台账（CR-37） ---------------- */
export const assetSchema: ImportSchema = {
  title: '资产台账批量导入',
  hint: '口径：填「资产ID」= 更新已有资产，留空 = 新增；复用次数/人数填了即强制标记来源为「手工维护」；可见范围多主体用英文分号分隔',
  fields: [
    { name: '资产ID', required: false, desc: '留空表示新增资产；填写则从台账复制准确 ID' },
    { name: '资产名称', required: true, desc: '' },
    { name: '类型', required: true, desc: '', enum: ASSET_TYPES },
    { name: '作者', required: true, desc: '' },
    { name: '版本', required: true, desc: '如 v1.0' },
    { name: '可见范围', required: true, desc: '全员 / 本部门 / 仅组织者，或指定主体（多个用 ; 分隔）', multiSubject: true },
    { name: '复用次数', required: false, desc: '总量口径，非增量', numeric: true, integer: true },
    { name: '复用人数', required: false, desc: '总量口径，非增量', numeric: true, integer: true },
    { name: '受限', required: false, desc: '是/否；留空视为否', yesNo: true },
  ],
  sample: [['', '客户异议处理话术包', 'Skill 包', '王建国', 'v1.0', '全员', '128', '36', '否']],
};

/* ---------------- 商城商品（CR-38） ---------------- */
export const shopSchema: ImportSchema = {
  title: '商品批量导入',
  hint: '口径：填「商品ID」= 更新已有商品，留空 = 新增；库存为总量不是增量；适用人群多主体用英文分号分隔；导入后统一为草稿态，需人工确认上架（防超卖）',
  fields: [
    { name: '商品ID', required: false, desc: '留空表示新增商品' },
    { name: '商品名称', required: true, desc: '' },
    { name: '所需积分', required: true, desc: '正整数', numeric: true, integer: true },
    { name: '库存', required: true, desc: '≥0 整数，总量口径', numeric: true, integer: true },
    { name: '限购', required: true, desc: '每人限兑件数，≥1 整数', numeric: true, integer: true },
    { name: '适用人群', required: true, desc: '全员 / 本部门，或指定主体（多个用 ; 分隔）', multiSubject: true },
    { name: '核销方式', required: true, desc: '', enum: VERIFY_TYPES },
    { name: '状态', required: false, desc: '默认草稿', enum: SHOP_STATUSES },
  ],
  sample: [['', '无线降噪耳机', '3200', '20', '1', '全员', '线下领取', '草稿']],
};

/* ---------------- 评分结果回写（CR-35 假按钮修复） ---------------- */
/** 评分模板/回写模板由评分卡维度动态生成，不属于静态 schema，此处只定义固定列 */
export const SCORE_TEMPLATE_HEAD = ['提报编号', '提报标题'];

/* ---------------- 通用校验 ---------------- */

/** 按 schema 校验单行，返回失败原因；通过返回 null */
export function validateRowBySchema(
  schema: ImportSchema,
  row: string[],
): { ok: true } | { ok: false; reason: string } {
  const fields = schema.fields;

  /** 二选一必填组（专家工号 / 专家姓名）：至少填一个 */
  const either = ['专家工号', '专家姓名'];
  if (fields.some((f) => either.includes(f.name))) {
    const i1 = fields.findIndex((f) => f.name === '专家工号');
    const i2 = fields.findIndex((f) => f.name === '专家姓名');
    const v1 = (row[i1] ?? '').trim();
    const v2 = (row[i2] ?? '').trim();
    if (!v1 && !v2) return { ok: false, reason: '专家工号与专家姓名至少填一项' };
  }

  for (let i = 0; i < fields.length; i += 1) {
    const f = fields[i];
    const raw = (row[i] ?? '').trim();

    if (f.required && !raw) {
      /** 二选一组单独处理，避免重复报错 */
      if (either.includes(f.name)) continue;
      return { ok: false, reason: `必填列「${f.name}」为空` };
    }
    if (!raw) continue;

    if (f.date && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { ok: false, reason: `${f.name} 格式应为 YYYY-MM-DD（收到 ${raw}）` };
    }
    if (f.numeric) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return { ok: false, reason: `${f.name} 必须为 ≥0 的数字（收到 ${raw}）` };
      if (f.integer && !Number.isInteger(n)) return { ok: false, reason: `${f.name} 必须为整数（收到 ${raw}）` };
      if (f.name === '容量' && n < 1) return { ok: false, reason: '容量必须 ≥1' };
      if (f.name === '限购' && n < 1) return { ok: false, reason: '限购必须 ≥1' };
      if (f.name === '所需积分' && n <= 0) return { ok: false, reason: '所需积分必须为正数' };
    }
    if (f.yesNo && !['是', '否', 'Y', 'N', 'TRUE', 'FALSE', '1', '0'].includes(raw.toUpperCase())) {
      return { ok: false, reason: `${f.name} 只能填「是」或「否」（收到 ${raw}）` };
    }
    if (f.enum?.length && !f.allowCustom && !f.enum.includes(raw)) {
      return { ok: false, reason: `${f.name}「${raw}」不在可选项内（${f.enum.join(' / ')}）` };
    }
  }
  return { ok: true };
}

/** 多主体列解析：`;` 分隔，去空去重 */
export function parseSubjects(raw: string): string[] {
  return Array.from(new Set(raw.split(SUBJECT_SEP).map((s) => s.trim()).filter(Boolean)));
}

/** 是/否 解析 */
export function parseYesNo(raw: string): boolean {
  return ['是', 'Y', 'TRUE', '1'].includes((raw ?? '').trim().toUpperCase());
}

/** 由 schema 生成模板列（保证「下载的模板」与「上传的校验」同源） */
export function schemaColumns(schema: ImportSchema): string[] {
  return schema.fields.map((f) => f.name);
}

/** 由 schema 生成必填说明（写进模板提示行） */
export function schemaHint(schema: ImportSchema): string {
  const req = schema.fields.filter((f) => f.required).map((f) => f.name);
  const opt = schema.fields.filter((f) => !f.required).map((f) => f.name);
  return `${schema.hint}｜必填：${req.join('、')}｜选填：${opt.join('、') || '—'}`;
}
