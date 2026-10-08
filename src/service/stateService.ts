/**
 * V6.1：业务数据同步服务（把 localStorage 换成后端持久化）
 *
 * 设计要点：
 *  1. 后端不可达（纯静态托管）时所有函数返回 null，前端回落 localStorage —— 与 V6.0 行为等价；
 *  2. 整包读写 + version 乐观锁：并发写入不会静默互相覆盖，冲突以 409 明确返回；
 *  3. data 为 null 表示「服务端还没有数据」，由前端用种子播种后写回，无需手工初始化数据库。
 */

import { getSessionToken } from '@/auth/dingtalk';

const TIMEOUT_MS = 8000;

/**
 * V8.3-10.08 需求①收尾：所有数据面请求都带会话 token。
 * 服务端配了免登时，缺 token 会被 401 拒（并返回「请重新登录」）。
 */
function authHeaders(): Record<string, string> {
  const t = getSessionToken();
  return t ? { 'X-WB-Token': t } : {};
}

/**
 * 401 = 会话失效（token 过期或被篡改）。
 * 此时**清掉本地身份与 token**：store 的 meMissing 会变 true，App 立刻回到登录页。
 * 不这么做的话，用户会卡在一个「拉不到数据」的页面上，不知道该重新扫码。
 */
function handleUnauthorized() {
  try {
    localStorage.removeItem('wb-workbench-me-v3.0.0');
    localStorage.removeItem('wb-session-token-v1');
  } catch { /* ignore */ }
}

export interface StateEnvelope {
  ok: boolean;
  /** null = 服务端尚无数据，需前端播种 */
  data: unknown | null;
  version: number;
  updated_at: string | null;
  updated_by: string;
  driver?: string;
}

export type PushResult =
  | { ok: true; version: number }
  | { ok: false; conflict: true; error: string; version: number }
  | { ok: false; conflict: false; error: string };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json', ...authHeaders() } });
    clearTimeout(timer);
    if (res.status === 401) {
      handleUnauthorized();
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // 后端不可达 / 超时：前端自行降级
  }
}

/** 拉取全量数据；返回 null 表示「没有可用的后端」 */
export async function fetchState(): Promise<StateEnvelope | null> {
  const r = await getJson<StateEnvelope>('/api/state');
  return r && r.ok ? r : null;
}

/** 只取版本号（轮询用，不传全量数据） */
export async function fetchStateVersion(): Promise<number | null> {
  const r = await getJson<{ ok: boolean; version: number }>('/api/state/version');
  return r && r.ok ? Number(r.version) : null;
}

/** 写回全量数据；baseVersion 不匹配时返回 conflict，由调用方决定刷新还是放弃 */
export async function pushState(data: unknown, baseVersion: number, by: string): Promise<PushResult | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch('/api/state', {
      method: 'PUT',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ data, baseVersion, by }),
    });
    clearTimeout(timer);
    const body = (await res.json()) as Record<string, unknown>;
    if (res.status === 409) {
      const cur = (body.current ?? {}) as { version?: number; updated_by?: string };
      return {
        ok: false,
        conflict: true,
        error: String(body.error ?? '数据已被他人更新'),
        version: Number(cur.version ?? 0),
      };
    }
    if (res.status === 401) {
      handleUnauthorized();
      return { ok: false, conflict: false, error: '会话已过期，请重新登录' };
    }
    if (!res.ok) return { ok: false, conflict: false, error: String(body.error ?? `写入失败（HTTP ${res.status}）`) };
    return { ok: true, version: Number(body.version ?? 0) };
  } catch {
    return null; // 网络层失败：交由调用方降级为本地保存
  }
}

/** 清空服务端数据（演示环境一键复原） */
export async function resetRemoteState(by: string): Promise<boolean> {
  try {
    const res = await fetch('/api/state/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
