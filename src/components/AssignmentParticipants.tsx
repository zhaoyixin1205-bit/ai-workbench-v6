import { Alert, Button, Select, Space, Switch, Table, Tag, Typography, App as AntApp } from 'antd';
import { BellOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import type { AssignmentParticipant, AssignmentType } from '@/mock/types';
import BatchImport from '@/components/BatchImport';
import { DEMO_TODAY } from '@/mock/seedBiz';
import {
  hasSubmitted, participantsOf, requiredOf, electiveOf, unsubmittedOf,
} from '@/utils/assignmentParticipants';

/**
 * V8.2-10.07：作业「参加人员」管理（v1 / v2 共用）
 * ------------------------------------------------------------------
 * 需求原文：作业提报可以增加必须参加人员名单（首页 To Do 提醒 + 后台手动提醒未提报人员），
 * 以及是否公开给其他人员 —— 公开后其他人可主动加入，名单中区分必修 / 选修。
 *
 * 维护方式（用户拍板）：人员选择器 + Excel 批量导入。
 * 落库位置：assignmentTypes[].participants（kind=REQUIRED/ELECTIVE）+ open_join 开关。
 */
export default function AssignmentParticipants({ readOnly, variant = 'card' }: { readOnly: boolean; variant?: 'card' | 'tcard' }) {
  const { db, setDb, log, me } = useStore();
  const { message, modal } = AntApp.useApp();
  const [typeId, setTypeId] = useState<string>(db.assignmentTypes[0]?.id ?? '');
  const [picked, setPicked] = useState<string[]>([]);

  const type = db.assignmentTypes.find((t) => t.id === typeId) ?? db.assignmentTypes[0];
  const list = participantsOf(type);

  const stat = useMemo(() => {
    const req = requiredOf(type).length;
    const ele = electiveOf(type).length;
    const done = list.filter((p) => hasSubmitted(db.submits, type?.id ?? '', p.union_id)).length;
    return { req, ele, done, todo: list.length - done };
  }, [db.submits, type, list]);

  const write = (next: AssignmentParticipant[], note: string, detail?: string) => {
    if (!type) return;
    setDb((p) => ({
      ...p,
      assignmentTypes: p.assignmentTypes.map((t) => (t.id === type.id ? { ...t, participants: next } : t)),
    }));
    log(note, type.name, detail ?? '');
  };

  /** 人员选择器 → 加入为必修 / 选修 */
  const addPicked = (kind: 'REQUIRED' | 'ELECTIVE') => {
    if (!type) return;
    if (picked.length === 0) { message.warning('请先选择要加入的人员'); return; }
    const existed = new Set(list.map((p) => p.union_id));
    const add = picked
      .filter((id) => !existed.has(id))
      .map((id) => {
        const u = db.users.find((x) => x.union_id === id);
        return {
          union_id: id, name: u?.name ?? id, dept_name: u?.dept_names?.[0] ?? '',
          kind, source: 'MANUAL' as const, joined_at: DEMO_TODAY,
        };
      });
    if (add.length === 0) { message.info('所选人员已在名单中'); return; }
    write([...list, ...add], kind === 'REQUIRED' ? '新增必修人员' : '新增选修人员',
      `${add.map((a) => a.name).join('、')}（共 ${add.length} 人，操作人 ${me.name}）`);
    setPicked([]);
    message.success(`已加入 ${add.length} 人（${kind === 'REQUIRED' ? '必修' : '选修'}）`);
  };

  const setKind = (p: AssignmentParticipant, kind: 'REQUIRED' | 'ELECTIVE') => {
    if (p.kind === kind) return;
    write(list.map((x) => (x.union_id === p.union_id ? { ...x, kind } : x)),
      '调整参加类型', `${p.name}：${p.kind === 'REQUIRED' ? '必修' : '选修'} → ${kind === 'REQUIRED' ? '必修' : '选修'}`);
    message.success(`${p.name} 已调整为${kind === 'REQUIRED' ? '必修' : '选修'}`);
  };

  const remove = (p: AssignmentParticipant) => {
    modal.confirm({
      title: `将 ${p.name} 移出参加名单？`,
      content: '移出后该成员不再收到本作业的 To Do 提醒（已提交的提报不受影响）。',
      okText: '确认移出', okButtonProps: { danger: true },
      onOk: () => {
        write(list.filter((x) => x.union_id !== p.union_id), '移出参加人员', `${p.name}（${p.kind === 'REQUIRED' ? '必修' : '选修'}）`);
        message.success('已移出');
      },
    });
  };

  /** 催办：单人 / 一键提醒全部未提报（与站内其它提醒一致，走 toast + 审计留痕） */
  const remind = (targets: AssignmentParticipant[]) => {
    if (!type || targets.length === 0) { message.info('当前没有未提报人员'); return; }
    const at = `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;
    const ids = new Set(targets.map((t) => t.union_id));
    write(
      list.map((x) => (ids.has(x.union_id)
        ? { ...x, reminded_count: (x.reminded_count ?? 0) + 1, reminded_at: at }
        : x)),
      '提醒未提报人员',
      `${targets.map((t) => t.name).join('、')}（共 ${targets.length} 人；操作人 ${me.name}）`
    );
    message.success(`已向 ${targets.length} 人发送提报提醒（站内 To Do + 钉钉通知）`);
  };

  const toggleOpenJoin = (checked: boolean) => {
    if (!type) return;
    setDb((p) => ({
      ...p,
      assignmentTypes: p.assignmentTypes.map((t) => (t.id === type.id ? { ...t, open_join: checked } : t)),
    }));
    log(checked ? '开放他人加入' : '关闭他人加入', type.name,
      checked ? '名单外成员可在前端主动加入，以「选修」身份进入名单' : '仅名单内成员可参加');
    message.success(checked ? '已开放：其他成员可主动加入（选修）' : '已关闭：仅名单内成员可参加');
  };

  const userOptions = db.users.map((u) => ({
    value: u.union_id,
    label: `${u.name}${u.dept_names?.[0] ? `（${u.dept_names?.[0]}）` : ''}`,
  }));

  const toolbar = (
    <Space size={8} wrap>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>作业类型</Typography.Text>
      <Select
        value={type?.id} onChange={(v) => { setTypeId(v); setPicked([]); }}
        style={{ width: 260 }}
        options={db.assignmentTypes.map((t) => ({ value: t.id, label: `${t.name}（${t.code}）` }))}
      />
      <Switch
        checked={type?.open_join === true} disabled={readOnly} onChange={toggleOpenJoin}
        checkedChildren="公开" unCheckedChildren="不公开"
      />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>开放他人主动加入（选修）</Typography.Text>
    </Space>
  );

  const adder = (
    <Space size={8} wrap>
      <Select
        mode="multiple" showSearch allowClear style={{ minWidth: 320 }}
        placeholder="搜索并选择人员（支持姓名 / 部门）"
        value={picked} onChange={setPicked} disabled={readOnly}
        filterOption={(input, opt) => String(opt?.label ?? '').includes(input)}
        options={userOptions}
        maxTagCount={3}
      />
      <Button disabled={readOnly} icon={<UserAddOutlined />} onClick={() => addPicked('REQUIRED')}>加入为必修</Button>
      <Button disabled={readOnly} onClick={() => addPicked('ELECTIVE')}>加入为选修</Button>
      <BatchImport<{ union_id: string; name: string; dept_name: string; kind: 'REQUIRED' | 'ELECTIVE' }>
        title="参加人员批量导入"
        disabled={readOnly || !type}
        buttonText="批量导入名单"
        columns={['姓名', '部门', '类型（必修/选修）']}
        hint="口径：按姓名匹配通讯录（重名请填部门辅助）；类型填「必修」或「选修」；已在名单中的人自动跳过"
        sample={[['张三', '华东大区/上海分公司', '必修'], ['李四', '华南大区/深圳分公司', '选修']]}
        validate={(rows) => rows.map((r, i) => {
          const [name, dept, kindText] = r;
          const u = db.users.find((x) => x.name === name)
            ?? (dept ? db.users.find((x) => x.name === name && (x.dept_names?.[0] ?? '').includes(dept)) : undefined);
          if (!u) return { row: i + 2, name: name || `第 ${i + 2} 行`, result: '失败' as const, reason: `通讯录中找不到「${name || '空'}」` };
          const kind = kindText === '必修' ? 'REQUIRED' : kindText === '选修' ? 'ELECTIVE' : null;
          if (!kind) return { row: i + 2, name, result: '失败' as const, reason: `类型须填「必修」或「选修」（收到 ${kindText || '空'}）` };
          if (list.some((p) => p.union_id === u.union_id)) {
            return { row: i + 2, name, result: '跳过' as const, reason: '已在参加名单中（未覆盖）' };
          }
          return {
            row: i + 2, name: `${name}（${kind === 'REQUIRED' ? '必修' : '选修'}）`, result: '成功' as const,
            data: { union_id: u.union_id, name: u.name, dept_name: u.dept_names?.[0] ?? dept ?? '', kind },
          };
        })}
        onCommit={(items) => {
          const add = items.map((it) => ({
            ...it.data!, source: 'IMPORT' as const, joined_at: DEMO_TODAY,
          }));
          write([...list, ...add], '批量导入参加人员',
            `${add.length} 人（必修 ${add.filter((a) => a.kind === 'REQUIRED').length} / 选修 ${add.filter((a) => a.kind === 'ELECTIVE').length}）`);
          message.success(`已导入 ${add.length} 人`);
        }}
      />
      <Button
        disabled={readOnly} icon={<BellOutlined />}
        onClick={() => remind(unsubmittedOf(type as AssignmentType, db.submits))}
      >
        提醒全部未提报
      </Button>
    </Space>
  );

  const table = (
    <Table
      size="small" rowKey="union_id" dataSource={list} pagination={{ pageSize: 8 }}
      locale={{ emptyText: '尚未指定参加人员 —— 未指定时按「提报对象范围」生效，不单独点名提醒' }}
      columns={[
        { title: '姓名', dataIndex: 'name', width: 100 },
        { title: '部门', dataIndex: 'dept_name', ellipsis: true },
        {
          title: '类型', dataIndex: 'kind', width: 90,
          render: (v: AssignmentParticipant['kind']) => (
            <Tag color={v === 'REQUIRED' ? 'red' : 'blue'}>{v === 'REQUIRED' ? '必修' : '选修'}</Tag>
          ),
        },
        {
          title: '来源', dataIndex: 'source', width: 90,
          render: (v?: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {v === 'IMPORT' ? '批量导入' : v === 'SELF_JOIN' ? '主动加入' : '手工指定'}
          </Typography.Text>,
        },
        {
          title: '提报状态', width: 110,
          render: (_: unknown, r: AssignmentParticipant) => (hasSubmitted(db.submits, type?.id ?? '', r.union_id)
            ? <Tag color="green">已提报</Tag>
            : <Tag>未提报</Tag>),
        },
        {
          title: '催办', dataIndex: 'reminded_count', width: 110,
          render: (v: number | undefined, r: AssignmentParticipant) => (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {v ? `${v} 次${r.reminded_at ? ` · ${r.reminded_at.slice(5)}` : ''}` : '—'}
            </Typography.Text>
          ),
        },
        {
          title: '操作', width: 190,
          render: (_: unknown, r: AssignmentParticipant) => (
            <Space size={2}>
              <Button size="small" type="link" disabled={readOnly} onClick={() => setKind(r, r.kind === 'REQUIRED' ? 'ELECTIVE' : 'REQUIRED')}>
                {r.kind === 'REQUIRED' ? '设为选修' : '设为必修'}
              </Button>
              {!hasSubmitted(db.submits, type?.id ?? '', r.union_id) && (
                <Button size="small" type="link" disabled={readOnly} onClick={() => remind([r])}>提醒</Button>
              )}
              <Button size="small" type="link" danger disabled={readOnly} onClick={() => remove(r)}>移出</Button>
            </Space>
          ),
        },
      ]}
    />
  );

  const summary = (
    <Space size={12} wrap style={{ marginBottom: 8 }}>
      <Typography.Text style={{ fontSize: 12 }}>必修 <b className="num">{stat.req}</b> 人</Typography.Text>
      <Typography.Text style={{ fontSize: 12 }}>选修 <b className="num">{stat.ele}</b> 人</Typography.Text>
      <Typography.Text style={{ fontSize: 12 }}>已提报 <b className="num">{stat.done}</b> 人</Typography.Text>
      <Typography.Text style={{ fontSize: 12 }} type="warning">未提报 <b className="num">{stat.todo}</b> 人</Typography.Text>
    </Space>
  );

  return (
    <>
      {variant === 'tcard' ? (
        <div className="wb2-tcard">
          <div className="hd"><span className="t">参加人员（必修 / 选修）</span></div>
          <div className="bd">
            {toolbar}
            <div style={{ margin: '10px 0' }}>{adder}</div>
            {summary}
            {table}
          </div>
          <div className="ft">必修：组织者指定、首页 To Do 提醒、后台可催办；选修：作业公开后成员主动加入，不进 To Do 提醒。</div>
        </div>
      ) : (
        <>
          {toolbar}
          <div style={{ margin: '10px 0' }}>{adder}</div>
          {summary}
          {table}
          <Alert style={{ marginTop: 12 }} type="info" showIcon
            message="必修人员在首页「我的待办」中以 To Do 形式收到提报提醒；作业公开后，其他成员可主动加入并标记为选修。"
            description="未指定参加人员时，作业按「提报对象范围」生效，不单独点名提醒。" />
        </>
      )}
    </>
  );
}
