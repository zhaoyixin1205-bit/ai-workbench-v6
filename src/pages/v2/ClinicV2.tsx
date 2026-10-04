import { Button, Input, Modal, Segmented } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, SearchOutlined, StarFilled } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/store';
import { useClinicBoard, SLOT_STATUS } from '@/hooks/useClinicBoard';
import { SoftTag } from '@/components/ui';
import { DEMO_TODAY } from '@/mock/seedBiz';
import dayjs from 'dayjs';
import '../../theme/v2/template.css';

/**
 * 专家门诊 v2（P3-4）
 *
 * 功能对等（对照 v1 `pages/c/Clinic.tsx`）：
 *   专家检索（姓名 / 擅长 / 部门）+ 三种排序 + 专家数
 *   专家列表卡（头像、姓名、头衔、认证、停诊标记、擅长标签、评分、接诊量、近期可约号、主页链接）
 *   右侧排班：专家简介、按日期归组的号源按钮（可约/已满/停诊/休假 + 图例）、放号规则说明
 *   预约弹窗（形式、地点、卡点描述 ≥5 字 ≤200 字、同段限 1 次与爽约规则）
 *   V6.0 CR-16 专家工作台入口（仅问诊专家可见，受 clinicWorkbench 开关控制）
 *   **P3-4 合并点**：原 /clinic/mine「我的预约」以页头按钮 + 底部「近期预约」摘要卡的方式并入本页，
 *     独立路由 /clinic/mine 仍保留并指向 MyBookingV2（旧链接不死，见路由映射表）。
 */
export default function ClinicV2() {
  const { db, me, flags } = useStore();
  const c = useClinicBoard();

  /** V6.0 CR-16：专家工作台入口开关 + 仅问诊专家可见 */
  const clinicWorkbenchOn = flags.clinicWorkbench !== false;
  const isExpert = db.experts.some((e) => e.union_id === me.union_id);
  const myBookings = db.bookings.filter((x) => x.union_id === me.union_id);

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">专家门诊</div>
          <div className="wb2-ph-d">医院专家门诊模式：看专家 → 看排班 → 约号源 → 就诊 → 评价，卡点不过夜</div>
        </div>
        <div className="wb2-ph-a">
          {clinicWorkbenchOn && isExpert && (
            <Link to="/clinic/workbench"><Button type="primary">我的专家工作台</Button></Link>
          )}
          <Link to="/clinic/mine"><Button>我的预约（{myBookings.length}）</Button></Link>
        </div>
      </div>

      <div className="wb2-tools" style={{ marginBottom: 'var(--wb-space-5)' }}>
        <label className="wb2-inp">
          <SearchOutlined />
          <input
            placeholder="搜索专家姓名 / 擅长领域 / 部门"
            value={c.kw}
            onChange={(e) => c.setKw(e.target.value)}
          />
        </label>
        <Segmented value={c.sort} onChange={(v) => c.setSort(String(v))} options={['评分', '接诊量', '可约时间']} />
        <div className="spacer" />
        <span className="wb2-note">共 {c.experts.length} 位专家</span>
      </div>

      <div className="wb2-grid2">
        {/* 左：专家列表 */}
        <div>
          {c.experts.length === 0 ? (
            <div className="wb2-empty">
              <div className="ic"><SearchOutlined /></div>
              <div className="t">没有匹配的专家</div>
              <div className="d">换个关键词试试，或清空筛选查看全部</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wb-space-3)' }}>
              {c.experts.map((e) => {
                const open = c.openCount(e.id);
                const active = e.id === c.expertId;
                return (
                  <div
                    key={e.id}
                    className="wb2-card"
                    onClick={() => c.setExpertId(e.id)}
                    style={{
                      cursor: 'pointer',
                      borderLeft: active ? '3px solid var(--wb-primary)' : undefined,
                      background: active ? 'var(--wb-surface-band)' : undefined,
                    }}
                  >
                    <div className="wb2-card-pad" style={{ display: 'flex', gap: 'var(--wb-space-4)' }}>
                      <div className={`wb2-av ${e.status === '停诊' ? 'mute' : ''}`}>{e.name.slice(0, 1)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 'var(--wb-fs-lg)', fontWeight: 700, color: 'var(--wb-ink-1)' }}>{e.name}</span>
                          <SoftTag text={e.title} tone="gray" />
                          {e.cert.map((x) => <SoftTag key={x} text={x} tone="purple" />)}
                          {e.status === '停诊' && <SoftTag text="停诊中" tone="gray" />}
                        </div>
                        <div className="wb2-note">{e.dept_name}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 'var(--wb-space-2)' }}>
                          {e.expertise_tags.map((t) => <SoftTag key={t} text={t} tone="primary" />)}
                        </div>
                        <div style={{
                          display: 'flex', gap: 'var(--wb-space-4)', marginTop: 'var(--wb-space-3)',
                          fontSize: 'var(--wb-fs-label)', color: 'var(--wb-ink-2)', flexWrap: 'wrap',
                        }}>
                          <span><StarFilled style={{ color: '#F59E0B' }} /> <b>{e.rating_avg}</b></span>
                          <span>已接诊 <b>{e.serve_count}</b> 次</span>
                          <span style={{ color: open ? 'var(--wb-primary)' : 'var(--wb-ink-3)' }}>
                            <CalendarOutlined /> 近期可约 {open} 个号
                          </span>
                        </div>
                        <div style={{ marginTop: 'var(--wb-space-3)' }}>
                          <Link to={`/clinic/expert/${e.id}`}><Button size="small" type="link" style={{ paddingLeft: 0 }}>专家主页与评价 →</Button></Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 右：排班 */}
        <div>
          <div className="wb2-card">
            <div className="wb2-card-t">
              <CalendarOutlined /> {c.expert?.name ?? '—'} · 未来两周排班
              <span style={{ float: 'right', display: 'flex', gap: 'var(--wb-space-3)' }}>
                {Object.entries(SLOT_STATUS).map(([k, v]) => (
                  <span key={k} className="wb2-note" style={{ fontWeight: 400 }}>
                    <span className="wb2-tag" style={{ background: v.bg, color: v.color, borderColor: v.color }}>
                      <i className="d" style={{ background: v.color }} />{v.text}
                    </span>
                  </span>
                ))}
              </span>
            </div>
            <div className="wb2-card-pad">
              <div className="wb2-note" style={{ marginBottom: 'var(--wb-space-4)' }}>{c.expert?.intro}</div>
              {c.dates.length === 0 ? (
                <div className="wb2-note">该专家暂无排班</div>
              ) : (
                c.dates.map((d) => (
                  <div key={d} style={{ marginBottom: 'var(--wb-space-4)' }}>
                    <div style={{ fontSize: 'var(--wb-fs-label)', fontWeight: 600, marginBottom: 6, color: 'var(--wb-ink-1)' }}>
                      {dayjs(d).format('MM-DD')} · 周{'日一二三四五六'[dayjs(d).day()]}
                      {d === DEMO_TODAY && <span className="wb2-tag wa" style={{ marginLeft: 6 }}><i className="d" />今天</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--wb-space-2)' }}>
                      {c.schedules.filter((s) => s.date === d).map((s) => {
                        const meta = SLOT_STATUS[s.status];
                        const off = s.status !== 'OPEN';
                        return (
                          <div
                            key={s.id}
                            className={`wb2-slot ${off ? 'off' : 'open'}`}
                            title={`${s.type} · ${s.place_or_link} · 已约 ${s.booked}/${s.capacity}`}
                            onClick={() => { if (!off) c.setBooking(s); }}
                          >
                            <div className="sl"><ClockCircleOutlined /> {s.slot}</div>
                            <div className="sm">
                              {meta.text} {s.capacity > 1 ? `(${s.booked}/${s.capacity})` : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              <div className="wb2-note">
                放号规则：默认提前 7 天放号（每周一 10:00 放下周号源）；开始前 2 小时内不可取消（记为已使用）
              </div>
            </div>
          </div>

          {/* 合并点：我的预约摘要（完整记录在 /clinic/mine） */}
          {myBookings.length > 0 && (
            <div className="wb2-card" style={{ marginTop: 'var(--wb-space-5)' }}>
              <div className="wb2-card-t">
                我的预约
                <Link to="/clinic/mine" style={{ float: 'right', fontSize: 'var(--wb-fs-label)', fontWeight: 400 }}>查看全部 →</Link>
              </div>
              <div className="wb2-card-pad">
                <div className="wb2-list">
                  {myBookings.slice(0, 5).map((x) => (
                    <div className="wb2-li" key={x.id}>
                      <i className="wb2-li-dot" style={{
                        background: x.status === '待就诊' ? 'var(--wb-primary)'
                          : x.status === '已完成' ? 'var(--wb-success)' : 'var(--wb-ink-4)',
                      }} />
                      <div className="wb2-li-m">
                        <div className="wb2-li-t">{x.expert_name} · {x.type}</div>
                        <div className="wb2-li-s">{x.date} {x.slot}</div>
                      </div>
                      <div className="wb2-li-r">
                        <span className={`wb2-tag ${x.status === '待就诊' ? 'run' : x.status === '已完成' ? 'ok' : 'id'}`}>
                          <i className="d" />{x.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={!!c.booking}
        title={`预约挂号 · ${c.expert?.name ?? ''} ${c.booking?.date} ${c.booking?.slot}`}
        onCancel={() => c.setBooking(null)}
        onOk={c.book}
        okText="确认预约"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wb-space-3)' }}>
          <div className="wb2-note">
            形式：{c.booking && c.booking.capacity > 1 ? '直播公开课' : '1v1'} · {c.booking?.place_or_link}
          </div>
          <div>
            <div style={{ fontSize: 'var(--wb-fs-label)', fontWeight: 600, marginBottom: 6 }}>卡点描述（必填，≤200 字）</div>
            <Input.TextArea
              rows={4} value={c.question} onChange={(e) => c.setQuestion(e.target.value)}
              placeholder="说清你卡在哪：做了什么、期望什么、实际得到什么"
              maxLength={200} showCount
            />
          </div>
          <div className="wb2-note">
            同一时段同一用户仅可约 1 次；累计 3 次爽约将限制预约 30 天。
          </div>
        </div>
      </Modal>
    </div>
  );
}
