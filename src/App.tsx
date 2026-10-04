import { useEffect } from 'react';
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import { StoreProvider } from '@/store/store';
import UIVersionProvider, { useUIVersion } from '@/ui/UIVersionProvider';
import ErrorBoundary from '@/components/ErrorBoundary';
import BootSkeleton from '@/components/BootSkeleton';
import NotFound from '@/pages/NotFound';
import CLayout from '@/layouts/CLayout';
import BLayout from '@/layouts/BLayout';
import CLayoutV2 from '@/layouts/v2/CLayoutV2';
import BLayoutV2 from '@/layouts/v2/BLayoutV2';
import V2Page from '@/ui/V2Page';

/* P3-3 样板页 v2（逐页接入，未接入的页面自动保持 v1） */
import CaseListV2 from '@/pages/v2/CaseListV2';
import CaseDetailV2 from '@/pages/v2/CaseDetailV2';
import WorkSubmitV2 from '@/pages/v2/WorkSubmitV2';
import DashboardV2 from '@/pages/v2/DashboardV2';

import Home from '@/pages/c/Home';
import CaseList from '@/pages/c/CaseList';
import CaseDetail from '@/pages/c/CaseDetail';
import BountyList from '@/pages/c/BountyList';
import BountyCreate from '@/pages/c/BountyCreate';
import WorkList from '@/pages/c/WorkList';
import WorkSubmit from '@/pages/c/WorkSubmit';
import WorkDetail from '@/pages/c/WorkDetail';
import Clinic from '@/pages/c/Clinic';
import ExpertDetail from '@/pages/c/ExpertDetail';
import MyBooking from '@/pages/c/MyBooking';
import Community from '@/pages/c/Community';
import PostDetail from '@/pages/c/PostDetail';
import AssetLibrary from '@/pages/c/AssetLibrary';
import Shop from '@/pages/c/Shop';
import Profile from '@/pages/c/Profile';
/* V6.0 CR-30：负责人团队视图 */
import TeamView from '@/pages/c/TeamView';
/* V7.0 CR-32：C 端评委评分（复用后台评委复核业务组件） */
import JudgeScore from '@/pages/c/JudgeScore';

import ExpertWorkbench from '@/pages/e/ExpertWorkbench';

import Dashboard from '@/pages/b/Dashboard';
import AssignmentAdmin from '@/pages/b/AssignmentAdmin';
import ScoreCardAdmin from '@/pages/b/ScoreCardAdmin';
import JudgeReview from '@/pages/b/JudgeReview';
import BountyReview from '@/pages/b/BountyReview';
import ExpertAdmin from '@/pages/b/ExpertAdmin';
import AssetAdmin from '@/pages/b/AssetAdmin';
import ContentAdmin from '@/pages/b/ContentAdmin';
import CommunityAdmin from '@/pages/b/CommunityAdmin';
import ShopAdmin from '@/pages/b/ShopAdmin';
import UserAdmin from '@/pages/b/UserAdmin';
import CampaignConfig from '@/pages/b/CampaignConfig';
import SystemAdmin from '@/pages/b/SystemAdmin';
import WBAdminData from '@/pages/b/WBAdminData';
import { probeFileBackend } from '@/service/fileService';

/**
 * V6.0 CR-31：应用启动时静默探测文件服务一次。
 * 有后端 → 真实上传下载；无后端（静态托管）→ 自动降级到 A-39 演示态。
 * 提前探测是为了让首次上传不必等待探测超时。
 */
function useFileBackendProbe() {
  useEffect(() => { void probeFileBackend(); }, []);
}

/**
 * P3-2：壳层按版本二选一。
 * v1 壳（CLayout / BLayout）原地不动，v2 壳在 layouts/v2/ 下，两者并存可随时切回。
 */
function CShell() {
  const { version } = useUIVersion();
  return version === 'v2' ? <CLayoutV2 /> : <CLayout />;
}

function BShell() {
  const { version } = useUIVersion();
  return version === 'v2' ? <BLayoutV2 /> : <BLayout />;
}

/**
 * P3-1 结构变更（4 处，均不触碰业务逻辑）：
 *   1. ConfigProvider / AntApp 从本文件移入 UIVersionProvider —— 主题随版本切换
 *   2. 全站包 ErrorBoundary —— 现状 0 个，任一组件抛错即整页白屏
 *   3. 挂 BootSkeleton —— 现状 0 个加载态，首屏拉库期间完全无反馈
 *   4. `path="*"` 由静默跳首页改为真 404 页 —— 旧行为会掩盖死链
 */
function AppShell() {
  useFileBackendProbe();
  return (
    <HashRouter>
      <Routes>
        <Route element={<CShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/cases" element={<V2Page v1={<CaseList />} v2={<CaseListV2 />} />} />
          <Route path="/cases/:id" element={<V2Page v1={<CaseDetail />} v2={<CaseDetailV2 />} />} />
          {/* V7.0 CR-32：C 端评委评分（菜单位置在「首页」与「案例与选题」之间，仅评委可见） */}
          <Route path="/judge" element={<JudgeScore />} />
          <Route path="/bounty" element={<BountyList />} />
          <Route path="/bounty/create" element={<BountyCreate />} />
          <Route path="/work" element={<WorkList />} />
          <Route path="/work/:id" element={<WorkDetail />} />
          <Route path="/work/submit/:typeId" element={<V2Page v1={<WorkSubmit />} v2={<WorkSubmitV2 />} />} />
          <Route path="/clinic" element={<Clinic />} />
          <Route path="/clinic/expert/:id" element={<ExpertDetail />} />
          <Route path="/clinic/mine" element={<MyBooking />} />
          {/* V6.0 CR-16：专家工作台下沉至 C 端，与 /admin/expert-workbench 共用同一组件实例 */}
          <Route path="/clinic/workbench" element={<ExpertWorkbench />} />
          {/* V6.0 CR-30：负责人团队视图 */}
          <Route path="/team" element={<TeamView />} />
          <Route path="/community" element={<Community />} />
          <Route path="/community/:id" element={<PostDetail />} />
          <Route path="/assets" element={<AssetLibrary />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/me" element={<Profile />} />
        </Route>

        <Route path="/admin" element={<BShell />}>
          <Route index element={<V2Page v1={<Dashboard />} v2={<DashboardV2 />} />} />
          <Route path="assignment" element={<AssignmentAdmin />} />
          <Route path="scorecard" element={<ScoreCardAdmin />} />
          <Route path="judge" element={<JudgeReview />} />
          <Route path="bounty" element={<BountyReview />} />
          <Route path="expert" element={<ExpertAdmin />} />
          <Route path="asset" element={<AssetAdmin />} />
          <Route path="content" element={<ContentAdmin />} />
          <Route path="community" element={<CommunityAdmin />} />
          <Route path="shop" element={<ShopAdmin />} />
          <Route path="users" element={<UserAdmin />} />
          <Route path="campaign" element={<CampaignConfig />} />
          <Route path="system" element={<SystemAdmin />} />
          <Route path="wb" element={<WBAdminData />} />
          {/* V6.0 CR-16：入口已下沉至 /clinic/workbench，旧路由保留重定向（@deprecated） */}
          <Route path="expert-workbench" element={<Navigate to="/clinic/workbench" replace />} />
        </Route>

        {/* 旧入口保留：不可删除，否则历史链接会 404 */}
        <Route path="/expert" element={<Navigate to="/clinic/workbench" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <UIVersionProvider>
        <BootSkeleton />
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      </UIVersionProvider>
    </StoreProvider>
  );
}
