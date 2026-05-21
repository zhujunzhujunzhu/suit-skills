# Suit Skills 产品与架构概览

## 项目定位

`suit-skills` 是一个用于管理 AI Agent skills 的本地工具，覆盖四种入口：

- CLI
- Web 控制台
- 桌面应用
- Platform Web Hub

## 当前核心能力

- 浏览、搜索、安装、更新、删除 skills
- 管理多个 remote source
- 管理安装目标和项目级目录
- 导出已安装 skill，复制 package，链接到其它目标
- 在 Web 中查看 skill 详情、翻译内容、编辑已安装 skill
- 提供 Tauri 桌面端和 sidecar 构建流程
- 提供 `apps/platform-web/` 平台 Hub，用于在线技能市场、上传审核、团队共享和平台部署

## 代码结构

- `apps/cli/`：CLI 入口、本地 Web API、桌面 sidecar 命令
- `apps/local-web/`：本地 Web 控制台
- `apps/platform-web/`：Platform Web Hub 前端
- `apps/desktop/`：Tauri 桌面壳
- `packages/core/`：source、skill、安装目标、配置等核心逻辑
- `packages/server/`：Platform Web Hub API 服务
- `packages/evaluator/`：评测相关扩展包
- `packages/ui/`：共享 UI 基础包
- `docs/`：用户文档、开发说明、功能说明

旧的根目录 `src/`、`web/`、`src-tauri/` 已迁移到 `apps/*` 与 `packages/*`。如果发现主应用目录比 Hub 分支少，是因为入口被合并到 workspace 后删除了重复旧副本，不代表功能丢失。

## 配置模型

- `sources`：远程源列表
- `defaultSource`：默认 source
- `agents`：安装目标目录映射
- `installTargets`：默认安装目标
- `installTargetsAuto`：是否自动合并本地项目目录
- `translation`：翻译配置
- `aiEditing`：AI 修改配置

## 相关文档

- [用户手册](./user-manual.md)
- [Web 控制台说明](./web-console.md)
- [Platform Web Hub](./platform-web-hub.md)
- [源管理说明](./source-management.md)
- [Skill 编辑与 AI 辅助](./skill-editing-and-ai.md)
- [翻译功能说明](./translation.md)
