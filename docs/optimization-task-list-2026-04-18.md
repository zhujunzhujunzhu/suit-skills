# Optimization Task List - 2026-04-18

## Goal

用最小风险、最高收益的顺序解决当前 Web + CLI + Tauri 桌面应用里的质量问题。优先修复用户可见问题、构建产物膨胀、可回归的测试缺口，再进入较大的 API/桌面架构优化。

## Recommended Execution Order

### Batch 1 - Low Risk, High Return

#### OPT-01 修复内置源中文乱码

- Priority: P1
- Owner: Codex
- Files:
  - `src/lib/config.ts`
  - `tests/lib/web-api.test.ts`
- Problem:
  - 内置源 `label/description` 出现 mojibake，例如 `榛樿婧?`。
  - Web UI 目前部分依赖 locale 覆盖，API/CLI/测试直接读配置时仍会暴露乱码。
- Approach:
  - 将 `DEFAULT_SOURCE_INFO` 和 `BUILTIN_SOURCE_CATALOG` 中的中文恢复为 UTF-8 正文。
  - 同步更新相关测试断言。
- Acceptance Criteria:
  - `listWebSources()` 返回的内置源 label/description 为正常中文。
  - `npm test` 通过。
  - Web Sources 页面仍显示正常中文/英文。
- Risk:
  - Low。主要是文本修正。

#### OPT-02 清理 Web 构建产物累积

- Priority: P1
- Owner: Codex
- Files:
  - `web/vite.config.ts`
  - `package.json` if needed
- Problem:
  - `emptyOutDir: false` 导致 `dist/web/assets` 累积旧 hash 文件。
  - 当前已出现多个旧 `index*.js` / `index*.css`，会拖大 Tauri 安装包。
- Approach:
  - 优先将 `emptyOutDir` 改为 `true`。
  - 如果 Vite root/outDir 限制导致警告，再改为 `build:web` 前执行安全清理 `dist/web`。
- Acceptance Criteria:
  - 连续运行两次 `npm run build:web` 后，`dist/web/assets` 不再保留旧 hash 入口文件。
  - `npm run build:web` 通过。
  - `npm run build:desktop` 的前置 Web 构建不会丢失必要资产。
- Risk:
  - Low。注意只清理 `dist/web`，不要清理整个 `dist`。

#### OPT-03 固化本轮 Playwright 回归测试

- Priority: P1
- Owner: Codex
- Files:
  - `tests/e2e/*` or `web/tests/*`
  - `package.json`
  - optional `playwright.config.ts`
- Problem:
  - 移动端 nav aria、虚拟列表、空表单不发 POST 等问题目前靠手工/临时 CDP 验证，没有自动回归保护。
- Approach:
  - 添加最小 Playwright 测试集。
  - 使用 mock/stub 或本地 dev server，避免测试依赖真实远端网络。
  - 如果暂不引入 Playwright 依赖，可先写 Node/CDP smoke script，但正式方案建议 Playwright。
- Acceptance Criteria:
  - 新增脚本，例如 `npm run test:e2e`。
  - 覆盖：
    - mobile nav buttons have accessible names
    - mobile Skills list virtualizes large catalogs
    - empty source form validates client-side and sends no POST
    - favicon request does not 404
  - CI/本地能稳定运行。
- Risk:
  - Medium。需要控制测试数据和端口，避免 flaky。

### Batch 2 - Data/API Performance

#### OPT-04 拆分并瘦身 `/api/skills`

- Priority: P2
- Owner: Codex
- Files:
  - `src/lib/web/api.ts`
  - `src/lib/web/server.ts`
  - `web/src/api/client.ts`
  - `web/src/App.tsx`
  - `tests/lib/web-api.test.ts`
- Problem:
  - `/api/skills?source=all&refresh=false` 本地实测约 `323-375ms`，响应约 `593KB`。
  - 前端虚拟列表已减少 DOM，但网络传输和 JSON 解析仍是全量成本。
- Approach:
  - 增加分页或窗口参数：`limit`, `offset`。
  - 列表摘要只返回卡片所需字段。
  - tags 聚合独立为 `/api/skills/tags` 或随首次全量缓存返回。
  - 详情 markdown 保持只在选择 skill 时请求。
- Acceptance Criteria:
  - 首屏 skills 响应体明显下降，目标小于当前的 30%。
  - 搜索、source filter、tag filter 行为不变。
  - 现有 Web API 测试更新并通过。
- Risk:
  - Medium。会改前后端契约。

#### OPT-05 解除 Installed 列表对全量 Source 扫描的依赖

- Priority: P2
- Owner: Codex
- Files:
  - `src/lib/web/api.ts`
  - `tests/lib/web-api.test.ts`
- Problem:
  - `listWebInstalledSkills()` 为补 `sourceName` 会调用 `sourceNameIndexForInstalledSkills()`，进而扫描所有启用源。
  - 已安装列表本应是本地目录操作，不应被远端源/缓存状态拖慢。
- Approach:
  - 将 `sourceName` 标记为 best-effort。
  - 先返回 installed 主数据，再从缓存补 sourceName。
  - 或安装时把 sourceName 写入本地 metadata，避免反查源。
- Acceptance Criteria:
  - source cache 不可用时，installed 列表仍能稳定返回。
  - `/api/installed?scope=all` 不触发远端 refresh。
  - 测试覆盖 source 失败但 installed 正常的场景。
- Risk:
  - Medium。需要确认 UI 对 `sourceName` 缺失的展示。

#### OPT-06 增加 Web API 缓存边界和失效策略

- Priority: P2
- Owner: Codex
- Files:
  - `src/lib/web/api.ts`
  - `tests/lib/web-api.test.ts`
- Problem:
  - 当前 `sourceRowsCache` 和 `installedTargetsIndexCache` 较粗糙，installed index TTL 只有 `1000ms`。
  - 安装/删除/link 后手动清理部分缓存，后续功能增多容易漏。
- Approach:
  - 定义明确缓存对象：
    - source rows cache
    - installed index cache
    - sourceName index cache
  - 所有 mutation 统一调用 `invalidateWebCaches(ctx, scope)`。
  - 添加缓存命中测试。
- Acceptance Criteria:
  - 重复请求 skills/installed 的耗时下降。
  - install/remove/link/source update 后数据正确刷新。
  - 测试覆盖缓存命中与失效。
- Risk:
  - Medium。缓存错误会造成数据陈旧。

### Batch 3 - Tauri Desktop Hardening

#### OPT-07 收紧 Tauri 权限

- Priority: P1 for desktop release, P2 otherwise
- Owner: Codex
- Files:
  - `src-tauri/capabilities/default.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/src/commands.rs`
- Problem:
  - 当前 capability 包含宽泛的 `shell:allow-execute` 和通用 `fs:*` 权限。
  - 桌面应用一旦出现前端注入风险，权限面偏大。
- Approach:
  - 移除不必要的通用 shell/fs 权限。
  - 只允许受控 sidecar 或受控 IPC command。
  - 文件访问限制到必要目录。
  - 评估 `withGlobalTauri: true` 是否仍需要。
- Acceptance Criteria:
  - Tauri dev/build 能运行核心流程。
  - Web 前端不能直接执行任意 shell 命令。
  - 安装、删除、导出、源管理仍正常。
- Risk:
  - Medium。Tauri 权限配置容易影响桌面功能，需要完整桌面回归。

#### OPT-08 减少 Tauri IPC 的 sidecar 进程启动次数

- Priority: P2
- Owner: Codex
- Files:
  - `src-tauri/src/commands.rs`
  - `web/src/api/tauri.ts`
  - `web/src/api/client.ts`
- Problem:
  - Tauri 模式每个 IPC command 都 shell 到 sidecar CLI。
  - `fetchSkills` / `fetchSkillDetail` 还会额外扫 installed，桌面端成本会比 Web API 模式更高。
- Approach:
  - 短期：前端 Tauri client 缓存 installed index。
  - 中期：新增组合 IPC，例如 `get_dashboard_data`。
  - 长期：sidecar 改成长驻服务或 Rust 侧复用状态。
- Acceptance Criteria:
  - 桌面首屏 sidecar 调用次数减少。
  - Skills 列表、详情、Installed 切换感知速度提升。
  - 出错时仍有清晰错误提示。
- Risk:
  - Medium/High。涉及桌面架构。

### Batch 4 - UX Reliability

#### OPT-09 拆分全局错误状态

- Priority: P2
- Owner: Codex
- Files:
  - `web/src/App.tsx`
  - `web/src/styles/app.css`
  - `web/src/locales/*.json`
- Problem:
  - 当前 `error` 是 App 级全局状态。
  - Sources 表单错误、Library 详情错误、Installed 操作错误容易互相残留。
- Approach:
  - 拆成 `libraryError`, `installedError`, `sourcesError`, `globalError`。
  - 表单错误靠近表单展示。
  - 切换 view 时清理 view-local 错误。
- Acceptance Criteria:
  - 空 source 表单错误只显示在 Sources 表单上下文。
  - 切换到 Skills/Installed 不残留 Sources 表单错误。
  - API 全局不可达时仍有全局错误。
- Risk:
  - Low/Medium。主要是状态拆分。

#### OPT-10 增强加载/取消/并发控制

- Priority: P3
- Owner: Codex
- Files:
  - `web/src/App.tsx`
  - `web/src/api/client.ts`
- Problem:
  - 当前用 request id 防止旧响应覆盖新响应，但 fetch 本身没有 abort。
  - 搜索和快速切换 source 时仍会产生无用请求。
- Approach:
  - 给 HTTP fetch 增加 `AbortController`。
  - Tauri IPC 无法轻易 abort 时，保留 request id，但减少重复触发。
  - 刷新按钮禁用或显示正在刷新状态。
- Acceptance Criteria:
  - 快速输入搜索时旧 HTTP 请求被取消。
  - 控制台无 uncaught abort error。
  - UI loading 状态准确。
- Risk:
  - Low/Medium。

## Optimal Path

### Phase A - Ship Quality Stabilization

1. OPT-01 修复内置源中文乱码
2. OPT-02 清理 Web 构建产物累积
3. OPT-03 增加 Playwright 回归测试

Reason:
这三项收益最高、风险最低，会立刻改善可见质量、包体积和回归安全网。

### Phase B - Improve Runtime Performance

4. OPT-05 解除 Installed 列表对全量 Source 扫描的依赖
5. OPT-06 增加缓存边界和失效策略
6. OPT-04 拆分并瘦身 `/api/skills`

Reason:
先解决不必要依赖和缓存，再改 API 契约。这样改动更稳。

### Phase C - Desktop Release Hardening

7. OPT-07 收紧 Tauri 权限
8. OPT-08 减少 Tauri IPC sidecar 启动次数

Reason:
桌面安全和性能都重要，但需要更完整的桌面回归，适合放在 Web 核心稳定后。

### Phase D - UX Robustness

9. OPT-09 拆分全局错误状态
10. OPT-10 增强加载/取消/并发控制

Reason:
这两项提升体验韧性，适合在核心性能和安全边界稳定后做。

## Recommended Immediate Sprint

本轮建议只做 3 个任务：

1. OPT-01
2. OPT-02
3. OPT-03

Sprint exit criteria:

- `npm run build`
- `npm run build:web`
- `npm test`
- `npm run test:e2e` if OPT-03 introduces Playwright
- `dist/web/assets` 不再累积旧 hash 文件
- Sources 页面、Skills 页面、Installed 页面核心流程通过 Playwright smoke
