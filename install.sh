#!/usr/bin/env bash
# =============================================================================
#  Emby 美化全家桶 · 一键安装向导 v3 (manifest 驱动)
#  ---------------------------------------------------------------------------
#  🎨 整体设计 (前端工程师视角):
#    ┌────────────────────────────────────────────────────────┐
#    │  install.sh (向导)                                    │
#    │    ├─ 容器发现 → 版本识别 (4级) → dashboard路径探测     │
#    │    ├─ 插件市场 (lib/manifest.sh 注册表驱动)            │
#    │    │    ├─ 首页美化 style  (按版本过滤+推荐)           │
#    │    │    ├─ CSS主题 theme   (12款, 可多选)              │
#    │    │    └─ 功能增强 feature (12个, 可多选)             │
#    │    ├─ 注入引擎 (lib/common.sh)                        │
#    │    │    ├─ 资源推送 docker cp                         │
#    │    │    └─ awk 注入 </head> + 备份 + 幂等             │
#    │    └─ 验证 + 收尾                                     │
#    └────────────────────────────────────────────────────────┘
#  用法:
#     在线安装 (推荐):
#       curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash
#       curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash -s -- --quick
#     本地:
#       bash install.sh                    # 交互式向导
#       bash install.sh --quick            # 快速模式 (自动推荐, 无需交互)
#       bash install.sh --detect-only      # 只检测
#       bash install.sh --dry-run          # 演练
#       bash install.sh --container emby   # 指定容器
#       bash install.sh --port 8096        # 指定 API 端口
#  作者: 虾子🦐 (for Marnie✨✨🎊)
# =============================================================================

set -u
# SCRIPT_DIR 兜底: 支持 本地运行 / curl|bash 管道 / 在线安装器调用
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR="$(pwd)"
  # 管道运行时可能不在项目目录，尝试定位
  for d in "$PWD" "$PWD/emby-beautify" "$HOME/emby-beautify" /tmp/emby-beautify-main /tmp/emby-beautify; do
    [ -f "$d/lib/common.sh" ] && SCRIPT_DIR="$d" && break
  done
fi
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/manifest.sh"

DRY_RUN=0; DETECT_ONLY=0; QUICK=0; CONTAINER=""; API_PORT=""; CLI_FEATURES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)      DRY_RUN=1; c_warn "演练模式: 只打印将执行的命令，不实际修改。" ;;
    --detect-only)  DETECT_ONLY=1 ;;
    --quick)        QUICK=1 ;;
    --feature)      CLI_FEATURES+=("$2"); shift ;;
    --container)    CONTAINER="$2"; shift ;;
    --port)         API_PORT="$2"; shift ;;
    *)              c_warn "忽略未知参数: $1" ;;
  esac
  shift
done

banner() {
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║   Emby 美化全家桶 v3 · emby-beautify                    ║"
  echo "  ║   首页美化 + CSS主题 + 功能增强  自动识别 4.8/4.9         ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
}

# ─────────────────────────────── 安装执行 ───────────────────────────────

install_manifest_entry() {
  local type="$1" id="$2" entry src_dir dst_dir marker line idx
  entry="$(manifest_find "$type" "$id")" || { c_err "未知组件: $type/$id"; return 1; }

  local name compat desc resdir
  name="$(manifest_field "$entry" 3)"
  compat="$(manifest_field "$entry" 4)"
  resdir="$(manifest_field "$entry" 6)"
  marker="$(manifest_marker "$entry")"
  src_dir="$SCRIPT_DIR/$resdir"

  # 版本过滤（all 或匹配当前版本）
  if ! manifest_compat "$compat" "$VER"; then
    c_warn "组件 [$name] 不兼容当前 Emby $VER (需要 $compat)，跳过"
    return 0
  fi

  # 资源检查
  if [ "$type" = "theme" ]; then
    [ -f "$src_dir" ] || { c_warn "主题文件缺失: $src_dir，跳过"; return 0; }
  else
    [ -d "$src_dir" ] || { c_warn "资源目录缺失: $src_dir，跳过"; return 0; }
  fi

  # ── 样式互斥: style 只能装一个 ──
  if [ "$type" = "style" ]; then
    local other_style=""
    while IFS= read -r sline; do
      [ "$(manifest_field "$sline" 1)" = "$id" ] && continue
      local smarker
      smarker="$(manifest_marker "$sline")"
      if docker exec "$CONTAINER" sh -c "grep -qF '$smarker' '$DASHBOARD_DIR/index.html'" 2>/dev/null; then
        other_style="$(manifest_field "$sline" 3)"
        break
      fi
    done < <(manifest_list style)
    if [ -n "$other_style" ]; then
      c_warn "检测到首页美化 [$other_style] 已安装，样式互斥（只能装一个）。"
      c_warn "请先卸载已有美化再安装 [$name]。跳过 [$name]。"
      return 0
    fi
  fi

  # ── 冲突检测: conflicts 中已安装的组件 ──
  local conflicts
  conflicts="$(manifest_conflicts "$entry")"
  if [ -n "$conflicts" ]; then
    local cid ctype centry cmarker answer
    for cid in $(echo "$conflicts" | tr ',' ' '); do
      [ -z "$cid" ] && continue
      ctype="feature"
      case "$cid" in
        *:style) ctype="style"; cid="${cid%:style}" ;;
        *:theme) ctype="theme"; cid="${cid%:theme}" ;;
      esac
      centry="$(manifest_find "$ctype" "$cid" 2>/dev/null)" || continue
      cmarker="$(manifest_marker "$centry")"
      if docker exec "$CONTAINER" sh -c "grep -qF '$cmarker' '$DASHBOARD_DIR/index.html'" 2>/dev/null; then
        c_warn "⚠️ 检测到冲突: [$name] 与已安装的 [$cid] 操作同一页面区域，同时安装可能异常。"
        if [ -t 0 ] || { exec 9<>/dev/tty; } 2>/dev/null; then
          exec 9>&- 2>/dev/null || true
          c_ask "仍要安装 [$name]? [y/N]: "
          safe_read answer "N"
          [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { c_warn "已跳过 [$name]。"; return 0; }
        else
          c_warn "非交互环境，跳过 [$name]（避免冲突）。"
          return 0
        fi
      fi
    done
  fi

  c_info "安装 [$type] $name ..."

  # 1. 资源推送
  case "$type" in
    style)
      dst_dir="/system/dashboard-ui/emby-crx"
      push_assets "$src_dir" "$dst_dir"
      ;;
    theme)
      dst_dir="/system/dashboard-ui/emby-crx"
      docker exec "$CONTAINER" sh -c "mkdir -p '$dst_dir'" 2>/dev/null
      maybe "docker cp $src_dir → $CONTAINER:$dst_dir/$marker"
      [ "${DRY_RUN:-0}" = "0" ] && docker cp "$src_dir" "$CONTAINER:$dst_dir/$marker" 2>/dev/null
      ;;
    feature)
      dst_dir="/system/dashboard-ui/$(manifest_condir "$entry")"
      push_assets "$src_dir" "$dst_dir"
      ;;
  esac

  # 2. 生成注入文件
  local inject_file="/tmp/eb-inject-$id.html"
  : > "$inject_file"
  idx=0
  while IFS= read -r line; do
    [ -n "$line" ] && printf '%s\n' "$line" >> "$inject_file"
  done <<< "$(manifest_inject_lines "$entry")"

  # 3. 注入
  maybe "注入 $name (marker=$marker)"
  if [ "${DRY_RUN:-0}" = "0" ]; then
    docker cp "$inject_file" "$CONTAINER:/tmp/eb-inject.html" 2>/dev/null
    inject_to_index "$marker" "/tmp/eb-inject.html" "$DASHBOARD_DIR/index.html"
    docker exec "$CONTAINER" sh -c 'rm -f /tmp/eb-inject.html' 2>/dev/null
  fi
  rm -f "$inject_file"
  c_ok "✓ [$name] 完成"
}

# ─────────────────────────────── 交互菜单 ───────────────────────────────

pick_style() {
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  【1】首页美化 (按版本推荐)                             │"
  local i=1 line name compat desc
  local def=0 defname=""
  local entries=()
  while IFS= read -r line; do
    name="$(manifest_field "$line" 3)"; compat="$(manifest_field "$line" 4)"; desc="$(manifest_field "$line" 5)"
    if manifest_compat "$compat" "$VER"; then
      printf '  │     [%d] %-28s %s\n' "$i" "$name" "$desc"
      entries+=("$(manifest_field "$line" 1)")
      [ -z "$defname" ] && { def=$i; defname="$(manifest_field "$line" 1)"; }
      i=$((i+1))
    fi
  done < <(manifest_list style)
  printf '  │     [%d] 不装首页美化\n' "$i"
  echo "  └─────────────────────────────────────────────────────────┘"
  c_ask "选择 [1-$i, 默认 $def]: "
  safe_read ssel "$def"; ssel="${ssel:-$def}"
  if [ "$ssel" = "$i" ]; then
    STYLE=""
  elif echo "$ssel" | grep -qE '^[0-9]+$' && [ "$ssel" -ge 1 ] && [ "$ssel" -le "${#entries[@]}" ]; then
    STYLE="${entries[$((ssel-1))]}"
  else
    c_warn "无效输入，默认: $defname"; STYLE="$defname"
  fi
}

pick_themes() {
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  【2】CSS 主题 (可多选, 逗号分隔; 0=不装)               │"
  local i=1 line name desc
  local entries=()
  while IFS= read -r line; do
    name="$(manifest_field "$line" 3)"; desc="$(manifest_field "$line" 5)"
    printf '  │     [%2d] %-26s %s\n' "$i" "$name" "$desc"
    entries+=("$(manifest_field "$line" 1)")
    i=$((i+1))
  done < <(manifest_list theme)
  echo "  └─────────────────────────────────────────────────────────┘"
  c_ask "选择 (如: 1,3,5): "
  safe_read tsel "0"
  THEMES=()
  if [ -n "$tsel" ] && [ "$tsel" != "0" ]; then
    for pick in $(echo "$tsel" | tr ',' ' '); do
      if echo "$pick" | grep -qE '^[0-9]+$' && [ "$pick" -ge 1 ] && [ "$pick" -le "${#entries[@]}" ]; then
        THEMES+=("${entries[$((pick-1))]}")
      else
        c_warn "忽略无效: $pick"
      fi
    done
  fi
}

pick_features() {
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  【3】功能增强 (可多选, 逗号分隔; 0=不装)               │"
  echo "  │                                                         │"
  echo "  │  ⚠️ 注: [1] JAV元数据美化工程 为独立大项，与豆瓣/剧照/  │"
  echo "  │     Tabs/Trailer 互斥，安装时自动检测冲突。             │"
  echo "  │                                                         │"
  local i=1 line name desc
  local entries=()
  while IFS= read -r line; do
    name="$(manifest_field "$line" 3)"; desc="$(manifest_field "$line" 5)"
    printf '  │     [%2d] %-28s %s\n' "$i" "$name" "$desc"
    entries+=("$(manifest_field "$line" 1)")
    i=$((i+1))
  done < <(manifest_list feature)
  echo "  └─────────────────────────────────────────────────────────┘"
  c_ask "选择 (如: 1,3,5): "
  safe_read fsel "0"
  FEATURES=()
  if [ -n "$fsel" ] && [ "$fsel" != "0" ]; then
    for pick in $(echo "$fsel" | tr ',' ' '); do
      if echo "$pick" | grep -qE '^[0-9]+$' && [ "$pick" -ge 1 ] && [ "$pick" -le "${#entries[@]}" ]; then
        FEATURES+=("${entries[$((pick-1))]}")
      else
        c_warn "忽略无效: $pick"
      fi
    done
  fi
}

# ─────────────────────────────── 主流程 ───────────────────────────────

banner
command -v docker >/dev/null 2>&1 || die "未检测到 docker，请在 NAS 宿主机运行。"

# ── 完全无终端检测: 只有既无 stdin 也无 /dev/tty（cron/CI）才强制快速模式 ──
#  curl | bash 时 stdin 是管道但 /dev/tty 存在，仍可交互（safe_read 从 /dev/tty 读）
if [ "$QUICK" != "1" ] && [ ! -t 0 ] && [ ! -e /dev/tty ]; then
  c_warn "检测到完全无终端环境，自动启用快速模式 (--quick)。"
  QUICK=1
fi

[ -z "$CONTAINER" ] && pick_container
c_ok "容器: $CONTAINER"

detect_version
[ "$VER" = "unknown" ] && ask_version_manual
c_info "版本识别: Emby $VER ($VER_SRC)"

detect_dashboard_dir || c_warn "未探测到 dashboard-ui，使用默认 $DASHBOARD_DIR"

if [ "$DETECT_ONLY" = "1" ]; then
  c_ok "检测完成。推荐首页美化: $([ "$VER" = "4.8" ] && echo "emby-crx / emby-fluent" || echo "emby-home-beautify")"
  exit 0
fi

# ── 快速模式: 自动选推荐配置，无需交互 ──
if [ "$QUICK" = "1" ]; then
  c_info "快速模式: 自动安装推荐配置"
  STYLE=""; THEMES=(); FEATURES=()
  # 推荐首页美化（按版本）
  while IFS= read -r line; do
    compat="$(manifest_field "$line" 4)"
    if manifest_compat "$compat" "$VER"; then
      STYLE="$(manifest_field "$line" 1)"; break
    fi
  done < <(manifest_list style)
  echo "  📦 容器: $CONTAINER (Emby $VER)"
  echo "  🎨 首页美化: $STYLE"
  echo "  🎭 主题: 无 (可用 --quick 后再手动加)"
  echo "  ⚡ 功能: 无 (可用 --quick 后再手动加)"
  [ -n "$STYLE" ] && install_manifest_entry style "$STYLE"
  echo ""
  c_ok "🎉 快速安装完成！浏览器 Ctrl+F5 / Cmd+Shift+R 强制刷新查看效果。"
  c_warn "提示: 需要主题/功能时，再次运行 bash install.sh 选择即可（幂等，不会重复安装）。"
  exit 0
fi

# ── CLI 指定组件模式: --feature <id> 直接安装，跳过交互 ──
if [ "${#CLI_FEATURES[@]}" -gt 0 ]; then
  c_info "CLI 指定组件模式: ${CLI_FEATURES[*]}"
  for fid in "${CLI_FEATURES[@]}"; do
    install_manifest_entry feature "$fid" || c_warn "组件 [$fid] 安装失败或不存在"
  done
  echo ""
  c_ok "🎉 指定组件安装完成！浏览器 Ctrl+F5 / Cmd+Shift+R 强制刷新查看效果。"
  exit 0
fi

pick_style
pick_themes
pick_features

# 汇总确认
echo ""
c_info "即将执行:"
echo "  📦 容器: $CONTAINER (Emby $VER)"
echo "  🎨 首页美化: ${STYLE:-无}"
echo "  🎭 主题: ${THEMES[*]:-无}"
echo "  ⚡ 功能: ${FEATURES[*]:-无}"
c_ask "确认安装? [y/N]: "
safe_read confirm ""
[ "$confirm" = "y" ] || [ "$confirm" = "Y" ] || die "已取消。"

# 执行
[ -n "${STYLE:-}" ] && install_manifest_entry style "$STYLE"
for t in "${THEMES[@]:-}"; do [ -n "$t" ] && install_manifest_entry theme "$t"; done
for f in "${FEATURES[@]:-}"; do [ -n "$f" ] && install_manifest_entry feature "$f"; done

echo ""
c_ok "🎉 全部完成！浏览器 Ctrl+F5 / Cmd+Shift+R 强制刷新查看效果。"
c_warn "提示: Emby 更新镜像/重建容器后需重新运行本脚本。"
exit 0
