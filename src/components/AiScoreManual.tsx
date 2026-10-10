import { useRef, useState } from 'react';
import { Alert, Button, Modal, Space, Table, App as AntApp } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { getSessionToken } from '@/auth/dingtalk';
import { useStore } from '@/store/store';

interface ImportError {
  submit_id: string;
  reason: string;
}

/**
 * V8.3-10.10 手动 AI 评分闭环（用户拍板「暂不连上自动评分」）。
 *
 * 流程：导出待评作业 JSON → 交给外部 AI 按 dimensions 打分 → 把填好的 JSON 导入回写。
 * 与「提交即自动评分」互斥：本组件只负责人工批量闭环，不碰提交流水线。
 */
export default function AiScoreManual() {
  const { message } = AntApp.useApp();
  const { pullRemote } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: ImportError[] } | null>(null);

  const exportSubmissions = async () => {
    try {
      const token = getSessionToken();
      const res = await fetch('/api/ai/export-submissions', {
        headers: token ? { 'X-WB-Token': token } : {},
      });
      if (res.status === 401) { message.error('会话已过期，请重新通过钉钉登录'); return; }
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        message.error(b?.error || `导出失败（HTTP ${res.status}）`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fname = res.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      a.download = fname ? decodeURIComponent(fname) : `ai-submissions-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('待评作业已导出（JSON），交给外部 AI 打分后走「导入 AI 得分」');
    } catch {
      message.error('导出失败：网络异常或服务不可达');
    }
  };

  const importScores = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        message.error('文件不是合法 JSON');
        setBusy(false);
        return;
      }
      const token = getSessionToken();
      const res = await fetch('/api/ai/import-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-WB-Token': token } : {}) },
        body: JSON.stringify(payload),
      });
      const b = await res.json().catch(() => null);
      if (res.status === 401) { message.error('会话已过期，请重新通过钉钉登录'); setBusy(false); return; }
      if (!res.ok || !b?.ok) {
        message.error(b?.error || `导入失败（HTTP ${res.status}）`);
        setBusy(false);
        return;
      }
      setResult({ imported: b.imported ?? 0, skipped: b.skipped ?? 0, errors: b.errors ?? [] });
      if ((b.imported ?? 0) > 0) {
        message.success(`已导入 ${b.imported} 条 AI 得分`);
        /** 写发生在服务端，拉一次远程把新分数同步到前端 */
        void pullRemote();
      }
    } catch {
      message.error('导入失败：网络异常或服务不可达');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void importScores(file);
    e.target.value = '';
  };

  return (
    <>
      <Space size={8} wrap>
        <Button icon={<DownloadOutlined />} onClick={exportSubmissions}>导出待评作业（JSON）</Button>
        <Button icon={<UploadOutlined />} loading={busy} onClick={() => fileRef.current?.click()}>导入 AI 得分</Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={onFile}
        />
      </Space>

      <Modal
        open={!!result}
        title="导入 AI 得分 · 回执"
        width={720}
        onCancel={() => setResult(null)}
        footer={<Button onClick={() => setResult(null)}>关闭</Button>}
        destroyOnClose
      >
        {result && (
          <>
            <Alert
              type={result.imported > 0 ? 'success' : 'warning'}
              showIcon
              style={{ marginBottom: 12 }}
              message={`成功导入 ${result.imported} 条；跳过/失败 ${result.skipped} 条`}
              description="导入失败不回滚已成功行（幂等可重入）；失败项见下表，修正后重新上传同一文件即可覆盖。"
            />
            <Table
              size="small"
              rowKey={(_, i) => String(i)}
              pagination={{ pageSize: 8 }}
              dataSource={result.errors}
              locale={{ emptyText: '无失败项' }}
              columns={[
                { title: 'submit_id', dataIndex: 'submit_id', width: 240, ellipsis: true },
                { title: '原因', dataIndex: 'reason', ellipsis: true },
              ]}
            />
          </>
        )}
      </Modal>
    </>
  );
}
