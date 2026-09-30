import { Badge, Layout, Space, Typography, Button, Tooltip, Modal } from 'antd';
import {
  HomeOutlined, BulbOutlined, TrophyOutlined, FormOutlined, MedicineBoxOutlined,
  TeamOutlined, AppstoreOutlined, GiftOutlined, UserOutlined, SettingOutlined,
  BellOutlined, QuestionCircleOutlined, MessageOutlined, VerticalAlignTopOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import RoleSwitcher from '@/components/RoleSwitcher';
import SyncBadge from '@/components/SyncBadge';
import NoAccess from '@/components/PageGuard';
import { useStore } from '@/store/store';
import { COLOR, GRADIENT, SHADOW } from '@/theme';
import { HelperBar } from '@/components/ui';
import { canEnterAdmin, checkCAccess } from '@/auth/access';

const { Header, Content } = Layout;

const NAV: { key: string; icon: React.ReactNode; label: string; mobile?: string }[] = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/cases', icon: <BulbOutlined />, label: '案例与选题' },
  { key: '/bounty', icon: <TrophyOutlined />, label: '悬赏榜' },
  { key: '/work', icon: <FormOutlined />, label: '作业提报', mobile: '交作业' },
  { key: '/clinic', icon: <MedicineBoxOutlined />, label: '专家门诊', mobile: '问诊' },
  /* V6.0 CR-30：负责人团队视图（非负责人由守卫表自动过滤，不会出现在菜单里） */
  { key: '/team', icon: <TeamOutlined />, label: '我的团队', mobile: '团队' },
  { key: '/community', icon: <TeamOutlined />, label: '社区' },
  { key: '/assets', icon: <AppstoreOutlined />, label: '资产库' },
  { key: '/shop', icon: <GiftOutlined />, label: '积分商城' },
  { key: '/me', icon: <UserOutlined />, label: '个人中心', mobile: '我的' },
];

export default function CLayout() {
  const { me, flags, db } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  /** V4.1 Moka P10：帮助弹窗（悬浮帮助条入口） */
  const [helpOpen, setHelpOpen] = useState(false);

  const unread = db.messages.filter((m) => m.status === '未读' && (m.union_id === 'all' || m.union_id === me.union_id)).length;
  const currentPath = '/' + (loc.pathname.split('/')[1] ?? '');

  /**
   * 与页级守卫共用同一份授权表：菜单可见 ⇔ 页面可达。
   * V6.0 CR-30：subject 带上 isDeptLeader，供 /team 的属性型守卫判定（纯增量字段）。
   */
  const subject = useMemo(
    () => ({ roles: me.roles, flags, isDeptLeader: me.is_dept_leader }),
    [me.roles, me.is_dept_leader, flags]
  );
  const navItems = useMemo(() => NAV.filter((n) => checkCAccess(n.key, subject).ok), [subject]);
  const guard = useMemo(() => checkCAccess(loc.pathname, subject), [loc.pathname, subject]);
  const canAdmin = canEnterAdmin({ ...subject, isDeptLeader: me.is_dept_leader });

  const mobileItems = navItems.filter((n) => ['/', '/cases', '/work', '/clinic', '/me'].includes(n.key));

  return (
    <Layout style={{ minHeight: '100vh', background: COLOR.bg }}>
      <Header
        style={{
          position: 'sticky', top: 0, zIndex: 90, display: 'flex', alignItems: 'center',
          gap: 24, padding: '0 24px', background: '#fff',
          borderBottom: `1px solid ${COLOR.borderLight}`,
          boxShadow: SHADOW.elevated,
          height: 64,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => nav('/')}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: GRADIENT.primary,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16, boxShadow: SHADOW.button,
          }}>W</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap', lineHeight: 1.2 }}>AI 赋能工作台</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2, color: COLOR.textMuted }}>WorkBuddy · 中小微事业群</Typography.Text>
          </div>
        </div>

        <nav className="only-pc" style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
          {navItems.map((n) => {
            const active = currentPath === n.key;
            return (
              <button
                key={n.key}
                onClick={() => nav(n.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 10, border: 'none', background: 'transparent',
                  color: active ? COLOR.primary : COLOR.textSub, cursor: 'pointer',
                  fontSize: 14, fontWeight: active ? 600 : 500,
                  whiteSpace: 'nowrap', position: 'relative',
                  transition: 'color 0.2s ease, background 0.2s ease',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = COLOR.primaryLight; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {n.icon}
                {n.label}
                {active && (
                  <span style={{
                    position: 'absolute', bottom: 2, left: 14, right: 14, height: 3,
                    background: GRADIENT.primaryDark, borderRadius: 2,
                  }} />
                )}
              </button>
            );
          })}
        </nav>

        <Space size={12}>
          <span className="only-pc"><SyncBadge /></span>
          {canAdmin && (
            <Tooltip title="管理后台 / 工作台">
              <Button
                size="small" icon={<SettingOutlined />} onClick={() => nav('/admin')}
                style={{ borderColor: COLOR.border, color: COLOR.textSub }}
              >后台</Button>
            </Tooltip>
          )}
          <Tooltip title="消息中心">
            <Badge count={unread} size="small" offset={[-2, 2]}>
              <Button
                size="small" shape="circle" icon={<BellOutlined />}
                style={{ borderColor: COLOR.border }}
                onClick={() => nav('/me?tab=message')}
              />
            </Badge>
          </Tooltip>
          <span className="only-pc"><RoleSwitcher /></span>
        </Space>
      </Header>

      <Content className="wb-body-with-tabbar">
        <div className="wb-container" style={{ paddingTop: 24, paddingBottom: 32 }}>
          <span className="only-mobile" style={{ display: 'block', marginBottom: 12 }}><RoleSwitcher /></span>
          <div className="wb-page" key={loc.pathname}>
            {guard.ok ? <Outlet /> : <NoAccess result={guard} roles={me.roles} />}
          </div>
        </div>
      </Content>

      <div className="wb-tabbar only-mobile">
        {mobileItems.map((t) => (
          <div
            key={t.key}
            className={`wb-tabbar-item${currentPath === t.key ? ' active' : ''}`}
            onClick={() => nav(t.key)}
          >
            {t.icon}
            <span>{t.mobile ?? t.label}</span>
          </div>
        ))}
      </div>

      {/* V4.1 Moka P10：右侧常驻帮助条（≤64px，不挡内容）；主动气泡只弹一次、可关闭 */}
      {flags.helperBar !== false && (
        <HelperBar
          bubble={{
            title: '第一次用？',
            desc: '挑一个案例照着做就行 —— 输入、提示词、产出物、验收标准都给全了，30 分钟能出稿。',
          }}
          items={[
            { icon: <QuestionCircleOutlined />, label: '怎么用', onClick: () => setHelpOpen(true) },
            { icon: <MessageOutlined />, label: '反馈', onClick: () => nav('/me?tab=message') },
            { icon: <VerticalAlignTopOutlined />, label: '回顶', onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
          ]}
        />
      )}

      <Modal
        open={helpOpen}
        title="怎么用这个工作台"
        onCancel={() => setHelpOpen(false)}
        footer={[
          <Button key="close" type="primary" shape="round" onClick={() => setHelpOpen(false)}>知道了</Button>,
        ]}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <b>1 · 挑一个场景</b>
            <div style={{ fontSize: 13, color: COLOR.textSub, marginTop: 2 }}>
              进「案例与选题」，找一个跟你工作像的。带 🧩 标记的直接有 Skill 可装，装完就能跑。
            </div>
          </div>
          <div>
            <b>2 · 照着做</b>
            <div style={{ fontSize: 13, color: COLOR.textSub, marginTop: 2 }}>
              案例页给了输入、可直接抄的提示词、产出物、验收标准四件套，缺一不可发布。
            </div>
          </div>
          <div>
            <b>3 · 交作业</b>
            <div style={{ fontSize: 13, color: COLOR.textSub, marginTop: 2 }}>
              在「作业提报」提交，评分后会进资产库，别人就能照着你的做。
            </div>
          </div>
          <div style={{ fontSize: 12, color: COLOR.textMuted }}>
            卡住了？右上角切身份看看别人眼里是什么样，或直接去「专家门诊」约人问。
          </div>
        </Space>
      </Modal>
    </Layout>
  );
}
