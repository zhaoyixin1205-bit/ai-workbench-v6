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
 *
 * 同时把**这次实际发出的 token** 回传给调用方 —— 401 处理要用它做竞态判定。
 */
function authHeaders(): { headers: Record<string, string>; token: string } {
  const t = getSessionToken();
  return { headers: t ? { 'X-WB-Token': t } : {}, token: t };
}

/**
 * 401 = 会话失效（token 缺失/过期/被篡改）。
 * 此时**清掉本地身份与 token**：store 的 meMissing 会变 true，App 立刻回到登录页。
 *
 * ⚠️⚠️ `sentToken` 是竞态判定的关键，**不能省**（2026-10-08 线上实测）：
 * 回调页加载时 store 会先发一次**不带 token** 的数据请求（那时 exchange 还没返回），
 * 它拿到的 401 会**迟到**。如果无脑清身份，就会把用户刚扫码换到的 token 一起擦掉，
 * 于是形成死循环：扫码成功 → 落地 → 旧请求 401 → 清身份 → 又回登录页 → 再扫…
 *
 * 判定规则：
 *   - 这次请求带了 token，且**当前存储里的 token 已经不是它** → 说明期间重新登录过，
 *     这个 401 属于「历史请求」，**绝不能动**当前会话（直接返回）；
 *   - 这次请求带了 token，且当前还是它 → 真会话失效，清干净；
 *   - 这次请求**没带** token（首屏拉数据 / 已登录态丢失）→ 属未登录，清掉残留身份即可。
 */
function handleUnauthorized(sentToken: string) {
  const current = getSessionToken();
  if (sentToken && current !== sentToken) {
    // 期间换了会话：这是旧请求的 401，不作为失效依据
    return;
  }
  if (!sentToken && current) {
    // 请求发出时没有 token，现在却有 —— 说明是「首屏那次无凭证请求」迟到的 401，同上不处理
    return;
  }
  try {
    localStorage.removeItem('wb-workbench-me-v3.0.0');
    localStorage.removeItem('wb-session-token-v1');
    sessionStorage.setItem('wb-session-reason', '会话已失效，请重新通过钉钉扫码登录');
  } catch { /* ignore */ }
  /**
   * 派发全局事件：登录页挂载**之后**才发生的 401（拉数据阶段）也能第一时间显示原因。
   * 只靠 sessionStorage 的话，挂载时读一次，读不到后面发生的事 —— 实测就是这个坑。
   */
  try {
    window.dispatchEvent(new CustomEvent('wb-session-expired'));
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
    const auth = authHeaders();
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json', ...auth.headers } });
    clearTimeout(timer);
    if (res.status === 401) {
      handleUnauthorized(auth.token);
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
    const auth = authHeaders();
    const res = await fetch('/api/state', {
      method: 'PUT',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...auth.headers },
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
      handleUnauthorized(auth.token);
      return { ok: false, conflict: false, error: '会话已过期，请重新登录' };
    }
    if (!res.ok) return { ok: false, conflict: false, error: String(body.error ?? `写入失败（HTTP ${res.status}）`) };
    return { ok: true, version: Number(body.version ?? 0) };
  } catch {
    return null; // 网络层失败：交由调用方降级为本地保存
  }
}

/**
 * 清空服务端数据（演示环境一键复原）
 *
 * 🔴 V8.3-10.09：服务端已加角色校验（仅 ORGANIZER/ADMIN），
 * 这里必须把 token带上，否则线上会直接吃 401。
 * 口径来源：运营方 2026-10-09 拍板「A 加角色校验」。
 */
export async function resetRemoteState(by: string): Promise<boolean> {
  try {
    const res = await fetch('/api/state/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 与其它数据面请求同一套会话凭证；没登录时为空，服务端会拒
        ...authHeaders().headers,
      },
      body: JSON.stringify({ by }),
    });
    if (!res.ok) {
      /** 被拒时把服务端的话带出来，否则用户只看到「重置失败」不知道原因 */
      const body = await res.json().catch(() => null);
      const msg = body?.error || `HTTP ${res.status}`;
      console.warn('[reset] 被服务端拒绝：' + msg);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
