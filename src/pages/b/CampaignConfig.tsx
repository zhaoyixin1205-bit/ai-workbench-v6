import { Alert, Button, Card, Col, DatePicker, InputNumber, Row, Segmented, Space, Steps, Switch, Table, Tag, Typography, App as AntApp, message as staticMsg } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import dayjs from 'dayjs';

export default function CampaignConfig() {
  const { db, campaign, setDb, setFlags, flags, log } = useStore();
  const [visibility, setVisibility] = useState(campaign.visibility);
  const { message } = AntApp.useApp();

  const saveVisibility = () => {
    setDb((p) => ({
      ...p,
      campaigns: p.campaigns.map((c) => (c.id === campaign.id ? { ...c, visibility } : c)),
    }));
    log('公示口径变更', campaign.name, `榜单 ${visibility.leaderboard} / 提报详情 ${visibility.workDetail} / 评语 ${visibility.comment}`);
    message.success('公示口径已保存并即时生效（变更留痕）');
  };

  const toggleFlag = (k: keyof typeof flags, label: string) => {
    setFlags((f) => ({ ...f, [k]: !f[k] }));
    log('功能开关变更', label, `${flags[k] ? 'ON → OFF' : 'OFF → ON'}（关闭后导航隐藏、接口 404 语义、不删数据）`);
    message.success(`${label} 已${flags[k] ? '关闭' : '开启'}`);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="届次与配置" desc="多届支持，历史届次数据可回溯" />

      <Card size="small" title={`当前届次：${campaign.name}`}>
        <Space wrap>
          <Tag color="orange">{campaign.status}</Tag>
          <span>{campaign.start_date} ~ {campaign.end_date}</span>
          <Button onClick={() => { log('复制届次', campaign.name, '复制案例、选题与规则配置'); message.success('已复制为上届配置（减少重复配置工作量）'); }}>一键复制上届</Button>
          <Button type="primary" onClick={() => message.success('已创建新届次草稿（多届支持，历史届次数据可回溯）')}>创建新届次</Button>
        </Space>
        <Steps
          style={{ marginTop: 16 }}
          size="small"
          current={2}
          items={campaign.stages.map((s) => ({ title: s.name, description: `${s.start} ~ ${s.end}` }))}
        />
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="时间窗配置">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space>
                <span>启动日</span>
                <DatePicker defaultValue={dayjs(campaign.start_date)} />
                <span>结束日</span>
                <DatePicker defaultValue={dayjs(campaign.end_date)} />
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                影响提报与榜单，不影响历史数据；演示基准日 {DEMO_TODAY}
              </Typography.Text>
              <Button type="primary" onClick={() => message.success('时间窗已保存')}>保存时间窗</Button>
            </Space>
          </Card>

          <Card size="small" title="积分规则" style={{ marginTop: 16 }}>
            <Table
              size="small" rowKey="action" pagination={false} dataSource={campaign.pointRules}
              columns={[
                { title: '行为', dataIndex: 'action' },
                {
                  title: '积分', dataIndex: 'points', width: 100,
                  render: (v: number) => <InputNumber size="small" defaultValue={v} min={0} />,
                },
                { title: '上限', dataIndex: 'cap', width: 90, render: (v?: number) => v ? <span className="num">{v}</span> : '—' },
              ]}
            />
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              规则变更仅对新行为生效；设置个人与部门积分上限防止积分超发导致成本失控。
            </Typography.Text>
            <Button style={{ marginTop: 8 }} onClick={() => message.success('积分规则已保存')}>保存规则</Button>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title="公示口径（Q9：默认 + 管理员可配）">
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="默认：榜单全员可见、提报/作业详情仅本部门可见；评语默认不公示"
              description="分数与排名可公示；涉及客户信息的内容一律不公示。" />
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {[
                { k: 'leaderboard' as const, label: '榜单（排名与分数）' },
                { k: 'workDetail' as const, label: '提报 / 作业详情' },
                { k: 'comment' as const, label: '评语' },
              ].map((item) => (
                <div key={item.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{item.label}</span>
                  <Segmented
                    size="small"
                    value={visibility[item.k]}
                    onChange={(v) => setVisibility({ ...visibility, [item.k]: String(v) as never })}
                    options={[...(item.k === 'comment' ? ['全员', '本部门', '不公示'] : ['全员', '本部门', '仅组织者'])].map((x) => ({ label: x, value: x }))}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>公示总闸（关闭则所有榜单与优秀作品对外不可见）</span>
                <Switch defaultChecked={campaign.publicSwitch} onChange={(c) => message.success(c ? '公示已开启' : '公示总闸已关闭，榜单与优秀作品对外不可见')} />
              </div>
              <Button type="primary" onClick={saveVisibility}>保存公示口径</Button>
            </Space>
          </Card>

          <Card size="small" title="功能开关与灰度（PRD 8.4）" style={{ marginTop: 16 }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {[
                { k: 'community' as const, label: '用户社区 M11' },
                { k: 'shop' as const, label: '积分商城 M8' },
                { k: 'clinic' as const, label: '专家门诊 M4' },
                { k: 'wbAdmin' as const, label: '管理员数据 M12' },
                { k: 'anonymousPost' as const, label: '社区匿名发帖（特性级）' },
              ].map((f) => (
                <div key={f.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{f.label}</span>
                  <Space>
                    <Tag color={flags[f.k] ? 'green' : 'default'}>{flags[f.k] ? 'ON' : 'OFF'}</Tag>
                    <Switch size="small" checked={flags[f.k]} onChange={() => toggleFlag(f.k, f.label)} />
                  </Space>
                </div>
              ))}
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              灰度路径：开关默认 OFF → 灰度 1（仅组织者与管理员）→ 灰度 2（按部门放量）→ 灰度 3（按人群）→ 全量 ON。
              任意阶段发现严重问题：开关 OFF 即秒级回滚，数据保留不丢失。
            </Typography.Text>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
