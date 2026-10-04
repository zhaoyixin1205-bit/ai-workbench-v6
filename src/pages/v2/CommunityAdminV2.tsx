import { Button, Input, Select, Switch, Table, Tabs, App as AntApp } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme/v2';
import { ScopeText } from '@/components/ScopePicker';
import type { Post } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { Dialog, DialogField, useConfirm } from '@/components/v2/Dialog';
import '../../theme/v2/template.css';

/**
 * 社区管理 v2（P3-5 后台域）
 *
 * 相对 v1 的纯视觉变化：
 *   ① `Card > Tabs` → `.wb2-tabs`，五个 Tab 面板共用一套卡片容器
 *   ② 审核队列由 AntD `List`（自带 24px 上下 padding + 分割线）→ `.wb2-list` 细线行
 *      （后台审核是高频、逐条扫的场景，行高与表格对齐更省眼）
 *   ③ 顶部 Alert → `.wb2-alert`
 *   ④ 状态 Tag（green/gold/default 三套色）→ `.wb2-tag` 四档语义（正常 ok / 审核中 wa / 隐藏·删除 id）
 *   ⑤ 敏感词库文本域、TOP20 列表 → 统一卡片 + 令牌色
 *   ⑥ 追溯弹窗 → `Dialog`（含双人授权说明走 `sub`，正文只留理由框）
 *   ⑦ 删除二次确认 → `useConfirm()`（danger：禁点遮罩 + 默认聚焦取消）
 *
 * 业务：审核三动作、置顶/加精/移动板块/软删、板块启停、敏感词保存、TOP20 导出——
 * 全部沿用 v1 的 handler 与写入字段，未增删任何动作。
 */

export default function CommunityAdminV2() {
  const { db, setDb, log, flags } = useStore();
  const { message } = AntApp.useApp();
  const confirm = useConfirm();
  /** V4.0 CR-05：管理员侧交互对齐云社区（移动板块 / 删除 / 可见范围回显） */
  const v2 = flags.communityV2Layout !== false;
  const [words, setWords] = useState('涉密\n广告\n人身攻击\n外链');
  const [traceTarget, setTraceTarget] = useState<string | null>(null);
  const [traceReason, setTraceReason] = useState('');

  const auditQueue = db.posts.filter((p) => p.status === '审核中' || p.report_count >= 3);

  /** 状态 → 四档语义（v1 用了 green/gold/default 三套，色相不统一） */
  const statusTone = (s: string) => (s === '正常' ? 'ok' : s === '审核中' ? 'wa' : 'id');

  const handle = (id: string, action: '通过' | '隐藏' | '删除', reason?: string) => {
    setDb((p) => ({
      ...p,
      posts: p.posts.map((x) => (x.id === id ? { ...x, status: action === '通过' ? '正常' : action === '隐藏' ? '已隐藏' : '已删除' } : x)),
    }));
    log(`社区内容${action}`, id, reason ?? '');
    message.success(`已${action}${reason ? '：' + reason : ''}`);
  };

  const trace = () => {
    if (traceReason.trim().length < 10) { message.error('追溯理由至少 10 字（需合规理由）'); return; }
    const p = db.posts.find((x) => x.id === traceTarget)!;
    confirm({
      title: '匿名追溯需双人授权',
      content: `追溯对象：${p.anon_no}（帖子：${p.title}）。追溯需组织者发起 + 系统管理员复核（双人授权），全程写审计日志，被追溯记录对当事人可见。`,
      onOk: () => {
        log('匿名追溯', p.anon_no ?? p.title, `理由：${traceReason}（双人授权已完成）`);
        message.success(`追溯结果：${p.author_name}（真实 unionId ${p.union_id}），已写审计日志`);
        setTraceTarget(null); setTraceReason('');
      },
    });
  };

  const askDelete = (r: Post) => {
    confirm({
      title: '删除该帖？',
      content: 'V3.0 §6.11.6：删除为软删除（保留数据与审计留痕），前台立即不可见。',
      danger: true,
      okText: '确认删除',
      onOk: () => {
        setDb((p) => ({ ...p, posts: p.posts.map((x) => (x.id === r.id ? { ...x, status: '已删除' } : x)) }));
        log('删除帖子', r.title, '软删除（status=已删除，保留留痕）');
        message.success('已删除（软删除）');
      },
    });
  };

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <h2 className="wb2-ph-t">社区管理</h2>
          <div className="wb2-ph-d">发布 → 机审 → 人工审核队列，全程留痕</div>
        </div>
      </div>

      <div className="wb2-alert">
        <div className="bd">
          <div className="t">发布 → 机审（敏感词 / 涉密 / 外链）→ 命中进入人工审核队列（暂不对外可见）；未命中先发后审，立即对外可见</div>
          <div className="d">被举报 3 次自动进入队列；所有审核与处理动作写审计日志，保留 ≥12 个月。</div>
        </div>
      </div>

      <div className="wb2-tabs">
        <Tabs
          items={[
            {
              key: 'audit', label: `审核队列（${auditQueue.length}）`,
              children: auditQueue.length === 0 ? (
                <div className="wb2-empty">
                  <div className="ic">◇</div>
                  <div className="t">没有待处理内容</div>
                </div>
              ) : (
                <div className="wb2-list">
                  {auditQueue.map((p) => (
                    <div className="wb2-li" key={p.id} style={{ alignItems: 'flex-start' }}>
                      <div className="wb2-li-m">
                        <div className="wb2-li-t">
                          {p.title}
                          <span className="wb2-tag id"><i className="d" />{p.board_name}</span>
                          {p.report_count >= 3 && <span className="wb2-tag er"><i className="d" />被举报 {p.report_count} 次</span>}
                        </div>
                        <div className="wb2-li-s">
                          <span>{p.anonymous ? `匿名（${p.anon_no}）` : p.author_name}</span>
                          <span>{p.status}</span>
                          <span>{p.created_at}</span>
                        </div>
                        <div style={{ fontSize: 'var(--wb-fs-label)', color: COLOR.ink2, marginTop: 'var(--wb-space-2)', lineHeight: 1.65 }}>
                          {p.content.slice(0, 80)}…
                        </div>
                      </div>
                      <div className="wb2-li-r" style={{ flexWrap: 'wrap' }}>
                        <Button size="small" type="primary" onClick={() => handle(p.id, '通过')}>通过</Button>
                        <Button size="small" onClick={() => handle(p.id, '隐藏', '命中敏感词')}>隐藏</Button>
                        <Button size="small" danger onClick={() => handle(p.id, '删除', '违规内容')}>删除</Button>
                        {p.anonymous && <Button size="small" type="link" onClick={() => setTraceTarget(p.id)}>实名追溯</Button>}
                      </div>
                    </div>
                  ))}
                </div>
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
                      title: '作者',
                      render: (_, r) => r.anonymous ? <span className="wb2-tag id"><i className="d" />匿名 {r.anon_no}</span> : r.author_name,
                    },
                    { title: '点赞', dataIndex: 'like_count', width: 70, render: (v: number) => <span className="num">{v}</span> },
                    { title: '评论', dataIndex: 'comment_count', width: 70, render: (v: number) => <span className="num">{v}</span> },
                    {
                      title: '状态', dataIndex: 'status',
                      render: (v: string) => <span className={`wb2-tag ${statusTone(v)}`}><i className="d" />{v}</span>,
                    },
                    {
                      title: '操作', width: 260,
                      render: (_, r) => (
                        <div style={{ display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
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
                            <Button size="small" type="link" danger onClick={() => askDelete(r)}>删除</Button>
                          )}
                        </div>
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
                    { title: '排序', dataIndex: 'sort', width: 70, render: (v: number) => <span className="num">{v}</span> },
                    {
                      title: '发帖权限', dataIndex: 'only_organizer_post', width: 130,
                      render: (v: boolean) => v
                        ? <span className="wb2-tag wa"><i className="d" />仅组织者</span>
                        : <span className="wb2-tag id"><i className="d" />全员可发</span>,
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
                <div className="wb2-card wb2-card-pad">
                  <div className="wb2-note" style={{ marginBottom: 'var(--wb-space-4)' }}>
                    敏感词库由系统管理员维护，支持自定义与导入；命中词的内容自动进入人工审核队列，不自动通过。
                  </div>
                  <Input.TextArea rows={8} value={words} onChange={(e) => setWords(e.target.value)} />
                  <div style={{ display: 'flex', gap: 'var(--wb-space-3)', marginTop: 'var(--wb-space-4)' }}>
                    <Button type="primary" onClick={() => { log('更新敏感词库', `${words.split('\n').filter(Boolean).length} 个词`, '机审规则更新'); message.success('敏感词库已更新'); }}>保存</Button>
                    <Button onClick={() => message.info('支持从 CSV 导入敏感词')}>导入</Button>
                  </div>
                </div>
              ),
            },
            {
              key: 'top', label: '高频问题 TOP20',
              children: (
                <div className="wb2-card wb2-card-pad">
                  <div className="wb2-note" style={{ marginBottom: 'var(--wb-space-4)' }}>
                    组织者可导出「高频问题 TOP20」，作为场景卡与坐诊主题的输入。
                  </div>
                  {db.posts.filter((p) => p.board_name === '问题求助').map((p, i) => (
                    <div className="wb2-setrow" key={p.id}>
                      <div className="nm">{i + 1}. {p.title}</div>
                      <div className="ct">
                        <span className="num" style={{ fontSize: 'var(--wb-fs-label)', color: COLOR.primary }}>
                          热度 {p.like_count + p.comment_count * 3}
                        </span>
                      </div>
                    </div>
                  ))}
                  <Button style={{ marginTop: 'var(--wb-space-4)' }} onClick={() => { log('导出高频问题 TOP20', '社区', '作为场景卡与坐诊主题输入'); message.success('已导出'); }}>导出 TOP20</Button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <Dialog
        open={!!traceTarget} title="匿名实名追溯（双人授权）"
        sub="追溯不改变前端展示（仍显示匿名）；被追溯记录对当事人可见。"
        okText="提交追溯申请" okDisabled={traceReason.trim().length < 10}
        onCancel={() => setTraceTarget(null)}
        onOk={trace}
      >
        <DialogField label="合规理由（≥10 字），需组织者发起 + 系统管理员复核" hint={`演示日期 ${DEMO_TODAY}`}>
          <Input.TextArea rows={4} value={traceReason} onChange={(e) => setTraceReason(e.target.value)}
            placeholder="合规理由（≥10 字），需组织者发起 + 系统管理员复核" maxLength={200} showCount />
        </DialogField>
      </Dialog>
    </div>
  );
}
