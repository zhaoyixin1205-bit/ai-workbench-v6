import { Alert, Button, Form, Input, Modal, Segmented, Tabs, Upload } from 'antd';
import {
  PlusOutlined, ClockCircleOutlined, DownloadOutlined, InboxOutlined, EditOutlined, FileAddOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/store';
import {
  useBountyBoard, BOUNTY_STATUS_META, BOUNTY_ALLOW_EXT, MODIFY_LIMIT,
} from '@/hooks/useBountyBoard';
import { TrackTag } from '@/components/ui';
import { trackVar } from '@/theme/v2/track';
import type { Bounty, BountyStatus } from '@/mock/types';
import '../../theme/v2/template.css';

/**
 * 悬赏榜 v2（P3-4）
 *
 * 功能对等（对照 v1 `pages/c/BountyList.tsx`，542 行）：
 *   三 Tab（悬赏大厅 / 我发布的 / 我认领的）+ 8 档状态筛选
 *   卡片：标题、状态、赛道、积分、来源、痛点、截止与发布/认领人、驳回理由、
 *         结构化方案展示（前后对比/场景/样本/Skill + 附件 + 版本链与补充计数）
 *   操作：认领 / 撤回认领 / 提交方案 / 修改方案（次数上限 3）/ 补充资料 / 组织者审核中 / 修改后重提
 *   三个弹窗：提交（开关关闭时退化为单文本框）/ 修改（回退重审警示）/ 补充（不动状态与积分）
 * 全部行为复用 `useBountyBoard`，与 v1 同源；v1 一行未改。
 */
const STATUS_TONE: Partial<Record<BountyStatus, string>> = {
  APPROVED: 'ok',
  REJECTED: 'er',
  PENDING_REVIEW: 'wa',
  PUBLISHED: 'run',
  CLAIMED: 'run',
  SUBMITTED: 'run',
  EXPIRED: 'id',
  MEMBER_DRAFT: 'id',
};

export default function BountyListV2() {
  const { me } = useStore();
  const nav = useNavigate();
  const b = useBountyBoard();

  const attBlock = (
    <>
      <Form.Item
        label="附件"
        extra={`白名单 ${BOUNTY_ALLOW_EXT.join(' / ')}，单文件 ≤50MB，最多 5 个；zip 由服务端解包校验 SKILL.md + manifest.yaml${b.uploading > 0 ? ` · 上传中 ${b.uploading}` : ''}`}
      >
        <Upload.Dragger
          multiple maxCount={5} beforeUpload={b.beforeUpload}
          fileList={b.solFiles} onChange={({ fileList }) => b.setSolFiles(fileList)}
          customRequest={({ onSuccess }) => setTimeout(() => onSuccess?.('ok'), 300)}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽上传附件</p>
          <p className="ant-upload-hint">支持 zip / md / yaml / pdf / docx / xlsx / png / jpg</p>
        </Upload.Dragger>
        {b.solAtts.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {b.solAtts.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--wb-fs-label)' }}>
                <span>{a.name}</span>
                <span className="wb2-note">{a.size}</span>
                {a.url
                  ? <a href={a.url} target="_blank" rel="noreferrer"><Button size="small" type="link" icon={<DownloadOutlined />}>下载</Button></a>
                  : <span className="wb2-note">演示态·未落真实文件</span>}
                <Button size="small" type="link" danger onClick={() => b.removeAtt(a.id, a.name)}>移除</Button>
              </div>
            ))}
          </div>
        )}
      </Form.Item>
    </>
  );

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">悬赏榜</div>
          <div className="wb2-ph-d">真实业务痛点 → 可认领任务；成员也可发起，审核通过后展示</div>
        </div>
        <div className="wb2-ph-a">
          <Link to="/bounty/create">
            <Button type="primary" size="large" icon={<PlusOutlined />}>发起悬赏</Button>
          </Link>
        </div>
      </div>

      <div className="wb2-tools" style={{ marginBottom: 'var(--wb-space-5)' }}>
        <Tabs
          activeKey={b.tab}
          onChange={b.setTab}
          items={[
            { key: 'all', label: '悬赏大厅' },
            { key: 'mine', label: '我发布的' },
            { key: 'claimed', label: '我认领的' },
          ]}
        />
        <div className="spacer" />
        <Segmented
          value={b.filter}
          onChange={(v) => b.setFilter(String(v))}
          options={['全部', '可认领', '已认领', '方案已提交', '已通过', '待审核', '已驳回', '已超期释放']}
        />
      </div>

      {b.list.length === 0 ? (
        <div className="wb2-empty">
          <div className="ic"><InboxOutlined /></div>
          <div className="t">暂无悬赏</div>
          <div className="d">成为第一个把痛点挂出来的人</div>
          <Link to="/bounty/create"><Button type="primary">发起第一个悬赏</Button></Link>
        </div>
      ) : (
        <div className="wb2-cgrid">
          {b.list.map((x: Bounty) => (
            <div className="wb2-ccard" key={x.id} style={{ borderLeft: `3px solid ${trackVar(x.track)}` }}>
              <div className="ct">{x.title}</div>
              <div style={{ display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap', marginTop: 'var(--wb-space-2)' }}>
                <span className={`wb2-tag ${STATUS_TONE[x.status] ?? 'id'}`}>
                  <i className="d" />{BOUNTY_STATUS_META[x.status].text}
                </span>
                <TrackTag track={x.track} />
                <span className="wb2-tag run"><i className="d" />{x.points} 积分</span>
                <span className="wb2-tag id"><i className="d" />{x.source}</span>
              </div>
              <div className="cd">{x.pain_point}</div>
              <div className="cf">
                <span className="grow">
                  <ClockCircleOutlined /> 截止 {x.due_date} · 发布人 {x.owner_name}
                  {x.claimant_name ? ` · 认领人 ${x.claimant_name}` : ''}
                </span>
              </div>

              {x.reject_reason && (
                <div className="wb2-quote warn" style={{ marginTop: 'var(--wb-space-3)' }}>
                  <b>驳回理由：</b>{x.reject_reason}
                </div>
              )}

              {/* V6.0 CR-20：结构化方案展示（旧单文本框数据仍可读，不丢） */}
              {(x.solution || x.solution_fields) && (
                <div className="wb2-quote ok" style={{ marginTop: 'var(--wb-space-3)' }}>
                  {x.solution_fields ? (
                    <>
                      {x.solution_fields.before_after && <div className="wb2-kv"><b>前后对比：</b>{x.solution_fields.before_after}</div>}
                      {x.solution_fields.scene_desc && <div className="wb2-kv"><b>场景说明：</b>{x.solution_fields.scene_desc}</div>}
                      {x.solution_fields.output_sample && <div className="wb2-kv"><b>产出样本：</b>{x.solution_fields.output_sample}</div>}
                      {x.solution_fields.skill_used && <div className="wb2-kv"><b>所用 Skill：</b>{x.solution_fields.skill_used}</div>}
                    </>
                  ) : (
                    <div className="wb2-kv"><b>方案：</b>{x.solution}</div>
                  )}
                  {!!x.solution_attachments?.length && (
                    <div className="wb2-note">📎 {x.solution_attachments.map((f) => f.name).join('、')}</div>
                  )}
                  {/* V6.0 CR-21：版本链与补充记录可见，证明「修改不覆写」 */}
                  {((x.solution_versions?.length ?? 0) > 1 || (x.supplements?.length ?? 0) > 0) && (
                    <div className="wb2-note">
                      共 {x.solution_versions?.length ?? 0} 个版本 · {x.supplements?.length ?? 0} 条补充（原版本保留可追溯）
                    </div>
                  )}
                </div>
              )}

              <div style={{
                display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap',
                marginTop: 'var(--wb-space-4)',
              }}>
                {x.status === 'PUBLISHED' && x.owner_union_id !== me.union_id && (
                  <Button size="small" type="primary" onClick={() => b.claim(x)}>认领</Button>
                )}
                {x.status === 'CLAIMED' && x.claimant_union_id === me.union_id && (
                  <>
                    <Button size="small" type="primary" onClick={() => b.openSolutionModal(x, 'SUBMIT')}>提交方案</Button>
                    <Button size="small" danger onClick={() => b.withdraw(x)}>撤回认领</Button>
                  </>
                )}
                {/* V6.0 CR-21：已提交及以后开放「修改 / 补充」双通道 */}
                {b.solutionV2 && ['SUBMITTED', 'APPROVED'].includes(x.status) && x.claimant_union_id === me.union_id && (
                  <>
                    {x.status !== 'APPROVED' ? (
                      <Button
                        size="small" icon={<EditOutlined />}
                        disabled={(x.solution_modify_count ?? 0) >= MODIFY_LIMIT}
                        onClick={() => b.openSolutionModal(x, 'MODIFY')}
                      >
                        修改方案（剩 {MODIFY_LIMIT - (x.solution_modify_count ?? 0)} 次）
                      </Button>
                    ) : (
                      <span className="wb2-note">已通过，仅可补充</span>
                    )}
                    <Button size="small" icon={<FileAddOutlined />} onClick={() => b.openSolutionModal(x, 'SUPPLEMENT')}>补充资料</Button>
                  </>
                )}
                {x.status === 'PENDING_REVIEW' && (
                  <span className="wb2-tag wa"><i className="d" />组织者审核中（对外不可见）</span>
                )}
                {x.status === 'REJECTED' && x.owner_union_id === me.union_id && (
                  <Button size="small" onClick={() => nav('/bounty/create')}>修改后重提</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* V6.0 CR-20：结构化方案提交（开关关闭时为 V5.0 单文本框） */}
      <Modal
        open={!!b.submitting}
        title={`提交方案 · ${b.submitting?.title}`}
        onCancel={() => b.setSubmitting(null)}
        onOk={b.doSubmit}
        okText="提交方案"
        destroyOnClose
        width={640}
      >
        <div className="wb2-note" style={{ marginBottom: 12 }}>期望产出：{b.submitting?.expected_output}</div>
        {!b.solutionV2 ? (
          <Input.TextArea
            rows={5} value={b.solution} onChange={(e) => b.setSolution(e.target.value)}
            placeholder="说明你的解决方案、验证方式与产出物（≥20 字）"
          />
        ) : (
          <Form form={b.solForm} layout="vertical" preserve={false}>
            <Form.Item name="scene_desc" label="业务场景说明" rules={[{ required: true, message: '请说明业务场景' }]}
              extra="说清：谁遇到、多久一次、现在怎么解决、代价是什么">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="before_after" label="前后对比" rules={[{ required: true, message: '请填写前后对比' }]}
              extra="使用前耗时/质量 → 使用后耗时/质量，用数字说话">
              <Input.TextArea rows={2} placeholder="使用前 2 小时/次 → 使用后 25 分钟/次" />
            </Form.Item>
            <Form.Item name="output_sample" label="产出样本" rules={[{ required: true, message: '请粘贴产出样本' }]}>
              <Input.TextArea rows={3} placeholder="粘贴一段真实产出（注意脱敏）" />
            </Form.Item>
            <Form.Item name="skill_used" label="所用 Skill" rules={[{ required: true, message: '请填写所用 Skill' }]}>
              <Input placeholder="内置 Skill 名称，或自建 Skill 包名称" />
            </Form.Item>
            {attBlock}
          </Form>
        )}
      </Modal>

      {/* V6.0 CR-21：方案修改 —— 回退至 SUBMITTED 重走审核 */}
      <Modal
        open={!!b.modifyTarget}
        title={`修改方案 · ${b.modifyTarget?.title}`}
        onCancel={() => b.setModifyTarget(null)}
        onOk={b.doModify}
        okText="提交修改并重走审核"
        okButtonProps={{ danger: true }}
        destroyOnClose
        width={640}
      >
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message="修改会回退状态并重新审核"
          description={`提交后状态回到「方案已提交」重走审核，原审核记录标记作废但保留为历史版本。剩余修改次数 ${MODIFY_LIMIT - (b.modifyTarget?.solution_modify_count ?? 0)} 次。`}
        />
        <Form form={b.solForm} layout="vertical" preserve={false}>
          <Form.Item name="scene_desc" label="业务场景说明" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="before_after" label="前后对比" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="output_sample" label="产出样本" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="skill_used" label="所用 Skill" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="note" label="修改说明" rules={[{ required: true, message: '请填写修改说明' }, { min: 10, message: '至少 10 字，便于组织者比对' }]}>
            <Input.TextArea rows={2} placeholder="说明改了什么、为什么改（≥10 字）" />
          </Form.Item>
          {attBlock}
        </Form>
      </Modal>

      {/* V6.0 CR-21：方案补充 —— 仅追加，不改状态与积分 */}
      <Modal
        open={!!b.supplementTarget}
        title={`补充资料 · ${b.supplementTarget?.title}`}
        onCancel={() => b.setSupplementTarget(null)}
        onOk={b.doSupplement}
        okText="提交补充"
        destroyOnClose
        width={640}
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="补充不改变状态与积分"
          description="仅追加新资料，原流程继续推进，审核结论与已入账积分不受影响。"
        />
        <Form form={b.solForm} layout="vertical" preserve={false}>
          <Form.Item name="content" label="补充说明" rules={[{ required: true, message: '请填写补充说明' }]}>
            <Input.TextArea rows={4} placeholder="补充：更完整的实测数据、第二版产物、客户反馈等" />
          </Form.Item>
          {attBlock}
        </Form>
      </Modal>
    </div>
  );
}
