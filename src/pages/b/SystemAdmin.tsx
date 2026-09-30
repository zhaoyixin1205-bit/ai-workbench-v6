import { Alert, Button, Card, Col, Row, Space, Steps, Switch, Table, Tabs, Tag, Timeline, Typography, App as AntApp, Progress } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import BoardConfigPanel from '@/components/BoardConfigPanel';
/* V7.0 CR-33：枚举字典展示中文，与 C 端页面口径一致 */
import { statusText } from '@/constants/statusMeta';

export default function SystemAdmin() {
  const { db, log } = useStore();
  const { message, modal } = AntApp.useApp();
  const [dalTarget, setDalTarget] = useState<'AI 表格' | '自建库'>('AI 表格');

  const exports = [
    { k: '作业台账', n: db.submits.length },
    { k: '评分汇总', n: db.scoreResults.length },
    { k: '积分明细', n: db.pointRecords.length },
    { k: '资产清单', n: db.assets.length },
    { k: '兑换明细', n: db.shopOrders.length },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="系统管理" desc="操作日志审计、功能开关与系统参数" />

      <Card>
        <Tabs
          items={[
            {
              key: 'audit', label: `操作日志审计（${db.auditLogs.length}）`,
              children: (
                <>
                  <Alert type="info" showIcon style={{ marginBottom: 12 }}
                    message="审计日志不可删除、保留 ≥12 个月"
                    description="所有评分、公示、入库、权限变更写 audit_log；涉及评分与积分的变更必须二次确认并写入审计日志。" />
                  <Table
                    size="small" rowKey="id" pagination={{ pageSize: 10 }} dataSource={db.auditLogs}
                    columns={[
                      { title: '时间', dataIndex: 'created_at', width: 130 },
                      { title: '操作人', dataIndex: 'operator', width: 90 },
                      { title: '动作', dataIndex: 'action', width: 130, render: (v: string) => <Tag color="orange">{v}</Tag> },
                      { title: '对象', dataIndex: 'target', ellipsis: true },
                      { title: '详情', dataIndex: 'detail', ellipsis: true },
                      { title: 'IP', dataIndex: 'ip', width: 110 },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'dict', label: '数据字典',
              children: (
                <Row gutter={16}>
                  {([
                    { title: '赛道', values: ['客户赋能', '团队提效', '销售提效'] },
                    { title: '层级', values: ['干部层', '骨干层'] },
                    /**
                     * U-1 结案：LEADER 仍存在于 Role 枚举（历史数据兼容，符合「字段只增不删」），
                     * 但已不作为角色字段使用 —— 负责人口径走 is_dept_leader 派生属性。
                     */
                    {
                      title: '角色',
                      values: ['MEMBER', 'JUDGE', 'EXPERT', 'ORGANIZER', 'SKILL_ADMIN', 'ADMIN', 'VIEWER'],
                      deprecated: ['LEADER'],
                    },
                    { title: '数据范围', values: ['SELF', 'DEPT_TREE', 'ALL'] },
                    /* V7.0 CR-33：提报状态走中文真源（title 保留原枚举，便于对照代码） */
                    { title: '提报状态', values: ['DRAFT', 'SUBMITTED', 'AI_SCORED', 'REVIEWED', 'PASSED', 'PUBLISHED', 'ASSET_ONLINE', 'WITHDRAWN'], zh: true },
                    { title: '悬赏状态', values: ['PENDING_REVIEW', 'PUBLISHED', 'CLAIMED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED'] },
                  ] as { title: string; values: string[]; deprecated?: string[]; zh?: boolean }[]).map((d) => (
                    <Col xs={24} sm={12} lg={8} key={d.title}>
                      <Card size="small" title={d.title} style={{ marginBottom: 12 }}>
                        <Space wrap>
                          {d.values.map((v) => <Tag key={v} title={v}>{d.zh ? statusText(v) : v}</Tag>)}
                          {(d.deprecated ?? []).map((v) => (
                            <Tag key={v} style={{ opacity: 0.55, textDecoration: 'line-through' }}>{v} · 已废弃</Tag>
                          ))}
                        </Space>
                        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
                          枚举值只增不改，废弃值标记 deprecated
                        </Typography.Text>
                      </Card>
                    </Col>
                  ))}
                </Row>
              ),
            },
            {
              key: 'board', label: '看板配置',
              children: <BoardConfigPanel />,
            },
            {
              key: 'export', label: '数据导出',
              children: (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert type="warning" showIcon message="导出文件表头自动带口径标注，如「统计口径：标签=干部，人数=39」，避免口径混用导致争议。" />
                  <Table
                    size="small" rowKey="k" pagination={false} dataSource={exports}
                    columns={[
                      { title: '导出项', dataIndex: 'k' },
                      { title: '记录数', dataIndex: 'n', render: (v: number) => <span className="num">{v}</span> },
                      {
                        title: '操作',
                        render: (_, r) => (
                          <Button size="small" type="primary" onClick={() => { log('数据导出', r.k, `CSV/XLSX，${r.n} 条`); message.success(`${r.k} 已导出（表头带口径标注）`); }}>导出 CSV / XLSX</Button>
                        ),
                      },
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: 'dal', label: '数据层切换与迁移（DAL）',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert type="info" showIcon
                    message="Q10 决策：一期钉钉 AI 表格 + 二期自建库，强制 DAL 抽象"
                    description="业务层只依赖 Repository 接口，不直接操作 AI 表格或 SQL；一期建表即按二期结构定义字段与类型；可通过配置开关切换，支持灰度按表切换。" />
                  <Card size="small">
                    <Space>
                      <span>当前数据层实现</span>
                      <Tag color="blue">{dalTarget}</Tag>
                      <Button onClick={() => {
                        if (dalTarget === 'AI 表格') {
                          modal.confirm({
                            title: '切换到自建库？',
                            content: '迁移窗口内将设置只读维护模式；完成后需由组织者确认「迁移校验通过」再恢复写入。',
                            onOk: () => {
                              setDalTarget('自建库');
                              log('数据层切换', 'AITableRepository → SqlRepository', '业务代码零改动，迁移校验通过');
                              message.success('已切换到自建库（业务代码零改动）');
                            },
                          });
                        } else {
                          setDalTarget('AI 表格');
                          message.success('已回退到 AI 表格实现');
                        }
                      }}>
                        {dalTarget === 'AI 表格' ? '切换到自建库' : '回退到 AI 表格'}
                      </Button>
                    </Space>
                  </Card>
                  <Card size="small" title="迁移对账（记录数 / 主键 / 金额分数字段三向对账）">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {[
                        { k: '用户表 user', a: db.users.length, b: db.users.length },
                        { k: '提报表 assignment_submit', a: db.submits.length, b: db.submits.length },
                        { k: '评分结果 score_result', a: db.scoreResults.length, b: db.scoreResults.length },
                        { k: '积分流水 point_record', a: db.pointRecords.length, b: db.pointRecords.length },
                      ].map((r) => (
                        <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ width: 220, fontSize: 13 }}>{r.k}</span>
                          <span className="num" style={{ fontSize: 12 }}>源 {r.a} / 目标 {r.b}</span>
                          <Progress percent={100} size="small" style={{ flex: 1, marginBottom: 0 }} strokeColor={COLOR.success} />
                          <Tag color="green">一致</Tag>
                        </div>
                      ))}
                    </Space>
                  </Card>
                </Space>
              ),
            },
            {
              key: 'change', label: '变更影响最小化流程（PRD 8.6）',
              children: (
                <Timeline
                  items={[
                    { color: 'green', children: <><b>1 影响评估</b>：填写《变更影响清单》——影响模块、影响用户范围、是否需要数据迁移、回滚方案</> },
                    { color: 'green', children: <><b>2 兼容测试</b>：跑历史数据回归用例 + 老接口用例 + 历史提报重算一致性校验</> },
                    { color: 'blue', children: <><b>3 灰度发布</b>：按 8.4 路径放量，观察错误率、加载耗时、关键任务成功率</> },
                    { children: <><b>4 提前公告</b>：涉及可见变更时，提前 3 天通过钉钉群卡片 + 站内公告告知</> },
                    { children: <><b>5 维护窗口</b>：数据迁移 / 大版本升级安排在周末或非工作时段，进入只读维护模式</> },
                    { children: <><b>6 回滚演练</b>：上线前验证回滚脚本可用，回滚后数据一致</> },
                    { children: <><b>7 上线后观察</b>：24 小时内监控错误率与用户反馈，异常即回滚</> },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        演示日期 {DEMO_TODAY} · 无感升级：前端资源走版本号与缓存策略，用户刷新即生效；只读模式期间写操作按钮置灰并说明预计恢复时间
      </Typography.Text>
    </Space>
  );
}
