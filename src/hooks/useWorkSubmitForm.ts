import { useEffect, useState } from 'react';
import { Form, Upload, App as AntApp } from 'antd';
import type { UploadFile } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/store';
import { TRACKS } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';

/**
 * 作业提报表单逻辑（P3-3 从 `pages/c/WorkSubmit.tsx` :27-132 原样抽出）
 *
 * 抽出的目的同 `useCaseFilters`：v1 一行未改，v2 复用同一份提报逻辑，
 * 保证两版的写入结果（submits / pointRecords / topicSelections 回写）完全一致。
 */

export const ALLOW_EXT = ['zip', 'md', 'yaml', 'pdf', 'docx', 'xlsx', 'png', 'jpg'];

export function useWorkSubmitForm(typeId: string | undefined, caseId: string | null, topicId: string | null) {
  const { db, me, setDb, log } = useStore();
  const nav = useNavigate();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [channel, setChannel] = useState<string>('通道一·用现成 Skill');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [savedAt, setSavedAt] = useState<string>('');

  const type = db.assignmentTypes.find((t) => t.id === typeId) ?? db.assignmentTypes[0];
  const presetCase = db.cases.find((c) => c.id === caseId);
  const presetTopic = db.topics.find((t) => t.id === topicId);
  const period = type
    ? db.periods.find((p) => p.type_id === type.id && p.status === 'OPEN')
    : undefined;

  useEffect(() => {
    form.setFieldsValue({
      track: presetCase?.track ?? presetTopic?.track ?? TRACKS[0],
      title: presetTopic?.title ?? presetCase?.title ?? '',
      scene_desc: presetCase ? `痛点：${presetCase.pain_point}` : '',
      output_sample: presetCase?.output ?? presetTopic?.expected_output ?? '',
      channel: '通道一·用现成 Skill',
      visible_scope: '本部门',
      desensitized: false,
    });
  }, [presetCase, presetTopic, form]);

  const beforeUpload = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOW_EXT.includes(ext)) {
      message.error(`不支持的文件类型 .${ext}（白名单：${ALLOW_EXT.join(' / ')}）`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > 50 * 1024 * 1024) {
      message.error('单个文件不得超过 50MB');
      return Upload.LIST_IGNORE;
    }
    if (files.length >= 5) {
      message.error('最多上传 5 个附件');
      return Upload.LIST_IGNORE;
    }
    if (ext === 'zip') {
      message.info('zip 将校验包内是否含 SKILL.md 与 manifest.yaml（模拟校验通过）');
    }
    return false; // 阻止真实上传，仅前端演示
  };

  const saveDraft = () => {
    setSavedAt(new Date().toTimeString().slice(0, 5));
    message.success('草稿已自动保存（草稿不计入提报次数）');
  };

  const submit = (vals: Record<string, unknown>) => {
    if (!vals.desensitized) { message.error('未勾选脱敏声明，禁止提交'); return; }
    /** 空库保护（P3-1）：早退已保证非空，此处再兜一层，防止绕过 UI 直接触发 */
    if (!type || !period) { message.error('作业类型或提报期不存在，无法提交'); return; }
    const seq = db.submits.filter((s) => s.union_id === me.union_id && s.period_id === period.id).length + 1;
    const id = `S${Date.now()}`;
    /** V4.0 CR-04：提报回写选题记录状态（已选 → 已提报） */
    const tid = presetTopic?.id;
    setDb((p) => ({
      ...p,
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
          title: vals.title as string,
          scene_desc: vals.scene_desc as string,
          before_after: vals.before_after as string,
          output_sample: vals.output_sample as string,
          skill_used: vals.skill_used as string,
          attachments: files.map((f) => ({ name: f.name, size: `${Math.round((f.size ?? 0) / 1024)}KB` })),
          desensitized: true,
          visible_scope: vals.visible_scope as never,
          topic_id: tid,
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
      topicSelections: tid
        ? p.topicSelections.map((s) => (s.topic_id === tid && s.union_id === me.union_id ? { ...s, status: '已提报' } : s))
        : p.topicSelections,
    }));
    log('提交提报', `${type.name} 第 ${period.seq} 期`, '状态 DRAFT → SUBMITTED，已生成积分记录');
    message.success('提报成功！已触发组织者待办提醒，评分结果将通知你');
    nav('/work');
  };

  return {
    form, type, period, presetCase, presetTopic,
    channel, setChannel,
    files, setFiles, beforeUpload,
    savedAt, saveDraft, submit,
  };
}
