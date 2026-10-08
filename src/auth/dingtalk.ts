/**
 * V8.3-10.08 需求①：钉钉免登前端封装
 *
 * 这一层只管三件事：**问有没有配免登 → 发起授权 → 用 code 换身份**。
 * 拿到 union_id 之后写进 localStorage（与旧身份键同一个 key），
 * 由 store 的 me 解析成完整用户 —— 权限判定仍在 auth/access.ts，登录层不表态授权。
 *
 * 为什么要 localStorage 存 union_id 而不是每请求都带 token：
 * 现有数据接口（/api/state）是无鉴权的整包读写，免登只解决「进站是谁」，
 * 不改数据面的鉴权模型（那是另一件事，改了要动乐观锁与冲突处理）。
 * 好处是零侵入；代价是拿到链接的人仍可自己选身份（内网工具的既定形态）。
 * 真要做到「点开就是你自己」，需要在数据面加会话（下一步单独排期）。
 */

const CFG_KEY = 'wb-dingtalk-cfg-v1';
const LS_ME = 'wb-workbench-me-v3.0.0';
/**
 * V8.3-10.08 需求①收尾：数据面会话 token。
 * 与 union_id 分开存：token 是**服务端签发的凭证**，改 localStorage 伪造 union_id
 * 没有有效 token，数据面照样按真实身份裁剪（根治「F12 改身份」）。
 */
const LS_TOKEN = 'wb-session-token-v1';

export interface DingtalkProfile {
  unionId: string;
  name: string;
  roles: string[];
  scopeType: string;
  jobNumber: string;
  token?: string;
}

async function jsonPost<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** 后端是否配了免登；探测结果缓存 5 分钟，避免每次进站都问一次 */
export async function isDingtalkEnabled(): Promise<boolean> {
  try {
    const raw = sessionStorage.getItem(CFG_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { at: number; enabled: boolean };
      if (Date.now() - c.at < 5 * 60 * 1000) return c.enabled;
    }
  } catch { /* ignore */ }
  try {
    const res = await fetch('/api/auth/dingtalk/config');
    const body = await res.json();
    const enabled = !!(res.ok && body?.enabled);
    try {
      sessionStorage.setItem(CFG_KEY, JSON.stringify({ at: Date.now(), enabled }));
    } catch { /* ignore */ }
    return enabled;
  } catch {
    return false;
  }
}

/** 跳转到钉钉授权页（state 由服务端签发并缓存，回调时校验） */
export async function startDingtalkLogin(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/dingtalk/start');
    const body = await res.json();
    if (!res.ok || !body?.ok || !body?.url) return null;
    location.href = body.url;
    return body.url;
  } catch {
    return null;
  }
}

/** 用回调带回的 code 换身份并落地（成功返回 profile，失败返回错误文案） */
export async function loginWithCode(code: string, state: string): Promise<
  { ok: true; profile: DingtalkProfile } | { ok: false; error: string }
> {
  const body = await jsonPost<{
    ok: boolean; error?: string; unionId?: string; name?: string; roles?: string[];
    scopeType?: string; jobNumber?: string; token?: string;
  }>('/api/auth/dingtalk/exchange', { code, state });
  if (!body) return { ok: false, error: '无法连接服务端，请检查网络后重试' };
  if (!body.ok || !body.unionId) return { ok: false, error: body.error ?? '免登失败，请重试' };
  const profile: DingtalkProfile = {
    unionId: body.unionId,
    name: body.name ?? '',
    roles: body.roles ?? [],
    scopeType: body.scopeType ?? 'SELF',
    jobNumber: body.jobNumber ?? '',
  };
  /** 与旧身份键同写：store 的 me 会用它解析出完整用户与角色 */
  localStorage.setItem(LS_ME, profile.unionId);
  /** 数据面会话凭证：/api/state 的读写都要带它 */
  if (profile.token) localStorage.setItem(LS_TOKEN, profile.token);
  try {
    sessionStorage.setItem('wb-dingtalk-last', JSON.stringify({ name: profile.name, at: Date.now() }));
  } catch { /* ignore */ }
  return { ok: true, profile };
}

/** 退出登录：清掉身份键，回到未登录态（不清业务缓存，避免误删他人共享数据） */
export function logout() {
  localStorage.removeItem(LS_ME);
  localStorage.removeItem(LS_TOKEN);
  try {
    sessionStorage.removeItem('wb-dingtalk-last');
  } catch { /* ignore */ }
}

/** 当前是否已登录（仅表示「选定了身份」，不代表通过免登验证） */
export function hasIdentity(): boolean {
  try {
    return !!localStorage.getItem(LS_ME);
  } catch {
    return false;
  }
}
/** 取当前会话 token（无免登 / 本地开发时为 null，此时服务端不做鉴权） */
export function getSessionToken(): string {
  try {
    return localStorage.getItem(LS_TOKEN) || '';
  } catch {
    return '';
  }
}
