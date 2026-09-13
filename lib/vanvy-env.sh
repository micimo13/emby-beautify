#!/usr/bin/env bash
# =============================================================================
#  vanvy-env.sh · 环境变量加载器
#  ---------------------------------------------------------------------------
#  被所有安装脚本 source。职责：
#    ① 从 <项目根>/vanvy.env 读取本地私有配置（可不存在）
#    ② 提供安全默认值（空字符串 = 功能降级，绝不硬编码内网地址）
#    ③ 提供 vanvy_ask_env()：部署时交互式补全缺失项
#
#  兼容：vanvy.env 缺失时全部走默认值，脚本仍可正常运行。
# =============================================================================

# 项目根目录（本文件在 lib/ 下）
VANVY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VANVY_ENV_FILE="${VANVY_ENV_FILE:-$VANVY_ROOT/vanvy.env}"

# ── 记录调用方显式传入的 VANVY_*（环境变量优先于 vanvy.env）──
#  用途：可按容器单独配置（例：VANVY_P2_ENRICH=off bash install-ves.sh ...）
_VANVY_INBOUND_FILE=""
if [ -z "${_VANVY_INBOUND_DONE:-}" ]; then
  _VANVY_INBOUND_DONE=1
  _VANVY_INBOUND_FILE="$(mktemp)" 2>/dev/null || _VANVY_INBOUND_FILE=""
  if [ -n "$_VANVY_INBOUND_FILE" ]; then
    while IFS= read -r _k; do
      case "$_k" in VANVY_*) ;; *) continue ;; esac
      eval "_vv=\${$_k:-}"
      [ -n "$_vv" ] && printf '%s\n%s\n' "$_k" "$_vv" >> "$_VANVY_INBOUND_FILE"
    done < <(compgen -v 2>/dev/null | grep '^VANVY_' || true)
  fi
fi

# ── 默认值（全部为空 / 安全值）──────────────────────────────
: "${VANVY_DEPLOY_HOST:=}"
: "${VANVY_DEPLOY_PASS:=}"

# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

: "${VANVY_DEPLOY_DEST:=$TMPD/ves-build}"
: "${VANVY_PUBLIC_DOMAIN:=}"
: "${VANVY_DOC_URL:=}"
: "${VANVY_LAN_SOURCE:=}"
: "${VANVY_METATUBE_BASE:=}"
: "${VANVY_AVDB_BASE:=}"
: "${VANVY_AVDB_KEY:=}"
: "${VANVY_IMG_PROXY:=}"
# 演员别名映射（JSON）：本地演员名 → JavDB 可用名；留空=全自动识别
: "${VANVY_ACTOR_ALIAS:=}"
# 图片代理（本机部署 install-imgproxy.sh 时使用）
: "${VANVY_PROXY_URL:=}"      # 出网代理 HTTP/SOCKS5（逗号分隔多个，可空=直连）
: "${VANVY_PROXY_MODE:=}"     # auto | all | none
: "${VANVY_IMG_PORT:=}"       # 监听端口（默认 18098）
: "${VANVY_DEV_UNRAID:=}"
: "${VANVY_DEV_UNRAID_PASS:=}"
: "${VANVY_GH_REPO:=}"

# ── 加载 vanvy.env（安全解析：只接受 KEY=VALUE，不执行任意代码）──
if [ -f "$VANVY_ENV_FILE" ]; then
  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in
      ''|\#*) continue ;;
    esac
    _key="${_line%%=*}"
    _val="${_line#*=}"
    # 去掉首尾空白与包裹引号
    _key="$(printf '%s' "$_key" | tr -d ' \t')"
    case "$_key" in
      VANVY_*) ;;
      *) continue ;;
    esac
    # 去引号
    case "$_val" in
      \"*\") _val="${_val#\"}"; _val="${_val%\"}" ;;
      \'*\') _val="${_val#\'}"; _val="${_val%\'}" ;;
    esac
    # 去行尾注释（仅当 # 前有空格）
    case "$_val" in
      *" #"*) _val="${_val%% \#*}" ;;
    esac
    export "$_key=$_val"
  done < "$VANVY_ENV_FILE"
  unset _line _key _val
fi

# ── 回写调用方传入的值（环境变量 > vanvy.env）───────────────────
if [ -n "${_VANVY_INBOUND_FILE:-}" ] && [ -s "$_VANVY_INBOUND_FILE" ]; then
  while IFS= read -r _k && IFS= read -r _v; do
    [ -n "$_k" ] && export "$_k=$_v"
  done < "$_VANVY_INBOUND_FILE"
fi

# ── 便捷判断 ─────────────────────────────────────────────────
vanvy_has() { [ -n "${1:-}" ]; }

# 安装引导页地址（按优先级解析，找不到则输出空串由调用方回落）
#   ① VANVY_DOC_URL          显式指定（--doc-url 或 vanvy.env）
#   ② VANVY_PUBLIC_DOMAIN    <分发域名>/mockup/setup-guide/
#   ③ 空 → 调用方回落到随包文档 docs/INSTALL.md
vanvy_doc_url() {
  if [ -n "${VANVY_DOC_URL:-}" ]; then printf '%s' "$VANVY_DOC_URL"; return 0; fi
  if [ -n "${VANVY_PUBLIC_DOMAIN:-}" ]; then printf 'https://%s/mockup/setup-guide/' "$VANVY_PUBLIC_DOMAIN"; return 0; fi
  printf ''
}

# 交互式补全（仅在 TTY 可用时询问；无 TTY 或已存在值则跳过）
# 用法: vanvy_ask_env VAR_NAME "提示文字" "默认值"
vanvy_ask_env() {
  local __var="$1" __prompt="$2" __default="${3:-}"
  local __cur="${!__var:-}"
  [ -n "$__cur" ] && return 0
  [ -r /dev/tty ] || { export "$__var=$__default"; return 0; }
  local __ans=""
  printf "    %s%s%s [%s]: " "${VANVY_C_ASK:-}" "$__prompt" "${VANVY_C_OFF:-}" "$__default" >/dev/tty
  read -r __ans </dev/tty 2>/dev/null || __ans=""
  [ -z "$__ans" ] && __ans="$__default"
  export "$__var=$__ans"
}

# 导出常量给子脚本（避免重复定义）
export VANVY_ROOT VANVY_ENV_FILE
