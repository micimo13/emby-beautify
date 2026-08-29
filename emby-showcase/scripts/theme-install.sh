#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby · 官方主题美化安装器
#  ---------------------------------------------------------------------------
#  在官方 Emby 前端基础上深度美化 (保留全部功能: 播放器/剧集/设置/服务器)
#  - 主题: 注册 Vanvy Noir 进官方 skinManager (theme.json + theme.css)
#  - 轮播: 首页 sections 前注入 hero banner (官方 ApiClient 数据)
#  - 还原: uninstall.sh 一键恢复
#  用法:
#    curl -sL https://emby-beautify.vanvy.top/emby-showcase/scripts/theme-install.sh | bash
# =============================================================================
set -e

PKG_URL="https://emby-beautify.vanvy.top/emby-showcase/vanvy-noir-theme.tar.gz"
CONTAINER=""
TMP="/tmp/vanvy-noir-install"

c_ok()  { echo -e "\033[1;32m[成功]\033[0m $1"; }
c_err() { echo -e "\033[1;31m[错误]\033[0m $1"; }
c_info(){ echo -e "\033[1;36m[信息]\033[0m $1"; }
c_ask() { echo -en "\033[1;33m[询问]\033[0m $1"; }

read_from_user() {
  local var="$1" default="${2:-}" val=""
  if [ -t 0 ]; then read -r val; else { read -r val < /dev/tty; } 2>/dev/null || read -r val; fi
  [ -z "$val" ] && val="$default"
  eval "$var=\"$val\""
}

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift ;;
    -y|--yes) ASSUME_YES=1 ;;
  esac
  shift
done

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  🎨 Vanvy Noir · Emby 官方主题美化                      ║"
echo "  ║  深度美化官方前端 · 全功能保留 · 一键还原               ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

command -v docker >/dev/null 2>&1 || { c_err "未检测到 docker"; exit 1; }

if [ -z "$CONTAINER" ]; then
  MAPFILE=()
  while IFS= read -r line; do
    [ -n "$line" ] && MAPFILE+=("$line")
  done < <(docker ps --format '{{.Names}} {{.Image}}' | grep -i emby || true)
  [ ${#MAPFILE[@]} -eq 0 ] && { c_err "未找到 Emby 容器"; exit 1; }
  echo "[信息] 检测到以下 Emby 容器:"
  i=1
  for c in "${MAPFILE[@]}"; do echo "  $i] $c"; i=$((i+1)); done
  c_ask "选择容器 [1-${#MAPFILE[@]}]: "
  read_from_user sel 1
  echo "$sel" | grep -qE '^[0-9]+$' && [ "$sel" -ge 1 ] && [ "$sel" -le "${#MAPFILE[@]}" ] || { c_err "无效选择"; exit 1; }
  CONTAINER="$(echo "${MAPFILE[$((sel-1))]}" | awk '{print $1}')"
fi
c_ok "已选择: $CONTAINER"
docker inspect "$CONTAINER" >/dev/null 2>&1 || { c_err "容器不存在"; exit 1; }

DASH=""
for p in /system/dashboard-ui /app/emby/system/dashboard-ui /opt/emby-server/system/dashboard-ui; do
  docker exec "$CONTAINER" sh -c "[ -d '$p' ]" 2>/dev/null && DASH="$p" && break
done
[ -z "$DASH" ] && { c_err "无法识别 dashboard-ui 路径"; exit 1; }
c_ok "dashboard-ui: $DASH"

# ── 下载包 ──
c_info "下载 Vanvy Noir 主题包..."
rm -rf "$TMP" && mkdir -p "$TMP"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL --connect-timeout 15 --max-time 60 -o "$TMP/theme.tar.gz" "$PKG_URL" || { c_err "下载失败"; exit 1; }
else
  wget -q -T 60 -O "$TMP/theme.tar.gz" "$PKG_URL" || { c_err "下载失败"; exit 1; }
fi
c_ok "下载完成 ($(du -h "$TMP/theme.tar.gz" | cut -f1))"
tar xzf "$TMP/theme.tar.gz" -C "$TMP"

# ── 备份 (幂等) ──
BAK="$DASH/.vanvy-noir-backup"
docker exec "$CONTAINER" sh -c "mkdir -p '$BAK'" 2>/dev/null
if ! docker exec "$CONTAINER" sh -c "[ -f '$BAK/skinmanager.js' ]" 2>/dev/null; then
  docker exec "$CONTAINER" sh -c "cp '$DASH/modules/skinmanager.js' '$BAK/skinmanager.js' 2>/dev/null; cp '$DASH/index.html' '$BAK/index.html' 2>/dev/null; echo backed"
  c_ok "原文件已备份"
else
  c_ok "备份已存在, 跳过"
fi

# ── 1. 部署主题 (themes/vanvy_noir/) ──
c_info "部署 Vanvy Noir 主题..."
docker exec "$CONTAINER" sh -c "mkdir -p '$DASH/modules/themes/vanvy_noir'" 2>/dev/null
docker cp "$TMP/themes/vanvy_noir/theme.json" "$CONTAINER:$DASH/modules/themes/vanvy_noir/" 2>/dev/null
docker cp "$TMP/themes/vanvy_noir/theme.css" "$CONTAINER:$DASH/modules/themes/vanvy_noir/" 2>/dev/null
c_ok "主题文件已推入 modules/themes/vanvy_noir/"

# ── 2. 注册进 skinManager (AllThemes 数组) ──
c_info "注册主题到 skinManager..."
SKIN="$DASH/modules/skinmanager.js"
if docker exec "$CONTAINER" sh -c "grep -q vanvy_noir '$SKIN'" 2>/dev/null; then
  echo "  已注册, 跳过"
else
  docker cp "$CONTAINER:$SKIN" "$TMP/skinmanager.js" 2>/dev/null
  # 纯 sed 插入 (无 python/node 依赖, 兼容 UNRAID)
  docker cp "$CONTAINER:$SKIN" "$TMP/skinmanager.js" 2>/dev/null
  if grep -q 'vanvy_noir' "$TMP/skinmanager.js" 2>/dev/null; then
    echo "  已注册, 跳过"
  else
    # 在 {name:"Dark" 前插入 Vanvy Noir 条目
    sed -i 's|{name:"Dark"|{name:"Vanvy Noir",id:"vanvy_noir",controller:defaultController,infoPath:"modules/themes/vanvy_noir/theme.json",stylesheets:[{path:"modules/themes/vanvy_noir/theme.css",options:{cssvars:true}},{path:"modules/themes/dark/theme_nontv.css",options:{cssvars:true,tv:false}},{path:"modules/themes/dark/theme_tv.css",options:{cssvars:true,tv:true}}]},{name:"Dark"|' "$TMP/skinmanager.js"
    if grep -q 'vanvy_noir' "$TMP/skinmanager.js" 2>/dev/null; then
      docker cp "$TMP/skinmanager.js" "$CONTAINER:$SKIN" 2>/dev/null
      echo "  ✓ 已写入容器"
    else
      c_err "注册失败"
      exit 1
    fi
  fi
fi

# ── 3. 部署首页轮播 (hero banner 注入) ──
c_info "部署首页轮播增强..."
docker exec "$CONTAINER" sh -c "mkdir -p '$DASH/vanvy-noir'" 2>/dev/null
docker cp "$TMP/banner/." "$CONTAINER:$DASH/vanvy-noir/" 2>/dev/null
# 注入 loader 到 index.html
docker exec "$CONTAINER" sh -c "
INDEX='$DASH/index.html'
if grep -q 'vanvy-noir/loader' \$INDEX 2>/dev/null; then
  echo 'loader 已注入'
else
  sed -i \"s|<script src=\\\"apploader.js\\\" defer>|<script src=\\\"vanvy-noir/loader.js\\\" defer></script><script src=\\\"apploader.js\\\" defer>|\" \$INDEX
  echo 'loader 已注入'
fi
" 2>&1 | tail -1

# ── 验证 ──
FILES=$(docker exec "$CONTAINER" sh -c "find '$DASH/modules/themes/vanvy_noir' -type f 2>/dev/null | wc -l")
REG=$(docker exec "$CONTAINER" sh -c "grep -c 'vanvy_noir' '$DASH/modules/skinmanager.js' 2>/dev/null")
[ "$FILES" -ge 2 ] && [ "$REG" -ge 1 ] && c_ok "✅ Vanvy Noir 主题已启用 ($FILES 文件, 注册 $REG 处)" || { c_err "部署验证失败"; exit 1; }

PORT=$(docker port "$CONTAINER" 8096/tcp 2>/dev/null | head -1 | grep -o '[0-9]*$')
[ -z "$PORT" ] && PORT=8096
echo ""
c_info "访问: http://<NAS-IP>:${PORT}/web/ → 设置 → 显示 → 主题 → 选 Vanvy Noir"
echo "  ℹ️  还原: curl -sL https://emby-beautify.vanvy.top/emby-showcase/scripts/theme-uninstall.sh | bash -s -- --container $CONTAINER"
echo ""
c_ok "🎉 完成! Emby 全功能保留, 外观变为 Vanvy Noir"
