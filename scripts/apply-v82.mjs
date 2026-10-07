#!/usr/bin/env node
/**
 * V8.2-10.07 需求数据装配（2026-10-07）
 * =================================================================
 * 来源：钉钉文档《AI赋能需求优化方案》→ 「# V8.2-10.07」四条
 *
 *   1. 批量导入专家名单及专家介绍（来源：《云帐房 WorkBuddy 大赛专家简介》，7 位）
 *   2. 作业提报支持「必须参加人员名单」+ 开放他人加入（首页 To Do 提醒 / 后台催办）
 *   3. 每周场景卡新建 —— 源文档需登录，素材待用户提供（本脚本不涉及）
 *   4. 11 条公司悬赏同步至管理后台（数据侧：确保归属为虚拟主体 COMPANY 且已发布）
 *
 * 用法：
 *   node scripts/apply-v82.mjs                 # 干跑（只打印计划）
 *   node scripts/apply-v82.mjs --apply         # 写本机 server/data/state.json（先备份）
 *   node scripts/apply-v82.mjs --apply --push  # 写本机 + PUT 线上（409 自动重试 3 次）
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const STATE_FILE = path.join(ROOT, 'server', 'data', 'state.json');
const SITE = process.env.SITE || 'https://aihrbp.yunzhangfang.com';
const BY = 'V8.2-10.07 需求装配';
const TODAY = '2026-10-07';
/** 与 src/constants/bounty.ts 保持一致（虚拟主体，非真实个人） */
const COMPANY_UNION_ID = 'COMPANY';

const APPLY = process.argv.includes('--apply');
const PUSH = process.argv.includes('--push');

const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
const prev = raw.data ?? raw;
const next = structuredClone(prev);

const byName = new Map((next.users ?? []).map((u) => [u.name, u]));

/* ================================================================
 * 1) 专家名单及介绍（7 位，来源《云帐房 WorkBuddy 大赛专家简介》）
 * ============================================================== */
/** dept_hint：文档口径的事业群归属，通讯录部门为空时兜底 */
const EXPERTS = [
  {
    name: '时海龙', dept_hint: '中小微事业群（区域团队）', title: '业务场景 AI 实战深耕者',
    cert: ['上届获奖'], expertise_tags: ['业务场景 AI 落地', '账务处理', '办公效率工具'],
    intro: '区域团队业务线中最早落地 AI 实战的人之一，业务场景理解深、AI 工具成熟度高。本届大赛共提交 3 件作品，为参赛数量最多的个人之一——《往来账龄分析工具》（二等奖）、《ClipQueue 批量粘贴工具》（入围决赛）、《PDF 工具箱》，形成多款可复用的小型成熟产品。',
  },
  {
    name: '余少峰', dept_hint: '中小微事业群 运营中心', title: 'AI 产品板块领军人',
    cert: ['官方认证'], expertise_tags: ['AI 能力边界', 'AI 知识体系', 'AI 与商业场景链接'],
    intro: '公司多款 AI 产品商业化负责人，对 AI 能力范围有系统化认知，主导对接腾讯 WorkBuddy、千问、豆包等各类渠道与工具，擅长将 AI 知识与商业落地打通，为团队提供方向性判断与资源对接。',
  },
  {
    name: '苏万灵', dept_hint: '中小微事业群（全国服务中心）', title: '客服服务与质检自动化专家',
    cert: ['上届获奖'], expertise_tags: ['客服全场景服务', '客服培训', '质检自动化'],
    intro: '代表作《服务质检 CT》获团队入围奖。将服务中心每月从海量聊天记录中人工筛选「不满意」评价、逐条归因的流程自动化，实现分钟级输出；自动生成 19 列标准 Excel 差评分析表（含 7 大统计板块）与 Word 分析报告，并制定红黄绿分层跟进策略；已在服务中心实际使用，支撑月度差评复盘与培训闭环管理。',
  },
  {
    name: '王顺泽', dept_hint: '福鹿事业部', title: 'WorkBuddy 全栈应用冠军',
    cert: ['上届获奖'], expertise_tags: ['产品设计', '订单全流程协同', 'WorkBuddy 全链路应用'],
    intro: '本届大赛个人组第一名。代表作《亮照业务支撑系统》获一等奖，打通 6 类岗位，串联千牛聊天、企微群、材料表单与工商进度全链路；在 WorkBuddy 上从 0 到 1 完成完整产品交付，是 AI 应用的全能型选手。',
  },
  {
    name: '桂万彬', dept_hint: '福鹿事业部', title: '业务闭环与内容增长专家',
    cert: ['上届获奖'], expertise_tags: ['用户增长', '业务流程闭环', '营销内容全链路'],
    intro: '偏业务侧用户增长，擅长用 AI 梳理业务流程闭环。代表作《销售&服务话术库一键生成》获二等奖，将销售经验沉淀为可检索话术库并接入小亮机器人；同时擅长内容生产，覆盖市场活动选题、文案、视频到投放的全套闭环。',
  },
  {
    name: '曹学成', dept_hint: '产研中心（税务专家部）', title: '团队 AI 落地组织者',
    cert: ['上届获奖'], expertise_tags: ['团队 AI 落地', '工作流卡点识别', 'AI 任务判定'],
    intro: '关联本届大赛团队赛第一名作品《AI 工单智能处理》，税务专家组率先以整个团队的知识与智慧为结晶，结合业务场景打造实地应用案例。该作品由 AI 解析工单自动执行「读单 → 定位任务 → 查日志 → 查知识库 → 查代码仓 → 给出结论 → 税务确认 → 生成回复」全流程。',
  },
  {
    name: '徐铭瑞', dept_hint: '职能中台（HR 条线）', title: 'AI 创新落地先锋',
    cert: ['上届获奖'], expertise_tags: ['AI 创新落地', '活动运营创意', '跨专业产品化'],
    intro: 'HR 伙伴（徐聪明），擅长从创新角度让 AI 落地。代表作《WorkBuddy 应用大赛比赛平台》获一等奖，从 0 到 1 搭建完整赛事平台（报名/展示/投票/打分/抽奖），使用人次 280+；另有《授课学堂素材批量下载器》将 5000 元迁移成本降为 0。体现了非专业、跨行人员也能通过对话驱动完成产品策划、开发、部署与修复的能力。',
  },
];

/** 已存在的 id 不重复占用：从 E7 起（种子演示数据占用 E1-E6） */
let expertSeq = 7;
const nextExpertId = () => {
  while ((next.experts ?? []).some((e) => e.id === `E${expertSeq}`)) expertSeq += 1;
  return `E${expertSeq}`;
};

const expertPlan = [];
for (const x of EXPERTS) {
  const u = byName.get(x.name);
  const exists = (next.experts ?? []).find((e) => e.name === x.name || (u && e.union_id === u.union_id));
  if (exists) { expertPlan.push({ ...x, action: '跳过（已存在）', id: exists.id }); continue; }
  const id = nextExpertId();
  expertSeq += 1;
  next.experts = [...(next.experts ?? []), {
    id,
    union_id: u?.union_id ?? '',
    name: x.name,
    /** User 的部门是数组 dept_names，无 dept_name 单值字段（与 src/utils 口径一致） */
    dept_name: u?.dept_names?.[0] || x.dept_hint,
    title: x.title,
    cert: x.cert,
    expertise_tags: x.expertise_tags,
    intro: x.intro,
    rating_avg: 5,
    serve_count: 0,
    status: '接诊中',
    points: 0,
  }];
  expertPlan.push({ ...x, action: u ? '新增（已关联通讯录）' : '新增（通讯录未匹配，留空 union_id）', id });
}

/* ================================================================
 * 2) 作业「必须参加人员名单」—— 以 Q4 主作业为例预置
 *    口径：考核分母（干部 T1 ∪ 核心骨干 T3）+ 组织者本人为「必修」，并开放他人主动加入（选修）
 * ============================================================== */
const REQUIRED_TAGS = ['T1', 'T3'];
const ME_ID = 'uQAkcBWeXVgDWRa3ZFiiUxgiEiE';
const targetType = next.assignmentTypes.find((t) => t.status === 'PUBLISHED')
  ?? next.assignmentTypes[0];

let participantPlan = { type: targetType?.name ?? '（无作业类型）', required: 0, open_join: false };
if (targetType) {
  const requiredUsers = (next.users ?? []).filter(
    (u) => (u.tags ?? []).some((t) => REQUIRED_TAGS.includes(t)) || u.union_id === ME_ID
  );
  /** 已有人选修 / 手工指定时保留，不覆盖组织者既有配置 */
  const existed = new Set((targetType.participants ?? []).map((p) => p.union_id));
  const added = requiredUsers.filter((u) => !existed.has(u.union_id)).map((u) => ({
    union_id: u.union_id,
    name: u.name,
    /** User 的部门是数组 dept_names，无 dept_name 单值字段 */
    dept_name: u.dept_names?.[0] ?? '',
    kind: 'REQUIRED',
    source: 'IMPORT',
    joined_at: TODAY,
  }));
  targetType.participants = [...(targetType.participants ?? []), ...added];
  targetType.open_join = true;
  participantPlan = {
    type: targetType.name,
    required: (targetType.participants ?? []).filter((p) => p.kind === 'REQUIRED').length,
    open_join: true,
    added: added.length,
  };
}

/* ================================================================
 * 4) 公司悬赏：确保 11 条归属虚拟主体 COMPANY 且处于已发布
 * ============================================================== */
const companyBounties = (next.bounties ?? []).filter((b) => b.owner_name === '公司' || b.owner_union_id === COMPANY_UNION_ID);
let bountyFixed = 0;
for (const b of companyBounties) {
  if (b.owner_union_id !== COMPANY_UNION_ID) { b.owner_union_id = COMPANY_UNION_ID; bountyFixed += 1; }
  b.owner_name = '公司';
  if (!b.points || b.points !== 200) { /* 需求口径：公司悬赏统一 200 分，非 200 的保持原值不动 */ }
}

/* ---------------- 计划输出 ---------------- */
console.log('=== V8.2-10.07 装配计划 ===');
console.log(`\n[1] 专家名单（${EXPERTS.length} 位）`);
for (const p of expertPlan) console.log(`    ${p.id} ${p.name}｜${p.title}｜${p.action}`);
console.log(`\n[2] 作业参加人员`);
console.log(`    ${participantPlan.type}：必修 ${participantPlan.required} 人（新增 ${participantPlan.added ?? 0}），开放他人加入 = ${participantPlan.open_join}`);
console.log(`\n[4] 公司悬赏：${companyBounties.length} 条，归属修正 ${bountyFixed} 条`);

if (!APPLY) {
  console.log('\n[干跑] 未写入。加 --apply 写本机，--apply --push 同步线上。');
  process.exit(0);
}

const bak = `${STATE_FILE}.bak-${Date.now()}`;
copyFileSync(STATE_FILE, bak);
writeFileSync(STATE_FILE, JSON.stringify({ ...raw, data: next }, null, 2), 'utf8');
console.log(`\n已写本机：${STATE_FILE}（备份 ${bak}）`);

if (!PUSH) process.exit(0);

async function push() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const cur = await fetch(`${SITE}/api/state`).then((r) => r.json());
    const payload = { data: next, baseVersion: cur.version, updated_by: BY };
    const res = await fetch(`${SITE}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`线上已更新 → version ${body.version ?? '?'}（第 ${attempt} 次尝试）`);
      return true;
    }
    console.log(`第 ${attempt} 次失败 ${res.status}：${body.message ?? JSON.stringify(body).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

const ok = await push();
console.log(ok ? '线上同步完成' : '线上同步失败（本机已写入，可重试 --push）');
process.exit(ok ? 0 : 1);
