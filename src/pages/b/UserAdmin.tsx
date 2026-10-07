import { Alert, Button, Card, Checkbox, Col, Drawer, Form, Input, Modal, Row, Select, Space, Statistic, Switch, Table, Tabs, Tag, Typography, App as AntApp, message as staticMsg, Upload } from 'antd';
import { DeleteOutlined, DownloadOutlined, ImportOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { ROLE_LABEL, effectiveRoles, isDeptLeader } from '@/mock/types';
import type { Role, User } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import {
  MAX_ROWS, TEMPLATE_TEXT, downloadCsv, parseCsv, validateRows, acceptConflicts, toUsers,
} from '@/mock/userImport';
import type { ImportRow } from '@/mock/userImport';

/**
 * U-1 结案：负责人（LEADER）不再是可授予的角色。
 * 「是否部门负责人」由 is_dept_leader / managed_dept_ids 表达，在列表与导出中单列呈现。
 */
const ASSIGNABLE_ROLES = (Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== 'LEADER');

export default function UserAdmin() {
  const { db, setDb, log, flags, me, hasRole } = useStore();
  const { message, modal } = AntApp.useApp();
  const [kw, setKw] = useState('');
  const [tagModal, setTagModal] = useState<string | null>(null);
  const [tagUsers, setTagUsers] = useState('');
  /** V4.0 CR-11：手工/批量管理能力（开关关闭 = 仅钉钉映射） */
  const manual = flags.userManualManage !== false;
  const isAdmin = hasRole('ADMIN');
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();
  const [impDrawer, setImpDrawer] = useState(false);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDept, setMoveDept] = useState<string>('');
  const [moveRole, setMoveRole] = useState<Role | ''>('');
  /** A-31：调动是否同步调整管辖范围（默认不动，避免误伤借调/兼任场景） */
  const [moveSyncManaged, setMoveSyncManaged] = useState(false);

  const users = db.users.filter((u) => u.status !== 99
    && (!kw || u.name.includes(kw) || u.dept_names.join().includes(kw) || u.title?.includes(kw)));

  const grantRole = (unionId: string, role: Role) => {
    setDb((p) => ({
      ...p,
      users: p.users.map((u) => (u.union_id === unionId
        ? { ...u, roles: u.roles.includes(role) ? u.roles : [...u.roles, role] } : u)),
    }));
    const u = db.users.find((x) => x.union_id === unionId)!;
    log('授予角色', u.name, `${ROLE_LABEL[role]}（数据范围 ${u.scope_type}）`);
    message.success(`已授予 ${u.name}「${ROLE_LABEL[role]}」`);
  };

  const revokeRole = (unionId: string, role: Role) => {
    modal.confirm({
      title: `撤销 ${ROLE_LABEL[role]}？`,
      content: '权限变更即时生效并留痕；ADMIN 离职或角色被撤销后，M12 凭据立即失效并删除。',
      onOk: () => {
        setDb((p) => ({ ...p, users: p.users.map((u) => (u.union_id === unionId ? { ...u, roles: u.roles.filter((r) => r !== role) } : u)) }));
        message.success('已撤销');
      },
    });
  };

  /**
   * U-1：负责人不再是角色，改为独立的派生属性开关。
   * 开启 → 管辖范围默认等于主部门；关闭 → 清空管辖，并把老数据 roles 里残留的 LEADER 摘掉
   * （只清业务值，不动类型定义，符合「字段只增不删」）。
   */
  const toggleLeader = (u: User, next: boolean) => {
    setDb((p) => ({
      ...p,
      users: p.users.map((x) => (x.union_id === u.union_id ? {
        ...x,
        is_dept_leader: next,
        roles: next ? x.roles : x.roles.filter((r) => r !== 'LEADER'),
        managed_dept_ids: next ? x.dept_id_list.slice(0, 1) : [],
      } : x)),
    }));
    log(next ? '设为部门负责人' : '取消部门负责人', u.name,
      next ? `管辖范围跟随主部门 ${u.dept_names[0] ?? '—'}` : '已清空管辖范围');
    message.success(next ? `已将 ${u.name} 设为部门负责人` : `已取消 ${u.name} 的负责人身份`);
  };

  const batchTag = () => {
    if (!tagUsers.trim()) { message.error('请粘贴 unionId 或姓名（每行一个）'); return; }
    const names = tagUsers.split(/[\n,，\s]+/).filter(Boolean);
    setDb((p) => ({
      ...p,
      users: p.users.map((u) => (names.includes(u.name) || names.includes(u.union_id) ? { ...u, tags: [...new Set([...u.tags, tagModal!])] } : u)),
    }));
    log('批量打标', db.tags.find((t) => t.id === tagModal)?.name ?? '', `按名单导入 ${names.length} 条`);
    message.success(`已为 ${names.length} 个名单条目打标（变更写审计日志）`);
    setTagModal(null); setTagUsers('');
  };

  /* ---------- V4.0 CR-11：手工新增 / 批量导入导出 / 停用启用 / 软删除 / 编制调动 ---------- */

  const addUser = async () => {
    let v: { name?: string; job_number?: string; mobile?: string; dept_id?: string; roles?: Role[]; tags?: string[]; leader?: boolean };
    try {
      v = await form.validateFields();
    } catch {
      message.error('请先填写必填项');
      return;
    }
    const dept = db.depts.find((d) => d.dept_id === v.dept_id);
    const u: User = {
      union_id: `manual-${Date.now()}`,
      name: v.name ?? '',
      mobile: v.mobile,
      job_number: v.job_number ?? '',
      dept_id_list: dept ? [dept.dept_id] : [],
      dept_names: dept ? [dept.name] : [],
      roles: v.roles?.length ? v.roles : ['MEMBER'],
      scope_type: dept ? 'DEPT_TREE' : 'SELF',
      scope_dept_ids: dept ? [dept.dept_id] : [],
      tags: v.tags ?? [],
      status: 1, points: 0,
      /** U-1：负责人走派生属性，不写进 roles */
      is_dept_leader: !!v.leader,
      managed_dept_ids: v.leader && dept ? [dept.dept_id] : undefined,
      created_at: DEMO_TODAY,
      source: 'MANUAL',
    };
    setDb((p) => ({ ...p, users: [...p.users, u] }));
    log('手工新增用户', u.name, `工号 ${u.job_number} · ${u.dept_names[0] ?? '未分配部门'} · ${effectiveRoles(u).map((r) => ROLE_LABEL[r]).join('/')}${v.leader ? ' · 部门负责人' : ''}（source=MANUAL）`);
    message.success(`已新增 ${u.name}（手工创建，钉钉全量同步不会覆盖其角色与标签）`);
    setAddOpen(false);
    form.resetFields();
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const parsed = parseCsv(text);
      if (parsed.length === 0) { message.error('文件为空或格式不正确'); return; }
      const res = validateRows(parsed, db);
      if (res.overflow) {
        message.error(`单次导入上限 ${MAX_ROWS} 行，本次解析到 ${parsed.length} 行。请拆分文件后重试（localStorage 单域约 5MB，超量会写入失败）`);
        return;
      }
      setRows(res.rows);
      message.success(`预校验完成：可导入 ${res.ok} / 待确认 ${res.conflict} / 失败 ${res.error}`);
    };
    reader.readAsText(file, 'utf-8');
    return false; // 阻止真实上传
  };

  const commitImport = (withConflicts: boolean) => {
    if (!rows) return;
    const finalRows = withConflicts ? acceptConflicts(rows) : rows;
    // 非冲突的正常行 → 新建；冲突行（已选「以手工为准」）→ 覆盖存量同工号用户，避免产生重复档案
    const appendRows = finalRows.filter((r) => r.state === 'OK' && !r.conflictUnionId);
    const coverRows = finalRows.filter((r) => r.state === 'OK' && !!r.conflictUnionId);
    const appended = toUsers(appendRows, db, DEMO_TODAY);
    if (appended.length === 0 && coverRows.length === 0) { message.warning('没有可导入的行'); return; }

    setDb((p) => {
      let users = p.users;
      if (coverRows.length) {
        const coverMap = new Map(coverRows.map((r) => [r.conflictUnionId!, toUsers([r], db, DEMO_TODAY)[0]]));
        users = users.map((prev) => {
          const next = coverMap.get(prev.union_id);
          if (!next) return prev;
          return {
            ...prev,
            mobile: next.mobile || prev.mobile,
            dept_id_list: next.dept_id_list,
            dept_names: next.dept_names,
            scope_dept_ids: next.scope_dept_ids,
              scope_type: next.scope_type,
              roles: next.roles,
              tags: next.tags,
              is_dept_leader: next.is_dept_leader,
              managed_dept_ids: next.managed_dept_ids ?? prev.managed_dept_ids,
              source: 'MANUAL' as const,
            };
        });
      }
      const rest = appended.filter((u) => !users.some((x) => x.job_number === u.job_number && x.source === 'MANUAL'));
      return { ...p, users: [...users, ...rest] };
    });

    const covered = coverRows.length;
    log('批量导入用户', `新增 ${appended.length} 人 / 覆盖 ${covered} 人`,
      `三态回执：成功 ${finalRows.filter((r) => r.state === 'OK').length} / 待确认 ${finalRows.filter((r) => r.state === 'CONFLICT').length} / 失败 ${finalRows.filter((r) => r.state === 'ERROR').length}${withConflicts ? '；冲突行按「以手工为准」覆盖' : ''}`);
    message.success(covered
      ? `已导入 ${appended.length} 人，并按手工数据覆盖 ${covered} 名存量用户（source=MANUAL）`
      : `已导入 ${appended.length} 人（source=MANUAL）`);
    setRows(null);
    setImpDrawer(false);
  };

  /** 批量导出：导出口径随当前筛选条件变化，表头带口径标注 */
  const exportUsers = () => {
    /** U-1 结案：角色列不含 LEADER；负责人语义单列到「是否部门负责人」 */
    const head = ['姓名', '工号', '手机号', '部门', '角色', '是否部门负责人', '标签', '状态', '积分', '来源'];
    const body = users.map((u) => [
      u.name, u.job_number, u.mobile ?? '', u.dept_names[0] ?? '',
      effectiveRoles(u).map((r) => ROLE_LABEL[r]).join('/'),
      isDeptLeader(u) ? '是' : '否',
      u.tags.map((t) => db.tags.find((x) => x.id === t)?.name ?? t).join('/'),
      ['预注册', '已激活', '已停用', '已离职回收', '已删除'][u.status] ?? String(u.status),
      String(u.points), u.source === 'MANUAL' ? '手工' : '钉钉映射',
    ].join(','));
    downloadCsv(
      `用户清单_${DEMO_TODAY}.csv`,
      `# 统计口径：${kw ? `关键字=${kw}` : '全部用户'}，不含已删除；共 ${users.length} 人\n${head.join(',')}\n${body.join('\n')}`,
    );
    log('导出用户清单', `共 ${users.length} 人`, `筛选条件：${kw || '全部'}；不含已删除`);
    message.success(`已导出 ${users.length} 人（表头带口径标注）`);
  };

  /** 软停用 / 启用（保留历史数据） */
  const toggleStatus = (u: User) => {
    const next = u.status === 1 ? 2 : 1;
    setDb((p) => ({ ...p, users: p.users.map((x) => (x.union_id === u.union_id ? { ...x, status: next } : x)) }));
    log(next === 2 ? '停用用户' : '启用用户', u.name, `软变更 status=${next}，历史数据保留`);
    message.success(next === 2 ? `已停用 ${u.name}（软停用，历史数据保留）` : `已启用 ${u.name}`);
  };

  /** 软删除：仅 ADMIN，status=99 + 审计留痕 */
  const softDelete = (u: User) => {
    if (!isAdmin) { message.error('仅系统管理员可执行删除（Q15：核销/回收责任人默认组织者）'); return; }
    modal.confirm({
      title: `删除用户 ${u.name}？`,
      content: '删除为软删除（status=99），历史提报、评分与积分数据全部保留；如需彻底清理请联系平台运营。',
      okButtonProps: { danger: true },
      onOk: () => {
        setDb((p) => ({ ...p, users: p.users.map((x) => (x.union_id === u.union_id ? { ...x, status: 99 } : x)) }));
        log('删除用户', u.name, `软删除 status=99，操作人 ${me.name}（仅 ADMIN）`);
        message.success(`已删除 ${u.name}（软删除并留痕）`);
      },
    });
  };

  /** 编制/调动：批量修改部门归属与角色 */
  const commitMove = () => {
    if (selected.length === 0) { message.warning('请先勾选用户'); return; }
    const dept = db.depts.find((d) => d.dept_id === moveDept);
    setDb((p) => ({
      ...p,
      users: p.users.map((u) => {
        if (!selected.includes(u.union_id)) return u;
        return {
          ...u,
          dept_id_list: dept ? [dept.dept_id] : u.dept_id_list,
          dept_names: dept ? [dept.name] : u.dept_names,
          scope_dept_ids: dept ? [dept.dept_id] : u.scope_dept_ids,
          scope_type: dept ? 'DEPT_TREE' : u.scope_type,
          roles: moveRole && !u.roles.includes(moveRole) ? [...u.roles, moveRole] : u.roles,
          /** A-31：仅在显式勾选时同步管辖范围，未勾选则原样保留（兼容借调 / 兼任） */
          managed_dept_ids: dept && moveSyncManaged ? [dept.dept_id] : u.managed_dept_ids,
        };
      }),
    }));
    log('编制调动', `${selected.length} 人`,
      `调至 ${dept?.name ?? '原部门'}${moveRole ? `，追加角色 ${ROLE_LABEL[moveRole]}` : ''}${moveSyncManaged && dept ? '，管辖范围同步调整' : '，管辖范围保留原值'}`);
    message.success(dept && moveSyncManaged
      ? `已调动 ${selected.length} 人，管辖范围同步调整至${dept.name}`
      : `已调动 ${selected.length} 人（管辖范围未变）`);
    setMoveOpen(false); setSelected([]); setMoveDept(''); setMoveRole(''); setMoveSyncManaged(false);
  };

  /** 钉钉全量同步：source=MANUAL 的手工字段（角色/标签）不被覆盖 */
  const syncDingtalk = () => {
    const manualCount = db.users.filter((u) => u.source === 'MANUAL').length;
    log('通讯录同步', '手动触发全量同步', `递归部门 + 分页翻完 + unionId 去重；跳过 ${manualCount} 名手工用户的角色/标签（手工优先）`);
    message.success(`同步完成：${db.users.length} 人 / ${db.depts.length} 部门（递归遍历，无遗漏）；${manualCount} 名手工创建的角色/标签保持不被覆盖`);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="用户与权限" desc="钉钉通讯录同步、角色与数据范围授权" />

      <Row gutter={12}>
        {[
          { t: '用户总数', v: db.users.length },
          { t: '已激活', v: db.users.filter((u) => u.status === 1).length },
          { t: '部门数', v: db.depts.length },
          { t: '干部标签人数', v: db.users.filter((u) => u.tags.includes('T1')).length },
          { t: '骨干标签人数', v: db.users.filter((u) => u.tags.includes('T3')).length },
          { t: '最近同步', v: '09-25 02:00' },
        ].map((m) => (
          <Col xs={12} sm={4} key={m.t}>
            <StatCard label={m.t} value={m.v} />
          </Col>
        ))}
      </Row>

      <Card>
        <Tabs
          items={[
            {
              key: 'users', label: `用户列表（${users.length}）`,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }} wrap>
                    <Input.Search placeholder="搜索姓名 / 部门 / 头衔" style={{ width: 240 }} value={kw} onChange={(e) => setKw(e.target.value)} allowClear />
                    <Button onClick={syncDingtalk}>手动同步钉钉通讯录</Button>
                    <Button onClick={() => { log('强制下线', '指定用户', '管理员操作'); message.success('已强制下线，Token 立即失效'); }}>强制下线指定用户</Button>
                    {manual && (
                      <>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>手动新增</Button>
                        <Button icon={<ImportOutlined />} onClick={() => setImpDrawer(true)}>批量导入</Button>
                        <Button icon={<DownloadOutlined />} onClick={exportUsers}>导出筛选结果</Button>
                        <Button disabled={selected.length === 0} onClick={() => setMoveOpen(true)}>编制/调动（{selected.length}）</Button>
                      </>
                    )}
                  </Space>
                  {manual && (
                    <Alert type="info" showIcon style={{ marginBottom: 12 }}
                      message={`V4.0 CR-11：手工/批量管理已启用（单次导入上限 ${MAX_ROWS} 行）`}
                      description="钉钉映射来源（source=DINGTALK）的用户在全量同步时不覆盖手工字段（角色、标签、备注）；手工创建的用户 source=MANUAL，始终以手工为准。删除为软删除（status=99），仅系统管理员可执行。" />
                  )}
                  <Table
                    size="small" rowKey="union_id" pagination={{ pageSize: 10 }} dataSource={users}
                    rowSelection={manual ? { selectedRowKeys: selected, onChange: (ks) => setSelected(ks as string[]) } : undefined}
                    columns={[
                      {
                        title: '姓名', dataIndex: 'name', width: 90,
                        render: (v: string, r) => <div><b>{v}</b><div style={{ fontSize: 11, color: COLOR.textSub }}>{r.job_number}</div></div>,
                      },
                      { title: '部门', render: (_, r) => r.dept_names[0] },
                      { title: '头衔', dataIndex: 'title', ellipsis: true },
                      {
                        title: '角色', dataIndex: 'roles', width: 220,
                        render: (_v: Role[], r) => (
                          <Space size={2} wrap>
                            {/* 关掉 userManualManage ≡ V3.0：恢复显示原始 roles（含「团队负责人」标签） */}
                            {(manual ? effectiveRoles(r) : r.roles).map((role) => (
                              <Tag key={role} color="orange" closable onClose={() => revokeRole(r.union_id, role)}>{ROLE_LABEL[role]}</Tag>
                            ))}
                            <Select
                              size="small" placeholder="+ 授予角色" style={{ width: 110 }}
                              options={(manual ? ASSIGNABLE_ROLES : (Object.keys(ROLE_LABEL) as Role[]))
                                .map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
                              onChange={(role) => grantRole(r.union_id, role as Role)}
                            />
                          </Space>
                        ),
                      },
                      /** U-1 新列：仅手工管理模式出现（关闭开关 ≡ V3.0，此列消失） */
                      ...(manual ? [{
                        title: '部门负责人', dataIndex: 'is_dept_leader', width: 108,
                        render: (_v: boolean, r: User) => (
                          <Switch
                            size="small" checked={isDeptLeader(r)}
                            onChange={(c) => toggleLeader(r, c)}
                          />
                        ),
                      }] : []),
                      {
                        title: '数据范围', dataIndex: 'scope_type', width: 110,
                        render: (v: string) => <Tag color={v === 'ALL' ? 'green' : v === 'DEPT_TREE' ? 'blue' : 'default'}>{v}</Tag>,
                      },
                      {
                        title: '标签', dataIndex: 'tags', width: 150,
                        render: (v: string[]) => <Space size={2} wrap>{v.map((t) => <Tag key={t}>{db.tags.find((x) => x.id === t)?.name}</Tag>)}</Space>,
                      },
                      {
                        title: '状态', dataIndex: 'status', width: 100,
                        render: (v: number) => <Tag color={v === 1 ? 'green' : v === 0 ? 'gold' : v === 2 ? 'orange' : v === 3 ? 'default' : 'red'}>
                          {['预注册', '已激活', '已停用', '已离职回收', '已删除'][v] ?? String(v)}
                        </Tag>,
                      },
                      { title: '积分', dataIndex: 'points', width: 80, render: (v: number) => <span className="num">{v}</span> },
                      ...(manual ? [{
                        title: '来源', dataIndex: 'source', width: 96,
                        render: (v?: string) => <Tag color={v === 'MANUAL' ? 'purple' : 'blue'}>{v === 'MANUAL' ? '手工' : '钉钉映射'}</Tag>,
                      }] : []),
                      ...(manual ? [{
                        title: '操作', width: 180,
                        render: (_v: unknown, r: User) => (
                          <Space size={4}>
                            <Button size="small" type="link" onClick={() => toggleStatus(r)}>{r.status === 1 ? '停用' : '启用'}</Button>
                            <Button size="small" type="link" danger icon={<DeleteOutlined />} disabled={!isAdmin} onClick={() => softDelete(r)}>删除</Button>
                          </Space>
                        ),
                      }] : []),
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'tags', label: '人员标签（Q5 考核分母切分）',
              children: (
                <>
                  <Alert type="info" showIcon style={{ marginBottom: 12 }}
                    message="平台开放全员，但考核指标分母按标签切分，默认「干部 + 核心骨干」（钉钉《用户标签》名单，共 47 人）"
                    description="打标方式：① 按部门批量打标；② 按人员名单导入；③ 单人手动调整；④ 规则自动打标（预留）。标签不互斥，统计时按所选标签取并集去重。" />
                  <Table
                    size="small" rowKey="id" pagination={false} dataSource={db.tags}
                    columns={[
                      { title: '标签名称', dataIndex: 'name' },
                      { title: '编码', dataIndex: 'code' },
                      { title: '人数', render: (_, r) => <span className="num">{db.users.filter((u) => u.tags.includes(r.id)).length}</span> },
                      {
                        title: '是否考核分母', dataIndex: 'is_assessment_scope',
                        render: (v: boolean, r) => (
                          <Switch
                            size="small" checked={v}
                            onChange={(c) => {
                              setDb((p) => ({ ...p, tags: p.tags.map((x) => (x.id === r.id ? { ...x, is_assessment_scope: c } : x)) }));
                              log('考核分母设置', r.name, c ? '设为考核分母' : '取消考核分母');
                              message.success('口径设置已更新（看板默认锁定考核标签）');
                            }}
                          />
                        ),
                      },
                      { title: '预置', dataIndex: 'is_default', render: (v: boolean) => v ? <Tag>系统预置</Tag> : null },
                      {
                        title: '状态', dataIndex: 'status',
                        render: (v: string) => <Tag color={v === '启用' ? 'green' : 'default'}>{v}</Tag>,
                      },
                      {
                        title: '操作',
                        render: (_, r) => (
                          <Space size={4}>
                            <Button size="small" type="link" onClick={() => setTagModal(r.id)}>按名单批量打标</Button>
                            <Button size="small" type="link" onClick={() => { log('按部门批量打标', r.name, '选择部门后批量打标'); message.success('已按部门批量打标'); }}>按部门打标</Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'sync', label: '通讯录同步日志',
              children: (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert type="warning" showIcon
                    message="同步必须规避的已知问题"
                    description="① listsub 只返回直接子部门，必须递归；② 同一成员多部门用 unionId 去重；③ 超 100 人部门必须翻页至 has_more=false；④ 部门 ID 需映射为中文名；⑤ 头像仅空值写入；⑥ Token 缓存 7200s。" />
                  {[
                    { t: '2026-09-25 02:00', d: '定时全量同步 · 新增 0 人 / 更新 3 人 / 部门 15 · 耗时 41s · 成功' },
                    { t: '2026-09-24 02:00', d: '定时全量同步 · 新增 2 人 / 更新 5 人 / 部门 15 · 耗时 39s · 成功' },
                    { t: '2026-09-23 09:12', d: '手动触发 · 新增 51 人 / 更新 0 人 / 部门 15 · 耗时 52s · 成功' },
                    { t: '2026-09-22 02:00', d: '定时全量同步 · 新增 0 人 / 更新 1 人 · 部门 15 · 耗时 38s · 成功' },
                  ].map((l) => (
                    <Card key={l.t} size="small">
                      <Space><Tag color="green">成功</Tag><b>{l.t}</b><span style={{ fontSize: 12, color: COLOR.textSub }}>{l.d}</span></Space>
                    </Card>
                  ))}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={!!tagModal} title="按人员名单批量打标" onCancel={() => setTagModal(null)} onOk={batchTag} okText="确认打标">
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          粘贴 unionId 或姓名，每行一个（支持从 Excel 复制）。通讯录同步不会清除标签；离职时标签保留但标记为失效，不计入任何分母。
        </Typography.Paragraph>
        <Input.TextArea rows={8} value={tagUsers} onChange={(e) => setTagUsers(e.target.value)} placeholder={'赵冰艳\n王建国\nuid003'} />
      </Modal>

      {/* CR-11：手工新增 */}
      <Modal open={addOpen} title="手动新增用户" onCancel={() => setAddOpen(false)} onOk={addUser} okText="创建">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}><Input maxLength={20} /></Form.Item>
          <Form.Item name="job_number" label="工号" rules={[{ required: true, message: '请输入工号' }]}><Input /></Form.Item>
          <Form.Item name="mobile" label="手机号" rules={[{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }]}><Input /></Form.Item>
          <Form.Item name="dept_id" label="部门" rules={[{ required: true, message: '请选择部门' }]}>
            <Select showSearch optionFilterProp="label" options={db.depts.map((d) => ({ value: d.dept_id, label: d.name }))} />
          </Form.Item>
          <Form.Item name="roles" label="角色">
            <Select mode="multiple" options={ASSIGNABLE_ROLES.map((v) => ({ value: v, label: ROLE_LABEL[v] }))} />
          </Form.Item>
          <Form.Item name="leader" label="是否部门负责人" valuePropName="checked">
            <Checkbox>该用户是部门负责人（团队板块以此为口径，不作为角色字段）</Checkbox>
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="multiple" options={db.tags.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* CR-11：编制 / 调动（支持批量） */}
      <Modal open={moveOpen} title={`编制 / 调动（已选 ${selected.length} 人）`} onCancel={() => setMoveOpen(false)} onOk={commitMove} okText="确认调动">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>调至部门（留空表示不变更部门）</div>
            <Select allowClear style={{ width: '100%' }} value={moveDept || undefined} onChange={(v) => setMoveDept(v ?? '')}
              options={db.depts.map((d) => ({ value: d.dept_id, label: d.name }))} />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>追加角色（留空表示不变更角色）</div>
            <Select allowClear style={{ width: '100%' }} value={moveRole || undefined} onChange={(v) => setMoveRole((v ?? '') as Role | '')}
              options={ASSIGNABLE_ROLES.map((v) => ({ value: v, label: ROLE_LABEL[v] }))} />
          </div>
          {/* A-31：管辖范围是否随调动同步（默认不勾，兼容借调 / 兼任场景） */}
          <div>
            <Checkbox
              checked={moveSyncManaged}
              disabled={!moveDept}
              onChange={(e) => setMoveSyncManaged(e.target.checked)}
            >
              同时把管辖范围调整到新部门
            </Checkbox>
            <div style={{ fontSize: 11, color: COLOR.textSub, marginTop: 4, marginLeft: 24 }}>
              管辖范围决定「我的团队」板块能看到谁。<b>勾选</b>＝调到哪就管到哪（适合正式调动）；
              <b>不勾选</b>＝保留原管辖部门（适合借调 / 兼任）。本期调动不可撤销，请谨慎。
            </div>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            调动后会同步更新数据范围（DEPT_TREE）；历史提报与评分不受影响。
          </Typography.Text>
        </Space>
      </Modal>

      {/* CR-11：批量导入（三态回执） */}
      <Drawer
        open={impDrawer} title="批量导入用户（CSV / XLSX）" width={720}
        onClose={() => { setImpDrawer(false); setRows(null); }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            模板列：姓名 / 工号 / 手机号 / 部门 / 角色 / 标签（角色与标签多个用 | 分隔）。单次上限 {MAX_ROWS} 行。
          </Typography.Text>
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={() => {
              downloadCsv('用户导入模板.csv', TEMPLATE_TEXT);
              message.success('模板已下载');
            }}>下载模板</Button>
            <Upload accept=".csv,.txt" beforeUpload={onFile} showUploadList={false}>
              <Button type="primary" icon={<UploadOutlined />}>选择文件并预校验</Button>
            </Upload>
          </Space>

          {rows && (
            <>
              <Space wrap>
                {[
                  { c: 'green', t: `成功 ${rows.filter((r) => r.state === 'OK').length}` },
                  { c: 'gold', t: `待确认 ${rows.filter((r) => r.state === 'CONFLICT').length}` },
                  { c: 'red', t: `失败 ${rows.filter((r) => r.state === 'ERROR').length}` },
                ].map((s) => <Tag key={s.t} color={s.c}>{s.t}</Tag>)}
              </Space>
              <Table
                size="small" rowKey="line" pagination={{ pageSize: 8 }} dataSource={rows}
                columns={[
                  { title: '行号', dataIndex: 'line', width: 60 },
                  { title: '姓名', dataIndex: 'name', width: 90 },
                  { title: '工号', dataIndex: 'job_number', width: 110 },
                  { title: '部门', dataIndex: 'dept_name', width: 160 },
                  {
                    title: '回执', dataIndex: 'state', width: 100,
                    render: (v: string) => <Tag color={v === 'OK' ? 'green' : v === 'CONFLICT' ? 'gold' : 'red'}>
                      {v === 'OK' ? '成功' : v === 'CONFLICT' ? '待确认' : '失败'}
                    </Tag>,
                  },
                  { title: '说明', dataIndex: 'issues', render: (v: string[]) => <span style={{ fontSize: 12 }}>{v.join('；')}</span> },
                ]}
              />
              <Space wrap>
                <Button type="primary" disabled={rows.filter((r) => r.state === 'OK').length === 0}
                  onClick={() => commitImport(false)}>
                  导入成功行（{rows.filter((r) => r.state === 'OK').length}）
                </Button>
                <Button disabled={rows.filter((r) => r.state === 'CONFLICT').length === 0}
                  onClick={() => commitImport(true)}>
                  冲突行以手工为准并导入（{rows.filter((r) => r.state === 'CONFLICT').length}）
                </Button>
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                三态回执口径：成功=直接写入；待确认=与存量用户重号/重手机号，需选择覆盖策略；失败=格式错必须修正后重传（不入库）。
              </Typography.Text>
            </>
          )}
        </Space>
      </Drawer>
    </Space>
  );
}
