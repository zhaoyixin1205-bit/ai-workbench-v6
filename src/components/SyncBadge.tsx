/**
 * V6.1：数据同步状态徽标
 *
 * 存在的理由：多人共享最大的风险不是「同步失败」，而是「用户以为共享了其实没有」。
 * 后端不可达时前端会静默退回本机模式 —— 如果不把这个状态摆到界面上，
 * 用户会拿着一份谁也看不见的数据做演示。所以这里必须显式、常驻、可点击刷新。
 */

import { Tag, Tooltip } from 'antd';
import {
  CloudOutlined, CloudServerOutlined, ExclamationCircleOutlined, SyncOutlined,
} from '@ant-design/icons';
import { useStore } from '@/store/store';

const PILL: React.CSSProperties = { marginInlineEnd: 0, borderRadius: 999, cursor: 'default' };

export default function SyncBadge() {
  const { sync, pullRemote } = useStore();

  if (sync.state === 'loading') {
    return (
      <Tag icon={<SyncOutlined spin />} color="processing" style={PILL}>连接中</Tag>
    );
  }

  if (sync.mode === 'local') {
    return (
      <Tooltip title={sync.message || '未连接后端：数据只保存在本机浏览器，其他人看不到'}>
        <Tag icon={<CloudOutlined />} color="default" style={PILL}>本机数据</Tag>
      </Tooltip>
    );
  }

  if (sync.state === 'saving') {
    return <Tag icon={<SyncOutlined spin />} color="processing" style={PILL}>同步中</Tag>;
  }

  if (sync.state === 'conflict') {
    return (
      <Tooltip title={sync.message}>
        <Tag
          icon={<ExclamationCircleOutlined />} color="error"
          style={{ ...PILL, cursor: 'pointer' }}
          onClick={() => void pullRemote()}
        >数据冲突 · 点此刷新</Tag>
      </Tooltip>
    );
  }

  if (sync.state === 'offline') {
    return (
      <Tooltip title={sync.message || '与后端断开'}>
        <Tag icon={<CloudOutlined />} color="warning" style={{ ...PILL, cursor: 'pointer' }} onClick={() => void pullRemote()}>
          已断开 · 点此重连
        </Tag>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      title={`多人共享已启用（存储：${sync.driver === 'pg' ? 'PostgreSQL' : sync.driver || '后端'}）`
        + `${sync.updatedBy ? ` · 最近由 ${sync.updatedBy} 更新` : ''}`}
    >
      <Tag icon={<CloudServerOutlined />} color="success" style={PILL}>云端同步</Tag>
    </Tooltip>
  );
}
