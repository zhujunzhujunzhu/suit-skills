# Suit Skills 用户使用手册

本文面向 `suit-skills` 的日常使用者，说明如何通过 Web 控制台和 CLI 浏览、安装、管理和分享 skills。

## 1. 简介

`suit-skills` 是一个用于管理 AI Agent skills 的本地工具。它可以从远程 skill source 拉取技能库，把 skill 安装到当前项目或用户目录下，并支持 Claude、Cursor、Codex、Agents、Copilot 等多种目标目录。

你可以通过两种方式使用：

- Web 控制台：适合浏览、搜索、安装、删除、导出和管理 source。
- CLI 命令行：适合脚本、CI、快速安装和批量管理。

## 2. 环境要求

- Node.js >= 18。
- 能访问配置的 Git source。
- Windows、macOS、Linux 均可使用；路径展示会根据系统解析。

推荐直接使用：

```bash
npx suit-skills@latest web
```

也可以全局安装：

```bash
npm install -g suit-skills
suit-skills web
```

## 3. 快速开始

### 3.1 打开 Web 控制台

```bash
npx suit-skills@latest web
```

默认行为：

- 本地服务监听 `127.0.0.1:4587`。
- 自动打开浏览器。
- Library 页面默认展示 `all enabled` source 中的 skills。

常用参数：

```bash
npx suit-skills@latest web --port 4590
npx suit-skills@latest web --no-open
npx suit-skills@latest web --source all
npx suit-skills@latest web --source default
```

### 3.2 安装一个 skill

在 Web 控制台中：

1. 打开 `Library`。
2. 搜索 skill 名称、标签或描述。
3. 选中 skill。
4. 选择安装 target、安装位置和冲突策略。
5. 点击 `Install`。

在 CLI 中：

```bash
npx suit-skills@latest install code-review --agent claude
```

安装到用户全局目录：

```bash
npx suit-skills@latest install code-review --agent claude --global
```

安装到多个 target：

```bash
npx suit-skills@latest install code-review --env claude,codex,agents
```

## 4. Web 控制台

### 4.1 Library 页面

Library 用于浏览 source 中可安装的 skills。

主要功能：

- 搜索 skill 名称、描述和标签。
- 按标签筛选。
- 按 source 筛选。
- 查看 skill 详情和 `SKILL.md` 内容。
- 安装 skill。
- 复制 `npx suit-skills@latest install ...` 命令。
- 生成分享文本。

Source 筛选规则：

- 默认选项是 `all enabled`。
- `all enabled` 只聚合所有 `enabled: true` 的 source。
- 下拉框只展示 `all enabled` 和当前 enabled 的具体 source。
- disabled source 不参与 Library 默认展示。

搜索规则：

- 大小写不敏感。
- 支持任意子串匹配。
- 搜索命中会在列表中高亮。

### 4.2 Skill Detail

右侧详情区域会显示：

- 名称、版本、作者、source。
- tags。
- 已安装目标。
- metadata 来源。
- `SKILL.md` 正文内容。

如果未选择 skill，会显示空详情状态。

### 4.3 Installed 页面

Installed 用于查看和管理已安装的 skills。

默认扫描：

- workspace/project 位置。
- user/global 位置。
- 所有已知 target。

支持的 target：

- `skills`
- `claude`
- `cursor`
- `codex`
- `agents`
- `copilot`

支持的 location：

- `all locations`
- `workspace`
- `user`

Installed 搜索会匹配：

- skill 名称。
- 版本。
- 描述。
- tags。
- 安装路径。
- target。
- location。
- sourceName。
- metadataSource。

Installed 页面可以：

- 删除指定安装记录。
- 将已安装 skill 导出为 zip。
- 搜索并高亮匹配结果。

### 4.4 Sources 页面

Sources 用于管理远程 skill source。

可以执行：

- 新增 source。
- 启用 source。
- 禁用 source。
- 删除非默认 source。

规则：

- 默认 source 不允许删除。
- Web 页面会阻止禁用最后一条 enabled source。
- Web 页面会阻止删除最后一条 enabled source。
- disabled source 不参与 `all enabled` 聚合。

新增 source 示例：

```text
name: team
url: https://github.com/acme/team-skills.git
```

### 4.5 Tags 页面

Tags 用于从标签维度浏览 Library 中已加载的 skills。点击标签后会回到 Library，并应用对应 tag 筛选。

## 5. CLI 命令

### 5.1 查看帮助

```bash
suit-skills --help
suit-skills install --help
suit-skills source --help
```

### 5.2 列出可用 skills

默认读取配置中的 `defaultSource`：

```bash
suit-skills list
```

按标签筛选：

```bash
suit-skills list --tag review
```

聚合所有 enabled source：

```bash
suit-skills list --source all
```

指定 source：

```bash
suit-skills list --source default
```

### 5.3 搜索 skills

```bash
suit-skills search react
suit-skills search review --source default
```

不传 `--source` 时，使用 `defaultSource`。

### 5.4 查看 skill 信息

```bash
suit-skills info code-review
suit-skills info code-review --source all
```

输出包含：

- name
- version
- description
- author
- tags
- source

### 5.5 安装 skill

基本安装：

```bash
suit-skills install code-review
```

指定 source：

```bash
suit-skills install code-review --source default
```

指定单个 agent：

```bash
suit-skills install code-review --agent claude
```

指定多个 target：

```bash
suit-skills install code-review --env claude,codex,agents
```

安装到全局目录：

```bash
suit-skills install code-review --agent claude --global
```

冲突策略：

```bash
suit-skills install code-review --strategy overwrite
suit-skills install code-review --strategy skip
suit-skills install code-review --strategy rename
```

策略说明：

- `overwrite`：覆盖已有安装。
- `skip`：已存在时跳过。
- `rename`：冲突时改名安装。

### 5.6 查看已安装 skills

```bash
suit-skills installed
suit-skills installed --agent claude
suit-skills installed --env claude,codex
suit-skills installed --global --agent claude
```

### 5.7 更新已安装 skills

更新所有匹配目标中的 skills：

```bash
suit-skills update
```

更新指定 skill：

```bash
suit-skills update code-review
```

指定 target：

```bash
suit-skills update code-review --agent claude
suit-skills update --env claude,codex
```

注意：CLI 的 `update` 当前从 `defaultSource` 缓存中查找更新。

### 5.8 删除已安装 skill

```bash
suit-skills remove code-review
suit-skills remove code-review --agent claude
suit-skills remove code-review --env claude,codex
suit-skills remove code-review --global --agent claude
```

别名：

```bash
suit-skills rm code-review
```

## 6. Source 管理

### 6.1 查看 sources

```bash
suit-skills source list
```

输出格式：

```text
default    https://...    enabled
team       https://...    disabled
```

### 6.2 新增 source

```bash
suit-skills source add team https://github.com/acme/team-skills.git
```

新增后的 source 默认 enabled。

### 6.3 启用或禁用 source

```bash
suit-skills source enable team
suit-skills source disable team
```

禁用后：

- `list --source all` 不再包含该 source。
- Web Library 的 `all enabled` 不再包含该 source。
- Web Library 下拉框不再展示该 source。

### 6.4 设置默认 source

```bash
suit-skills source default team
```

默认 source 会影响：

- `suit-skills list`
- `suit-skills search`
- `suit-skills info`
- `suit-skills install`
- `suit-skills update`

Web Library 的默认筛选仍是 `all enabled`。

### 6.5 删除 source

```bash
suit-skills source remove team
```

默认 source 不允许删除。

## 7. 安装目标和目录

### 7.1 target 说明

`suit-skills` 支持以下 target：

| target | project 目录 | global 目录 |
| --- | --- | --- |
| `skills` | `./.skills/` | `~/.suit-skills/skills/` |
| `claude` | `./.claude/skills/` | `~/.claude/skills/` |
| `cursor` | `./.cursor/skills/` | `~/.cursor/skills/` |
| `codex` | `./.codex/skills/` | `~/.codex/skills/` |
| `agents` | `./.agents/skills/` | `~/.agents/skills/` |
| `copilot` | `./.copilot/skills/` | `~/.copilot/skills/` |

### 7.2 target 选择优先级

CLI 安装、更新、删除时，target 决定顺序如下：

1. 如果传了 `--agent <name>`，只使用该 target。
2. 如果传了 `--env <csv>`，使用 CSV 中的 targets。
3. 否则使用配置中的 `installTargets`。
4. 如果 `installTargetsAuto` 开启，还会合并当前项目中检测到的 agent 目录。
5. 如果仍没有 target，交互式终端中会提示选择。

### 7.3 配置默认安装 targets

查看当前目标：

```bash
suit-skills env list
```

固定默认安装目标：

```bash
suit-skills env set claude,codex,agents
```

开启项目目录自动检测：

```bash
suit-skills env auto on
```

关闭项目目录自动检测：

```bash
suit-skills env auto off
```

## 8. 配置文件

默认配置目录：

```text
~/.suit-skills/
```

主要文件：

```text
~/.suit-skills/config.json
~/.suit-skills/cache/
~/.suit-skills/skills/
```

查看完整配置：

```bash
suit-skills config list
```

读取单个配置：

```bash
suit-skills config get defaultSource
suit-skills config get sources
```

设置配置：

```bash
suit-skills config set defaultSource "default"
suit-skills config set installTargets '["claude","codex"]'
```

测试或临时隔离环境可以设置：

```bash
SUIT_SKILLS_HOME=/path/to/.suit-skills suit-skills config list
```

Windows PowerShell：

```powershell
$env:SUIT_SKILLS_HOME="D:\tmp\suit-skills-home"
suit-skills config list
```

## 9. Skill 格式

推荐的 skill 目录结构：

```text
my-skill/
  SKILL.md
```

推荐在 `SKILL.md` 顶部写 frontmatter：

```markdown
---
name: code-review
version: 1.0.0
description: 自动检查代码质量、风格和潜在问题
author: suit-skills
tags:
  - review
  - quality
---

# code-review

这里写 skill 的具体说明。
```

兼容说明：

- 新 skill 推荐使用 `SKILL.md` frontmatter。
- 旧版 `meta.json` 可作为过渡 fallback。
- 如果 metadata 缺失，界面可能显示 `unknown`。

## 10. 常见使用场景

### 10.1 给 Claude 安装 code-review

```bash
npx suit-skills@latest install code-review --agent claude
```

### 10.2 给 Codex 和 Agents 同时安装

```bash
npx suit-skills@latest install code-review --env codex,agents
```

### 10.3 安装到用户全局 Claude 目录

```bash
npx suit-skills@latest install code-review --agent claude --global
```

### 10.4 查看当前项目已安装了什么

```bash
suit-skills installed --env claude,codex,agents
```

### 10.5 使用 Web 完成浏览和安装

```bash
npx suit-skills@latest web
```

然后在浏览器中：

1. 在 Library 搜索 skill。
2. 选择 target 和 location。
3. 点击 Install。
4. 到 Installed 页面确认安装结果。

## 11. 常见问题

### 11.1 `Skill not found`

可能原因：

- source 缓存中没有该 skill。
- 当前使用的是错误的 source。
- 该 source 被禁用，且你使用的是 `--source all` 或 Web 的 `all enabled`。

处理方式：

```bash
suit-skills source list
suit-skills list --source all
suit-skills list --source default
```

也可以在 Web 中点击 Refresh 重新扫描缓存。

### 11.2 Web 页面显示 `No enabled sources.`

表示当前没有任何 enabled source。

处理方式：

- 到 Sources 页面启用一个 source。
- 或使用 CLI 启用：

```bash
suit-skills source enable default
```

### 11.3 Web 页面显示 `No matching skills.`

可能原因：

- 搜索词或 tag 筛选没有命中。
- 当前 source 中确实没有匹配的 skill。
- source 缓存还没有拉取成功。

处理方式：

- 清空搜索词。
- 切换到 `all enabled`。
- 检查 source 是否 enabled。
- 点击 Refresh。

### 11.4 安装时不知道该选哪个 target

常见选择：

- 使用 Claude：选 `claude`。
- 使用 Cursor：选 `cursor`。
- 使用 Codex：选 `codex`。
- 使用通用 Agents 目录：选 `agents`。
- 只想安装到 suit-skills 自己的目录：选 `skills`。

### 11.5 已安装 skill 无法匹配 source

已安装 skill 可能来自：

- Web 或 CLI 安装。
- 手动复制。
- 其他工具安装。

如果无法识别来源，Installed 页面仍会显示它，并允许导出 zip。未知来源的 skill 不应强行生成 source 安装命令。

## 12. 推荐工作流

日常推荐：

1. 使用 `npx suit-skills@latest web` 打开 Web 控制台。
2. 在 Sources 中确认至少有一个 enabled source。
3. 在 Library 中搜索并安装 skill。
4. 在 Installed 中确认安装位置。
5. 需要分享时复制安装命令或导出 zip。

团队推荐：

1. 维护统一的 team source。
2. 通过 `source add` 添加到每个成员本机。
3. 使用 `source default` 设置默认 source。
4. 使用 `env set` 固定团队常用安装 targets。
5. 通过 Web 的 Library 和 Installed 做日常管理。
