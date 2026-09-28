import { Alert, Button, Card, Col, Modal, Progress, Row, Segmented, Space, Statistic, Steps, Table, Tag, Tabs, Typography, App as AntApp } from 'antd';
import { LockOutlined, SafetyCertificateOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT } from '@/theme';
import { PageHeader, SoftTag, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';

export default function WBAdminData() {
  const { db, me, hasRole, log, flags } = useStore();
  const { message, modal } = AntApp.useApp();
  const [verified, setVerified] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [tab, setTab] = useState('auth');

  if (!hasRole('ADMIN')) {
    return (
      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%', textAlign: 'center', padding: 32 }}>
          <LockOutlined style={{ fontSize: 48, color: COLOR.error }} />
          <Typography.Title level={4}>403 · 无访问权限</Typography.Title>
          <Typography.Text type="secondary">
            WorkBuddy 管理员数据（M12）仅系统管理员可见；其余角色在菜单与接口层面均不可见。
          </Typography.Text>
        </Space>
      </Card>
    );
  }

  if (!flags.wbAdmin) {
    return <Card><Alert type="warning" showIcon message="管理员数据模块已被功能开关关闭" description="开关关闭时导航入口隐藏、接口返回 404 语义、相关消息不再推送，但不删除任何数据。" /></Card>;
  }

  const usage = db.wbUsage;
  const authorized = usage.filter((u) => u.auth_status === '已授权').length;
  const zeroUse = usage.filter((u) => u.active_days === 0);
  const redList = [...usage].filter((u) => u.active_days > 0).sort((a, b) => (b.active_days * 2 + b.sessions) - (a.active_days * 2 + a.sessions)).slice(0, 10);
  const blackList = zeroUse;

  const deptRank = Object.entries(
    usage.reduce<Record<string, { total: number; active: number }>>((acc, u) => {
      acc[u.dept_name] ??= { total: 0, active: 0 };
      acc[u.dept_name].total += 1;
      if (u.active_days > 0) acc[u.dept_name].active += 1;
      return acc;
    }, {})
  ).map(([name, v]) => ({
    dept: name.split('/').pop() ?? name,
    rate: Math.round((v.active / v.total) * 100),
    active: v.active, total: v.total,
  })).sort((a, b) => b.rate - a.rate);

  const doVerify = () => {
    setVerified(true);
    log('管理员页登录验证', me.name, '换取访问凭据，AES 加密存储（密钥与代码分离），写审计日志（含 IP）');
    message.success('验证成功：已建立数据通道，凭据加密存储');
    setVerifyOpen(false);
  };

  if (!verified) {
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <PageHeader title="WorkBuddy 管理员数据（M12）" desc="仅系统管理员可见，首次进入需完成管理员页登录验证" />
        <Card>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type="error" showIcon icon={<LockOutlined />}
              message="模块已锁定：首次进入必须完成 WorkBuddy 管理员页登录验证"
              description="权限底线：① 仅 ADMIN 可见入口；② 首次必须跳转管理员页完成登录验证；③ 凭据加密存储，不明文落库、不写日志、不在前端暴露；④ 每次数据拉取校验管理员身份与凭据有效性。"
            />
            <Steps
              direction="vertical" size="small" current={0}
              items={[
                { title: '校验是否 ADMIN', description: '否 → 无入口且接口返回 403' },
                { title: '校验是否已存在有效凭据', description: '否 → 进入首次验证' },
                { title: '跳转 WorkBuddy 管理员页登录', description: '账号密码 / 扫码，完成身份确认' },
                { title: '回调平台换取访问凭据', description: 'token / cookie' },
                { title: '凭据加密存储', description: 'AES 加密，密钥来自环境变量或 KMS；记录绑定人、绑定时间、有效期' },
                { title: '验证成功，解锁数据同步与红黑榜', description: '写审计日志（含 IP）' },
              ]}
            />
            <Space>
              <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => setVerifyOpen(true)}>前往管理员页完成登录验证</Button>
              <Button onClick={() => message.info('降级方案：支持 ADMIN 在管理员页导出 CSV 后上传平台导入，功能与展示保持一致（Q12）')}>使用 CSV 导入降级</Button>
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              凭据失效 / 过期：功能锁定，仅展示「重新验证」入口，历史数据保留但不再更新。
            </Typography.Text>
          </Space>
        </Card>

        <Modal
          open={verifyOpen} title="WorkBuddy 管理员页登录验证（模拟）"
          onCancel={() => setVerifyOpen(false)} onOk={doVerify} okText="模拟验证通过"
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              真实实现：跳转管理员页 → 登录后回调平台换取凭据 → AES 加密存储。此处为演示环境，直接模拟验证成功。
            </Typography.Text>
            <Typography.Text>管理员身份：{me.name}（{me.union_id}）</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              验证、同步、查看、导出全部写审计日志，保留 ≥12 个月。
            </Typography.Text>
          </Space>
        </Modal>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row justify="space-between" align="middle" gutter={[12, 12]}>
        <Col>
          <PageHeader
            title="WorkBuddy 管理员数据（M12）"
            desc={`数据截止 ${DEMO_TODAY}（默认 T-1）· 同步方式：每日凌晨全量 + 手动触发`}
            extra={null}
          />
          <div style={{ marginTop: 8 }}><SoftTag text="凭据有效" tone="green" /></div>
        </Col>
        <Col>
          <Space>
            <Button icon={<DatabaseOutlined />} onClick={() => { log('管理员数据同步', '全量同步', '按 stat_date 幂等写入，51 条'); message.success('同步完成：51 条（幂等写入，不产生重复数据）'); }}>立即同步</Button>
            <Button onClick={() => { log('CSV 导入', '管理员页导出 CSV', '降级路径导入'); message.success('CSV 导入成功（Q12 降级方案）'); }}>CSV 导入</Button>
            <Button danger onClick={() => { setVerified(false); log('凭据失效处理', '手动锁定', '模块进入只读模式'); message.warning('凭据已失效，模块锁定为只读'); }}>模拟凭据失效</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        {([
          { t: '同步成员数', v: usage.length, tone: 'primary' as const },
          { t: '已授权', v: authorized, tone: 'green' as const },
          { t: '授权率', v: `${Math.round((authorized / usage.length) * 100)}%`, tone: 'blue' as const },
          { t: '零用量人数', v: zeroUse.length, tone: 'gold' as const },
          { t: '累计会话数', v: usage.reduce((a, b) => a + b.sessions, 0), tone: 'primary' as const },
          { t: '累计 Skill 调用', v: usage.reduce((a, b) => a + b.skill_calls, 0), tone: 'blue' as const },
        ]).map((m) => (
          <Col xs={12} sm={4} key={m.t}>
            <StatCard label={m.t} value={m.v} tone={m.tone} />
          </Col>
        ))}
      </Row>

      <Card>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'auth', label: `客户端授权情况（${usage.length}）`,
              children: (
                <Table
                  size="small" rowKey="id" pagination={{ pageSize: 10 }} dataSource={usage}
                  columns={[
                    { title: '姓名', dataIndex: 'name', width: 90 },
                    { title: '部门', dataIndex: 'dept_name' },
                    {
                      title: '授权状态', dataIndex: 'auth_status',
                      render: (v: string) => <Tag color={v === '已授权' ? 'green' : v === '待确认' ? 'gold' : 'red'}>{v}</Tag>,
                    },
                    { title: '活跃天数', dataIndex: 'active_days', width: 90, render: (v: number) => <span className="num">{v}</span> },
                    { title: '会话数', dataIndex: 'sessions', width: 80, render: (v: number) => <span className="num">{v}</span> },
                    { title: 'Skill 调用', dataIndex: 'skill_calls', width: 90, render: (v: number) => <span className="num">{v}</span> },
                    { title: '最近活跃', dataIndex: 'last_active', width: 110 },
                    {
                      title: '操作',
                      render: (_, r) => (
                        <Button size="small" type="link" onClick={() => message.info(`清障催办：已向 ${r.name} 推送钉钉待办「完成客户端授权」`)}>催办授权</Button>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'red', label: `用量红榜（前 10）`,
              children: (
                <Table
                  size="small" rowKey="id" pagination={false} dataSource={redList}
                  columns={[
                    { title: '#', render: (_, __, i) => <span className="num">{i + 1}</span>, width: 40 },
                    { title: '姓名', dataIndex: 'name', width: 90 },
                    { title: '部门', dataIndex: 'dept_name' },
                    {
                      title: '分层', width: 120,
                      render: (_, r) => <Tag color={r.active_days >= 20 ? 'red' : r.active_days >= 10 ? 'orange' : 'blue'}>
                        {r.active_days >= 20 ? '高频使用' : r.active_days >= 10 ? '稳定使用' : '初步启动'}
                      </Tag>,
                    },
                    { title: '活跃天数', dataIndex: 'active_days', width: 90, render: (v: number) => <span className="num">{v}</span> },
                    { title: '会话数', dataIndex: 'sessions', width: 80, render: (v: number) => <span className="num">{v}</span> },
                  ]}
                />
              ),
            },
            {
              key: 'black', label: `待改进黑榜（${blackList.length}）`,
              children: (
                <>
                  <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                    message="口径：零用量天数 ≥ 30 天，或连续 2 个月零用量且未提报作业"
                    description="默认仅本人与其团队负责人可见；全员公示需组织者二次确认。对外公示只展示分层与排名，不展示原始用量数值。" />
                  <Table
                    size="small" rowKey="id" pagination={false} dataSource={blackList}
                    columns={[
                      { title: '姓名', dataIndex: 'name', width: 90 },
                      { title: '部门', dataIndex: 'dept_name' },
                      { title: '授权状态', dataIndex: 'auth_status', render: (v: string) => <Tag color={v === '已授权' ? 'green' : 'red'}>{v}</Tag> },
                      { title: '活跃天数', dataIndex: 'active_days', width: 90, render: (v: number) => <span className="num">{v}</span> },
                      { title: '最近活跃', dataIndex: 'last_active' },
                      {
                        title: '操作',
                        render: (_, r) => (
                          <Button size="small" type="link" onClick={() => { log('回收名单导出', r.name, '导出为待办清单，实际回收由组织者线下执行后回写状态'); message.success('已导出为待办清单（回收动作线下执行后回写）'); }}>导出待回收清单</Button>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'dept', label: '部门榜',
              children: (
                <Table
                  size="small" rowKey="dept" pagination={false} dataSource={deptRank}
                  columns={[
                    { title: '部门', dataIndex: 'dept' },
                    { title: '激活人数', render: (_, r) => <span className="num">{r.active}/{r.total}</span> },
                    {
                      title: '激活率', dataIndex: 'rate',
                      render: (v: number) => <Progress percent={v} size="small" strokeColor={COLOR.primary} />,
                    },
                    { title: '评价', render: (_, r) => r.rate >= 60 ? <Tag color="green">红榜</Tag> : <Tag color="orange">待改进</Tag> },
                  ]}
                />
              ),
            },
            {
              key: 'skill', label: 'Skill 使用榜',
              children: (
                <Table
                  size="small" rowKey="id" pagination={false}
                  dataSource={db.assets.slice().sort((a, b) => b.reuse_count - a.reuse_count)}
                  columns={[
                    { title: 'Skill 名称', dataIndex: 'name' },
                    { title: '作者', dataIndex: 'author_name', width: 90 },
                    { title: '调用次数', dataIndex: 'reuse_count', width: 100, render: (v: number) => <span className="num">{v}</span> },
                    { title: '被复用人数', dataIndex: 'reuse_user_count', width: 100, render: (v: number) => <span className="num">{v}</span> },
                    { title: '复用部门分布', render: () => <Tag>华东 12 · 华南 8 · 华北 6 · 西部 4 · 中台 4</Tag> },
                  ]}
                />
              ),
            },
            {
              key: 'setting', label: '公示与合规',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert type="info" showIcon
                    message="红黑榜是否对全员公示由组织者配置，默认「部门榜全员可见、个人榜仅本人与负责人可见」"
                    description="脱敏：对外公示只展示分层与排名，不展示原始用量数值；导出明细需 ADMIN 审批并留痕。" />
                  <Card size="small" title="公示配置">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {[
                        { k: '部门榜', cur: '全员可见' },
                        { k: '个人榜', cur: '仅本人与负责人可见' },
                        { k: '待改进黑榜', cur: '本人 + 负责人（全员公示需二次确认）' },
                      ].map((s) => (
                        <div key={s.k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13 }}>{s.k}</span>
                          <Space>
                            <Tag color="blue">{s.cur}</Tag>
                            <Segmented size="small" defaultValue={s.cur}
                              options={['全员可见', '仅本部门', '仅本人与负责人', '不公示']}
                              onChange={(v) => { log('红黑榜公示配置', s.k, String(v)); message.success(`${s.k} 公示范围：${v}`); }} />
                          </Space>
                        </div>
                      ))}
                    </Space>
                  </Card>
                  <Card size="small" title="导出明细（需 ADMIN 审批并留痕）">
                    <Space>
                      <Button onClick={() => modal.confirm({
                        title: '导出用量明细？',
                        content: '用量数据属敏感数据：不出事业群、不对外、不用于任何对外用途。导出将写审计日志。',
                        onOk: () => { log('导出用量明细', `${usage.length} 条`, 'ADMIN 审批通过，含脱敏处理'); message.success('已导出（含脱敏，仅展示分层与排名）'); },
                      })}>导出用量明细</Button>
                      <Button onClick={() => message.info('已导出回收名单，实际回收动作由组织者线下执行后回写状态')}>导出回收名单</Button>
                    </Space>
                  </Card>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        <LockOutlined /> 凭据加密存储 · 传输全 HTTPS · 禁止写入日志与前端 · 操作审计保留 ≥12 个月 · ADMIN 离职或角色撤销后凭据立即失效并删除
      </Typography.Text>
    </Space>
  );
}
