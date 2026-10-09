/**
 * V8.3-10.08 需求①收尾：按身份裁剪 / 合并保护数据面
 *
 * ⚠️ 这是**服务端**过滤 —— 前端过滤等于没过滤（改浏览器存储就绕过了）。
 *
 * 裁剪范围刻意保守，宁可少过滤也不要把业务页面过滤空：
 * 只处理「明确属于个人或受限」的集合，其余（案例库/选题/资产/评分卡等公开内容）一律全员可见。
 *
 * 三个必须处理的（否则等于没做鉴权）：
 *   users    —— 普通成员不该看到全部 501 人通讯录；
 *   messages —— 否则任何人都能读到别人的消息（含运营侧通知）；
 *   bookings —— 否则能看到别人约了哪位专家、问了什么问题（敏感）。
 *
 * 两个要谨慎的：
 *   submits / posts —— 按「本人 + 公开」裁剪，但社区帖的 visible_subjects 判定放在前端
 *   （服务端不做复杂的多主体并集运算，避免与前端 ScopePicker 口径漂移导致「帖子消失」）。
 */

const ALL_ROLES_SCOPE = 'ALL';

/** 部门子树（显式递归，与前端 src/service/deptTree.ts 同口径，不用 startsWith） */
function deptSubtreeIds(depts, rootId, children) {
  const out = new Set();
  if (!rootId) return out;
  const idx = children ?? (() => {
    const m = new Map();
    for (const d of depts) {
      const k = d.parent_id || '#ROOT#';
      const list = m.get(k) ?? [];
      list.push(d.dept_id);
      m.set(k, list);
    }
    return m;
  })();
  const walk = (id) => {
    if (out.has(id)) return;
    out.add(id);
    for (const c of idx.get(id) ?? []) walk(c);
  };
  walk(rootId);
  return out;
}

/** 某人可见的部门集合（scope_type: ALL / DEPT_TREE / SELF） */
export function visibleDeptSet(user, depts) {
  if (user?.scope_type === ALL_ROLES_SCOPE) return null; // null = 不限
  if (user?.scope_type === 'SELF') return new Set([user.union_id]); // 只看自己
  const idx = new Map();
  for (const d of depts ?? []) {
    const k = d.parent_id || '#ROOT#';
    const list = idx.get(k) ?? [];
    list.push(d.dept_id);
    idx.set(k, list);
  }
  const out = new Set();
  for (const root of user?.scope_dept_ids ?? []) {
    for (const id of deptSubtreeIds(depts ?? [], root, idx)) out.add(id);
  }
  return out;
}

/**
 * 数据面**读取**全量：组织者 / 管理员 / 评委
 *
 * ⚠️ V8.3-10.09 新增 JUDGE（线上报障修复）：
 * 原来只含 ORGANIZER / ADMIN，导致**评委在复核列表里看不到任何作业** ——
 * 王倩是 JUDGE + DEPT_TREE，`scopeData` 的 submits 只按 union_id 过滤
 * （「是不是我自己的」），她拿到的 submits 恒为 0 条，于是「待复核队列 0」。
 *
 * 运营方口径（2026-10-09 拍板）：**评委看全部，多个评委均可评价** → 既然评分队列
 * 不按推送归属收敛，数据面就必须给评委全量，否则前端放开、后端还在裁剪，等于没放开。
 * 这也让 submits 与 users 的口径一致：评委能在通讯录看到人，也能看到这些人的作业。
 */
function canReadAll(user) {
  const r = user?.roles ?? [];
  return r.includes('ORGANIZER') || r.includes('ADMIN') || r.includes('JUDGE');
}

/**
 * 数据面**写入**豁免：只有组织者 / 管理员
 *
 * ⚠️ 读权限与写权限**必须分开**（V8.3-10.09 加 JUDGE 时踩到的坑）：
 * mergeProtected 依赖这个判断来决定「客户端提交的内容能不能整包采纳」。
 * 若把 JUDGE 一起放进豁免名单，评委保存一次评分就会把 users / depts /
 * 别人的 messages / bookings 全量覆盖 —— 前端拿到的是裁剪后的子集，整包写回会抹掉他人数据。
 * 评委是「评阅者」不是「管理员」，不��有整包写权限。
 */
function canWriteAll(user) {
  const r = user?.roles ?? [];
  return r.includes('ORGANIZER') || r.includes('ADMIN');
}

/**
 * GET /api/state：按身份裁剪后的数据包。
 * @param data 服务端完整 DB
 * @param user 身份（来自业务库，不是前端传来的 —— 前端传的一律不可信）
 */
export function scopeData(data, user) {
  if (!data || !user) return data;
  if (canReadAll(user)) return data;

  const users = data.users ?? [];
  const depts = data.depts ?? [];
  const deptSet = visibleDeptSet(user, depts);

  /**
   * 通讯录裁剪：**分两档**，而不是非黑即白。
   *
   * 之前一版是「不在管辖子树就整条删掉」，实测有两个副作用：
   *   ① 组织者（不在普通成员的子树里）会被删掉 → 帖子/案例里的「作者」反查不到名字，显示成空；
   *   ② 很多 @人、名字反查功能随之失效。
   * 但把 501 人整份通讯录原样发给普通成员也不行 —— 含手机号、工号、管辖范围等敏感字段。
   *
   * 现在的口径：
   *   - 管辖子树内 + 本人 → **完整档案**（含手机号/工号等，管理者确有必要）；
   *   - 其余同组织成员 → **公开档案**（只留 union_id / 姓名 / 头像 / 部门名），
   *     既能正确显示「谁发的」，又不会泄露通讯录隐私。
   */
  const full = users.filter((u) => {
    if (u.union_id === user.union_id) return true;
    if (!deptSet) return true;
    return (u.dept_id_list ?? []).some((d) => deptSet.has(d));
  });
  const fullIds = new Set(full.map((u) => u.union_id));
  const PUBLIC_FIELDS = ['union_id', 'name', 'avatar', 'dept_names', 'title', 'roles'];
  const scopedUsers = full.length === users.length
    ? users
    : [
        ...full,
        ...users
          .filter((u) => !fullIds.has(u.union_id))
          .map((u) => Object.fromEntries(PUBLIC_FIELDS.filter((f) => u[f] !== undefined).map((f) => [f, u[f]]))),
      ];

  /** 部门本身也裁剪（只给看得见的）—— 少了会��致部门树选择器空白 */
  const scopedDepts = !deptSet
    ? depts
    : depts.filter((d) => deptSet.has(d.dept_id) || (user.scope_dept_ids ?? []).includes(d.dept_id));

  return {
    ...data,
    users: scopedUsers,
    depts: scopedDepts,
    /** 消息：只属于自己的 + 全员广播 */
    messages: (data.messages ?? []).filter(
      (m) => m.union_id === user.union_id || m.union_id === 'all'
    ),
    /** 预约单：自己约的 + 自己作为专家被约的 */
    bookings: (data.bookings ?? []).filter(
      (b) => b.union_id === user.union_id || b.expert_id === (data.experts ?? []).find((e) => e.union_id === user.union_id)?.id
    ),
    /** 作业提报：自己的 */
    submits: (data.submits ?? []).filter((s) => s.union_id === user.union_id),
    /** 社区帖：公开的 + 自己发的 */
    posts: (data.posts ?? []).filter(
      (p) => p.union_id === user.union_id || p.status === '正常' || p.status === '审核中'
    ),
    /** 积分流水：自己的 */
    pointRecords: (data.pointRecords ?? []).filter((p) => p.union_id === user.union_id),
    /** 悬赏：自己发布的 / 自己认领的 / 公开的 */
    bounties: (data.bounties ?? []).filter((b) => {
      if (b.status === 'PUBLISHED' || b.status === 'CLAIMED' || b.status === 'APPROVED' || b.status === 'EXPIRED') return true;
      return b.owner_union_id === user.union_id || b.claimant_union_id === user.union_id;
    }),
  };
}

/**
 * PUT /api/state：受限集合的**合并保护**。
 *
 * 为什么必须做：前端拿到的是裁剪后的子集，如果直接整包写回，
 * 普通成员的一次操作就会把组织者和其他人的数据**全部抹掉**。
 *
 * 规则（对受限集合）：客户端提交的内容里，**只采纳属于该身份自己的条目**，
 * 其他条目一律沿用服务端现有数据；对组织者/管理员则不做任何限制。
 */
export function mergeProtected(data, incoming, user) {
  if (!data || !incoming || !user) return incoming ?? data;
  if (canWriteAll(user)) return incoming;

  /**
   * 只采纳**客户端提交且属于本人**的条目；其余一律沿用服务端现有数据。
   * ⚠️ 这里必须按 union_id 过滤后再拼接，否则像「全员广播」这种 union_id='all' 的条目
   *    会同时出现在 theirs 和 mine 里，**合并后重复**（冒烟 C1 抓到过这个）。
   */
  const keepExisting = (collection) => {
    const mine = (incoming[collection] ?? []).filter((x) => x?.union_id === user.union_id);
    const mineIds = new Set(mine.map((x) => x?.id).filter(Boolean));
    const theirs = (data[collection] ?? []).filter((x) => !mineIds.has(x?.id));
    return [...theirs, ...mine];
  };

  return {
    ...incoming,
    users: data.users ?? [],
    depts: data.depts ?? [],
    messages: keepExisting('messages'),
    bookings: keepExisting('bookings'),
    submits: keepExisting('submits'),
    pointRecords: keepExisting('pointRecords'),
  };
}