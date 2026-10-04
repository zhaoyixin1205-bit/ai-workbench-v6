import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Modal, Space, Tooltip, Button, App as AntApp } from 'antd';
import {
  HomeOutlined, BulbOutlined, TrophyOutlined, FormOutlined, MedicineBoxOutlined,
  TeamOutlined, AppstoreOutlined, GiftOutlined, UserOutlined, SettingOutlined,
  BellOutlined, QuestionCircleOutlined, MessageOutlined, VerticalAlignTopOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useStore } from '@/store/store';
import { canEnterAdmin, checkCAccess } from '@/auth/access';
import RoleSwitcher from '@/components/RoleSwitcher';
import NoAccess from '@/components/PageGuard';
import SyncBadge from '@/components/SyncBadge';
import { HelperBar } from '@/components/ui';
import { useUIVersion } from '@/ui/UIVersionProvider';
import { versionSwitchVisible } from '@/ui/version';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import '../../theme/v2/shell.css';

/**
 * C 端壳层 v2（P3-2）
 *
 * 相对 v1 的变化（业务能力 100% 对等，v1 的每个入口这里都有）：
 *   ① 顶栏 9 项平铺 → 3 组（10px 组标签 + 淡底靛蓝容器），点击深度仍为 1 跳
 *   ② 新增面包屑（v1 只有后台有）
 *   ③ 新增全局搜索 Cmd/Ctrl+K（案例/选题/悬赏/作业/专家/帖子/板块/资产/商品 共 9 类）
 *   ④ 新增版本切换控件（仅 ADMIN 可见，用户 10-04 拍板限制）
 *   ⑤ 视觉全部走 tokens.css 变量，零裸 hex
 *
 * 保留的 v1 能力：权限过滤 checkCAccess、NoAccess 守卫、后台入口、消息角标、
 * RoleSwitcher、HelperBar 帮助条、帮助弹窗、移动端 5 项 Tab 栏。
 */

interface NavItem {
  key: string;
  label: string;
  mobile?: string;
  icon: React.ReactNode;
  group: 'main' | 'act' | 'grow';
}

/** 分组定义：main=独立入口；act=我要参与；grow=学习与产出 */
const NAV: NavItem[] = [
  { key: '/', label: '首页', icon: <HomeOutlined />, group: 'main' },
  /* V7.0 CR-32：评委评分入口，排在「案例与选题」之前，与 v1 菜单顺序一致 */
  { key: '/judge', label: '评委评分', icon: <SafetyCertificateOutlined />, group: 'act' },
  { key: '/cases', label: '案例与选题', icon: <BulbOutlined />, group: 'act' },
  { key: '/bounty', label: '悬赏榜', icon: <TrophyOutlined />, group: 'act' },
  { key: '/work', label: '作业提报', mobile: '交作业', icon: <FormOutlined />, group: 'act' },
  { key: '/clinic', label: '专家门诊', mobile: '问诊', icon: <MedicineBoxOutlined />, group: 'grow' },
  { key: '/community', label: '社区', icon: <TeamOutlined />, group: 'grow' },
  { key: '/assets', label: '资产库', icon: <AppstoreOutlined />, group: 'grow' },
  { key: '/shop', label: '积分商城', icon: <GiftOutlined />, group: 'grow' },
  /* V6.0 CR-30：负责人团队视图 */
  { key: '/team', label: '我的团队', icon: <TeamOutlined />, group: 'grow' },
  { key: '/me', label: '个人中心', mobile: '我的', icon: <UserOutlined />, group: 'main' },
];

const GROUP_LABEL: Record<string, string> = { act: '我要参与', grow: '学习与产出' };

/** 面包屑只认得这些一级段，其余（详情页 id 段）统一显示为「详情」 */
const CRUMB: Record<string, string> = {
  judge: '评委评分',
  cases: '案例与选题',
  bounty: '悬赏榜',
  work: '作业提报',
  clinic: '专家门诊',
  community: '社区',
  assets: '资产库',
  shop: '积分商城',
  team: '我的团队',
  me: '个人中心',
};

export default function CLayoutV2() {
  const { db, me, flags } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const { version, setVersion } = useUIVersion();
  const { message } = AntApp.useApp();

  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [kw, setKw] = useState('');

  const unread = db.messages.filter(
    (m) => m.status === '未读' && (m.union_id === 'all' || m.union_id === me.union_id)
  ).length;

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
  const canAdmin = canEnterAdmin(subject);
  /** 拍板 2-A：评委入口同时进移动端 tabbar（白名单需显式登记，与桌面菜单是两套渲染） */
  const mobileItems = navItems.filter((n) =>
    ['/', '/judge', '/cases', '/work', '/clinic', '/me'].includes(n.key)
  );
  const showVersionSwitch = versionSwitchVisible(me.roles);

  /* ---------- 面包屑 ---------- */
  const crumbs = useMemo(() => {
    const seg = loc.pathname.split('/').filter(Boolean);
    const out: { name: string; cur?: boolean }[] = [{ name: '首页' }];
    if (seg.length === 0) return out;
    const first = CRUMB[seg[0]];
    out.push({ name: first ?? seg[0] });
    if (seg.length > 1) out.push({ name: seg[1].startsWith(':') || /^[A-Za-z]?\d+$/.test(seg[1]) ? '详情' : seg[1], cur: true });
    else out[out.length - 1].cur = true;
    return out;
  }, [loc.pathname]);

  /* ---------- 全局搜索（Cmd/Ctrl+K） ---------- */
  const results = useGlobalSearch(kw);
  const [cursor, setCursor] = useState(0);

  useEffect(() => { setCursor(0); }, [kw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (!searchOpen) return;
      if (e.key === 'Escape') { setSearchOpen(false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); return; }
      if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); go(results[cursor].to); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, results, cursor]);

  const go = (to: string) => {
    setSearchOpen(false);
    setKw('');
    nav(to);
  };

  const renderGroup = (g: 'act' | 'grow') => (
    <div className="wb2-nav-group" key={g}>
      <div className="wb2-nav-label">{GROUP_LABEL[g]}</div>
      <div className="wb2-nav-box">
        {navItems.filter((n) => n.group === g).map((n) => (
          <button
            key={n.key}
            className={`wb2-nav-item${currentPath === n.key ? ' on' : ''}`}
            onClick={() => nav(n.key)}
          >
            {n.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--wb-surface-page)', display: 'flex', flexDirection: 'column' }}>
      {/* ================= 顶栏 ================= */}
      <header className="wb2-hd only-pc">
        <button className="wb2-logo" onClick={() => nav('/')}>
          <span className="wb2-logo-mark">W</span>
          <span>
            <span className="wb2-logo-name">AI 赋能工作台</span>
            <span className="wb2-logo-sub" style={{ display: 'block' }}>WorkBuddy · 中小微事业群</span>
          </span>
        </button>

        <nav className="wb2-nav">
          {navItems.filter((n) => n.group === 'main').map((n) => (
            <button
              key={n.key}
              className={`wb2-nav-item home${currentPath === n.key ? ' on' : ''}`}
              onClick={() => nav(n.key)}
            >
              {n.label}
            </button>
          ))}
          {renderGroup('act')}
          {renderGroup('grow')}
        </nav>

        <div className="wb2-hd-right">
          <span className="only-pc"><SyncBadge /></span>
          <div className="wb2-search" onClick={() => setSearchOpen(true)} role="search">
            搜索案例 / 悬赏 / 资产 / 帖子
            <kbd>⌘K</kbd>
          </div>

          {showVersionSwitch && (
            <div className="wb2-ver" title="仅管理员可见">
              <button className={version === 'v2' ? 'on' : ''} onClick={() => setVersion('v2')}>新版</button>
              <button className={version === 'v1' ? 'on' : ''} onClick={() => setVersion('v1')}>旧版</button>
              <em>仅管理员</em>
            </div>
          )}

          {canAdmin && (
            <Tooltip title="管理后台 / 工作台">
              <Button size="small" icon={<SettingOutlined />} onClick={() => nav('/admin')}>后台</Button>
            </Tooltip>
          )}
          <Tooltip title="消息中心">
            <Badge count={unread} size="small" offset={[-2, 2]}>
              <Button size="small" shape="circle" icon={<BellOutlined />} onClick={() => nav('/me?tab=message')} />
            </Badge>
          </Tooltip>
          <RoleSwitcher />
        </div>
      </header>

      {/* 移动端顶栏 */}
      <header className="wb2-hd only-mobile" style={{ height: 52 }}>
        <button className="wb2-logo" onClick={() => nav('/')}>
          <span className="wb2-logo-mark">W</span>
          <span className="wb2-logo-name">AI 赋能工作台</span>
        </button>
        <div className="wb2-hd-right">
          <Badge count={unread} size="small" offset={[-2, 2]}>
            <Button size="small" shape="circle" icon={<BellOutlined />} onClick={() => nav('/me?tab=message')} />
          </Badge>
          <RoleSwitcher />
        </div>
      </header>

      {/* ================= 搜索面板 ================= */}
      {searchOpen && (
        <div className="wb2-panel" onClick={() => setSearchOpen(false)}>
          <div className="wb2-panel-box" onClick={(e) => e.stopPropagation()}>
            <input
              className="wb2-panel-input"
              autoFocus
              placeholder="搜案例 / 选题 / 悬赏 / 作业 / 专家 / 帖子 / 板块 / 资产 / 商品"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
            <div className="wb2-panel-list">
              {results.length === 0 ? (
                <div className="wb2-panel-empty">
                  {kw ? `没有匹配「${kw}」的内容` : '输入关键词开始搜索；↑↓ 选择，Enter 打开，Esc 关闭'}
                </div>
              ) : (
                results.map((r, i) => (
                  <div
                    key={`${r.kind}-${r.title}-${i}`}
                    className={`wb2-panel-item${i === cursor ? ' on' : ''}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(r.to)}
                  >
                    <span className="wb2-panel-kind">{r.kind}</span>
                    <span className="wb2-panel-title">{r.title}</span>
                    {r.desc && <span className="wb2-panel-desc">{r.desc}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= 内容区 ================= */}
      <main className="wb-body-with-tabbar" style={{ flex: 1 }}>
        <div className="wb-container" style={{ paddingTop: 'var(--wb-space-6)', paddingBottom: 'var(--wb-space-7)' }}>
          <div className="only-mobile" style={{ display: 'block', marginBottom: 'var(--wb-space-4)' }}>
            <RoleSwitcher />
          </div>

          {/* 面包屑：v1 C 端没有，v2 新增 */}
          <nav className="wb2-crumb" aria-label="面包屑">
            {crumbs.map((c, i) => (
              <span key={i} className={c.cur ? 'cur' : undefined}>{c.name}</span>
            ))}
          </nav>

          <div className="wb-page" key={loc.pathname}>
            {guard.ok ? <Outlet /> : <NoAccess result={guard} roles={me.roles} />}
          </div>
        </div>
      </main>

      {/* ================= 移动端 Tab 栏 ================= */}
      <nav className="wb-tabbar only-mobile">
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
      </nav>

      {/* ================= 帮助条与弹窗（沿用 v1 组件） ================= */}
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
            <div style={{ fontSize: 13, color: 'var(--wb-ink-2)', marginTop: 2 }}>
              进「案例与选题」，找一个跟你工作像的。带标记的直接有 Skill 可装，装完就能跑。
            </div>
          </div>
          <div>
            <b>2 · 照着做</b>
            <div style={{ fontSize: 13, color: 'var(--wb-ink-2)', marginTop: 2 }}>
              案例页给了输入、可直接抄的提示词、产出物、验收标准四件套，缺一不可发布。
            </div>
          </div>
          <div>
            <b>3 · 提报</b>
            <div style={{ fontSize: 13, color: 'var(--wb-ink-2)', marginTop: 2 }}>
              完成后从「作业提报」提交，评委复核通过即入库，进入资产库可被全员复用。
            </div>
          </div>
        </Space>
      </Modal>

    </div>
  );
}
