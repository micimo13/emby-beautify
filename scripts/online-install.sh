#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby Kit · 在线安装入口
#  直接从 GitHub 拉取最新代码构建美化
#  用法:
#    curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash
#
#  网络策略: 国内访问 GitHub 大文件常被限速/卡死, 因此采用多源下载:
#    1. GitHub 官方 raw (小文件秒下)
#    2. gh-proxy.com 加速镜像
#    3. mirror.ghproxy.com 加速镜像
#  每个源下载后校验 tar 完整性, 不完整自动换下一个源。
# =============================================================================

set -e

# ── 解决 curl|bash 管道模式下 read 读不到输入的问题 ──
if [ ! -t 0 ] && ( exec 3<> /dev/tty ) 2>/dev/null; then
  exec < /dev/tty
fi

# GitHub 仓库地址
REPO_OWNER="micimo13"
REPO_NAME="emby-beautify"
REPO_BRANCH="main"
REPO_BASE="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}"
# 加速镜像 (国内可直连)
GH_PROXY="https://gh-proxy.com"
GH_PROXY2="https://mirror.ghproxy.com"

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║   🎨 Vanvy Emby Kit · 在线安装器                        ║"
echo "  ║   Make your Emby beautiful                              ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

# 需要 docker
command -v docker >/dev/null 2>&1 || { echo "❌ 未检测到 docker"; exit 1; }

# ── 多源下载 + 完整性校验 ──
TMPDIR=$(mktemp -d)
# 下载项目: 源码包永远最新 (codeload 或镜像), 不再使用静态 emby-kit.tar.gz (易过期)
TMPDIR=$(mktemp -d)
PKG_URLS=(
  "https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"  # 1. GitHub codeload 源码包 (永远最新)
  "${GH_PROXY}/https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"  # 2. gh-proxy 加速
  "${GH_PROXY2}/https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"  # 3. mirror.ghproxy 加速
  "${REPO_BASE}/emby-kit.tar.gz"                                  # 4. 静态包兜底
)

echo "⬇  下载 Vanvy Emby Kit ..."
DL_OK=0
for url in "${PKG_URLS[@]}"; do
  echo "  · 尝试: $(echo "$url" | sed 's|https://||' | cut -c1-60)..."
  # timeout 硬性限时: 任何卡死(含DNS)最多 15s, 自动换下一个源
  if timeout 15 curl -fsSL --connect-timeout 6 --max-time 12 "$url" -o "$TMPDIR/kit.tar.gz" 2>/dev/null; then
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
