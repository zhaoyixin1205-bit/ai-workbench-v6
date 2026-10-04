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
import HomeV2 from '@/pages/v2/HomeV2';
import ExpertDetailV2 from '@/pages/v2/ExpertDetailV2';
import TeamViewV2 from '@/pages/v2/TeamViewV2';
import CommunityV2 from '@/pages/v2/CommunityV2';
import PostDetailV2 from '@/pages/v2/PostDetailV2';
import AssetLibraryV2 from '@/pages/v2/AssetLibraryV2';
import ShopV2 from '@/pages/v2/ShopV2';
import ProfileV2 from '@/pages/v2/ProfileV2';
import JudgeScoreV2 from '@/pages/v2/JudgeScoreV2';
import BountyListV2 from '@/pages/v2/BountyListV2';
import BountyCreateV2 from '@/pages/v2/BountyCreateV2';
import WorkListV2 from '@/pages/v2/WorkListV2';
import WorkDetailV2 from '@/pages/v2/WorkDetailV2';
import ClinicV2 from '@/pages/v2/ClinicV2';
import MyBookingV2 from '@/pages/v2/MyBookingV2';
/* P3-5 后台域 */
import AssignmentAdminV2 from '@/pages/v2/AssignmentAdminV2';
import ScoreCardAdminV2 from '@/pages/v2/ScoreCardAdminV2';
import JudgeReviewV2 from '@/pages/v2/JudgeReviewV2';
import BountyReviewV2 from '@/pages/v2/BountyReviewV2';
import ExpertAdminV2 from '@/pages/v2/ExpertAdminV2';
import AssetAdminV2 from '@/pages/v2/AssetAdminV2';
import ContentAdminV2 from '@/pages/v2/ContentAdminV2';
import CommunityAdminV2 from '@/pages/v2/CommunityAdminV2';
import ShopAdminV2 from '@/pages/v2/ShopAdminV2';
import UserAdminV2 from '@/pages/v2/UserAdminV2';
import CampaignConfigV2 from '@/pages/v2/CampaignConfigV2';
import SystemAdminV2 from '@/pages/v2/SystemAdminV2';
import WBAdminDataV2 from '@/pages/v2/WBAdminDataV2';

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
/* P3-6 清理期补齐：expert 域唯一未接入的页面 */
import ExpertWorkbenchV2 from '@/pages/v2/ExpertWorkbenchV2';

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
          <Route path="/" element={<V2Page v1={<Home />} v2={<HomeV2 />} />} />
          <Route path="/cases" element={<V2Page v1={<CaseList />} v2={<CaseListV2 />} />} />
          <Route path="/cases/:id" element={<V2Page v1={<CaseDetail />} v2={<CaseDetailV2 />} />} />
          {/* V7.0 CR-32：C 端评委评分（菜单位置在「首页」与「案例与选题」之间，仅评委可见） */}
          <Route path="/judge" element={<V2Page v1={<JudgeScore />} v2={<JudgeScoreV2 />} />} />
          <Route path="/bounty" element={<V2Page v1={<BountyList />} v2={<BountyListV2 />} />} />
          <Route path="/bounty/create" element={<V2Page v1={<BountyCreate />} v2={<BountyCreateV2 />} />} />
          <Route path="/work" element={<V2Page v1={<WorkList />} v2={<WorkListV2 />} />} />
          <Route path="/work/:id" element={<V2Page v1={<WorkDetail />} v2={<WorkDetailV2 />} />} />
          <Route path="/work/submit/:typeId" element={<V2Page v1={<WorkSubmit />} v2={<WorkSubmitV2 />} />} />
          <Route path="/clinic" element={<V2Page v1={<Clinic />} v2={<ClinicV2 />} />} />
          <Route path="/clinic/expert/:id" element={<V2Page v1={<ExpertDetail />} v2={<ExpertDetailV2 />} />} />
          <Route path="/clinic/mine" element={<V2Page v1={<MyBooking />} v2={<MyBookingV2 />} />} />
          {/* V6.0 CR-16：专家工作台下沉至 C 端，与 /admin/expert-workbench 共用同一组件实例 */}
          <Route path="/clinic/workbench" element={<V2Page v1={<ExpertWorkbench />} v2={<ExpertWorkbenchV2 />} />} />
          {/* V6.0 CR-30：负责人团队视图 */}
          <Route path="/team" element={<V2Page v1={<TeamView />} v2={<TeamViewV2 />} />} />
          <Route path="/community" element={<V2Page v1={<Community />} v2={<CommunityV2 />} />} />
          <Route path="/community/:id" element={<V2Page v1={<PostDetail />} v2={<PostDetailV2 />} />} />
          <Route path="/assets" element={<V2Page v1={<AssetLibrary />} v2={<AssetLibraryV2 />} />} />
          <Route path="/shop" element={<V2Page v1={<Shop />} v2={<ShopV2 />} />} />
          <Route path="/me" element={<V2Page v1={<Profile />} v2={<ProfileV2 />} />} />
        </Route>

        <Route path="/admin" element={<BShell />}>
          <Route index element={<V2Page v1={<Dashboard />} v2={<DashboardV2 />} />} />
          <Route path="assignment" element={<V2Page v1={<AssignmentAdmin />} v2={<AssignmentAdminV2 />} />} />
          <Route path="scorecard" element={<V2Page v1={<ScoreCardAdmin />} v2={<ScoreCardAdminV2 />} />} />
          <Route path="judge" element={<V2Page v1={<JudgeReview />} v2={<JudgeReviewV2 />} />} />
          <Route path="bounty" element={<V2Page v1={<BountyReview />} v2={<BountyReviewV2 />} />} />
          <Route path="expert" element={<V2Page v1={<ExpertAdmin />} v2={<ExpertAdminV2 />} />} />
          <Route path="asset" element={<V2Page v1={<AssetAdmin />} v2={<AssetAdminV2 />} />} />
          <Route path="content" element={<V2Page v1={<ContentAdmin />} v2={<ContentAdminV2 />} />} />
          <Route path="community" element={<V2Page v1={<CommunityAdmin />} v2={<CommunityAdminV2 />} />} />
          <Route path="shop" element={<V2Page v1={<ShopAdmin />} v2={<ShopAdminV2 />} />} />
          <Route path="users" element={<V2Page v1={<UserAdmin />} v2={<UserAdminV2 />} />} />
          <Route path="campaign" element={<V2Page v1={<CampaignConfig />} v2={<CampaignConfigV2 />} />} />
          <Route path="system" element={<V2Page v1={<SystemAdmin />} v2={<SystemAdminV2 />} />} />
          <Route path="wb" element={<V2Page v1={<WBAdminData />} v2={<WBAdminDataV2 />} />} />
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
