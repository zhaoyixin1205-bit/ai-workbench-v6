/**
 * V4.0 CR-11 · 用户手工/批量导入（纯前端 mock，无新 API 依赖）
 *
 * 设计约束：
 * 1. 上限 500 行：localStorage 单域约 5MB，超量会写入失败，因此**在提交前拦截**并给出明确提示；
 * 2. 三态回执：`OK`（可导入）/ `CONFLICT`（与存量用户重号或重手机号，需确认覆盖策略）/ `ERROR`（格式错，必须修正）；
 * 3. 钉钉映射来源的用户 `source=DINGTALK`，全量同步时**不覆盖**手工字段（角色、标签、备注），冲突时「手工优先 + 冲突提示」。
 */
import type { Dept, User } from '@/mock/types';

/** 避免与 store 循环依赖：这里只需要 DB 的用户/部门/标签三个切片 */
export interface ImportCtx {
  users: User[];
  depts: Dept[];
  tags: { id: string; name: string }[];
}

export const MAX_ROWS = 500;

export const TEMPLATE_HEADER = ['姓名', '工号', '手机号', '部门', '角色', '标签'] as const;

export const TEMPLATE_TEXT = [
  TEMPLATE_HEADER.join(','),
  '张三,EMP1001,13800000001,华东大区/苏南分公司,普通成员,干部',
  '李四,EMP1002,13800000002,中台支持中心/运营中台,部门负责人|评委,核心39人',
].join('\n');

/** 解析 CSV（支持逗号分隔与简单引号包裹） */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') { quoted = !quoted; continue; }
      if ((ch === ',' || ch === '\t') && !quoted) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = splitLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitLine(l);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

export type RowState = 'OK' | 'CONFLICT' | 'ERROR';

export interface ImportRow {
  line: number;
  raw: Record<string, string>;
  name: string;
  job_number: string;
  mobile: string;
  dept_name: string;
  roles: string[];
  tags: string[];
  /** U-1：负责人语义落到派生属性，不再作为角色 */
  is_dept_leader: boolean;
  state: RowState;
  issues: string[];
  /** 命中的存量用户（冲突行才有） */
  conflictUnionId?: string;
}

export interface ValidateResult {
  rows: ImportRow[];
  ok: number;
  conflict: number;
  error: number;
  /** 超过 MAX_ROWS 时为真 */
  overflow: boolean;
}

const ROLE_CN: Record<string, string> = {
  普通成员: 'MEMBER', 成员: 'MEMBER',
  评委: 'JUDGE',
  专家: 'EXPERT',
  组织者: 'ORGANIZER',
  技能管理员: 'SKILL_ADMIN',
  系统管理员: 'ADMIN',
  观众: 'VIEWER',
};

/**
 * U-1 结案：负责人不再是「角色」，这两个词从角色表里移出，
 * 单独落到 `is_dept_leader` 派生属性上（写 `managed_dept_ids` 才是它的真实语义）。
 */
const LEADER_CN = ['部门负责人', '负责人'];

export function roleFromCn(cn: string): string[] {
  return cn.split(/[|／/、]+/).map((s) => s.trim()).filter(Boolean)
    .filter((s) => !LEADER_CN.includes(s))
    .map((s) => ROLE_CN[s] ?? '');
}

/** 角色串里是否含「负责人」语义 */
export function hasLeaderCn(cn: string): boolean {
  return cn.split(/[|／/、]+/).map((s) => s.trim()).filter(Boolean).some((s) => LEADER_CN.includes(s));
}

const MOBILE_RE = /^1[3-9]\d{9}$/;

/**
 * 部门解析：兼容三种写法
 *  ① 叶子名「苏南分公司」
 *  ② 带根全路径「中小微事业群/华东大区/苏南分公司」
 *  ③ 省略根的全路径「华东大区/苏南分公司」（钉钉导出常见）
 * 全角斜杠「／」一并兼容。同名部门以层级更浅者优先（保持确定性）。
 */
function buildDeptIndex(depts: Dept[]): Map<string, Dept> {
  const idx = new Map<string, Dept>();
  const put = (key: string, dept: Dept) => {
    const k = key.trim().replace(/／/g, '/');
    if (!k) return;
    const prev = idx.get(k);
    if (!prev || dept.level < prev.level) idx.set(k, dept);
  };
  [...depts]
    .sort((a, b) => a.level - b.level)
    .forEach((d) => {
      put(d.name, d);
      put(d.path, d);
      const seg = d.path.split('/');
      if (seg.length > 1) put(seg.slice(1).join('/'), d);
    });
  return idx;
}

export function resolveDeptByName(db: { depts: Dept[] }, raw: string): Dept | undefined {
  const name = (raw ?? '').trim().replace(/／/g, '/');
  if (!name) return undefined;
  return buildDeptIndex(db.depts).get(name);
}

/** 预校验：产生三态回执所需的全部信息（不写库） */
export function validateRows(rows: Record<string, string>[], db: ImportCtx): ValidateResult {
  const deptIdx = buildDeptIndex(db.depts);
  const tagNameToId = new Map(db.tags.map((t: { id: string; name: string }) => [t.name, t.id]));
  const seenJob = new Map<string, number>();
  const alive = db.users.filter((u: User) => u.status !== 99);

  const out: ImportRow[] = rows.map((raw, i) => {
    const name = (raw['姓名'] ?? '').trim();
    const job_number = (raw['工号'] ?? '').trim();
    const mobile = (raw['手机号'] ?? '').trim();
    const dept_name = (raw['部门'] ?? '').trim();
    const roleCn = (raw['角色'] ?? '').trim();
    const tagCn = (raw['标签'] ?? '').trim();

    const issues: string[] = [];
    let state: RowState = 'OK';
    let conflictUnionId: string | undefined;

    if (!name) issues.push('姓名必填');
    if (!job_number) issues.push('工号必填');
    if (mobile && !MOBILE_RE.test(mobile)) issues.push('手机号格式不正确');
    if (!dept_name) issues.push('部门必填');
    else if (!deptIdx.get(dept_name.trim().replace(/／/g, '/'))) issues.push(`部门「${dept_name}」不存在`);
    if (seenJob.has(job_number) && job_number) issues.push(`工号与第 ${seenJob.get(job_number)} 行重复`);
    if (job_number) seenJob.set(job_number, i + 2);

    const roles = roleFromCn(roleCn);
    if (roleCn && roles.some((r) => !r)) issues.push(`角色「${roleCn}」无法识别`);
    const isLeader = hasLeaderCn(roleCn);

    const tags = tagCn.split(/[|／/、]+/).map((s) => s.trim()).filter(Boolean);
    const unknownTag = tags.filter((t) => !tagNameToId.has(t));
    if (unknownTag.length) issues.push(`标签「${unknownTag.join('、')}」不存在（将在「标签管理」中忽略）`);

    const hit = alive.find((u: User) => (job_number && u.job_number === job_number) || (mobile && u.mobile === mobile));
    if (hit) {
      conflictUnionId = hit.union_id;
      issues.push(`与存量用户「${hit.name}」重号/重手机号`);
    }

    // 硬错：必填/格式/部门不存在/工号行内重复/角色无法识别
    // 软错（不阻断）：未知标签、与存量用户冲突 — 「标签」与「与存量用户」两类归并到 CONFLICT 或仅提示
    const hard = issues.filter((s) => !s.startsWith('与存量用户') && !s.startsWith('标签'));
    if (hard.length) state = 'ERROR';
    else if (conflictUnionId) state = 'CONFLICT';
    else state = 'OK';

    return { line: i + 2, raw, name, job_number, mobile, dept_name, roles, tags, is_dept_leader: isLeader, state, issues, conflictUnionId };
  });

  return {
    rows: out,
    ok: out.filter((r) => r.state === 'OK').length,
    conflict: out.filter((r) => r.state === 'CONFLICT').length,
    error: out.filter((r) => r.state === 'ERROR').length,
    overflow: rows.length > MAX_ROWS,
  };
}

/** 「以手工为准」——把冲突行升级为可导入（同步时不覆盖手工字段即依赖此口径） */
export function acceptConflicts(rows: ImportRow[]): ImportRow[] {
  return rows.map((r) => (r.state === 'CONFLICT' ? { ...r, state: 'OK' as RowState, issues: [...r.issues, '已确认：以手工数据为准（覆盖）'] } : r));
}

/** 把可导入行转成 User（MINIMAL：其余字段按 DEFAULTS 补齐） */
export function toUsers(rows: ImportRow[], db: ImportCtx, at: string): User[] {
  const roleSet = (rs: string[]) => {
    const list = rs.filter(Boolean) as User['roles'];
    return list.length ? Array.from(new Set(list)) : (['MEMBER'] as User['roles']);
  };
  return rows
    .filter((r) => r.state === 'OK')
    .map((r) => {
      const dept = resolveDeptByName(db, r.dept_name);
      const tags = r.tags.map((t) => db.tags.find((x: { id: string; name: string }) => x.name === t)?.id).filter(Boolean) as string[];
      const leader = !!r.is_dept_leader;
      return {
        union_id: `manual-${r.job_number || Math.random().toString(36).slice(2, 10)}`,
        name: r.name,
        mobile: r.mobile || undefined,
        job_number: r.job_number,
        dept_id_list: dept ? [dept.dept_id] : [],
        dept_names: dept ? [dept.name] : [r.dept_name],
        roles: roleSet(r.roles),
        scope_type: dept ? 'DEPT_TREE' : 'SELF',
        scope_dept_ids: dept ? [dept.dept_id] : [],
        tags,
        status: 1,
        points: 0,
        is_dept_leader: leader,
        /** U-1：导入时若是负责人，管辖范围默认等于其主部门 */
        managed_dept_ids: leader && dept ? [dept.dept_id] : undefined,
        created_at: at,
        source: 'MANUAL' as const,
      };
    });
}

/** 触发浏览器下载的通用工具（CSV，带 BOM 以免 Excel 乱码） */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
