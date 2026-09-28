/**
 * V4.0 CR-10 · 复用次数展示（外部数据源）
 *
 * 规则（PRD V4.0 §CR-10）：
 * 1. 本系统**不再自算、不再累加**复用次数；数据取自 WorkBuddy 管理员后台（或手工导入台账）；
 * 2. 展示必须带「数据来源 + 同步时间」角标；
 * 3. 未同步过的资产显示「待测」，**禁止显示裸 0**（避免被误读为「无人复用」）；
 * 4. 历史自算数据（reuse_source 为空或 LEGACY）显示数值但标注「估算」；
 * 5. 开关 asset.reuseExternal 关闭 → 完全回到 V3.0 的自算展示（无任何角标）。
 */
import { Space, Tooltip, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { COLOR } from '@/theme';
import { SoftTag } from '@/components/ui';

export interface ReuseSource {
  /** @deprecated V4.0 CR-10：仅作 fallback，展示为「估算」 */
  reuse_count: number;
  reuse_source?: 'WB_BACKEND' | 'MANUAL' | 'LEGACY';
  /** 同步时间；为空表示未同步 */
  reuse_synced_at?: string;
}

export type ReuseView =
  | { kind: 'SYNCED'; value: number; sourceText: string; tone: 'blue' | 'purple' | 'green' }
  | { kind: 'ESTIMATE'; value: number }
  | { kind: 'PENDING' }
  | { kind: 'SELF' ; value: number };

const SOURCE_TEXT: Record<string, string> = {
  WB_BACKEND: 'WorkBuddy 管理员后台',
  MANUAL: '管理员手工导入',
  LEGACY: '历史自算',
};

/** 解析展示策略：external=false 时直接回到 V3.0 自算口径 */
export function resolveReuse(a: ReuseSource, external: boolean): ReuseView {
  if (!external) return { kind: 'SELF', value: a.reuse_count };
  const src = a.reuse_source;
  const synced = !!a.reuse_synced_at;
  if (synced && (src === 'WB_BACKEND' || src === 'MANUAL')) {
    return {
      kind: 'SYNCED',
      value: a.reuse_count,
      sourceText: SOURCE_TEXT[src],
      tone: src === 'WB_BACKEND' ? 'blue' : 'purple',
    };
  }
  // 历史自算值（LEGACY / 无来源）：仍显示数量但必须标注「估算」
  if (!src || src === 'LEGACY') {
    return a.reuse_count > 0 ? { kind: 'ESTIMATE', value: a.reuse_count } : { kind: 'PENDING' };
  }
  // 声明了外部来源但从未同步 → 待测
  return { kind: 'PENDING' };
}

/** 「复用 X 次」的数值部分；待测时不给出数字 */
export function reuseNumber(v: ReuseView): string {
  if (v.kind === 'PENDING') return '待测';
  const n = v.value;
  if (v.kind === 'ESTIMATE') return `${n} 次（估算）`;
  return `${n} 次`;
}

/** 进度条用数值：待测 / 估算不计入热度，返回 0 仅用于渲染条形，文案另有交代 */
export function reuseBarValue(v: ReuseView): number {
  return v.kind === 'SYNCED' || v.kind === 'ESTIMATE' ? v.value : 0;
}

/** 完整一行：复用 X 次 + 来源角标 + 同步时间 + 说明问号 */
export function ReuseLabel({ asset, external }: { asset: ReuseSource; external: boolean }) {
  const v = resolveReuse(asset, external);
  return (
    <Space size={6} wrap>
      <span>{reuseNumber(v)}</span>
      {v.kind === 'SYNCED' && <SoftTag text={v.sourceText} tone={v.tone} />}
      {v.kind === 'ESTIMATE' && <SoftTag text="估算" tone="gold" />}
      {v.kind === 'PENDING' && <SoftTag text="待测" tone="gray" />}
      {v.kind === 'SYNCED' && asset.reuse_synced_at && (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          同步于 {asset.reuse_synced_at}
        </Typography.Text>
      )}
      <Tooltip title="复用数据取自 WorkBuddy 管理员后台 / 管理员导入台账，本系统不自算、不累加；未同步的资产显示「待测」以避免被误读为 0。">
        <QuestionCircleOutlined style={{ color: COLOR.textMuted, fontSize: 12 }} />
      </Tooltip>
    </Space>
  );
}

/** 汇总值：只累加「已同步（真实）」的口径，估算与待测不计入对外公示合计 */
export function sumReuse(list: ReuseSource[], external: boolean): number {
  if (!external) return list.reduce((a, b) => a + b.reuse_count, 0);
  return list.reduce((a, b) => {
    const v = resolveReuse(b, external);
    return a + (v.kind === 'SYNCED' ? v.value : 0);
  }, 0);
}
