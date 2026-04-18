# 内置源与国内镜像设计

## 目标

内置源只保留一个逻辑来源名称，不再把 GitHub 源和国内镜像作为两条独立 source 展示。对同一内容的国内镜像，通过每条内置源自己的“国内镜像”开关控制；开关默认开启，因此用户启用这些内置源后，实际拉取使用国内镜像 URL。

这能避免 API、CLI、Web 页面出现 `xxx` 与 `xxx cn` 两条重复源，也能让 `--source anthropics-skills` 这类命令在国内网络下直接走镜像。

## 数据模型

`Config.sources[]` 继续以 `name` 作为稳定标识，新增可选字段：

- `domesticMirror.url`：国内镜像 Git URL。
- `domesticMirror.enabled`：是否使用国内镜像。内置源默认 `true`。

执行拉取、扫描、安装、更新时，使用“有效 URL”：

- 自定义源或没有镜像的源：`source.url`。
- 有镜像且 `domesticMirror.enabled === true`：`domesticMirror.url`。
- 有镜像但关闭：`source.url`。

`source.name`、`defaultSource`、CLI 参数、Web 下拉筛选都不随镜像开关改变。

## 内置源目录

| name | 中文展示名 | 上游 URL | 国内镜像 URL | 默认启用 source | 默认启用镜像 |
| --- | --- | --- | --- | --- | --- |
| `default` | Suit Skills 默认源 | `https://gitee.com/digital-construction-center_1/suit-skills-lib.git` | 无 | 是 | 不适用 |
| `anthropics-skills` | Anthropic 官方技能库 | `https://github.com/anthropics/skills.git` | `https://gitee.com/zhujun12/skills.git` | 否 | 是 |
| `superpowers` | Superpowers 工程技能库 | `https://github.com/obra/superpowers.git` | `https://gitee.com/zhujun12/superpowers.git` | 否 | 是 |
| `vercel-agent-skills` | Vercel Agent 技能库 | `https://github.com/vercel-labs/agent-skills.git` | `https://gitee.com/zhujun12/agent-skills.git` | 否 | 是 |
| `huggingface-skills` | Hugging Face 技能库 | `https://github.com/huggingface/skills.git` | `https://gitee.com/zhujun12/huggingface-skills.git` | 否 | 是 |
| `antigravity-awesome-skills` | Antigravity 技能合集 | `https://github.com/sickn33/antigravity-awesome-skills.git` | `https://gitee.com/zhujun12/antigravity-awesome-skills.git` | 否 | 是 |
| `awesome-claude-skills` | Claude 技能资源索引 | `https://github.com/ComposioHQ/awesome-claude-skills.git` | `https://gitee.com/zhujun12/awesome-claude-skills.git` | 否 | 是 |

## API 与 CLI 行为

- `getDefaultConfig()` 写入单条逻辑源，并为可镜像内置源设置 `domesticMirror.enabled: true`。
- `restoreBuiltinSources()` 只恢复缺失的逻辑源，不再恢复 `xxx cn`。
- `loadConfig()` 对旧配置做兼容迁移：
  - 如果发现旧的 `xxx cn` 源，合并到同名逻辑源的 `domesticMirror`。
  - 如果逻辑源缺少 `domesticMirror`，按内置目录补齐，默认开启。
  - 自定义 source 不修改。
- Web `GET /api/sources` 返回 `effectiveUrl`、`domesticMirror`、中文 `label` 与中文 `description`。
- Web `PATCH /api/sources/:name` 支持更新 `enabled` 和 `domesticMirror.enabled`。
- CLI `source list` 展示逻辑 URL、有效 URL、启用状态与镜像状态，保证终端输出与 API 语义一致。

## Web 展示

Sources 页面每条内置源展示：

- 中文展示名与中文描述。
- 上游 URL。
- 当前实际使用 URL。
- 有镜像时展示“国内镜像”按钮，默认打开。

自定义源不展示国内镜像按钮。

## 回归检查

- 配置测试：默认配置没有 `xxx cn` 重复源，内置源镜像默认开启。
- 配置迁移测试：旧 `xxx cn` 源会被合并，不保留重复项。
- 缓存测试：`refreshCache(source)` 在镜像开启时使用 `domesticMirror.url`。
- Web API 测试：`listWebSources()` 返回中文描述与有效 URL；`updateWebSource()` 可以切换镜像。
- CLI 测试：`source list` 输出有效 URL 和镜像状态。
- Web 构建或类型检查：前端 Source 类型与 API 返回字段一致。
