import { useMemo, useState } from 'react';
import { App as AntApp, Form } from 'antd';
import type { UploadFile } from 'antd';
import { useStore } from '@/store/store';
import { useFileUpload } from '@/service/useFileUpload';
import type { Attachment, Bounty, BountyStatus } from '@/mock/types';

/**
 * 悬赏榜逻辑（P3-4 从 `pages/c/BountyList.tsx` :17-236 原样抽出）
 *
 * 覆盖 V6.0 CR-20 / CR-21 / CR-31 全部行为：
 *   三 Tab（大厅 / 我发布的 / 我认领的）+ 状态筛选；
 *   认领 / 撤回认领；结构化方案提交（开关关闭时退化为单文本框）；
 *   方案修改（回退重审、版本链留痕、次数上限 3）；方案补充（仅追加，不动状态与积分）。
 *
 * v1 一行未改，v2 复用同一份，两版写入结果完全一致。
 */

/** V6.0 CR-20：附件白名单与作业提报一致 */
export const BOUNTY_ALLOW_EXT = ['zip', 'md', 'yaml', 'pdf', 'docx', 'xlsx', 'png', 'jpg'];
/** V6.0 CR-21：方案修改次数上限（超出需联系组织者） */
export const MODIFY_LIMIT = 3;

export const BOUNTY_STATUS_META: Record<BountyStatus, { text: string; color: string }> = {
  MEMBER_DRAFT: { text: '草稿', color: 'default' },
  PENDING_REVIEW: { text: '待审核', color: 'gold' },
  PUBLISHED: { text: '可认领', color: 'orange' },
  REJECTED: { text: '已驳回', color: 'red' },
  CLAIMED: { text: '已认领', color: 'blue' },
  SUBMITTED: { text: '方案已提交', color: 'cyan' },
  APPROVED: { text: '已通过', color: 'green' },
  EXPIRED: { text: '已超期释放', color: 'default' },
};

export type SolutionMode = 'SUBMIT' | 'MODIFY' | 'SUPPLEMENT';

export function useBountyBoard() {
  const { db, me, setDb, log, flags } = useStore();
  const { message, modal } = AntApp.useApp();

  const [tab, setTab] = useState('all');
  const [filter, setFilter] = useState('全部');
  const [submitting, setSubmitting] = useState<Bounty | null>(null);
  const [modifyTarget, setModifyTarget] = useState<Bounty | null>(null);
  const [supplementTarget, setSupplementTarget] = useState<Bounty | null>(null);
  /** V5.0 兼容：开关关闭时的单文本框方案 */
  const [solution, setSolution] = useState('');
  /** V6.0 CR-20/21 开关：关闭 = 单文本框方案，无修改/补充通道（≡ V5.0） */
  const solutionV2 = flags.bountySolutionV2 !== false;

  const [solForm] = Form.useForm();
  const [solFiles, setSolFiles] = useState<UploadFile[]>([]);
  /** V6.0 CR-31：真实附件元数据（提交时落库，带 file_id 可下载） */
  const [solAtts, setSolAtts] = useState<Attachment[]>([]);

  const list = useMemo(() => {
    let arr = db.bounties;
    if (tab === 'mine') arr = arr.filter((b) => b.owner_union_id === me.union_id);
    if (tab === 'claimed') arr = arr.filter((b) => b.claimant_union_id === me.union_id);
    if (tab === 'all') {
      arr = arr.filter(
        (b) => b.status !== 'MEMBER_DRAFT' && b.status !== 'PENDING_REVIEW' && b.status !== 'REJECTED'
      );
    }
    if (filter !== '全部') arr = arr.filter((b) => BOUNTY_STATUS_META[b.status].text === filter);
    return arr;
  }, [db.bounties, tab, filter, me.union_id]);

  const claim = (b: Bounty) => {
    modal.confirm({
      title: `认领「${b.title}」？`,
      content: '认领后需在 48 小时内提交方案，超期将自动释放。同一悬赏默认仅 1 名认领人。',
      okText: '确认认领',
      onOk: () => {
        setDb((p) => ({
          ...p,
          bounties: p.bounties.map((x) =>
            x.id === b.id
              ? { ...x, status: 'CLAIMED', claimant_union_id: me.union_id, claimant_name: me.name }
              : x
          ),
        }));
        log('认领悬赏', b.title, '状态 PUBLISHED → CLAIMED');
        message.success('认领成功，请于 48 小时内提交方案');
      },
    });
  };

  const withdraw = (b: Bounty) => {
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) =>
        x.id === b.id
          ? { ...x, status: 'PUBLISHED', claimant_union_id: undefined, claimant_name: undefined }
          : x
      ),
    }));
    message.success('已撤回认领，悬赏重新开放');
  };

  /**
   * V6.0 CR-31：附件改走真实文件服务（此前「只登记元数据，未接入文件服务」—— A-39 结案）。
   * 校验口径与作业提报一致；zip 由服务端解包真实校验 SKILL.md + manifest.yaml。
   */
  const { beforeUpload, uploading } = useFileUpload('BOUNTY_SOLUTION', `BOUNTY-${me.union_id}`, {
    count: solAtts.length,
    max: 5,
    onDone: (a) => setSolAtts((p) => [...p, a]),
  });

  /** V6.0 CR-31：返回真实附件元数据（带 file_id，可下载） */
  const fileMeta = (): Attachment[] => solAtts;

  const resetSol = () => {
    setSolFiles([]);
    setSolAtts([]);
    solForm.resetFields();
  };

  const readFields = (vals: Record<string, unknown>) => ({
    scene_desc: (vals.scene_desc as string) ?? '',
    output_sample: (vals.output_sample as string) ?? '',
    skill_used: (vals.skill_used as string) ?? '',
    before_after: (vals.before_after as string) ?? '',
  });

  /** V6.0 CR-20：结构化提交（关闭开关时走旧的单文本框） */
  const doSubmit = async () => {
    if (!solutionV2) {
      if (solution.trim().length < 20) { message.warning('方案描述至少 20 字'); return; }
      setDb((p) => ({
        ...p,
        bounties: p.bounties.map((x) => (x.id === submitting!.id ? { ...x, status: 'SUBMITTED', solution } : x)),
      }));
      log('提交悬赏方案', submitting!.title, '状态 CLAIMED → SUBMITTED');
      message.success('方案已提交，等待组织者审核');
      setSubmitting(null); setSolution('');
      return;
    }
    let vals: Record<string, unknown>;
    try {
      vals = await solForm.validateFields();
    } catch {
      message.error('请填写必填项');
      return;
    }
    const fields = readFields(vals);
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) =>
        x.id === submitting!.id
          ? {
              ...x,
              status: 'SUBMITTED',
              solution_fields: fields,
              solution_attachments: fileMeta(),
              /** 首次提交即建立版本链起点，后续修改留痕不覆写 */
              solution_versions: [
                {
                  id: `SV${Date.now()}`,
                  version: 1,
                  fields,
                  attachments: fileMeta(),
                  note: '首次提交',
                  operator: me.name,
                  created_at: `${new Date().toLocaleDateString('zh-CN')} ${new Date().toTimeString().slice(0, 5)}`,
                },
              ],
              solution_modify_count: 0,
            }
          : x
      ),
    }));
    log('提交悬赏方案', submitting!.title, `状态 CLAIMED → SUBMITTED；结构化字段 4 项 + 附件 ${solFiles.length} 个`);
    message.success('方案已提交，等待组织者审核');
    setSubmitting(null);
    resetSol();
  };

  /** V6.0 CR-21：方案修改 —— 回退至 SUBMITTED 重走审核，原版本保留为历史版本 */
  const doModify = async () => {
    const b = modifyTarget!;
    let vals: Record<string, unknown>;
    try {
      vals = await solForm.validateFields();
    } catch {
      message.error('请填写必填项');
      return;
    }
    const used = b.solution_modify_count ?? 0;
    if (used >= MODIFY_LIMIT) {
      message.error(`修改次数已达上限 ${MODIFY_LIMIT} 次，如需继续修改请联系组织者`);
      return;
    }
    const now = `${new Date().toLocaleDateString('zh-CN')} ${new Date().toTimeString().slice(0, 5)}`;
    const fields = readFields(vals);
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) => {
        if (x.id !== b.id) return x;
        const history = x.solution_versions ?? [];
        return {
          ...x,
          status: 'SUBMITTED',
          solution_fields: fields,
          solution_attachments: fileMeta(),
          /** 修改前内容作为历史版本保留，原审核记录不覆写 */
          solution_versions: [
            ...history,
            {
              id: `SV${Date.now()}`,
              version: history.length + 1,
              fields: { ...fields },
              attachments: fileMeta(),
              note: (vals.note as string) ?? '方案修改',
              operator: me.name,
              created_at: now,
            },
          ],
          solution_modify_count: used + 1,
        };
      }),
    }));
    log(
      '修改悬赏方案',
      b.title,
      `第 ${used + 1} 次修改：状态回退至 SUBMITTED 重走审核，原审核记录标记作废并保留为版本 v${(b.solution_versions?.length ?? 0) + 1}`
    );
    message.success(`已提交修改（第 ${used + 1}/${MODIFY_LIMIT} 次），状态回退至「方案已提交」重走审核`);
    setModifyTarget(null);
    resetSol();
  };

  /** V6.0 CR-21：方案补充 —— 仅追加资料，状态与积分不变 */
  const doSupplement = async () => {
    const b = supplementTarget!;
    let vals: Record<string, unknown>;
    try {
      vals = await solForm.validateFields();
    } catch {
      message.error('请填写补充说明');
      return;
    }
    const now = `${new Date().toLocaleDateString('zh-CN')} ${new Date().toTimeString().slice(0, 5)}`;
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) =>
        x.id === b.id
          ? {
              ...x,
              supplements: [
                ...(x.supplements ?? []),
                {
                  id: `SP${Date.now()}`,
                  content: (vals.content as string) ?? '',
                  attachments: fileMeta(),
                  operator: me.name,
                  created_at: now,
                },
              ],
            }
          : x
      ),
    }));
    log('补充悬赏方案', b.title, `追加资料 ${fileMeta().length} 个附件；原状态 ${b.status} 与积分不变`);
    message.success('补充资料已追加，原流程与积分不受影响');
    setSupplementTarget(null);
    resetSol();
  };

  /** 打开三个弹窗时统一重置表单与附件（避免上一次的残留值被带进来） */
  const openSolutionModal = (b: Bounty, mode: SolutionMode) => {
    resetSol();
    if (mode === 'SUBMIT') {
      setSubmitting(b);
      solForm.setFieldsValue({ scene_desc: b.pain_point });
      return;
    }
    if (mode === 'MODIFY') {
      /** 旧数据兼容：solution 单文本框映射为 scene_desc */
      solForm.setFieldsValue({
        scene_desc: b.solution_fields?.scene_desc ?? b.solution ?? '',
        output_sample: b.solution_fields?.output_sample ?? '',
        skill_used: b.solution_fields?.skill_used ?? '',
        before_after: b.solution_fields?.before_after ?? '',
      });
      setModifyTarget(b);
      return;
    }
    setSupplementTarget(b);
  };

  const removeAtt = (id: string, name: string) => {
    setSolAtts((p) => p.filter((x) => x.id !== id));
    setSolFiles((p) => p.filter((x) => x.name !== name));
  };

  return {
    tab, setTab, filter, setFilter, list,
    solutionV2, solution, setSolution,
    solForm, solFiles, setSolFiles, solAtts, beforeUpload, uploading, removeAtt,
    submitting, setSubmitting, modifyTarget, setModifyTarget,
    supplementTarget, setSupplementTarget,
    claim, withdraw, doSubmit, doModify, doSupplement, openSolutionModal,
  };
}
