import type { ReactNode } from 'react';
import { useUIVersion } from './UIVersionProvider';

/**
 * 页面级双版本开关（P3-3）
 *
 * 用法：`<Route path="/cases" element={<V2Page v1={<CaseList />} v2={<CaseListV2 />} />} />`
 *
 * 设计要点：
 *   - 两个组件树**同时存在代码、运行时只挂载一份**，切换零刷新、零路由变化；
 *   - v1 侧传入的仍是原来的组件，**路由 path 一个字母不改**，旧书签/链接全部有效；
 *   - 逐页接入：某页 v2 未就绪时不包 V2Page，即可单页回退（P2 的「单页切」能力）。
 */
export function V2Page({ v1, v2 }: { v1: ReactNode; v2: ReactNode }) {
  const { version } = useUIVersion();
  return <>{version === 'v2' ? v2 : v1}</>;
}

export default V2Page;
