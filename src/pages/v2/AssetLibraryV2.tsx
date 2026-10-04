/**
 * 企业资产库 v2（P3-4 C 端域）
 *
 * 业务口径与 v1 一致：CR-10 外部复用数据源开关、写权限 {ORGANIZER, SKILL_ADMIN, ADMIN}、
 * 「先复制后自算 / 先复制不自算」两种文案分支、价值点公示月度通报。
 */
import { Alert, Button, Empty, Input, Progress, Segmented, Space, Typography, App as AntApp } from 'antd';
import { AppstoreOutlined, SearchOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { SoftTag, TrackTag } from '@/components/ui';
import { ReuseLabel, reuseBarValue, resolveReuse, sumReuse } from '@/components/ReuseStat';
import { useAssetWritable } from '@/auth/converge';
import '../../theme/v2/template.css';

export default function AssetLibraryV2() {
  const { db, me, log, flags } = useStore();
  const { message } = AntApp.useApp();
  /** CR-10：复用次数取外部数据源（开关关闭即回到 V3.0 自算口径） */
  const external = flags.assetReuseExternal !== false;
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
    <div className="wb2-page">
      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">企业资产库</div>
          <div className="wb2-ph-d">优秀成品入驻企业 Skill 库与智能体，复用数据回流为激励依据</div>
        </div>
        <div className="wb2-ph-a">
          <Link to="/work"><Button>去申请入库</Button></Link>
        </div>
      </div>

      {external && (
        <Alert type="info" showIcon
          message="V4.0 CR-10：复用次数取自 WorkBuddy 管理员后台，不再由本系统自算"
          description="每项资产标注「数据来源 + 同步时间」；历史自算值标注为「估算」，尚未同步的显示为「待测」而非 0。口径沿用 Q2 决策的台账路径：由 ADMIN / ORGANIZER / SKILL_ADMIN 在后台导出后导入，或后续开放接口自动同步。"
        />
      )}

      <div className="wb2-metrics c3">
        <div className="wb2-metric">
          <div className="lb"><AppstoreOutlined /> 已入库资产</div>
          <div className="vl accent">{db.assets.length}</div>
          <div className="sb">完成上架并配置可见范围</div>
        </div>
        <div className="wb2-metric">
          <div className="lb"><ThunderboltOutlined /> 累计复用次数</div>
          <div className="vl">{reuseSum}</div>
          <div className="sb">{external ? '仅统计已同步的真实数据（WorkBuddy 后台 / 手工导入）' : '本系统自算口径（V3.0）'}</div>
        </div>
        <div className="wb2-metric">
          <div className="lb"><TeamOutlined /> 去重复用人数</div>
          <div className="vl">{totalUsers}</div>
          <div className="sb">按 unionId 去重</div>
        </div>
      </div>

      <div className="wb2-tools">
        <div className="wb2-inp">
          <SearchOutlined style={{ color: 'var(--wb-ink-4)' }} />
          <input placeholder="搜索资产 / 作者" value={kw} onChange={(e) => setKw(e.target.value)} />
        </div>
        <Segmented value={track} onChange={(v) => setTrack(String(v))} options={['全部', '客户赋能', '团队提效', '销售提效']} />
      </div>

      {list.length === 0 ? (
        <div className="wb2-empty">
          <div className="ic">📦</div>
          <div className="t">暂无资产</div>
          <div className="d">换个赛道或关键词试试</div>
        </div>
      ) : (
        <div className="wb2-cgrid">
          {list.map((a) => (
            <div key={a.id} className="wb2-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
                <SoftTag text={a.type} tone={a.type === 'Skill 包' ? 'purple' : a.type === '智能体' ? 'blue' : 'primary'} />
                <Space size={4}>
                  <TrackTag track={a.track} />
                  {a.restricted && <SoftTag text="受限可见" tone="red" />}
                </Space>
              </div>
              <Typography.Text strong style={{ fontSize: 'var(--wb-fs-subtitle)', lineHeight: 1.45, color: 'var(--wb-ink-1)' }}>
                {a.name}
              </Typography.Text>
              <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 6 }}>
                {a.version} · {a.author_name}（{a.author_dept}）
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-2)', marginBottom: 6, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span><ThunderboltOutlined /></span>
                  <ReuseLabel asset={a} external={external} />
                  <span><TeamOutlined /> {a.reuse_user_count} 人</span>
                </div>
                <Progress
                  percent={Math.min(100, Math.round((reuseBarValue(resolveReuse(a, external)) / 200) * 100))}
                  size="small" strokeColor="var(--wb-primary)" showInfo={false}
                />
              </div>

              <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 8 }}>
                可见范围：{a.visible_scope} · 上架 {a.online_at}
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
              </div>
              {!writable && (
                <div className="wb2-fhint" style={{ marginTop: 8 }}>
                  仅组织者 / 技能管理员 / 系统管理员可新增、编辑、下架与入库
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <section className="wb2-card">
        <div className="wb2-sechd"><div className="t">价值点公示（月度通报）</div></div>
        <div className="wb2-list">
          {db.assets.slice(0, 5).map((a) => (
            <div key={a.id} className="wb2-li">
              <div className="wb2-li-m"><div className="wb2-li-t">{a.name}（{a.author_name}）</div></div>
              <div className="wb2-li-r" style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-2)' }}>
                入库企业库 · <ReuseLabel asset={a} external={external} /> · 被 {a.reuse_user_count} 人复用
              </div>
            </div>
          ))}
        </div>
        <div className="wb2-fhint" style={{ marginTop: 10 }}>
          Q2 决策：入库与调用情况仅做台账回写，实际上架由技能管理员在企业版后台完成。
          {external && ' V4.0 CR-10：复用次数取 WorkBuddy 管理员后台数据（管理员导入或后续 API 自动同步），本系统不自算、不累加；未同步的资产显示「待测」，不显示 0。'}
        </div>
      </section>
    </div>
  );
}
