import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as org from '@/mock/seedOrg';
import * as biz from '@/mock/seedBiz';
import type {
  User, Role, CaseItem, Topic, Bounty, AssignmentType, AssignmentPeriod, AssignmentSubmit,
  ScoreCard, ScoreResult, Expert, ExpertSchedule, Booking, ExpertReview, AssetApply, Asset,
  PointRecord, ShopItem, ShopOrder, Board, Post, PostComment, WbUsage, AuditLog, AppMessage,
  Campaign, Tag, Dept, TopicSelection, BoardConfig, ImportJob, ImportJobItem,
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
}

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
};

interface Ctx {
  db: DB;
  setDb: React.Dispatch<React.SetStateAction<DB>>;
  me: User;
  /** 一键切换演示身份（PRD 3.2 双维授权：角色 + 数据范围） */
  switchIdentity: (unionId: string) => void;
  switchToRole: (role: Role) => void;
  hasRole: (...roles: Role[]) => boolean;
  flags: FeatureFlags;
  setFlags: React.Dispatch<React.SetStateAction<FeatureFlags>>;
  campaign: Campaign;
  resetDemo: () => void;
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
  const [meId, setMeId] = useState<string>(() => localStorage.getItem(LS_ME) || 'uid001');
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

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  }, [db]);
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

  const switchIdentity = useCallback((unionId: string) => setMeId(unionId), []);
  const switchToRole = useCallback(
    (role: Role) => {
      const target = db.users.find((x) => x.roles.includes(role));
      if (target) setMeId(target.union_id);
    },
    [db.users]
  );
  const hasRole = useCallback((...roles: Role[]) => roles.some((r) => me.roles.includes(r)), [me]);
  const resetDemo = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setDb(initialDB());
    setMeId('uid001');
  }, []);

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
    db, setDb, me, switchIdentity, switchToRole, hasRole, flags, setFlags,
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
