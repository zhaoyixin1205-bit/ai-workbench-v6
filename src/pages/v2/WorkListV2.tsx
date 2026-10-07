import { Button, Tag, App as AntApp } from 'antd';
import { FormOutlined, ClockCircleOutlined, CheckCircleOutlined, InboxOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/store';
import { useWorkBoard } from '@/hooks/useWorkBoard';
import { useUIVersion } from '@/ui/UIVersionProvider';
/* V8.2-10.07：作业公开后成员可主动加入（选修），名单区分必修 / 选修 */
import { joinableOf, participantsOf } from '@/utils/assignmentParticipants';
import { SubmitStatusTag } from '@/pages/c/WorkList';
import { TrackTag } from '@/components/ui';
import { trackVar } from '@/theme/v2/track';
import { DEMO_TODAY } from '@/mock/seedBiz';
import '../../theme/v2/template.css';

/**
 * 作业提报列表 v2（P3-4）
 *
 * 功能对等（对照 v1 `pages/c/WorkList.tsx`）：
 *   当前任务卡（赛道/期数/时间窗/模板/评分卡/迟交规则/额度进度/距截止天数）
 *   三分組列表（待提报 / 已提报 / 已撤回）+ 每条的编号、渠道、提交时间、迟交、已入库标记
 *   逐条操作（查看详情 / 撤回 / 申请入库）
 *   团队进度（提报数 / 已出分 / 达标 / 平均分 + 成员分数 tags）
 * 行为复用 `useWorkBoard`，与 v1 同源，v1 一行未改。
 */
export default function WorkListV2() {
  const { db, me, setDb, log } = useStore();
  const { message } = AntApp.useApp();
  const { version } = useUIVersion();
  const {
    type, period, scoreCard, daysLeft,
    mine, teamSubmits, usedTimes, canSubmit, groups,
    withdraw, applyAsset,
  } = useWorkBoard();

  /* V8.2-10.07：我的参加身份（必修 / 选修）；作业公开时名单外成员可主动加入（选修） */
  const myPart = type ? participantsOf(type).find((p) => p.union_id === me.union_id) : undefined;
  const joinable = joinableOf(db.assignmentTypes, me.union_id);

  const join = (t: NonNullable<typeof type>) => {
    setDb((p) => ({
      ...p,
      assignmentTypes: p.assignmentTypes.map((x) => (x.id === t.id ? {
        ...x,
        participants: [...(x.participants ?? []), {
          union_id: me.union_id, name: me.name, dept_name: me.dept_names?.[0] ?? '',
          kind: 'ELECTIVE' as const, source: 'SELF_JOIN' as const, joined_at: DEMO_TODAY,
        }],
      } : x)),
    }));
    log('主动加入作业', t.name, '以「选修」身份加入（成员自选，不进首页 To Do 提醒）');
    message.success(`已加入「${t.name}」，以选修身份计入参加名单`);
  };

  const avg = teamSubmits.length
    ? Math.round(teamSubmits.reduce((a, b) => a + (b.final_score ?? 0), 0) / teamSubmits.length)
    : 0;

  if (!type) {
    return (
      <div className="wb2-empty">
        <div className="ic"><InboxOutlined /></div>
        <div className="t">暂无作业类型</div>
        <div className="d">组织者尚未配置作业类型，请稍后再来</div>
      </div>
    );
  }

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">作业提报</div>
          <div className="wb2-ph-d">
            按组织者配置的模板提报；默认每人每期 1 次，批改前且截止前可反复修改
          </div>
        </div>
        <div className="wb2-ph-a">
          {canSubmit ? (
            <Link to={`/work/submit/${type.id}${version === 'v2' ? '' : ''}`}>
              <Button type="primary" size="large" icon={<FormOutlined />}>去提报</Button>
            </Link>
          ) : (
            <Button size="large" disabled>本期已提报 {usedTimes} 次</Button>
          )}
        </div>
      </div>

      {/* 当前作业任务 */}
      <div className="wb2-card" style={{ borderLeft: '3px solid var(--wb-primary)', marginBottom: 'var(--wb-space-5)' }}>
        <div className="wb2-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--wb-space-3)', flexWrap: 'wrap' }}>
            <span className="wb2-tag run">
              <i className="d" />
              {type.code} · 第 {period?.seq ?? '—'} 期
            </span>
            <span style={{ fontSize: 'var(--wb-fs-lg)', fontWeight: 700, color: 'var(--wb-ink-1)' }}>{type.name}</span>
            {/* V8.2-10.07：参加身份（必修 / 选修）；未加入且作业公开时可主动加入 */}
            {myPart && (
              <span className={`wb2-tag ${myPart.kind === 'REQUIRED' ? 'er' : 'ok'}`}>
                <i className="d" />{myPart.kind === 'REQUIRED' ? '我必须参加' : '我选修加入'}
              </span>
            )}
            {!myPart && type.open_join && (
              <Button size="small" type="primary" onClick={() => join(type)}>加入作业（选修）</Button>
            )}
          </div>
          <div className="wb2-note" style={{ marginTop: 'var(--wb-space-3)' }}>
            提报对象：{type.target_scope} ｜ 时间窗 {period?.start_at ?? '—'} ~ {period?.end_at ?? '—'} ｜ 提交物模板：{type.form_template}
          </div>
          <div className="wb2-note">
            绑定评分卡：{scoreCard?.name ?? '—'} {type.score_card_version} ｜ 迟交规则：{type.late_rule}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--wb-space-4)',
            flexWrap: 'wrap', marginTop: 'var(--wb-space-4)',
          }}>
            <div className="wb2-prog" style={{ flex: 1, maxWidth: 280, marginTop: 0 }}>
              <i style={{ width: `${Math.min(100, (usedTimes / type.max_times) * 100)}%`, background: 'var(--wb-primary)' }} />
            </div>
            <span className="wb2-note">已用 {usedTimes}/{type.max_times} 次</span>
            <span className={`wb2-tag ${daysLeft <= 3 ? 'er' : 'wa'}`}>
              <i className="d" />
              <ClockCircleOutlined /> 距截止 {daysLeft} 天
            </span>
          </div>
        </div>
      </div>

      {/* V8.2-10.07：组织者公开后的作业，名单外成员可主动加入（选修）—— 与 v1 同构 */}
      {joinable.length > 0 && (
        <div className="wb2-card" style={{ marginBottom: 'var(--wb-space-5)' }}>
          <div className="wb2-card-t">可加入的作业（选修）</div>
          <div className="wb2-list">
            {joinable.map((t) => (
              <div className="wb2-li" key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--wb-space-3)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--wb-ink-1)' }}>{t.name}</div>
                  <div className="wb2-note">{t.code} · 提报对象 {t.target_scope}</div>
                </div>
                <Button size="small" type="primary" onClick={() => join(t)}>加入（选修）</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 三个分组 */}
      {groups.map((g) => (
        <div className="wb2-card" key={g.key} style={{ marginBottom: 'var(--wb-space-5)' }}>
          <div className="wb2-card-t">{g.title}</div>
          {g.items.length === 0 ? (
            <div className="wb2-card-pad">
              <div className="wb2-note">{g.key === 'todo' ? '没有待提报的作业' : '暂无记录'}</div>
            </div>
          ) : (
            <div className="wb2-list">
              {g.items.map((s) => (
                <div className="wb2-li" key={s.id}>
                  <i className="wb2-li-dot" style={{ background: trackVar(s.track) }} />
                  <div className="wb2-li-m">
                    <div className="wb2-li-t">
                      <Link to={`/work/${s.id}`}>{s.title}</Link>
                    </div>
                    <div className="wb2-li-s">
                      编号 {s.code} · {s.channel} · 提交于 {s.submitted_at}
                      {s.late && <Tag color="red" style={{ marginLeft: 6 }}>迟交</Tag>}
                      {s.status === 'ASSET_ONLINE' && (
                        <Tag color="green" style={{ marginLeft: 6 }}><InboxOutlined /> 已入库</Tag>
                      )}
                    </div>
                  </div>
                  <div className="wb2-li-r">
                    <SubmitStatusTag status={s.status} />
                    <TrackTag track={s.track} />
                    {s.final_score !== undefined && <span className="wb2-tag wa"><i className="d" />{s.final_score} 分</span>}
                    <Link to={`/work/${s.id}`}><Button size="small" type="link">详情</Button></Link>
                    {['SUBMITTED', 'AI_SCORED'].includes(s.status) && !s.late && (
                      <Button size="small" type="link" danger onClick={() => withdraw(s)}>撤回</Button>
                    )}
                    {['PASSED', 'PUBLISHED', 'REVIEWED'].includes(s.status) && (
                      <Button size="small" type="link" onClick={() => applyAsset(s)}>申请入库</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 团队进度 */}
      {me.scope_type !== 'SELF' && (
        <div className="wb2-card">
          <div className="wb2-card-t">
            <CheckCircleOutlined /> 本团队提报进度（可见范围：{me.scope_type === 'ALL' ? '全事业群' : '本部门及下级'}）
          </div>
          <div className="wb2-card-pad">
            <div className="wb2-metrics c6">
              <div className="wb2-metric">
                <div className="lb">本团队提报数</div>
                <div className="vl">{teamSubmits.length}</div>
              </div>
              <div className="wb2-metric">
                <div className="lb">已出分</div>
                <div className="vl">{teamSubmits.filter((s) => s.final_score !== undefined).length}</div>
              </div>
              <div className="wb2-metric">
                <div className="lb">达标（≥60）</div>
                <div className="vl">{teamSubmits.filter((s) => (s.final_score ?? 0) >= 60).length}</div>
              </div>
              <div className="wb2-metric">
                <div className="lb">平均分</div>
                <div className="vl">{avg}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--wb-space-2)', marginTop: 'var(--wb-space-4)' }}>
              {teamSubmits.slice(0, 20).map((s) => (
                <span key={s.id} className={`wb2-tag ${s.final_score !== undefined ? 'ok' : 'id'}`}>
                  <i className="d" />
                  {s.name} {s.final_score !== undefined ? `${s.final_score} 分` : '待评分'}
                </span>
              ))}
            </div>
            <div className="wb2-note" style={{ marginTop: 'var(--wb-space-3)' }}>演示日期 {DEMO_TODAY}</div>
          </div>
        </div>
      )}
    </div>
  );
}
