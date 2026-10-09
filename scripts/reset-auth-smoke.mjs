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

/* ---------- C1组：文件下载/删除的鉴权（🔴 曾是伪鉴权，本轮已修） ---------- */
/**
 * 原状：`GET|DELETE /api/files/:id` 的权限判断**完全信任 query 参数**里的
 *   `actor` / `roles`（server/index.mjs 的 canDownload 与 DELETE 分支）：
 *     canDownload: meta.uploaded_by === actor.name || actor.roles.includes('ORGANIZER') || ...
 * 实测复现：任何人传 `?roles=OPERATOR&actor=任何人` 就能**下载到文件内容**（200）；
 * 反过来前端 `deleteFile()` 根本不带 actor → **上传者本人也删不掉自己传的文件**（403）——
 * 也就是说它既是安全漏洞，也是功能 bug。
 *
 * 现修法：身份只从可信来源取 —— ①X-WB-Token 头 ②?sig= 短时签名（5 分钟、绑定 fileId）。
 * 为什么必须有②：下载是 window.open / <img src> / <a href> 触发的，
 * **浏览器不会给这些请求带自定义 header**，光靠 header 会让所有附件/帖子图片全部裂图。
 */
const dlSeg = /if \(m\) \{[\s\S]{0,4200}?\n  \}/.exec(srv);

check('C1 🔴 下载/删除不得再信任 query 的 actor/roles（曾可越权读+删任意文件）', () => {
  /**
   * ⚠️ 判据必须落在**下载端点里的那个调用点**，不能只看文件里有没有 resolveActor 定义。
   * 我第一版判`/resolveActor\(req\)/.test(srv)` —— 结果把调用点改回 query 直取、
   * 函数定义还留着，断言照样通过 → 假断言。已改为同时要求存在「赋给 actor」的调用。
   */
  if (!dlSeg) return '未找到下载端点段';
  // 关键：必须是 `let actor = await resolveActor(req)` 这��赋值，不能是 query 直取
  const usesResolve = /let actor = await resolveActor\(req\)/.test(dlSeg[0]);
  if (!usesResolve) {
    return "下载端点的 actor 不是从 resolveActor 取 —— query 直取即越权口子；"
      + "（注意：只看文件里有没有 resolveActor 定义会漏判，必须看调用点）";
  }
  // 再兜一层：query 直取只允许出现在「未配免登时」的降级分支里
  const fallbackIdx = dlSeg[0].indexOf('const authFallback');
  const directIdx = dlSeg[0].search(/let actor = \{ name: url\.searchParams/);
  if (directIdx >= 0 && (fallbackIdx < 0 || directIdx < fallbackIdx)) {
    return 'query 直取的 actor 出现在降级分支之前 —— 生产（已配免登）仍会走它';
  }
  return true;
});
check('C2 身份解析集中在 resolveActor（下载与删除共用同一把尺子）', () => {
  return /async function resolveActor\(req\)/.test(srv) && /canDeleteFile/.test(srv)
    ? true
    : "缺 resolveActor / canDeleteFile —— 下载与删除会各写一套判断，迟早漂移";
});
check('C3 🔴 个人交付物（SUBMIT/BOUNTY_SOLUTION）必须有可信身份', () => {
  const fn = /function canDownload\([\s\S]{0,700}?\n}/.exec(srv);
  if (!fn) return '未找到 canDownload';
  const seg3 = fn[0];
  if (!/if \(!actor\) return false/.test(seg3)) return 'actor 为空时应直接拒绝';
  return /uploaded_by === actor\.name/.test(seg3) && /roles\.includes\('ORGANIZER'\)/.test(seg3)
    ? true
    : 'canDownload 未按「本人或组织者/管理员」判定';
});
check('C4 🟢 公开类附件仍可全员下载（否则帖子图片/案例附件会全部裂）', () => {
  const fn = /function canDownload\([\s\S]{0,700}?\n}/.exec(srv);
  if (!fn) return '未找到 canDownload';
  return /CASE_SKILL[\s\S]{0,120}POST_ATTACH[\s\S]{0,80}return true/.test(fn[0])
    ? true
    : '公开类（CASE_SKILL/CASE_ATTACH/POST_ATTACH）被误伤 —— 会导致图片裂图';
});
check('C5 🟡 必须支持 ?sig= 短时签名（window.open/<img src> 带不了 header）', () => {
  if (!/verifyFileToken/.test(srv)) return '下载端未解析 ?sig= 签名 —— 附件在浏览器里会全部加载失败';
  return /get\('sig'\)/.test(srv) ? true : '未从 query 读取 sig 参数';
});
check('C6 🔴 签名必须比对 fileId（A 文件的签名不能改去下 B 文件）', () => {
  if (!dlSeg) return '未找到下载端点段';
  return /v\.fileId === id/.test(dlSeg[0])
    ? true
    : '未比对 fileId —— 拿到任一有效签名即可遍历下载所有文件';
});
check('C7 上传时给 url 签发凭证（前端拿到的 url 要能直接用）', () => {
  if (!/issueFileToken/.test(srv)) return '上传时未签发文件签名';
  return /meta\.url = `\/api\/files\/\$\{meta\.id\}\?sig=/.test(srv)
    ? true
    : '上传返回的 url 未带 sig —— 前端 window.open(f.url) 会 401';
});
check('C8 签名有效期 5 分钟且带 fileId（session.mjs 侧）', () => {
  const ses = read('server/lib/session.mjs');
  const hasFn = /export function issueFileToken/.test(ses) && /export function verifyFileToken/.test(ses);
  if (!hasFn) return 'session.mjs 缺 issueFileToken / verifyFileToken';
  return /fid:\s*fileId/.test(ses) && /5 \* 60 \* 1000/.test(ses)
    ? true
    : '文件签名未绑定 fileId 或有效期不是 5 分钟';
});
check('C9 删除要留痕（谁删的）', () => {
  if (!dlSeg) return '未找到下载端点段';
  return /\[files\] 删除/.test(dlSeg[0]) ? true : '删除未留痕 —— 删了文件查不到是谁';
});
check('C10 未登录时给 401 而不是 403（别让用户以为文件不存在）', () => {
  if (!dlSeg) return '未找到下载端点段';
  const n401 = (dlSeg[0].match(/sendJson\(res,\s*401/g) || []).length;
  return n401 >= 2 ? true : `只有 ${n401} 处 401（下载与删除各需 1 处）`;
});

/* ---------- C2组：upload 登录态校验（运营方 14:36 拍板 B：只要登录态） ---------- */
/**
 * upload 段落的**实际长度约 3600 字符**（加了鉴权块之后），
 * 上限必须给够 —— 上次设 3200 导致整段匹配不到，7 条断言全部误报"未找到端点"。
 * 这类"用正则切源码"的断言，段长上限要留余量，否则改一次代码就集体失效。
 */
const upSeg = /if \(pathname === '\/api\/files\/upload'[\s\S]{0,4200}?\n  \}/.exec(srv);

check('C2 upload 必须校验登录态（未登录的挡掉）', () => {
  if (!upSeg) return '未找到 upload 端点';
  const s = upSeg[0];
  return /readToken\(req\)/.test(s) && /verifyToken/.test(s) ? true : 'upload 无 token 校验 —— 任何人可传文件';
});
check('C3 🔴 未登录上传必须 401（不能静默放行）', () => {
  if (!upSeg) return '未找到 upload 端点';
  return /sendJson\(res,\s*401/.test(upSeg[0]) && /NO_SESSION/.test(upSeg[0])
    ? true
    : '缺 401 / NO_SESSION 分支';
});
check('C4 🟢 **不做角色限制**（B 方案：员工要传作业/方案附件，限组织者会挡死业务）', () => {
  if (!upSeg) return '未找到 upload 端点';
  const s = upSeg[0];
  // 允许的判据：只判身份不判角色；若出现「上传需要 ORGANIZER」这类角色门则违反B 方案
  const hasRoleGate = /上传.*ORGANIZER|upload.*requires.*ORGANIZER|needsRole/.test(s);
  return hasRoleGate === false
    ? true
    : 'upload 加了角色限制 → 违反 B 方案，普通员工无法传作业附件';
});
check('C5 🔴 uploaded_by 取身份库真名，不信 query（可自称组织者）', () => {
  if (!upSeg) return '未找到 upload 端点';
  return /uploadedBy = meRow \? meRow\.name/.test(upSeg[0])
    ? true
    : "仍信 query 里的 uploaded_by —— 客户端可任意自称身份";
});
check('C6 按免登配置分叉，未配时放行但打警告', () => {
  if (!upSeg) return '未找到 upload 端点';
  const s = upSeg[0];
  if (!/dingtalkConfig\(\)\.enabled/.test(s)) return '未按免登配置分叉 —— 本地开发会绕开门禁';
  return /console\.warn/.test(s.split('dingtalkConfig().enabled')[1] || '')
    ? true
    : '未配免登的分支没有警告 —— 生产误配时静默裸奔';
});
check('C7 删掉客户端 roles 死变量（声明后无人消费，却看起来像"可指定角色"）', () => {
  if (!upSeg) return '未找到 upload 端点';
  return /const roles = meRow/.test(upSeg[0]) ? '❌ 死变量还在（newFileMeta 并不消费它）' : true;
});

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