/**
 * V8.3-10.08 需求①：钉钉免登（OAuth2 扫码登录）
 *
 * 目标：任何人通过网址进入后，看到的是**自己的角色视角**，而不是统一顶着「赵冰艳」。
 *
 * 为什么走钉钉 OAuth2 而不是自建账号：
 *   通讯录与角色本来就是钉钉侧维护的（记忆里的权限映射：ORGANIZER=工号 E02107…），
 *   自建账号等于再造一份会漂移的副本。免登的收益是「不用维护密码」+「角色永远以钉钉为准」。
 *
 * 流程（标准 OAuth2 授权码模式）：
 *   1. 前端跳 `https://login.dingtalk.com/oauth2/auth?...&response_type=code&scope=openid`
 *   2. 钉钉回调 `/auth/dingtalk/callback?code=xxx`，前端把 code POST 给 `/api/auth/dingtalk/exchange`
 *   3. 服务端用 code + client_id + client_secret 调钉钉 `POST /v1.0/oauth2/userToken` 换 access_token
 *      —— 响应里直接带 **union_id**，与本系统 `users.union_id` 同一套标识，无需额外映射表
 *   4. 用 union_id 在业务库里找人 → 返回 union_id 与角色摘要（前端只拿身份，权限仍由 store 的 access 层判定）
 *
 * ⚠️ 安全约定（务必遵守）：
 *   - Client Secret **只从环境变量读**（DINGTALK_CLIENT_SECRET），绝不写进代码/仓库；
 *   - 缺少配置时 `/api/auth/dingtalk/config` 返回 enabled:false，前端自动降级为「身份选择页」，
 *     本地开发与演示不受影响（不配也能跑，配了就自动切免登）；
 *   - state 参数做 CSRF 防护：授权前生成随机 state，回调时比对，不一致直接拒绝。
 */
import crypto from 'node:crypto';

/** 从环境变量读取钉钉应用配置（缺一项即视为未启用） */
export function dingtalkConfig(env = process.env) {
  const clientId = env.DINGTALK_CLIENT_ID || '';
  const clientSecret = env.DINGTALK_CLIENT_SECRET || '';
  const agentId = env.DINGTALK_AGENT_ID || '';
  return {
    clientId,
    clientSecret,
    agentId,
    enabled: !!(clientId && clientSecret),
    /** 授权回调地址：钉钉后台「登录回调地址」必须与此完全一致 */
    redirectUri: env.DINGTALK_REDIRECT_URI || '',
  };
}

/** 生成随机 state（CSRF 防护 + 防止回调被伪造） */
export function newState() {
  return crypto.randomBytes(16).toString('hex');
}

/** 拼授权页 URL；state 由调用方生成并回传校验 */
export function authorizeUrl(cfg, state, redirectUri) {
  const q = new URLSearchParams({
    redirect_uri: redirectUri || cfg.redirectUri,
    response_type: 'code',
    scope: 'openid',
    client_id: cfg.clientId,
    state,
    prompt: 'consent',
  });
  return `https://login.dingtalk.com/oauth2/auth?${q.toString()}`;
}

/**
 * 用 code 换用户身份。
 *
 * 端点是 `POST https://api.dingtalk.com/v1.0/oauth2/userAccessToken`
 *（**注意不是** /oauth2/userToken —— 那个路径不存在，会返回 404
 *  "Specified api is not found"，参数也不是 tmp_auth_code 而是 code + grantType）
 *
 * 请求体按《获取用户token》官方文档：
 *   { clientId, clientSecret, code, grantType: 'authorization_code' }
 * 响应体（camelCase）：{ accessToken, refreshToken, openId, unionId, expiresIn }
 */
export async function exchangeCodeForUnionId(code, cfg = dingtalkConfig()) {
  if (!cfg.enabled) {
    const err = new Error('钉钉免登未配置（缺少 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET）');
    err.code = 'DINGTALK_NOT_CONFIGURED';
    throw err;
  }
  if (!code) {
    const err = new Error('缺少授权码 code');
    err.code = 'DINGTALK_NO_CODE';
    throw err;
  }
  const resp = await fetch('https://api.dingtalk.com/v1.0/oauth2/userAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      code,
      grantType: 'authorization_code',
    }),
  });
  const body = await resp.json().catch(() => ({}));
  // 钉钉的错误码在 errcode / message 两个字段都可能给
  const unionId = body?.unionId || body?.union_id || '';
  if (!resp.ok || !unionId) {
    const detail = body?.message || body?.errmsg || body?.code || '未知错误';
    const err = new Error(`钉钉换取身份失败（HTTP ${resp.status}）：${detail}`);
    err.code = 'DINGTALK_EXCHANGE_FAILED';
    throw err;
  }
  return {
    unionId,
    openId: body.openId || body.open_id || '',
    nick: body.nick || '',
  };
}