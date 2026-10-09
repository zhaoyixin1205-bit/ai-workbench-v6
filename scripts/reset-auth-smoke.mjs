/**
 * V8.3-10.09 高危端点鉴权冒烟（BUG-02：/api/state/reset 曾完全无鉴权）
 *
 * 起因（真实事故）：L1 探健康时我调了 `POST /api/state/reset`，
 * 它真的把本地库清空了（靠 .bak 恢复；线上 version 184 未受影响已核实）。
 *
 * 这个端点会清空**整库**（作业 / 悬赏 / 积分 / 通讯录 / 全部提报），
 * 任何一次误触或好奇尝试都不可逆。运营方 2026-10-09 13:42 拍板：**A 加角色校验**。
 *
 * 断言覆盖三件事，缺一件就等于没修：
 *  1. 服务端有校验（token + 角色）；
 *  2. 前端带token（不带会被 401 打回，等于自己把功能改坏了）；
 *  3. **被拒时前端不动本地数据** ← 这条最容易被漏，且后果是"数据不一致"。
 */
import { readFileSync } from 'node:fs';

const results = [];
function check(name, fn) {
  let ok = false, detail = '';
  try {
    const r = fn();
    ok = r === true;
    if (typeof r === 'string') detail = r;
  } catch (e) { detail = 'ERR: ' + e.message; }
  results.push({ ok, name, detail });
}
function read(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}
function code(p) {
  return read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
}

const srv = read('server/index.mjs');
const svc = read('src/service/stateService.ts');
const store = code('src/store/store.tsx');
const sw = read('src/components/RoleSwitcher.tsx');

/** 取出 reset 端点那一段 */
const seg = /if \(pathname === '\/api\/state\/reset'[\s\S]{0,2600}?\n  \}/.exec(srv);

/* ---------- A组：服务端鉴权（真正的门） ---------- */
check('A1 reset 端点必须有 token 校验', () => {
  if (!seg) return '未找到 reset 端点';
  return /readToken\(req\)/.test(seg[0]) && /verifyToken/.test(seg[0])
    ? true
    : 'reset 没有校验 X-WB-Token —— 等于任何人都能清库';
});
check('A2 🔴 无/坏 token 必须 401（不能静默放行）', () => {
  if (!seg) return '未找到 reset 端点';
  const has401 = /sendJson\(res,\s*401/.test(seg[0]);
  const hasNoSession = /NO_SESSION/.test(seg[0]);
  return has401 && hasNoSession ? true : '缺 401 / NO_SESSION 分支';
});
check('A3 🔴 非组织者/管理员必须 403（角色校验）', () => {
  if (!seg) return '未找到 reset 端点';
  const s = seg[0];
  const hasRoleCheck = /roles\.includes\('ORGANIZER'\)\s*&&\s*!roles\.includes\('ADMIN'\)|!roles\.includes\('ORGANIZER'\)\s*&&\s*!roles\.includes\('ADMIN'\)/.test(s)
    || (/includes\('ORGANIZER'\)/.test(s) && /includes\('ADMIN'\)/.test(s) && /!\(roles\.includes\('ORGANIZER'\)\s*\|\|\s*roles\.includes\('ADMIN'\)\)/.test(s));
  if (!hasRoleCheck) return '未找到「仅 ORGANIZER/ADMIN」的放行判断';
  return /sendJson\(res,\s*403/.test(s) && /NOT_ALLOWED/.test(s) ? true : '缺 403 / NOT_ALLOWED 分支';
});
check('A4 操作者取身份库真名，不信前端传的 by（可伪造）', () => {
  if (!seg) return '未找到 reset 端点';
  return /state\.reset\(null,\s*meRow\.name\)/.test(seg[0])
    ? true
    : '仍用前端传来的 by 作为操作者 —— 该字段可任意伪造，审计会失真';
});
check('A5 拒绝与放行都要留痕（console 记录谁清的/谁被拒的）', () => {
  if (!seg) return '未找到 reset 端点';
  return /console\.warn/.test(seg[0]) && /console\.log/.test(seg[0])
    ? true
    : '缺日志留痕 —— 拒了/清了都查不到是谁';
});
check('A6 未配免登时放行但必须打警告（不能为开发方便把生产的门也拆了）', () => {
  if (!seg) return '未找到 reset 端点';
  const s = seg[0];
  if (!/dingtalkConfig\(\)\.enabled/.test(s)) return '未按免登配置分叉 —— 本地开发会绕开门禁';
  return /console\.warn/.test(s.split('dingtalkConfig().enabled')[1] || '')
    ? true
    : '未配免登的分支没有警告 —— 生产误配时会静默裸奔';
});

/* ---------- B组：前端配合（不带 token 等于自己把功能改坏） ---------- */
check('B1 前端 reset 请求必须带 X-WB-Token', () => {
  return /X-WB-Token|authHeaders\(\)\.headers/.test(svc)
    ? true
    : 'resetRemoteState 没带 token —— 服务端加了校验后这个功能必然 401';
});
check('B2 被拒时要把服务端的话带出来（否则用户只见「重置失败」）', () => {
  return /res\.json\(\)/.test(svc) && /error/.test(svc) ? true : '未读取服务端返回的错误文案';
});
check('B3 🔴 resetDemo 必须返回 boolean（前端要据此提示而非无条件报成功）', () => {
  return /resetDemo:\s*\(\)\s*=>\s*Promise<boolean>/.test(store)
    ? true
    : 'resetDemo 返回类型仍是 Promise<void> —— 调用方无法区分成功失败';
});
check('B4 🔴 被拒时**不能动本地数据**（否则内存是种子、服务端是真实数据）', () => {
  const fn = /const resetDemo = useCallback\([\s\S]{0,900}?\n  \}, \[/.exec(store);
  if (!fn) return '未找到 resetDemo 实现';
  const body = fn[0];
  // 顺序必须是：先看 ok，失败就 return，之后才 removeItem / setDb
  const guardAt = body.indexOf('if (!ok)');
  const clearAt = body.indexOf('localStorage.removeItem');
  if (guardAt < 0) return '失败分支缺失 —— 现在不管成功失败都会清本地缓存';
  if (clearAt < 0) return '未找到清本地缓存的动作';
  return guardAt < clearAt
    ? true
    : '❌ 清本地缓存在判断成败**之前** —— 服务端拒绝后前端仍会清空本地，数据会不一致';
});
check('B5 重置入口只对组织者/管理员显示（少一次 futile 请求）', () => {
  return /canReset/.test(sw) && /includes\('ORGANIZER'\)/.test(sw)
    ? true
    : '前端未按角色隐藏入口 —— 非管理者会点了才吃 403';
});
check('B6 失败要报 error 而不是 success（原来无条件报「已重置」）', () => {
  const seg2 = /key === 'reset'[\s\S]{0,420}/.exec(sw);
  if (!seg2) return '未找到 reset 点击处理';
  return /message\.error/.test(seg2[0]) ? true : "被拒时仍提示「已重置」——用户会以为成功然后发现数据没变";
});

/* ---------- C组：同类端点体检（如实记录，不计入通过率） ---------- */
/**
 * upload 端点**当前也没有鉴权** —— 但这超出运营方本次授权范围（只说了 reset 加校验），
 * 按「不擅自扩大改动」原则不在本轮修。
 *
 * 这里刻意用 results.push 而不 check()：它是**现状记录**不是待办断言。
 * 写进 check() 会让「修好reset」这件事因为一个没授权的问题而显示红，掩盖真实状态。
 * 将来运营方拍板要修时，把这里改成 check 即可。
 */
{
  const seg2 = /pathname === '\/api\/files\/upload'[\s\S]{0,900}/.exec(srv);
  const has = seg2 ? /readToken\(req\)/.test(seg2[0]) : null;
  results.push({
    ok: true,
    name: 'C1 [现状记录] upload 端点当前无鉴权 —— 需运营方单独拍板',
    detail: has ? '已有鉴权' : '任何人都可调；不在本次授权范围，已记录在 TEST_REPORT 待办',
  });
}

/* ---------- D组：反向自检 ---------- */
check('D1 反向：删掉角色校验，A3 必须失败', () => {
  if (!seg) return '未找到 reset 端点';
  const broken = seg[0].replace(/!roles\.includes\('ORGANIZER'\)\s*&&\s*!roles\.includes\('ADMIN'\)/g, 'false')
    .replace(/roles\.includes\('ORGANIZER'\)\s*&&\s*!roles\.includes\('ADMIN'\)/g, 'true');
  return /includes\('ORGANIZER'\)/.test(broken) === false || /sendJson\(res,\s*403/.test(broken) === false
    ? true
    : '断言无效';
});
check('D2 反向：把 removeItem 提到判断之前，B4 必须失败', () => {
  const fn = /const resetDemo = useCallback\([\s\S]{0,900}?\n  \}, \[/.exec(store);
  if (!fn) return '未找到 resetDemo';
  const broken = fn[0]
    .replace(/localStorage\.removeItem\(LS_KEY\);/, '')
    .replace(/if \(!ok\) \{[\s\S]*?return false;\s*\}/, 'localStorage.removeItem(LS_KEY); return true;');
  const guardAt = broken.indexOf('if (!ok)');
  const clearAt = broken.indexOf('localStorage.removeItem');
  return guardAt < 0 || clearAt < guardAt ? true : '断言无效：应判为「清缓存早于成败判断」而失败';
});

/* ---------- 输出 ---------- */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\n高危端点鉴权冒烟：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);