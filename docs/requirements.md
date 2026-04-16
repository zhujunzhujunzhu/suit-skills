# Suit Skills 需求文档

## 1. 项目概述

一个 CLI 工具，用于从远程 Git 仓库（默认 Gitee）拉取预定义的 skill 模板，安装到本地指定目录，支持多种智能体平台（Claude、Cursor 等）。

核心流程：

```
远程仓库 (可配置多个源)
    │
    ▼  clone / pull 缓存
本地缓存 (~/.suit-skills/cache/)
    │
    ▼  按 skill 名称查找
拷贝到目标目录 (全局 / 项目级 / 指定智能体)
```

---

## 2. 业界 Agent Skills 生态与常见厂商

### 2.1 背景说明

各厂商对「可复用技能包」命名不一（Skills、Agent Skills、Rules 等），常见形态是：**按目录存放的技能包**，内含 `SKILL.md`（或等价入口）及脚本、参考文档等。部分产品会**互认他厂路径**（例如 Cursor 文档说明可加载 `.claude/`、Codex 相关目录），但**默认安装位置仍以各产品官方文档为准**。Suit Skills CLI 通过统一拉取远端模板并**拷贝到各厂商约定目录**，降低在多工具间重复维护的成本。

### 2.2 头部厂商与典型 Skills 路径（项目级 / 用户级）

下表依据**公开文档或社区常见约定**整理，**不保证与各产品后续版本完全一致**；映射变更时应以官方文档为准，并通过配置扩展而非硬编码。


| 厂商 / 产品                                        | 说明                                              | 项目级（示例）                                                 | 用户级 / 全局（示例）                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic — Claude Code**                    | 官方 CLI / IDE 能力扩展；技能为目录包，入口多为 `SKILL.md`        | `.claude/skills/<skill>/`                               | `~/.claude/skills/<skill>/`                                                                                                         |
| **Cursor**                                     | Agent Skills；文档描述多路径加载与对其它工具目录的兼容               | `.cursor/skills/`、`.agents/skills/` 等                   | `~/.cursor/skills/`；并可加载 `.claude/skills/`、`~/.claude/skills/`、`.codex/skills/` 等（以 [Cursor 文档](https://cursor.com/docs/skills) 为准） |
| **GitHub — Copilot**（含 Copilot CLI、编辑器内 Agent） | 官方「Agent skills」，支持多种存放位置                       | `.github/skills/`、`.claude/skills/`、`.agents/skills/` 等 | `~/.copilot/skills/`、`~/.claude/skills/`、`~/.agents/skills/` 等（以 [GitHub 文档](https://docs.github.com/en/copilot) 为准）                |
| **OpenAI — Codex**                             | 生态中与 `codex` 目录并列提及较多；路径以 OpenAI / Codex 当前文档为准 | `.codex/skills/`（若采用）                                   | `~/.codex/skills/`（若采用）                                                                                                             |


### 2.3 其它常见 AI 编程助手（参考，非穷尽）

社区技能库、文章还会提到 **Windsurf**、**Aider**、**Cline**、**Roo Code**、**Goose**、**Jules** 等产品。是否提供与本节相同的「目录型 Skills」、以及具体路径，**需以各自官方说明为准**。本 CLI 通过 `**config.json` 中 `agents` 等映射** 扩展新厂商路径，避免写死在代码中。

### 2.4 开放标准与互操作性

- 与 **Agent Skills** 相关的开放描述与目录约定可参考社区站点 **agentskills.io**（多家产品文档中有引用）。
- 实际加载行为以**各产品在客户端中声明的路径与优先级**为最终依据。

### 2.5 对本产品需求的影响

- **多厂商目录并存**：需在配置中支持用户**多选「要安装到的环境」**，并支持**一次 install 向多个目标目录拷贝**（与第 4 节安装目标、以及规划中的「环境初始化 / 环境更新」命令配合）。
- **检测与映射**：可做基于**全局**的弱检测（用户主目录、约定路径、可选 CLI 等），用于**首次向导提示**；**实际写入哪些路径**须由用户明确勾选，避免静默误判。
- **路径演进**：官方路径调整时，优先改 **配置** 而非强制升级 CLI。

---

## 3. 远程仓库结构

### 3.1 仓库约定

远程仓库（如 `suit-skills`）的目录结构如下：

```
suit-skills/
├── skill-a/
│   ├── meta.json
│   ├── SKILL.md
│   └── ...其他模板文件
├── skill-b/
│   ├── meta.json
│   └── ...
```

### 3.2 文件夹命名规则

- 文件夹名称 = skill 名称（即用户安装时指定的名称）
- 名称只允许小写字母、数字、短横线（`-`），如 `code-review`、`react-helper`

### 3.3 meta.json 格式

```json
{
  "name": "code-review",
  "version": "1.0.0",
  "description": "代码审查技能",
  "author": "xxx",
  "tags": ["review", "quality"]
}
```

必填字段：


| 字段        | 类型     | 说明                 |
| --------- | ------ | ------------------ |
| `name`    | string | skill 名称，必须与文件夹名一致 |
| `version` | string | 语义化版本号（semver）     |


选填字段：


| 字段            | 类型       | 说明         |
| ------------- | -------- | ---------- |
| `description` | string   | 简短描述       |
| `author`      | string   | 作者         |
| `tags`        | string[] | 标签，用于搜索/分类 |


---

## 4. 本地安装目标目录

### 4.1 安装模式

支持三种安装模式：


| 模式              | 标志                                           | 目标路径                     | 说明                                                                                              |
| --------------- | -------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| 全局安装            | `--global` 或 `-g`                            | `~/.suit-skills/skills/` | 仅当目标含通用 `skills` 时；多目标见 `installTargets` / `--env`                                              |
| 项目级（Agent 约定目录） | 默认                                           | 见下表、随检测与配置变化             | 默认**不**写 `./.skills/`；按项目下已存在的 `.claude`、`.cursor` 等自动并入对应路径；无任何 Agent 目录时需 `--agent` / `--env` |
| 项目级（通用目录）       | `installTargets` 含 `skills` 或 `--env skills` | `./.skills/`             | 显式需要通用 skills 目录时使用                                                                             |
| 指定智能体           | `--agent <name>`                             | 见下表                      | 安装到特定智能体目录                                                                                      |


### 4.2 智能体目录映射


| 智能体名称     | 全局路径                 | 项目级路径                |
| --------- | -------------------- | -------------------- |
| `claude`  | `~/.claude/skills/`  | `./.claude/skills/`  |
| `cursor`  | `~/.cursor/skills/`  | `./.cursor/skills/`  |
| `agents`  | `~/.agents/skills/`  | `./.agents/skills/`  |
| `copilot` | `~/.copilot/skills/` | `./.copilot/skills/` |
| `codex`   | `~/.codex/skills/`   | `./.codex/skills/`   |


> 智能体目录映射可通过配置文件扩展，不硬编码。升级 CLI 后若本地 `config.json` 缺少新键，加载时会自动合并默认值并写回。

### 4.3 冲突处理

当目标目录已存在同名 skill 时：

1. 检测目标路径下是否已存在该 skill 文件夹
2. 若存在，提示用户：
  ```
   ⚠ Skill "code-review" already exists at .claude/skills/code-review/
   Options: [O]verwrite / [S]kip / [R]ename
  ```
3. 需要用户明确选择后才继续

### 4.4 多环境与「已启用的安装目标」（规划中）

- 用户可在全局配置中**多选**要将 skill 安装到的目标类型（如 `claude`、`cursor`、`copilot`、是否包含通用 `./.skills/` 等）。
- **全局弱检测**仅用于首次向导展示「本机可能已具备的环境」，**不替代用户勾选**；多环境并存时由用户**显式多选**，并支持**一条 `install` 向多个目标目录同步拷贝**。
- 需提供**首次环境初始化**与**后续更新已启用环境**的命令（具体子命令名以实现为准）；`install` / `installed` / `update` / `remove` 在多目标下的行为应对齐（**显式** `-g`、`--agent`、本次 `--env` 等参数优先于默认多选策略）。

---

## 5. 仓库缓存策略

### 5.1 缓存目录

```
~/.suit-skills/
├── cache/                          # 仓库缓存
│   ├── gitee-com-xxx-suit-skills/  # 按源地址区分
│   └── github-com-xxx-skills/      # 每个源一个目录
├── config.json                     # 用户配置
└── skills/                         # 全局安装的 skills
```

### 5.2 缓存更新逻辑

```
执行命令时:
  ├── 缓存目录已存在？
  │   ├── 是 → git pull（静默，失败时给出提示但不阻塞）
  │   └── 否 → git clone
  └── 拉取完成后，从缓存中查找 skill
```

- `git pull` 失败时（如网络问题），使用本地缓存继续，并给出警告
- 不要求用户本地安装 git，但如果没装，给出明确提示

---

## 6. 源配置（多源支持）

### 6.1 配置文件

配置文件路径：`~/.suit-skills/config.json`

默认配置：

```json
{
  "sources": [
    {
      "name": "default",
      "url": "https://gitee.com/digital-construction-center_1/suit-skills-lib.git",
      "enabled": true
    }
  ],
  "defaultSource": "default",
  "agents": {
    "claude": { "globalDir": "~/.claude/skills", "projectDir": "./.claude/skills" },
    "cursor": { "globalDir": "~/.cursor/skills", "projectDir": "./.cursor/skills" },
    "agents": { "globalDir": "~/.agents/skills", "projectDir": "./.agents/skills" },
    "copilot": { "globalDir": "~/.copilot/skills", "projectDir": "./.copilot/skills" },
    "codex": { "globalDir": "~/.codex/skills", "projectDir": "./.codex/skills" }
  },
  "installTargets": []
}
```

> 默认 `installTargets` 为空：不写 `./.skills/`，由目录检测与 `installTargetsAuto` 合并 Agent 目标；若仍需通用目录可 `env set skills,...` 或安装时 `--env skills`。

### 6.2 多源规则

- 支持配置多个 Git 仓库源（Gitee、GitHub、自建等）
- 每个源有 `name` 和 `url`，可通过 `enabled` 开关
- 安装时可通过 `--source <name>` 指定从哪个源拉取
- 未指定时使用 `defaultSource` 配置的源
- 搜索/列表时可以聚合所有启用的源

### 6.3 源管理命令

```
suit-skills source add <name> <url>       # 添加源
suit-skills source remove <name>          # 移除源
suit-skills source list                   # 列出所有源
suit-skills source enable <name>          # 启用源
suit-skills source disable <name>         # 禁用源
suit-skills source default <name>         # 设置默认源
```

---

## 7. 命令设计

### 7.1 核心命令

#### `suit-skills install <skill-name>`

安装指定 skill。

```bash
# 安装到当前项目
suit-skills install code-review

# 全局安装
suit-skills install code-review -g

# 安装到指定智能体目录
suit-skills install code-review --agent claude

# 从指定源安装
suit-skills install code-review --source my-custom-source

# 指定版本（可选）
suit-skills install code-review@1.2.0

# 仅本次指定多个安装目标（逗号分隔，skills = ./.skills/）
suit-skills install code-review --env skills,claude,cursor
```

配置项 `installTargets` 控制**默认**多目标安装；`**--agent`** 仅装该智能体目录；`**--env**` 仅本次覆盖 `installTargets`。详见 `env` 子命令。

#### `suit-skills list`

列出远程仓库中可用的 skills。

```bash
suit-skills list                    # 列出默认源的所有 skills
suit-skills list --source all       # 聚合所有源列出
suit-skills list --tag review       # 按 tag 过滤
```

#### `suit-skills search <keyword>`

按名称/描述/标签搜索 skill。

```bash
suit-skills search react
```

#### `suit-skills installed`

查看本地已安装的 skills。

```bash
suit-skills installed               # 当前项目已安装的
suit-skills installed -g            # 全局已安装的
suit-skills installed --agent claude # 某智能体下已安装的
# 多目标时输出两列：目标标签与 skill 名（制表符分隔）
suit-skills installed --env skills,claude
```

### 7.2 管理命令

#### `suit-skills update [skill-name]`

更新已安装的 skill。

```bash
suit-skills update                  # 更新当前项目所有 skills
suit-skills update code-review      # 更新指定 skill
suit-skills update -g               # 更新全局所有
```

#### `suit-skills remove <skill-name>`

卸载 skill。

```bash
suit-skills remove code-review                # 从当前项目移除
suit-skills remove code-review -g             # 从全局移除
suit-skills remove code-review --agent claude # 从指定智能体移除
```

### 7.3 其他命令

#### `suit-skills info <skill-name>`

查看 skill 详细信息（读取 meta.json）。

```bash
suit-skills info code-review
```

输出示例：

```
code-review v1.0.0
  Description: 代码审查技能
  Author: xxx
  Tags: review, quality
  Source: default (gitee.com/xxx/suit-skills)
```

#### `suit-skills source ...`

见第 6.3 节源管理命令。

#### `suit-skills config ...`

查看/修改配置。

```bash
suit-skills config list              # 查看当前配置
suit-skills config get <key>         # 获取某个配置项
suit-skills config set <key> <value> # 设置配置项
```

#### `suit-skills env ...`

管理默认多环境安装目标（写入 `installTargets`）；全局目录弱检测仅用于 `env list` 提示。

```bash
suit-skills env list                 # 当前 installTargets + 主目录下检测提示
suit-skills env set skills,claude,cursor
```

---

## 8. 技术约束


| 项目     | 要求                        |
| ------ | ------------------------- |
| 运行环境   | Node.js >= 18             |
| 实现     | TypeScript                |
| CLI 框架 | Commander.js              |
| Git 操作 | 通过 child_process 调用系统 git |
| 配置存储   | JSON 文件                   |
| 发布     | npm 包                     |


---

## 9. 后续可扩展项（不在 v1 范围内）

- skill 的依赖管理（一个 skill 依赖另一个 skill）
- skill 版本锁定（类似 package-lock）
- 交互式安装向导（TUI 界面选择 skill）
- skill 模板变量替换（安装时填入项目名等）
- 本地 skill 开发 & 发布流程
- 校验机制（校验 skill 完整性、meta.json 合法性）

