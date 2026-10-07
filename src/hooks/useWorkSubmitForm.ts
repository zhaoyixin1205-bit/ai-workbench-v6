import { useEffect, useState } from 'react';
import { Form, App as AntApp } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/store';
import { TRACKS } from '@/mock/types';
import type { Attachment, Topic } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { useFileUpload } from '@/service/useFileUpload';

/**
 * 作业提报表单逻辑（P3-3 从 `pages/c/WorkSubmit.tsx` :27-193 原样抽出）
 *
 * 抽出的目的同 `useCaseFilters`：v1 一行未改，v2 复用同一份提报逻辑，
 * 保证两版的写入结果（submits / pointRecords / topicSelections / topics 回写）完全一致。
 *
 * P4 回归补齐（2026-10-05）：初版抽出时漏了两块能力，已按 v1 逐行补回——
 *   ① V6.0 CR-17/CR-18 选题形态三选一（关联既有 / 其他·自定义 / 不选选题），
 *      含 `topicCustom` / `workNoTopic` 两个开关——开关关闭时必须等价于旧版（不出现该选项）。
 *   ② V6.0 CR-31 附件改走真实文件服务（此前退化成只登记文件名，无法下载）。
 */

export const ALLOW_EXT = ['zip', 'md', 'yaml', 'pdf', 'docx', 'xlsx', 'png', 'jpg'];

/** V6.0 CR-18：三种选题形态，互斥 */
export type TopicMode = 'EXISTING' | 'CUSTOM' | 'NONE';

export function useWorkSubmitForm(typeId: string | undefined, caseId: string | null, topicId: string | null) {
  const { db, me, setDb, log, flags, hasRole } = useStore();
  const nav = useNavigate();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [channel, setChannel] = useState<string>('通道一·用现成 Skill');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [savedAt, setSavedAt] = useState<string>('');
  const [topicMode, setTopicMode] = useState<TopicMode>('NONE');

  const type = db.assignmentTypes.find((t) => t.id === typeId) ?? db.assignmentTypes[0];
  const presetCase = db.cases.find((c) => c.id === caseId);
  const presetTopic = db.topics.find((t) => t.id === topicId);
  const period = type
    ? db.periods.find((p) => p.type_id === type.id && p.status === 'OPEN')
    : undefined;

  /** V6.0 CR-18 开关：topicCustom 控制「其他」，workNoTopic 控制「不选选题」 */
  const topicCustomOn = flags.topicCustom !== false;
  const noTopicOn = flags.workNoTopic !== false;

  /** V6.0 CR-17：私有自定义选题仅本人与组织者可选（与选题池同一口径） */
  const selectableTopics = db.topics.filter(
    (t) => t.visibility !== 'PRIVATE' || t.created_by === me.union_id || hasRole('ORGANIZER') || hasRole('ADMIN')
  );

  useEffect(() => {
    /** V6.0 CR-18：带 topic 参数进来时自动落在「关联既有选题」形态 */
    const mode: TopicMode = presetTopic ? 'EXISTING' : 'NONE';
    setTopicMode(mode);
    form.setFieldsValue({
      topic_mode: mode,
      topic_id: presetTopic?.id,
      track: presetCase?.track ?? presetTopic?.track ?? TRACKS[0],
      title: presetTopic?.title ?? presetCase?.title ?? '',
      scene_desc: presetCase ? `痛点：${presetCase.pain_point}` : '',
      output_sample: presetCase?.output ?? presetTopic?.expected_output ?? '',
      channel: '通道一·用现成 Skill',
      visible_scope: '本部门',
      desensitized: false,
    });
  }, [presetCase, presetTopic, form]);

  /** V6.0 CR-18：切换形态时清掉另一种形态的残留值，避免脏数据落库 */
  const switchTopicMode = (m: TopicMode) => {
    setTopicMode(m);
    form.setFieldsValue({ topic_mode: m });
    if (m !== 'EXISTING') form.setFieldsValue({ topic_id: undefined });
    if (m !== 'CUSTOM') form.setFieldsValue({ custom_topic: undefined });
  };

  /**
   * V6.0 CR-31：附件改走真实文件服务（此前只登记文件名，无法下载 —— A-39 遗留项结案）。
   * 开关 `realFileService === false` 时回退演示态（登记元数据、不给下载按钮），与 v1 同口径。
   */
  const { beforeUpload, uploading } = useFileUpload('SUBMIT', `SUBMIT-${me.union_id}`, {
    count: atts.length,
    max: 5,
    onDone: (a) => setAtts((p) => [...p, a]),
  });

  const saveDraft = () => {
    setSavedAt(new Date().toTimeString().slice(0, 5));
    message.success('草稿已自动保存（草稿不计入提报次数）');
  };

  const submit = (vals: Record<string, unknown>) => {
    if (!vals.desensitized) { message.error('未勾选脱敏声明，禁止提交'); return; }
    /** 空库保护（P3-1）：早退已保证非空，此处再兜一层，防止绕过 UI 直接触发 */
    if (!type || !period) { message.error('作业类型或提报期不存在，无法提交'); return; }

    /** V6.0 CR-18：三种选题形态互斥校验 */
    const mode = (vals.topic_mode as TopicMode) ?? 'NONE';
    if (mode === 'EXISTING' && !vals.topic_id) { message.error('选择了「关联既有选题」，请先指定选题'); return; }
    if (mode === 'CUSTOM' && !(vals.custom_topic as string)?.trim()) { message.error('选择了「其他·自定义」，请填写选题名称'); return; }
    if (mode === 'NONE' && !(vals.title as string)?.trim()) { message.error('不选选题时，场景标题必填'); return; }

    const seq = db.submits.filter((s) => s.union_id === me.union_id && s.period_id === period.id).length + 1;
    const id = `S${Date.now()}`;
    const now = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;

    const topicId = mode === 'EXISTING' ? (vals.topic_id as string) : undefined;
    const customTopic = mode === 'CUSTOM' ? (vals.custom_topic as string).trim() : undefined;

    /** V6.0 CR-18：「其他·自定义」落一条私有选题记录，供后续统计与组织者公开 */
    const newTopic: Topic | null = mode === 'CUSTOM' && customTopic
      ? {
        id: `T-CUSTOM-${Date.now()}`,
        case_id: '',
        title: customTopic,
        difficulty: '中',
        expected_output: '（自定义选题，产出形式自拟）',
        suggest_level: '骨干层',
        track: vals.track as Topic['track'],
        status: '可选',
        tags: ['自定义'],
        is_custom: true,
        created_by: me.union_id,
        visibility: 'PRIVATE',
      }
      : null;

    const targetTopicId = newTopic?.id ?? topicId;

    setDb((p) => {
      /** 边界：不选选题的提报不生成「我的选题」条目，避免流程断层提示误报 */
      let nextSelections = p.topicSelections;
      if (targetTopicId) {
        const exists = nextSelections.some((s) => s.topic_id === targetTopicId && s.union_id === me.union_id);
        nextSelections = exists
          ? nextSelections.map((s) => (s.topic_id === targetTopicId && s.union_id === me.union_id ? { ...s, status: '已提报' } : s))
          : [{ id: `TS${Date.now()}`, topic_id: targetTopicId, union_id: me.union_id, selected_at: now, status: '已提报' }, ...nextSelections];
      }
      return {
        ...p,
        topics: newTopic ? [newTopic, ...p.topics] : p.topics,
        submits: [
          {
            id,
            code: `${type.code}-P${period.seq}-${String(p.submits.length + 1).padStart(4, '0')}`,
            type_id: type.id,
            period_id: period.id,
            union_id: me.union_id,
            name: me.name,
            dept_name: me.dept_names[0] ?? '未填写',
            seq_no: seq,
            track: vals.track as never,
            channel: vals.channel as never,
            title: (vals.title as string) || customTopic || '未命名场景',
            scene_desc: vals.scene_desc as string,
            before_after: vals.before_after as string,
            output_sample: vals.output_sample as string,
            skill_used: vals.skill_used as string,
            /** V6.0 CR-31：附件带 file_id / url，下载走服务端代理 */
            attachments: atts,
            desensitized: true,
            visible_scope: vals.visible_scope as never,
            /** V4.0 CR-04：关联选题；V6.0 CR-18：自定义选题名 / 不选选题 */
            topic_id: topicId,
            custom_topic: customTopic,
            status: 'SUBMITTED',
            score_card_version: type.score_card_version,
            submitted_at: DEMO_TODAY + ' ' + new Date().toTimeString().slice(0, 5),
            late: false,
          },
          ...p.submits,
        ],
        pointRecords: [
          { id: `PR${Date.now()}`, union_id: me.union_id, name: me.name, source: '完成提报', points: 30, campaign_id: 'C2026Q4', remark: type.name, created_at: DEMO_TODAY },
          ...p.pointRecords,
        ],
        topicSelections: nextSelections,
      };
    });
    log(
      '提交提报',
      `${type.name} 第 ${period.seq} 期`,
      `状态 DRAFT → SUBMITTED，已生成积分记录；选题形态：${
        mode === 'EXISTING' ? '关联既有选题' : mode === 'CUSTOM' ? `其他·自定义（${customTopic}）` : '不选选题直提'
      }`
    );
    /**
     * V8.3-10.07：这里只负责把作业写成 SUBMITTED；AI 评分与推送评委由 store 的流水线自动接手
     *（此前提交后没有任何评分逻辑，才出现「AI 评分不触发、评委收不到」）。
     * 文案同步改为真实承诺：自动评分 + 推送评委，而不是空头支票「触发组织者待办」。
     */
    message.success('提报成功！系统已自动完成 AI 评分，之后由组织者统一推送评委复核，结果出来后会通知你');
    nav('/work');
  };

  return {
    form, type, period, presetCase, presetTopic,
    channel, setChannel,
    atts, setAtts, beforeUpload, uploading,
    savedAt, saveDraft, submit,
    /** V6.0 CR-17/CR-18：选题形态 */
    topicMode, switchTopicMode, selectableTopics, topicCustomOn, noTopicOn,
  };
}
