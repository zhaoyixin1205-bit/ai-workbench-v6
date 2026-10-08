import JudgeReviewV2 from '@/pages/v2/JudgeReviewV2';
import { useStore } from '@/store/store';
import { useNoteVisible } from '@/auth/annotation';
import '../../theme/v2/template.css';

/**
 * 评委评分 v2（P3-4，V7.0 CR-32）
 *
 * 与 v1 同源：C 端外壳 + 口径说明，业务能力全部来自 JudgeReview（variant='c'）。
 * 仅把页头与口径条换成 v2 版式（提示条用 wb2-quote，避免 v1 的强色块）。
 *
 * P3-5：内层一并切到 JudgeReviewV2（此前 v2 壳里嵌的是 v1 内层，会出现半新半旧）。
 */
export default function JudgeScoreV2() {
  const { me } = useStore();
  /** V8.6-10.08：评分口径说明仅运营方与管理员可见 */
  const note = useNoteVisible();

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">评委评分</div>
          {note && (
            <div className="wb2-ph-d">
              AI 预评分 + 评委复核，最终分按权重合成；默认展示「待我评分」，历史评分可查看并修改
            </div>
          )}
        </div>
      </div>

      {note && (
        <div className="wb2-quote" style={{ marginBottom: 'var(--wb-space-5)' }}>
          <b>评委评分口径：</b>当前评委身份 {me.name}（姓名与身份取自钉钉，不可编辑）；系统自动过滤本人提交的作业，
          不能给自己打分。评分卡修改会生成新版本，历史评分仍按当时的版本计算。
        </div>
      )}

      <JudgeReviewV2 variant="c" />
    </div>
  );
}
