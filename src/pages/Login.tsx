/**
 * V8.3-10.08 需求①：登录 / 身份选择页
 *
 * 这是「所有人进站都是管理员」这个问题的**止血点**：
 * 原来 store 有 `me = find(meId) ?? db.users[0]` 的静默兜底 ——
 * 任何人只要打开网址，都会被顶成 users[0]（恰好是赵冰艳，ORGANIZER + 全域权限）。
 * 现在兜底取消：**没有身份就没有身份**，进本页，由本页决定「钉钉扫码」还是「手动选一个」。
 *
 * 两种模式：
 *   ① 配了 DINGTALK_CLIENT_ID/SECRET → 主推「钉钉扫码登录」，身份以钉钉为准；
 *   ② 没配（本地开发 / 演示）→ 降级为「按角色选人」，功能等价、只是身份是手选的。
 */
import { Button, Space, Spin, Typography } from 'antd';
import { SafetyCertificateOutlined, QrcodeOutlined, TeamOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { isDingtalkEnabled, startDingtalkLogin, loginWithCode } from '@/auth/dingtalk';
import { ROLE_LABEL } from '@/mock/types';
import type { Role } from '@/mock/types';

const LS_ME = 'wb-workbench-me-v3.0.0';

/**
 * 登录页刻意渲染在 HashRouter **之外**（未登录时连路由壳都不给），
 * 所以不能用 useNavigate —— 直接改 hash，交给随后挂载的 Router 接管。
 */
const go = (path: string) => {
  window.location.hash = path || '/';
};

export default function Login({ callbackPath = '' }: { callbackPath?: string }) {
  const { db, switchIdentity } = useStore();
  const [dingtalkOn, setDingtalkOn] = useState<boolean | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void isDingtalkEnabled().then(setDingtalkOn);
  }, []);

  /**
   * 回调落地：URL 上带 code + state 时用它换身份。
   * 放在这里而不是单独的路由页，是因为登录页本来就是「未登录」时唯一渲染的页面，
   * 少一层路由跳转、也少一处判断。
   */
  const code = new URLSearchParams(window.location.search).get('code');
  const state = new URLSearchParams(window.location.search).get('state');
  useEffect(() => {
    if (!code || !state) return;
    setBusy(true);
    void loginWithCode(code, state).then((r) => {
      // 用 replace 清掉 URL 上的授权码，避免刷新时重复兑换（code 一次性）
      window.history.replaceState({}, '', window.location.pathname || '/');
      if (r.ok) {
        /** 关键：必须走 store 的 switchIdentity，只写 localStorage 不会触发重渲染 */
        switchIdentity(r.profile.unionId);
        if (callbackPath) go(callbackPath);
      } else {
        setErr(r.error);
        setBusy(false);
      }
    });
  }, [code, state, callbackPath, switchIdentity]);

  /** 降级模式：按角色分组列人（点谁就是谁，语义与顶栏身份切换器一致） */
  const byRole = useMemo(() => {
    const groups = new Map<string, typeof db.users>();
    for (const u of db.users) {
      if (u.status === 99) continue;
      const r = u.roles.includes('ORGANIZER') ? 'ORGANIZER'
        : u.roles.includes('ADMIN') ? 'ADMIN'
        : u.roles.includes('JUDGE') ? 'JUDGE'
        : u.roles.includes('EXPERT') ? 'EXPERT'
        : u.roles.includes('LEADER') ? 'LEADER'
        : 'MEMBER';
      const list = groups.get(r) ?? [];
      list.push(u);
      groups.set(r, list);
    }
    return groups;
  }, [db.users]);

  const pick = (unionId: string) => {
    switchIdentity(unionId);
    if (callbackPath) go(callbackPath);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--wb-surface-page, #FFFDFA)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 14px', borderRadius: 18,
            background: 'linear-gradient(135deg,#FF6B35,#EC4899 55%,#8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 24, fontWeight: 800,
          }}>W</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>WorkBuddy AI 赋能工作台</div>
          <div style={{ fontSize: 13, color: 'var(--wb-ink-3,#857E90)', marginTop: 6 }}>
            请先确认你的身份 —— 不同角色看到的页面与数据不同
          </div>
        </div>

        {busy && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="正在通过钉钉验证身份…" />
          </div>
        )}

        {!busy && dingtalkOn && (
          <div style={{
            background: 'var(--wb-surface-card,#fff)', border: '1px solid var(--wb-border,#F2EBDD)',
            borderRadius: 'var(--wb-radius-lg,16px)', padding: 28, textAlign: 'center',
            boxShadow: 'var(--wb-shadow-card)',
          }}>
            <QrcodeOutlined style={{ fontSize: 44, color: '#1677FF' }} />
            <div style={{ marginTop: 14, fontWeight: 700, fontSize: 16 }}>钉钉扫码登录</div>
            <div style={{ fontSize: 12.5, color: 'var(--wb-ink-3,#857E90)', marginTop: 6, lineHeight: 1.7 }}>
              身份与权限以钉钉通讯录为准，换人登录即换视角
            </div>
            <Button
              type="primary" size="large" icon={<QrcodeOutlined />}
              style={{ marginTop: 20 }}
              onClick={() => void startDingtalkLogin()}
            >
              扫码登录
            </Button>
            {err && <div style={{ color: '#DC2626', fontSize: 12, marginTop: 12 }}>{err}</div>}
          </div>
        )}

        {!busy && dingtalkOn === false && (
          <div style={{
            background: 'var(--wb-surface-card,#fff)', border: '1px solid var(--wb-border,#F2EBDD)',
            borderRadius: 'var(--wb-radius-lg,16px)', padding: 20,
            boxShadow: 'var(--wb-shadow-card)',
          }}>
            <div style={{ fontSize: 13, color: 'var(--wb-ink-2,#514B5B)', marginBottom: 12 }}>
              <SafetyCertificateOutlined style={{ marginRight: 6, color: '#D97706' }} />
              钉钉免登未启用（服务端未配置 DINGTALK_CLIENT_ID / SECRET），下面是按角色选择身份。
            </div>
            <div style={{ maxHeight: 360, overflow: 'auto', paddingRight: 4 }}>
              {[...byRole.entries()].map(([role, list]) => (
                <div key={role} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--wb-ink-3,#857E90)', marginBottom: 6 }}>
                    {ROLE_LABEL[role as Role] ?? role} · {list.length} 人
                  </div>
                  <Space size={6} wrap>
                    {list.slice(0, 24).map((u) => (
                      <Button key={u.union_id} size="small" onClick={() => pick(u.union_id)}>
                        {u.name}
                      </Button>
                    ))}
                    {list.length > 24 && <Typography.Text type="secondary" style={{ fontSize: 11 }}>等 {list.length} 人</Typography.Text>}
                  </Space>
                </div>
              ))}
            </div>
          </div>
        )}

        {!busy && dingtalkOn === null && (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        )}

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11.5, color: 'var(--wb-ink-4,#BAB3C1)' }}>
          <TeamOutlined style={{ marginRight: 4 }} />
          身份仅用于确定页面视角与数据范围，不影响他人
        </div>
      </div>
    </div>
  );
}