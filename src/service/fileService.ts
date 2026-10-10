/**
 * V6.0 CR-31：真实文件服务前端客户端（U-12 结案，A-39 结案）
 *
 * 设计要点
 * 1. **同一份业务代码，三种环境都能跑**：公司服务器（local 驱动）/ Render（pg 或 s3）/ 纯静态托管（无后端）。
 *    前端永远只调 `/api/files/*`，有没有后端由 `probeFileBackend()` 探测决定，不写死分支。
 * 2. **后端不可达自动降级**：探测失败即回到 A-39 演示态（只登记文件名与体积，url 为空），
 *    并在 UI 上如实说明「未接入文件服务」——不再出现「点了下载没反应」的假象。
 * 3. **前端校验只是体验，不作为安全边界**：白名单与 50MB 在前端拦截以免发出无谓请求，
 *    服务端必须二次校验（前端校验不可信）。
 * 4. **下载地址一律走服务端代理**：前端不接触 object_key，避免真实路径暴露。
 */

import type { AttachmentFile } from '@/mock/types';
import { getSessionToken } from '@/auth/dingtalk';

/**
 * V8.3-10.10 修复：上传/删除请求补带会话 token。
 *
 * 此前 uploadFile/deleteFile 都**不带 X-WB-Token** —— 本地开发（免登未启用）
 * 一切正常，生产（钉钉免登 enabled）服务端 readToken 拿到空 → 一律 401
 * 「会话已过期」，被误判成文件大小/存储问题。与 stateService.authHeaders 同一口径。
 */
function authHeaders(): Record<string, string> {
  const t = getSessionToken();
  return t ? { 'X-WB-Token': t } : {};
}

/** 类型白名单：与服务端 ALLOW_EXT 保持一致（服务端为准） */
export const FILE_ALLOW_EXT = [
  'zip', 'md', 'yaml', 'yml', 'pdf', 'docx', 'xlsx', 'xls', 'pptx', 'png', 'jpg', 'jpeg', 'txt', 'csv',
];
/** 单文件上限 50MB */
export const FILE_MAX_BYTES = 50 * 1024 * 1024;

/** 服务端返回的统一结构 */
interface UploadResp {
  ok: boolean;
  file?: AttachmentFile;
  error?: string;
  /** zip 校验不通过时给出缺失清单 */
  missing?: string[];
}

/** 后端可达性探测结果缓存：null = 未探测 */
let backendState: boolean | null = null;

/** 探测文件服务后端是否可用（幂等，失败即降级） */
export async function probeFileBackend(): Promise<boolean> {
  if (backendState !== null) return backendState;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('/api/files/health', { signal: controller.signal });
    clearTimeout(timer);
    backendState = res.ok;
  } catch {
    backendState = false;
  }
  return backendState;
}

/** 供 UI 读取当前是否处在演示降级态（不触发网络请求） */
export function isFileBackendKnown(): boolean | null {
  return backendState;
}

/**
 * 前端预校验：拦截明显不合规的文件，避免发出注定失败的请求。
 * 返回 null 表示通过；否则返回可直接展示给用户的错误文案。
 */
export function validateFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!FILE_ALLOW_EXT.includes(ext)) {
    return `不支持的文件类型 .${ext}（白名单：${FILE_ALLOW_EXT.join(' / ')}）`;
  }
  if (file.size > FILE_MAX_BYTES) {
    return `单个文件不得超过 50MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`;
  }
  return null;
}

let demoSeq = 0;

/** 演示降级态：只登记元数据，url 为空（与 A-39 口径一致，文案必须对得起用户） */
function demoRecord(
  file: File,
  bizType: AttachmentFile['biz_type'],
  bizId: string,
  uploader: string,
): AttachmentFile {
  demoSeq += 1;
  return {
    id: `DEMO-F${Date.now()}${demoSeq}`,
    biz_type: bizType,
    biz_id: bizId,
    name: file.name,
    ext: file.name.split('.').pop()?.toLowerCase() ?? '',
    size: file.size,
    driver: 'demo',
    object_key: '',
    url: '',
    uploaded_by: uploader,
    uploaded_at: new Date().toISOString(),
    is_deleted: false,
  };
}

/**
 * 上传文件。
 * 后端可用 → 真实上传并拿回 file_id；不可用或开关关闭 → 降级为演示态记录（不抛错，业务流不中断）。
 * zip：服务端解包校验包内必须含 SKILL.md（manifest.yaml 已于 2026-10-10 放宽为不强制），不通过时以 Error 抛出并带缺失清单。
 */
export async function uploadFile(
  file: File,
  bizType: AttachmentFile['biz_type'],
  bizId: string,
  uploader: string,
  opts?: { realFileService?: boolean },
): Promise<AttachmentFile> {
  const err = validateFile(file);
  if (err) throw new Error(err);

  const on = opts?.realFileService !== false && (await probeFileBackend());
  if (!on) return demoRecord(file, bizType, bizId, uploader);

  const qs = new URLSearchParams({
    biz_type: bizType,
    biz_id: bizId,
    name: file.name,
    uploaded_by: uploader,
  });
  const res = await fetch(`/api/files/upload?${qs.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', ...authHeaders() },
    body: file,
  });
  const body = (await res.json().catch(() => ({}))) as UploadResp;
  if (!res.ok || !body.ok || !body.file) {
      if (body.missing?.length) {
        throw new Error(`压缩包缺少必含文件：${body.missing.join('、')}（Skill 包必须含 SKILL.md，允许位于包内任意层级）`);
      }
    throw new Error(body.error || `上传失败（HTTP ${res.status}）`);
  }
  return body.file;
}

/** 下载地址：一律走服务端代理；演示态返回空串（UI 需如实说明） */
export function downloadUrl(f: AttachmentFile): string {
  if (f.driver === 'demo' || !f.url) return '';
  return f.url;
}

/** 软删：仅上传者本人 / 组织者 / 管理员可执行（服务端校验为准） */
export async function deleteFile(id: string): Promise<boolean> {
  if (!(await probeFileBackend())) return false;
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
