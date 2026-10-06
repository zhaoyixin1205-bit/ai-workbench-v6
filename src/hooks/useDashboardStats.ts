import { useMemo, useState } from 'react';
import { useStore, useStats } from '@/store/store';
import { deptNameIn } from '@/mock/seedOrg';
import { useSkillAdminConverge } from '@/auth/converge';

/**
 * 后台看板统计逻辑（P3-3 从 `pages/b/Dashboard.tsx` :13-66 原样抽出）
 *
 * 口径铁律（勿改）：同一份报表分母必须唯一（标签口径），
 * 切换标签时全页口径同步变化 —— 因此 tagCode 与其派生的所有集合都放在这里一次性算完。
 */
export function useDashboardStats() {
  const { db, log, me, scopeRows, visibleUsers, flags, campaign } = useStore();
  const stats = useStats();
  /** V4.0 CR-09：技能管理员在本页为只读浏览者（§6.2 矩阵 ◐） */
  const skillAdminReadOnly = useSkillAdminConverge().isReadOnly('/admin');
  /** V4.0 CR-06：看板由卡片配置驱动；开关关闭即回到 V3.0 §11.1 固定分区 */
  const configurable = flags.boardConfigurable !== false;
  const [tagCode, setTagCode] = useState('CADRE');

  const enabled = campaign && (db.boardConfigs.find((c) => c.campaign_id === campaign.id) ?? db.boardConfigs[0])?.cards
    .filter((c) => c.enabled).map((c) => c.title);

  const users = visibleUsers();
  const submits = scopeRows(db.submits);
  const usage = scopeRows(db.wbUsage);

  const tag = db.tags.find((t) => t.code === tagCode)!;
  const scopeUsers = users.filter((u) => u.tags.includes(tag.id));
  const scopeIds = new Set(scopeUsers.map((u) => u.union_id));
  const submitted = new Set(submits.filter((s) => !['DRAFT', 'WITHDRAWN'].includes(s.status)).map((s) => s.union_id));
  const activated = new Set(usage.filter((w) => w.active_days > 0).map((w) => w.union_id));
  const inScope = (set: Set<string>) => [...set].filter((id) => scopeIds.has(id)).length;
  const pct = (n: number) => Math.round((n / Math.max(1, scopeUsers.length)) * 1000) / 10;

  const deptRank = Object.entries(
    users.reduce<Record<string, { total: number; sub: number; score: number[] }>>((acc, u) => {
      const d = deptNameIn(db.depts, u.dept_id_list[0]);
      acc[d] ??= { total: 0, sub: 0, score: [] };
      acc[d].total += 1;
      if (submitted.has(u.union_id)) acc[d].sub += 1;
      const s = submits.filter((x) => x.union_id === u.union_id && x.final_score !== undefined);
      s.forEach((x) => acc[d].score.push(x.final_score!));
      return acc;
    }, {})
  ).map(([name, v]) => ({
    dept: name.split('/').pop() ?? name,
    rate: Math.round((v.sub / v.total) * 100),
    avg: v.score.length ? Math.round(v.score.reduce((a, b) => a + b, 0) / v.score.length) : 0,
    sub: v.sub, total: v.total,
  })).sort((a, b) => b.rate - a.rate);

  const trackDist = useMemo(
    () => (['客户赋能', '团队提效', '销售提效'] as const).map((t) => ({
      name: t, value: submits.filter((s) => s.track === t).length,
    })),
    [submits]
  );

  const scoreColors = ['var(--wb-ink-4)', 'var(--wb-info)', '#7C3AED', 'var(--wb-success)'];
  const scoreProgress = [
    { label: '已提报', n: submits.length, color: scoreColors[0] },
    { label: '已跑分', n: submits.filter((s) => s.ai_score !== undefined).length, color: scoreColors[1] },
    { label: '已复核', n: submits.filter((s) => s.judge_score !== undefined).length, color: scoreColors[2] },
    { label: '已公示', n: submits.filter((s) => ['PUBLISHED', 'ASSET_APPLYING', 'ASSET_ONLINE'].includes(s.status)).length, color: scoreColors[3] },
  ];

  const top10 = [...submits].filter((s) => s.final_score !== undefined).sort((a, b) => b.final_score! - a.final_score!).slice(0, 10);

  return {
    db, log, me, stats, campaign,
    tagCode, setTagCode,
    skillAdminReadOnly, configurable, enabled,
    users, submits, usage,
    tag: tag ?? { id: '', name: '未配置', code: tagCode },
    scopeUsers, submitted, activated, inScope, pct,
    deptRank, trackDist, scoreProgress, top10,
  };
}
