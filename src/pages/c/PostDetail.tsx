import { Avatar, Button, Card, Divider, Input, List, Space, Typography, App as AntApp, Modal, Radio, Empty } from 'antd';
import { ArrowLeftOutlined, LikeOutlined, LikeFilled, StarOutlined, StarFilled, FlagOutlined, EyeOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT } from '@/theme';
import { SoftTag } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';

export default function PostDetail() {
  const { id } = useParams();
  const { db, me, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();
  const [liked, setLiked] = useState(false);
  const [fav, setFav] = useState(false);
  const [reply, setReply] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('广告');

  const p = db.posts.find((x) => x.id === id);
  if (!p) return <Card>帖子不存在或已被删除</Card>;

  const comments = db.comments.filter((c) => c.post_id === p.id);
  const topComments = comments.filter((c) => !c.parent_id);

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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Link to="/community" style={{ color: COLOR.textSub, fontSize: 13, fontWeight: 500 }}>
        <ArrowLeftOutlined /> 返回社区
      </Link>

      <Card styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '20px 24px', background: GRADIENT.subtle, borderBottom: `1px solid ${COLOR.borderLight}` }}>
          <Space size={6} wrap style={{ marginBottom: 10 }}>
            {p.pinned && <SoftTag text="置顶" tone="red" />}
            {p.featured && <SoftTag text="精华" tone="primary" />}
            <SoftTag text={p.board_name} tone="gray" />
            {p.status === '审核中' && <SoftTag text="审核中" tone="gold" />}
          </Space>
          <Typography.Title level={4} style={{ margin: '0 0 12px', fontSize: 21 }}>{p.title}</Typography.Title>
          <Space size={12} style={{ fontSize: 12, color: COLOR.textSub }}>
            <Avatar size={26} className={p.anonymous ? 'wb-avatar-anon' : undefined} style={p.anonymous ? undefined : { background: GRADIENT.primary, fontWeight: 700, fontSize: 12 }}>
              {p.anonymous ? '匿' : p.author_name.slice(0, 1)}
            </Avatar>
            <span style={{ fontWeight: 600, color: COLOR.text }}>{p.anonymous ? p.anon_no : p.author_name}</span>
            <span>{p.created_at}</span>
            <span><EyeOutlined /> {p.view_count}</span>
          </Space>
        </div>

        <div style={{ padding: 24 }}>
          <Typography.Paragraph style={{ fontSize: 14.5, lineHeight: 1.85, whiteSpace: 'pre-wrap', color: COLOR.text }}>
            {p.content}
          </Typography.Paragraph>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12 }}>
            {p.tags.map((t) => <SoftTag key={t} text={`#${t}`} tone="gray" />)}
          </div>

          <Divider />
          <Space wrap>
            <Button
              icon={liked ? <LikeFilled /> : <LikeOutlined />}
              type={liked ? 'primary' : 'default'}
              onClick={toggleLike}
            >{liked ? '已赞' : '点赞'} <span className="num">{p.like_count}</span></Button>
            <Button
              icon={fav ? <StarFilled style={{ color: '#F59E0B' }} /> : <StarOutlined />}
              onClick={() => { setFav(!fav); message.success(fav ? '已取消收藏' : '已加入收藏夹'); }}
              style={fav ? { borderColor: '#FCD34D' } : undefined}
            >{fav ? '已收藏' : '收藏'}</Button>
            <Button icon={<FlagOutlined />} onClick={() => setReportOpen(true)}>举报</Button>
          </Space>
        </div>
      </Card>

      <Card title={<span>评论（<span className="num">{comments.length}</span>）</span>}>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input placeholder="说点什么…（≤500 字）" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={500} />
          <Button type="primary" onClick={addComment}>发布</Button>
        </Space.Compact>
        {topComments.length === 0 ? <Empty description="还没有评论" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
          <List
            dataSource={topComments}
            renderItem={(c) => {
              const child = comments.find((x) => x.parent_id === c.id);
              return (
                <List.Item style={{ display: 'block' }}>
                  <List.Item.Meta
                    avatar={<Avatar size={32} style={{ background: GRADIENT.primary, fontWeight: 700 }}>{c.author_name.slice(0, 1)}</Avatar>}
                    title={
                      <Space size={8}>
                        <span style={{ fontWeight: 600 }}>{c.author_name}</span>
                        <span style={{ fontSize: 11, color: COLOR.textMuted }}>{c.created_at}</span>
                      </Space>
                    }
                    description={<span style={{ color: COLOR.textSub }}>{c.content}</span>}
                  />
                  {child && (
                    <div style={{
                      marginLeft: 44, marginTop: 8, padding: '10px 12px',
                      background: '#F7F8FA', borderRadius: 12, borderLeft: `3px solid ${COLOR.primarySoft}`,
                    }}>
                      <Space size={8}>
                        <b style={{ fontSize: 12 }}>{child.author_name}</b>
                        <span style={{ fontSize: 11, color: COLOR.textMuted }}>{child.created_at}</span>
                      </Space>
                      <div style={{ fontSize: 13, marginTop: 4, color: COLOR.textSub }}>{child.content}</div>
                    </div>
                  )}
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      <Modal open={reportOpen} title="举报内容" onCancel={() => setReportOpen(false)} onOk={report} okText="提交举报">
        <Radio.Group
          value={reason} onChange={(e) => setReason(e.target.value)}
          options={['广告', '人身攻击', '涉密', '不实信息', '其他'].map((v) => ({ label: v, value: v }))}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: COLOR.textSub }}>
          同一帖被 3 人举报将自动进入审核队列；管理员处理后会通知作者（举报为匿名机制，不会单独通知举报人）。
        </div>
      </Modal>
    </Space>
  );
}
