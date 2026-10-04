import { useNavigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { useStore } from '@/store/store';
import type { Topic } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';

/**
 * 选题「选它 / 继续提报」（P3-3 从 `pages/c/CaseList.tsx` :74-102 原样抽出）
 *
 * V4.0 CR-03 口径：选题非排斥 —— 同一选题可被 N 人选中；select_limit=0 表示不限。
 * 开关 `topicMultiSelect` 关闭时强制排他（limit=1），等价于 V3.0 的「已被选走」。
 */
export function useTopicPick(multiSelect: boolean) {
  const { db, me, setDb, log } = useStore();
  const nav = useNavigate();
  const { message } = AntApp.useApp();

  const pickedCount = (topicId: string) => db.topicSelections.filter((s) => s.topic_id === topicId).length;
  const mineSelected = (topicId: string) =>
    db.topicSelections.some((s) => s.topic_id === topicId && s.union_id === me.union_id);

  const pickTopic = (t: Topic) => {
    if (t.status === '已关闭') { message.warning('该选题已关闭'); return; }
    const limit = multiSelect ? (t.select_limit ?? 0) : 1;
    const count = pickedCount(t.id);
    if (limit > 0 && count >= limit) {
      message.warning(`该选题限 ${limit} 人选择，当前已满`);
      return;
    }
    const typeId = db.assignmentTypes[0]?.id ?? 'AT1';
    if (mineSelected(t.id)) {
      nav(`/work/submit/${typeId}?topic=${t.id}`);
      return;
    }
    setDb((p) => ({
      ...p,
      topicSelections: [{
        id: `TS${Date.now()}`, topic_id: t.id, union_id: me.union_id,
        selected_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`, status: '已选',
      }, ...p.topicSelections],
    }));
    log('选择选题', t.title, 'V4.0 CR-03 非排斥：同一选题可被多人选中');
    message.success(`已选择「${t.title}」${count > 0 ? `（已有 ${count} 人选择，互不影响）` : ''}`);
    nav(`/work/submit/${typeId}?topic=${t.id}`);
  };

  return { pickedCount, mineSelected, pickTopic };
}
