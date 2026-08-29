#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby · 前端还原脚本
#  恢复被 Vanvy 替换前的原始 Emby 前端
#  用法:
#    curl -sL https://emby-beautify.vanvy.top/emby-showcase/scripts/uninstall.sh | bash -s -- --container <名字>
# =============================================================================
set -e

CONTAINER=""
TMP="/tmp/vanvy-app-remove"

c_ok()  { echo -e "\033[1;32m[成功]\033[0m $1"; }
c_err() { echo -e "\033[1;31m[错误]\033[0m $1"; }
c_info(){ echo -e "\033[1;36m[信息]\033[0m $1"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift ;;
  esac
  shift
done

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  🔄 Vanvy Emby · 前端还原                                ║"
echo "  ║  恢复原始 Emby 前端                                       ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

[ -z "$CONTAINER" ] && { c_err "请指定容器: --container <名字>"; exit 1; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || { c_err "容器 $CONTAINER 不存在"; exit 1; }

DASH=""
for p in /system/dashboard-ui /app/emby/system/dashboard-ui /opt/emby-server/system/dashboard-ui; do
  if docker exec "$CONTAINER" sh -c "[ -d '$p' ]" 2>/dev/null; then
    DASH="$p"; break
  fi
done
[ -z "$DASH" ] && { c_err "无法识别 dashboard 路径"; exit 1; }

INDEX="$DASH/index.html"
BAK_DIR="$DASH/.vanvy-backup"

if ! docker exec "$CONTAINER" sh -c "[ -f '$BAK_DIR/index.html' ]" 2>/dev/null; then
  c_err "未找到备份 ($BAK_DIR/index.html), 无法还原"
  exit 1
fi

c_info "恢复原始 index.html..."
docker exec "$CONTAINER" sh -c "cp '$BAK_DIR/index.html' '$INDEX' 2>/dev/null && echo restored"
c_ok "index.html 已恢复"

c_info "删除 Vanvy 前端资源..."
docker exec "$CONTAINER" sh -c "rm -rf '$DASH/vanvy-app'" 2>/dev/null
c_ok "vanvy-app 已删除"

c_info "保留备份目录 (如需彻底清除: rm -rf $BAK_DIR)"

echo ""
c_ok "🎉 还原完成! 刷新页面即可看到原始 Emby 前端"
