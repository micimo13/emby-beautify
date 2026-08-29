#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby · 完整前端替换安装器
#  ---------------------------------------------------------------------------
#  一条命令把 Emby 的整个前端替换成 Vanvy 自研前端 (彻底美化)
#  支持还原: 备份原 index.html/apploader.js, 还原脚本一键恢复
#  用法:
#    curl -sL https://emby-beautify.vanvy.top/emby-showcase/scripts/install.sh | bash
#    bash install.sh --container <名字>     # 指定容器
#    bash uninstall.sh --container <名字>   # 还原
# =============================================================================
set -e

PKG_URL="https://emby-beautify.vanvy.top/emby-showcase/vanvy-app.tar.gz"
CONTAINER=""
TMP="/tmp/vanvy-app-install"
BAK_MARKER="vanvy-frontend-backup"

# ── 颜色 ──
c_ok()  { echo -e "\033[1;32m[成功]\033[0m $1"; }
c_err() { echo -e "\033[1;31m[错误]\033[0m $1"; }
c_info(){ echo -e "\033[1;36m[信息]\033[0m $1"; }
c_ask() { echo -en "\033[1;33m[询问]\033[0m $1"; }

# ── 安全读取 (管道模式也能交互) ──
read_from_user() {
  local var="$1" default="${2:-}" val=""
  if [ -t 0 ]; then
    read -r val
  else
    { read -r val < /dev/tty; } 2>/dev/null || read -r val
  fi
  [ -z "$val" ] && val="$default"
  eval "$var=\"$val\""
}

# ── 参数 ──
while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift ;;
    -y|--yes) ASSUME_YES=1 ;;
  esac
  shift
done

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  🎨 Vanvy Emby · 完整前端替换                            ║"
echo "  ║  一条命令彻底美化整个 Emby 前端 · 支持一键还原           ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

command -v docker >/dev/null 2>&1 || { c_err "未检测到 docker"; exit 1; }

# ── 选择容器 ──
if [ -z "$CONTAINER" ]; then
  MAPFILE=()
  while IFS= read -r line; do
    [ -n "$line" ] && MAPFILE+=("$line")
  done < <(docker ps --format '{{.Names}} {{.Image}}' | grep -i emby || true)
  if [ ${#MAPFILE[@]} -eq 0 ]; then
    c_err "未找到 Emby 容器, 请先创建"
    exit 1
  fi
  echo "[信息] 检测到以下 Emby 容器:"
  i=1
  for c in "${MAPFILE[@]}"; do
    echo "  $i] $c"
    i=$((i+1))
  done
  c_ask "选择容器 [1-${#MAPFILE[@]}]: "
  read_from_user sel 1
  if ! echo "$sel" | grep -qE '^[0-9]+$' || [ "$sel" -lt 1 ] || [ "$sel" -gt "${#MAPFILE[@]}" ]; then
    c_err "无效选择"; exit 1
  fi
  CONTAINER="$(echo "${MAPFILE[$((sel-1))]}" | awk '{print $1}')"
fi
c_ok "已选择: $CONTAINER"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  c_err "容器 $CONTAINER 不存在"; exit 1
fi

# ── 识别 dashboard 路径 ──
c_info "识别 dashboard 路径..."
DASH=""
for p in /system/dashboard-ui /app/emby/system/dashboard-ui /opt/emby-server/system/dashboard-ui; do
  if docker exec "$CONTAINER" sh -c "[ -d '$p' ]" 2>/dev/null; then
    DASH="$p"; break
  fi
done
[ -z "$DASH" ] && { c_err "无法识别 dashboard-ui 路径"; exit 1; }
c_ok "dashboard-ui: $DASH"

INDEX="$DASH/index.html"
APPLOADER="$DASH/apploader.js"
BAK_DIR="$DASH/.vanvy-backup"

# ── 下载包 ──
echo ""
c_info "下载 Vanvy 前端包..."
rm -rf "$TMP" && mkdir -p "$TMP"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL --connect-timeout 15 --max-time 60 -o "$TMP/app.tar.gz" "$PKG_URL" || { c_err "下载失败"; exit 1; }
else
  wget -q -T 60 -O "$TMP/app.tar.gz" "$PKG_URL" || { c_err "下载失败"; exit 1; }
fi
c_ok "下载完成 ($(du -h "$TMP/app.tar.gz" | cut -f1))"
tar xzf "$TMP/app.tar.gz" -C "$TMP"

# ── 备份原前端 (只备份一次, 幂等) ──
c_info "备份原前端..."
docker exec "$CONTAINER" sh -c "mkdir -p '$BAK_DIR'" 2>/dev/null
if docker exec "$CONTAINER" sh -c "[ -f '$BAK_DIR/index.html' ]" 2>/dev/null; then
  c_ok "备份已存在, 跳过 (还原用)"
else
  docker exec "$CONTAINER" sh -c "cp '$INDEX' '$BAK_DIR/index.html' 2>/dev/null; cp '$APPLOADER' '$BAK_DIR/apploader.js' 2>/dev/null; echo done"
  c_ok "原前端已备份 → $BAK_DIR/"
fi

# ── 推送新前端 ──
c_info "部署 Vanvy 前端..."
docker exec "$CONTAINER" sh -c "mkdir -p '$DASH/vanvy-app'" 2>/dev/null
docker cp "$TMP/." "$CONTAINER:$DASH/vanvy-app/" 2>/dev/null
c_ok "前端资源已推入 $DASH/vanvy-app/"

# ── 替换 index.html 加载目标 ──
# 新 index.html 加载 vanvy-app/app.js, 替代原 apploader
cat > "$TMP/index.html" << EOF
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Vanvy · Emby</title>
<link rel="stylesheet" href="vanvy-app/css/app.css">
</head>
<body class="vanvy-app">
<div id="app"></div>
<div id="player-container" class="hidden"></div>
<script src="vanvy-app/js/emby-api.js"></script>
<script src="vanvy-app/js/app.js"></script>
</body>
</html>
EOF
docker cp "$TMP/index.html" "$CONTAINER:$INDEX" 2>/dev/null
c_ok "index.html 已替换 (加载 vanvy-app)"

# ── 验证 ──
FILES=$(docker exec "$CONTAINER" sh -c "find '$DASH/vanvy-app' -type f 2>/dev/null | wc -l")
if [ "$FILES" -gt 0 ]; then
  c_ok "部署完成: $FILES 个前端文件"
else
  c_err "部署失败 (0 文件)"
  exit 1
fi

# ── 输出地址 ──
PORT=$(docker port "$CONTAINER" 8096/tcp 2>/dev/null | head -1 | grep -o '[0-9]*$')
[ -z "$PORT" ] && PORT=8096
echo ""
c_info "访问地址:"
echo "  🌐 http://<NAS-IP>:${PORT}/web/"
echo ""
echo "  ℹ️  提示: 浏览器强制刷新 (Ctrl+F5) 加载新前端"
echo "  ℹ️  还原: curl -sL https://emby-beautify.vanvy.top/emby-showcase/scripts/uninstall.sh | bash -s -- --container $CONTAINER"
echo ""
c_ok "🎉 完成! 整个 Emby 前端已被 Vanvy 替换"
