#!/usr/bin/env bash
# 在 Debian/Ubuntu（含 GitHub ubuntu-*、Gitee 云端）上安装 Tauri 2 所需系统包。
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

APT_UPDATE="apt-get update"
APT_INSTALL="apt-get install -y"

if command -v sudo >/dev/null 2>&1; then
  APT_UPDATE="sudo ${APT_UPDATE}"
  APT_INSTALL="sudo ${APT_INSTALL}"
fi

${APT_UPDATE}
${APT_INSTALL} \
  curl \
  wget \
  file \
  build-essential \
  pkg-config \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libxdo-dev
