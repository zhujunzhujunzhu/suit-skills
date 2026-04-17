# Suit Skills Web 需求规格说明

## 1. 背景

`suit-skills` 当前已经具备 CLI 侧的核心能力，包括从配置的远程 source 拉取 skill 仓库、缓存、本地安装、查看、更新和删除 skill。后续需要增加一个本地 Web 控制台，通过：

```bash
suit-skills web
```

启动本地 Web 页面，让用户用图形界面完成 skill 的浏览、搜索、安装、管理、删除和分享。

本阶段的产品重点是“技能消费与本地管理”，不是“技能创作”。Web 端不提供新建 skill、编辑 skill、发布 skill 的能力。

## 2. 产品定位

Suit Skills Web 是一个本地运行的开发者控制台，主要用于：

- 浏览 source 中可安装的 skills。
- 搜索、筛选、查看 skill 详情。
- 将未安装的 skill 安装到本地目标目录。
- 管理已经安装的 skills。
- 对未安装的 skill 分享安装命令。
- 对已安装的 skill 导出 zip 包用于分享。

Web 端不重新定义业务规则，应复用 CLI 已有的配置、source、缓存、安装目标、路径校验和删除逻辑。

## 3. 核心原则

### 3.1 使用标准 Skill 结构

后续不再要求每个 skill 提供独立的 `meta.json`。skill 的元信息统一放在 `SKILL.md` 文件顶部的 frontmatter 中。

推荐结构：

```text
skill-name/
  SKILL.md
  assets/        可选
  scripts/       可选
  references/    可选
  其他文件       可选
```

`SKILL.md` 示例：

```md
---
name: code-review
version: 1.0.1
description: 代码审查技能，自动检查代码质量、风格和潜在问题
author: suit-skills
tags:
  - review
  - quality
  - best-practices
---

# Code Review

这里是 skill 的正文内容。
```

### 3.2 `meta.json` 迁移策略

目标状态：

- Web 和 CLI 都以 `SKILL.md` frontmatter 作为主要元信息来源。
- 不再在 Web 详情页展示 `meta.json`。
- 新的标准 skill 不需要 `meta.json`。

过渡期可以考虑：

- 如果 `SKILL.md` 存在 frontmatter，优先使用 frontmatter。
- 如果没有 frontmatter，但存在旧版 `meta.json`，可短期作为 fallback。
- 如果二者都缺失，仍允许识别为 skill，但标记为“信息不完整”。

长期目标：

- 移除对 `meta.json` 的依赖。
- 所有新 source 中的 skill 都采用 `SKILL.md` frontmatter。

### 3.3 命令复制统一使用 `npx`

前端所有“复制命令”“分享安装命令”都应优先生成：

```bash
npx suit-skills@latest install <skill-name>
```

而不是假设用户已经全局安装了 `suit-skills`。

根据上下文可追加参数：

```bash
npx suit-skills@latest install code-review --source default
npx suit-skills@latest install code-review --agent claude
npx suit-skills@latest install code-review --env claude,codex,agents
```

## 4. 用户场景

### 4.1 浏览可用 Skills

用户运行：

```bash
suit-skills web
```

系统启动本地服务并打开浏览器。用户进入技能库页面后，可以看到来自默认 source 或所有启用 source 的 skills，并通过搜索、标签、source 过滤快速定位目标 skill。

### 4.2 安装未安装 Skill

用户在技能库卡片或详情页点击“安装”。系统展示安装目标选择，例如：

- `claude`
- `cursor`
- `codex`
- `agents`
- `copilot`
- `skills`

用户确认后，Web 端通过本地 API 调用 CLI 侧安装逻辑完成安装。

如果目标目录已经存在同名 skill，应展示冲突处理选项：

- 跳过
- 覆盖
- 重命名

### 4.3 分享未安装 Skill

未安装的 skill 本地没有可导出的完整目录，因此分享方式是复制可复现的安装命令。

分享内容示例：

```text
Skill: code-review
Version: 1.0.1
Source: default
Tags: review, quality, best-practices

Install:
npx suit-skills@latest install code-review --source default
```

### 4.4 搜索和管理已安装 Skills

用户进入 Installed 页面，可以查看当前项目或全局环境中已经安装的 skills。

已安装页面必须支持搜索，搜索范围包括：

- skill 名称
- 描述
- 标签
- 安装路径
- target / agent
- source，如果能够识别

### 4.5 删除已安装 Skill

用户在已安装列表或详情页点击“删除”。系统必须二次确认，并展示：

- skill 名称
- 安装目标
- scope
- 实际删除路径

用户确认后，后端只能删除已知安装目录下的 skill 目录，不能允许前端传入任意路径删除。

### 4.6 分享已安装 Skill

已安装 skill 可能来自多种来源，例如：

- 通过 `suit-skills` 安装
- 用户手动放入目录
- 其他工具生成
- 团队项目中已有
- 历史版本遗留

因此不能假设它一定能通过 `source + name` 复现。对已安装 skill，分享方式应以当前本地目录为准，直接导出 zip 包。

zip 导出建议结构：

```text
code-review/
  SKILL.md
  assets/
  scripts/
  references/
```

zip 文件名建议：

```text
code-review-1.0.1.zip
```

如果版本未知：

```text
code-review.zip
```

## 5. 范围

### 5.1 MVP 范围

第一阶段实现：

- 新增 `suit-skills web` 命令。
- 启动本地 HTTP 服务。
- 自动打开浏览器，默认地址如 `http://127.0.0.1:4587`。
- React 单页应用。
- 技能库列表页。
- 技能详情页或详情侧栏。
- 搜索、标签过滤、source 切换。
- 从 `SKILL.md` frontmatter 读取 skill 元信息。
- 渲染 `SKILL.md` 正文内容。
- 显示安装状态。
- 未安装 skill 支持安装。
- 未安装 skill 支持复制 `npx suit-skills@latest install ...` 命令。
- 未安装 skill 支持分享安装命令。
- 已安装 skill 列表。
- 已安装 skill 搜索。
- 已安装 skill 删除。
- 已安装 skill 导出 zip 包。
- Source 新增、删除、启用和禁用。
- 提供基础加载、空状态和错误状态。

### 5.2 非 MVP 范围

以下能力不要求第一阶段完成：

- Web 内新建 skill。
- Web 内编辑 `SKILL.md`。
- Web 内发布 skill。
- Web 内导入 zip 包。
- 在线 marketplace。
- 登录、多用户、权限系统。
- 评分、评论、收藏。
- 复杂团队协作配置。
- 远程 Web 服务。

## 6. 页面设计需求

设计方向参考 `docs/stich1` 和 `docs/stich2`：

- 深色开发者控制台。
- 高信息密度。
- 左侧导航。
- 顶部面包屑和全局操作。
- 技能列表与技能详情形成主工作区。
- 使用精密、克制的边界和层次。

### 6.1 应用外壳

左侧导航建议：

- `Skills` 或 `Library`
- `Installed`
- `Sources`
- `Tags`
- `Settings`，后续预留

顶部区域：

- Suit Skills 标识。
- 当前页面标题或当前 skill 名称。
- 搜索、刷新等上下文操作。

不需要展示“新建技能”作为主按钮。本阶段不提供创建 skill 的能力。

### 6.2 技能库页面

页面元素：

- 搜索框。
- Source 切换。
- 标签筛选。
- skill 卡片列表。
- 加载状态。
- 空状态。
- 错误状态。

卡片展示：

- 名称。
- 版本。
- 描述。
- 标签。
- source。
- 是否已安装。
- 元信息来源状态。

卡片操作：

- 未安装：`安装`。
- 未安装：`复制命令`。
- 未安装：`分享`。
- 已安装：`已安装` 状态。
- 通用：`详情`。

### 6.3 技能详情页面

详情页展示：

- 名称。
- 描述。
- 版本。
- 作者。
- 标签。
- source。
- 安装状态。
- 已安装目标。
- `SKILL.md` 渲染内容。
- frontmatter 元信息。
- 原始 `SKILL.md` 查看入口，可选。

未安装 skill 的操作：

- `安装`。
- `复制命令`。
- `分享安装命令`。

已安装 skill 的操作：

- `导出 zip`。
- `删除`。
- `复制摘要`。
- `打开目录`，后续可选。

### 6.4 已安装页面

页面元素：

- 搜索框。
- scope 筛选：`project` / `global`。
- target 筛选：`claude` / `cursor` / `codex` / `agents` / `copilot` 。
- 信息完整度筛选：有 frontmatter / 无 frontmatter。
- 来源筛选：已知 source / 未知来源。
- 已安装 skill 列表。
- 空状态。
- 错误状态。

列表字段：

- 名称。
- 版本。
- 描述。
- 标签。
- target。
- scope。
- 安装路径。
- 来源状态。
- 元信息来源状态。

每行操作：

- `详情`。
- `导出 zip`。
- `删除`。

## 7. API 设计

### 7.1 获取技能列表

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
      "description": "React 开发助手，提供组件设计和最佳实践建议",
      "author": "suit-skills",
      "tags": ["react", "frontend", "components"],
      "sourceName": "default",
      "installed": true,
      "metadataSource": "skill-md"
    }
  ]
}
```

### 7.2 获取技能详情

```http
GET /api/skills/react-helper?source=default
```

返回：

```json
{
  "name": "react-helper",
  "version": "1.0.0",
  "description": "React 开发助手，提供组件设计和最佳实践建议",
  "author": "suit-skills",
  "tags": ["react", "frontend", "components"],
  "sourceName": "default",
  "skillDir": "...",
  "markdown": "# React Helper\n...",
  "frontmatter": {
    "name": "react-helper",
    "version": "1.0.0",
    "description": "React 开发助手，提供组件设计和最佳实践建议"
  },
  "installedTargets": ["claude"],
  "metadataSource": "skill-md"
}
```

### 7.3 安装 Skill

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

### 7.4 获取已安装列表

```http
GET /api/installed?scope=project&q=review&target=claude
GET /api/installed?scope=global
GET /api/installed?target=agents
```

返回：

```json
{
  "items": [
    {
      "name": "code-review",
      "version": "1.0.1",
      "description": "代码审查技能",
      "tags": ["review", "quality"],
      "target": "claude",
      "scope": "project",
      "path": ".claude/skills/code-review",
      "sourceName": "default",
      "metadataSource": "skill-md"
    }
  ]
}
```

### 7.5 删除已安装 Skill

```http
DELETE /api/installed/code-review
```

请求体：

```json
{
  "target": "claude",
  "scope": "project"
}
```

返回：

```json
{
  "status": "removed",
  "name": "code-review",
  "target": "claude",
  "scope": "project",
  "path": ".claude/skills/code-review"
}
```

### 7.6 导出已安装 Skill

```http
POST /api/installed/export
```

请求：

```json
{
  "name": "code-review",
  "target": "claude",
  "scope": "project"
}
```

返回方式可以二选一：

1. 直接返回 zip 文件流。
2. 返回临时下载地址。

临时下载地址示例：

```json
{
  "fileName": "code-review-1.0.1.zip",
  "downloadUrl": "/api/downloads/code-review-1.0.1.zip"
}
```

### 7.7 获取 Source 配置

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

### 7.8 新增 Source

```http
POST /api/sources
```

请求：

```json
{
  "name": "team",
  "url": "https://github.com/acme/team-skills.git"
}
```

返回：

```json
{
  "source": {
    "name": "team",
    "url": "https://github.com/acme/team-skills.git",
    "enabled": true
  },
  "defaultSource": "default",
  "sources": []
}
```

### 7.9 启用或禁用 Source

```http
PATCH /api/sources/team
```

请求：

```json
{
  "enabled": false
}
```

### 7.10 删除 Source

```http
DELETE /api/sources/team
```

默认 source 不允许删除，但可以禁用。

## 8. 数据类型

### 8.1 元信息来源

```ts
type MetadataSource = "skill-md" | "meta-json-fallback" | "unknown";
```

### 8.2 Web Skill 摘要

```ts
interface WebSkillSummary {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tags: string[];
  sourceName?: string;
  installed: boolean;
  metadataSource: MetadataSource;
}
```

### 8.3 Web Skill 详情

```ts
interface WebSkillDetail {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tags: string[];
  sourceName?: string;
  skillDir: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  installedTargets: string[];
  metadataSource: MetadataSource;
}
```

### 8.4 已安装 Skill

```ts
interface InstalledSkill {
  name: string;
  version?: string;
  description?: string;
  tags: string[];
  target: string;
  scope: "project" | "global";
  path: string;
  sourceName?: string;
  metadataSource: MetadataSource;
}
```

### 8.5 API 错误

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
- `INVALID_TARGET`
- `INVALID_SCOPE`
- `CACHE_REFRESH_FAILED`
- `FILE_READ_FAILED`
- `FRONTMATTER_PARSE_FAILED`
- `INSTALL_FAILED`
- `REMOVE_FAILED`
- `EXPORT_FAILED`
- `PATH_NOT_ALLOWED`

## 9. 命令生成规则

### 9.1 基础安装命令

```bash
npx suit-skills@latest install code-review
```

### 9.2 指定 source

```bash
npx suit-skills@latest install code-review --source default
```

### 9.3 指定 agent

```bash
npx suit-skills@latest install code-review --agent claude
```

### 9.4 指定多个目标

```bash
npx suit-skills@latest install code-review --env claude,codex,agents
```

### 9.5 全局安装

```bash
npx suit-skills@latest install code-review --global
```

前端复制命令时应优先生成可直接执行的完整命令，不应生成依赖用户全局安装状态的短命令。

## 10. 安全与边界

### 10.1 本地服务安全

- 默认只监听 `127.0.0.1`。
- 不默认监听 `0.0.0.0`。
- 如后续支持 `--host 0.0.0.0`，需要明确提示风险。

### 10.2 文件访问边界

API 只能访问已知目录：

- source cache 目录。
- 配置中声明的 agent skills 目录。
- 当前项目下的安装目标目录。
- `~/.suit-skills` 管理目录。

不允许通过请求参数读取任意文件。

### 10.3 删除边界

删除操作必须满足：

- 只能删除已知安装目标下的 skill 目录。
- 不能接受前端传入任意绝对路径直接删除。
- 后端应根据 `name + target + scope` 解析最终路径。
- 最终路径必须校验在允许目录内。
- 删除前前端必须二次确认。

### 10.4 导出边界

导出 zip 操作必须满足：

- 只能导出已知安装目标下的 skill 目录。
- zip 中不能包含安装目标目录之外的文件。
- 需要处理软链接或路径穿越风险。
- 导出临时文件应有清理策略。

## 11. 编码与内容要求

- 新增文档和 Web 源码统一使用 UTF-8。
- 页面使用 `<meta charset="utf-8">`。
- 读取 `SKILL.md` 时默认按 UTF-8。
- frontmatter 解析失败时，页面应显示明确提示。
- 如果 skill 信息不完整，页面不应崩溃，应降级展示目录名和正文内容。

## 12. 构建与脚本

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

最终策略需要结合 npm 发布产物决定。

## 13. 验收标准

### 13.1 命令验收

- `suit-skills web` 能启动本地服务。
- 控制台输出可访问 URL。
- 默认自动打开浏览器。
- `suit-skills web --no-open` 不打开浏览器。
- `suit-skills web --port <port>` 使用指定端口。

### 13.2 技能库验收

- 页面能显示 source 中可用 skills。
- 没有 `meta.json` 的标准 skill 也能正常展示。
- `SKILL.md` frontmatter 能正确解析到卡片、详情页和搜索索引。
- 搜索能按名称、描述、标签过滤。
- 标签筛选生效。
- source 切换生效。
- 点击 skill 能显示详情。
- 详情页能渲染 `SKILL.md`。
- 未安装 skill 能安装。
- 未安装 skill 能复制 `npx suit-skills@latest install xxx` 命令。
- 未安装 skill 能分享安装命令。

### 13.3 已安装页面验收

- 已安装页能显示当前项目或全局环境中的 skills。
- 已安装页支持搜索。
- 搜索能匹配名称、描述、标签、路径、target。
- 已安装 skill 能查看详情。
- 已安装 skill 能删除。
- 删除前必须二次确认并展示路径。
- 已安装 skill 能导出 zip。
- 未知来源的已安装 skill 不强行生成 source 安装命令，优先提供 zip 导出。

### 13.4 工程验收

- React 项目可独立 dev。
- Web 构建产物可由 CLI 本地服务托管。
- TypeScript 类型检查通过。
- 不破坏现有 CLI 命令。
- 不破坏现有测试。

### 13.5 安全验收

- 默认监听 `127.0.0.1`。
- API 不允许读取任意路径。
- API 不允许删除任意路径。
- API 不允许导出任意路径。
- API 对 skill 名称、source 名称、target 名称、scope 做校验。

## 14. 分阶段计划

### 阶段 1：Web 管理闭环 MVP

- 搭建 React + Vite 项目。
- 新增 `suit-skills web` 命令。
- 本地服务托管 React 静态资源。
- 实现 skills 列表 API。
- 实现 skill 详情 API。
- 实现 installed 列表 API。
- 实现安装 API。
- 实现删除 API。
- 实现导出 zip API。
- 实现技能库页、详情页、已安装页。
- 实现搜索、筛选、复制命令、分享命令。

### 阶段 2：安装体验增强

- 多目标安装。
- 冲突策略选择。
- 安装进度展示。
- 更新检测。
- 批量安装。
- 批量删除。
- 打开本地目录。

### 阶段 3：配置能力

- Source 管理，包括新增、删除、启用和禁用。
- 默认 source 切换。
- 安装目标配置。
- Agent 路径配置。
- 诊断乱码、路径和 Git 可用性问题。

### 阶段 4：分享与团队能力

- zip 导入。
- 团队配置片段。
- 多 source 聚合视图。
- 版本对比与升级日志。

### 阶段 5：创作与发布能力

该阶段暂缓，不属于当前核心目标。

- Skill 创建向导。
- Skill 编辑器。
- Skill 校验。
- Skill 发布流程。

## 15. 近期需求补充与澄清

本节记录 Web 控制台近期已确认的行为要求。若本节与前文旧描述存在差异，以本节为准。

### 15.1 `suit-skills web` 发布与构建要求

`suit-skills web` 必须作为正式 CLI 子命令随 npm 包发布，不能只存在于源码开发态。

要求：

- CLI 帮助中必须展示 `web [options]`。
- npm 发布包必须包含 `dist/index.js`、`dist/commands/web.js`、`dist/lib/web/*` 和 `dist/web/*`。
- 发布或打包前必须自动执行完整构建，避免发布旧的 `dist`。
- TypeScript 构建不能依赖可能过期的增量构建缓存；当 `dist/index.js` 缺失时，构建必须重新产出 CLI 入口。
- `npx suit-skills@latest web` 应拉取到包含 Web 命令的新版本。

验收：

- `node dist/index.js --help` 输出包含 `web [options]`。
- `npm pack --dry-run` 输出的 tarball contents 包含 CLI 入口、Web 命令和 Web 静态资源。

### 15.2 Installed 页面搜索范围

Installed 页面不是只搜索 `.agents`，必须同时覆盖所有已知 target 和所有位置。

默认 target：

- `skills`
- `claude`
- `cursor`
- `codex`
- `agents`
- `copilot`

默认 location：

- `all locations`，同时扫描 workspace/project 和 user/global。

位置映射：

| target | workspace/project | user/global |
| --- | --- | --- |
| `skills` | `./.skills/` | `~/.suit-skills/skills/` |
| `claude` | `./.claude/skills/` | `~/.claude/skills/` |
| `cursor` | `./.cursor/skills/` | `~/.cursor/skills/` |
| `codex` | `./.codex/skills/` | `~/.codex/skills/` |
| `agents` | `./.agents/skills/` | `~/.agents/skills/` |
| `copilot` | `./.copilot/skills/` | `~/.copilot/skills/` |

筛选控件：

- target 筛选：`all targets` / `skills` / `claude` / `cursor` / `codex` / `agents` / `copilot`。
- location 筛选：`all locations` / `workspace` / `user`。
- `all locations` 为默认值。

后端 API 行为：

```http
GET /api/installed?scope=all
GET /api/installed?scope=all&target=codex
GET /api/installed?scope=global&q=review
GET /api/installed?scope=project&q=review&target=claude
```

`scope` 允许值：

- `all`：扫描 user/global 和 workspace/project。
- `global`：只扫描用户目录。
- `project`：只扫描当前工作区目录。
- 未传或空值时等价于 `all`。

返回的单条 `InstalledSkill.scope` 仍然只能是：

```ts
"project" | "global"
```

因为每条记录都必须指向一个明确的安装位置。

### 15.3 Installed 搜索字段与过滤行为

Installed 搜索必须同时在服务端和前端生效：

- 服务端根据 `q` 返回过滤后的结果。
- 前端在已返回结果上再次做即时过滤，保证输入后列表立即收窄。
- 前端需要防止请求竞态：快速输入时，旧请求不能覆盖新查询结果。

搜索字段必须包含：

- skill 名称 `name`
- 版本 `version`
- 描述 `description`
- 标签 `tags`
- 安装路径 `path`
- target
- location/scope
- sourceName
- metadataSource

搜索规则：

- 大小写不敏感。
- 支持匹配任意子串。
- 搜索路径时必须匹配完整路径中的任意片段，例如 `.agents`、`Administrator`、`adapt`。

### 15.4 Installed 搜索命中高亮

Library/Skills 页面与 Installed 页面搜索后，匹配到的可见文本片段必须高亮显示。

Library/Skills 页面需要高亮的可见字段：

- skill 名称
- 描述
- 标签
- 安装状态或版本文本

Installed 页面需要高亮的可见字段：

- skill 名称
- 描述
- 安装路径
- target
- location/scope
- 版本

高亮实现要求：

- 使用安全的文本分段渲染，不使用 `dangerouslySetInnerHTML`。
- 命中片段使用 `<mark>` 或等价语义元素。
- 高亮样式需要清楚但克制，不能遮挡文字或破坏 Installed 列表的可读性。
- 当搜索词为空时，不显示高亮。

### 15.5 路径去重与显示优先级

当 workspace/project 和 user/global 解析到同一个物理目录时，Installed 列表不能显示重复记录。

典型场景：

```text
cwd = C:\Users\Administrator
project ./.agents/skills = C:\Users\Administrator\.agents\skills
global ~/.agents/skills = C:\Users\Administrator\.agents\skills
```

要求：

- 按解析后的绝对 root 路径加 skill 名称去重。
- Windows 下去重应大小写不敏感。
- 当同一路径同时可被解释为 project 和 global 时，优先保留 `global` 记录，因为它更符合用户对 `~/.agents/skills` 的直觉。

### 15.6 Installed 删除与导出边界

搜索和展示可以跨 all locations，但删除和导出必须始终绑定到具体记录的：

- `name`
- `target`
- `scope`
- `path`

后端必须根据 `name + target + scope` 重新解析路径，并校验最终路径位于允许的 install root 内。

前端不得把任意路径直接作为删除或导出的信任输入。

### 15.7 回归测试要求

必须覆盖以下回归测试：

- CLI help 包含 `web` 命令。
- `--version` 输出与 `package.json` 版本一致，不能硬编码旧版本号。
- `npm pack --dry-run` 的包内容包含 Web 命令和 Web 静态资源。
- `GET /api/installed?scope=all` 能同时返回 project 与 global 安装项。
- `target=codex`、`target=claude`、`target=cursor`、`target=agents` 至少应覆盖跨位置搜索场景。
- Installed 搜索能匹配名称、描述、标签、路径、target、scope。
- 当 project 与 global 指向同一路径时，结果去重且优先显示 global。
- Library/Skills 默认 source 为 `all enabled`，只聚合 `enabled: true` 的 source。
- Library/Skills source 下拉框只展示 `all enabled` 和 `enabled: true` 的具体 source。
- 当只剩一条 `enabled: true` 的 source 时，Sources 页面必须禁用该 source 的 Disable/Delete 按钮，后端也必须拒绝禁用或删除最后一条 enabled source。
- Library/Skills 搜索命中高亮覆盖名称、描述、标签、安装状态或版本。
- Installed 搜索命中高亮覆盖名称、描述、路径、target、scope、版本。
