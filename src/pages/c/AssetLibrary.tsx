import { Card, Col, Empty, Input, Progress, Row, Segmented, Space, Statistic, Tag, Typography, Button, App as AntApp, Alert } from 'antd';
import { AppstoreOutlined, SearchOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, SoftTag, StatCard, TrackTag } from '@/components/ui';
import { ReuseLabel, reuseBarValue, resolveReuse, sumReuse } from '@/components/ReuseStat';
import { useAssetWritable } from '@/auth/converge';

export default function AssetLibrary() {
  const { db, me, log, flags } = useStore();
  const { message } = AntApp.useApp();
  /** V4.0 CR-10：复用次数取外部数据源（开关关闭即回到 V3.0 自算口径） */
  const external = flags.assetReuseExternal !== false;
  /** V4.0 CR-10：资产写权限 = {ORGANIZER, SKILL_ADMIN, ADMIN} */
  const writable = useAssetWritable();
  const [kw, setKw] = useState('');
  const [track, setTrack] = useState('全部');

  const list = useMemo(
    () => db.assets.filter((a) => {
      if (track !== '全部' && a.track !== track) return false;
      if (kw && !`${a.name}${a.author_name}${a.type}`.includes(kw)) return false;
      return true;
    }),
    [db.assets, kw, track]
  );

  const reuseSum = sumReuse(db.assets, external);
  const totalUsers = db.assets.reduce((a, b) => a + b.reuse_user_count, 0);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="企业资产库"
        desc="优秀成品入驻企业 Skill 库与智能体，复用数据回流为激励依据"
        extra={<Link to="/work"><Button size="large">去申请入库</Button></Link>}
      />

      {external && (
        <Alert type="info" showIcon
          message="V4.0 CR-10：复用次数取自 WorkBuddy 管理员后台，不再由本系统自算"
          description="每项资产标注「数据来源 + 同步时间」；历史自算值标注为「估算」，尚未同步的显示为「待测」而非 0。口径沿用 Q2 决策的台账路径：由 ADMIN / ORGANIZER / SKILL_ADMIN 在后台导出后导入，或后续开放接口自动同步。" />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={8}><StatCard icon={<AppstoreOutlined />} label="已入库资产" value={db.assets.length} sub="完成上架并配置可见范围" /></Col>
        <Col xs={8}><StatCard icon={<ThunderboltOutlined />} label="累计复用次数" value={reuseSum} sub={external ? '仅统计已同步的真实数据（WorkBuddy 后台 / 手工导入）' : '本系统自算口径（V3.0）'} tone="blue" /></Col>
        <Col xs={8}><StatCard icon={<TeamOutlined />} label="去重复用人数" value={totalUsers} sub="按 unionId 去重" tone="purple" /></Col>
      </Row>

      <Card styles={{ body: { padding: 16 } }}>
        <Space wrap size={12}>
          <Input allowClear prefix={<SearchOutlined style={{ color: COLOR.textMuted }} />} placeholder="搜索资产 / 作者" style={{ width: 220 }} value={kw} onChange={(e) => setKw(e.target.value)} />
          <Segmented value={track} onChange={(v) => setTrack(String(v))} options={['全部', '客户赋能', '团队提效', '销售提效']} />
        </Space>
      </Card>

      {list.length === 0 ? (
        <Card><Empty description="暂无资产" /></Card>
      ) : (
        <Row gutter={[16, 16]}>
          {list.map((a) => (
            <Col xs={24} sm={12} lg={8} key={a.id}>
              <div className="wb-card wb-card-hover" style={{ padding: 18, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <SoftTag text={a.type} tone={a.type === 'Skill 包' ? 'purple' : a.type === '智能体' ? 'blue' : 'primary'} />
                  <Space size={4}>
                    <TrackTag track={a.track} />
                    {a.restricted && <SoftTag text="受限可见" tone="red" />}
                  </Space>
                </div>
                <Typography.Text strong style={{ fontSize: 16, lineHeight: 1.45 }}>{a.name}</Typography.Text>
                <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 6 }}>
                  {a.version} · {a.author_name}（{a.author_dept}）
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: COLOR.textSub, marginBottom: 6 }}>
                    <Space size={8} wrap>
                      <span><ThunderboltOutlined /></span>
                      <ReuseLabel asset={a} external={external} />
                      <span><TeamOutlined /> {a.reuse_user_count} 人</span>
                    </Space>
                  </div>
                  <Progress
                    percent={Math.min(100, Math.round((reuseBarValue(resolveReuse(a, external)) / 200) * 100))}
                    size="small" strokeColor={COLOR.primary} showInfo={false}
                  />
                </div>
                <div style={{ fontSize: 11, color: COLOR.textMuted, marginTop: 8 }}>
                  可见范围：{a.visible_scope} · 上架 {a.online_at}
                </div>
                <Space size={6} wrap style={{ marginTop: 12 }}>
                  {external ? (
                    <Button
                      size="small" type="primary" ghost
                      onClick={() => {
                        log('复制资产链接', a.name, '本系统不自算复用次数');
                        message.success('链接已复制；复用次数将在后台同步后自动更新，本系统不再自算累加');
                      }}
                    >复制链接</Button>
                  ) : (
                    <Button
                      size="small" type="primary" ghost
                      onClick={() => { log('复用资产', a.name, '记录一次复用行为'); message.success('已记录一次复用，复用数据将回流为激励依据'); }}
                    >复制并复用</Button>
                  )}
                  {!writable && (
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      仅组织者 / 技能管理员 / 系统管理员可新增、编辑、下架与入库
                    </Typography.Text>
                  )}
                </Space>
              </div>
            </Col>
          ))}
        </Row>
      )}

      <Card size="small" title="价值点公示（月度通报）">
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {db.assets.slice(0, 5).map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{a.name}（{a.author_name}）</span>
              <span className="num">入库企业库 · <ReuseLabel asset={a} external={external} /> · 被 {a.reuse_user_count} 人复用</span>
            </div>
          ))}
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          Q2 决策：入库与调用情况仅做台账回写，实际上架由技能管理员在企业版后台完成。
          {external && ' V4.0 CR-10：复用次数取 WorkBuddy 管理员后台数据（管理员导入或后续 API 自动同步），本系统不自算、不累加；未同步的资产显示「待测」，不显示 0。'}
        </Typography.Text>
      </Card>
    </Space>
  );
}
