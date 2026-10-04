import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { HomeOutlined, FormOutlined, BulbOutlined } from '@ant-design/icons';

/**
 * 404 页
 *
 * 现状是 `path="*"` → `<Navigate to="/" replace />`（App.tsx:87），
 * 静默跳首页等于**掩盖死链**：用户收藏的旧链接失效后毫无感知，
 * 也让「旧路径是否可达」这件事无法被验证。
 *
 * 本页遵循 P2 §3.5：旧路径一律保留 + 重定向，只有真正不存在的路径才落到这里。
 */

const ENTRIES = [
  { to: '/', label: '返回首页', desc: '回到工作台首屏', icon: <HomeOutlined />, primary: true },
  { to: '/work', label: '我的作业', desc: '查看提报状态与截止时间', icon: <FormOutlined />, primary: false },
  { to: '/cases', label: '案例与选题', desc: '找可照着做的样板', icon: <BulbOutlined />, primary: false },
];

export default function NotFound() {
  const nav = useNavigate();

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--wb-surface-page, #F5F7FC)',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <div
          aria-hidden
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: 'var(--wb-primary, #FF6B35)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          404
        </div>
        <div style={{ fontSize: 20, fontWeight: 500, marginTop: 8 }}>这个页面不存在</div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--wb-ink-2, #44546B)',
            marginTop: 8,
            lineHeight: 1.7,
          }}
        >
          链接可能来自旧版本，或页面已被管理员调整。
          <br />
          你提交的数据不受影响，可以从下面任一入口继续。
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
            gap: 12,
            marginTop: 24,
          }}
        >
          {ENTRIES.map((e) => (
            <button
              key={e.to}
              type="button"
              onClick={() => nav(e.to)}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                background: 'var(--wb-surface-card, #fff)',
                border: `1px solid var(--wb-border, #D6DFEE)`,
                borderRadius: 'var(--wb-radius-lg, 12px)',
                padding: 16,
                fontFamily: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: e.primary ? 'var(--wb-primary, #FF6B35)' : 'var(--wb-ink-2, #44546B)' }}>
                  {e.icon}
                </span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{e.label}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--wb-ink-3, #7C8CA6)', marginTop: 4 }}>{e.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <Button type="primary" onClick={() => nav('/')}>
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}
