import { Button, Card, Col, Input, InputNumber, Row, Space, Table, Tag, Typography, App as AntApp, Modal, Form, Alert, Progress, Divider } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import type { ScoreDimension } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { useSkillAdminConverge } from '@/auth/converge';
import { ScopeNotice } from '@/components/ScopeNotice';

export default function ScoreCardAdmin() {
  const { db, setDb, log, scopeRows, flags } = useStore();
  /** V4.0 A-3：影响面提示按数据范围统计 */
  const inScope = scopeRows(db.submits);
  /** V4.0 CR-09：技能管理员在本页为只读浏览者（§6.2 矩阵 ◐） */
  const readOnly = useSkillAdminConverge().isReadOnly('/admin/scorecard');
  const { message, modal } = AntApp.useApp();
  const [cardId, setCardId] = useState(db.scoreCards[0].id + '-v2');
  const [editing, setEditing] = useState(false);
  const [dims, setDims] = useState<ScoreDimension[]>(db.scoreCards[0].dimensions);
  /** V6.0 CR-24 开关：关闭=只有「编辑维度→保存即新版本」，无新建/复制/启用/停用/删除 */
  const lifecycleOn = flags.scoreCardLifecycle !== false;

  /** V6.0 CR-24：列表只展示未软删的卡 */
  const cards = db.scoreCards.filter((c) => !c.is_deleted);
  const card = cards.find((c) => `${c.id}-${c.version}` === cardId) ?? cards[0] ?? db.scoreCards[0];
  const weightSum = dims.reduce((a, b) => a + b.weight, 0);

  /** 引用数：绑定了作业类型，或已产生评分结果 → 禁止删除，仅可停用 */
  const refCount = (c: typeof card) =>
    db.assignmentTypes.filter((t) => t.score_card_id === c.id).length
    + db.scoreResults.filter((r) => r.card_id === c.id).length;

  const save = () => {
    if (weightSum !== 100) { message.error(`维度权重合计必须 = 100，当前 ${weightSum}`); return; }
    const newVersion = `v${Number(card.version.slice(1)) + 1}`;
    modal.confirm({
      title: '保存评分卡改版',
      content: `保存即生成新版本 ${newVersion}；历史提报按提交时绑定的版本计算，改版不影响历史分数。影响约 ${inScope.filter((s) => s.ai_score === undefined).length} 个未评分提报（按当前数据范围统计）。`,
      onOk: () => {
        setDb((p) => ({
          ...p,
          scoreCards: [{ ...card, version: newVersion, dimensions: dims, updated_at: '2026-09-25 12:00' }, ...p.scoreCards],
        }));
        log('评分卡改版', `${card.name} ${card.version} → ${newVersion}`, '维度权重已更新，历史结果按旧版本计算');
        message.success(`已生成 ${newVersion}`);
        setEditing(false);
      },
    });
  };

  /** V6.0 CR-24：新建空白评分卡（默认草稿态，权重留空由组织者配置） */
  const createCard = () => {
    const id = `SC${Date.now()}`;
    const blank: ScoreDimension[] = [
      { id: `D${Date.now()}-1`, sort: 1, name: '业务价值', weight: 40, max_score: 10, standard: '解决了多大的业务问题', levels: [] },
      { id: `D${Date.now()}-2`, sort: 2, name: '可复用性', weight: 30, max_score: 10, standard: '别人照着做的成本有多低', levels: [] },
      { id: `D${Date.now()}-3`, sort: 3, name: '完成度', weight: 30, max_score: 10, standard: '产出物是否完整可用', levels: [] },
    ];
    setDb((p) => ({
      ...p,
      scoreCards: [{
        id, name: '新建评分卡', version: 'v1', total_rule: '加权求和', pass_line: 60,
        ai_weight: 40, judge_weight: 60, status: '草稿', bind_target: '未绑定',
        dimensions: blank, updated_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
      }, ...p.scoreCards],
    }));
    log('新建评分卡', '新建评分卡 v1', 'V6.0 CR-24：默认草稿态，三维合计 100%');
    message.success('已新建空白评分卡（草稿态，可直接配置维度与权重）');
    setCardId(`${id}-v1`);
    setDims(blank);
  };

  /** V6.0 CR-24：复制生成副本草稿，不复制绑定关系 */
  const copyCard = (c: typeof card) => {
    const id = `SC${Date.now()}`;
    setDb((p) => ({
      ...p,
      scoreCards: [{
        ...c,
        id,
        name: `${c.name} 副本`,
        version: 'v1',
        status: '草稿',
        /** 绑定关系不复制 */
        bind_target: '未绑定',
        copied_from: `${c.id}-${c.version}`,
        dimensions: c.dimensions.map((d) => ({ ...d, id: `D${Date.now()}-${d.id}` })),
        updated_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
      }, ...p.scoreCards],
    }));
    log('复制评分卡', `${c.name} ${c.version}`, `生成副本草稿，不复制绑定关系（来源 ${c.id}-${c.version}）`);
    message.success('已生成副本草稿（绑定关系未复制，需重新配置）');
  };

  /** V6.0 CR-24：启用 / 停用（停用不影响历史提报按旧版本计算） */
  const toggleStatus = (c: typeof card) => {
    const next = c.status === '启用' ? '停用' : '启用';
    setDb((p) => ({
      ...p,
      scoreCards: p.scoreCards.map((x) => (`${x.id}-${x.version}` === `${c.id}-${c.version}` ? { ...x, status: next } : x)),
    }));
    log(next === '启用' ? '启用评分卡' : '停用评分卡', `${c.name} ${c.version}`, '停用不影响历史提报按旧版本计算（6.5.5 版本绑定口径）');
    message.success(`已${next}（历史提报仍按原绑定版本计算）`);
  };

  /** V6.0 CR-24：软删；有引用时禁止删除，仅可停用 */
  const deleteCard = (c: typeof card) => {
    const n = refCount(c);
    if (n > 0) {
      message.error(`该卡存在 ${n} 处引用（已绑定作业类型或已产生评分结果），禁止删除，仅可「停用」`);
      return;
    }
    modal.confirm({
      title: `删除「${c.name} ${c.version}」？`,
      content: '删除为软删，记录保留可追溯；删除后不再出现在列表与绑定选项中。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: () => {
        setDb((p) => ({
          ...p,
          scoreCards: p.scoreCards.map((x) => (`${x.id}-${x.version}` === `${c.id}-${c.version}`
            ? { ...x, is_deleted: true, deleted_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}` }
            : x)),
        }));
        log('删除评分卡', `${c.name} ${c.version}`, 'V6.0 CR-24：软删并留痕，无引用方可删除');
        message.success('已删除（软删，记录保留可追溯）');
      },
    });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="评分卡管理（Q8：评分权重可自行配置）" desc="四维评分卡与权重可自行配置（Q8）" />

      {/* U-2 结案：范围受限提示（含专家身份说明），四个后台页共用同一套口径 */}
      <ScopeNotice count={inScope.length} unit="条提报" />

      <Row gutter={16}>
        <Col xs={24} lg={8}>
          <Card size="small" title="评分卡列表">
            {cards.map((c) => (
              <div
                key={`${c.id}-${c.version}`}
                onClick={() => { setCardId(`${c.id}-${c.version}`); setDims(c.dimensions); setEditing(false); }}
                style={{
                  padding: 10, borderRadius: 8, cursor: 'pointer', marginBottom: 8,
                  border: `1px solid ${`${c.id}-${c.version}` === cardId ? COLOR.primary : '#E5E7EB'}`,
                  background: `${c.id}-${c.version}` === cardId ? COLOR.primaryLight : '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b>{c.name}</b><Tag color={c.status === '启用' ? 'green' : c.status === '草稿' ? 'gold' : 'default'}>{c.status}</Tag>
                </div>
                <div style={{ fontSize: 12, color: COLOR.textSub, marginTop: 4 }}>
                  版本 {c.version} · 及格线 {c.pass_line} · AI {c.ai_weight}% / 评委 {c.judge_weight}%
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                  绑定：{c.bind_target}{c.copied_from ? ` · 复制自 ${c.copied_from}` : ''}
                </div>
                {/* V6.0 CR-24：全生命周期五类操作（开关关闭时不渲染） */}
                {lifecycleOn && (
                  <Space size={4} style={{ marginTop: 8 }} wrap>
                    <Button size="small" disabled={readOnly} onClick={(e) => { e.stopPropagation(); copyCard(c); }}>复制</Button>
                    <Button size="small" disabled={readOnly} onClick={(e) => { e.stopPropagation(); toggleStatus(c); }}>
                      {c.status === '启用' ? '停用' : '启用'}
                    </Button>
                    <Button
                      size="small" danger disabled={readOnly} type="text"
                      onClick={(e) => { e.stopPropagation(); deleteCard(c); }}
                    >
                      删除{refCount(c) > 0 ? `（引用 ${refCount(c)}）` : ''}
                    </Button>
                  </Space>
                )}
              </div>
            ))}
            <Button
              block disabled={readOnly}
              onClick={lifecycleOn ? createCard : () => message.success('已新建空白评分卡（Q11 终端评分卡口径到位后可直接配置）')}
            >
              新建评分卡
            </Button>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card
            size="small"
            title={`${card.name} ${card.version} · 维度与权重`}
            extra={<Space>
              {editing ? (
                <>
                  <Button onClick={() => { setEditing(false); setDims(card.dimensions); }}>取消</Button>
                  <Button type="primary" onClick={save}>保存并生成新版本</Button>
                </>
              ) : (
                <Button disabled={readOnly} onClick={() => setEditing(true)}>编辑维度</Button>
              )}
            </Space>}
          >
            <Alert
              type={weightSum === 100 ? 'success' : 'error'} showIcon
              message={`权重合计：${weightSum}%（必须 = 100）`}
              style={{ marginBottom: 12 }}
            />

            <Table
              size="small" rowKey="id" pagination={false} dataSource={dims}
              columns={[
                { title: '排序', dataIndex: 'sort', width: 60 },
                { title: '维度名称', dataIndex: 'name', render: (v: string) => <b>{v}</b> },
                {
                  title: '权重（%）', dataIndex: 'weight', width: 120,
                  render: (v: number, r) => editing
                    ? <InputNumber size="small" min={0} max={100} value={v} onChange={(n) => setDims(dims.map((d) => (d.id === r.id ? { ...d, weight: Number(n) || 0 } : d)))} />
                    : <span className="num">{v}%</span>,
                },
                {
                  title: '满分', dataIndex: 'max_score', width: 90,
                  render: (v: number, r) => editing
                    ? <InputNumber size="small" min={1} value={v} onChange={(n) => setDims(dims.map((d) => (d.id === r.id ? { ...d, max_score: Number(n) || 0 } : d)))} />
                    : <span className="num">{v}</span>,
                },
                {
                  title: '评分标准', dataIndex: 'standard',
                  render: (v: string, r) => editing
                    ? <Input size="small" value={v} onChange={(e) => setDims(dims.map((d) => (d.id === r.id ? { ...d, standard: e.target.value } : d)))} />
                    : v,
                },
              ]}
            />

            <Divider />

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Typography.Text strong>档位与标准（注入 AI 评分提示词，也用于评委打分参考）</Typography.Text>
                {dims.map((d) => (
                  <div key={d.id} style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                    {d.levels.length === 0 ? (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>未配置档位（历史版本 / 待补充）</Typography.Text>
                    ) : (
                      <Space wrap size={4}>
                        {d.levels.map((l) => (
                          <Tag key={l.level} color={l.level === '优秀' ? 'green' : l.level === '良好' ? 'blue' : l.level === '合格' ? 'gold' : 'red'}>
                            {l.level} {l.range}：{l.desc}
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                ))}
              </Col>
              <Col xs={24} sm={12}>
                <Typography.Text strong>双轨权重与计算方式</Typography.Text>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <div>总分计算：{card.total_rule}</div>
                  <div>及格线：{card.pass_line} 分</div>
                  <div style={{ marginTop: 8 }}>AI 分权重 {card.ai_weight}%</div>
                  <Progress percent={card.ai_weight} strokeColor={COLOR.primary} size="small" />
                  <div>评委分权重 {card.judge_weight}%</div>
                  <Progress percent={card.judge_weight} strokeColor="#7C3AED" size="small" />
                </div>
                <Alert style={{ marginTop: 12 }} type="warning" showIcon
                  message="Q11 待补充：终端平台 AI 评分口径" description="拿到口径后由组织者在后台配置「终端评分卡」即可，无需改动代码。" />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
