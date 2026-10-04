/**
 * 用户社区 v2（P3-4 C 端域）
 *
 * 业务口径全部沿用 v1：板块筛选（仅「启用」）、最新/最热/精华三态排序、置顶优先、
 * 先发后审、匿名开关受 flags.anonymousPost 控制、发帖 +2 积分、草稿本地自动保存。
 * 逻辑已抽到 hooks/usePostComposer.ts（v1 保留其内联副本，一字未改）。
 */
import { Alert, Button, Divider, Input, Modal, Segmented, Select, Space, Switch, Tag, Tooltip, Typography, Upload } from 'antd';
import {
  BoldOutlined, EyeOutlined, ItalicOutlined, LikeOutlined, MessageOutlined,
  PaperClipOutlined, PlusOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { SoftTag } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker from '@/components/ScopePicker';
import { usePostComposer } from '@/hooks/usePostComposer';
import type { ScopeSubject } from '@/mock/types';
import '../../theme/v2/template.css';

const TAG_POOL = ['提示词', '客户赋能', 'Skill 打包', 'Excel', '踩坑', '合规', '团队管理'];

export default function CommunityV2() {
  const { db, me, flags, setDb, log } = useStore();
  const [board, setBoard] = useState('全部');
  const [sort, setSort] = useState('最新');

  /** CR-05：v2 交互开关（板块 / 富文本 / 可见范围 / 草稿 / 附件） */
  const v2On = flags.communityV2Layout !== false;
  const boards = db.boards.filter((b) => b.status === '启用');
  const curBoard = boards.find((b) => b.name === board);

  const publishPost = (payload: { title: string; content: string; tags: string[]; anon: boolean; boardId: string; subjects: ScopeSubject[]; files: string[] }) => {
    const { title, content, tags, anon, boardId, subjects, files } = payload;
    const boardObj = boards.find((b) => b.id === boardId) ?? (board === '全部' ? boards[0] : boards.find((b) => b.name === board));
    const id = `PT${Date.now()}`;
    setDb((p) => ({
      ...p,
      posts: [{
        id, board_id: boardObj?.id ?? boards[0].id, board_name: boardObj?.name ?? board,
        union_id: me.union_id, author_name: me.name,
        anon_no: anon ? `匿名用户#${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${(Math.floor(Math.random() * 4095) + 4096).toString(16).toUpperCase().slice(1, 4)}` : undefined,
        title, content, tags, anonymous: anon, status: '正常',
        like_count: 0, comment_count: 0, view_count: 0, pinned: false, featured: false,
        created_at: DEMO_TODAY + ' 12:00', report_count: 0,
        ...(v2On ? { visible_subjects: subjects, attachments: files, content_format: 'rich' as const } : {}),
      }, ...p.posts],
      pointRecords: [{ id: `PR${Date.now()}`, union_id: me.union_id, name: me.name, source: '社区发帖', points: 2, campaign_id: 'C2026Q4', remark: '发帖 +2', created_at: DEMO_TODAY }, ...p.pointRecords],
    }));
    log('社区发帖', title, anon ? '匿名发布（后端保留真实 unionId）' : '实名发布');
  };

  const c = usePostComposer(me.union_id, { enabled: v2On, publish: publishPost });

  const posts = useMemo(() => {
    let arr = db.posts.filter((p) => p.status === '正常' || p.status === '审核中');
    if (board !== '全部') arr = arr.filter((p) => p.board_name === board);
    if (sort === '最热') arr = [...arr].sort((a, b) => (b.like_count + b.comment_count * 3) - (a.like_count + a.comment_count * 3));
    else if (sort === '精华') arr = arr.filter((p) => p.featured);
    else arr = [...arr].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return [...arr].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [db.posts, board, sort]);

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">用户社区</div>
          <div className="wb2-ph-d">坐诊解决一对一问题，社区沉淀一对多经验</div>
        </div>
        <div className="wb2-ph-a">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => c.setOpen(true)}>发帖</Button>
        </div>
      </div>

      <section className="wb2-card">
        <div className="wb2-tools" style={{ marginBottom: 0 }}>
          <Segmented value={board} onChange={(v) => setBoard(String(v))} options={['全部', ...boards.map((b) => b.name)]} />
          <Segmented value={sort} onChange={(v) => setSort(String(v))} options={['最新', '最热', '精华']} />
        </div>
        {curBoard && (
          <div className="wb2-note" style={{ marginTop: 12 }}>
            {curBoard.intro}
            {curBoard.only_organizer_post && (
              <span className="wb2-tag wa" style={{ marginLeft: 8 }}><span className="d">仅组织者可发帖</span></span>
            )}
          </div>
        )}
      </section>

      {posts.length === 0 ? (
        <div className="wb2-empty">
          <div className="ic">💬</div>
          <div className="t">这个板块还没有帖子</div>
          <div className="d" style={{ marginBottom: 12 }}>发第一帖，让经验沉淀下来</div>
          <Button type="primary" onClick={() => c.setOpen(true)}>发第一帖</Button>
        </div>
      ) : (
        <div className="wb2-list">
          {posts.map((p) => (
            <Link key={p.id} to={`/community/${p.id}`} style={{ display: 'block', color: 'inherit' }}>
              <div className="wb2-li" style={{ alignItems: 'flex-start', gap: 'var(--wb-space-4)' }}>
                <div className={`wb2-av${p.anonymous ? ' mute' : ''}`}>{p.anonymous ? '匿' : p.author_name.slice(0, 1)}</div>
                <div className="wb2-li-m">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    {p.pinned && <SoftTag text="置顶" tone="red" />}
                    {p.featured && <SoftTag text="精华" tone="primary" />}
                    <SoftTag text={p.board_name} tone="gray" />
                    {p.status === '审核中' && <SoftTag text="审核中" tone="gold" />}
                  </div>
                  <div className="wb2-li-t" style={{ fontSize: 'var(--wb-fs-subtitle)' }}>{p.title}</div>
                  <div className="wb2-li-s" style={{
                    marginTop: 6, lineHeight: 1.7, display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>{p.content}</div>
                  <div className="wb2-li-s" style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span>{p.anonymous ? p.anon_no : p.author_name}</span>
                    <span><LikeOutlined /> {p.like_count}</span>
                    <span><MessageOutlined /> {p.comment_count}</span>
                    <span><EyeOutlined /> {p.view_count}</span>
                    <span>{p.created_at.slice(0, 10)}</span>
                  </div>
                  {p.tags.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.tags.map((t) => <span key={t} className="wb2-chip" style={{ cursor: 'default' }}>#{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={c.open} title="发布帖子" onCancel={() => c.setOpen(false)}
        onOk={c.submit} okText="发布" cancelText="取消" width={640}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {c.v2 && c.draftTip && (
            <Alert
              type="info" showIcon message={`检测到未发布的草稿${c.draftAt ? `（${c.draftAt}）` : ''}`}
              action={<Button size="small" type="link" onClick={c.restoreDraft}>恢复草稿</Button>}
            />
          )}
          {c.v2 && (
            <div>
              <div className="wb2-fl">发布板块</div>
              <Select
                style={{ width: '100%' }} placeholder="选择板块"
                value={c.boardId || undefined} onChange={(v) => c.setBoardId(v)}
                options={boards.map((b) => ({ value: b.id, label: `${b.icon ?? ''} ${b.name}${b.only_organizer_post ? '（仅组织者可发）' : ''}` }))}
              />
            </div>
          )}
          <Input placeholder="标题（≤50 字）" maxLength={50} showCount value={c.title} onChange={(e) => c.setTitle(e.target.value)} />
          {c.v2 ? (
            <>
              <div className="wb2-card-pad" style={{ padding: 0, border: '1px solid var(--wb-border)', borderRadius: 'var(--wb-radius-md)', overflow: 'hidden' }}>
                <div style={{ padding: '6px 8px', background: 'var(--wb-surface-sunken)', borderBottom: '1px solid var(--wb-border)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <Button size="small" type="text" icon={<BoldOutlined />} onClick={() => c.insert('**')} />
                  <Button size="small" type="text" icon={<ItalicOutlined />} onClick={() => c.insert('*')} />
                  <Button size="small" type="text" icon={<UnorderedListOutlined />} onClick={() => c.insert('\n- ', '')} />
                  <Divider type="vertical" style={{ margin: '0 4px' }} />
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    富文本支持加粗 / 斜体 / 列表，支持 Markdown
                  </Typography.Text>
                </div>
                <Input.TextArea id="wb-post-content" rows={6} placeholder="正文（≤5000 字）" value={c.content} onChange={(e) => c.setContent(e.target.value)} style={{ border: 'none' }} />
              </div>
              <div>
                <div className="wb2-fl">可见范围（默认全员可见）</div>
                <ScopePicker value={c.subjects} onChange={c.setSubjects} />
                <div className="wb2-fhint">设置后仅范围内人员可见该帖；空表示不限制。</div>
              </div>
              <div>
                <div className="wb2-fl">附件</div>
                <Upload
                  fileList={c.files.map((n, i) => ({ uid: String(i), name: n, status: 'done' as const }))}
                  beforeUpload={(f) => { c.setFiles((prev) => [...prev, f.name]); return false; }}
                  onRemove={(f) => c.setFiles((prev) => prev.filter((n) => n !== f.name))}
                >
                  <Button size="small" icon={<PaperClipOutlined />}>添加附件</Button>
                </Upload>
                <div className="wb2-fhint">演示环境不做真实上传，仅记录附件名；涉客户数据的附件请先在「资产库」脱敏。</div>
              </div>
            </>
          ) : (
            <Input.TextArea rows={6} placeholder="正文（≤5000 字）" value={c.content} onChange={(e) => c.setContent(e.target.value)} />
          )}
          <div>
            <span className="wb2-fl" style={{ display: 'inline-block', marginRight: 8 }}>话题标签（选 1–3 个）</span>
            {TAG_POOL.map((t) => (
              <Tag.CheckableTag
                key={t} checked={c.tags.includes(t)}
                onChange={(ck) => c.setTags(ck ? [...c.tags, t].slice(0, 3) : c.tags.filter((x) => x !== t))}
              >#{t}</Tag.CheckableTag>
            ))}
          </div>
          {flags.anonymousPost ? (
            <Space>
              <Switch checked={c.anon} onChange={c.setAnon} size="small" />
              <span style={{ fontSize: 'var(--wb-fs-label)' }}>匿名发布</span>
              <Tooltip title="匿名仅影响前端展示，后端始终记录真实 unionId；匿名帖不可 @他人、不计入个人作品集">
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>规则说明</Typography.Text>
              </Tooltip>
            </Space>
          ) : (
            <div className="wb2-fhint">匿名发帖功能已由系统管理员关闭</div>
          )}
          <div className="wb2-fhint">
            同一用户 5 分钟内最多发 3 帖；涉客户信息、金额、联系方式将弹出脱敏提醒（不强制阻断，但记录提醒行为）。
          </div>
          {c.v2 && (
            <Space size={8}>
              <Button size="small" onClick={c.saveDraft}>保存草稿</Button>
              {c.draftAt && <span className="wb2-fhint">最近草稿保存于 {c.draftAt}（自动保存已开启）</span>}
            </Space>
          )}
        </Space>
      </Modal>
    </div>
  );
}
