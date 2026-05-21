# 开发说明

## 安装

```bash
npm install
```

## 本地运行

```bash
npm run dev
npm run dev:web
```

## 校验

```bash
npm run typecheck
npm test
npm run test:e2e
```

## 构建

```bash
npm run build:all
npm run build:sidecar
npm run build:desktop
```

## 常用脚本

- `npm run sync:version`
- `npm run dev:web:vite`
- `npm run tauri:dev`

## Platform Web Hub

`apps/platform-web/` 目前是 Hub 功能的目录占位，暂未接入主构建脚本。等该应用补齐源码和独立脚本后，再纳入 CI 与发布流程。
