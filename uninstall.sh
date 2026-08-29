#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby Kit · 卸载/还原
#  ---------------------------------------------------------------------------
#  用法:
#    bash uninstall.sh --container <名> --all    # 卸载全部美化
#    bash uninstall.sh --container <名> --only <组件>  # 卸载单个
#    bash uninstall.sh --container <名> --reset  # 完全还原 (清持久化+钩子)
#    bash uninstall.sh --container <名> --list-backups   # 列出所有 index.html 备份
#    bash uninstall.sh --container <名> --restore-backup <时间戳>  # 恢复指定备份
# =============================================================================

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/manifest.sh"
source "$SCRIPT_DIR/lib/detect.sh"

CONTAINER=""; ALL=0; ONLY=""; RESET=0; LIST_BACKUPS=0; RESTORE_BACKUP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift ;;
    --all) ALL=1 ;;
    --only) ONLY="$2"; shift ;;
    --reset) RESET=1 ;;
    --list-backups) LIST_BACKUPS=1 ;;
    --restore-backup) RESTORE_BACKUP="$2"; shift ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) c_warn "忽略未知参数: $1" ;;
  esac
  shift
done

command -v docker >/dev/null 2>&1 || die "未检测到 docker"
[ -z "$CONTAINER" ] && detect_container
detect_dashboard_dir || true
detect_ext_hook
INDEX_FILE="$DASHBOARD_DIR/index.html"

# ── 完全还原 (--reset) ──
reset_emby() {
  c_warn "════════ 完全还原 Emby (恢复出厂状态) ════════"
  c_warn "将删除所有美化 + 持久化数据, 不可恢复!"
  [ "${ASSUME_YES:-0}" = "1" ] || confirm "确认完全还原 $CONTAINER?" || die "已取消"

  # 1. 恢复 index.html 镜像原始层 (失败则回退 pristine 备份)
  c_info "恢复 index.html (镜像原始层)..."
  local img cid restored=0
  img=$(docker inspect "$CONTAINER" --format '{{.Config.Image}}' 2>/dev/null)
  cid=$(docker create "$img" 2>/dev/null)
  if [ -n "$cid" ]; then
    if docker cp "$cid:$DASHBOARD_DIR/index.html" /tmp/vanvy-orig-index.html 2>/dev/null \
      && docker cp /tmp/vanvy-orig-index.html "$CONTAINER:$DASHBOARD_DIR/index.html" 2>/dev/null; then
      c_ok "✓ index.html 已恢复镜像原始层"
      restored=1
    else
      c_warn "镜像层无 index.html (自定义镜像), 尝试 pristine 备份..."
    fi
    rm -f /tmp/vanvy-orig-index.html
    docker rm "$cid" >/dev/null 2>&1
  fi
  # 回退: pristine 出厂备份 (时间戳备份栈)
  if [ "$restored" = "0" ]; then
    local pristine
    pristine=$(docker exec "$CONTAINER" sh -c "ls -t /config/backups/emby-beautify/index.html.pristine.* 2>/dev/null | head -1" 2>/dev/null)
    if [ -n "$pristine" ]; then
      docker exec "$CONTAINER" sh -c "cp '$pristine' '$DASHBOARD_DIR/index.html'" 2>/dev/null \
        && c_ok "✓ index.html 已从 pristine 备份恢复: $(basename "$pristine")"
    else
      c_warn "未找到 pristine 备份, 仅清理注入行"
      docker exec "$CONTAINER" sh -c "sed -i '/vanvy\//d' '$DASHBOARD_DIR/index.html'" 2>/dev/null
    fi
  fi

  # 2. 删美化资源
  c_info "删除美化资源..."
  docker exec "$CONTAINER" sh -c "rm -rf '$DASHBOARD_DIR/vanvy' '$DASHBOARD_DIR/config.json'" 2>/dev/null
  c_ok "✓ 资源已清理"

  # 3. 清持久化 + 钩子
  c_info "清理持久化..."
  docker exec "$CONTAINER" sh -c "
    rm -rf /config/vanvy-official /config/vanvy-branding
    EXT=/config/config/ext.sh
    [ -f \"\$EXT\" ] && sed -i '/vanvy-beautify 持久化部署/,/end vanvy-beautify 持久化/d' \"\$EXT\"
  " 2>/dev/null
  c_ok "✓ 持久化已清理"

  c_ok "✅ $CONTAINER 已完全还原!"
  exit 0
}

# ── 卸载全部 (--all) ──
uninstall_all() {
  c_info "卸载全部美化..."
  # 删注入行
  docker exec "$CONTAINER" sh -c "
    INDEX='$INDEX_FILE'
    sed -i '/vanvy\\/core/d; /vanvy\\/banner/d; /vanvy\\/themes/d; /vanvy\\/features/d; /vanvy\\/branding/d; /vanvy\\/carousel_rules/d; /opencc-js/d' \"\$INDEX\"
  " 2>/dev/null
  # 删资源
  docker exec "$CONTAINER" sh -c "rm -rf '$DASHBOARD_DIR/vanvy' '$DASHBOARD_DIR/config.json'" 2>/dev/null
  # 清持久化
  docker exec "$CONTAINER" sh -c "
    rm -rf /config/vanvy-official /config/vanvy-branding
    EXT=/config/config/ext.sh
    [ -f \"\$EXT\" ] && sed -i '/vanvy-beautify 持久化部署/,/end vanvy-beautify 持久化/d' \"\$EXT\"
  " 2>/dev/null
  c_ok "✅ 已卸载全部美化 (含持久化)"
}

# ── 卸载单个 (--only) ──
uninstall_one() {
  local id="$1" entry type
  entry="$(manifest_find "" "$id")" || { c_err "未知组件: $id"; return 1; }
  type="$(manifest_field "$entry" 2)"
  c_info "卸载组件: $(manifest_field "$entry" 3)"
  # 注入路径用原名(下划线), CSS文件名用连字符
  local fkey
  fkey="$(echo "$id" | sed 's/_/-/g')"
  # 用 grep -v 过滤注入行 (匹配 id 原名)
  docker exec "$CONTAINER" sh -c "
    INDEX='$INDEX_FILE'
    grep -vE 'vanvy/$id|theme-$id' \"\$INDEX\" > \"\$INDEX.tmp\"
    mv \"\$INDEX.tmp\" \"\$INDEX\"
  " 2>/dev/null
  # 删资源目录
  case "$type" in
    style)
      docker exec "$CONTAINER" sh -c "rm -rf '$DASHBOARD_DIR/vanvy/$id'" 2>/dev/null
      # 联动清理: 轮播伴随的 carousel_rules (rules-loader + 规则文件)
      if [ -d "$SCRIPT_DIR/components/home/carousel_rules" ]; then
        docker exec "$CONTAINER" sh -c "
          INDEX='$INDEX_FILE'
          grep -v 'vanvy/carousel_rules' \"\$INDEX\" > \"\$INDEX.tmp\" && mv \"\$INDEX.tmp\" \"\$INDEX\"
          rm -rf '$DASHBOARD_DIR/vanvy/carousel_rules'
        " 2>/dev/null
        c_ok "✅ 已联动清理 carousel_rules (策展组件)"
      fi
      ;;
    theme) docker exec "$CONTAINER" sh -c "rm -f '$DASHBOARD_DIR/vanvy/themes/$fkey.css' '$DASHBOARD_DIR/vanvy/themes/theme-$id.js'" 2>/dev/null ;;
    feature) docker exec "$CONTAINER" sh -c "rm -rf '$DASHBOARD_DIR/vanvy/features/$id'" 2>/dev/null ;;
  esac
  c_ok "✅ 已卸载 $id (含注入行)"
}

# ── 主流程 ──
if [ "$LIST_BACKUPS" = "1" ]; then
  c_info "index.html 备份列表 (时间戳备份栈):"
  echo ""
  list_index_backups
  echo ""
  c_warn "恢复用法: --restore-backup <时间戳>"
  exit 0
fi
if [ -n "$RESTORE_BACKUP" ]; then
  c_info "恢复备份: $RESTORE_BACKUP"
  restore_index_backup "$RESTORE_BACKUP"
  c_warn "提示: 恢复后浏览器请强制刷新 (Ctrl+F5)"
  exit 0
fi
if [ "$RESET" = "1" ]; then
  reset_emby
elif [ "$ALL" = "1" ]; then
  uninstall_all
elif [ -n "$ONLY" ]; then
  uninstall_one "$ONLY"
else
  c_warn "用法: --all (全卸) / --only <组件> / --reset (完全还原) / --list-backups (列备份) / --restore-backup <时间戳> (恢复)"
  exit 1
fi
