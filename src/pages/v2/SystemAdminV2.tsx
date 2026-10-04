import { Button, Table, Tabs, Timeline, App as AntApp } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme/v2';
import { DEMO_TODAY } from '@/mock/seedBiz';
import BoardConfigPanel from '@/components/BoardConfigPanel';
import { Dialog, useConfirm } from '@/components/v2/Dialog';
/* V7.0 CR-33：枚举字典展示中文，与 C 端页面口径一致 */
import { statusText } from '@/constants/statusMeta';
import '../../theme/v2/template.css';

/**
 * 系统管理 v2（P3-5 后台域）
 *
 * 相对 v1 的纯视觉变化：
 *   ① `Card > Tabs` → `.wb2-tabs`（面板统一装进一张卡片，Tab 条不再被 Card 内边距挤压）
 *   ② 3 条 Alert → `.wb2-alert`（左 3px 语义条，中性底）
 *   ③ 数据字典的 6 张小 Card → 6 格 `.wb2-card` 网格（去掉嵌套 Card 的边框套边框）
 *   ④ 对账行的 Progress → `.wb2-prog` 细条（v1 用了 AntD Progress + 裸 hex strokeColor）
 *   ⑤ 切换数据层的 `modal.confirm` → `useConfirm()`（统一底部顺序 + 危险操作聚焦取消）
 *   ⑥ Tag color="orange"/"green"/"blue" → `.wb2-tag` 四档语义
 *
 * 业务：审计日志只读、字典只读、导出留痕、DAL 切换（含二次确认）、变更流程说明——
 * 全部与 v1 逐字一致，未改任何 handler。
 */

export default function SystemAdminV2() {
  const { db, log } = useStore();
  const { message } = AntApp.useApp();
  const confirm = useConfirm();
  const [dalTarget, setDalTarget] = useState<'AI 表格' | '自建库'>('AI 表格');
  const [dalOpen, setDalOpen] = useState(false);

  const exports = [
    { k: '作业台账', n: db.submits.length },
    { k: '评分汇总', n: db.scoreResults.length },
    { k: '积分明细', n: db.pointRecords.length },
    { k: '资产清单', n: db.assets.length },
    { k: '兑换明细', n: db.shopOrders.length },
  ];

  const doSwitchDal = () => {
    if (dalTarget === 'AI 表格') {
      setDalOpen(true);
    } else {
      setDalTarget('AI 表格');
      message.success('已回退到 AI 表格实现');
    }
  };

  const dicts: { title: string; values: string[]; deprecated?: string[]; zh?: boolean }[] = [
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
  ];

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <h2 className="wb2-ph-t">系统管理</h2>
          <div className="wb2-ph-d">操作日志审计、功能开关与系统参数</div>
        </div>
      </div>

      <div className="wb2-tabs">
        <Tabs
          items={[
            {
              key: 'audit', label: `操作日志审计（${db.auditLogs.length}）`,
              children: (
                <>
                  <div className="wb2-alert">
                    <div className="bd">
                      <div className="t">审计日志不可删除、保留 ≥12 个月</div>
                      <div className="d">所有评分、公示、入库、权限变更写 audit_log；涉及评分与积分的变更必须二次确认并写入审计日志。</div>
                    </div>
                  </div>
                  <Table
                    size="small" rowKey="id" pagination={{ pageSize: 10 }} dataSource={db.auditLogs}
                    columns={[
                      { title: '时间', dataIndex: 'created_at', width: 130 },
                      { title: '操作人', dataIndex: 'operator', width: 90 },
                      { title: '动作', dataIndex: 'action', width: 130, render: (v: string) => <span className="wb2-tag wa"><i className="d" />{v}</span> },
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--wb-space-4)' }}>
                  {dicts.map((d) => (
                    <div className="wb2-card wb2-card-pad" key={d.title}>
                      <div className="wb2-card-t">{d.title}</div>
                      <div className="wb2-chips">
                        {d.values.map((v) => <span className="wb2-tag" key={v} title={v}>{d.zh ? statusText(v) : v}</span>)}
                        {(d.deprecated ?? []).map((v) => (
                          <span className="wb2-tag id" key={v} style={{ opacity: 0.6, textDecoration: 'line-through' }}>{v} · 已废弃</span>
                        ))}
                      </div>
                      <div className="wb2-note" style={{ marginTop: 'var(--wb-space-3)' }}>
                        枚举值只增不改，废弃值标记 deprecated
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'board', label: '看板配置',
              children: <BoardConfigPanel />,
            },
            {
              key: 'export', label: '数据导出',
              children: (
                <>
                  <div className="wb2-alert warn">
                    <div className="bd">
                      <div className="d">导出文件表头自动带口径标注，如「统计口径：标签=干部，人数=39」，避免口径混用导致争议。</div>
                    </div>
                  </div>
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
                </>
              ),
            },
            {
              key: 'dal', label: '数据层切换与迁移（DAL）',
              children: (
                <>
                  <div className="wb2-alert">
                    <div className="bd">
                      <div className="t">Q10 决策：一期钉钉 AI 表格 + 二期自建库，强制 DAL 抽象</div>
                      <div className="d">业务层只依赖 Repository 接口，不直接操作 AI 表格或 SQL；一期建表即按二期结构定义字段与类型；可通过配置开关切换，支持灰度按表切换。</div>
                    </div>
                  </div>

                  <div className="wb2-setrow">
                    <div className="nm">
                      当前数据层实现
                      <div className="ds">业务代码零改动，仅切换 Repository 实现</div>
                    </div>
                    <div className="ct">
                      <span className="wb2-tag run"><i className="d" />{dalTarget}</span>
                      <Button onClick={doSwitchDal}>{dalTarget === 'AI 表格' ? '切换到自建库' : '回退到 AI 表格'}</Button>
                    </div>
                  </div>

                  <div className="wb2-card wb2-card-pad" style={{ marginTop: 'var(--wb-space-5)' }}>
                    <div className="wb2-card-t">迁移对账（记录数 / 主键 / 金额分数字段三向对账）</div>
                    {[
                      { k: '用户表 user', a: db.users.length, b: db.users.length },
                      { k: '提报表 assignment_submit', a: db.submits.length, b: db.submits.length },
                      { k: '评分结果 score_result', a: db.scoreResults.length, b: db.scoreResults.length },
                      { k: '积分流水 point_record', a: db.pointRecords.length, b: db.pointRecords.length },
                    ].map((r) => (
                      <div className="wb2-dist" key={r.k} style={{ marginBottom: 'var(--wb-space-3)' }}>
                        <span className="nm" style={{ flexBasis: 200 }}>{r.k}</span>
                        <span className="num" style={{ fontSize: 'var(--wb-fs-caption)', color: COLOR.ink3, flex: '0 0 130px' }}>
                          源 {r.a} / 目标 {r.b}
                        </span>
                        <span className="bar">
                          <span className="wb2-prog" style={{ marginTop: 0 }}><i style={{ width: '100%', background: COLOR.success }} /></span>
                        </span>
                        <span className="wb2-tag ok" style={{ flex: '0 0 auto' }}><i className="d" />一致</span>
                      </div>
                    ))}
                  </div>

                  <Dialog
                    open={dalOpen} title="切换到自建库？" width={520}
                    sub="迁移窗口内将设置只读维护模式；完成后需由组织者确认「迁移校验通过」再恢复写入。"
                    okText="确认切换" danger
                    onCancel={() => setDalOpen(false)}
                    onOk={() => {
                      setDalTarget('自建库');
                      log('数据层切换', 'AITableRepository → SqlRepository', '业务代码零改动，迁移校验通过');
                      message.success('已切换到自建库（业务代码零改动）');
                      setDalOpen(false);
                    }}
                  >
                    <div className="hint warn">
                      切换期间写操作将被置灰（只读维护模式），预计影响所有后台录入动作。
                    </div>
                  </Dialog>
                </>
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
      </div>

      <div className="wb2-note" style={{ marginTop: 'var(--wb-space-5)' }}>
        演示日期 {DEMO_TODAY} · 无感升级：前端资源走版本号与缓存策略，用户刷新即生效；只读模式期间写操作按钮置灰并说明预计恢复时间
      </div>
    </div>
  );
}
