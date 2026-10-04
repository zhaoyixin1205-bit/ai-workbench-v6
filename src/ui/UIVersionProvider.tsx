import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { theme as themeV1 } from '@/theme';
import { themeV2 } from '@/theme/v2';
import { readUIVersion, writeUIVersion } from './version';
import type { UIVersion } from './version';

/**
 * 版本上下文：把 AntD 主题的二选一收在这里，其余代码不感知版本。
 *
 * 为什么要这层：ConfigProvider 的 theme 对象决定 AntD 全部组件样式。
 * v1/v2 各一份 theme，切换即换对象，AntD 自己重算样式 —— 不需要刷新页面，
 * 也不需要任何业务页面改动（这是「双版本并存」能落地的前提）。
 */
const VersionCtx = createContext<{ version: UIVersion; setVersion: (v: UIVersion) => void }>({
  version: 'v1',
  setVersion: () => {},
});

export function useUIVersion() {
  return useContext(VersionCtx);
}

export default function UIVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersionState] = useState<UIVersion>(() => readUIVersion());

  // 把版本写到 <body data-ui>，global.css 里 v1 的 86 处 .ant-* 覆写靠这个属性隔离。
  // index.html 已预置 data-ui="v1"，所以首帧不会闪 v2 样式。
  useEffect(() => {
    document.body.dataset.ui = version;
  }, [version]);

  const setVersion = useCallback((v: UIVersion) => {
    writeUIVersion(v);
    setVersionState(v);
  }, []);

  const value = useMemo(() => ({ version, setVersion }), [version, setVersion]);
  const theme = version === 'v2' ? themeV2 : themeV1;

  return (
    <VersionCtx.Provider value={value}>
      <ConfigProvider theme={theme} locale={zhCN}>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </VersionCtx.Provider>
  );
}
