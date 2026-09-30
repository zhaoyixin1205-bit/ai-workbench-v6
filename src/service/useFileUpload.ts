/**
 * V6.0 CR-31：上传行为统一收口（A-39 结案）
 *
 * 四个上传点（案例 Skill 包 / 案例附件 / 作业提报 / 悬赏方案）此前各写一份
 * `beforeUpload`，校验口径与文案各不相同，且都只是「登记文件名」。
 * 这里统一为一份：校验 → 真实上传 → 落元数据 → 回写业务对象，
 * 开关关闭或后端不可达时自动回到演示态（只登记元数据 + 诚实文案）。
 */

import { App } from 'antd';
import { useState } from 'react';
import { useStore } from '@/store/store';
import type { Attachment, AttachmentFile } from '@/mock/types';
import { formatSize } from '@/mock/types';
import { uploadFile, validateFile } from '@/service/fileService';

interface Opts {
  /** 已选数量（用于数量上限判断） */
  count: number;
  /** 数量上限，默认 5 */
  max?: number;
  /** 上传成功后回调，由调用方写进自己的表单状态 */
  onDone: (a: Attachment) => void;
}

export function useFileUpload(bizType: AttachmentFile['biz_type'], bizId: string, opts: Opts) {
  const { flags, me, setDb } = useStore();
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(0);

  const beforeUpload = (file: File) => {
    const err = validateFile(file);
    if (err) {
      message.error(err);
      return false;
    }
    if (opts.count >= (opts.max ?? 5)) {
      message.error(`最多上传 ${opts.max ?? 5} 个附件`);
      return false;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    /** 开关关闭 ≡ A-39 演示态：只登记元数据，不给假下载按钮 */
    if (flags.realFileService === false) {
      opts.onDone({ id: `AT${Date.now()}`, name: file.name, size: formatSize(file.size), ext, driver: 'demo' });
      message.success(`${file.name} 已登记（演示态：未接入文件服务，无法下载）`);
      return false;
    }

    setUploading((n) => n + 1);
    uploadFile(file, bizType, bizId, me.name, { realFileService: flags.realFileService })
      .then((f) => {
        /** 元数据进全局台账，便于后台统一查看与审计 */
        setDb((p) => ({ ...p, attachmentFiles: [f, ...(p.attachmentFiles ?? [])] }));
        opts.onDone({
          id: f.id, name: f.name, size: formatSize(f.size), ext: f.ext,
          file_id: f.id, url: f.url, driver: f.driver,
        });
        if (f.driver === 'demo') {
          message.success(`${file.name} 已登记（未接入文件服务，仅登记元数据）`);
        } else if (f.zip_checked) {
          message.success(`${file.name} 上传成功 · zip 结构校验通过`);
        } else {
          message.success(`${file.name} 上传成功`);
        }
      })
      .catch((e: Error) => {
        // zip 校验不通过时 e.message 已带缺失清单，直接透出
        message.error(e.message || '上传失败');
      })
      .finally(() => setUploading((n) => Math.max(0, n - 1)));

    return false; // 阻断 antd 自带上传，走我们自己的通道
  };

  return { beforeUpload, uploading };
}
