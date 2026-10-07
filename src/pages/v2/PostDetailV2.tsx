/**
 * 帖子详情 v2（P3-4 C 端域）
 *
 * 业务口径与 v1 一致：点赞/取消点赞写回 like_count、评论写回 comment_count、
 * 一级评论 + 单条楼中楼回复、举报理由弹窗（3 人举报进审核队列）。
 */
import { Button, Divider, Empty, Input, Modal, Radio, Space, Typography, App as AntApp } from 'antd';
import {
  ArrowLeftOutlined, EyeOutlined, FlagOutlined, LikeFilled, LikeOutlined,
  StarFilled, StarOutlined,
} from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { SoftTag } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import '../../theme/v2/template.css';

export default function PostDetailV2() {
  const { id } = useParams();
  const { db, me, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();
  const [liked, setLiked] = useState(false);
  const [fav, setFav] = useState(false);
  const [reply, setReply] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('广告');

  const p = db.posts.find((x) => x.id === id);

  const comments = p ? db.comments.filter((c) => c.post_id === p.id) : [];
  const topComments = comments.filter((c) => !c.parent_id);

  if (!p) {
    return (
      <div>
        <div className="wb2-empty">
          <div className="ic">🔍</div>
          <div className="t">帖子不存在或已被删除</div>
          <div className="d">可能已被作者撤回，或经审核后下架</div>
          <Link to="/community"><Button type="primary" style={{ marginTop: 12 }}>返回社区</Button></Link>
        </div>
      </div>
    );
  }

  const toggleLike = () => {
    setLiked(!liked);
    setDb((prev) => ({
      ...prev,
      posts: prev.posts.map((x) => (x.id === p.id ? { ...x, like_count: x.like_count + (liked ? -1 : 1) } : x)),
    }));
  };

  const addComment = () => {
    if (reply.trim().length < 2) { message.warning('评论内容至少 2 字'); return; }
    setDb((prev) => ({
      ...prev,
      comments: [...prev.comments, {
        id: `C${Date.now()}`, post_id: p.id, union_id: me.union_id, author_name: me.name,
        content: reply, anonymous: false, created_at: DEMO_TODAY + ' 12:00',
      }],
      posts: prev.posts.map((x) => (x.id === p.id ? { ...x, comment_count: x.comment_count + 1 } : x)),
    }));
    message.success('评论已发布');
    setReply('');
  };

  const report = () => {
    /**
     * V8.4-10.07：举报此前只写日志 + 弹「已提交」，承诺的「3 人自动进入审核队列」与
     * 「处理结果通知」两件事都没发生过。这里补上计数与自动入队。
     * 至于通知举报人 —— 举报是匿名的、库里不存举报人身份，技术上无法定向通知，
     * 因此页面文案同步改成「管理员处理后会通知作者（匿名举报不单独通知举报人）」。
     */
    modal.confirm({
      title: '举报该内容',
      content: `举报理由：${reason}。同一帖被 3 人举报将自动进入审核队列；管理员处理后会通知作者（举报为匿名机制，不会单独通知举报人）。`,
      onOk: () => {
        setDb((prev) => {
          const t = prev.posts.find((x) => x.id === p.id);
          if (!t) return prev;
          const next = (t.report_count ?? 0) + 1;
          return {
            ...prev,
            posts: prev.posts.map((x) => (x.id === p.id
              ? { ...x, report_count: next, status: next >= 3 ? '审核中' as const : x.status }
              : x)),
          };
        });
        log('举报帖子', p.title, `理由：${reason}（已累加举报计数）`);
        message.success('举报已提交，感谢维护社区氛围');
        setReportOpen(false);
      },
    });
  };

  return (
    <div>
      <Link to="/community" className="wb2-fhint" style={{ display: 'inline-block', marginBottom: 4 }}>
        <ArrowLeftOutlined /> 返回社区
      </Link>

      <section className="wb2-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--wb-space-6) var(--wb-space-7)', background: 'var(--wb-surface-brand)', borderBottom: '1px solid var(--wb-border)' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {p.pinned && <SoftTag text="置顶" tone="red" />}
            {p.featured && <SoftTag text="精华" tone="primary" />}
            <SoftTag text={p.board_name} tone="gray" />
            {p.status === '审核中' && <SoftTag text="审核中" tone="gold" />}
          </div>
          <div className="wb2-ph-t" style={{ fontSize: 'var(--wb-fs-h2)', marginBottom: 12 }}>{p.title}</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)' }}>
            <div className={`wb2-av${p.anonymous ? ' mute' : ''}`} style={{ width: 26, height: 26, fontSize: 12 }}>
              {p.anonymous ? '匿' : p.author_name.slice(0, 1)}
            </div>
            <span style={{ fontWeight: 600, color: 'var(--wb-ink-1)' }}>{p.anonymous ? p.anon_no : p.author_name}</span>
            <span>{p.created_at}</span>
            <span><EyeOutlined /> {p.view_count}</span>
          </div>
        </div>

        <div style={{ padding: 'var(--wb-space-6) var(--wb-space-7)' }}>
          <Typography.Paragraph style={{ fontSize: 'var(--wb-fs-body)', lineHeight: 1.85, whiteSpace: 'pre-wrap', color: 'var(--wb-ink-1)', marginBottom: 0 }}>
            {p.content}
          </Typography.Paragraph>
          {p.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {p.tags.map((t) => <span key={t} className="wb2-chip" style={{ cursor: 'default' }}>#{t}</span>)}
            </div>
          )}

          <Divider style={{ margin: 'var(--wb-space-5) 0' }} />
          <Space wrap>
            <Button
              icon={liked ? <LikeFilled /> : <LikeOutlined />}
              type={liked ? 'primary' : 'default'}
              onClick={toggleLike}
            >{liked ? '已赞' : '点赞'} <span>{p.like_count}</span></Button>
            <Button
              icon={fav ? <StarFilled style={{ color: 'var(--wb-warning)' }} /> : <StarOutlined />}
              onClick={() => { setFav(!fav); message.success(fav ? '已取消收藏' : '已加入收藏夹'); }}
            >{fav ? '已收藏' : '收藏'}</Button>
            <Button icon={<FlagOutlined />} onClick={() => setReportOpen(true)}>举报</Button>
          </Space>
        </div>
      </section>

      <section className="wb2-card">
        <div className="wb2-sechd"><div className="t">评论 <span className="s">{comments.length}</span></div></div>
        <Space.Compact style={{ width: '100%', marginBottom: 'var(--wb-space-5)' }}>
          <Input placeholder="说点什么…（≤500 字）" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={500} />
          <Button type="primary" onClick={addComment}>发布</Button>
        </Space.Compact>
        {topComments.length === 0 ? (
          <Empty description="还没有评论" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="wb2-list">
            {topComments.map((c) => {
              const child = comments.find((x) => x.parent_id === c.id);
              return (
                <div key={c.id} className="wb2-li" style={{ alignItems: 'flex-start', gap: 'var(--wb-space-4)' }}>
                  <div className="wb2-av">{c.author_name.slice(0, 1)}</div>
                  <div className="wb2-li-m">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 600, color: 'var(--wb-ink-1)' }}>{c.author_name}</span>
                      <span style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)' }}>{c.created_at}</span>
                    </div>
                    <div className="wb2-li-s" style={{ marginTop: 4 }}>{c.content}</div>
                    {child && (
                      <div className="wb2-quote" style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                          <b style={{ fontSize: 'var(--wb-fs-caption)' }}>{child.author_name}</b>
                          <span style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)' }}>{child.created_at}</span>
                        </div>
                        <div style={{ fontSize: 'var(--wb-fs-label)', marginTop: 4 }}>{child.content}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal open={reportOpen} title="举报内容" onCancel={() => setReportOpen(false)} onOk={report} okText="提交举报">
        <Radio.Group
          value={reason} onChange={(e) => setReason(e.target.value)}
          options={['广告', '人身攻击', '涉密', '不实信息', '其他'].map((v) => ({ label: v, value: v }))}
        />
        <div className="wb2-fhint" style={{ marginTop: 8 }}>
          同一帖被 3 人举报将自动进入审核队列；管理员处理后会通知作者（举报为匿名机制，不会单独通知举报人）。
        </div>
      </Modal>
    </div>
  );
}
