# Suit Skills Web 任务拆解与测试用例

> 本文基于 `docs/web-requirements.md` 拆解，专注 Web 管理闭环：`SKILL.md` frontmatter 元信息、未安装 skill 的 `npx` 安装命令分享、已安装 skill 的搜索、删除和 zip 导出。
>
> 现有仓库已经具备部分 Web 骨架，包括 `src/commands/web.ts`、`src/lib/web/api.ts`、`src/lib/web/server.ts`、`web/`、`build:web` 和 `dev:web` 脚本。下面任务按“增量补齐”设计。

## 当前执行进度

- `[x]` 阶段 1：`SKILL.md` frontmatter 解析与 `meta.json` 过渡 fallback。
- `[x]` 阶段 2：Web API 数据模型升级，包括技能库、详情、已安装搜索。
- `[x]` 阶段 3：安装、删除、zip 导出 API 与 HTTP 路由。
- `[x]` 阶段 4：Web 前端基础结构与 API client 升级。
- `[x]` 阶段 5：技能库页面主流程，包括安装、复制 `npx` 命令、分享文本。
- `[x]` 阶段 6：已安装页面搜索、删除确认、zip 导出。
- `[x]` 阶段 7：Sources 管理入口和 Tags 入口；Sources 支持新增、删除、启用和禁用。
- `[x]` 阶段 8：路径边界、错误格式、默认本地监听校验。
- `[-]` 阶段 9：端到端验收已完成 Web 浏览器检查；全量测试仍有既有 CLI 版本号断言和 Git 集成超时问题。

## 开发流程与质量门禁

每个小节完成后，至少执行：

| 命令 | 何时必须执行 |
|---|---|
| `npm test` | 每个后端能力、CLI 能力、共享逻辑任务完成后 |
| `npm run typecheck` | 修改 `src/**/*.ts` 或共享类型时 |
| `npm run build:web` | 修改 `web/**` 后 |
| `npm run build:all` | Web 前后端联调完成后 |

前端页面任务还应通过浏览器人工验证关键路径：

- 技能库列表能加载。
- 详情能打开。
- 已安装页能搜索。
- 删除有二次确认。
- 导出 zip 能触发下载。
- 复制命令内容以 `npx suit-skills@latest` 开头。

## 阶段 0：基线确认与测试夹具

> 目标：为后续 Web 改造准备稳定测试数据，避免每个任务重复搭临时目录。

### 0.1 建立标准 `SKILL.md` 测试夹具

**任务**：在测试中增加标准 skill 目录生成工具，支持带 frontmatter、无 frontmatter、旧版 `meta.json` fallback、未知来源已安装 skill。

| 项 | 内容 |
|---|---|
| 目标文件 | `tests/helpers/skills-fixtures.ts` 或现有测试内 helper |
| 涉及测试 | `tests/lib/web-api.test.ts`、后续新增测试 |
| 验收 | 测试可快速生成 source skill 和 installed skill |

测试用例：

| 编号 | 输入 | 期望 |
|---|---|---|
| 0.1.1 | 写入带 frontmatter 的 `SKILL.md` | 能读取 name/version/description/tags |
| 0.1.2 | 写入无 frontmatter 的 `SKILL.md` | 能以目录名作为 fallback name |
| 0.1.3 | 写入旧版 `meta.json` + `SKILL.md` | 能用于过渡期 fallback |
| 0.1.4 | 写入本地 installed skill，无 source 记录 | 能被识别为未知来源 |

### 0.2 明确 Web 任务测试目录

**任务**：约定后端 Web 测试放在 `tests/lib/web-api.test.ts` 或拆到 `tests/lib/web/*.test.ts`，前端纯函数测试放到 `web/src/**/*.test.ts`。

| 项 | 内容 |
|---|---|
| 目标文件 | `vitest.config.ts`，如需要包含 web 测试 |
| 验收 | `npm test` 能覆盖新增测试文件 |

## 阶段 1：Skill 标准结构与元信息解析

> 目标：让系统从 `SKILL.md` frontmatter 读取元信息，不再以 `meta.json` 为主路径。

### 1.1 定义 Web 元信息类型

**任务**：补充 Web 层需要的数据类型。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/types/index.ts` 或 `src/lib/web/api.ts` |
| 类型 | `MetadataSource`、`WebSkillSummary`、`WebSkillDetail`、`WebInstalledSkill` |
| 验收 | 类型能表达 `skill-md`、`meta-json-fallback`、`unknown` |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 1.1.1 | 导入 Web 类型 | `npm run typecheck` 通过 |

### 1.2 实现 `SKILL.md` frontmatter 解析

**任务**：新增解析函数，读取 `SKILL.md` 顶部 YAML-like frontmatter。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/skills.ts` 或新增 `src/lib/skill-metadata.ts` |
| 输入 | skill 目录路径 |
| 输出 | 元信息、正文 markdown、metadataSource |
| 注意 | 不引入重型依赖时，只需支持当前需求字段：string 与 string[] |

测试用例：

| 编号 | 输入 | 期望 |
|---|---|---|
| 1.2.1 | frontmatter 包含 `name/version/description/author/tags` | 正确解析所有字段 |
| 1.2.2 | tags 使用多行数组 | 返回 string[] |
| 1.2.3 | tags 使用行内数组，如 `[review, quality]` | 返回 string[] |
| 1.2.4 | 无 frontmatter | name 从目录名推断，metadataSource 为 `unknown` |
| 1.2.5 | frontmatter 格式错误 | 不崩溃，返回可诊断错误或 unknown 状态 |
| 1.2.6 | `SKILL.md` 不存在 | 不崩溃，返回目录名 fallback |

### 1.3 实现 `meta.json` 过渡 fallback

**任务**：当 `SKILL.md` 无 frontmatter 且存在 `meta.json` 时，短期使用 `meta.json` 填充信息。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/skills.ts` 或 `src/lib/skill-metadata.ts` |
| 验收 | 优先级为 `SKILL.md` frontmatter > `meta.json` > 目录名 |

测试用例：

| 编号 | 输入 | 期望 |
|---|---|---|
| 1.3.1 | 同时存在 frontmatter 和 `meta.json` | 使用 frontmatter |
| 1.3.2 | 无 frontmatter，有合法 `meta.json` | 使用 `meta-json-fallback` |
| 1.3.3 | 无 frontmatter，`meta.json` 非法 | 使用目录名 fallback，不崩溃 |

## 阶段 2：Web API 数据模型升级

> 目标：把现有 `src/lib/web/api.ts` 从 `meta.json` 模型升级到 `SKILL.md` frontmatter 模型。

### 2.1 升级 `listWebSkills`

**任务**：技能库列表从 source cache 中扫描 skill 目录，读取 `SKILL.md` frontmatter 并返回新版摘要。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts` |
| 相关测试 | `tests/lib/web-api.test.ts` |
| 验收 | 返回字段包含 `metadataSource`、`installedTargets`、`installed` |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 2.1.1 | source 中有带 frontmatter 的 skill | 列表返回正确名称、版本、描述、标签 |
| 2.1.2 | 按 `q` 搜索名称 | 只返回匹配项 |
| 2.1.3 | 按 `q` 搜索描述 | 只返回匹配项 |
| 2.1.4 | 按 `q` 搜索标签 | 只返回匹配项 |
| 2.1.5 | 按 `tag` 过滤 | 只返回包含标签的 skill |
| 2.1.6 | source 不存在 | 返回 `SOURCE_NOT_FOUND` |

### 2.2 升级 `getWebSkillDetail`

**任务**：详情接口返回 `frontmatter`、`markdown`、`metadataSource`，不再以 `meta` 为核心字段。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts` |
| API | `GET /api/skills/:name` |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 2.2.1 | 查询存在 skill | 返回 markdown 正文和 frontmatter |
| 2.2.2 | 查询不存在 skill | 返回 `SKILL_NOT_FOUND` |
| 2.2.3 | skill name 非法 | 返回 `INVALID_SKILL_NAME` |
| 2.2.4 | source=all 且多个源中存在 | 返回首个匹配或按既定规则返回 |

### 2.3 升级 `listWebInstalledSkills`

**任务**：已安装列表返回完整元信息，并支持搜索。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts` |
| API | `GET /api/installed?scope=project&q=review&target=claude` |
| 搜索字段 | name、description、tags、path、target、sourceName |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 2.3.1 | 当前项目有 installed skill | 返回 name、target、scope、path |
| 2.3.2 | 已安装 skill 有 frontmatter | 返回 version/description/tags |
| 2.3.3 | `q` 匹配 name | 返回匹配项 |
| 2.3.4 | `q` 匹配 description | 返回匹配项 |
| 2.3.5 | `q` 匹配 tags | 返回匹配项 |
| 2.3.6 | `q` 匹配 path | 返回匹配项 |
| 2.3.7 | 指定未知 target | 返回 `INVALID_TARGET` |
| 2.3.8 | 指定 scope=global | 扫描全局目录 |

### 2.4 生成 `npx` 安装命令

**任务**：实现统一命令生成函数，供 API 或前端复用。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts`、`web/src/api/client.ts` 或共享 util |
| 规则 | 命令必须以 `npx suit-skills@latest` 开头 |

测试用例：

| 编号 | 输入 | 期望 |
|---|---|---|
| 2.4.1 | skill name | `npx suit-skills@latest install code-review` |
| 2.4.2 | source | 追加 `--source default` |
| 2.4.3 | agent | 追加 `--agent claude` |
| 2.4.4 | 多目标 env | 追加 `--env claude,codex,agents` |
| 2.4.5 | global | 追加 `--global` |

## 阶段 3：安装、删除与导出 API

> 目标：补齐会修改本地文件系统的 Web API，并做好路径安全校验。

### 3.1 实现 Web 安装 API

**任务**：新增 `POST /api/install`，复用现有 CLI 安装逻辑。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts`、`src/lib/web/server.ts` |
| 方法 | `POST /api/install` |
| 输入 | identifier、source、targets、global、strategy |
| 输出 | 每个 target 的安装结果 |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 3.1.1 | 安装到单个 target | 目标目录出现 skill |
| 3.1.2 | 安装到多个 targets | 每个目标都有结果 |
| 3.1.3 | skill 不存在 | 返回 `SKILL_NOT_FOUND` 或安装错误 |
| 3.1.4 | target 非法 | 返回 `INVALID_TARGET` |
| 3.1.5 | 冲突 strategy=skip | 不覆盖并返回 skipped |
| 3.1.6 | 冲突 strategy=overwrite | 覆盖安装 |

### 3.2 实现请求体解析

**任务**：为 Web server 增加 JSON body 读取，支持 POST/DELETE。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/server.ts` |
| 安全 | 限制 body 大小，例如 1MB |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 3.2.1 | 合法 JSON body | 正确解析 |
| 3.2.2 | 非法 JSON | 返回 400 |
| 3.2.3 | 超大 body | 返回 413 |
| 3.2.4 | 不支持方法 | 返回 405 |

### 3.3 实现已安装删除 API

**任务**：新增 `DELETE /api/installed/:name`，按 `name + target + scope` 解析路径并删除。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts`、`src/lib/web/server.ts` |
| 方法 | `DELETE /api/installed/:name` |
| 安全 | 不接受任意绝对路径删除 |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 3.3.1 | 删除 project target 下已安装 skill | 目录被删除 |
| 3.3.2 | 删除 global target 下已安装 skill | 全局目录对应 skill 被删除 |
| 3.3.3 | skill 不存在 | 返回 `SKILL_NOT_FOUND` 或 `SKILL_NOT_INSTALLED` |
| 3.3.4 | target 非法 | 返回 `INVALID_TARGET` |
| 3.3.5 | scope 非法 | 返回 `INVALID_SCOPE` |
| 3.3.6 | 解析路径逃逸安装根目录 | 返回 `PATH_NOT_ALLOWED` |

### 3.4 实现已安装 zip 导出 API

**任务**：新增 `POST /api/installed/export`，打包已安装 skill 目录。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts`、`src/lib/web/server.ts`，必要时新增 `src/lib/web/export.ts` |
| 输出 | zip 文件流或临时下载地址 |
| 文件名 | `<name>-<version>.zip`，版本未知则 `<name>.zip` |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 3.4.1 | 导出普通 skill | 返回 zip，包含 `skill-name/SKILL.md` |
| 3.4.2 | skill 包含子目录 | zip 保留子目录 |
| 3.4.3 | skill 无 version | 文件名为 `skill-name.zip` |
| 3.4.4 | skill 不存在 | 返回错误 |
| 3.4.5 | 目录中存在路径穿越风险 | 不打包越界文件 |
| 3.4.6 | 导出后临时文件可清理 | 不长期堆积临时文件 |

> 注意：如果项目不想引入 zip 依赖，需要先确定 Node 侧 zip 实现方案。可以选择轻量依赖，也可以先实现为测试可验证的 zip 生成模块。

## 阶段 4：Web 前端基础架构

> 目标：让前端具备页面拆分、API client、状态处理和基础布局。

### 4.1 拆分前端页面结构

**任务**：将当前 `web/src/App.tsx` 拆成应用外壳和页面组件。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/App.tsx`、`web/src/routes/*`、`web/src/components/*` |
| 页面 | Library、Installed、Sources、Detail panel |

验收：

- 左侧导航包含 `Skills/Library`、`Installed`、`Sources`、`Tags`。
- 不展示“新建技能”作为主按钮。
- 页面在桌面宽度下可用。

### 4.2 升级 API client

**任务**：补齐前端调用后端 API 的方法。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/api/client.ts` |
| 方法 | listSkills、getSkillDetail、listInstalled、installSkill、removeInstalled、exportInstalled |

测试/验收：

| 编号 | 场景 | 期望 |
|---|---|---|
| 4.2.1 | API 返回错误 payload | 前端能拿到 message |
| 4.2.2 | 请求列表 | 类型字段与后端一致 |
| 4.2.3 | 导出 zip | 能触发文件下载流程 |

### 4.3 统一加载、错误、空状态组件

**任务**：补齐通用状态组件。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/components/*` |
| 组件 | LoadingState、EmptyState、ErrorState、StatusBadge |

验收：

- 技能库加载中有状态。
- 搜索无结果有空状态。
- API 失败展示错误信息。

## 阶段 5：技能库页面

> 目标：完成未安装 skill 的浏览、搜索、详情、安装命令复制和分享。

### 5.1 实现技能库列表

**任务**：展示 source 中可用 skills。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/routes/LibraryPage.tsx`、`web/src/components/SkillCard.tsx` |
| 数据 | `GET /api/skills` |

验收：

- 卡片显示名称、版本、描述、标签、source、安装状态。
- `metadataSource` 可作为轻量提示。
- 已安装 skill 显示“已安装”状态。

### 5.2 实现搜索、标签筛选、source 切换

**任务**：技能库支持快速过滤。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/components/SearchToolbar.tsx`、`web/src/routes/LibraryPage.tsx` |

验收：

- 搜索名称、描述、标签生效。
- 标签筛选生效。
- source 切换生效。
- 空结果显示空状态。

### 5.3 实现技能详情面板

**任务**：点击卡片后展示详情。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/components/SkillDetail.tsx` |
| 数据 | `GET /api/skills/:name` |

验收：

- 展示 frontmatter 元信息。
- 渲染 `SKILL.md` 正文。
- 不展示 `meta.json` 作为主要信息入口。

### 5.4 实现复制安装命令

**任务**：为未安装 skill 提供复制命令。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/components/SkillCard.tsx`、`web/src/components/SkillDetail.tsx` |
| 命令 | `npx suit-skills@latest install xxx` |

验收：

- 复制内容以 `npx suit-skills@latest` 开头。
- 指定 source 时包含 `--source`。
- 复制成功有轻量反馈。

### 5.5 实现未安装 skill 分享

**任务**：生成分享文本，包含 skill 摘要和安装命令。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/components/ShareCommandDialog.tsx` |

验收：

- 分享文本包含名称、版本、source、tags、Install 命令。
- 可以一键复制。

### 5.6 实现安装流程

**任务**：未安装 skill 可以从 Web 安装到目标目录。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/components/InstallDialog.tsx`、`web/src/routes/LibraryPage.tsx` |
| API | `POST /api/install` |

验收：

- 可选择 target。
- 可选择 project/global。
- 冲突时能选择 skip/overwrite/rename。
- 安装成功后卡片变为已安装。

## 阶段 6：已安装页面

> 目标：完成已安装 skill 的搜索、详情、删除和 zip 导出。

### 6.1 实现已安装列表

**任务**：展示项目或全局已安装 skills。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/routes/InstalledPage.tsx`、`web/src/components/InstalledSkillRow.tsx` |
| API | `GET /api/installed` |

验收：

- 显示名称、版本、描述、标签、target、scope、path、来源状态。
- 未知来源 skill 仍能展示。

### 6.2 实现已安装搜索和筛选

**任务**：已安装页支持搜索与筛选。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/routes/InstalledPage.tsx` |
| 搜索字段 | name、description、tags、path、target |

验收：

- 搜索能匹配名称。
- 搜索能匹配描述。
- 搜索能匹配标签。
- 搜索能匹配路径。
- target 筛选生效。
- scope 筛选生效。

### 6.3 实现已安装详情

**任务**：点击已安装 skill 后展示本地详情。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/components/InstalledSkillDetail.tsx` |

验收：

- 详情读取本地 `SKILL.md`。
- 显示安装路径和 target。
- 未知来源不强制展示安装命令。

### 6.4 实现删除确认流程

**任务**：已安装 skill 删除前必须二次确认。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/components/ConfirmRemoveDialog.tsx` |
| API | `DELETE /api/installed/:name` |

验收：

- 确认框展示 name、target、scope、path。
- 用户确认后才发请求。
- 删除成功后列表刷新。
- 删除失败展示错误信息。

### 6.5 实现 zip 导出

**任务**：已安装 skill 支持导出 zip。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/components/ExportSkillButton.tsx` |
| API | `POST /api/installed/export` |

验收：

- 点击导出后下载 zip。
- 文件名包含 skill 名和版本。
- 导出失败展示错误信息。

## 阶段 7：Source 与辅助页面

> 目标：MVP 中完成 source 基础管理，并提供 tags 浏览入口。

### 7.1 实现 Sources 页面展示

**任务**：展示当前配置中的 sources。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/routes/SourcesPage.tsx` |
| API | `GET /api/sources` |

验收：

- 展示 defaultSource。
- 展示每个 source 的 name、url、enabled。

### 7.2 实现 Source 新增、删除、启用和禁用

**任务**：通过 Web 页面管理 source 的基础生命周期。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts`、`src/lib/web/server.ts`、`web/src/App.tsx`、`web/src/api/client.ts` |
| API | `POST /api/sources`、`PATCH /api/sources/:name`、`DELETE /api/sources/:name` |

验收：

- 可以新增 source。
- 可以禁用 source，让它不参与 `source=all` 聚合；当只剩一条 enabled source 时，不能继续禁用或删除它。
- 可以重新启用 source。
- 可以删除非默认 source。
- 默认 source 不允许删除。

### 7.3 Tags 视图或标签入口

**任务**：提供标签浏览入口，可先基于技能库数据聚合。

| 项 | 内容 |
|---|---|
| 目标文件 | `web/src/routes/TagsPage.tsx` 或 Library 中的标签区域 |

验收：

- 能看到 tags 聚合。
- 点击 tag 后过滤技能库。

## 阶段 8：安全加固与边界测试

> 目标：确保 Web 本地服务不会变成任意文件读写入口。

### 8.1 路径安全校验

**任务**：抽出可复用路径校验函数，确保读、删、导出都在允许目录内。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts` 或 `src/lib/web/paths.ts` |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 8.1.1 | 合法 installed path | 通过 |
| 8.1.2 | `../` 路径穿越 | 拒绝 |
| 8.1.3 | 绝对路径指向安装根之外 | 拒绝 |
| 8.1.4 | target 不存在 | 拒绝 |

### 8.2 本地服务监听策略

**任务**：确认 `suit-skills web` 默认只监听 `127.0.0.1`。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/commands/web.ts`、`src/lib/web/server.ts` |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 8.2.1 | 默认启动 | host 为 `127.0.0.1` |
| 8.2.2 | 指定 port | 使用指定端口 |
| 8.2.3 | `--no-open` | 不打开浏览器 |

### 8.3 API 错误格式统一

**任务**：所有 Web API 错误返回 `{ error: { code, message, details? } }`。

| 项 | 内容 |
|---|---|
| 目标文件 | `src/lib/web/api.ts`、`src/lib/web/server.ts` |

测试用例：

| 编号 | 场景 | 期望 |
|---|---|---|
| 8.3.1 | source 不存在 | `SOURCE_NOT_FOUND` |
| 8.3.2 | skill 不存在 | `SKILL_NOT_FOUND` |
| 8.3.3 | target 非法 | `INVALID_TARGET` |
| 8.3.4 | 删除越界路径 | `PATH_NOT_ALLOWED` |
| 8.3.5 | 导出失败 | `EXPORT_FAILED` |

## 阶段 9：端到端验收

> 目标：把 Web MVP 的关键路径串起来，确保可交付。

### 9.1 本地完整流程验收

**任务**：通过真实命令和浏览器验证主流程。

验收步骤：

1. 执行 `npm run build:all`。
2. 执行 `node dist/index.js web --no-open` 或等价命令。
3. 打开控制台输出 URL。
4. 技能库能展示 source skills。
5. 打开某个 skill 详情。
6. 复制安装命令，内容为 `npx suit-skills@latest install ...`。
7. 安装 skill 到某个 target。
8. Installed 页面能搜索到该 skill。
9. 导出 zip。
10. 删除该 skill。
11. Installed 页面不再显示该 skill。

### 9.2 回归测试

**任务**：确认现有 CLI 功能未被破坏。

必须执行：

```bash
npm test
npm run typecheck
npm run build:all
```

验收：

- 现有 CLI 命令测试通过。
- Web API 测试通过。
- Web 前端构建通过。

## 阶段 10：后续增强任务池

> 不进入当前 MVP，但实现时可预留结构。

### 10.1 安装体验增强

- 安装进度展示。
- 批量安装。
- 批量删除。
- 更新检测。
- 打开本地目录。

### 10.2 配置能力

- Source 增删改。
- 默认 source 切换。
- 安装目标配置。
- Agent 路径配置。
- Web 内 doctor 诊断。

### 10.3 分享与团队能力

- zip 导入。
- 团队配置片段。
- 多 source 聚合视图。
- 版本对比与升级日志。

### 10.4 创作与发布能力

该阶段暂缓，不属于当前核心目标。

- Skill 创建向导。
- Skill 编辑器。
- Skill 校验。
- Skill 发布流程。

## 推荐实施顺序

1. 阶段 0：测试夹具。
2. 阶段 1：`SKILL.md` frontmatter 解析。
3. 阶段 2：Web API 数据模型升级。
4. 阶段 3：安装、删除、导出 API。
5. 阶段 4：前端基础架构。
6. 阶段 5：技能库页面。
7. 阶段 6：已安装页面。
8. 阶段 8：安全加固。
9. 阶段 9：端到端验收。

阶段 7 可以和阶段 5、6 并行实现，因为它主要是只读展示。
