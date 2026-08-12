#!/usr/bin/env bash
# =============================================================================
#  Emby 美化引擎 · 主安装器
#  ---------------------------------------------------------------------------
#  用法:
#    bash install.sh                        # 交互式
#    bash install.sh --container emby      # 指定容器
#    bash install.sh --package movie        # 装组件包
#    bash install.sh --detect-only          # 只检测环境
#    bash install.sh --restore               # 从持久卷恢复 (容器重建后)
# =============================================================================

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/manifest.sh"
source "$SCRIPT_DIR/lib/detect.sh"
source "$SCRIPT_DIR/lib/persist.sh"

CONTAINER=""; PACKAGE=""; CLI_FEATURES=""; DETECT_ONLY=0; QUICK=0; ASSUME_YES=0
STYLE=""; THEMES=(); FEATURES=(); BRANDING=0; RESTORE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift ;;
    --package)   PACKAGE="$2"; shift ;;
    --feature)   CLI_FEATURES="$2"; shift ;;
    --detect-only) DETECT_ONLY=1 ;;
    --restore)   RESTORE=1 ;;
    --quick)     QUICK=1 ;;
    --yes|-y)    ASSUME_YES=1 ;;
    *) c_warn "忽略未知参数: $1" ;;
  esac
  shift
done

banner() {
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║   🎨 Emby 美化引擎 · Vanvy Emby Kit                     ║"
  echo "  ║   智能识别镜像 · 风格可选 · 组件互补 · 重建不丢          ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
}

# ── 安装单个组件 ──
install_component() {
  local type="$1" id="$2" entry name compat resdir zone
  entry="$(manifest_find "$type" "$id")" || { c_err "未知组件: $type/$id"; return 1; }
  name="$(manifest_field "$entry" 3)"
  compat="$(manifest_field "$entry" 4)"
  resdir="$(manifest_resdir "$entry")"
  zone="$(manifest_zone "$entry")"

  # 版本过滤
  if ! manifest_compat "$compat" "$VER_MAJOR" 2>/dev/null; then
    # all 总是兼容
    if [ "$compat" != "all" ]; then
      c_warn "组件 [$name] 不兼容 Emby $VER_MAJOR (需要 $compat)，跳过"
      return 0
    fi
  fi

  c_info "安装 [$type] $name ..."

  case "$type" in
    style)
      # 首页美化: 先清理旧版残留, 再推资源
      cleanup_builtin_crx
      # 推 core 依赖库 (jquery/common-utils/md5) 供轮播引用
      push_assets "$SCRIPT_DIR/core" "$DASHBOARD_DIR/vanvy/core" || return 1
      # 推轮播资源
      push_assets "$SCRIPT_DIR/$resdir" "$DASHBOARD_DIR/vanvy/$id" || return 1
      ;;
    theme)
      # 主题: 推 css 到 vanvy/themes/ + 生成 html class 激活 JS
      docker exec "$CONTAINER" sh -c "mkdir -p '$DASHBOARD_DIR/vanvy/themes'" 2>/dev/null
      for f in "$SCRIPT_DIR/$resdir"/*.css; do
        [ -f "$f" ] && docker cp "$f" "$CONTAINER:$DASHBOARD_DIR/vanvy/themes/$(basename "$f")" 2>/dev/null
      done
      local tjs="/tmp/vanvy-theme-$id.js"
      echo "// Vanvy theme activate" > "$tjs"
      echo "document.documentElement.classList.add('vanvy-theme-$id');" >> "$tjs"
      docker cp "$tjs" "$CONTAINER:$DASHBOARD_DIR/vanvy/themes/theme-$id.js" 2>/dev/null
      rm -f "$tjs"
      THEME_ACTIVATE="<script src=\"vanvy/themes/theme-$id.js\"></script>"
      ;;

    feature)
      # 核心库推到 vanvy/core/, 其他功能推到 vanvy/features/<id>/
      if [ "$id" = "vanvy_core" ]; then
        push_assets "$SCRIPT_DIR/core" "$DASHBOARD_DIR/vanvy/core" || return 1
      elif [ "$id" = "jav_details" ]; then
        # JAV 详情页: JS 推 features/jav_details/, config.json 放 web 根 (脚本 fetch ./config.json)
        push_assets "$SCRIPT_DIR/$resdir" "$DASHBOARD_DIR/vanvy/features/$id" || return 1
        [ -f "$SCRIPT_DIR/$resdir/config.json" ] && docker cp "$SCRIPT_DIR/$resdir/config.json" "$CONTAINER:$DASHBOARD_DIR/config.json" 2>/dev/null
      else
        push_assets "$SCRIPT_DIR/$resdir" "$DASHBOARD_DIR/vanvy/features/$id" || return 1
      fi
      ;;
    branding)
      install_branding
      return 0
      ;;
  esac

  # 生成注入文件
  local inject="/tmp/vanvy-inject-$id.html"
  : > "$inject"
  while IFS= read -r line; do
    [ -n "$line" ] && printf '%s\n' "$line" >> "$inject"
  done <<< "$(manifest_inject_lines "$entry")"
  # 主题: 追加 html class 激活 script
  [ -n "${THEME_ACTIVATE:-}" ] && printf '%s\n' "$THEME_ACTIVATE" >> "$inject" && THEME_ACTIVATE=""

  # 注入 (传本地文件路径, inject_to_index 内部自行上传)
  local marker
  marker="$(manifest_marker "$entry")"
  inject_to_index "$marker" "$inject" "$DASHBOARD_DIR/index.html"
  rm -f "$inject"
  c_ok "✓ [$name] 完成"
}

# ── 品牌安装 ──
install_branding() {
  c_info "安装品牌定制 (加载LOGO/标签图标)..."
  c_ask "  加载页 Logo URL (回车跳过): "
  safe_read BRAND_LOGO ""
  c_ask "  浏览器标签图标 URL (回车跳过): "
  safe_read BRAND_FAVICON ""
  [ -z "$BRAND_LOGO" ] && [ -z "$BRAND_FAVICON" ] && { c_warn "两项都未提供, 跳过"; return 0; }

  local persist_dir="/config/vanvy-branding"
  docker exec "$CONTAINER" sh -c "mkdir -p '$persist_dir' '$DASHBOARD_DIR/vanvy/branding'" 2>/dev/null

  if [ -n "$BRAND_LOGO" ]; then
    local tmpf="/tmp/vanvy-logo"
    if curl -fsSL --connect-timeout 10 --max-time 60 -o "$tmpf" "$BRAND_LOGO" 2>/dev/null; then
      docker cp "$tmpf" "$CONTAINER:$DASHBOARD_DIR/vanvy/branding/splash-logo.png" 2>/dev/null
      docker cp "$tmpf" "$CONTAINER:$persist_dir/splash-logo.png" 2>/dev/null
      # 注入覆盖样式
      docker exec -i "$CONTAINER" sh -c "
        INDEX='$DASHBOARD_DIR/index.html'
        MARKER='vanvy-branding-splash'
        if ! grep -q \"\$MARKER\" \"\$INDEX\"; then
          STYLE=\"<style id=\\\"\$MARKER\\\">.app-splash { background-image: url(vanvy/branding/splash-logo.png) !important; }</style>\"
          sed -i \"s|</head>|\$STYLE\n</head>|\" \"\$INDEX\"
          echo '  ✓ 加载LOGO已注入'
        fi
      " 2>&1 | sed 's/^/    /'
      c_ok "✓ 加载 LOGO 已设置"
      rm -f "$tmpf"
    else
      c_err "Logo 下载失败: $BRAND_LOGO"
    fi
  fi

  if [ -n "$BRAND_FAVICON" ]; then
    local tmpf2="/tmp/vanvy-favicon" ext="png"
    case "$BRAND_FAVICON" in *.ico) ext="ico" ;; *.jpg|*.jpeg) ext="jpg" ;; esac
    if curl -fsSL --connect-timeout 10 --max-time 60 -o "$tmpf2" "$BRAND_FAVICON" 2>/dev/null; then
      docker cp "$tmpf2" "$CONTAINER:$DASHBOARD_DIR/vanvy/branding/favicon-custom.$ext" 2>/dev/null
      docker cp "$tmpf2" "$CONTAINER:$persist_dir/favicon-custom.$ext" 2>/dev/null
      docker exec -i "$CONTAINER" sh -c "
        INDEX='$DASHBOARD_DIR/index.html'
        sed -i \"s|<link rel=\\\"shortcut icon\\\" href=\\\"[^\\\"]*\\\"|<link rel=\\\"shortcut icon\\\" href=\\\"vanvy/branding/favicon-custom.$ext\\\"|\" \"\$INDEX\"
        echo '  ✓ 标签图标已注入'
      " 2>&1 | sed 's/^/    /'
      c_ok "✓ 浏览器标签图标已设置"
      rm -f "$tmpf2"
    else
      c_err "Favicon 下载失败: $BRAND_FAVICON"
    fi
  fi
}

# ── 菜单: 组件包选择 ──
pick_package() {
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  📦 组件包 (一键安装预置组合)                          │"
  local i=1 line
  for line in "${MANIFEST_PACKAGES[@]}"; do
    printf '  │     [%d] %-32s %s\n' "$i" "$(manifest_field "$line" 2)" "$(manifest_field "$line" 3)"
    i=$((i+1))
  done
  printf '  │     [%d] 自定义选择 (不装包)\n' "$i"
  echo "  └─────────────────────────────────────────────────────────┘"
  c_ask "选择 [1-$i, 默认 2 观影包]: "
  safe_read psel "2"
  if echo "$psel" | grep -qE '^[0-9]+$' && [ "$psel" -ge 1 ] && [ "$psel" -le "${#MANIFEST_PACKAGES[@]}" ]; then
    PACKAGE="$(manifest_field "${MANIFEST_PACKAGES[$((psel-1))]}" 1)"
    c_ok "选择组件包: $PACKAGE"
  fi
}

# ── 菜单: 轮播风格 ──
pick_style() {
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  🎠 轮播风格 (按版本可选, 三选一)                       │"
  local i=1 line
  for line in "${MANIFEST_STYLES[@]}"; do
    local compat desc
    compat="$(manifest_field "$line" 4)"; desc="$(manifest_field "$line" 5)"
    local avail=""
    if [ "$compat" = "all" ] || echo "$compat" | tr ',' '\n' | grep -qx "$VER_MAJOR" 2>/dev/null; then
      avail="✓"
    else
      avail="✗(需$compat)"
    fi
    printf '  │     [%d] %-28s %s %s\n' "$i" "$(manifest_field "$line" 3)" "$desc" "$avail"
    i=$((i+1))
  done
  echo "  └─────────────────────────────────────────────────────────┘"
  # 自动推荐: 4.8 → 经典, 4.9 → Fluent
  local def=1
  [ "$VER_MAJOR" = "4.9" ] && def=2
  c_ask "选择轮播风格 [1-$((i-1)), 默认 $def]: "
  safe_read ssel "$def"; ssel="${ssel:-$def}"
  if echo "$ssel" | grep -qE '^[0-9]+$' && [ "$ssel" -ge 1 ] && [ "$ssel" -le "${#MANIFEST_STYLES[@]}" ]; then
    STYLE="$(manifest_field "${MANIFEST_STYLES[$((ssel-1))]}" 1)"
  fi
  c_ok "轮播风格: $(manifest_field "${MANIFEST_STYLES[$((ssel-1))]}" 3)"
}

# ── 菜单: 主题多选 ──
pick_themes() {
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  🎨 主题 (可多选, 逗号分隔; 0=不装)                    │"
  local i=1 line
  for line in "${MANIFEST_THEMES[@]}"; do
    printf '  │     [%2d] %-30s %s\n' "$i" "$(manifest_field "$line" 3)" "$(manifest_field "$line" 5)"
    i=$((i+1))
  done
  echo "  └─────────────────────────────────────────────────────────┘"
  c_ask "选择 (如: 1,2,3; 毛玻璃互斥只能选一个): "
  safe_read tsel "0"
  THEMES=()
  local glass_picked=""
  if [ -n "$tsel" ] && [ "$tsel" != "0" ]; then
    local pick
    for pick in $(parse_multi "$tsel"); do
      if echo "$pick" | grep -qE '^[0-9]+$' && [ "$pick" -ge 1 ] && [ "$pick" -le "${#MANIFEST_THEMES[@]}" ]; then
        local tid
        tid="$(manifest_field "${MANIFEST_THEMES[$((pick-1))]}" 1)"
        # 毛玻璃互斥: 已选毛玻璃则跳过其他毛玻璃
        case "$tid" in
          glass_*)
            if [ -n "$glass_picked" ]; then
              c_warn "毛玻璃主题互斥, 已选 $glass_picked, 跳过 $tid"
            else
              glass_picked="$tid"
              THEMES+=("$tid")
            fi
            ;;
          *) THEMES+=("$tid") ;;
        esac
      fi
    done
  fi
}

# ── 菜单: 功能多选 ──
pick_features() {
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  ⚡ 功能增强 (可多选, 逗号分隔; 0=不装)                │"
  local i=1 line
  VISIBLE_FEATURES=()
  for line in "${MANIFEST_FEATURES[@]}"; do
    # 隐藏内部依赖组件 (vanvy_core)
    [ "$(manifest_field "$line" 1)" = "vanvy_core" ] && continue
    printf '  │     [%2d] %-30s %s\n' "$i" "$(manifest_field "$line" 3)" "$(manifest_field "$line" 5)"
    VISIBLE_FEATURES+=("$(manifest_field "$line" 1)")
    i=$((i+1))
  done
  echo "  └─────────────────────────────────────────────────────────┘"
  c_ask "选择 (如: 1,3,5): "
  safe_read fsel "0"
  FEATURES=()
  if [ -n "$fsel" ] && [ "$fsel" != "0" ]; then
    local pick
    for pick in $(parse_multi "$fsel"); do
      if echo "$pick" | grep -qE '^[0-9]+$' && [ "$pick" -ge 1 ] && [ "$pick" -le "${#VISIBLE_FEATURES[@]}" ]; then
        FEATURES+=("${VISIBLE_FEATURES[$((pick-1))]}")
      fi
    done
  fi
}

# ── 主流程 ──
banner
command -v docker >/dev/null 2>&1 || die "未检测到 docker"

run_health_check || exit 1

# --restore 模式: 从持久卷恢复 (官方版/lsio 容器重建后)
if [ "$RESTORE" = "1" ]; then
  restore_assets
  exit $?
fi

# CLI 指定组件模式: --feature <id[,id...]> 直接安装
if [ -n "$CLI_FEATURES" ]; then
  c_info "CLI 指定组件: $CLI_FEATURES"
  IFS=',' read -ra FIDS <<< "$CLI_FEATURES"
  for fid in "${FIDS[@]}"; do
    case "$fid" in
      branding) install_branding ;;
      *)
        # 尝试 style/theme/feature 三种类型
        if manifest_find style "$fid" >/dev/null 2>&1; then
          STYLE="$fid"
        elif manifest_find theme "$fid" >/dev/null 2>&1; then
          THEMES+=("$fid")
        elif manifest_find feature "$fid" >/dev/null 2>&1; then
          FEATURES+=("$fid")
        else
          c_warn "未知组件: $fid"
        fi
        ;;
    esac
  done
  # 执行安装
  install_component feature "vanvy_core"
  [ -n "${STYLE:-}" ] && install_component style "$STYLE"
  for t in "${THEMES[@]:-}"; do [ -n "$t" ] && install_component theme "$t"; done
  for f in "${FEATURES[@]:-}"; do [ -n "$f" ] && install_component feature "$f"; done
  persist_all
  c_ok "🎉 指定组件安装完成!"
  exit 0
fi

if [ "$DETECT_ONLY" = "1" ]; then
  c_ok "环境检测完成: $CONTAINER ($IMAGE_FULL, $VER)"
  exit 0
fi

# 组件包模式 (快捷安装)
if [ -n "$PACKAGE" ]; then
  pkg_entry=""
  for line in "${MANIFEST_PACKAGES[@]}"; do
    [ "$(manifest_field "$line" 1)" = "$PACKAGE" ] && pkg_entry="$line" && break
  done
  if [ -n "$pkg_entry" ]; then
    c_info "安装组件包: $(manifest_field "$pkg_entry" 2)"
    comps="$(manifest_field "$pkg_entry" 3)"
    first=$(echo "$comps" | cut -d',' -f1)
    STYLE="$first"
    for c in $(parse_multi "$comps"); do
      [ "$c" = "$first" ] && continue
      if manifest_find theme "$c" >/dev/null 2>&1; then THEMES+=("$c")
      elif manifest_find feature "$c" >/dev/null 2>&1; then FEATURES+=("$c")
      elif [ "$c" = "branding" ]; then BRANDING=1
      fi
    done
  fi
else
  # 非交互检测: 无 tty 且未指定组件时, 明确提示而不是默默用默认值
  if ! tty_available && [ -z "$PACKAGE" ] && [ -z "$CLI_FEATURES" ]; then
    c_err "检测到非交互环境 (无法读取你的键盘输入)。"
    c_err "请使用参数指定要安装的内容, 例如:"
    echo "    curl -sL ... | bash -s -- --package full --yes          # 全家桶"
    echo "    curl -sL ... | bash -s -- --feature jav_details --yes   # 只装 JAV"
    echo "    curl -sL ... | bash -s -- --container emby --feature danmaku,douban"
    echo ""
    c_err "或在终端中直接运行: bash install.sh"
    exit 1
  fi
  # 智能交互模式 (默认)
  c_info "📋 请选择要安装的美化:"
  pick_style      # 自动推荐 + 风格选择
  pick_themes     # 主题多选
  pick_features   # 功能多选
  # 品牌询问
  c_ask "是否配置品牌 LOGO/Favicon? [y/N]: "
  safe_read bsel "N"
  [ "$bsel" = "y" ] || [ "$bsel" = "Y" ] && BRANDING=1
fi

# 汇总
echo ""
c_info "即将执行:"
echo "  📦 容器: $CONTAINER ($IMAGE_TYPE $VER)"
echo "  🎠 轮播: ${STYLE:-无}"
echo "  🎨 主题: ${THEMES[*]:-无}"
echo "  ⚡ 功能: ${FEATURES[*]:-无}"
echo "  🏷️ 品牌: $([ "$BRANDING" = "1" ] && echo '是' || echo '否')"
[ "$ASSUME_YES" = "1" ] || confirm "确认安装?" || die "已取消"

# 执行: 先核心库, 再轮播, 再主题, 再功能
install_component feature "vanvy_core"
[ -n "${STYLE:-}" ] && install_component style "$STYLE"
for t in "${THEMES[@]:-}"; do [ -n "$t" ] && install_component theme "$t"; done
for f in "${FEATURES[@]:-}"; do [ -n "$f" ] && install_component feature "$f"; done
[ "$BRANDING" = "1" ] && install_component branding "branding"

# 持久化
persist_all

echo ""
c_ok "🎉 全部完成! 浏览器 Ctrl+F5 强制刷新查看效果。"
c_warn "提示: 容器重建后美化自动恢复 (持久化钩子已接管)。"
