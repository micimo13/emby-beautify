#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby Kit V2 · 在线安装入口
#  ---------------------------------------------------------------------------
#  用法: curl -sL https://api.github.com/repos/micimo13/emby-beautify/scripts/online-install.sh | bash
#  流程: 下载 v2 包 → 解压到临时目录 → 调用 install.sh
# =============================================================================

set -u

# 包下载地址 (本地分发优先, GitHub 无缓存源兜底, 全部公网可访问)
PKG_URLS=(
  "https://api.github.com/repos/micimo13/emby-beautify/emby-kit-v2.tar.gz"
  "https://api.github.com/repos/micimo13/emby-beautify/contents/emby-kit-v2.tar.gz"
  "https://raw.githubusercontent.com/micimo13/emby-beautify/main/emby-kit-v2.tar.gz"
  "https://fastly.jsdelivr.net/gh/micimo13/emby-beautify@main/emby-kit-v2.tar.gz"
  "https://gh-proxy.com/https://raw.githubusercontent.com/micimo13/emby-beautify/main/emby-kit-v2.tar.gz"
)
TMP_DIR="/tmp/vanvy-v2-install"

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║   🎨 Vanvy Emby Kit V2 · 在线安装                        ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

# 1. 下载包 (多源尝试)
echo "  📥 下载安装包..."
rm -rf "$TMP_DIR" && mkdir -p "$TMP_DIR"
DL_OK=0
for url in "${PKG_URLS[@]}"; do
  echo "  · 尝试: $(echo "$url" | sed 's|https://||' | cut -c1-55)..."
  if command -v curl >/dev/null 2>&1; then
    if curl -fsSL --connect-timeout 10 --max-time 120 -H "Accept: application/vnd.github.raw" -o "$TMP_DIR/kit.tar.gz" "$url" 2>/dev/null; then DL_OK=1; break; fi
  else
    if wget -q -T 60 -O "$TMP_DIR/kit.tar.gz" "$url" 2>/dev/null; then DL_OK=1; break; fi
  fi
done
if [ "$DL_OK" != "1" ]; then echo "  ❌ 所有下载源失败"; exit 1; fi
echo "  ✅ 下载完成 ($(du -h "$TMP_DIR/kit.tar.gz" | cut -f1))"

# 2. 解压
echo "  📦 解压..."
tar xzf "$TMP_DIR/kit.tar.gz" -C "$TMP_DIR" || { echo "  ❌ 解压失败"; exit 1; }
echo "  ✅ 解压完成"

# 3. 进入目录调用 install.sh
cd "$TMP_DIR" || exit 1
if [ -f install.sh ]; then
  exec bash install.sh "$@"
else
  echo "  ❌ 未找到 install.sh, 包结构异常"
  exit 1
fi
