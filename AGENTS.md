# AGENTS.md instructions for d:\Coding_agent\skills-cli

在 Windows 环境执行脚本或需要类 Unix shell 行为时，优先通过 Git Bash 执行，而不是直接使用 PowerShell 语法。当前 Git Bash 路径为：

```powershell
& 'D:\Program Files\Git\bin\bash.exe' -lc '<bash 命令>'
```

示例：

```powershell
& 'D:\Program Files\Git\bin\bash.exe' -lc 'pwd && git status'
& 'D:\Program Files\Git\bin\bash.exe' -lc './scripts/build.sh'
```

如果命令是纯 Windows/PowerShell 管理任务，仍可使用 PowerShell。

提交代码前必须完整运行一次所有用例：

```powershell
& 'D:\Program Files\Git\bin\bash.exe' -lc 'npm test'
```

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **suit-skills** (4369 symbols, 8924 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/suit-skills/context` | Codebase overview, check index freshness |
| `gitnexus://repo/suit-skills/clusters` | All functional areas |
| `gitnexus://repo/suit-skills/processes` | All execution flows |
| `gitnexus://repo/suit-skills/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
