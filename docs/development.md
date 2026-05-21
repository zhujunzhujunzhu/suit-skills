# 开发说明

## 仓库结构

当前项目采用 npm workspaces：

- `apps/cli/`：`suit-skills` CLI、本地 Web API、桌面 sidecar 命令
- `apps/local-web/`：本地 Web 控制台
- `apps/platform-web/`：Platform Web Hub 前端
- `apps/desktop/`：Tauri 桌面应用
- `packages/core/`：核心领域逻辑
- `packages/server/`：Platform Web Hub API
- `packages/evaluator/`：评测扩展包
- `packages/ui/`：共享 UI 基础包

旧的根目录 `src/`、`web/`、`src-tauri/` 已被 workspace 目录替代，不再维护第二套副本。

## 安装

```bash
npm install
```

## 本地运行

```bash
# CLI
npm run dev

# 本地 Web 控制台，自动启动 CLI API 与 Vite
npm run dev:web

# Platform Web Hub，自动启动平台 API 与 Vite
npm run dev:platform-web

# Tauri 桌面端
npm run tauri:dev
```

## 校验

```bash
npm run typecheck
npm test
npm run test:e2e
npm run test:e2e:platform
```

## 构建

```bash
# 构建全部 workspace
npm run build:all

# 只构建本地 Web
npm run build:web

# 构建 Platform Web Hub
npm run build:platform

# 构建桌面 sidecar 与安装包
npm run build:sidecar
npm run build:desktop
```

## 常用脚本

- `npm run sync:version`
- `npm run build:hub-cli`
- `npm run build:local-web`
- `npm run build:platform-web`
- `npm run dev:web:vite`
- `npm run dev:platform-web:vite`
- `npm run tauri:dev`

## Platform Web Hub

`apps/platform-web/` 是独立 Hub 应用，配套 API 位于 `packages/server/`。根脚本已经接入开发、构建、类型检查和平台 E2E：

- `npm run dev:platform-web`
- `npm run build:platform`
- `npm run build:platform-web`
- `npm run typecheck:platform`
- `npm run test:e2e:platform`

部署相关文件：

- `Dockerfile`
- `docker-compose.yml`
- `deploy/nginx.conf`
- `.env.example`
- `docs/platform-deployment-manual.md`
