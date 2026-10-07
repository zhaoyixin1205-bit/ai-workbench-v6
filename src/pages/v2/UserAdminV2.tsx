import { Button, Checkbox, Drawer, Form, Input, Select, Switch, Table, Tabs, Upload, App as AntApp } from 'antd';
import { DeleteOutlined, DownloadOutlined, FilterOutlined, ImportOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { COLOR } from '@/theme/v2';
import { ROLE_LABEL, effectiveRoles, isDeptLeader } from '@/mock/types';
import type { Role, User } from '@/mock/types';
import { DEMO_TODAY } from '@/mock/seedBiz';
import {
  MAX_ROWS, TEMPLATE_TEXT, downloadCsv, parseCsv, validateRows, acceptConflicts, toUsers,
} from '@/mock/userImport';
import type { ImportRow } from '@/mock/userImport';
import { Dialog, DialogField, useConfirm } from '@/components/v2/Dialog';
/* V8.3-10.07：筛选与批量操作的共享判定（v1 / v2 同一口径，禁止两页各写一套） */
import {
  applyUserBatchPatch, describeBatchPatch, deptSubtreeIds, hasUserFilter, matchUserFilter, userFilterSummary,
} from '@/hooks/useUserFilter';
import type { UserBatchPatch, UserFilterState } from '@/hooks/useUserFilter';
import '../../theme/v2/template.css';

/**
 * U-1 结案：负责人（LEADER）不再是可授予的角色。
 * 「是否部门负责人」由 is_dept_leader / managed_dept_ids 表达，在列表与导出中单列呈现。
 */
const ASSIGNABLE_ROLES = (Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== 'LEADER');

/**
 * 用户与权限 v2（P3-5 后台域）
 *
 * 相对 v1 的纯视觉变化：
 *   ① 6 个 StatCard → `.wb2-metrics.c6`；`Card > Tabs` → `.wb2-tabs`
 *   ② 3 条 Alert（info×2 / warning）→ `.wb2-alert`
 *   ③ 角色 / 数据范围 / 标签 / 状态 / 来源 / 回执 Tag（orange/green/blue/gold/purple/red 六套）
 *      → `.wb2-tag` 四档语义；角色 Tag 保留 closable（撤销角色是高频动作，不能为了统一而加一步）
 *   ④ 3 个 Modal + 2 处 modal.confirm → `Dialog` / `useConfirm()`（撤销角色、删除用户 danger）
 *   ⑤ 同步日志的 4 张小 Card → `.wb2-list` 细线行
 *
 * 业务：CR-11 手工/批量管理（三态回执 + 冲突覆盖）、U-1 负责人派生属性、
 * A-31 管辖范围同步开关、钉钉同步不覆盖手工字段——逐行沿用 v1，未改任何判定与写入字段。
 */

export default function UserAdminV2() {
  const { db, setDb, log, flags, me, hasRole } = useStore();
  const { message } = AntApp.useApp();
  const confirm = useConfirm();
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
  /** V8.3-10.07：筛选面板是否展开 */
  const [filterOpen, setFilterOpen] = useState(false);
  /** V8.3-10.07：结构化筛选条件（部门含下级 / 角色 / 标签 / 状态 / 来源 / 负责人） */
  const [filter, setFilter] = useState<UserFilterState>({
    keyword: '', deptId: '', includeSub: true, role: '', tag: '', status: '', source: '', leader: '',
  });
  /** V8.3-10.07：批量修改的其余字段（部门/追加角色沿用上面的 moveDept / moveRole） */
  const [batchRemoveRole, setBatchRemoveRole] = useState<Role | ''>('');
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [batchRemoveTags, setBatchRemoveTags] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState<number | ''>('');
  const [batchLeader, setBatchLeader] = useState<'' | 'Y' | 'N'>('');

  /** 关键字并进筛选，保证「搜索 + 筛选」是同一份口径（表格 / 导出 / 批量三处共用） */
  const filterState = useMemo<UserFilterState>(() => ({ ...filter, keyword: kw }), [filter, kw]);
  const activeFilter = hasUserFilter(filterState);

  /**
   * 列表口径（单一真源）：排除软删 → 关键字 → 结构化筛选。
   * 表格、导出、批量操作三处都读它，杜绝「看到的不是导出的」这类半生效。
   */
  const users = useMemo(() => {
    const rows = db.users.filter((u) => u.status !== 99);
    const kwText = filterState.keyword.trim();
    const base = kwText
      ? rows.filter((u) => u.name.includes(kwText) || u.dept_names.join().includes(kwText) || u.title?.includes(kwText))
      : rows;
    const subTree = deptSubtreeIds(db.depts ?? [], filterState.deptId);
    return base.filter((u) => matchUserFilter(u, filterState, subTree));
  }, [db.users, db.depts, filterState]);

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
    confirm({
      title: `撤销 ${ROLE_LABEL[role]}？`,
      content: '权限变更即时生效并留痕；ADMIN 离职或角色被撤销后，M12 凭据立即失效并删除。',
      okText: '确认撤销',
      danger: true,
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
      let us = p.users;
      if (coverRows.length) {
        const coverMap = new Map(coverRows.map((r) => [r.conflictUnionId!, toUsers([r], db, DEMO_TODAY)[0]]));
        us = us.map((prev) => {
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
      const rest = appended.filter((u) => !us.some((x) => x.job_number === u.job_number && x.source === 'MANUAL'));
      return { ...p, users: [...us, ...rest] };
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
    /** V8.3-10.07：口径随当前筛选条件变化，表头写明这次导出的到底是什么 */
    const scopeText = userFilterSummary(filterState, db.depts, db.tags, ROLE_LABEL as unknown as Record<string, string>);
    downloadCsv(
      `用户清单_${DEMO_TODAY}.csv`,
      `# 统计口径：${scopeText}；不含已删除；共 ${users.length} 人\n${head.join(',')}\n${body.join('\n')}`,
    );
    log('导出用户清单', `共 ${users.length} 人`, `筛选条件：${scopeText}；不含已删除`);
    message.success(`已导出 ${users.length} 人（表头带口径标注）`);
  };

  /** V8.3-10.07：批量修改（部门 / 角色（追加+移除）/ 标签（追加+移除）/ 状态 / 负责人） */
  const buildPatch = (): { patch: UserBatchPatch; dept?: typeof db.depts[number]; empty: boolean } => {
    const dept = db.depts.find((d) => d.dept_id === moveDept);
    const patch: UserBatchPatch = {
      dept: dept ? { dept_id: dept.dept_id, name: dept.name } : null,
      addRoles: moveRole ? [moveRole] : [],
      removeRoles: batchRemoveRole ? [batchRemoveRole] : [],
      addTags: batchTags,
      removeTags: batchRemoveTags,
      status: batchStatus === '' ? null : batchStatus,
      leader: batchLeader === '' ? null : batchLeader === 'Y',
      syncManaged: moveSyncManaged,
    };
    const empty = !dept && !moveRole && !batchRemoveRole && batchTags.length === 0
      && batchRemoveTags.length === 0 && batchStatus === '' && batchLeader === '';
    return { patch, dept, empty };
  };

  const commitBatch = () => {
    if (selected.length === 0) { message.warning('请先勾选用户'); return; }
    const { patch, dept, empty } = buildPatch();
    if (empty) { message.warning('请至少选择一项要修改的内容'); return; }
    setDb((p) => ({
      ...p,
      users: p.users.map((u) => (selected.includes(u.union_id) ? applyUserBatchPatch(u, patch) : u)),
    }));
    const detail = describeBatchPatch(
      patch, dept,
      ROLE_LABEL as unknown as Record<string, string>,
      (id) => db.tags.find((t) => t.id === id)?.name ?? id,
    );
    log('批量修改用户', `${selected.length} 人`, `${detail}；操作人 ${me.name}`);
    message.success(`已修改 ${selected.length} 人：${detail}`);
    setMoveOpen(false);
    setSelected([]);
    setMoveDept(''); setMoveRole(''); setMoveSyncManaged(false);
    setBatchRemoveRole(''); setBatchTags([]); setBatchRemoveTags([]); setBatchStatus(''); setBatchLeader('');
  };

  /** V8.3-10.07：批量删除（软删除 status=99，仅 ADMIN，二次确认 + 逐人留痕） */
  const batchDelete = () => {
    if (selected.length === 0) { message.warning('请先勾选用户'); return; }
    if (!isAdmin) { message.error('仅系统管理员可执行删除'); return; }
    const names = db.users.filter((u) => selected.includes(u.union_id)).map((u) => u.name);
    confirm({
      title: `确认删除选中的 ${selected.length} 人？`,
      content: `${names.slice(0, 20).join('、')}${names.length > 20 ? ` 等 ${names.length} 人` : ''}\n\n软删除（status=99）：历史提报、评分与积分数据全部保留，仅从在职名单中移除；操作有审计留痕。`,
      okText: '确认删除',
      danger: true,
      onOk: () => {
        setDb((p) => ({
          ...p,
          users: p.users.map((u) => (selected.includes(u.union_id) ? { ...u, status: 99 } : u)),
        }));
        log('批量删除用户', `${selected.length} 人`, `软删除 status=99，操作人 ${me.name}（仅 ADMIN）；名单：${names.join('、')}`);
        message.success(`已删除 ${selected.length} 人（软删除并留痕）`);
        setSelected([]);
      },
    });
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
    confirm({
      title: `删除用户 ${u.name}？`,
      content: '删除为软删除（status=99），历史提报、评分与积分数据全部保留；如需彻底清理请联系平台运营。',
      okText: '确认删除',
      danger: true,
      onOk: () => {
        setDb((p) => ({ ...p, users: p.users.map((x) => (x.union_id === u.union_id ? { ...x, status: 99 } : x)) }));
        log('删除用户', u.name, `软删除 status=99，操作人 ${me.name}（仅 ADMIN）`);
        message.success(`已删除 ${u.name}（软删除并留痕）`);
      },
    });
  };

  /** 钉钉全量同步：source=MANUAL 的手工字段（角色/标签）不被覆盖 */
  const syncDingtalk = () => {
    const manualCount = db.users.filter((u) => u.source === 'MANUAL').length;
    log('通讯录同步', '手动触发全量同步', `递归部门 + 分页翻完 + unionId 去重；跳过 ${manualCount} 名手工用户的角色/标签（手工优先）`);
    message.success(`同步完成：${db.users.length} 人 / ${db.depts.length} 部门（递归遍历，无遗漏）；${manualCount} 名手工创建的角色/标签保持不被覆盖`);
  };

  /** 用户状态 → 四档语义 */
  const statusTone = (v: number) => (v === 1 ? 'ok' : v === 0 ? 'wa' : v === 2 ? 'wa' : v === 3 ? 'id' : 'er');

  return (
    <div>
      <div className="wb2-ph">
        <div>
          <h2 className="wb2-ph-t">用户与权限</h2>
          <div className="wb2-ph-d">钉钉通讯录同步、角色与数据范围授权</div>
        </div>
      </div>

      <div className="wb2-metrics c6">
        {[
          { t: '用户总数', v: db.users.length, accent: true },
          { t: '已激活', v: db.users.filter((u) => u.status === 1).length },
          { t: '部门数', v: db.depts.length },
          { t: '干部标签人数', v: db.users.filter((u) => u.tags.includes('T1')).length },
          { t: '骨干标签人数', v: db.users.filter((u) => u.tags.includes('T3')).length },
          { t: '最近同步', v: '09-25 02:00' },
        ].map((m) => (
          <div className="wb2-metric" key={m.t}>
            <div className="lb">{m.t}</div>
            <div className={`vl${m.accent ? ' accent' : ''}`}>{m.v}</div>
          </div>
        ))}
      </div>

      <div className="wb2-tabs">
        <Tabs
          items={[
            {
              key: 'users', label: `用户列表（${users.length}）`,
              children: (
                <>
                  <div className="wb2-tools">
                    <label className="wb2-inp">
                      <Input placeholder="搜索姓名 / 部门 / 头衔" value={kw} onChange={(e) => setKw(e.target.value)} allowClear variant="borderless" />
                    </label>
                    {/* V8.3-10.07：筛选按钮 —— 部门（含下级）/ 角色 / 标签 / 状态 / 来源 / 负责人 */}
                    <Button icon={<FilterOutlined />} onClick={() => setFilterOpen(!filterOpen)}>
                      筛选{activeFilter ? '（已启用）' : ''}
                    </Button>
                    {activeFilter && (
                      <Button
                        onClick={() => {
                          setKw('');
                          setFilter({ keyword: '', deptId: '', includeSub: true, role: '', tag: '', status: '', source: '', leader: '' });
                        }}
                      >
                        清空筛选
                      </Button>
                    )}
                    <Button onClick={syncDingtalk}>手动同步钉钉通讯录</Button>
                    <Button onClick={() => { log('强制下线', '指定用户', '管理员操作'); message.success('已强制下线，Token 立即失效'); }}>强制下线指定用户</Button>
                    {manual && (
                      <>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>手动新增</Button>
                        <Button icon={<ImportOutlined />} onClick={() => setImpDrawer(true)}>批量导入</Button>
                        <Button icon={<DownloadOutlined />} onClick={exportUsers}>导出筛选结果</Button>
                        <Button disabled={selected.length === 0} onClick={() => setMoveOpen(true)}>批量修改（{selected.length}）</Button>
                        <Button danger disabled={selected.length === 0 || !isAdmin} icon={<DeleteOutlined />} onClick={batchDelete}>
                          批量删除（{selected.length}）
                        </Button>
                      </>
                    )}
                  </div>

                  {/* V8.3-10.07：筛选面板（点「筛选」展开；收起后筛选条件仍生效，不影响列表） */}
                  {filterOpen && (
                    <div className="wb2-card" style={{ marginBottom: 'var(--wb-space-4)', padding: 'var(--wb-space-4)' }}>
                      <div className="wb2-card-t" style={{ marginBottom: 'var(--wb-space-3)' }}>按条件筛选</div>
                      <div style={{ display: 'grid', gap: 'var(--wb-space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                        <div>
                          <div className="wb2-note" style={{ marginBottom: 4 }}>部门</div>
                          <Select
                            allowClear showSearch style={{ width: '100%' }} placeholder="全部部门"
                            value={filter.deptId || undefined}
                            options={db.depts.map((d) => ({ value: d.dept_id, label: `${'　'.repeat(Math.max(0, (d.level ?? 1) - 1))}${d.name}` }))}
                            onChange={(v) => setFilter({ ...filter, deptId: v ?? '' })}
                          />
                          <Checkbox
                            style={{ marginTop: 6 }} checked={filter.includeSub} disabled={!filter.deptId}
                            onChange={(e) => setFilter({ ...filter, includeSub: e.target.checked })}
                          >
                            含下级部门
                          </Checkbox>
                        </div>
                        <div>
                          <div className="wb2-note" style={{ marginBottom: 4 }}>角色</div>
                          <Select
                            allowClear style={{ width: '100%' }} placeholder="全部角色"
                            value={filter.role || undefined}
                            options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                            onChange={(v) => setFilter({ ...filter, role: v ?? '' })}
                          />
                        </div>
                        <div>
                          <div className="wb2-note" style={{ marginBottom: 4 }}>人员标签</div>
                          <Select
                            allowClear style={{ width: '100%' }} placeholder="全部标签"
                            value={filter.tag || undefined}
                            options={db.tags.map((t) => ({ value: t.id, label: t.name }))}
                            onChange={(v) => setFilter({ ...filter, tag: v ?? '' })}
                          />
                        </div>
                        <div>
                          <div className="wb2-note" style={{ marginBottom: 4 }}>状态</div>
                          <Select
                            allowClear style={{ width: '100%' }} placeholder="全部状态"
                            value={filter.status === '' ? undefined : filter.status}
                            options={[
                              { value: 0, label: '预注册' }, { value: 1, label: '已激活' },
                              { value: 2, label: '已停用' }, { value: 3, label: '已离职回收' },
                            ]}
                            onChange={(v) => setFilter({ ...filter, status: v === undefined ? '' : v })}
                          />
                        </div>
                        <div>
                          <div className="wb2-note" style={{ marginBottom: 4 }}>来源</div>
                          <Select
                            allowClear style={{ width: '100%' }} placeholder="全部来源"
                            value={filter.source || undefined}
                            options={[{ value: 'DINGTALK', label: '钉钉映射' }, { value: 'MANUAL', label: '手工' }]}
                            onChange={(v) => setFilter({ ...filter, source: (v ?? '') as '' | 'DINGTALK' | 'MANUAL' })}
                          />
                        </div>
                        <div>
                          <div className="wb2-note" style={{ marginBottom: 4 }}>是否负责人</div>
                          <Select
                            allowClear style={{ width: '100%' }} placeholder="不限"
                            value={filter.leader || undefined}
                            options={[{ value: 'Y', label: '仅部门负责人' }, { value: 'N', label: '非负责人' }]}
                            onChange={(v) => setFilter({ ...filter, leader: (v ?? '') as '' | 'Y' | 'N' })}
                          />
                        </div>
                      </div>
                      <div className="wb2-note" style={{ marginTop: 'var(--wb-space-3)' }}>
                        筛出 <b>{users.length}</b> 人（共 {db.users.filter((u) => u.status !== 99).length} 人）·
                        当前口径：{userFilterSummary(filterState, db.depts, db.tags, ROLE_LABEL as unknown as Record<string, string>)}
                        ；导出的就是这份名单
                      </div>
                    </div>
                  )}
                  {manual && (
                    <div className="wb2-alert" style={{ marginBottom: 'var(--wb-space-4)' }}>
                      <div className="bd">
                        <div className="t">V4.0 CR-11：手工/批量管理已启用（单次导入上限 {MAX_ROWS} 行）</div>
                        <div className="d">钉钉映射来源（source=DINGTALK）的用户在全量同步时不覆盖手工字段（角色、标签、备注）；手工创建的用户 source=MANUAL，始终以手工为准。删除为软删除（status=99），仅系统管理员可执行。</div>
                      </div>
                    </div>
                  )}
                  <Table
                    size="small" rowKey="union_id" pagination={{ pageSize: 10 }} dataSource={users}
                    rowSelection={manual ? { selectedRowKeys: selected, onChange: (ks) => setSelected(ks as string[]) } : undefined}
                    columns={[
                      {
                        title: '姓名', dataIndex: 'name', width: 90,
                        render: (v: string, r: User) => (
                          <div>
                            <b style={{ color: COLOR.ink1 }}>{v}</b>
                            <div className="wb2-note">{r.job_number}</div>
                          </div>
                        ),
                      },
                      { title: '部门', render: (_: unknown, r: User) => r.dept_names[0] },
                      { title: '头衔', dataIndex: 'title', ellipsis: true },
                      {
                        title: '角色', dataIndex: 'roles', width: 240,
                        render: (_v: Role[], r: User) => (
                          <div style={{ display: 'flex', gap: 'var(--wb-space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* 关掉 userManualManage ≡ V3.0：恢复显示原始 roles（含「团队负责人」标签） */}
                            {(manual ? effectiveRoles(r) : r.roles).map((role) => (
                              <span className="wb2-tag wa" key={role}>
                                <i className="d" />{ROLE_LABEL[role]}
                                <button
                                  type="button" aria-label={`撤销 ${ROLE_LABEL[role]}`}
                                  onClick={() => revokeRole(r.union_id, role)}
                                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
                                >×</button>
                              </span>
                            ))}
                            <Select
                              size="small" placeholder="+ 授予角色" style={{ width: 110 }}
                              options={(manual ? ASSIGNABLE_ROLES : (Object.keys(ROLE_LABEL) as Role[]))
                                .map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
                              onChange={(role) => grantRole(r.union_id, role as Role)}
                            />
                          </div>
                        ),
                      },
                      /** U-1 新列：仅手工管理模式出现（关闭开关 ≡ V3.0，此列消失） */
                      ...(manual ? [{
                        title: '部门负责人', dataIndex: 'is_dept_leader', width: 108,
                        render: (_v: boolean, r: User) => (
                          <Switch size="small" checked={isDeptLeader(r)} onChange={(c) => toggleLeader(r, c)} />
                        ),
                      }] : []),
                      {
                        title: '数据范围', dataIndex: 'scope_type', width: 110,
                        render: (v: string) => (
                          <span className={`wb2-tag ${v === 'ALL' ? 'ok' : v === 'DEPT_TREE' ? 'run' : 'id'}`}><i className="d" />{v}</span>
                        ),
                      },
                      {
                        title: '标签', dataIndex: 'tags', width: 150,
                        render: (v: string[]) => (
                          <div className="wb2-chips">{v.map((t) => <span className="wb2-tag" key={t}>{db.tags.find((x) => x.id === t)?.name}</span>)}</div>
                        ),
                      },
                      {
                        title: '状态', dataIndex: 'status', width: 100,
                        render: (v: number) => (
                          <span className={`wb2-tag ${statusTone(v)}`}>
                            <i className="d" />{['预注册', '已激活', '已停用', '已离职回收', '已删除'][v] ?? String(v)}
                          </span>
                        ),
                      },
                      { title: '积分', dataIndex: 'points', width: 80, render: (v: number) => <span className="num">{v}</span> },
                      ...(manual ? [{
                        title: '来源', dataIndex: 'source', width: 96,
                        render: (v?: string) => (
                          <span className={`wb2-tag ${v === 'MANUAL' ? 'run' : 'run'}`}>
                            <i className="d" />{v === 'MANUAL' ? '手工' : '钉钉映射'}
                          </span>
                        ),
                      }] : []),
                      ...(manual ? [{
                        title: '操作', width: 180,
                        render: (_v: unknown, r: User) => (
                          <div style={{ display: 'flex', gap: 'var(--wb-space-2)' }}>
                            <Button size="small" type="link" onClick={() => toggleStatus(r)}>{r.status === 1 ? '停用' : '启用'}</Button>
                            <Button size="small" type="link" danger icon={<DeleteOutlined />} disabled={!isAdmin} onClick={() => softDelete(r)}>删除</Button>
                          </div>
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
                  <div className="wb2-alert" style={{ marginBottom: 'var(--wb-space-4)' }}>
                    <div className="bd">
                      <div className="t">平台开放全员，但考核指标分母按标签切分，默认「干部 + 核心骨干」（钉钉《用户标签》名单，共 47 人）</div>
                      <div className="d">打标方式：① 按部门批量打标；② 按人员名单导入；③ 单人手动调整；④ 规则自动打标（预留）。标签不互斥，统计时按所选标签取并集去重。</div>
                    </div>
                  </div>
                  <Table
                    size="small" rowKey="id" pagination={false} dataSource={db.tags}
                    columns={[
                      { title: '标签名称', dataIndex: 'name' },
                      { title: '编码', dataIndex: 'code' },
                      { title: '人数', render: (_, r) => <span className="num">{db.users.filter((u) => u.tags.includes(r.id)).length}</span> },
                      {
                        title: '是否考核分母', dataIndex: 'is_assessment_scope', width: 120,
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
                      { title: '预置', dataIndex: 'is_default', width: 90, render: (v: boolean) => (v ? <span className="wb2-tag id"><i className="d" />系统预置</span> : <span className="wb2-note">—</span>) },
                      {
                        title: '状态', dataIndex: 'status', width: 90,
                        render: (v: string) => <span className={`wb2-tag ${v === '启用' ? 'ok' : 'id'}`}><i className="d" />{v}</span>,
                      },
                      {
                        title: '操作', width: 200,
                        render: (_, r) => (
                          <div style={{ display: 'flex', gap: 'var(--wb-space-2)' }}>
                            <Button size="small" type="link" onClick={() => setTagModal(r.id)}>按名单批量打标</Button>
                            <Button size="small" type="link" onClick={() => { log('按部门批量打标', r.name, '选择部门后批量打标'); message.success('已按部门批量打标'); }}>按部门打标</Button>
                          </div>
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
                <>
                  <div className="wb2-alert warn" style={{ marginBottom: 'var(--wb-space-4)' }}>
                    <div className="bd">
                      <div className="t">同步必须规避的已知问题</div>
                      <div className="d">① listsub 只返回直接子部门，必须递归；② 同一成员多部门用 unionId 去重；③ 超 100 人部门必须翻页至 has_more=false；④ 部门 ID 需映射为中文名；⑤ 头像仅空值写入；⑥ Token 缓存 7200s。</div>
                    </div>
                  </div>
                  <div className="wb2-list">
                    {[
                      { t: '2026-09-25 02:00', d: '定时全量同步 · 新增 0 人 / 更新 3 人 / 部门 15 · 耗时 41s · 成功' },
                      { t: '2026-09-24 02:00', d: '定时全量同步 · 新增 2 人 / 更新 5 人 / 部门 15 · 耗时 39s · 成功' },
                      { t: '2026-09-23 09:12', d: '手动触发 · 新增 51 人 / 更新 0 人 / 部门 15 · 耗时 52s · 成功' },
                      { t: '2026-09-22 02:00', d: '定时全量同步 · 新增 0 人 / 更新 1 人 · 部门 15 · 耗时 38s · 成功' },
                    ].map((l) => (
                      <div className="wb2-li" key={l.t}>
                        <span className="wb2-tag ok"><i className="d" />成功</span>
                        <div className="wb2-li-m">
                          <div className="wb2-li-t">{l.t}</div>
                          <div className="wb2-li-s"><span>{l.d}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ),
            },
          ]}
        />
      </div>

      {/* ---------- 按名单批量打标 ---------- */}
      <Dialog
        open={!!tagModal} title="按人员名单批量打标"
        sub="粘贴 unionId 或姓名，每行一个（支持从 Excel 复制）。通讯录同步不会清除标签；离职时标签保留但标记为失效，不计入任何分母。"
        okText="确认打标" okDisabled={!tagUsers.trim()}
        onCancel={() => setTagModal(null)} onOk={batchTag}
      >
        <Input.TextArea rows={8} value={tagUsers} onChange={(e) => setTagUsers(e.target.value)} placeholder={'赵冰艳\n王建国\nuid003'} />
      </Dialog>

      {/* ---------- CR-11：手工新增 ---------- */}
      <Dialog open={addOpen} title="手动新增用户" okText="创建" onCancel={() => setAddOpen(false)} onOk={() => { void addUser(); }}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]} style={{ marginBottom: 'var(--wb-space-3)' }}>
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item name="job_number" label="工号" rules={[{ required: true, message: '请输入工号' }]} style={{ marginBottom: 'var(--wb-space-3)' }}>
            <Input />
          </Form.Item>
          <Form.Item name="mobile" label="手机号" rules={[{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }]} style={{ marginBottom: 'var(--wb-space-3)' }}>
            <Input />
          </Form.Item>
          <Form.Item name="dept_id" label="部门" rules={[{ required: true, message: '请选择部门' }]} style={{ marginBottom: 'var(--wb-space-3)' }}>
            <Select showSearch optionFilterProp="label" options={db.depts.map((d) => ({ value: d.dept_id, label: d.name }))} />
          </Form.Item>
          <Form.Item name="roles" label="角色" style={{ marginBottom: 'var(--wb-space-3)' }}>
            <Select mode="multiple" options={ASSIGNABLE_ROLES.map((v) => ({ value: v, label: ROLE_LABEL[v] }))} />
          </Form.Item>
          <Form.Item name="leader" label="是否部门负责人" valuePropName="checked" style={{ marginBottom: 'var(--wb-space-3)' }}>
            <Checkbox>该用户是部门负责人（团队板块以此为口径，不作为角色字段）</Checkbox>
          </Form.Item>
          <Form.Item name="tags" label="标签" style={{ marginBottom: 0 }}>
            <Select mode="multiple" options={db.tags.map((t) => ({ value: t.id, label: t.name }))} />
          </Form.Item>
        </Form>
      </Dialog>

      {/* ---------- CR-11 / V8.3-10.07：批量修改（部门 / 角色 / 标签 / 状态 / 负责人） ---------- */}
      <Dialog
        open={moveOpen} title={`批量修改（已选 ${selected.length} 人）`}
        sub="可对勾选的人同时改部门、追加或移除角色与标签、调整状态与负责人身份；留空表示不变更。"
        okText="确认修改"
        onCancel={() => setMoveOpen(false)} onOk={commitBatch}
      >
        <DialogField label="调至部门（留空表示不变更部门）">
          <Select allowClear style={{ width: '100%' }} value={moveDept || undefined} onChange={(v) => setMoveDept(v ?? '')}
            options={db.depts.map((d) => ({ value: d.dept_id, label: d.name }))} />
        </DialogField>
        <DialogField label="追加角色（留空表示不追加）">
          <Select allowClear style={{ width: '100%' }} value={moveRole || undefined} onChange={(v) => setMoveRole((v ?? '') as Role | '')}
            options={ASSIGNABLE_ROLES.map((v) => ({ value: v, label: ROLE_LABEL[v] }))} />
        </DialogField>
        <DialogField label="移除角色（留空表示不移除）">
          <Select allowClear style={{ width: '100%' }} value={batchRemoveRole || undefined} onChange={(v) => setBatchRemoveRole((v ?? '') as Role | '')}
            options={(Object.keys(ROLE_LABEL) as Role[]).map((v) => ({ value: v, label: ROLE_LABEL[v] }))} />
        </DialogField>
        <DialogField label="追加标签（可多选，不选表示不追加）">
          <Select mode="multiple" style={{ width: '100%' }} placeholder="选择标签" value={batchTags} onChange={setBatchTags}
            options={db.tags.map((t) => ({ value: t.id, label: t.name }))} />
        </DialogField>
        <DialogField label="移除标签（可多选，不选表示不移除）">
          <Select mode="multiple" style={{ width: '100%' }} placeholder="选择标签" value={batchRemoveTags} onChange={setBatchRemoveTags}
            options={db.tags.map((t) => ({ value: t.id, label: t.name }))} />
        </DialogField>
        <DialogField label="状态（留空表示不变更）">
          <Select allowClear style={{ width: '100%' }} placeholder="不变更" value={batchStatus === '' ? undefined : batchStatus}
            options={[
              { value: 0, label: '预注册' }, { value: 1, label: '已激活' },
              { value: 2, label: '已停用' }, { value: 3, label: '已离职回收' },
            ]}
            onChange={(v) => setBatchStatus(v === undefined ? '' : v)} />
        </DialogField>
        <DialogField label="部门负责人（留空表示不变更）">
          <Select allowClear style={{ width: '100%' }} placeholder="不变更" value={batchLeader || undefined}
            options={[{ value: 'Y', label: '设为部门负责人' }, { value: 'N', label: '取消负责人身份' }]}
            onChange={(v) => setBatchLeader((v ?? '') as '' | 'Y' | 'N')} />
        </DialogField>
        {/* A-31：管辖范围是否随调动同步（默认不勾，兼容借调 / 兼任场景） */}
        <div className="wb2-setrow">
          <div className="nm">
            同时把管辖范围调整到新部门
            <div className="ds">
              管辖范围决定「我的团队」板块能看到谁。<b>勾选</b>＝调到哪就管到哪（适合正式调动）；
              <b>不勾选</b>＝保留原管辖部门（适合借调 / 兼任）。
            </div>
          </div>
          <div className="ct">
            <Switch checked={moveSyncManaged} disabled={!moveDept} onChange={(c) => setMoveSyncManaged(c)} />
          </div>
        </div>
      </Dialog>

      {/* ---------- CR-11：批量导入（三态回执） ---------- */}
      <Drawer
        open={impDrawer} title="批量导入用户（CSV / XLSX）" width={720}
        onClose={() => { setImpDrawer(false); setRows(null); }}
      >
        <div className="wb2-note" style={{ marginBottom: 'var(--wb-space-4)' }}>
          模板列：姓名 / 工号 / 手机号 / 部门 / 角色 / 标签（角色与标签多个用 | 分隔）。单次上限 {MAX_ROWS} 行。
        </div>
        <div style={{ display: 'flex', gap: 'var(--wb-space-3)', marginBottom: 'var(--wb-space-5)', flexWrap: 'wrap' }}>
          <Button icon={<DownloadOutlined />} onClick={() => {
            downloadCsv('用户导入模板.csv', TEMPLATE_TEXT);
            message.success('模板已下载');
          }}>下载模板</Button>
          <Upload accept=".csv,.txt" beforeUpload={onFile} showUploadList={false}>
            <Button type="primary" icon={<UploadOutlined />}>选择文件并预校验</Button>
          </Upload>
        </div>

        {rows && (
          <>
            <div className="wb2-chips" style={{ marginBottom: 'var(--wb-space-4)' }}>
              {[
                { tone: 'ok', t: `成功 ${rows.filter((r) => r.state === 'OK').length}` },
                { tone: 'wa', t: `待确认 ${rows.filter((r) => r.state === 'CONFLICT').length}` },
                { tone: 'er', t: `失败 ${rows.filter((r) => r.state === 'ERROR').length}` },
              ].map((s) => <span className={`wb2-tag ${s.tone}`} key={s.t}><i className="d" />{s.t}</span>)}
            </div>
            <Table
              size="small" rowKey="line" pagination={{ pageSize: 8 }} dataSource={rows}
              columns={[
                { title: '行号', dataIndex: 'line', width: 60 },
                { title: '姓名', dataIndex: 'name', width: 90 },
                { title: '工号', dataIndex: 'job_number', width: 110 },
                { title: '部门', dataIndex: 'dept_name', width: 160 },
                {
                  title: '回执', dataIndex: 'state', width: 100,
                  render: (v: string) => (
                    <span className={`wb2-tag ${v === 'OK' ? 'ok' : v === 'CONFLICT' ? 'wa' : 'er'}`}>
                      <i className="d" />{v === 'OK' ? '成功' : v === 'CONFLICT' ? '待确认' : '失败'}
                    </span>
                  ),
                },
                { title: '说明', dataIndex: 'issues', render: (v: string[]) => <span className="wb2-note">{v.join('；')}</span> },
              ]}
            />
            <div style={{ display: 'flex', gap: 'var(--wb-space-3)', marginTop: 'var(--wb-space-4)', flexWrap: 'wrap' }}>
              <Button type="primary" disabled={rows.filter((r) => r.state === 'OK').length === 0} onClick={() => commitImport(false)}>
                导入成功行（{rows.filter((r) => r.state === 'OK').length}）
              </Button>
              <Button disabled={rows.filter((r) => r.state === 'CONFLICT').length === 0} onClick={() => commitImport(true)}>
                冲突行以手工为准并导入（{rows.filter((r) => r.state === 'CONFLICT').length}）
              </Button>
            </div>
            <div className="wb2-note" style={{ marginTop: 'var(--wb-space-3)' }}>
              三态回执口径：成功=直接写入；待确认=与存量用户重号/重手机号，需选择覆盖策略；失败=格式错必须修正后重传（不入库）。
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
