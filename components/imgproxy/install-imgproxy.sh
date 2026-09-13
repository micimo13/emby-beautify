#!/usr/bin/env bash
# =============================================================================
#  VES 图片代理 · 一键安装/管理
#  ---------------------------------------------------------------------------
#  在哪运行：你要跑图片代理的那台机器（能访问图床的机器）
#
#  用法:
#    bash install-imgproxy.sh --check                 # 只自检（不改系统）
#    bash install-imgproxy.sh --systemd               # 装成 systemd 服务
#    bash install-imgproxy.sh --docker                # 装成 docker 容器
#    bash install-imgproxy.sh --start                 # 前台试跑
#    bash install-imgproxy.sh --uninstall             # 卸载
#
#  关键参数（也可写进 config.json）:
#    --proxy  <url>    上游代理，可多个用逗号分隔
#                      例: socks5h://用户:密码@127.0.0.1:1080
#    --mode   <mode>   none | auto | all      （默认 auto）
#    --port   <n>      监听端口               （默认 18098）
#    --allow  <hosts>  图床白名单，逗号分隔   （留空=全放行）
#
#  示例:
#    bash install-imgproxy.sh --systemd \
#         --proxy "socks5h://user:pass@10.0.0.5:1080" --mode auto
# =============================================================================
set -eu
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SVC=vanvy-imgproxy
CONF_DIR=/etc/vanvy-imgproxy

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_OFF=$'\033[0m'; C_DIM=$'\033[2m'
ok()   { printf '%s[OK]%s %s\n' "$C_OK" "$C_OFF" "$*"; }
err()  { printf '%s[X]%s %s\n' "$C_ERR" "$C_OFF" "$*"; }
warn() { printf '%s[!]%s %s\n' "$C_WARN" "$C_OFF" "$*"; }
info() { printf '\033[36m[i]\033[0m %s\n' "$*"; }

MODE="check"; PROXY=""; PMODE=""; PORT=""; ALLOW=""; TMDBKEY=""

# ── Python 运行器：宿主机有 python3 就用，否则用 docker 兜底 ──
PY_IMG="python:3-alpine"
pick_py() {
  if command -v python3 >/dev/null 2>&1; then
    PYRUN="python3"; PYIN_DOCKER=0
  elif command -v python >/dev/null 2>&1 && python -c 'import sys;sys.exit(0 if sys.version_info[0]==3 else 1)' 2>/dev/null; then
    PYRUN="python"; PYIN_DOCKER=0
  elif command -v docker >/dev/null 2>&1; then
    PYRUN="docker"; PYIN_DOCKER=1
  else
    err "需要 python3 或 docker（二者其一）"; exit 1
  fi
}
# 执行一段 python 代码（stdin），可带文件挂载目录
py_exec() {  # py_exec <挂载目录或->  <代码文件>
  local mount="$1" code="$2"
  if [ "$PYIN_DOCKER" = "1" ]; then
    if [ "$mount" = "-" ]; then
      docker run --rm -i "$PY_IMG" python3 - < "$code"
    else
      docker run --rm -i -v "$(cd "$(dirname "$mount")" && pwd):/w" "$PY_IMG" python3 - < "$code"
    fi
  else
    "$PYRUN" "$code"
  fi
}
# 用 python 修改 config.json 的字段（宿主机无 python 也能跑）
json_set() {  # json_set <配置文件> <key> <value-json>
  local f="$1" k="$2" v="$3"

# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

  cat > $TMPD/_jsonset.py <<'PYEOF'
import json,sys
p,k,v = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
d = json.load(open(p, encoding="utf-8"))
d[k] = v
json.dump(d, open(p,"w",encoding="utf-8"), ensure_ascii=False, indent=2)
PYEOF
  if [ "$PYIN_DOCKER" = "1" ]; then
    local dir; dir="$(cd "$(dirname "$f")" && pwd)"; local base; base="$(basename "$f")"
    docker run --rm -i -v "$dir:/w" "$PY_IMG" python3 - "/w/$base" "$k" "$v" < $TMPD/_jsonset.py
  else
    "$PYRUN" $TMPD/_jsonset.py "$f" "$k" "$v"
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --check)      MODE="check"; shift;;
    --systemd)    MODE="systemd"; shift;;
    --docker)     MODE="docker"; shift;;
    --start)      MODE="start"; shift;;
    --uninstall)  MODE="uninstall"; shift;;
    --proxy)      PROXY="$2"; shift 2;;
    --mode)       PMODE="$2"; shift 2;;
    --tmdb-key)   TMDBKEY="$2"; shift 2;;      # TMDB API Key（开放 /tmdb/ 通道）
    --port)       PORT="$2"; shift 2;;
    --allow)      ALLOW="$2"; shift 2;;
    -h|--help)    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) err "未知参数: $1"; exit 1;;
  esac
done

# ── 自检 ──────────────────────────────────────────────────────
run_check() {
  info "运行自检 ..."
  local envs=()
  [ -n "$PROXY" ] && envs+=("VANVY_PROXY_URL=$PROXY")
  [ -n "$PMODE" ] && envs+=("VANVY_PROXY_MODE=$PMODE")
  [ -n "$PORT" ]  && envs+=("VANVY_IMG_PORT=$PORT")
  [ -n "$ALLOW" ] && envs+=("VANVY_IMG_ALLOW_HOSTS=$ALLOW")
  pick_py
  if [ "$PYIN_DOCKER" = "1" ]; then
    warn "宿主机无 python3 → 使用 docker($PY_IMG) 运行自检"
    docker run --rm -i \
      -e VANVY_PROXY_URL -e VANVY_PROXY_MODE -e VANVY_IMG_PORT -e VANVY_IMG_ALLOW_HOSTS \
      -v "$SRC_DIR:/app:ro" -w /app "$PY_IMG" \
      python3 /app/img_proxy.py --test
  else
    env "${envs[@]:-X=1}" "$PYRUN" "$SRC_DIR/img_proxy.py" --test
  fi
}

case "$MODE" in
  check)
    run_check
    echo
    info "确认无误后选择部署方式："
    echo "    ${C_DIM}systemd:${C_OFF} bash install-imgproxy.sh --systemd [--proxy ...]"
    echo "    ${C_DIM}docker :${C_OFF} bash install-imgproxy.sh --docker  [--proxy ...]"
    ;;

  start)
    signal=""; for s in ${PROXY//,/ }; do signal="$s"; break; done
    info "前台试跑（Ctrl+C 退出）..."
    pick_py
    [ -n "$PROXY" ] && export VANVY_PROXY_URL="$PROXY"
    [ -n "$PMODE" ] && export VANVY_PROXY_MODE="$PMODE"
    [ -n "$PORT" ]  && export VANVY_IMG_PORT="$PORT"
    [ "$PYIN_DOCKER" = "1" ] && exec docker run --rm -it \
      -e VANVY_PROXY_URL -e VANVY_PROXY_MODE -e VANVY_IMG_PORT \
      -p "${PORT:-18098}:18098" -v "$SRC_DIR:/app:ro" -w /app "$PY_IMG" \
      python3 /app/img_proxy.py
    exec "$PYRUN" "$SRC_DIR/img_proxy.py"
    ;;

  systemd)
    [ "$(id -u)" = "0" ] || { err "安装 systemd 服务需要 root（请用 sudo）"; exit 1; }
    pick_py
    [ "$PYIN_DOCKER" = "0" ] || { err "宿主机无 python3，systemd 方式不可用 → 请改用 --docker"; exit 1; }
    command -v systemctl >/dev/null 2>&1 || { err "本机没有 systemd，请改用 --docker"; exit 1; }
    # 专用用户
    id vanvy-img >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin vanvy-img 2>/dev/null || true
    # 目录
    mkdir -p /opt/vanvy-imgproxy "$CONF_DIR" /var/cache/vanvy-imgproxy
    install -m 0755 "$SRC_DIR/img_proxy.py" /opt/vanvy-imgproxy/img_proxy.py
    # 配置
    if [ -f "$CONF_DIR/config.json" ]; then
      warn "已有 $CONF_DIR/config.json，保留不动"
    else
      if [ -n "$PROXY" ] || [ -n "$PMODE" ] || [ -n "$ALLOW" ]; then
        "$PYRUN" "$SRC_DIR/img_proxy.py" --gen-config > "$CONF_DIR/config.json"
        [ -n "$PORT" ]  && json_set "$CONF_DIR/config.json" port "$PORT"
        [ -n "$PMODE" ] && json_set "$CONF_DIR/config.json" proxy_mode "\"$PMODE\""
        [ -n "$TMDBKEY" ] && json_set "$CONF_DIR/config.json" tmdb_key "\"$TMDBKEY\""
        if [ -n "$PROXY" ]; then
          _j=$(printf '%s' "$PROXY" | awk -F, '{n=split($0,a,",");printf "[";for(i=1;i<=n;i++){if(a[i]!=""){printf "%s\"%s\"",(i>1?",":""),a[i]}}printf "]"}')
          json_set "$CONF_DIR/config.json" proxies "$_j"
        fi
        if [ -n "$ALLOW" ]; then
          _a=$(printf '%s' "$ALLOW" | awk -F, '{n=split($0,a,",");printf "[";for(i=1;i<=n;i++){if(a[i]!=""){printf "%s\"%s\"",(i>1?",":""),a[i]}}printf "]"}')
          json_set "$CONF_DIR/config.json" allow_hosts "$_a"
        fi
        ok "已写入配置 $CONF_DIR/config.json"
      else
        cp "$SRC_DIR/config.example.json" "$CONF_DIR/config.json"
        info "已放置配置模板 → 请编辑后重启：$CONF_DIR/config.json"
      fi
    fi
    chown -R vanvy-img:vanvy-img /var/cache/vanvy-imgproxy 2>/dev/null || true
    # ⚠️ 必须把配置文件也归属服务用户，否则服务读不到 → 静默回退默认值（代理/白名单失效）
    chown vanvy-img:vanvy-img "$CONF_DIR/config.json" 2>/dev/null || true
    chmod 0640 "$CONF_DIR/config.json" 2>/dev/null || true

    cat > "/etc/systemd/system/$SVC.service" <<EOF
[Unit]
Description=VES Image Proxy (vanvy)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=vanvy-img
Group=vanvy-img
Environment=VANVY_IMG_CONFIG=$CONF_DIR/config.json
ExecStart=$PYRUN /opt/vanvy-imgproxy/img_proxy.py -c $CONF_DIR/config.json
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=false

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable --now "$SVC"
    sleep 1
    if systemctl is-active --quiet "$SVC"; then
      ok "服务已启动: $SVC"
      info "查看状态: systemctl status $SVC   日志: journalctl -u $SVC -f"
    else
      err "服务启动失败 → journalctl -u $SVC -n 30"
      exit 1
    fi
    P=$(grep -oE '"port": [0-9]+' "$CONF_DIR/config.json" | grep -oE '[0-9]+' | head -1)
    echo
    ok "接下来在 nginx 里把 /vdimg/ 反代到 127.0.0.1:${P:-18098}"
    info "片段见: $SRC_DIR/nginx-vdimg.conf"
    ;;

  docker)
    command -v docker >/dev/null 2>&1 || { err "未找到 docker"; exit 1; }
    NAME=vanvy-imgproxy
    DIR=/opt/vanvy-imgproxy
    mkdir -p "$DIR"
    install -m 0755 "$SRC_DIR/img_proxy.py" "$DIR/img_proxy.py"
    [ -f "$DIR/config.json" ] || cp "$SRC_DIR/config.example.json" "$DIR/config.json"
    pick_py
    if [ -n "$PROXY" ]; then
      _j=$(printf '%s' "$PROXY" | awk -F, '{n=split($0,a,",");printf "[";for(i=1;i<=n;i++){if(a[i]!=""){printf "%s\"%s\"",(i>1?",":""),a[i]}}printf "]"}')
      json_set "$DIR/config.json" proxies "$_j"
    fi
    [ -n "$PMODE" ] && json_set "$DIR/config.json" proxy_mode "\"$PMODE\""
    # 注意：容器内固定监听 18098；--port 只决定【宿主机映射端口】
    if [ -n "$ALLOW" ]; then
      _a=$(printf '%s' "$ALLOW" | awk -F, '{n=split($0,a,",");printf "[";for(i=1;i<=n;i++){if(a[i]!=""){printf "%s\"%s\"",(i>1?",":""),a[i]}}printf "]"}')
      json_set "$DIR/config.json" allow_hosts "$_a"
    fi
    json_set "$DIR/config.json" cache_dir "\"/cache\""
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    # 容器内固定 18098；宿主机端口 = --port 或配置里的 port
    P="${PORT:-$(grep -oE '"port"[[:space:]]*:[[:space:]]*[0-9]+' "$DIR/config.json" | grep -oE '[0-9]+' | head -1)}"
    P="${P:-18098}"
    json_set "$DIR/config.json" port 18098
    # 用 alpine + bind mount（无需构建镜像）
    docker run -d --name "$NAME" \
      --restart unless-stopped \
      -p "$P:18098" \
      -v "$DIR:/app:ro" \
      -v "/var/cache/vanvy-imgproxy:/cache" \
      -w /app \
      --entrypoint python3 \
      python:3-alpine /app/img_proxy.py -c /app/config.json
    sleep 2
    if docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
      ok "容器已启动: $NAME  （宿主机 $P → 容器 18098）"
      info "日志: docker logs -f $NAME"
    else
      err "容器启动失败 → docker logs $NAME"; exit 1
    fi
    ;;

  uninstall)
    if command -v systemctl >/dev/null 2>&1; then
      systemctl disable --now "$SVC" 2>/dev/null || true
      rm -f "/etc/systemd/system/$SVC.service"
      systemctl daemon-reload 2>/dev/null || true
      ok "systemd 服务已移除"
    fi
    docker rm -f vanvy-imgproxy >/dev/null 2>&1 && ok "docker 容器已移除" || true
    info "保留配置与缓存（如需彻底清理）："
    echo "    rm -rf $CONF_DIR /opt/vanvy-imgproxy /var/cache/vanvy-imgproxy"
    ;;
esac
