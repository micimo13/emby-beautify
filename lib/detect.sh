#!/usr/bin/env bash
# =============================================================================
#  Emby 美化引擎 · 环境识别引擎 (detect)
#  ---------------------------------------------------------------------------
#  功能: 自动识别 Emby 容器 / 镜像类型 / Web 目录 / 版本 / 内置美化 / 持久化机制
#  支持镜像: 官方版 (emby/embyserver) / LinuxServer 版 / amilys 社区版 及其他
#  所有路径判断均基于探测结果 $DASHBOARD_DIR，不硬编码。
# =============================================================================

# ── 识别容器 (自动/手动) ──
detect_container() {
  local list i=1
  list=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE "emby" | head -10)
  if [ -z "$list" ]; then
    c_err "未找到运行中的 Emby 容器"
    return 1
  fi
  if [ -z "$CONTAINER" ]; then
    # 自动: 只有一个就选它, 多个让用户选
    local count
    count=$(echo "$list" | wc -l)
    if [ "$count" = "1" ]; then
      CONTAINER="$list"
    else
      c_info "检测到多个 Emby 容器:"
      echo "$list" | nl -w2 -s'] '
      c_ask "选择容器 [1-$count, 默认 1]: "
      safe_read sel "1"
      # 校验输入: 无效(空/非数字/越界)一律回退第 1 个
      sel=$(echo "$sel" | tr -dc '0-9')
      [ -z "$sel" ] && sel="1"
      [ "$sel" -lt 1 ] && sel="1"
      [ "$sel" -gt "$count" ] && sel="1"
      CONTAINER=$(echo "$list" | sed -n "${sel}p")
      c_ok "已选择: $CONTAINER"
    fi
  fi
  docker inspect "$CONTAINER" >/dev/null 2>&1 || { c_err "容器 $CONTAINER 不存在"; return 1; }
}

# ── 识别镜像类型 ──
detect_image() {
  IMAGE_TYPE="unknown"; IMAGE_FULL=""
  IMAGE_FULL=$(docker inspect "$CONTAINER" --format '{{.Config.Image}}' 2>/dev/null)
  case "$IMAGE_FULL" in
    *linuxserver/emby*) IMAGE_TYPE="linuxserver" ;;
    *amilys*)           IMAGE_TYPE="amilys" ;;
    *emby/embyserver*|*embyserver*)
      if echo "$IMAGE_FULL" | grep -qi "amilys\|vanvy"; then
        IMAGE_TYPE="amilys"
      else
        IMAGE_TYPE="official"
      fi
      ;;
    *) IMAGE_TYPE="unknown" ;;
  esac
  echo "$IMAGE_FULL" | grep -qE "vanvy" && [ "$IMAGE_TYPE" = "unknown" ] && IMAGE_TYPE="amilys"
}

# ── 探测 Web 目录 (支持所有镜像布局) ──
detect_dashboard_dir() {
  local d
  for d in /system/dashboard-ui /app/emby/system/dashboard-ui /usr/lib/emby-server/web /opt/emby-server/system/dashboard-ui; do
    if docker exec "$CONTAINER" sh -c "[ -f '$d/index.html' ]" 2>/dev/null; then
      DASHBOARD_DIR="$d"; return 0
    fi
  done
  # 兜底: 递归查找 (覆盖未知布局)
  DASHBOARD_DIR=$(docker exec "$CONTAINER" sh -c "find / -maxdepth 5 -name index.html -path '*dashboard*' 2>/dev/null | head -1 | xargs dirname" 2>/dev/null)
  [ -z "$DASHBOARD_DIR" ] && DASHBOARD_DIR="/system/dashboard-ui" && return 1
  return 0
}

# ── 识别 Emby 版本 (API 优先, 兜底文件) ──
detect_version() {
  VER=""; VER_SRC=""
  # 1. 容器内 API 探测 (不依赖端口映射, host网络也可用)
  local api_ver
  api_ver=$(docker exec "$CONTAINER" sh -c "curl -s --max-time 5 'http://127.0.0.1:8096/emby/System/Info/Public' 2>/dev/null | grep -oE '\"Version\":\"[^\"]+\"' | cut -d'\"' -f4" 2>/dev/null)
  if [ -z "$api_ver" ]; then
    api_ver=$(docker exec "$CONTAINER" sh -c "wget -qO- --timeout=5 'http://127.0.0.1:8096/emby/System/Info/Public' 2>/dev/null | grep -oE '\"Version\":\"[^\"]+\"' | cut -d'\"' -f4" 2>/dev/null)
  fi
  if [ -n "$api_ver" ]; then
    VER="$api_ver"; VER_SRC="api"
  else
    # 2. 兜底: 宿主机端口映射探测
    local port
    port=$(docker port "$CONTAINER" 2>/dev/null | grep -E "^8096/tcp" | head -1 | grep -oE '[0-9]+$' | head -1)
    if [ -n "$port" ]; then
      api_ver=$(curl -s --max-time 5 "http://127.0.0.1:$port/emby/System/Info/Public" 2>/dev/null | grep -oE '"Version":"[^"]+"' | cut -d'"' -f4)
      [ -n "$api_ver" ] && { VER="$api_ver"; VER_SRC="api"; }
    fi
  fi
  if [ -z "$VER" ]; then
    # 3. 兜底: app.js 里的版本号 (4.x.y.z)
    VER=$(docker exec "$CONTAINER" sh -c "grep -oE '4\.[0-9]+\.[0-9]+\.[0-9]+' '$DASHBOARD_DIR/app.js' 2>/dev/null | head -1" 2>/dev/null)
    [ -n "$VER" ] && VER_SRC="app.js"
  fi
  # 提取主版本号
  case "$VER" in
    4.8*) VER_MAJOR="4.8" ;;
    4.9*) VER_MAJOR="4.9" ;;
    4.10*) VER_MAJOR="4.10" ;;
    *) VER_MAJOR="" ;;
  esac
}

# ── 检测镜像内置美化 (避免冲突) ──
detect_builtin() {
  BUILTIN_CRX=0; BUILTIN_DANMAKU=0; BUILTIN_EXTJS=0
  docker exec "$CONTAINER" sh -c "grep -q 'emby-crx/main.js' '$DASHBOARD_DIR/index.html'" 2>/dev/null && BUILTIN_CRX=1
  docker exec "$CONTAINER" sh -c "grep -q 'danmaku.min.js' '$DASHBOARD_DIR/index.html'" 2>/dev/null && BUILTIN_DANMAKU=1
  docker exec "$CONTAINER" sh -c "ls '$DASHBOARD_DIR/ext.js' >/dev/null 2>&1" && BUILTIN_EXTJS=1
}

# ── 检测持久化机制 (amilys 有 ext.sh 启动钩子, 官方/lsio 无) ──
detect_ext_hook() {
  EXT_HOOK=0
  if docker exec "$CONTAINER" sh -c "[ -f /config/config/ext.sh ]" 2>/dev/null; then
    EXT_HOOK=1
  fi
}

# ── 环境就绪检查 (安装前调用, 简洁输出) ──
run_health_check() {
  detect_container || return 1
  detect_image
  detect_dashboard_dir || true
  detect_version
  detect_builtin
  detect_ext_hook
  c_ok "✓ 环境就绪: $CONTAINER ($IMAGE_FULL · Emby $VER)"
}
