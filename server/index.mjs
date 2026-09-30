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
import { validateSkillZip } from './lib/zip.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.DIST_DIR || path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.FILE_PORT || process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

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
      maxBytes: MAX_BYTES,
      allowExt: [...ALLOW_EXT],
      now: new Date().toISOString(),
    });
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
      await repo.put(key, buf);
      await repo.writeMeta(meta);
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
repo
  .init()
  .then(() => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch((e) => {
        console.error('[files] 处理失败：', e.message);
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: e.message });
      });
    });
    server.listen(PORT, HOST, () => {
      console.log(`[files] 文件服务已启动: http://localhost:${PORT}  (内网 http://<本机IP>:${PORT})`);
      console.log(`[files] 存储驱动: ${repo.name}`);
      console.log(`[files] 静态资源: ${DIST}`);
      console.log(`[files] 限制: ≤50MB · 白名单 ${[...ALLOW_EXT].join('/')}`);
    });
  })
  .catch((e) => {
    // fail-fast：驱动起不来就不监听端口，避免前端探测到「活着但全是 500」
    console.error(`[files] 文件服务启动失败（驱动 ${repo?.name}）：${e.message}`);
    process.exit(1);
  });
