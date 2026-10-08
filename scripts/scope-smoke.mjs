/**
 * 数据面会话与裁剪冒烟（V8.3-10.08 需求①收尾）
 *
 * 运行：npm run smoke:scope
 *
 * 锁三件事：
 *   ① token 不可伪造（签名不符/过期一律无效）
 *   ② GET 按身份裁剪：普通成员拿不到他人消息/预约/提报/通讯录
 *   ③ PUT 合并保护：拿着裁剪后的子集回写，**不能把组织者与他人数据抹掉**
 *      （这条最要命——没做的话普通成员一次操作就会清空全库）
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const dir = mkdtempSync(join(tmpdir(), 'wbscope-'));
const sOut = join(dir, 'session.cjs');
const dOut = join(dir, 'dataScope.cjs');
buildSync({ entryPoints: ['server/lib/session.mjs'], bundle: true, format: 'cjs', platform: 'node', outfile: sOut, logLevel: 'silent' });
buildSync({ entryPoints: ['server/lib/dataScope.mjs'], bundle: true, format: 'cjs', platform: 'node', outfile: dOut, logLevel: 'silent' });
const S = require(sOut);
const D = require(dOut);

const results = [];
const check = (name, fn) => {
  try {
    const r = fn();
    results.push({ name, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (e) {
    results.push({ name, ok: false, detail: `EXCEPTION ${e.message}` });
  }
};

/* ---------------- 测试数据 ---------------- */
const DB = {
  depts: [
    { dept_id: '1', parent_id: '', name: '总部' },
    { dept_id: '111', parent_id: '1', name: '商业侧' },
    { dept_id: '1112', parent_id: '111', name: '一组' },
    { dept_id: '2', parent_id: '', name: '另一条线' },
    { dept_id: '21', parent_id: '2', name: '区域一' },
  ],
  users: [
    { union_id: 'org', dept_id_list: ['1'], roles: ['ORGANIZER'], scope_type: 'ALL', scope_dept_ids: [] },
    { union_id: 'mgr', dept_id_list: ['111'], roles: ['LEADER'], scope_type: 'DEPT_TREE', scope_dept_ids: ['111'] },
    { union_id: 'me', dept_id_list: ['1112'], roles: ['MEMBER'], scope_type: 'DEPT_TREE', scope_dept_ids: ['1112'] },
    { union_id: 'other', dept_id_list: ['21'], roles: ['MEMBER'], scope_type: 'DEPT_TREE', scope_dept_ids: ['21'] },
  ],
  messages: [
    { id: 'm1', union_id: 'me', title: '给我的' },
    { id: 'm2', union_id: 'other', title: '给别人的' },
    { id: 'm3', union_id: 'all', title: '全员广播' },
  ],
  bookings: [
    { id: 'b1', union_id: 'me', expert_id: 'E1', question: '我的问题' },
    { id: 'b2', union_id: 'other', expert_id: 'E2', question: '别人的问题' },
  ],
  experts: [{ id: 'E1', union_id: 'expertX', name: '专家X' }],
  submits: [
    { id: 's1', union_id: 'me', title: '我的提报' },
    { id: 's2', union_id: 'other', title: '别人的提报' },
  ],
  posts: [
    { id: 'p1', union_id: 'other', status: '正常', title: '公开帖' },
    { id: 'p2', union_id: 'other', status: '审核中', title: '公开待审' },
    { id: 'p3', union_id: 'other', status: '驳回', title: '别人的驳回帖' },
  ],
  pointRecords: [{ id: 'pr1', union_id: 'me' }, { id: 'pr2', union_id: 'other' }],
  cases: [{ id: 'c1', title: '公开案例' }],
};

const ME = DB.users.find((u) => u.union_id === 'me');
const ORG = DB.users.find((u) => u.union_id === 'org');

/* ---------------- A. token ---------------- */
const ENV = { SESSION_SECRET: 'test-secret' };
const token = S.issueToken('me', ENV);
check('A1 签发后能验回 union_id', () => S.verifyToken(token, ENV) === 'me' ? true : S.verifyToken(token, ENV));
check('A2 换密钥验不过（防伪造）', () => S.verifyToken(token, { SESSION_SECRET: 'other-secret' }) === null ? true : '伪造成功');
check('A3 篡改 payload 验不过', () => {
  const [, sig] = token.split('.');
  const fake = Buffer.from(JSON.stringify({ uid: 'org', exp: Date.now() + 1e9 })).toString('base64url');
  return S.verifyToken(`${fake}.${sig}`, ENV) === null ? true : '篡改成功';
});
check('A4 过期 token 失效', () => {
  const t = S.issueToken('me', ENV, -1000);
  return S.verifyToken(t, ENV) === null ? true : '过期仍有效';
});
check('A5 空/垃圾输入不炸', () => {
  return [S.verifyToken(''), S.verifyToken('a.b.c'), S.verifyToken('xyz')].every((x) => x === null) ? true : '有非法输入被接受';
});

/* ---------------- B. GET 裁剪 ---------------- */
const scoped = D.scopeData(DB, ME);
check('B1 消息只留本人 + 全员广播', () => {
  const ids = scoped.messages.map((m) => m.id).sort();
  return JSON.stringify(ids) === JSON.stringify(['m1', 'm3']) ? true : JSON.stringify(ids);
});
check('B2 预约只留自己的', () => scoped.bookings.length === 1 && scoped.bookings[0].id === 'b1' ? true : JSON.stringify(scoped.bookings.map((b) => b.id)));
check('B3 提报只留自己的', () => scoped.submits.length === 1 && scoped.submits[0].id === 's1' ? true : JSON.stringify(scoped.submits.map((s) => s.id)));
check('B4 积分流水只留自己的', () => scoped.pointRecords.length === 1 && scoped.pointRecords[0].id === 'pr1' ? true : JSON.stringify(scoped.pointRecords.map((p) => p.id)));
check('B5 社区帖：公开可见 + 驳回帖不可见', () => {
  const ids = scoped.posts.map((p) => p.id).sort();
  return JSON.stringify(ids) === JSON.stringify(['p1', 'p2']) ? true : JSON.stringify(ids);
});
check('B6 通讯录分两档：子树内=完整档案、他人=公开档案（仅姓名类字段）', () => {
  const org = scoped.users.find((u) => u.union_id === 'org');
  const other = scoped.users.find((u) => u.union_id === 'other');
  // 组织者不在我的管辖子树内 → 应为公开档案
  if (!org || org.scope_type !== undefined) return `组织者档案未脱敏: ${JSON.stringify(org)}`;
  if (!other || other.mobile !== undefined) return '另一条线成员档案未脱敏';
  // 本人保留完整档案
  const me = scoped.users.find((u) => u.union_id === 'me');
  return me && me.scope_type === 'DEPT_TREE' ? true : '本人档案被误脱敏';
});
check('B7 公开内容不受影响（案例仍在）', () => (scoped.cases ?? []).length === 1 ? true : '案例被误删');
check('B8 组织者拿全量（不被裁剪）', () => {
  const o = D.scopeData(DB, ORG);
  return o.users.length === DB.users.length && o.messages.length === DB.messages.length ? true : '组织者被裁了';
});

/* ---------------- C. PUT 合并保护（最关键） ---------------- */
check('C1 普通成员回写子集，不会抹掉他人消息', () => {
  const merged = D.mergeProtected(DB, scoped, ME);
  const ids = merged.messages.map((m) => m.id).sort();
  return JSON.stringify(ids) === JSON.stringify(['m1', 'm2', 'm3']) ? true : JSON.stringify(ids);
});
check('C2 本人条目以客户端为准（新增能落库）', () => {
  const withNew = { ...scoped, messages: [...scoped.messages, { id: 'm9', union_id: 'me', title: '新消息' }] };
  const merged = D.mergeProtected(DB, withNew, ME);
  return merged.messages.some((m) => m.id === 'm9') ? true : '本人新增被丢了';
});
check('C3 他人条目以服务端为准（伪造也改不了）', () => {
  const tampered = {
    ...scoped,
    messages: [...scoped.messages, { id: 'm2', union_id: 'other', title: '被篡改的标题' }],
  };
  const merged = D.mergeProtected(DB, tampered, ME);
  const m2 = merged.messages.find((m) => m.id === 'm2');
  return m2 && m2.title === '给别人的' ? true : `被改成了 ${m2?.title}`;
});
check('C4 通讯录不可被客户端改写', () => {
  const evil = { ...scoped, users: [{ union_id: 'me', roles: ['ORGANIZER'], scope_type: 'ALL' }] };
  const merged = D.mergeProtected(DB, evil, ME);
  return merged.users.length === DB.users.length && merged.users.find((u) => u.union_id === 'org') ? true : '组织者被客户端删掉了';
});
check('C5 组织者回写不受限制（仍可管全库）', () => {
  const merged = D.mergeProtected(DB, { ...DB, messages: [{ id: 'x', union_id: 'me' }] }, ORG);
  return merged.messages.length === 1 ? true : '组织者写入被拦';
});

/* ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n数据面会话冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);