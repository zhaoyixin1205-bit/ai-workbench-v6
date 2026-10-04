/**
 * 双版本开关（激进模式义务③：禁止就地覆盖式替换，必须能一键切回旧版）
 *
 * 优先级：URL ?ui=v2  >  localStorage  >  默认 v1
 *
 * 约定：
 * - **默认 v1**，升级期间线上行为与升级前完全一致；
 * - URL 参数任何人可手改（便于测试与临时回退），但**顶栏切换控件只对管理员渲染**；
 * - 切换不刷新页面：AntD theme 由 ConfigProvider 重新生成，CSS 变量是静态引入的，无需重载。
 */

export type UIVersion = 'v1' | 'v2';

const STORAGE_KEY = 'wb.ui.version';
const DEFAULT_VERSION: UIVersion = 'v1';

function fromLocation(): UIVersion | null {
  if (typeof window === 'undefined') return null;
  // ⚠️ 本项目用 HashRouter，URL 形如 /?ui=v2#/?ui=v2
  // 按直觉写的 `#/?ui=v2` 只会落在 hash 里，window.location.search 读不到，
  // 所以两处都查一遍，避免"写了参数却没生效"的困惑。
  const outer = new URLSearchParams(window.location.search).get('ui');
  const inner = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('ui');
  const raw = outer ?? inner;
  return raw === 'v1' || raw === 'v2' ? raw : null;
}

function fromStorage(): UIVersion | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'v1' || raw === 'v2' ? raw : null;
  } catch {
    return null; // 隐私模式 / 存储被禁用时降级，不影响使用
  }
}

export function readUIVersion(): UIVersion {
  return fromLocation() ?? fromStorage() ?? DEFAULT_VERSION;
}

export function writeUIVersion(next: UIVersion): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* 存不了就算了，本次会话内仍然生效 */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('ui', next);
  window.history.replaceState({}, '', url.toString());
}

/** 供切换控件回显当前版本（URL > localStorage > 默认） */
/** 顶栏切换控件是否可见：仅管理员（用户 2026-10-04 拍板「限制」） */
export function versionSwitchVisible(roles: string[] | undefined): boolean {
  return Array.isArray(roles) && roles.includes('ADMIN');
}
