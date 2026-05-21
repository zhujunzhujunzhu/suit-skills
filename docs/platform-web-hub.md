# Platform Web Hub

`platform-web` 是面向平台化使用场景的 Hub 入口，用于承载在线技能分发、团队协作、上传审核和平台管理能力。

## 与本地 Web 控制台的区别

- 本地 Web 控制台：通过 `suit-skills web` 启动，管理当前机器上的 source、skills、安装目标和桌面端配置。
- Platform Web Hub：面向平台侧，承载在线技能市场、组织级技能管理、发布审核、通知、收藏和团队共享。

## 当前仓库状态

当前仓库已恢复完整 Hub 相关 workspace：

- `apps/platform-web/`：Hub 前端。
- `packages/server/`：Hub API、认证、上传审核、source 发布和数据持久化。
- `packages/evaluator/`：评测扩展入口。
- `packages/ui/`：共享 UI 基础包。
- `packages/server/data/`：本地开发用的收藏、通知、搜索历史示例数据。

Hub 不会替代本地 Web 控制台；本地 Web 控制台已迁移到 `apps/local-web/`。

## 建议边界

Hub 当前边界：

- 技能市场浏览与技能详情页
- 技能上传、解析、审核与发布
- 收藏、通知和搜索历史
- source 管理与 Git 发布目标
- 登录认证、本地账号模式和 OAuth/OIDC 模式
- 平台 API 与 Docker/Nginx 部署

这些能力不阻塞本地 CLI、Web 控制台和桌面应用的离线使用。

## 常用脚本

- `npm run dev:platform-web`
- `npm run build:platform`
- `npm run build:platform-web`
- `npm run typecheck:platform`
- `npm run test:e2e:platform`

## 部署

平台部署说明见 [平台部署手册](./platform-deployment-manual.md)。本地复制环境变量时从 `.env.example` 开始，不要把真实数据库密码或会话密钥提交到仓库。
