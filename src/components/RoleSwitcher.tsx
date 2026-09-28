import { Button, Dropdown, Modal, Segmented, Space, Tag, Typography, Input, Avatar, List, message } from 'antd';
import { SafetyCertificateOutlined, DownOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { ROLE_LABEL } from '@/mock/types';
import type { Role, User } from '@/mock/types';
import { COLOR, GRADIENT, SHADOW } from '@/theme';

const ROLE_COLOR: Record<Role, string> = {
  MEMBER: 'default', LEADER: 'blue', JUDGE: 'purple', EXPERT: 'cyan',
  ORGANIZER: 'orange', SKILL_ADMIN: 'geekblue', ADMIN: 'red', VIEWER: 'default',
};

export function RoleTag({ role }: { role: Role }) {
  return <Tag color={ROLE_COLOR[role]} style={{ marginInlineEnd: 4 }}>{ROLE_LABEL[role]}</Tag>;
}

/** 演示身份切换器：PRD 4.1 免登入口的真实实现待 appKey 就位后替换 */
export default function RoleSwitcher() {
  const { me, db, switchIdentity, resetDemo } = useStore();
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState('');
  const [tab, setTab] = useState<string>('按角色');

  const grouped = useMemo(() => {
    const map = new Map<Role, User[]>();
    db.users.forEach((u) =>
      u.roles.forEach((r) => {
        if (!map.has(r)) map.set(r, []);
        map.get(r)!.push(u);
      })
    );
    return map;
  }, [db.users]);

  const filtered = useMemo(
    () => db.users.filter((u) => !kw || u.name.includes(kw) || u.dept_names.join().includes(kw)),
    [db.users, kw]
  );

  return (
    <>
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            {
              key: 'current', type: 'group',
              label: (
                <Space size={4} wrap>
                  <span style={{ fontSize: 11, color: COLOR.textMuted }}>当前身份（角色并集）</span>
                  {me.roles.map((r) => <RoleTag key={r} role={r} />)}
                </Space>
              ),
            },
            { key: 'roles', type: 'group', label: '按角色快速切换（仅切换演示人员，功能按并集开放）',
              children: (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({
                key: `r-${r}`,
                label: `${ROLE_LABEL[r]}（${grouped.get(r)?.length ?? 0} 人）${r === 'LEADER' ? ' · 派生属性' : ''}`,
              })),
            },
            { type: 'divider' },
            { key: 'all', label: '选择具体人员…' },
            { key: 'reset', label: '重置演示数据', danger: true },
          ],
          onClick: ({ key }) => {
            if (key === 'all') setOpen(true);
            else if (key === 'reset') { resetDemo(); message.success('演示数据已重置'); }
            else if (key.startsWith('r-')) {
              const role = key.slice(2) as Role;
              const target = grouped.get(role)?.[0];
              if (target) { switchIdentity(target.union_id); message.success(`已切换为：${target.name}（${ROLE_LABEL[role]}）`); }
              else message.warning('暂无该角色人员');
            }
          },
        }}
      >
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '4px 10px 4px 4px', borderRadius: 999, background: COLOR.primaryLight,
            border: '1px solid #FFE4D9', transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = SHADOW.button;
            e.currentTarget.style.borderColor = '#FFCFB8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.borderColor = '#FFE4D9';
          }}
        >
          <Avatar size={24} style={{ background: GRADIENT.primary, fontSize: 12, fontWeight: 700 }}>
            {me.name.slice(0, 1)}
          </Avatar>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#C2410C', whiteSpace: 'nowrap' }}>
            {me.name}
          </span>
          {/* V4.0 CR-02：不再「切换身份」，展示全部角色的并集 */}
          <span style={{ fontSize: 11, color: COLOR.textSub, whiteSpace: 'nowrap' }}>
            {me.roles.length > 1
              ? `${ROLE_LABEL[me.roles[0]]} +${me.roles.length - 1}`
              : ROLE_LABEL[me.roles[0]]}
          </span>
          <DownOutlined style={{ fontSize: 9, color: COLOR.textMuted }} />
        </button>
      </Dropdown>

      <Modal
        open={open}
        title={<Space><SafetyCertificateOutlined style={{ color: COLOR.primary }} />选择演示身份（模拟钉钉免登）</Space>}
        onCancel={() => setOpen(false)}
        footer={null}
        width={660}
      >
        <Segmented
          value={tab}
          onChange={(v) => setTab(String(v))}
          options={['按角色', '按人员']}
          style={{ marginBottom: 12 }}
        />
        <Input.Search placeholder="搜索姓名或部门" allowClear onChange={(e) => setKw(e.target.value)} style={{ marginBottom: 16 }} />
        {tab === '按角色' ? (
          <Space direction="vertical" size={14} style={{ width: '100%', maxHeight: 420, overflowY: 'auto' }}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <div key={r}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <RoleTag role={r} />
                  <span style={{ fontSize: 12, color: COLOR.textMuted }}>{grouped.get(r)?.length ?? 0} 人</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(grouped.get(r) ?? []).map((u) => {
                    const active = u.union_id === me.union_id;
                    return (
                      <button
                        key={u.union_id}
                        onClick={() => { switchIdentity(u.union_id); setOpen(false); message.success(`已切换为 ${u.name}`); }}
                        style={{
                          fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                          padding: '4px 12px', borderRadius: 999,
                          background: active ? GRADIENT.primary : '#F7F8FA',
                          color: active ? '#fff' : COLOR.textSub,
                          border: active ? 'none' : '1px solid #F0F1F4',
                          boxShadow: active ? SHADOW.button : 'none',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = COLOR.primaryLight; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = '#F7F8FA'; }}
                      >
                        {u.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Space>
        ) : (
          <List
            dataSource={filtered}
            style={{ maxHeight: 400, overflowY: 'auto' }}
            renderItem={(u) => (
              <List.Item
                actions={[<Button key="s" type="link" size="small" onClick={() => { switchIdentity(u.union_id); setOpen(false); }}>切换</Button>]}
              >
                <List.Item.Meta
                  avatar={<Avatar style={{ background: GRADIENT.primary, fontWeight: 700 }}>{u.name.slice(0, 1)}</Avatar>}
                  title={<Space size={4}>{u.name}{u.roles.map((r) => <RoleTag key={r} role={r} />)}</Space>}
                  description={<span style={{ fontSize: 12, color: COLOR.textSub }}>{u.dept_names[0]} · {u.title} · 积分 {u.points}</span>}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </>
  );
}
