/**
 * V8.3-10.08 需求①收尾：数据面会话（根治「改 localStorage 就能当组织者」）
 *
 * 为什么必须有这一层：前端锁（authLocked / 隐藏切换器）只挡得住「非技术用户」。
 * 懂技术的人改一行 localStorage 就能伪造成他人 union_id，因为
 * **数据面接口此前完全无鉴权** —— 服务端根本不知道请求是谁发的，权限判定全在前端。
 *
 * 方案（最小侵入，不动乐观锁）：
 *   ① 免登成功时服务端签发 token（HMAC-SHA256 签名，内含 union_id + 过期时间），前端随身携带；
 *   ② GET /api/state 按 token 里的身份**裁剪**数据后返回（服务端过滤，不是前端过滤）；
 *   ③ PUT /api/state 对受限集合做**合并保护** —— 客户端只能改自己有权改的条目，
 *      其余条目一律沿用服务端现有数据（否则「拿着裁剪后的子集回写」会覆盖全库）。
 *
 * 关键取舍：
 *   - 只在服务端**配置了免登**（dingtalkConfig().enabled）时才强制鉴权，
 *     未配置时保持开放 —— 否则本地开发与演示全部瘫痪；
 *   - token 用 HMAC 签名而非服务端 session 表：多实例部署也能用，重启不掉线。
 */
import crypto from 'node:crypto';

/** token 有效期：12 小时（够一个工作日，跨夜重新扫码即可） */
const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 签名密钥：优先用会话专用环境变量；
 * 没配则**派生**自钉钉 Client Secret（同一份配置，不额外引入需要保管的密钥）。
 */
function signingSecret(env = process.env) {
  return env.SESSION_SECRET || env.DINGTALK_CLIENT_SECRET || 'wb-dev-secret-not-for-production';
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlParse(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payload, env) {
  return b64url(crypto.createHmac('sha256', signingSecret(env)).update(payload).digest());
}

/** 签发 token：header.payload.signature（payload 是 base64url 的 JSON） */
export function issueToken(unionId, env = process.env, ttlMs = TTL_MS) {
  const payload = b64url(Buffer.from(JSON.stringify({ uid: unionId, exp: Date.now() + ttlMs })));
  return `${payload}.${sign(payload, env)}`;
}

/** 校验 token：返回 union_id，失败返回 null（签名不符/过期/格式错一律 null） */
export function verifyToken(token, env = process.env) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expect = sign(payload, env);
  /** 定长比较，避免时序侧信道 */
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(b64urlParse(payload).toString('utf8'));
    if (!data?.uid || typeof data.exp !== 'number') return null;
    if (Date.now() > data.exp) return null;
    return String(data.uid);
  } catch {
    return null;
  }
}

/** 从请求里取 token：优先 Authorization 头，其次 X-WB-Token 头（fetch 也能带） */
export function readToken(req) {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const h = req.headers?.['x-wb-token'];
  return typeof h === 'string' ? h.trim() : '';
}