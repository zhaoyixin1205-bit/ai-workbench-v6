import { Button, Card, Col, Empty, Form, Input, Modal, Row, Segmented, Space, Tag, Typography, Tabs, App as AntApp, Select } from 'antd';
import { SearchOutlined, FireOutlined, EyeOutlined, ThunderboltOutlined, BulbOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { TRACKS } from '@/mock/types';
import type { Topic, Track } from '@/mock/types';
import { CoverBlock, PageHeader, TrackTag, HoverCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';

/** V4.0 CR-03：标签筛选的交集 / 并集两种口径 */
type TagMode = 'ANY' | 'ALL';

export default function CaseList() {
  const { db, me, setDb, log, flags, hasRole } = useStore();
  const nav = useNavigate();
  const { message } = AntApp.useApp();
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm] = Form.useForm();
  const [track, setTrack] = useState<string>('全部');
  const [kw, setKw] = useState('');
  const [tab, setTab] = useState('case');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<TagMode>('ANY');
  /** V4.2：按「有没有可直接安装的 Skill / 附件」筛选 —— 员工最常问的是「哪个装上就能跑」 */
  const [resFilter, setResFilter] = useState<'ALL' | 'SKILL' | 'ATTACH'>('ALL');

  /** 标签池 = 案例标签 ∪ 选题标签（去重排序） */
  const tagPool = useMemo(() => {
    const set = new Set<string>();
    db.cases.forEach((c) => c.tags.forEach((t) => set.add(t)));
    db.topics.forEach((t) => (t.tags ?? []).forEach((x) => set.add(x)));
    return [...set].sort();
  }, [db.cases, db.topics]);

  /** 开关：topic.freeTags 关闭 → 标签体系整体不展示（回到 V3.0 无标签状态） */
  const freeTags = flags.topicFreeTags !== false;
  const multiSelect = flags.topicMultiSelect !== false;

  /** V4.1 资源开关：两个都关 ≡ V4.0（此时连资源筛选器都不出现） */
  const skillOn = flags.caseSkillPackage !== false;
  const attachOn = flags.caseAttachment !== false;
  const resFilterable = skillOn || attachOn;

  const matchTags = (tags: string[]) => {
    if (!freeTags || tagFilter.length === 0) return true;
    return tagMode === 'ALL' ? tagFilter.every((t) => tags.includes(t)) : tagFilter.some((t) => tags.includes(t));
  };

  /** V4.0 CR-03：去掉「干部层 / 骨干层」受众分层，分类改由发布者自选标签承载 */
  const list = useMemo(
    () =>
      db.cases.filter((c) => {
        if (track !== '全部' && c.track !== track) return false;
        if (kw && !`${c.title}${c.summary}${c.tags.join()}`.includes(kw)) return false;
        if (!matchTags(c.tags)) return false;
        /* V4.2：资源筛选。条件里带上开关，保证「开关关闭 → 筛不出任何东西」而不是筛出旧数据 */
        if (resFilter === 'SKILL' && !(skillOn && (c.skill_packages?.length ?? 0) > 0)) return false;
        if (resFilter === 'ATTACH' && !(attachOn && (c.attachments?.length ?? 0) > 0)) return false;
        return true;
      }),
    [db.cases, track, kw, tagFilter, tagMode, resFilter, skillOn, attachOn]
  );

  /** V6.0 CR-17：自定义选题开关（关闭=选题池不出现「其他·自定义」入口） */
  const topicCustomOn = flags.topicCustom !== false;

  /**
   * V6.0 CR-17：可见性口径 —— 私有自定义选题仅本人与组织者可见。
   * 边界：他人看不到（不是置灰），避免暴露「存在但不可见」。
   */
  const canSeeTopic = (t: Topic) => {
    if (t.visibility !== 'PRIVATE') return true;
    return t.created_by === me.union_id || hasRole('ORGANIZER') || hasRole('ADMIN');
  };

  const topicList = useMemo(
    () => db.topics.filter((t) => {
      if (!canSeeTopic(t)) return false;
      if (track !== '全部' && t.track !== track) return false;
      if (kw && !`${t.title}${t.expected_output}${(t.tags ?? []).join()}`.includes(kw)) return false;
      if (!matchTags(t.tags ?? [])) return false;
      return true;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.topics, track, kw, tagFilter, tagMode, me.union_id]
  );

  /** V6.0 CR-17：新建自定义选题 —— 默认私有，组织者可在内容管理公开 */
  const createCustomTopic = (vals: { title: string; track: Track; expected_output?: string }) => {
    const id = `T-CUSTOM-${Date.now()}`;
    const topic: Topic = {
      id,
      /** 自定义选题不挂在具体案例下 */
      case_id: '',
      title: vals.title,
      difficulty: '中',
      expected_output: vals.expected_output ?? '（自定义选题，产出形式自拟）',
      suggest_level: '骨干层',
      track: vals.track,
      status: '可选',
      tags: ['自定义'],
      is_custom: true,
      created_by: me.union_id,
      visibility: 'PRIVATE',
    };
    setDb((p) => ({
      ...p,
      topics: [topic, ...p.topics],
      topicSelections: [{
        id: `TS${Date.now()}`, topic_id: id, union_id: me.union_id,
        selected_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`, status: '已选',
      }, ...p.topicSelections],
    }));
    log('新建自定义选题', vals.title, 'V6.0 CR-17：默认仅本人与组织者可见，组织者可公开至全员');
    message.success('自定义选题已创建，默认仅你与组织者可见（组织者可公开给全员）');
    setCustomOpen(false);
    customForm.resetFields();
    nav(`/work/submit/${db.assignmentTypes[0]?.id ?? 'AT1'}?topic=${id}`);
  };

  const pickedCount = (topicId: string) => db.topicSelections.filter((s) => s.topic_id === topicId).length;
  const mineSelected = (topicId: string) => db.topicSelections.some((s) => s.topic_id === topicId && s.union_id === me.union_id);

  /** V4.0 CR-03：选题非排斥 —— 同一选题可被 N 人选中；select_limit=0 表示不限 */
  const pickTopic = (t: Topic) => {
    if (t.status === '已关闭') { message.warning('该选题已关闭'); return; }
    /** 开关关闭 → 强制排他（等价于 V3.0 的「已被选走」） */
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

  const resetFilter = () => { setTrack('全部'); setKw(''); setTagFilter([]); setResFilter('ALL'); };

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }} className="wb-fade-in">
      <PageHeader
        title="案例与选题"
        desc="照着做就能出结果 —— 每个案例都给了输入、可直接抄的提示词、产出物与 3 条验收标准"
        extra={
          <Space size={16}>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontSize: 22, fontWeight: 800, color: COLOR.primary }}>{db.cases.length}</div>
              <div style={{ fontSize: 11, color: COLOR.textMuted }}>场景案例</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {/* V6.0 CR-17：计数改用「本人可见」口径，避免私有选题被计入他人可见数 */}
              <div className="num" style={{ fontSize: 22, fontWeight: 800, color: COLOR.primary }}>{topicList.length}</div>
              <div style={{ fontSize: 11, color: COLOR.textMuted }}>可选选题</div>
            </div>
          </Space>
        }
      />

      <Card styles={{ body: { padding: 16 } }}>
        <Space wrap size={12}>
          <Segmented value={track} onChange={(v) => setTrack(String(v))} options={['全部', ...TRACKS]} />
          {freeTags && (
            <Select
              mode="multiple" allowClear placeholder="按标签筛选" style={{ minWidth: 220 }}
              value={tagFilter} onChange={setTagFilter}
              options={tagPool.map((t) => ({ value: t, label: `#${t}` }))}
            />
          )}
          {freeTags && tagFilter.length > 1 && (
            <Segmented
              value={tagMode} onChange={(v) => setTagMode(String(v) as TagMode)}
              options={[
                { value: 'ANY', label: '任一标签（并集）' },
                { value: 'ALL', label: '同时满足（交集）' },
              ]}
            />
          )}
          {/* V4.2：资源筛选 —— 员工最常问「哪个装上就能跑」，这里一句话回答。
              开关全关时不渲染（≡ V4.0）。 */}
          {resFilterable && (
            <Segmented
              value={resFilter}
              onChange={(v) => setResFilter(String(v) as 'ALL' | 'SKILL' | 'ATTACH')}
              options={[
                { value: 'ALL', label: '全部资源' },
                { value: 'SKILL', label: '🧩 可直装 Skill' },
                { value: 'ATTACH', label: '📎 带附件' },
              ].filter((o) => (o.value === 'SKILL' ? skillOn : o.value === 'ATTACH' ? attachOn : true))}
            />
          )}
          <Input
            allowClear prefix={<SearchOutlined style={{ color: COLOR.textMuted }} />} placeholder="搜索案例 / 选题 / 标签"
            style={{ width: 220 }} value={kw} onChange={(e) => setKw(e.target.value)}
          />
        </Space>
        <div style={{ fontSize: 11, color: COLOR.textMuted, marginTop: 8 }}>
          V4.0 CR-03：已取消受众分层（原建议层级），分类改由发布者自选标签承载；无标签的内容进入「未分类」聚合，按标签筛选时不可见。
        </div>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'case', label: `场景案例（${list.length}）` },
          { key: 'topic', label: `选题池（${topicList.length}）` },
        ]}
      />

      {tab === 'case' ? (
        list.length === 0 ? (
          <Card>
            <Empty description="没有匹配的案例，试试清空筛选">
              <Button type="primary" onClick={resetFilter}>清空筛选</Button>
            </Empty>
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {list.map((c) => {
              const skillOn = flags.caseSkillPackage !== false;
              const attachOn = flags.caseAttachment !== false;
              const skillN = skillOn ? (c.skill_packages?.length ?? 0) : 0;
              const attN = attachOn ? (c.attachments?.length ?? 0) : 0;
              return (
                <Col xs={24} sm={12} lg={8} key={c.id}>
                  {/* V4.1 Moka P1：hover 200ms 出最小信息集，省掉一次点进去再退出来的往返 */}
                  <HoverCard
                    placement="right"
                    content={
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: COLOR.textSub, lineHeight: 1.7 }}>
                          <div>作者：{c.author_name}</div>
                          <div>耗时：{c.duration} · 复用：{c.reuse_count} 次</div>
                          <div>验收：{c.acceptance.length} 条标准</div>
                          {skillN > 0 && <div style={{ color: '#C2410C', fontWeight: 600 }}>🧩 可直接安装 {skillN} 个 Skill</div>}
                          {attN > 0 && <div>📎 附件 {attN} 个</div>}
                        </div>
                      </div>
                    }
                  >
                    <Link to={`/cases/${c.id}`}>
                      <div className="wb-card wb-card-hover" style={{ padding: 18, height: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <CoverBlock emoji={c.cover} track={c.track} size={44} />
                          <TrackTag track={c.track} />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.45, letterSpacing: '-0.01em' }}>{c.title}</div>
                        <div style={{
                          color: COLOR.textSub, fontSize: 13, marginTop: 8, lineHeight: 1.65, minHeight: 44,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {c.pain_point}
                        </div>
                        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: COLOR.textMuted, marginTop: 12 }}>
                          <span><EyeOutlined /> {c.view_count}</span>
                          <span>👍 {c.like_count}</span>
                          <span><ThunderboltOutlined /> {c.duration}</span>
                          <span><FireOutlined /> 复用 {c.reuse_count}</span>
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* V4.1：列表层就能看出「这个能直接装」，不用点进去才知道 */}
                          {skillN > 0 && (
                            <span style={{
                              fontSize: 11, fontWeight: 600, color: '#C2410C', background: '#FFF1EB',
                              padding: '2px 8px', borderRadius: 6,
                            }}>🧩 可直装 {skillN}</span>
                          )}
                          {attN > 0 && (
                            <span style={{
                              fontSize: 11, fontWeight: 600, color: '#1D4ED8', background: '#EFF6FF',
                              padding: '2px 8px', borderRadius: 6,
                            }}>📎 {attN}</span>
                          )}
                          {c.tags.map((t) => (
                            <span key={t} style={{
                              fontSize: 11, color: COLOR.textSub, background: '#F9FAFB',
                              padding: '2px 8px', borderRadius: 6,
                            }}>#{t}</span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  </HoverCard>
                </Col>
              );
            })}
          </Row>
        )
      ) : (
        <Card styles={{ body: { padding: '8px 20px' } }}>
          {/* V6.0 CR-17：选题池顶部「其他·自定义」入口 */}
          {topicCustomOn && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: `1px dashed ${COLOR.borderLight}`, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: COLOR.textMuted }}>
                没有合适的选题？自己填一个 —— <b>默认仅你与组织者可见</b>，组织者可公开给全员
              </div>
              <Button size="small" icon={<PlusOutlined />} onClick={() => setCustomOpen(true)}>其他·自定义选题</Button>
            </div>
          )}
          {topicList.length === 0 ? (
            <Empty description="没有匹配的选题，试试清空筛选">
              <Button type="primary" onClick={resetFilter}>清空筛选</Button>
            </Empty>
          ) : topicList.map((t) => {
            const n = pickedCount(t.id);
            const mine = mineSelected(t.id);
            const limit = multiSelect ? (t.select_limit ?? 0) : 1;
            const full = limit > 0 && n >= limit;
            return (
              <div
                key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: `1px solid ${COLOR.borderLight}` }}
              >
                <TrackTag track={t.track} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 3 }}>
                    产出：{t.expected_output} · 难度 {t.difficulty}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {freeTags && ((t.tags ?? []).length === 0
                      ? <Tag style={{ marginInlineEnd: 0 }}>未分类</Tag>
                      : (t.tags ?? []).map((x) => (
                        <span key={x} style={{
                          fontSize: 11, color: COLOR.textSub, background: '#F9FAFB',
                          padding: '2px 8px', borderRadius: 6,
                        }}>#{x}</span>
                      )))}
                    {n > 0 && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        已被 {n} 人选中{limit === 0 ? '（可重复选）' : `（上限 ${limit}）`}
                      </Typography.Text>
                    )}
                  </div>
                  {/* V6.0 CR-17：私有自定义选题给出可见性标识，避免误以为别人也能看到 */}
                  <div style={{ marginTop: 6 }}>
                    {t.is_custom && (
                      <Tag color={t.visibility === 'PRIVATE' ? 'orange' : 'green'} style={{ marginInlineEnd: 0 }}>
                        {t.visibility === 'PRIVATE' ? '自定义 · 仅本人与组织者可见' : '自定义 · 已公开'}
                      </Tag>
                    )}
                  </div>
                </div>
                {t.status === '已关闭' ? (
                  <Tag>已关闭</Tag>
                ) : (
                  <Button
                    size="small" type={mine ? 'default' : 'primary'}
                    disabled={full && !mine}
                    onClick={() => pickTopic(t)}
                  >
                    {mine ? '继续提报' : full ? '已满' : '选它'}
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* V6.0 CR-17：自定义选题弹窗 */}
      <Modal
        open={customOpen}
        title="其他 · 自定义选题"
        okText="创建并去提报"
        onCancel={() => setCustomOpen(false)}
        onOk={() => customForm.submit()}
        destroyOnClose
      >
        <Form form={customForm} layout="vertical" onFinish={createCustomTopic} preserve={false}
          initialValues={{ track: TRACKS[0] }}>
          <Form.Item
            name="title" label="选题名称"
            rules={[
              { required: true, message: '请填写选题名称' },
              { max: 30, message: '不超过 30 字' },
            ]}
            extra="写清楚你要解决的场景，≤30 字"
          >
            <Input placeholder="如：客户拜访前的 5 分钟准备卡" maxLength={30} showCount />
          </Form.Item>
          <Form.Item name="track" label="赛道" rules={[{ required: true }]}>
            <Select options={TRACKS.map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="expected_output" label="预期产出（选填）">
            <Input placeholder="如：一页纸准备卡 / 一段可直接复用的提示词" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            创建后默认仅你与组织者可见；组织者可在「内容管理 · 选题池」公开给全员，公开后才进入公共统计。
          </Typography.Text>
        </Form>
      </Modal>
    </Space>
  );
}
