import { Alert, Button, Card, Col, Empty, Input, List, Modal, Row, Select, Space, Switch, Table, Tabs, Tag, Typography, App as AntApp, message as staticMsg } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { ScopeText } from '@/components/ScopePicker';
import type { Post } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';

export default function CommunityAdmin() {
  const { db, setDb, log, flags } = useStore();
  const { message, modal } = AntApp.useApp();
  /** V4.0 CR-05：管理员侧交互对齐云社区（移动板块 / 删除 / 可见范围回显） */
  const v2 = flags.communityV2Layout !== false;
  const [words, setWords] = useState('涉密\n广告\n人身攻击\n外链');
  const [traceTarget, setTraceTarget] = useState<string | null>(null);
  const [traceReason, setTraceReason] = useState('');

  const auditQueue = db.posts.filter((p) => p.status === '审核中' || p.report_count >= 3);

  /**
   * V8.4-10.07：处理结果必须通知到作者 —— 前台举报弹窗早就写了「处理结果将通知作者」，
   * 但后台处理时一条消息都没发过。举报人身份不入库（匿名机制），因此只通知作者。
   */
  const handle = (id: string, action: '通过' | '隐藏' | '删除', reason?: string) => {
    const target = db.posts.find((x) => x.id === id);
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    setDb((p) => ({
      ...p,
      posts: p.posts.map((x) => (x.id === id ? { ...x, status: action === '通过' ? '正常' : action === '隐藏' ? '已隐藏' : '已删除' } : x)),
      messages: target ? [{
        id: `MSG-POST-${Date.now()}`, union_id: target.union_id, type: '社区内容处理',
        title: `你的帖子已被${action}`,
        content: `《${target.title}》经社区审核，处理结果：${action}${reason ? `。原因：${reason}` : ''}。如有异议可在社区内申诉。`,
        channel: '站内' as const, status: '未读' as const, sent_at: at,
      }, ...p.messages] : p.messages,
    }));
    log(`社区内容${action}`, target?.title ?? id, `${reason ?? ''}${target ? `（已通知作者 ${target.author_name}）` : ''}`);
    message.success(`已${action}${reason ? '：' + reason : ''}${target ? '，已通知作者' : ''}`);
  };

  const trace = () => {
    if (traceReason.trim().length < 10) { message.error('追溯理由至少 10 字（需合规理由）'); return; }
    const p = db.posts.find((x) => x.id === traceTarget)!;
    modal.confirm({
      title: '匿名追溯需双人授权',
      content: `追溯对象：${p.anon_no}（帖子：${p.title}）。追溯需组织者发起 + 系统管理员复核（双人授权），全程写审计日志，被追溯记录对当事人可见。`,
      onOk: () => {
        log('匿名追溯', p.anon_no ?? p.title, `理由：${traceReason}（双人授权已完成）`);
        message.success(`追溯结果：${p.author_name}（真实 unionId ${p.union_id}），已写审计日志`);
        setTraceTarget(null); setTraceReason('');
      },
    });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="社区管理" desc="发布 → 机审 → 人工审核队列，全程留痕" />
      <Alert type="info" showIcon
        message="发布 → 机审（敏感词 / 涉密 / 外链）→ 命中进入人工审核队列（暂不对外可见）；未命中先发后审，立即对外可见"
        description="被举报 3 次自动进入队列；所有审核与处理动作写审计日志，保留 ≥12 个月。" />

      <Card>
        <Tabs
          items={[
            {
              key: 'audit', label: `审核队列（${auditQueue.length}）`,
              children: auditQueue.length === 0 ? <Empty description="没有待处理内容" /> : (
                <List
                  dataSource={auditQueue}
                  renderItem={(p) => (
                    <List.Item
                      actions={[
                        <Button key="a" size="small" type="primary" onClick={() => handle(p.id, '通过')}>通过</Button>,
                        <Button key="h" size="small" onClick={() => handle(p.id, '隐藏', '命中敏感词')}>隐藏</Button>,
                        <Button key="d" size="small" danger onClick={() => handle(p.id, '删除', '违规内容')}>删除</Button>,
                        p.anonymous ? <Button key="t" size="small" type="link" onClick={() => setTraceTarget(p.id)}>实名追溯</Button> : null,
                      ]}
                    >
                      <List.Item.Meta
                        title={<Space>{p.title}<Tag>{p.board_name}</Tag>{p.report_count >= 3 && <Tag color="red">被举报 {p.report_count} 次</Tag>}</Space>}
                        description={<span style={{ fontSize: 13 }}>
                          {p.anonymous ? `匿名（${p.anon_no}）` : p.author_name} · {p.status} · {p.created_at}
                          <div style={{ marginTop: 4 }}>{p.content.slice(0, 80)}…</div>
                        </span>}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'posts', label: `帖子管理（${db.posts.length}）`,
              children: (
                <Table
                  size="small" rowKey="id" pagination={{ pageSize: 8 }} dataSource={db.posts}
                  columns={[
                    { title: '标题', dataIndex: 'title', ellipsis: true },
                    { title: '板块', dataIndex: 'board_name', width: 90 },
                    ...(v2 ? [{
                      title: '可见范围', width: 130, key: 'vs',
                      render: (_v: unknown, r: Post) => <ScopeText value={r.visible_subjects} />,
                    }] : []),
                    {
                      title: '作者', render: (_, r) => r.anonymous ? <Tag>匿名 {r.anon_no}</Tag> : r.author_name,
                    },
                    { title: '点赞', dataIndex: 'like_count', width: 70, render: (v: number) => <span className="num">{v}</span> },
                    { title: '评论', dataIndex: 'comment_count', width: 70, render: (v: number) => <span className="num">{v}</span> },
                    {
                      title: '状态', dataIndex: 'status',
                      render: (v: string) => <Tag color={v === '正常' ? 'green' : v === '审核中' ? 'gold' : 'default'}>{v}</Tag>,
                    },
                    {
                      title: '操作', width: 240,
                      render: (_, r) => (
                        <Space size={4} wrap>
                          <Button size="small" type="link" onClick={() => {
                            setDb((p) => ({ ...p, posts: p.posts.map((x) => (x.id === r.id ? { ...x, pinned: !x.pinned } : x)) }));
                            message.success(r.pinned ? '已取消置顶' : '已置顶（置顶最多 3 条）');
                          }}>{r.pinned ? '取消置顶' : '置顶'}</Button>
                          <Button size="small" type="link" onClick={() => {
                            setDb((p) => ({ ...p, posts: p.posts.map((x) => (x.id === r.id ? { ...x, featured: !x.featured } : x)) }));
                            message.success(r.featured ? '已取消精华' : '已加精（进入「精华」筛选）');
                          }}>{r.featured ? '取消精华' : '加精'}</Button>
                          {/* V4.0 CR-05：云社区管理员侧——移动板块 / 删除（软删） */}
                          {v2 && (
                            <Select
                              size="small" value={r.board_name} style={{ width: 120 }}
                              options={db.boards.filter((b) => b.status === '启用').map((b) => ({ value: b.name, label: b.name }))}
                              onChange={(nv) => {
                                const target = db.boards.find((b) => b.name === nv);
                                setDb((p) => ({ ...p, posts: p.posts.map((x) => (x.id === r.id ? { ...x, board_id: target?.id ?? x.board_id, board_name: nv } : x)) }));
                                log('移动帖子板块', r.title, `${r.board_name} → ${nv}`);
                                message.success(`已移动到「${nv}」`);
                              }}
                            />
                          )}
                          {v2 && (
                            <Button size="small" type="link" danger onClick={() => {
                              modal.confirm({
                                title: '删除该帖？',
                                content: 'V3.0 §6.11.6：删除为软删除（保留数据与审计留痕），前台立即不可见。',
                                okButtonProps: { danger: true },
                                onOk: () => {
                                  setDb((p) => ({ ...p, posts: p.posts.map((x) => (x.id === r.id ? { ...x, status: '已删除' } : x)) }));
                                  log('删除帖子', r.title, '软删除（status=已删除，保留留痕）');
                                  message.success('已删除（软删除）');
                                },
                              });
                            }}>删除</Button>
                          )}
                        </Space>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'boards', label: '板块配置',
              children: (
                <Table
                  size="small" rowKey="id" pagination={false} dataSource={db.boards}
                  columns={[
                    { title: '图标', dataIndex: 'icon', width: 60 },
                    { title: '名称', dataIndex: 'name' },
                    { title: '简介', dataIndex: 'intro' },
                    { title: '排序', dataIndex: 'sort', width: 70 },
                    {
                      title: '发帖权限', dataIndex: 'only_organizer_post', width: 130,
                      render: (v: boolean) => v ? <Tag color="orange">仅组织者</Tag> : <Tag>全员可发</Tag>,
                    },
                    {
                      title: '状态', dataIndex: 'status',
                      render: (v: string, r) => (
                        <Switch size="small" defaultChecked={v === '启用'}
                          onChange={(c) => {
                            setDb((p) => ({ ...p, boards: p.boards.map((x) => (x.id === r.id ? { ...x, status: c ? '启用' : '停用' } : x)) }));
                            message.success('板块状态已更新（新增板块不影响既有内容）');
                          }} />
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'words', label: '敏感词库',
              children: (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    敏感词库由系统管理员维护，支持自定义与导入；命中词的内容自动进入人工审核队列，不自动通过。
                  </Typography.Text>
                  <Input.TextArea rows={8} value={words} onChange={(e) => setWords(e.target.value)} />
                  <Space>
                    <Button type="primary" onClick={() => { log('更新敏感词库', `${words.split('\n').filter(Boolean).length} 个词`, '机审规则更新'); message.success('敏感词库已更新'); }}>保存</Button>
                    <Button onClick={() => message.info('支持从 CSV 导入敏感词')}>导入</Button>
                  </Space>
                </Space>
              ),
            },
            {
              key: 'top', label: '高频问题 TOP20',
              children: (
                <Card size="small">
                  <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                    组织者可导出「高频问题 TOP20」，作为场景卡与坐诊主题的输入。
                  </Typography.Paragraph>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    {db.posts.filter((p) => p.board_name === '问题求助').map((p, i) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>{i + 1}. {p.title}</span>
                        <span className="num" style={{ color: COLOR.primary }}>热度 {p.like_count + p.comment_count * 3}</span>
                      </div>
                    ))}
                  </Space>
                  <Button style={{ marginTop: 12 }} onClick={() => { log('导出高频问题 TOP20', '社区', '作为场景卡与坐诊主题输入'); message.success('已导出'); }}>导出 TOP20</Button>
                </Card>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={!!traceTarget} title="匿名实名追溯（双人授权）" onCancel={() => setTraceTarget(null)} onOk={trace} okText="提交追溯申请">
        <Input.TextArea rows={4} value={traceReason} onChange={(e) => setTraceReason(e.target.value)}
          placeholder="合规理由（≥10 字），需组织者发起 + 系统管理员复核" maxLength={200} showCount />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          追溯不改变前端展示（仍显示匿名）；被追溯记录对当事人可见。演示日期 {DEMO_TODAY}
        </Typography.Text>
      </Modal>
    </Space>
  );
}
