# Platform Web Hub

`platform-web` 是面向平台化使用场景的 Hub 入口，用于承载后续的在线技能分发、团队协作和平台管理能力。

## 与本地 Web 控制台的区别

- 本地 Web 控制台：通过 `suit-skills web` 启动，管理当前机器上的 source、skills、安装目标和桌面端配置。
- Platform Web Hub：面向平台侧，适合承载在线技能市场、组织级技能管理、发布审核和团队共享。

## 当前仓库状态

当前仓库已恢复 `apps/platform-web/`，并保留为独立 Hub 应用。它不会替代根目录的本地 Web 控制台。

## 建议边界

Hub 后续应优先覆盖：

- 技能市场浏览
- 技能详情页
- 技能发布与审核
- 团队空间和权限
- 远程 source / skill 元数据管理
- 下载本地 CLI、桌面端和安装指引

这些能力不应阻塞本地 CLI、Web 控制台和桌面应用的离线使用。

## 后续接入建议

当前接入脚本：

- `npm run dev:platform-web`
- `npm run build:platform`
- `npm run build:platform-web`
- `npm run typecheck:platform`
