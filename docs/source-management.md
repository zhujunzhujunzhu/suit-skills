# 源管理说明

当前项目支持多个 remote source，并保留一个默认源 `default`。

## 内置源

代码里内置了这些 source：

- `default`
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

- 默认 source 来自本地配置，不依赖固定的旧版镜像文档
- 具体配置格式和默认值见 `src/lib/config.ts`
