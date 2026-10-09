import { useState } from 'react';
import { Button, Form, Input, Segmented, Select } from 'antd';
import { useNavigate } from 'react-router-dom';
import { EyeOutlined, ThunderboltOutlined, FireOutlined, PlusOutlined } from '@ant-design/icons';
import { useStore } from '@/store/store';
import { TRACKS } from '@/mock/types';
import type { Topic, Track } from '@/mock/types';
import { useCaseFilters } from '@/hooks/useCaseFilters';
import { useTopicPick } from '@/hooks/useTopicPick';
import { Dialog } from '@/components/v2/Dialog';
import { HoverCard } from '@/components/ui';
import { trackVar } from '@/theme/v2/track';
import { useNoteVisible } from '@/auth/annotation';
import '../../theme/v2/template.css';

/**
 * 案例与选题 v2（P3-3 样板页 ①：列表模板）
 *
 * 相对 v1 的**纯视觉**变化：
 *   ① 卡片改为零投影 + 圆角 12 + 1px 描边 + 左侧 3px 赛道色条（v1 是带阴影的 wb-card）
 *   ② 筛选器从「AntD 控件堆叠」改为工具条 chip（状态一眼可见）
 *   ③ 空态回显当前筛选上下文（v1 只有一句「没有匹配的案例」）
 *   ④ 全部取色走 tokens，零裸 hex
 *
 * 业务逻辑 100% 复用 `useCaseFilters` / `useTopicPick`，与 v1 同源，未复制一份。
 *
 * P4 回归补齐（2026-10-05）：初版遗漏 v1 的「其他·自定义选题」入口与私有选题
 * 可见性标识（V6.0 CR-17），已按 v1 逐行补回；入口仍受 `topicCustom` 开关控制。
 */

export default function CaseListV2() {
  const { db } = useStore();
  /** V8.6-10.08：口径 / 规则注解仅运营方与管理员可见 */
  const note = useNoteVisible();
  const nav = useNavigate();
  const f = useCaseFilters();
  const { pickedCount, mineSelected, pickTopic, createCustomTopic } = useTopicPick(f.multiSelect);
  const [tab, setTab] = useState<'case' | 'topic'>('case');
  /** V6.0 CR-17：自定义选题弹窗（入口受 flags.topicCustom 控制，关闭 ≡ 旧版无此入口） */
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm] = Form.useForm();
  /**
   * V8.3-10.09：选题详情浮层。
   *
   * 为什么不新建 /topics/:id 详情页：选题与案例是**两批独立内容**（标题完全不同），
   * 选题里的 `case_id` 字段指向的是早已不存在的旧 id（线上21 条全部对不上），
   * 且全代码库零使用 —— 属历史废弃字段，不能拿它跳案例详情。
   * 所以选题的「查看详情」用浮层承载，不引入新路由。
   */
  const [topicView, setTopicView] = useState<Topic | null>(null);

  const submitCustom = (vals: { title: string; track: Track; expected_output?: string }) => {
    createCustomTopic(vals);
    setCustomOpen(false);
    customForm.resetFields();
  };

  /** 赛道 chip 上的计数：随当前 Tab 切换数据源 */
  const src = tab === 'case' ? db.cases : db.topics;
  const countOf = (t: string) => (t === '全部' ? src.length : src.filter((x) => x.track === t).length);

  const filterText = [
    f.track !== '全部' ? `赛道＝${f.track}` : '',
    f.kw ? `关键词＝${f.kw}` : '',
    f.tagFilter.length ? `标签＝${f.tagFilter.join(' / ')}` : '',
    f.resFilter !== 'ALL' ? `资源＝${f.resFilter === 'SKILL' ? '含 Skill 包' : '含附件'}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div>
      {/* ---------- 页头 ---------- */}
      <div className="wb2-ph">
        <div>
          <h2 className="wb2-ph-t">案例与选题</h2>
          <div className="wb2-ph-d">
            照着做就能出结果 —— 每个案例都给了输入、可直接抄的提示词、产出物与 3 条验收标准
          </div>
        </div>
        <div className="wb2-ph-a">
          {[
            { n: db.cases.length, t: '场景案例' },
            { n: db.topics.length, t: '可选选题' },
          ].map((m) => (
            <div key={m.t} style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontSize: 'var(--wb-fs-display)', fontWeight: 600, color: 'var(--wb-primary)', lineHeight: 1.2 }}>{m.n}</div>
              <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)' }}>{m.t}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- 工具条 ---------- */}
      <div className="wb2-tools">
        <div className="wb2-inp">
          <span>⌕</span>
          <input
            placeholder="搜索案例 / 选题 / 标签"
            value={f.kw}
            onChange={(e) => f.setKw(e.target.value)}
          />
        </div>

        {['全部', ...TRACKS].map((t) => (
          <button
            key={t}
            className={`wb2-chip${f.track === t ? ' on' : ''}`}
            onClick={() => f.setTrack(t)}
          >
            {t} {countOf(t)}
          </button>
        ))}

        <span className="spacer" />

        {f.resFilterable && (
          <>
            {f.skillOn && (
              <button className={`wb2-chip${f.resFilter === 'SKILL' ? ' on' : ''}`} onClick={() => f.setResFilter(f.resFilter === 'SKILL' ? 'ALL' : 'SKILL')}>
                🧩 可直装 Skill
              </button>
            )}
            {f.attachOn && (
              <button className={`wb2-chip${f.resFilter === 'ATTACH' ? ' on' : ''}`} onClick={() => f.setResFilter(f.resFilter === 'ATTACH' ? 'ALL' : 'ATTACH')}>
                📎 带附件
              </button>
            )}
          </>
        )}

        {f.freeTags && (
          <Select
            mode="multiple" allowClear placeholder="按标签筛选" style={{ minWidth: 200, maxWidth: 280 }}
            value={f.tagFilter} onChange={f.setTagFilter}
            options={f.tagPool.map((t) => ({ value: t, label: `#${t}` }))}
          />
        )}
        {f.freeTags && f.tagFilter.length > 1 && (
          <Segmented
            size="small"
            value={f.tagMode}
            onChange={(v) => f.setTagMode(String(v) as 'ANY' | 'ALL')}
            options={[
              { value: 'ANY', label: '任一（并集）' },
              { value: 'ALL', label: '同时满足（交集）' },
            ]}
          />
        )}
      </div>

      {/* ---------- Tab ---------- */}
      <div className="wb2-tools" style={{ marginBottom: 'var(--wb-space-4)' }}>
        <Segmented
          value={tab}
          onChange={(v) => setTab(String(v) as 'case' | 'topic')}
          options={[
            { value: 'case', label: `场景案例（${f.list.length}）` },
            { value: 'topic', label: `选题池（${f.topicList.length}）` },
          ]}
        />
      </div>

      {/* ---------- 案例：卡片 ---------- */}
      {tab === 'case' ? (
        f.list.length === 0 ? (
          <div className="wb2-empty">
            <div className="ic">⌕</div>
            <div className="t">没有匹配的结果</div>
            {filterText && <div className="d">当前筛选：{filterText}</div>}
            <Button type="primary" onClick={f.resetFilter}>清空筛选</Button>
          </div>
        ) : (
          <div className="wb2-cgrid">
            {f.list.map((c) => {
              const skillN = f.skillOn ? (c.skill_packages?.length ?? 0) : 0;
              const attN = f.attachOn ? (c.attachments?.length ?? 0) : 0;
              return (
                <HoverCard
                  key={c.id}
                  placement="right"
                  content={
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--wb-ink-2)', lineHeight: 1.7 }}>
                        <div>作者：{c.author_name}</div>
                        <div>耗时：{c.duration} · 复用：{c.reuse_count} 次</div>
                        <div>验收：{c.acceptance.length} 条标准</div>
                        {skillN > 0 && <div style={{ color: 'var(--wb-primary)', fontWeight: 600 }}>🧩 可直接安装 {skillN} 个 Skill</div>}
                        {attN > 0 && <div>📎 附件 {attN} 个</div>}
                      </div>
                    </div>
                  }
                >
                  {/* V8-10.07：`.eq` 等高修饰类，案例外框大小一致 */}
                  <div
                    className="wb2-ccard eq"
                    style={{ borderLeft: `3px solid ${trackVar(c.track)}` }}
                    onClick={() => nav(`/cases/${c.id}`)}
                  >
                    <div className="ct">{c.title}</div>
                    <div className="cd">{c.pain_point}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'var(--wb-space-3)' }}>
                      <span className="wb2-tag"><i className="d" style={{ background: trackVar(c.track) }} />{c.track}</span>
                      {skillN > 0 && <span className="wb2-tag" style={{ color: 'var(--wb-primary)' }}>🧩 可直装 {skillN}</span>}
                      {attN > 0 && <span className="wb2-tag" style={{ color: 'var(--wb-info)' }}>📎 {attN}</span>}
                      {c.tags.map((t) => <span key={t} className="wb2-tag">#{t}</span>)}
                    </div>
                    <div className="cf">
                      <span><EyeOutlined /> {c.view_count}</span>
                      <span>👍 {c.like_count}</span>
                      <span><ThunderboltOutlined /> {c.duration}</span>
                      <span><FireOutlined /> 复用 {c.reuse_count}</span>
                      <span className="grow" />
                      <Button size="small" type="link" style={{ padding: 0 }} onClick={(e) => { e.stopPropagation(); nav(`/cases/${c.id}`); }}>查看</Button>
                    </div>
                  </div>
                </HoverCard>
              );
            })}
          </div>
        )
      ) : (
        /* ---------- 选题：细线列表 ---------- */
        <>
        {/* V6.0 CR-17：选题池顶部「其他·自定义」入口（开关关闭时不出现） */}
        {f.topicCustomOn && (
          <div className="wb2-setrow" style={{ marginBottom: 'var(--wb-space-4)' }}>
            <div>
              <div className="nm">没有合适的选题？自己填一个</div>
              <div className="ds">默认仅你与组织者可见，组织者可公开给全员</div>
            </div>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setCustomOpen(true)}>其他·自定义选题</Button>
          </div>
        )}
        {f.topicList.length === 0 ? (
          <div className="wb2-empty">
            <div className="ic">⌕</div>
            <div className="t">没有匹配的选题</div>
            {filterText && <div className="d">当前筛选：{filterText}</div>}
            <Button type="primary" onClick={f.resetFilter}>清空筛选</Button>
          </div>
        ) : (
          <div className="wb2-list">
            {f.topicList.map((t) => {
              const n = pickedCount(t.id);
              const mine = mineSelected(t.id);
              const limit = f.multiSelect ? (t.select_limit ?? 0) : 1;
              const full = limit > 0 && n >= limit;
              return (
                /**
                 * V8.3-10.09：整行可点开详情浮层（与悬赏池的卡片可点对齐）。
                 * 用 div + role=link 而不是 <Link>：行内有「选它」按钮，
                 * 套 <a> 会被导航吞掉 —— 按钮处显式 stopPropagation。
                 */
                <div
                  className="wb2-li"
                  key={t.id}
                  role="link"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setTopicView(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setTopicView(t);
                    }
                  }}
                >
                  <span className="wb2-li-dot" style={{ background: trackVar(t.track) }} />
                  <div className="wb2-li-m">
                    <div className="wb2-li-t">
                      {t.title}
                      {n > 0 && (
                        <span className="wb2-tag">已被 {n} 人选中{limit === 0 ? '（可重复选）' : `（上限 ${limit}）`}</span>
                      )}
                    </div>
                    <div className="wb2-li-s">
                      <span>{t.track}</span>
                      <span>产出：{t.expected_output}</span>
                      <span>难度 {t.difficulty}</span>
                      {f.freeTags && (
                        <span>
                          {(t.tags ?? []).length === 0 ? '未分类' : (t.tags ?? []).map((x) => `#${x}`).join(' ')}
                        </span>
                      )}
                      {/* V6.0 CR-17：私有自定义选题给出可见性标识，避免误以为别人也能看到 */}
                      {t.is_custom && (
                        <span className={t.visibility === 'PRIVATE' ? 'wb2-tag wa' : 'wb2-tag ok'}>
                          {t.visibility === 'PRIVATE' ? '自定义 · 仅本人与组织者可见' : '自定义 · 已公开'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="wb2-li-r">
                    {t.status === '已关闭' ? (
                      <span className="wb2-tag id"><i className="d" />已关闭</span>
                    ) : (
                      <Button
                        size="small"
                        type={mine ? 'default' : 'primary'}
                        disabled={full && !mine}
                        onClick={(e) => {
                          /* V8.3-10.09：不拦会连带触发整行的「打开详情」 */
                          e.stopPropagation();
                          pickTopic(t);
                        }}
                      >
                        {mine ? '继续提报' : full ? '已满' : '选它'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>
      )}

      {/* V8.3-10.09：选题详情浮层（点选题行打开，不新建路由，理由见 topicView 声明处注释） */}
      <Dialog
        open={!!topicView}
        title="选题详情"
        onCancel={() => setTopicView(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setTopicView(null)}>关闭</Button>
            {topicView && topicView.status !== '已关闭' && (() => {
              const n = pickedCount(topicView.id);
              const mine = mineSelected(topicView.id);
              const limit = f.multiSelect ? (topicView.select_limit ?? 0) : 1;
              const full = limit > 0 && n >= limit;
              return (
                <Button
                  type="primary"
                  disabled={full && !mine}
                  onClick={() => {
                    pickTopic(topicView);
                    setTopicView(null);
                  }}
                >
                  {mine ? '继续提报' : full ? '已满' : '选它'}
                </Button>
              );
            })()}
          </div>
        }
      >
        {topicView && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wb-space-4)' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                {topicView.title}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <span className="wb2-tag">
                  <i className="d" style={{ background: trackVar(topicView.track) }} />
                  {topicView.track}
                </span>
                <span className="wb2-tag">难度 {topicView.difficulty}</span>
                <span className="wb2-tag">{topicView.status}</span>
                {pickedCount(topicView.id) > 0 && (
                  <span className="wb2-tag">
                    已被 {pickedCount(topicView.id)} 人选中
                    {(f.multiSelect ? (topicView.select_limit ?? 0) : 1) === 0
                      ? '（可重复选）'
                      : `（上限 ${f.multiSelect ? (topicView.select_limit ?? 0) : 1}）`}
                  </span>
                )}
              </div>
            </div>
            <div className="wb2-kv" style={{ fontSize: 'var(--wb-fs-body)' }}>
              <b style={{ flexShrink: 0 }}>期望产出</b>
              <span>{topicView.expected_output || '未填写'}</span>
            </div>
            {/* V6.0 CR-17：自定义选题的可见性要说清楚，避免以为别人也能看到 */}
            {topicView.is_custom && (
              <div className="wb2-kv" style={{ fontSize: 'var(--wb-fs-body)' }}>
                <b style={{ flexShrink: 0 }}>可见性</b>
                <span>
                  {topicView.visibility === 'PRIVATE'
                    ? '自定义选题 · 仅本人与组织者可见'
                    : '自定义选题 · 已公开给全员'}
                </span>
              </div>
            )}
            <div className="wb2-kv" style={{ fontSize: 'var(--wb-fs-body)' }}>
              <b style={{ flexShrink: 0 }}>标签</b>
              <span>{(topicView.tags ?? []).length === 0 ? '未分类' : (topicView.tags ?? []).map((x) => `#${x}`).join('  ')}</span>
            </div>
          </div>
        )}
      </Dialog>

      {/* V6.0 CR-17：自定义选题弹窗 */}
      <Dialog
        open={customOpen}
        title="其他 · 自定义选题"
        okText="创建并去提报"
        onCancel={() => setCustomOpen(false)}
        onOk={() => customForm.submit()}
      >
        <Form form={customForm} layout="vertical" onFinish={submitCustom} preserve={false}
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
          <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', lineHeight: 1.6 }}>
            创建后默认仅你与组织者可见；组织者可在「内容管理 · 选题池」公开给全员，公开后才进入公共统计。
          </div>
        </Form>
      </Dialog>

      {note && (
            <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 'var(--wb-space-4)', lineHeight: 1.6 }}>
        V4.0 CR-03：已取消受众分层（原建议层级），分类改由发布者自选标签承载；无标签的内容进入「未分类」聚合，按标签筛选时不可见。
      </div>
      )}
    </div>
  );
}
