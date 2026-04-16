# Suit Skills Web 需求规格说明书

## 1. 背景

当前 `suit-skills` 已具备 CLI 侧的核心能力，包括：

- 从配置的远程 source 拉取 skill 仓库并缓存。
- 扫描 skill 的 `meta.json`。
- 根据名称、版本、标签搜索 skill。
- 将 skill 安装到 Claude、Cursor、Codex、Copilot、`.agents` 等目标目录。
- 查看、更新、移除已安装 skill。

后续希望增加一个 Web 可视化入口，通过：

```bash
suit-skills web
```

启动本地 Web 页面，让用户可以用图形界面浏览、搜索、查看和管理 skills。

本需求建议采用 **React 工程化项目** 实现前端页面，而不是直接维护单个 HTML 文件。原因是该功能后续会自然扩展到搜索、详情、安装目标选择、安装状态、source 管理、设置页等复杂交互，React 项目更利于组件化、状态管理、路由和长期维护。

## 2. 产品目标

### 2.1 核心目标

提供一个本地运行的 Suit Skills Web 控制台，用于管理当前 CLI 能力覆盖的 skills 生命周期。

用户可以在 Web 页面中完成：

- 浏览远程 source 中可用的 skills。
- 搜索、过滤、按标签查看 skills。
- 查看 skill 详情，包括 `meta.json` 与 `SKILL.md`。
- 查看当前项目或全局环境中已安装的 skills。
- 复制安装命令。
- 在后续版本中直接执行安装、更新、移除等操作。

### 2.2 体验目标

- 启动简单：一条命令打开本地 Web 页面。
- 信息密度高：适合开发者快速比较、筛选和定位 skill。
- 与 CLI 一致：Web 不重新定义业务规则，只调用或复用 CLI 已有核心逻辑。
- 本地优先：默认运行在本地，不依赖远程 Web 服务。
- 可扩展：后续可增加 marketplace、发布、评分、团队源管理等能力。

## 3. 使用场景

### 3.1 首次浏览技能库

用户运行：

```bash
suit-skills web
```

系统启动本地服务并打开浏览器。用户进入技能库页面，看到默认 source 中的全部 skills，可通过搜索框和标签筛选快速定位目标 skill。

### 3.2 查看技能详情

用户点击某个 skill 后，进入详情视图，查看：

- skill 名称、版本、作者、标签、source。
- `meta.json` 原始元信息。
- `SKILL.md` 渲染后的说明内容。
- 安装命令。
- 本地安装状态。

### 3.3 复制安装命令

用户在详情页点击“复制安装命令”，复制：

```bash
suit-skills install code-review --agent claude
```

第一阶段优先保证命令复制稳定，不强制在网页内直接执行安装。

### 3.4 管理已安装 Skills

用户进入“已安装”页面，查看当前项目或全局目录下已安装的 skills，并能看到每个 skill 属于哪个目标环境，例如：

- `claude`
- `cursor`
- `codex`
- `agents`

后续版本支持直接更新或移除。

## 4. 范围

### 4.1 MVP 范围

第一阶段实现：

- 新增 `suit-skills web` 命令。
- 启动本地 HTTP 服务。
- 自动打开浏览器，默认地址如 `http://localhost:4587`。
- React 单页应用。
- 技能库列表页。
- 技能详情页或详情侧栏。
- 搜索、标签过滤、source 切换。
- 读取并渲染 `SKILL.md`。
- 显示安装状态。
- 复制安装命令。
- 提供基础错误、加载、空状态。

### 4.2 非 MVP 范围

以下能力不要求第一阶段完成，但设计时需要预留：

- Web 内直接安装 skill。
- Web 内直接更新、移除 skill。
- Web 内编辑 source 配置。
- Web 内编辑全局 config。
- Web 内创建或发布 skill。
- 多用户、登录、远程 Web 服务。
- 在线 marketplace。
- 权限管理和团队协作。

## 5. 技术方案

### 5.1 推荐技术栈

前端：

- React
- TypeScript
- Vite
- React Router
- CSS Modules 或普通 CSS 文件

服务端：

- Node.js 内置 `http` 模块，或轻量服务封装。
- 不建议第一阶段引入 Express，除非 API 复杂度明显上升。

构建：

- Web 前端独立构建。
- CLI 构建时同时构建 Web 静态资源。
- 发布 npm 包时包含 Web 构建产物。

### 5.2 推荐目录结构

```text
web/
  index.html
  package.json 或复用根 package.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    routes/
      LibraryPage.tsx
      SkillDetailPage.tsx
      InstalledPage.tsx
      SourcesPage.tsx
    components/
      AppShell.tsx
      SkillCard.tsx
      SkillDetail.tsx
      SearchToolbar.tsx
      TagFilter.tsx
      StatusBadge.tsx
    api/
      client.ts
    styles/
      tokens.css
      app.css

src/
  commands/
    web.ts
  lib/
    web/
      server.ts
      api.ts
      assets.ts
```

也可以将 React 项目放在：

```text
src/web/client/
```

但独立 `web/` 目录更清晰，便于 Vite 配置和后续前端工程扩展。

### 5.3 CLI 命令设计

新增命令：

```bash
suit-skills web
```

参数：

```bash
suit-skills web --port 4587
suit-skills web --host 127.0.0.1
suit-skills web --source default
suit-skills web --source all
suit-skills web --no-open
```

行为：

- 默认监听 `127.0.0.1`，避免暴露到局域网。
- 默认端口 `4587`。
- 如果端口被占用，可以自动尝试下一个端口，或输出明确错误。
- 默认启动后自动打开浏览器。
- `--no-open` 只启动服务并输出访问地址。

输出示例：

```text
Suit Skills Web started
Local: http://127.0.0.1:4587
```

### 5.4 Web 服务职责

本地服务负责两类内容：

1. 静态资源：
   - React 构建后的 `index.html`、JS、CSS、assets。

2. 本地 API：
   - 读取 CLI 配置。
   - 刷新 source 缓存。
   - 扫描 skills。
   - 读取 `meta.json` 和 `SKILL.md`。
   - 查询安装状态。
   - 后续执行安装、更新、移除。

前端不直接访问文件系统，所有本地能力通过 API 完成。

## 6. API 设计

### 6.1 获取技能列表

```http
GET /api/skills?source=default&q=react&tag=frontend
```

返回：

```json
{
  "items": [
    {
      "name": "react-helper",
      "version": "1.0.0",
      "description": "React 开发助手",
      "author": "suit-skills",
      "tags": ["react", "frontend", "components"],
      "sourceName": "default",
      "installed": true
    }
  ]
}
```

### 6.2 获取技能详情

```http
GET /api/skills/react-helper?source=default
```

返回：

```json
{
  "meta": {
    "name": "react-helper",
    "version": "1.0.0",
    "description": "React 开发助手",
    "author": "suit-skills",
    "tags": ["react", "frontend", "components"]
  },
  "sourceName": "default",
  "skillDir": "...",
  "markdown": "# React Helper\n...",
  "installedTargets": ["claude"]
}
```

### 6.3 获取已安装列表

```http
GET /api/installed?scope=project
GET /api/installed?scope=global
GET /api/installed?agent=claude
```

返回：

```json
{
  "items": [
    {
      "target": "claude",
      "name": "code-review",
      "path": ".claude/skills/code-review"
    }
  ]
}
```

### 6.4 获取 Source 配置

```http
GET /api/sources
```

返回：

```json
{
  "defaultSource": "default",
  "sources": [
    {
      "name": "default",
      "url": "https://gitee.com/digital-construction-center_1/suit-skills-lib.git",
      "enabled": true
    }
  ]
}
```

### 6.5 后续安装 API

不要求 MVP 实现，但预留：

```http
POST /api/install
```

请求：

```json
{
  "identifier": "code-review",
  "source": "default",
  "targets": ["claude", "cursor"],
  "global": false,
  "strategy": "overwrite"
}
```

返回：

```json
{
  "results": [
    {
      "target": "claude",
      "status": "installed",
      "path": ".claude/skills/code-review"
    }
  ]
}
```

## 7. 页面设计需求

设计方向参考 `docs/stich1` 与 `docs/stich2`：

- 深色开发者控制台。
- 高信息密度。
- 左侧导航。
- 顶部面包屑和全局操作。
- 技能列表与技能详情形成主工作区。
- 使用精密、克制的边界和分层，而不是大量粗边框。

### 7.1 应用外壳

包含：

- 左侧导航：
  - Sources
  - Installed
  - Tags
  - Settings 后续预留
- 顶部栏：
  - Suit Skills 标识
  - 当前页面或当前 skill 名称
  - 设置入口
- 主内容区：
  - 列表页、详情页或组合式工作台。

### 7.2 技能库页面

页面元素：

- 搜索框。
- Source 切换。
- 标签筛选。
- 技能卡片列表。
- 空状态。
- 加载状态。
- 错误状态。

技能卡片展示：

- 名称。
- 版本。
- 描述。
- 标签。
- source。
- 是否已安装。

### 7.3 技能详情页面

页面元素：

- 名称、描述、版本、作者、标签、source。
- 安装状态。
- 复制安装命令按钮。
- `SKILL.md` 渲染内容。
- 原始 `meta.json` 展示入口。
- 安装目标提示。

### 7.4 已安装页面

页面元素：

- 安装目标筛选：
  - project
  - global
  - claude
  - cursor
  - codex
  - agents
  - copilot
- 已安装 skill 列表。
- 安装路径。
- 后续操作按钮：
  - update
  - remove
  - open folder

MVP 中可以先只展示，不执行修改操作。

## 8. 数据与类型

### 8.1 Web Skill 摘要类型

```ts
interface WebSkillSummary {
  name: string;
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
  sourceName: string;
  installed: boolean;
}
```

### 8.2 Web Skill 详情类型

```ts
interface WebSkillDetail {
  meta: SkillMeta;
  sourceName: string;
  skillDir: string;
  markdown: string;
  installedTargets: string[];
}
```

### 8.3 API 错误类型

```ts
interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

错误码示例：

- `SOURCE_NOT_FOUND`
- `SKILL_NOT_FOUND`
- `INVALID_SKILL_NAME`
- `CACHE_REFRESH_FAILED`
- `FILE_READ_FAILED`
- `INSTALL_FAILED`

## 9. 安全与边界

### 9.1 本地服务安全

- 默认只监听 `127.0.0.1`。
- 不默认监听 `0.0.0.0`。
- 后续如支持 `--host 0.0.0.0`，需要明确提示风险。

### 9.2 文件访问边界

- API 只能访问已知目录：
  - source cache 目录。
  - 配置中声明的 agent skills 目录。
  - 当前项目下的安装目标目录。
- 不允许通过请求参数读取任意文件。
- skill 名称必须复用现有 `validateSkillName` 规则。

### 9.3 修改操作边界

MVP 不直接执行安装、更新、删除，只提供复制命令。

后续如支持 Web 内执行修改操作，需要：

- 明确展示目标路径。
- 明确展示覆盖策略。
- 对删除操作做二次确认。
- API 复用现有安装、更新、移除逻辑。

## 10. 编码与内容要求

当前仓库中部分中文文档或 `meta.json` 可能存在乱码。Web 功能需要明确：

- 新增文档和 Web 源码统一使用 UTF-8。
- 页面渲染使用 `meta charset="utf-8"`。
- 读取 `meta.json` 和 `SKILL.md` 时默认按 UTF-8。
- 如果读取结果出现明显异常，页面应给出提示，而不是静默展示乱码。

后续可以增加 `suit-skills doctor` 或 Web 内诊断能力，帮助发现非 UTF-8 文件。

## 11. 构建与脚本

建议新增脚本：

```json
{
  "scripts": {
    "web:dev": "vite --config web/vite.config.ts",
    "web:build": "vite build --config web/vite.config.ts",
    "web:preview": "vite preview --config web/vite.config.ts",
    "build": "tsc && npm run web:build"
  }
}
```

如果不希望影响现有 `build`，也可以拆成：

```json
{
  "scripts": {
    "build": "tsc",
    "build:all": "tsc && npm run web:build"
  }
}
```

最终策略需结合 npm 发布产物决定。

## 12. 验收标准

### 12.1 命令验收

- `suit-skills web` 能启动本地服务。
- 控制台输出可访问 URL。
- 默认自动打开浏览器。
- `suit-skills web --no-open` 不打开浏览器。
- `suit-skills web --port <port>` 使用指定端口。

### 12.2 页面验收

- 页面能显示可用 skills。
- 搜索能按名称、描述、标签过滤。
- 标签筛选生效。
- 点击 skill 能显示详情。
- 详情页能渲染 `SKILL.md`。
- 能显示已安装状态。
- 能复制安装命令。
- 无匹配结果时有空状态。
- source 拉取失败时有错误状态，并尽量使用本地缓存。

### 12.3 工程验收

- React 项目可独立 dev。
- Web 构建产物可由 CLI 本地服务托管。
- TypeScript 类型检查通过。
- 不破坏现有 CLI 命令。
- 不破坏现有测试。

### 12.4 安全验收

- 默认监听 `127.0.0.1`。
- API 不允许读取任意路径。
- API 对 skill 名称、source 名称、target 名称做校验。
- MVP 不在 Web 内执行破坏性操作。

## 13. 分阶段计划

### 阶段 1：Web MVP

- 搭建 React + Vite 项目。
- 新增 `suit-skills web` 命令。
- 本地服务托管 React 静态资源。
- 实现 skills 列表 API。
- 实现 skill 详情 API。
- 实现安装状态 API。
- 实现列表页、详情页、搜索和复制命令。

### 阶段 2：管理能力

- Web 内安装 skill。
- 安装目标选择。
- 冲突策略选择。
- 更新 skill。
- 移除 skill。
- 打开本地目录。

### 阶段 3：配置能力

- Source 管理。
- 默认 source 切换。
- 安装目标配置。
- Agent 路径配置。
- 诊断乱码、路径和 Git 可用性问题。

### 阶段 4：高级能力

- Skill 创建向导。
- Skill 发布流程。
- 多 source 聚合市场视图。
- 团队共享配置。
- 版本对比与升级日志。
