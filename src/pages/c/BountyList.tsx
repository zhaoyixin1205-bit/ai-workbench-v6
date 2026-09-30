import { Button, Card, Col, Empty, Row, Segmented, Space, Typography, Tabs, Modal, Input, Form, Upload, Alert, App as AntApp } from 'antd';
import { PlusOutlined, ClockCircleOutlined, DownloadOutlined, InboxOutlined, EditOutlined, FileAddOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, SoftTag, TrackTag } from '@/components/ui';
import type { Attachment, Bounty, BountyStatus } from '@/mock/types';
import type { UploadFile } from 'antd';
import { useFileUpload } from '@/service/useFileUpload';

/** V6.0 CR-20：附件白名单与作业提报一致 */
const ALLOW_EXT = ['zip', 'md', 'yaml', 'pdf', 'docx', 'xlsx', 'png', 'jpg'];
/** V6.0 CR-21：方案修改次数上限（超出需联系组织者） */
const MODIFY_LIMIT = 3;

const STATUS_META: Record<BountyStatus, { text: string; color: string }> = {
  MEMBER_DRAFT: { text: '草稿', color: 'default' },
  PENDING_REVIEW: { text: '待审核', color: 'gold' },
  PUBLISHED: { text: '可认领', color: 'orange' },
  REJECTED: { text: '已驳回', color: 'red' },
  CLAIMED: { text: '已认领', color: 'blue' },
  SUBMITTED: { text: '方案已提交', color: 'cyan' },
  APPROVED: { text: '已通过', color: 'green' },
  EXPIRED: { text: '已超期释放', color: 'default' },
};

export default function BountyList() {
  const { db, me, setDb, log, flags } = useStore();
  const nav = useNavigate();
  const { message, modal } = AntApp.useApp();
  const [tab, setTab] = useState('all');
  const [filter, setFilter] = useState('全部');
  const [submitting, setSubmitting] = useState<Bounty | null>(null);
  const [solution, setSolution] = useState('');
  /** V6.0 CR-20/21 开关：关闭 = 单文本框方案，无修改/补充通道（≡ V5.0） */
  const solutionV2 = flags.bountySolutionV2 !== false;

  /* V6.0 CR-20：结构化方案表单（提交 / 修改共用同一份字段结构） */
  const [solForm] = Form.useForm();
  const [solFiles, setSolFiles] = useState<UploadFile[]>([]);
  /** V6.0 CR-31：真实附件元数据（提交时落库，带 file_id 可下载） */
  const [solAtts, setSolAtts] = useState<Attachment[]>([]);
  const [modifyTarget, setModifyTarget] = useState<Bounty | null>(null);
  const [supplementTarget, setSupplementTarget] = useState<Bounty | null>(null);

  const list = useMemo(() => {
    let arr = db.bounties;
    if (tab === 'mine') arr = arr.filter((b) => b.owner_union_id === me.union_id);
    if (tab === 'claimed') arr = arr.filter((b) => b.claimant_union_id === me.union_id);
    if (tab === 'all') arr = arr.filter((b) => b.status !== 'MEMBER_DRAFT' && b.status !== 'PENDING_REVIEW' && b.status !== 'REJECTED');
    if (filter !== '全部') arr = arr.filter((b) => STATUS_META[b.status].text === filter);
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
            x.id === b.id ? { ...x, status: 'CLAIMED', claimant_union_id: me.union_id, claimant_name: me.name } : x
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
      bounties: p.bounties.map((x) => (x.id === b.id ? { ...x, status: 'PUBLISHED', claimant_union_id: undefined, claimant_name: undefined } : x)),
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
    let vals: { scene_desc?: string; output_sample?: string; skill_used?: string; before_after?: string };
    try {
      vals = await solForm.validateFields();
    } catch {
      message.error('请填写必填项');
      return;
    }
    const fields = {
      scene_desc: vals.scene_desc ?? '',
      output_sample: vals.output_sample ?? '',
      skill_used: vals.skill_used ?? '',
      before_after: vals.before_after ?? '',
    };
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) => (x.id === submitting!.id ? {
        ...x,
        status: 'SUBMITTED',
        solution_fields: fields,
        solution_attachments: fileMeta(),
        /** 首次提交即建立版本链起点，后续修改留痕不覆写 */
        solution_versions: [{ id: `SV${Date.now()}`, version: 1, fields, attachments: fileMeta(), note: '首次提交', operator: me.name, created_at: `${new Date().toLocaleDateString('zh-CN')} ${new Date().toTimeString().slice(0, 5)}` }],
        solution_modify_count: 0,
      } : x)),
    }));
    log('提交悬赏方案', submitting!.title, `状态 CLAIMED → SUBMITTED；结构化字段 4 项 + 附件 ${solFiles.length} 个`);
    message.success('方案已提交，等待组织者审核');
    setSubmitting(null); setSolFiles([]); setSolAtts([]); solForm.resetFields();
  };

  /** V6.0 CR-21：方案修改 —— 回退至 SUBMITTED 重走审核，原版本保留为历史版本 */
  const doModify = async () => {
    const b = modifyTarget!;
    let vals: { scene_desc?: string; output_sample?: string; skill_used?: string; before_after?: string; note?: string };
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
    const fields = {
      scene_desc: vals.scene_desc ?? '',
      output_sample: vals.output_sample ?? '',
      skill_used: vals.skill_used ?? '',
      before_after: vals.before_after ?? '',
    };
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
          solution_versions: [...history, {
            id: `SV${Date.now()}`,
            version: history.length + 1,
            fields: { ...fields },
            attachments: fileMeta(),
            note: vals.note ?? '方案修改',
            operator: me.name,
            created_at: now,
          }],
          solution_modify_count: used + 1,
        };
      }),
    }));
    log('修改悬赏方案', b.title, `第 ${used + 1} 次修改：状态回退至 SUBMITTED 重走审核，原审核记录标记作废并保留为版本 v${(b.solution_versions?.length ?? 0) + 1}`);
    message.success(`已提交修改（第 ${used + 1}/${MODIFY_LIMIT} 次），状态回退至「方案已提交」重走审核`);
    setModifyTarget(null); setSolFiles([]); setSolAtts([]); solForm.resetFields();
  };

  /** V6.0 CR-21：方案补充 —— 仅追加资料，状态与积分不变 */
  const doSupplement = async () => {
    const b = supplementTarget!;
    let vals: { content?: string };
    try {
      vals = await solForm.validateFields();
    } catch {
      message.error('请填写补充说明');
      return;
    }
    const now = `${new Date().toLocaleDateString('zh-CN')} ${new Date().toTimeString().slice(0, 5)}`;
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) => (x.id === b.id ? {
        ...x,
        supplements: [...(x.supplements ?? []), {
          id: `SP${Date.now()}`, content: vals.content ?? '', attachments: fileMeta(), operator: me.name, created_at: now,
        }],
      } : x)),
    }));
    log('补充悬赏方案', b.title, `追加资料 ${fileMeta().length} 个附件；原状态 ${b.status} 与积分不变`);
    message.success('补充资料已追加，原流程与积分不受影响');
    setSupplementTarget(null); setSolFiles([]); setSolAtts([]); solForm.resetFields();
  };

  /** 打开三个弹窗时统一重置表单与附件（避免上一次的残留值被带进来） */
  const openSolutionModal = (b: Bounty, mode: 'SUBMIT' | 'MODIFY' | 'SUPPLEMENT') => {
    setSolFiles([]);
    setSolAtts([]);
    solForm.resetFields();
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

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="悬赏榜"
        desc="真实业务痛点 → 可认领任务；成员也可发起，审核通过后展示"
        extra={<Link to="/bounty/create"><Button type="primary" size="large" icon={<PlusOutlined />}>发起悬赏</Button></Link>}
      />

      <Card styles={{ body: { padding: 16 } }}>
        <Space wrap size={12}>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: 'all', label: '悬赏大厅' },
              { key: 'mine', label: '我发布的' },
              { key: 'claimed', label: '我认领的' },
            ]}
            style={{ marginBottom: -8 }}
          />
          <Segmented
            value={filter}
            onChange={(v) => setFilter(String(v))}
            options={['全部', '可认领', '已认领', '方案已提交', '已通过', '待审核', '已驳回', '已超期释放']}
          />
        </Space>
      </Card>

      {list.length === 0 ? (
        <Card>
          <Empty description="暂无悬赏">
            <Link to="/bounty/create"><Button type="primary">发起第一个悬赏</Button></Link>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {list.map((b) => (
            <Col xs={24} lg={12} key={b.id}>
              <div className="wb-card wb-card-hover" style={{ padding: 18, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <Typography.Text strong style={{ fontSize: 16, lineHeight: 1.45 }}>{b.title}</Typography.Text>
                  <SoftTag
                    text={STATUS_META[b.status].text}
                    tone={b.status === 'APPROVED' ? 'green' : b.status === 'REJECTED' ? 'red' : b.status === 'PENDING_REVIEW' ? 'gold' : b.status === 'PUBLISHED' ? 'primary' : 'blue'}
                  />
                </div>
                <Space size={6} style={{ marginTop: 10, flexWrap: 'wrap' }}>
                  <TrackTag track={b.track} />
                  <span style={{
                    background: COLOR.primaryLight, color: '#C2410C', fontSize: 12, fontWeight: 700,
                    padding: '2px 10px', borderRadius: 6,
                  }} className="num">{b.points} 积分</span>
                  <span style={{ background: '#F3F4F6', color: COLOR.textSub, fontSize: 11, padding: '2px 8px', borderRadius: 6 }}>{b.source}</span>
                </Space>
                <Typography.Paragraph
                  style={{ color: COLOR.textSub, fontSize: 13, marginTop: 12, marginBottom: 12, lineHeight: 1.7 }}
                  ellipsis={{ rows: 2 }}
                >
                  {b.pain_point}
                </Typography.Paragraph>
                <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 'auto' }}>
                  <ClockCircleOutlined /> 截止 {b.due_date} · 发布人 {b.owner_name}
                  {b.claimant_name ? ` · 认领人 ${b.claimant_name}` : ''}
                </div>

                {b.reject_reason && (
                  <div style={{ marginTop: 12, padding: 10, background: '#FEF2F2', borderRadius: 10, fontSize: 12, color: '#B91C1C', lineHeight: 1.6 }}>
                    <b>驳回理由：</b>{b.reject_reason}
                  </div>
                )}
                {/* V6.0 CR-20：结构化方案展示（旧单文本框数据仍可读，不丢） */}
                {(b.solution || b.solution_fields) && (
                  <div style={{ marginTop: 12, padding: 10, background: '#ECFDF5', borderRadius: 10, fontSize: 12, lineHeight: 1.6 }}>
                    {b.solution_fields ? (
                      <>
                        {b.solution_fields.before_after && <div><b>前后对比：</b>{b.solution_fields.before_after}</div>}
                        {b.solution_fields.scene_desc && <div style={{ marginTop: 4 }}><b>场景说明：</b>{b.solution_fields.scene_desc}</div>}
                        {b.solution_fields.output_sample && <div style={{ marginTop: 4 }}><b>产出样本：</b>{b.solution_fields.output_sample}</div>}
                        {b.solution_fields.skill_used && <div style={{ marginTop: 4 }}><b>所用 Skill：</b>{b.solution_fields.skill_used}</div>}
                      </>
                    ) : (
                      <div><b>方案：</b>{b.solution}</div>
                    )}
                    {b.solution_attachments && b.solution_attachments.length > 0 && (
                      <div style={{ marginTop: 4, color: COLOR.textMuted }}>
                        📎 {b.solution_attachments.map((f) => f.name).join('、')}
                      </div>
                    )}
                    {/* V6.0 CR-21：版本链与补充记录可见，证明「修改不覆写」 */}
                    {((b.solution_versions?.length ?? 0) > 1 || (b.supplements?.length ?? 0) > 0) && (
                      <div style={{ marginTop: 6, color: COLOR.textMuted }}>
                        共 {b.solution_versions?.length ?? 0} 个版本 · {b.supplements?.length ?? 0} 条补充（原版本保留可追溯）
                      </div>
                    )}
                  </div>
                )}

                <Space style={{ marginTop: 14 }} wrap>
                  {b.status === 'PUBLISHED' && b.owner_union_id !== me.union_id && (
                    <Button size="small" type="primary" onClick={() => claim(b)}>认领</Button>
                  )}
                  {b.status === 'CLAIMED' && b.claimant_union_id === me.union_id && (
                    <>
                      <Button size="small" type="primary" onClick={() => openSolutionModal(b, 'SUBMIT')}>提交方案</Button>
                      <Button size="small" danger onClick={() => withdraw(b)}>撤回认领</Button>
                    </>
                  )}
                  {/* V6.0 CR-21：已提交及以后开放「修改 / 补充」双通道 */}
                  {solutionV2 && ['SUBMITTED', 'APPROVED'].includes(b.status) && b.claimant_union_id === me.union_id && (
                    <>
                      {b.status !== 'APPROVED' ? (
                        <Button
                          size="small" icon={<EditOutlined />}
                          disabled={(b.solution_modify_count ?? 0) >= MODIFY_LIMIT}
                          onClick={() => openSolutionModal(b, 'MODIFY')}
                        >
                          修改方案（剩 {MODIFY_LIMIT - (b.solution_modify_count ?? 0)} 次）
                        </Button>
                      ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>已通过，仅可补充</Typography.Text>
                      )}
                      <Button size="small" icon={<FileAddOutlined />} onClick={() => openSolutionModal(b, 'SUPPLEMENT')}>补充资料</Button>
                    </>
                  )}
                  {b.status === 'PENDING_REVIEW' && (
                    <SoftTag text="组织者审核中（对外不可见）" tone="gold" />
                  )}
                  {b.status === 'REJECTED' && b.owner_union_id === me.union_id && (
                    <Button size="small" onClick={() => nav('/bounty/create')}>修改后重提</Button>
                  )}
                </Space>
              </div>
            </Col>
          ))}
        </Row>
      )}

      {/* V6.0 CR-20：结构化方案提交（开关关闭时为 V5.0 单文本框） */}
      <Modal
        open={!!submitting}
        title={`提交方案 · ${submitting?.title}`}
        onCancel={() => setSubmitting(null)}
        onOk={doSubmit}
        okText="提交方案"
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          期望产出：{submitting?.expected_output}
        </Typography.Paragraph>
        {!solutionV2 ? (
          <Input.TextArea
            rows={5} value={solution} onChange={(e) => setSolution(e.target.value)}
            placeholder="说明你的解决方案、验证方式与产出物（≥20 字）"
          />
        ) : (
          <Form form={solForm} layout="vertical" preserve={false}>
            <Form.Item name="scene_desc" label="业务场景说明" rules={[{ required: true, message: '请说明业务场景' }]}
              extra="说清：谁遇到、多久一次、现在怎么解决、代价是什么">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="before_after" label="前后对比" rules={[{ required: true, message: '请填写前后对比' }]}
              extra="使用前耗时/质量 → 使用后耗时/质量，用数字说话">
              <Input.TextArea rows={2} placeholder="使用前 2 小时/次 → 使用后 25 分钟/次" />
            </Form.Item>
            <Form.Item name="output_sample" label="产出样本" rules={[{ required: true, message: '请粘贴产出样本' }]}>
              <Input.TextArea rows={3} placeholder="粘贴一段真实产出（注意脱敏）" />
            </Form.Item>
            <Form.Item name="skill_used" label="所用 Skill" rules={[{ required: true, message: '请填写所用 Skill' }]}>
              <Input placeholder="内置 Skill 名称，或自建 Skill 包名称" />
            </Form.Item>
            <Form.Item label="附件" extra={`白名单 ${ALLOW_EXT.join(' / ')}，单文件 ≤50MB，最多 5 个；zip 由服务端解包校验 SKILL.md + manifest.yaml${uploading > 0 ? ` · 上传中 ${uploading}` : ''}`}>
              <Upload.Dragger
                multiple maxCount={5} beforeUpload={beforeUpload}
                fileList={solFiles} onChange={({ fileList }) => setSolFiles(fileList)}
                customRequest={({ onSuccess }) => setTimeout(() => onSuccess?.('ok'), 300)}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">点击或拖拽上传附件</p>
                <p className="ant-upload-hint">支持 zip / md / yaml / pdf / docx / xlsx / png / jpg</p>
              </Upload.Dragger>
              {solAtts.length > 0 && (
                <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                  {solAtts.map((a) => (
                    <Space key={a.id} size={6}>
                      <span style={{ fontSize: 13 }}>{a.name}</span>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{a.size}</Typography.Text>
                      {a.url
                        ? <a href={a.url} target="_blank" rel="noreferrer"><Button size="small" type="link" icon={<DownloadOutlined />}>下载</Button></a>
                        : <SoftTag text="演示态·未落真实文件" />}
                      <Button size="small" type="link" danger onClick={() => {
                        setSolAtts((p) => p.filter((x) => x.id !== a.id));
                        setSolFiles((p) => p.filter((x) => x.name !== a.name));
                      }}>移除</Button>
                    </Space>
                  ))}
                </Space>
              )}
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* V6.0 CR-21：方案修改 —— 回退至 SUBMITTED 重走审核 */}
      <Modal
        open={!!modifyTarget}
        title={`修改方案 · ${modifyTarget?.title}`}
        onCancel={() => setModifyTarget(null)}
        onOk={doModify}
        okText="提交修改并重走审核"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message="修改会回退状态并重新审核"
          description={`提交后状态回到「方案已提交」重走审核，原审核记录标记作废但保留为历史版本。剩余修改次数 ${MODIFY_LIMIT - (modifyTarget?.solution_modify_count ?? 0)} 次。`}
        />
        <Form form={solForm} layout="vertical" preserve={false}>
          <Form.Item name="scene_desc" label="业务场景说明" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="before_after" label="前后对比" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="output_sample" label="产出样本" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="skill_used" label="所用 Skill" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="note" label="修改说明" rules={[{ required: true, message: '请填写修改说明' }, { min: 10, message: '至少 10 字，便于组织者比对' }]}>
            <Input.TextArea rows={2} placeholder="说明改了什么、为什么改（≥10 字）" />
          </Form.Item>
          <Form.Item label="附件" extra={`白名单 ${ALLOW_EXT.join(' / ')}，单文件 ≤50MB，最多 5 个${uploading > 0 ? ` · 上传中 ${uploading}` : ''}`}>
            <Upload.Dragger
              multiple maxCount={5} beforeUpload={beforeUpload}
              fileList={solFiles} onChange={({ fileList }) => setSolFiles(fileList)}
              customRequest={({ onSuccess }) => setTimeout(() => onSuccess?.('ok'), 300)}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">点击或拖拽上传附件</p>
            </Upload.Dragger>
            {solAtts.length > 0 && (
              <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                {solAtts.map((a) => (
                  <Space key={a.id} size={6}>
                    <span style={{ fontSize: 13 }}>{a.name}</span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{a.size}</Typography.Text>
                    {a.url
                      ? <a href={a.url} target="_blank" rel="noreferrer"><Button size="small" type="link" icon={<DownloadOutlined />}>下载</Button></a>
                      : <SoftTag text="演示态·未落真实文件" />}
                    <Button size="small" type="link" danger onClick={() => {
                      setSolAtts((p) => p.filter((x) => x.id !== a.id));
                      setSolFiles((p) => p.filter((x) => x.name !== a.name));
                    }}>移除</Button>
                  </Space>
                ))}
              </Space>
            )}
          </Form.Item>
        </Form>
      </Modal>

      {/* V6.0 CR-21：方案补充 —— 仅追加，不改状态与积分 */}
      <Modal
        open={!!supplementTarget}
        title={`补充资料 · ${supplementTarget?.title}`}
        onCancel={() => setSupplementTarget(null)}
        onOk={doSupplement}
        okText="提交补充"
        destroyOnClose
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="补充不改变状态与积分"
          description="仅追加新资料，原流程继续推进，审核结论与已入账积分不受影响。"
        />
        <Form form={solForm} layout="vertical" preserve={false}>
          <Form.Item name="content" label="补充说明" rules={[{ required: true, message: '请填写补充说明' }]}>
            <Input.TextArea rows={4} placeholder="补充：更完整的实测数据、第二版产物、客户反馈等" />
          </Form.Item>
          <Form.Item label="附件" extra={`白名单 ${ALLOW_EXT.join(' / ')}，单文件 ≤50MB，最多 5 个${uploading > 0 ? ` · 上传中 ${uploading}` : ''}`}>
            <Upload.Dragger
              multiple maxCount={5} beforeUpload={beforeUpload}
              fileList={solFiles} onChange={({ fileList }) => setSolFiles(fileList)}
              customRequest={({ onSuccess }) => setTimeout(() => onSuccess?.('ok'), 300)}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">点击或拖拽上传附件</p>
            </Upload.Dragger>
            {solAtts.length > 0 && (
              <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                {solAtts.map((a) => (
                  <Space key={a.id} size={6}>
                    <span style={{ fontSize: 13 }}>{a.name}</span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{a.size}</Typography.Text>
                    {a.url
                      ? <a href={a.url} target="_blank" rel="noreferrer"><Button size="small" type="link" icon={<DownloadOutlined />}>下载</Button></a>
                      : <SoftTag text="演示态·未落真实文件" />}
                    <Button size="small" type="link" danger onClick={() => {
                      setSolAtts((p) => p.filter((x) => x.id !== a.id));
                      setSolFiles((p) => p.filter((x) => x.name !== a.name));
                    }}>移除</Button>
                  </Space>
                ))}
              </Space>
            )}
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
