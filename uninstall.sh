#!/usr/bin/env bash
# =============================================================================
#  Emby 美化全家桶 · 卸载脚本 (精确清理版)
#  用法: bash uninstall.sh [--container <名>] [--all] [--only <组件id>]
#  - 只删除本工具管理(manifest声明)的注入行和资源文件
#  - 不误删用户其他自定义脚本（如 config.js 等非本工具文件）
#  - 支持精确卸载单个组件: --only jav
# =============================================================================

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/manifest.sh"

CONTAINER=""; ALL=0; ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift ;;
    --all) ALL=1 ;;
    --only) ONLY="$2"; shift ;;
    *) c_warn "忽略未知参数: $1" ;;
  esac
  shift
done

command -v docker >/dev/null 2>&1 || die "未检测到 docker。"
[ -z "$CONTAINER" ] && pick_container
detect_version
detect_dashboard_dir || true
INDEX_FILE="$DASHBOARD_DIR/index.html"
c_info "卸载目标: $CONTAINER (Emby $VER) · $INDEX_FILE"

# 收集要卸载的组件条目（--only 或全部）
declare -a TARGETS
if [ -n "$ONLY" ]; then
  for t in style theme feature; do
    line="$(manifest_find "$t" "$ONLY" 2>/dev/null)" && TARGETS+=("$line")
  done
  [ "${#TARGETS[@]}" = "0" ] && die "未找到组件: $ONLY"
else
  TARGETS=("${MANIFEST_STYLES[@]}" "${MANIFEST_THEMES[@]}" "${MANIFEST_FEATURES[@]}")
fi

# 检测已安装项
echo ""
c_info "本工具管理的已安装组件:"
found=0
for line in "${TARGETS[@]}"; do
  marker="$(manifest_marker "$line")"
  name="$(manifest_field "$line" 3)"
  if docker exec "$CONTAINER" sh -c "grep -qF '$marker' '$INDEX_FILE'" 2>/dev/null; then
    echo "  ✓ $name ($marker)"
    found=1
  fi
done
[ "$found" = "0" ] && echo "  (未发现任何本工具安装的组件)"

if [ "$ALL" = "0" ] && [ -z "$ONLY" ]; then
  c_ask "确认移除以上所有内容? [y/N]: "
  safe_read confirm ""
  [ "$confirm" = "y" ] || [ "$confirm" = "Y" ] || die "已取消。"
fi

# 精确删除：注入行 + 本工具管理的资源文件（不删未知文件）
for line in "${TARGETS[@]}"; do
  type="$(manifest_field "$line" 2)"
  id="$(manifest_field "$line" 1)"
  name="$(manifest_field "$line" 3)"
  marker="$(manifest_marker "$line")"
  resdir="$(manifest_field "$line" 6)"

  # 是否已注入
  if ! docker exec "$CONTAINER" sh -c "grep -qF '$marker' '$INDEX_FILE'" 2>/dev/null; then
    continue
  fi

  # 1. 删除注入行（marker 所在行）
  esc=$(echo "$marker" | sed 's|/|\\/|g; s|\.|\\.|g')
  docker exec -i "$CONTAINER" sh -c "
    INDEX='$INDEX_FILE'
    TMP=\"\$INDEX.eb-rm.\$\$\"
    sed -E '/$esc/d' \"\$INDEX\" > \"\$TMP\"
    mv \"\$TMP\" \"\$INDEX\"
  " 2>/dev/null && echo "  [移除注入] $name"

  # 2. 删除本工具管理的资源文件
  case "$type" in
    style)
      # emby-crx 目录内本工具管理的文件
      local_files=""
      for f in "$SCRIPT_DIR/$resdir"/*; do
        [ -f "$f" ] && local_files="$local_files $(basename "$f")"
      done
      [ -n "$local_files" ] && docker exec "$CONTAINER" sh -c "cd /system/dashboard-ui/emby-crx && rm -f $local_files" 2>/dev/null
      echo "  [移除资源] $id 的 $(echo $local_files | wc -w) 个文件"
      ;;
    theme)
      # theme 文件 = marker (theme-*.css)
      docker exec "$CONTAINER" sh -c "rm -f /system/dashboard-ui/emby-crx/$marker" 2>/dev/null
      echo "  [移除资源] $marker"
      ;;
    feature)
      # 容器目录 = condir, 本地文件名列表
      condir="$(manifest_condir "$line")"
      local_files=""
      for f in "$SCRIPT_DIR/$resdir"/*; do
        [ -f "$f" ] && local_files="$local_files $(basename "$f")"
      done
      [ -n "$local_files" ] && docker exec "$CONTAINER" sh -c "cd /system/dashboard-ui/$condir && rm -f $local_files" 2>/dev/null
      echo "  [移除资源] $id 的 $(echo $local_files | wc -w) 个文件"
      ;;
  esac
done

# 3. 清理空的 emby-crx 目录（只删空目录，保留用户文件）
docker exec "$CONTAINER" sh -c '
  for d in /system/dashboard-ui/emby-crx /system/dashboard-ui/emby-danmaku /system/dashboard-ui/emby-douban /system/dashboard-ui/emby-extrafanart /system/dashboard-ui/emby-playbackrate /system/dashboard-ui/emby-loading /system/dashboard-ui/emby-tool /system/dashboard-ui/emby-localplayer /system/dashboard-ui/emby-bannercarousel /system/dashboard-ui/emby-detailtabs /system/dashboard-ui/emby-trailer /system/dashboard-ui/emby-customcss /system/dashboard-ui/emby-detailpage; do
    if [ -d "$d" ] && [ -z "$(ls -A "$d" 2>/dev/null)" ]; then
      rmdir "$d" 2>/dev/null && echo "  [清理] 空目录 $d"
    fi
  done
' 2>/dev/null

c_ok "✅ 卸载完成。强制刷新浏览器即可恢复。"
exit 0
