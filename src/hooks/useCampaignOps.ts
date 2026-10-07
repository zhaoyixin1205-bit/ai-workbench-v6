import { useCallback } from 'react';
import { useStore } from '@/store/store';
import type { Campaign } from '@/mock/types';
import dayjs from 'dayjs';

/**
 * 届次操作（V7.1）
 * ------------------------------------------------------------------
 * 背景：V7.0 及之前，届次与配置页的「创建新届次 / 一键复制上届 / 保存时间窗 /
 * 保存积分规则 / 公示总闸」五个按钮只有 `message.success(...)`，没有任何 setDb 写入——
 * 点了只弹一句假提示，数据纹丝不动（用户反馈「没有反应」）。
 *
 * 这里把五个动作收敛成真实写入，v1（pages/b/CampaignConfig）与 v2（pages/v2/CampaignConfigV2）
 * 共用同一份实现，保证两版功能对等（P4 对账口径：抽到 hook 不算丢失）。
 *
 * 设计口径：
 *   ① 同一时刻只允许一个「进行中」届次 —— 新建/复制为进行中时，旧的进行中自动转「已结束」
 *   ② 新届次创建后立即设为当前届次（currentCampaignId），否则页面仍显示旧届次，用户会以为没生效
 *   ③ 每个动作都写审计日志（log），与页面其它写操作口径一致
 */

export interface CampaignDraftInput {
  name: string;
  start_date: string;
  end_date: string;
  status: Campaign['status'];
  /** 复制来源届次 id；为空表示全新创建（用默认 4 阶段模板） */
  fromId?: string;
  /** 复制项（仅 fromId 非空时生效） */
  copyStages: boolean;
  copyPointRules: boolean;
  copyVisibility: boolean;
  copyPublicSwitch: boolean;
}

/** 默认 4 阶段模板：按起止日期四等分，与 V7.0 演示届次的 W1~W4 口径一致 */
export function buildDefaultStages(start: string, end: string): Campaign['stages'] {
  const s = dayjs(start);
  const e = dayjs(end);
  if (!s.isValid() || !e.isValid() || !e.isAfter(s)) return [];
  const total = e.diff(s, 'day');
  const at = (i: number) => s.add(Math.round((total * i) / 4), 'day').format('YYYY-MM-DD');
  return [
    { name: 'W1 启动清障', start: at(0), end: at(1) },
    { name: 'W2 场景选型', start: at(1), end: at(2) },
    { name: 'W3 制作陪跑', start: at(2), end: at(3) },
    { name: 'W4 评分公示', start: at(3), end: e.format('YYYY-MM-DD') },
  ];
}

const DEFAULT_VISIBILITY: Campaign['visibility'] = {
  leaderboard: '全员',
  workDetail: '本部门',
  comment: '不公示',
};

const DEFAULT_POINT_RULES: Campaign['pointRules'] = [
  { action: '提交作业（达标）', points: 50 },
  { action: '认领悬赏并通过', points: 30, cap: 300 },
  { action: '专家接诊（每次）', points: 20, cap: 200 },
  { action: '社区发帖', points: 2, cap: 60 },
  { action: '社区精华帖', points: 10 },
  { action: '作品入库', points: 100 },
];

export function useCampaignOps() {
  const { db, setDb, log, setCurrentCampaignId } = useStore();

  const nextId = useCallback(() => {
    const n = (db.campaigns ?? []).length + 1;
    let id = `C${new Date().getFullYear()}N${String(n).padStart(2, '0')}`;
    const used = new Set((db.campaigns ?? []).map((c) => c.id));
    while (used.has(id)) id += 'X';
    return id;
  }, [db.campaigns]);

  /**
   * 创建届次（可带复制来源）。
   * @returns 新建届次的 id；失败返回 null（名称为空或日期区间非法）
   */
  const createCampaign = useCallback(
    (input: CampaignDraftInput): string | null => {
      const name = input.name.trim();
      const start = input.start_date;
      const end = input.end_date;
      if (!name) return null;
      if (!start || !end || !dayjs(end).isAfter(dayjs(start))) return null;

      const src = input.fromId ? (db.campaigns ?? []).find((c) => c.id === input.fromId) : undefined;
      const draft: Campaign = {
        id: nextId(),
        name,
        start_date: start,
        end_date: end,
        status: input.status,
        stages: src && input.copyStages ? src.stages.map((s) => ({ ...s })) : buildDefaultStages(start, end),
        visibility: src && input.copyVisibility ? { ...src.visibility } : { ...DEFAULT_VISIBILITY },
        publicSwitch: src && input.copyPublicSwitch ? src.publicSwitch : true,
        pointRules: src && input.copyPointRules ? src.pointRules.map((r) => ({ ...r })) : DEFAULT_POINT_RULES.map((r) => ({ ...r })),
      };

      setDb((p) => ({
        ...p,
        /* ① 同一时刻只允许一个进行中：新建为进行中时，旧的自动归档 */
        campaigns: (p.campaigns ?? [])
          .map((c) => (draft.status === '进行中' && c.status === '进行中' ? { ...c, status: '已结束' as const } : c))
          .concat(draft),
      }));
      /* ② 立即设为当前届次，否则页面还显示旧的，用户会以为没生效 */
      setCurrentCampaignId(draft.id);

      const copied: string[] = [];
      if (src) {
        if (input.copyStages) copied.push('阶段');
        if (input.copyPointRules) copied.push('积分规则');
        if (input.copyVisibility) copied.push('公示口径');
        if (input.copyPublicSwitch) copied.push('公示总闸');
      }
      log(
        src ? '复制届次' : '创建届次',
        draft.name,
        src
          ? `来源 ${src.name}｜复制 ${copied.length ? copied.join('、') : '（未勾选任何复制项）'}｜${start} ~ ${end}｜${draft.status}`
          : `新建｜${start} ~ ${end}｜${draft.status}｜默认 4 阶段 + 默认积分规则`
      );
      return draft.id;
    },
    [db.campaigns, nextId, setDb, setCurrentCampaignId, log]
  );

  /** 切换当前届次（幂等：已是当前则无操作） */
  const switchCampaign = useCallback(
    (id: string) => {
      const t = (db.campaigns ?? []).find((c) => c.id === id);
      if (!t) return;
      setCurrentCampaignId(id);
      log('切换届次', t.name, `当前届次切换为 ${t.name}（${t.start_date} ~ ${t.end_date}）`);
    },
    [db.campaigns, setCurrentCampaignId, log]
  );

  /** 归档：进行中 → 已结束。已结束/未开始不受影响 */
  const archiveCampaign = useCallback(
    (id: string) => {
      const t = (db.campaigns ?? []).find((c) => c.id === id);
      if (!t || t.status !== '进行中') return;
      setDb((p) => ({
        ...p,
        campaigns: (p.campaigns ?? []).map((c) => (c.id === id ? { ...c, status: '已结束' as const } : c)),
      }));
      log('归档届次', t.name, '状态 进行中 → 已结束（历史数据可回溯）');
    },
    [db.campaigns, setDb, log]
  );

  /** 删除届次。删的是当前届次时，选择清空回到自动派生 */
  const removeCampaign = useCallback(
    (id: string) => {
      const t = (db.campaigns ?? []).find((c) => c.id === id);
      if (!t) return;
      setDb((p) => ({ ...p, campaigns: (p.campaigns ?? []).filter((c) => c.id !== id) }));
      setCurrentCampaignId('');
      log('删除届次', t.name, '届次记录已删除（不影响用户、案例与选题）');
    },
    [db.campaigns, setDb, setCurrentCampaignId, log]
  );

  /** 保存时间窗（真实写入） */
  const saveTimeWindow = useCallback(
    (id: string, start: string, end: string) => {
      const t = (db.campaigns ?? []).find((c) => c.id === id);
      if (!t) return false;
      if (!start || !end || !dayjs(end).isAfter(dayjs(start))) return false;
      setDb((p) => ({
        ...p,
        campaigns: (p.campaigns ?? []).map((c) =>
          c.id === id ? { ...c, start_date: start, end_date: end } : c
        ),
      }));
      log('时间窗变更', t.name, `${t.start_date} ~ ${t.end_date} → ${start} ~ ${end}（影响提报与榜单，不影响历史数据）`);
      return true;
    },
    [db.campaigns, setDb, log]
  );

  /** 保存积分规则（真实写入） */
  const savePointRules = useCallback(
    (id: string, rules: Campaign['pointRules']) => {
      const t = (db.campaigns ?? []).find((c) => c.id === id);
      if (!t) return;
      setDb((p) => ({
        ...p,
        campaigns: (p.campaigns ?? []).map((c) => (c.id === id ? { ...c, pointRules: rules } : c)),
      }));
      log('积分规则变更', t.name, `${rules.length} 条规则已保存（仅对新行为生效）`);
    },
    [db.campaigns, setDb, log]
  );

  /** 保存公示总闸（真实写入） */
  const savePublicSwitch = useCallback(
    (id: string, on: boolean) => {
      const t = (db.campaigns ?? []).find((c) => c.id === id);
      if (!t) return;
      setDb((p) => ({
        ...p,
        campaigns: (p.campaigns ?? []).map((c) => (c.id === id ? { ...c, publicSwitch: on } : c)),
      }));
      log('公示总闸变更', t.name, `${t.publicSwitch ? 'ON' : 'OFF'} → ${on ? 'ON' : 'OFF'}`);
    },
    [db.campaigns, setDb, log]
  );

  return {
    createCampaign,
    switchCampaign,
    archiveCampaign,
    removeCampaign,
    saveTimeWindow,
    savePointRules,
    savePublicSwitch,
    defaultPointRules: DEFAULT_POINT_RULES,
  };
}

/** 上一届 = 列表中按开始时间排在当前届次之前、且最接近的一条 */
export function prevCampaign(campaigns: Campaign[], currentId: string): Campaign | undefined {
  const list = [...(campaigns ?? [])].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const idx = list.findIndex((c) => c.id === currentId);
  if (idx >= 0) return list[idx + 1];
  return list[0];
}
