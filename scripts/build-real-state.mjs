/**
 * 真实数据装配器：钉钉通讯录 + 选题案例库 md + 大赛标黄作品 → 完整 DB
 * ============================================================
 * 背景（2026-10-06 用户拍板）：
 *   ① 清空全部测试数据，改接钉钉真实通讯录（全公司 506 人档，本次实到 501）；
 *   ② 选题案例库以《大赛选题案例库_20场景.md》为准 —— 落到 **选题库（推荐选题）**；
 *   ③ 案例库以钉钉文档中标黄的 12 件 Season3 真实作品为准。
 *   ④ 清空范围 = 人员 + 业务流水；**保留配置骨架**（评分卡 / 流程规则 / 看板配置 / 标签 / 活动 / 作业类型）。
 *
 * 用法：
 *   node scripts/build-real-state.mjs             # 只产出 _local/state-real.json
 *   node scripts/build-real-state.mjs --apply     # 同时写本机 server/data/state.json
 *   node scripts/build-real-state.mjs --push      # 同时 PUT 到线上（SITE 环境变量）
 *
 * 红线：
 *   - 真实通讯录只落在 _local/ 与 server/data/（两者均已 .gitignore），**绝不进 src/ 打包产物**；
 *   - 每次覆盖前先把旧 state.json 备份成 state.json.bak-<时间戳>。
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const LOCAL = path.join(ROOT, '_local');
const STATE_FILE = path.join(ROOT, 'server', 'data', 'state.json');
const MD_FILE = process.env.MD_FILE
  || path.join(ROOT, '..', '大赛选题案例库_20场景.md');
const SITE = process.env.SITE || 'https://aihrbp.yunzhangfang.com';
const TODAY = new Date().toISOString().slice(0, 10);

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/* ================================================================
 * 1. 钉钉真实通讯录 → depts / users
 * ============================================================== */
const contacts = readJson(path.join(LOCAL, 'dingtalk-contacts.json'));
const rolesMap = readJson(path.join(LOCAL, 'dingtalk-roles.json')).userRoles;

/** 明确「管一个组织单元」的钉钉角色 —— 负责人 / 区总 / 分总 / 片区 / 部门一号位 */
const LEADER_LABELS = new Set([
  '区总', '华中区总', '西部区总', '分总', '片区负责人', '区域团队分管负责人', '区域客成分管负责人',
  '片区客成1号位', '片区客成负责人', '城市/办事处负责人', '直辖城市/办事处负责人',
  '一级部门负责人', '二级部门负责人', '中小微二级部门负责人', '产研中心主管',
  '客成经理', '客成总监', '全国客成管理', '销售管理', '销售管理部', '万众企服负责人', '人力负责人',
  '中小微事业群总裁', '管理组', 'CEO', 'CFO', '大区运营',
]);
/** 评委：负责人 + 一线管理岗（主管 / 客成主管 / 销售主管） */
const JUDGE_LABELS = new Set(['主管', '客成主管', '销售主管']);
/** 问诊专家：客成/服务条线的专业骨干 */
const EXPERT_LABELS = new Set([
  '片区客成1号位', '片区客成负责人', '客成经理', '客成总监', '客成主管', '全国客成管理',
]);
const ADMIN_LABELS = new Set(['主管理员']);
/** 组织者：手工指定（工作台运营方）。工号 E02107 = 赵冰艳 */
const ORGANIZER_JOB_NO = 'E02107';

const deptsRaw = contacts.depts;
const deptById = new Map(deptsRaw.map((d) => [d.dept_id, d]));
const childrenOf = new Map();
for (const d of deptsRaw) {
  if (!childrenOf.has(d.parent_id)) childrenOf.set(d.parent_id, []);
  childrenOf.get(d.parent_id).push(d.dept_id);
}
/** 部门子树（含自身）。真实钉钉 deptId 是纯数字，前端 `startsWith` 前缀匹配对数字 id 无效，
 *  所以必须把整棵子树显式展开成 id 列表，否则负责人看不到下属部门的人。 */
function subtree(id) {
  const out = [];
  const stack = [id];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    for (const c of childrenOf.get(cur) ?? []) stack.push(c);
  }
  return out;
}
const pathOf = (id) => deptById.get(id)?.path ?? '';

const depts = deptsRaw.map((d) => ({
  dept_id: d.dept_id,
  parent_id: d.parent_id,
  name: d.name,
  level: d.level ?? 1,
  path: d.path,
}));

const users = [];
const stat = { total: 0, organizer: 0, admin: 0, leader: 0, judge: 0, expert: 0, member: 0 };
for (const u of contacts.users) {
  const labels = new Set(rolesMap[u.userId] ?? []);
  const isOrganizer = u.jobNumber === ORGANIZER_JOB_NO;
  // 只认「主管理员」。钉钉的 isAdmin 对全部 43 名「子管理员」也返回 true，
  // 照搬会给 45 个人发系统管理员，口径过宽 —— 子管理员只按其他角色标签参与映射。
  const isAdmin = [...labels].some((l) => ADMIN_LABELS.has(l));
  const isLeader = [...labels].some((l) => LEADER_LABELS.has(l));
  const isJudge = isLeader || [...labels].some((l) => JUDGE_LABELS.has(l));
  const isExpert = [...labels].some((l) => EXPERT_LABELS.has(l));

  // 排序有讲究：顶栏/身份栏展示的是 roles[0]，若 MEMBER 打头会把组织者显示成「普通成员」。
  // 按「权限从大到小」排，MEMBER 永远垫底。
  const roles = [];
  if (isOrganizer) roles.push('ORGANIZER');
  if (isAdmin) roles.push('ADMIN');
  if (isJudge) roles.push('JUDGE');
  if (isExpert) roles.push('EXPERT');
  if (isLeader) roles.push('LEADER');
  roles.push('MEMBER');

  const scopeType = (isOrganizer || isAdmin) ? 'ALL' : (isLeader || isJudge) ? 'DEPT_TREE' : 'SELF';
  // ALL 时前端直接放行，再塞一棵子树只会白白撑大包体；管辖部门另存 managed_dept_ids
  const managed = (isLeader || isJudge)
    ? [...new Set((u.deptIds ?? []).flatMap(subtree))]
    : [];
  const scopeDeptIds = scopeType === 'DEPT_TREE' ? managed : [];

  const tags = [];
  if (isLeader || isJudge) tags.push('T1'); // 干部
  if (isExpert) tags.push('T3');            // 骨干

  users.push({
    union_id: u.unionId,
    name: u.name,
    avatar: u.avatar || '',
    mobile: '',
    job_number: u.jobNumber || '',
    dept_id_list: u.deptIds ?? [],
    dept_names: (u.deptIds ?? []).map(pathOf).filter(Boolean),
    title: u.title || '',
    roles,
    scope_type: scopeType,
    scope_dept_ids: scopeDeptIds,
    tags,
    status: 1,
    points: 0,
    is_dept_leader: isLeader,
    managed_dept_ids: isLeader ? managed : [],
    created_at: TODAY,
    source: 'DINGTALK',
  });

  stat.total++;
  if (isOrganizer) stat.organizer++;
  if (isAdmin) stat.admin++;
  if (isLeader) stat.leader++;
  if (isJudge) stat.judge++;
  if (isExpert) stat.expert++;
}
stat.member = users.filter((x) => x.roles.length === 1).length;

/* ================================================================
 * 2. 《大赛选题案例库_20场景.md》 → 选题库（推荐选题）
 * ============================================================== */
const md = readFileSync(MD_FILE, 'utf8');
/** 场景明细：## A1 客户月度经营体检报告 ... （下一个 ## 或 文件结束） */
const sceneRe = /^## ([ABC]\d) (.+?)\s*$/gm;
const scenes = [];
let m;
while ((m = sceneRe.exec(md)) !== null) {
  const code = m[1];
  const start = m.index + m[0].length;
  const rest = md.slice(start);
  const nxt = rest.search(/\n## |\n---\s*\n# /);
  const body = nxt >= 0 ? rest.slice(0, nxt) : rest;
  const pick = (re) => (body.match(re)?.[1] ?? '').trim();
  const prompt = [...body.matchAll(/^> ?(.*)$/gm)].map((x) => x[1]).join('\n').trim();
  const acceptance = [...body.matchAll(/^\d+\.\s+(.+)$/gm)]
    .map((x) => x[1].replace(/<[^>]+>/g, '').trim())
    .filter((x) => x.length > 4);
  scenes.push({
    code,
    title: m[2].trim(),
    jobs: pick(/\*\*适用岗位\*\*：(.+)/),
    levelRaw: pick(/\*\*建议层级\*\*：(.+?)\s*｜/),
    duration: pick(/\*\*耗时\*\*：(.+)/),
    pain: pick(/\*\*痛点\*\*：(.+)/),
    input: pick(/\*\*输入\*\*：(.+)/),
    prompt,
    output: pick(/\*\*产出物\*\*：(.+)/),
    acceptance,
    pitfall: pick(/\*\*易踩坑\*\*：(.+)/),
  });
}
const TRACK_OF = { A: '客户赋能', B: '团队提效', C: '销售提效' };
/** md 的「建议层级」写法不统一（骨干 / 干部/一线 / 一线 / 干部/骨干），统一收敛到两级 */
function normLevel(raw) {
  if (!raw) return '干部层';
  if (raw.includes('骨干')) return '骨干层';
  return '干部层';
}
const topics = scenes.map((s, i) => ({
  id: `TP${String(i + 1).padStart(2, '0')}`,
  /** 来源场景编号（md 里的 A1/B1/C1…）。案例库已改为真实作品，故此处只是溯源标记，非外键 */
  case_id: s.code,
  title: s.title,
  difficulty: normLevel(s.levelRaw) === '骨干层' ? '难' : '中',
  expected_output: s.output,
  suggest_level: normLevel(s.levelRaw),
  track: TRACK_OF[s.code[0]],
  status: '可选',
  picked_by: undefined,
  tags: [TRACK_OF[s.code[0]], '推荐选题', s.code],
  select_limit: 0,
}));

/* ================================================================
 * 3. 钉钉文档中标黄的 12 件 Season3 作品 → 案例库
 *    来源：① 作品档案文档（标黄 12 件，取赛道/奖项/提交时间/附件）
 *          ② 「案例入库」表格（取应用场景 / 输出类型 / 是否入库 / 是否继续优化）
 * ============================================================== */
const WORKS = [
  {
    no: '1.2', name: '往来账龄分析工具', owner: '时海龙', dept: '中小微事业群',
    track: '客户赋能', seasonTrack: '效率提升赛道', group: '个人', submitted: '2026-07-17',
    award: '二等奖', finalState: '获奖',
    // 注：入库表里这一行「应用场景」是空的，故场景取自作者的应用场景文档原文
    // （钉钉文档 jb9Y4gmKWr7b7xwKT4arxZ43VGXn6lpz），不照抄其它作品的描述
    scene: '税局稽查趋严，代账公司普遍开始向客户提供合规账服务，往来账龄分析是其中重要环节；但公司系统不具备该功能，客户反复提需求得不到解决，影响客情维护。用 AI 做了一个小工具：导入云帐房批量导出的明细账（辅助核算也支持），一键完成账龄分析并可导出 Excel 报表。',
    outType: 'Skill', cover: '📊',
    links: [{ label: '应用场景与实现过程', url: 'https://alidocs.dingtalk.com/i/nodes/jb9Y4gmKWr7b7xwKT4arxZ43VGXn6lpz' },
      { label: '作品海报', url: 'https://alidocs.dingtalk.com/i/nodes/9E05BDRVQeyRpeN2fDPLvPO5V63zgkYA' }],
  },
  {
    no: '1.3', name: '客户不改接口，260家必须手报：一个 Skill 进去，1分钟一张表', owner: '任歆迪', dept: '有度税智',
    track: '客户赋能', seasonTrack: '效率提升赛道', group: '个人', submitted: '2026-07-29',
    award: '三等奖', finalState: '获奖',
    scene: '印花税申报规则临时变更、客户拒绝改接口须全手报；用 Skill 一句话完成拉取报文、填表、三层交叉校验，申报时长从 22–26 小时压至约 4 小时，错误降为 0。',
    outType: 'Skill', cover: '⚡',
    links: [{ label: '附件文档', url: 'https://alidocs.dingtalk.com/i/nodes/jb9Y4gmKWr7b7xwKT4r4ELqLVGXn6lpz' },
      { label: '作品海报', url: 'https://f6fa55828d9e44db9228b95c37c50842.bj10.agentos-app.net/poster.png' }],
  },
  {
    no: '1.5', name: '授课学堂素材批量下载器', owner: '徐聪明', dept: '职能中台',
    track: '团队提效', seasonTrack: '效率提升赛道', group: '个人', submitted: '2026-08-10',
    award: '', finalState: '入围决赛未获奖',
    scene: '更换培训平台需迁移 4000+ 门课程，官方批量迁移通道收费 5000 元且无批量下载；用 WorkBuddy 编写批量下载器脚本解决。',
    outType: 'Skill', cover: '📦',
    links: [{ label: '附件文档', url: 'https://alidocs.dingtalk.com/i/nodes/YQBnd5ExVEw1wjx3Igvwl6318yeZqMmz' },
      { label: '作品海报', url: 'https://582f006f27134bed8b56781e1312fccf.sh4.agentos-app.net/poster.png' }],
  },
  {
    no: '1.8', name: '客成新客户上线周期每日数据统计反馈', owner: '唐源', dept: '中小微事业群',
    track: '团队提效', seasonTrack: '效率提升赛道', group: '个人', submitted: '2026-07-30',
    award: '', finalState: '复赛淘汰',
    scene: '新客户上线阶段每日反馈数据需从财云导出做表；程序预设导表后自动处理，生成当日进度及本月折线图。',
    outType: '自动化脚本', cover: '📈',
    links: [{ label: '附件文档', url: 'https://www.kdocs.cn/l/cbrBGJJEEa1P' },
      { label: '作品海报', url: 'https://www.kdocs.cn/l/cdggb5ru0ugE' }],
  },
  {
    no: '2.5', name: 'C盘爆红不用慌！Windows精准瘦身指南', owner: '仲旭', dept: '福鹿事业部',
    track: '团队提效', seasonTrack: '创意设计赛道', group: '个人', submitted: '2026-08-10',
    award: '', finalState: '入围决赛未获奖',
    scene: 'C 盘爆红、电脑卡顿，用户不知哪些能删哪些不能动；windows-health 像专业电脑管家，用证据说话。',
    outType: 'Skill', cover: '🧹',
    links: [{ label: '附件文档', url: 'https://alidocs.dingtalk.com/i/nodes/KGZLxjv9VG3d3k4xs6vZBa35V6EDybno' },
      { label: '作品海报', url: 'https://picui.ogmua.cn/s1/2026/08/10/6a79ac4f1f1fb.webp' }],
  },
  {
    no: '2.7', name: '财税账套智能生成与创建助手', owner: '杨绵绵', dept: '产研中心',
    track: '团队提效', seasonTrack: '创意设计赛道', group: '个人', submitted: '2026-08-07',
    award: '', finalState: '入围决赛未获奖',
    scene: '面向代账自动化产品的业务 / 产品 / 实施人员，解决财税知识门槛高、演示数据准备耗时；自然语言描述即可生成勾稽一致的财税内容并自动建账套。',
    outType: 'Skill', cover: '🧮',
    links: [{ label: '附件文档', url: 'https://alidocs.dingtalk.com/i/nodes/qnYMoO1rWxDbDrKMUjlRjwdGW47Z3je9' },
      { label: '作品海报', url: 'https://qr.dingtalk.com/page/yunpan?route=previewDentry&spaceId=29128768378&fileId=231566336730&type=file' }],
  },
  {
    no: '2.8', name: '往来核对生成器', owner: '潘鑫玲', dept: '中小微事业群',
    track: '客户赋能', seasonTrack: '创意设计赛道', group: '个人', submitted: '2026-08-04',
    award: '', finalState: '入围决赛未获奖',
    scene: '往来核对是会计期末结账必做环节，用于与老板核对已收款未开票、已付款未收票、长期挂账等涉税风险点。',
    outType: 'Skill', cover: '🔍',
    links: [{ label: '附件文档', url: 'https://alidocs.dingtalk.com/i/nodes/MNDoBb60VLa22bL4tmDN2m72JlemrZQ3' },
      { label: '作品海报', url: 'https://alidocs.dingtalk.com/i/nodes/Obva6QBXJwD00YvKuMwxAb2Y8n4qY5Pr' }],
  },
  {
    no: '2.9', name: '没有交接账务资料的非零申报账套，也可生成期初数据做账', owner: '邓闻倩', dept: '中小微事业群',
    track: '团队提效', seasonTrack: '创意设计赛道', group: '个人', submitted: '2026-07-31',
    award: '', finalState: '复赛淘汰',
    scene: '客户交接资料不齐又要急着做账报税时，用税局已申报财报表生成一致的科目余额表导入衔接，减少手动核实。',
    outType: 'Skill', cover: '📄',
    links: [{ label: '附件文档', url: 'https://alidocs.dingtalk.com/i/nodes/2Amq4vjg89gegjPpUmzbzaQYV3kdP0wQ' },
      { label: '作品海报', url: 'https://www.workbuddy.link/p/92Bjn1rOB5gZzzQ6l93TFc' }],
  },
  {
    no: '2.10', name: '库存商品科目，存货辅助核算明细账查询工具', owner: '彭文杰', dept: '中小微事业群',
    track: '团队提效', seasonTrack: '创意设计赛道', group: '个人', submitted: '2026-07-27',
    award: '', finalState: '入围决赛未获奖',
    scene: '解决唯易迁移至云帐房后历史凭证中 1405 库存商品科目开启存货辅助后，无法查询历史明细账 / 余额表的问题。',
    outType: '工具', cover: '🧾',
    links: [{ label: '作品海报', url: 'https://alidocs.dingtalk.com/i/nodes/P0MALyR8knNzBnblSYD4wmYDJ3bzYmDO' }],
  },
  {
    no: '3.1', name: '恋爱式哄客销售技巧', owner: '徐航', dept: '中小微事业群',
    track: '销售提效', seasonTrack: '业务增长赛道', group: '个人', submitted: '2026-08-06',
    award: '一等奖', finalState: '获奖',
    scene: '以「关系经营」为核心的销售沟通方法论，把恋爱相处之道翻译成销售场景里可执行、可复制、可培训的话术动作。',
    outType: '方法论 / 话术库', cover: '💞',
    links: [{ label: '附件文档', url: 'https://alidocs.dingtalk.com/i/nodes/N7dx2rn0JbZNZxQ7tNGPyjP5JMGjLRb3' },
      { label: '作品海报', url: 'https://picui.ogmua.cn/s1/2026/08/25/6a8d5f59b7b27.webp' }],
  },
  {
    no: '5.4', name: '服务质检CT', owner: '苏万灵', dept: '中小微事业群',
    track: '客户赋能', seasonTrack: '业务增长赛道', group: '团队', submitted: '2026-07-27',
    award: '团队入围奖', finalState: '获奖',
    scene: '服务中心每月需从大量聊天记录中人工筛选「不满意」评价并归因，重复耗时、标准难统一；通过 Skill 自动化，从数小时变几分钟。',
    outType: 'Skill', cover: '🩺',
    links: [{ label: '作品海报', url: 'https://alidocs.dingtalk.com/i/nodes/bva6QBXJwZRxvZ6acMLdYqXKVn4qY5Pr' }],
  },
  {
    no: '5.5', name: '数据哨兵 —— 基于 Skill 的实时动态看板', owner: '郭彦柳', dept: '中小微事业群',
    track: '团队提效', seasonTrack: '业务增长赛道', group: '团队', submitted: '2026-08-10',
    award: '团队入围奖', finalState: '获奖',
    scene: '产品推广期需回答「上线多少 / 用得好不好 / 产生多少消耗」，周度明细 20 万+ 行横跨多张 Excel，人工透视慢易错；看板把「上线→使用→消耗」串成一条线。',
    outType: 'Skill / 看板', cover: '🛰️',
    links: [{ label: '附件文档', url: 'https://alidocs.dingtalk.com/i/nodes/amweZ92PV6vyvD2NhMBr0jDZVxEKBD6p' },
      { label: '作品海报', url: 'https://alidocs.dingtalk.com/i/nodes/6LeBq413JAzez9xRh3jnZ9198DOnGvpb' }],
  },
];

const userByName = new Map(users.map((u) => [u.name, u]));
const cases = WORKS.map((w, i) => {
  const owner = userByName.get(w.owner);
  const id = `W${String(i + 1).padStart(2, '0')}`;
  return {
    id,
    track: w.track,
    title: w.name,
    summary: w.scene.slice(0, 60),
    pain_point: w.scene,
    input: `${w.dept} · ${w.group}参赛`,
    /** 真实作品不是「可直接抄的提示词」，此处放复用指引，避免误导成提示词案例 */
    prompt: `本作品为 Season3 大赛${w.seasonTrack}真实参赛作品（${w.group}组${w.finalState}${w.award ? ` · ${w.award}` : ''}）。\n产出形式：${w.outType}。\n复用方式：打开下方「附件」中的应用场景与实现过程文档照做；如需改造请先联系作者 ${w.owner}（${w.dept}）。`,
    output: w.outType,
    acceptance: [],
    level: '骨干层',
    tags: [w.seasonTrack, w.dept, ...(w.award ? [w.award] : [])],
    author_union_id: owner?.union_id ?? `manual_${w.owner}`,
    author_name: w.owner,
    like_count: 0,
    view_count: 0,
    reuse_count: 0,
    duration: '',
    cover: w.cover,
    status: '已发布',
    created_at: `${w.submitted} 12:00`,
    attachments: w.links.map((l, k) => ({
      id: `${id}-F${k + 1}`,
      name: l.label,
      size: '-',
      ext: 'link',
      note: l.url,
      url: l.url,
      driver: 'demo',
    })),
  };
});
/** 通讯录里查不到的作者（离职 / 未入册）：单列出来人工确认 */
const orphanAuthors = WORKS.filter((w) => !userByName.has(w.owner)).map((w) => w.owner);

/* ================================================================
 * 4. 以现有 state.json 为底，替换人员/案例/选题，清空业务流水
 * ============================================================== */
const prev = readJson(STATE_FILE);
const base = prev.data ?? {};

/** 业务流水：一律清空（用户拍板「清人员 + 业务，留配置骨架」） */
const CLEARED = [
  'periods', 'submits', 'scoreResults', 'experts', 'schedules', 'bookings', 'reviews',
  'assetApplies', 'assets', 'pointRecords', 'shopOrders', 'posts', 'comments', 'wbUsage',
  'auditLogs', 'messages', 'topicSelections', 'importJobs', 'importJobItems',
  'submitFlowLogs', 'reviewOverrides', 'sceneCards', 'attachmentFiles', 'scheduleRequests',
  'bounties',
];

/** 标签体系保留，member_count 按真实名单重算 */
const tags = (base.tags ?? []).map((t) => ({
  ...t,
  member_count: users.filter((u) => u.tags.includes(t.id)).length,
}));

const next = {
  ...base,
  depts,
  users,
  tags,
  cases,
  topics,
};
for (const k of CLEARED) next[k] = [];
/** 流程规则缺失时用默认 8 条安全路径兜底（与前端 DEFAULT_FLOW_RULES 一致） */
if (!next.submitFlowRules?.length) {
  next.submitFlowRules = [
    { id: 'FR1', from_status: 'SUBMITTED', to_status: ['SCORING_AI', 'REVIEWING', 'WITHDRAWN'], enabled: true, remark: '未跑分可退回重跑或直接送人工复核' },
    { id: 'FR2', from_status: 'SCORING_AI', to_status: ['SUBMITTED', 'AI_SCORED', 'SCORE_FAILED'], enabled: true, remark: '评分中可退回重跑' },
    { id: 'FR3', from_status: 'AI_SCORED', to_status: ['REVIEWING', 'SUBMITTED', 'SCORE_FAILED'], enabled: true, remark: '出分后可送复核或退回重跑' },
    { id: 'FR4', from_status: 'REVIEWING', to_status: ['REVIEWED', 'AI_SCORED'], enabled: true, remark: '复核中可完成或退回重审' },
    { id: 'FR5', from_status: 'REVIEWED', to_status: ['COMPLETED', 'REVIEWING'], enabled: true, remark: '复核完成 → 已完成（公示不再是前置条件）' },
    { id: 'FR6', from_status: 'COMPLETED', to_status: ['CONSENSUS', 'REVIEWED', 'ASSET_APPLYING'], enabled: true, remark: '完成后可标记共识或进入入库申请' },
    { id: 'FR7', from_status: 'CONSENSUS', to_status: ['ASSET_APPLYING', 'COMPLETED'], enabled: true, remark: '共识后进入入库或退回已完成' },
    { id: 'FR8', from_status: 'ASSET_APPLYING', to_status: ['ASSET_ONLINE', 'ASSET_REJECTED', 'COMPLETED'], enabled: true, remark: '入库申请可上线 / 驳回 / 退回' },
  ];
}

const outFile = path.join(LOCAL, 'state-real.json');
writeFileSync(outFile, JSON.stringify(next, null, 2), 'utf8');

console.log('=========== 真实数据装配结果 ===========');
console.log(`部门      ${depts.length} 个（钉钉实时）`);
console.log(`用户      ${users.length} 人（钉钉实时）`);
console.log(`  组织者  ${stat.organizer}   管理员 ${stat.admin}   负责人 ${stat.leader}   评委 ${stat.judge}   专家 ${stat.expert}   纯成员 ${stat.member}`);
console.log(`选题      ${topics.length} 条（来源：${path.basename(MD_FILE)}，全部「可选」并打「推荐选题」标签）`);
console.log(`案例      ${cases.length} 条（来源：钉钉文档标黄的 Season3 真实作品）`);
console.log(`清空集合  ${CLEARED.length} 个：${CLEARED.join(' / ')}`);
console.log(`保留配置  campaigns / scoreCards / assignmentTypes / boards / boardConfigs / shopItems / announcements / submitFlowRules`);
console.log(`通讯录外作者 ${orphanAuthors.length ? orphanAuthors.join('、') : '无'}`);
console.log(`产物      ${outFile}  (${(JSON.stringify(next).length / 1024).toFixed(0)} KB)`);

/* ---------- 可选：写本机 / 推线上 ---------- */
if (process.argv.includes('--apply')) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  if (existsSync(STATE_FILE)) copyFileSync(STATE_FILE, `${STATE_FILE}.bak-${stamp}`);
  writeFileSync(STATE_FILE, JSON.stringify({ data: next, version: (prev.version ?? 0) + 1, updated_by: '钉钉真实数据装配', updated_at: new Date().toISOString() }, null, 2), 'utf8');
  console.log(`✅ 已写入本机 ${STATE_FILE}（旧版本备份 .bak-${stamp}）`);
}

if (process.argv.includes('--push')) {
  const cur = await fetch(`${SITE}/api/state`).then((r) => r.json()).catch(() => null);
  const baseVersion = cur?.version ?? 0;
  const put = await fetch(`${SITE}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: next, baseVersion, by: '钉钉真实数据装配' }),
  });
  const j = await put.json();
  console.log(`${j.ok ? '✅' : '❌'} 线上推送 ${SITE} -> ${put.status} ${JSON.stringify(j).slice(0, 300)}`);
}
