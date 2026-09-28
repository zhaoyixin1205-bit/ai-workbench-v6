import { Button, Result, Space, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, HomeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import RoleSwitcher from '@/components/RoleSwitcher';
import { ROLE_LABEL } from '@/mock/types';
import type { Role } from '@/mock/types';
import { COLOR } from '@/theme';
import type { GuardResult } from '@/auth/access';

/** 统一的 403 无权限页（PRD V4.0 CR-12：页级守卫失败后的兜底展示） */
export default function NoAccess({
  result,
  roles,
  onBack,
  onBackText = '返回工作台',
}: {
  result: Extract<GuardResult, { ok: false }>;
  roles: Role[];
  onBack?: () => void;
  onBackText?: string;
}) {
  const nav = useNavigate();
  const needRoles = result.access.roles ?? [];
  const isFlag = result.kind === 'FLAG';
  const required = needRoles.length ? needRoles : undefined;

  return (
    <Result
      status="403"
      title="403 · 无访问权限"
      subTitle={
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {isFlag ? result.message : `「${result.access.label}」对当前身份不可见。`}
          </Typography.Text>
          {result.access.reason && !isFlag && (
            <Typography.Paragraph
              style={{
                fontSize: 12, color: COLOR.textMuted, background: COLOR.bg,
                border: `1px solid ${COLOR.borderLight}`, borderRadius: 10,
                padding: '10px 12px', marginBottom: 0, textAlign: 'left',
              }}
            >
              限制依据：{result.access.reason}
            </Typography.Paragraph>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: COLOR.textMuted }}>当前身份</span>
            {roles.map((r) => <Tag key={r} color="default">{ROLE_LABEL[r]}</Tag>)}
          </div>
          {required && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: COLOR.textMuted }}>所需角色</span>
              {required.map((r) => <Tag key={r} color="orange">{ROLE_LABEL[r]}</Tag>)}
            </div>
          )}
        </Space>
      }
      extra={
        <Space wrap>
          {onBack ? (
            <Button icon={<ArrowLeftOutlined />} onClick={onBack}>{onBackText}</Button>
          ) : (
            <Button icon={<HomeOutlined />} onClick={() => nav('/')}>返回工作台</Button>
          )}
          <RoleSwitcher />
        </Space>
      }
    />
  );
}
