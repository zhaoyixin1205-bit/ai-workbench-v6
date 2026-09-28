import { Avatar, Button, Card, Col, Empty, Input, Row, Segmented, Space, Switch, Tag, Typography, Modal, App as AntApp, Tooltip, Select, Upload, Divider, Alert } from 'antd';
import { PlusOutlined, LikeOutlined, MessageOutlined, EyeOutlined, FireOutlined, PaperClipOutlined, BoldOutlined, ItalicOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { SoftTag } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker from '@/components/ScopePicker';
import type { ScopeSubject } from '@/mock/types';

export default function Community() {
  const { db, me, flags, setDb, log } = useStore();
  const { message } = AntApp.useApp();
  const nav = useNavigate();
  const [board, setBoard] = useState('全部');
  const [sort, setSort] = useState('最新');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [anon, setAnon] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  /** V4.0 CR-05：发帖交互对齐云社区 —— 板块 / 富文本 / 可见范围 / 草稿自动保存 / 附件 */
  const v2 = flags.communityV2Layout !== false;
  const DRAFT_KEY = `wb-community-draft-${me.union_id}`;
  const [boardId, setBoardId] = useState('');
  const [subjects, setSubjects] = useState<ScopeSubject[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [draftAt, setDraftAt] = useState('');
  const [draftTip, setDraftTip] = useState(false);

  /** 打开发帖框时提示是否有草稿可恢复 */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { title?: string; savedAt?: string };
        if (d.title) { setDraftTip(true); setDraftAt(d.savedAt ?? ''); }
      }
    } catch { /* ignore */ }
  }, [open]);

  /** 草稿自动保存（本地草稿区，不入库、不占服务端存储） */
  useEffect(() => {
    if (!v2 || !open) return;
    if (!title.trim() && !content.trim()) return;
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, tags, anon, boardId, savedAt: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}` }));
      setDraftAt(`${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`);
    }, 1200);
    return () => clearTimeout(t);
  }, [v2, open, title, content, tags, anon, boardId]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { title?: string; content?: string; tags?: string[]; anon?: boolean; boardId?: string };
      setTitle(d.title ?? ''); setContent(d.content ?? ''); setTags(d.tags ?? []); setAnon(!!d.anon);
      if (d.boardId) setBoardId(d.boardId);
      setDraftTip(false);
      message.success('已恢复上次草稿');
    } catch { /* ignore */ }
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftAt(''); setDraftTip(false);
  };

  /** 极简富文本工具条：向光标处插入 Markdown 标记（不做真实所见即所得） */
  const insert = (before: string, after = before) => {
    const el = document.getElementById('wb-post-content') as HTMLTextAreaElement | null;
    if (!el) { setContent((c) => `${c}${before}文本${after}`); return; }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${before}${content.slice(start, end) || '文本'}${after}${content.slice(end)}`;
    setContent(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + (end - start || 2)); }, 0);
  };

  const boards = db.boards.filter((b) => b.status === '启用');
  const curBoard = boards.find((b) => b.name === board);

  const posts = useMemo(() => {
    let arr = db.posts.filter((p) => p.status === '正常' || p.status === '审核中');
    if (board !== '全部') arr = arr.filter((p) => p.board_name === board);
    if (sort === '最热') arr = [...arr].sort((a, b) => (b.like_count + b.comment_count * 3) - (a.like_count + a.comment_count * 3));
    else if (sort === '精华') arr = arr.filter((p) => p.featured);
    else arr = [...arr].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return [...arr].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [db.posts, board, sort]);

  const publish = () => {
    if (title.trim().length < 4) { message.warning('标题至少 4 字'); return; }
    if (content.trim().length < 10) { message.warning('正文至少 10 字'); return; }
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
        ...(v2 ? { visible_subjects: subjects, attachments: files, content_format: 'rich' as const } : {}),
      }, ...p.posts],
      pointRecords: [{ id: `PR${Date.now()}`, union_id: me.union_id, name: me.name, source: '社区发帖', points: 2, campaign_id: 'C2026Q4', remark: '发帖 +2', created_at: DEMO_TODAY }, ...p.pointRecords],
    }));
    log('社区发帖', title, anon ? '匿名发布（后端保留真实 unionId）' : '实名发布');
    message.success('发布成功（先发后审，命中敏感词将进入人工审核队列）');
    if (v2) clearDraft();
    setOpen(false); setTitle(''); setContent(''); setAnon(false); setTags([]);
    if (v2) { setFiles([]); setSubjects([]); setBoardId(''); }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row justify="space-between" align="bottom">
        <Col>
          <Typography.Title level={3} style={{ marginBottom: 6, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>用户社区</Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: COLOR.textSub }}>
            坐诊解决一对一问题，社区沉淀一对多经验
          </Typography.Text>
        </Col>
        <Col>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setOpen(true)}>发帖</Button>
        </Col>
      </Row>

      <Card styles={{ body: { padding: 16 } }}>
        <Space wrap size={12}>
          <Segmented
            value={board}
            onChange={(v) => setBoard(String(v))}
            options={['全部', ...boards.map((b) => b.name)]}
          />
          <Segmented value={sort} onChange={(v) => setSort(String(v))}
            options={['最新', '最热', '精华']} />
        </Space>
        {curBoard && <div style={{ marginTop: 12, fontSize: 12, color: COLOR.textSub }}>
          {curBoard.intro}
          {curBoard.only_organizer_post && <span style={{ marginLeft: 8, color: '#B45309', background: '#FFFBEB', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>仅组织者可发帖</span>}
        </div>}
      </Card>

      {posts.length === 0 ? (
        <Card>
          <Empty description="这个板块还没有帖子">
            <Button type="primary" onClick={() => setOpen(true)}>发第一帖</Button>
          </Empty>
        </Card>
      ) : (
        posts.map((p) => (
          <Link key={p.id} to={`/community/${p.id}`}>
            <div className="wb-card wb-card-hover" style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 14 }}>
                <Avatar
                  size={42}
                  className={p.anonymous ? 'wb-avatar-anon' : undefined}
                  style={p.anonymous ? undefined : { background: COLOR.primary, flex: '0 0 42px' }}
                >
                  {p.anonymous ? '匿' : p.author_name.slice(0, 1)}
                </Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={6} wrap style={{ marginBottom: 6 }}>
                    {p.pinned && <SoftTag text="置顶" tone="red" />}
                    {p.featured && <SoftTag text="精华" tone="primary" />}
                    <SoftTag text={p.board_name} tone="gray" />
                    {p.status === '审核中' && <SoftTag text="审核中" tone="gold" />}
                  </Space>
                  <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.45, letterSpacing: '-0.01em' }}>{p.title}</div>
                  <div style={{
                    color: COLOR.textSub, fontSize: 13, marginTop: 8, lineHeight: 1.7, display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {p.content}
                  </div>
                  <Space size={16} style={{ marginTop: 12, fontSize: 12, color: COLOR.textMuted }}>
                    <span>{p.anonymous ? p.anon_no : p.author_name}</span>
                    <span><LikeOutlined /> {p.like_count}</span>
                    <span><MessageOutlined /> {p.comment_count}</span>
                    <span><EyeOutlined /> {p.view_count}</span>
                    <span>{p.created_at.slice(0, 10)}</span>
                  </Space>
                  <Space size={4} style={{ marginTop: 10 }}>
                    {p.tags.map((t) => (
                      <span key={t} style={{
                        fontSize: 11, color: COLOR.textSub, background: '#F9FAFB',
                        padding: '2px 8px', borderRadius: 6,
                      }}>#{t}</span>
                    ))}
                  </Space>
                </div>
              </div>
            </div>
          </Link>
        ))
      )}

      <Modal
        open={open} title="发布帖子" onCancel={() => setOpen(false)} onOk={publish} okText="发布" width={640}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {v2 && draftTip && (
            <Alert
              type="info" showIcon message={`检测到未发布的草稿${draftAt ? `（${draftAt}）` : ''}`}
              action={<Button size="small" type="link" onClick={restoreDraft}>恢复草稿</Button>}
            />
          )}
          {v2 && (
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>发布板块</div>
              <Select
                style={{ width: '100%' }} placeholder="选择板块"
                value={boardId || undefined}
                onChange={(v) => setBoardId(v)}
                options={boards.map((b) => ({ value: b.id, label: `${b.icon ?? ''} ${b.name}${b.only_organizer_post ? '（仅组织者可发）' : ''}` }))}
              />
            </div>
          )}
          <Input placeholder="标题（≤50 字）" maxLength={50} showCount value={title} onChange={(e) => setTitle(e.target.value)} />
          {v2 ? (
            <>
              <div style={{ border: `1px solid ${COLOR.borderLight}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '6px 8px', background: '#F9FAFB', borderBottom: `1px solid ${COLOR.borderLight}`, display: 'flex', gap: 4 }}>
                  <Button size="small" type="text" icon={<BoldOutlined />} onClick={() => insert('**')} />
                  <Button size="small" type="text" icon={<ItalicOutlined />} onClick={() => insert('*')} />
                  <Button size="small" type="text" icon={<UnorderedListOutlined />} onClick={() => insert('\n- ', '')} />
                  <Divider type="vertical" style={{ margin: '0 4px' }} />
                  <Typography.Text type="secondary" style={{ fontSize: 11, lineHeight: '24px' }}>
                    富文本支持加粗 / 斜体 / 列表，支持 Markdown
                  </Typography.Text>
                </div>
                <Input.TextArea id="wb-post-content" rows={6} placeholder="正文（≤5000 字）" value={content} onChange={(e) => setContent(e.target.value)} style={{ border: 'none' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>可见范围（默认全员可见）</div>
                <ScopePicker value={subjects} onChange={setSubjects} />
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  设置后仅范围内人员可见该帖；空表示不限制。
                </Typography.Text>
              </div>
              <div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>附件</div>
                <Upload
                  fileList={files.map((n, i) => ({ uid: String(i), name: n, status: 'done' as const }))}
                  beforeUpload={(f) => { setFiles((prev) => [...prev, f.name]); return false; }}
                  onRemove={(f) => setFiles((prev) => prev.filter((n) => n !== f.name))}
                >
                  <Button size="small" icon={<PaperClipOutlined />}>添加附件</Button>
                </Upload>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  演示环境不做真实上传，仅记录附件名；涉客户数据的附件请先在「 资产库」脱敏。
                </Typography.Text>
              </div>
            </>
          ) : (
            <Input.TextArea rows={6} placeholder="正文（≤5000 字）" value={content} onChange={(e) => setContent(e.target.value)} />
          )}
          <Space wrap>
            <span style={{ fontSize: 13 }}>话题标签（选 1–3 个）</span>
            {['提示词', '客户赋能', 'Skill 打包', 'Excel', '踩坑', '合规', '团队管理'].map((t) => (
              <Tag.CheckableTag
                key={t} checked={tags.includes(t)}
                onChange={(c) => setTags(c ? [...tags, t].slice(0, 3) : tags.filter((x) => x !== t))}
              >#{t}</Tag.CheckableTag>
            ))}
          </Space>
          {flags.anonymousPost ? (
            <Space>
              <Switch checked={anon} onChange={setAnon} size="small" />
              <span style={{ fontSize: 13 }}>匿名发布</span>
              <Tooltip title="匿名仅影响前端展示，后端始终记录真实 unionId；匿名帖不可 @他人、不计入个人作品集">
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>规则说明</Typography.Text>
              </Tooltip>
            </Space>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>匿名发帖功能已由系统管理员关闭</Typography.Text>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            同一用户 5 分钟内最多发 3 帖；涉客户信息、金额、联系方式将弹出脱敏提醒（不强制阻断，但记录提醒行为）。
          </Typography.Text>
          {v2 && (
            <Space size={8}>
              <Button size="small" onClick={() => {
                localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, tags, anon, boardId, savedAt: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}` }));
                setDraftAt(`${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`);
                message.success('草稿已保存');
              }}>保存草稿</Button>
              {draftAt && <Typography.Text type="secondary" style={{ fontSize: 11 }}>最近草稿保存于 {draftAt}（自动保存已开启）</Typography.Text>}
            </Space>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
