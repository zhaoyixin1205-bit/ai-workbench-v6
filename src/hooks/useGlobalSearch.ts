import { useMemo } from 'react';
import { useStore } from '@/store/store';

/**
 * ⌘K 全局搜索（v2 新增能力）
 *
 * 说明：这是 **v2 独有** 的导航增强，v1 没有全局搜索，因此不存在功能对等风险，
 * 本文件也不参与任何写操作——只读 db，不改任何业务字段。
 *
 * 范围（2026-10-04 用户拍板「扩展」）：案例 / 选题 / 悬赏 / 作业 / 专家 / 帖子 / 板块 / 资产 / 商品，共 9 类。
 * 排序：标题命中优先于正文命中；同级内按上面 KIND_ORDER 固定顺序，保证结果稳定不乱跳。
 */

export interface SearchHit {
  kind: string;
  title: string;
  desc: string;
  to: string;
}

/** 结果排序用的实体顺序；同时也是 UI 分组的依据 */
export const KIND_ORDER = ['案例', '选题', '悬赏', '作业', '专家', '帖子', '板块', '资产', '商品'];

/** 悬赏里只有这几种状态是「大家都能看见」的，草稿/驳回属于发布者自己 */
const BROWSABLE_BOUNTY = new Set(['PENDING_REVIEW', 'PUBLISHED', 'CLAIMED', 'SUBMITTED', 'APPROVED']);

const text = (v: unknown) => (typeof v === 'string' ? v : '');

export function useGlobalSearch(kw: string, limit = 16): SearchHit[] {
  const { db } = useStore();

  return useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return [];

    const pool: SearchHit[] = [];
    const push = (kind: string, title: string, desc: string, to: string) => {
      pool.push({ kind, title: text(title) || '（无标题）', desc: text(desc), to });
    };

    /* ---- 1 案例 ---- */
    for (const c of db.cases ?? []) push('案例', c.title, c.summary, `/cases/${c.id}`);

    /* ---- 2 选题（挂在案例与选题页内，无独立路由） ---- */
    for (const t of db.topics ?? []) push('选题', t.title, text(t.expected_output), '/cases');

    /* ---- 3 悬赏 ---- */
    for (const b of db.bounties ?? []) {
      if (!BROWSABLE_BOUNTY.has(b.status)) continue;
      push('悬赏', b.title, text(b.pain_point), '/bounty');
    }

    /* ---- 4 作业 ---- */
    for (const s of db.submits ?? []) push('作业', s.title, `${text(s.name)} · ${text(s.track)}`, `/work/${s.id}`);

    /* ---- 5 专家 ---- */
    for (const e of db.experts ?? []) push('专家', e.name, `${text(e.dept_name)} · ${text(e.title)}`, `/clinic/expert/${e.id}`);

    /* ---- 6 社区帖子（只搜正常态，审核中/已隐藏/已删除不进搜索） ---- */
    for (const p of db.posts ?? []) {
      if (p.status !== '正常') continue;
      push('帖子', p.title, `${text(p.board_name)} · ${text(p.author_name)}`, `/community/${p.id}`);
    }

    /* ---- 7 板块 ---- */
    for (const b of db.boards ?? []) {
      if (b.status !== '启用') continue;
      push('板块', b.name, text(b.intro), '/community');
    }

    /* ---- 8 资产 ---- */
    for (const a of db.assets ?? []) {
      if (a.status !== '已上架') continue;
      push('资产', a.name, `${text(a.type)} · ${text(a.author_name)}`, '/assets');
    }

    /* ---- 9 商城商品 ---- */
    for (const s of db.shopItems ?? []) {
      if (s.status !== '上架') continue;
      push('商品', s.name, `${s.points} 积分`, '/shop');
    }

    const matches = pool.filter((r) => r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q));

    return matches
      .map((r, i) => ({
        r,
        i,
        // 标题命中 0，仅正文命中 1 —— 标题命中永远排在前面
        score: (r.title.toLowerCase().includes(q) ? 0 : 1) * 100 + KIND_ORDER.indexOf(r.kind) * 10,
      }))
      .sort((a, b) => a.score - b.score || a.i - b.i)
      .slice(0, limit)
      .map((x) => x.r);
  }, [kw, db, limit]);
}
