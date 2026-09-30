/**
 * V6.0 CR-31：文件存储抽象层（FileRepository）
 *
 * 为什么要抽象而不写死一种：
 *   - 公司服务器 / docker：有本地卷 → LocalDriver；
 *   - Render 免费实例：**无持久磁盘**，落本地会丢文件 → PgDriver（有 DATABASE_URL 时）；
 *   - 有对象存储（腾讯云 COS / R2 / MinIO）→ S3Driver。
 * 驱动优先级：S3_* > DATABASE_URL > local，全部由环境变量判定，业务代码无分支。
 *
 * 元数据与内容分离存储：元数据是「文件身份证」（谁传的、属于哪个业务对象、可否下载），
 * 内容是字节。两者都走同一驱动，避免「元数据在本地、内容在 S3」的撕裂状态。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/* ------------------------------------------------------------------ */
/* 元数据：所有驱动共用的外形                                            */
/* ------------------------------------------------------------------ */

export function newFileMeta({ bizType, bizId, name, ext, size, driver, objectKey, uploadedBy }) {
  const id = `F${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
  return {
    id,
    biz_type: bizType,
    biz_id: bizId,
    name,
    ext,
    size,
    driver,
    object_key: objectKey,
    // 下载地址只暴露 file_id，真实 object_key 不出服务端
    url: `/api/files/${id}`,
    uploaded_by: uploadedBy || '',
    uploaded_at: new Date().toISOString(),
    is_deleted: false,
  };
}

/**
 * object_key 规则：**UUID + 白名单后缀**，绝不使用原始文件名落盘。
 * 原始文件名可能含 ../ 、控制字符、超长路径或中文乱码，直接落盘是路径穿越与覆盖风险。
 */
export function makeObjectKey(bizType, ext) {
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin';
  const day = new Date().toISOString().slice(0, 10);
  return `${bizType.toLowerCase()}/${day}/${randomUUID()}.${safeExt}`;
}

/* ------------------------------------------------------------------ */
/* 驱动 1：本地卷                                                       */
/* ------------------------------------------------------------------ */

class LocalDriver {
  constructor(root) {
    this.name = 'local';
    this.root = root;
    this.indexFile = path.join(root, 'index.json');
  }

  async init() {
    await mkdir(path.join(this.root, 'blobs'), { recursive: true });
    if (!existsSync(this.indexFile)) await writeFile(this.indexFile, '[]', 'utf8');
  }

  async put(key, buf) {
    const abs = path.join(this.root, 'blobs', key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buf);
  }

  async get(key) {
    const abs = path.join(this.root, 'blobs', key);
    // 二次校验解析后的路径仍在 root 之内，防止 key 被外部构造出穿越路径
    if (!abs.startsWith(path.resolve(this.root))) throw new Error('非法 object_key');
    await access(abs);
    return readFile(abs);
  }

  async del(key) {
    await unlink(path.join(this.root, 'blobs', key)).catch(() => undefined);
  }

  async allMeta() {
    return JSON.parse(await readFile(this.indexFile, 'utf8').catch(() => '[]'));
  }

  async writeMeta(meta) {
    const all = await this.allMeta();
    const i = all.findIndex((m) => m.id === meta.id);
    if (i >= 0) all[i] = meta; else all.push(meta);
    await writeFile(this.indexFile, JSON.stringify(all, null, 2), 'utf8');
  }

  async readMeta(id) {
    const all = await this.allMeta();
    return all.find((m) => m.id === id) ?? null;
  }

  async close() {}
}

/* ------------------------------------------------------------------ */
/* 驱动 2：S3 兼容对象存储（AWS SigV4，零依赖手写）                       */
/* ------------------------------------------------------------------ */

const sha256 = async (data) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(data).digest('hex');
};
const hmac = async (key, msg) => {
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', key).update(msg).digest();
};

class S3Driver {
  constructor(cfg) {
    this.name = 's3';
    this.cfg = cfg; // { endpoint, region, bucket, accessKeyId, secretAccessKey, prefix }
    this.base = `${cfg.endpoint.replace(/\/$/, '')}/${cfg.bucket}`;
  }

  objUrl(key) {
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** AWS Signature V4（仅 PUT / GET / DELETE 三种，够用即可） */
  async sign(method, key, payload, contentType = 'application/octet-stream') {
    const { region, accessKeyId, secretAccessKey } = this.cfg;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = `/${this.cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const payloadHash = await sha256(payload);
    const canonicalHeaders = `host:${new URL(this.base).host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(Buffer.from(canonicalRequest))].join('\n');

    let k = Buffer.from(`AWS4${secretAccessKey}`);
    for (const part of [dateStamp, region, 's3', 'aws4_request']) k = await hmac(k, part);
    const signature = (await hmac(k, stringToSign)).toString('hex');

    return {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'Content-Type': contentType,
    };
  }

  async init() {
    // 启动自检：bucket 可达性（用 GET /?list-type=2&max-keys=1 探活）
    const headers = await this.sign('GET', '', Buffer.from(''));
    const res = await fetch(`${this.base}/?list-type=2&max-keys=1`, { headers });
    if (!res.ok) throw new Error(`S3 bucket 不可达（HTTP ${res.status}）：请检查 S3_* 环境变量`);
  }

  async put(key, buf) {
    const headers = await this.sign('PUT', key, buf);
    const res = await fetch(this.objUrl(key), { method: 'PUT', headers, body: buf });
    if (!res.ok) throw new Error(`S3 PUT 失败（HTTP ${res.status}）`);
  }

  async get(key) {
    const headers = await this.sign('GET', key, Buffer.from(''));
    const res = await fetch(this.objUrl(key), { headers });
    if (!res.ok) throw new Error(`S3 GET 失败（HTTP ${res.status}）`);
    return Buffer.from(await res.arrayBuffer());
  }

  async del(key) {
    const headers = await this.sign('DELETE', key, Buffer.from(''));
    await fetch(this.objUrl(key), { method: 'DELETE', headers });
  }

  /** 元数据作为同名 .meta.json 对象存放，随内容一起持久化（无本地盘可用） */
  async allMeta() {
    const headers = await this.sign('GET', `${this.cfg.prefix}/index.json`, Buffer.from(''));
    const res = await fetch(this.objUrl(`${this.cfg.prefix}/index.json`), { headers });
    if (!res.ok) return [];
    return JSON.parse(await res.text());
  }

  async writeMeta(meta) {
    const all = await this.allMeta();
    const i = all.findIndex((m) => m.id === meta.id);
    if (i >= 0) all[i] = meta; else all.push(meta);
    const body = Buffer.from(JSON.stringify(all));
    const key = `${this.cfg.prefix}/index.json`;
    const headers = await this.sign('PUT', key, body, 'application/json');
    const res = await fetch(this.objUrl(key), { method: 'PUT', headers, body });
    if (!res.ok) throw new Error(`S3 元数据写入失败（HTTP ${res.status}）`);
  }

  async readMeta(id) {
    const all = await this.allMeta();
    return all.find((m) => m.id === id) ?? null;
  }

  async close() {}
}

/* ------------------------------------------------------------------ */
/* 驱动 3：PostgreSQL（Render 无持久磁盘场景）                            */
/* ------------------------------------------------------------------ */

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS attachment_file (
  id            TEXT PRIMARY KEY,
  biz_type      TEXT NOT NULL,
  biz_id        TEXT,
  name          TEXT NOT NULL,
  ext           TEXT,
  size          INTEGER,
  driver        TEXT,
  object_key    TEXT NOT NULL,
  content       BYTEA,
  uploaded_by   TEXT,
  uploaded_at   TEXT,
  is_deleted    BOOLEAN DEFAULT FALSE,
  zip_checked   BOOLEAN,
  zip_valid     BOOLEAN,
  zip_missing   TEXT
);
`;

class PgDriver {
  constructor(url, sslmode) {
    this.name = 'pg';
    this.url = url;
    this.sslmode = sslmode;
  }

  async init() {
    // pg 是可选依赖：只有真正要用 PostgreSQL 驱动时才需要装
    let pg;
    try {
      pg = (await import('pg')).default;
    } catch {
      throw new Error('检测到 DATABASE_URL 但缺少 pg 依赖，请执行 `npm i pg` 后重启（或改用 local / s3 驱动）');
    }
    // 只有显式要求才开 SSL：内网 / 本机 PostgreSQL 默认不启用 SSL，硬开会握手失败
    const opts = { connectionString: this.url, max: 5 };
    if (this.sslmode === 'require') opts.ssl = { rejectUnauthorized: false };
    this.pool = new pg.Pool(opts);
    await this.pool.query(PG_SCHEMA);
  }

  async put(key, buf) {
    const r = await this.pool.query('UPDATE attachment_file SET content=$2 WHERE object_key=$1', [key, buf]);
    // 更新 0 行说明元数据行不存在（调用顺序错了）→ 必须报错，否则「上传成功但下载为空」
    if (r.rowCount === 0) {
      throw new Error(`文件内容写入失败：object_key=${key} 无对应元数据行（应先 writeMeta 再 put）`);
    }
  }

  async get(key) {
    const r = await this.pool.query('SELECT content FROM attachment_file WHERE object_key=$1', [key]);
    if (r.rows.length === 0) throw new Error('文件不存在');
    return Buffer.from(r.rows[0].content);
  }

  async del(key) {
    await this.pool.query('UPDATE attachment_file SET content=NULL WHERE object_key=$1', [key]);
  }

  rowToMeta(r) {
    return {
      id: r.id, biz_type: r.biz_type, biz_id: r.biz_id, name: r.name, ext: r.ext, size: r.size,
      driver: r.driver, object_key: r.object_key, url: `/api/files/${r.id}`,
      uploaded_by: r.uploaded_by, uploaded_at: r.uploaded_at, is_deleted: !!r.is_deleted,
      zip_checked: r.zip_checked ?? undefined, zip_valid: r.zip_valid ?? undefined,
      zip_missing: r.zip_missing ? JSON.parse(r.zip_missing) : undefined,
    };
  }

  async writeMeta(meta) {
    await this.pool.query(
      `INSERT INTO attachment_file (id,biz_type,biz_id,name,ext,size,driver,object_key,uploaded_by,uploaded_at,is_deleted,zip_checked,zip_valid,zip_missing)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET is_deleted=EXCLUDED.is_deleted, zip_checked=EXCLUDED.zip_checked,
         zip_valid=EXCLUDED.zip_valid, zip_missing=EXCLUDED.zip_missing`,
      [
        meta.id, meta.biz_type, meta.biz_id, meta.name, meta.ext, meta.size, meta.driver,
        meta.object_key, meta.uploaded_by, meta.uploaded_at, meta.is_deleted,
        meta.zip_checked ?? null, meta.zip_valid ?? null,
        meta.zip_missing ? JSON.stringify(meta.zip_missing) : null,
      ],
    );
  }

  async readMeta(id) {
    const r = await this.pool.query('SELECT * FROM attachment_file WHERE id=$1', [id]);
    return r.rows.length ? this.rowToMeta(r.rows[0]) : null;
  }

  async allMeta() {
    const r = await this.pool.query('SELECT * FROM attachment_file');
    return r.rows.map((x) => this.rowToMeta(x));
  }

  async close() {
    await this.pool?.end().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* 驱动选择：环境变量自动判定，不做硬编码分支                              */
/* ------------------------------------------------------------------ */

export function createFileRepository(env = process.env) {
  const root = env.FILE_STORE_DIR || path.join(process.cwd(), 'server', 'data');

  if (env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return new S3Driver({
      endpoint: env.S3_ENDPOINT || 'https://s3.amazonaws.com',
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      prefix: env.S3_PREFIX || 'wb-files',
    });
  }
  if (env.DATABASE_URL) {
    const sslmode = env.PGSSLMODE || (/sslmode=require/.test(env.DATABASE_URL) ? 'require' : 'disable');
    return new PgDriver(env.DATABASE_URL, sslmode);
  }
  return new LocalDriver(root);
}
