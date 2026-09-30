import { Layout, Menu, Space, Typography, Button, Select, Tag, Breadcrumb, Alert } from 'antd';
import {
  DashboardOutlined, FormOutlined, CheckSquareOutlined, InboxOutlined, FileTextOutlined,
  TeamOutlined, GiftOutlined, CrownOutlined, TrophyOutlined, MedicineBoxOutlined,
  SlidersOutlined, UserOutlined, DatabaseOutlined, SettingOutlined,
  ArrowLeftOutlined, ExportOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import RoleSwitcher from '@/components/RoleSwitcher';
import SyncBadge from '@/components/SyncBadge';
import NoAccess from '@/components/PageGuard';
import { useStore } from '@/store/store';
import { COLOR, SHADOW } from '@/theme';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { ADMIN_ACCESS, checkAdminAccess, visibleAdminRoutes } from '@/auth/access';
import { useSkillAdminConverge } from '@/auth/converge';

const { Sider, Header, Content } = Layout;

/** 后台菜单分组：key 必须来自 auth/access 的 ADMIN_ACCESS 授权表（单一真源） */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: '概览', keys: ['/admin'] },
  {
    title: '业务运营',
    keys: ['/admin/assignment', '/admin/scorecard', '/admin/judge', '/admin/bounty', '/admin/expert', '/admin/asset'],
  },
  { title: '内容与社区', keys: ['/admin/content', '/admin/community', '/admin/shop'] },
  { title: '系统与权限', keys: ['/admin/users', '/admin/campaign', '/admin/system', '/admin/wb'] },
  { title: '专家端', keys: ['/admin/expert-workbench'] },
];

const ICON: Record<string, React.ReactNode> = {
  '/admin': <DashboardOutlined />,
  '/admin/assignment': <FormOutlined />,
  '/admin/scorecard': <SlidersOutlined />,
  '/admin/judge': <CheckSquareOutlined />,
  '/admin/bounty': <TrophyOutlined />,
  '/admin/expert': <MedicineBoxOutlined />,
  '/admin/asset': <InboxOutlined />,
  '/admin/content': <FileTextOutlined />,
  '/admin/community': <TeamOutlined />,
  '/admin/shop': <GiftOutlined />,
  '/admin/users': <UserOutlined />,
  '/admin/campaign': <CalendarOutlined />,
  '/admin/system': <SettingOutlined />,
  '/admin/wb': <DatabaseOutlined />,
  '/admin/expert-workbench': <CrownOutlined />,
};

export default function BLayout() {
  const { me, flags, db } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const path = loc.pathname;

  const subject = useMemo(
    /** V6.0：带上 isDeptLeader（/team 属性型守卫）；不声明该字段的路由判定不受影响 */
    () => ({ roles: me.roles, flags, isDeptLeader: me.is_dept_leader }),
    [me.roles, me.is_dept_leader, flags]
  );

  /** V4.0 CR-09：技能管理员权限收敛（不改 access.ts，只在其结果之上收敛） */
  const converge = useSkillAdminConverge();

  /** 菜单可见项：与页级守卫共用同一份授权表，避免「菜单隐藏但可直达」 */
  const visibleKeys = useMemo(() => {
    const base = new Set(visibleAdminRoutes(subject).map((a) => a.key));
    if (converge.menuKeys) {
      // 收敛态：只保留白名单（如需授权可能是 grantContent 放行的 /admin/content）
      const allow = new Set(converge.menuKeys);
      [...base].forEach((k) => { if (!allow.has(k)) base.delete(k); });
      if (converge.canContent && !base.has('/admin/content')) base.add('/admin/content');
    }
    return base;
  }, [subject, converge.menuKeys, converge.canContent]);

  const guard = useMemo(() => {
    const r = checkAdminAccess(path, subject);
    // CR-09 skillAdmin.grantContent：经系统管理员授权后，内容管理对技能管理员例外放行
    if (!r.ok && converge.canContent && path === '/admin/content') {
      return { ok: true as const, access: ADMIN_ACCESS.find((a) => a.key === '/admin/content')! };
    }
    return r;
  }, [path, subject, converge.canContent]);
  const current = ADMIN_ACCESS.find((a) => a.key === path);

  const shell = (children: React.ReactNode) => (
    <Layout style={{ minHeight: '100vh', background: COLOR.bg }}>
      {visibleKeys.size > 0 && (
        <Sider
          width={208}
          breakpoint="lg"
          collapsedWidth={0}
          style={{ background: '#fff', borderRight: `1px solid ${COLOR.border}`, overflowY: 'auto' }}
          className="only-pc"
        >
          <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8, background: COLOR.primary, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
            }}>W</div>
            <Typography.Text strong>管理后台</Typography.Text>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[path]}
            items={GROUPS.map((g) => ({
              key: g.title,
              type: 'group' as const,
              label: g.title,
              children: g.keys
                .filter((k) => visibleKeys.has(k))
                .map((k) => {
                  const acc = ADMIN_ACCESS.find((a) => a.key === k)!;
                  return { key: k, icon: ICON[k], label: acc.label };
                }),
            })).filter((g) => (g.children?.length ?? 0) > 0)}
            onClick={({ key }) => nav(key)}
            style={{ border: 'none' }}
          />
        </Sider>
      )}

      <Layout>
        <Header
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '0 20px', background: '#fff', borderBottom: `1px solid ${COLOR.borderLight}`,
            height: 60, boxShadow: SHADOW.elevated, position: 'sticky', top: 0, zIndex: 89,
          }}
        >
          <Space size={12} wrap>
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => nav('/')}>返回工作台</Button>
            <Breadcrumb
              items={[{ title: '管理后台' }, ...(current ? [{ title: current.label }] : [])]}
              style={{ fontSize: 13 }}
            />
          </Space>
          <Space size={8} wrap>
            <Space size={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>届次</Typography.Text>
              <Select
                size="small" defaultValue="C2026Q4" style={{ width: 180 }}
                options={db.campaigns.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Space>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>数据截止 {DEMO_TODAY}（T-1）</Tag>
            <SyncBadge />
            <Button size="small" icon={<ExportOutlined />}>导出</Button>
            <RoleSwitcher />
          </Space>
        </Header>

        <Content style={{ padding: 16 }}>
          <div className="wb-container-wide">{children}</div>
        </Content>
      </Layout>
    </Layout>
  );

  if (!guard.ok) {
    return shell(<NoAccess result={guard} roles={me.roles} onBack={() => nav('/')} onBackText="返回工作台" />);
  }

  const readOnly = converge.isReadOnly(path);

  return shell(
    <>
      {readOnly && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message="当前身份为该页面的只读浏览者"
          description="V4.0 CR-09：技能管理员（SKILL_ADMIN）可查看本页数据用于入库与上架判断，但不具备审批、发布、DA 调整等写操作权限；确需编辑请由组织者或系统管理员在「用户与权限」中授予。"
        />
      )}
      <div className="wb-page" key={path}>
        <Outlet />
      </div>
    </>
  );
}
