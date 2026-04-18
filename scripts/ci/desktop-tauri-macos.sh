#!/usr/bin/env bash
# macOS 上构建 Tauri 桌面端（GitHub Actions macos-* 与自建 Mac 通用）。
set -euo pipefail

export PATH="${HOME}/.cargo/bin:${PATH}"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"

if ! command -v rustc >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
fi

# shellcheck source=/dev/null
source "${CARGO_HOME}/env"

if command -v brew >/dev/null 2>&1; then
  brew list libappindicator >/dev/null 2>&1 || brew install libappindicator || true
  brew list librsvg >/dev/null 2>&1 || brew install librsvg || true
fi

npm ci
npm run build:desktop
