import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from 'antd';

/**
 * 全局错误边界（现状：全库 0 个 ErrorBoundary，任一组件抛错即整页白屏）
 *
 * P3-1 新增。这里刻意不引第三方库（react-error-boundary），因为只需要一个最简实现，
 * 少一个依赖就少一处升级风险。
 *
 * 设计要点：
 * - 错误信息用「人话 + 可操作出口」，不把堆栈直接甩给业务用户；
 * - 开发环境下同时打印到控制台，便于定位；
 * - 提供「重试」与「刷新」两条出口，避免用户只能刷新浏览器。
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 生产环境这里可以接上报（本期只打控制台，不引入监控依赖）
    console.error('[ErrorBoundary] 页面渲染异常：', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });
  private reload = () => window.location.reload();

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--wb-surface-page, #F5F7FC)',
        }}
      >
        <div
          style={{
            maxWidth: 460,
            background: 'var(--wb-surface-card, #fff)',
            border: '1px solid var(--wb-border, #D6DFEE)',
            borderRadius: 'var(--wb-radius-lg, 12px)',
            padding: 24,
            boxShadow: 'var(--wb-shadow-popover)',
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div
              aria-hidden
              style={{
                width: 32,
                height: 32,
                flex: '0 0 auto',
                borderRadius: 'var(--wb-radius-pill, 999px)',
                background: 'var(--wb-error-soft, #FEF2F2)',
                color: 'var(--wb-error, #DC2626)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
              }}
            >
              !
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500 }}>这个页面出了点问题</div>
              <div style={{ fontSize: 12, color: 'var(--wb-ink-2, #44546B)', marginTop: 4, lineHeight: 1.6 }}>
                你的数据不会因此丢失。可以先重试一次；如果一直不行，把下面的错误码发给管理员。
              </div>
              <div
                style={{
                  marginTop: 12,
                  padding: '8px 10px',
                  background: 'var(--wb-surface-sunken, #E8EEF9)',
                  borderRadius: 'var(--wb-radius-md, 6px)',
                  fontSize: 11,
                  color: 'var(--wb-ink-3, #7C8CA6)',
                  wordBreak: 'break-all',
                }}
              >
                {error.name}: {error.message || '(无消息)'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={this.reload}>
                  刷新页面
                </Button>
                <Button size="small" type="primary" onClick={this.reset}>
                  重试
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
