# Sources 内置源管理增强需求规格说明书

## 1. 背景

当前 Sources 页面支持查看、添加、启用/禁用、删除技能源。随着内置推荐源增加，Sources 页面需要更清楚地区分“用户自定义源”和“系统内置推荐源”，并提供更安全的删除与恢复机制。

主要问题：

- `Delete` 操作缺少明确的二次确认，容易误删 source。
- 内置推荐源被删除后，用户缺少清晰的恢复入口。
- 如果恢复逻辑做成“重置”，容易让用户误以为会删除自己添加的 source。
- Sources 页面只展示 name/url/enabled，缺少内置源说明，用户不知道各源用途。
- 如果 `loadConfig()` 自动补齐内置源，用户删除内置源后刷新又出现，体验不符合预期。

## 2. 目标

1. Sources 页面删除 source 时必须二次确认。
2. 为内置推荐源提供说明信息。
3. 提供“添加/恢复内置源”能力。
4. 恢复内置源时只补齐缺失的内置源，不影响用户自定义源。
5. 删除内置源后不会自动恢复，只有用户主动点击恢复按钮才补回。
6. 所有补回的内置源默认 `enabled: false`。

## 3. 非目标

- 不删除已安装 skill。
- 不清空或重置用户配置。
- 不自动启用恢复的内置源。
- 不做 source 质量评分或 stars 动态抓取。
- 不把非 Git URL 网站作为 source 加入。
- 不实现批量启用所有内置源。
- 不修改技能库扫描逻辑。

## 4. 用户故事

### 4.1 安全删除 source

作为用户，我希望点击 Delete 后先看到确认提示，避免误删重要 source。

验收：

- 第一次点击 Delete 不会立即删除。
- 当前 source 行展开确认区域。
- 确认区域显示 source 名称和说明。
- 点击确认区域里的 Delete 才删除。
- 点击 Cancel 取消删除。

### 4.2 恢复内置推荐源

作为用户，我可能误删了内置源，我希望能一键把缺失的内置源加回来，但不影响我自己添加的 source。

验收：

- Sources 页面有 `Add built-in sources` 按钮。
- 点击后只添加缺失的内置源。
- 已存在的 source 不重复添加。
- 用户自定义 source 保留。
- 已有 source 的 enabled 状态不改变。
- 新补回的内置源默认 disabled。

### 4.3 理解 source 用途

作为用户，我希望在 Sources 页面看到每个内置源的说明，从而判断是否需要启用。

验收：

- 内置源展示简短说明。
- 内置源展示类型/标签，例如 `official`、`engineering`、`collection`、`cn`。
- 自定义源显示为 `custom`。
- URL 仍然可见。

## 5. 数据模型

当前 `Source` 类型保持不变：

```ts
interface Source {
  name: string;
  url: string;
  enabled: boolean;
}
```

内置源说明不写入用户 config，通过代码内置 catalog 派生：

```ts
interface BuiltinSourceInfo {
  name: string;
  url: string;
  label: string;
  category: 'official' | 'engineering' | 'collection' | 'cn' | 'specialized';
  description: string;
}
```

## 6. 内置源清单

| name | URL | category | description |
| --- | --- | --- | --- |
| `anthropics-skills` | `https://github.com/anthropics/skills.git` | official | Claude 官方技能库，适合作为基础源。 |
| `superpowers` | `https://github.com/obra/superpowers.git` | engineering | 复杂开发任务、TDD、调试、代码重构技能。 |
| `vercel-agent-skills` | `https://github.com/vercel-labs/agent-skills.git` | official | Web、全栈、Next.js 与部署相关技能。 |
| `huggingface-skills` | `https://github.com/huggingface/skills.git` | official | Hugging Face 与开源模型生态相关技能。 |
| `claude-arsenal` | `https://github.com/majiayu000/claude-arsenal.git` | cn | 中文友好的工程技能合集。 |
| `daymade-claude-code-skills` | `https://github.com/daymade/claude-code-skills.git` | engineering | 生产级开发、安全与 GitHub 操作技能。 |
| `remotion-skills` | `https://github.com/remotion-dev/skills.git` | specialized | Remotion 视频、动画与数据可视化技能。 |
| `awesome-claude-skills` | `https://github.com/ComposioHQ/awesome-claude-skills.git` | collection | Claude 技能合集索引。 |
| `antigravity-awesome-skills` | `https://github.com/sickn33/antigravity-awesome-skills.git` | collection | 多平台 AI 技能合集。 |
| `inbharatai-claude-skills` | `https://github.com/inbharatai/claude-skills.git` | collection | 多类别生产级 Claude 技能合集。 |
| `awesome-agent-skills` | `https://github.com/mafichoni/awesome-agent-skills.git` | collection | 多平台 Agent 技能资源合集。 |

## 7. 配置行为

新安装用户：

- `getDefaultConfig()` 中包含 `default` 源。
- 也包含所有内置推荐源。
- 只有 `default` 为 `enabled: true`。
- 其他内置推荐源均为 `enabled: false`。

已有用户：

- `loadConfig()` 不自动补齐被删除的内置推荐源。
- 用户删除内置源后，刷新页面不应自动出现。
- 用户点击 `Add built-in sources` 后才补齐。

## 8. API 设计

新增接口：

```http
POST /api/sources/restore-builtins
```

响应：

```json
{
  "added": ["anthropics-skills", "superpowers"],
  "defaultSource": "default",
  "sources": []
}
```

行为：

- 遍历内置源 catalog。
- 当前配置中已有同名 source，跳过。
- 当前配置中已有同 URL source，跳过。
- 缺失的内置源以 `enabled: false` 添加。
- 不修改已有 source。
- 不修改 `defaultSource`。
- 保存 config。
- 清理 Web rows cache。

## 9. 前端 UI 需求

Sources 页面顶部增加按钮：

```text
Add built-in sources
```

点击后：

- 调用 `restoreBuiltinSources()`。
- 更新 `sources` 和 `defaultSource` state。
- `added.length > 0` 时提示 `Added N built-in sources`。
- `added.length === 0` 时提示 `Built-in sources already present`。

Sources 列表展示：

```text
name [default?] [builtin/custom] [category?]
description
url
status
actions
```

## 10. 删除二次确认

点击 Delete 后展开确认条：

```text
Delete source "xxx"? Installed skills are not removed.
[Delete] [Cancel]
```

限制：

- `default` 不能删除。
- 当前 `defaultSource` 不能删除。
- 最后一条 enabled source 不能删除。

## 11. 测试需求

后端测试：

- `getDefaultConfig()` 包含内置源，且内置源默认 disabled。
- `loadConfig()` 不自动恢复用户删除的内置源。
- `restoreBuiltinSources()` 补齐缺失内置源，默认 disabled。
- `restoreBuiltinSources()` 不删除自定义 source、不修改 `defaultSource`、不重复添加同名或同 URL source。
- `removeWebSource()` 继续保护 default/defaultSource/最后 enabled source。

前端验证：

- `npm run typecheck`
- `npm run build:web`

## 12. 验收标准

- Sources 页面删除 source 必须二次确认。
- 删除内置源后刷新不会自动回来。
- 点击 `Add built-in sources` 可以恢复缺失内置源。
- 恢复不会删除/覆盖用户自定义源。
- 恢复不会启用内置源。
- Sources 页面能看出 built-in/custom。
- 内置源展示用途说明。
- 现有添加/启用/禁用/delete API 不破坏。
