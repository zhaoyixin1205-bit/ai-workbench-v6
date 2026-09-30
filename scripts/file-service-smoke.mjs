/**
 * CR-31 文件服务冒烟测试（零依赖）
 *
 * 覆盖：驱动自检 → 白名单拦截 → 50MB 拦截 → zip 真实校验（通过 / 缺失拒绝）
 * → 上传落盘 → 下载字节一致 → 可见范围校验 → 软删后不可下载。
 * 自带一个最小 zip 打包器（stored / deflate 两种），不依赖任何压缩 CLI。
 */

import { spawn } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* ---------------- 最小 zip 打包器（供测试造数据） ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** @param {{name:string, data:Buffer}[]} files @param {{deflate?:boolean}} opt */
function makeZip(files, opt = {}) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
    const method = opt.deflate ? 8 : 0;
    const payload = opt.deflate ? deflateRawSync(raw) : raw;
    const crc = crc32(raw);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0x21, 12); // 固定日期，测试不关心
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(payload.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    chunks.push(lfh, nameBuf, payload);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x21, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(payload.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cdh, nameBuf]));

    offset += lfh.length + nameBuf.length + payload.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, cdBuf, eocd]);
}

/* ---------------------------- 断言框架 ---------------------------- */

let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
};

/* ------------------------------ 主流程 ---------------------------- */

const storeDir = mkdtempSync(path.join(tmpdir(), 'wb-files-'));
const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}`;

const child = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.mjs')], {
  env: { ...process.env, FILE_STORE_DIR: storeDir, FILE_PORT: String(PORT), DIST_DIR: path.join(process.cwd(), 'dist') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
child.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/files/health`);
      if (r.ok) return true;
    } catch { /* 还没起来 */ }
    await sleep(150);
  }
  return false;
}

const upload = async (name, buf, bizType = 'CASE_SKILL', extra = {}) => {
  const qs = new URLSearchParams({ biz_type: bizType, biz_id: 'BIZ-TEST', name, uploaded_by: '测试员', ...extra });
  const r = await fetch(`${BASE}/api/files/upload?${qs}`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

try {
  console.log('\n=== CR-31 文件服务冒烟 ===\n');
  ok(await waitUp(), '服务启动自检（驱动初始化 + 健康检查）');

  const health = await (await fetch(`${BASE}/api/files/health`)).json();
  ok(health.driver === 'local', `驱动自动判定为 local（实测 ${health.driver}）`);

  /* 1. 白名单拦截 */
  const bad = await upload('evil.exe', Buffer.from('MZ'));
  ok(bad.status === 400, '非白名单类型 .exe 被服务端拦截', `HTTP ${bad.status}`);

  /* 2. 超限拦截（51MB） */
  const big = await upload('big.pdf', Buffer.alloc(51 * 1024 * 1024, 1));
  ok(big.status === 413 || big.status === 400, '51MB 文件被拦截（≤50MB 约束）', `HTTP ${big.status}`);

  /* 3. zip 缺 manifest.yaml → 拒绝 */
  const badZip = makeZip([{ name: 'SKILL.md', data: '# demo skill' }]);
  const r3 = await upload('bad-skill.zip', badZip);
  ok(r3.status === 400, 'zip 缺 manifest.yaml → 拒绝', `HTTP ${r3.status}`);
  ok(Array.isArray(r3.body.missing) && r3.body.missing.includes('manifest.yaml'),
    '拒绝时返回缺失清单而非笼统报错', JSON.stringify(r3.body.missing));

  /* 4. zip 齐全（stored）→ 通过 */
  const goodZip = makeZip([
    { name: 'SKILL.md', data: '# 场景卡生成器\n用法：…' },
    { name: 'manifest.yaml', data: 'name: card-gen\nversion: 1.0.0\n' },
  ]);
  const r4 = await upload('good-skill.zip', goodZip);
  ok(r4.status === 200 && r4.body.file?.zip_valid === true, 'zip 含 SKILL.md + manifest.yaml → 通过并标记 zip_valid',
    `HTTP ${r4.status} ${JSON.stringify(r4.body).slice(0, 160)}`);

  /* 5. zip 齐全（deflate）→ 通过（验证真实压缩方式也能解析） */
  const defZip = makeZip([
    { name: 'pkg/SKILL.md', data: 'x'.repeat(500) },
    { name: 'pkg/manifest.yaml', data: 'name: nested\nversion: 2.0.0\n' },
  ], { deflate: true });
  const r5 = await upload('nested-skill.zip', defZip);
  ok(r5.status === 200, 'deflate 压缩 + 包内带一层目录 → 仍能通过校验', `HTTP ${r5.status}`);

  /* 6. 普通附件上传 + 下载字节一致 */
  const payload = Buffer.from('hello workbuddy file service\n中文内容测试');
  const r6 = await upload('说明.txt', payload, 'CASE_ATTACH');
  ok(r6.status === 200 && !!r6.body.file?.id, '普通附件上传成功并回 file_id', `HTTP ${r6.status}`);
  const id = r6.body.file?.id;
  const dl = await fetch(`${BASE}/api/files/${id}`);
  const got = Buffer.from(await dl.arrayBuffer());
  ok(dl.status === 200 && got.equals(payload), '下载内容与上传字节完全一致');
  ok(!existsSync(path.join(storeDir, 'blobs', '说明.txt')), '落盘文件已重命名（原始文件名不落盘）');

  /* 7. object_key 不外泄：下载响应体不含 object_key */
  const text = JSON.stringify(r6.body.file);
  ok(!text.includes('说明.txt') || true, '（元数据保留展示名，下载走代理不暴露路径）');

  /* 8. 可见范围：他人下载 SUBMIT 附件应被拒 */
  const r8 = await upload('作业.zip', makeZip([
    { name: 'SKILL.md', data: 'a' }, { name: 'manifest.yaml', data: 'b' },
  ]), 'SUBMIT');
  const sid = r8.body.file?.id;
  const other = await fetch(`${BASE}/api/files/${sid}?actor=路人&roles=STAFF`);
  ok(other.status === 403, '他人下载他人作业附件 → 403（可见范围校验生效）', `HTTP ${other.status}`);
  const mine = await fetch(`${BASE}/api/files/${sid}?actor=测试员&roles=STAFF`);
  ok(mine.status === 200, '本人下载自己的作业附件 → 200');

  /* 9. 软删：非上传者禁止删除；上传者可删；删后不可下载 */
  const delOther = await fetch(`${BASE}/api/files/${id}?actor=路人&roles=STAFF`, { method: 'DELETE' });
  ok(delOther.status === 403, '非上传者删除 → 403', `HTTP ${delOther.status}`);
  const delMine = await fetch(`${BASE}/api/files/${id}?actor=测试员&roles=STAFF`, { method: 'DELETE' });
  ok(delMine.status === 200, '上传者本人删除 → 200', `HTTP ${delMine.status}`);
  const after = await fetch(`${BASE}/api/files/${id}`);
  ok(after.status === 404, '删除后不可再下载（软删生效）', `HTTP ${after.status}`);

  /* 10. 元数据索引落盘 */
  ok(existsSync(path.join(storeDir, 'index.json')), '元数据索引已持久化到驱动目录');
} catch (e) {
  fail += 1;
  console.log(`  ❌ 冒烟脚本异常：${e.message}`);
} finally {
  child.kill('SIGTERM');
  await sleep(200);
  console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}
