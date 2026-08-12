#!/usr/bin/env bash
# =============================================================================
#  Emby Beautify · 在线安装入口
#  直接从 GitHub 拉取最新代码构建美化
#  用法:
#    curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash
#
#  设计原则: 任何一步都不允许卡死, 每步都有输出反馈。
#    - banner 最先打印 (用户立刻看到反馈)
#    - 下载多源切换 + timeout 硬性限时 (含 DNS 卡死)
#    - 不依赖 /dev/tty (UNRAID Web 终端等环境可能阻塞)
# =============================================================================

# 立即打印 banner, 用户回车后马上有反馈
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
# 加速镜像 (国内可直连)
GH_PROXY="https://gh-proxy.com"
GH_PROXY2="https://mirror.ghproxy.com"

# 需要 docker
command -v docker >/dev/null 2>&1 || { echo "❌ 未检测到 docker"; exit 1; }

# ── 多源下载 + 完整性校验 ──
TMPDIR=$(mktemp -d)
# 源码包永远最新 (codeload 或镜像), 静态包仅兜底
PKG_URLS=(
  "https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"  # 1. codeload 源码包 (永远最新)
  "${GH_PROXY}/https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"  # 2. gh-proxy 加速
  "${GH_PROXY2}/https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"  # 3. mirror.ghproxy 加速
  "${REPO_BASE}/emby-kit.tar.gz"                                  # 4. 静态包兜底
)

echo "⬇  下载 Emby Beautify ..."
DL_OK=0
for url in "${PKG_URLS[@]}"; do
  echo "  · 尝试: $(echo "$url" | sed 's|https://||' | cut -c1-60)..."
  # timeout 硬性限时: 任何卡死(含DNS)最多 15s, 自动换下一个源
  if timeout 15 curl -fsSL --dns-timeout 5 --connect-timeout 5 --max-time 12 "$url" -o "$TMPDIR/kit.tar.gz" 2>/dev/null; then
    # 校验 tar 完整性
    if tar tzf "$TMPDIR/kit.tar.gz" >/dev/null 2>&1; then
      echo "  ✅ 下载成功: $(du -h "$TMPDIR/kit.tar.gz" | cut -f1)"
      DL_OK=1
      break
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
  echo "   或手动下载后执行:"
  echo "   bash install.sh"
  rm -rf "$TMPDIR"
  exit 1
fi

tar xzf "$TMPDIR/kit.tar.gz" -C "$TMPDIR" 2>/dev/null
SRC=$(find "$TMPDIR" -maxdepth 1 -type d -name "${REPO_NAME}*" | head -1)
[ -z "$SRC" ] && SRC="$TMPDIR"

echo ""
echo "✅ 下载完成, 启动安装向导..."
cd "$SRC"
bash install.sh "$@"
RC=$?

rm -rf "$TMPDIR"
exit $RC
