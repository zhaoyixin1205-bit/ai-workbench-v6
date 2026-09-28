import {
  Alert, Button, Card, Divider, Empty, Input, Modal, Segmented, Space, Table, Tabs, Tag,
  Tooltip, Typography, Form, Select, Upload, App as AntApp,
} from 'antd';
import { PlusOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, TRACK_COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { SkillCard, AttachCard, extOf } from '@/components/ResourceCards';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker, { ScopeText, useScopeCommit } from '@/components/ScopePicker';
import type { Attachment, CaseItem, Level, ScopeSubject, SkillPackage, Track } from '@/mock/types';
import { formatSize } from '@/mock/types';

export default function ContentAdmin() {
  const { db, setDb, me, log, flags } = useStore();
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  /** V4.0 CR-08：案例可见范围（此前完全没有范围配置入口，只能全员可见） */
  const [visibleSubjects, setVisibleSubjects] = useState<ScopeSubject[]>([]);
  const commitScope = useScopeCommit();

  /* ---- V4.1：可直接安装的 Skill + 补充信息 / 附件（两者均选填） ---- */
  const skillOn = flags.caseSkillPackage !== false;
  const attachOn = flags.caseAttachment !== false;
  /** 编辑中的案例 ID；空表示新建 */
  const [editingId, setEditingId] = useState<string>('');
  const [skills, setSkills] = useState<SkillPackage[]>([]);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [skillType, setSkillType] = useState<SkillPackage['type']>('UPLOAD');
  const [skillDraft, setSkillDraft] = useState({
    name: '', version: '', note: '', url: '', file_name: '', file_size: '',
  });

  const resetForm = () => {
    form.resetFields();
    setVisibleSubjects([]);
    setEditingId('');
    setSkills([]);
    setAtts([]);
    setSkillType('UPLOAD');
    setSkillDraft({ name: '', version: '', note: '', url: '', file_name: '', file_size: '' });
  };

  /** 把草稿加入 Skill 列表（即时生效，不点保存也能看到已加的项 —— Moka P3 的「配置即时可见」） */
  const addSkill = () => {
    if (!skillDraft.name.trim()) { message.warning('请先填 Skill 名称'); return; }
    if (skillType === 'LINK' && !skillDraft.url.trim()) { message.warning('选了「下载链接」就必须填链接'); return; }
    if (skillType === 'UPLOAD' && !skillDraft.file_name) { message.warning('请先上传 Skill 压缩包'); return; }
    setSkills((p) => [...p, {
      id: `SK${Date.now()}${p.length}`,
      type: skillType,
      name: skillDraft.name.trim(),
      version: skillDraft.version.trim() || undefined,
      note: skillDraft.note.trim() || undefined,
      file_name: skillType === 'UPLOAD' ? skillDraft.file_name : undefined,
      file_size: skillType === 'UPLOAD' ? skillDraft.file_size : undefined,
      url: skillType === 'LINK' ? skillDraft.url.trim() : undefined,
    }]);
    setSkillDraft({ name: '', version: '', note: '', url: '', file_name: '', file_size: '' });
    message.success('已加入 Skill 列表');
  };

  /** 打开新建 / 编辑弹窗 */
  const openModal = (c?: CaseItem) => {
    resetForm();
    if (c) {
      setEditingId(c.id);
      form.setFieldsValue({
        title: c.title, track: c.track, level: c.level, prompt: c.prompt, tags: c.tags,
      });
      setVisibleSubjects(c.visible_subjects ?? []);
      setSkills(c.skill_packages ?? []);
      setAtts(c.attachments ?? []);
    }
    setOpen(true);
  };

  /** V4.0 CR-03：标签池（既有案例标签 ∪ 选题标签），供自由标签选择器复用 */
  const tagPool = useMemo(() => {
    const set = new Set<string>();
    db.cases.forEach((c) => c.tags.forEach((t) => set.add(t)));
    db.topics.forEach((t) => (t.tags ?? []).forEach((x) => set.add(x)));
    return [...set].sort();
  }, [db.cases, db.topics]);

  /** V4.0 CR-08 + V4.1：新建/编辑案例并落库可见范围与附加资源（保存前回读校验） */
  const createCase = async () => {
    let vals: { title?: string; track?: Track; level?: Level; prompt?: string; tags?: string[] };
    try {
      vals = await form.validateFields();
    } catch {
      message.error('请先填写必填项');
      return;
    }
    if (editingId) {
      setDb((p) => ({
        ...p,
        cases: p.cases.map((c) => (c.id === editingId ? {
          ...c,
          title: vals.title ?? c.title,
          track: vals.track ?? c.track,
          level: vals.level ?? c.level,
          prompt: vals.prompt ?? c.prompt,
          tags: vals.tags ?? c.tags,
          visible_subjects: visibleSubjects,
          skill_packages: skills,
          attachments: atts,
        } : c)),
      }));
      log('编辑案例', vals.title ?? editingId,
        `Skill ${skills.length} 个 / 附件 ${atts.length} 个 / 可见范围 ${visibleSubjects.map((s) => s.name).join('、')}`);
      message.success(`已保存「${vals.title ?? ''}」`);
      setOpen(false);
      resetForm();
      return;
    }
    const ok = commitScope(visibleSubjects, (p) => ({
      ...p,
      cases: [{
        id: `CS${Date.now()}`, track: vals.track ?? '客户赋能', title: vals.title ?? '未命名案例',
        summary: '', pain_point: '', input: '', prompt: vals.prompt ?? '', output: '',
        acceptance: [], level: vals.level ?? '骨干层', tags: vals.tags ?? [],
        author_union_id: me.union_id, author_name: me.name,
        like_count: 0, view_count: 0, reuse_count: 0, duration: '—', cover: '📘',
        status: '草稿', visible_subjects: visibleSubjects, created_at: DEMO_TODAY,
        /** V4.1：附加资源随案例一起落库，未配置即空数组（详情页不渲染空壳区块） */
        skill_packages: skills,
        attachments: atts,
      } as CaseItem, ...p.cases],
    }), '已创建草稿（四件套齐全后方可发布）');
    if (ok) {
      log('新建案例', vals.title ?? '',
        `可见范围 ${visibleSubjects.map((s) => s.name).join('、')} · Skill ${skills.length} 个 · 附件 ${atts.length} 个`);
      setOpen(false);
      resetForm();
    }
  };

  const togglePublish = (id: string, next: string) => {
    setDb((p) => ({ ...p, cases: p.cases.map((c) => (c.id === id ? { ...c, status: next as never } : c)) }));
    log(next === '已发布' ? '发布案例' : '下线案例', db.cases.find((c) => c.id === id)?.title ?? id, `状态 → ${next}`);
    message.success(`已${next === '已发布' ? '发布' : '下线'}`);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="内容管理" desc="案例、选题、素材的统一维护" />
      <Alert type="success" showIcon message="所有删除为软删除并留痕；涉及评分与积分的变更必须二次确认并写入审计日志。" />

      <Card>
        <Tabs
          items={[
            {
              key: 'cases', label: `案例（${db.cases.length}）`,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新建案例</Button>
                    <Button onClick={() => { log('复制上届内容', '案例 + 选题 + 规则配置', '届次复制'); message.success('已复制上届案例与选题（配置驱动，减少重复配置）'); }}>复制上届内容</Button>
                  </Space>
                  <Table
                    size="small" rowKey="id" pagination={{ pageSize: 8 }} dataSource={db.cases}
                    columns={[
                      { title: '标题', dataIndex: 'title' },
                      { title: '赛道', dataIndex: 'track', render: (v: string) => <Tag color={TRACK_COLOR[v]} style={{ border: 'none' }}>{v}</Tag> },
                      {
                        title: '标签', dataIndex: 'tags', width: 180,
                        render: (v: string[]) => ((v?.length ?? 0) === 0
                          ? <Tag>未分类</Tag>
                          : <Space size={4} wrap>{v.map((t) => <Tag key={t} color="orange" style={{ marginInlineEnd: 0 }}>#{t}</Tag>)}</Space>),
                      },
                      { title: '作者', dataIndex: 'author_name', width: 90 },
                      {
                        title: '可见范围', width: 150,
                        render: (_, r) => (r.visible_subjects?.length
                          ? <ScopeText value={r.visible_subjects} />
                          : <Tag>全员（默认）</Tag>),
                      },
                      /* V4.1：列表层直接暴露「挂了几个 Skill / 附件」。
                         两个开关同时关闭时整列不渲染 —— 守「关 ≡ V4.0」 */
                      ...(skillOn || attachOn ? [{
                        title: '随附资源', width: 120,
                        render: (_: unknown, r: CaseItem) => {
                          const sn = skillOn ? (r.skill_packages?.length ?? 0) : 0;
                          const an = attachOn ? (r.attachments?.length ?? 0) : 0;
                          if (sn === 0 && an === 0) return <span style={{ color: COLOR.textMuted, fontSize: 12 }}>—</span>;
                          return (
                            <Space size={4}>
                              {sn > 0 && (
                                <Tooltip title={`${(r.skill_packages ?? []).map((s) => s.name).join('、')}`}>
                                  <span style={{
                                    fontSize: 11, fontWeight: 600, color: '#C2410C', background: '#FFF1EB',
                                    padding: '2px 8px', borderRadius: 6,
                                  }}>🧩 {sn}</span>
                                </Tooltip>
                              )}
                              {an > 0 && (
                                <Tooltip title={`${(r.attachments ?? []).map((a) => a.name).join('、')}`}>
                                  <span style={{
                                    fontSize: 11, fontWeight: 600, color: '#1D4ED8', background: '#EFF6FF',
                                    padding: '2px 8px', borderRadius: 6,
                                  }}>📎 {an}</span>
                                </Tooltip>
                              )}
                            </Space>
                          );
                        },
                      }] : []),
                      { title: '浏览', dataIndex: 'view_count', width: 80, render: (v: number) => <span className="num">{v}</span> },
                      { title: '复用', dataIndex: 'reuse_count', width: 80, render: (v: number) => <span className="num">{v}</span> },
                      {
                        title: '状态', dataIndex: 'status', width: 90,
                        render: (v: string) => <Tag color={v === '已发布' ? 'green' : 'default'}>{v}</Tag>,
                      },
                      {
                        title: '操作', width: 140,
                        render: (_, r) => (
                          <Space size={4}>
                            <Button size="small" type="link" onClick={() => togglePublish(r.id, r.status === '已发布' ? '已下线' : '已发布')}>
                              {r.status === '已发布' ? '下线' : '发布'}
                            </Button>
                            {/* V4.1：编辑从「只弹提示」升级为真弹窗，才能补挂 Skill 与附件 */}
                            <Button size="small" type="link" onClick={() => openModal(r)}>编辑</Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'topics', label: `选题池（${db.topics.length}）`,
              children: (
                <Table
                  size="small" rowKey="id" pagination={{ pageSize: 8 }} dataSource={db.topics}
                  columns={[
                    { title: '选题', dataIndex: 'title' },
                    { title: '赛道', dataIndex: 'track', render: (v: string) => <Tag color={TRACK_COLOR[v]} style={{ border: 'none' }}>{v}</Tag> },
                    {
                      title: '标签', dataIndex: 'tags', width: 180,
                      render: (v: string[] | undefined) => ((v?.length ?? 0) === 0
                        ? <Tag>未分类</Tag>
                        : <Space size={4} wrap>{(v ?? []).map((t) => <Tag key={t} color="orange" style={{ marginInlineEnd: 0 }}>#{t}</Tag>)}</Space>),
                    },
                    { title: '难度', dataIndex: 'difficulty', width: 70 },
                    {
                      title: '已选人数', width: 100,
                      render: (_, r) => {
                        const n = db.topicSelections.filter((s) => s.topic_id === r.id).length;
                        const limit = r.select_limit ?? 0;
                        return <span className="num">{n}{limit > 0 ? ` / ${limit}` : '（不限）'}</span>;
                      },
                    },
                    { title: '产出要求', dataIndex: 'expected_output', ellipsis: true },
                    {
                      title: '状态', dataIndex: 'status', width: 90,
                      render: (v: string) => <Tag color={v === '已被选' ? 'blue' : v === '已关闭' ? 'default' : 'orange'}>{v}</Tag>,
                    },
                    {
                      title: '操作',
                      render: (_, r) => (
                        <Button size="small" type="link" onClick={() => {
                          setDb((p) => ({ ...p, topics: p.topics.map((t) => (t.id === r.id ? { ...t, status: t.status === '可选' ? '已关闭' : '可选' } : t)) }));
                          message.success('状态已更新');
                        }}>{r.status === '可选' ? '关闭' : '开放'}</Button>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'cards', label: '每周场景卡',
              children: (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    每周高频场景卡（30 秒学一个知识点）：卡片式轮播，支持历史回看
                  </Typography.Text>
                  {db.cases.slice(0, 8).map((c) => (
                    <Card key={c.id} size="small">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space><span style={{ fontSize: 20 }}>{c.cover}</span><b>{c.title}</b><Tag color={TRACK_COLOR[c.track]} style={{ border: 'none' }}>{c.track}</Tag></Space>
                        <Space>
                          <Tag>阅读埋点 {c.view_count}</Tag>
                          <Button size="small" type="link" onClick={() => { log('推送场景卡', c.title, '钉钉群卡片推送'); message.success('已推送到钉钉群'); }}>推送</Button>
                        </Space>
                      </div>
                    </Card>
                  ))}
                </Space>
              ),
            },
            {
              key: 'notice', label: '公告',
              children: (
                <Table
                  size="small" rowKey="id" pagination={false} dataSource={db.posts.filter((p) => p.board_id === 'BD4')}
                  columns={[
                    { title: '标题', dataIndex: 'title' },
                    { title: '发布时间', dataIndex: 'created_at' },
                    { title: '浏览', dataIndex: 'view_count', render: (v: number) => <span className="num">{v}</span> },
                    {
                      title: '操作',
                      render: () => <Button size="small" type="link" onClick={() => message.info('公告区默认仅组织者可发帖')}>编辑</Button>,
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={open}
        title={editingId ? '编辑案例' : '新建案例'}
        width={760}
        onCancel={() => { setOpen(false); resetForm(); }}
        onOk={createCase}
        /* V4.1 修复：可见范围「必选」只约束新建。历史案例的 visible_subjects 缺省为空（=全员可见），
           若对编辑也强制必选，任何老案例都会因按钮 disabled 而无法保存 —— 编辑不动范围＝保持原状，是安全的。 */
        okText={editingId ? '保存' : (visibleSubjects.length === 0 ? '请先选择可见范围' : '创建')}
        okButtonProps={{ disabled: !editingId && visibleSubjects.length === 0 }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="track" label="赛道"><Select options={['客户赋能', '团队提效', '销售提效'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          {/* V4.0 CR-03：去分层，改由发布者自选标签（支持回车创建自定义标签） */}
          <Form.Item name="tags" label="标签（可自由创建）">
            <Select
              mode="tags" placeholder="输入后回车即可创建新标签"
              options={tagPool.map((t) => ({ value: t, label: `#${t}` }))}
            />
          </Form.Item>
          {/* level 字段保留落库（历史数据兼容），但不再作为受众分层展示入口 */}
          <Form.Item name="level" label="建议层级（已废弃，仅历史兼容）"><Select options={['干部层', '骨干层'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="prompt" label="可直接抄的提示词"><Input.TextArea rows={4} /></Form.Item>

          {/* ============================================================
              V4.1 新增①：可直接安装的 Skill（选填）
              三种承载方式：上传压缩包 / 填下载链接 / 文字说明，可并存多个
              ============================================================ */}
          {skillOn && (
            <>
              <Divider plain orientation="left" style={{ fontSize: 13, margin: '4px 0 12px' }}>
                可直接安装的 Skill（选填）
              </Divider>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 10 }}>
                提示词之外再给一条路：让人装上就能跑，不用从零写。
              </Typography.Paragraph>
              <Segmented
                value={skillType}
                onChange={(v) => setSkillType(String(v) as SkillPackage['type'])}
                options={[
                  { label: '上传压缩包', value: 'UPLOAD' },
                  { label: '填下载链接', value: 'LINK' },
                ]}
                style={{ marginBottom: 12 }}
              />
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Space wrap size={10} style={{ width: '100%' }}>
                  <Input
                    placeholder="Skill 名称" style={{ width: 220 }} value={skillDraft.name}
                    onChange={(e) => setSkillDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                  <Input
                    placeholder="版本（选填，如 v1.2.0）" style={{ width: 170 }} value={skillDraft.version}
                    onChange={(e) => setSkillDraft((d) => ({ ...d, version: e.target.value }))}
                  />
                  {skillType === 'UPLOAD' ? (
                    <Upload
                      accept=".zip,.rar,.7z,.skill"
                      showUploadList={false}
                      beforeUpload={(file) => {
                        setSkillDraft((d) => ({ ...d, file_name: file.name, file_size: formatSize(file.size) }));
                        message.success(`已选择 ${file.name}（${formatSize(file.size)}）`);
                        return false; // 纯前端 mock：不落二进制，只登记文件名与体积
                      }}
                    >
                      <Button icon={<UploadOutlined />}>
                        {skillDraft.file_name || '选择 Skill 压缩包'}
                      </Button>
                    </Upload>
                  ) : (
                    <Input
                      placeholder="下载链接 https://…" style={{ width: 260 }} value={skillDraft.url}
                      onChange={(e) => setSkillDraft((d) => ({ ...d, url: e.target.value }))}
                    />
                  )}
                </Space>
                <Input.TextArea
                  rows={2} placeholder="安装步骤 / 用法说明（选填，写清「装完第一步干什么」最有用）"
                  value={skillDraft.note}
                  onChange={(e) => setSkillDraft((d) => ({ ...d, note: e.target.value }))}
                />
                <Button icon={<PlusOutlined />} onClick={addSkill}>加入 Skill 列表</Button>
              </Space>

              <div style={{ marginTop: 12 }}>
                {skills.length === 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    还没有挂 Skill —— 不挂也能发布，只是别人只能抄提示词。
                  </Typography.Text>
                ) : (
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {skills.map((s) => (
                      <SkillCard
                        key={s.id} item={s}
                        onAct={(t) => message.info(t)}
                        onRemove={(id) => setSkills((p) => p.filter((x) => x.id !== id))}
                      />
                    ))}
                  </Space>
                )}
              </div>
            </>
          )}

          {/* ============================================================
              V4.1 新增②：补充信息 / 附件（非必填，各类型文件均可）
              ============================================================ */}
          {attachOn && (
            <>
              <Divider plain orientation="left" style={{ fontSize: 13, margin: '16px 0 12px' }}>
                补充信息 / 附件（选填）
              </Divider>
              <Upload.Dragger
                multiple
                showUploadList={false}
                beforeUpload={(file) => {
                  setAtts((p) => [...p, {
                    id: `AT${Date.now()}${p.length}`,
                    name: file.name, size: formatSize(file.size), ext: extOf(file.name),
                  }]);
                  message.success(`已添加附件「${file.name}」`);
                  return false; // 纯前端 mock：不落二进制
                }}
                style={{ padding: '12px 0' }}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: COLOR.primary }} /></p>
                <p style={{ fontSize: 13, marginBottom: 4 }}>点这里或把文件拖进来</p>
                <p style={{ fontSize: 12, color: COLOR.textMuted }}>
                  非必填 · 支持任意类型（xlsx / docx / pdf / zip / 图片 …）
                </p>
              </Upload.Dragger>
              {atts.length > 0 && (
                <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
                  {atts.map((a) => (
                    <AttachCard
                      key={a.id} item={a}
                      onAct={(t) => message.info(t)}
                      onRemove={(id) => setAtts((p) => p.filter((x) => x.id !== id))}
                    />
                  ))}
                </Space>
              )}
              {atts.length === 0 && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  模板、样例数据、参考文档都可以挂 —— 没有就算了，不影响发布。
                </Typography.Text>
              )}
            </>
          )}

          <Divider plain orientation="left" style={{ fontSize: 13, margin: '16px 0 12px' }}>可见范围</Divider>
          <Form.Item label="可见范围" required={!editingId} style={{ marginBottom: 8 }}>
            <ScopePicker value={visibleSubjects} onChange={setVisibleSubjects} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {editingId
              ? (visibleSubjects.length === 0
                ? '当前为「全员可见」（历史案例默认口径）。不改范围可留空直接保存；要收窄就选部门或人员。'
                : '改完范围保存即刻生效。留空则回到「全员可见」。')
              : '必填：不选就发布等于全员可见，请显式指定部门或人员。'}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            四件套（输入 / 提示词 / 产出物 / 验收标准）缺一不可发布；层级只可上调不可下调。
          </Typography.Text>
        </Form>
      </Modal>
    </Space>
  );
}
