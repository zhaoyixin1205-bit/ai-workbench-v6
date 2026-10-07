/** PRD 5.4.1 核心数据实体定义（字段只增不删，预留 ext_json / tenant_id） */

export type Role =
  | 'MEMBER'
  | 'LEADER'
  | 'JUDGE'
  | 'EXPERT'
  | 'ORGANIZER'
  | 'SKILL_ADMIN'
  | 'ADMIN'
  | 'VIEWER';

export const ROLE_LABEL: Record<Role, string> = {
  MEMBER: '普通成员',
  LEADER: '团队负责人',
  JUDGE: '评委',
  EXPERT: '问诊专家',
  ORGANIZER: '组织者',
  SKILL_ADMIN: '技能管理员',
  ADMIN: '系统管理员',
  VIEWER: '观众',
};

export type Track = '客户赋能' | '团队提效' | '销售提效';
export const TRACKS: Track[] = ['客户赋能', '团队提效', '销售提效'];

export type Level = '干部层' | '骨干层';
export type Channel = '通道一·用现成 Skill' | '通道二·自建 Skill';

export type ScopeType = 'SELF' | 'DEPT_TREE' | 'ALL';

export interface Dept {
  dept_id: string;
  parent_id: string;
  name: string;
  level: number;
  path: string;
}

export interface Tag {
  id: string;
  name: string;
  code: string;
  is_default: boolean;
  is_assessment_scope: boolean;
  status: '启用' | '停用';
  member_count?: number;
}

export interface User {
  union_id: string;
  name: string;
  avatar?: string;
  mobile?: string;
  job_number: string;
  dept_id_list: string[];
  dept_names: string[];
  title?: string;
  roles: Role[];
  scope_type: ScopeType;
  scope_dept_ids: string[];
  tags: string[];
  status: 0 | 1 | 2 | 3 | 99; // 0预注册 1已激活 2已停用 3已离职回收 99已删除(软删·V4.0新增)
  points: number;
  is_dept_leader: boolean;
  created_at: string;
  /** V4.0 CR-01：兼任/多部门管辖的部门 ID 列表；缺省时由 is_dept_leader 推导为主部门 */
  managed_dept_ids?: string[];
  /** V4.0 CR-11：来源区分；DINGTALK=钉钉映射，MANUAL=手工/导入。缺省 DINGTALK */
  source?: 'DINGTALK' | 'MANUAL';
  /**
   * @deprecated V4.0 CR-01 + U-1 结案：**负责人（LEADER）不再作为独立角色字段**。
   * 字段仅为历史数据兼容保留，**不参与任何页面展示与导出**，勿在新代码里读写。
   */
  leader_role?: Role;
}

/* ------------------------------------------------------------------ *
 * U-1 结案口径：LEADER 由「角色」降级为「派生属性」
 * 冰艳 2026-09-22 拍板「不保留」。范围为「后台用户列表 + 导出」，
 * 不含路由授权（属 §6.2 / CR-12，未改动）与身份切换器（属 CR-02，未改动）。
 * ------------------------------------------------------------------ */

/** 对外展示的有效角色：剔除 LEADER；若剔除后为空则兜底为普通成员 */
export function effectiveRoles(u: Pick<User, 'roles'>): Role[] {
  const rest = u.roles.filter((r) => r !== 'LEADER');
  return rest.length ? rest : (['MEMBER'] as Role[]);
}

/** 是否部门负责人：以 is_dept_leader 为准；老数据 roles 里仍残留 LEADER 时向下兼容 */
export function isDeptLeader(u: Pick<User, 'is_dept_leader' | 'roles'>): boolean {
  return !!u.is_dept_leader || u.roles.includes('LEADER');
}

export interface Campaign {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: '进行中' | '已结束' | '未开始';
  stages: { name: string; start: string; end: string }[];
  /** Q9 公示口径 */
  visibility: {
    leaderboard: '全员' | '本部门' | '仅组织者';
    workDetail: '全员' | '本部门' | '仅组织者';
    comment: '全员' | '本部门' | '不公示';
  };
  publicSwitch: boolean;
  pointRules: { action: string; points: number; cap?: number }[];
}

/**
 * V7.1：「待组织者自行创建届次」后 campaigns 可能是空数组，
 * 而全站有 11 个组件直接读 `campaign.id / name / stages / pointRules / visibility`，
 * 空数组会让 `db.campaigns[0]` 变成 undefined 从而整页白屏。
 * 这里给一个结构完整、内容为空的占位届次，保证任何时刻 campaign 都不是 undefined。
 * 页面可用 store 的 `hasCampaign` 判断是否处于空态并引导创建。
 */
export const EMPTY_CAMPAIGN: Campaign = {
  id: '__EMPTY__',
  name: '（尚未创建届次）',
  start_date: '',
  end_date: '',
  status: '未开始',
  stages: [],
  visibility: { leaderboard: '全员', workDetail: '本部门', comment: '不公示' },
  publicSwitch: false,
  pointRules: [],
};

/** 判断是否为占位届次（空态）。用 id 判定，不依赖 name 文案 */
export function isEmptyCampaign(c: Campaign | undefined): boolean {
  return !c || c.id === EMPTY_CAMPAIGN.id;
}

/**
 * V4.1：可直接安装的 Skill
 * 三种承载方式可并存（文字说明 / 上传压缩包 / 下载链接），由发布者任选其一或组合：
 *  - UPLOAD：上传 .zip 等 Skill 压缩包（纯前端 mock，只登记文件名与大小，不落二进制）
 *  - LINK  ：填一个下载链接
 *  - note  ：安装步骤 / 用法说明（文字框）
 */
export interface SkillPackage {
  id: string;
  type: 'UPLOAD' | 'LINK';
  /** Skill 名称 */
  name: string;
  /** 版本，如 v1.2.0（可选） */
  version?: string;
  /** 安装步骤 / 用法说明 */
  note?: string;
  /** UPLOAD：文件名 */
  file_name?: string;
  /** UPLOAD：人类可读体积，如 128 KB */
  file_size?: string;
  /** LINK：下载链接 */
  url?: string;
}

/** V4.1：补充信息 / 附件（非必填，可上传各类型文件） */
export interface Attachment {
  id: string;
  /** 文件名 */
  name: string;
  /** 人类可读体积 */
  size: string;
  /** 扩展名（小写，不含点），用于选文件图标 */
  ext: string;
  /** 说明（可选） */
  note?: string;
  /** V6.0 CR-31：真实文件 id（可下载）；为空表示演示态未落真实文件 */
  file_id?: string;
  /** V6.0 CR-31：下载代理地址；演示态为空串 */
  url?: string;
  /** V6.0 CR-31：存储驱动；demo = 文件服务不可用时的降级态 */
  driver?: 'local' | 's3' | 'pg' | 'demo';
}

/**
 * V6.0 CR-31：真实文件记录（U-12 结案，A-39 结案）。
 * 此前附件「只登记文件名与体积、不落真实文件、无法下载」；接入文件服务后，
 * 每个上传都会在服务端落盘并在此留下可下载、可校验、可软删的元数据。
 * driver = 'demo' 表示文件服务不可用时的降级态（仅登记元数据，url 为空）。
 */
export interface AttachmentFile {
  id: string;
  /** 业务归属：案例 Skill 包 / 案例附件 / 作业提报 / 悬赏方案 */
  biz_type: 'CASE_SKILL' | 'CASE_ATTACH' | 'SUBMIT' | 'BOUNTY_SOLUTION';
  biz_id: string;
  name: string;
  ext: string;
  /** 字节数（人类可读体积由 formatSize 派生，不落库两份口径） */
  size: number;
  driver: 'local' | 's3' | 'pg' | 'demo';
  /** 服务端对象键；前端不直接使用（下载走服务端代理，不暴露真实路径） */
  object_key: string;
  /** 下载代理地址；demo 态为空串 */
  url: string;
  uploaded_by: string;
  uploaded_at: string;
  is_deleted: boolean;
  /** zip 包结构校验结论（仅 zip 有值）：服务端解包后校验是否含 SKILL.md 与 manifest.yaml */
  zip_checked?: boolean;
  zip_valid?: boolean;
  /** 缺失的必含文件清单，用于给出明确提示而非笼统报错 */
  zip_missing?: string[];
}

/** 体积格式化：字节 → 人类可读（供上传组件与展示共用，保证口径一致） */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface CaseItem {
  id: string;
  track: Track;
  title: string;
  summary: string;
  pain_point: string;
  input: string;
  prompt: string;
  output: string;
  acceptance: string[];
  level: Level;
  tags: string[];
  author_union_id: string;
  author_name: string;
  like_count: number;
  view_count: number;
  reuse_count: number;
  duration: string;
  cover: string;
  status: '已发布' | '草稿' | '已下线';
  /** V4.0 CR-08：案例可见范围（真正落库的主体）。缺省表示沿用旧行为=全员可见 */
  visible_subjects?: ScopeSubject[];
  created_at: string;
  /** V4.1：可直接安装的 Skill（开关 caseSkillPackage 关闭时全站不展示） */
  skill_packages?: SkillPackage[];
  /** V4.1：补充信息 / 附件（非必填，各类型文件） */
  attachments?: Attachment[];
  /** V6.0 CR-28：软删标记（删除一律软删并留痕，实体不物理移除） */
  is_deleted?: boolean;
  deleted_at?: string;
}

/**
 * V6.0 CR-28：每周场景卡（30 秒学一个知识点）。
 * 此前场景卡由 `cases.slice(0,6)` 派生 —— 无独立实体、无法新建 / 下线 / 删除。
 * 新增实体后由内容管理独立 CRUD；派生数据源保留为 `source_case_id` 以便回溯。
 */
export interface SceneCard {
  id: string;
  title: string;
  /** 一句话知识点（≤40 字，卡片流直接展示） */
  summary: string;
  /** 30 秒能看完的正文（≤300 字） */
  content: string;
  track: Track;
  emoji: string;
  /** 草稿 / 已发布 / 已下线 */
  status: 'DRAFT' | 'PUBLISHED' | 'OFFLINE';
  tags?: string[];
  /** 归属周次，如 2026-W40；用于「本周」筛选 */
  week?: string;
  view_count: number;
  pushed_at?: string;
  published_at?: string;
  offline_at?: string;
  created_by?: string;
  created_at?: string;
  /** 由历史案例迁移而来的场景卡保留原案例 id，点击仍可进案例详情 */
  source_case_id?: string;
  /** V6.0 CR-28：软删标记 */
  is_deleted?: boolean;
  deleted_at?: string;
}

export interface Topic {
  id: string;
  case_id: string;
  title: string;
  difficulty: '易' | '中' | '难';
  expected_output: string;
  /** @deprecated V4.0 CR-03：取消「干部层/骨干层」受众分层，字段保留仅作历史与导出兼容（对应 audience_level） */
  suggest_level: Level;
  track: Track;
  status: '可选' | '已被选' | '已关闭';
  /** @deprecated V4.0 CR-03：选题改为非排斥后不再记录唯一选中人；仅保留历史读取 */
  picked_by?: string;
  /** V4.0 CR-03：发布者自选标签，用于筛选与相似推荐。缺省 [] */
  tags?: string[];
  /** V4.0 CR-03：可重复选择上限；0=不限（默认），1=回到旧排他行为 */
  select_limit?: number;
  /** V6.0 CR-17：是否为用户在「其他」中填写的自定义选题 */
  is_custom?: boolean;
  /** V6.0 CR-17：创建人（自定义选题为填写者本人） */
  created_by?: string;
  /** V6.0 CR-17：可见性。自定义选题默认 PRIVATE（仅本人与组织者可见），组织者可公开 */
  visibility?: 'PRIVATE' | 'PUBLIC';
  /** V6.0 CR-28：软删标记（删除一律软删并留痕） */
  is_deleted?: boolean;
  deleted_at?: string;
}

/** V4.0 CR-03/CR-04：选题记录（非排斥，同一选题可被多人选中） */
export interface TopicSelection {
  id: string;
  topic_id: string;
  union_id: string;
  selected_at: string;
  status?: '已选' | '已提报' | '已完成';
}

/** V4.0 CR-08：权限范围选择的真实主体（取代「只选了文案但没选到人」的旧选择器） */
export interface ScopeSubject {
  type: 'ALL' | 'DEPT' | 'ROLE' | 'TAG' | 'USER';
  id: string;
  name: string;
}

/** V4.0 CR-11：批量导入回执 */
export interface ImportJob {
  id: string;
  batch_no: string;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  created_at: string;
}
export interface ImportJobItem {
  id: string;
  job_id: string;
  row: number;
  name: string;
  result: '成功' | '失败' | '跳过';
  reason?: string;
}

export type BountyStatus =
  | 'MEMBER_DRAFT'
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'CLAIMED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'EXPIRED';

export interface Bounty {
  id: string;
  title: string;
  pain_point: string;
  expected_output: string;
  points: number;
  track: Track;
  owner_union_id: string;
  owner_name: string;
  source: '组织者发布' | '成员发布';
  status: BountyStatus;
  claimant_union_id?: string;
  claimant_name?: string;
  due_date: string;
  reject_reason?: string;
  desensitized: boolean;
  created_at: string;
  /** @deprecated V6.0 CR-20：结构化方案上线后改为 solution_fields；旧值自动映射为 solution_fields.scene_desc（字段保留不删） */
  solution?: string;
  /** V6.0 CR-20：结构化方案（与作业提报通用模板同构） */
  solution_fields?: {
    scene_desc?: string;
    output_sample?: string;
    skill_used?: string;
    before_after?: string;
  };
  /** V6.0 CR-20：方案附件（白名单同作业，单文件 ≤50MB，最多 5 个） */
  solution_attachments?: { name: string; size: string }[];
  /** V6.0 CR-21：方案版本链 —— 每次「修改」生成新版本，原版本保留不覆写 */
  solution_versions?: SolutionVersion[];
  /** V6.0 CR-21：补充记录 —— 仅追加资料，不改状态、不改积分 */
  supplements?: SolutionSupplement[];
  /** V6.0 CR-21：已使用的「修改」次数（上限可配置，默认 3） */
  solution_modify_count?: number;
}

/** V6.0 CR-21：方案版本（每次修改生成，原版本保留留痕） */
export interface SolutionVersion {
  id: string;
  version: number;
  fields: NonNullable<Bounty['solution_fields']>;
  attachments: { name: string; size: string }[];
  /** 修改说明（≥10 字） */
  note: string;
  operator: string;
  created_at: string;
}

/** V6.0 CR-21：方案补充（追加资料，不影响状态与积分） */
export interface SolutionSupplement {
  id: string;
  content: string;
  attachments: { name: string; size: string }[];
  operator: string;
  created_at: string;
}

/* ---------- M3 作业提报 ---------- */
export interface AssignmentType {
  id: string;
  code: string;
  name: string;
  campaign_id: string;
  track?: Track;
  target_scope: string;
  /** V4.0 CR-08：真正落库的提报对象主体（部门/角色/标签/人员）。缺省时回退读 target_scope（旧文案值） */
  target_subjects?: ScopeSubject[];
  form_template: '通用作业模板' | '双通道大赛模板' | 'Skill 包模板';
  custom_fields: { name: string; type: string; required: boolean }[];
  allow_multi: boolean;
  max_times: number;
  allow_override: boolean;
  late_rule: string;
  score_card_id: string;
  score_card_version: string;
  points_rule: string;
  need_review: boolean;
  visible_scope: '全员' | '本部门' | '仅组织者';
  /** V4.0 CR-08：真正落库的可见范围主体。缺省时回退读 visible_scope（旧文案值） */
  visible_subjects?: ScopeSubject[];
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
}

export type PeriodStatus = 'UPCOMING' | 'OPEN' | 'SCORING' | 'CLOSED';
export interface AssignmentPeriod {
  id: string;
  type_id: string;
  seq: number;
  start_at: string;
  end_at: string;
  status: PeriodStatus;
}

export type SubmitStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'SCORING_AI'
  | 'AI_SCORED'
  | 'REVIEWING'
  | 'REVIEWED'
  | 'SPOT_CHECK'
  | 'PASSED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'ASSET_APPLYING'
  | 'ASSET_ONLINE'
  | 'ASSET_REJECTED'
  | 'WITHDRAWN'
  | 'SCORE_FAILED'
  /** V6.0 CR-19：全流程结束（公示不再是前置条件） */
  | 'COMPLETED'
  /** V6.0 CR-19：已共识（可选态，组织者手动标记，不设自动条件） */
  | 'CONSENSUS';

export interface AssignmentSubmit {
  id: string;
  code: string;
  type_id: string;
  period_id: string;
  union_id: string;
  name: string;
  dept_name: string;
  seq_no: number;
  track: Track;
  channel: Channel;
  title: string;
  scene_desc: string;
  before_after?: string;
  output_sample: string;
  skill_used: string;
  attachments: { name: string; size: string }[];
  desensitized: boolean;
  visible_scope: '全员' | '本部门' | '仅组织者';
  status: SubmitStatus;
  ai_score?: number;
  judge_score?: number;
  final_score?: number;
  score_card_version: string;
  submitted_at: string;
  late: boolean;
  /** @deprecated V4.0 CR-07：三问抽查降级为可选高级项（judge.deepSpotCheck），字段保留读取不物理删除 */
  spot_check?: { q1: string; q2: string; q3: string; result: '通过' | '不通过'; by: string };
  /** V4.0 CR-07：抽查简化为一次「确认真实性」，确认人取钉钉身份不可编辑 */
  confirmed?: { by: string; at: string; result: '真实' | '存疑'; note?: string };
  proxy_by?: string;
  proxy_reason?: string;
  /** V4.0 CR-04：关联选题（我的选题 → 作业提报） */
  topic_id?: string;
  /** V6.0 CR-18：「其他·自定义」选题名（≤30 字）；与 topic_id 二选一 */
  custom_topic?: string;
  /**
   * V6.0 CR-19：公示标记位（与状态机解耦）。
   * 原 PUBLISHED 状态保留不删（历史数据兼容），但不再是入库的前置条件。
   */
  is_published?: boolean;
  published_by?: string;
  published_at?: string;
  /** V6.0 CR-19：已共识标记（U-6 拍板：组织者手动标记 + 留痕，不设自动触发条件） */
  consensus_by?: string;
  consensus_at?: string;
}

/* ---------- M5 评分卡 ---------- */
export interface ScoreDimension {
  id: string;
  name: string;
  weight: number;
  max_score: number;
  standard: string;
  levels: { level: string; range: string; desc: string }[];
  sort: number;
  /**
   * V7.0 CR-34：档位与标准的「纯文字说明」版本（确认项 1：档位与标准就是一段文字，可编辑即可）。
   * 缺省时界面上以 levels 拼装展示（旧数据兼容），编辑后写入本字段；
   * levels 保留不删（字段只增不删），历史评分结果仍按 card_id + version 追溯。
   */
  level_text?: string;
}
export interface ScoreCard {
  id: string;
  name: string;
  version: string;
  total_rule: '加权求和' | '去极值平均' | '归一化百分制';
  pass_line: number;
  ai_weight: number;
  judge_weight: number;
  status: '启用' | '停用' | '草稿';
  bind_target: string;
  dimensions: ScoreDimension[];
  updated_at: string;
  /** V6.0 CR-24：软删标记（删除一律软删，禁止物理删除） */
  is_deleted?: boolean;
  deleted_at?: string;
  /** V6.0 CR-24：复制来源（复制生成副本草稿，不复制绑定关系） */
  copied_from?: string;
}

/** V6.0 CR-23：流程编排白名单规则（from_status → 允许的 to_status 集合） */
export interface SubmitFlowRule {
  id: string;
  from_status: SubmitStatus;
  to_status: SubmitStatus[];
  /** 是否允许（关闭后该条路径整体禁用，无需删记录） */
  enabled: boolean;
  remark?: string;
}

/** V6.0 CR-23：流程流转日志（只增不改） */
export interface SubmitFlowLog {
  id: string;
  submit_id: string;
  from_status: SubmitStatus;
  to_status: SubmitStatus;
  operator: string;
  /** 理由必填（≥10 字） */
  reason: string;
  created_at: string;
}

/** V6.0 CR-25：复核结论覆盖（覆盖不覆写，新增记录保留原结论） */
export interface ReviewOverride {
  id: string;
  submit_id: string;
  original_result: string;
  new_result: string;
  reason: string;
  operator: string;
  created_at: string;
}

export interface ScoreResult {
  id: string;
  target_type: 'submit' | 'bounty';
  target_id: string;
  card_id: string;
  card_version: string;
  source: 'AI' | 'JUDGE';
  dim_scores: Record<string, number>;
  total: number;
  reason: string;
  scorer_union_id: string;
  scorer_name: string;
  created_at: string;
}

/* ---------- M4 专家门诊 ---------- */
export interface Expert {
  id: string;
  union_id: string;
  name: string;
  dept_name: string;
  title: string;
  cert: ('官方认证' | '上届获奖' | '外部顾问')[];
  expertise_tags: string[];
  intro: string;
  rating_avg: number;
  serve_count: number;
  status: '接诊中' | '停诊' | '待审核' | '已离职';
  points: number;
}

export interface ExpertSchedule {
  id: string;
  expert_id: string;
  date: string;
  slot: string;
  capacity: number;
  booked: number;
  type: '1v1' | '直播' | '线下';
  place_or_link: string;
  status: 'OPEN' | 'FULL' | 'CLOSED' | 'HOLIDAY';
  /**
   * V6.0 CR-26：排班来源（手工维护 / 批量导入）；缺省视为手工。
   * V7.0 CR-36：新增 EXPERT_APPLY（专家自助申请经组织者审核后生成，拍板 7-C）。
   * 枚举只增不删，旧值语义不变。
   */
  source?: 'MANUAL' | 'BATCH' | 'EXPERT_APPLY';
  batch_id?: string;
  /** V7.0 CR-36：来源申请单号（审核通过后回填，便于追溯） */
  request_id?: string;
  updated_by?: string;
  updated_at?: string;
}

/**
 * V7.0 CR-36：专家自助排班申请（拍板 7-C）。
 * 专家提交 → 组织者在「专家与排班 · 排班申请」审核 → 通过后生成 ExpertSchedule。
 * 申请单只增不改：审核结论以新记录形式写在本单上，原申请内容不覆写。
 */
export interface ScheduleRequest {
  id: string;
  expert_id: string;
  date: string;
  slot: string;
  capacity: number;
  type: ExpertSchedule['type'];
  place_or_link: string;
  /** 待审核 / 已通过 / 已驳回；只增不改（驳回后不再复用本单，专家需重新提交） */
  status: '待审核' | '已通过' | '已驳回';
  /** 与已有排班撞车（同专家+同日期+同时段）时的标记，供组织者审核时识别 */
  conflict?: boolean;
  applicant_union_id?: string;
  created_at: string;
  /** 审核结论 */
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
}

export interface Booking {
  id: string;
  schedule_id: string;
  expert_id: string;
  expert_name: string;
  union_id: string;
  name: string;
  question: string;
  date: string;
  slot: string;
  type: '1v1' | '直播' | '线下';
  status: '待就诊' | '已完成' | '已取消' | '爽约';
  reviewed: boolean;
}

export interface ExpertReview {
  id: string;
  booking_id: string;
  expert_id: string;
  rater_union_id: string;
  dim_scores: { 专业度: number; 响应速度: number; 解决问题程度: number };
  rating: number;
  comment: string;
  anonymous: boolean;
  created_at: string;
  hidden?: boolean;
}

/* ---------- M7 资产 ---------- */
export interface AssetApply {
  id: string;
  submit_id: string;
  submit_title: string;
  applicant_union_id: string;
  applicant_name: string;
  status: '待初审' | '待上架' | '已入库' | '已驳回';
  reviewer_union_id?: string;
  visible_scope: string;
  /** V4.0 CR-08：真正落库的可见范围主体。缺省时回退读 visible_scope（旧文案值） */
  visible_subjects?: ScopeSubject[];
  apply_reason: string;
  created_at: string;
}

export interface Asset {
  id: string;
  apply_id: string;
  name: string;
  type: 'Skill 包' | '提示词模板' | '智能体';
  version: string;
  author_name: string;
  author_dept: string;
  track: Track;
  visible_scope: string;
  /** V4.0 CR-08：真正落库的可见范围主体。缺省时回退读 visible_scope（旧文案值） */
  visible_subjects?: ScopeSubject[];
  /** @deprecated V4.0 CR-10：本系统不再自算/累加，仅作 fallback 且展示为「估算」 */
  reuse_count: number;
  /** @deprecated V4.0 CR-10：同上，仅作 fallback */
  reuse_user_count: number;
  /** V4.0 CR-10：复用数据来源；LEGACY=旧台账值(估算)，WB_BACKEND=后台同步，MANUAL=手工维护。缺省 LEGACY */
  reuse_source?: 'WB_BACKEND' | 'MANUAL' | 'LEGACY';
  /** V4.0 CR-10：后台同步时间；为空表示「待测」，禁止显示裸 0 */
  reuse_synced_at?: string;
  online_at: string;
  /** V6.0 CR-27：新增「已下线」= 软删态（枚举只增，旧值语义不变） */
  status: '已上架' | '已下架' | '已下线';
  restricted: boolean;
}

/* ---------- M8 积分与商城 ---------- */
export interface PointRecord {
  id: string;
  union_id: string;
  name: string;
  source: string;
  points: number;
  campaign_id: string;
  remark: string;
  created_at: string;
}

export interface ShopItem {
  id: string;
  name: string;
  cover: string;
  desc: string;
  points: number;
  stock: number;
  limit_per_user: number;
  scope: string;
  /** V4.0 CR-08：真正落库的适用人群主体。缺省时回退读 scope（旧文案值） */
  scope_subjects?: ScopeSubject[];
  on_sale_at: string;
  off_sale_at: string;
  status: '草稿' | '上架' | '下架' | '售罄';
  verify_type: '线下领取' | '邮寄' | '线上发放';
  exchanged_count: number;
}

export interface ShopOrder {
  id: string;
  item_id: string;
  item_name: string;
  union_id: string;
  name: string;
  points_cost: number;
  /** '待核销' | '已核销' | '已取消' 为 V3.0 原有；'已发货' / '已完成' 为 V4.0 CR-05 补齐的兑换闭环 */
  status: '待核销' | '已核销' | '已发货' | '已完成' | '已取消';
  code: string;
  verify_by?: string;
  verify_at?: string;
  /** V4.0 CR-05：发货信息（邮寄类商品） */
  shipping_no?: string;
  shipping_by?: string;
  shipping_at?: string;
  created_at: string;
}

/* ---------- M11 社区 ---------- */
export interface Board {
  id: string;
  name: string;
  intro: string;
  icon: string;
  sort: number;
  status: '启用' | '停用';
  only_organizer_post: boolean;
}
export interface Post {
  id: string;
  board_id: string;
  board_name: string;
  union_id: string;
  author_name: string;
  anon_no?: string;
  title: string;
  content: string;
  tags: string[];
  anonymous: boolean;
  status: '正常' | '审核中' | '已隐藏' | '已删除';
  like_count: number;
  comment_count: number;
  view_count: number;
  pinned: boolean;
  featured: boolean;
  created_at: string;
  report_count: number;
  /** V4.0 CR-05：可见范围主体（缺省表示全员可见） */
  visible_subjects?: ScopeSubject[];
  /** V4.0 CR-05：附件名清单（纯前端 mock，不做真实上传） */
  attachments?: string[];
  /** V4.0 CR-05：正文格式，rich = 富文本编辑器产出（带 Markdown 标记） */
  content_format?: 'plain' | 'rich';
}
export interface PostComment {
  id: string;
  post_id: string;
  parent_id?: string;
  union_id: string;
  author_name: string;
  anon_no?: string;
  content: string;
  anonymous: boolean;
  created_at: string;
}

/* ---------- M12 管理员数据 ---------- */
export interface WbUsage {
  id: string;
  union_id: string;
  name: string;
  dept_name: string;
  stat_date: string;
  auth_status: '已授权' | '未授权' | '待确认';
  active_days: number;
  sessions: number;
  tokens: number;
  skill_calls: number;
  last_active: string;
}

/* ---------- V4.0 CR-06 看板配置（配置驱动，禁止硬编码） ---------- */
export type BoardChartType = 'number' | 'progress' | 'line' | 'bar' | 'table' | 'rank';
export interface BoardCardConfig {
  id: string;
  title: string;
  metric: string;
  /** 统计口径：'ALL' 或 'TAG:<code>'（沿用 V3.0 §3.5 标签体系） */
  scope: string;
  chart: BoardChartType;
  unit?: string;
  order: number;
  enabled: boolean;
}
export interface BoardConfig {
  campaign_id: string;
  version: string;
  cards: BoardCardConfig[];
  updated_by: string;
  updated_at: string;
}

/* ---------- V6.0 CR-13 公告（新实体，与社区帖子解耦） ---------- */
export interface Announcement {
  id: string;
  title: string;
  content: string;
  /** 草稿 / 已发布 / 已下线 */
  status: 'DRAFT' | 'PUBLISHED' | 'OFFLINE';
  pinned: boolean;
  published_at: string;
  /** 下线时间；为空表示长期有效 */
  offline_at?: string;
  created_by: string;
  /**
   * 来源于社区 BD4 帖子的公告保留原帖 id，点击可复用帖子详情页；
   * CR-28 后由内容管理直接新建的公告无此字段，点击进公告区。
   */
  source_post_id?: string;
  created_at: string;
  /** V6.0 CR-28：软删标记（删除一律软删并留痕） */
  is_deleted?: boolean;
  deleted_at?: string;
}

/* ---------- 系统 ---------- */
export interface AuditLog {
  id: string;
  operator: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
  created_at: string;
}

export interface AppMessage {
  id: string;
  union_id: string;
  type: string;
  title: string;
  content: string;
  channel: '钉钉待办' | '群通知' | '站内';
  status: '已读' | '未读';
  sent_at: string;
}
