# Suit Skills CLI — 任务拆解与测试用例

> 每个任务对应一个可独立验证的测试用例，按依赖关系从底向上排列。
> 标记说明：`[ ]` 待开始 | `[-]` 进行中 | `[x]` 已完成

---

## 开发流程：子代理与测试门禁

本文件后续任务由**主会话编排**，通过 **Cursor Task（子代理）** 逐项落地；每完成一小节，必须用测试验证，通过后才能进入下一节或勾选完成。

### 子代理怎么用

- **一次只派一个「实现类」子代理**（或明确文件边界、互不冲突时再并行），避免多代理同时改同一批文件。
- 派发时务必附上：**本节任务标题 + 正文表格（含测试用例）**、工作区根目录 `D:\Coding_agent\skills-cli`、目标实现路径与对应 `tests/` 路径（见文末目录结构）。
- 子代理内推荐遵循 TDD：先补/写测试，再实现，最后自测。

### 每节任务完成后的必跑命令（质量门禁）

在将本节标为 `[x]` 或开始下一节之前，在仓库根目录执行并**全部通过**：

| 命令 | 何时必须跑 |
|------|------------|
| `npm test` | 每节必跑；本节涉及的测试用例须绿灯 |
| `npm run typecheck` | 本节新增或修改了 `src/**/*.ts` 时必跑 |

若某节在正文中另有约定（例如仅类型、或 CLI 端到端），以正文为准，但 **`npm test` 不应跳过**。

### 推荐给子代理的提示词骨架

```
工作区：D:\Coding_agent\skills-cli

任务（完整复制 docs/tasks.md 中对应「阶段 X — …」下该小节的描述与测试用例表）：
…

要求：
- 仅改动完成该任务所必需的文件，风格与现有代码一致。
- 完成后在仓库根执行：npm test；若改了 TS 源码则再执行 npm run typecheck。
- 回复：修改的文件列表、上述命令的退出码与简要输出（失败则附错误片段）。
```

---

## 阶段 0 — 测试基础设施

> **进度**：`[x]` 已完成（`package.json` 的 `test` 脚本、`vitest.config.ts`、`tests/smoke.test.ts`）。

### 0.1 搭建测试框架

**任务**: 引入 Vitest 测试框架，配置脚本，确保能运行空测试通过。

| 项 | 内容 |
|---|------|
| 操作 | `npm i -D vitest`，在 package.json 添加 `test` 脚本 |
| 测试用例 | `vitest` 能运行，输出 `1 test passed` |

---

## 阶段 1 — TypeScript 类型定义

> **进度**：`[x]` 已完成（`packages/core/src/types/index.ts`、`tests/types.test.ts`）。

### 1.1 定义核心类型接口

**任务**: 在 `packages/core/src/types/index.ts` 中定义所有核心接口。

| 项 | 内容 |
|---|------|
| 类型 | `SkillMeta`、`Source`、`Config`、`AgentMapping`、`InstallTarget` |
| 测试用例 | 导入所有类型，TypeScript 编译无报错 + `tsc --noEmit` 通过 |

具体类型：

```typescript
// SkillMeta - skill 元数据
interface SkillMeta {
  name: string;        // 必填
  version: string;     // 必填，semver
  description?: string;
  author?: string;
  tags?: string[];
}

// Source - 远程源
interface Source {
  name: string;
  url: string;
  enabled: boolean;
}

// AgentMapping - 智能体目录映射
interface AgentMapping {
  globalDir: string;   // 如 "~/.claude/skills"
  projectDir: string;  // 如 "./.claude/skills"
}

// Config - 全局配置
interface Config {
  sources: Source[];
  defaultSource: string;
  agents: Record<string, AgentMapping>;
}

// InstallTarget - 安装目标
interface InstallTarget {
  type: 'global' | 'project' | 'agent';
  path: string;
}
```

---

## 阶段 2 — 工具函数层 (`packages/core/src/utils/`)

> **进度**：`[x]` 已完成（`packages/core/src/utils/validate.ts`、`path.ts`、`fs.ts` 与 `tests/utils/*`）。

### 2.1 `validateSkillName` — Skill 名称校验

**任务**: 校验 skill 名称是否合法（仅允许小写字母、数字、短横线）。

| 项 | 内容 |
|---|------|
| 输入 | 字符串 |
| 输出 | `boolean` |
| 测试用例 1 | `"code-review"` → `true` |
| 测试用例 2 | `"react-helper"` → `true` |
| 测试用例 3 | `"skill123"` → `true` |
| 测试用例 4 | `"Code_Review"` → `false`（大写+下划线） |
| 测试用例 5 | `""` → `false`（空字符串） |
| 测试用例 6 | `"a"` → `true`（单字符） |
| 测试用例 7 | `"-leading"` → `false`（短横线开头） |
| 测试用例 8 | `"trailing-"` → `false`（短横线结尾） |

### 2.2 `parseSkillIdentifier` — 解析 skill 标识符

**任务**: 解析 `skill-name@version` 格式，返回 `{ name, version }`。

| 项 | 内容 |
|---|------|
| 输入 | 字符串，如 `"code-review@1.2.0"` |
| 输出 | `{ name: string; version?: string }` |
| 测试用例 1 | `"code-review"` → `{ name: "code-review", version: undefined }` |
| 测试用例 2 | `"code-review@1.2.0"` → `{ name: "code-review", version: "1.2.0" }` |
| 测试用例 3 | `"react-helper@0.1.0-beta"` → `{ name: "react-helper", version: "0.1.0-beta" }` |

### 2.3 `urlToCacheDirName` — URL 转缓存目录名

**任务**: 将仓库 URL 转换为缓存目录名（去协议、去 `.git`、`/` 转 `-`）。

| 项 | 内容 |
|---|------|
| 输入 | Git 仓库 URL 字符串 |
| 输出 | 缓存目录名字符串 |
| 测试用例 1 | `"https://gitee.com/user/suit-skills-lib.git"` → `"gitee-com-user-suit-skills-lib"` |
| 测试用例 2 | `"https://github.com/org/skills.git"` → `"github-com-org-skills"` |
| 测试用例 3 | `"git@github.com:org/repo.git"` → `"github-com-org-repo"` |

### 2.4 `ensureDir` — 确保目录存在

**任务**: 目录不存在则递归创建，已存在不报错。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 给定不存在的路径 → 目录被创建 |
| 测试用例 2 | 给定已存在的路径 → 不报错，目录仍在 |

### 2.5 `copyDir` — 递归拷贝目录

**任务**: 将源目录完整拷贝到目标路径（含子目录和文件）。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 源有 `meta.json` + `prompt.md` → 目标得到相同文件，内容一致 |
| 测试用例 2 | 源含子目录 `templates/a.md` → 目标含 `templates/a.md` |
| 测试用例 3 | 源不存在 → 抛出错误 |

### 2.6 `parseVersion` — 语义化版本比较

**任务**: 解析并比较 semver 版本号（只取 `major.minor.patch`）。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `"1.2.0"` → `{ major: 1, minor: 2, patch: 0 }` |
| 测试用例 2 | `"1.2.0" > "1.1.9"` → `true` |
| 测试用例 3 | `"2.0.0" > "1.9.9"` → `true` |
| 测试用例 4 | `"1.0.0" === "1.0.0"` → `true` |

---

## 阶段 3 — 配置管理模块 (`packages/core/src/config/index.ts`)

> **进度**：`[x]` 已完成（`packages/core/src/config/index.ts`、`tests/lib/config.test.ts`）。测试与生产路径可通过环境变量 `SUIT_SKILLS_HOME` 指向临时目录。

### 3.1 `getDefaultConfig` — 获取默认配置

**任务**: 返回包含默认源、默认智能体映射的配置对象。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 返回值包含 `sources` 数组，且第一个元素 name 为 `"default"` |
| 测试用例 2 | 默认源 URL 为 `"https://gitee.com/digital-construction-center_1/suit-skills-lib.git"` |
| 测试用例 3 | `agents` 包含 `claude` 和 `cursor` 两个映射 |

### 3.2 `loadConfig` — 加载配置文件

**任务**: 从 `~/.suit-skills/config.json` 读取配置，文件不存在时返回默认配置。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 文件不存在 → 返回默认配置，不报错 |
| 测试用例 2 | 文件存在且合法 → 返回文件内容 |
| 测试用例 3 | 文件存在但 JSON 格式错误 → 返回默认配置 + 打印警告 |

### 3.3 `saveConfig` — 保存配置文件

**任务**: 将配置对象写入 `~/.suit-skills/config.json`。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 写入后重新读取 → 内容一致 |
| 测试用例 2 | 目录不存在 → 自动创建目录后写入 |

### 3.4 `getConfigValue` — 获取单个配置项

**任务**: 支持点号路径访问，如 `"agents.claude.globalDir"`。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `"defaultSource"` → `"default"` |
| 测试用例 2 | `"agents.claude.globalDir"` → `"~/.claude/skills"` |
| 测试用例 3 | `"nonexistent.key"` → `undefined` |

### 3.5 `setConfigValue` — 设置单个配置项

**任务**: 支持点号路径设置，自动保存。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 设置 `defaultSource` 为 `"my-source"` → 重新读取验证 |
| 测试用例 2 | 设置 `agents.copilot.globalDir` → 新增映射成功 |

---

## 阶段 4 — Git 操作模块 (`packages/core/src/sources/git.ts`)

> **进度**：`[x]` 已完成（`packages/core/src/sources/git.ts`、`tests/lib/git.test.ts`）。`isGitAvailable` 等支持注入 `env` / `spawnSync` 以便测试模拟「无 git」。

### 4.1 `isGitAvailable` — 检测 git 是否可用

**任务**: 检测系统是否安装了 git 命令。

| 项 | 内容 |
|---|------|
| 测试用例 1 | git 已安装 → 返回 `true` |
| 测试用例 2 | git 未安装 → 返回 `false`（可通过修改 PATH 模拟） |

### 4.2 `cloneRepo` — 克隆仓库

**任务**: 将远程仓库 clone 到指定缓存目录。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 合法 URL + 空目标目录 → clone 成功，目录非空 |
| 测试用例 2 | 非法 URL → 抛出错误，包含明确错误信息 |
| 测试用例 3 | 目标目录已存在且有内容 → 抛出错误提示目录非空 |

### 4.3 `pullRepo` — 拉取最新更新

**任务**: 对已 clone 的仓库执行 `git pull`。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 正常仓库 → pull 成功 |
| 测试用例 2 | 仓库有本地修改冲突 → 返回失败标志 + 错误信息 |
| 测试用例 3 | 目录不是 git 仓库 → 返回失败标志 |

### 4.4 `cloneOrPullRepo` — 智能拉取（核心）

**任务**: 缓存不存在则 clone，已存在则 pull，pull 失败降级使用本地缓存。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 缓存目录不存在 → 执行 clone |
| 测试用例 2 | 缓存目录已存在 → 执行 pull |
| 测试用例 3 | pull 失败 → 返回缓存路径 + `warning: true` 标志 |
| 测试用例 4 | git 不可用 → 抛出明确错误提示安装 git |

---

## 阶段 5 — 缓存管理模块 (`packages/core/src/cache/index.ts`)

> **进度**：`[x]` 已完成（`packages/core/src/cache/index.ts`、`tests/lib/cache.test.ts`）。缓存根与 `SUIT_SKILLS_HOME` / `~/.suit-skills` 对齐；`urlToCacheDirName` 会将 `_` 规范为 `-` 以满足5.2 默认源目录名；`refreshCache` 在 pull 降级时返回字符串 `warning: "Using local cache..."`。

### 5.1 `getCacheDir` — 获取缓存根目录

**任务**: 返回 `~/.suit-skills/cache/` 路径。

| 项 | 内容 |
|---|------|
| 测试用例 | 返回路径以 `/.suit-skills/cache` 结尾 |

### 5.2 `getSourceCacheDir` — 获取指定源的缓存路径

**任务**: 根据 source URL 生成缓存子目录路径。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 默认源 URL → 返回 `~/.suit-skills/cache/gitee-com-digital-construction-center-1-suit-skills-lib` |
| 测试用例 2 | GitHub URL → 返回对应路径 |

### 5.3 `refreshCache` — 刷新指定源的缓存

**任务**: 对指定源执行 cloneOrPull，返回缓存路径和状态。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 首次执行 → clone，返回 `{ path, freshlyCloned: true }` |
| 测试用例 2 | 非首次 → pull，返回 `{ path, freshlyCloned: false }` |
| 测试用例 3 | 网络失败降级 → 返回 `{ path, warning: "Using local cache..." }` |

---

## 阶段 6 — Skill 解析模块 (`packages/core/src/skills/index.ts`)

> **进度**：`[x]` 已完成（`packages/core/src/skills/index.ts`、`tests/lib/skills.test.ts`）。

### 6.1 `parseMetaJson` — 解析 meta.json

**任务**: 读取并校验 meta.json，返回 `SkillMeta`。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 合法 meta.json → 返回完整的 `SkillMeta` 对象 |
| 测试用例 2 | 缺少 `name` 字段 → 抛出校验错误 |
| 测试用例 3 | 缺少 `version` 字段 → 抛出校验错误 |
| 测试用例 4 | `name` 与文件夹名不一致 → 抛出校验错误 |
| 测试用例 5 | 多余字段 → 不报错，保留在对象中 |

### 6.2 `scanSkillsFromCache` — 从缓存扫描所有 skill

**任务**: 扫描缓存目录下的所有 skill 文件夹，返回 `SkillMeta[]`。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 缓存有 3 个合法 skill → 返回长度为 3 的数组 |
| 测试用例 2 | 某个 skill 的 meta.json 不合法 → 跳过该 skill，其余正常返回 |
| 测试用例 3 | 缓存目录为空 → 返回空数组 |

### 6.3 `findSkillInCache` — 在缓存中查找指定 skill

**任务**: 按 name（可选 version）查找 skill。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `"code-review"` → 找到并返回 `SkillMeta` |
| 测试用例 2 | `"nonexistent"` → 返回 `null` |
| 测试用例 3 | `"code-review@1.0.0"` → 版本匹配，返回 |
| 测试用例 4 | `"code-review@9.9.9"` → 版本不匹配，返回 `null` |

### 6.4 `searchSkills` — 搜索 skill

**任务**: 按关键字匹配 name / description / tags。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `"react"` → 匹配 `react-helper`（name 含 react） |
| 测试用例 2 | `"代码审查"` → 匹配 `code-review`（description 含该词） |
| 测试用例 3 | `"commit"` → 匹配 `commit-helper`（tag 含 commit） |
| 测试用例 4 | `"zzzzz"` → 返回空数组 |

---

## 阶段 7 — 智能体目录模块 (`packages/core/src/targets/agents.ts`)

> **进度**：`[x]` 已完成（`packages/core/src/targets/agents.ts`、`tests/lib/agents.test.ts`）。

### 7.1 `resolveTargetPath` — 解析安装目标路径

**任务**: 根据安装模式和智能体名称，返回最终安装路径。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 项目级（默认） → `"./.skills/"` |
| 测试用例 2 | 全局 `-g` → `"~/.suit-skills/skills/"` |
| 测试用例 3 | `--agent claude` → `"./.claude/skills/"` |
| 测试用例 4 | `--agent claude -g` → `"~/.claude/skills/"` |
| 测试用例 5 | `--agent unknown` → 抛出错误 "Unknown agent: unknown" |

### 7.2 `getInstalledSkills` — 获取已安装的 skill 列表

**任务**: 扫描目标路径下的所有 skill 文件夹。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 目标有 2 个 skill → 返回名称数组 `["code-review", "commit-helper"]` |
| 测试用例 2 | 目标目录不存在 → 返回空数组 |
| 测试用例 3 | 目标目录存在但为空 → 返回空数组 |

---

## 阶段 8 — 安装逻辑模块 (`packages/core/src/install/index.ts`)

> **进度**：`[x]` 已完成（`packages/core/src/install/index.ts`、`tests/lib/install.test.ts`）。`rename` 策略会同步更新目标目录内 `meta.json` 的 `name` 与文件夹名一致。

### 8.1 `checkConflict` — 冲突检测

**任务**: 检查目标路径下是否已存在同名 skill。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 目标不存在同名 → 返回 `{ conflict: false }` |
| 测试用例 2 | 目标已存在同名 → 返回 `{ conflict: true, path: "..." }` |

### 8.2 `installSkill` — 安装单个 skill

**任务**: 从缓存拷贝 skill 到目标目录。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 正常安装 → 目标目录存在，meta.json 内容正确 |
| 测试用例 2 | 缓存中找不到 skill → 抛出错误 |
| 测试用例 3 | 目标目录写权限不足 → 抛出错误 |

### 8.3 `installSkillWithConflict` — 带冲突处理的安装

**任务**: 检测冲突后按用户选择（overwrite / skip / rename）处理。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 无冲突 → 直接安装 |
| 测试用例 2 | 冲突 + 用户选 overwrite → 覆盖安装，新内容生效 |
| 测试用例 3 | 冲突 + 用户选 skip → 不安装，返回跳过信息 |
| 测试用例 4 | 冲突 + 用户选 rename → 安装为 `code-review-1` |

---

## 阶段 9 — CLI 命令实现 (`apps/cli/src/commands/`)

> **进度**：`[x]` 已完成（`apps/cli/src/index.ts`、`apps/cli/src/cli/*`、`apps/cli/src/commands/*`、`tests/commands/cli.test.ts`）。`package.json` 已设 `"type": "module"` 以匹配 NodeNext 产物。

### 9.1 CLI 入口重构

**任务**: 重构 `apps/cli/src/index.ts` 为注册所有子命令的入口，命令拆分到 `apps/cli/src/commands/`。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `skills-cli --help` → 输出包含所有命令列表 |
| 测试用例 2 | `skills-cli --version` → 输出版本号 |
| 测试用例 3 | `skills-cli <unknown-command>` → 输出错误提示 |

### 9.2 `list` 命令

**任务**: 列出远程仓库中可用的 skills。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `skills-cli list` → 输出包含 `code-review`、`commit-helper`、`react-helper` |
| 测试用例 2 | `skills-cli list --tag review` → 只输出含 review 标签的 skill |
| 测试用例 3 | `skills-cli list --source all` → 聚合所有启用源的 skill |
| 测试用例 4 | `skills-cli list --source nonexistent` → 报错 "Source not found" |

### 9.3 `search` 命令

**任务**: 按关键字搜索 skill。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `skills-cli search react` → 输出 `react-helper` |
| 测试用例 2 | `skills-cli search zzzz` → 输出 "No skills found" |

### 9.4 `info` 命令

**任务**: 查看 skill 详细信息。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `skills-cli info code-review` → 输出 name、version、description、author、tags、source |
| 测试用例 2 | `skills-cli info nonexistent` → 报错 "Skill not found" |

### 9.5 `install` 命令

**任务**: 安装 skill 到指定目标。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `skills-cli install code-review` → 文件出现在 `.skills/code-review/` |
| 测试用例 2 | `skills-cli install code-review -g` → 文件出现在 `~/.suit-skills/skills/code-review/` |
| 测试用例 3 | `skills-cli install code-review --agent claude` → 文件出现在 `.claude/skills/code-review/` |
| 测试用例 4 | `skills-cli install code-review --source my-source` → 从指定源安装 |
| 测试用例 5 | `skills-cli install nonexistent` → 报错 "Skill not found" |
| 测试用例 6 | `skills-cli install code-review@1.0.0` → 指定版本安装 |
| 测试用例 7 | `skills-cli install Code-Review` → 报错 "Invalid skill name" |

### 9.6 `installed` 命令

**任务**: 查看本地已安装的 skills。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `skills-cli installed` → 列出 `.skills/` 下的 skill |
| 测试用例 2 | `skills-cli installed -g` → 列出全局安装的 skill |
| 测试用例 3 | `skills-cli installed --agent claude` → 列出 claude 目录下的 skill |
| 测试用例 4 | 无已安装 skill → 输出 "No skills installed" |

### 9.7 `update` 命令

**任务**: 更新已安装的 skill。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `skills-cli update` → 更新当前项目所有 skills，输出每个更新结果 |
| 测试用例 2 | `skills-cli update code-review` → 只更新指定 skill |
| 测试用例 3 | `skills-cli update -g` → 更新全局所有 |
| 测试用例 4 | 更新一个不存在的 skill → 输出 "Skill not installed" |
| 测试用例 5 | 远程版本与本地一致 → 输出 "Already up to date" |

### 9.8 `remove` 命令

**任务**: 卸载 skill。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `skills-cli remove code-review` → `.skills/code-review/` 目录被删除 |
| 测试用例 2 | `skills-cli remove code-review -g` → 全局目录下被删除 |
| 测试用例 3 | `skills-cli remove code-review --agent claude` → claude 目录下被删除 |
| 测试用例 4 | `skills-cli remove nonexistent` → 报错 "Skill not installed" |

### 9.9 `source` 子命令

**任务**: 源管理（add / remove / list / enable / disable / default）。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `source add my-repo https://github.com/me/skills.git` → 配置中多一条 source |
| 测试用例 2 | `source add my-repo <duplicate-url>` → 报错 "Source already exists" |
| 测试用例 3 | `source remove my-repo` → 配置中少一条 source |
| 测试用例 4 | `source remove default` → 报错 "Cannot remove default source" |
| 测试用例 5 | `source list` → 输出所有源及状态（enabled/disabled） |
| 测试用例 6 | `source enable my-repo` → 对应 source 的 enabled 变为 true |
| 测试用例 7 | `source disable my-repo` → enabled 变为 false |
| 测试用例 8 | `source default my-repo` → defaultSource 变为 my-repo |
| 测试用例 9 | `source default nonexistent` → 报错 "Source not found" |

### 9.10 `config` 子命令

**任务**: 配置查看与修改。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `config list` → 输出完整配置（JSON 格式） |
| 测试用例 2 | `config get defaultSource` → 输出 `"default"` |
| 测试用例 3 | `config set defaultSource my-source` → 修改成功，重新读取验证 |
| 测试用例 4 | `config get nonexistent.path` → 输出 `undefined` |

---

## 阶段 10 — 体验优化

> **进度**：`[x]` 已完成（`packages/core/src/utils/output.ts`、`tests/utils/output.test.ts`；命令与 `config` 加载警告已接入；`install`/`list`/`remove` 别名见 `tests/commands/cli.test.ts`「阶段 10」）。

### 10.1 统一输出格式化

**任务**: 统一成功/警告/错误消息的输出样式。

| 项 | 内容 |
|---|------|
| 测试用例 1 | 成功消息前缀为 `✔`（绿色） |
| 测试用例 2 | 警告消息前缀为 `⚠`（黄色） |
| 测试用例 3 | 错误消息前缀为 `✖`（红色） |

### 10.2 CLI 命令别名

**任务**: 支持短别名。

| 项 | 内容 |
|---|------|
| 测试用例 1 | `skills-cli i code-review` 等同于 `install` |
| 测试用例 2 | `skills-cli ls` 等同于 `list` |
| 测试用例 3 | `skills-cli rm code-review` 等同于 `remove` |

---

## 目标目录结构

```
src/
├── index.ts                # CLI 入口，注册命令
├── types/
│   └── index.ts            # 所有 TypeScript 类型
├── utils/
│   ├── validate.ts         # validateSkillName, parseSkillIdentifier
│   ├── path.ts             # urlToCacheDirName, ensureDir
│   ├── fs.ts               # copyDir, parseVersion
│   └── output.ts           # 统一输出格式
├── lib/
│   ├── config.ts           # 配置管理 (load/save/get/set)
│   ├── git.ts              # Git 操作 (clone/pull/isAvailable)
│   ├── cache.ts            # 缓存管理 (getDir/refresh)
│   ├── skills.ts           # Skill 解析/搜索
│   ├── agents.ts           # 智能体目录解析
│   └── install.ts          # 安装/冲突处理
├── commands/
│   ├── list.ts
│   ├── search.ts
│   ├── info.ts
│   ├── install.ts
│   ├── installed.ts
│   ├── update.ts
│   ├── remove.ts
│   ├── source.ts
│   └── config.ts
tests/
├── utils/
│   ├── validate.test.ts
│   ├── path.test.ts
│   ├── fs.test.ts
│   └── output.test.ts
├── lib/
│   ├── config.test.ts
│   ├── git.test.ts
│   ├── cache.test.ts
│   ├── skills.test.ts
│   ├── agents.test.ts
│   └── install.test.ts
└── commands/
    ├── list.test.ts
    ├── search.test.ts
    ├── info.test.ts
    ├── install.test.ts
    ├── installed.test.ts
    ├── update.test.ts
    ├── remove.test.ts
    ├── source.test.ts
    └── config.test.ts
```

---

## 任务统计

| 阶段 | 任务数 | 测试用例数 | 说明 |
|------|--------|-----------|------|
| 0 测试基础设施 | 1 | 1 | 搭建框架 |
| 1 类型定义 | 1 | 1 | 全部接口 |
| 2 工具函数 | 6 | 22 | 纯函数，无副作用 |
| 3 配置管理 | 5 | 11 | 读写配置文件 |
| 4 Git 操作 | 4 | 10 | 调用系统 git |
| 5 缓存管理 | 3 | 6 | 缓存策略 |
| 6 Skill 解析 | 4 | 14 | meta.json 解析与搜索 |
| 7 智能体目录 | 2 | 8 | 路径解析 |
| 8 安装逻辑 | 3 | 9 | 拷贝与冲突处理 |
| 9 CLI 命令 | 10 | 34 | 端到端命令测试 |
| 10 体验优化 | 2 | 5 | 输出与别名 |
| **合计** | **41** | **~121** | |
