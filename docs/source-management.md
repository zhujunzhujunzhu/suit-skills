# 源管理说明

当前项目支持多个 remote source。新安装不会预置团队私有源，需要用户按需手动添加。

## 内置源

代码里内置了这些 source：

- `anthropics-skills`
- `superpowers`
- `vercel-agent-skills`
- `huggingface-skills`
- `antigravity-awesome-skills`
- `awesome-claude-skills`

每个内置源都可以单独启用、禁用，部分源还配置了国内镜像地址。

## CLI

```bash
suit-skills source list
suit-skills source add <name> <url>
suit-skills source enable <name>
suit-skills source disable <name>
suit-skills source default <name>
suit-skills source remove <name>
suit-skills source restore-builtins
suit-skills source mirror <name> on
suit-skills source mirror <name> off
```

## Web

Web 控制台的 `Sources` 页面可以完成同样的管理操作，并显示镜像启用状态。

## 备注

- 团队私有源不再作为内置源展示；如需使用，请通过 `source add` 手动添加。
- 具体配置格式和默认值见 `src/lib/config.ts`
