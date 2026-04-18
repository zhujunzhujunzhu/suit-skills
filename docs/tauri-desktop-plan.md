# Suit Skills 桌面应用方案 (Tauri)

> 本文档描述如何使用 Tauri 将 Suit Skills CLI + Web Console 打包为跨平台桌面应用。

## 1. 项目现状分析

### 当前架构

```
skills-cli/
├── src/                    # CLI 核心 (TypeScript)
│   ├── commands/           # 命令实现
│   ├── lib/                # 核心库
│   │   ├── web/            # Web 服务器 + API
│   └── cli/                # CLI 入口
├── web/                    # React 前端
│   ├── src/
│   │   ├── App.tsx         # 主界面
│   │   ├── api/            # API 客户端
│   │   └── styles/         # CSS
│   └── vite.config.ts      # Vite 构建配置
└── package.json            # Node.js 项目配置
```

### 现有功能

| 功能模块 | 描述 | 桌面化策略 |
|---------|------|-----------|
| Skills Library | 技能库浏览/搜索 | 直接复用 React 前端 |
| Installed View | 已安装技能管理 | 直接复用 React 前端 |
| Sources Management | 源管理 | 直接复用 React 前端 |
| Tags View | 标签浏览 | 直接复用 React 前端 |
| CLI Commands | 安装/移除/更新等 | 通过 Tauri Command 调用 |

### 技术栈

- **前端**: React 19 + Vite 7
- **后端**: Node.js CLI (TypeScript)
- **构建**: `npm run build:all` (tsc + vite build)

---

## 2. Tauri 方案架构

### 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Suit Skills Desktop                       │
├─────────────────────────────────────────────────────────────┤
│  Frontend (WebView)                                         │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  React App (web/src/App.tsx)                          │ │
│  │  ┌─────────────┬─────────────┬─────────────┬───────┐ │ │
│  │  │ Skills      │ Installed   │ Sources     │ Tags  │ │ │
│  │  └─────────────┴─────────────┴─────────────┴───────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
│                           ↕ IPC                             │
├─────────────────────────────────────────────────────────────┤
│  Tauri Core (Rust)                                          │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │ │
│  │  │ Commands    │  │ Sidecar     │  │ File API    │    │ │
│  │  │ (调用 CLI)  │  │ (Node.js)   │  │ (系统访问)  │    │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │ │
│  └───────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  suit-skills CLI (打包为 sidecar)                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  install / remove / update / list / search / ...      │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 方案选择：Sidecar vs Command API

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **Sidecar** | 打包 Node.js + CLI 作为外部进程 | 改动最小、兼容性好 | 需打包 Node.js (~50MB) |
| **Command API** | 用 Rust 重写 CLI 核心逻辑 | 性能好、体积最小 | 开发成本高 |
| **混合方案** | 保留 Node.js sidecar，Tauri 提供系统 API | 平衡改动量和体积 | 推荐 |

**推荐采用混合方案**：
- 将现有 CLI 打包为 sidecar（改动最小）
- Tauri 提供 shell 执行、文件系统、对话框等系统 API

---

## 3. 文件结构规划

### 新增目录结构

```
skills-cli/
├── src-tauri/                  # 新增：Tauri 项目
│   ├── src/
│   │   ├── main.rs             # Tauri 入口
│   │   ├── commands.rs         # IPC 命令定义
│   │   └── lib.rs              # Rust 库
│   ├── tauri.conf.json         # Tauri 配置
│   ├── Cargo.toml              # Rust 依赖
│   ├── build.rs                # 构建脚本
│   └── icons/                  # 应用图标
│       ├── icon.ico            # Windows
│       ├── icon.icns           # macOS
│       ├── icon.png            # Linux / 通用
│   └── binaries/               # sidecar 二进制
│       └── suit-skills-x86_64-pc-windows-msvc.exe
│
├── web/                        # 保持现有结构
│   └── src/
│       └── api/
│           ├── client.ts       # 改造：支持 IPC 调用
│           └── tauri.ts        # 新增：Tauri API 封装
│
├── package.json                # 添加 Tauri 相关脚本
└── tauri.config.json           # 根目录配置（可选）
```

---

## 4. 实施步骤

### Phase 1: 环境准备

#### 4.1 安装依赖

```bash
# 安装 Rust (Windows)
# 访问 https://rustup.rs/ 或直接下载安装

# 安装 Tauri CLI
npm install -D @tauri-apps/cli@latest

# 安装 Tauri API (前端)
npm install @tauri-apps/api@latest
```

#### 4.2 Windows 系统依赖

Tauri 在 Windows 需要以下工具：
- Microsoft Visual Studio C++ Build Tools
- WebView2 (Windows 10/11 已内置)

```powershell
# 安装 VS Build Tools (通过 winget)
winget install Microsoft.VisualStudio.2022.BuildTools

# 或手动下载安装
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
```

---

### Phase 2: 项目初始化

#### 4.3 初始化 Tauri

```bash
# 在项目根目录执行
npm create tauri-app@latest

# 选择配置：
# - Project name: src-tauri
# - Package manager: npm
# - UI template: 无 (使用现有 web/)
# - UI framework: 无
```

或手动创建目录结构：

```bash
mkdir src-tauri
mkdir src-tauri/src
mkdir src-tauri/icons
mkdir src-tauri/binaries
```

---

### Phase 3: 配置 Tauri

#### 4.4 tauri.conf.json 配置模板

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Suit Skills",
  "version": "0.0.7",
  "identifier": "com.suit-skills.desktop",
  "build": {
    "beforeDevCommand": "npm run dev:web:vite",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build:all",
    "frontendDist": "../web/dist"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "Suit Skills",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false,
        "center": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "",
      "nsis": {
        "installerIcon": "icons/icon.ico",
        "headerImage": "icons/header.bmp",
        "sidebarImage": "icons/sidebar.bmp",
        "license": null,
        "installMode": "currentUser",
        "languages": ["SimpChinese", "English"]
      }
    }
  },
  "plugins": {
    "shell": {
      "sidecar": true,
      "scope": [
        {
          "name": "suit-skills",
          "sidecar": true,
          "cmd": "suit-skills"
        }
      ]
    }
  }
}
```

#### 4.5 Cargo.toml 配置模板

```toml
[package]
name = "suit-skills-desktop"
version = "0.0.7"
description = "Suit Skills Desktop Application"
authors = ["zhujun"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["shell-sidecar"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

---

### Phase 4: Sidecar 打包

#### 4.6 CLI 打包策略

需要将 Node.js CLI 打包为可执行文件，有两种方式：

**方式 A: pkg 打包 (推荐，简单)**

```bash
# 安装 pkg
npm install -D pkg

# pkg 配置添加到 package.json
{
  "pkg": {
    "scripts": "dist/**/*.js",
    "assets": "dist/**/*",
    "targets": ["node18-win-x64"],
    "outputPath": "src-tauri/binaries"
  }
}

# 打包命令
npm run build
pkg dist/index.js --targets node18-win-x64 --output src-tauri/binaries/suit-skills.exe
```

**方式 B: Node.js Sidecar (更完整)**

打包完整的 Node.js 运行时 + 脚本：

```bash
# 使用 nexe 或 node-packer
npm install -D nexe

nexe -t windows-x64-18.0.0 -i dist/index.js -o src-tauri/binaries/suit-skills.exe
```

#### 4.7 Sidecar 文件命名规范

Tauri 要求 sidecar 文件名遵循特定格式：

```
binaries/
├── suit-skills-x86_64-pc-windows-msvc.exe    # Windows x64
├── suit-skills-aarch64-pc-windows-msvc.exe   # Windows ARM
├── suit-skills-x86_64-apple-darwin           # macOS Intel
├── suit-skills-aarch64-apple-darwin          # macOS ARM
├── suit-skills-x86_64-unknown-linux-gnu      # Linux x64
```

---

### Phase 5: Rust 代码实现

#### 4.8 main.rs 基础结构

```rust
// src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::run_skill_command,
            commands::get_installed_skills,
            commands::get_skills_list,
            commands::install_skill,
            commands::remove_skill,
            commands::get_sources,
            commands::add_source,
            commands::remove_source,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### 4.9 commands.rs IPC 命令模板

```rust
// src-tauri/src/commands.rs

use serde::{Deserialize, Serialize};
use tauri::command;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// 运行 suit-skills 命令
#[command]
async fn run_skill_command(
    app: tauri::AppHandle,
    args: Vec<String>,
) -> Result<SkillResult, String> {
    let sidecar = app
        .shell()
        .sidecar("suit-skills")
        .map_err(|e| e.to_string())?;

    let output = sidecar
        .args(&args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(SkillResult {
            success: true,
            data: serde_json::from_str(&stdout).ok(),
            error: None,
        })
    } else {
        Ok(SkillResult {
            success: false,
            data: None,
            error: Some(stderr),
        })
    }
}

/// 获取已安装技能列表
#[command]
async fn get_installed_skills(
    app: tauri::AppHandle,
    scope: Option<String>,
    target: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let args = vec!["list", "--json"];
    if let Some(s) = scope {
        args.push("--scope");
        args.push(&s);
    }
    if let Some(t) = target {
        args.push("--target");
        args.push(&t);
    }

    let result = run_skill_command(app, args).await?;
    result.data
        .and_then(|v| v.get("items").cloned())
        .and_then(|v| serde_json::from_value(v).ok())
        .ok_or_else(|| "Failed to parse installed skills".to_string())
}

/// 安装技能
#[command]
async fn install_skill(
    app: tauri::AppHandle,
    identifier: String,
    source: Option<String>,
    targets: Vec<String>,
    global: bool,
) -> Result<SkillResult, String> {
    let mut args = vec!["install", &identifier];
    if let Some(s) = source {
        args.push("--source");
        args.push(&s);
    }
    for t in targets {
        args.push("--target");
        args.push(&t);
    }
    if global {
        args.push("--global");
    }

    run_skill_command(app, args).await
}

/// 移除技能
#[command]
async fn remove_skill(
    app: tauri::AppHandle,
    name: String,
    target: Option<String>,
    scope: Option<String>,
) -> Result<SkillResult, String> {
    let mut args = vec!["remove", &name];
    if let Some(t) = target {
        args.push("--target");
        args.push(&t);
    }
    if let Some(s) = scope {
        args.push("--scope");
        args.push(&s);
    }

    run_skill_command(app, args).await
}

/// 获取技能源列表
#[command]
async fn get_sources(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let result = run_skill_command(app, vec!["source", "--json"]).await?;
    result.data.ok_or_else(|| "Failed to get sources".to_string())
}

/// 添加技能源
#[command]
async fn add_source(
    app: tauri::AppHandle,
    name: String,
    url: String,
) -> Result<SkillResult, String> {
    run_skill_command(app, vec!["source", "add", &name, &url]).await
}

/// 移除技能源
#[command]
async fn remove_source(
    app: tauri::AppHandle,
    name: String,
) -> Result<SkillResult, String> {
    run_skill_command(app, vec!["source", "remove", &name]).await
}
```

---

### Phase 6: 前端改造

#### 4.10 API 客户端改造策略

现有 `web/src/api/client.ts` 通过 HTTP 调用本地服务器。需要改造为：

```
┌─────────────────────────────────────────────┐
│  api/client.ts                              │
│  ┌─────────────────────────────────────┐    │
│  │  检测运行环境                        │    │
│  │  - Tauri: 使用 invoke()              │    │
│  │  - Web: 使用 fetch()                 │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

#### 4.11 tauri.ts 封装模板

```typescript
// web/src/api/tauri.ts

import { invoke } from '@tauri-apps/api/core';

export async function isTauriEnv(): boolean {
  try {
    // 检测是否在 Tauri 环境中
    return typeof window !== 'undefined' &&
           '__TAURI__' in window;
  } catch {
    return false;
  }
}

export async function runCommand(
  command: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return invoke(command, args);
}

export async function getInstalledSkills(options?: {
  scope?: string;
  target?: string;
}): Promise<{ items: InstalledSkill[] }> {
  return runCommand('get_installed_skills', options ?? {});
}

export async function installSkill(options: {
  identifier: string;
  source?: string;
  targets: string[];
  global: boolean;
}): Promise<void> {
  await runCommand('install_skill', options);
}

export async function removeSkill(options: {
  name: string;
  target?: string;
  scope?: string;
}): Promise<void> {
  await runCommand('remove_skill', options);
}

export async function getSources(): Promise<{
  sources: Source[];
  defaultSource: string;
}> {
  return runCommand('get_sources', {});
}

export async function addSource(options: {
  name: string;
  url: string;
}): Promise<void> {
  await runCommand('add_source', options);
}
```

---

### Phase 7: 构建与打包

#### 4.12 package.json 脚本添加

```json
{
  "scripts": {
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "build:sidecar": "pkg dist/index.js --targets node18-win-x64 --output src-tauri/binaries/suit-skills-x86_64-pc-windows-msvc.exe",
    "build:desktop": "npm run build:all && npm run build:sidecar && npm run tauri:build"
  }
}
```

#### 4.13 开发流程

```bash
# 开发模式
npm run tauri:dev
# - 启动 Vite 开发服务器
# - 启动 Tauri 窗口
# - 热更新前端

# 构建
npm run build:desktop
# - 编译 TypeScript CLI
# - 构建 Vite 前端
# - 打包 Sidecar
# - 构建 Tauri 安装包
```

#### 4.14 输出产物

```
src-tauri/target/release/bundle/
├── msi/
│   └── Suit Skills_0.0.7_x64.msi      # Windows 安装包
├── nsis/
│   └── Suit Skills_0.0.7_x64-setup.exe # NSIS 安装包
└── .../
```

---

## 5. 注意事项与风险

### 5.1 CLI 改造要求

现有 CLI 需要添加 `--json` 输出格式支持，确保 IPC 调用能正确解析结果。

```typescript
// src/commands/list.ts 需要改造
// 添加 --json 参数支持结构化输出

export function list(options: { json?: boolean; ... }) {
  if (options.json) {
    console.log(JSON.stringify({ items: skills }));
  } else {
    // 现有的表格输出
  }
}
```

### 5.2 权限与安全

Tauri 需要配置权限范围：

```json
// tauri.conf.json
{
  "plugins": {
    "shell": {
      "sidecar": true,
      "scope": [
        {
          "name": "suit-skills",
          "sidecar": true,
          "cmd": "suit-skills"
        }
      ]
    }
  }
}
```

### 5.3 文件系统访问

技能安装需要访问用户目录，需要配置：

```json
// tauri.conf.json
{
  "plugins": {
    "fs": {
      "scope": {
        "allow": [
          "$HOME/.claude",
          "$HOME/.cursor",
          "$HOME/.codex",
          "$HOME/.agents",
          "$HOME/.copilot"
        ]
      }
    }
  }
}
```

### 5.4 打包体积预估

| 组件 | 体积 |
|------|------|
| Tauri Core | ~3-5 MB |
| WebView2 (Windows) | 系统内置 |
| Sidecar (pkg 打包) | ~40-50 MB |
| 前端资源 | ~1-2 MB |
| **总计** | ~45-60 MB |

相比 Electron (~150MB) 显著减小。

---

## 6. 后续优化方向

### 6.1 性能优化

- 缓存技能列表，减少 CLI 调用频率
- 并行化 IPC 调用
- 添加增量更新机制

### 6.2 功能扩展

- 系统托盘支持（后台运行）
- 文件拖拽安装
- 自动更新功能
- 多语言支持

### 6.3 跨平台扩展

完成 Windows 版本后，可扩展至：
- macOS: 需要 Xcode 命令行工具
- Linux: 需要 GTK/WebKitGTK

---

## 7. 参考资源

- [Tauri 官方文档](https://tauri.app/)
- [Tauri Shell Plugin](https://tauri.app/reference/javascript/shell/)
- [pkg 打包工具](https://github.com/vercel/pkg)
- [WebView2 文档](https://docs.microsoft.com/en-us/microsoft-edge/webview2/)

---

## 8. 实施检查清单

### Phase 1: 环境准备
- [ ] 安装 Rust 工具链 (rustup)
- [ ] 安装 Visual Studio Build Tools (Windows)
- [ ] 安装 Tauri CLI (`npm install -D @tauri-apps/cli`)
- [ ] 安装 Tauri API (`npm install @tauri-apps/api`)
- [ ] 安装 pkg (`npm install -D pkg`)

### Phase 2: 项目初始化
- [ ] 创建 `src-tauri/` 目录
- [ ] 配置 `tauri.conf.json`
- [ ] 配置 `Cargo.toml`
- [ ] 创建基础 Rust 代码 (`main.rs`, `commands.rs`)
- [ ] 准备应用图标 (`icons/`)

### Phase 3: CLI 改造
- [ ] 添加 `--json` 输出支持到所有命令
- [ ] 确保命令返回结构化 JSON
- [ ] 测试 JSON 输出格式

### Phase 4: Sidecar 打包
- [ ] 配置 pkg 打包脚本
- [ ] 打包 CLI 为可执行文件
- [ ] 放置到 `src-tauri/binaries/` 目录
- [ ] 确保文件命名符合 Tauri 规范

### Phase 5: 前端改造
- [ ] 创建 `web/src/api/tauri.ts`
- [ ] 改造 `web/src/api/client.ts` 支持双模式
- [ ] 测试 IPC 调用

### Phase 6: 构建测试
- [ ] 运行 `npm run tauri:dev` 测试开发模式
- [ ] 运行 `npm run build:desktop` 构建安装包
- [ ] 测试安装包运行

### Phase 7: 发布准备
- [ ] 测试所有核心功能
- [ ] 处理边界情况（错误处理、权限等）
- [ ] 准备发布文档