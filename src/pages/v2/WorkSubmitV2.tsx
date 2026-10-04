import { Alert, Button, Checkbox, Form, Input, Radio, Select, Steps, Upload } from 'antd';
import { ArrowLeftOutlined, InboxOutlined, SaveOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/store';
import { TRACKS } from '@/mock/types';
import { ALLOW_EXT, useWorkSubmitForm } from '@/hooks/useWorkSubmitForm';
import '../../theme/v2/template.css';

/**
 * 作业提报 v2（P3-3 样板页 ③：表单模板）
 *
 * 相对 v1 的**纯视觉**变化：
 *   ① 分组卡片改为无投影 + 12px 圆角，组标题用「序号胶囊 + 文案」但去掉渐变与阴影
 *   ② 步骤条改走 v2 令牌（v1 用 GRADIENT.subtle 底）
 *   ③ 底部操作条固定 56px、白底 1px 描边（v1 是毛玻璃 + 上投影）
 *   ④ 空态页补齐「返回列表」按钮（v1 只有 Empty 描述）
 *
 * 业务：`useWorkSubmitForm` 与 v1 同源，写入内容（submits / pointRecords / topicSelections）完全一致。
 */

export default function WorkSubmitV2() {
  const { typeId } = useParams();
  const [qs] = useSearchParams();
  const { me } = useStore();
  const {
    form, type, period, presetCase, presetTopic,
    channel, setChannel, files, setFiles, beforeUpload,
    savedAt, saveDraft, submit,
  } = useWorkSubmitForm(typeId, qs.get('case'), qs.get('topic'));

  /** 空库保护：位置必须放在所有 Hooks 之后 */
  if (!type || !period) {
    return (
      <div>
        <Link to="/work" style={{ color: 'var(--wb-ink-3)', fontSize: 'var(--wb-fs-label)', fontWeight: 500 }}>
          <ArrowLeftOutlined /> 返回作业提报
        </Link>
        <div className="wb2-empty" style={{ marginTop: 'var(--wb-space-4)' }}>
          <div className="ic">!</div>
          <div className="t">作业类型或提报期不存在</div>
          <div className="d">可能已被管理员调整。请返回列表查看当前可提报的作业。</div>
          <Button type="primary" onClick={() => { window.location.hash = '#/work'; }}>返回列表</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 72 }}>
      <Link to="/work" style={{ color: 'var(--wb-ink-3)', fontSize: 'var(--wb-fs-label)', fontWeight: 500 }}>
        <ArrowLeftOutlined /> 返回作业提报
      </Link>

      {/* ---------- 页头 ---------- */}
      <div className="wb2-ph" style={{ marginTop: 'var(--wb-space-4)', marginBottom: 'var(--wb-space-4)' }}>
        <div>
          <h2 className="wb2-ph-t">提报作业</h2>
          <div className="wb2-ph-d">
            {type.name} · 第 {period.seq} 期 · 提交物模板：{type.form_template} · 评分卡 {type.score_card_version} · 截止 {period.end_at}
          </div>
        </div>
        <div className="wb2-ph-a">
          <span style={{ fontSize: 'var(--wb-fs-label)', color: savedAt ? 'var(--wb-success)' : 'var(--wb-ink-3)' }}>
            {savedAt ? `✓ 草稿已保存 ${savedAt}` : '草稿自动保存，支持断点续填'}
          </span>
        </div>
      </div>

      <div className="wb2-card wb2-card-pad" style={{ marginBottom: 'var(--wb-space-5)' }}>
        <Steps
          size="small" current={0}
          items={[{ title: '选题信息' }, { title: '过程与产出' }, { title: '声明与提交' }]}
        />
      </div>

      <Form form={form} layout="vertical" onFinish={submit}>
        {/* ---------- 分组 1 ---------- */}
        <div className="wb2-card wb2-card-pad wb2-fg">
          <div className="wb2-card-t">① 选题信息</div>
          {(presetCase || presetTopic) && (
            <Alert type="success" showIcon style={{ marginBottom: 'var(--wb-space-4)' }}
              message={`已从${presetCase ? '案例' : '选题池'}预填：${presetCase?.title ?? presetTopic?.title}，可修改`} />
          )}
          <Form.Item name="track" label={<span className="wb2-fl"><span className="req">●</span>赛道</span>} rules={[{ required: true }]}>
            <Radio.Group options={TRACKS.map((t) => ({ label: t, value: t }))} optionType="button" />
          </Form.Item>
          <Form.Item name="channel" label={<span className="wb2-fl"><span className="req">●</span>通道</span>} rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              options={['通道一·用现成 Skill', '通道二·自建 Skill']}
              onChange={(e) => setChannel(e.target.value)}
            />
          </Form.Item>
          <Form.Item name="title" label={<span className="wb2-fl"><span className="req">●</span>场景标题</span>} rules={[{ required: true, message: '请填写场景标题' }]}>
            <Input placeholder="如：为 TOP10 客户做月度经营体检" />
          </Form.Item>
        </div>

        {/* ---------- 分组 2 ---------- */}
        <div className="wb2-card wb2-card-pad wb2-fg">
          <div className="wb2-card-t">② 过程与产出</div>
          <Form.Item
            name="scene_desc" label={<span className="wb2-fl"><span className="req">●</span>业务场景说明</span>}
            rules={[{ required: true, message: '请说明业务场景' }]}
            extra={<span className="wb2-fhint">说清：谁遇到、多久一次、现在怎么解决、代价是什么</span>}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          {channel === '通道一·用现成 Skill' ? (
            <Form.Item
              name="before_after" label={<span className="wb2-fl"><span className="req">●</span>前后对比</span>}
              rules={[{ required: true, message: '通道一必须填写前后对比' }]}
              extra={<span className="wb2-fhint">使用前耗时/质量 → 使用后耗时/质量，用数字说话</span>}
            >
              <Input.TextArea rows={3} placeholder="使用前：人工 2 小时/次，漏检率约 15%；使用后：25 分钟/次，漏检率降至 3%。" />
            </Form.Item>
          ) : (
            <Form.Item
              name="before_after" label={<span className="wb2-fl"><span className="req">●</span>实测记录</span>}
              rules={[{ required: true, message: '通道二必须填写实测记录' }]}
              extra={<span className="wb2-fhint">Skill 包的实测过程：跑了哪些真实数据、遇到什么问题、怎么解决的</span>}
            >
              <Input.TextArea rows={3} placeholder="在 22 份真实纪要上实测，命中率 78%，失败主要集中在不完整纪要…" />
            </Form.Item>
          )}

          <Form.Item name="output_sample" label={<span className="wb2-fl"><span className="req">●</span>产出样本</span>} rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="粘贴一段真实产出（注意脱敏）" />
          </Form.Item>

          <Form.Item name="skill_used" label={<span className="wb2-fl"><span className="req">●</span>所用 Skill</span>} rules={[{ required: true }]}>
            <Input placeholder="内置 Skill 名称，或自建 Skill 包名称" />
          </Form.Item>

          <Form.Item
            label="附件"
            extra={<span className="wb2-fhint">白名单 {ALLOW_EXT.join(' / ')}，单文件 ≤50MB，最多 5 个；zip 需含 SKILL.md + manifest.yaml</span>}
          >
            <Upload.Dragger
              multiple maxCount={5}
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
        </div>

        {/* ---------- 分组 3 ---------- */}
        <div className="wb2-card wb2-card-pad wb2-fg">
          <div className="wb2-card-t">③ 声明与提交</div>
          <Alert
            type="warning" showIcon icon={<SafetyCertificateOutlined />} style={{ marginBottom: 'var(--wb-space-4)' }}
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
            <Select style={{ maxWidth: 220 }} options={['全员', '本部门', '仅组织者'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <div style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-3)', lineHeight: 1.6 }}>
            提交即绑定钉钉真实身份（{me.name} · {me.union_id}），评分与抽查全程可追溯，姓名不可自由输入。
          </div>
        </div>

        {/* ---------- 底部操作条 ---------- */}
        <div className="wb2-actbar">
          <Button icon={<SaveOutlined />} onClick={saveDraft}>保存草稿</Button>
          <Button type="primary" size="large" htmlType="submit">提交提报</Button>
        </div>
      </Form>
    </div>
  );
}
