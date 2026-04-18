# Playwright MCP 审计 - 2026-04-18

## 范围

- 测试应用：Suit Skills Web 控制台（`http://127.0.0.1:1420`）
- 工具：Playwright MCP 浏览器导航、可访问性快照、控制台/网络捕获、视口检查、`npm run build`、`npm run build:web`、`npm test`
- 检查的视口：桌面 `1703x865`、桌面 `1366x768`、移动端 `390x844`

## 审计健康分数

| # | 维度 | 分数 | 关键发现 |
|---|-----------|-------|-------------|
| 1 | 可访问性 | 2/4 | 移动导航按钮在标签视觉隐藏时失去可访问名称。 |
| 2 | 性能 | 2/4 | 移动端库虚拟化被响应式CSS禁用，可渲染1400+个卡片。 |
| 3 | 响应式设计 | 2/4 | 几个移动控件低于44px触摸目标指南。 |
| 4 | 主题 | 3/4 | 令牌使用一致；未发现阻止主题的缺陷。 |
| 5 | 反模式 | 3/4 | 布局功能齐全且符合领域要求；没有主要的通用设计障碍。 |
| **总计** | | **12/20** | **可接受，需要移动端和运行时优化。** |

## 发现

### P1 - 移动导航没有可访问名称

- 位置：`web/src/App.tsx:963`，`web/src/styles/app.css:1287`
- 类别：可访问性
- 复现：调整至 `390x844`；Playwright 角色查询 `getByRole('button', { name: 'Skills' })` 无法找到导航按钮，因为 `.nav span` 是 `display: none`。
- 影响：屏幕阅读器和基于角色的自动化用户无法识别主要的移动导航控件。
- 建议：为 `NavButton` 添加 `aria-label={label}`，使仅图标的移动导航保持命名。
- 任务：T1

### P1 - 移动库虚拟化渲染整个目录

- 位置：`web/src/styles/app.css:1297`，`web/src/App.tsx:1020`
- 类别：性能/响应式
- 复现：在 `390x844` 上，打开 Skills 并清除搜索。Playwright 计数 `1442` 个 `.skill-card` 节点，因为 `.library-scroll` 变为 `height: auto; overflow: visible`。
- 影响：大型目录产生沉重的DOM，慢速文本提取，更高的内存使用，以及移动端的卡顿。
- 建议：在移动端保持库区域为有界滚动容器，以便 `useVirtualRows` 可以对列表进行窗口化。
- 任务：T2

### P2 - 移动触摸目标小于44px

- 位置：`web/src/styles/app.css:196`，`web/src/styles/app.css:298`，`web/src/styles/app.css:416`，`web/src/styles/app.css:1297`
- 类别：可访问性/响应式
- 复现：移动端审计发现 `Refresh` 为 `36x36`，语言选择为 `76x28`，源表单控件为 `40px` 高，以及多个行操作按钮为 `40px`。
- 影响：触摸用户误触控件的可能性更高。
- 建议：在移动布局中将交互高度增加到至少 `44px`，并使顶部图标按钮为 `44x44`。
- 任务：T3

### P2 - 缺少favicon产生控制台噪音

- 位置：`web/index.html`
- 类别：运行时优化
- 复现：初始加载记录 `GET /favicon.ico 404` 两次。
- 影响：不面向用户，但会污染控制台输出，使真实的运行时错误更难发现。
- 建议：添加由Vite/静态构建提供的favicon链接。
- 任务：T4

### P3 - 空源表单发送400请求

- 位置：`web/src/App.tsx:698`
- 类别：UX/运行时优化
- 复现：使用空字段点击 `Add source`。翻译后的错误显示正确，但浏览器控制台记录了 `400 Bad Request`。
- 影响：验证有效，但可避免的客户端请求在QA期间产生噪音。
- 建议：在调用API之前验证名称和URL。
- 任务：T5

## 积极发现

- 桌面库虚拟化有效：在 `1366x768` 上，Playwright 仅计数 `21` 个技能卡片和 `7` 个虚拟行，目录高度为 `107730px`。
- 核心页面重新加载后正确路由：Skills、Installed和Sources可访问。
- API为无效的源创建返回翻译后的、用户可见的错误。
- `npm run build`、`npm run build:web` 和现有的Vitest套件在修复前是绿色的。

## 任务分配

| 任务 | 负责人 | 状态 | 修复 |
|---|---|---|---|
| T1 | Codex | 已完成 | 为导航按钮添加了持久的 `aria-label` 值。 |
| T2 | Codex | 已完成 | 更新虚拟行测量，在移动CSS使库滚动可见时使用页面滚动。 |
| T3 | Codex | 已完成 | 将图标按钮、主要按钮、表单控件、移动标签和目标芯片提升到44px触摸目标。 |
| T4 | Codex | 已完成 | 添加了 `web/favicon.svg` 并从 `web/index.html` 链接它。 |
| T5 | Codex | 已完成 | 在API调用之前添加了客户端源名称/URL验证。 |

## 验证日志

- 通过：`npm run build`
- 通过：`npm run build:web`
- 通过：`npm test`（`16` 个文件，`207` 个测试）
- 通过Chrome DevTools Protocol在Playwright MCP Chrome目标上通过（在MCP控制通道停止响应后）：
  - 移动Skills导航标签在视觉标签隐藏时仍然可用：`Skills`、`Installed`、`Sources`。
  - 移动Skills虚拟化渲染 `9` 个卡片/`9` 个虚拟行，而不是 `1442` 个卡片。
  - 空源表单提交显示 `Source name is required` 并发送 `0` 个POST请求。
  - 在修复后通过过程中，未记录HTTP `>=400` 响应或控制台问题。
  - `link[rel="icon"]` 解析为 `/favicon.svg`。

## 修复后状态

- 本次通过的P1/P2/P3所有发现已修复。
- 修复后健康估计：**17/20**（良好）。剩余的扣分主要是由于更广泛的可访问性覆盖，这些在本次通过中未完全自动化。
- 残留说明：原始复选框输入仍测量为 `14x14`，但其包装的 `.target-checkbox` 标签现在满足44px触摸目标要求。