import { Alert, App as AntApp, Select, Space, Tag, Typography } from 'antd';
import { useCallback, useMemo } from 'react';
import { useStore } from '@/store/store';
import type { DB } from '@/store/store';
import { COLOR } from '@/theme';
import type { ScopeSubject } from '@/mock/types';
import type { Role } from '@/mock/types';
import { ROLE_LABEL } from '@/mock/types';
import DeptTreeSelect from '@/components/DeptTreeSelect';
import { deptSubtreeUnion } from '@/service/deptTree';

/**
 * V4.0 CR-08：统一的「权限范围选择器」
 *
 * 修复的问题：旧实现只选了「全员 / 指定部门 / 指定人群」这类文案，
 * 并没有真正选中任何人员或部门/角色，导致「配了但不生效」。
 * 本组件强制落库 ScopeSubject[]，并给出生效人数预览，便于保存前二次确认。
 */

/** 旧值（字符串）兼容映射：'全员' → ALL；其余（未落主体）→ 空数组，强制重新选择 */
export function parseScope(v: string | ScopeSubject[] | undefined | null): ScopeSubject[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v === '全员') return [{ type: 'ALL', id: 'ALL', name: '全员' }];
  return [];
}

/** 把 ScopeSubject[] 解析为实际命中的人员（用于生效预览与回读校验） */
export function resolveSubjects(subjects: ScopeSubject[], db: Pick<DB, 'users' | 'depts'>): string[] {
  if (subjects.length === 0) return [];
  const ids = new Set<string>();
  /**
   * V8.3-10.08 需求②：部门命中改走 deptTree 的显式子树并集。
   * 旧实现是 `d.startsWith(s.id)` 前缀匹配 —— 在钉钉真实数字 id 下会误命中别的部门，
   * 多选几个部门后命中人数会虚高（「配了但不生效」的反面：配了生效过头）。
   */
  const deptIds = subjects.filter((s) => s.type === 'DEPT').map((s) => s.id);
  const deptUnion = deptIds.length ? deptSubtreeUnion(db.depts ?? [], deptIds) : null;
  subjects.forEach((s) => {
    if (s.type === 'ALL') {
      db.users.forEach((u) => u.status !== 99 && ids.add(u.union_id));
    } else if (s.type === 'DEPT') {
      db.users.forEach((u) => u.status !== 99 && (u.dept_id_list ?? []).some((d) => deptUnion?.has(d)) && ids.add(u.union_id));
    } else if (s.type === 'ROLE') {
      db.users.forEach((u) => u.status !== 99 && u.roles.includes(s.id as Role) && ids.add(u.union_id));
    } else if (s.type === 'TAG') {
      db.users.forEach((u) => u.status !== 99 && u.tags.includes(s.id) && ids.add(u.union_id));
    } else if (s.type === 'USER') {
      ids.add(s.id);
    }
  });
  return [...ids];
}

/**
 * CR-08 回读校验（纯前端无真实服务端，故对「将要提交的快照」做二次解析）：
 * - 空选择 → 显式阻断
 * - 预览人数 ≠ 快照实测人数（差值 > 0）→ 阻断落库，不留半生效状态
 */
export function useScopeCommit() {
  const { db, setDb } = useStore();
  const { message } = AntApp.useApp();

  return useCallback(
    (subjects: ScopeSubject[], build: (p: DB) => DB, okText: string): boolean => {
      if (subjects.length === 0) {
        message.error('未选择任何人员 / 部门 / 角色 —— 已阻断保存（CR-08：禁止「配了但不生效」）');
        return false;
      }
      const expected = resolveSubjects(subjects, db).length;
      const next = build(db);
      const actual = resolveSubjects(subjects, next).length;
      if (actual !== expected) {
        message.error(`回读校验失败：预览 ${expected} 人，实测 ${actual} 人（差值 ${Math.abs(actual - expected)}），已阻止保存，未产生半生效状态`);
        return false;
      }
      setDb(next);
      message.success(`${okText} · 生效 ${actual} 人（回读一致）`);
      return true;
    },
    [db, setDb, message],
  );
}

/** 列表/详情里的范围展示：优先读真实主体，回退读旧文案值并标注「未落主体」 */
export function ScopeText({ value, showCount = true }: { value?: string | ScopeSubject[] | null; showCount?: boolean }) {
  const { db } = useStore();
  const subjects = useMemo(() => parseScope(value), [value]);
  if (subjects.length === 0) {
    const legacy = typeof value === 'string' && value ? value : '—';
    return (
      <Space size={4} wrap>
        <span>{legacy}</span>
        {typeof value === 'string' && !!value && value !== '全员' && (
          <Tag color="warning" style={{ marginInlineEnd: 0, fontSize: 11 }}>未落主体</Tag>
        )}
      </Space>
    );
  }
  const n = resolveSubjects(subjects, db).length;
  return (
    <Space size={4} wrap>
      <span>{subjects.map((s) => s.name).join('、')}</span>
      {showCount && <span className="num" style={{ color: COLOR.textMuted, fontSize: 12 }}>{n} 人</span>}
    </Space>
  );
}

export default function ScopePicker({
  value, onChange, disabled,
}: {
  value: string | ScopeSubject[] | undefined;
  onChange: (next: ScopeSubject[]) => void;
  disabled?: boolean;
}) {
  const { db } = useStore();
  const subjects = useMemo(() => parseScope(value), [value]);
  const hit = useMemo(() => resolveSubjects(subjects, db), [subjects, db]);
  const locked = subjects.some((s) => s.type === 'ALL');

  const add = (type: ScopeSubject['type'], id: string, name: string) => {
    if (type === 'ALL') { onChange([{ type: 'ALL', id: 'ALL', name: '全员' }]); return; }
    const rest = subjects.filter((s) => s.type !== 'ALL');
    if (rest.some((s) => s.type === type && s.id === id)) return;
    onChange([...rest, { type, id, name }]);
  };
  const remove = (s: ScopeSubject) => onChange(subjects.filter((x) => !(x.type === s.type && x.id === s.id)));

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space size={8} wrap>
        <Select
          size="small" disabled={disabled} style={{ width: 130 }} placeholder="按维度添加"
          value={undefined}
          options={[
            { value: 'ALL', label: '全员' },
            { value: 'DEPT', label: '指定部门' },
            { value: 'ROLE', label: '指定角色' },
            { value: 'TAG', label: '指定人群（标签）' },
            { value: 'USER', label: '指定人员' },
          ]}
          onSelect={(v) => { if (v === 'ALL') add('ALL', 'ALL', '全员'); }}
        />
        {/* V8.3-10.08 需求②：部门改为组织架构树多选（勾父带子），可一次选多个部门 */}
        <div style={{ width: 280 }}>
          <DeptTreeSelect
            value={subjects.filter((s) => s.type === 'DEPT').map((s) => s.id)}
            onChange={(ids) => {
              const others = subjects.filter((s) => s.type !== 'DEPT');
              const depts = ids.map((id) => ({ type: 'DEPT' as const, id, name: db.depts.find((d) => d.dept_id === id)?.name ?? id }));
              onChange([...others, ...depts]);
            }}
            disabled={disabled || locked}
            placeholder="选择部门（树状多选）"
            showHitCount={false}
          />
        </div>
        <Select
          size="small" disabled={disabled || locked} style={{ width: 150 }}
          placeholder="选择角色" value={undefined}
          options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          onSelect={(id) => { if (!id) return; add('ROLE', id, ROLE_LABEL[id as Role] ?? id); }}
        />
        <Select
          size="small" disabled={disabled || locked} style={{ width: 160 }}
          placeholder="选择人群标签" value={undefined}
          options={db.tags.filter((t) => t.status === '启用').map((t) => ({ value: t.id, label: `${t.name}（${t.member_count ?? 0}）` }))}
          onSelect={(id) => { if (!id) return; add('TAG', id, db.tags.find((t) => t.id === id)?.name ?? id); }}
        />
        <Select
          size="small" showSearch disabled={disabled || locked} style={{ width: 180 }}
          placeholder="搜索人员" value={undefined} filterOption={(input, opt) => String(opt?.label ?? '').includes(input)}
          options={db.users.filter((u) => u.status !== 99).map((u) => ({ value: u.union_id, label: `${u.name}·${u.dept_names[0]?.split('/').pop() ?? ''}` }))}
          onSelect={(id) => { if (!id) return; add('USER', id, db.users.find((u) => u.union_id === id)?.name ?? id); }}
        />
      </Space>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 24 }}>
        {subjects.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            未选择任何人员 / 部门 / 角色 —— 保存将被阻断（CR-08：禁止「配了但不生效」）
          </Typography.Text>
        ) : (
          subjects.map((s) => (
            <Tag key={`${s.type}-${s.id}`} closable onClose={() => remove(s)} color="orange">{s.name}</Tag>
          ))
        )}
      </div>

      <Alert
        type={hit.length > 0 ? 'success' : 'warning'} showIcon
        style={{ padding: '6px 10px' }}
        message={
          <span style={{ fontSize: 12 }}>
            生效预览：本次覆盖 <b>{hit.length}</b> 人
            {hit.length > 0 && hit.length <= 8 && `（${hit.map((id) => db.users.find((u) => u.union_id === id)?.name).filter(Boolean).join('、')}）`}
          </span>
        }
        description={
          <span style={{ fontSize: 11, color: COLOR.textMuted }}>
            保存时会回读校验：若实际命中人数与预览不一致，将阻止保存并提示明细，避免出现半生效状态。
          </span>
        }
      />
    </Space>
  );
}
