#!/usr/bin/env bash
# =============================================================================
#  Emby Beautify · 在线安装入口
#  用法:
#    curl -sL -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/micimo13/emby-beautify/contents/scripts/online-install.sh" | bash
#
#  核心设计:
#    1. 下载源全部走"无缓存"通道 (codeload / api.github.com / raw)
#       CDN (jsDelivr) 仅作最后兜底, 且会被内容校验拦截旧包
#    2. 下载后校验包内关键修复特征, 旧包直接拒绝换源
#    3. 任何一步 timeout 限时, 绝不卡死
# =============================================================================

# 立即打印 banner
echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║   🎨 Emby Beautify · 在线安装器                          ║"
echo "  ║   Make your Emby beautiful                              ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

set -e

# GitHub 仓库地址
REPO_OWNER="micimo13"
REPO_NAME="emby-beautify"
REPO_BRANCH="main"
REPO_BASE="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}"

# 需要 docker
command -v docker >/dev/null 2>&1 || { echo "❌ 未检测到 docker"; exit 1; }

# ── 下载源码包 (无缓存优先 + 内容校验) ──
TMPDIR=$(mktemp -d)
# 无缓存源优先: codeload 源码包 (永远最新) / api.github.com raw / GitHub raw
# 下载源: GitHub 官方源优先, CDN 镜像兜底 (全部公网可访问)
PKG_URLS=(
  "https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"  # 1. GitHub codeload 源码包
  "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/emby-kit.tar.gz"  # 2. api.github.com (无缓存)
  "${REPO_BASE}/emby-kit.tar.gz"  # 3. GitHub raw
  # CDN 镜像兜底 (内容校验拒绝旧包)
  "https://fastly.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}/emby-kit.tar.gz"
  "https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}/emby-kit.tar.gz"
  "https://gh-proxy.com/https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"
)

echo "⬇  下载 Emby Beautify ..."
DL_OK=0
for url in "${PKG_URLS[@]}"; do
  echo "  · 尝试: $(echo "$url" | sed 's|https://||' | cut -c1-60)..."
  if timeout 30 curl -fsSL --connect-timeout 5 --max-time 25 -H "Accept: application/vnd.github.raw" "$url" -o "$TMPDIR/kit.tar.gz" 2>/dev/null; then
    if tar tzf "$TMPDIR/kit.tar.gz" >/dev/null 2>&1; then
      # 内容校验: 解压检查关键修复特征 (detect.sh 含容器回退 tr -dc)
      tar xzf "$TMPDIR/kit.tar.gz" -C "$TMPDIR" 2>/dev/null
      SRC=$(find "$TMPDIR" -maxdepth 2 -name install.sh | head -1 | xargs dirname 2>/dev/null)
      [ -z "$SRC" ] && SRC="$TMPDIR"
      if grep -q "tr -dc" "$SRC/lib/detect.sh" 2>/dev/null; then
        echo "  ✅ 下载成功: $(du -h "$TMPDIR/kit.tar.gz" | cut -f1) (含最新修复)"
        DL_OK=1
        break
      else
        echo "  ⚠️  包内容过旧 (CDN缓存?), 换下一个源..."
      fi
    else
      echo "  ⚠️  文件不完整, 换下一个源..."
    fi
  else
    echo "  ⚠️  下载失败/超时, 换下一个源..."
  fi
done

if [ "$DL_OK" = "0" ]; then
  echo ""
  echo "❌ 所有下载源均失败, 请检查网络后重试"
  rm -rf "$TMPDIR"
  exit 1
fi

echo ""
echo "✅ 下载完成, 启动安装向导..."
cd "$SRC"
bash install.sh "$@"
RC=$?

rm -rf "$TMPDIR"
exit $RC
