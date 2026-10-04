import { useState } from 'react';
import { Button, Steps, App as AntApp } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined, CopyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '@/store/store';
import { useCaseSimilar } from '@/hooks/useCaseSimilar';
import { SkillCard, AttachCard } from '@/components/ResourceCards';
import { trackVar } from '@/theme/v2/track';
import '../../theme/v2/template.css';

/**
 * 案例详情 v2（P3-3 样板页 ②：详情模板）
 *
 * 相对 v1 的**纯视觉**变化：
 *   ① 头部渐变带 → 页头 + 元信息行（去掉 GRADIENT/SHADOW，改 tokens）
 *   ② 正文分区用无投影卡片 + 12px 圆角，标题层级压到 16/14
 *   ③ 记录不存在从「一行红字」升级为**空态页 + 返回列表**（补上 v1 缺失的反馈）
 *   ④ 提示词代码块删掉裸 hex，改用令牌
 *
 * 业务：相似推荐口径复用 `useCaseSimilar`（与 v1 同源）；Skill / 附件仍走 V4.2 的 `SkillCard` / `AttachCard`。
 */

export default function CaseDetailV2() {
  const { id } = useParams();
  const { me, flags } = useStore();
  const nav = useNavigate();
  const { message } = AntApp.useApp();
  const { c, similar, comments } = useCaseSimilar(id);
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);

  /* 空态必须放在所有 Hooks 之后（React Hooks 规则） */
  if (!c) {
    return (
      <div className="wb2-empty">
        <div className="ic">?</div>
        <div className="t">这条记录不存在或已被删除</div>
        <div className="d">链接可能来自旧版本，管理员删除后无法恢复。</div>
        <Button onClick={() => nav('/cases')}>返回列表</Button>
      </div>
    );
  }

  const skillOn = flags.caseSkillPackage !== false;
  const attachOn = flags.caseAttachment !== false;
  const skills = skillOn ? (c.skill_packages ?? []) : [];
  const atts = attachOn ? (c.attachments ?? []) : [];
  /** 步骤编号：Skill 区块占位后，后面的编号顺延（与 v1 一致） */
  const CIRC = ['①', '②', '③', '④', '⑤'];
  const iOut = skills.length > 0 ? 3 : 2;
  const iAcc = skills.length > 0 ? 4 : 3;

  const copy = () => {
    navigator.clipboard?.writeText(c.prompt);
    setCopied(true);
    message.success('提示词已复制，可直接粘贴到 WorkBuddy');
  };

  return (
    <div>
      <Link to="/cases" style={{ color: 'var(--wb-ink-3)', fontSize: 'var(--wb-fs-label)', fontWeight: 500 }}>
        <ArrowLeftOutlined /> 返回案例与选题
      </Link>

      {/* ---------- 页头 ---------- */}
      <div className="wb2-ph" style={{ marginTop: 'var(--wb-space-4)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="wb2-ph-t">{c.title}</h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'var(--wb-space-3)' }}>
            <span className="wb2-tag"><i className="d" style={{ background: trackVar(c.track) }} />{c.track}</span>
            <span className="wb2-tag">建议耗时 {c.duration}</span>
            {skills.length > 0 && <span className="wb2-tag" style={{ color: 'var(--wb-primary)' }}>可直接装 · {skills.length} 个 Skill</span>}
            {atts.length > 0 && <span className="wb2-tag" style={{ color: 'var(--wb-info)' }}>{atts.length} 个附件</span>}
            {c.tags.map((t) => <span key={t} className="wb2-tag">#{t}</span>)}
          </div>
        </div>
        <div className="wb2-ph-a">
          <Button
            icon={liked ? <CheckCircleOutlined /> : <ThunderboltOutlined />}
            onClick={() => { setLiked(!liked); message.success(liked ? '已取消点赞' : '已点赞'); }}
          >
            {liked ? '已赞' : '点赞'} {c.like_count + (liked ? 1 : 0)}
          </Button>
          <Button type="primary" onClick={() => nav(`/work/submit/AT1?case=${c.id}`)}>我要做这个</Button>
        </div>
      </div>

      <div className="wb2-grid2">
        {/* ---------- 主内容 ---------- */}
        <div>
          <div className="wb2-card wb2-card-pad">
            <div className="wb2-card-t" style={{ marginBottom: 'var(--wb-space-3)' }}>痛点</div>
            <div style={{ fontSize: 'var(--wb-fs-body)', color: 'var(--wb-ink-2)', lineHeight: 1.7 }}>{c.pain_point}</div>
          </div>

          <div className="wb2-card wb2-card-pad" style={{ marginTop: 'var(--wb-space-5)' }}>
            <div className="wb2-card-t">① 输入</div>
            <div style={{
              background: 'var(--wb-surface-sunken)', border: '1px solid var(--wb-border-subtle)',
              borderRadius: 'var(--wb-radius-lg)', padding: 'var(--wb-space-4)',
              fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-1)', lineHeight: 1.7,
            }}>{c.input}</div>

            <div className="wb2-card-t" style={{ marginTop: 'var(--wb-space-6)' }}>
              ② 可直接抄的提示词
              <Button type="link" icon={<CopyOutlined />} onClick={copy} style={{ marginLeft: 8 }}>
                {copied ? '已复制' : '一键复制'}
              </Button>
            </div>
            <div style={{
              background: 'var(--wb-surface-brand)', border: '1px solid var(--wb-primary-subtle)',
              borderRadius: 'var(--wb-radius-lg)', padding: 'var(--wb-space-4)', whiteSpace: 'pre-wrap',
              fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
              fontSize: 'var(--wb-fs-label)', lineHeight: 1.75, color: 'var(--wb-ink-1)',
            }}>{c.prompt}</div>

            {skills.length > 0 && (
              <>
                <div className="wb2-card-t" style={{ marginTop: 'var(--wb-space-6)' }}>
                  ③ 可直接安装的 Skill
                  <span style={{ fontSize: 'var(--wb-fs-label)', fontWeight: 400, color: 'var(--wb-ink-3)', marginLeft: 8 }}>
                    不想从零写提示词？装完直接跑
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--wb-space-4)' }}>
                  {skills.map((s) => <SkillCard key={s.id} item={s} onAct={(txt) => message.success(txt)} />)}
                </div>
              </>
            )}

            <div className="wb2-card-t" style={{ marginTop: 'var(--wb-space-6)' }}>{CIRC[iOut]} 产出物</div>
            <div style={{ fontSize: 'var(--wb-fs-body)', color: 'var(--wb-ink-2)', lineHeight: 1.7 }}>{c.output}</div>

            <div className="wb2-card-t" style={{ marginTop: 'var(--wb-space-6)' }}>
              {CIRC[iAcc]} 验收标准（{c.acceptance.length} 条全过才算合格）
            </div>
            <Steps
              direction="vertical" size="small" current={-1}
              items={c.acceptance.map((a, i) => ({ title: `标准 ${i + 1}`, description: a }))}
            />

            {atts.length > 0 && (
              <>
                <div className="wb2-card-t" style={{ marginTop: 'var(--wb-space-6)' }}>
                  补充信息 / 附件
                  <span style={{ fontSize: 'var(--wb-fs-label)', fontWeight: 400, color: 'var(--wb-ink-3)', marginLeft: 8 }}>
                    选填，作者觉得有用的就挂上来
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--wb-space-4)' }}>
                  {atts.map((a) => <AttachCard key={a.id} item={a} onAct={(txt) => message.success(txt)} />)}
                </div>
              </>
            )}
          </div>

          {/* ---------- 评论 ---------- */}
          <div className="wb2-card wb2-card-pad" style={{ marginTop: 'var(--wb-space-5)' }}>
            <div className="wb2-card-t">实名评论（钉钉身份）</div>
            {comments.length === 0 ? (
              <div style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-3)' }}>暂无评论，来说两句</div>
            ) : comments.map((cm) => (
              <div key={cm.id} style={{ display: 'flex', gap: 'var(--wb-space-4)', padding: 'var(--wb-space-3) 0', borderBottom: '1px solid var(--wb-border-subtle)' }}>
                <span style={{
                  width: 32, height: 32, borderRadius: 'var(--wb-radius-pill)', flex: '0 0 auto',
                  background: 'var(--wb-primary)', color: '#fff', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13,
                }}>{cm.author_name.slice(0, 1)}</span>
                <div>
                  <div style={{ fontSize: 'var(--wb-fs-body)', fontWeight: 600 }}>{cm.author_name}</div>
                  <div style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-2)', marginTop: 2 }}>{cm.content}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------- 侧栏 ---------- */}
        <div>
          <div className="wb2-card wb2-card-pad">
            <div className="wb2-card-t">相似案例推荐</div>
            {similar.map((s, i) => (
              <Link key={s.id} to={`/cases/${s.id}`}>
                <div style={{
                  padding: '10px 8px', margin: '0 -8px', borderRadius: 'var(--wb-radius-md)',
                  borderBottom: i === similar.length - 1 ? 'none' : '1px solid var(--wb-border-subtle)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 'var(--wb-fs-body)', fontWeight: 600, color: 'var(--wb-ink-1)' }}>{s.title}</span>
                    <ArrowRightOutlined style={{ fontSize: 11, color: 'var(--wb-ink-4)', flexShrink: 0 }} />
                  </div>
                  <div style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-3)', marginTop: 4 }}>
                    {s.track} · {s.level} · {s.duration}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="wb2-card" style={{ marginTop: 'var(--wb-space-4)', background: 'var(--wb-surface-sunken)', padding: 'var(--wb-space-4)' }}>
            <div style={{ fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-3)', lineHeight: 1.6 }}>
              当前身份：{me.name}（{me.dept_names[0] ?? '未分配部门'}）· 浏览与复制行为计入个人活跃与案例热度
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
