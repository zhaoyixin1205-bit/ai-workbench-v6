/**
 * 冷启动骨架屏
 *
 * 解决的真实问题：Render 免费实例冷启动 15–50 秒，此前全站 100% 无加载反馈（Spin 0 / Skeleton 0），
 * 用户面对完全静止的页面会直接判定「系统坏了」。
 *
 * 为什么两版都启用：这不是视觉升级，是修「白屏无反馈」的可用性缺陷，
 * 与新旧界面无关，故不受版本开关控制。
 *
 * 形状刻意贴合真实布局（顶栏 + 指标条 + 列表行），减少数据到达时的版式跳动。
 */
import { useStore } from '@/store/store';

const bar = (w: string | number, h = 12, mb = 8): React.CSSProperties => ({
  width: typeof w === 'number' ? `${w}%` : w,
  height: h,
  borderRadius: 4,
  background: 'linear-gradient(90deg,#E8EEF9 25%,#F0F4FB 37%,#E8EEF9 63%)',
  backgroundSize: '400% 100%',
  animation: 'wbBootSk 1.4s ease infinite',
  marginBottom: mb,
});

export default function BootSkeleton() {
  /* V7.0：不再新增 store 字段，复用 V6.1 已有的 sync.state（首拉完成前 = loading） */
  const { sync } = useStore();
  if (sync.state !== 'loading') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="正在加载数据"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'var(--wb-surface-page, #F5F7FC)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`@keyframes wbBootSk{0%{background-position:100% 50%}100%{background-position:0 50%}}`}</style>

      {/* 顶栏 */}
      <div
        style={{
          height: 56,
          flex: '0 0 auto',
          background: 'var(--wb-surface-card, #fff)',
          borderBottom: '1px solid var(--wb-border, #D6DFEE)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 24,
        }}
      >
        <div style={bar(120, 18, 0)} />
        <div style={{ flex: 1 }} />
        <div style={bar(160, 14, 0)} />
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={bar('38%', 20, 0)} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: 'var(--wb-surface-card, #fff)',
                border: '1px solid var(--wb-border, #D6DFEE)',
                borderRadius: 12,
                padding: '12px 16px',
              }}
            >
              <div style={bar(56)} />
              <div style={bar(38, 22, 0)} />
            </div>
          ))}
        </div>

        <div
          style={{
            background: 'var(--wb-surface-card, #fff)',
            border: '1px solid var(--wb-border, #D6DFEE)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'center',
                padding: '14px 16px',
                borderBottom: i === 5 ? 'none' : '1px solid var(--wb-border-subtle, #E9EFF9)',
              }}
            >
              <div style={bar('38%', 12, 0)} />
              <div style={{ flex: 1 }} />
              <div style={bar(70, 12, 0)} />
              <div style={bar(52, 12, 0)} />
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--wb-ink-3, #7C8CA6)' }}>
          正在从数据库读取整库，首次打开可能需要 15–50 秒…
        </div>
      </div>
    </div>
  );
}
