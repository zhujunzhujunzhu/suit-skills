# Suit Skills Monorepo 与平台化任务拆解

## 1. 当前状态

已完成：

- `packages/core` 承载共享 skill 领域逻辑。
- `apps/cli` 承载 CLI 入口、命令层、本地 Web server/API helpers。
- `apps/local-web` 承载 React + Vite 本地 Web 控制台。
- `apps/desktop` 承载 Tauri 桌面端。
- `packages/server`、`packages/evaluator`、`packages/ui`、`apps/platform-web` 已建立骨架。
- 根目录旧 `src/`、`web/`、`apps/desktop/` 已删除。

当前验证基线：

```bash
npm run typecheck
npm test
cargo check --manifest-path apps/desktop/Cargo.toml
npm run build:sidecar
npm run test:e2e
```

## 2. 目标

将当前本地优先工具演进为可私有化部署的平台，同时保持现有 CLI、本地 Web 控制台和桌面端稳定。

原则：

- skills source、解析、缓存、安装、校验和目标目录逻辑留在 `packages/core`。
- 具体产品入口放在 `apps/*`。
- 平台后端行为放在 `packages/server`。
- 评价能力放在 `packages/evaluator`。
- 可复用前端 primitives 放在 `packages/ui`。
- 不把平台概念引入 core。

## 3. 里程碑

| 里程碑 | 状态 | 目标 | 产出 |
| --- | --- | --- | --- |
| M0 | 完成 | 基线整理 | 能力清单、迁移边界、测试基线 |
| M1 | 完成 | Monorepo 基础 | npm workspaces、package 骨架、tsconfig 分层 |
| M2 | 完成 | Core 抽取 | `packages/core` public API 和 tests |
| M3 | 完成 | Apps 迁移 | `apps/cli`、`apps/local-web`、`apps/desktop` |
| M4 | 下一步 | UI 基础沉淀 | `packages/ui` 组件、tokens、hooks |
| M5 | 下一步 | Server MVP | `packages/server` skills/source API |
| M6 | 下一步 | Platform Web MVP | `apps/platform-web` shell 和基础页面 |
| M7 | 下一步 | Evaluator MVP | 最小评价任务闭环 |
| M8 | 后续 | 私有化部署 | Docker、配置、SQLite/PostgreSQL、存储适配 |
| M9 | 后续 | 平台增强 | 权限、审计、队列、报告、备份恢复 |

## 4. M4: UI 基础沉淀

目标：将稳定、重复的前端 primitives 抽到 `packages/ui`。

| 编号 | 任务 | 验收 |
| --- | --- | --- |
| M4-1 | 定义 package 构建方式 | `packages/ui` 可独立 build/typecheck |
| M4-2 | 整理设计 tokens | 当前 local-web 样式仍可用 |
| M4-3 | 抽基础组件 | Button、Dialog、Tabs、EmptyState 可复用 |
| M4-4 | 抽布局 primitives | Shell、Sidebar、Topbar 可复用 |
| M4-5 | 编写使用文档 | 说明哪些内容属于 `packages/ui` |

不要过早把 `SkillDetailView`、`LibraryView`、`SourcesView` 这类业务页面移入 `packages/ui`。

## 5. M5: Server MVP

目标：创建可私有化部署的后端 API，并复用 `packages/core`。

| 编号 | 任务 | 验收 |
| --- | --- | --- |
| M5-1 | 选择 HTTP 框架 | `packages/server` 可启动 |
| M5-2 | 定义 API 错误格式 | core 错误可映射为 HTTP 响应 |
| M5-3 | 实现 health API | `GET /api/health` 可用 |
| M5-4 | 实现 skills API | list/search/detail 可用 |
| M5-5 | 实现 sources API | list/add/update/remove/refresh 可用 |
| M5-6 | 增加平台配置 | port、data dir、storage path 可配置 |
| M5-7 | 增加基础鉴权 | admin token 或同级最小保护 |
| M5-8 | 增加 server tests | API smoke 和错误处理测试通过 |

建议 MVP API：

```text
GET    /api/health
GET    /api/skills
GET    /api/skills/:name
GET    /api/sources
POST   /api/sources
PATCH  /api/sources/:id
DELETE /api/sources/:id
POST   /api/sources/:id/refresh
```

## 6. M6: Platform Web MVP

目标：新增在线/私有化部署前端，并与本地 Web 保持清晰边界。

| 编号 | 任务 | 验收 |
| --- | --- | --- |
| M6-1 | 初始化 `apps/platform-web` | dev server 可启动 |
| M6-2 | 接入 server API | health 和 skills API 可访问 |
| M6-3 | 建立平台 shell | Sidebar、Topbar、content area 存在 |
| M6-4 | 构建 skills 列表 | 搜索和 source 筛选可用 |
| M6-5 | 构建 skill 详情 | metadata、markdown、source 信息可见 |
| M6-6 | 构建 sources 页面 | source 管理闭环可用 |
| M6-7 | 构建审计页面 | 基础审计记录可见 |
| M6-8 | 构建设置页面 | 平台配置可见 |

边界：

- `apps/platform-web` 不直接访问本地文件系统。
- 所有数据通过 `packages/server` 获取。
- 不复用 `apps/local-web` 中仅适用于本地机器的假设。

## 7. M7: Evaluator MVP

目标：跑通最小 skill 评价闭环。

| 编号 | 任务 | 验收 |
| --- | --- | --- |
| M7-1 | 定义数据模型 | Evaluation、Dataset、Case、Result 类型清晰 |
| M7-2 | 实现 local runner | 单条 evaluation case 可运行 |
| M7-3 | 实现 rule scorer | 可输出 score 和 explanation |
| M7-4 | 记录结果 | 可输出标准 JSON 或持久化记录 |
| M7-5 | 接入 server | server 可创建和查询 evaluation jobs |
| M7-6 | 增加测试 | evaluator unit 和 smoke tests 通过 |

## 8. M8: 私有化部署

目标：提供真实可用的单机和标准私有化部署路径。

| 编号 | 任务 | 验收 |
| --- | --- | --- |
| M8-1 | 单机配置 | SQLite + local storage 可运行 |
| M8-2 | Dockerfile | server 和 platform-web 可容器化 |
| M8-3 | docker-compose | server + db + storage 可启动 |
| M8-4 | PostgreSQL 适配 | 标准部署可用 |
| M8-5 | MinIO/S3 适配 | skill 包和评价产物可存储 |
| M8-6 | 部署文档 | 内网部署步骤清晰 |

## 9. M9: 平台增强

后续方向：

- 用户和角色
- 多组织支持
- 审计日志
- 评价队列和 workers
- 报告中心
- 备份与恢复
- source 快照和版本锁定
- 离线导入/导出

## 10. 推荐下一步

1. 在 `packages/server` 实现 `GET /api/health`。
2. 将只读 skills/source API 接到 `packages/core`。
3. 初始化 `apps/platform-web` shell。
4. 定义最小 evaluator 数据模型。
5. 决定 `apps/cli/src/lib/web/*` 中哪些能力后续迁入 `packages/server`。
