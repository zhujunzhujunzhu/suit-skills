# Gitee Go「Shell 脚本执行 / shell@agent」在已纳管的 Windows 构建机上运行。
# 要求：已安装 Node.js 20+、Git、Visual Studio Build Tools（MSVC）、WebView2 运行时。
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath 'package.json')) {
  $nested = Get-ChildItem -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') } |
    Select-Object -First 1
  if ($nested) {
    Set-Location $nested.FullName
  }
}

if (-not (Test-Path -LiteralPath 'package.json')) {
  Write-Error '未找到 package.json：请在任务中开启「克隆代码」，或确认工作目录为仓库根目录。'
}

npm config set registry https://registry.npmmirror.com

if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
  $rustup = Join-Path $env:TEMP 'rustup-init.exe'
  Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile $rustup
  & $rustup -y --default-toolchain stable
  $cargoHome = Join-Path $env:USERPROFILE '.cargo'
  $env:Path = "$cargoHome\bin;$env:Path"
}

npm ci
npm run build:desktop
