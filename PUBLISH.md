# NPM 发布指南

## 配置步骤

### 1. 获取 NPM Token
1. 登录 [npmjs.com](https://www.npmjs.com/)
2. 进入 Account Settings → Access Tokens
3. 创建新的 token（推荐创建 Automation token）

### 2. 配置 GitHub Secrets
1. 进入 GitHub 仓库 → Settings → Secrets and variables → Actions
2. 添加名为 `NPM_TOKEN` 的 secret
3. 粘贴你的 npm token

## 发布方式

### 方式一：通过 Release 发布（推荐）
1. 更新 `package.json` 中的版本号
2. 提交并推送到 GitHub
3. 在 GitHub 上创建新的 Release
4. 发布后自动触发 npm 发布

```bash
# 更新版本号（本地）
npm version patch  # 0.0.9 -> 0.0.10
# 或 npm version minor  # 0.0.9 -> 0.1.0
# 或 npm version major  # 0.0.9 -> 1.0.0

# 推送
git push origin master

# 创建 Release（GitHub UI 操作）
```

### 方式二：手动触发（自动递增版本）
1. 进入 Actions → Publish npm Package
2. 点击 Run workflow
3. 选择版本递增类型：
   - **patch**: 补丁版本 (0.0.9 → 0.0.10)
   - **minor**: 次版本号 (0.0.9 → 0.1.0)
   - **major**: 主版本号 (0.0.9 → 1.0.0)
4. 点击 Run workflow
5. Workflow 会自动修改 package.json 版本号并发布

## 本地测试发布
```bash
# 查看将要发布的文件列表
npm pack --dry-run

# 测试发布（不会真正发布）
npm publish --dry-run
```

## 注意事项
- 发布前确保版本号已更新
- 发布前会运行 typecheck 和 test
- 发布前会执行 build:all 构建
- 使用 `--provenance` 选项构建来源证明（Release 发布时）
