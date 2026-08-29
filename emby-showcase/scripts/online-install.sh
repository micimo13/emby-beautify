#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby Showcase · 本地部署脚本 (V1 方法)
#  ---------------------------------------------------------------------------
#  用途: 把 11 套全新前端效果图推入目标 Emby 容器, 浏览器访问
#        http://<NAS-IP>:<端口>/web/showcase/ 查看全部效果
#  用法:
#    curl -sL https://emby-beautify.vanvy.top/emby-showcase/scripts/online-install.sh | bash
#  或 (指定容器):
#    bash online-install.sh --container emby-showcase
# =============================================================================
set -e

PKG_URL="https://emby-beautify.vanvy.top/emby-showcase/emby-showcase.tar.gz"
CONTAINER=""
TMP="/tmp/vanvy-showcase-install"

# ── 参数 ──
while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift ;;
    -y|--yes) ASSUME_YES=1 ;;
    *) ;;
  esac
  shift
done

# ── 颜色 ──
c_ok()  { echo -e "\033[1;32m[成功]\033[0m $1"; }
c_err() { echo -e "\033[1;31m[错误]\033[0m $1"; }
c_info(){ echo -e "\033[1;36m[信息]\033[0m $1"; }

# ── 安全读取输入 (V1 同款: 管道模式下从 /dev/tty 读, 支持 curl|bash 交互) ──
tty_available() {
  ( exec 3<> /dev/tty ) 2>/dev/null
}
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


c_ask() { echo -en "\033[1;33m[询问]\033[0m $1"; }

# ── Banner ──
echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  🎨 Vanvy Emby Showcase · 全新前端效果展示               ║"
echo "  ║  5 套架构 × 11 套配色 · 概念稿一键部署                   ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

# ── 检查 docker ──
command -v docker >/dev/null 2>&1 || { c_err "未检测到 docker"; exit 1; }

# ── 选择容器 ──
if [ -z "$CONTAINER" ]; then
  # 列出 emby 容器
  MAPFILE=()
  while IFS= read -r line; do
    [ -n "$line" ] && MAPFILE+=("$line")
  done < <(docker ps --format '{{.Names}} {{.Image}}' | grep -i emby || true)
  if [ ${#MAPFILE[@]} -eq 0 ]; then
    c_err "未找到 Emby 容器, 请先创建 (docker run -d --name emby-test -p 8099:8096 amilys/embyserver)"
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

# ── 容器存在性检查 ──
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  c_err "容器 $CONTAINER 不存在, 请先创建"
  c_info "创建示例: docker run -d --name emby-test -p 8099:8096 -v /mnt/user/media:/media amilys/embyserver"
  exit 1
fi
c_ok "容器存在: $CONTAINER"


# ── 找 dashboard 路径 ──
c_info "识别 dashboard 路径..."
DASH=""
for p in /system/dashboard-ui /app/emby/system/dashboard-ui /opt/emby-server/system/dashboard-ui; do
  if docker exec "$CONTAINER" sh -c "[ -d '$p' ]" 2>/dev/null; then
    DASH="$p"; break
  fi
done
[ -z "$DASH" ] && { c_err "无法识别 dashboard-ui 路径"; exit 1; }
c_ok "dashboard-ui: $DASH"

# ── 下载包 ──
echo ""
c_info "下载 Vanvy Showcase 包..."
rm -rf "$TMP" && mkdir -p "$TMP"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL --connect-timeout 15 --max-time 60 -o "$TMP/showcase.tar.gz" "$PKG_URL" || { c_err "下载失败"; exit 1; }
else
  wget -q -T 60 -O "$TMP/showcase.tar.gz" "$PKG_URL" || { c_err "下载失败"; exit 1; }
fi
c_ok "下载完成 ($(du -h "$TMP/showcase.tar.gz" | cut -f1))"

# ── 解压 + 推送 ──
c_info "解压并推入容器..."
tar xzf "$TMP/showcase.tar.gz" -C "$TMP"
docker exec "$CONTAINER" sh -c "mkdir -p '$DASH/vanvy-showcase'" 2>/dev/null
docker cp "$TMP/showcase/." "$CONTAINER:$DASH/vanvy-showcase/" 2>/dev/null

# ── 验证 ──
FILES=$(docker exec "$CONTAINER" sh -c "find '$DASH/vanvy-showcase' -type f 2>/dev/null | wc -l")
if [ "$FILES" -gt 0 ]; then
  c_ok "已推入 $FILES 个文件 → $DASH/vanvy-showcase/"
else
  c_err "推送失败 (0 文件)"
  exit 1
fi

# ── 输出访问地址 ──
# 端口识别: 找 8096/tcp 的宿主端口
PORT=$(docker port "$CONTAINER" 8096/tcp 2>/dev/null | head -1 | grep -o '[0-9]*$')
[ -z "$PORT" ] && PORT=8096
c_info "访问地址:"
echo ""
echo "  🌐 效果总览: http://<NAS-IP>:${PORT:-8096}/web/vanvy-showcase/index.html"
echo "  🌐 直接预览: http://<NAS-IP>:${PORT:-8096}/web/vanvy-showcase/noir-gold.html"
echo ""
c_ok "🎉 部署完成! 浏览器打开上面的地址查看 11 套全新前端效果"
