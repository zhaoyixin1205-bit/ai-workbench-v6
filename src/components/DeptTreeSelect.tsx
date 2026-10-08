/**
 * V8.3-10.08 需求②：部门树多选选择器（我的团队 / 社区可见范围 / 后台用户筛选共用）
 *
 * 运营方要求：像组织架构图那样层层向下、**可同时选多个部门**、选父部门含下级。
 * 历史实现是拍平的 Select（用全角空格假缩进），单选，且「含下级」靠 id 前缀巧合成立。
 *
 * 三个刻意的取舍：
 *   ① checkStrictly={false}：勾父自动勾子（组织者确认口径），取消父则子全取消；
 *   ② restrictTo：我的团队只展示本人管辖部门（组织者确认），后台/可见范围给全组织架构；
 *   ③ 命中人数实时回显：多选最容易出「我选了 2 个部门怎么来了 300 人」，必须让用户当场看见。
 */
import { TreeSelect } from 'antd';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { useStore } from '@/store/store';
import { buildDeptTreeData, deptSubtreeUnion } from '@/service/deptTree';

export interface DeptTreeSelectProps {
  /** 已选部门 id（受控，支持多选） */
  value: string[];
  onChange: (ids: string[]) => void;
  /** 限定可选范围（例：我的团队只显示管辖部门）；不传 = 全组织架构 */
  restrictTo?: string[];
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  /** 命中人数回显（传 users 时启用） */
  showHitCount?: boolean;
  /** 回显标签用全路径（默认部门名；勾选多个同名部门时全路径能分辨） */
  fullPathLabel?: boolean;
}

export default function DeptTreeSelect({
  value, onChange, restrictTo, placeholder = '按组织架构选择部门（可多选，选父含下级）',
  disabled, style, showHitCount = true, fullPathLabel = false,
}: DeptTreeSelectProps) {
  const { db } = useStore();
  const depts = db.depts ?? [];

  const treeData = useMemo(
    () => buildDeptTreeData(depts, restrictTo, fullPathLabel),
    [depts, restrictTo, fullPathLabel]
  );

  /** 实时命中人数：多选场景的「确认反馈」，避免保存后才发现选多了 */
  const hitCount = useMemo(() => {
    if (!showHitCount || !value.length) return null;
    const union = deptSubtreeUnion(depts, value);
    return db.users.filter((u) => u.status !== 99 && (u.dept_id_list ?? []).some((d) => union.has(d))).length;
  }, [depts, value, db.users, showHitCount]);

  return (
    <>
      <TreeSelect
        multiple
        treeDefaultExpandAll={false}
        showSearch
        treeNodeFilterProp="title"
        allowClear
        disabled={disabled}
        style={{ width: '100%', ...style }}
        placeholder={placeholder}
        value={value}
        onChange={(v) => onChange((v as string[]) ?? [])}
        treeData={treeData}
        /* 勾父带子：组织者口径「选父部门 = 含全部下级」 */
        treeCheckStrictly={false}
        showCheckedStrategy={TreeSelect.SHOW_CHILD}
        maxTagCount="responsive"
        popupMatchSelectWidth={320}
      />
      {hitCount !== null && (
        <span style={{ fontSize: 11, color: '#857E90' }}>
          当前命中 <b className="num">{hitCount}</b> 人（含下级）
        </span>
      )}
    </>
  );
}

/** 命中人数提示：挂在选择器下方的灰字，不占额外一行控件 */
export function DeptHitCount({ ids, prefix = '当前命中' }: { ids: string[]; prefix?: string }) {
  const { db } = useStore();
  const depts = db.depts ?? [];
  if (!ids.length) return null;
  const union = deptSubtreeUnion(depts, ids);
  const n = db.users.filter((u) => u.status !== 99 && (u.dept_id_list ?? []).some((d) => union.has(d))).length;
  return (
    <span style={{ fontSize: 11, color: 'var(--wb-ink-3, #857E90)' }}>
      {prefix} <b className="num">{n}</b> 人（含下级）
    </span>
  );
}