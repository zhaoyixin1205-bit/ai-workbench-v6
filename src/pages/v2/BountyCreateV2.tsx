import { Alert, App as AntApp, Button, Checkbox, DatePicker, Form, Input, InputNumber, Radio, Steps } from 'antd';
import { ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { SoftTag } from '@/components/ui';
import { TRACKS } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import dayjs from 'dayjs';
import '../../theme/v2/template.css';

/**
 * 发起悬赏 v2（P3-4）
 *
 * 功能对等（对照 v1 `pages/c/BountyCreate.tsx`）：
 *   三步流程条 + 审核时效说明；标题（≤30 字，含相似度查重提示）、痛点（≤1000 字）、期望产出
 *   建议积分（10~500）、希望完成时间、关联赛道、脱敏声明（未勾选不可提交）
 *   提交后进入 PENDING_REVIEW 并跳回列表
 * 行为与 v1 完全一致，仅换壳；v1 一行未改。
 */
export default function BountyCreateV2() {
  const { db, me, setDb, log } = useStore();
  const nav = useNavigate();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [similar, setSimilar] = useState<string[]>([]);

  const checkDuplicate = (title: string) => {
    if (!title || title.length < 4) { setSimilar([]); return; }
    const hits = db.bounties
      .filter((x) => x.title.includes(title.slice(0, 4)) || title.includes(x.title.slice(0, 4)))
      .map((x) => x.title)
      .slice(0, 3);
    setSimilar(hits);
  };

  const submit = (vals: Record<string, unknown>) => {
    const id = `B-${String(db.bounties.length + 1).padStart(3, '0')}`;
    setDb((p) => ({
      ...p,
      bounties: [
        {
          id,
          title: vals.title as string,
          pain_point: vals.pain_point as string,
          expected_output: vals.expected_output as string,
          points: vals.points as number,
          track: vals.track as typeof TRACKS[number],
          owner_union_id: me.union_id,
          owner_name: me.name,
          source: '成员发布',
          status: 'PENDING_REVIEW',
          due_date: vals.due_date ? dayjs(vals.due_date as never).format('YYYY-MM-DD') : '2026-10-15',
          desensitized: true,
          created_at: DEMO_TODAY + ' 12:00',
        },
        ...p.bounties,
      ],
    }));
    log('发起悬赏', vals.title as string, '进入 PENDING_REVIEW，等待组织者审核');
    message.success('已提交，组织者将在 2 个工作日内审核（审核通过前对外不可见）');
    nav('/bounty');
  };

  return (
    <div>
      <Link to="/bounty" className="wb2-note" style={{ display: 'inline-block', marginBottom: 'var(--wb-space-3)' }}>
        <ArrowLeftOutlined /> 返回悬赏榜
      </Link>

      <div className="wb2-ph">
        <div>
          <div className="wb2-ph-t">发起悬赏</div>
          <div className="wb2-ph-d">把你遇到的真实业务痛点挂出来，借助他人的能力解决自己的问题</div>
        </div>
      </div>

      <div className="wb2-card" style={{ marginBottom: 'var(--wb-space-5)' }}>
        <div className="wb2-card-pad">
          <Steps
            size="small"
            current={0}
            items={[{ title: '提交草稿' }, { title: '组织者审核' }, { title: '通过并对外展示' }]}
          />
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            message="成员发布的悬赏必须经组织者审核通过后才会对外展示；审核时效 2 个工作日，超时自动提醒组织者。"
          />
        </div>
      </div>

      <div className="wb2-card">
        <div className="wb2-card-pad">
          <Form form={form} layout="vertical" onFinish={submit} requiredMark
            initialValues={{ track: TRACKS[0], points: 200 }}
          >
            <Form.Item name="title" label="悬赏标题" rules={[{ required: true, message: '请填写标题' }, { max: 30, message: '不超过 30 字' }]}>
              <Input placeholder="一句话说清要解什么问题，≤30 字" onChange={(e) => checkDuplicate(e.target.value)} />
            </Form.Item>

            {similar.length > 0 && (
              <Alert
                type="warning" showIcon style={{ marginBottom: 16 }}
                message="发现相似悬赏（相似度 > 70%）"
                description={
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {similar.map((s) => <SoftTag key={s} text={s} tone="primary" />)}
                    </div>
                    <div className="wb2-note" style={{ marginTop: 4 }}>
                      确认仍要发布请在下方继续填写；重复度过高的悬赏可能被组织者驳回。
                    </div>
                  </div>
                }
              />
            )}

            <Form.Item name="pain_point" label="业务痛点描述" rules={[{ required: true, message: '请填写痛点描述' }, { max: 1000, message: '不超过 1000 字' }]}>
              <Input.TextArea rows={4} placeholder="说明真实业务背景与影响面（谁遇到、多久一次、现在怎么解决、代价是什么）" />
            </Form.Item>

            <Form.Item name="expected_output" label="期望产出" rules={[{ required: true, message: '请说明希望拿到什么' }]}>
              <Input.TextArea rows={2} placeholder="说明希望拿到什么样的解决方案（形式 + 可用标准）" />
            </Form.Item>

            <div style={{ display: 'flex', gap: 'var(--wb-space-6)', flexWrap: 'wrap' }}>
              <Form.Item name="points" label="建议积分" rules={[{ required: true }]}>
                <InputNumber min={10} max={500} step={10} />
              </Form.Item>
              <Form.Item name="due_date" label="希望完成时间">
                <DatePicker />
              </Form.Item>
              <Form.Item name="track" label="关联赛道" rules={[{ required: true }]}>
                <Radio.Group options={TRACKS.map((t) => ({ label: t, value: t }))} optionType="button" />
              </Form.Item>
            </div>

            <Form.Item
              name="desensitized"
              valuePropName="checked"
              rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('未勾选脱敏声明不可提交'))) }]}
            >
              <Checkbox>
                我已确认：描述中不含客户真实名称、金额与联系方式；涉客户信息已脱敏
              </Checkbox>
            </Form.Item>
          </Form>
        </div>
      </div>

      <div className="wb2-actbar">
        <Button type="primary" size="large" onClick={() => form.submit()}>提交审核</Button>
        <Button size="large" onClick={() => nav('/bounty')}>取消</Button>
      </div>
    </div>
  );
}
