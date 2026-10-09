# STACK_PROFILE · Phase 0 技术栈探测

> 探测时间：2026-10-09 11:25 · 只读侦察，未修改任何文件
> 项目：AI 赋能工作台 `ai-workbench/`

## 1. 运行时与语言

| 项 | 值 | 状态 |
|---|---|---|
| Node | v22.22.2（本机）；服务器生产环境 Node 18（systemd `ai-workbench`） | ✅ |
| 语言 | TypeScript 5.x（前端+server 为 `.mjs` ESM） | ✅ |
| 包管理器 | npm（存在 `package-lock.json`） | ✅ |
| 构建工具 | Vite 5 | ✅ |

## 2. 依赖矩阵

**dependencies（10）**
`react` · `react-dom` · `react-router-dom` · `antd` · `@ant-design/icons` · `dayjs` · `recharts` · `pg` · `@wangeditor/editor` · `@wangeditor/editor-for-react` · `dompurify`

**devDependencies（6）**
`typescript` · `vite` · `@vitejs/plugin-react` · `@types/react` · `@types/react-dom` · `@types/dompurify`

> ⚠️ **无 ESLint**（无 `.eslintrc*` / `eslint.config.*`）→ L2 的 Lint 环节将 SKIP
> ⚠️ **无单元测试框架**（无 vitest / jest 配置）→ L3 采用「自研冒烟脚本」替代

## 3. 服务端

- 入口 `server/index.mjs`（原生 Node HTTP，**无 Express**）
- 模块：`session.mjs`（HMAC token）· `dataScope.mjs`（按身份裁剪/合并保护）· `dingtalkAuth.mjs`（钉钉 OAuth2 两步换身份）· `stateStore.mjs`（file/pg 双驱动）· `fileRepo.mjs` · `zip.mjs`
- 存储：PostgreSQL（生产，`DATABASE_URL`）+ file（本地兜底）
- 端口：`FILE_PORT || PORT || 8080`

**接口清单（8 个）**
```
GET/POST /api/auth/dingtalk/config     钉钉免登能力探测
GET      /api/auth/dingtalk/start      取授权 URL（state 做 CSRF）
POST     /api/auth/dingtalk/exchange   code → unionId + 签发数据面 token
GET      /api/files/health             文件服务健康检查（含 driver: pg|file）
POST     /api/files/upload             文件上传（biz_type 白名单）
GET/POST /api/state                    整包读写（会话鉴权 + 按身份裁剪/合并保护）
GET      /api/state/version            乐观锁版本号（不裁剪，供轮询）
POST     /api/state/reset              演示数据复原
```

## 4. 前端架构

- **双 UI 版本并存**：`?ui=v1|v2` 切换（`src/ui/version.ts`），页面用 `V2Page` 包装器二选一
- 路由：**HashRouter**（`src/App.tsx`，40 个 `<Route>`，34 实体路由）
- 状态：React Context（`src/store/store.tsx`）+ 全量 DB 整包
- 样式：v1 用 `theme.ts` 常量 + `styles/global.css`；v2 用 CSS 令牌 `theme/v2/tokens.css` + `template.css`
- 鉴权：钉钉 OAuth2 免登（`src/pages/Login.tsx` 在 Router 外拦截未登录）+ `authLocked` 锁死身份切换

## 5. 测试资产（自研冒烟脚本，12 组）

| 脚本 | 覆盖 |
|---|---|
| `guard` | 路由/权限守卫回归 |
| `smoke:v7` `smoke:pipeline` | 提交流水线规则引擎 |
| `smoke:scene` | 首页场景卡口径 |
| `smoke:note` | 口径注解白名单 |
| `smoke:message` | 消息已读口径 |
| `smoke:dept` | 部门树多选 |
| `smoke:import` | 导入容错 |
| `smoke:scope` | 数据面会话鉴权（裁剪/合并保护） |
| `smoke:overflow` | 长文本防溢出 |
| `smoke:profilelink` | 个人中心明细跳转 |
| `smoke:topic` | 选题池详情 |
| `smoke:files` | 文件服务 |

> ✅ 有断言总量（guard 526 + 其余各组），**无覆盖率工具**

## 6. 部署与 CI

| 项 | 值 |
|---|---|
| CI | ❌ **无 GitHub Actions**（无 `.github/`）→ 全部质量门禁靠本地手动跑 |
| 部署 | `scripts/deploy-company-server.sh`（tar → 上传 → 备份 → 解压 → 重启 → 指纹比对） |
| 生产 | `https://aihrbp.yunzhangfang.com`，systemd `ai-workbench`，PG 16 |
| 数据初始化 | `server/data/`（本地 file 兜底）+ 后端首访播种 |

## 7. 数据规模（本地库）

501 人 / 164 部门 / 13 案例 / 21 选题 / 11 悬赏 / 8 评分卡 / 3 商城商品 · DB version ≈ 184

## 8. 环境事实缺口（标 UNKNOWN 的项）

| 项 | 状态 |
|---|---|
| 单元测试覆盖率 | `UNKNOWN`（无覆盖率工具，非缺失，是没接） |
| Lint 规则集 | `UNKNOWN`（项目未接 ESLint） |
| CI 门禁 | `UNKNOWN`（无 CI 配置） |
| 生产日志打点 | `UNKNOWN`（服务端 `journalctl` 无业务日志，鉴权/审核链路无留痕） |

## 9. Phase 0 结论

**技术栈健康度：良**。类型检查严格（tsc 全量）、冒烟断言覆盖 12 个业务口径、有部署闭环与线上验收机制。
**结构性风险（测试中重点关注）**：
1. 无 CI → 回归完全依赖人工执行，易漏
2. 无服务端日志 → 线上问题排查困难（已在免登排查中实测印证）
3. 双 UI 版本并存 → **同一用例 v1/v2 结果可能不一致**（已发现 1 例，见 BUG-01）
4. 整包 DB 读写 → 并发写风险靠乐观锁兜底，需验冲突路径