# 桌面端说明

桌面应用基于 Tauri，Web 页面在桌面窗口中运行，CLI 作为 sidecar 提供能力。

## 构建

```bash
npm run build:all
npm run build:sidecar
npm run build:desktop
```

## 侧车命令

这些命令主要给桌面端和 Web 前端调用，不建议手工日常使用：

- `desktop-release-manifest`
- `desktop-bootstrap`
- `skill-files`
- `skill-browser-bundle`
- `skill-file-content`
- `installed-skill-files`
- `installed-skill-browser-bundle`
- `installed-skill-file-content`
- `save-installed-skill-file`
- `reset-installed-skill-file`
- `reset-installed-skill`
- `ai-edit-installed-skill`
- `apply-ai-edit-installed-skill`

## 打包产物

Windows 和 macOS 的安装包由 `npm run tauri:build` 生成，产物在 `src-tauri/target/release/bundle/`。
