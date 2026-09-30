import { Button, Space, Tag, Tooltip } from 'antd';
import { DeleteOutlined, DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import { COLOR, RADIUS } from '@/theme';
import type { Attachment, SkillPackage } from '@/mock/types';

/**
 * V4.1 资源卡：案例「可直接安装的 Skill」与「补充信息 / 附件」共用一套观感
 * 设计依据：Moka §1.2 胶囊按钮 + §4 P8 一键产物 —— 卡片本身就是「要产出的东西」，
 * 用户评价标准是「点一下就能拿到手」。
 */

/** 附件类型 → 图标（纯 emoji，不引图标资源，保证渲染恒定） */
const EXT_ICON: Record<string, string> = {
  zip: '🗜️', rar: '🗜️', '7z': '🗜️', skill: '🧩',
  xlsx: '📗', xls: '📗', csv: '📗',
  docx: '📘', doc: '📘',
  pdf: '📕',
  pptx: '📙', ppt: '📙',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️',
  txt: '📄', md: '📄',
  mp4: '🎬', mp3: '🎵',
};

export function attachIcon(ext: string): string {
  return EXT_ICON[(ext ?? '').toLowerCase()] ?? '📎';
}

/** 从文件名取扩展名（小写，不含点） */
export function extOf(name: string): string {
  const i = (name ?? '').lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

const cardBase: React.CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  padding: '14px 16px', borderRadius: RADIUS.lg,
  border: '1px solid #F0F1F4', background: '#fff',
  height: '100%', transition: 'box-shadow 240ms cubic-bezier(0.2,0.8,0.2,1), transform 240ms cubic-bezier(0.2,0.8,0.2,1)',
};

function HoverLift({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="wb-card-hover"
      style={{ height: '100%' }}
    >
      {children}
    </div>
  );
}

/** 可直接安装的 Skill 卡：压缩包 / 下载链接两种承载方式 */
export function SkillCard({
  item, onAct, onRemove,
}: {
  item: SkillPackage;
  onAct?: (text: string) => void;
  onRemove?: (id: string) => void;
}) {
  const isUpload = item.type === 'UPLOAD';
  /* Moka §5：文案要说「怎么办」，不假装成功。演示环境没有文件服务，就直说，
     并告诉用户正式环境点这里会发生什么 —— 而不是弹一句「已开始下载」让人干等。 */
  const act = () => {
    /* V6.0 CR-31：上传型 Skill 已落真实文件（item.url 为服务端代理地址）→ 真下载；
       仍为演示态（无 url）时保留诚实文案，不给假按钮 */
    if (isUpload && item.url) {
      window.open(item.url, '_blank', 'noopener');
      return;
    }
    if (isUpload) {
      onAct?.(`演示环境未接入文件服务：${item.file_name ?? 'Skill 包'} 只登记了名称与体积，正式环境点此直接下载`);
      return;
    }
    if (item.url) {
      navigator.clipboard?.writeText(item.url);
      onAct?.('下载链接已复制，粘贴到浏览器即可打开');
      return;
    }
    onAct?.('这个 Skill 还没填下载链接，找作者补一下');
  };
  return (
    <HoverLift>
      <div style={cardBase}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: isUpload ? '#FFF1EB' : '#EFF6FF',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>
          {isUpload ? '🧩' : '🔗'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: COLOR.text }}>{item.name}</span>
            {item.version && <Tag style={{ marginInlineEnd: 0, fontSize: 11 }}>{item.version}</Tag>}
          </div>
          <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 4 }}>
            {isUpload
              ? `${item.file_name ?? '未选择文件'}${item.file_size ? ` · ${item.file_size}` : ''}`
              : (item.url || '未填写链接')}
          </div>
          {item.note && (
            <div style={{ fontSize: 12, color: COLOR.textSub, marginTop: 6, lineHeight: 1.6 }}>
              {item.note}
            </div>
          )}
          <Space size={8} style={{ marginTop: 10 }}>
            <Button
              type="primary" size="small" shape="round"
              icon={isUpload ? <DownloadOutlined /> : <LinkOutlined />}
              onClick={act}
            >
              {isUpload ? '下载并安装' : '复制下载链接'}
            </Button>
            {onRemove && (
              <Tooltip title="移除该 Skill">
                <Button size="small" shape="circle" icon={<DeleteOutlined />} onClick={() => onRemove(item.id)} />
              </Tooltip>
            )}
          </Space>
        </div>
      </div>
    </HoverLift>
  );
}

/** 补充信息 / 附件卡：各类型文件，非必填 */
export function AttachCard({
  item, onAct, onRemove,
}: {
  item: Attachment;
  onAct?: (text: string) => void;
  onRemove?: (id: string) => void;
}) {
  const ext = item.ext || extOf(item.name);
  return (
    <HoverLift>
      <div style={cardBase}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: '#F9FAFB', border: '1px solid #F0F1F4',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>{attachIcon(ext)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLOR.text, wordBreak: 'break-all' }}>
            {item.name}
          </div>
          <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 4 }}>
            {ext ? ext.toUpperCase() : '文件'} · {item.size}
          </div>
          {item.note && (
            <div style={{ fontSize: 12, color: COLOR.textSub, marginTop: 6, lineHeight: 1.6 }}>{item.note}</div>
          )}
          <Space size={8} style={{ marginTop: 10 }}>
            {/* V6.0 CR-31：有真实 url 就真下载（走服务端代理）；没有就如实说明，不给假按钮 */}
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer">
                <Button size="small" shape="round" icon={<DownloadOutlined />}>下载</Button>
              </a>
            ) : (
              <Tooltip title={item.driver === 'demo'
                ? '未接入文件服务：该文件只登记了名称与体积，无法下载'
                : '文件尚未上传成功'}>
                <Button
                  size="small" shape="round" icon={<DownloadOutlined />} disabled
                  onClick={() => onAct?.(`演示环境未接入文件服务：${item.name} 只登记了名称与体积`)}
                >下载</Button>
              </Tooltip>
            )}
            {onRemove && (
              <Tooltip title="移除该附件">
                <Button size="small" shape="circle" icon={<DeleteOutlined />} onClick={() => onRemove(item.id)} />
              </Tooltip>
            )}
          </Space>
        </div>
      </div>
    </HoverLift>
  );
}
