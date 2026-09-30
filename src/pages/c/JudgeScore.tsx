import { Alert } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import JudgeReview from '@/pages/b/JudgeReview';
import { PageHeader } from '@/components/ui';
import { useStore } from '@/store/store';

/**
 * V7.0 CR-32：C 端「评委评分」（/judge）
 *
 * 需求原话：切换至评委角色时，在员工页面新增「评委评分」页面，
 * 实际链接为后台的「评委复核」页面，入口放在「首页」与「案例与选题」之间。
 *
 * 实现取舍（拍板 1-A）：新增 C 端路由 + 复用后台业务组件，而不是把 C 端菜单直接链到 /admin/judge
 * —— 后者会让评委点员工端菜单时被丢进后台壳子（视觉与导航体系断裂）。
 * 因此本页只提供 C 端外壳与口径说明，业务能力全部来自 JudgeReview（variant='c'）。
 *
 * 可见性：仅 JUDGE 角色，受 cJudgeEntry 开关控制（守卫表 /judge，见 src/auth/access.ts）。
 */
export default function JudgeScore() {
  const { me } = useStore();

  return (
    <div>
      <PageHeader
        title="评委评分"
        desc="AI 预评分 + 评委复核，最终分按权重合成；默认展示「待我评分」，历史评分可查看并修改"
      />
      <Alert
        type="info" showIcon
        icon={<SafetyCertificateOutlined />}
        style={{ marginBottom: 16 }}
        message="评委评分口径"
        description={`当前评委身份：${me.name}（姓名与身份取自钉钉，不可编辑）；系统自动过滤本人提交的作业，不能给自己打分。评分卡修改会生成新版本，历史评分仍按当时的版本计算。`}
      />
      <JudgeReview variant="c" />
    </div>
  );
}
