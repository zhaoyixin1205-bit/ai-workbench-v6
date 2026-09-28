import { Button, Card, Col, Empty, Row, Segmented, Space, Typography, Tabs, Modal, Input, App as AntApp } from 'antd';
import { PlusOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, SoftTag, TrackTag } from '@/components/ui';
import type { Bounty, BountyStatus } from '@/mock/types';

const STATUS_META: Record<BountyStatus, { text: string; color: string }> = {
  MEMBER_DRAFT: { text: '草稿', color: 'default' },
  PENDING_REVIEW: { text: '待审核', color: 'gold' },
  PUBLISHED: { text: '可认领', color: 'orange' },
  REJECTED: { text: '已驳回', color: 'red' },
  CLAIMED: { text: '已认领', color: 'blue' },
  SUBMITTED: { text: '方案已提交', color: 'cyan' },
  APPROVED: { text: '已通过', color: 'green' },
  EXPIRED: { text: '已超期释放', color: 'default' },
};

export default function BountyList() {
  const { db, me, setDb, log } = useStore();
  const nav = useNavigate();
  const { message, modal } = AntApp.useApp();
  const [tab, setTab] = useState('all');
  const [filter, setFilter] = useState('全部');
  const [submitting, setSubmitting] = useState<Bounty | null>(null);
  const [solution, setSolution] = useState('');

  const list = useMemo(() => {
    let arr = db.bounties;
    if (tab === 'mine') arr = arr.filter((b) => b.owner_union_id === me.union_id);
    if (tab === 'claimed') arr = arr.filter((b) => b.claimant_union_id === me.union_id);
    if (tab === 'all') arr = arr.filter((b) => b.status !== 'MEMBER_DRAFT' && b.status !== 'PENDING_REVIEW' && b.status !== 'REJECTED');
    if (filter !== '全部') arr = arr.filter((b) => STATUS_META[b.status].text === filter);
    return arr;
  }, [db.bounties, tab, filter, me.union_id]);

  const claim = (b: Bounty) => {
    modal.confirm({
      title: `认领「${b.title}」？`,
      content: '认领后需在 48 小时内提交方案，超期将自动释放。同一悬赏默认仅 1 名认领人。',
      okText: '确认认领',
      onOk: () => {
        setDb((p) => ({
          ...p,
          bounties: p.bounties.map((x) =>
            x.id === b.id ? { ...x, status: 'CLAIMED', claimant_union_id: me.union_id, claimant_name: me.name } : x
          ),
        }));
        log('认领悬赏', b.title, '状态 PUBLISHED → CLAIMED');
        message.success('认领成功，请于 48 小时内提交方案');
      },
    });
  };

  const withdraw = (b: Bounty) => {
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) => (x.id === b.id ? { ...x, status: 'PUBLISHED', claimant_union_id: undefined, claimant_name: undefined } : x)),
    }));
    message.success('已撤回认领，悬赏重新开放');
  };

  const doSubmit = () => {
    if (solution.trim().length < 20) { message.warning('方案描述至少 20 字'); return; }
    setDb((p) => ({
      ...p,
      bounties: p.bounties.map((x) => (x.id === submitting!.id ? { ...x, status: 'SUBMITTED', solution } : x)),
    }));
    log('提交悬赏方案', submitting!.title, '状态 CLAIMED → SUBMITTED');
    message.success('方案已提交，等待组织者审核');
    setSubmitting(null); setSolution('');
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="悬赏榜"
        desc="真实业务痛点 → 可认领任务；成员也可发起，审核通过后展示"
        extra={<Link to="/bounty/create"><Button type="primary" size="large" icon={<PlusOutlined />}>发起悬赏</Button></Link>}
      />

      <Card styles={{ body: { padding: 16 } }}>
        <Space wrap size={12}>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: 'all', label: '悬赏大厅' },
              { key: 'mine', label: '我发布的' },
              { key: 'claimed', label: '我认领的' },
            ]}
            style={{ marginBottom: -8 }}
          />
          <Segmented
            value={filter}
            onChange={(v) => setFilter(String(v))}
            options={['全部', '可认领', '已认领', '方案已提交', '已通过', '待审核', '已驳回', '已超期释放']}
          />
        </Space>
      </Card>

      {list.length === 0 ? (
        <Card>
          <Empty description="暂无悬赏">
            <Link to="/bounty/create"><Button type="primary">发起第一个悬赏</Button></Link>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {list.map((b) => (
            <Col xs={24} lg={12} key={b.id}>
              <div className="wb-card wb-card-hover" style={{ padding: 18, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <Typography.Text strong style={{ fontSize: 16, lineHeight: 1.45 }}>{b.title}</Typography.Text>
                  <SoftTag
                    text={STATUS_META[b.status].text}
                    tone={b.status === 'APPROVED' ? 'green' : b.status === 'REJECTED' ? 'red' : b.status === 'PENDING_REVIEW' ? 'gold' : b.status === 'PUBLISHED' ? 'primary' : 'blue'}
                  />
                </div>
                <Space size={6} style={{ marginTop: 10, flexWrap: 'wrap' }}>
                  <TrackTag track={b.track} />
                  <span style={{
                    background: COLOR.primaryLight, color: '#C2410C', fontSize: 12, fontWeight: 700,
                    padding: '2px 10px', borderRadius: 6,
                  }} className="num">{b.points} 积分</span>
                  <span style={{ background: '#F3F4F6', color: COLOR.textSub, fontSize: 11, padding: '2px 8px', borderRadius: 6 }}>{b.source}</span>
                </Space>
                <Typography.Paragraph
                  style={{ color: COLOR.textSub, fontSize: 13, marginTop: 12, marginBottom: 12, lineHeight: 1.7 }}
                  ellipsis={{ rows: 2 }}
                >
                  {b.pain_point}
                </Typography.Paragraph>
                <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 'auto' }}>
                  <ClockCircleOutlined /> 截止 {b.due_date} · 发布人 {b.owner_name}
                  {b.claimant_name ? ` · 认领人 ${b.claimant_name}` : ''}
                </div>

                {b.reject_reason && (
                  <div style={{ marginTop: 12, padding: 10, background: '#FEF2F2', borderRadius: 10, fontSize: 12, color: '#B91C1C', lineHeight: 1.6 }}>
                    <b>驳回理由：</b>{b.reject_reason}
                  </div>
                )}
                {b.solution && (
                  <div style={{ marginTop: 12, padding: 10, background: '#ECFDF5', borderRadius: 10, fontSize: 12, lineHeight: 1.6 }}>
                    <b>方案：</b>{b.solution}
                  </div>
                )}

                <Space style={{ marginTop: 14 }} wrap>
                  {b.status === 'PUBLISHED' && b.owner_union_id !== me.union_id && (
                    <Button size="small" type="primary" onClick={() => claim(b)}>认领</Button>
                  )}
                  {b.status === 'CLAIMED' && b.claimant_union_id === me.union_id && (
                    <>
                      <Button size="small" type="primary" onClick={() => setSubmitting(b)}>提交方案</Button>
                      <Button size="small" danger onClick={() => withdraw(b)}>撤回认领</Button>
                    </>
                  )}
                  {b.status === 'PENDING_REVIEW' && (
                    <SoftTag text="组织者审核中（对外不可见）" tone="gold" />
                  )}
                  {b.status === 'REJECTED' && b.owner_union_id === me.union_id && (
                    <Button size="small" onClick={() => nav('/bounty/create')}>修改后重提</Button>
                  )}
                </Space>
              </div>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        open={!!submitting}
        title={`提交方案 · ${submitting?.title}`}
        onCancel={() => setSubmitting(null)}
        onOk={doSubmit}
        okText="提交方案"
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          期望产出：{submitting?.expected_output}
        </Typography.Paragraph>
        <Input.TextArea
          rows={5} value={solution} onChange={(e) => setSolution(e.target.value)}
          placeholder="说明你的解决方案、验证方式与产出物（≥20 字）"
        />
      </Modal>
    </Space>
  );
}
