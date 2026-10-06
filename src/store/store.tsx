import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchState, fetchStateVersion, pushState, resetRemoteState } from '@/service/stateService';
import type { ReactNode } from 'react';
import * as org from '@/mock/seedOrg';
import * as biz from '@/mock/seedBiz';
import type {
  User, Role, CaseItem, Topic, Bounty, AssignmentType, AssignmentPeriod, AssignmentSubmit,
  ScoreCard, ScoreResult, Expert, ExpertSchedule, Booking, ExpertReview, AssetApply, Asset,
  PointRecord, ShopItem, ShopOrder, Board, Post, PostComment, WbUsage, AuditLog, AppMessage,
  Campaign, Tag, Dept, TopicSelection, BoardConfig, ImportJob, ImportJobItem, Announcement,
  SubmitFlowRule, SubmitFlowLog, ReviewOverride, SceneCard, AttachmentFile, ScheduleRequest,
} from '@/mock/types';

export interface DB {
  depts: Dept[];
  tags: Tag[];
  users: User[];
  campaigns: Campaign[];
  cases: CaseItem[];
  topics: Topic[];
  bounties: Bounty[];
  assignmentTypes: AssignmentType[];
  periods: AssignmentPeriod[];
  submits: AssignmentSubmit[];
  scoreCards: ScoreCard[];
  scoreResults: ScoreResult[];
  experts: Expert[];
  schedules: ExpertSchedule[];
  bookings: Booking[];
  reviews: ExpertReview[];
  assetApplies: AssetApply[];
  assets: Asset[];
  pointRecords: PointRecord[];
  shopItems: ShopItem[];
  shopOrders: ShopOrder[];
  boards: Board[];
  posts: Post[];
  comments: PostComment[];
  wbUsage: WbUsage[];
  auditLogs: AuditLog[];
  messages: AppMessage[];
  /** V4.0 CR-03/04 选题记录（非排斥） */
  topicSelections: TopicSelection[];
  /** V4.0 CR-06 看板卡片配置 */
  boardConfigs: BoardConfig[];
  /** V4.0 CR-11 导入批次回执 */
  importJobs: ImportJob[];
  importJobItems: ImportJobItem[];
  /** V6.0 CR-13 公告（新实体；CR-28 后由内容管理 CRUD） */
  announcements: Announcement[];
  /** V6.0 CR-23 流程编排白名单规则（默认 8 条安全转移路径） */
  submitFlowRules: SubmitFlowRule[];
  /** V6.0 CR-23 流程流转日志（只增不改） */
  submitFlowLogs: SubmitFlowLog[];
  /** V6.0 CR-25 复核结论覆盖记录（覆盖不覆写） */
  reviewOverrides: ReviewOverride[];
  /** V6.0 CR-28 每周场景卡（新实体；此前由 cases.slice(0,6) 派生） */
  sceneCards: SceneCard[];
  /** V6.0 CR-31 真实文件记录（上传落真实存储后的元数据） */
  attachmentFiles: AttachmentFile[];
  /** V7.0 CR-36 专家自助排班申请（拍板 7-C：提交为申请，组织者审核后生效） */
  scheduleRequests: ScheduleRequest[];
}

/**
 * V6.0 CR-23：默认安全转移路径（禁止任意跳转）。
 * 覆盖「退回重做」「跳过重跑」「送复核」「直接完成」四类真实运营动作，
 * 不含任何「草稿直接跳到入库」这类越级路径。
 */
export const DEFAULT_FLOW_RULES: SubmitFlowRule[] = [
  { id: 'FR1', from_status: 'SUBMITTED', to_status: ['SCORING_AI', 'REVIEWING', 'WITHDRAWN'], enabled: true, remark: '未跑分可退回重跑或直接送人工复核' },
  { id: 'FR2', from_status: 'SCORING_AI', to_status: ['SUBMITTED', 'AI_SCORED', 'SCORE_FAILED'], enabled: true, remark: '评分中可退回重跑' },
  { id: 'FR3', from_status: 'AI_SCORED', to_status: ['REVIEWING', 'SUBMITTED', 'SCORE_FAILED'], enabled: true, remark: '出分后可送复核或退回重跑' },
  { id: 'FR4', from_status: 'REVIEWING', to_status: ['REVIEWED', 'AI_SCORED'], enabled: true, remark: '复核中可完成或退回重审' },
  { id: 'FR5', from_status: 'REVIEWED', to_status: ['COMPLETED', 'REVIEWING'], enabled: true, remark: '复核完成 → 已完成（公示不再是前置条件）' },
  { id: 'FR6', from_status: 'COMPLETED', to_status: ['CONSENSUS', 'REVIEWED', 'ASSET_APPLYING'], enabled: true, remark: '完成后可标记共识或进入入库申请' },
  { id: 'FR7', from_status: 'CONSENSUS', to_status: ['ASSET_APPLYING', 'COMPLETED'], enabled: true, remark: '共识后进入入库或退回已完成' },
  { id: 'FR8', from_status: 'ASSET_APPLYING', to_status: ['ASSET_ONLINE', 'ASSET_REJECTED', 'COMPLETED'], enabled: true, remark: '入库申请可上线 / 驳回 / 退回' },
];

function initialDB(): DB {
  return {
    depts: org.DEPTS, tags: org.TAGS, users: org.USERS, campaigns: org.CAMPAIGNS,
    cases: biz.CASES, topics: biz.TOPICS, bounties: biz.BOUNTIES,
    assignmentTypes: biz.ASSIGNMENT_TYPES, periods: biz.PERIODS, submits: biz.SUBMITS,
    scoreCards: biz.SCORE_CARDS, scoreResults: biz.SCORE_RESULTS,
    experts: biz.EXPERTS, schedules: biz.SCHEDULES, bookings: biz.BOOKINGS, reviews: biz.EXPERT_REVIEWS,
    assetApplies: biz.ASSET_APPLIES, assets: biz.ASSETS,
    pointRecords: biz.POINT_RECORDS, shopItems: biz.SHOP_ITEMS, shopOrders: biz.SHOP_ORDERS,
    boards: biz.BOARDS, posts: biz.POSTS, comments: biz.COMMENTS,
    wbUsage: biz.WB_USAGE, auditLogs: org.AUDIT_LOGS, messages: org.MESSAGES,
    topicSelections: biz.TOPIC_SELECTIONS, boardConfigs: biz.BOARD_CONFIGS,
    importJobs: [], importJobItems: [],
    announcements: biz.ANNOUNCEMENTS,
    submitFlowRules: DEFAULT_FLOW_RULES,
    submitFlowLogs: [], reviewOverrides: [],
    sceneCards: biz.SCENE_CARDS,
    attachmentFiles: [],
    scheduleRequests: [],
  };
}

/** 兼容旧版本 localStorage 数据：缺失的新增集合补空数组，禁止清空历史数据 */
function hydrate(raw: unknown): DB {
  const base = initialDB();
  const p = (raw ?? {}) as Partial<DB>;
  return {
    ...base, ...p,
    topicSelections: p.topicSelections ?? base.topicSelections,
    boardConfigs: p.boardConfigs ?? base.boardConfigs,
    importJobs: p.importJobs ?? [],
    importJobItems: p.importJobItems ?? [],
    announcements: p.announcements ?? base.announcements,
    submitFlowRules: p.submitFlowRules ?? base.submitFlowRules,
    submitFlowLogs: p.submitFlowLogs ?? [],
    reviewOverrides: p.reviewOverrides ?? [],
    sceneCards: p.sceneCards ?? base.sceneCards,
    attachmentFiles: p.attachmentFiles ?? [],
    scheduleRequests: p.scheduleRequests ?? [],
  };
}

export interface FeatureFlags {
  community: boolean;
  shop: boolean;
  clinic: boolean;
  wbAdmin: boolean;
  anonymousPost: boolean;
  /* ---- V4.0 新增开关：全部遵循「关闭 ≡ V3.0 行为」，无半生效 ---- */
  /** CR-01/02 多身份并行（关闭=回到切换身份） */
  identityMultiRole: boolean;
  /** CR-01 首页/个中心团队板块 */
  homeTeamBoard: boolean;
  /** CR-03 选题非排斥 */
  topicMultiSelect: boolean;
  /** CR-03 自选标签与标签筛选 */
  topicFreeTags: boolean;
  /** CR-04 我的选题 Tab */
  topicMyTopics: boolean;
  /** CR-07 抽查确认制（关闭=三问原流程） */
  judgeConfirmMode: boolean;
  /** CR-07 三问深度抽查（默认关：仅异常样本拉起） */
  judgeDeepSpotCheck: boolean;
  /** CR-09 技能管理员权限收敛（关闭=回到 V3.0 全放开） */
  skillAdminConverge: boolean;
  /** CR-09 技能管理员可获内容授权（默认关=收敛态） */
  skillAdminGrantContent: boolean;
  /** CR-10 复用次数取外部源（关闭=回到 V3.0 自算展示） */
  assetReuseExternal: boolean;
  /** CR-05 社区发帖交互对齐（关闭=V3.0 布局） */
  communityV2Layout: boolean;
  /** CR-05 商城兑换闭环（关闭=V3.0 流程） */
  shopV2Flow: boolean;
  /** CR-06 看板配置化（关闭=固定 V3.0 §11.1 分区） */
  boardConfigurable: boolean;
  /** CR-11 用户手工/批量管理（关闭=仅钉钉映射） */
  userManualManage: boolean;
  /** U-2 结案：数据范围受限提示（关闭=不显示任何范围说明，≡ V3.0） */
  scopeNotice: boolean;
  /** V4.1：案例「可直接安装的 Skill」区块（关闭=回到 V4.0，案例只有提示词） */
  caseSkillPackage: boolean;
  /** V4.1：案例「补充信息 / 附件」区块（关闭=回到 V4.0，案例无附件） */
  caseAttachment: boolean;
  /** V4.1：Moka 复刻的悬浮帮助条（关闭=不显示右侧常驻帮助入口） */
  helperBar: boolean;
  /* ---- V6.0 新增开关 ---- */
  /** CR-13 首页公告条置顶 + 文字轮转（关闭=公告回到 V5.0 右下角列表） */
  homeAnnounceTicker: boolean;
  /** CR-17 选题「其他·自定义」与私有可见（关闭=只能选既有选题，≡ V5.0） */
  topicCustom: boolean;
  /** CR-18 作业提报支持「不选选题」直提（关闭=必须关联选题，≡ V5.0） */
  workNoTopic: boolean;
  /** CR-19 提报状态机 V2（+COMPLETED/CONSENSUS、公示解耦；关闭=沿用 V5.0 状态机） */
  submitFlowV2: boolean;
  /** CR-20/21 悬赏方案结构化 + 修改/补充双通道（关闭=单文本框方案，≡ V5.0） */
  bountySolutionV2: boolean;
  /** CR-22 后台三板块权限收窄（关闭=回到 V5.0 宽口径，≡ 191 项断言原口径） */
  adminCoreConverge: boolean;
  /** CR-30 负责人团队视图 /team（关闭=不渲染入口且不可进入） */
  teamView: boolean;
  /** CR-15 首页评委复核入口（关闭=首页不出现该区块） */
  homeJudgeEntry: boolean;
  /** CR-16 专家工作台下沉 /clinic/workbench（关闭=仅保留旧 B 端入口） */
  clinicWorkbench: boolean;
  /** CR-23 作业流程编排（退回/转移，白名单约束） */
  submitFlowControl: boolean;
  /** CR-24 评分卡全生命周期（新建/复制/启用/停用/删除） */
  scoreCardLifecycle: boolean;
  /** CR-25 评委复核结果可覆盖与退回 */
  judgeOverride: boolean;
  /** CR-26 专家排班批量维护与已发布直改 */
  expertScheduleBatch: boolean;
  /** CR-27 资产台账批量管理 */
  assetLedgerBatch: boolean;
  /** CR-28 内容管理全维度 CRUD */
  contentFullCrud: boolean;
  /** CR-29 商城商品批量导入与批量删除 */
  shopBatch: boolean;
  /**
   * CR-31 真实文件服务（默认 ON）。
   * 关闭 → 回到 A-39 演示态（只登记文件名与体积，诚实文案说明无法下载）。
   * 另：后端不可达时前端自动降级到演示态，不需要人工关开关。
   */
  realFileService: boolean;
  /* ---- V7.0 新增开关（关闭 ≡ 回到 V6.2 行为） ---- */
  /** CR-32 C 端评委评分入口 /judge（关闭=不渲染入口且不可进入） */
  cJudgeEntry: boolean;
  /** CR-33 作业状态文案统一（关闭=B 端回到裸英文） */
  statusMetaUnified: boolean;
  /** CR-34 评分卡可编辑（关闭=回到只读 + 保存即新版本） */
  scoreCardEditable: boolean;
  /** CR-35 导入字段契约（关闭=模板与校验回到旧逻辑） */
  importSchema: boolean;
  /** CR-36 专家自助排班申请（关闭=专家端回到只能开放/停诊） */
  expertSelfSchedule: boolean;
  /**
   * CR-38 商城组织者编辑权（拍板 6-B：默认关闭 = 维持 ADMIN-only）。
   * 开启后组织者可编辑已发布商品，并写入审计日志。
   */
  shopOrgEditable: boolean;
}

/** 开关默认值：新增能力默认 ON（演示可见），风险类默认 OFF */
export const DEFAULT_FLAGS: FeatureFlags = {
  community: true, shop: true, clinic: true, wbAdmin: true, anonymousPost: true,
  identityMultiRole: true, homeTeamBoard: true,
  topicMultiSelect: true, topicFreeTags: true, topicMyTopics: true,
  judgeConfirmMode: true, judgeDeepSpotCheck: false,
  skillAdminConverge: true, skillAdminGrantContent: false, assetReuseExternal: true,
  communityV2Layout: true, shopV2Flow: true,
  boardConfigurable: true, userManualManage: true, scopeNotice: true,
  caseSkillPackage: true, caseAttachment: true, helperBar: true,
  homeAnnounceTicker: true,
  topicCustom: true, workNoTopic: true, submitFlowV2: true, bountySolutionV2: true,
  adminCoreConverge: true, teamView: true, homeJudgeEntry: true, clinicWorkbench: true,
  submitFlowControl: true, scoreCardLifecycle: true, judgeOverride: true,
  expertScheduleBatch: true, assetLedgerBatch: true, contentFullCrud: true, shopBatch: true,
  realFileService: true,
  /* V7.0：新增能力默认 ON；权限放开类（shopOrgEditable）默认 OFF，符合拍板 6-B */
  cJudgeEntry: true, statusMetaUnified: true, scoreCardEditable: true,
  importSchema: true, expertSelfSchedule: true, shopOrgEditable: false,
};

/** V6.1：数据同步状态（前端据此告诉用户「现在是共享数据还是只有你一个人看得见」） */
export interface SyncInfo {
  /** remote = 已接后端（多人共享）；local = 未接后端（数据只在本机浏览器） */
  mode: 'remote' | 'local';
  /** loading 首次拉取中 / synced 已同步 / saving 写入中 / conflict 版本冲突 / offline 后端不可达 */
  state: 'loading' | 'synced' | 'saving' | 'conflict' | 'offline';
  driver?: string;
  updatedBy?: string;
  message?: string;
}

interface Ctx {
  db: DB;
  setDb: React.Dispatch<React.SetStateAction<DB>>;
  /** V6.1：数据同步状态 */
  sync: SyncInfo;
  /** V6.1：手动拉取服务端最新数据（冲突后点「刷新」时用） */
  pullRemote: () => Promise<void>;
  me: User;
  /** 一键切换演示身份（PRD 3.2 双维授权：角色 + 数据范围） */
  switchIdentity: (unionId: string) => void;
  switchToRole: (role: Role) => void;
  hasRole: (...roles: Role[]) => boolean;
  flags: FeatureFlags;
  setFlags: React.Dispatch<React.SetStateAction<FeatureFlags>>;
  campaign: Campaign;
  resetDemo: () => Promise<void>;
  /** 可见数据范围过滤（SELF / DEPT_TREE / ALL） */
  visibleUsers: () => User[];
  /** V4.0 CR-01：是否带团队（有下属 / 有管辖部门），决定是否渲染「团队板块」 */
  hasTeam: boolean;
  /** V4.0 CR-01：管辖部门 ID 列表 */
  managedDeptIds: string[];
  /** V4.0 A-3：按数据可见范围过滤业务行（消除「路由放行但数据全量」的半生效） */
  scopeRows: <T extends { union_id?: string }>(rows: T[]) => T[];
  log: (action: string, target: string, detail: string) => void;
}

const StoreCtx = createContext<Ctx | null>(null);
const LS_KEY = 'wb-workbench-db-v3.0.0';
const LS_ME = 'wb-workbench-me-v3.0.0';
const LS_FLAGS = 'wb-workbench-flags-v3.0.0';
/**
 * 默认身份：V7.1 起通讯录换成钉钉真实数据，演示用的 'uid001' 已不存在。
 * 若沿用旧值会 fallback 到 `db.users[0]`（通讯录里第一个人，是谁完全随机），
 * 等于任何人打开都顶着别人的身份。故显式兜底到组织者本人（工号 E02107）。
 * 用户点「切换身份」后以 localStorage 为准，不受此常量影响。
 */
const DEFAULT_ME_ID = 'uQAkcBWeXVgDWRa3ZFiiUxgiEiE';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return hydrate(JSON.parse(raw));
    } catch {
      /* 忽略损坏的本地数据 */
    }
    return initialDB();
  });
  /* ------------------------------------------------------------------
   * V6.1：后端持久化。目标是把 localStorage 从「唯一真源」降级为「离线兜底」，
   * 让所有人看到同一份数据；后端不可达时自动退回 V6.0 的纯本地行为。
   * ------------------------------------------------------------------ */
  const versionRef = useRef(0);
  /** 本地有改动尚未落盘：轮询时不用远程覆盖，避免吃掉用户正在编辑的内容 */
  const dirtyRef = useRef(false);
  /** 本次 setDb 来自远程拉取 —— 不触发回写，否则「拉→写→拉」会无限循环 */
  const fromRemoteRef = useRef(false);
  /** 与 sync.mode 同步的引用：回写 effect 只依赖 db，避免 setSync 反过来触发写回 */
  const modeRef = useRef<'local' | 'remote'>('local');
  const [sync, setSync] = useState<SyncInfo>({ mode: 'local', state: 'loading' });

  const setMode = useCallback((mode: 'local' | 'remote', patch: Partial<SyncInfo>) => {
    modeRef.current = mode;
    setSync((s) => ({ ...s, mode, ...patch }));
  }, []);

  const pullRemote = useCallback(async () => {
    const env = await fetchState();
    if (!env) {
      setMode('local', {
        state: 'offline',
        message: '未连接后端：数据只存在本机浏览器，其他人看不到',
      });
      return;
    }
    versionRef.current = env.version;
    dirtyRef.current = false;
    if (env.data && typeof env.data === 'object') {
      fromRemoteRef.current = true;
      setDb(hydrate(env.data));
    }
    setMode('remote', { state: 'synced', updatedBy: env.updated_by || '', driver: env.driver });
    // 服务端还没有数据 → 用种子播种；随后的回写 effect 会把它落到服务端，
    // 数据库因此不需要手工初始化，部署后第一台打开页面的机器自动完成播种。
    if (!env.data) {
      setDb(initialDB());
      setSync((s) => ({ ...s, state: 'saving' }));
    }
  }, [setMode]);

  const [meId, setMeId] = useState<string>(() => localStorage.getItem(LS_ME) || DEFAULT_ME_ID);
  const [flags, setFlags] = useState<FeatureFlags>(() => {
    try {
      const raw = localStorage.getItem(LS_FLAGS);
      // 旧版本只存了 5 个开关：与默认值合并，保证新开关有确定取值（禁止半生效）
      if (raw) return { ...DEFAULT_FLAGS, ...(JSON.parse(raw) as Partial<FeatureFlags>) };
    } catch {
      /* ignore */
    }
    return DEFAULT_FLAGS;
  });

  // 「我是谁」和「功能开关」仍然留在本地：身份切换是个人操作偏好，不该被别人同步走。
  useEffect(() => {
    localStorage.setItem(LS_ME, meId);
  }, [meId]);
  useEffect(() => {
    localStorage.setItem(LS_FLAGS, JSON.stringify(flags));
  }, [flags]);

  const me = useMemo(
    () => db.users.find((x) => x.union_id === meId) ?? db.users[0],
    [db.users, meId]
  );
  const campaign = useMemo(
    () => db.campaigns.find((c) => c.status === '进行中') ?? db.campaigns[0],
    [db.campaigns]
  );

  /* 首次挂载：向后端要一次全量数据；拿不到就退回本机模式 */
  useEffect(() => {
    void pullRemote();
  }, [pullRemote]);

  /* 回写：db 变化后防抖落库。远程模式写后端，失败降级写本机（不丢改动） */
  useEffect(() => {
    if (fromRemoteRef.current) {
      fromRemoteRef.current = false;
      return;
    }
    if (modeRef.current !== 'remote') {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(db));
      } catch { /* 超出配额时忽略，不阻塞交互 */ }
      return;
    }
    dirtyRef.current = true;
    setSync((s) => ({ ...s, state: 'saving' }));
    const timer = setTimeout(async () => {
      const r = await pushState(db, versionRef.current, me?.name ?? '');
      if (!r) {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(db));
        } catch { /* ignore */ }
        setMode('local', { state: 'offline', message: '与后端断开，改动已暂存在本机浏览器' });
        dirtyRef.current = false;
        return;
      }
      if (r.ok) {
        versionRef.current = r.version;
        dirtyRef.current = false;
        setSync((s) => ({ ...s, mode: 'remote', state: 'synced', updatedBy: me?.name ?? '' }));
        return;
      }
      if (r.conflict) {
        // 别人先提交了：拉最新覆盖本地，并如实告知「本次改动未生效」——
        // 静默覆盖比冲突提示危险得多，后者至少让用户知道自己要重做。
        const env = await fetchState();
        if (env?.data) {
          fromRemoteRef.current = true;
          setDb(hydrate(env.data));
        }
        versionRef.current = env?.version ?? r.version;
        dirtyRef.current = false;
        setMode('remote', {
          state: 'conflict',
          message: `${r.error}（已载入最新数据，你的这次改动未生效，请重新操作）`,
        });
        return;
      }
      dirtyRef.current = false;
      setSync((s) => ({ ...s, state: 'offline', message: r.error }));
    }, 700);
    return () => clearTimeout(timer);
  }, [db, me?.name, setMode]);

  /* 轮询：只比版本号，变了才拉全量。本地有未落盘改动时跳过，避免吃掉正在编辑的内容 */
  useEffect(() => {
    const timer = setInterval(async () => {
      if (modeRef.current !== 'remote' || dirtyRef.current) return;
      const v = await fetchStateVersion();
      if (v === null) {
        setMode('local', { state: 'offline', message: '与后端断开' });
        return;
      }
      if (v > versionRef.current) {
        const env = await fetchState();
        if (env?.data && typeof env.data === 'object') {
          fromRemoteRef.current = true;
          setDb(hydrate(env.data));
        }
        if (env) {
          versionRef.current = env.version;
          setSync((s) => ({ ...s, updatedBy: env.updated_by || '' }));
        }
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [setMode]);

  const switchIdentity = useCallback((unionId: string) => setMeId(unionId), []);
  const switchToRole = useCallback(
    (role: Role) => {
      const target = db.users.find((x) => x.roles.includes(role));
      if (target) setMeId(target.union_id);
    },
    [db.users]
  );
  const hasRole = useCallback((...roles: Role[]) => roles.some((r) => me.roles.includes(r)), [me]);
  const resetDemo = useCallback(async () => {
    const ok = await resetRemoteState(me?.name ?? '');
    localStorage.removeItem(LS_KEY);
    setMeId('uid001');
    if (ok) {
      // 服务端已清空（version+1）→ 先取回新版本号再播种，否则回写会撞上乐观锁
      const env = await fetchState();
      versionRef.current = env?.version ?? 0;
      setMode('remote', { state: 'saving' });
      setDb(initialDB());
      return;
    }
    setDb(initialDB());
  }, [me?.name, setMode]);

  const visibleUsers = useCallback(() => {
    if (me.scope_type === 'ALL') return db.users;
    if (me.scope_type === 'SELF') return db.users.filter((x) => x.union_id === me.union_id);
    return db.users.filter((x) =>
      me.scope_dept_ids.some((d) => x.dept_id_list.some((ud) => ud === d || ud.startsWith(d)))
    );
  }, [db.users, me]);

  /** V4.0 CR-01：管辖部门 = managed_dept_ids（缺省时由 is_dept_leader 推导为主部门） */
  const managedDeptIds = useMemo(
    () => (me.managed_dept_ids?.length ? me.managed_dept_ids : me.is_dept_leader ? me.dept_id_list : []),
    [me]
  );
  const hasTeam = useMemo(
    () => managedDeptIds.some((d) =>
      db.users.some((u) => u.union_id !== me.union_id && u.status !== 99 &&
        u.dept_id_list.some((ud) => ud === d || ud.startsWith(d)))),
    [managedDeptIds, db.users, me.union_id]
  );

  /** V4.0 A-3：业务行按「可见用户集合」收敛——SELF 角色只看到本人数据 */
  const scopeRows = useCallback(
    <T extends { union_id?: string }>(rows: T[]) => {
      if (me.scope_type === 'ALL') return rows;
      const ids = new Set(visibleUsers().map((u) => u.union_id));
      return rows.filter((r) => !r.union_id || ids.has(r.union_id));
    },
    [visibleUsers, me.scope_type]
  );

  const log = useCallback(
    (action: string, target: string, detail: string) => {
      setDb((prev) => ({
        ...prev,
        auditLogs: [
          {
            id: `A${Date.now()}`, operator: me.name, action, target, detail,
            ip: '10.12.3.11', created_at: biz.DEMO_TODAY + ' ' + new Date().toTimeString().slice(0, 5),
          },
          ...prev.auditLogs,
        ],
      }));
    },
    [me.name]
  );

  const value: Ctx = {
    db, setDb, sync, pullRemote, me, switchIdentity, switchToRole, hasRole, flags, setFlags,
    campaign, resetDemo, visibleUsers, hasTeam, managedDeptIds, scopeRows, log,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

/** 常用派生：当前用户在所选标签人群中的统计 */
export function useStats() {
  const { db, campaign } = useStore();
  return useMemo(() => {
    const tagUsers = (code: string) => {
      const tag = db.tags.find((t) => t.code === code);
      if (!tag) return [] as User[];
      return db.users.filter((x) => x.tags.includes(tag.id));
    };
    const cadre = tagUsers('CADRE');
    const submittedIds = new Set(
      db.submits.filter((s) => s.status !== 'DRAFT' && s.status !== 'WITHDRAWN').map((s) => s.union_id)
    );
    const activatedIds = new Set(
      db.wbUsage.filter((w) => w.active_days > 0).map((w) => w.union_id)
    );
    const rate = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
    const cadreIds = new Set(cadre.map((x) => x.union_id));
    return {
      cadreCount: cadre.length,
      activated: [...activatedIds].filter((id) => cadreIds.has(id)).length,
      activateRate: rate([...activatedIds].filter((id) => cadreIds.has(id)).length, cadre.length),
      submitted: [...submittedIds].filter((id) => cadreIds.has(id)).length,
      submitRate: rate([...submittedIds].filter((id) => cadreIds.has(id)).length, cadre.length),
      validWorks: db.submits.filter((s) => (s.final_score ?? 0) >= 60 && s.spot_check?.result !== '不通过').length,
      assets: db.assets.length,
      campaign,
    };
  }, [db, campaign]);
}
