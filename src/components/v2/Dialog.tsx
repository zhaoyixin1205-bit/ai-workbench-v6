import { Button, Modal, App as AntApp, Space } from 'antd';
import type { ReactNode } from 'react';
import '../../theme/v2/template.css';

/**
 * v2 弹窗统一操作层（P3-5）
 * ------------------------------------------------------------------
 * 背景：后台 13 页共 23 个 <Modal> + 20 处 modal.confirm，v1 里各写各的——
 * 有的标题带对象名有的不带、有的确定在左有的在右、有的危险操作点遮罩就关了。
 * 这里把它们收敛成一套：**标题区 / 正文区 / 底部操作条**。
 *
 * 统一的三条硬规则：
 *   ① 底部顺序固定「取消 · 次要 · 主行动」，主行动永远在最右
 *   ② 危险操作（驳回 / 删除 / 停用 / 覆盖评分）主按钮 danger，且**禁点遮罩关闭**、默认聚焦「取消」
 *   ③ 标题下的口径/风险说明走 `sub`，不塞进 children（避免正文里再堆一条 Alert）
 *
 * 只换壳不改业务：`onOk` / `onCancel` 原样回传，调用方业务逻辑零改动。
 */

export interface DialogProps {
  open: boolean;
  /** 标题。建议带上对象名，如「驳回 · 客户画像自动化」 */
  title: ReactNode;
  /** 标题下的一行说明（口径 / 规则 / 风险），不写就不渲染 */
  sub?: ReactNode;
  children?: ReactNode;
  /** 主行动回调 */
  onOk?: () => void;
  okText?: string;
  okDisabled?: boolean;
  /** 主行动为危险操作：主按钮转 danger + 禁点遮罩 + 默认聚焦取消 */
  danger?: boolean;
  /** 次要行动（如「保存草稿」「查看原文」），置于取消与主行动之间 */
  secondary?: { text: string; onClick: () => void; danger?: boolean } | null;
  cancelText?: string;
  onCancel?: () => void;
  width?: number;
  /** 传 null 表示不要底部（纯查看型弹窗） */
  footer?: ReactNode | null;
}

export function Dialog({
  open, title, sub, children, onOk, okText = '确定', okDisabled,
  danger, secondary, cancelText = '取消', onCancel, width = 520, footer,
}: DialogProps) {
  const ft = footer === null ? null : footer ?? (
    <div className="wb2-dlg-ft">
      <Button onClick={onCancel}>{cancelText}</Button>
      {secondary && (
        <Button danger={secondary.danger} onClick={secondary.onClick}>{secondary.text}</Button>
      )}
      <Button type="primary" danger={danger} disabled={okDisabled} onClick={onOk}>{okText}</Button>
    </div>
  );

  return (
    <Modal
      open={open}
      title={
        <div>
          <div style={{ fontSize: 'var(--wb-fs-subtitle)', fontWeight: 600 }}>{title}</div>
          {sub && (
            <div style={{
              fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)',
              fontWeight: 400, marginTop: 4, lineHeight: 1.6,
            }}>{sub}</div>
          )}
        </div>
      }
      onCancel={onCancel}
      footer={ft}
      width={width}
      /* ② 危险操作禁点遮罩，防误触；普通弹窗保持可点遮罩关闭 */
      maskClosable={!danger}
      /* ② 危险操作默认聚焦「取消」，回车不会误触发。
         注意：antd 5.29 的 <Modal> 没有 autoFocusButton（那是 modal.confirm 的 ModalFuncProps），
         这里用 cancelButtonProps.autoFocus 达到同样效果。 */
      cancelButtonProps={danger ? { autoFocus: true } : undefined}
      centered
    >
      <div className="wb2-dlg">{children}</div>
    </Modal>
  );
}

/**
 * 统一二次确认（替代散落各页的 `modal.confirm`）
 *
 * 与 AntD 默认的差异只有 3 处：文案统一、宽度统一、危险操作默认聚焦「取消」。
 * `onOk` 支持返回 Promise（AntD 会在其 resolve 前保持 loading 态）。
 */
export function useConfirm() {
  const { modal } = AntApp.useApp();
  return (cfg: {
    title: ReactNode;
    content?: ReactNode;
    onOk?: () => void | Promise<void>;
    okText?: string;
    danger?: boolean;
    width?: number;
  }) => {
    void modal.confirm({
      title: cfg.title,
      content: cfg.content,
      okText: cfg.okText ?? '确认',
      cancelText: '取消',
      okButtonProps: { danger: cfg.danger },
      autoFocusButton: cfg.danger ? 'cancel' : undefined,
      width: cfg.width ?? 460,
      onOk: cfg.onOk,
    });
  };
}

/** 弹窗内「键值说明」行：统一 label 宽 64 + 值左对齐 */
export function DialogKV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="wb2-dlkv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

/** 弹窗正文里的字段块（标签 + 控件 + 可选说明） */
export function DialogField({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="fld">
      <span className="lb">{label}</span>
      {children}
      {hint && <div style={{ fontSize: 'var(--wb-fs-caption)', color: 'var(--wb-ink-3)', marginTop: 6, lineHeight: 1.6 }}>{hint}</div>}
    </div>
  );
}

export { Space };
