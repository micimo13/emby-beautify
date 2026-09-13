#!/usr/bin/env bash
# =============================================================================
#  外部服务一键构建（VES 增强所需的后端容器）
#  ---------------------------------------------------------------------------
#  构建内容（全部通过 docker compose，数据落在本目录，可随时删除重建）：
#    · AVDB       —— JavDB 聚合引擎（搜索/短评/图解码）     默认端口 38000
#    · MetaTube   —— JAV 元数据刮削服务（番号/演员/标签）    默认端口 28080
#  两者各自带一个 PostgreSQL（自包含，不依赖你已有的数据库）。
#
#  用法：
#    bash install-external.sh                          # 交互式
#    bash install-external.sh --avdb --metatube        # 两个都装
#    bash install-external.sh --avdb --proxy http://10.0.0.5:1082
#    bash install-external.sh --status                 # 只看状态
#    bash install-external.sh --uninstall              # 停止并删除容器（保留数据）
#    bash install-external.sh --uninstall --purge      # 连数据一起删（不可恢复）
#
#  参数：
#    --avdb              安装 AVDB
#    --metatube          安装 MetaTube
#    --dir <path>        安装目录（默认 ~/vanvy-external）
#    --avdb-port <n>     AVDB 宿主端口（默认 38000）
#    --metatube-port <n> MetaTube 宿主端口（默认 28080）
#    --proxy <url>       出网代理，http:// 或 socks5h://（两个容器都会用；可留空=直连）
#    --no-proxy          明确不回填代理
#    --yes               不询问
# =============================================================================
set -eu

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
ok(){ echo "${C_OK}✅${C_OFF} $*"; }
err(){ echo "${C_ERR}❌${C_OFF} $*"; }
warn(){ echo "${C_WARN}⚠️${C_OFF} $*"; }
info(){ echo "${C_DIM}·${C_OFF} $*"; }

DO_AVDB=0; DO_MT=0; MODE="install"; PURGE=0
DIR="${VANVY_EXTERNAL_DIR:-$HOME/vanvy-external}"
AVDB_PORT="${VANVY_AVDB_PORT:-38000}"
MT_PORT="${VANVY_METATUBE_PORT:-28080}"
PROXY="${VANVY_PROXY_URL:-}"
ASSUME=0

while [ $# -gt 0 ]; do
  case "$1" in
    --avdb) DO_AVDB=1; shift;;
    --metatube) DO_MT=1; shift;;
    --dir) DIR="$2"; shift 2;;
    --avdb-port) AVDB_PORT="$2"; shift 2;;
    --metatube-port) MT_PORT="$2"; shift 2;;
    --proxy) PROXY="$2"; shift 2;;
    --no-proxy) PROXY="__none__"; shift;;
    --status) MODE="status"; shift;;
    --uninstall) MODE="uninstall"; shift;;
    --purge) PURGE=1; shift;;
    --yes|-y) ASSUME=1; shift;;
    -h|--help) sed -n '2,30p' "$0"; exit 0;;
    *) warn "忽略未知参数: $1"; shift;;
  esac
done

# ── docker / compose 探测 ────────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
  DOCKER="docker"
elif command -v sg >/dev/null 2>&1 && sg docker -c "docker version" >/dev/null 2>&1; then
  DOCKER="sg docker -c"
else
  err "未找到可用的 docker（请先安装 / 把当前用户加入 docker 组）"; exit 1
fi
dk(){ if [ "$DOCKER" = "docker" ]; then docker "$@"; else sg docker -c "docker $(printf '%q ' "$@")"; fi; }
if ! dk compose version >/dev/null 2>&1; then
  err "未找到 docker compose 插件（需要 Docker 20.10+ / compose v2）"; exit 1
fi

ask(){ local v="$1" d="$2" r=""; if [ -r /dev/tty ] && [ -t 0 ]; then read -r r </dev/tty 2>/dev/null||r=""; else read -r r 2>/dev/null||r=""; fi; eval "$v=\"\${r:-\$d}\""; }

DATA_DIR="$DIR/data"
mkdir -p "$DATA_DIR" 2>/dev/null || true

# ── 状态 / 卸载 ──────────────────────────────────────────────────────────────
if [ "$MODE" = "status" ]; then
  echo "  安装目录: $DIR"
  for n in vanvy-avdb vanvy-avdb-db vanvy-metatube vanvy-metatube-db; do
    st="$(dk ps -a --filter "name=^/${n}$" --format '{{.Status}}' 2>/dev/null | head -1)"
    printf "  %-20s %s\n" "$n" "${st:-（未安装）}"
  done
  echo
  echo "  端口探测:"
  for p in "$AVDB_PORT" "$MT_PORT"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 4 --noproxy '*' "http://127.0.0.1:$p/" 2>/dev/null || echo 000)"
    printf "    :%-6s HTTP %s\n" "$p" "$code"
  done
  exit 0
fi

if [ "$MODE" = "uninstall" ]; then
  rm -f "$DIR/docker-compose.yml"
  [ -f "$DIR/avdb/docker-compose.yml" ] && dk compose -f "$DIR/avdb/docker-compose.yml" down 2>/dev/null || true
  [ -f "$DIR/metatube/docker-compose.yml" ] && dk compose -f "$DIR/metatube/docker-compose.yml" down 2>/dev/null || true
  ok "已停止并移除外部服务容器"
  if [ "$PURGE" = "1" ]; then
    rm -rf "$DATA_DIR"; ok "已删除数据目录（不可恢复）: $DATA_DIR"
  else
    info "数据保留在: $DATA_DIR （用 --purge 可一并删除）"
  fi
  exit 0
fi

# ── 交互式选择 ───────────────────────────────────────────────────────────────
if [ "$DO_AVDB" = "0" ] && [ "$DO_MT" = "0" ]; then
  echo ""
  echo "  ┌────────────────────────────────────────────────────────────┐"
  echo "  │  🧩 外部增强服务 · 一键构建（docker compose）              │"
  echo "  │    [1] 两个都装（AVDB + MetaTube，推荐）                    │"
  echo "  │    [2] 只装 AVDB（JavDB 搜索/短评/图解码）                  │"
  echo "  │    [3] 只装 MetaTube（番号/演员/标签刮削）                  │"
  echo "  │    [0] 跳过                                                │"
  echo "  └────────────────────────────────────────────────────────────┘"
  ask SEL "1"
  case "$SEL" in 1) DO_AVDB=1; DO_MT=1;; 2) DO_AVDB=1;; 3) DO_MT=1;; 0) exit 0;; *) DO_AVDB=1; DO_MT=1;; esac
fi

# 代理（元数据抓取基本都需要→默认问一次）
if [ -z "$PROXY" ]; then
  echo ""
  echo "  🌐 出网代理（抓取外站需要；留空=直连）"
  echo "     例：http://10.0.0.5:1082   或   socks5h://user:pass@10.0.0.5:1080"
  ask _px ""
  PROXY="$_px"
fi
[ "$PROXY" = "__none__" ] && PROXY=""

# ── 生成 AVDB ────────────────────────────────────────────────────────────────
if [ "$DO_AVDB" = "1" ]; then
  d="$DIR/avdb"; mkdir -p "$d"
  cat > "$d/docker-compose.yml" <<EOF
# Vanvy · AVDB（JavDB 聚合引擎）· 自包含：应用 + 专属 PostgreSQL
services:
  vanvy-avdb-db:
    image: postgres:16-alpine
    container_name: vanvy-avdb-db
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=avdb
    volumes:
      - $DATA_DIR/avdb-db:/var/lib/postgresql/data

  vanvy-avdb:
    image: leolitaly/avdb:latest
    container_name: vanvy-avdb
    restart: unless-stopped
    depends_on:
      - vanvy-avdb-db
    environment:
      - TZ=Asia/Shanghai
      - DATABASE_URL=postgresql://postgres:postgres@vanvy-avdb-db:5432/avdb
      - PROXY=${PROXY}
    ports:
      - "${AVDB_PORT}:8000"
    volumes:
      - $DATA_DIR/avdb:/data
EOF
  info "已生成 $d/docker-compose.yml"
fi

# ── 生成 MetaTube ────────────────────────────────────────────────────────────
if [ "$DO_MT" = "1" ]; then
  d="$DIR/metatube"; mkdir -p "$d"
  cat > "$d/docker-compose.yml" <<EOF
# Vanvy · MetaTube（JAV 元数据刮削）· 自包含：应用 + 专属 PostgreSQL（unix socket 共享）
services:
  vanvy-metatube-db:
    image: postgres:15-alpine
    container_name: vanvy-metatube-db
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
      - POSTGRES_PASSWORD=metatube
      - POSTGRES_DB=metatube
      - POSTGRES_USER=metatube
    command: ["-c","TimeZone=Asia/Shanghai","-c","log_timezone=Asia/Shanghai","-c","listen_addresses=","-c","unix_socket_permissions=0777"]
    volumes:
      - $DATA_DIR/metatube-db:/var/lib/postgresql/data
      - mt_run:/var/run

  vanvy-metatube:
    image: ghcr.io/metatube-community/metatube-server:latest
    container_name: vanvy-metatube
    restart: unless-stopped
    depends_on:
      - vanvy-metatube-db
    environment:
      - GIN_MODE=release
      - PORT=8080
      - HTTP_PROXY=${PROXY}
      - HTTPS_PROXY=${PROXY}
    command: ["-dsn","postgres://metatube:metatube@/metatube?host=/var/run/postgresql","-port","8080","-db-auto-migrate","-db-prepared-stmt"]
    ports:
      - "${MT_PORT}:8080"
    volumes:
      - mt_run:/var/run

volumes:
  mt_run:
EOF
  info "已生成 $d/docker-compose.yml"
fi

# ── 启动 ─────────────────────────────────────────────────────────────────────
[ "$ASSUME" = "1" ] || { ask GO "Y"; case "$GO" in n|N|no|NO) exit 0;; esac; }

if [ "$DO_AVDB" = "1" ]; then
  info "启动 AVDB ..."
  dk compose -f "$DIR/avdb/docker-compose.yml" up -d || err "AVDB 启动失败"
fi
if [ "$DO_MT" = "1" ]; then
  info "启动 MetaTube ..."
  dk compose -f "$DIR/metatube/docker-compose.yml" up -d || err "MetaTube 启动失败"
fi
# ⚠️ compose 偶尔只创建不启动（依赖容器尚在初始化）→ 再 up 一次兜底
sleep 3
if [ "$DO_AVDB" = "1" ]; then dk compose -f "$DIR/avdb/docker-compose.yml" up -d >/dev/null 2>&1 || true; fi
if [ "$DO_MT" = "1" ]; then dk compose -f "$DIR/metatube/docker-compose.yml" up -d >/dev/null 2>&1 || true; fi

# ── 等待就绪 ─────────────────────────────────────────────────────────────────
wait_http(){ # wait_http <url> <秒> <名字>
  local u="$1" n="${2:-30}" nm="${3:-服务}" i=0
  while [ "$i" -lt "$n" ]; do
    c="$(curl -s -o /dev/null -w '%{http_code}' -m 4 --noproxy '*' "$u" 2>/dev/null || echo 000)"
    case "$c" in 2*|3*|401|403|404) ok "$nm 就绪 (HTTP $c)"; return 0;; esac
    sleep 2; i=$((i+2))
  done
  warn "$nm 暂未就绪（首次启动可能仍在初始化数据/迁移，稍后重试）"
  return 1
}

HOSTIP="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -n "$HOSTIP" ] || HOSTIP="<本机IP>"
echo
summary=()
if [ "$DO_AVDB" = "1" ]; then
  wait_http "http://127.0.0.1:$AVDB_PORT/" 150 "AVDB" && \
    summary+=("AVDB      http://$HOSTIP:$AVDB_PORT   (API Key 在该引擎后台查看)")
fi
if [ "$DO_MT" = "1" ]; then
  wait_http "http://127.0.0.1:$MT_PORT/" 120 "MetaTube" && \
    summary+=("MetaTube  http://$HOSTIP:$MT_PORT")
fi

echo ""
echo "  ┌────────────────────────────────────────────────────────────┐"
echo "  │  ✅ 外部服务已构建                                          │"
echo "  ├────────────────────────────────────────────────────────────┤"
for l in "${summary[@]:-}"; do [ -n "$l" ] && printf "  │  %-58s│\n" "$l"; done
echo "  ├────────────────────────────────────────────────────────────┤"
printf "  │  %-58s│\n" "数据目录：$DATA_DIR"
printf "  │  %-58s│\n" "安装目录：$DIR"
echo "  └────────────────────────────────────────────────────────────┘"
echo ""
echo "  接着把地址填进美化安装器（或直接在交互安装时填）："
echo "    bash install-ves.sh --avdb http://$HOSTIP:$AVDB_PORT \\"
echo "                        --metatube http://$HOSTIP:$MT_PORT ..."
echo ""
echo "  ${C_DIM}管理：bash install-external.sh --status | --uninstall [--purge]${C_OFF}"
