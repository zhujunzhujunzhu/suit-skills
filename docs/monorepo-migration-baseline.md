# Suit Skills Monorepo 迁移基线

本文记录当前迁移后的仓库结构。根目录旧 `src/`、`web/`、`apps/desktop/` 已经删除。

## 1. 当前产品入口

| 入口 | 当前路径 | 职责 |
| --- | --- | --- |
| CLI | `apps/cli` | `suit-skills` 命令注册、参数解析、本地 Web server wrapper |
| 本地 Web | `apps/local-web` | React + Vite 本地 Web 控制台 |
| 桌面端 | `apps/desktop` | Tauri 桌面应用、icons、capabilities、Rust commands、sidecar 集成 |
| Core domain | `packages/core` | 共享 source、cache、skill parsing、install、config、target、baseline 逻辑 |
| Platform API | `packages/server` | 在线/私有化部署后端骨架 |
| Evaluator | `packages/evaluator` | skill 评价骨架 |
| Shared UI | `packages/ui` | 可复用前端包骨架 |
| Platform Web | `apps/platform-web` | 在线/私有化部署前端骨架 |

## 2. 当前目录结构

```text
skills-cli/
  packages/
    core/
      src/
        baseline/
        cache/
        config/
        install/
        skills/
        sources/
        targets/
        types/
        utils/
    server/
    evaluator/
    ui/
  apps/
    cli/
      src/
        cli/
        commands/
        lib/web/
        types/
        utils/
    local-web/
      src/
        api/
        i18n/
        lib/
        locales/
        styles/
        theme/
        ui/
        views/
    desktop/
      src/
      capabilities/
      icons/
      Cargo.toml
      tauri.conf.json
    platform-web/
```

## 3. 模块迁移映射

| 原路径 | 当前路径 | 说明 |
| --- | --- | --- |
| `src/index.ts` | `apps/cli/src/index.ts` | CLI executable entry |
| `src/cli/*` | `apps/cli/src/cli/*` | CLI helpers、context、program setup |
| `src/commands/*` | `apps/cli/src/commands/*` | CLI command implementations |
| `apps/cli/src/lib/web/*` | `apps/cli/src/lib/web/*` | 本地 Web API/server helpers |
| `src/lib/skills.ts` | `packages/core/src/skills/index.ts` | skill metadata、frontmatter、detail、search |
| `src/lib/git.ts` | `packages/core/src/sources/git.ts` | Git source clone/pull helpers |
| `src/lib/cache.ts` | `packages/core/src/cache/index.ts` | source cache and refresh |
| `src/lib/config.ts` | `packages/core/src/config/index.ts` | config schema、defaults、source mirrors |
| `src/lib/install.ts` | `packages/core/src/install/index.ts` | install、update、conflict handling |
| `src/lib/install-targets.ts` | `packages/core/src/targets/install-targets.ts` | install target definitions |
| `src/lib/agents.ts` | `packages/core/src/targets/agents.ts` | installed skill discovery and target path resolution |
| `src/lib/baseline.ts` | `packages/core/src/baseline/index.ts` | installed skill baseline handling |
| `src/utils/*` | `packages/core/src/utils/*` | shared filesystem、path、validation、module helpers |
| `src/utils/output.ts` | `apps/cli/src/utils/output.ts` | CLI-specific output formatting |
| `src/types/index.ts` | `packages/core/src/types/index.ts` 与 `apps/cli/src/types/index.ts` | shared types in core, CLI-only types in CLI |
| `web/*` | `apps/local-web/*` | local React + Vite Web app |
| `apps/desktop/*` | `apps/desktop/*` | Tauri desktop app |

## 4. 包边界

- `packages/core` 不依赖 HTTP、React、Tauri、auth、tenant、database、evaluator scheduling。
- `apps/cli` 可以依赖 `packages/core`，并保留本地机器编排能力，例如 `suit-skills web`。
- `apps/local-web` 是本地浏览器 UI，通过本地 Web API 或 Tauri IPC 获取数据。
- `apps/desktop` 打包 `apps/local-web` 构建产物，并通过 sidecar/Tauri command layer 调用 CLI 能力。
- `packages/server`、`packages/evaluator`、`packages/ui`、`apps/platform-web` 面向后续私有化/在线平台能力。

## 5. 构建入口

| 命令 | 说明 |
| --- | --- |
| `npm run build:workspaces` | 构建所有带 build script 的 packages/apps |
| `npm run build:all` | 当前完整 JS/Web 构建 |
| `npm run build:web` | 构建 `apps/local-web` 到 `dist/web` |
| `npm run build:sidecar` | 将 CLI dist 打包到 `apps/desktop/binaries` |
| `npm run build:desktop` | 构建 workspaces、sidecar 和 Tauri desktop bundles |
| `npm run dev:web` | 启动本地 API 和 Vite Web console |
| `npm run dev:web:vite` | 只启动 `apps/local-web` Vite dev server |

## 6. 验证基线

结构变更后建议运行：

```bash
npm run typecheck
npm test
cargo check --manifest-path apps/desktop/Cargo.toml
npm run build:sidecar
npm run test:e2e
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
