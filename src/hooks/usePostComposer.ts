/**
 * 社区发帖编辑器逻辑（P3-4 抽取，供 CommunityV2 使用）
 *
 * 抽取原则（沿用 P3-3 范式）：从 v1 pages/c/Community.tsx **原样搬移**，业务逻辑一字不改；
 * v1 保留其内联副本、一行未动，以此保证「不动业务代码」红线。
 *
 * 覆盖范围：
 *   ①草稿键按 unionId 隔离、打开发帖框时探测草稿
 *   ②1200ms 防抖自动保存（仅本地 localStorage，不入库、不占服务端存储）
 *   ③恢复 / 清除草稿
 *   ④极简富文本工具条：向光标处插入 Markdown 标记（不做真实所见即所得）
 *   ⑤发帖校验（标题 ≥4 字、正文 ≥10 字）+ 写库（posts / pointRecords）+ log
 */
import { useEffect, useState } from 'react';
import { App as AntApp } from 'antd';
import { DEMO_TODAY } from '@/mock/seedBiz';
import type { ScopeSubject } from '@/mock/types';

export interface PostDraft {
  title?: string;
  content?: string;
  tags?: string[];
  anon?: boolean;
  boardId?: string;
  savedAt?: string;
}

export function usePostComposer(
  unionId: string,
  opts: {
    enabled: boolean;
    publish: (payload: { title: string; content: string; tags: string[]; anon: boolean; boardId: string; subjects: ScopeSubject[]; files: string[] }) => void;
  }
) {
  const { message } = AntApp.useApp();
  const DRAFT_KEY = `wb-community-draft-${unionId}`;
  const v2 = opts.enabled;

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [anon, setAnon] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [boardId, setBoardId] = useState('');
  const [subjects, setSubjects] = useState<ScopeSubject[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [draftAt, setDraftAt] = useState('');
  const [draftTip, setDraftTip] = useState(false);

  /** ① 打开发帖框时提示是否有草稿可恢复 */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as PostDraft;
        if (d.title) { setDraftTip(true); setDraftAt(d.savedAt ?? ''); }
      }
    } catch { /* ignore */ }
  }, [open, DRAFT_KEY]);

  /** ② 草稿自动保存（本地草稿区，不入库、不占服务端存储） */
  useEffect(() => {
    if (!v2 || !open) return;
    if (!title.trim() && !content.trim()) return;
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        title, content, tags, anon, boardId,
        savedAt: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
      }));
      setDraftAt(`${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`);
    }, 1200);
    return () => clearTimeout(t);
  }, [v2, open, title, content, tags, anon, boardId, DRAFT_KEY]);

  /** ③ 恢复草稿 */
  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as PostDraft;
      setTitle(d.title ?? ''); setContent(d.content ?? ''); setTags(d.tags ?? []); setAnon(!!d.anon);
      if (d.boardId) setBoardId(d.boardId);
      setDraftTip(false);
      message.success('已恢复上次草稿');
    } catch { /* ignore */ }
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftAt(''); setDraftTip(false);
  };

  /** ④ 极简富文本工具条：向光标处插入 Markdown 标记 */
  const insert = (before: string, after = before) => {
    const el = document.getElementById('wb-post-content') as HTMLTextAreaElement | null;
    if (!el) { setContent((c) => `${c}${before}文本${after}`); return; }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${before}${content.slice(start, end) || '文本'}${after}${content.slice(end)}`;
    setContent(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + (end - start || 2)); }, 0);
  };

  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      title, content, tags, anon, boardId,
      savedAt: `${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`,
    }));
    setDraftAt(`${DEMO_TODAY} ${new Date().toTimeString().slice(0, 5)}`);
    message.success('草稿已保存');
  };

  /** ⑤ 提交 */
  const submit = () => {
    if (title.trim().length < 4) { message.warning('标题至少 4 字'); return; }
    if (content.trim().length < 10) { message.warning('正文至少 10 字'); return; }
    opts.publish({ title, content, tags, anon, boardId, subjects, files });
    if (v2) clearDraft();
    setOpen(false); setTitle(''); setContent(''); setAnon(false); setTags([]);
    if (v2) { setFiles([]); setSubjects([]); setBoardId(''); }
  };

  const reset = () => {
    setOpen(false); setTitle(''); setContent(''); setAnon(false); setTags([]);
    setFiles([]); setSubjects([]); setBoardId('');
  };

  return {
    v2, open, setOpen, title, setTitle, content, setContent, anon, setAnon, tags, setTags,
    boardId, setBoardId, subjects, setSubjects, files, setFiles,
    draftAt, draftTip, restoreDraft, clearDraft, insert, saveDraft, submit, reset,
  };
}
