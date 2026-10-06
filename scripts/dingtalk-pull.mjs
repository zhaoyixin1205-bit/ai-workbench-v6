/**
 * 钉钉通讯录实时拉取器（本机运行，走 dws CLI 已登录凭证，密钥不出本机）
 * ============================================================
 * 产出：_local/dingtalk-contacts.json（**严禁入库**，已在 .gitignore 忽略）
 *
 * 用法：
 *   node scripts/dingtalk-pull.mjs                 # 全公司（根部门 1）
 *   ROOT_DEPT=916783165 node scripts/dingtalk-pull.mjs   # 只拉某子树
 *
 * 为什么不用浏览器直连钉钉：
 *   oapi.dingtalk.com 不返回 CORS 头，同源策略必拦（详见 V4.3 结论）。
 *   dws CLI 已用 OAuth 登录本机账号，直接由 Node 调用即可。
 *
 * 已知约束（勿改，改了会漏数据）：
 *   1) `dept list-members` 只返回**本部门直接成员**，不含下级 —— 必须配合递归部门树全量枚举；
 *   2) 该命令返回体**不带 deptId 归属**，所以改为最后用 `user get` 取每个用户的权威 depts；
 *   3) `--depts` 支持逗号批量，实测 25 个/次稳定；`user get --ids` 实测 20 个/次稳定。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT_DIR = path.join(ROOT, '_local');
const OUT_FILE = path.join(OUT_DIR, 'dingtalk-contacts.json');

const DWS = process.env.DWS_PATH || 'C:\\Users\\86130\\.local\\bin\\dws.exe';
const ROOT_DEPT = process.env.ROOT_DEPT || '1';
const DEPT_BATCH = Number(process.env.DEPT_BATCH || 25);
const USER_BATCH = Number(process.env.USER_BATCH || 20);
/** 历史快照（含 unionId / 头像），用于按工号回填；不存在则跳过 */
const LEGACY = process.env.LEGACY_CONTACTS
  || path.join(ROOT, '..', '..', 'ai-workbench-repo', '05-dingtalk-sync', 'contacts.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(args, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const out = execFileSync(DWS, [...args, '-f', 'json'], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        timeout: 60_000,
      });
      return JSON.parse(out);
    } catch (e) {
      last = e;
      if (i < tries - 1) { /* 网络抖动退避 */ }
    }
  }
  throw new Error(`dws 调用失败：${args.join(' ')} -> ${last?.message ?? last}`);
}

/* ---------- 1. 递归部门树 ---------- */
async function pullDepts() {
  const list = [];
  const seen = new Set();
  // 根部门名单独取一次；其余部门的名称在父部门的 list-children 里就带回来了
  const rootInfo = run(['contact', 'dept', 'get-info', '--dept-id', ROOT_DEPT]);
  const queue = [{ id: ROOT_DEPT, parent: '0', name: rootInfo.result.deptName }];
  while (queue.length) {
    const node = queue.shift();
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    const rec = { dept_id: String(node.id), parent_id: String(node.parent), name: node.name, path: '' };
    list.push(rec);
    let kids = [];
    try {
      const r = run(['contact', 'dept', 'list-children', '--dept-id', node.id]);
      kids = r.result ?? r.depts ?? [];
    } catch (e) {
      console.warn(`\n  ! 部门 ${node.id}(${node.name}) 子部门拉取失败，跳过：${e.message}`);
    }
    for (const k of kids) {
      queue.push({ id: String(k.deptId), parent: String(node.id), name: k.deptName });
    }
    process.stdout.write(`\r  部门树 ${list.length} 个…`);
    await sleep(30);
  }
  // path 由父链推导（不用 deptPathName：钉钉用 '-' 拼接，部门名里本身可能含 '-'）
  const byId = new Map(list.map((d) => [d.dept_id, d]));
  for (const d of list) {
    const chain = [];
    let cur = d;
    let guard = 0;
    while (cur && guard++ < 20) { chain.unshift(cur.name); cur = cur.parent_id === '0' ? null : byId.get(cur.parent_id); }
    d.path = chain.join('/');
    d.level = chain.length;
  }
  console.log('');
  return list;
}

/* ---------- 2. 部门成员发现（只为拿到 userId 全集，归属以 user get 为准） ---------- */
async function pullMembers(depts) {
  const map = new Map(); // userId -> name
  for (let i = 0; i < depts.length; i += DEPT_BATCH) {
    const chunk = depts.slice(i, i + DEPT_BATCH).map((d) => d.dept_id).join(',');
    let r;
    try {
      r = run(['contact', 'dept', 'list-members', '--depts', chunk]);
    } catch (e) {
      console.warn(`  ! 成员批次 ${i} 失败：${e.message}`);
      continue;
    }
    for (const it of r.deptUserList ?? []) {
      const id = String(it.userInfo?.userId ?? '');
      if (id) map.set(id, it.userInfo?.name ?? '');
    }
    process.stdout.write(`\r  成员发现 ${map.size} 人（${Math.min(i + DEPT_BATCH, depts.length)}/${depts.length} 部门）…`);
    await sleep(30);
  }
  console.log('');
  return map;
}

/* ---------- 3. 用户详情（职位 / 工号 / 角色标签 / 部门 / 主管） ---------- */
async function pullUsers(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += USER_BATCH) {
    const chunk = ids.slice(i, i + USER_BATCH).join(',');
    let r;
    try {
      r = run(['contact', 'user', 'get', '--ids', chunk]);
    } catch (e) {
      console.warn(`  ! 用户批次 ${i} 失败：${e.message}`);
      continue;
    }
    for (const it of r.result ?? []) {
      const m = it.orgEmployeeModel ?? {};
      out.push({
        userId: String(m.orgUserId ?? ''),
        name: m.orgUserName ?? '',
        jobNumber: m.jobNumber ?? '',
        title: m.orgTitle ?? '',
        email: m.orgAuthEmail ?? '',
        isAdmin: !!it.isAdmin,
        managerName: m.orgMasterDisplayName ?? null,
        deptIds: (m.depts ?? []).map((d) => String(d.deptId)),
        deptPaths: (m.depts ?? []).map((d) => String(d.deptPathName ?? '')),
        labels: (m.labels ?? []).map((l) => l.name),
      });
    }
    process.stdout.write(`\r  用户详情 ${out.length}/${ids.length}…`);
    await sleep(30);
  }
  console.log('');
  return out;
}

/* ---------- main ---------- */
const t0 = Date.now();
const RESUME = process.argv.includes('--resume') && existsSync(OUT_FILE);
let prev = null;
if (RESUME) {
  prev = JSON.parse(readFileSync(OUT_FILE, 'utf8'));
  console.log(`==> 续传模式：已有 ${prev.users.length} 人 / ${prev.depts.length} 部门，只补缺口`);
}

console.log('==> 1. 拉取部门树');
const depts = RESUME ? prev.depts : await pullDepts();
console.log(`    部门 ${depts.length} 个`);

console.log('==> 2. 枚举成员 userId');
const members = await pullMembers(depts);
console.log(`    发现 ${members.size} 人`);

const known = new Set((prev?.users ?? []).map((u) => u.userId));
const missing = [...members.keys()].filter((id) => !known.has(id));
console.log(`    其中未入库 ${missing.length} 人`);

console.log('==> 3. 拉取用户详情（含钉钉角色标签）');
const fresh = await pullUsers(missing);
const users = [...(prev?.users ?? []), ...fresh];

/* 回填 unionId / 头像：按工号 join 历史快照 */
let legacy = null;
try {
  const { readFileSync } = await import('node:fs');
  legacy = JSON.parse(readFileSync(LEGACY, 'utf8'));
  console.log(`    历史快照命中（${legacy.users.length} 人，${legacy.syncedAt}）`);
} catch {
  console.log('    无历史快照，unionId 回退为钉钉 userId');
}
const byJob = new Map();
const byName = new Map();
if (legacy) {
  for (const u of legacy.users) {
    if (u.employeeNo) byJob.set(String(u.employeeNo).toUpperCase(), u);
    if (u.name && !byName.has(u.name)) byName.set(u.name, u);
  }
}
let hitJob = 0; let hitName = 0;
for (const u of users) {
  const l = (u.jobNumber && byJob.get(String(u.jobNumber).toUpperCase())) || null;
  if (l) { hitJob++; u.unionId = l.unionId; u.avatar = l.avatar ?? ''; }
  else {
    const l2 = byName.get(u.name);
    if (l2) { hitName++; u.unionId = l2.unionId; u.avatar = l2.avatar ?? ''; }
    else { u.unionId = `dt_${u.userId}`; u.avatar = ''; }
  }
}
console.log(`    unionId 回填：工号 ${hitJob} + 姓名 ${hitName}，兜底 ${users.length - hitJob - hitName}`);

mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  syncedAt: new Date().toISOString(),
  rootDeptId: ROOT_DEPT,
  stats: {
    deptCount: depts.length,
    userCount: users.length,
    durationMs: Date.now() - t0,
  },
  depts,
  users,
};
writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
console.log(`==> 完成 → ${OUT_FILE}`);
console.log(`    部门 ${depts.length} / 用户 ${users.length} / 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
