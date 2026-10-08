/**
 * V8.6-10.08 口径注解可见性冒烟（纯函数层）
 *
 * 锁的口径：口径 / 规则 / 实现注解只给「组织者 / 技能管理员 / 系统管理员」看，
 * 其余角色（成员 / 负责人 / 评委 / 专家 / 观众）一律不展示。
 * 这里只验判定函数，渲染层是否有条件包裹由 guard / 人工截图兜底。
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(mkdtempSync(join(tmpdir(), 'wbnote-')), 'noteRoles.cjs');
buildSync({ entryPoints: ['src/auth/noteRoles.ts'], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
const { isNoteRole, NOTE_ROLES } = require(out);

let pass = 0;
const fails = [];

function ok(name, cond) {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name}`); }
}

console.log('口径注解可见性冒烟');

// A. 白名单本身
ok('A1 白名单恰好三个角色', NOTE_ROLES.length === 3);
ok('A2 含 ORGANIZER', NOTE_ROLES.includes('ORGANIZER'));
ok('A3 含 SKILL_ADMIN', NOTE_ROLES.includes('SKILL_ADMIN'));
ok('A4 含 ADMIN', NOTE_ROLES.includes('ADMIN'));

// B. 放行项
ok('B1 组织者可见', isNoteRole(['ORGANIZER']) === true);
ok('B2 技能管理员可见', isNoteRole(['SKILL_ADMIN']) === true);
ok('B3 系统管理员可见', isNoteRole(['ADMIN']) === true);
ok('B4 多角色含管理员 → 可见', isNoteRole(['MEMBER', 'ADMIN']) === true);
ok('B5 多角色含评委+组织者 → 可见', isNoteRole(['JUDGE', 'ORGANIZER']) === true);

// C. 拦截项
ok('C1 普通成员不可见', isNoteRole(['MEMBER']) === false);
ok('C2 负责人不可见', isNoteRole(['LEADER']) === false);
ok('C3 评委不可见', isNoteRole(['JUDGE']) === false);
ok('C4 专家不可见', isNoteRole(['EXPERT']) === false);
ok('C5 观众不可见', isNoteRole(['VIEWER']) === false);
ok('C6 负责人+评委仍不可见', isNoteRole(['LEADER', 'JUDGE']) === false);

// D. 边界
ok('D1 空数组不可见', isNoteRole([]) === false);
ok('D2 undefined 不可见', isNoteRole(undefined) === false);
ok('D3 null 不可见', isNoteRole(null) === false);

console.log(`\n口径注解可见性冒烟：${pass}/${pass + fails.length} 通过`);
if (fails.length) { console.log('失败项：' + fails.join(' / ')); process.exit(1); }
console.log('✅ 全绿');
