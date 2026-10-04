/**
 * 专家详情 v2（P3-4）
 *
 * 功能对等清单（对照 v1 pages/c/ExpertDetail.tsx，逐条保留）：
 *   ①专家身份卡（头像 / 姓名 / 头衔 / 认证 / 停诊标记 / 部门 / 擅长标签 / 简介）
 *   ②三指标（综合评分 / 累计接诊 / 接诊积分）+ 好评率进度
 *   ③就诊评价列表（最新 N 条，含三维评分与匿名处理）
 *   ④历史答疑纪要（可检索，固定三条演示数据）
 *   ⑤近期可约号源（前 8 条 OPEN）
 *   ⑥底部固定「预约挂号」操作条（停诊时禁用并改文案）
 *   ⑦预约弹窗（卡点描述必填 ≤200 字，分配最近可用号源，写 bookings + schedules.booked+1 + log）
 *
 * 刻意没改：预约的业务口径（分配 schedules[0]、类型按 capacity>1 判直播）、
 *          三维评分字段名、评价的匿名判定 —— 均照搬 v1。
 */
import { Button, Input, Modal, Rate, App as AntApp } from 'antd';
import { MedicineBoxOutlined, StarFilled, TrophyOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { DEMO_TODAY } from '@/mock/seedBiz';
import '../../theme/v2/template.css';

export default function ExpertDetailV2() {
  const { id } = useParams();
  const { db, me, setDb, log } = useStore();
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');

  const e = db.experts.find((x) => x.id === id);

  /* Hooks 规则：条件早退必须放在所有 Hook 之后 */
  if (!e) {
    return (
      <div className="wb2-empty">
        <div className="wb2-empty-t">专家不存在</div>
        <div className="wb2-empty-d">该专家可能已下线，或链接有误</div>
        <Link to="/clinic"><Button type="primary">返回专家门诊</Button></Link>
      </div>
    );
  }

  const reviews = db.reviews.filter((r) => r.expert_id === e.id && !r.hidden);
  const schedules = db.schedules.filter((s) => s.expert_id === e.id && s.status === 'OPEN').slice(0, 8);
  const minutes = [
    { id: 'M1', title: '提示词调优：让输出从「像财报」变成「人话」', date: '2026-09-22', tags: ['提示词', '客户赋能'], views: 128 },
    { id: 'M2', title: 'Skill 包结构校验失败的 5 个常见原因', date: '2026-09-19', tags: ['Skill 打包'], views: 96 },
    { id: 'M3', title: '企业知识库怎么用才不「答非所问」', date: '2026-09-15', tags: ['知识库'], views: 74 },
  ];
  const goodRate = Math.round((reviews.filter((r) => r.rating >= 4).length / Math.max(1, reviews.length)) * 100);

  const book = () => {
    if (question.trim().length < 5) { message.warning('请填写卡点描述'); return; }
    const sc = schedules[0];
    if (!sc) { message.warning('暂无可约号源'); return; }
    setDb((p) => ({
      ...p,
      bookings: [{
        id: `BK${Date.now()}`, schedule_id: sc.id, expert_id: e.id, expert_name: e.name,
        union_id: me.union_id, name: me.name, question, date: sc.date, slot: sc.slot,
        type: sc.capacity > 1 ? '直播' : '1v1', status: '待就诊', reviewed: false,
      }, ...p.bookings],
      schedules: p.schedules.map((x) => (x.id === sc.id ? { ...x, booked: x.booked + 1 } : x)),
    }));
    log('预约专家号源', `${e.name} ${sc.date} ${sc.slot}`, '从专家主页发起');
    message.success('预约成功');
    setOpen(false); setQuestion('');
  };

  return (
    <div>
      {/* ① 身份卡 —— v2：去掉渐变与投影，改用品牌底色带 */}
      <div className="wb2-card" style={{ marginBottom: 'var(--wb-space-4)' }}>
        <div className="wb2-card-pad" style={{ background: 'var(--wb-surface-brand)', borderBottom: '1px solid var(--wb-border-light)' }}>
          <div style={{ display: 'flex', gap: 'var(--wb-space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="wb2-av" style={{ width: 64, height: 64, fontSize: 26, flex: '0 0 64px' }}>
              {e.name.slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', gap: 'var(--wb-space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="wb2-ph-t" style={{ marginBottom: 0 }}>{e.name}</span>
                <span className="wb2-tag">{e.title}</span>
                {e.cert.map((c) => <span key={c} className="wb2-tag t-purple">{c}</span>)}
                {e.status === '停诊' && <span className="wb2-tag t-red">停诊中</span>}
              </div>
              <div className="wb2-ph-d" style={{ marginTop: 4 }}>{e.dept_name}</div>
              <div style={{ marginTop: 'var(--wb-space-3)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {e.expertise_tags.map((t) => <span key={t} className="wb2-tag t-primary">{t}</span>)}
              </div>
              <div style={{ marginTop: 'var(--wb-space-3)', fontSize: 'var(--wb-fs-body)', color: 'var(--wb-ink-2)', lineHeight: 1.75 }}>
                {e.intro}
              </div>
            </div>
          </div>
        </div>

        <div className="wb2-card-pad">
          {/* ② 三指标 + 好评率 */}
          <div className="wb2-metrics">
            <div className="wb2-metric">
              <div className="wb2-metric-l"><StarFilled /> 综合评分</div>
              <div className="wb2-metric-v">{e.rating_avg}</div>
              <div className="wb2-metric-s">基于 {reviews.length} 条评价</div>
            </div>
            <div className="wb2-metric">
              <div className="wb2-metric-l"><MedicineBoxOutlined /> 累计接诊</div>
              <div className="wb2-metric-v">{e.serve_count}</div>
              <div className="wb2-metric-s">次</div>
            </div>
            <div className="wb2-metric">
              <div className="wb2-metric-l"><TrophyOutlined /> 接诊积分</div>
              <div className="wb2-metric-v">{e.points}</div>
              <div className="wb2-metric-s">积分入账</div>
            </div>
          </div>
          <div className="wb2-dist" style={{ marginTop: 'var(--wb-space-4)' }}>
            <span className="nm">好评率</span>
            <span className="bar"><span className="wb2-prog"><i style={{ width: `${goodRate}%` }} /></span></span>
            <span className="vv">{goodRate}%</span>
          </div>
        </div>
      </div>

      <div className="wb2-grid2">
        {/* ③ 就诊评价 */}
        <div className="wb2-card">
          <div className="wb2-card-pad">
            <div className="wb2-card-t">就诊评价（最新 {Math.min(10, reviews.length)} 条）</div>
            {reviews.length === 0 ? (
              <div className="wb2-empty">
                <div className="wb2-empty-d">暂无评价</div>
              </div>
            ) : (
              <div className="wb2-list">
                {reviews.map((r) => (
                  <div key={r.id} className="wb2-li">
                    <div className="wb2-av">{r.anonymous ? '匿' : (db.users.find((u) => u.union_id === r.rater_union_id)?.name ?? '?').slice(0, 1)}</div>
                    <div className="wb2-li-m">
                      <div className="wb2-li-t">
                        {r.anonymous ? '匿名用户' : db.users.find((u) => u.union_id === r.rater_union_id)?.name}
                        <Rate disabled allowHalf value={r.rating} style={{ fontSize: 12, marginLeft: 8 }} />
                      </div>
                      <div className="wb2-li-d">
                        专业 {r.dim_scores.专业度} · 响应 {r.dim_scores.响应速度} · 解决 {r.dim_scores.解决问题程度}
                      </div>
                      <div style={{ marginTop: 4, color: 'var(--wb-ink-2)' }}>{r.comment}</div>
                    </div>
                    <div className="wb2-li-r">{r.created_at}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          {/* ④ 历史答疑纪要 */}
          <div className="wb2-card" style={{ marginBottom: 'var(--wb-space-4)' }}>
            <div className="wb2-card-pad">
              <div className="wb2-card-t">历史答疑纪要（可检索）</div>
              <div className="wb2-list">
                {minutes.map((m) => (
                  <div key={m.id} className="wb2-li">
                    <div className="wb2-li-m">
                      <div className="wb2-li-t">{m.title}</div>
                      <div className="wb2-li-d">
                        {m.date} · {m.views} 次检索
                        {m.tags.map((t) => <span key={t} className="wb2-tag" style={{ marginLeft: 4 }}>{t}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ⑤ 近期可约号源 */}
          <div className="wb2-card">
            <div className="wb2-card-pad">
              <div className="wb2-card-t">近期可约号源</div>
              {schedules.length === 0 ? (
                <div className="wb2-empty-d">暂无号源</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--wb-space-2)' }}>
                  {schedules.map((s) => (
                    <span key={s.id} className="wb2-slot open">
                      <span className="sl">{s.date.slice(5)} {s.slot}</span>
                      <span className="sm">{s.capacity > 1 ? '直播' : '1v1'}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ⑥ 底部固定操作条 */}
      <div className="wb2-actbar">
        <Button type="primary" size="large" icon={<MedicineBoxOutlined />} disabled={e.status === '停诊'} onClick={() => setOpen(true)}>
          {e.status === '停诊' ? '该专家已停诊' : '预约挂号'}
        </Button>
      </div>

      {/* ⑦ 预约弹窗 */}
      <Modal open={open} title={`预约挂号 · ${e.name}`} onCancel={() => setOpen(false)} onOk={book} okText="确认预约">
        <div className="wb2-note">
          将为你分配最近的可用号源：{schedules[0] ? `${schedules[0].date} ${schedules[0].slot}` : '暂无'}
        </div>
        <Input.TextArea rows={4} value={question} onChange={(ev) => setQuestion(ev.target.value)}
          placeholder="卡点描述（必填，≤200 字）" maxLength={200} showCount />
        <div className="wb2-fhint">演示日期 {DEMO_TODAY}</div>
      </Modal>
    </div>
  );
}
