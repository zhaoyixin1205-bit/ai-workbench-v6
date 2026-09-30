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
 * 可见范围校验（简化但真实的口径）：
 * SUBMIT / BOUNTY_SOLUTION 属于个人交付物，仅上传者本人与组织者 / 管理员可下载；
 * CASE_* 属于公开内容，登录态即可下载。
 * 目的：避免「拿到链接就能下别人的作业」。
 */
function canDownload(meta, actor) {
  if (!meta) return false;
  if (meta.biz_type === 'CASE_SKILL' || meta.biz_type === 'CASE_ATTACH') return true;
  return meta.uploaded_by === actor?.name || actor?.roles?.includes('ORGANIZER') || actor?.roles?.includes('ADMIN');
}

/* ----------------------------- 路由 ----------------------------- */

let repo;
let state;

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

  // 读取全量。data 为 null 表示「服务端还没有数据」，前端用种子播种后写回。
  if (pathname === '/api/state' && req.method === 'GET') {
    const s = await state.read();
    return sendJson(res, 200, {
      ok: true,
      data: s.data,
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
    const r = await state.write(payload.data, payload.baseVersion, payload.by);
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

  // 清空服务端数据：下一次拉取时前端用种子重新播种（演示环境一键复原）
  if (pathname === '/api/state/reset' && req.method === 'POST') {
    let by = '';
    try {
      const read = await readBody(req, 1024);
      by = JSON.parse(read.buf.toString('utf8') || '{}').by || '';
    } catch { /* 没有 body 也算合法 */ }
    await state.reset(null, by);
    return sendJson(res, 200, { ok: true, message: '已清空服务端数据，刷新后按种子重新初始化' });
  }

  /* ---- 上传：POST /api/files/upload?biz_type=&biz_id=&name=&uploaded_by= ---- */
  if (pathname === '/api/files/upload' && req.method === 'POST') {
    const q = url.searchParams;
    const bizType = q.get('biz_type') || '';
    const bizId = q.get('biz_id') || '';
    const name = q.get('name') || 'unnamed';
    const uploadedBy = q.get('uploaded_by') || '';
    const roles = (q.get('roles') || '').split(',').filter(Boolean);

    if (!['CASE_SKILL', 'CASE_ATTACH', 'SUBMIT', 'BOUNTY_SOLUTION'].includes(bizType)) {
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

    if (req.method === 'DELETE') {
      const actor = { name: url.searchParams.get('actor') || '', roles: (url.searchParams.get('roles') || '').split(',').filter(Boolean) };
      const allowed = meta.uploaded_by === actor.name || actor.roles.includes('ORGANIZER') || actor.roles.includes('ADMIN');
      if (!allowed) return sendJson(res, 403, { ok: false, error: '仅上传者本人 / 组织者 / 管理员可删除' });
      meta.is_deleted = true;
      await repo.writeMeta(meta);
      await repo.del(meta.object_key).catch(() => undefined);
      return sendJson(res, 200, { ok: true, id });
    }

    if (req.method === 'GET') {
      const actor = { name: url.searchParams.get('actor') || '', roles: (url.searchParams.get('roles') || '').split(',').filter(Boolean) };
      if (!canDownload(meta, actor)) {
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
