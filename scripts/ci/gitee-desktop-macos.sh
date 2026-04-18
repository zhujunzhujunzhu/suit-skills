#!/usr/bin/env bash
# Gitee Go「shell@agent」在已纳管的 macOS 构建机上运行（需 Xcode/CLT、Node 20+）。
set -euo pipefail

npm config set registry https://registry.npmmirror.com
bash "$(dirname "$0")/desktop-tauri-macos.sh"
