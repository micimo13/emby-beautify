#!/usr/bin/env bash
# ============================================================
# Emby 黑金影院美化 · 在线一键部署脚本
# 适用: Emby 4.8.x (web 根 /system/dashboard-ui/)
# 作用: 黑金影院横幅轮播 + Black Gold 增强层(黑曜石/隶书字/媒体库卡)
# ------------------------------------------------------------
# 用法 (在有 docker 的宿主机上执行, 任选一行):
#   curl -sL https://emby-beautify.vanvy.top/emby-blackgold/online-install.sh | bash
#   curl -sL https://emby-beautify.vanvy.top/emby-blackgold/online-install.sh | bash -s -- --container emby
#   curl -sL https://emby-beautify.vanvy.top/emby-blackgold/online-install.sh | bash -s -- -c emby-18
#   curl -sL https://emby-beautify.vanvy.top/emby-blackgold/online-install.sh | bash -s -- --help
# ------------------------------------------------------------
# 特性:
#   - 自动识别运行中的 Emby 容器: 1 个直接用, 多个列表选择 (同 V1 交互)
#   - 自动备份原文件(容器内时间戳目录, 可回滚) · 幂等(已装则刷新bump)
#   - curl|bash 管道兼容: 从 /dev/tty 读用户输入, 永不死等
# 作者: 虾子🦐 (for Marnie✨✨🎊)
# ============================================================
set -euo pipefail

PKG_NAME="emby-blackgold.tar.gz"
PKG_URL="https://emby-beautify.vanvy.top/emby-blackgold/${PKG_NAME}"
# 兜底镜像 (内容校验失败会自动换源)
MIRROR_URLS=(
  "https://cdn.vanvy.cc/https://emby-beautify.vanvy.top/emby-blackgold/${PKG_NAME}"
)

# 命令行参数
CONTAINER=""

# ── 彩色输出 (同 V1 风格) ──
C_INFO='\033[1;36m'; C_OK='\033[1;32m'; C_WARN='\033[1;33m'
C_ERR='\033[1;31m';  C_ASK='\033[1;35m'; C_OFF='\033[0m'
c_info() { printf "${C_INFO}[信息]${C_OFF} %s\n" "$*"; }
c_ok()   { printf "${C_OK}[成功]${C_OFF} %s\n" "$*"; }
c_warn() { printf "${C_WARN}[警告]${C_OFF} %s\n" "$*"; }
c_err()  { printf "${C_ERR}[错误]${C_OFF} %s\n" "$*"; }
c_ask()  { printf "${C_ASK}[询问]${C_OFF} %s" "$*"; }
die()    { c_err "$*"; exit 1; }

# ── 用户输入 (终端/管道/无tty 全兼容, 永不死等) ──
# 优先级: 终端 stdin → /dev/tty (curl|bash 管道时用户终端仍可交互) → stdin 回退
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

# ── 参数解析 ──
usage() {
  echo "用法:"
  echo "  bash $0                         # 自动识别容器(1个直装/多个选择)"
  echo "  bash $0 --container <容器名>    # 指定容器(跳过选择)"
  echo "  bash $0 -c <容器名>             # 同上"
  exit 0
}
while [ $# -gt 0 ]; do
  case "$1" in
    -c|--container) CONTAINER="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) c_warn "忽略未知参数: $1"; shift ;;
  esac
done

echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║   Emby 黑金影院美化 · 在线一键部署                    ║"
echo "  ║   Vanvy Black Gold Atelier                           ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""

# ── 0. 前置检查 ──
command -v docker >/dev/null 2>&1 || die "未检测到 docker，请在 NAS 宿主机(能执行 docker 命令的环境)运行。"

# ── 1. 自动识别 Emby 容器 (同 V1 交互) ──
detect_container() {
  local list count
  list=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE "emby" | head -10)
  if [ -z "$list" ]; then
    die "未找到运行中的 Emby 容器 (docker ps 查看确认)。"
  fi
  if [ -z "$CONTAINER" ]; then
    count=$(echo "$list" | wc -l)
    if [ "$count" = "1" ]; then
      CONTAINER="$list"
      c_ok "检测到 Emby 容器: $CONTAINER"
    else
      c_info "检测到多个 Emby 容器:"
      echo "$list" | nl -w2 -s'] '
      c_ask "选择容器 [1-$count, 默认 1]: "
      local sel=""
      read_from_user sel "1"
      # 校验输入: 无效(空/非数字/越界)一律回退第 1 个
      sel=$(echo "$sel" | tr -dc '0-9')
      [ -z "$sel" ] && sel="1"
      [ "$sel" -lt 1 ] && sel="1"
      [ "$sel" -gt "$count" ] && sel="1"
      CONTAINER=$(echo "$list" | sed -n "${sel}p")
      c_ok "已选择容器: $CONTAINER"
    fi
  fi
  docker inspect "$CONTAINER" >/dev/null 2>&1 || die "容器 $CONTAINER 不存在或无法访问。"
}

detect_container

# ── 2. 下载美化包 (多源重试 + gzip 完整性校验) ──
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

download_pkg() {
  local url="$1" dest="$2"
  curl -fsSL --connect-timeout 15 --max-time 120 -o "$dest" "$url" 2>/dev/null
}

echo "⬇  下载美化包 ..."
PKG_FILE="$TMPDIR/$PKG_NAME"
if download_pkg "$PKG_URL" "$PKG_FILE"; then
  c_ok "主源下载成功 (emby-beautify.vanvy.top)"
else
  local ok=0
  for m in "${MIRROR_URLS[@]}"; do
    c_warn "主源失败，尝试镜像: $m"
    if download_pkg "$m" "$PKG_FILE"; then c_ok "镜像下载成功"; ok=1; break; fi
  done
  [ "$ok" = "1" ] || die "所有源下载失败，请检查网络后重试。"
fi

# gzip 完整性 + 关键文件校验
if ! tar tzf "$PKG_FILE" >/dev/null 2>&1; then
  die "下载的包损坏 (gzip 校验失败)，请重试。"
fi
c_ok "下载完成: $(du -h "$PKG_FILE" | cut -f1)"

# ── 3. 解压 + 校验结构 ──
echo "📦 解压美化包 ..."
tar xzf "$PKG_FILE" -C "$TMPDIR"
SRC=""
for d in "$TMPDIR"/emby-blackgold* "$TMPDIR"; do
  [ -f "$d/install.sh" ] && [ -d "$d/emby-web-banner" ] && SRC="$d" && break
done
[ -n "$SRC" ] || die "包内缺少 install.sh 或 emby-web-banner/，结构异常。"

# ── 4. 调用安装向导 (透传选中的容器) ──
echo ""
c_info "目标容器: $CONTAINER"
echo "🚀 启动安装脚本 ..."
echo "----------------------------------------------"
cd "$SRC"
bash install.sh --container "$CONTAINER"
RC=$?

# ── 5. 收尾 ──
echo "----------------------------------------------"
if [ "$RC" = "0" ]; then
  echo "🎉 部署流程结束。浏览器 Ctrl+F5 / Cmd+Shift+R 强刷 Emby 首页查看效果 ✨"
else
  c_warn "安装脚本退出码: $RC"
fi
exit $RC
