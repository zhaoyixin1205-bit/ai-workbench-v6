import { Button, Input, InputNumber, Table, App as AntApp } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme/v2';
import type { ScoreCard, ScoreDimension } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { useSkillAdminConverge } from '@/auth/converge';
import { ScopeNotice } from '@/components/ScopeNotice';
import { Dialog, DialogField, useConfirm } from '@/components/v2/Dialog';
import '../../theme/v2/template.css';

/** 由结构化档位回退拼装文字说明（历史数据没有 level_text 时用） */
function levelTextOf(d: ScoreDimension): string {
  if (d.level_text?.trim()) return d.level_text;
  if (!d.levels.length) return '';
  return d.levels.map((l) => `${l.level} ${l.range}：${l.desc}`).join('\n');
}

/**
 * 评分卡管理 v2（P3-5 后台域）
 *
 * 相对 v1 的纯视觉变化：
 *   ① 左右 `Row/Col + Card` → `.wb2-grid2`（左 1 / 右 1.6），卡片统一圆角 12 零投影
 *   ② 评分卡列表项由手写 `style={{border, background}}` → `.wb2-ccard` 复用件（选中态加 `.on`）
 *   ③ 权重合计 Alert（success/error 整块底色）→ 左 3px 语义条提示行（ok / er 两档）
 *   ④ 双轨权重 Progress（含裸 hex `#7C3AED`）→ `.wb2-prog` + 令牌色
 *   ⑤ 状态 Tag（green/gold/default）→ `.wb2-tag` 四档语义
 *   ⑥ 4 处 modal.confirm / modal.info → `Dialog` + `useConfirm()`
 *      （删除属危险操作：danger + 禁点遮罩 + 默认聚焦取消）
 *   ⑦ 原生 `<select>` → 令牌化的 `<select className="wb2-chip">`
 *
 * 业务：CR-24 生命周期（新建/复制/启停/软删）、CR-34 可编辑与版本策略（草稿原地改 / 启用升版本）、
 * 权重合计 =100 与双轨权重 =100 双重校验、引用计数拦截删除——逐行沿用 v1，未改任何判定与写入字段。
 */

export default function ScoreCardAdminV2() {
  const { db, setDb, log, scopeRows, flags } = useStore();
  /** V4.0 A-3：影响面提示按数据范围统计 */
  const inScope = scopeRows(db.submits);
  /** V4.0 CR-09：技能管理员在本页为只读浏览者（§6.2 矩阵 ◐） */
  const readOnly = useSkillAdminConverge().isReadOnly('/admin/scorecard');
  const { message } = AntApp.useApp();
  const confirm = useConfirm();
  const [cardId, setCardId] = useState(db.scoreCards[0].id + '-v2');
  const [editing, setEditing] = useState(false);
  const [dims, setDims] = useState<ScoreDimension[]>(db.scoreCards[0].dimensions);
  /** V6.0 CR-24 开关：关闭=只有「编辑维度→保存即新版本」，无新建/复制/启用/停用/删除 */
  const lifecycleOn = flags.scoreCardLifecycle !== false;
  /** V7.0 CR-34 开关：关闭=回到 V6.2（名称/档位/权重均只读，保存即新版本） */
  const editableOn = flags.scoreCardEditable !== false;
  /** V7.0 CR-34：卡级元数据草稿（名称 / 计算方式 / 及格线 / 双轨权重） */
  const [meta, setMeta] = useState<Pick<ScoreCard, 'name' | 'total_rule' | 'pass_line' | 'ai_weight' | 'judge_weight'>>({
    name: db.scoreCards[0].name,
    total_rule: db.scoreCards[0].total_rule,
    pass_line: db.scoreCards[0].pass_line,
    ai_weight: db.scoreCards[0].ai_weight,
    judge_weight: db.scoreCards[0].judge_weight,
  });
  /** V7.0 CR-34：档位与标准的文字说明（确认项 1：就是一段文字，可编辑即可） */
  const [levelText, setLevelText] = useState<Record<string, string>>({});
  /** P3-5：改名弹窗（v1 用 modal.confirm 内嵌 Input，v2 改为受控 Dialog） */
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTipOpen, setRenameTipOpen] = useState(false);

  /** V6.0 CR-24：列表只展示未软删的卡 */
  const cards = db.scoreCards.filter((c) => !c.is_deleted);
  const card = cards.find((c) => `${c.id}-${c.version}` === cardId) ?? cards[0] ?? db.scoreCards[0];
  const weightSum = dims.reduce((a, b) => a + b.weight, 0);

  /** 引用数：绑定了作业类型，或已产生评分结果 → 禁止删除，仅可停用 */
  const refCount = (c: typeof card) =>
    db.assignmentTypes.filter((t) => t.score_card_id === c.id).length
    + db.scoreResults.filter((r) => r.card_id === c.id).length;

  const enterEdit = () => {
    setDims(card.dimensions);
    setMeta({
      name: card.name, total_rule: card.total_rule, pass_line: card.pass_line,
      ai_weight: card.ai_weight, judge_weight: card.judge_weight,
    });
    setLevelText(Object.fromEntries(card.dimensions.map((d) => [d.id, levelTextOf(d)])));
    setEditing(true);
  };

  /**
   * V7.0 CR-34：保存策略（拍板 3-A）
   *  - 草稿态：原地保存（同 id 同 version），随便改；
   *  - 启用/停用态：修改自动升版本，旧版本连同其历史评分结果一并保留（拍板 4-A：历史结果仍指向旧版本）。
   */
  const save = () => {
    if (weightSum !== 100) { message.error(`维度权重合计必须 = 100，当前 ${weightSum}`); return; }
    if (meta.ai_weight + meta.judge_weight !== 100) {
      message.error(`AI 权重 + 评委权重必须 = 100，当前 ${meta.ai_weight + meta.judge_weight}`);
      return;
    }
    if (!meta.name.trim()) { message.error('评分卡名称不能为空'); return; }

    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    const newDims = dims.map((d) => ({ ...d, level_text: levelText[d.id] ?? d.level_text }));
    const patch = {
      ...meta,
      name: meta.name.trim(),
      dimensions: newDims,
      updated_at: at,
    };

    /** 草稿态：原地改（拍板 3-A 前半段） */
    if (card.status === '草稿') {
      if (!editableOn) { message.info('评分卡可编辑开关已关闭，当前为只读'); return; }
      setDb((p) => ({
        ...p,
        scoreCards: p.scoreCards.map((c) => (`${c.id}-${c.version}` === `${card.id}-${card.version}` ? { ...c, ...patch } : c)),
      }));
      log('修改评分卡（草稿）', `${meta.name} ${card.version}`, '草稿态原地保存，不生成新版本');
      message.success('已保存（草稿态原地修改）');
      setEditing(false);
      return;
    }

    /** 启用/停用态：改即升版本（拍板 3-A 后半段 + 4-A） */
    const newVersion = `v${Number(card.version.slice(1)) + 1}`;
    confirm({
      title: '保存评分卡改版',
      content: `「${card.name}」已${card.status}，本次修改将生成新版本 ${newVersion}：旧版本 ${card.version} 与其历史评分结果一并保留，历史分数不会因改版而变化。影响约 ${inScope.filter((s) => s.ai_score === undefined).length} 个未评分提报（按当前数据范围统计）。`,
      onOk: () => {
        setDb((p) => ({
          ...p,
          scoreCards: [{ ...card, ...patch, version: newVersion }, ...p.scoreCards],
        }));
        log('评分卡改版', `${card.name} ${card.version} → ${newVersion}`, '启用态修改自动升版本；历史结果仍按旧版本计算');
        message.success(`已生成 ${newVersion}（旧版本 ${card.version} 保留）`);
        setCardId(`${card.id}-${newVersion}`);
        setEditing(false);
      },
    });
  };

  /** V7.0 CR-34：改名（独立入口，草稿态原地改；启用态随下次保存一起升版本） */
  const renameCard = () => {
    if (card.status !== '草稿') {
      setRenameTipOpen(true);
      return;
    }
    setRenameOpen(true);
  };

  const doRename = () => {
    const name = (meta.name || '').trim();
    if (!name) { message.error('名称不能为空'); return; }
    setDb((p) => ({
      ...p,
      scoreCards: p.scoreCards.map((c) => (`${c.id}-${c.version}` === `${card.id}-${card.version}`
        ? { ...c, name, updated_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}` } : c)),
    }));
    log('修改评分卡名称', `${card.name} → ${name}`, '草稿态原地改名');
    message.success('名称已更新');
    setRenameOpen(false);
  };

  /** V6.0 CR-24：新建空白评分卡（默认草稿态，权重留空由组织者配置） */
  const createCard = () => {
    const id = `SC${Date.now()}`;
    const blank: ScoreDimension[] = [
      { id: `D${Date.now()}-1`, sort: 1, name: '业务价值', weight: 40, max_score: 10, standard: '解决了多大的业务问题', levels: [] },
      { id: `D${Date.now()}-2`, sort: 2, name: '可复用性', weight: 30, max_score: 10, standard: '别人照着做的成本有多低', levels: [] },
      { id: `D${Date.now()}-3`, sort: 3, name: '完成度', weight: 30, max_score: 10, standard: '产出物是否完整可用', levels: [] },
    ];
    setDb((p) => ({
      ...p,
      scoreCards: [{
        id, name: '新建评分卡', version: 'v1', total_rule: '加权求和', pass_line: 60,
        ai_weight: 40, judge_weight: 60, status: '草稿', bind_target: '未绑定',
        dimensions: blank, updated_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
      }, ...p.scoreCards],
    }));
    log('新建评分卡', '新建评分卡 v1', 'V6.0 CR-24：默认草稿态，三维合计 100%');
    message.success('已新建空白评分卡（草稿态，可直接配置维度与权重）');
    setCardId(`${id}-v1`);
    setDims(blank);
  };

  /** V6.0 CR-24：复制生成副本草稿，不复制绑定关系 */
  const copyCard = (c: typeof card) => {
    const id = `SC${Date.now()}`;
    setDb((p) => ({
      ...p,
      scoreCards: [{
        ...c,
        id,
        name: `${c.name} 副本`,
        version: 'v1',
        status: '草稿',
        /** 绑定关系不复制 */
        bind_target: '未绑定',
        copied_from: `${c.id}-${c.version}`,
        dimensions: c.dimensions.map((d) => ({ ...d, id: `D${Date.now()}-${d.id}` })),
        updated_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
      }, ...p.scoreCards],
    }));
    log('复制评分卡', `${c.name} ${c.version}`, `生成副本草稿，不复制绑定关系（来源 ${c.id}-${c.version}）`);
    message.success('已生成副本草稿（绑定关系未复制，需重新配置）');
  };

  /** V6.0 CR-24：启用 / 停用（停用不影响历史提报按旧版本计算） */
  const toggleStatus = (c: typeof card) => {
    const next = c.status === '启用' ? '停用' : '启用';
    setDb((p) => ({
      ...p,
      scoreCards: p.scoreCards.map((x) => (`${x.id}-${x.version}` === `${c.id}-${c.version}` ? { ...x, status: next } : x)),
    }));
    log(next === '启用' ? '启用评分卡' : '停用评分卡', `${c.name} ${c.version}`, '停用不影响历史提报按旧版本计算（6.5.5 版本绑定口径）');
    message.success(`已${next}（历史提报仍按原绑定版本计算）`);
  };

  /** V6.0 CR-24：软删；有引用时禁止删除，仅可停用 */
  const deleteCard = (c: typeof card) => {
    const n = refCount(c);
    if (n > 0) {
      message.error(`该卡存在 ${n} 处引用（已绑定作业类型或已产生评分结果），禁止删除，仅可「停用」`);
      return;
    }
    confirm({
      title: `删除「${c.name} ${c.version}」？`,
      content: '删除为软删，记录保留可追溯；删除后不再出现在列表与绑定选项中。',
      okText: '确认删除',
      danger: true,
      onOk: () => {
        setDb((p) => ({
          ...p,
          scoreCards: p.scoreCards.map((x) => (`${x.id}-${x.version}` === `${c.id}-${c.version}`
            ? { ...x, is_deleted: true, deleted_at: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}` }
            : x)),
        }));
        log('删除评分卡', `${c.name} ${c.version}`, 'V6.0 CR-24：软删并留痕，无引用方可删除');
        message.success('已删除（软删，记录保留可追溯）');
      },
    });
  };

  const statusTone = (s: string) => (s === '启用' ? 'ok' : s === '草稿' ? 'wa' : 'id');

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <h2 className="wb2-ph-t">评分卡管理</h2>
          <div className="wb2-ph-d">Q8：四维评分卡与权重可自行配置</div>
        </div>
      </div>

      {/* U-2 结案：范围受限提示（含专家身份说明），四个后台页共用同一套口径 */}
      <ScopeNotice count={inScope.length} unit="条提报" />

      {editableOn && (
        <div className="wb2-alert">
          <div className="bd">
            <div className="t">V7.0 CR-34：评分卡可编辑与版本策略</div>
            <div className="d">草稿态可原地修改（不生成新版本）；一旦启用，任何修改都会自动升版本，历史评分结果仍按当时的版本计算，不会被追溯改写。</div>
          </div>
        </div>
      )}

      <div className="wb2-grid2" style={{ gridTemplateColumns: 'minmax(280px, 1fr) 1.8fr' }}>
        {/* ---------- 左：评分卡列表 ---------- */}
        <div className="wb2-card">
          <div style={{ padding: 'var(--wb-space-4) var(--wb-space-5)', borderBottom: '1px solid var(--wb-border-subtle)' }}>
            <div className="wb2-card-t" style={{ marginBottom: 0 }}>评分卡列表</div>
          </div>
          <div style={{ padding: 'var(--wb-space-4) var(--wb-space-5)' }}>
            {cards.map((c) => {
              const on = `${c.id}-${c.version}` === cardId;
              return (
                <div
                  key={`${c.id}-${c.version}`}
                  className={`wb2-ccard${on ? ' on' : ''}`}
                  role="button" tabIndex={0}
                  style={{ padding: 'var(--wb-space-4)', marginBottom: 'var(--wb-space-3)', ...(on ? { borderColor: COLOR.primary, background: COLOR.primarySoft } : null) }}
                  onClick={() => { setCardId(`${c.id}-${c.version}`); setDims(c.dimensions); setEditing(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardId(`${c.id}-${c.version}`); setDims(c.dimensions); setEditing(false); } }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--wb-space-3)' }}>
                    <b style={{ color: COLOR.ink1 }}>{c.name}</b>
                    <span className={`wb2-tag ${statusTone(c.status)}`}><i className="d" />{c.status}</span>
                  </div>
                  <div style={{ fontSize: 'var(--wb-fs-caption)', color: COLOR.ink3, marginTop: 6 }}>
                    版本 {c.version} · 及格线 {c.pass_line} · AI {c.ai_weight}% / 评委 {c.judge_weight}%
                  </div>
                  <div style={{ fontSize: 'var(--wb-fs-caption)', color: COLOR.ink4, marginTop: 2 }}>
                    绑定：{c.bind_target}{c.copied_from ? ` · 复制自 ${c.copied_from}` : ''}
                  </div>
                  {/* V6.0 CR-24：全生命周期五类操作（开关关闭时不渲染） */}
                  {lifecycleOn && (
                    <div style={{ display: 'flex', gap: 'var(--wb-space-2)', marginTop: 'var(--wb-space-3)', flexWrap: 'wrap' }}>
                      <Button size="small" disabled={readOnly} onClick={(e) => { e.stopPropagation(); copyCard(c); }}>复制</Button>
                      <Button size="small" disabled={readOnly} onClick={(e) => { e.stopPropagation(); toggleStatus(c); }}>
                        {c.status === '启用' ? '停用' : '启用'}
                      </Button>
                      <Button size="small" danger type="text" disabled={readOnly} onClick={(e) => { e.stopPropagation(); deleteCard(c); }}>
                        删除{refCount(c) > 0 ? `（引用 ${refCount(c)}）` : ''}
                      </Button>
                      {/* V7.0 CR-34：改名（草稿态立即生效；启用态随下次保存升版本） */}
                      {editableOn && (
                        <Button size="small" type="link" disabled={readOnly} onClick={(e) => { e.stopPropagation(); setCardId(`${c.id}-${c.version}`); setMeta((m) => ({ ...m, name: c.name })); renameCard(); }}>改名</Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <Button block disabled={readOnly}
              onClick={lifecycleOn ? createCard : () => message.success('已新建空白评分卡（Q11 终端评分卡口径到位后可直接配置）')}>
              新建评分卡
            </Button>
          </div>
        </div>

        {/* ---------- 右：维度与权重 ---------- */}
        <div className="wb2-card">
          <div style={{
            padding: 'var(--wb-space-4) var(--wb-space-5)', borderBottom: '1px solid var(--wb-border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--wb-space-4)', flexWrap: 'wrap',
          }}>
            {editing ? (
              <Input
                size="small" style={{ width: 260 }} disabled={!editableOn} value={meta.name}
                onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
                placeholder="评分卡名称"
              />
            ) : (
              <div className="wb2-card-t" style={{ marginBottom: 0 }}>{card.name} {card.version} · 维度与权重</div>
            )}
            <div style={{ display: 'flex', gap: 'var(--wb-space-3)' }}>
              {editing ? (
                <>
                  <Button onClick={() => { setEditing(false); setDims(card.dimensions); }}>取消</Button>
                  <Button type="primary" onClick={save}>
                    {card.status === '草稿' ? '保存（草稿原地修改）' : '保存并生成新版本'}
                  </Button>
                </>
              ) : (
                <Button disabled={readOnly} onClick={enterEdit}>编辑</Button>
              )}
            </div>
          </div>

          <div style={{ padding: 'var(--wb-space-5)' }}>
            {/* 权重合计：v1 是整块 success/error Alert，v2 收成左 3px 语义条 */}
            <div className={`wb2-alert ${weightSum === 100 ? 'ok' : 'er'}`} style={{ marginBottom: 'var(--wb-space-5)' }}>
              <div className="bd">
                <div className="t">权重合计：{weightSum}%（必须 = 100）</div>
              </div>
            </div>

            <Table
              size="small" rowKey="id" pagination={false} dataSource={dims}
              columns={[
                { title: '排序', dataIndex: 'sort', width: 60 },
                {
                  title: '维度名称', dataIndex: 'name',
                  render: (v: string, r: ScoreDimension) => editing && editableOn
                    ? <Input size="small" value={v} onChange={(e) => setDims(dims.map((d) => (d.id === r.id ? { ...d, name: e.target.value } : d)))} />
                    : <b>{v}</b>,
                },
                {
                  title: '权重（%）', dataIndex: 'weight', width: 120,
                  render: (v: number, r: ScoreDimension) => editing
                    ? <InputNumber size="small" min={0} max={100} value={v} onChange={(n) => setDims(dims.map((d) => (d.id === r.id ? { ...d, weight: Number(n) || 0 } : d)))} />
                    : <span className="num">{v}%</span>,
                },
                {
                  title: '满分', dataIndex: 'max_score', width: 90,
                  render: (v: number, r: ScoreDimension) => editing
                    ? <InputNumber size="small" min={1} value={v} onChange={(n) => setDims(dims.map((d) => (d.id === r.id ? { ...d, max_score: Number(n) || 0 } : d)))} />
                    : <span className="num">{v}</span>,
                },
                {
                  title: '评分标准', dataIndex: 'standard',
                  render: (v: string, r: ScoreDimension) => editing
                    ? <Input size="small" value={v} onChange={(e) => setDims(dims.map((d) => (d.id === r.id ? { ...d, standard: e.target.value } : d)))} />
                    : v,
                },
              ]}
            />

            <div className="wb2-grid2" style={{ marginTop: 'var(--wb-space-6)' }}>
              {/* ---------- 档位与标准 ---------- */}
              <div>
                <div style={{ fontSize: 'var(--wb-fs-body)', fontWeight: 600, color: COLOR.ink1 }}>
                  档位与标准（注入 AI 评分提示词，也用于评委打分参考）
                </div>
                {dims.map((d) => (
                  <div key={d.id} style={{ marginTop: 'var(--wb-space-4)' }}>
                    <div style={{ fontSize: 'var(--wb-fs-label)', fontWeight: 600, color: COLOR.ink1 }}>{d.name}</div>
                    {editing && editableOn ? (
                      /* V7.0 CR-34（确认项 1）：档位与标准就是一段文字说明，用文本框录入即可 */
                      <Input.TextArea
                        rows={3} value={levelText[d.id] ?? ''}
                        placeholder={'例如：优秀 9-10：xxx\n良好 7-8：yyy\n合格 6：zzz'}
                        onChange={(e) => setLevelText({ ...levelText, [d.id]: e.target.value })}
                      />
                    ) : levelTextOf(d) ? (
                      <div className="wb2-quote" style={{ marginTop: 'var(--wb-space-2)', whiteSpace: 'pre-wrap' }}>
                        {levelTextOf(d)}
                      </div>
                    ) : (
                      <div className="wb2-note" style={{ marginTop: 4 }}>未配置档位（历史版本 / 待补充）</div>
                    )}
                  </div>
                ))}
              </div>

              {/* ---------- 双轨权重与计算方式 ---------- */}
              <div>
                <div style={{ fontSize: 'var(--wb-fs-body)', fontWeight: 600, color: COLOR.ink1 }}>双轨权重与计算方式</div>
                <div style={{ marginTop: 'var(--wb-space-3)' }}>
                  {editing && editableOn ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wb-space-3)' }}>
                      <div className="wb2-setrow">
                        <div className="nm">总分计算</div>
                        <div className="ct">
                          <select
                            className="wb2-chip"
                            value={meta.total_rule}
                            onChange={(e) => setMeta((m) => ({ ...m, total_rule: e.target.value as ScoreCard['total_rule'] }))}
                            style={{ height: 36 }}
                          >
                            {(['加权求和', '去极值平均', '归一化百分制'] as const).map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="wb2-setrow">
                        <div className="nm">及格线</div>
                        <div className="ct">
                          <InputNumber min={0} max={100} value={meta.pass_line}
                            onChange={(v) => setMeta((m) => ({ ...m, pass_line: Number(v ?? 0) }))} />
                        </div>
                      </div>
                      <div className="wb2-setrow">
                        <div className="nm">AI 权重（%）</div>
                        <div className="ct">
                          <InputNumber min={0} max={100} value={meta.ai_weight}
                            onChange={(v) => setMeta((m) => ({ ...m, ai_weight: Number(v ?? 0) }))} />
                        </div>
                      </div>
                      <div className="wb2-setrow">
                        <div className="nm">评委权重（%）</div>
                        <div className="ct">
                          <InputNumber min={0} max={100} value={meta.judge_weight}
                            onChange={(v) => setMeta((m) => ({ ...m, judge_weight: Number(v ?? 0) }))} />
                        </div>
                      </div>
                      <div className="wb2-note">AI 权重 + 评委权重必须 = 100（当前 {meta.ai_weight + meta.judge_weight}）</div>
                    </div>
                  ) : (
                    <>
                      <div className="wb2-kv"><span>总分计算</span><b>{card.total_rule}</b></div>
                      <div className="wb2-kv" style={{ marginTop: 6 }}><span>及格线</span><b>{card.pass_line} 分</b></div>
                      <div style={{ marginTop: 'var(--wb-space-4)', fontSize: 'var(--wb-fs-label)', color: COLOR.ink2 }}>
                        AI 分权重 <span className="num">{card.ai_weight}%</span>
                      </div>
                      <div className="wb2-prog"><i style={{ width: `${card.ai_weight}%`, background: COLOR.primary }} /></div>
                      <div style={{ marginTop: 'var(--wb-space-4)', fontSize: 'var(--wb-fs-label)', color: COLOR.ink2 }}>
                        评委分权重 <span className="num">{card.judge_weight}%</span>
                      </div>
                      <div className="wb2-prog"><i style={{ width: `${card.judge_weight}%`, background: COLOR.track3 }} /></div>
                    </>
                  )}
                </div>
                <div className="wb2-alert warn" style={{ marginTop: 'var(--wb-space-4)' }}>
                  <div className="bd">
                    <div className="t">Q11 待补充：终端平台 AI 评分口径</div>
                    <div className="d">拿到口径后由组织者在后台配置「终端评分卡」即可，无需改动代码。</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 改名弹窗（草稿态） ---------- */}
      <Dialog open={renameOpen} title="修改评分卡名称" okText="确认" okDisabled={!meta.name.trim()}
        sub="草稿态原地改名，不生成新版本。"
        onCancel={() => setRenameOpen(false)} onOk={doRename}>
        <DialogField label="名称（≤30 字）">
          <Input id="wb-card-rename" value={meta.name} maxLength={30}
            onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} />
        </DialogField>
      </Dialog>

      {/* ---------- 启用态改名提示（v1 的 modal.info） ---------- */}
      <Dialog
        open={renameTipOpen} title="启用中的评分卡改名"
        footer={<Button type="primary" onClick={() => setRenameTipOpen(false)}>知道了</Button>}
        onCancel={() => setRenameTipOpen(false)}
      >
        <div className="hint">
          「{card.name}」已{card.status}，改名会随下一次保存生成新版本；如需立即生效，请在右侧点「编辑」后保存。
        </div>
      </Dialog>
    </div>
  );
}
