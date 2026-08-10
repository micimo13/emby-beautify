#!/usr/bin/env bash
# =============================================================================
#  Emby 美化全家桶 · 在线一键安装器
#  ---------------------------------------------------------------------------
#  用法 (宿主机执行, 任选一行):
#     curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash
#     curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash -s -- --quick
#     curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash -s -- --container emby
#     curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash -s -- --feature detailpage
#     curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash -s -- --detect-only
#  --feature <id>: 直接安装指定组件(跳过交互), 如 detailpage(详情页全家桶) / danmaku(弹幕) / douban(豆瓣评分)
#    例: 一键给小姐姐库装详情页全家桶: ... | bash -s -- --container emby-18 --feature detailpage
#
#  Docker 容器内执行 (模仿 emby-crx 风格):
#     docker exec EmbyServer /bin/sh -c 'curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | sh'
#     注意: 容器内方式需容器有 curl 且宿主机有 docker 卷挂载能力；推荐在宿主机执行
# =============================================================================

set -e

REPO="micimo13/emby-beautify"
BRANCH="main"

echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║   Emby 美化全家桶 · 在线安装器                       ║"
echo "  ║   https://github.com/$REPO                  ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""

# 需要 docker
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ 未检测到 docker，请在 NAS 宿主机（能执行 docker 命令的环境）运行。"
  echo "   如果你是 SSH 到 NAS，直接运行即可；不要在容器内部运行。"
  exit 1
fi

# 下载项目
TMPDIR=$(mktemp -d)
echo "⬇  正在下载 emby-beautify (branch: $BRANCH) ..."
if curl -fsSL --connect-timeout 15 --max-time 120 \
  "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" -o "$TMPDIR/eb.tar.gz" 2>/dev/null; then
  :
elif curl -fsSL --connect-timeout 15 --max-time 120 \
  "https://gh-proxy.com/https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" -o "$TMPDIR/eb.tar.gz" 2>/dev/null; then
  echo "  (已通过镜像加速下载)"
else
  echo "❌ 下载失败，请检查网络或稍后重试。"
  rm -rf "$TMPDIR"
  exit 1
fi

tar xzf "$TMPDIR/eb.tar.gz" -C "$TMPDIR" 2>/dev/null
SRC="$TMPDIR/emby-beautify-$BRANCH"
[ -d "$SRC" ] || SRC=$(find "$TMPDIR" -maxdepth 1 -type d -name "emby-beautify*" | head -1)

echo "✅ 下载完成，启动安装向导..."
echo ""
cd "$SRC"
bash install.sh "$@"
RC=$?

# 清理
rm -rf "$TMPDIR"
exit $RC
