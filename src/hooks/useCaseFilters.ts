import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';

/**
 * 「案例与选题」筛选逻辑（P3-3 从 `pages/c/CaseList.tsx` 原样抽出）
 *
 * 抽出的目的：v2 新页面复用**同一份**筛选逻辑，避免两版各自实现导致口径漂移。
 * v1 页面**一行未改**（红线：不碰业务代码）；这里的代码与 v1 :28-72 逐行等价。
 *
 * 覆盖的开关（全部保持原语义）：
 *   flags.topicFreeTags   关闭 → 标签体系整体不展示
 *   flags.topicMultiSelect 关闭 → 选题强制排他（limit=1）
 *   flags.caseSkillPackage / flags.caseAttachment  两个都关 ≡ V4.0（资源筛选器不出现）
 */

export type TagMode = 'ANY' | 'ALL';
export type ResFilter = 'ALL' | 'SKILL' | 'ATTACH';

export function useCaseFilters() {
  const { db, flags } = useStore();
  const [track, setTrack] = useState<string>('全部');
  const [kw, setKw] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<TagMode>('ANY');
  /** V4.2：按「有没有可直接安装的 Skill / 附件」筛选 —— 员工最常问的是「哪个装上就能跑」 */
  const [resFilter, setResFilter] = useState<ResFilter>('ALL');

  /** 标签池 = 案例标签 ∪ 选题标签（去重排序） */
  const tagPool = useMemo(() => {
    const set = new Set<string>();
    db.cases.forEach((c) => c.tags.forEach((t) => set.add(t)));
    db.topics.forEach((t) => (t.tags ?? []).forEach((x) => set.add(x)));
    return [...set].sort();
  }, [db.cases, db.topics]);

  const freeTags = flags.topicFreeTags !== false;
  const multiSelect = flags.topicMultiSelect !== false;
  const skillOn = flags.caseSkillPackage !== false;
  const attachOn = flags.caseAttachment !== false;
  const resFilterable = skillOn || attachOn;

  const matchTags = (tags: string[]) => {
    if (!freeTags || tagFilter.length === 0) return true;
    return tagMode === 'ALL' ? tagFilter.every((t) => tags.includes(t)) : tagFilter.some((t) => tags.includes(t));
  };

  const list = useMemo(
    () =>
      db.cases.filter((c) => {
        if (track !== '全部' && c.track !== track) return false;
        if (kw && !`${c.title}${c.summary}${c.tags.join()}`.includes(kw)) return false;
        if (!matchTags(c.tags)) return false;
        if (resFilter === 'SKILL' && !(skillOn && (c.skill_packages?.length ?? 0) > 0)) return false;
        if (resFilter === 'ATTACH' && !(attachOn && (c.attachments?.length ?? 0) > 0)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.cases, track, kw, tagFilter, tagMode, resFilter, skillOn, attachOn]
  );

  const topicList = useMemo(
    () => db.topics.filter((t) => {
      if (track !== '全部' && t.track !== track) return false;
      if (kw && !`${t.title}${t.expected_output}${(t.tags ?? []).join()}`.includes(kw)) return false;
      if (!matchTags(t.tags ?? [])) return false;
      return true;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.topics, track, kw, tagFilter, tagMode]
  );

  const resetFilter = () => { setTrack('全部'); setKw(''); setTagFilter([]); setResFilter('ALL'); };

  /** 当前是否处于「有筛选」状态，供空态回显筛选上下文 */
  const filtering = track !== '全部' || kw !== '' || tagFilter.length > 0 || resFilter !== 'ALL';

  return {
    track, setTrack,
    kw, setKw,
    tagFilter, setTagFilter,
    tagMode, setTagMode,
    resFilter, setResFilter,
    tagPool, freeTags, multiSelect, skillOn, attachOn, resFilterable,
    list, topicList, resetFilter, filtering, matchTags,
  };
}
