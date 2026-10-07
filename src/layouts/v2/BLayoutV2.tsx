import { Space, Button, Select, Tag, Alert } from 'antd';
import {
  DashboardOutlined, FormOutlined, CheckSquareOutlined, InboxOutlined, FileTextOutlined,
  TeamOutlined, GiftOutlined, CrownOutlined, TrophyOutlined, MedicineBoxOutlined,
  SlidersOutlined, UserOutlined, DatabaseOutlined, SettingOutlined,
  ArrowLeftOutlined, ExportOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import RoleSwitcher from '@/components/RoleSwitcher';
import NoAccess from '@/components/PageGuard';
import SyncBadge from '@/components/SyncBadge';
import { useStore } from '@/store/store';
import { DEMO_TODAY } from '@/mock/seedBiz';
import { ADMIN_ACCESS, checkAdminAccess, visibleAdminRoutes } from '@/auth/access';
import { useSkillAdminConverge } from '@/auth/converge';
import '../../theme/v2/shell.css';

/**
 * 后台壳层 v2（P3-2）
 *
 * 相对 v1 的变化（业务能力 100% 对等）：
 *   ① 侧栏 5 组 → 4 组（「专家端」单 item 组并入「内容与社区」）
 *   ② 激活态：去掉 AntD Menu 的灰底块，改为「主色 3px 左指示条 + 淡橙底」
 *   ③ 组标题 11px/500 ink-3（Miro micro-uppercase 机制，中文不用大写）
 *   ④ 视觉全部走 tokens.css 变量
 *
 * 保留的 v1 能力：visibleKeys 菜单可见性（与页级守卫同源）、技能管理员收敛
 * useSkillAdminConverge（含 grantContent 例外放行）、NoAccess、只读 Alert、
 * 届次 Select、数据截止 Tag、导出按钮、RoleSwitcher、返回工作台、面包屑。
 * ⚠️ 授权表 ADMIN_ACCESS 是单一真源，本壳未改任何判定逻辑。
 */

/** 分组：key 必须来自 auth/access 的 ADMIN_ACCESS 授权表 */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: '概览', keys: ['/admin'] },
  {
    title: '业务运营',
    keys: ['/admin/assignment', '/admin/scorecard', '/admin/judge', '/admin/bounty', '/admin/expert', '/admin/asset'],
  },
  // v2：专家工作台并入本组，侧栏由 5 组变 4 组
  { title: '内容与社区', keys: ['/admin/content', '/admin/community', '/admin/shop', '/admin/expert-workbench'] },
  { title: '系统与权限', keys: ['/admin/users', '/admin/campaign', '/admin/system', '/admin/wb'] },
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

export default function BLayoutV2() {
  const { me, flags, db, campaign, hasCampaign, setCurrentCampaignId } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const path = loc.pathname;

  /** V6.0：带上 isDeptLeader（/team 属性型守卫）；不声明该字段的路由判定不受影响 */
  const subject = useMemo(
    () => ({ roles: me.roles, flags, isDeptLeader: me.is_dept_leader }),
    [me.roles, me.is_dept_leader, flags]
  );
  const converge = useSkillAdminConverge();

  const visibleKeys = useMemo(() => {
    const base = new Set(visibleAdminRoutes(subject).map((a) => a.key));
    if (converge.menuKeys) {
      const allow = new Set(converge.menuKeys);
      [...base].forEach((k) => { if (!allow.has(k)) base.delete(k); });
      if (converge.canContent && !base.has('/admin/content')) base.add('/admin/content');
    }
    return base;
  }, [subject, converge.menuKeys, converge.canContent]);

  const guard = useMemo(() => {
    const r = checkAdminAccess(path, subject);
    if (!r.ok && converge.canContent && path === '/admin/content') {
      return { ok: true as const, access: ADMIN_ACCESS.find((a) => a.key === '/admin/content')! };
    }
    return r;
  }, [path, subject, converge.canContent]);

  const current = ADMIN_ACCESS.find((a) => a.key === path);

  const shell = (children: React.ReactNode) => (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--wb-surface-page)' }}>
      {visibleKeys.size > 0 && (
        <aside className="wb2-side only-pc">
          <div style={{ padding: '8px 20px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="wb2-logo-mark" style={{ width: 26, height: 26, fontSize: 13 }}>W</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--wb-ink-1)' }}>管理后台</span>
          </div>

          {GROUPS.map((g) => {
            const items = g.keys
              .filter((k) => visibleKeys.has(k))
              .map((k) => ({ key: k, label: ADMIN_ACCESS.find((a) => a.key === k)!.label }));
            if (items.length === 0) return null;
            return (
              <div key={g.title}>
                <div className="wb2-side-group">{g.title}</div>
                {items.map((it) => (
                  <button
                    key={it.key}
                    className={`wb2-side-item${path === it.key ? ' on' : ''}`}
                    onClick={() => nav(it.key)}
                  >
                    <span className="wb2-side-ic">{ICON[it.key]}</span>
                    {it.label}
                  </button>
                ))}
              </div>
            );
          })}
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header className="wb2-hd only-pc" style={{ padding: '0 20px' }}>
          <Space size={12} wrap style={{ flex: 1, minWidth: 0 }}>
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => nav('/')}>返回工作台</Button>
            <nav className="wb2-crumb" style={{ margin: 0 }} aria-label="面包屑">
              <span>管理后台</span>
              {current && <span className="cur">{current.label}</span>}
            </nav>
          </Space>
          <div className="wb2-hd-right">
            <Space size={4}>
              <span style={{ fontSize: 12, color: 'var(--wb-ink-3)' }}>届次</span>
              {/* V7.1：此前 defaultValue 写死 C2026Q4 且无 onChange，选了也不切换 */}
              <Select
                size="small"
                style={{ width: 180 }}
                placeholder="尚未创建届次"
                value={hasCampaign ? campaign.id : undefined}
                onChange={(v) => setCurrentCampaignId(v)}
                options={(db.campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
            </Space>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>数据截止 {DEMO_TODAY}（T-1）</Tag>
            <SyncBadge />
            <Button size="small" icon={<ExportOutlined />}>导出</Button>
            <RoleSwitcher />
          </div>
        </header>

        <main style={{ flex: 1, padding: 'var(--wb-space-5)' }}>
          <div className="wb-container-wide">{children}</div>
        </main>
      </div>
    </div>
  );

  if (!guard.ok) {
    return shell(<NoAccess result={guard} roles={me.roles} onBack={() => nav('/')} onBackText="返回工作台" />);
  }

  const readOnly = converge.isReadOnly(path);

  return shell(
    <>
      {readOnly && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 'var(--wb-space-5)' }}
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
