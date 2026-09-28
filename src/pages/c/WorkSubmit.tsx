import { Button, Card, Checkbox, Divider, Form, Input, Radio, Space, Steps, Tag, Typography, Upload, App as AntApp, Alert, Select } from 'antd';
import { ArrowLeftOutlined, InboxOutlined, SaveOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { TRACKS } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { UploadFile } from 'antd';

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
  const { db, me, setDb, log } = useStore();
  const nav = useNavigate();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [channel, setChannel] = useState<string>('通道一·用现成 Skill');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [savedAt, setSavedAt] = useState<string>('');

  const type = db.assignmentTypes.find((t) => t.id === typeId) ?? db.assignmentTypes[0];
  const presetCase = db.cases.find((c) => c.id === qs.get('case'));
  const presetTopic = db.topics.find((t) => t.id === qs.get('topic'));
  const period = db.periods.find((p) => p.type_id === type.id && p.status === 'OPEN')!;

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
    const seq = db.submits.filter((s) => s.union_id === me.union_id && s.period_id === period.id).length + 1;
    const id = `S${Date.now()}`;
    /** V4.0 CR-04：提报回写选题记录状态（已选 → 已提报） */
    const topicId = presetTopic?.id;
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
          dept_name: me.dept_names[0],
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
          /** V4.0 CR-04：关联选题，供「我的选题」按状态机驱动下一步 */
          topic_id: topicId,
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
      topicSelections: topicId
        ? p.topicSelections.map((s) => (s.topic_id === topicId && s.union_id === me.union_id ? { ...s, status: '已提报' } : s))
        : p.topicSelections,
    }));
    log('提交提报', `${type.name} 第 ${period.seq} 期`, '状态 DRAFT → SUBMITTED，已生成积分记录');
    message.success('提报成功！已触发组织者待办提醒，评分结果将通知你');
    nav('/work');
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Link to="/work" style={{ color: COLOR.textSub, fontSize: 13, fontWeight: 500 }}>
          <ArrowLeftOutlined /> 返回作业提报
        </Link>

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

        <Form form={form} layout="vertical" onFinish={submit}>
          {/* 第一段：选题信息 */}
          <Card title={<StepTitle n="1" text="选题信息" />}>
            {(presetCase || presetTopic) && (
              <Alert type="success" showIcon style={{ marginBottom: 16 }}
                message={`已从${presetCase ? '案例' : '选题池'}预填：${presetCase?.title ?? presetTopic?.title}，可修改`} />
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
              extra={`白名单 ${ALLOW_EXT.join(' / ')}，单文件 ≤50MB，最多 5 个；zip 需含 SKILL.md + manifest.yaml`}
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
            <Button icon={<SaveOutlined />} onClick={saveDraft}>保存草稿</Button>
            <Button type="primary" size="large" htmlType="submit">提交提报</Button>
          </div>
        </Form>
      </Space>
    </div>
  );
}
