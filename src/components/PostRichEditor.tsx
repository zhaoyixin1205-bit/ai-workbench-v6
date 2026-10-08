/**
 * V8.3-10.08 需求⑥：社区发帖「正文内嵌图片」编辑器
 *
 * 为什么上富文本而不是给个「附件」上传框：
 *   用户原话是「正文支持上传图片」——他要的是图文混排（截图贴在自己的提问/复盘里），
 *   附件区只能挂文件，点开才看到，图文关系断了。
 *
 * 三个关键取舍：
 *   ① 图片走**已有的**文件服务（/api/files/upload），不新造轮子：
 *      白名单、大小限制、后台台账全部复用；
 *   ② 上限 5 张（组织者拍板），超限在 customUpload 里直接拒掉并提示；
 *   ③ 落库存 HTML，**渲染时必须过 DOMPurify**（见 RichContent）——
 *      富文本 = 用户可注入 HTML，不过滤就是存储型 XSS。
 */
import { useEffect, useRef, useState } from 'react';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import type { IDomEditor } from '@wangeditor/editor';
import '@wangeditor/editor/dist/css/style.css';
import { App as AntApp } from 'antd';
import { uploadFile } from '@/service/fileService';
import { useStore } from '@/store/store';

export interface PostRichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 内嵌图片上限（组织者拍板 5 张） */
  maxImages?: number;
  height?: number;
}

/** 数一下 HTML 里的 <img>，用于「最多 5 张」判定与底部计数 */
export function countImages(html: string): number {
  if (!html) return 0;
  return (html.match(/<img\b/gi) ?? []).length;
}

export default function PostRichEditor({
  value, onChange, placeholder = '正文（支持加粗 / 列表 / 引用，以及最多 5 张图片）', maxImages = 5, height = 260,
}: PostRichEditorProps) {
  /**
   * editor 实例放 state 而不是 ref：Toolbar 要在实例就绪后**重渲染**才能绑上工具栏，
   * 放 ref 首帧为 null，工具栏会一直是空的。
   */
  const [editor, setEditor] = useState<IDomEditor | null>(null);
  const { flags, me, setDb } = useStore();
  const { message } = AntApp.useApp();
  /** 用 ref 记住回调：defaultConfig 里引用它，保证配置对象稳定、不触发编辑器重建 */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const imageCountRef = useRef(0);
  const maxImagesRef = useRef(maxImages);
  maxImagesRef.current = maxImages;

  /** 外部把正文清空时（reset / 恢复草稿前）同步清空编辑器 */
  useEffect(() => {
    if (!editor) return;
    imageCountRef.current = countImages(value);
    if (!value) editor.clear();
  }, [value, editor]);

  useEffect(() => () => {
    // 卸载时销毁：wangEditor 实例内部有全局态，不销毁会串到下一个编辑器
    editor?.destroy();
    setEditor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 图片上传：走统一文件服务，元数据同时进后台台账 */
  const customUpload = (file: File, insertFn: (url: string, alt?: string, href?: string) => void) => {
    if (imageCountRef.current >= maxImagesRef.current) {
      message.warning(`正文最多 ${maxImagesRef.current} 张图片`);
      return;
    }
    const bizId = `POST_UPLOAD_${Date.now()}`;
    uploadFile(file, 'POST_ATTACH', bizId, me.name, { realFileService: flags.realFileService })
      .then((f) => {
        setDb((p) => ({ ...p, attachmentFiles: [f, ...(p.attachmentFiles ?? [])] }));
        if (!f.url) {
          message.warning('图片已登记，但文件服务未开启，暂不能插入图片');
          return;
        }
        imageCountRef.current += 1;
        insertFn(f.url, file.name, f.url);
      })
      .catch((e: Error) => message.error(e.message || '图片上传失败'));
  };

  return (
    <div style={{ border: '1px solid var(--wb-border, #F2EBDD)', borderRadius: 8, overflow: 'hidden' }}>
      <Toolbar
        editor={editor}
        defaultConfig={{
          /**
           * key 名必须用 wangEditor 的**注册名**，写错会静默截断后面的全部工具
           *（踩过：写成 strikeThrough，正确是 through —— 结果图片上传按钮整个消失）。
           * mode 用 default（完整工具栏）—— simple 模式只保留加粗/斜体/下划线，
           * 会把「插入图片」这个本页核心能力藏掉。
           */
          toolbarKeys: [
            'undo', 'redo', '|',
            'headerSelect', 'bold', 'italic', 'underline', 'through', 'color', '|',
            'bulletedList', 'numberedList', 'justifyLeft', 'justifyCenter', 'blockquote', 'code', '|',
            'uploadImage', 'insertLink', '|',
            'removeFormat', 'clearStyle',
          ],
        }}
        mode="default"
      />
      <Editor
        style={{ height, overflowY: 'auto' }}
        defaultHtml={value || '<p><br></p>'}
        defaultConfig={{
          placeholder,
          MENU_CONF: {
            uploadImage: {
              // 自定义上传：走内网文件服务，而不是 wangEditor 默认把图片转 base64 塞进正文
              customUpload: (file: File, insertFn: (url: string, alt?: string, href?: string) => void) =>
                customUpload(file, insertFn),
            },
          },
        }}
        onCreated={(ed) => { imageCountRef.current = countImages(value); setEditor(ed); }}
        onChange={(ed) => onChangeRef.current(ed.getHtml())}
        mode="default"
      />
      <div style={{
        padding: '4px 10px', fontSize: 11, color: 'var(--wb-ink-3, #857E90)',
        borderTop: '1px solid var(--wb-border, #F2EBDD)', background: 'var(--wb-surface-sunken, #FBF6EF)',
      }}>
        正文图片 {countImages(value)} / {maxImages} 张 · 涉客户数据的截图请先脱敏
      </div>
    </div>
  );
}