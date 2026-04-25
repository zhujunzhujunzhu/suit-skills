# 性能排查清单 - 2026-04-22

## 基线

- `npm test`：通过，`216/216`
- `npm run typecheck`：通过
- `npm run build:web`：通过
- `npm run test:e2e`：通过，`3/3`
- `cargo check --manifest-path apps/desktop/Cargo.toml`：通过

## 当前构建结果

- 主 Web 入口包：`dist/web/assets/index-BWj8mbwo.js`，`303240 B`，gzip 后 `96.48 kB`
- 样式包：`dist/web/assets/index-C1aPLroC.css`，`44190 B`，gzip 后 `8.06 kB`
- 桌面端 Tauri API 包：`dist/web/assets/tauri-DZd3ZbC3.js`，`2420 B`，gzip 后 `0.98 kB`
- 懒加载主题计算包：`dist/web/assets/customTheme-CFoR8Pjo.js`，`3370 B`，gzip 后 `1.56 kB`
- 懒加载详情包：`dist/web/assets/SkillDetailView-Cy-DclF9.js`，`12630 B`，gzip 后 `4.75 kB`
- 懒加载下载包：`dist/web/assets/DownloadView-CTH35YGz.js`，`3500 B`，gzip 后 `1.48 kB`
- 懒加载已安装包：`dist/web/assets/InstalledView-Cjgy6m81.js`，`4730 B`，gzip 后 `1.51 kB`
- 懒加载来源包：`dist/web/assets/SourcesView-4thrgGZk.js`，`4370 B`，gzip 后 `1.27 kB`
- 懒加载设置包：`dist/web/assets/SettingsView-BKKMHuNW.js`，`14070 B`，gzip 后 `3.64 kB`
- 懒加载技能库包：`dist/web/assets/LibraryView-CWedky4b.js`，`9340 B`，gzip 后 `3.29 kB`

## 已确认并处理的问题

### 1. Installed 页面依赖 source 刷新

- 优先级：`P1`
- 状态：`fixed`
- 影响：
  - 打开 `Installed` 页面时，会牵连远端 source 刷新。
  - 当远端 source 变慢或失败时，本地已安装列表也会被拖慢。
- 处理：
  - `listWebInstalledSkills()` 改为只基于本地缓存 source 索引构建 `sourceName`，不再为 `Installed` 页面触发远端刷新。
- 涉及文件：
  - `apps/cli/src/lib/web/api.ts`
  - `tests/lib/web-api.test.ts`

### 2. Tauri 模式重复读取 installed 状态并重复拉起 sidecar

- 优先级：`P1`
- 状态：`fixed`
- 影响：
  - `fetchSkills()` 和 `fetchSkillDetail()` 都会额外请求一次 installed 列表。
  - 在桌面端会造成额外 IPC 和 sidecar 启动成本。
- 处理：
  - 在 `apps/local-web/src/api/client.ts` 增加短生命周期 installed 缓存。
  - 安装、移除、链接后自动失效，列表和详情请求复用同一份状态。
- 涉及文件：
  - `apps/local-web/src/api/client.ts`
  - `tests/apps/local-web/api-client.test.ts`

### 3. Web 旧请求没有真正取消

- 优先级：`P2`
- 状态：`fixed`
- 影响：
  - 搜索、切源、切详情时，旧请求还会继续执行。
  - 会浪费网络和浏览器资源，也让高频交互更嘈杂。
- 处理：
  - 为 `fetchSkills()`、`fetchInstalled()`、`fetchSkillDetail()` 补上 `AbortController` 支持。
  - 在 `apps/local-web/src/App.tsx` 中为库列表、已安装列表、详情加载接入请求取消。
- 涉及文件：
  - `apps/local-web/src/api/client.ts`
  - `apps/local-web/src/App.tsx`
  - `tests/apps/local-web/api-client.test.ts`

### 4. Web 主包承载了下载页和详情页的重内容

- 优先级：`P2`
- 状态：`fixed`
- 处理：
  - 将下载页拆到 `apps/local-web/src/views/DownloadView.tsx`
  - 将技能详情和翻译预览拆到 `apps/local-web/src/views/SkillDetailView.tsx`
  - 在 `apps/local-web/src/App.tsx` 里改成 `React.lazy` + `Suspense` 按需加载
- 结果：
  - 主入口包从 `349259 B` 降到 `335220 B`
  - 详情页拆成独立 chunk：`12630 B`
  - 下载页拆成独立 chunk：`3460 B`

### 5. Installed / Sources / Settings 仍绑定在主入口

- 优先级：`P2`
- 状态：`fixed`
- 处理：
  - 将三块视图分别拆到 `apps/local-web/src/views/InstalledView.tsx`
  - `apps/local-web/src/views/SourcesView.tsx`
  - `apps/local-web/src/views/SettingsView.tsx`
  - 抽出 `apps/local-web/src/ui/Icon.tsx` 作为共享图标模块
- 结果：
  - 主入口包从 `335220 B` 降到 `313380 B`
  - `InstalledView` chunk：`4730 B`
  - `SourcesView` chunk：`4370 B`
  - `SettingsView` chunk：`17170 B`

### 6. Library 主视图仍常驻在主入口

- 优先级：`P2`
- 状态：`fixed`
- 处理：
  - 将技能库主视图拆到 `apps/local-web/src/views/LibraryView.tsx`
  - 虚拟列表、标签筛选、来源告警和详情侧栏一起迁出
- 结果：
  - 主入口包从 `313380 B` 降到 `304650 B`
  - `LibraryView` chunk：`9340 B`

### 7. 自定义主题计算逻辑常驻主入口

- 优先级：`P3`
- 状态：`fixed`
- 处理：
  - 将自定义主题算法抽到 `apps/local-web/src/theme/customTheme.ts`
  - `SettingsView` 复用该模块做预览和颜色归一化
  - `App.tsx` 只在 `themeMode === 'custom'` 时动态加载主题生成逻辑
- 结果：
  - 主入口包从 `304650 B` 降到 `302070 B`
  - 新增独立 chunk：`customTheme` `3370 B`
  - `SettingsView` chunk 从 `17170 B` 降到 `14070 B`

### 8. Tauri 首屏初始化分散触发多次 sidecar / IPC

- 优先级：`P2`
- 状态：`fixed`
- 影响：
  - `sources`、`settings`、`install-targets`、`translation` 之前分散读取。
  - 桌面端首屏会重复触发多次 Tauri invoke 和 sidecar 启动。
- 处理：
  - 新增 CLI 聚合命令 `desktop-bootstrap --json`
  - 新增 Tauri IPC `get_desktop_bootstrap`
  - `App.tsx` 初始化优先改走一次 `fetchDesktopBootstrap()`
  - Tauri 下的翻译配置读取和写回也改成直接走配置，而不是继续打 Web API
- 结果：
  - 桌面端首屏从多次只读读取压缩为一次聚合预加载
  - 新增桌面 bootstrap 单测和 CLI 聚合命令回归测试
  - 主 Web 入口因接入 bootstrap 逻辑小幅回升：`302070 B` -> `303240 B`
  - 这部分体积换来了桌面端更少的 sidecar 启动和 IPC 往返，收益更直接
- 涉及文件：
  - `apps/cli/src/commands/desktop-bootstrap.ts`
  - `apps/cli/src/cli/program.ts`
  - `apps/desktop/apps/cli/src/commands.rs`
  - `apps/desktop/src/lib.rs`
  - `apps/local-web/src/api/tauri.ts`
  - `apps/local-web/src/api/client.ts`
  - `apps/local-web/src/App.tsx`
  - `tests/commands/cli.test.ts`
  - `tests/apps/local-web/api-client.test.ts`

## 已验证的改进

- Installed 页面不再被远端 source 刷新阻塞。
- Tauri 模式下，技能库和详情页会复用 installed 状态，不再为同一份数据重复查询。
- Web 模式下，高频切换列表和详情时会主动中止过期请求。
- 下载、详情、技能库、已安装、来源、设置视图，以及自定义主题计算逻辑，都已经从主入口包拆出。
- Tauri 首屏初始化已经改成单次 bootstrap 预加载，不再分散读取来源、设置、安装目标和翻译配置。

## 仍待处理的问题

### 9. Tauri 其它高频命令仍按功能分散触发 sidecar

- 优先级：`P2`
- 状态：`open`
- 证据：
  - `get_skills_list`、`get_skill_detail`、`install_skill`、`remove_skill` 等仍是逐命令调用。
  - 首屏已收敛，但详情、安装、来源编辑后的刷新仍有继续压缩空间。
- 下一步：
  - 评估把“变更后回读”的常见组合改成粗粒度命令。
  - 评估在 Rust 侧保留更多只读快照，减少重复 sidecar 往返。

### 10. 主入口包仍偏重

- 优先级：`P3`
- 状态：`open`
- 证据：
  - 即使持续拆出视图和主题逻辑后，主入口包仍有 `303240 B`。
- 可能原因：
  - `App.tsx` 仍承载顶部导航、更新提示、主题应用、请求编排和全局状态管理。
- 下一步：
  - 继续评估将顶部壳层、更新提示和通知/错误展示抽成独立模块。
  - 评估把部分全局状态编排下沉到更轻量的 hooks / view model。

## 经验沉淀

- 本地视图不要依赖远端刷新才能可用。
- 相同的只读状态要复用，尤其是 installed 这类高频信息。
- 高频交互里的旧请求必须可取消，不能只靠“忽略过期响应”。
- 主路径优先保持轻量，非首屏视图尽量按需加载。
- 桌面端性能不只看 bundle，IPC 次数和 sidecar 启动次数同样是核心成本。
