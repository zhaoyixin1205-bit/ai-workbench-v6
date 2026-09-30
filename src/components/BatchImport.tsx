import { useMemo, useState } from 'react';
import { Alert, Button, Modal, Space, Table, Tag, Typography, Upload, App as AntApp } from 'antd';
import { DownloadOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons';
import { useStore } from '@/store/store';
import type { ImportSchema } from '@/constants/importSchemas';
import { schemaColumns, schemaHint, validateRowBySchema } from '@/constants/importSchemas';
import { parseCsv, toCsv } from '@/constants/csv';

/** 三态回执：成功 / 失败 / 跳过（沿用 CR-11 用户导入的成熟交互） */
export type BatchResult = '成功' | '失败' | '跳过';

export interface BatchItem<T = unknown> {
  row: number;
  name: string;
  result: BatchResult;
  reason?: string;
  /** 校验通过的行携带的业务数据，提交时交给 onCommit */
  data?: T;
}

export interface BatchImportProps<T> {
  title: string;
  /**
   * V7.0 CR-35：字段契约。传入后，模板列与上传校验共用同一份定义，
   * 杜绝「下载的模板」与「上传时要求的列」对不上。不传则沿用旧逻辑（向后兼容）。
   */
  schema?: ImportSchema;
  /** 模板表头（第一行为口径说明，其后为表头）；传了 schema 时以 schema 为准 */
  columns?: string[];
  /** 口径说明（写在模板首行，避免误填）；传了 schema 时以 schema.hint 为准 */
  hint?: string;
  /** 示例数据行（与 columns 对齐） */
  sample?: string[][];
  /** 单次导入上限 */
  maxRows?: number;
  /** 解析并校验：返回逐行三态明细 */
  validate: (rows: string[][]) => BatchItem<T>[];
  /** 提交：只处理 result='成功' 的行 */
  onCommit: (items: BatchItem<T>[]) => void;
  /** 按钮文案 */
  buttonText?: string;
  disabled?: boolean;
}

const DEFAULT_MAX_ROWS = 200;

/** CSV 编解码统一走 src/constants/csv.ts（与冒烟脚本共用一份实现） */
function parse(text: string): string[][] {
  return parseCsv(text);
}

/**
 * V6.0：四种批量操作（排班 / 资产 / 商品 / 选题）统一抽象为同一个组件。
 * 收益：交互口径（模板下载 → 预校验 → 三态回执 → 确认导入）只有一处实现，
 * 不会出现「四个页面四种回执样式」。
 */
export default function BatchImport<T>({
  title, schema, columns = [], hint, sample = [], maxRows = DEFAULT_MAX_ROWS,
  validate, onCommit, buttonText = '批量导入', disabled,
}: BatchImportProps<T>) {
  const { message } = AntApp.useApp();
  const { flags } = useStore();
  /** V7.0 CR-35：契约校验开关（关闭=只做页面内业务校验，回到 V6.2 校验强度） */
  const schemaOn = flags.importSchema !== false;
  const cols = schema ? schemaColumns(schema) : columns;
  const tip = schema && schemaOn ? schemaHint(schema) : hint;
  const [items, setItems] = useState<BatchItem<T>[] | null>(null);
  const [open, setOpen] = useState(false);

  const counts = useMemo(() => {
    const list = items ?? [];
    return {
      total: list.length,
      success: list.filter((i) => i.result === '成功').length,
      failed: list.filter((i) => i.result === '失败').length,
      skipped: list.filter((i) => i.result === '跳过').length,
    };
  }, [items]);

  const downloadTemplate = () => {
    /** 首行口径说明以 # 开头，导入时自动跳过（与 parseCsv 约定一致） */
    const csv = toCsv([cols, ...sample]);
    const text = `# ${tip}\r\n${csv}`;
    const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title}-模板.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    message.success('模板已下载（首行为口径说明，导入时会自动跳过）');
  };

  /** 失败行仍可下载，便于修正后重导（导入失败不回滚已成功行，保持幂等可重入） */
  const downloadFailed = () => {
    const rows = (items ?? []).filter((i) => i.result !== '成功');
    if (rows.length === 0) { message.info('没有失败或跳过的行'); return; }
    const csv = toCsv([cols, ...rows.map((r) => [String(r.row), r.name, r.result, r.reason ?? ''])]);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title}-失败行.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parse(String(reader.result ?? ''));
      /** 去掉表头行（与模板表头一致时） */
      const body = rows.length && rows[0].join() === cols.join() ? rows.slice(1) : rows;
      if (body.length === 0) { message.error('文件为空或格式不正确'); return; }
      if (body.length > maxRows) {
        message.error(`单次导入上限 ${maxRows} 行，本次解析到 ${body.length} 行，请拆分后重试`);
        return;
      }
      /** 列数与模板不一致时提前拦下，避免「少填一列导致整批错位」 */
      if (schema && schemaOn && body.some((r) => r.length < cols.length)) {
        message.error(`模板共 ${cols.length} 列，检测到存在少于 ${cols.length} 列的行，请按模板补齐后重导`);
        return;
      }
      let res = validate(body);
      /** 契约校验作为附加层：业务校验通过但契约不合规的行降级为「失败」并注明原因 */
      if (schema && schemaOn) {
        res = res.map((it) => {
          if (it.result !== '成功') return it;
          const raw = body[it.row - 2];
          if (!raw) return it;
          const v = validateRowBySchema(schema, raw);
          return v.ok ? it : { ...it, result: '失败' as const, reason: v.reason };
        });
      }
      setItems(res);
      setOpen(true);
      message.success(
        `预校验完成：成功 ${res.filter((r) => r.result === '成功').length} / 失败 ${res.filter((r) => r.result === '失败').length} / 跳过 ${res.filter((r) => r.result === '跳过').length}`
      );
    };
    reader.readAsText(file, 'utf-8');
    return false; // 阻止真实上传
  };

  const commit = () => {
    const okItems = (items ?? []).filter((i) => i.result === '成功');
    if (okItems.length === 0) { message.warning('没有可导入的行'); return; }
    onCommit(okItems);
    setOpen(false);
    setItems(null);
  };

  return (
    <>
      <Space size={8} wrap>
        <Button icon={<DownloadOutlined />} disabled={disabled} onClick={downloadTemplate}>下载模板</Button>
        <Upload
          accept=".csv,.txt,.tsv"
          showUploadList={false}
          beforeUpload={onFile}
          disabled={disabled}
        >
          <Button icon={<UploadOutlined />} disabled={disabled}>{buttonText}</Button>
        </Upload>
      </Space>

      <Modal
        open={open}
        title={`${title} · 导入回执`}
        width={720}
        onCancel={() => { setOpen(false); setItems(null); }}
        onOk={commit}
        okText={`确认导入 ${counts.success} 条`}
        okButtonProps={{ disabled: counts.success === 0 }}
        destroyOnClose
      >
        <Alert
          type="info" showIcon
          style={{ marginBottom: 12 }}
          message={`共解析 ${counts.total} 行：成功 ${counts.success} / 失败 ${counts.failed} / 跳过 ${counts.skipped}`}
          description="导入失败不回滚已成功行（保持幂等可重入）；失败行可下载修正后重新导入。"
        />
        <div style={{ marginBottom: 8 }}>
          <Button size="small" onClick={downloadFailed}>下载失败行</Button>
        </div>
        <Table
          size="small" rowKey="row" pagination={{ pageSize: 6 }} dataSource={items ?? []}
          columns={[
            { title: '行号', dataIndex: 'row', width: 60 },
            { title: '内容', dataIndex: 'name', ellipsis: true },
            {
              title: '结果', dataIndex: 'result', width: 90,
              render: (v: BatchResult) => (
                <Tag color={v === '成功' ? 'green' : v === '失败' ? 'red' : 'default'} style={{ marginInlineEnd: 0 }}>{v}</Tag>
              ),
            },
            {
              title: '原因', dataIndex: 'reason',
              render: (v?: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v ?? '—'}</Typography.Text>,
            },
          ]}
        />
      </Modal>
    </>
  );
}
