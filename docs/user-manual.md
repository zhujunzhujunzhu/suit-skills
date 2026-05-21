# Suit Skills 用户手册

## 简介

`suit-skills` 是一个用于管理 AI Agent skills 的本地工具，支持 CLI、Web 控制台和桌面应用。

## 环境要求

- Node.js 18+
- npm 9+

## 快速开始

### 打开 Web 控制台

```bash
npx suit-skills@latest web
```

默认监听 `http://127.0.0.1:4587`。

### 安装一个 skill

```bash
npx suit-skills@latest install code-review
```

常见参数：

- `--local`：安装到当前项目
- `--agent <name>`：只安装到单个目标
- `--env <csv>`：本次安装使用多个目标
- `--source <name>`：指定 source

## Web 控制台

### Library

- 浏览 source 中的 skills
- 按关键词、tag、source 筛选
- 查看详情并安装

### Installed

- 查看已安装 skills
- 搜索、删除、导出、复制 package、链接到其他目标

### Sources

- 新增、启用、禁用、删除 source
- 恢复内置 source
- 控制国内镜像

### Settings

- 调整 source 刷新间隔
- 配置主题
- 配置翻译服务和 AI 修改服务

### Skill Detail

- 查看 `SKILL.md`
- 切换翻译模式
- 查看已安装 skill 的文件树
- 进入本地编辑与 AI 改写

## CLI 命令

### 查看帮助

```bash
suit-skills --help
```

### 列出可用 skills

```bash
suit-skills list
suit-skills list --source all
suit-skills list --query prompt
suit-skills list --tag review
```

### 搜索 skills

```bash
suit-skills search automation
```

### 查看 skill 信息

```bash
suit-skills info code-review
```

### 安装 skill

```bash
suit-skills install code-review
suit-skills install code-review --local
suit-skills install code-review --agent claude
suit-skills install code-review --env claude,codex,cursor
```

### 查看已安装 skills

```bash
suit-skills installed
suit-skills installed --global
suit-skills installed --scope all
```

### 更新已安装 skills

```bash
suit-skills update
suit-skills update code-review --global
```

### 删除已安装 skill

```bash
suit-skills remove code-review
suit-skills remove code-review --global
```

### Source 管理

```bash
suit-skills source list
suit-skills source add custom https://example.com/repo.git
suit-skills source enable custom
suit-skills source disable custom
suit-skills source default custom
suit-skills source remove custom
suit-skills source restore-builtins
suit-skills source mirror anthropics-skills on
```

### 配置与目标

```bash
suit-skills config list
suit-skills config get settings.themeMode
suit-skills config set settings.themeMode custom
suit-skills env list
suit-skills env set claude,codex,cursor
suit-skills env auto off
suit-skills targets list
```

### 分享与导出

```bash
suit-skills export code-review --target claude --out ./code-review.zip
suit-skills copy-package code-review --target claude
suit-skills link-targets code-review --target claude --targets codex,cursor
```

## 安装目标

内置目标包括 `agents`、`claude`、`cursor`、`copilot`、`codex`、`gemini`、`opencode`、`openclaw`。

`skills` 是项目级额外目标，对应 `./.skills/`。

## 配置目录

默认目录是 `~/.suit-skills/`，常见文件包括：

```text
~/.suit-skills/config.json
~/.suit-skills/cache/
~/.suit-skills/skills/
```

可以通过 `SUIT_SKILLS_HOME` 切换隔离目录。

## Skill 格式

推荐使用独立目录和 `SKILL.md` frontmatter。

## 常见问题

- `Skill not found`：先刷新 source，再重新搜索
- `No enabled sources`：先在 `Sources` 页面启用 source
- 不知道选哪个 target：先看 `targets list`

## 参考

- [文档索引](./README.md)
- [开发说明](./development.md)
- [Web 控制台说明](./web-console.md)
