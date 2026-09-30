import { useEffect } from 'react';
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { StoreProvider } from '@/store/store';
import { theme } from '@/theme';
import CLayout from '@/layouts/CLayout';
import BLayout from '@/layouts/BLayout';

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

export default function App() {
  useFileBackendProbe();
  return (
    <ConfigProvider theme={theme} locale={zhCN}>
      <AntApp>
        <StoreProvider>
          <HashRouter>
            <Routes>
              <Route element={<CLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/cases" element={<CaseList />} />
                <Route path="/cases/:id" element={<CaseDetail />} />
                <Route path="/bounty" element={<BountyList />} />
                <Route path="/bounty/create" element={<BountyCreate />} />
                <Route path="/work" element={<WorkList />} />
                <Route path="/work/:id" element={<WorkDetail />} />
                <Route path="/work/submit/:typeId" element={<WorkSubmit />} />
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

              <Route path="/admin" element={<BLayout />}>
                <Route index element={<Dashboard />} />
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
              <Route path="/expert" element={<Navigate to="/clinic/workbench" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </StoreProvider>
      </AntApp>
    </ConfigProvider>
  );
}
