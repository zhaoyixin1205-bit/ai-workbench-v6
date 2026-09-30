/**
 * V6.0 页面级路由守卫回归脚本
 *
 * 用途：直接复用 src/auth/access.ts（唯一真源）跑断言，不复制一份判定逻辑，
 * 避免「测试里的口径」和「代码里的口径」漂移。
 *
 * 运行：node scripts/guard-regression.mjs
 * 退出码：0 = 全绿；1 = 有失败（失败项会逐条打印）
 *
 * 覆盖三组断言：
 *   A. 既有 191 项等价性 —— V6.0 开关全关时，所有 V5.0 路由的判定结果必须与基线完全一致
 *   B. V6.0 收窄组合 —— 三板块 / /team / /clinic/workbench 的双向验证（有权限必进 / 无权限必 403）
 *   C. 开关等价性 —— 每个新增开关关闭后，对应能力必须消失（不留残留）
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

/* ---------- 加载守卫表（同一份源码，不复制逻辑） ---------- */
const out = join(mkdtempSync(join(tmpdir(), 'guard-')), 'access.cjs');
buildSync({
  entryPoints: ['src/auth/access.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: out,
  logLevel: 'silent',
});
const { ADMIN_ACCESS, C_ACCESS, checkAdminAccess, checkCAccess, checkAccess } = require(out);

/**
 * V5.0 基线表：由当前表派生 —— 抹掉 V6.0 新增的 convergedRoles / requireDeptLeader，
 * 并移除 V6.0 新增路由条目。这样「基线」不是手写第二份口径，不会与代码漂移。
 */
const stripV6 = (a) => {
  const { convergedRoles, requireDeptLeader, ...rest } = a;
  return rest;
};
const ADMIN_V5 = ADMIN_ACCESS.map(stripV6);
const C_V5 = C_ACCESS
  .filter((a) => a.key !== '/team' && a.key !== '/clinic/workbench')
  .map(stripV6);

/* ---------- 身份矩阵（8 类角色 × 是否部门负责人） ---------- */
const ROLES = ['MEMBER', 'LEADER', 'JUDGE', 'EXPERT', 'ORGANIZER', 'SKILL_ADMIN', 'ADMIN', 'VIEWER'];

/** V6.0 默认开关（新增能力默认 ON） */
const FLAGS_V6 = {
  community: true, shop: true, clinic: true, wbAdmin: true,
  adminCoreConverge: true, teamView: true,
};
/** V5.0 基线开关：新增开关全关 */
const FLAGS_V5 = {
  community: true, shop: true, clinic: true, wbAdmin: true,
  adminCoreConverge: false, teamView: false,
};

/** V5.0 既有路由清单（不含 V6.0 新增的 /clinic/workbench 与 /team） */
const V5_ROUTES = [
  ...ADMIN_ACCESS.map((a) => a.key),
  ...C_ACCESS.filter((a) => a.key !== '/team' && a.key !== '/clinic/workbench').map((a) => a.key),
];

const results = [];
const check = (name, fn) => {
  try {
    const r = fn();
    results.push({ name, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (e) {
    results.push({ name, ok: false, detail: `EXCEPTION ${e.message}` });
  }
};

const judge = (path, subject) => (path.startsWith('/admin')
  ? checkAdminAccess(path, subject)
  : checkCAccess(path, subject));

/* ---------- A. 既有 191 项等价性：V6.0 开关全关 ≡ V5.0 基线 ---------- */
let equivalenceCount = 0;
for (const path of V5_ROUTES) {
  for (const role of ROLES) {
    for (const isDeptLeader of [false, true]) {
      equivalenceCount += 1;
      check(`[等价性] ${path} · ${role}${isDeptLeader ? '(负责人)' : ''} 开关关闭后与基线一致`, () => {
        /** 实测：V6.0 守卫表 + 新增开关全关 */
        const got = judge(path, { roles: [role], flags: { ...FLAGS_V5 }, isDeptLeader }).ok;
        /** 基线：V5.0 守卫表（无收窄字段、无新增路由） */
        const base = checkAccess(
          path,
          { roles: [role], flags: { ...FLAGS_V5 }, isDeptLeader },
          path.startsWith('/admin') ? ADMIN_V5 : C_V5
        ).ok;
        return got === base || `got=${got} base=${base}`;
      });
    }
  }
}

/* ---------- B1. 收窄三板块（adminCoreConverge = ON） ---------- */
const CONVERGED = ['/admin/assignment', '/admin/scorecard', '/admin/bounty'];
for (const path of CONVERGED) {
  for (const role of ROLES) {
    const shouldPass = role === 'ORGANIZER' || role === 'ADMIN';
    check(`[收窄] ${path} · ${role} ${shouldPass ? '必须可进' : '必须 403'}`, () => {
      const r = checkAdminAccess(path, { roles: [role], flags: { ...FLAGS_V6 } });
      return r.ok === shouldPass || `ok=${r.ok}`;
    });
  }
  /** 开关关闭后必须回到 V5.0 宽口径：LEADER / EXPERT / SKILL_ADMIN 可进 */
  for (const role of ['LEADER', 'EXPERT', 'SKILL_ADMIN']) {
    check(`[回滚] ${path} · ${role} 关闭收窄开关后恢复可进`, () => {
      const r = checkAdminAccess(path, { roles: [role], flags: { ...FLAGS_V5 } });
      return r.ok === true || `ok=${r.ok}`;
    });
  }
  /** 403 必须带限制依据（三件套之一） */
  check(`[403] ${path} · MEMBER 的拒绝结果带限制依据`, () => {
    const r = checkAdminAccess(path, { roles: ['MEMBER'], flags: { ...FLAGS_V6 } });
    return (!r.ok && !!r.access.reason) || '缺少 reason';
  });
}

/* ---------- B2. /team 仅部门负责人 ---------- */
for (const role of ROLES) {
  check(`[团队视图] /team · ${role} 非负责人必须 403`, () => {
    const r = checkCAccess('/team', { roles: [role], flags: { ...FLAGS_V6 }, isDeptLeader: false });
    return r.ok === false || '非负责人不应可进';
  });
  check(`[团队视图] /team · ${role} 负责人必须可进（开关开启）`, () => {
    const r = checkCAccess('/team', { roles: [role], flags: { ...FLAGS_V6 }, isDeptLeader: true });
    return r.ok === true || '负责人应可进';
  });
  check(`[开关] /team · ${role} teamView 关闭后不可进`, () => {
    const r = checkCAccess('/team', { roles: [role], flags: { ...FLAGS_V5 }, isDeptLeader: true });
    return r.ok === false || '开关关闭后不应可进';
  });
}

/* ---------- B3. /clinic/workbench 仅问诊专家 ---------- */
for (const role of ROLES) {
  const shouldPass = role === 'EXPERT';
  check(`[专家工作台] /clinic/workbench · ${role} ${shouldPass ? '必须可进' : '必须 403'}`, () => {
    const r = checkCAccess('/clinic/workbench', { roles: [role], flags: { ...FLAGS_V6 } });
    return r.ok === shouldPass || `ok=${r.ok}`;
  });
}
check('[专家工作台] clinic 开关关闭后不可进', () => {
  const r = checkCAccess('/clinic/workbench', {
    roles: ['EXPERT'],
    flags: { ...FLAGS_V6, clinic: false },
  });
  return r.ok === false || '开关关闭后不应可进';
});

/* ---------- B4. V7.0 CR-32：/judge（C 端评委评分）仅评委可进 ---------- */
for (const role of ROLES) {
  const shouldPass = role === 'JUDGE';
  check(`[评委评分] /judge · ${role} ${shouldPass ? '必须可进' : '必须 403'}`, () => {
    const r = checkCAccess('/judge', { roles: [role], flags: { ...FLAGS_V6, cJudgeEntry: true } });
    return r.ok === shouldPass || `ok=${r.ok}`;
  });
  check(`[开关] /judge · ${role} cJudgeEntry 关闭后不可进`, () => {
    const r = checkCAccess('/judge', { roles: [role], flags: { ...FLAGS_V6, cJudgeEntry: false } });
    return r.ok === false || '开关关闭后不应可进';
  });
  /** 403 必须带限制依据 */
  if (!shouldPass) {
    check(`[403] /judge · ${role} 的拒绝结果带限制依据`, () => {
      const r = checkCAccess('/judge', { roles: [role], flags: { ...FLAGS_V6, cJudgeEntry: true } });
      return (!r.ok && !!r.access.reason) || '缺少 reason';
    });
  }
}

/* ---------- C. 开关等价性：V6.0 全开 vs 全关，新增路由必须消失 ---------- */
const NEW_ROUTES = ['/team', '/clinic/workbench'];
for (const path of NEW_ROUTES) {
  check(`[等价性] ${path} 在 V5.0 开关下不可达（无残留入口）`, () => {
    const r = judge(path, { roles: ['ADMIN'], flags: { ...FLAGS_V5 }, isDeptLeader: true });
    return r.ok === false || 'V5.0 开关下不应可达';
  });
}

/* ---------- 汇总 ---------- */
const failed = results.filter((r) => !r.ok);
console.log(`\n守卫回归：共 ${results.length} 项断言（其中等价性 ${equivalenceCount} 项）`);
console.log(`通过 ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('\n失败项：');
  failed.slice(0, 40).forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
  process.exit(1);
}
console.log('✅ 全绿');
