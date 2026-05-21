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
