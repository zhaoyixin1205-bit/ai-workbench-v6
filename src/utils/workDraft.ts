/**
 * 作业提报草稿（V10.16）
 *
 * 背景：用户反馈「提报页显示草稿已保存，再次进入却清空」。排查发现
 * useWorkSubmitForm.saveDraft 只 set 了组件 state + 弹 toast，**零持久化**——
 * 页面一卸载 state 即丢，右上角「✓ 草稿已保存」纯属误导性 UI。
 *
 * 设计（对齐社区发帖 usePostComposer 的成熟模式）：
 *   - 只存 localStorage（本机草稿区），不入库、不占服务端存储；
 *   - 草稿键按「用户 + 作业类型」隔离，换人换类型不串；
 *   - 防抖自动保存 + 手动保存双通道，挂载时探测提示「恢复 / 丢弃」，
 *     不自动覆盖表单——用户这次可能想填新内容；
 *   - 提交成功 / 主动丢弃即清除。
 *
 * ⚠️ 边界（UI 需明示）：草稿只存在当前浏览器本机，换设备/换浏览器不同步。
 */

import type { Attachment } from '@/mock/types';

/** V6.0 CR-18：三种选题形态（与 useWorkSubmitForm 同一定义，type-only 引用不成环） */
export type WorkDraftTopicMode = 'EXISTING' | 'CUSTOM' | 'NONE';

/** 草稿内容：表单字段 + 非表单态（通道 / 附件 / 选题形态）+ 保存时间 */
export interface WorkDraft {
  fields: Record<string, unknown>;
  channel: string;
  topicMode: WorkDraftTopicMode;
  /** 附件已走真实文件服务上传，草稿恢复后下载仍走服务端代理（file_id），不依赖 URL 短签名 */
  atts: Attachment[];
  savedAt: string;
}

/** 草稿键：按 unionId + 作业类型隔离。typeId 缺省（空库保护兜底）时落到 default */
export function workDraftKey(unionId: string, typeId: string | undefined): string {
  return `wb-work-draft-${unionId}-${typeId ?? 'default'}`;
}

/**
 * 空草稿判定：标题 / 场景 / 前后对比 / 产出 / Skill 全为空视为没有可保存内容。
 * 防止一进页面就落一个空草稿、下次进来弹「检测到草稿」吓用户一跳。
 */
export function isEmptyDraft(fields: Record<string, unknown> | undefined | null): boolean {
  if (!fields) return true;
  const pick = (k: string) => String(fields[k] ?? '').trim();
  return !pick('title') && !pick('scene_desc') && !pick('before_after')
    && !pick('output_sample') && !pick('skill_used');
}

/** 本地时间戳：YYYY-MM-DD HH:mm（不用 toISOString——UTC 与北京时间差 8 小时，凌晨保存会差一天） */
export function draftStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 页头只显示时分（17:31），与旧版 savedAt 显示粒度一致 */
export function draftClock(savedAt: string): string {
  return savedAt.slice(-5);
}

export function serializeDraft(d: WorkDraft): string {
  return JSON.stringify(d);
}

/**
 * 解析草稿：坏 JSON / 结构不对一律返回 null（调用方按「无草稿」处理）。
 * localStorage 可能被其它版本代码写过不同结构，不能信任 raw。
 */
export function parseDraft(raw: string | null | undefined): WorkDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<WorkDraft>;
    if (!d || typeof d !== 'object' || typeof d.fields !== 'object' || d.fields === null) return null;
    return {
      fields: d.fields as Record<string, unknown>,
      channel: typeof d.channel === 'string' ? d.channel : '通道一·用现成 Skill',
      topicMode: d.topicMode === 'EXISTING' || d.topicMode === 'CUSTOM' ? d.topicMode : 'NONE',
      atts: Array.isArray(d.atts) ? (d.atts as Attachment[]) : [],
      savedAt: typeof d.savedAt === 'string' ? d.savedAt : '',
    };
  } catch {
    return null;
  }
}

/** 读草稿（探测用）：自动过滤空草稿与坏数据 */
export function readDraft(key: string): WorkDraft | null {
  try {
    const d = parseDraft(localStorage.getItem(key));
    return d && !isEmptyDraft(d.fields) ? d : null;
  } catch {
    return null;
  }
}

/** 写草稿；返回是否写成功（隐私模式 / 配额满时 false，调用方给用户提示） */
export function writeDraft(key: string, d: WorkDraft): boolean {
  try {
    localStorage.setItem(key, serializeDraft(d));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
