# Suit Skills 应用内 Skill 修改与 AI 辅助需求说明

## 1. 背景

当前 `suit-skills` 已具备以下基础能力：

- 浏览远程 source 中的 skill
- 查看 skill 文件树与文件内容
- 安装 skill 到本地
- 在桌面端/应用内管理 source、安装目标和翻译配置

但现在应用内对 skill 的能力仍以“查看”和“安装”为主，缺少“直接修改并快速验证”的闭环。  
如果用户想调一个 skill，通常还要跳出应用、去文件系统或编辑器里手动改，再回到目标 Agent 中测试，流程比较割裂。

因此需要新增“应用内直接修改 skill”的能力，同时必须提供安全的“重置/恢复”机制，避免用户改乱后无法回到初始状态。  
另外，考虑到 skill 本质上是由 `SKILL.md`、脚本、参考文件等组成的目录包，这类修改非常适合引入 AI 辅助生成补丁或代码。

## 2. 目标

本需求希望达成以下目标：

1. 用户可以在应用内直接修改本地 skill 文件，而不必跳到外部编辑器。
2. 修改后的结果可以快速用于测试，缩短“改一处、试一次”的循环。
3. 系统提供清晰、可预期的恢复能力，允许用户回退单文件或整个 skill。
4. 在修改过程中引入 AI 辅助编码，降低编辑门槛并提升改写效率。
5. 保持现有安装、source 管理、文件浏览、安全边界不被破坏。

## 3. 核心结论

### 3.1 编辑对象

MVP 阶段只允许编辑“本地已安装 skill”，不直接编辑远程 source cache。

原因：

- 编辑已安装 skill 才符合“快速测试”的核心目标
- 修改 source cache 容易和“远程来源”“缓存刷新”“更新覆盖”产生语义混淆
- 当前产品已有 `Installed` 概念，天然适合作为编辑入口

### 3.2 重置语义

这里不建议使用过于宽泛的“重置”作为唯一文案，建议明确拆成：

- `恢复文件原版`
- `恢复整个 skill 原版`
- 如后续有历史版本，再补充 `回退到某个快照`

“原版”在本需求里指：该 skill 被安装到本地时的初始内容，而不是“当前远程 source 的最新内容”，也不是“清空用户配置”。

### 3.3 AI 介入方式

AI 不应直接无提示覆盖文件；优先采用“生成补丁/改动预览 -> 用户确认应用”的交互。

这样可以兼顾：

- 可控性
- 可回溯性
- 降低误改风险
- 便于和重置、差异对比能力组合

## 4. 产品范围

## 4.1 MVP 范围

- 在应用内打开已安装 skill 的本地文件
- 编辑文本文件并保存
- 查看未保存状态与已修改状态
- 恢复当前文件到安装初始版本
- 恢复整个 skill 到安装初始版本
- 对当前文件或整个 skill 发起 AI 修改请求
- AI 返回建议改动后，允许预览并确认应用
- 修改后可直接用于本机 Agent 测试

## 4.2 暂不纳入 MVP

- 直接编辑远程 source 中的 skill
- 云端协作编辑
- 多人并发编辑冲突处理
- 图形化 diff 编辑器的复杂能力
- 二进制文件编辑
- skill 发布、上传、同步回 source
- 自动执行 skill 内脚本并让 AI 直接控制系统命令

## 5. 现有架构约束

结合当前仓库实现，后续设计需要遵守以下现实约束：

- 当前应用已经能查看 skill 文件树和文件内容，但仍偏只读
- 当前系统存在“中央 skill 库 + 各 agent 目录软链接/启用”的设计方向
- source 恢复能力已经采用 `restore` 语义，不应把 skill 恢复和 source 恢复混在一起
- Web/Tauri 共用较多 API 逻辑，新增能力最好优先落在统一的 `src/lib/web/api.ts` 语义层
- 文件访问已经有路径边界校验，新增写入能力必须继续沿用相同安全约束

## 6. 用户故事

### 6.1 快速改写 Skill Prompt

作为用户，我希望在应用内直接打开某个已安装 skill 的 `SKILL.md`，修改提示词后立即保存，这样我可以马上在 Claude/Codex/Cursor 中重新测试。

### 6.2 用 AI 帮我补全 Skill

作为用户，我希望输入一句自然语言，比如“给这个 skill 增加输出格式约束，并补一段示例”，然后由 AI 帮我修改对应文件，我只需要确认改动是否合理。

### 6.3 改坏后快速恢复

作为用户，我希望当我改坏某个文件时，可以一键恢复该文件原版；如果整个 skill 改乱了，也可以恢复整个 skill，而不影响别的 skill。

### 6.4 区分本地改动与原始内容

作为用户，我希望知道当前 skill 是否被我改过、改了哪些文件、是否还有未保存变更，避免误以为当前内容仍然是安装时原版。

## 7. 功能需求

### 7.1 入口与信息架构

建议将“修改 skill”入口放在 `Installed` 体系下，而不是 `Library`。

建议入口形式：

- `Installed` 列表项上的 `编辑`
- 已安装 skill 详情页上的 `进入编辑模式`
- 对未安装 skill 不展示编辑入口

建议在详情中明确区分两类视图：

- `来源视图`：查看 source 中的原始 skill 内容
- `本地视图`：查看并编辑本地已安装内容

MVP 也可以先只做“本地视图”。

### 7.2 编辑模型

MVP 建议仅支持文本文件编辑：

- `.md`
- `.txt`
- `.json`
- `.yaml` / `.yml`
- `.toml`
- `.js` / `.ts` / `.py` / `.sh` 等脚本文件

二进制文件：

- 允许预览
- 不允许直接编辑

编辑器最小能力：

- 打开文件
- 修改文本
- 保存
- 取消当前未保存修改
- 标记 dirty 状态

状态建议至少分为：

- `未修改`
- `已修改未保存`
- `已保存但已偏离原版`

### 7.3 原版快照

要支持“恢复原版”，系统需要为每个已安装 skill 保存一份基线快照。

建议基线定义：

- 当 skill 第一次安装到本地时，记录安装时原始内容作为 baseline

建议保存内容：

- skill 名称
- source 名称
- 安装时版本
- 安装时间
- baseline 文件快照或可恢复副本
- 文件级 hash 信息

建议 baseline 不放在 skill 目录内部暴露给用户，避免误删；而是放在 `~/.suit-skills` 管理目录下的专用区域。

### 7.4 恢复/重置能力

恢复能力建议分三级：

1. `恢复未保存修改`
   仅撤销编辑器里尚未保存到磁盘的内容。

2. `恢复文件原版`
   将单个文件恢复到 baseline 状态。

3. `恢复整个 skill 原版`
   将该 skill 目录整体恢复到 baseline 状态。

行为要求：

- 恢复文件时，不影响同 skill 中其他文件
- 恢复整个 skill 时，只影响当前 skill
- 不影响 source 配置
- 不影响其他已安装 skill
- 恢复前给出明确确认

### 7.5 AI 辅助编码

AI 修改建议支持两种上下文范围：

- `仅当前文件`
- `整个 skill`

用户输入形式：

- 自然语言需求，例如“把这个 skill 的输出格式改成 JSON，并在 references 中增加约束说明”

AI 输出形式：

- 首选结构化补丁
- 次选完整文件替换提案

交互要求：

- 展示本次 AI 将修改哪些文件
- 展示修改前后差异或至少展示新旧内容对比
- 用户可选择 `应用` 或 `放弃`
- AI 不能在未确认的情况下直接覆盖本地文件

### 7.6 AI 配置

不建议直接复用当前“翻译配置”作为“AI 编码配置”的唯一入口。  
翻译是轻量单轮任务，代码修改则是更高风险、更长上下文的能力，建议独立配置。

建议新增配置项：

- provider: `openai` / `cli` / `none`
- apiBaseUrl
- apiKey
- model
- cliCommand
- cliArgs
- maxContextFiles
- maxPatchSize

如果实现成本受限，MVP 可以先在底层配置结构上复用同一 provider 体系，但 UI 层仍应明确区分“翻译服务”和“AI 修改服务”。

### 7.7 差异查看

为了支撑恢复和 AI 修改，系统应提供最基本的 diff 能力：

- 当前文件相对 baseline 的差异
- 当前 skill 下哪些文件已修改
- AI 提议修改的文件列表

MVP 不强求复杂代码高亮 diff，但至少要让用户看得出：

- 新增了什么
- 删除了什么
- 改了哪些文件

### 7.8 与现有安装/更新/删除流程的关系

当 skill 存在本地修改时，相关操作需要定义明确行为：

- `更新 skill`：若本地有改动，应先警告用户，并提供“取消更新 / 先恢复原版 / 强制覆盖”选项
- `删除 skill`：保持当前删除逻辑，但若存在未保存修改，应先提示
- `重新安装同名 skill`：默认不静默覆盖已编辑版本

## 8. 建议的数据模型

可新增一组本地编辑元数据，例如：

```ts
interface SkillEditState {
  skillName: string;
  target: string;
  scope: "project" | "global";
  baselineId: string;
  sourceName?: string;
  installedVersion?: string;
  edited: boolean;
  dirtyFiles: string[];
  modifiedFiles: string[];
  updatedAt: string;
}

interface SkillBaselineSnapshot {
  baselineId: string;
  skillName: string;
  sourceName?: string;
  installedVersion?: string;
  createdAt: string;
  storagePath: string;
  fileHashes: Record<string, string>;
}
```

## 9. 建议 API

以下为建议接口，命名可后续再统一：

### 9.1 读取本地 skill 文件树

```http
GET /api/installed/:name/files?target=claude&scope=project
```

### 9.2 读取本地 skill 文件内容

```http
GET /api/installed/:name/files/*path?target=claude&scope=project
```

### 9.3 保存文件

```http
PUT /api/installed/:name/files/*path
```

请求体：

```json
{
  "target": "claude",
  "scope": "project",
  "content": "..."
}
```

### 9.4 获取修改状态

```http
GET /api/installed/:name/edit-state?target=claude&scope=project
```

### 9.5 恢复单文件

```http
POST /api/installed/:name/reset-file
```

### 9.6 恢复整个 skill

```http
POST /api/installed/:name/reset-skill
```

### 9.7 AI 修改

```http
POST /api/installed/:name/ai-edit
```

请求体建议：

```json
{
  "target": "claude",
  "scope": "project",
  "mode": "file",
  "filePath": "SKILL.md",
  "prompt": "补充输出格式约束，并增加两个使用示例"
}
```

返回值建议包含：

- 涉及文件列表
- 变更预览
- 补丁文本或新内容
- 会话 id

### 9.8 应用 AI 提议

```http
POST /api/installed/:name/apply-ai-edit
```

## 10. 安全要求

- 只允许读写已解析出的 skill 安装目录内文件
- 禁止通过请求参数写入任意绝对路径
- AI 修改默认只允许改动 skill 目录内部文件
- 不允许 AI 直接执行 shell 命令作为默认行为
- 保存和恢复前都要做路径边界校验
- 如果未来支持“新增文件/删除文件”，也必须限定在 skill 根目录内

## 11. 非功能要求

- 桌面端与 Web 端尽量复用统一 API 语义
- 文本编辑保存应尽量低延迟
- 对大文件要有体积限制和降级策略
- 发生 AI 失败、网络失败、CLI 失败时，不能影响手动编辑能力
- 所有新增文案与接口继续保持 UTF-8

## 12. 分阶段建议

### 阶段 1：本地可编辑闭环

- 已安装 skill 的本地文件树
- 文本文件编辑与保存
- dirty 状态
- baseline 快照
- 单文件恢复与整个 skill 恢复

### 阶段 2：AI 辅助修改

- AI 修改配置
- 当前文件/整个 skill 两种 AI 修改模式
- 变更预览
- 应用或丢弃 AI 提议

### 阶段 3：增强能力

- 文件级 diff
- 编辑历史/快照列表
- 更新冲突处理
- 测试辅助动作
- 与 source 原始版本对比

## 13. 验收标准

- 已安装 skill 可以在应用内直接修改并保存
- 保存后的文件会立即影响本机实际 skill 内容，可用于测试
- 用户可以恢复单文件到安装初始版本
- 用户可以恢复整个 skill 到安装初始版本
- AI 可以基于指令生成修改建议
- AI 修改必须先预览、再确认应用
- 任意恢复操作都不会影响其他 skill、source 配置或用户安装目标配置
- 任意文件读写都不能越过 skill 根目录

## 14. 需要进一步确认的决策点

以下问题当前建议已给出倾向，但正式开发前最好统一：

1. 编辑入口是否只放在 `Installed`，还是 `Library` 也要能切换到本地副本
2. baseline 是首次安装时创建，还是每次更新后重建
3. AI 修改是否允许一次改多个文件
4. AI 配置是否独立于翻译配置
5. 是否允许在应用内新增/删除文件，还是 MVP 只支持改已有文件

## 15. 推荐结论

从现阶段产品状态看，最合适的落地方式是：

- 先围绕“已安装 skill 的本地编辑”做闭环
- 把“恢复原版”定义为“恢复到安装时 baseline”
- AI 先做“生成补丁并确认应用”，不要一步到位做全自动覆写

这样既能满足“快速测试”的核心诉求，也能把风险控制在当前架构可承受范围内。
