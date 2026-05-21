# Skill 编辑与 AI 辅助

当前已安装 skill 支持在 Web 中直接查看文件树、编辑文件、恢复原版和生成 AI 改写预览。

## 能力

- 读取已安装 skill 的文件树
- 查看单个文件内容
- 保存文本文件
- 恢复单文件
- 恢复整个 skill
- 生成 AI 改写预览
- 应用 AI 改写结果

## 配置

相关配置在 `Settings` 页面里维护，支持两类提供方：

- `openai`
- `cli`

`none` 表示关闭。

## 相关命令

- `installed-skill-files`
- `installed-skill-browser-bundle`
- `installed-skill-file-content`
- `save-installed-skill-file`
- `reset-installed-skill-file`
- `reset-installed-skill`
- `ai-edit-installed-skill`
- `apply-ai-edit-installed-skill`

## 备注

这个功能更偏向本地维护已安装 skill，不是远程 source 的编辑器。
