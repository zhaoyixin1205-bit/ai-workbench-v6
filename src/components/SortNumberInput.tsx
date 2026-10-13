import { InputNumber } from 'antd';
import { useEffect, useState } from 'react';

/**
 * 行内「排序号」输入（V10.13 后台排序双通道之一）。
 *
 * 为什么不当场 onChange 就提交：每敲一位数字就整表重排一次，行会跳、焦点会丢、
 * 想打「12」会先跳到第 1 位再跳到第 12 位。这里用草稿态承接输入，
 * **失焦 / 回车才提交** `onCommit(pos1)`（1-based 目标位）。
 *
 * 与拖拽共用的落库口径见 src/utils/sortOrder.ts（reorderWithSort 统一重排 + 重编号）。
 */
export default function SortNumberInput({
  value,
  max,
  onCommit,
  size = 'small',
  width = 64,
}: {
  /** 当前位次（0-based sort 值）；缺省显示占位符 */
  value?: number;
  /** 列表长度，用于夹紧越界输入 */
  max: number;
  /** 提交目标位（1-based） */
  onCommit: (pos1: number) => void;
  size?: 'small' | 'middle';
  width?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  /** 外部位次变化（拖拽 / 别处调整）时丢弃草稿，避免显示陈旧数字 */
  useEffect(() => {
    setDraft(null);
  }, [value]);

  const shown = draft ?? (typeof value === 'number' ? String(value + 1) : '');
  const curPos = typeof value === 'number' ? value + 1 : -1;

  const commit = () => {
    if (draft === null) return;
    const raw = draft;
    setDraft(null);
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n)) return;
    const pos = Math.max(1, Math.min(max, Math.round(n)));
    if (pos !== curPos) onCommit(pos);
  };

  return (
    <InputNumber
      size={size}
      style={{ width }}
      min={1}
      max={max}
      precision={0}
      value={shown === '' ? null : Number(shown)}
      placeholder="—"
      title="排序号：1 = 最前面；失焦或回车生效"
      onChange={(v) => setDraft(v == null ? '' : String(v))}
      onBlur={commit}
      onPressEnter={commit}
    />
  );
}
