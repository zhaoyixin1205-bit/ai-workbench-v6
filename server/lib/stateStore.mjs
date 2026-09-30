/**
 * V6.1：业务数据持久化（替换前端 localStorage，实现多人共享）
 *
 * 为什么用「整包 JSONB + 乐观锁」而不是按集合拆表：
 *   前端数据层本来就是一个完整 DB 对象（~40 个集合），所有页面直接读写 db.xxx。
 *   按集合拆表要把每个写入点改成 REST 调用，改动面覆盖 31 个页面，回归成本不可控；
 *   整包方案只需把「持久化目标」从 localStorage 换成这里，业务代码一行不动，
 *   同时用 version 乐观锁把 last-write-wins 的静默覆盖变成「明确冲突 + 提示刷新」。
 *
 * 存储选择：DATABASE_URL 存在 → PostgreSQL；否则 → 本地 JSON 文件。
 * 后者保证「没装数据库也能跑」，与 CR-31 文件服务的驱动自适应保持同一套设计哲学。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS app_state (
  id          SMALLINT PRIMARY KEY DEFAULT 1,
  data        JSONB NOT NULL,
  version     BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);
INSERT INTO app_state (id, data, version) VALUES (1, '{}'::jsonb, 0) ON CONFLICT (id) DO NOTHING;
`;

/* ------------------------------------------------------------------ */
/* 驱动 1：PostgreSQL（生产 / 多人共享）                                  */
/* ------------------------------------------------------------------ */

class PgStateStore {
  constructor(url, sslmode) {
    this.name = 'pg';
    this.url = url;
    this.sslmode = sslmode;
  }

  async init() {
    let pg;
    try {
      pg = (await import('pg')).default;
    } catch {
      throw new Error('检测到 DATABASE_URL 但缺少 pg 依赖，请执行 `npm i pg` 后重启（或去掉 DATABASE_URL 走本地文件存储）');
    }
    const opts = { connectionString: this.url, max: 5 };
    if (this.sslmode === 'require') opts.ssl = { rejectUnauthorized: false };
    this.pool = new pg.Pool(opts);
    await this.pool.query(PG_SCHEMA);
  }

  async read() {
    const r = await this.pool.query('SELECT data, version, updated_at, updated_by FROM app_state WHERE id=1');
    if (r.rows.length === 0) return { data: null, version: 0, updated_at: null, updated_by: null };
    const row = r.rows[0];
    return {
      data: row.data,
      version: Number(row.version),
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      updated_by: row.updated_by || '',
    };
  }

  /**
   * 乐观锁写入：baseVersion 与库中 version 一致才写入并把 version+1。
   * 不一致说明期间有人改过 —— 拒绝写入并返回当前最新，由前端决定「刷新」还是「放弃」。
   * 用单条带 WHERE 的 UPDATE 而不是「先读再写」，避免并发下两人都通过校验。
   */
  async write(data, baseVersion, by) {
    const r = await this.pool.query(
      `UPDATE app_state SET data=$2::jsonb, version=version+1, updated_at=now(), updated_by=$3
       WHERE id=1 AND version=$1
       RETURNING version`,
      [Number(baseVersion) || 0, JSON.stringify(data), by || ''],
    );
    if (r.rowCount === 0) {
      const cur = await this.read();
      return { ok: false, conflict: true, current: cur };
    }
    return { ok: true, version: Number(r.rows[0].version) };
  }

  /** 仅取版本号，供前端高频轮询（不传全量数据，省带宽） */
  async version() {
    const r = await this.pool.query('SELECT version, updated_by, updated_at FROM app_state WHERE id=1');
    if (r.rows.length === 0) return { version: 0, updated_by: '', updated_at: null };
    return {
      version: Number(r.rows[0].version),
      updated_by: r.rows[0].updated_by || '',
      updated_at: r.rows[0].updated_at ? r.rows[0].updated_at.toISOString() : null,
    };
  }

  async reset(seedData, by) {
    await this.pool.query(
      `UPDATE app_state SET data=$1::jsonb, version=version+1, updated_at=now(), updated_by=$2 WHERE id=1`,
      [JSON.stringify(seedData), by || ''],
    );
    return this.read();
  }

  async close() {
    await this.pool?.end().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* 驱动 2：本地 JSON 文件（无数据库时的等价回退）                          */
/* ------------------------------------------------------------------ */

class FileStateStore {
  constructor(file) {
    this.name = 'file';
    this.file = file;
  }

  async init() {
    await mkdir(path.dirname(this.file), { recursive: true });
    if (!existsSync(this.file)) {
      await writeFile(this.file, JSON.stringify({ data: null, version: 0, updated_by: '', updated_at: null }), 'utf8');
    }
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      return { data: null, version: 0, updated_by: '', updated_at: null };
    }
  }

  async version() {
    const s = await this.read();
    return { version: Number(s.version) || 0, updated_by: s.updated_by || '', updated_at: s.updated_at || null };
  }

  async write(data, baseVersion, by) {
    const cur = await this.read();
    const curV = Number(cur.version) || 0;
    // 单进程内串行即可；文件模式只服务单实例本地演示，不做跨进程并发保证
    if (Number(baseVersion) !== curV) {
      return { ok: false, conflict: true, current: cur };
    }
    const next = { data, version: curV + 1, updated_by: by || '', updated_at: new Date().toISOString() };
    await writeFile(this.file, JSON.stringify(next), 'utf8');
    return { ok: true, version: next.version };
  }

  async reset(seedData, by) {
    const cur = await this.read();
    const next = {
      data: seedData,
      version: (Number(cur.version) || 0) + 1,
      updated_by: by || '',
      updated_at: new Date().toISOString(),
    };
    await writeFile(this.file, JSON.stringify(next), 'utf8');
    return this.read();
  }

  async close() {}
}

/* ------------------------------------------------------------------ */

export function createStateStore(env = process.env) {
  if (env.DATABASE_URL) {
    const sslmode = env.PGSSLMODE || (/sslmode=require/.test(env.DATABASE_URL) ? 'require' : 'disable');
    return new PgStateStore(env.DATABASE_URL, sslmode);
  }
  const file = env.STATE_FILE || path.join(process.cwd(), 'server', 'data', 'state.json');
  return new FileStateStore(file);
}
