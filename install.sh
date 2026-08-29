#!/usr/bin/env bash
# =============================================================================
#  Emby 美化引擎 · 主安装器
#  支持: 本地运行 / curl remote | bash / bash <(curl ...)
#  ---------------------------------------------------------------------------
#  用法:
#    bash install.sh                        # 交互式
#    bash install.sh --container emby      # 指定容器
#    bash install.sh --package movie        # 装组件包
#    bash install.sh --detect-only          # 只检测环境
#    bash install.sh --restore               # 从持久卷恢复 (容器重建后)
# =============================================================================

set -u
# 兼容多种运行方式: 本地 / curl | bash / bash <(curl...)
if [ -n "${BASH_SOURCE[0]:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [ -n "${0:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${0}")" && pwd)"
else
  SCRIPT_DIR="$(pwd)"
fi

# 兼容 curl remote | bash: 自动识别并从远程加载依赖库
SCRIPT_BASE_URL="http://192.168.100.106:18099"
if [ ! -f "$SCRIPT_DIR/lib/common.sh" ] && [ -n "${BASH_SOURCE[0]:-}" ]; then
  # 本地没有 lib 目录，尝试从远程加载
  source <(curl -s "$SCRIPT_BASE_URL/lib/common.sh")
  source <(curl -s "$SCRIPT_BASE_URL/lib/manifest.sh")
  source <(curl -s "$SCRIPT_BASE_URL/lib/detect.sh")
  source <(curl -s "$SCRIPT_BASE_URL/lib/persist.sh")
  SCRIPT_DIR="$(curl -s "$SCRIPT_BASE_URL/" -I 2>/dev/null | grep -i '^content-location' | cut -d' ' -f2 | tr -d '\r')"
  # 如果无法确定目录，使用远程 base
  [ -z "$SCRIPT_DIR" ] && SCRIPT_DIR="$SCRIPT_BASE_URL"
else
  source "$SCRIPT_DIR/lib/common.sh"
  source "$SCRIPT_DIR/lib/manifest.sh"
  source "$SCRIPT_DIR/lib/detect.sh"
  source "$SCRIPT_DIR/lib/persist.sh"
fi

CONTAINER=""; PACKAGE=""; CLI_FEATURES=""; DETECT_ONLY=0; QUICK=0; ASSUME_YES=0
STYLE=""; THEMES=(); FEATURES=(); BRANDING=0; RESTORE=0; AURORA_THEME="aurora"; AURORA_THEME_CLI=0

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift ;;
    --package)   PACKAGE="$2"; shift ;;
    --feature)   CLI_FEATURES="$2"; shift ;;
    --detect-only) DETECT_ONLY=1 ;;
    --restore)   RESTORE=1 ;;
    --quick)     QUICK=1 ;;
    --yes|-y)    ASSUME_YES=1 ;;
    --aurora-theme) AURORA_THEME="$2"; AURORA_THEME_CLI=1; shift ;;
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

  # 版本过滤: 不兼容时自动尝试同类兼容组件 (fallback 链), 保证轮播一定能装上
  if ! manifest_compat "$compat" "$VER_MAJOR" 2>/dev/null; then
    # all 总是兼容
    if [ "$compat" != "all" ] && [ "$type" = "style" ]; then
      # 尝试 fallback: 找同类型且兼容当前版本的其他 style
      local fb_entry="" line
      for line in "${MANIFEST_STYLES[@]}"; do
        local fbid fbc
        fbid="$(manifest_field "$line" 1)"
        fbc="$(manifest_field "$line" 4)"
        [ "$fbid" = "$id" ] && continue
        if [ "$fbc" = "all" ] || echo "$fbc" | tr ',' '\n' | grep -qx "$VER_MAJOR" 2>/dev/null; then
          fb_entry="$line"; break
        fi
      done
      if [ -n "$fb_entry" ]; then
        local fb_id
        fb_id="$(manifest_field "$fb_entry" 1)"
        c_warn "组件 [$name] 不兼容 Emby $VER_MAJOR (需要 $compat)，自动切换为: $(manifest_field "$fb_entry" 3)"
        entry="$fb_entry"; id="$fb_id"; name="$(manifest_field "$entry" 3)"
        compat="$(manifest_field "$entry" 4)"
        resdir="$(manifest_resdir "$entry")"
        zone="$(manifest_zone "$entry")"
      else
        c_warn "组件 [$name] 不兼容 Emby $VER_MAJOR (需要 $compat)，且无兼容替代，跳过"
        return 0
      fi
    elif [ "$compat" != "all" ]; then
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
      # 推轮播策展组件 (rules-loader 必须在 banner 之前注入, 供策展规则使用)
      if [ -d "$SCRIPT_DIR/components/home/carousel_rules" ]; then
        push_assets "$SCRIPT_DIR/components/home/carousel_rules" "$DASHBOARD_DIR/vanvy/carousel_rules" || return 1
      fi
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
    loading)
      # 预热加载: 推 CSS 到 vanvy/loading/<id>/, JS 推 vanvy/loading/<id>/
      docker exec "$CONTAINER" sh -c "mkdir -p '$DASHBOARD_DIR/vanvy/loading/$id'" 2>/dev/null
      # 推 CSS
      for f in "$SCRIPT_DIR/$resdir"/*.css; do
        [ -f "$f" ] && docker cp "$f" "$CONTAINER:$DASHBOARD_DIR/vanvy/loading/$id/" 2>/dev/null
      done
      # 推 JS 激活脚本
      if [ -f "$SCRIPT_DIR/components/loading/loading.js" ]; then
        docker cp "$SCRIPT_DIR/components/loading/loading.js" "$CONTAINER:$DASHBOARD_DIR/vanvy/loading/loading.js" 2>/dev/null
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
  # 轮播类组件: 把 rules-loader 注入行排在 banner 脚本之前 (策展规则优先加载)
  if [ "$type" = "style" ] && [ -d "$SCRIPT_DIR/components/home/carousel_rules" ]; then
    printf '%s\n' '<script src="vanvy/carousel_rules/rules-loader.js"></script>' >> "$inject"
  fi
  while IFS= read -r line; do
    [ -n "$line" ] && printf '%s\n' "$line" >> "$inject"
  done <<< "$(manifest_inject_lines "$entry")"
  # 主题: 追加 html class 激活 script
  [ -n "${THEME_ACTIVATE:-}" ] && printf '%s\n' "$THEME_ACTIVATE" >> "$inject" && THEME_ACTIVATE=""

  # 自研轮播款 (AURORA/split/cinema): 追加主题色 class 激活 script
  # banner-aurora.js 从 body/html class 读取 vanvy-aurora-theme-<name>, 默认 aurora
  case "$id" in
    banner_aurora|banner_split|banner_cinema)
      printf '%s\n' "<script>document.documentElement.classList.add('vanvy-aurora-theme-$AURORA_THEME');</script>" >> "$inject"
      ;;
  esac

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

# ── 菜单: 自研轮播主题色 (AURORA/split/cinema 专用) ──
# 6 套色卡与 style.css 的 .vanvy-aurora-theme-* 对应
AURORA_THEME_NAMES=(aurora emerald sakura gold ocean midnight)
AURORA_THEME_LABELS=("蓝紫极光" "青绿" "粉紫" "暖金" "深海" "黑金")

pick_aurora_theme() {
  # CLI 已显式指定或非交互模式 (--yes) 则跳过询问, 用默认/指定值
  [ "$AURORA_THEME_CLI" = "1" ] && return 0
  [ "$ASSUME_YES" = "1" ] && return 0
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  🌌 自研轮播主题色 (6 选 1)                            │"
  local i=1
  for label in "${AURORA_THEME_LABELS[@]}"; do
    printf '  │     [%d] %-14s %s\n' "$i" "$label" "$([ "$i" = "1" ] && echo '(默认)')"
    i=$((i+1))
  done
  echo "  └─────────────────────────────────────────────────────────┘"
  c_ask "选择主题色 [1-6, 默认 1 蓝紫极光]: "
  safe_read acsel "1"; acsel="${acsel:-1}"
  if echo "$acsel" | grep -qE '^[0-9]+$' && [ "$acsel" -ge 1 ] && [ "$acsel" -le "${#AURORA_THEME_NAMES[@]}" ]; then
    AURORA_THEME="${AURORA_THEME_NAMES[$((acsel-1))]}"
  fi
  c_ok "主题色: ${AURORA_THEME_LABELS[$((acsel-1))]} ($AURORA_THEME)"
}

# 校验 CLI 传入的主题名合法 (非法则回落默认)
validate_aurora_theme() {
  local name="$1" i
  for i in "${AURORA_THEME_NAMES[@]}"; do
    [ "$i" = "$name" ] && return 0
  done
  c_warn "未知主题色: $name, 使用默认 aurora"
  AURORA_THEME="aurora"
  return 1
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
pick_loading() {
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  🎬 预热加载 Loading (可多选, 独立于轮播)              │"
  local i=1 line LOADING_CHOICES=()
  for line in "${MANIFEST_LOADING[@]}"; do
    printf '  │     [%2d] %-44s\n' "$i" "$(manifest_field "$line" 3) - $(manifest_field "$line" 5)"
    LOADING_CHOICES+=("$(manifest_field "$line" 1)")
    i=$((i+1))
  done
  echo "  └─────────────────────────────────────────────────────────┘"
  echo "  💡 提示: 选择后会显示 Loading 预热动画，多选仅首个生效"
  c_ask "选择 (如: 1,2; 0=不装): "
  safe_read lsel "0"
  LOADING_ENABLED=()
  if [ -n "$lsel" ] && [ "$lsel" != "0" ]; then
    local pick
    for pick in $(parse_multi "$lsel"); do
      if echo "$pick" | grep -qE '^[0-9]+$' && [ "$pick" -ge 1 ] && [ "$pick" -le "${#LOADING_CHOICES[@]}" ]; then
        LOADING_ENABLED+=("${LOADING_CHOICES[$((pick-1))]}")
      fi
    done
  fi
}

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

# ── 外部插件冲突预检 (吸收 Quick-Deployment 互斥经验) ──
# 检测 index.html 中是否已存在常见社区插件注入, 避免功能重复/样式冲突
detect_external_conflicts() {
  c_info "🔍 外部插件冲突预检..."
  docker exec "$CONTAINER" sh -c "
    INDEX='$DASHBOARD_DIR/index.html'
    [ -f \"\$INDEX\" ] || exit 0
    found=0
    # 1. emby-crx 界面美化 (Nolovenodie)
    if grep -q 'emby-crx/main.js' \"\$INDEX\" 2>/dev/null; then
      echo '  ⚠️ [emby-crx] 已安装 (Nolovenodie/emby-crx)'
      echo '     与 Vanvy 主题/轮播同为全站皮肤改造, 建议先卸载 emby-crx 再安装本 Kit'
      found=1
    fi
    # 2. dd-danmaku 弹幕 (排除 Kit 自身 vanvy/ 注入)
    if grep -qi 'dd-danmaku\\|danmaku.min.js' \"\$INDEX\" 2>/dev/null; then
      echo '  ⚠️ [dd-danmaku] 已检测到弹幕插件注入'
      echo '     与本 Kit 内置弹幕功能重复, 二选一 (Kit 内可装可卸)'
      found=1
    fi
    # 3. embyExternalUrl 外部播放器
    if grep -qi 'embyExternalUrl\\|externalPlayer' \"\$INDEX\" 2>/dev/null; then
      echo '  ⚠️ [embyExternalUrl] 已检测到外部播放器插件'
      echo '     与本 Kit 第三方播放器功能重复, 二选一'
      found=1
    fi
    # 4. Emby-Home-Swiper / 其他轮播 (sohag1192 等)
    if grep -qi 'home-swiper\\|homeSwiper\\|SN FTP SERVER' \"\$INDEX\" 2>/dev/null; then
      echo '  ⚠️ [Home-Swiper] 已检测到其他首页轮播插件'
      echo '     轮播组件互斥: 只能保留一个, 否则双轮播样式错乱'
      found=1
    fi
    # 5. heichaowo Emby-Fluent
    if grep -qi 'heicha-banner\\|heichaowo' \"\$INDEX\" 2>/dev/null; then
      echo '  ⚠️ [Emby-Fluent] 已检测到 heichaowo 美化注入'
      echo '     与本 Kit Fluent 轮播同源, 二选一'
      found=1
    fi
    # 6. emby-crx-tool / 其他工具
    if grep -qi 'emby-crx-tool' \"\$INDEX\" 2>/dev/null; then
      echo '  ⚠️ [emby-crx-tool] 已检测到其他美化工具'
      found=1
    fi
    # 7. 群晖 Emby 脚本集 (HomeSwiper / extrafanart)
    if grep -qi 'mySwiper\\|swiperLibraryAccess' \"\$INDEX\" 2>/dev/null; then
      echo '  ⚠️ [HomeSwiper] 已检测到群晖 HomeSwiper 轮播 (与 Kit 轮播同占首页首位)'
      echo '     两者冲突: 请先卸载群晖 HomeSwiper, 或用 Kit 轮播替换'
      found=1
    fi
    if grep -qi 'jv-video-player\\|extraFanartStartIndex\\|jv-image-container' \"\$INDEX\" 2>/dev/null; then
      echo '  ⚠️ [群晖脚本集] 已检测到 extrafanart 注入 (Kit 有更完整版 detail_extra)'
      echo '     功能重复: 建议卸载群晖 extrafanart, 用 Kit 的 detail_extra 替代'
      found=1
    fi
    if [ \"\$found\" = \"0\" ]; then
      echo '  ✅ 未检测到外部插件冲突, 环境干净'
    else
      echo '  💡 检测到以上外部插件, 如遇样式/功能异常请先卸载对应插件'
    fi
  " 2>&1 | sed 's/^/    /'
}

# ── 外部信息配置 (安装后询问: JAV/弹幕/详情增强) ──
# 交互模式询问用户是否填写外部信息/开关; 非交互(--yes/管道)自动跳过用默认
configure_external_info() {
  # 非交互模式直接跳过 (用默认配置)
  [ "$ASSUME_YES" = "1" ] && return 0
  ! tty_available && return 0

  # 检测已安装的组件
  local has_jav=0 has_danmaku=0 has_detail=0
  local f
  for f in "${FEATURES[@]:-}"; do
    case "$f" in
      jav_details) has_jav=1 ;;
      danmaku) has_danmaku=1 ;;
      detail_extra) has_detail=1 ;;
    esac
  done
  [ "$has_jav$has_danmaku$has_detail" = "000" ] && return 0

  echo ""
  c_info "⚙️ 以下组件支持可选外部配置 (不填则用默认, 随时可跳过):"

  # ── JAV 增强: config.json (JavDB SecretKey / OpenAI Key) ──
  if [ "$has_jav" = "1" ]; then
    echo ""
    c_info "🔞 JAV 增强: 可填写 JavDB 密钥(刮削/短评) 和 OpenAI Key(翻译)"
    if confirm "是否填写 JavDB SecretKey? (用于刮削/短评)"; then
      c_ask "  JavDB SecretKey: "
      local javdb_key=""
      read_from_user javdb_key
      [ -n "$javdb_key" ] && write_jav_config "$javdb_key" ""
    fi
    if confirm "是否填写 OpenAI API Key? (用于翻译)"; then
      c_ask "  OpenAI API Key: "
      local openai_key=""
      read_from_user openai_key
      [ -n "$openai_key" ] && write_jav_config "" "$openai_key"
    fi
    c_warn "  提示: 也可稍后编辑容器内 $DASHBOARD_DIR/vanvy/features/jav_details/config.json 补充"
  fi

  # ── 弹幕: Bangumi Token (UI 面板) ──
  if [ "$has_danmaku" = "1" ]; then
    echo ""
    c_info "💬 弹幕: 弹幕功能开箱即用 (弹弹play 源), 无需配置"
    if confirm "是否查看 Bangumi Token 配置说明? (仅用于单集收藏同步, 可选)"; then
      echo "    Bangumi Access Token: 打开 https://next.bgm.tv/demo/access-token 生成"
      echo "    在 Emby 播放页弹幕设置面板中粘贴即可 (存浏览器本地)"
    fi
  fi

  # ── 详情增强: JavDB 短评开关 ──
  if [ "$has_detail" = "1" ]; then
    echo ""
    c_info "🖼️ 详情增强: 剧照/预告片/相似影片开箱即用; JavDB 短评需账号默认关闭"
    if confirm "是否启用 JavDB 短评? (需要 JavDB 账号, 首次使用时页面弹窗输入)"; then
      docker exec "$CONTAINER" sh -c "sed -i 's/enableJavdbReviews = false/enableJavdbReviews = true/' '$DASHBOARD_DIR/vanvy/features/detail_extra/extrafanart-trailers.js'" 2>/dev/null \
        && c_ok "✅ JavDB 短评已启用 (首次点击短评按钮时输入账号密码)"
    fi
  fi
  echo ""
}

# 写入 JAV config.json (保留已有字段, 只更新传入的 key)
write_jav_config() {
  local javdb="$1" openai="$2"
  local cfg_local="/tmp/vanvy-jav-config.json"
  docker exec "$CONTAINER" sh -c "cat '$DASHBOARD_DIR/vanvy/features/jav_details/config.json' 2>/dev/null" > "$cfg_local" 2>/dev/null
  if [ ! -s "$cfg_local" ]; then
    echo '{"adminUserId": "", "openaiApiKey": "", "javdbSecretKey": "", "nameMap": {}}' > "$cfg_local"
  fi
  python3 - "$javdb" "$openai" "$cfg_local" << 'PYEOF'
import json, sys
javdb, openai, path = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    cfg = json.load(open(path, encoding='utf-8'))
except Exception:
    cfg = {"adminUserId": "", "openaiApiKey": "", "javdbSecretKey": "", "nameMap": {}}
if openai: cfg['openaiApiKey'] = openai
if javdb: cfg['javdbSecretKey'] = javdb
json.dump(cfg, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
PYEOF
  docker cp "$cfg_local" "$CONTAINER:$DASHBOARD_DIR/vanvy/features/jav_details/config.json" 2>/dev/null \
    && c_ok "✅ JAV config.json 已更新 (JavDB密钥:${javdb:+已填} OpenAI:${openai:+已填})" \
    || c_warn "⚠️ config.json 写入失败, 请手动编辑容器内文件"
  rm -f "$cfg_local"
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
  backup_index_pristine
  install_component feature "vanvy_core"
  [ -n "${STYLE:-}" ] && install_component style "$STYLE"
  for t in "${THEMES[@]:-}"; do [ -n "$t" ] && install_component theme "$t"; done
  for f in "${FEATURES[@]:-}"; do [ -n "$f" ] && install_component feature "$f"; done
  # 外部信息配置询问 (JAV/弹幕/详情增强)
  configure_external_info
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
    # 组件名列表用逗号分割 (parse_multi 只处理数字, 不适用)
    IFS=',' read -ra comp_arr <<< "$comps"
    for c in "${comp_arr[@]}"; do
      c="$(echo "$c" | tr -d ' ')"
      [ -z "$c" ] && continue
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
  # 自研轮播款 → 询问主题色 (CLI/非交互跳过)
  case "$STYLE" in
    banner_aurora|banner_split|banner_cinema)
      validate_aurora_theme "$AURORA_THEME"
      pick_aurora_theme
      ;;
  esac
  pick_themes     # 主题多选
  pick_features   # 功能多选
  pick_loading    # 预热加载 (独立选择)
  # 品牌询问
  c_ask "是否配置品牌 LOGO/Favicon? [y/N]: "
  safe_read bsel "N"
  [ "$bsel" = "y" ] || [ "$bsel" = "Y" ] && BRANDING=1
fi

# 汇总
echo ""
c_info "即将执行:"
# 统一校验主题色名 (CLI/包模式也生效)
case "$STYLE" in
  banner_aurora|banner_split|banner_cinema) validate_aurora_theme "$AURORA_THEME" ;;
esac
echo "  📦 容器: $CONTAINER ($IMAGE_TYPE $VER)"
echo "  🎠 轮播: ${STYLE:-无}"
case "$STYLE" in
  banner_aurora|banner_split|banner_cinema) echo "  🌌 轮播色: $AURORA_THEME" ;;
esac
echo "  🎨 主题: ${THEMES[*]:-无}"
echo "  ⚡ 功能: ${FEATURES[*]:-无}"; echo "  🎬 Loading: ${LOADING_ENABLED[*]:-无}"
echo "  🏷️ 品牌: $([ "$BRANDING" = "1" ] && echo '是' || echo '否')"
[ "$ASSUME_YES" = "1" ] || confirm "确认安装?" || die "已取消"

# 外部插件冲突预检 (确认后、执行前)
detect_external_conflicts

# 执行: 先核心库, 再轮播, 再主题, 再功能
# 出厂原始备份: 仅当未美化时备份 pristine 版本 (时间戳备份栈)
backup_index_pristine
install_component feature "vanvy_core"
[ -n "${STYLE:-}" ] && install_component style "$STYLE"
for t in "${THEMES[@]:-}"; do [ -n "$t" ] && install_component theme "$t"; done
for f in "${FEATURES[@]:-}"; do [ -n "$f" ] && install_component feature "$f"; done
for l in "${LOADING_ENABLED[@]:-}"; do [ -n "$l" ] && install_component loading "$l"; done
[ "$BRANDING" = "1" ] && install_component branding "branding"

# 外部信息配置询问 (JAV/弹幕/详情增强)
configure_external_info

# 持久化
persist_all

echo ""
c_ok "🎉 全部完成! 浏览器 Ctrl+F5 强制刷新查看效果。"
c_warn "提示: 容器重建后美化自动恢复 (持久化钩子已接管)。"
