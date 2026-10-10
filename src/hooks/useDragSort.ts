/**
 * V8.3-10.10：零依赖的拖拽排序 hook（原生 HTML5 DnD，不引第三方库）。
 *
 * 用法：把整列「可见 id 顺序」传进来，拖拽完成后回调 `onReorder(新 id 顺序)`，
 * 调用方据此重写各实体的 `sort` 字段（数值 = 下标）。
 *
 * 设计要点：
 *   ① 不做任何数据写操作，只负责「算出新的 id 顺序」——排序落盘交给调用方，
 *      这样同一套 hook 既能用于场景卡列表，也能用于 antd Table 行；
 *   ② 拖拽态（dragging / dragover）通过 `rowAttrs(id)` 直接下发到行元素，
 *      样式由调用方或全局 CSS 决定，hook 不碰 DOM；
 *   ③ 整行可拖，但操作按钮区域应 `onDragStart={e=>e.stopPropagation()}` 防止误拖。
 */
import { useState } from 'react';

export interface DragRowAttrs {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  'data-dragging'?: true;
  'data-dragover'?: true;
}

export function useDragSort(ids: string[], onReorder: (nextIds: string[]) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const reset = () => {
    setDragId(null);
    setOverId(null);
  };

  const start = (e: React.DragEvent, id: string) => {
    setDragId(id);
    setOverId(null);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {
      /* 某些浏览器在 dragstart 阶段 setData 会抛，忽略即可 */
    }
  };

  const over = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== overId) setOverId(id);
  };

  const drop = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    const from = dragId;
    if (!from || from === id) {
      reset();
      return;
    }
    const fi = ids.indexOf(from);
    const ti = ids.indexOf(id);
    if (fi < 0 || ti < 0) {
      reset();
      return;
    }
    const next = [...ids];
    const [moved] = next.splice(fi, 1);
    next.splice(ti, 0, moved);
    onReorder(next);
    reset();
  };

  const rowAttrs = (id: string): DragRowAttrs => ({
    draggable: true,
    onDragStart: (e) => start(e, id),
    onDragOver: (e) => over(e, id),
    onDrop: (e) => drop(e, id),
    onDragEnd: reset,
    ...(dragId === id ? { 'data-dragging': true as const } : {}),
    ...(overId === id && dragId && dragId !== id ? { 'data-dragover': true as const } : {}),
  });

  return { dragId, overId, rowAttrs };
}
