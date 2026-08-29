#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby · 官方主题还原脚本
#  恢复被 Vanvy Noir 主题美化的原始 Emby 前端
# =============================================================================
set -e
CONTAINER=""
c_ok()  { echo -e "\033[1;32m[成功]\033[0m $1"; }
c_err() { echo -e "\033[1;31m[错误]\033[0m $1"; }
c_info(){ echo -e "\033[1;36m[信息]\033[0m $1"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift ;;
  esac
  shift
done

[ -z "$CONTAINER" ] && { c_err "请指定容器: --container <名字>"; exit 1; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || { c_err "容器不存在"; exit 1; }

DASH=""
for p in /system/dashboard-ui /app/emby/system/dashboard-ui /opt/emby-server/system/dashboard-ui; do
  docker exec "$CONTAINER" sh -c "[ -d '$p' ]" 2>/dev/null && DASH="$p" && break
done
[ -z "$DASH" ] && { c_err "无法识别 dashboard 路径"; exit 1; }

BAK="$DASH/.vanvy-noir-backup"
[ -f "$BAK/skinmanager.js" ] || { c_err "未找到备份, 无法还原"; exit 1; }

c_info "恢复 skinmanager.js..."
docker exec "$CONTAINER" sh -c "cp '$BAK/skinmanager.js' '$DASH/modules/skinmanager.js'" 2>/dev/null
c_ok "skinmanager.js 已恢复"

c_info "恢复 index.html..."
if [ -f "$BAK/index.html" ]; then
  docker exec "$CONTAINER" sh -c "cp '$BAK/index.html' '$DASH/index.html'" 2>/dev/null
  c_ok "index.html 已恢复"
fi

c_info "删除 Vanvy Noir 资源..."
docker exec "$CONTAINER" sh -c "rm -rf '$DASH/modules/themes/vanvy_noir' '$DASH/vanvy-noir'" 2>/dev/null
c_ok "vanvy_noir 主题与 banner 已删除"

echo ""
c_ok "🎉 还原完成! 刷新页面即可看到原始 Emby"
