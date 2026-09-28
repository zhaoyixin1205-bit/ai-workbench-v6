# WorkBuddy AI 赋能工作台（前端）

中小微事业群「AI 赋能工作台」前端工程。把培训运营全流程——案例选题、悬赏、作业提交、AI 问诊、评分、入库分发——收敛为一个可演示、可评审的 Web 应用，计划挂载钉钉工作台自建应用。

> 当前为 **V4.2** 演示版本：数据全部来自前端 mock 种子，可在浏览器内完成全部角色的完整动线。

## 技术栈

| 项 | 版本 |
|---|---|
| React | 18.3 |
| TypeScript | 5.6 |
| Vite | 5.4 |
| Ant Design | 5.21 |
| 路由 | React Router 6（HashRouter） |
| 图表 | Recharts 2.13 |

## 快速开始

```bash
npm install
npm run dev        # 本地开发 http://localhost:5173
npm run build      # 产物输出到 dist/
npm run preview    # 预览构建产物 http://localhost:4173
npm run typecheck  # 类型检查
```

## 目录结构

```
src/
├── auth/          access.ts —— 全站页面级权限守卫（单一真源，15 条后台路由 + 11 条 C 端路由）
├── components/    ui.tsx 设计件（StatCard / SoftTag / HoverCard / Spotlight / HelperBar …）
├── layouts/       侧边导航与页面框架
├── mock/          types.ts 数据实体、seedOrg.ts 组织与用户种子、seedBiz.ts 业务种子
├── pages/
│   ├── b/         管理后台（14 个页面）
│   ├── c/         C 端业务（15 个页面）
│   └── e/         专家工作台
├── store/         Context + localStorage 数据层，含功能开关（Feature Flags）
├── styles/        global.css —— Ant Design 统一规范化层
└── theme.ts       设计令牌（主色 #FF6B35）
```

## 关键设计约定

- **权限单一真源**：所有页面级鉴权集中在 `src/auth/access.ts`，同时驱动菜单渲染、页内 403 与后台入口按钮。未登记路由 fail-closed 默认拒绝。
- **功能开关**：`src/store/store.tsx` 的 Feature Flags 遵循「关闭 ≡ 上一版行为」，无半生效状态。
- **字段只增不删**：废弃字段保留并标注 `@deprecated`，避免历史数据失效。
- **UI 复用优先**：新增组件前先确认 `src/components/ui.tsx` 是否已有可复用件，不要在页面里散落 `!important`。

## 演示基准日

`DEMO_TODAY = 2026-09-25`，所有相对日期以此为基准计算。

## 部署说明

构建产物为**纯静态文件**。若部署到域名**子路径**，需先在 `vite.config.ts` 中设置 `base: './'`，
否则 `index.html` 里的绝对路径 `/assets/...` 会导致白屏。

## 数据与隐私

本仓库所有用户、部门、业务数据均为演示用种子数据，不含任何真实凭据。
钉钉 AppKey / AppSecret 等凭据请放入 `.env`（已被 `.gitignore` 排除），切勿提交入库。
