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

/* ---- D组：401竞态判定（2026-10-08 线上「扫码成功却进不去」的元凶） ---- */
import { readFileSync } from 'node:fs';
const readFile = (p) => readFileSync(p, 'utf8');
const src = readFile('src/service/stateService.ts');
check('D1 401 清理前必须校验 sentToken（防旧请求擦掉新会话）', () => {
  const ok = /function handleUnauthorized\(sentToken/.test(src) && /current !== sentToken/.test(src);
  return ok ? true : 'handleUnauthorized 未做 token 竞态判定';
});
check('D2 getJson / pushState 都把 auth.token 传给 handleUnauthorized', () => {
  const calls = (src.match(/handleUnauthorized\(auth\.token\)/g) || []).length;
  return calls === 2 ? true : `只传了 ${calls} 处（应为 getJson + pushState 两处）`;
});
check('D3 登录成功后必须重新拉数据（否则 db.users 为空 → 永远停在登录页）', () => {
  const login = readFile('src/pages/Login.tsx');
  return /await pullRemote\(\)/.test(login) ? true : 'Login 落地身份后没有重拉数据';
});
check('D4 降级选人路径也要重拉（否则看到的是上一个人的裁剪数据）', () => {
  const login = readFile('src/pages/Login.tsx');
  return /void pullRemote\(\)/.test(login) ? true : '降级选人后没有重拉数据';
});
/* ---- E组：exchange 响应字段必须被完整接住（2026-10-08 第二个真凶） ---- */
check('E1 loginWithCode 必须把响应里的 token 赋进 profile（漏了则永远 401）', () => {
  const dt = readFile('src/auth/dingtalk.ts');
  // 取 profile 对象字面量那一段单独判定，避免误命中别处的 token
  const m = /const profile: DingtalkProfile = \{([\s\S]*?)\}/.exec(dt);
  if (!m) return '未找到 profile 对象字面量';
  return /token:\s*body\.token/.test(m[1]) ? true : `profile 里没有 token: body.token —— 这一行漏了会导致 token 永不落地、每次拉数据都401`;
});
check('E2 服务端未返回 token 时必须直接报错（不能静默继续）', () => {
  const dt = readFile('src/auth/dingtalk.ts');
  return /if \(!body\.token\)/.test(dt) ? true : '缺 token 时没有显式失败，会退化成难以排查的 401 循环';
});
check('E3 DingtalkProfile.token 保持可选（字段只增不删），但落库前有运行时校验', () => {
  const dt = readFile('src/auth/dingtalk.ts');
  const hasField = /token\?:\s*string/.test(dt);
  const hasGuard = /if \(!body\.token\)/.test(dt);
  return hasField && hasGuard ? true : 'token 字段声明或运行时校验缺失';
});

/* ---- F组：评委可见性（2026-10-09 线上报障修法） ---- */
/**
 * 线上现象：作业已 AI 评分到 REVIEWING，评委王倩与组织者赵冰艳在复核列表都看不到。
 * 根因：dataScope 的 isPrivileged 只含 ORGANIZER/ADMIN，**不含 JUDGE**，
 *       而 submits 分支只按 union_id 过滤 → 评委拿到的 submits 恒为 0 条。
 * 口径（运营方拍板）：评委看全部、多人可评 → 数据面必须给评委全量。
 */
const ds = readFile('server/lib/dataScope.mjs');
const codeDs = ds.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
check('F1 读权限 canReadAll 必须含 JUDGE（评委看不到作业的根因）', () => {
  if (!/function canReadAll\(/.test(codeDs)) return '未拆出 canReadAll，读/写权限仍共用同一个判断';
  const seg = /function canReadAll\([\s\S]*?\n}/.exec(codeDs);
  return /includes\('JUDGE'\)/.test(seg[0])
    ? true
    : 'canReadAll 不含 JUDGE —— 评委仍拿不到 submits，复核队列会继续是 0 条';
});
check('F2 写权限 canWriteAll **不得**含 JUDGE（否则整包写回会抹掉他人数据）', () => {
  const seg = /function canWriteAll\([\s\S]*?\n}/.exec(codeDs);
  if (!seg) return '未拆出 canWriteAll';
  if (/includes\('JUDGE'\)/.test(seg[0])) {
    return 'canWriteAll 含 JUDGE —— mergeProtected 会对评委放行整包写回，评委保存一次评分就能覆盖 users/depts/他人messages';
  }
  return /includes\('ORGANIZER'\)/.test(seg[0]) && /includes\('ADMIN'\)/.test(seg[0])
    ? true
    : 'canWriteAll 应含 ORGANIZER + ADMIN';
});
check('F3 读/写两个判断必须分别用在正确位置（不能残留旧名 isPrivileged）', () => {
  const reads = /if \(canReadAll\(user\)\)/.test(codeDs);
  const writes = /if \(canWriteAll\(user\)\) return incoming;/.test(codeDs);
  const stale = /isPrivileged/.test(codeDs);
  if (stale) return '仍有 isPrivileged 残留，会造成读写判断混用';
  if (!reads || !writes) return 'canReadAll / canWriteAll 的调用位置不对';
  /**
   * 读分支**不要求**原样 return data —— V8.3-10.09 起它会补一个统计口径字段后再返回
   * （`return { ...data, statsScopeUnionIds: ... }`），这是有意为之。
   * 这里只守住关键点：读分支里不能调canWriteAll（否则读权限一放开就把写权限也放开）。
   */
  const readSeg = /if \(canReadAll\(user\)\)[\s\S]{0,420}?\n  \}/.exec(codeDs);
  if (readSeg && /canWriteAll/.test(readSeg[0])) {
    return '读分支里出现了 canWriteAll —— 放开读权限时会连带放开写权限';
  }
  return true;
});

/* ---- G组：裁剪字段与前端使用的契约（2026-10-09 线上白屏修复） ---- */
/**
 * 线上白屏：徐铭瑞（SELF）、周紫怡（DEPT_TREE）登录后整页崩，
 * 报 `Cannot read properties of undefined (reading 'includes')`。
 *
 * 根因链：scopeData 把「非本人档案」裁成 6 个 PUBLIC_FIELDS（**tags 被剥掉**）
 * → 首页 useStats 里 `db.users.filter(x => x.tags.includes(...))`
 * → 对被裁剪的人 x.tags 是 undefined → 抛错 → 整页白屏。
 * 而 scope_type=ALL / 组织者 / 评委走 canReadAll 拿全量，字段齐全，所以不崩。
 *
 * 这组断言锁的是「裁剪契约」：服务端裁哪些字段，前端就必须在同一批字段上兜底。
 */
const dsFull = readFile('server/lib/dataScope.mjs');
const storeRaw = readFile('src/store/store.tsx');

check('G1 前端对被裁剪用户的 tags 必须兜底（x.tags ?? []）', () => {
  // useStats 里的 tagUsers：不能再出现裸的 x.tags.includes
  const seg = /const tagUsers =[\s\S]{0,420}?\n    }/.exec(storeRaw);
  if (!seg) return '未找到 useStats 的 tagUsers';
  return /\(x\.tags \?\? \[\]\)/.test(seg[0])
    ? true
    : "❌ useStats 仍用 x.tags.includes —— SELF/DEPT_TREE 用户一进首页就白屏（线上已复现）";
});
check('G2 服务端必须下发 statsScopeUnionIds（否则 SELF 用户统计恒为 0）', () => {
  return /statsScopeUnionIds:\s*statsScopeUnionIdsOf\(data\)/.test(dsFull)
    ? true
    : '裁剪分支未补 statsScopeUnionIds —— 首页「X/Y 人」会显示 0/0（数字是错的）';
});
check('G3 🔴 全量分支（canReadAll）也要补名单，否则同一指标两种算法', () => {
  // 早期只在裁剪分支补 → 组织者/评委拿到的包没有该字段，会回退到从 tags 算，
  // 于是「组织者走 tags、SELF 走名单」，同一个指标两种口径。
  const n = (dsFull.match(/statsScopeUnionIdsOf\(data\)/g) || []).length;
  return n >= 2
    ? true
    : `只有 ${n} 处调用 —— 全量分支漏了，组织者与 SELF 会出现两种统计口径`;
});
check('G4 名单口径 = CADRE + BACKBONE 并集，且从全量 users 算', () => {
  const seg = /function statsScopeUnionIdsOf\([\s\S]{0,700}?\n}/.exec(dsFull);
  if (!seg) return '未找到 statsScopeUnionIdsOf';
  const s = seg[0];
  return /CADRE/.test(s) && /BACKBONE/.test(s) && /data\?\.users/.test(s)
    ? true
    : "名单口径或数据源不对（必须用全量 data.users，不能用裁剪后的 —— 这是全公司口径）";
});
check('G5 🟡 不得把 tags 加进 PUBLIC_FIELDS（干部/骨干标签属组织内部信息）', () => {
  const m = /PUBLIC_FIELDS = \[([^\]]+)\]/.exec(dsFull);
  if (!m) return '未找到 PUBLIC_FIELDS';
  return /tags/.test(m[1])
    ? '🔴 PUBLIC_FIELDS 里有 tags —— 等于让所有人能枚举「谁是干部」，是信息泄露'
    : true;
});
check('G6 DB 类型里 statsScopeUnionIds 是可选字段（字段只增不删、老数据兼容）', () => {
  return /statsScopeUnionIds\?:\s*string\[\]/.test(storeRaw)
    ? true
    : '未声明为可选（老数据/本地种子没有该字段会类型报错）';
});
check('G7 前端必须「优先用服务端名单、回退到 tags」而不是二选一硬替换', () => {
  return /Array\.isArray\(serverScope\)/.test(storeRaw) && /tagUsers\('CADRE'\)/.test(storeRaw)
    ? true
    : "缺回退分支 —— 服务端没下发名单时（老数据）会退化成 0/0";
});

/* ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n数据面会话冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);