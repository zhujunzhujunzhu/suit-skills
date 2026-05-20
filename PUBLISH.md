# NPM 发布指南

## 配置步骤

### 1. 配置 npm Trusted Publisher
1. 登录 [npmjs.com](https://www.npmjs.com/)
2. 进入 `suit-skills` 包的 Settings → Trusted publishing
3. 添加 GitHub Actions trusted publisher：
   - Owner / organization: `zhujunzhujunzhu`
   - Repository: `suit-skills`
   - Workflow filename: `publish-npm.yml`
   - Environment name: 留空

### 2. 不再需要 NPM_TOKEN
发布流程使用 GitHub Actions OIDC 临时身份，不需要在 GitHub Secrets 中配置长期 npm token。

## 发布方式

### 方式一：推送到 master 发布（推荐）
1. 更新 `package.json` 中的版本号
2. 提交并推送到 GitHub 的 `master` 分支
3. push 后自动触发 npm 发布

```bash
# 更新版本号（本地）
npm version patch  # 0.0.9 -> 0.0.10
# 或 npm version minor  # 0.0.9 -> 0.1.0
# 或 npm version major  # 0.0.9 -> 1.0.0

# 推送
git push origin master
```

### 方式二：手动触发（自动递增版本）
1. 进入 Actions → Publish npm Package
2. 点击 Run workflow
3. 选择版本递增类型：
   - **patch**: 补丁版本 (0.0.9 → 0.0.10)
   - **minor**: 次版本号 (0.0.9 → 0.1.0)
   - **major**: 主版本号 (0.0.9 → 1.0.0)
4. 点击 Run workflow
5. Workflow 会自动修改 `package.json` / `package-lock.json` 版本号，提交到当前分支，然后发布

## 本地测试发布
```bash
# 查看将要发布的文件列表
npm pack --dry-run

# 测试发布（不会真正发布）
npm publish --dry-run
```

## 注意事项
- 发布前确保版本号已更新
- 推送到 `master` 会直接触发 npm 发布，发布前请确保版本号未在 npm 上发布过
- 发布前会运行 typecheck 和 test
- 发布前会执行 build:all 构建
- Trusted Publishing 会自动生成 provenance
- 如果发布失败在 `Publish to npm with trusted publishing` 步骤，优先检查 npm 包的 Trusted Publisher 配置是否和 GitHub 仓库、workflow 文件名一致
