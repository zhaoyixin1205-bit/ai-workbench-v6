import { Button, Card, Col, Row, Space, Typography, Steps, List, Avatar, App as AntApp } from 'antd';
import {
  CopyOutlined, ArrowLeftOutlined, CheckCircleOutlined, ThunderboltOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { TrackTag, SoftTag } from '@/components/ui';
import { SkillCard, AttachCard } from '@/components/ResourceCards';

export default function CaseDetail() {
  const { id } = useParams();
  const { db, me, flags } = useStore();
  const nav = useNavigate();
  const { message } = AntApp.useApp();
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);

  const c = db.cases.find((x) => x.id === id);
  if (!c) return <Card><Typography.Text type="danger">案例不存在或已下线</Typography.Text></Card>;

  /**
   * V4.0 CR-03：相似推荐按「标签重合度」排序 —— 同标签数 ≥2 优先，其次同部门；
   * 不足 3 条时用「热门（浏览量）」兜底，不出现空推荐位。
   */
  const tagOverlap = (x: typeof c) => x.tags.filter((t) => c.tags.includes(t)).length;
  const similar = (() => {
    const pool = db.cases.filter((x) => x.id !== c.id);
    const byTag = pool.filter((x) => tagOverlap(x) >= 2).sort((a, b) => tagOverlap(b) - tagOverlap(a) || b.view_count - a.view_count);
    const authorDept = db.users.find((u) => u.union_id === c.author_union_id)?.dept_names[0];
    const byDept = authorDept
      ? pool.filter((x) => !byTag.includes(x) && db.users.find((u) => u.union_id === x.author_union_id)?.dept_names[0] === authorDept)
        .sort((a, b) => b.view_count - a.view_count)
      : [];
    const hot = [...pool].sort((a, b) => b.view_count - a.view_count);
    const picked = [...byTag, ...byDept, ...hot];
    return [...new Map(picked.map((x) => [x.id, x])).values()].slice(0, 3);
  })();
  const comments = db.comments.filter((x) => x.post_id === 'PT01').slice(0, 3);

  const copy = () => {
    navigator.clipboard?.writeText(c.prompt);
    setCopied(true);
    message.success('提示词已复制，可直接粘贴到 WorkBuddy');
  };

  /* ---- V4.1：可直接安装的 Skill + 补充附件（开关关闭 ≡ V4.0，区块整体不渲染） ---- */
  const skillOn = flags.caseSkillPackage !== false;
  const attachOn = flags.caseAttachment !== false;
  const skills = skillOn ? (c.skill_packages ?? []) : [];
  const atts = attachOn ? (c.attachments ?? []) : [];
  /** 步骤编号：Skill 区块占位后，后面的编号顺延 */
  const CIRC = ['①', '②', '③', '④', '⑤'];
  const iOut = skills.length > 0 ? 3 : 2;
  const iAcc = skills.length > 0 ? 4 : 3;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Link to="/cases" style={{ color: COLOR.textSub, fontSize: 13, fontWeight: 500 }}>
        <ArrowLeftOutlined /> 返回案例与选题
      </Link>

      <Card styles={{ body: { padding: 0 } }}>
        {/* 案例头部：柔和渐变带，突出主信息 */}
        <div style={{ padding: '22px 24px', background: GRADIENT.subtle, borderBottom: `1px solid ${COLOR.borderLight}` }}>
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Space size={14} align="start">
                <div style={{
                  width: 56, height: 56, borderRadius: 16, background: '#fff', fontSize: 30,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: SHADOW.card, flexShrink: 0,
                }}>{c.cover}</div>
                <div>
                  <Typography.Title level={4} style={{ margin: 0, fontSize: 20 }}>{c.title}</Typography.Title>
                  <Space size={6} style={{ marginTop: 8 }} wrap>
                    <TrackTag track={c.track} />
                    <SoftTag text={`建议耗时 ${c.duration}`} tone="gray" />
                    {/* V4.1：有 Skill 包 / 附件时给可见标记，让人在列表之外也能一眼看出「这个能直接装」 */}
                    {skills.length > 0 && <SoftTag text={`可直接装 · ${skills.length} 个 Skill`} tone="primary" />}
                    {atts.length > 0 && <SoftTag text={`${atts.length} 个附件`} tone="blue" />}
                    {c.tags.map((t) => <SoftTag key={t} text={`#${t}`} tone="gray" />)}
                  </Space>
                </div>
              </Space>
            </Col>
            <Col>
              <Space>
                <Button
                  icon={liked ? <CheckCircleOutlined /> : <ThunderboltOutlined />}
                  onClick={() => { setLiked(!liked); message.success(liked ? '已取消点赞' : '已点赞'); }}
                  style={liked ? { borderColor: COLOR.primary, color: COLOR.primary } : undefined}
                >
                  {liked ? '已赞' : '点赞'} {c.like_count + (liked ? 1 : 0)}
                </Button>
                <Button type="primary" onClick={() => nav(`/work/submit/AT1?case=${c.id}`)}>我要做这个</Button>
              </Space>
            </Col>
          </Row>
        </div>

        <div style={{ padding: 24 }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>痛点</Typography.Title>
          <Typography.Paragraph style={{ color: COLOR.textSub, marginBottom: 20 }}>{c.pain_point}</Typography.Paragraph>

          <Typography.Title level={5}>① 输入</Typography.Title>
          <div style={{
            background: '#FAFBFC', border: '1px solid #F0F1F4', borderRadius: 12,
            padding: '12px 14px', fontSize: 13, color: COLOR.text, lineHeight: 1.7,
          }}>{c.input}</div>

          <Typography.Title level={5} style={{ marginTop: 20 }}>
            ② 可直接抄的提示词
            <Button type="link" icon={<CopyOutlined />} onClick={copy} style={{ marginLeft: 8 }}>
              {copied ? '已复制' : '一键复制'}
            </Button>
          </Typography.Title>
          <div style={{
            background: COLOR.primaryLight, border: '1px solid #FFD9C7', borderRadius: 12,
            padding: '14px 16px', whiteSpace: 'pre-wrap',
            fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
            fontSize: 13, lineHeight: 1.75, color: '#8A4B2A',
          }}>{c.prompt}</div>

          {/* V4.1 新增：可直接安装的 Skill —— 抄提示词之外，给一条「装上就能跑」的路 */}
          {skills.length > 0 && (
            <>
              <Typography.Title level={5} style={{ marginTop: 20 }}>
                ③ 可直接安装的 Skill
                <span style={{ fontSize: 12, fontWeight: 400, color: COLOR.textMuted, marginLeft: 8 }}>
                  不想从零写提示词？装完直接跑
                </span>
              </Typography.Title>
              <Row gutter={[12, 12]}>
                {skills.map((s) => (
                  <Col xs={24} md={12} key={s.id}>
                    <SkillCard item={s} onAct={(txt) => message.success(txt)} />
                  </Col>
                ))}
              </Row>
            </>
          )}

          <Typography.Title level={5} style={{ marginTop: 20 }}>{CIRC[iOut]} 产出物</Typography.Title>
          <Typography.Paragraph style={{ color: COLOR.textSub }}>{c.output}</Typography.Paragraph>

          <Typography.Title level={5} style={{ marginTop: 20 }}>
            {CIRC[iAcc]} 验收标准（3 条全过才算合格）
          </Typography.Title>
          <Steps
            direction="vertical"
            size="small"
            current={-1}
            items={c.acceptance.map((a, i) => ({ title: `标准 ${i + 1}`, description: a }))}
          />

          {/* V4.1 新增：补充信息 / 附件 —— 非必填，挂在流程之后，不占步骤编号 */}
          {atts.length > 0 && (
            <>
              <Typography.Title level={5} style={{ marginTop: 24 }}>
                补充信息 / 附件
                <span style={{ fontSize: 12, fontWeight: 400, color: COLOR.textMuted, marginLeft: 8 }}>
                  选填，作者觉得有用的就挂上来
                </span>
              </Typography.Title>
              <Row gutter={[12, 12]}>
                {atts.map((a) => (
                  <Col xs={24} md={12} key={a.id}>
                    <AttachCard item={a} onAct={(txt) => message.success(txt)} />
                  </Col>
                ))}
              </Row>
            </>
          )}
        </div>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card title="实名评论（钉钉身份）" styles={{ body: { paddingTop: 8 } }}>
            <List
              dataSource={comments}
              locale={{ emptyText: '暂无评论，来说两句' }}
              renderItem={(cm) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar style={{ background: GRADIENT.primary, fontWeight: 700 }}>{cm.author_name.slice(0, 1)}</Avatar>}
                    title={<span style={{ fontWeight: 600 }}>{cm.author_name}</span>}
                    description={<span style={{ color: COLOR.textSub }}>{cm.content}</span>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="相似案例推荐" styles={{ body: { paddingTop: 8 } }}>
            {similar.map((s, i) => (
              <Link key={s.id} to={`/cases/${s.id}`}>
                <div
                  style={{
                    padding: '10px 8px', margin: '0 -8px', borderRadius: 10,
                    borderBottom: i === similar.length - 1 ? 'none' : '1px dashed #EFF0F3',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = COLOR.primaryLight; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</span>
                    <ArrowRightOutlined style={{ fontSize: 11, color: COLOR.textMuted, flexShrink: 0 }} />
                  </div>
                  <div style={{ fontSize: 12, color: COLOR.textSub, marginTop: 4 }}>{s.track} · {s.level} · {s.duration}</div>
                </div>
              </Link>
            ))}
          </Card>
          <div className="wb-card" style={{ marginTop: 12, background: '#FAFBFC', padding: 14 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              当前身份：{me.name}（{me.dept_names[0]}）· 浏览与复制行为计入个人活跃与案例热度
            </Typography.Text>
          </div>
        </Col>
      </Row>
    </Space>
  );
}
