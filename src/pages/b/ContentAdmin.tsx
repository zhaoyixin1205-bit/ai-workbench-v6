import {
  Alert, Button, Card, Divider, Empty, Input, InputNumber, Modal, Radio, Segmented, Space, Table,
  Tabs, Tag, Tooltip, Typography, Form, Select, Upload, App as AntApp,
} from 'antd';
import { PlusOutlined, InboxOutlined, UploadOutlined, LinkOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/store';
import { COLOR, TRACK_COLOR } from '@/theme';
import { PageHeader, StatCard } from '@/components/ui';
import { SkillCard, AttachCard, extOf } from '@/components/ResourceCards';
import { DEMO_TODAY } from '@/mock/seedBiz';
import ScopePicker, { ScopeText, useScopeCommit } from '@/components/ScopePicker';
import type {
  Announcement, Attachment, CaseItem, Level, SceneCard, ScopeSubject, SkillPackage, Topic, Track,
} from '@/mock/types';
import { formatSize } from '@/mock/types';
import { useFileUpload } from '@/service/useFileUpload';

export default function ContentAdmin() {
  const { db, setDb, me, log, flags } = useStore();
  const { message, modal } = AntApp.useApp();
  /** V6.0 CR-28：内容全维度 CRUD 开关（关闭 ≡ V5.0 只读） */
  const fullCrudOn = flags.contentFullCrud !== false;
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  /** V4.0 CR-08：案例可见范围（此前完全没有范围配置入口，只能全员可见） */
  const [visibleSubjects, setVisibleSubjects] = useState<ScopeSubject[]>([]);
  const commitScope = useScopeCommit();

  /* ---------- V6.0 CR-28：公告 CRUD（读写 announcement 实体） ---------- */
  const [announceEditing, setAnnounceEditing] = useState<Announcement | null>(null);
  /** 弹窗开关独立于 editing：新建时 editing 也是 null，仅凭它无法区分「新建中」与「未打开」 */
  const [announceFormOpen, setAnnounceFormOpen] = useState(false);
  const [announceForm] = Form.useForm();
  const now = () => `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`;

  /** 新建传 null，编辑传原对象；编辑态与新建态共用同一表单与校验 */
  const openAnnounce = (a: Announcement | null) => {
    setAnnounceEditing(a);
    setAnnounceFormOpen(true);
    announceForm.resetFields();
    announceForm.setFieldsValue(a
      ? { title: a.title, content: a.content, pinned: a.pinned, status: a.status }
      : { title: '', content: '', pinned: false, status: 'DRAFT' });
  };

  /** 保存（新建 / 编辑）：一律写 announcement，不触碰 BD4 历史帖子 */
  const saveAnnounce = async () => {
    let vals: { title?: string; content?: string; pinned?: boolean; status?: Announcement['status'] };
    try {
      vals = await announceForm.validateFields();
    } catch {
      message.error('请填写标题与正文');
      return;
    }
    const at = now();
    const editing = announceEditing;
    if (editing) {
      setDb((p) => ({
        ...p,
        announcements: p.announcements.map((a) => (a.id === editing.id
          ? {
            ...a,
            title: vals.title ?? a.title,
            content: vals.content ?? a.content,
            pinned: !!vals.pinned,
            status: vals.status ?? a.status,
            published_at: vals.status === 'PUBLISHED' && !a.published_at ? at : a.published_at,
          }
          : a)),
      }));
      log('编辑公告', vals.title ?? editing.title, `状态 ${vals.status}；置顶 ${vals.pinned ? '是' : '否'}`);
      message.success('公告已保存');
    } else {
      const id = `AN-${Date.now()}`;
      setDb((p) => ({
        ...p,
        announcements: [{
          id,
          title: vals.title ?? '',
          content: vals.content ?? '',
          status: vals.status ?? 'DRAFT',
          pinned: !!vals.pinned,
          published_at: vals.status === 'PUBLISHED' ? at : '',
          created_by: me.name,
          created_at: at,
        }, ...p.announcements],
      }));
      log('新建公告', vals.title ?? '', `状态 ${vals.status}；创建人 ${me.name}`);
      message.success('公告已创建');
    }
    setAnnounceEditing(null);
    setAnnounceFormOpen(false);
    announceForm.resetFields();
  };

  /** 复制生成草稿副本，不复制发布状态 */
  const copyAnnounce = (a: Announcement) => {
    setDb((p) => ({
      ...p,
      announcements: [{
        ...a,
        id: `AN-${Date.now()}`,
        title: `${a.title}（副本）`,
        status: 'DRAFT',
        pinned: false,
        published_at: '',
        created_by: me.name,
        created_at: now(),
      }, ...p.announcements],
    }));
    log('复制公告', a.title, '生成草稿副本，不复制发布状态');
    message.success('已生成草稿副本');
  };

  const publishAnnounce = (a: Announcement) => {
    setDb((p) => ({
      ...p,
      announcements: p.announcements.map((x) => (x.id === a.id
        ? { ...x, status: 'PUBLISHED', published_at: x.published_at || now() }
        : x)),
    }));
    log('发布公告', a.title, '即时出现在首页公告条');
    message.success('已发布，首页公告条即时生效');
  };

  /**
   * V8.4-10.07：钉钉群推送在此前是「只弹 toast + 写日志」的空操作，UI 却说「已推送到钉钉群」。
   * 浏览器端无法直连钉钉服务端（无 CORS，必须经服务端或 dws CLI 中转），因此在真正接入前，
   * 这里如实登记推送时间与留痕，不再声称已经发出去。
   */
  const pushAnnounce = (a: Announcement) => {
    log('推送公告', a.title, '登记推送（钉钉群尚未接入，未实际外发）');
    message.success('已登记推送；钉钉群尚未接入，当前仅本地留痕');
  };

  /** 下线 = 状态置 OFFLINE（软下线，记录保留） */
  const offlineAnnounce = (a: Announcement) => {
    setDb((p) => ({
      ...p,
      announcements: p.announcements.map((x) => (x.id === a.id
        ? { ...x, status: 'OFFLINE', offline_at: now() }
        : x)),
    }));
    log('下线公告', a.title, '已从首页公告条移除（记录保留）');
    message.success('已下线，首页公告条不再展示');
  };

  /** 删除一律软删并留痕（is_deleted 标记，实体不物理移除，审计日志可追溯） */
  const deleteAnnounce = (a: Announcement) => {
    modal.confirm({
      title: `删除公告「${a.title}」？`,
      content: '软删除：记录保留，首页公告条与列表不再展示，操作写入审计日志。',
      okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: () => {
        setDb((p) => ({
          ...p,
          announcements: p.announcements.map((x) => (x.id === a.id
            ? { ...x, status: 'OFFLINE', is_deleted: true, deleted_at: now(), offline_at: x.offline_at || now() }
            : x)),
        }));
        log('删除公告', a.title, 'V6.0 CR-28：软删并留痕（BD4 历史帖子不受影响）');
        message.success('已删除并留痕');
      },
    });
  };

  /* ---- V4.1：可直接安装的 Skill + 补充信息 / 附件（两者均选填） ---- */
  const skillOn = flags.caseSkillPackage !== false;
  const attachOn = flags.caseAttachment !== false;
  /** 编辑中的案例 ID；空表示新建 */
  const [editingId, setEditingId] = useState<string>('');
  const [skills, setSkills] = useState<SkillPackage[]>([]);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [skillType, setSkillType] = useState<SkillPackage['type']>('UPLOAD');
  const [skillDraft, setSkillDraft] = useState({
    name: '', version: '', note: '', url: '', file_name: '', file_size: '', skill_url: '',
  });

  /**
   * V6.0 CR-31：Skill 包与案例附件改走真实文件服务（此前「只登记文件名与体积」—— A-39 结案）。
   * zip 由服务端解包真实校验是否含 SKILL.md + manifest.yaml，不再是模拟通过。
   */
  const { beforeUpload: beforeSkillUpload, uploading: skillUploading } = useFileUpload(
    'CASE_SKILL', editingId || 'NEW-CASE',
    {
      count: skills.length,
      max: 10,
      onDone: (a) => setSkillDraft((d) => ({
        ...d, file_name: a.name, file_size: a.size, skill_url: a.url ?? '',
      })),
    },
  );
  const { beforeUpload: beforeAttachUpload, uploading: attachUploading } = useFileUpload(
    'CASE_ATTACH', editingId || 'NEW-CASE',
    { count: atts.length, max: 10, onDone: (a) => setAtts((p) => [...p, a]) },
  );

  const resetForm = () => {
    form.resetFields();
    setVisibleSubjects([]);
    setEditingId('');
    setSkills([]);
    setAtts([]);
    setSkillType('UPLOAD');
    setSkillDraft({ name: '', version: '', note: '', url: '', file_name: '', file_size: '', skill_url: '' });
  };

  /** 把草稿加入 Skill 列表（即时生效，不点保存也能看到已加的项 —— Moka P3 的「配置即时可见」） */
  const addSkill = () => {
    if (!skillDraft.name.trim()) { message.warning('请先填 Skill 名称'); return; }
    if (skillType === 'LINK' && !skillDraft.url.trim()) { message.warning('选了「下载链接」就必须填链接'); return; }
    if (skillType === 'UPLOAD' && !skillDraft.file_name) { message.warning('请先上传 Skill 压缩包'); return; }
    setSkills((p) => [...p, {
      id: `SK${Date.now()}${p.length}`,
      type: skillType,
      name: skillDraft.name.trim(),
      version: skillDraft.version.trim() || undefined,
      note: skillDraft.note.trim() || undefined,
      file_name: skillType === 'UPLOAD' ? skillDraft.file_name : undefined,
      file_size: skillType === 'UPLOAD' ? skillDraft.file_size : undefined,
      /** V6.0 CR-31：上传型 Skill 也带下载链接（走服务端代理） */
      url: skillType === 'LINK' ? skillDraft.url.trim() : (skillDraft.skill_url || undefined),
    }]);
    setSkillDraft({ name: '', version: '', note: '', url: '', file_name: '', file_size: '', skill_url: '' });
    message.success('已加入 Skill 列表');
  };

  /** 打开新建 / 编辑弹窗 */
  const openModal = (c?: CaseItem) => {
    resetForm();
    if (c) {
      setEditingId(c.id);
      form.setFieldsValue({
        title: c.title, track: c.track, level: c.level, prompt: c.prompt, tags: c.tags,
      });
      setVisibleSubjects(c.visible_subjects ?? []);
      setSkills(c.skill_packages ?? []);
      setAtts(c.attachments ?? []);
    }
    setOpen(true);
  };

  /** V4.0 CR-03：标签池（既有案例标签 ∪ 选题标签），供自由标签选择器复用 */
  const tagPool = useMemo(() => {
    const set = new Set<string>();
    db.cases.forEach((c) => c.tags.forEach((t) => set.add(t)));
    db.topics.forEach((t) => (t.tags ?? []).forEach((x) => set.add(x)));
    return [...set].sort();
  }, [db.cases, db.topics]);

  /** V4.0 CR-08 + V4.1：新建/编辑案例并落库可见范围与附加资源（保存前回读校验） */
  const createCase = async () => {
    let vals: { title?: string; track?: Track; level?: Level; prompt?: string; tags?: string[] };
    try {
      vals = await form.validateFields();
    } catch {
      message.error('请先填写必填项');
      return;
    }
    if (editingId) {
      setDb((p) => ({
        ...p,
        cases: p.cases.map((c) => (c.id === editingId ? {
          ...c,
          title: vals.title ?? c.title,
          track: vals.track ?? c.track,
          level: vals.level ?? c.level,
          prompt: vals.prompt ?? c.prompt,
          tags: vals.tags ?? c.tags,
          visible_subjects: visibleSubjects,
          skill_packages: skills,
          attachments: atts,
        } : c)),
      }));
      log('编辑案例', vals.title ?? editingId,
        `Skill ${skills.length} 个 / 附件 ${atts.length} 个 / 可见范围 ${visibleSubjects.map((s) => s.name).join('、')}`);
      message.success(`已保存「${vals.title ?? ''}」`);
      setOpen(false);
      resetForm();
      return;
    }
    const ok = commitScope(visibleSubjects, (p) => ({
      ...p,
      cases: [{
        id: `CS${Date.now()}`, track: vals.track ?? '客户赋能', title: vals.title ?? '未命名案例',
        summary: '', pain_point: '', input: '', prompt: vals.prompt ?? '', output: '',
        acceptance: [], level: vals.level ?? '骨干层', tags: vals.tags ?? [],
        author_union_id: me.union_id, author_name: me.name,
        like_count: 0, view_count: 0, reuse_count: 0, duration: '—', cover: '📘',
        status: '草稿', visible_subjects: visibleSubjects, created_at: DEMO_TODAY,
        /** V4.1：附加资源随案例一起落库，未配置即空数组（详情页不渲染空壳区块） */
        skill_packages: skills,
        attachments: atts,
      } as CaseItem, ...p.cases],
    }), '已创建草稿（四件套齐全后方可发布）');
    if (ok) {
      log('新建案例', vals.title ?? '',
        `可见范围 ${visibleSubjects.map((s) => s.name).join('、')} · Skill ${skills.length} 个 · 附件 ${atts.length} 个`);
      setOpen(false);
      resetForm();
    }
  };

  const togglePublish = (id: string, next: string) => {
    setDb((p) => ({ ...p, cases: p.cases.map((c) => (c.id === id ? { ...c, status: next as never } : c)) }));
    log(next === '已发布' ? '发布案例' : '下线案例', db.cases.find((c) => c.id === id)?.title ?? id, `状态 → ${next}`);
    message.success(`已${next === '已发布' ? '发布' : '下线'}`);
  };

  /* ============================================================
     V6.0 CR-28：案例 / 选题 / 场景卡的「复制 / 推送 / 删除」三项补齐。
     统一口径（三个 Tab 完全一致，避免各写一套）：
       ① 复制 → 生成未发布副本，不复制发布状态与互动数据；
       ② 推送 → 登记推送时间并写入审计日志（钉钉群尚未接入，不会真的外发）；
       ③ 删除 → 一律软删并留痕；已发布 / 已被引用的对象禁止直接删除，须先下线。
     ============================================================ */
  const copyCase = (c: CaseItem) => {
    setDb((p) => ({
      ...p,
      cases: [{
        ...c,
        id: `CS${Date.now()}`,
        title: `${c.title}（副本）`,
        status: '草稿',
        author_union_id: me.union_id,
        author_name: me.name,
        like_count: 0, view_count: 0, reuse_count: 0,
        created_at: DEMO_TODAY,
      }, ...p.cases],
    }));
    log('复制案例', c.title, '生成草稿副本：不复制发布状态与浏览/复用数据');
    message.success('已生成草稿副本');
  };

  const pushCase = (c: CaseItem) => {
    log('推送案例', c.title, '登记推送（钉钉群尚未接入，未实际外发）');
    message.success('已登记推送；钉钉群尚未接入，当前仅本地留痕');
  };

  /** 删除案例：已发布须先下线（避免前台仍可访问却后台已删的悬挂状态） */
  const deleteCase = (c: CaseItem) => {
    if (c.status === '已发布') {
      message.warning('该案例处于「已发布」状态，请先下线再删除');
      return;
    }
    modal.confirm({
      title: `删除案例「${c.title}」？`,
      content: '软删除：记录保留，前台列表不再展示，操作写入审计日志。',
      okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: () => {
        setDb((p) => ({
          ...p,
          cases: p.cases.map((x) => (x.id === c.id
            ? { ...x, status: '已下线', is_deleted: true, deleted_at: now() }
            : x)),
        }));
        log('删除案例', c.title, 'V6.0 CR-28：软删并留痕');
        message.success('已删除并留痕');
      },
    });
  };

  /* ---------- V6.0 CR-28：选题池 CRUD ---------- */
  const [topicEditing, setTopicEditing] = useState<Topic | null>(null);
  const [topicFormOpen, setTopicFormOpen] = useState(false);
  const [topicForm] = Form.useForm();
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);

  /** 新建传 null，编辑传原对象 */
  const openTopic = (t: Topic | null) => {
    setTopicEditing(t);
    setTopicFormOpen(true);
    topicForm.resetFields();
    topicForm.setFieldsValue(t
      ? {
        title: t.title, track: t.track, difficulty: t.difficulty, expected_output: t.expected_output,
        tags: t.tags ?? [], select_limit: t.select_limit ?? 0, status: t.status, visibility: t.visibility ?? 'PUBLIC',
      }
      : {
        title: '', track: '客户赋能', difficulty: '中', expected_output: '',
        tags: [], select_limit: 0, status: '可选', visibility: 'PUBLIC',
      });
  };

  const saveTopic = async () => {
    let vals: {
      title?: string; track?: Track; difficulty?: Topic['difficulty']; expected_output?: string;
      tags?: string[]; select_limit?: number; status?: Topic['status']; visibility?: 'PRIVATE' | 'PUBLIC';
    };
    try {
      vals = await topicForm.validateFields();
    } catch {
      message.error('请填写选题名称与产出要求');
      return;
    }
    const editing = topicEditing;
    if (editing) {
      setDb((p) => ({
        ...p,
        topics: p.topics.map((t) => (t.id === editing.id ? {
          ...t,
          title: vals.title ?? t.title,
          track: vals.track ?? t.track,
          difficulty: vals.difficulty ?? t.difficulty,
          expected_output: vals.expected_output ?? t.expected_output,
          tags: vals.tags ?? t.tags,
          select_limit: vals.select_limit ?? t.select_limit,
          status: vals.status ?? t.status,
          visibility: vals.visibility ?? t.visibility,
        } : t)),
      }));
      log('编辑选题', vals.title ?? editing.title, `状态 ${vals.status} · 可见性 ${vals.visibility}`);
      message.success('选题已保存');
    } else {
      setDb((p) => ({
        ...p,
        topics: [{
          id: `TP${Date.now()}`,
          case_id: '',
          title: vals.title ?? '',
          difficulty: vals.difficulty ?? '中',
          expected_output: vals.expected_output ?? '',
          suggest_level: '骨干层',
          track: vals.track ?? '客户赋能',
          status: vals.status ?? '可选',
          tags: vals.tags ?? [],
          select_limit: vals.select_limit ?? 0,
          visibility: vals.visibility ?? 'PUBLIC',
          created_by: me.name,
        }, ...p.topics],
      }));
      log('新建选题', vals.title ?? '', `赛道 ${vals.track} · 可见性 ${vals.visibility}`);
      message.success('选题已创建');
    }
    setTopicEditing(null);
    setTopicFormOpen(false);
    topicForm.resetFields();
  };

  /** 复制选题：生成「已关闭」副本（= 未开放草稿态），不复制被选记录 */
  const copyTopic = (t: Topic) => {
    setDb((p) => ({
      ...p,
      topics: [{ ...t, id: `TP${Date.now()}`, title: `${t.title}（副本）`, status: '已关闭', picked_by: undefined }, ...p.topics],
    }));
    log('复制选题', t.title, '生成未开放副本，确认无误后自行开放');
    message.success('已生成未开放副本');
  };

  const pushTopic = (t: Topic) => {
    log('推送选题', t.title, '登记推送（钉钉群尚未接入，未实际外发）');
    message.success('已登记推送；钉钉群尚未接入，当前仅本地留痕');
  };

  /** 删除选题：已被选中的选题禁止直接删除（有引用），仅可关闭 —— 与资产 / 商品 / 评分卡同一口径 */
  const deleteTopic = (t: Topic) => {
    const used = db.topicSelections.filter((s) => s.topic_id === t.id).length;
    if (used > 0) {
      message.warning(`已有 ${used} 人选中该选题，禁止删除；请先关闭`);
      return;
    }
    modal.confirm({
      title: `删除选题「${t.title}」？`,
      content: '软删除：记录保留，选题池不再展示，操作写入审计日志。',
      okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: () => {
        setDb((p) => ({
          ...p,
          topics: p.topics.map((x) => (x.id === t.id
            ? { ...x, status: '已关闭', is_deleted: true, deleted_at: now() }
            : x)),
        }));
        log('删除选题', t.title, 'V6.0 CR-28：软删并留痕');
        message.success('已删除并留痕');
      },
    });
  };

  /** V6.0 CR-17 + CR-28：私有自定义选题的批量公开 / 收回（组织者一键放通进公共选题池） */
  const batchVisibility = (next: 'PUBLIC' | 'PRIVATE') => {
    if (selectedTopicIds.length === 0) { message.warning('请先勾选选题'); return; }
    setDb((p) => ({
      ...p,
      topics: p.topics.map((t) => (selectedTopicIds.includes(t.id) ? { ...t, visibility: next } : t)),
    }));
    log(next === 'PUBLIC' ? '批量公开选题' : '批量收回选题',
      `${selectedTopicIds.length} 条`, next === 'PUBLIC' ? '进入公共选题池' : '仅本人与组织者可见');
    message.success(`已${next === 'PUBLIC' ? '公开' : '收回'} ${selectedTopicIds.length} 条选题`);
    setSelectedTopicIds([]);
  };

  /* ---------- V6.0 CR-28：每周场景卡 CRUD（此前由 cases.slice(0,8) 派生，无实体） ---------- */
  const [sceneEditing, setSceneEditing] = useState<SceneCard | null>(null);
  const [sceneFormOpen, setSceneFormOpen] = useState(false);
  const [sceneForm] = Form.useForm();

  const openScene = (s: SceneCard | null) => {
    setSceneEditing(s);
    setSceneFormOpen(true);
    sceneForm.resetFields();
    sceneForm.setFieldsValue(s
      ? {
        title: s.title, summary: s.summary, content: s.content, track: s.track,
        emoji: s.emoji, tags: s.tags ?? [], week: s.week, status: s.status,
        /** V8.2-10.07：场景卡可关联案例，首页胶囊点击直达案例详情 */
        source_case_id: s.source_case_id ?? undefined,
      }
      : {
        title: '', summary: '', content: '', track: '客户赋能', emoji: '💡',
        tags: [], week: '', status: 'DRAFT', source_case_id: undefined,
      });
  };

  const saveScene = async () => {
    let vals: {
      title?: string; summary?: string; content?: string; track?: Track; emoji?: string;
      tags?: string[]; week?: string; status?: SceneCard['status']; source_case_id?: string;
    };
    try {
      vals = await sceneForm.validateFields();
    } catch {
      message.error('请填写标题、一句话知识点与正文');
      return;
    }
    const at = now();
    const editing = sceneEditing;
    if (editing) {
      setDb((p) => ({
        ...p,
        sceneCards: p.sceneCards.map((s) => (s.id === editing.id ? {
          ...s,
          title: vals.title ?? s.title,
          summary: vals.summary ?? s.summary,
          content: vals.content ?? s.content,
          track: vals.track ?? s.track,
          emoji: vals.emoji ?? s.emoji,
          tags: vals.tags ?? s.tags,
          week: vals.week ?? s.week,
          status: vals.status ?? s.status,
          published_at: vals.status === 'PUBLISHED' && !s.published_at ? at : s.published_at,
          source_case_id: vals.source_case_id || undefined,
        } : s)),
      }));
      log('编辑场景卡', vals.title ?? editing.title, `状态 ${vals.status}`);
      message.success('场景卡已保存');
    } else {
      setDb((p) => ({
        ...p,
        sceneCards: [{
          id: `SC${Date.now()}`,
          title: vals.title ?? '',
          summary: vals.summary ?? '',
          content: vals.content ?? '',
          track: vals.track ?? '客户赋能',
          emoji: vals.emoji || '💡',
          status: vals.status ?? 'DRAFT',
          tags: vals.tags ?? [],
          week: vals.week || '',
          view_count: 0,
          published_at: vals.status === 'PUBLISHED' ? at : '',
          created_by: me.name,
          created_at: at,
          source_case_id: vals.source_case_id || undefined,
        }, ...p.sceneCards],
      }));
      log('新建场景卡', vals.title ?? '', `状态 ${vals.status} · 创建人 ${me.name}`);
      message.success('场景卡已创建');
    }
    setSceneEditing(null);
    setSceneFormOpen(false);
    sceneForm.resetFields();
  };

  const copyScene = (s: SceneCard) => {
    setDb((p) => ({
      ...p,
      sceneCards: [{
        ...s, id: `SC${Date.now()}`, title: `${s.title}（副本）`, status: 'DRAFT',
        view_count: 0, published_at: '', pushed_at: undefined, created_by: me.name, created_at: now(),
      }, ...p.sceneCards],
    }));
    log('复制场景卡', s.title, '生成草稿副本，不复制发布状态与阅读数');
    message.success('已生成草稿副本');
  };

  const pushScene = (s: SceneCard) => {
    if (s.status !== 'PUBLISHED') { message.warning('仅已发布的场景卡可推送'); return; }
    setDb((p) => ({
      ...p,
      sceneCards: p.sceneCards.map((x) => (x.id === s.id ? { ...x, pushed_at: now() } : x)),
    }));
    log('推送场景卡', s.title, '登记推送（钉钉群尚未接入，未实际外发）');
    message.success('已登记推送；钉钉群尚未接入，当前仅本地留痕');
  };

  const setSceneStatus = (s: SceneCard, next: SceneCard['status']) => {
    setDb((p) => ({
      ...p,
      sceneCards: p.sceneCards.map((x) => (x.id === s.id ? {
        ...x, status: next,
        published_at: next === 'PUBLISHED' ? (x.published_at || now()) : x.published_at,
        offline_at: next === 'OFFLINE' ? now() : x.offline_at,
      } : x)),
    }));
    log(next === 'PUBLISHED' ? '发布场景卡' : '下线场景卡', s.title, `状态 → ${next}`);
    message.success(next === 'PUBLISHED' ? '已发布，首页场景卡即时生效' : '已下线，首页不再展示');
  };

  const deleteScene = (s: SceneCard) => {
    if (s.status === 'PUBLISHED') { message.warning('该场景卡处于「已发布」状态，请先下线再删除'); return; }
    modal.confirm({
      title: `删除场景卡「${s.title}」？`,
      content: '软删除：记录保留，首页与列表不再展示，操作写入审计日志。',
      okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: () => {
        setDb((p) => ({
          ...p,
          sceneCards: p.sceneCards.map((x) => (x.id === s.id
            ? { ...x, status: 'OFFLINE', is_deleted: true, deleted_at: now() }
            : x)),
        }));
        log('删除场景卡', s.title, 'V6.0 CR-28：软删并留痕');
        message.success('已删除并留痕');
      },
    });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="内容管理" desc="案例、选题、素材的统一维护" />
      <Alert type="success" showIcon message="所有删除为软删除并留痕；涉及评分与积分的变更必须二次确认并写入审计日志。" />

      <Card>
        <Tabs
          items={[
            {
              key: 'cases', label: `案例（${db.cases.filter((c) => !c.is_deleted).length}）`,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新建案例</Button>
                    <Button onClick={() => { log('复制上届内容', '案例 + 选题 + 规则配置', '届次复制'); message.success('已复制上届案例与选题（配置驱动，减少重复配置）'); }}>复制上届内容</Button>
                  </Space>
                  <Table
                    size="small" rowKey="id" pagination={{ pageSize: 8 }}
                    dataSource={db.cases.filter((c) => !c.is_deleted)}
                    columns={[
                      { title: '标题', dataIndex: 'title' },
                      { title: '赛道', dataIndex: 'track', render: (v: string) => <Tag color={TRACK_COLOR[v]} style={{ border: 'none' }}>{v}</Tag> },
                      {
                        title: '标签', dataIndex: 'tags', width: 180,
                        render: (v: string[]) => ((v?.length ?? 0) === 0
                          ? <Tag>未分类</Tag>
                          : <Space size={4} wrap>{v.map((t) => <Tag key={t} color="orange" style={{ marginInlineEnd: 0 }}>#{t}</Tag>)}</Space>),
                      },
                      { title: '作者', dataIndex: 'author_name', width: 90 },
                      {
                        title: '可见范围', width: 150,
                        render: (_, r) => (r.visible_subjects?.length
                          ? <ScopeText value={r.visible_subjects} />
                          : <Tag>全员（默认）</Tag>),
                      },
                      /* V4.1：列表层直接暴露「挂了几个 Skill / 附件」。
                         两个开关同时关闭时整列不渲染 —— 守「关 ≡ V4.0」 */
                      ...(skillOn || attachOn ? [{
                        title: '随附资源', width: 120,
                        render: (_: unknown, r: CaseItem) => {
                          const sn = skillOn ? (r.skill_packages?.length ?? 0) : 0;
                          const an = attachOn ? (r.attachments?.length ?? 0) : 0;
                          if (sn === 0 && an === 0) return <span style={{ color: COLOR.textMuted, fontSize: 12 }}>—</span>;
                          return (
                            <Space size={4}>
                              {sn > 0 && (
                                <Tooltip title={`${(r.skill_packages ?? []).map((s) => s.name).join('、')}`}>
                                  <span style={{
                                    fontSize: 11, fontWeight: 600, color: '#C2410C', background: '#FFF1EB',
                                    padding: '2px 8px', borderRadius: 6,
                                  }}>🧩 {sn}</span>
                                </Tooltip>
                              )}
                              {an > 0 && (
                                <Tooltip title={`${(r.attachments ?? []).map((a) => a.name).join('、')}`}>
                                  <span style={{
                                    fontSize: 11, fontWeight: 600, color: '#1D4ED8', background: '#EFF6FF',
                                    padding: '2px 8px', borderRadius: 6,
                                  }}>📎 {an}</span>
                                </Tooltip>
                              )}
                            </Space>
                          );
                        },
                      }] : []),
                      { title: '浏览', dataIndex: 'view_count', width: 80, render: (v: number) => <span className="num">{v}</span> },
                      { title: '复用', dataIndex: 'reuse_count', width: 80, render: (v: number) => <span className="num">{v}</span> },
                      {
                        title: '状态', dataIndex: 'status', width: 90,
                        render: (v: string) => <Tag color={v === '已发布' ? 'green' : 'default'}>{v}</Tag>,
                      },
                      {
                        title: '操作', width: 260,
                        render: (_, r) => (
                          <Space size={4} wrap>
                            <Button size="small" type="link" onClick={() => togglePublish(r.id, r.status === '已发布' ? '已下线' : '已发布')}>
                              {r.status === '已发布' ? '下线' : '发布'}
                            </Button>
                            {/* V4.1：编辑从「只弹提示」升级为真弹窗，才能补挂 Skill 与附件 */}
                            <Button size="small" type="link" onClick={() => openModal(r)}>编辑</Button>
                            {/* V6.0 CR-28：复制 / 推送 / 删除三项补齐 */}
                            <Button size="small" type="link" onClick={() => copyCase(r)}>复制</Button>
                            <Button size="small" type="link" onClick={() => pushCase(r)}>推送</Button>
                            <Button size="small" type="link" danger onClick={() => deleteCase(r)}>删除</Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'topics', label: `选题池（${db.topics.filter((t) => !t.is_deleted).length}）`,
              children: (
                <>
                  {fullCrudOn && (
                    <Space wrap style={{ marginBottom: 12 }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => openTopic(null)}>新建选题</Button>
                      <Button
                        disabled={selectedTopicIds.length === 0}
                        onClick={() => batchVisibility('PUBLIC')}
                      >批量公开{selectedTopicIds.length > 0 ? `（${selectedTopicIds.length}）` : ''}</Button>
                      <Button
                        disabled={selectedTopicIds.length === 0}
                        onClick={() => batchVisibility('PRIVATE')}
                      >批量收回{selectedTopicIds.length > 0 ? `（${selectedTopicIds.length}）` : ''}</Button>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        自定义选题默认私有；公开后进入公共选题池，可随时收回
                      </Typography.Text>
                    </Space>
                  )}
                  <Table
                  size="small" rowKey="id" pagination={{ pageSize: 8 }}
                  dataSource={db.topics.filter((t) => !t.is_deleted)}
                  rowSelection={fullCrudOn ? {
                    selectedRowKeys: selectedTopicIds,
                    onChange: (keys) => setSelectedTopicIds(keys as string[]),
                  } : undefined}
                  columns={[
                    { title: '选题', dataIndex: 'title' },
                    { title: '赛道', dataIndex: 'track', render: (v: string) => <Tag color={TRACK_COLOR[v]} style={{ border: 'none' }}>{v}</Tag> },
                    {
                      title: '标签', dataIndex: 'tags', width: 180,
                      render: (v: string[] | undefined) => ((v?.length ?? 0) === 0
                        ? <Tag>未分类</Tag>
                        : <Space size={4} wrap>{(v ?? []).map((t) => <Tag key={t} color="orange" style={{ marginInlineEnd: 0 }}>#{t}</Tag>)}</Space>),
                    },
                    { title: '难度', dataIndex: 'difficulty', width: 70 },
                    {
                      title: '已选人数', width: 100,
                      render: (_, r) => {
                        const n = db.topicSelections.filter((s) => s.topic_id === r.id).length;
                        const limit = r.select_limit ?? 0;
                        return <span className="num">{n}{limit > 0 ? ` / ${limit}` : '（不限）'}</span>;
                      },
                    },
                    { title: '产出要求', dataIndex: 'expected_output', ellipsis: true },
                    {
                      title: '状态', dataIndex: 'status', width: 90,
                      render: (v: string) => <Tag color={v === '已被选' ? 'blue' : v === '已关闭' ? 'default' : 'orange'}>{v}</Tag>,
                    },
                    {
                      /* V6.0 CR-17：自定义选题默认私有，组织者可公开 */
                      title: '可见性', dataIndex: 'visibility', width: 100,
                      render: (_, r) => (r.visibility === 'PRIVATE'
                        ? <Tag color="red">私有</Tag>
                        : <Tag color="green">公开</Tag>),
                    },
                    {
                      title: '操作', width: 260,
                      render: (_, r) => (fullCrudOn
                        ? (
                          <Space size={4} wrap>
                            <Button size="small" type="link" onClick={() => {
                              setDb((p) => ({ ...p, topics: p.topics.map((t) => (t.id === r.id ? { ...t, status: t.status === '可选' ? '已关闭' : '可选' } : t)) }));
                              log(r.status === '可选' ? '关闭选题' : '开放选题', r.title, `状态 → ${r.status === '可选' ? '已关闭' : '可选'}`);
                              message.success('状态已更新');
                            }}>{r.status === '可选' ? '关闭' : '开放'}</Button>
                            <Button size="small" type="link" onClick={() => openTopic(r)}>编辑</Button>
                            <Button size="small" type="link" onClick={() => copyTopic(r)}>复制</Button>
                            <Button size="small" type="link" onClick={() => pushTopic(r)}>推送</Button>
                            <Button size="small" type="link" danger onClick={() => deleteTopic(r)}>删除</Button>
                          </Space>
                        )
                        : <Typography.Text type="secondary" style={{ fontSize: 12 }}>只读</Typography.Text>),
                    },
                  ]}
                  />
                </>
              ),
            },
            {
              /* V6.0 CR-28：场景卡由 cases.slice(0,8) 派生改为独立实体 sceneCards（此前无法新建 / 下线 / 删除） */
              key: 'cards', label: `每周场景卡（${db.sceneCards.filter((s) => !s.is_deleted).length}）`,
              children: (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Space wrap>
                    {fullCrudOn && (
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => openScene(null)}>新建场景卡</Button>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      每周高频场景卡（30 秒学一个知识点）：首页胶囊卡片流展示，支持历史回看
                    </Typography.Text>
                  </Space>
                  {db.sceneCards.filter((s) => !s.is_deleted).map((c) => (
                    <Card key={c.id} size="small">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <Space wrap>
                          <span style={{ fontSize: 20 }}>{c.emoji}</span>
                          <b>{c.title}</b>
                          <Tag color={TRACK_COLOR[c.track]} style={{ border: 'none' }}>{c.track}</Tag>
                          <Tag color={c.status === 'PUBLISHED' ? 'green' : c.status === 'DRAFT' ? 'gold' : 'default'}>{c.status}</Tag>
                          {c.week && <Tag>{c.week}</Tag>}
                          {c.source_case_id && (
                            <Link to={`/cases/${c.source_case_id}`} style={{ fontSize: 12 }}>
                              <LinkOutlined /> 案例：{(db.cases ?? []).find((x) => x.id === c.source_case_id)?.title ?? c.source_case_id}
                            </Link>
                          )}
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.summary}</Typography.Text>
                        </Space>
                        <Space wrap size={4}>
                          <Tag>阅读 {c.view_count}</Tag>
                          {c.pushed_at && <Tag color="blue">已登记推送 {c.pushed_at}</Tag>}
                          {fullCrudOn ? (
                            <>
                              <Button
                                size="small" type="link"
                                onClick={() => setSceneStatus(c, c.status === 'PUBLISHED' ? 'OFFLINE' : 'PUBLISHED')}
                              >{c.status === 'PUBLISHED' ? '下线' : '发布'}</Button>
                              <Button size="small" type="link" onClick={() => openScene(c)}>编辑</Button>
                              <Button size="small" type="link" onClick={() => copyScene(c)}>复制</Button>
                              <Button size="small" type="link" onClick={() => pushScene(c)}>推送</Button>
                              <Button size="small" type="link" danger onClick={() => deleteScene(c)}>删除</Button>
                            </>
                          ) : <Typography.Text type="secondary" style={{ fontSize: 12 }}>只读</Typography.Text>}
                        </Space>
                      </div>
                    </Card>
                  ))}
                  {db.sceneCards.filter((s) => !s.is_deleted).length === 0 && (
                    <Empty description="还没有场景卡" />
                  )}
                </Space>
              ),
            },
            {
              /* V6.0 CR-28：公告读写新实体 announcement（不再借用 BD4 帖子；历史帖子保留不删） */
              key: 'notice', label: `公告（${db.announcements.filter((a) => a.status !== 'OFFLINE' && !a.is_deleted).length}）`,
              children: (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {fullCrudOn && (
                    <Space wrap>
                      <Button type="primary" onClick={() => openAnnounce(null)}>新建公告</Button>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        发布后即时出现在首页公告条；勾选置顶则排在轮播首位
                      </Typography.Text>
                    </Space>
                  )}
                  <Table
                    size="small" rowKey="id" pagination={false}
                    dataSource={db.announcements.filter((a) => a.status !== 'OFFLINE' && !a.is_deleted)}
                    columns={[
                      { title: '标题', dataIndex: 'title' },
                      {
                        title: '状态', dataIndex: 'status', width: 100,
                        render: (v: Announcement['status']) => (
                          <Tag color={v === 'PUBLISHED' ? 'green' : v === 'DRAFT' ? 'gold' : 'default'}>{v}</Tag>
                        ),
                      },
                      {
                        title: '置顶', dataIndex: 'pinned', width: 70,
                        render: (v: boolean) => (v ? <Tag color="orange">置顶</Tag> : '—'),
                      },
                      {
                        title: '来源', width: 110,
                        render: (_, r) => (r.source_post_id
                          ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>迁移自帖子</Typography.Text>
                          : <Tag>新建</Tag>),
                      },
                      { title: '发布时间', dataIndex: 'published_at', width: 150 },
                      {
                        title: '操作', width: 240,
                        render: (_, r) => (fullCrudOn
                          ? (
                            <Space size={4} wrap>
                              <Button size="small" type="link" onClick={() => openAnnounce(r)}>编辑</Button>
                              <Button size="small" type="link" onClick={() => copyAnnounce(r)}>复制</Button>
                              {r.status === 'PUBLISHED' ? (
                                <Button size="small" type="link" onClick={() => pushAnnounce(r)}>推送</Button>
                              ) : (
                                <Button size="small" type="link" onClick={() => publishAnnounce(r)}>发布</Button>
                              )}
                              {r.status === 'PUBLISHED' && (
                                <Button size="small" type="link" onClick={() => offlineAnnounce(r)}>下线</Button>
                              )}
                              <Button size="small" type="link" danger onClick={() => deleteAnnounce(r)}>删除</Button>
                            </Space>
                          )
                          : <Typography.Text type="secondary" style={{ fontSize: 12 }}>只读</Typography.Text>),
                      },
                    ]}
                  />
                  {!fullCrudOn && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      公告的「新建 / 编辑 / 复制 / 推送 / 下线 / 删除」由开关 contentFullCrud 控制（关闭 ≡ V5.0 只读）。
                    </Typography.Text>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={open}
        title={editingId ? '编辑案例' : '新建案例'}
        width={760}
        onCancel={() => { setOpen(false); resetForm(); }}
        onOk={createCase}
        /* V4.1 修复：可见范围「必选」只约束新建。历史案例的 visible_subjects 缺省为空（=全员可见），
           若对编辑也强制必选，任何老案例都会因按钮 disabled 而无法保存 —— 编辑不动范围＝保持原状，是安全的。 */
        okText={editingId ? '保存' : (visibleSubjects.length === 0 ? '请先选择可见范围' : '创建')}
        okButtonProps={{ disabled: !editingId && visibleSubjects.length === 0 }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="track" label="赛道"><Select options={['客户赋能', '团队提效', '销售提效'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          {/* V4.0 CR-03：去分层，改由发布者自选标签（支持回车创建自定义标签） */}
          <Form.Item name="tags" label="标签（可自由创建）">
            <Select
              mode="tags" placeholder="输入后回车即可创建新标签"
              options={tagPool.map((t) => ({ value: t, label: `#${t}` }))}
            />
          </Form.Item>
          {/* level 字段保留落库（历史数据兼容），但不再作为受众分层展示入口 */}
          <Form.Item name="level" label="建议层级（已废弃，仅历史兼容）"><Select options={['干部层', '骨干层'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="prompt" label="可直接抄的提示词"><Input.TextArea rows={4} /></Form.Item>

          {/* ============================================================
              V4.1 新增①：可直接安装的 Skill（选填）
              三种承载方式：上传压缩包 / 填下载链接 / 文字说明，可并存多个
              ============================================================ */}
          {skillOn && (
            <>
              <Divider plain orientation="left" style={{ fontSize: 13, margin: '4px 0 12px' }}>
                可直接安装的 Skill（选填）
              </Divider>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 10 }}>
                提示词之外再给一条路：让人装上就能跑，不用从零写。
              </Typography.Paragraph>
              <Segmented
                value={skillType}
                onChange={(v) => setSkillType(String(v) as SkillPackage['type'])}
                options={[
                  { label: '上传压缩包', value: 'UPLOAD' },
                  { label: '填下载链接', value: 'LINK' },
                ]}
                style={{ marginBottom: 12 }}
              />
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Space wrap size={10} style={{ width: '100%' }}>
                  <Input
                    placeholder="Skill 名称" style={{ width: 220 }} value={skillDraft.name}
                    onChange={(e) => setSkillDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                  <Input
                    placeholder="版本（选填，如 v1.2.0）" style={{ width: 170 }} value={skillDraft.version}
                    onChange={(e) => setSkillDraft((d) => ({ ...d, version: e.target.value }))}
                  />
                  {skillType === 'UPLOAD' ? (
                    /* V6.0 CR-31：真实上传；zip 由服务端解包校验 SKILL.md + manifest.yaml */
                    <Upload
                      accept=".zip,.rar,.7z,.skill"
                      showUploadList={false}
                      beforeUpload={beforeSkillUpload}
                    >
                      <Button icon={<UploadOutlined />} loading={skillUploading > 0}>
                        {skillDraft.file_name || '选择 Skill 压缩包'}
                      </Button>
                    </Upload>
                  ) : (
                    <Input
                      placeholder="下载链接 https://…" style={{ width: 260 }} value={skillDraft.url}
                      onChange={(e) => setSkillDraft((d) => ({ ...d, url: e.target.value }))}
                    />
                  )}
                </Space>
                <Input.TextArea
                  rows={2} placeholder="安装步骤 / 用法说明（选填，写清「装完第一步干什么」最有用）"
                  value={skillDraft.note}
                  onChange={(e) => setSkillDraft((d) => ({ ...d, note: e.target.value }))}
                />
                <Button icon={<PlusOutlined />} onClick={addSkill}>加入 Skill 列表</Button>
              </Space>

              <div style={{ marginTop: 12 }}>
                {skills.length === 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    还没有挂 Skill —— 不挂也能发布，只是别人只能抄提示词。
                  </Typography.Text>
                ) : (
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {skills.map((s) => (
                      <SkillCard
                        key={s.id} item={s}
                        onAct={(t) => message.info(t)}
                        onRemove={(id) => setSkills((p) => p.filter((x) => x.id !== id))}
                      />
                    ))}
                  </Space>
                )}
              </div>
            </>
          )}

          {/* ============================================================
              V4.1 新增②：补充信息 / 附件（非必填，各类型文件均可）
              ============================================================ */}
          {attachOn && (
            <>
              <Divider plain orientation="left" style={{ fontSize: 13, margin: '16px 0 12px' }}>
                补充信息 / 附件（选填）
              </Divider>
              <Upload.Dragger
                multiple
                showUploadList={false}
                /* V6.0 CR-31：真实上传（此前只登记文件名，无法下载） */
                beforeUpload={beforeAttachUpload}
                style={{ padding: '12px 0' }}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: COLOR.primary }} /></p>
                <p style={{ fontSize: 13, marginBottom: 4 }}>点这里或把文件拖进来</p>
                <p style={{ fontSize: 12, color: COLOR.textMuted }}>
                  非必填 · 支持任意类型（xlsx / docx / pdf / zip / 图片 …）
                </p>
              </Upload.Dragger>
              {atts.length > 0 && (
                <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
                  {atts.map((a) => (
                    <AttachCard
                      key={a.id} item={a}
                      onAct={(t) => message.info(t)}
                      onRemove={(id) => setAtts((p) => p.filter((x) => x.id !== id))}
                    />
                  ))}
                </Space>
              )}
              {atts.length === 0 && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  模板、样例数据、参考文档都可以挂 —— 没有就算了，不影响发布。
                </Typography.Text>
              )}
            </>
          )}

          <Divider plain orientation="left" style={{ fontSize: 13, margin: '16px 0 12px' }}>可见范围</Divider>
          <Form.Item label="可见范围" required={!editingId} style={{ marginBottom: 8 }}>
            <ScopePicker value={visibleSubjects} onChange={setVisibleSubjects} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {editingId
              ? (visibleSubjects.length === 0
                ? '当前为「全员可见」（历史案例默认口径）。不改范围可留空直接保存；要收窄就选部门或人员。'
                : '改完范围保存即刻生效。留空则回到「全员可见」。')
              : '必填：不选就发布等于全员可见，请显式指定部门或人员。'}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            四件套（输入 / 提示词 / 产出物 / 验收标准）缺一不可发布；层级只可上调不可下调。
          </Typography.Text>
        </Form>
      </Modal>

      {/* ============================================================
          V6.0 CR-28：公告新建 / 编辑弹窗（读写 announcement 实体）
          此前公告编辑为占位 toast，且数据源借用社区 BD4 帖子 —— 无实体无编辑
          ============================================================ */}
      <Modal
        open={announceEditing !== null || announceFormOpen}
        title={announceEditing ? '编辑公告' : '新建公告'}
        width={640}
        onCancel={() => { setAnnounceEditing(null); setAnnounceFormOpen(false); announceForm.resetFields(); }}
        onOk={saveAnnounce}
        okText="保存"
      >
        <Form form={announceForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写公告标题' }, { max: 60, message: '不超过 60 字' }]}>
            <Input placeholder="一句话说清「什么事、什么时候、谁要注意」" />
          </Form.Item>
          <Form.Item name="content" label="正文" rules={[{ required: true, message: '请填写公告正文' }]}>
            <Input.TextArea rows={5} placeholder="正文将出现在公告详情；首页公告条只轮转标题" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Radio.Group
              optionType="button" buttonStyle="solid"
              options={[
                { value: 'DRAFT', label: '草稿' },
                { value: 'PUBLISHED', label: '已发布' },
                { value: 'OFFLINE', label: '已下线' },
              ]}
            />
          </Form.Item>
          <Form.Item name="pinned" label="置顶" valuePropName="checked">
            <Radio.Group
              optionType="button"
              options={[{ value: true, label: '置顶（轮播首位）' }, { value: false, label: '不置顶' }]}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            仅「已发布」状态的公告会出现在首页公告条；置顶公告排在轮播首位。
          </Typography.Text>
        </Form>
      </Modal>

      {/* V6.0 CR-28：选题新建 / 编辑弹窗 */}
      <Modal
        open={topicEditing !== null || topicFormOpen}
        title={topicEditing ? '编辑选题' : '新建选题'}
        width={640}
        onCancel={() => { setTopicEditing(null); setTopicFormOpen(false); topicForm.resetFields(); }}
        onOk={saveTopic}
        okText="保存"
      >
        <Form form={topicForm} layout="vertical">
          <Form.Item name="title" label="选题名称" rules={[{ required: true, message: '请填写选题名称' }]}>
            <Input placeholder="例：用 WorkBuddy 把月度经营分析从 3 天压到 4 小时" />
          </Form.Item>
          <Form.Item name="track" label="赛道">
            <Select options={['客户赋能', '团队提效', '销售提效'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="difficulty" label="难度">
            <Radio.Group optionType="button" options={['易', '中', '难'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="expected_output" label="产出要求" rules={[{ required: true, message: '请填写产出要求' }]}>
            <Input.TextArea rows={3} placeholder="说清最终要交出什么，参选人才能对齐预期" />
          </Form.Item>
          <Form.Item name="tags" label="标签（可自由创建）">
            <Select mode="tags" placeholder="输入后回车即可创建新标签" options={tagPool.map((t) => ({ value: t, label: `#${t}` }))} />
          </Form.Item>
          <Form.Item name="select_limit" label="可选人数上限（0=不限）">
            <InputNumber min={0} max={999} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Radio.Group
              optionType="button"
              options={['可选', '已被选', '已关闭'].map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item name="visibility" label="可见性">
            <Radio.Group
              optionType="button"
              options={[
                { value: 'PUBLIC', label: '公开（进入公共选题池）' },
                { value: 'PRIVATE', label: '私有（仅创建人与组织者可见）' },
              ]}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            自定义选题建议先设为私有，确认无敏感信息后再批量公开。
          </Typography.Text>
        </Form>
      </Modal>

      {/* V6.0 CR-28：每周场景卡新建 / 编辑弹窗（此前场景卡由案例派生，无编辑入口） */}
      <Modal
        open={sceneEditing !== null || sceneFormOpen}
        title={sceneEditing ? '编辑场景卡' : '新建场景卡'}
        width={640}
        onCancel={() => { setSceneEditing(null); setSceneFormOpen(false); sceneForm.resetFields(); }}
        onOk={saveScene}
        okText="保存"
      >
        <Form form={sceneForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写场景卡标题' }, { max: 40, message: '不超过 40 字' }]}>
            <Input placeholder="例：一句话让 AI 帮你写周报" />
          </Form.Item>
          <Form.Item name="summary" label="一句话知识点" rules={[{ required: true, message: '请填写一句话知识点' }, { max: 60, message: '不超过 60 字' }]}>
            <Input placeholder="30 秒能记住的那句话" />
          </Form.Item>
          <Form.Item name="content" label="正文" rules={[{ required: true, message: '请填写正文' }, { max: 300, message: '不超过 300 字（30 秒可读完）' }]}>
            <Input.TextArea rows={5} placeholder="场景 → 怎么抄 → 抄完能看到什么" />
          </Form.Item>
          <Form.Item name="track" label="赛道">
            <Select options={['客户赋能', '团队提效', '销售提效'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="emoji" label="图标">
            <Input style={{ width: 120 }} maxLength={4} placeholder="💡" />
          </Form.Item>
          <Form.Item name="week" label="归属周次">
            <Input style={{ width: 180 }} placeholder="2026-W40" />
          </Form.Item>
          {/* V8.2-10.07：场景卡关联案例 —— 首页胶囊点击直达案例详情，不再只是「迁移自案例」的只读信息 */}
          <Form.Item
            name="source_case_id"
            label="关联案例"
            extra="关联后，首页点击这张卡会直接打开案例详情（留空则跳案例列表）"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="选择这张卡对应的完整案例"
              options={(db.cases ?? []).filter((x) => !x.is_deleted).map((x) => ({
                value: x.id, label: `${x.id} · ${x.title}（${x.author_name ?? '—'}）`,
              }))}
            />
          </Form.Item>
          <Form.Item name="tags" label="标签（可自由创建）">
            <Select mode="tags" placeholder="输入后回车即可创建新标签" options={tagPool.map((t) => ({ value: t, label: `#${t}` }))} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Radio.Group
              optionType="button" buttonStyle="solid"
              options={[
                { value: 'DRAFT', label: '草稿' },
                { value: 'PUBLISHED', label: '已发布' },
                { value: 'OFFLINE', label: '已下线' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
