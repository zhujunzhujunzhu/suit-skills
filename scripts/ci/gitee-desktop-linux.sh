#!/usr/bin/env bash
# Gitee Go「Nodejs 构建」云端环境（Debian/Ubuntu 系）下构建 Linux 桌面端。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "${SCRIPT_DIR}/tauri-deps-ubuntu.sh"

export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"

if ! command -v rustc >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
fi

# shellcheck source=/dev/null
source "${CARGO_HOME}/env"

npm config set registry https://registry.npmmirror.com
npm ci
npm run build:desktop
