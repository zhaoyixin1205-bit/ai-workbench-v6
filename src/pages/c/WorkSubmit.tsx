import { Button, Card, Checkbox, Divider, Form, Input, Radio, Space, Steps, Tag, Typography, Upload, App as AntApp, Alert, Select } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, InboxOutlined, SaveOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { TRACKS } from '@/mock/types';
import type { Attachment, Topic } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { UploadFile } from 'antd';
import { useFileUpload } from '@/service/useFileUpload';
import { downloadAttachment } from '@/service/fileService';
import {
  clearDraft, draftClock, draftStamp, readDraft, workDraftKey, writeDraft,
} from '@/utils/workDraft';

/** V10.16 草稿防抖：与社区发帖 / v2 提报同一档，停笔 1.2s 落盘 */
const DRAFT_DEBOUNCE_MS = 1200;

const ALLOW_EXT = ['zip', 'md', 'yaml', 'pdf', 'docx', 'xlsx', 'png', 'jpg'];

/** 分组标题：序号胶囊 + 文案，统一表单分段的视觉节奏 */
function StepTitle({ n, text }: { n: string; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 24, height: 24, borderRadius: 8, background: GRADIENT.primary, color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, boxShadow: SHADOW.button,
      }}>{n}</span>
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{text}</span>
    </span>
  );
}

export default function WorkSubmit() {
  const { typeId } = useParams();
  const [qs] = useSearchParams();
  const { db, me, setDb, log, flags, hasRole } = useStore();
  const nav = useNavigate();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [channel, setChannel] = useState<string>('通道一·用现成 Skill');
  const [files, setFiles] = useState<UploadFile[]>([]);
  /** V6.0 CR-31：真实附件元数据（提交时落库，带 file_id 可下载） */
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [savedAt, setSavedAt] = useState<string>('');
  /** V6.0 CR-18：选题形态 —— 关联既有 / 其他·自定义 / 不选选题 */
  const [topicMode, setTopicMode] = useState<'EXISTING' | 'CUSTOM' | 'NONE'>('NONE');
  /**
   * V10.16 真草稿（修复「显示草稿已保存、重进却清空」）：
   * 旧 saveDraft 只 set 组件 state + 弹 toast，零持久化，页面一卸载即丢。
   * 现在写 localStorage（键按 unionId + 作业类型隔离，与 v2 同源同函数）。
   */
  const [draftTip, setDraftTip] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const type = db.assignmentTypes.find((t) => t.id === typeId) ?? db.assignmentTypes[0];
  const presetCase = db.cases.find((c) => c.id === qs.get('case'));
  const presetTopic = db.topics.find((t) => t.id === qs.get('topic'));
  const period = db.periods.find((p) => p.type_id === type.id && p.status === 'OPEN')!;

  /** 草稿键：按 unionId + 作业类型隔离（与 v2 同源同函数） */
  const draftKey = workDraftKey(me.union_id, type.id);

  /** 挂载探测：有草稿 → 提示条（恢复 / 丢弃），页头补上保存时间 */
  useEffect(() => {
    const d = readDraft(draftKey);
    if (d) {
      setDraftTip(true);
      setDraftSavedAt(d.savedAt);
      setSavedAt(draftClock(d.savedAt));
    }
  }, [draftKey]);

  /** 卸载时清掉未落盘的防抖定时器 */
  useEffect(() => () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
  }, []);

  /** V6.0 CR-18 开关：topicCustom 控制「其他」，workNoTopic 控制「不选选题」 */
  const topicCustomOn = flags.topicCustom !== false;
  const noTopicOn = flags.workNoTopic !== false;

  /** V6.0 CR-17：私有自定义选题仅本人与组织者可选（与选题池同一口径） */
  const selectableTopics = db.topics.filter(
    (t) => t.visibility !== 'PRIVATE' || t.created_by === me.union_id || hasRole('ORGANIZER') || hasRole('ADMIN')
  );

  useEffect(() => {
    /** V6.0 CR-18：带 topic 参数进来时自动落在「关联既有选题」形态 */
    const mode: 'EXISTING' | 'CUSTOM' | 'NONE' = presetTopic ? 'EXISTING' : 'NONE';
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
  const switchTopicMode = (m: 'EXISTING' | 'CUSTOM' | 'NONE') => {
    setTopicMode(m);
    form.setFieldsValue({ topic_mode: m });
    if (m !== 'EXISTING') form.setFieldsValue({ topic_id: undefined });
    if (m !== 'CUSTOM') form.setFieldsValue({ custom_topic: undefined });
  };

  /**
   * V6.0 CR-31：附件改走真实文件服务（此前只登记文件名，无法下载 —— A-39 遗留项结案）。
   * 校验口径（白名单 / 50MB / 最多 5 个）与服务端一致；zip 由服务端解包真实校验
   * 是否含 SKILL.md，不再是「模拟校验通过」。
   */
  const { beforeUpload, uploading } = useFileUpload('SUBMIT', `SUBMIT-${me.union_id}`, {
    count: atts.length,
    max: 5,
    onDone: (a) => setAtts((p) => [...p, a]),
  });

  /** 内部：把当前表单 + 通道 + 附件 + 形态写成草稿 */
  const persistDraft = (): boolean => {
    const ok = writeDraft(draftKey, {
      fields: form.getFieldsValue(),
      channel, topicMode, atts,
      savedAt: draftStamp(),
    });
    if (ok) setSavedAt(draftClock(draftStamp()));
    return ok;
  };

  /** 保存草稿（手动）。文案点明「仅本机浏览器」——localStorage 不跨设备同步 */
  const saveDraft = () => {
    if (!persistDraft()) {
      message.error('保存失败：浏览器存储不可用（可能是隐私模式或空间已满）');
      return;
    }
    message.success('草稿已保存（仅保存在本机浏览器，不计入提报次数）');
  };

  /** 表单变动 → 防抖自动保存；空表单跳过（一进页面不凭空落草稿） */
  const onDraftChange = () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      persistDraft();
    }, DRAFT_DEBOUNCE_MS);
  };

  /** 恢复草稿：灌回表单 + 通道 + 附件 + 选题形态 */
  const restoreDraft = () => {
    const d = readDraft(draftKey);
    if (!d) { setDraftTip(false); return; }
    form.setFieldsValue(d.fields);
    setChannel(d.channel);
    setTopicMode(d.topicMode);
    setAtts(d.atts);
    setSavedAt(draftClock(d.savedAt));
    setDraftTip(false);
    message.success(`已恢复上次草稿（保存于 ${d.savedAt || '未知时间'}）`);
  };

  /** 丢弃草稿：只清草稿区，不动当前表单 */
  const discardDraft = () => {
    clearDraft(draftKey);
    setDraftTip(false);
    setSavedAt('');
    message.success('已丢弃草稿');
  };

  const submit = (vals: Record<string, unknown>) => {
    if (!vals.desensitized) { message.error('未勾选脱敏声明，禁止提交'); return; }
    /** V6.0 CR-18：三种选题形态互斥校验 */
    const mode = (vals.topic_mode as 'EXISTING' | 'CUSTOM' | 'NONE') ?? 'NONE';
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
            dept_name: me.dept_names[0],
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
     * V8.3-10.07：这里只需要把作业置为 SUBMITTED，AI 评分与推送评委由 store 里的
     * 流水线自动接手（在此之前没有任何评分逻辑，所以出现了「AI 评分不触发、评委收不到」）。
     * 提示文案也据此改写，不再承诺「触发组织者待办」这种实际没做的事。
     */
    message.success(`提报成功！系统已自动完成 AI 评分，之后由组织者统一推送评委复核，结果出来后会通知你`);
    /** V10.16：提交成功即清草稿——留着下次进页面会弹「检测到草稿」，但内容已提交，造成困惑 */
    clearDraft(draftKey);
    nav('/work');
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Link to="/work" style={{ color: COLOR.textSub, fontSize: 13, fontWeight: 500 }}>
          <ArrowLeftOutlined /> 返回作业提报
        </Link>

        {/* V10.16：草稿提示条（探测到未提交草稿时给恢复/丢弃入口） */}
        {draftTip && (
          <Alert
            type="info" showIcon
            message={`检测到未提交的草稿（保存于 ${draftSavedAt || '未知时间'}）`}
            description="草稿只保存在本机浏览器，换设备不同步。"
            action={
              <Space size={4}>
                <Button size="small" type="link" onClick={restoreDraft}>恢复草稿</Button>
                <Button size="small" type="link" danger onClick={discardDraft}>丢弃</Button>
              </Space>
            }
          />
        )}

        <Card styles={{ body: { padding: '18px 20px', background: GRADIENT.subtle } }}>
          <Steps
            size="small"
            current={0}
            items={[
              { title: '选题信息' },
              { title: '过程与产出' },
              { title: '声明与提交' },
            ]}
          />
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {type.name} · 第 {period.seq} 期 · 提交物模板：{type.form_template} · 评分卡 {type.score_card_version}
            </Typography.Text>
            <Typography.Text type={savedAt ? 'success' : 'secondary'} style={{ fontSize: 12 }}>
              {savedAt ? `✓ 草稿已保存 ${savedAt}` : '草稿自动保存，支持断点续填'}
            </Typography.Text>
          </div>
        </Card>

        <Form form={form} layout="vertical" onFinish={submit} onValuesChange={onDraftChange}>
          {/* 第一段：选题信息 */}
          <Card title={<StepTitle n="1" text="选题信息" />}>
            {(presetCase || presetTopic) && (
              <Alert type="success" showIcon style={{ marginBottom: 16 }}
                message={`已从${presetCase ? '案例' : '选题池'}预填：${presetCase?.title ?? presetTopic?.title}，可修改`} />
            )}
            {/* V6.0 CR-18：三种选题形态（关联既有 / 其他·自定义 / 不选选题），均不消耗额外提报次数 */}
            <Form.Item name="topic_mode" label="选题形态" rules={[{ required: true }]}>
              <Radio.Group
                optionType="button"
                value={topicMode}
                onChange={(e) => switchTopicMode(e.target.value)}
                options={[
                  { label: '关联既有选题', value: 'EXISTING' },
                  ...(topicCustomOn ? [{ label: '其他 · 自定义', value: 'CUSTOM' }] : []),
                  ...(noTopicOn ? [{ label: '不选选题，直接提', value: 'NONE' }] : []),
                ]}
              />
            </Form.Item>

            {topicMode === 'EXISTING' && (
              <Form.Item
                name="topic_id" label="选择选题"
                extra="私有自定义选题仅本人与组织者可见；列表与你可见范围一致"
              >
                <Select
                  showSearch allowClear placeholder="从选题池中选择（可搜索）"
                  optionFilterProp="label"
                  options={selectableTopics.map((t) => ({
                    value: t.id,
                    label: `${t.title}${t.is_custom ? '（自定义）' : ''}`,
                  }))}
                />
              </Form.Item>
            )}

            {topicMode === 'CUSTOM' && (
              <Form.Item
                name="custom_topic" label="自定义选题名称"
                rules={[
                  { required: true, message: '请填写自定义选题名称' },
                  { max: 30, message: '不超过 30 字' },
                ]}
                extra="默认仅你与组织者可见；组织者可在内容管理公开给全员"
              >
                <Input placeholder="如：客户拜访前的 5 分钟准备卡" maxLength={30} showCount />
              </Form.Item>
            )}

            {topicMode === 'NONE' && (
              <Alert
                type="info" showIcon style={{ marginBottom: 16 }}
                message="不选选题直接提报"
                description="不占用选题池名额，也不会在「我的选题」中生成条目；标题写清楚场景即可，后续照常进入评分与复核。"
              />
            )}

            <Form.Item name="track" label="赛道" rules={[{ required: true }]}>
              <Radio.Group options={TRACKS.map((t) => ({ label: t, value: t }))} optionType="button" />
            </Form.Item>
            <Form.Item name="channel" label="通道" rules={[{ required: true }]}>
              <Radio.Group
                optionType="button"
                options={['通道一·用现成 Skill', '通道二·自建 Skill']}
                onChange={(e) => setChannel(e.target.value)}
              />
            </Form.Item>
            <Form.Item name="title" label="场景标题" rules={[{ required: true, message: '请填写场景标题' }]}>
              <Input placeholder="如：为 TOP10 客户做月度经营体检" />
            </Form.Item>
          </Card>

          {/* 第二段：过程与产出 */}
          <Card title={<StepTitle n="2" text="过程与产出" />} style={{ marginTop: 16 }}>
            <Form.Item
              name="scene_desc" label="业务场景说明"
              rules={[{ required: true, message: '请说明业务场景' }]}
              extra="说清：谁遇到、多久一次、现在怎么解决、代价是什么"
            >
              <Input.TextArea rows={3} />
            </Form.Item>

            {channel === '通道一·用现成 Skill' ? (
              <Form.Item
                name="before_after" label="前后对比"
                rules={[{ required: true, message: '通道一必须填写前后对比' }]}
                extra="使用前耗时/质量 → 使用后耗时/质量，用数字说话"
              >
                <Input.TextArea rows={3} placeholder="使用前：人工 2 小时/次，漏检率约 15%；使用后：25 分钟/次，漏检率降至 3%。" />
              </Form.Item>
            ) : (
              <Form.Item
                name="before_after" label="实测记录"
                rules={[{ required: true, message: '通道二必须填写实测记录' }]}
                extra="Skill 包的实测过程：跑了哪些真实数据、遇到什么问题、怎么解决的"
              >
                <Input.TextArea rows={3} placeholder="在 22 份真实纪要上实测，命中率 78%，失败主要集中在不完整纪要…" />
              </Form.Item>
            )}

            <Form.Item name="output_sample" label="产出样本" rules={[{ required: true }]}>
              <Input.TextArea rows={3} placeholder="粘贴一段真实产出（注意脱敏）" />
            </Form.Item>

            <Form.Item name="skill_used" label="所用 Skill" rules={[{ required: true }]}>
              <Input placeholder="内置 Skill 名称，或自建 Skill 包名称" />
            </Form.Item>

            <Form.Item
              label="附件"
              extra={`白名单 ${ALLOW_EXT.join(' / ')}，单文件 ≤50MB，最多 5 个；zip 由服务端解包校验是否含 SKILL.md${uploading > 0 ? ` · 上传中 ${uploading}` : ''}`}
            >
              <Upload.Dragger
                multiple
                maxCount={5}
                beforeUpload={beforeUpload}
                fileList={files}
                onChange={({ fileList }) => setFiles(fileList)}
                customRequest={({ onSuccess }) => setTimeout(() => onSuccess?.('ok'), 300)}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">点击或拖拽上传附件</p>
                <p className="ant-upload-hint">支持 zip / md / yaml / pdf / docx / xlsx / png / jpg</p>
              </Upload.Dragger>
              {/* V6.0 CR-31：真实文件可下载；演示态如实说明，不给假下载按钮 */}
              {atts.length > 0 && (
                <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                  {atts.map((a) => (
                    <Space key={a.id} size={6} style={{ maxWidth: '100%' }}>
                      {/* V8.3-10.09：文件名可能是长 URL / 长中文标题，需断词防撑破 */}
                      <span style={{ fontSize: 13, overflowWrap: 'anywhere', wordBreak: 'break-all', minWidth: 0 }}>{a.name}</span>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{a.size}</Typography.Text>
                      {/* V10.13：走带会话凭证的下载（存库 url 的 5 分钟短签名早已过期，直接 href 会 401） */}
                      {a.url ? (
                        <Button
                          size="small"
                          type="link"
                          icon={<DownloadOutlined />}
                          onClick={async () => {
                            try {
                              await downloadAttachment({ id: a.id, name: a.name });
                            } catch (e) {
                              message.error(e instanceof Error ? e.message : '下载失败，请稍后重试');
                            }
                          }}
                        >
                          下载
                        </Button>
                      ) : (
                        <Tag>演示态·未落真实文件</Tag>
                      )}
                      <Button size="small" type="link" danger onClick={() => {
                        setAtts((p) => p.filter((x) => x.id !== a.id));
                        setFiles((p) => p.filter((x) => x.name !== a.name));
                      }}>移除</Button>
                    </Space>
                  ))}
                </Space>
              )}
            </Form.Item>
          </Card>

          {/* 第三段：声明与提交 */}
          <Card title={<StepTitle n="3" text="声明与提交" />} style={{ marginTop: 16 }}>
            <Alert
              type="warning" showIcon icon={<SafetyCertificateOutlined />} style={{ marginBottom: 16 }}
              message="脱敏自检清单"
              description="提交前请确认：① 客户真实名称已替换；② 金额已换算或模糊化；③ 联系方式已移除。"
            />
            <Form.Item
              name="desensitized" valuePropName="checked"
              rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('请勾选脱敏声明'))) }]}
            >
              <Checkbox>我已对客户名 / 金额 / 联系方式完成脱敏检查</Checkbox>
            </Form.Item>
            <Form.Item name="visible_scope" label="可见范围">
              <Select
                style={{ maxWidth: 220 }}
                options={['全员', '本部门', '仅组织者'].map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
            <Divider />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              提交即绑定钉钉真实身份（{me.name} · {me.union_id}），评分与抽查全程可追溯，姓名不可自由输入。
            </Typography.Text>
          </Card>

          <div
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 95,
              background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(10px)',
              borderTop: `1px solid ${COLOR.borderLight}`,
              boxShadow: '0 -4px 20px rgba(31, 41, 55, 0.06)',
              padding: '12px 16px',
              display: 'flex', justifyContent: 'center', gap: 12,
            }}
          >
            <Space>
              <Button icon={<SaveOutlined />} onClick={saveDraft}>保存草稿</Button>
              {draftTip && <Button danger onClick={discardDraft}>丢弃草稿</Button>}
            </Space>
            <Button type="primary" size="large" htmlType="submit">提交提报</Button>
          </div>
        </Form>
      </Space>
    </div>
  );
}
