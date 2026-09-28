import type { Dept, Tag, User, Campaign, AuditLog, AppMessage, Role } from './types';

export const DEPTS: Dept[] = [
  { dept_id: '1', parent_id: '0', name: '中小微事业群', level: 1, path: '中小微事业群' },
  { dept_id: '11', parent_id: '1', name: '华东大区', level: 2, path: '中小微事业群/华东大区' },
  { dept_id: '111', parent_id: '11', name: '苏南分公司', level: 3, path: '中小微事业群/华东大区/苏南分公司' },
  { dept_id: '112', parent_id: '11', name: '上海分公司', level: 3, path: '中小微事业群/华东大区/上海分公司' },
  { dept_id: '12', parent_id: '1', name: '华南大区', level: 2, path: '中小微事业群/华南大区' },
  { dept_id: '121', parent_id: '12', name: '广州分公司', level: 3, path: '中小微事业群/华南大区/广州分公司' },
  { dept_id: '122', parent_id: '12', name: '深圳分公司', level: 3, path: '中小微事业群/华南大区/深圳分公司' },
  { dept_id: '13', parent_id: '1', name: '华北大区', level: 2, path: '中小微事业群/华北大区' },
  { dept_id: '131', parent_id: '13', name: '北京分公司', level: 3, path: '中小微事业群/华北大区/北京分公司' },
  { dept_id: '132', parent_id: '13', name: '天津分公司', level: 3, path: '中小微事业群/华北大区/天津分公司' },
  { dept_id: '14', parent_id: '1', name: '西部大区', level: 2, path: '中小微事业群/西部大区' },
  { dept_id: '141', parent_id: '14', name: '成都分公司', level: 3, path: '中小微事业群/西部大区/成都分公司' },
  { dept_id: '15', parent_id: '1', name: '中台支持中心', level: 2, path: '中小微事业群/中台支持中心' },
  { dept_id: '151', parent_id: '15', name: '运营中台', level: 3, path: '中小微事业群/中台支持中心/运营中台' },
  { dept_id: '152', parent_id: '15', name: '赋能中台', level: 3, path: '中小微事业群/中台支持中心/赋能中台' },
];

export const deptName = (id: string) => DEPTS.find((d) => d.dept_id === id)?.name ?? id;
export const deptPath = (id: string) => DEPTS.find((d) => d.dept_id === id)?.path ?? id;

export const TAGS: Tag[] = [
  { id: 'T1', name: '干部', code: 'CADRE', is_default: true, is_assessment_scope: true, status: '启用', member_count: 39 },
  { id: 'T2', name: '核心39人', code: 'CORE39', is_default: true, is_assessment_scope: true, status: '启用', member_count: 39 },
  { id: 'T3', name: '骨干', code: 'BACKBONE', is_default: false, is_assessment_scope: false, status: '启用', member_count: 12 },
  { id: 'T4', name: '新人', code: 'NEWCOMER', is_default: false, is_assessment_scope: false, status: '启用', member_count: 6 },
  { id: 'T5', name: '外部顾问', code: 'EXTERNAL', is_default: false, is_assessment_scope: false, status: '停用', member_count: 2 },
];

/** [姓名, 主部门ID, 角色, 头衔, 是否部门负责人] */
type UserSeed = [string, string, Role[], string, boolean];

const CORE: UserSeed[] = [
  ['赵冰艳', '152', ['ORGANIZER', 'LEADER'], '事业群赋能负责人', true],
  ['王建国', '111', ['JUDGE', 'LEADER'], '苏南分公司负责人', true],
  ['李慧敏', '151', ['EXPERT', 'MEMBER'], '运营中台 · 高级财税顾问', false],
  ['陈志远', '121', ['JUDGE', 'LEADER'], '广州分公司负责人', true],
  ['刘晓东', '152', ['EXPERT', 'MEMBER'], '赋能中台 · AI 应用专家', false],
  ['杨丽华', '112', ['EXPERT', 'MEMBER'], '上海分公司 · 客户成功经理', false],
  ['黄振宇', '131', ['JUDGE', 'LEADER'], '北京分公司负责人', true],
  ['周文静', '151', ['EXPERT', 'MEMBER'], '运营中台 · 数据分析师', false],
  ['吴海涛', '122', ['EXPERT', 'MEMBER'], '深圳分公司 · 销售主管', false],
  ['徐明霞', '141', ['EXPERT', 'MEMBER'], '成都分公司 · 财税顾问', false],
  ['孙立新', '11', ['LEADER'], '华东大区总经理', true],
  ['马晓峰', '12', ['LEADER'], '华南大区总经理', true],
  ['朱婉清', '13', ['LEADER'], '华北大区总经理', true],
  ['胡志强', '14', ['LEADER'], '西部大区总经理', true],
  ['郭美玲', '112', ['LEADER'], '上海分公司负责人', true],
  ['何俊杰', '122', ['LEADER'], '深圳分公司负责人', true],
  ['林素芬', '132', ['LEADER'], '天津分公司负责人', true],
  ['罗建华', '141', ['LEADER'], '成都分公司负责人', true],
  ['郑雅琳', '111', ['MEMBER'], '苏南分公司 · 会计主管', false],
  ['梁伟强', '111', ['MEMBER'], '苏南分公司 · 客户成功经理', false],
  ['谢婉如', '112', ['MEMBER'], '上海分公司 · 财税顾问', false],
  ['唐志明', '112', ['MEMBER'], '上海分公司 · 销售经理', false],
  ['韩小雨', '121', ['MEMBER'], '广州分公司 · 会计主管', false],
  ['曹国庆', '121', ['MEMBER'], '广州分公司 · 客户成功经理', false],
  ['彭丽芳', '152', ['ORGANIZER', 'MEMBER'], '赋能中台 · 运营专员', false],
  ['董春生', '151', ['ADMIN', 'MEMBER'], '运营中台 · IT 负责人', false],
  ['袁晓梅', '151', ['ADMIN', 'MEMBER'], '运营中台 · 系统管理员', false],
  ['曾庆丰', '152', ['SKILL_ADMIN', 'MEMBER'], '赋能中台 · 技能管理员（主责）', false],
  ['苏慧珊', '152', ['SKILL_ADMIN', 'MEMBER'], '赋能中台 · 技能管理员（备份）', false],
  ['邓超群', '131', ['MEMBER'], '北京分公司 · 财税顾问', false],
  ['冯少华', '131', ['MEMBER'], '北京分公司 · 销售经理', false],
  ['蒋丽娟', '132', ['MEMBER'], '天津分公司 · 会计主管', false],
  ['卢伟民', '132', ['MEMBER'], '天津分公司 · 客户成功经理', false],
  ['于海燕', '122', ['MEMBER'], '深圳分公司 · 财税顾问', false],
  ['傅明杰', '141', ['MEMBER'], '成都分公司 · 会计主管', false],
  ['蔡国庆', '141', ['MEMBER'], '成都分公司 · 销售经理', false],
  ['潘晓婷', '151', ['MEMBER'], '运营中台 · 运营专员', false],
  ['杜鹏飞', '151', ['MEMBER'], '运营中台 · 服务质量专员', false],
  ['叶春燕', '111', ['MEMBER'], '苏南分公司 · 财税顾问', false],
];

const BACKBONE_NAMES = [
  '范晓东', '邱丽娜', '姚建国', '方志伟', '石文君', '龚海燕',
  '陆俊豪', '侯美琪', '洪志强', '阮雪梅', '汪立诚', '施雅芳',
];

/** 确定性伪随机，保证每次刷新数据一致 */
export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260919);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;

function buildUser(seed: UserSeed, idx: number, tags: string[]): User {
  const [name, deptId, roles, title, isLeader] = seed;
  const leaderDept = isLeader ? [deptId] : [];
  const hasBroad = roles.some((r) => ['ORGANIZER', 'ADMIN', 'SKILL_ADMIN'].includes(r));
  return {
    union_id: `uid${String(idx + 1).padStart(3, '0')}`,
    name,
    job_number: `Y${String(2000 + idx)}`,
    mobile: `13${int(1, 9)}****${int(1000, 9999)}`,
    dept_id_list: [deptId],
    dept_names: [deptPath(deptId)],
    title,
    roles,
    scope_type: hasBroad ? 'ALL' : isLeader ? 'DEPT_TREE' : 'SELF',
    scope_dept_ids: hasBroad ? ['1'] : leaderDept,
    tags,
    status: 1,
    points: int(60, 860),
    is_dept_leader: isLeader,
    /** V4.0 CR-01：管辖部门（缺省由 is_dept_leader 推导，此处显式落库便于多部门兼任扩展） */
    managed_dept_ids: leaderDept,
    created_at: '2026-09-21 09:00',
  };
}

export const USERS: User[] = [
  ...CORE.map((s, i) => buildUser(s, i, ['T1', 'T2'])),
  ...BACKBONE_NAMES.map((name, i) => {
    const deptId = pick(['111', '112', '121', '122', '131', '132', '141', '151', '152']);
    return buildUser([name, deptId, ['MEMBER'], '业务骨干', false] as UserSeed, 39 + i, ['T3']);
  }),
];

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'C2026Q4',
    name: '2026 Q4 · AI 应用实践（本届）',
    start_date: '2026-09-21',
    end_date: '2026-10-13',
    status: '进行中',
    stages: [
      { name: 'W1 启动清障', start: '2026-09-21', end: '2026-09-24' },
      { name: 'W2 场景选型', start: '2026-09-23', end: '2026-09-30' },
      { name: 'W3 制作陪跑', start: '2026-09-28', end: '2026-10-10' },
      { name: 'W4 评分公示', start: '2026-10-11', end: '2026-10-13' },
    ],
    visibility: { leaderboard: '全员', workDetail: '本部门', comment: '不公示' },
    publicSwitch: true,
    pointRules: [
      { action: '提交作业（达标）', points: 50 },
      { action: '认领悬赏并通过', points: 30, cap: 300 },
      { action: '专家接诊（每次）', points: 20, cap: 200 },
      { action: '社区发帖', points: 2, cap: 60 },
      { action: '社区精华帖', points: 10 },
      { action: '作品入库', points: 100 },
    ],
  },
  {
    id: 'C2026Q3',
    name: '2026 Q3 · 首届激活（已归档）',
    start_date: '2026-06-01',
    end_date: '2026-07-15',
    status: '已结束',
    stages: [{ name: '全程', start: '2026-06-01', end: '2026-07-15' }],
    visibility: { leaderboard: '全员', workDetail: '本部门', comment: '不公示' },
    publicSwitch: true,
    pointRules: [],
  },
];

export const AUDIT_LOGS: AuditLog[] = [
  { id: 'A1', operator: '赵冰艳', action: '发布案例', target: 'A1 客户月度经营体检报告', detail: '状态 草稿 → 已发布', ip: '10.12.3.11', created_at: '2026-09-21 09:12' },
  { id: 'A2', operator: '赵冰艳', action: '新建作业类型', target: '2026 Q4 AI 应用实践作业', detail: '绑定评分卡 大赛四维评分卡 v1', ip: '10.12.3.11', created_at: '2026-09-21 09:40' },
  { id: 'A3', operator: '董春生', action: '通讯录同步', target: '全量同步', detail: '新增 51 人 / 更新 0 人 / 部门 15', ip: '10.12.8.2', created_at: '2026-09-21 02:00' },
  { id: 'A4', operator: '赵冰艳', action: '悬赏审核', target: 'B-003 客户续约异议应对库', detail: '通过，积分调整为 200', ip: '10.12.3.11', created_at: '2026-09-22 14:20' },
  { id: 'A5', operator: '董春生', action: '标签调整', target: '标签：干部', detail: '批量打标 +3 人（按部门：成都分公司）', ip: '10.12.8.2', created_at: '2026-09-22 16:05' },
  { id: 'A6', operator: '曾庆丰', action: '入库上架', target: '客户体检报告生成器 v1.2', detail: '可见范围：全员', ip: '10.12.5.9', created_at: '2026-09-23 10:31' },
  { id: 'A7', operator: '王建国', action: '评委复核', target: 'WB-A1-P1-0007', detail: '四维打分合计 86，抽查结论 通过', ip: '10.12.2.44', created_at: '2026-09-24 11:02' },
  { id: 'A8', operator: '袁晓梅', action: '功能开关', target: '社区模块', detail: '灰度 2：按部门放量（华东/华南）', ip: '10.12.8.7', created_at: '2026-09-24 15:18' },
  { id: 'A9', operator: '赵冰艳', action: '公示发布', target: '本周榜单', detail: '公示口径：全员可见', ip: '10.12.3.11', created_at: '2026-09-25 09:00' },
  { id: 'A10', operator: '董春生', action: '管理员数据同步', target: 'WorkBuddy 用量', detail: '同步 51 条，数据截止 T-1', ip: '10.12.8.2', created_at: '2026-09-25 02:00' },
  { id: 'A11', operator: '刘晓东', action: '专家放号', target: '2026-09-28 ~ 10-04 排班', detail: '放出 12 个号源', ip: '10.12.6.13', created_at: '2026-09-25 10:44' },
  { id: 'A12', operator: '赵冰艳', action: '评分卡改版', target: '大赛四维评分卡 v1 → v2', detail: '影响 14 个未评分提报', ip: '10.12.3.11', created_at: '2026-09-26 17:20' },
];

export const MESSAGES: AppMessage[] = [
  { id: 'M1', union_id: 'all', type: '提报截止提醒', title: '第 1 期作业截止提醒', content: '「2026 Q4 AI 应用实践作业」第 1 期将于 10-13 18:00 截止，请尽快提报。', channel: '钉钉待办', status: '未读', sent_at: '2026-09-25 09:00' },
  { id: 'M2', union_id: 'all', type: '新案例发布', title: '新案例：流失风险预警与挽回包', content: '客户赋能赛道新增骨干层案例，可直接抄提示词。', channel: '群通知', status: '未读', sent_at: '2026-09-24 15:30' },
  { id: 'M3', union_id: 'uid001', type: '悬赏待审核', title: '有 1 条成员悬赏待审核', content: '梁伟强提交了「客户对账差异自动核对」悬赏申请。', channel: '钉钉待办', status: '未读', sent_at: '2026-09-24 11:12' },
  { id: 'M4', union_id: 'all', type: '专家放号', title: '刘晓东已放出下周号源', content: '擅长：提示词调优 / Skill 打包，共 12 个号源可约。', channel: '钉钉待办', status: '未读', sent_at: '2026-09-25 10:44' },
  { id: 'M5', union_id: 'uid002', type: '评分完成', title: '你的作业已出分', content: 'WB-A1-P1-0007 最终得分 86.4，点击查看评分详情。', channel: '钉钉待办', status: '已读', sent_at: '2026-09-24 16:20' },
  { id: 'M6', union_id: 'all', type: '公示发布', title: '本周榜单已公示', content: '提交率 62%，华东大区暂列第一。', channel: '群通知', status: '已读', sent_at: '2026-09-25 09:05' },
  { id: 'M7', union_id: 'uid007', type: '抽查通知', title: '你的作业进入 3 问抽查', content: '前 10 名必做抽查，请在 24 小时内完成 3 问填写。', channel: '钉钉待办', status: '未读', sent_at: '2026-09-25 14:00' },
  { id: 'M8', union_id: 'uid020', type: '入库结果', title: '入库申请已通过', content: '「客户体检报告生成器」已上架企业 Skill 库。', channel: '钉钉待办', status: '已读', sent_at: '2026-09-23 10:35' },
  { id: 'M9', union_id: 'all', type: '商城上新', title: '积分商城上新：无线降噪耳机', content: '3,200 积分起兑，库存 20 件。', channel: '群通知', status: '未读', sent_at: '2026-09-23 09:00' },
  { id: 'M10', union_id: 'uid014', type: '就诊完成', title: '请为本次就诊评价', content: '刘晓东 · 提示词调优 1v1 已完成，24 小时内可评价。', channel: '钉钉待办', status: '未读', sent_at: '2026-09-25 17:10' },
];
