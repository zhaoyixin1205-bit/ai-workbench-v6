import { Button, Card, Empty, Space, Tag, Typography } from 'antd';
import { ArrowRightOutlined, CalendarOutlined, InboxOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { SoftTag } from '@/components/ui';

/**
 * V4.0 CR-04 · 我的选题
 *
 * 承接「选中选题」之后的全部后续动作，按状态机驱动下一步入口：
 *   未提报   → 去提报作业  /work/submit/{typeId}?topic={topicId}
 *   已提交   → 查看分析详情 /work/{submitId}
 *   已出结果 → 查看作业结果 /work/{submitId}#result
 *   全流程   → 预约专家门诊 /clinic/mine（flags.clinic 关闭时隐藏）
 *   已入库   → 查看资产    /assets
 */

const STATUS_TONE: Record<string, 'gray' | 'blue' | 'green'> = {
  已选: 'gray', 已提报: 'blue', 已完成: 'green',
};

export default function MyTopics() {
  const { db, me, flags } = useStore();

  const mine = db.topicSelections.filter((s) => s.union_id === me.union_id);

  if (mine.length === 0) {
    return (
      <Empty description="还没有选择选题">
        <Link to="/cases"><Button type="primary">去选题池看看</Button></Link>
      </Empty>
    );
  }

  const typeId = db.assignmentTypes[0]?.id ?? 'AT1';

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        V4.0 CR-03：选题非排斥，同一选题可被多人选中，各自独立提报，互不影响。
      </Typography.Text>

      {mine.map((sel) => {
        const topic = db.topics.find((t) => t.id === sel.topic_id);
        if (!topic) return null;

        /** 该选题对应的我的提报：优先按 topic_id 关联，历史数据回退按标题匹配 */
        const submit = db.submits.find((s) =>
          s.union_id === me.union_id && (s.topic_id === topic.id || (!s.topic_id && s.title === topic.title))
        );
        const scored = submit?.final_score !== undefined;
        const inAsset = submit ? ['ASSET_APPLYING', 'ASSET_ONLINE'].includes(submit.status) : false;

        let stage: '未提报' | '已提交' | '已出结果' | '已入库' = '未提报';
        if (inAsset) stage = '已入库';
        else if (scored) stage = '已出结果';
        else if (submit) stage = '已提交';

        return (
          <Card key={sel.id} size="small" styles={{ body: { padding: 16 } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <Space size={8} wrap>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{topic.title}</span>
                  <SoftTag text={topic.track} tone="primary" />
                  <SoftTag text={stage} tone={inAsset ? 'green' : scored ? 'purple' : submit ? 'blue' : 'gray'} />
                </Space>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(topic.tags ?? []).length === 0
                    ? <Tag>未分类</Tag>
                    : (topic.tags ?? []).map((t) => (
                      <span key={t} style={{
                        fontSize: 11, color: COLOR.textSub, background: '#F9FAFB',
                        padding: '2px 8px', borderRadius: 6,
                      }}>#{t}</span>
                    ))}
                </div>
                <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 8 }}>
                  选中时间 {sel.selected_at} · 难度 {topic.difficulty}
                  {submit && ` · 提报编号 ${submit.code}`}
                </div>
              </div>

              <Space size={8} wrap style={{ alignItems: 'flex-start' }}>
                {stage === '未提报' && (
                  <Link to={`/work/submit/${typeId}?topic=${topic.id}`}>
                    <Button type="primary" size="small">去提报作业 <ArrowRightOutlined /></Button>
                  </Link>
                )}
                {stage === '已提交' && submit && (
                  <Link to={`/work/${submit.id}`}>
                    <Button type="primary" size="small">查看分析详情 <ArrowRightOutlined /></Button>
                  </Link>
                )}
                {stage === '已出结果' && submit && (
                  <Link to={`/work/${submit.id}#result`}>
                    <Button type="primary" size="small">查看作业结果 <ArrowRightOutlined /></Button>
                  </Link>
                )}
                {stage === '已入库' && (
                  <Link to="/assets">
                    <Button size="small" icon={<InboxOutlined />}>查看资产</Button>
                  </Link>
                )}
                {flags.clinic && (
                  <Link to="/clinic/mine">
                    <Button size="small" icon={<CalendarOutlined />}>预约专家门诊</Button>
                  </Link>
                )}
              </Space>
            </div>
          </Card>
        );
      })}
    </Space>
  );
}
