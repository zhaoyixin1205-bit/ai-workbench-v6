import { useMemo } from 'react';
import { useStore } from '@/store/store';

/**
 * 案例详情：相似推荐 + 评论（P3-3 从 `pages/c/CaseDetail.tsx` :23-40 原样抽出）
 *
 * 口径保持 V4.0 CR-03：按「标签重合度」排序 —— 同标签数 ≥2 优先，其次同部门；
 * 不足 3 条时用「热门（浏览量）」兜底，不出现空推荐位。
 */
export function useCaseSimilar(id: string | undefined) {
  const { db } = useStore();

  return useMemo(() => {
    const c = db.cases.find((x) => x.id === id);
    if (!c) return { c: undefined, similar: [], comments: [] as typeof db.comments };

    const tagOverlap = (x: typeof c) => x.tags.filter((t) => c.tags.includes(t)).length;
    const pool = db.cases.filter((x) => x.id !== c.id);
    const byTag = pool
      .filter((x) => tagOverlap(x) >= 2)
      .sort((a, b) => tagOverlap(b) - tagOverlap(a) || b.view_count - a.view_count);
    const authorDept = db.users.find((u) => u.union_id === c.author_union_id)?.dept_names[0];
    const byDept = authorDept
      ? pool
        .filter((x) => !byTag.includes(x) && db.users.find((u) => u.union_id === x.author_union_id)?.dept_names[0] === authorDept)
        .sort((a, b) => b.view_count - a.view_count)
      : [];
    const hot = [...pool].sort((a, b) => b.view_count - a.view_count);
    const picked = [...byTag, ...byDept, ...hot];
    const similar = [...new Map(picked.map((x) => [x.id, x])).values()].slice(0, 3);

    const comments = db.comments.filter((x) => x.post_id === 'PT01').slice(0, 3);
    return { c, similar, comments };
  }, [db.cases, db.users, db.comments, id]);
}
