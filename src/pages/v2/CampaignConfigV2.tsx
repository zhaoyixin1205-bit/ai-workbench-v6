import { Button, DatePicker, InputNumber, Segmented, Steps, Switch, Table, Tag, App as AntApp } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme/v2';
import { DEMO_TODAY } from '@/mock/seedBiz';
import dayjs from 'dayjs';
import '../../theme/v2/template.css';

/**
 * 届次与配置 v2（P3-5 后台域）
 *
 * 相对 v1 的**纯视觉**变化：
 *   ① 外层 Space+Card 堆叠 → `.wb2-ph` 页头 + `.wb2-card` 分区（去掉 Card 的默认内边距差）
 *   ② 两条 Alert（info/warning 整块底色）→ `.wb2-alert`（中性底 + 左 3px 语义条）
 *   ③ 开关清单 → `.wb2-setrow`（细线分隔，说明文字下沉为 caption，不再与 label 抢视觉）
 *   ④ 状态 Tag 由 `color="orange"/"green"` → `.wb2-tag`（中性底 + 彩色点）
 *   ⑤ `COLOR.textSub` / 裸 fontSize 数字 → 令牌
 *
 * 业务：届次复制、时间窗、积分规则、公示口径、功能开关全部沿用 v1 的 handler，
 * 开关清单（V6.0 15 项 + V7.0 增量）逐条保留，未增删任何一项。
 */

export default function CampaignConfigV2() {
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

  /** 开关行：ON → ok 档，OFF → id 档（只取 4 档语义色，不用 v1 的绿/灰两套） */
  const flagRow = (k: keyof typeof flags, label: string) => (
    <div className="wb2-setrow" key={k}>
      <div className="nm">{label}</div>
      <div className="ct">
        <span className={`wb2-tag ${flags[k] ? 'ok' : 'id'}`}><i className="d" />{flags[k] ? 'ON' : 'OFF'}</span>
        <Switch size="small" checked={flags[k]} onChange={() => toggleFlag(k, label)} />
      </div>
    </div>
  );

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <h2 className="wb2-ph-t">届次与配置</h2>
          <div className="wb2-ph-d">多届支持，历史届次数据可回溯</div>
        </div>
      </div>

      {/* ---------- 当前届次 ---------- */}
      <div className="wb2-card wb2-card-pad" style={{ marginBottom: 'var(--wb-space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--wb-space-3)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--wb-fs-subtitle)', fontWeight: 600, color: COLOR.ink1 }}>
            当前届次：{campaign.name}
          </span>
          <span className="wb2-tag wa"><i className="d" />{campaign.status}</span>
          <span style={{ fontSize: 'var(--wb-fs-label)', color: COLOR.ink3 }}>
            {campaign.start_date} ~ {campaign.end_date}
          </span>
          <span style={{ flex: 1 }} />
          <Button onClick={() => { log('复制届次', campaign.name, '复制案例、选题与规则配置'); message.success('已复制为上届配置（减少重复配置工作量）'); }}>一键复制上届</Button>
          <Button type="primary" onClick={() => message.success('已创建新届次草稿（多届支持，历史届次数据可回溯）')}>创建新届次</Button>
        </div>
        <Steps
          style={{ marginTop: 'var(--wb-space-5)' }}
          size="small" current={2}
          items={campaign.stages.map((s) => ({ title: s.name, description: `${s.start} ~ ${s.end}` }))}
        />
      </div>

      <div className="wb2-grid2">
        {/* ---------- 左列 ---------- */}
        <div>
          <div className="wb2-card wb2-card-pad" style={{ marginBottom: 'var(--wb-space-5)' }}>
            <div className="wb2-card-t">时间窗配置</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--wb-space-3)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--wb-fs-label)', color: COLOR.ink2 }}>启动日</span>
              <DatePicker defaultValue={dayjs(campaign.start_date)} />
              <span style={{ fontSize: 'var(--wb-fs-label)', color: COLOR.ink2 }}>结束日</span>
              <DatePicker defaultValue={dayjs(campaign.end_date)} />
            </div>
            <div className="wb2-note" style={{ marginTop: 'var(--wb-space-3)' }}>
              影响提报与榜单，不影响历史数据；演示基准日 {DEMO_TODAY}
            </div>
            <Button type="primary" style={{ marginTop: 'var(--wb-space-4)' }} onClick={() => message.success('时间窗已保存')}>保存时间窗</Button>
          </div>

          <div className="wb2-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: 'var(--wb-space-5) var(--wb-space-6) var(--wb-space-4)' }}>
              <div className="wb2-card-t" style={{ marginBottom: 0 }}>积分规则</div>
            </div>
            <div style={{ padding: '0 var(--wb-space-6)' }}>
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
            </div>
            <div style={{ padding: 'var(--wb-space-4) var(--wb-space-6) var(--wb-space-5)' }}>
              <div className="wb2-note">
                规则变更仅对新行为生效；设置个人与部门积分上限防止积分超发导致成本失控。
              </div>
              <Button style={{ marginTop: 'var(--wb-space-3)' }} onClick={() => message.success('积分规则已保存')}>保存规则</Button>
            </div>
          </div>
        </div>

        {/* ---------- 右列 ---------- */}
        <div>
          <div className="wb2-card wb2-card-pad" style={{ marginBottom: 'var(--wb-space-5)' }}>
            <div className="wb2-card-t">公示口径（Q9：默认 + 管理员可配）</div>
            <div className="wb2-alert">
              <div className="bd">
                <div className="t">默认：榜单全员可见、提报 / 作业详情仅本部门可见；评语默认不公示</div>
                <div className="d">分数与排名可公示；涉及客户信息的内容一律不公示。</div>
              </div>
            </div>
            {[
              { k: 'leaderboard' as const, label: '榜单（排名与分数）' },
              { k: 'workDetail' as const, label: '提报 / 作业详情' },
              { k: 'comment' as const, label: '评语' },
            ].map((item) => (
              <div className="wb2-setrow" key={item.k}>
                <div className="nm">{item.label}</div>
                <div className="ct">
                  <Segmented
                    size="small"
                    value={visibility[item.k]}
                    onChange={(v) => setVisibility({ ...visibility, [item.k]: String(v) as never })}
                    options={[...(item.k === 'comment' ? ['全员', '本部门', '不公示'] : ['全员', '本部门', '仅组织者'])].map((x) => ({ label: x, value: x }))}
                  />
                </div>
              </div>
            ))}
            <div className="wb2-setrow">
              <div className="nm">
                公示总闸
                <div className="ds">关闭则所有榜单与优秀作品对外不可见</div>
              </div>
              <div className="ct">
                <Switch defaultChecked={campaign.publicSwitch} onChange={(c) => message.success(c ? '公示已开启' : '公示总闸已关闭，榜单与优秀作品对外不可见')} />
              </div>
            </div>
            <Button type="primary" style={{ marginTop: 'var(--wb-space-4)' }} onClick={saveVisibility}>保存公示口径</Button>
          </div>

          <div className="wb2-card wb2-card-pad">
            <div className="wb2-card-t">功能开关与灰度（PRD 8.4）</div>
            {(['community', 'shop', 'clinic', 'wbAdmin', 'anonymousPost', 'homeAnnounceTicker'] as const).map((k) => flagRow(k, {
              community: '用户社区 M11',
              shop: '积分商城 M8',
              clinic: '专家门诊 M4',
              wbAdmin: '管理员数据 M12',
              anonymousPost: '社区匿名发帖（特性级）',
              homeAnnounceTicker: 'V6.0 CR-13 首页公告条置顶轮播（关闭=公告回右下角 ≡ V5.0）',
            }[k]))}

            <div style={{
              fontSize: 'var(--wb-fs-caption)', fontWeight: 700, color: COLOR.ink3,
              margin: 'var(--wb-space-5) 0 var(--wb-space-2)',
            }}>V6.0 增量开关（关闭即回 V5.0 行为）</div>
            {(['topicCustom', 'workNoTopic', 'submitFlowV2', 'bountySolutionV2', 'homeJudgeEntry', 'clinicWorkbench', 'adminCoreConverge', 'teamView', 'submitFlowControl', 'scoreCardLifecycle', 'judgeOverride', 'expertScheduleBatch', 'assetLedgerBatch', 'contentFullCrud', 'shopBatch', 'realFileService'] as const).map((k) => flagRow(k, {
              topicCustom: 'CR-17 选题「其他·自定义」与私有可见',
              workNoTopic: 'CR-18 提报支持「不选选题」直提',
              submitFlowV2: 'CR-19 状态机 V2（已完成/已共识 + 公示解耦）',
              bountySolutionV2: 'CR-20/21 悬赏方案结构化 + 修改/补充双通道',
              homeJudgeEntry: 'CR-15 首页评委复核入口（仅 JUDGE）',
              clinicWorkbench: 'CR-16 专家工作台下沉 /clinic/workbench',
              adminCoreConverge: 'CR-22 后台三板块收窄为组织者/管理员（⚠ 必须与 CR-30 团队视图同批）',
              teamView: 'CR-30 负责人团队视图 /team（收窄后的补偿入口）',
              submitFlowControl: 'CR-23 作业流转编排（白名单 + 理由必填 + 二次确认）',
              scoreCardLifecycle: 'CR-24 评分卡生命周期（新建/复制/停用/删除）',
              judgeOverride: 'CR-25 组织者覆盖评委复核（覆盖非覆写）',
              expertScheduleBatch: 'CR-26 专家排班批量导入与直接改约',
              assetLedgerBatch: 'CR-27 资产台账批量导入 / 批量调整 / 软删',
              contentFullCrud: 'CR-28 内容管理四 Tab 全维度 CRUD',
              shopBatch: 'CR-29 商城商品批量导入与批量软删',
              realFileService: 'CR-31 真实文件服务（关闭 ≡ A-39 演示态：只登记文件名，无法下载）',
            }[k]))}

            <div className="wb2-note" style={{ marginTop: 'var(--wb-space-4)' }}>
              灰度路径：开关默认 OFF → 灰度 1（仅组织者与管理员）→ 灰度 2（按部门放量）→ 灰度 3（按人群）→ 全量 ON。
              任意阶段发现严重问题：开关 OFF 即秒级回滚，数据保留不丢失。
            </div>
          </div>
        </div>
      </div>

      <div className="wb2-note" style={{ marginTop: 'var(--wb-space-5)' }}>
        共 {Object.keys(flags).length} 个开关 · 当前届次 {campaign.name} · 演示基准日 {DEMO_TODAY}
      </div>
    </div>
  );
}
