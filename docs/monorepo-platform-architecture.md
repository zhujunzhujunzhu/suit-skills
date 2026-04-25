# Suit Skills Monorepo 与私有化平台架构

## 1. 背景

`suit-skills` 已经从根目录混合应用迁移为 monorepo。当前仓库同时包含本地 CLI、本地 Web 控制台、Tauri 桌面端，以及未来在线/私有化部署平台所需的后端、评价器和前端骨架。

核心目标是：skills source 获取、解析、缓存、安装、校验、配置和目标目录逻辑只维护一套，并由 CLI、本地 Web、桌面端和未来平台共同复用。

## 2. 当前目录结构

```text
skills-cli/
  packages/
    core/              # skills/source/cache/install/config/targets/baseline 领域逻辑
    server/            # 在线/私有化部署后端 API 骨架
    evaluator/         # skill 评价与任务运行骨架
    ui/                # 可复用 Web UI 骨架
  apps/
    cli/               # 当前 CLI
    desktop/           # Tauri 桌面端
    local-web/         # 本地 React + Vite Web 控制台
    platform-web/      # 在线/私有化部署平台前端骨架
  docs/
  tests/
```

已完成的目录迁移：

| 原路径 | 当前路径 |
| --- | --- |
| `src/` | `apps/cli/` 与 `packages/core/` |
| `web/` | `apps/local-web/` |
| `apps/desktop/` | `apps/desktop/` |

## 3. 架构分层

```text
Apps
  apps/cli
  apps/local-web
  apps/desktop
  apps/platform-web

Platform Services
  packages/server
  packages/evaluator

Core Domain
  packages/core

Infrastructure
  Git / filesystem / database / object storage / queue / agent runtime
```

## 4. Core Domain

`packages/core` 是稳定领域层，只处理 skills 本身和本地 skill 管理能力。

当前模块：

```text
packages/core/src/
  baseline/
  cache/
  config/
  install/
  skills/
  sources/
  targets/
  types/
  utils/
  index.ts
```

core 可以负责：

- source 配置、镜像、启停和刷新
- Git source clone/pull
- skill metadata、`SKILL.md` frontmatter、详情读取和搜索
- 安装、冲突处理、基线恢复
- 安装目标解析
- 本地配置 schema 与默认值
- 共享类型和工具函数

core 不应该负责：

- HTTP 框架
- React 页面
- Tauri IPC
- 用户、租户、权限、登录
- 数据库表结构
- 平台评价任务调度
- 审计、队列、对象存储和部署策略

## 5. Apps

### apps/cli

CLI 负责命令注册、参数解析、终端输出，以及本地 Web server 启动入口。

```text
apps/cli/src/
  cli/
  commands/
  lib/web/
  types/
  utils/
  index.ts
```

说明：

- `apps/cli/src/commands/*` 是 CLI 命令层。
- `apps/cli/src/lib/web/*` 当前承载本地 Web API/server/zip 等本地服务能力。
- CLI 应优先调用 `@suit-skills/core` public API。

### apps/local-web

本地 Web 控制台面向单机使用，也被桌面端复用。

```text
apps/local-web/
  src/
    api/
    i18n/
    lib/
    locales/
    styles/
    theme/
    ui/
    views/
  vite.config.ts
```

构建产物输出到：

```text
dist/web/
```

运行模式：

- 浏览器模式访问本地 Node Web API。
- 桌面模式通过 Tauri IPC 和 CLI sidecar 调用本地能力。

### apps/desktop

Tauri 桌面端负责原生窗口、capabilities、icons、Rust commands 和 sidecar 集成。

```text
apps/desktop/
  src/
  capabilities/
  icons/
  binaries/
  Cargo.toml
  tauri.conf.json
```

关键路径：

- Tauri manifest: `apps/desktop/Cargo.toml`
- Tauri config: `apps/desktop/tauri.conf.json`
- frontend dist: `../../dist/web`
- sidecar output: `apps/desktop/binaries/`
- bundle output: `apps/desktop/target/release/bundle/`

### apps/platform-web

未来平台前端应通过 `packages/server` API 获取数据，不直接访问本地文件系统，也不复用 `apps/local-web` 中只适用于本地机器的假设。

## 6. 平台包

### packages/server

`packages/server` 负责把 core 能力暴露为 HTTP API，并承载平台级能力：

- API 鉴权
- 用户和权限
- 平台配置
- skills API
- sources API
- evaluation API
- 审计日志
- 数据库访问
- 对象存储适配
- 队列适配

它不应重复实现 skill 解析、source 刷新、安装规则和搜索规则，这些都应委托给 `packages/core`。

### packages/evaluator

`packages/evaluator` 负责 skill 评价任务、运行器、评分器和结果记录。

建议概念：

| 概念 | 说明 |
| --- | --- |
| Evaluation | 一次完整评价任务 |
| Dataset | 输入用例和期望结果 |
| Case | 单条评价用例 |
| Runner | 执行环境 |
| Scorer | 评分逻辑 |
| Report | 评价结果报告 |

### packages/ui

`packages/ui` 用于沉淀可复用的前端基础能力，不承载业务页面。

适合沉淀：

- 基础组件
- 布局组件
- hooks
- i18n helpers
- theme tokens
- 通用 API client helpers

业务页面仍保留在 `apps/local-web` 或 `apps/platform-web`。

## 7. 依赖方向

推荐依赖：

```text
apps/cli           -> packages/core
apps/local-web     -> packages/ui
apps/desktop       -> dist/web + apps/cli sidecar
apps/platform-web  -> packages/ui + packages/server API
packages/server    -> packages/core + packages/evaluator
packages/evaluator -> packages/core
packages/ui        -> no business app dependency
```

禁止方向：

- `packages/core` 依赖 `apps/*`
- `packages/core` 依赖 HTTP、React 或 Tauri
- `packages/ui` 依赖业务 app
- `apps/platform-web` 直接访问本地文件系统

## 8. 构建与验证

常用命令：

```bash
npm run typecheck
npm test
npm run build:all
npm run test:e2e
cargo check --manifest-path apps/desktop/Cargo.toml
npm run build:sidecar
```

npm 包应包含：

```text
apps/cli/dist/index.js
dist/web/index.html
node_modules/@suit-skills/core/dist/index.js
```

npm 包不应包含旧根路径：

```text
src/
web/
apps/desktop/
```

## 9. 后续架构工作

1. 收紧 `apps/cli/src/lib/web/*` 与未来 `packages/server` 的边界。
2. 为 `packages/server` 选择 HTTP 框架。
3. 明确 `apps/local-web` 与 `apps/platform-web` 的产品边界。
4. 定义最小 evaluator 数据模型。
5. 只将稳定、重复的 UI primitives 抽到 `packages/ui`。
