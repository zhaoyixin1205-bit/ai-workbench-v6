import { Alert, Button, DatePicker, Form, InputNumber, Modal, Select, Space, Table, Tag, App as AntApp } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import type { AssignmentPeriod } from '@/mock/types';
import dayjs from 'dayjs';

/**
 * 期次（作业提报周期）配置（V7.1 共享组件，作业管理 v1/v2 同用）
 * ------------------------------------------------------------------
 * 背景：periods 此前全站只有读取（WorkList / WorkSubmit / useWorkBoard），没有任何管理界面；
 * 清库后线上 periods 为空，首页「距截止」永远兜底到届次阶段/结束日。
 * 这里补上新增 / 编辑 / 删除入口，写入 db.periods ——
 * 首页「距截止」与提报页时间窗读的就是状态为 OPEN 的期次。
 */

const PERIOD_STATUS_TEXT: Record<AssignmentPeriod['status'], string> = {
  UPCOMING: '未开始', OPEN: '提报中', SCORING: '评分中', CLOSED: '已截止',
};

export default function PeriodAdmin({ readOnly, variant = 'card' }: { readOnly: boolean; variant?: 'card' | 'tcard' }) {
  const { db, setDb, log } = useStore();
  const { message, modal } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentPeriod | null>(null);
  const [form] = Form.useForm();

  const typeName = (id: string) => db.assignmentTypes.find((t) => t.id === id)?.name ?? id;

  const openNew = () => {
    setEditing(null);
    form.setFieldsValue({
      type_id: db.assignmentTypes[0]?.id,
      seq: (db.periods?.length ?? 0) + 1,
      range: [dayjs().startOf('month'), dayjs().endOf('month')],
      status: 'OPEN',
    });
    setOpen(true);
  };
  const openEdit = (p: AssignmentPeriod) => {
    setEditing(p);
    form.setFieldsValue({
      type_id: p.type_id, seq: p.seq,
      range: [dayjs(p.start_at), dayjs(p.end_at)], status: p.status,
    });
    setOpen(true);
  };
  const submit = async () => {
    let v: { type_id?: string; seq?: number; range?: [dayjs.Dayjs, dayjs.Dayjs]; status?: AssignmentPeriod['status'] };
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const [s, e] = v.range ?? [];
    if (!v.type_id || !s || !e) { message.error('请选择作业类型与起止时间'); return; }
    const rec: AssignmentPeriod = {
      id: editing?.id ?? `P${Date.now()}`,
      type_id: v.type_id,
      seq: v.seq ?? 1,
      start_at: s.format('YYYY-MM-DD'),
      end_at: e.format('YYYY-MM-DD'),
      status: v.status ?? 'OPEN',
    };
    setDb((p) => ({
      ...p,
      periods: editing
        ? p.periods.map((x) => (x.id === editing.id ? { ...x, ...rec } : x))
        : [...p.periods, rec],
    }));
    log(
      editing ? '编辑期次' : '新增期次',
      `${typeName(rec.type_id)} 第 ${rec.seq} 期`,
      `${rec.start_at} ~ ${rec.end_at}｜${PERIOD_STATUS_TEXT[rec.status]}（首页距截止与提报时间窗即读此数据）`
    );
    message.success(editing ? '期次已更新' : '期次已创建，首页「距截止」将按此周期倒计时');
    setOpen(false);
  };
  const remove = (p: AssignmentPeriod) => {
    modal.confirm({
      title: `删除「${typeName(p.type_id)} 第 ${p.seq} 期」？`,
      content: '删除后该期提报入口失去时间窗，首页倒计时回退为按届次阶段/结束日计算。',
      okText: '确认删除', okButtonProps: { danger: true },
      onOk: () => {
        setDb((prev) => ({ ...prev, periods: prev.periods.filter((x) => x.id !== p.id) }));
        log('删除期次', `${typeName(p.type_id)} 第 ${p.seq} 期`, `${p.start_at} ~ ${p.end_at}`);
        message.success('期次已删除');
      },
    });
  };

  const toolbar = (
    <Button disabled={readOnly} type="primary" icon={<PlusOutlined />} onClick={openNew}>新增期次</Button>
  );
  const table = (
    <Table
      size="small" rowKey="id" pagination={false} dataSource={db.periods ?? []}
      locale={{ emptyText: '尚未配置期次 —— 首页「距截止」将按届次阶段/结束日兜底计算' }}
      columns={[
        { title: '作业类型', render: (_: unknown, r: AssignmentPeriod) => typeName(r.type_id) },
        { title: '期数', dataIndex: 'seq', width: 80, render: (v: number) => <span className="num">第 {v} 期</span> },
        { title: '提报周期', render: (_: unknown, r: AssignmentPeriod) => `${r.start_at} ~ ${r.end_at}` },
        {
          title: '状态', dataIndex: 'status', width: 100,
          render: (v: AssignmentPeriod['status']) => <Tag color={v === 'OPEN' ? 'green' : 'default'}>{PERIOD_STATUS_TEXT[v] ?? v}</Tag>,
        },
        {
          title: '操作', width: 130,
          render: (_: unknown, r: AssignmentPeriod) => (
            <Space size={4}>
              <Button size="small" type="link" disabled={readOnly} onClick={() => openEdit(r)}>编辑</Button>
              <Button size="small" type="link" danger disabled={readOnly} onClick={() => remove(r)}>删除</Button>
            </Space>
          ),
        },
      ]}
    />
  );
  const tip = (
    <Alert style={{ marginTop: 12 }} type="info" showIcon
      message="首页「距截止」与作业提报页的时间窗，读的就是这里状态为「提报中（OPEN）」的期次。"
      description="未配置期次时自动兜底：当前阶段结束日 → 届次结束日。同一作业类型建议同一时刻只保留一个 OPEN 期次，多个时取最近截止的一条。" />
  );

  return (
    <>
      {variant === 'tcard' ? (
        <div className="wb2-tcard">
          <div className="hd">
            <span className="t">期次（提报周期）</span>
            {toolbar}
          </div>
          <div className="bd">{table}</div>
          <div className="ft">未配置期次时首页倒计时自动兜底：当前阶段结束日 → 届次结束日；同一类型建议同时只保留一个 OPEN 期次。</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>{toolbar}</div>
          {table}
          {tip}
        </>
      )}

      <Modal
        open={open}
        title={editing ? '编辑期次（提报周期）' : '新增期次（提报周期）'}
        okText={editing ? '保存' : '创建'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="type_id" label="作业类型" rules={[{ required: true, message: '请选择作业类型' }]}>
            <Select options={db.assignmentTypes.map((t) => ({ value: t.id, label: `${t.name}（${t.code}）` }))} />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="seq" label="期数" rules={[{ required: true }]}>
              <InputNumber min={1} max={99} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="status" label="状态" style={{ minWidth: 160 }}>
              <Select options={(['UPCOMING', 'OPEN', 'SCORING', 'CLOSED'] as const).map((v) => ({ value: v, label: PERIOD_STATUS_TEXT[v] }))} />
            </Form.Item>
          </Space>
          <Form.Item name="range" label="提报周期（起止日期）" rules={[{ required: true, message: '请选择提报周期' }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
        <Alert type="info" showIcon
          message="首页「距截止」与提报页时间窗按「提报中（OPEN）」期次计算；保存后即时生效。" />
      </Modal>
    </>
  );
}
