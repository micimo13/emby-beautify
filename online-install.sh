#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby Suite (VES) · 在线安装入口
#  ---------------------------------------------------------------------------
#  用法（一行命令）:
#    curl -sL https://<你的域名>/online-install.sh | bash
#    curl -sL https://<你的域名>/online-install.sh | bash -s -- --container emby --features 1,2,3,4,5,6 --theme blackgold --yes
#
#  原理:
#    ① 多源下载发布包（先本地/私有域名，再 GitHub 各通道，带超时与校验）
#    ② 解压到临时目录，找到 install-ves.sh
#    ③ 用 bash 以「文件方式」执行（交互向导才能读 /dev/tty）
#    ④ 透传所有参数给 install-ves.sh
#
#  环境变量（可选）:
#    VES_PKG_URL    指定发布包地址（覆盖内置列表）
#    VES_DOC_URL    安装引导页（图文教程）地址；默认 https://<VES_DOMAIN>/mockup/setup-guide/
#    VES_NO_TTY=1   强制非交互（缺参数时用默认值）
# =============================================================================
set -u

# ── 配置（fork 后请改这里，或用环境变量覆盖）─────────────────
VES_DOMAIN="${VES_DOMAIN:-}"
VES_SLUG="${VES_GH_REPO:-micimo13/emby-beautify}"
VES_BRANCH="${VES_GH_BRANCH:-main}"
PKG_NAME="ves.tar.gz"
# 安装引导页（图文教程）：默认取分发域名下的 setup-guide
VES_DOC_URL="${VES_DOC_URL:-https://github.com/micimo13/emby-beautify#readme}"

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
ok()   { printf '%s✅%s %s\n' "$C_OK" "$C_OFF" "$*"; }
err()  { printf '%s❌%s %s\n' "$C_ERR" "$C_OFF" "$*"; }
warn() { printf '%s⚠️ %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
info() { printf '%s·%s %s\n' "$C_DIM" "$C_OFF" "$*"; }

cat <<'BANNER'

  ╔══════════════════════════════════════════════════════════╗
  ║   🦐 Vanvy Emby Suite (VES) · 在线安装器                  ║
  ║   预热加载页 · 首页轮播 · 详情页Hero · 播放器 · JAV · 毛玻璃 ║
  ╚══════════════════════════════════════════════════════════╝

BANNER

# 引导页地址在 here-doc 外打印（here-doc 用了单引号定界符，不会展开变量）
printf '  📖 安装引导（图文教程 · 首次安装建议先看）：\n     %s\n\n' "$VES_DOC_URL"

# ── 前置检查 ────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { err "未找到 docker —— 请在本机（Docker 宿主机）上运行"; exit 1; }
command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || { err "需要 curl 或 wget"; exit 1; }

dl() {  # dl <url> <out>
  local u="$1" o="$2"
  if command -v curl >/dev/null 2>&1; then
    timeout 90 curl -fsSL --connect-timeout 8 --max-time 80 \
      -H 'Accept: application/vnd.github.raw' "$u" -o "$o" 2>/dev/null
  else
    timeout 90 wget -q --timeout=8 --tries=1 -O "$o" "$u" 2>/dev/null
  fi
}

# ── 下载源（按顺序尝试；可用 VES_PKG_URL 覆盖）───────────────
PKG_URLS=()
[ -n "${VES_PKG_URL:-}" ] && PKG_URLS+=("$VES_PKG_URL")
# 1) 自建分发域名（可用 VES_DOMAIN 指定，留空跳过）
[ -n "$VES_DOMAIN" ] && PKG_URLS+=("https://${VES_DOMAIN}/${PKG_NAME}")
# 2) 内网直连（若在局域网内）
LAN="${VES_LAN_SOURCE:-}"
[ -n "$LAN" ] && PKG_URLS+=("$LAN")
# 2) GitHub 各通道
PKG_URLS+=(
  "https://codeload.github.com/${VES_SLUG}/tar.gz/refs/heads/${VES_BRANCH}"
  "https://api.github.com/repos/${VES_SLUG}/contents/${PKG_NAME}"
  "https://raw.githubusercontent.com/${VES_SLUG}/${VES_BRANCH}/${PKG_NAME}"
  "https://gh-proxy.com/https://codeload.github.com/${VES_SLUG}/tar.gz/refs/heads/${VES_BRANCH}"
)


# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

TMP="$(mktemp -d 2>/dev/null || echo $TMPD/ves-install.$$)"
mkdir -p "$TMP"; trap 'rm -rf "$TMP"' EXIT

info "下载发布包 ..."
GOT=0
for url in "${PKG_URLS[@]}"; do
  [ -z "$url" ] && continue
  printf '   %s尝试%s %s\n' "$C_DIM" "$C_OFF" "$(echo "$url" | cut -c1-78)"
  if dl "$url" "$TMP/pkg.tar.gz" && tar tzf "$TMP/pkg.tar.gz" >/dev/null 2>&1; then
    GOT=1; ok "下载成功 ($(du -h "$TMP/pkg.tar.gz" | cut -f1))"; break
  fi
done
[ "$GOT" = "1" ] || { err "所有下载源均失败"; echo "   ${C_DIM}可手动下载发布包后：tar xzf ves.tar.gz && cd <目录> && bash install-ves.sh${C_OFF}"; exit 1; }

# ── 解压 + 定位安装器 ────────────────────────────────────────
tar xzf "$TMP/pkg.tar.gz" -C "$TMP" 2>/dev/null
INST="$(find "$TMP" -maxdepth 3 -name 'install-ves.sh' -type f 2>/dev/null | head -1)"
[ -n "$INST" ] || { err "包里没找到 install-ves.sh（可能是旧版发布包）"; exit 1; }
SRC="$(dirname "$INST")"
ok "安装器就绪: $(basename "$SRC")"

# ── 交给统一安装器 ────────────────────────────────────────────
# 🔴 安全策略（2026-09-13 教训）：
#   以前「无终端就自动补 --yes」→ 配合安装器里读 stdin，导致 `curl | bash`
#   在用户没选容器、没确认的情况下**直接自动部署**（严重事故）。
#   现在：无终端且未显式给 --container/--yes → **明确中止并给出用法**，绝不擅自装。
if [ ! -r /dev/tty ]; then
  if [ "${VES_NO_TTY:-0}" = "1" ]; then
    warn "VES_NO_TTY=1 → 非交互模式（请确保已传 --container 与 --yes）"
  else
    case " $* " in
      *" --container "*)
        case " $* " in *" --yes "*|*" -y "*) ;; *) info "已指定容器，补 --yes 以便无人值守完成"; set -- "$@" --yes;; esac ;;
      *)
        err "当前没有可交互终端，无法进行向导式安装（不会替你猜容器）。"
        echo "   请显式指定参数后重试，例如："
        echo "     ${C_DIM}curl -sL <本脚本地址> | bash -s -- --container emby-302 --features 1,2,3,4,5,6,7,8 --theme blackgold --yes${C_OFF}"
        echo "   本机 emby 容器："
        docker ps --format '{{.Names}}' 2>/dev/null | grep -i emby | sed 's/^/     - /'
        exit 2 ;;
    esac
  fi
else
  # 有终端：正常进入交互向导
  case " $* " in *" --yes "*) ;; esac
fi

echo
info "启动 VES 安装向导 ..."
echo
# 把引导页地址传给安装器（安装器里也会再打印一次）
export VANVY_DOC_URL="${VANVY_DOC_URL:-$VES_DOC_URL}"
[ -n "${VANVY_PUBLIC_DOMAIN:-}" ] || export VANVY_PUBLIC_DOMAIN="$VES_DOMAIN"
exec bash "$INST" "$@"
