/**
 * 钉钉「角色 / 员工标签」成员反查器
 * ============================================================
 * 为什么要这个脚本：
 *   `contact user get` 只返回「默认」组的标签（主管 / 子管理员 / 主管理员），
 *   企业里另外那 130+ 个角色（区总、分总、客成经理、大区运营、销售主管…）
 *   只有按 labelId 反查成员才能拿到。所以改成「拉全部角色 → 逐角色列成员 → 反建 用户→角色」。
 *
 * 产出：_local/dingtalk-roles.json（**严禁入库**）
 *   结构：{ roles: [{labelId,labelName,count,members:[userId]}], userRoles: {userId:[角色名]} }
 *
 * 断点续传：每个角色的成员写入 _local/roles-cache/<labelId>.json，重跑自动跳过。
 * 触发限流（SENSITIVE_PARAM_CUMULATIVE_EXCEEDED）时自动退避重试，失败的角色记录到 _local/roles-failed.json，
 * 下次重跑只补这些。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const LOCAL = path.join(ROOT, '_local');
const CACHE = path.join(LOCAL, 'roles-cache');
const DWS = process.env.DWS_PATH || 'C:\\Users\\86130\\.local\\bin\\dws.exe';
const ONLY_FAILED = process.argv.includes('--failed');
mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(args, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const out = execFileSync(DWS, [...args, '-f', 'json'], {
        encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 60_000,
      });
      const j = JSON.parse(out);
      if (j.error?.server_error_code === 'SENSITIVE_PARAM_CUMULATIVE_EXCEEDED') {
        throw new Error('SENSITIVE_PARAM_CUMULATIVE_EXCEEDED');
      }
      return j;
    } catch (e) {
      last = e;
      const quota = String(e.message ?? '').includes('SENSITIVE_PARAM');
      sleep(quota ? 15_000 : 3_000);
    }
  }
  throw last;
}

console.log('==> 1. 企业角色清单');
const rolesRaw = run(['contact', '+list-roles']);
const roles = rolesRaw.roles ?? rolesRaw.result ?? [];
console.log(`    ${roles.length} 个角色`);

console.log('==> 2. 逐角色拉成员（带缓存，失败自动退避）');
const failed = [];
const results = [];
let done = 0;
for (const r of roles) {
  const id = String(r.labelId);
  const cacheFile = path.join(CACHE, `${id}.json`);
  // 缓存命中条件：文件在 **且 count > 0**。
  // count=0 一律重拉——既覆盖「真的没人」这种小概率，也能自动修复历史脏缓存（曾把字段名写错过）。
  if (existsSync(cacheFile) && !ONLY_FAILED) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (cached.count > 0) { results.push(cached); continue; }
  }
  try {
    const m = run(['contact', 'label', 'list-members', '--id', id]);
    // 注意：响应字段是 labelUserList[].userInfo.userId（不是 members[]，勿改回）
    const members = (m.labelUserList ?? []).map((x) => String(x.userInfo?.userId ?? '')).filter(Boolean);
    const rec = { labelId: id, labelName: r.labelName, count: members.length, members };
    writeFileSync(cacheFile, JSON.stringify(rec), 'utf8');
    results.push(rec);
    process.stdout.write(`\r    ${++done} 个角色已新拉（累计 ${results.length}/${roles.length}）…`);
    await sleep(200);
  } catch (e) {
    failed.push({ labelId: id, labelName: r.labelName, error: String(e.message ?? e).slice(0, 160) });
    process.stdout.write(`\r    ! ${r.labelName} 失败，稍后可重跑 --failed          `);
  }
}
console.log('');

/* 反建：userId -> 角色名[] */
const userRoles = {};
for (const r of results) for (const uid of r.members) {
  (userRoles[uid] ??= []).push(r.labelName);
}

writeFileSync(path.join(LOCAL, 'dingtalk-roles.json'), JSON.stringify({
  syncedAt: new Date().toISOString(),
  roleCount: results.length,
  roles: results.sort((a, b) => b.count - a.count),
  userRoles,
}, null, 2), 'utf8');
if (failed.length) writeFileSync(path.join(LOCAL, 'roles-failed.json'), JSON.stringify(failed, null, 2), 'utf8');

console.log(`==> 完成：${results.length} 个角色，覆盖 ${Object.keys(userRoles).length} 人`);
console.log(`    失败 ${failed.length} 个${failed.length ? '（见 _local/roles-failed.json，重跑 node scripts/dingtalk-pull-roles.mjs --failed 补）' : ''}`);
console.log('==> 主要角色 TOP20');
for (const r of results.filter((x) => x.count > 0).slice(0, 20)) console.log(`    ${String(r.count).padStart(4)}  ${r.labelName}`);
