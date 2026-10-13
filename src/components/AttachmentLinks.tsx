import { Button, Space, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { App as AntApp } from 'antd';
import { downloadAttachment } from '@/service/fileService';

/**
 * 附件下载列表（V6.0 CR-31 / V10.13 作业详情）。
 * 附件带服务端下载代理 url 时给「下载」按钮；演示态（url 为空）如实标注，
 * 不给假下载。供作业详情弹窗、员工提报详情页（v1 / v2）共用，避免三处漂移。
 * 提报 attachments 的类型只保证 name/size（历史窄类型），这里放宽为按需读取。
 *
 * V10.13 修复：下载走 `downloadAttachment()`（fetch 带 X-WB-Token → blob 落盘）。
 * 原来 `<a href={a.url}>` 依赖存库 URL 里的 5 分钟短签名，隔天点击必报
 * 401 NO_SESSION「会话已过期」——详见 fileService.downloadAttachment 注释。
 */
export type AttachItem = { name: string; size: string; url?: string; id?: string };

export default function AttachmentLinks({ items, emptyText = '无附件' }: { items?: AttachItem[]; emptyText?: string }) {
  const { message } = AntApp.useApp();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!items || items.length === 0) {
    return <span style={{ fontSize: 13, color: '#8A8F99' }}>{emptyText}</span>;
  }
  return (
    <Space wrap style={{ width: '100%' }}>
      {items.map((a) => (
        <Space key={a.id ?? a.name} size={6} wrap style={{ maxWidth: '100%' }}>
          <span style={{ fontSize: 13, overflowWrap: 'anywhere', wordBreak: 'break-all', minWidth: 0 }}>
            📎 {a.name}（{a.size}）
          </span>
          {a.url ? (
            <Button
              size="small"
              type="link"
              icon={<DownloadOutlined />}
              loading={pendingId === (a.id ?? a.name)}
              onClick={async () => {
                if (!a.id) {
                  message.warning('该附件缺少文件标识，无法下载（可能是早期演示数据）');
                  return;
                }
                setPendingId(a.id ?? a.name);
                try {
                  await downloadAttachment({ id: a.id, name: a.name });
                } catch (e) {
                  message.error(e instanceof Error ? e.message : '下载失败，请稍后重试');
                } finally {
                  setPendingId(null);
                }
              }}
            >
              下载
            </Button>
          ) : (
            <Tag>演示态·未落真实文件</Tag>
          )}
        </Space>
      ))}
    </Space>
  );
}
