/**
 * V6.0 CR-31：文件服务（独立端口，同时托管前端 dist，保证同源调用 /api/files）
 *
 * 为什么单独起一个服务而不是塞进主后端：现有前端是纯静态 SPA（localStorage 存库），
 * 部署形态是静态托管；把文件服务做成「可选旁路」——静态托管时前端探测不到后端就降级为演示态，
 * 本地 / 自部署时起这个服务即可获得真实上传下载，两条路共用同一份业务代码。
 *
 * 端口默认 8080（与 vite dev 的 /api 代理目标一致）。
 * 启动自检 fail-fast：驱动初始化失败直接退出并给出可执行的操作指引，不留半死不活状态。
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFileRepository, newFileMeta, makeObjectKey } from './lib/fileRepo.mjs';
import { createStateStore } from './lib/stateStore.mjs';
import { validateSkillZip } from './lib/zip.mjs';
import { authorizeUrl, dingtalkConfig, exchangeCodeForUnionId, newState } from './lib/dingtalkAuth.mjs';
import { issueFileToken, issueToken, readToken, verifyFileToken, verifyToken } from './lib/session.mjs';
import { mergeProtected, scopeData } from './lib/dataScope.mjs';
import { aiScorerReady, composeTotal, scoreWithModel } from './lib/aiScorer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.DIST_DIR || path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.FILE_PORT || process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

/** 全量状态包上限（远小于文件上限，避免一个异常大的库把内存打爆） */
const STATE_MAX_BYTES = 20 * 1024 * 1024;

/** 与前端 FILE_ALLOW_EXT 保持一致；服务端为准（前端校验不可信） */
const ALLOW_EXT = new Set([
  'zip', 'md', 'yaml', 'yml', 'pdf', 'docx', 'xlsx', 'xls', 'pptx', 'png', 'jpg', 'jpeg', 'txt', 'csv',
]);
const MAX_BYTES = 50 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

/* ----------------------------- 工具 ----------------------------- */

function sendJson(res, code, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(buf);
}

/**
 * 读请求体。超限不停机式 reject（直接 destroy 会让客户端拿到 ECONNRESET 而非 413），
 * 改为「暂停接收 + 标记 overflow」，由路由层回 413 后再掐断连接，客户端才能看到明确原因。
 */
function readBody(req, limit = MAX_BYTES + 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let overflow = false;
    req.on('data', (c) => {
      if (overflow) return;
      size += c.length;
      if (size > limit) {
        overflow = true;
        req.pause();
        resolve({ buf: Buffer.alloc(0), overflow: true });
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve({ buf: Buffer.concat(chunks), overflow }));
    req.on('error', reject);
  });
}

/**
 * 可见范围校验（口径不变，改的是「身份从哪来」）：
 * SUBMIT / BOUNTY_SOLUTION 属于个人交付物，仅上传者本人与组织者 / 管理员可下载；
 * CASE_* 属于公开内容，登录态即可下载。
 * 目的：避免「拿到链接就能下别人的作业」。
 *
 * 🔴 V8.3-10.09 `actor` 改为**只接受服务端解出的身份**。
 *
 * 原来调用方传的是 `{ name: searchParams.get('actor'), roles: searchParams.get('roles') }`
 * —— 完全是客户端自称：任何人加 `?roles=ORGANIZER` 就能下任意文件。
 * 现在 actor 由 verifyToken + 身份库解析得到，客户端无从伪造。
 *
 * @param actor 服务端解析出的 { name, roles }；**不可**来自 query
 */
function canDownload(meta, actor) {
  if (!meta) return false;
  if (meta.biz_type === 'CASE_SKILL' || meta.biz_type === 'CASE_ATTACH' || meta.biz_type === 'POST_ATTACH') return true;
  if (!actor) return false;
  const roles = actor.roles ?? [];
  return meta.uploaded_by === actor.name || roles.includes('ORGANIZER') || roles.includes('ADMIN');
}

/**
 * 🔴 删除权限：同样改为只认服务端解出的身份（口径不变：上传者本人 / 组织者 / 管理员）。
 * 抽出成函数是为了让下载与删除**共用同一把尺子** —— 原来两处各写一遍 actor 解析，
 * 很容易改一处漏一处。
 */
function canDeleteFile(meta, actor) {
  if (!meta || !actor) return false;
  const roles = actor.roles ?? [];
  return meta.uploaded_by === actor.name || roles.includes('ORGANIZER') || roles.includes('ADMIN');
}

/**
 * 从请求里解出可信身份。
 * @returns {{name: string, roles: string[]}|null} 未登录/不在名单返回 null
 */
async function resolveActor(req) {
  const token = readToken(req);
  const uid = token ? verifyToken(token) : null;
  if (!uid) return null;
  const current = await state.read();
  const row = (current?.data?.users ?? []).find((u) => u.union_id === uid);
  if (!row) return null;
  return { name: row.name, roles: row.roles ?? [] };
}

/* ----------------------------- 路由 ----------------------------- */

let repo;
let state;

/** V8.3-10.08 需求①：免登 state 短时缓存（内存即可，服务重启即失效反而更安全） */
const authStates = new Map();

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    });
    return res.end();
  }

  /* ---- 健康检查：前端靠它判断「有没有真实文件服务」 ---- */
  if (pathname === '/api/files/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'wb-file-service',
      driver: repo.name,
      stateDriver: state?.name ?? 'none',
      maxBytes: MAX_BYTES,
      allowExt: [...ALLOW_EXT],
      now: new Date().toISOString(),
    });
  }

  /* ---- 业务数据（V6.1：替换 localStorage，多人共享整包 + 乐观锁） ---- */

  /* ================================================================
   * V8.3-10.08 需求①：钉钉免登
   *
   * 三个端点：
   *   GET  /api/auth/dingtalk/config     前端问「有没有配免登」（不返回任何密钥）
   *   GET  /api/auth/dingtalk/start      下发授权 URL 与 state（CSRF 防护）
   *   POST /api/auth/dingtalk/exchange   code → union_id → 业务库身份 + 角色摘要
   * 未配置时 enabled:false，前端降级为身份选择页（演示/本地不受影响）。
   * ================================================================ */
  if (pathname === '/api/auth/dingtalk/config' && req.method === 'GET') {
    const cfg = dingtalkConfig();
    return sendJson(res, 200, { ok: true, enabled: cfg.enabled, clientId: cfg.enabled ? cfg.clientId : '' });
  }

  if (pathname === '/api/auth/dingtalk/start' && req.method === 'GET') {
    const cfg = dingtalkConfig();
    if (!cfg.enabled) return sendJson(res, 200, { ok: true, enabled: false });
    const state = newState();
    const redirectUri = cfg.redirectUri || `http://${req.headers.host}/auth/dingtalk/callback`;
    /** state 落短时缓存：回调时比对，防伪造与串号 */
    authStates.set(state, Date.now() + 5 * 60 * 1000);
    // 清理过期项（顺手做掉，不额外起定时器）
    for (const [k, exp] of authStates) if (exp < Date.now()) authStates.delete(k);
    return sendJson(res, 200, { ok: true, enabled: true, state, url: authorizeUrl(cfg, state, redirectUri) });
  }

  if (pathname === '/api/auth/dingtalk/exchange' && req.method === 'POST') {
    const read = await readBody(req, 8 * 1024);
    let payload = {};
    try {
      payload = JSON.parse(read.buf?.toString('utf8') || '{}');
    } catch {
      return sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
    }
    const { code, state: clientState } = payload ?? {};
    // state 校验：必须是本服务签发且未过期的（防 CSRF / 防伪造回调）
    const exp = clientState ? authStates.get(clientState) : undefined;
    if (!exp || exp < Date.now()) {
      return sendJson(res, 400, { ok: false, error: 'state 无效或已过期，请重新发起免登' });
    }
    authStates.delete(clientState);

    let identity;
    try {
      identity = await exchangeCodeForUnionId(code);
    } catch (e) {
      return sendJson(res, 401, { ok: false, error: e.message, code: e.code ?? 'DINGTALK_FAILED' });
    }

    /** 用 union_id 在业务库里找人 —— union_id 与钉钉侧同一套标识，无需映射表 */
    const s = await state.read();
    const users = s?.data?.users ?? [];
    const me = users.find((u) => u.union_id === identity.unionId);
    if (!me) {
      return sendJson(res, 403, {
        ok: false,
        error: '已通过钉钉身份验证，但该成员不在工作台名单里（请联系组织者开通）',
        code: 'NOT_IN_WORKBENCH',
        unionId: identity.unionId,
      });
    }
    if (me.status === 99) {
      return sendJson(res, 403, { ok: false, error: '该成员已离职回收，无法登录', code: 'USER_DISABLED', unionId: identity.unionId });
    }
    // 只回身份与角色摘要；**同时签发数据面会话 token**（前端之后每次读写 /api/state 都要带）
    return sendJson(res, 200, {
      ok: true,
      unionId: me.union_id,
      name: me.name,
      roles: me.roles,
      scopeType: me.scope_type,
      jobNumber: me.job_number,
      token: issueToken(me.union_id),
    });
  }

  // 读取全量。data 为 null 表示「服务端还没有数据」，前端用种子播种后写回。
  if (pathname === '/api/state' && req.method === 'GET') {
    const s = await state.read();
    /**
     * V8.3-10.08 需求①收尾：按身份裁剪数据面。
     * 未配置免登时保持开放（本地开发 / 演示）；配置了免登则必须带 token，
     * 且**按业务库里查到的身份**过滤 —— 前端传来的任何身份声明都不可信。
     */
    const authOn = dingtalkConfig().enabled;
    let data = s.data;
    if (authOn) {
      const token = readToken(req);
      const uid = token ? verifyToken(token) : null;
      if (!uid) {
        return sendJson(res, 401, { ok: false, error: '会话已过期，请重新通过钉钉登录', code: 'NO_SESSION' });
      }
      const meRow = (s.data?.users ?? []).find((u) => u.union_id === uid);
      if (!meRow) {
        return sendJson(res, 403, { ok: false, error: '该成员已不在名单内，请联系组织者', code: 'NOT_IN_WORKBENCH' });
      }
      data = scopeData(s.data, meRow);
    }
    return sendJson(res, 200, {
      ok: true,
      data,
      version: s.version,
      updated_at: s.updated_at,
      updated_by: s.updated_by,
      driver: state.name,
    });
  }

  // 只取版本号：前端高频轮询用它判断「别人改没改」，不传全量数据
  if (pathname === '/api/state/version' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, ...(await state.version()) });
  }

  if (pathname === '/api/state' && req.method === 'PUT') {
    const read = await readBody(req, STATE_MAX_BYTES + 1024);
    if (read.overflow) {
      res.once('finish', () => req.destroy());
      return sendJson(res, 413, { ok: false, error: '数据包超过 20MB 上限' });
    }
    let payload;
    try {
      payload = JSON.parse(read.buf.toString('utf8') || '{}');
    } catch {
      return sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
    }
    if (!payload || typeof payload.data !== 'object' || payload.data === null) {
      return sendJson(res, 400, { ok: false, error: '缺少 data 字段' });
    }
    /**
     * V8.3-10.08 需求①收尾：写入前的合并保护。
     * 前端拿到的是裁剪后的子集，直接整包写回会把组织者与他人数据抹掉。
     * 这里对受限集合做「只采纳本人条目、其余沿用服务端数据」的处理。
     */
    let writeData = payload.data;
    if (dingtalkConfig().enabled) {
      const token = readToken(req);
      const uid = token ? verifyToken(token) : null;
      if (!uid) {
        return sendJson(res, 401, { ok: false, error: '会话已过期，请重新通过钉钉登录', code: 'NO_SESSION' });
      }
      const current = await state.read();
      const meRow = (current?.data?.users ?? []).find((u) => u.union_id === uid);
      if (!meRow) {
        return sendJson(res, 403, { ok: false, error: '该成员已不在名单内', code: 'NOT_IN_WORKBENCH' });
      }
      writeData = mergeProtected(current?.data, payload.data, meRow);
    }

    const r = await state.write(writeData, payload.baseVersion, payload.by);
    if (!r.ok) {
      // 409 而不是静默覆盖：把「你的修改被别人冲掉」变成一次明确的、可感知的事件
      return sendJson(res, 409, {
        ok: false,
        conflict: true,
        error: `数据已被「${r.current.updated_by || '他人'}」更新，请刷新后重试`,
        current: r.current,
      });
    }
    return sendJson(res, 200, { ok: true, version: r.version });
  }

  /**
   * 清空服务端数据：下一次拉取时前端用种子重新播种（演示环境一键复原）
   *
   * 🔴 V8.3-10.09 加角色校验（此前**完全无鉴权**）：这个端点会清空**整库**
   * （作业/ 悬赏 / 积分 / 通讯录 / 全部提报），任何一次误触或好奇尝试都不可逆。
   * 线上排障时误调此接口，真的把库清空过一次（靠 .bak 恢复）。
   *
   * 口径（运营方 2026-10-09 拍板）：**A 加角色校验** —— 仅组织者 / 管理员可调用。
   *
   * ⚠️ 与 PUT /api/state 一致地受 `dingtalkConfig().enabled` 约束：
   *未配钉钉免登时（本地开发 / 演示）没有身份体系可校验，此时**放行但打警告**——
   * 不能因为开发环境方便就把生产环境的门也拆了。生产已配免登（config.enabled=true），
   * 因此线上是实打实生效的。
   */
  if (pathname === '/api/state/reset' && req.method === 'POST') {
    let by = '';
    try {
      const read = await readBody(req, 1024);
      by = JSON.parse(read.buf.toString('utf8') || '{}').by || '';
    } catch { /* 没有 body 也算合法 */ }

    if (dingtalkConfig().enabled) {
      const token = readToken(req);
      const uid = token ? verifyToken(token) : null;
      if (!uid) {
        return sendJson(res, 401, {
          ok: false,
          error: '会话已过期，请重新通过钉钉登录',
          code: 'NO_SESSION',
        });
      }
      const current = await state.read();
      const meRow = (current?.data?.users ?? []).find((u) => u.union_id === uid);
      if (!meRow) {
        return sendJson(res, 403, { ok: false, error: '该成员已不在名单内', code: 'NOT_IN_WORKBENCH' });
      }
      const roles = meRow.roles ?? [];
      if (!roles.includes('ORGANIZER') && !roles.includes('ADMIN')) {
        /** 留痕：谁在什么时候试图清库、身份是什么 —— 审计需要 */
        console.warn(`[reset] 拒绝：${meRow.name}(${uid}) 角色=${JSON.stringify(roles)} 不在允许名单`);
        return sendJson(res, 403, {
          ok: false,
          error: '只有组织者或系统管理员可以清空数据',
          code: 'NOT_ALLOWED',
        });
      }
      // 操作者取身份库里的真名，不信前端传来的 by（那个字段可伪造）
      await state.reset(null, meRow.name);
      console.log(`[reset] 已清空，操作者：${meRow.name}(${uid})`);
      return sendJson(res, 200, { ok: true, message: '已清空服务端数据，刷新后按种子重新初始化' });
    }

    // 未配免登：无身份体系可校验，放行但**必须留痕**，避免线上误配时静默裸奔
    console.warn(
      `[reset] ⚠️ 钉钉免登未启用，本次清空请求未被鉴权拦截（操作者声明：${by || '未声明'}）。` +
        '若这是生产环境，请检查 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET 配置。',
    );
    await state.reset(null, by);
    return sendJson(res, 200, { ok: true, message: '已清空服务端数据，刷新后按种子重新初始化' });
  }

  /* ---- AI 评分：POST /api/ai/score?submit_id=&force=1 ---- */
  if (pathname === '/api/ai/score' && req.method === 'POST') {
    const submitId = url.searchParams.get('submit_id') || '';
    const force = url.searchParams.get('force') === '1';

    /**
     * 鉴权：与 /api/state/reset 同一套 —— 免登开启时必须有会话，
     * 且只有组织者/评委/管理员能触发（AI 评分会产生费用，不能让任何人都刷）。
     */
    if (dingtalkConfig().enabled) {
      const token = readToken(req);
      const uid = token ? verifyToken(token) : null;
      if (!uid) {
        return sendJson(res, 401, { ok: false, error: '会话已过期，请重新通过钉钉登录', code: 'NO_SESSION' });
      }
      const cur = await state.read();
      const me = (cur?.data?.users ?? []).find((u) => u.union_id === uid);
      if (!me) {
        return sendJson(res, 403, { ok: false, error: '该成员已不在名单内', code: 'NOT_IN_WORKBENCH' });
      }
      const roles = me.roles ?? [];
      const allowed = ['ORGANIZER', 'ADMIN', 'JUDGE'].some((r) => roles.includes(r));
      if (!allowed) {
        console.warn(`[ai] 拒绝：${me.name}(${uid}) 角色=${JSON.stringify(roles)}`);
        return sendJson(res, 403, { ok: false, error: '仅组织者 / 评委 / 管理员可触发 AI 评分', code: 'NOT_ALLOWED' });
      }
    }

    const cur = await state.read();
    const data = cur?.data ?? {};
    const submit = (data.submits ?? []).find((s) => s.id === submitId);
    if (!submit) return sendJson(res, 404, { ok: false, error: '提报不存在' });

    // 提报上的 card_version 优先，回退到当前启用卡
    const card = (data.scoreCards ?? []).find(
      (c) => !c.is_deleted && c.version === submit.score_card_version && c.status === '启用',
    ) ?? (data.scoreCards ?? []).find((c) => !c.is_deleted && c.status === '启用');
    if (!card) return sendJson(res, 400, { ok: false, error: '没有启用中的评分卡' });

    // force=false 且已有 AI 记录 → 直接返回，不重复花钱
    const existing = (data.scoreResults ?? []).find(
      (r) => r.target_type === 'submit' && r.target_id === submitId && r.source === 'AI',
    );
    if (existing && !force) {
      return sendJson(res, 200, {
        ok: true, cached: true, total: existing.total,
        dim_scores: existing.dim_scores, reason: existing.reason,
        scorer_name: existing.scorer_name, created_at: existing.created_at,
      });
    }

    const r = await scoreWithModel({ submit, card, force });
    const now = new Date().toISOString();
    const record = {
      id: `SR-${submitId}-AI-${force ? Date.now() : now}`,
      target_type: 'submit',
      target_id: submitId,
      card_id: card.id,
      card_version: card.version,
      source: 'AI',
      dim_scores: r.dimScores,
      total: r.total,
      reason: r.reason,
      scorer_union_id: 'AI',
      scorer_name: r.scorerName,
      created_at: now.slice(0, 16).replace('T', ' '),
      /** V8.3-10.10：结构化理由 + summary，供「AI评分详情」弹窗直接渲染 */
      ai_reasons: r.ok ? (r.reasons ?? null) : null,
      ai_summary: r.ok ? (r.summary ?? '') : '',
      ai_model: r.model ?? null,
      ai_degraded: !!r.degraded,
    };

    // 同一条提报只保留一条 AI 记录（重评则覆盖），避免详情页出现多份
    const nextResults = [
      record,
      ...(data.scoreResults ?? []).filter(
        (x) => !(x.target_type === 'submit' && x.target_id === submitId && x.source === 'AI'),
      ),
    ];
    const writeData = {
      ...data,
      scoreResults: nextResults,
      /** AI 分回写到提报上，列表页的「AI 分」列直接读它 */
      submits: (data.submits ?? []).map((s) => (s.id === submitId ? { ...s, ai_score: r.total } : s)),
      submits_in: undefined,
    };
    delete writeData.submits_in;

    if (dingtalkConfig().enabled) {
      // 走写保护（评委可能没有 users/depts 的完整档案）
      const token = readToken(req);
      const uid = token ? verifyToken(token) : null;
      const me = (data.users ?? []).find((u) => u.union_id === uid);
      if (me) writeData = mergeProtected(data, writeData, me);
    }

    const wr = await state.write(writeData, cur?.version);
    if (!wr.ok) {
      return sendJson(res, 409, {
        ok: false, conflict: true,
        error: `数据已被「${wr.current?.updated_by || '他人'}」更新，请刷新后重试`,
      });
    }
    console.log(
      `[ai] 评分完成 submit=${submitId} total=${r.total} scorer=${r.scorerName}` +
      (r.degraded ? `（降级：${r.why}）` : ` model=${r.model}`),
    );
    return sendJson(res, 200, {
      ok: true, cached: false, total: r.total, dim_scores: r.dimScores,
      reason: r.reason, ai_reasons: r.ai_reasons ?? r.reasons ?? null,
      ai_summary: r.summary ?? '', scorer_name: r.scorerName,
      degraded: !!r.degraded, why: r.why ?? '',
    });
  }

  /* ---- AI 评分（手动批量）：导出待评作业 JSON ---- */
  if (pathname === '/api/ai/export-submissions' && req.method === 'GET') {
    /**
     * V8.3-10.10 手动 AI 评分闭环（用户拍板「暂不连上自动评分」）：
     * 导出当前待评作业，交给外部 AI 打分后，再走 /api/ai/import-scores 写回。
     * 鉴权：与 /api/ai/score 同一套（免登开启时须有会话，且仅 ORGANIZER/ADMIN/JUDGE）。
     */
    if (dingtalkConfig().enabled) {
      const token = readToken(req);
      const uid = token ? verifyToken(token) : null;
      if (!uid) return sendJson(res, 401, { ok: false, error: '会话已过期，请重新通过钉钉登录', code: 'NO_SESSION' });
      const cur0 = await state.read();
      const me0 = (cur0?.data?.users ?? []).find((u) => u.union_id === uid);
      if (!me0) return sendJson(res, 403, { ok: false, error: '该成员已不在名单内', code: 'NOT_IN_WORKBENCH' });
      const roles = me0.roles ?? [];
      if (!['ORGANIZER', 'ADMIN', 'JUDGE'].some((r) => roles.includes(r))) {
        return sendJson(res, 403, { ok: false, error: '仅组织者 / 评委 / 管理员可导出', code: 'NOT_ALLOWED' });
      }
    }

    const cur = await state.read();
    const data = cur?.data ?? {};
    const all = url.searchParams.get('all') === '1';
    /** 默认只导出仍在评分链路上的提报；?all=1 导出全部（含已完成的，便于重评） */
    const PIPELINE = ['SUBMITTED', 'AI_SCORED', 'REVIEWING', 'REVIEWED'];
    const items = (data.submits ?? [])
      .filter((s) => (all ? true : PIPELINE.includes(s.status)))
      .map((s) => {
        const card = (data.scoreCards ?? []).find(
          (c) => !c.is_deleted && c.version === s.score_card_version && c.status === '启用',
        ) ?? (data.scoreCards ?? []).find((c) => !c.is_deleted && c.status === '启用');
        const dims = (card?.dimensions ?? []).map((d) => ({
          name: d.name, max_score: d.max_score, weight: d.weight,
          standard: d.standard ?? d.level_text ?? '',
        }));
        return {
          submit_id: s.id,
          code: s.code,
          title: s.title,
          author: s.name,
          dept: s.dept_name,
          status: s.status,
          card_name: card?.name ?? '',
          card_version: card?.version ?? '',
          total_rule: card?.total_rule ?? '',
          pass_line: card?.pass_line ?? '',
          dimensions: dims,
          content: {
            topic: s.topic_title || s.custom_topic || '',
            scene_desc: s.scene_desc || '',
            before_after: s.before_after || '',
            output_sample: s.output_sample || '',
            skill_used: s.skill_used || '',
            attachments: (s.attachments ?? []).map((a) => a.name),
          },
          /** 待 AI 填写的三个字段，保持结构不变便于回传 */
          ai_scores: {},
          ai_reasons: {},
          ai_summary: '',
        };
      });

    const payload = {
      meta: {
        generated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        total: items.length,
        usage:
          '① 把本文件交给外部 AI，附上 meta.prompt 作为指令，要求它按每条 submit 的 dimensions 逐维度打分'
          + '（0~max_score），并在 ai_reasons 写每维度理由、ai_summary 写一句话总评；'
          + '② 让 AI 只填写 ai_scores / ai_reasons / ai_summary 三个字段，其余字段与整体 JSON 结构保持不变；'
          + '③ 把填好的文件上传回「导入 AI 得分」。同一 submit_id 重复上传会覆盖上一次 AI 分（幂等）。',
        prompt:
          '你是严谨的评委。对 items 中每条 submit，依据其 dimensions（含 max_score 与权重）和 content 里的作品内容，'
          + '逐维度给出 0~max_score 的分数，并在 ai_reasons 中按维度名写不少于 4 字的理由（引用作品具体内容），'
          + '在 ai_summary 写一句话总体评价。只修改 ai_scores、ai_reasons、ai_summary 三个字段，'
          + '保持其它字段与整体 JSON 结构不变，只输出合法的完整 JSON。',
      },
      items,
    };

    const fileName = `ai-submissions-${payload.meta.generated_at.slice(0, 10)}.json`;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify(payload, null, 2));
  }

  /* ---- AI 评分（手动批量）：导入 AI 得分 JSON ---- */
  if (pathname === '/api/ai/import-scores' && req.method === 'POST') {
    /**
     * 把外部 AI 填好的得分写回：逐 submit 生成一条 source='AI' 的 ScoreResult，
     * 并把 ai_score 回写到提报（SUBMITTED → AI_SCORED）。
     * 与 /api/ai/score 同口径：只保留每条提报一条 AI 记录（重评覆盖），写保护走 mergeProtected。
     */
    if (dingtalkConfig().enabled) {
      const token = readToken(req);
      const uid = token ? verifyToken(token) : null;
      if (!uid) return sendJson(res, 401, { ok: false, error: '会话已过期，请重新通过钉钉登录', code: 'NO_SESSION' });
      const cur0 = await state.read();
      const me0 = (cur0?.data?.users ?? []).find((u) => u.union_id === uid);
      if (!me0) return sendJson(res, 403, { ok: false, error: '该成员已不在名单内', code: 'NOT_IN_WORKBENCH' });
      const roles = me0.roles ?? [];
      if (!['ORGANIZER', 'ADMIN', 'JUDGE'].some((r) => roles.includes(r))) {
        return sendJson(res, 403, { ok: false, error: '仅组织者 / 评委 / 管理员可导入', code: 'NOT_ALLOWED' });
      }
    }

    const rb = await readBody(req);
    if (rb.overflow) return sendJson(res, 413, { ok: false, error: '请求体过大' });
    let body;
    try {
      body = JSON.parse(rb.buf.toString('utf8') || '{}');
    } catch {
      return sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
    }
    const arr = Array.isArray(body) ? body : (body?.items ?? body?.data ?? null);
    if (!Array.isArray(arr) || arr.length === 0) {
      return sendJson(res, 400, { ok: false, error: '未检测到提交数组（期望 JSON 数组，或 {"items":[...]}）' });
    }

    const cur = await state.read();
    const data = cur?.data ?? {};
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const errors = [];
    const newResults = [];
    const submitPatches = [];

    for (const it of arr) {
      const sid = it?.submit_id || it?.submitId || it?.id;
      if (!sid) { errors.push({ submit_id: '', reason: '缺少 submit_id' }); continue; }
      const s = (data.submits ?? []).find((x) => x.id === sid);
      if (!s) { errors.push({ submit_id: String(sid), reason: '提报不存在' }); continue; }

      const card = (data.scoreCards ?? []).find(
        (c) => !c.is_deleted && c.version === s.score_card_version && c.status === '启用',
      ) ?? (data.scoreCards ?? []).find((c) => !c.is_deleted && c.status === '启用');
      if (!card || (card.dimensions ?? []).length === 0) {
        errors.push({ submit_id: String(sid), reason: '未匹配到可用评分卡' });
        continue;
      }

      const scores = it.ai_scores ?? it.scores ?? {};
      const reasons = it.ai_reasons ?? it.reasons ?? {};
      const summary = String(it.ai_summary ?? it.summary ?? '');
      const dimScores = {};
      let bad = false;
      for (const d of card.dimensions) {
        const v = Number(scores[d.name]);
        if (!Number.isFinite(v)) { errors.push({ submit_id: String(sid), reason: `维度「${d.name}」缺分数` }); bad = true; break; }
        const max = d.max_score || 100;
        if (v < 0 || v > max) { errors.push({ submit_id: String(sid), reason: `维度「${d.name}」分数 ${v} 越界（0~${max}）` }); bad = true; break; }
        const r = String(reasons[d.name] ?? '').trim();
        if (r.length < 4) { errors.push({ submit_id: String(sid), reason: `维度「${d.name}」理由过短` }); bad = true; break; }
        dimScores[d.name] = Math.round(v * 10) / 10;
      }
      if (bad) continue;

      const total = composeTotal(dimScores, card);
      const reasonText = [
        'AI 评分（手动导入）', `总分 ${total}`, '',
        ...card.dimensions.map((d) => `【${d.name}】${dimScores[d.name]} / ${d.max_score}\n${reasons[d.name]}`),
        summary ? `总体评价：${summary}` : '',
      ].join('\n');

      const resultId = `SR-${sid}-AI-IMPORT-${Date.now()}`;
      newResults.push({
        id: resultId,
        target_type: 'submit',
        target_id: sid,
        card_id: card.id,
        card_version: card.version,
        source: 'AI',
        dim_scores: dimScores,
        total,
        reason: reasonText,
        scorer_union_id: 'AI',
        scorer_name: 'AI 评分（手动导入）',
        created_at: now,
        ai_reasons: reasons,
        ai_summary: summary,
        ai_model: 'manual-import',
        ai_degraded: false,
      });
      submitPatches.push({ id: sid, ai_score: total, status: s.status === 'SUBMITTED' ? 'AI_SCORED' : s.status });
    }

    if (newResults.length === 0) {
      return sendJson(res, 200, { ok: true, imported: 0, skipped: errors.length, errors });
    }

    const keptIds = new Set(newResults.map((r) => r.target_id));
    const nextResults = [
      ...newResults,
      ...(data.scoreResults ?? []).filter(
        (x) => !(x.target_type === 'submit' && keptIds.has(x.target_id) && x.source === 'AI'),
      ),
    ];
    const nextSubmits = (data.submits ?? []).map((x) => {
      const p = submitPatches.find((pp) => pp.id === x.id);
      return p ? { ...x, ai_score: p.ai_score, status: p.status } : x;
    });

    const writeData = { ...data, scoreResults: nextResults, submits: nextSubmits };
    if (dingtalkConfig().enabled) {
      const token = readToken(req);
      const uid = token ? verifyToken(token) : null;
      const me = (data.users ?? []).find((u) => u.union_id === uid);
      if (me) mergeProtected(data, writeData, me);
    }
    const wr = await state.write(writeData, cur?.version);
    if (!wr.ok) {
      return sendJson(res, 409, {
        ok: false, conflict: true,
        error: `数据已被「${wr.current?.updated_by || '他人'}」更新，请刷新后重试`,
      });
    }
    return sendJson(res, 200, { ok: true, imported: newResults.length, skipped: errors.length, errors });
  }

  /* ---- 上传：POST /api/files/upload?biz_type=&biz_id=&name= ---- */
  if (pathname === '/api/files/upload' && req.method === 'POST') {
    const q = url.searchParams;
    const bizType = q.get('biz_type') || '';
    const bizId = q.get('biz_id') || '';
    const name = q.get('name') || 'unnamed';

    /**
     * V8.3-10.09 加登录态校验（运营方 14:36 拍板 **B：只要登录态**）。
     *
     * 为什么只要登录态、不做角色限制：员工要给自己提报的作业传附件、
     * 给认领的悬赏方案传补充资料 —— 限制到组织者会把正常业务挡死。
     * 所以判定是「**登录即可传**」，挡的只是未登录的陌生人。
     *
     * ⚠️ 与 /api/state/reset 一样按免登配置分叉：生产已配免登（enabled=true），
     * 线上是实打实生效的；本地开发无身份体系，放行但打警告——
     * 不能为开发方便把生产的门也拆了。
     */
    let meRow = null;
    let meUid = '';
    if (dingtalkConfig().enabled) {
      const token = readToken(req);
      const uid = token ? verifyToken(token) : null;
      if (!uid) {
        return sendJson(res, 401, {
          ok: false,
          error: '会话已过期，请重新通过钉钉登录后再上传文件',
          code: 'NO_SESSION',
        });
      }
      const current = await state.read();
      meRow = (current?.data?.users ?? []).find((u) => u.union_id === uid);
      if (!meRow) {
        return sendJson(res, 403, { ok: false, error: '该成员已不在名单内', code: 'NOT_IN_WORKBENCH' });
      }
      meUid = uid;
    } else {
      console.warn('[files] ⚠️ 钉钉免登未启用，本次上传未被鉴权拦截（生产环境请检查 DINGTALK 配置）');
    }

    /**
     * 上传者身份改从**身份库**取，不再信 query 里的 uploaded_by ——
     * 那是客户端传来的，任何人都能自称「组织者」。与 reset 同一个道理。
     *
     * 顺带说明：原代码还有一个 `roles`（从 query 的 roles= 解析），
     * 但它声明后**从未被消费**（newFileMeta 不收roles）—— 是个会误导人的死变量，
     * 而且看起来像"客户端可以指定角色"。已一并删掉。
     */
    const uploadedBy = meRow ? meRow.name : (q.get('uploaded_by') || '');

    if (!['CASE_SKILL', 'CASE_ATTACH', 'SUBMIT', 'BOUNTY_SOLUTION', 'POST_ATTACH'].includes(bizType)) {
      return sendJson(res, 400, { ok: false, error: `biz_type 非法：${bizType}` });
    }
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOW_EXT.has(ext)) {
      return sendJson(res, 400, { ok: false, error: `不支持的文件类型 .${ext}` });
    }

    let read;
    try {
      read = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: `读取失败：${e.message}` });
    }
    if (read.overflow) {
      res.once('finish', () => req.destroy());
      return sendJson(res, 413, { ok: false, error: '文件超过 50MB 上限' });
    }
    const buf = read.buf;
    if (buf.length === 0) return sendJson(res, 400, { ok: false, error: '文件为空' });

    const key = makeObjectKey(bizType, ext);
    const meta = newFileMeta({
      bizType, bizId, name, ext, size: buf.length, driver: repo.name, objectKey: key, uploadedBy,
    });

    // zip 真实校验：解包确认含 SKILL.md 与 manifest.yaml（CR-20 / 6.3.7 共同约束）
    if (ext === 'zip') {
      try {
        const r = validateSkillZip(buf);
        meta.zip_checked = true;
        meta.zip_valid = r.ok;
        meta.zip_missing = r.missing;
        if (!r.ok) {
          return sendJson(res, 400, {
            ok: false,
            error: `压缩包缺少必含文件：${r.missing.join('、')}`,
            missing: r.missing,
          });
        }
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: `压缩包解析失败：${e.message}` });
      }
    }

    try {
      /**
       * 🔴 V8.3-10.09 上传时把**短时签名**拼进 url（5 分钟有效，绑定本文件 id）。
       * 前端 `window.open(f.url)` / `<img src>` / `<a href>` 不会带自定义 header，
       * 所以凭证必须落在 URL 里；签名绑定 fileId，泄露也只能用 5 分钟且换不了文件。
       *
       * 未登录时（免登未配置的开发环境）不签发 —— 那种环境本就没有身份体系。
       */
      if (meUid) {
        meta.url = `/api/files/${meta.id}?sig=${issueFileToken(meUid, meta.id)}`;
      }
      // 顺序必须是「先元数据后内容」：pg 驱动的 put 是按 object_key 做 UPDATE，
      // 颠倒会更新 0 行却报成功 → 内容静默丢失（V6.1 修复）
      await repo.writeMeta(meta);
      await repo.put(key, buf);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: `写入失败：${e.message}` });
    }
    console.log(`[files] 上传 ${meta.id} ${name} ${buf.length}B driver=${repo.name} biz=${bizType}/${bizId}`);
    return sendJson(res, 200, { ok: true, file: meta });
  }

  /* ---- 下载 / 删除：GET|DELETE /api/files/:id ---- */
  const m = /^\/api\/files\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (m) {
    const id = m[1];
    const meta = await repo.readMeta(id).catch(() => null);
    if (!meta || meta.is_deleted) return sendJson(res, 404, { ok: false, error: '文件不存在或已被删除' });

    /**
     * 🔴 V8.3-10.09 身份改为**从 X-WB-Token 解**（原来取 query 的 actor/roles，
     * 任何人可`?roles=ORGANIZER` 冒充越权下载/删除 —— 实测已复现）。
     *
     * 两种可信来源，任一即可：
     *  1. `X-WB-Token` 头 —— fetch / XHR 走这条；
     *  2. `?sig=` **短时签名**（5 分钟、绑定 fileId）—— window.open / `<img src>`
     *     这类**浏览器不会带自定义 header** 的场景走这条。
     *     签名绑定 fileId：拿到 A 文件的签名 URL 不能改去下B 文件。
     *
     * 兼容说明：query 里的 actor/roles **仅在免登未配置时**作为开发兜底，
     * 生产已配钉钉免登（enabled=true），走的一定是上面两条可信路径。
     */
    let actor = await resolveActor(req);
    if (!actor) {
      const sig = url.searchParams.get('sig');
      if (sig) {
        const v = verifyFileToken(sig);
        // ⚠️ 必须比对 fileId：签名只证明「这个签名对应哪个文件」，不证明它对当前路径有效
        if (v && v.fileId === id) {
          const current = await state.read();
          const row = (current?.data?.users ?? []).find((u) => u.union_id === v.uid);
          if (row) actor = { name: row.name, roles: row.roles ?? [] };
        }
      }
    }
    const authFallback = !actor && !dingtalkConfig().enabled;
    if (authFallback) {
      actor = {
        name: url.searchParams.get('actor') || '',
        roles: (url.searchParams.get('roles') || '').split(',').filter(Boolean),
      };
    }

    if (req.method === 'DELETE') {
      if (!canDeleteFile(meta, actor)) {
        /** 未登录时给明确提示，别让用户以为文件不存在 */
        if (!actor) {
          return sendJson(res, 401, {
            ok: false,
            error: '会话已过期，请重新通过钉钉登录后再删除文件',
            code: 'NO_SESSION',
          });
        }
        return sendJson(res, 403, { ok: false, error: '仅上传者本人 / 组织者 / 管理员可删除' });
      }
      meta.is_deleted = true;
      await repo.writeMeta(meta);
      await repo.del(meta.object_key).catch(() => undefined);
      console.log(`[files] 删除 ${id} by ${actor.name}(${actor.roles.join(',') || '无角色'})`);
      return sendJson(res, 200, { ok: true, id });
    }

    if (req.method === 'GET') {
      /**
       * 口径（见 canDownload）：公开内容（案例附件 / Skill 包 / 帖子图片）全员可下载，
       * 因此**不带token 也能下** —— 否则「别人发在帖子里的图片」会加载不出来。
       * 涉及个人交付物（SUBMIT / BOUNTY_SOLUTION）的必须有可信身份。
       */
      if (!canDownload(meta, actor)) {
        if (!actor) {
          return sendJson(res, 401, {
            ok: false,
            error: '会话已过期，请重新通过钉钉登录后再下载文件',
            code: 'NO_SESSION',
          });
        }
        return sendJson(res, 403, { ok: false, error: '该文件不在你的可见范围内' });
      }
      let buf;
      try {
        buf = await repo.get(meta.object_key);
      } catch {
        return sendJson(res, 404, { ok: false, error: '文件内容不存在（可能已被清理）' });
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buf.length,
        // 下载名用上传时的原始名，但经过清洗（去掉路径分隔与控制字符）
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(meta.name.replace(/[/\\]/g, '_'))}`,
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(buf);
    }
  }

  /* ---- 静态资源：同源托管 dist，保证 /api/files 与页面同源 ---- */
  return serveStatic(req, res, pathname);
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const abs = path.join(DIST, rel);
  if (!abs.startsWith(path.resolve(DIST))) {
    res.writeHead(403); return res.end('forbidden');
  }
  try {
    const s = await stat(abs);
    if (s.isDirectory()) throw new Error('dir');
    const buf = await readFile(abs);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream', 'Content-Length': buf.length });
    res.end(buf);
  } catch {
    // HashRouter：未知路径一律回 index.html
    try {
      const buf = await readFile(path.join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': buf.length });
      res.end(buf);
    } catch {
      res.writeHead(404); res.end('dist 未构建，请先执行 npm run build');
    }
  }
}

/* --------------------------- 生命周期 --------------------------- */

repo = createFileRepository();
state = createStateStore();

Promise.all([repo.init(), state.init()])
  .then(() => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch((e) => {
        console.error('[server] 处理失败：', e.message);
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: e.message });
      });
    });
    server.listen(PORT, HOST, () => {
      console.log(`[server] 已启动: http://localhost:${PORT}  (内网 http://<本机IP>:${PORT})`);
      console.log(`[server] 文件存储驱动: ${repo.name}`);
      console.log(`[server] 业务数据存储驱动: ${state.name}${state.name === 'pg' ? '（多人共享已启用）' : '（单实例模式）'}`);
      console.log(`[server] 静态资源: ${DIST}`);
      console.log(`[server] 限制: ≤50MB · 白名单 ${[...ALLOW_EXT].join('/')}`);
    });
  })
  .catch((e) => {
    // fail-fast：驱动起不来就不监听端口，避免前端探测到「活着但全是 500」
    console.error(`[server] 启动失败（文件驱动 ${repo?.name} / 数据驱动 ${state?.name}）：${e.message}`);
    process.exit(1);
  });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`[server] 收到 ${sig}，正在释放资源…`);
    await Promise.allSettled([repo?.close?.(), state?.close?.()]);
    process.exit(0);
  });
}
