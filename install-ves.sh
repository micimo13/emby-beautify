#!/usr/bin/env bash
# =============================================================================
#  VES · Vanvy Emby Suite 统一安装器（菜单式）
#  ---------------------------------------------------------------------------
#  在【Docker 宿主机】上运行（例：UNRAID）。会：
#    ① 自动列出 emby 容器
#    ② 功能多选（预热页/首页轮播/详情页Hero/第三方播放器/JAV增强/毛玻璃/卡片预告片）
#    ③ 配色选择（10 套）
#    ④ 参数（毛玻璃强度 / 每行卡片数）
#    ⑤ 安装摘要确认
#    ⑥ 逐个部署 + 写 config.js + 快照回滚
#
#  用法：
#    bash install-ves.sh                                  # 交互式
#    bash install-ves.sh --container emby-302             # 指定容器（其余仍交互）
#    bash install-ves.sh --container emby-302 --features 1,2,3,4,5,6,7 --theme blackgold --frost weak --yes
#    bash install-ves.sh --container emby-302 --uninstall
#    bash install-ves.sh --list                           # 只列出容器
#    bash install-ves.sh --doc-url https://xxx/setup-guide/   # 指定安装引导页地址
#    bash install-ves.sh --favicon /path/tab.png         # 单独指定浏览器标签图标
#    bash install-ves.sh --logo https://img.example.com/logo.png   # LOGO/图标也可直接给 URL
#    bash install-ves.sh --proxy "socks5h://u:p@host:1080" --imgproxy   # 部署图片代理（走代理）
#    VANVY_ACTOR_ALIAS='{"弥生美月":"弥生みづき"}' bash install-ves.sh ...    # 手动指定演员别名（可选）
#
#  安装引导页（图文教程）地址解析优先级：
#    --doc-url  >  vanvy.env 里的 VANVY_DOC_URL  >  https://$VANVY_PUBLIC_DOMAIN/mockup/setup-guide/
#    都没有 → 提示看随包文档 docs/INSTALL.md
# =============================================================================
set -u
# ── 中文宽度对齐需要 UTF-8 locale（否则按字节计数会错位）──
# 逐个候选，并**校验 charmap 真的是 UTF-8**（退出码 0 不代表生效！
# 例：无 C.UTF-8 时 locale charmap 会退化成 ANSI_X3.4-1968 但返回 0）
for _l in C.UTF-8 C.utf8 en_US.UTF-8 en_US.utf8 en_US.UTF8 zh_CN.UTF-8 zh_CN.utf8; do
  _cm="$(LC_ALL="$_l" locale charmap 2>/dev/null || true)"
  case "$_cm" in
    UTF-8|utf8|UTF8) export LC_ALL="$_l" LANG="$_l"; break;;
  esac
done
unset _l _cm

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB=/system/dashboard-ui

# ── 环境变量（私有配置 vanvy.env；不存在则全走安全默认值）──
if [ -f "$SRC_DIR/lib/vanvy-env.sh" ]; then . "$SRC_DIR/lib/vanvy-env.sh"; fi

# 兜底：老包/被裁剪的 lib 里可能没有 vanvy_doc_url（引导页地址解析）
if ! command -v vanvy_doc_url >/dev/null 2>&1; then
  vanvy_doc_url() {
    if [ -n "${VANVY_DOC_URL:-}" ]; then printf '%s' "$VANVY_DOC_URL"; return 0; fi
    if [ -n "${VANVY_PUBLIC_DOMAIN:-}" ]; then printf 'https://%s/mockup/setup-guide/' "$VANVY_PUBLIC_DOMAIN"; return 0; fi
    printf ''
  }
fi

C_OFF=$'\033[0m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_ASK=$'\033[36m'; C_DIM=$'\033[2m'
ok()   { printf "%s[OK]%s %s\n"   "$C_OK"   "$C_OFF" "$*"; }
warn() { printf "%s[!]%s %s\n"    "$C_WARN" "$C_OFF" "$*"; }
err()  { printf "%s[X]%s %s\n"    "$C_ERR"  "$C_OFF" "$*"; }
info() { printf "%s[i]%s %s\n"    "$C_ASK"  "$C_OFF" "$*"; }

# ── 显示宽度（中日韩字符占 2 列）+ 框线对齐工具 ──────────────
dwidth() {  # 字符串的终端显示宽度
  local str="$1" w=0 i ch n
  n=${#str}                       # 注意：需在赋值后另算，不能写进同一行 local
  for ((i=0;i<n;i++)); do
    ch="${str:i:1}"
    case "$ch" in
      [\ -~]) w=$((w+1));;   # 空格~波浪号 = 单宽（注意必须含空格，0x20）
      *)      w=$((w+2));;   # 其余（中日韩） = 双宽
    esac
  done
  printf %s "$w"
}
# dpad <文本> <目标列宽> —— 返回补足空格后的字符串（按显示宽度）
dpad() {
  local txt="$1" want="$2" w pad
  w=$(dwidth "$txt"); pad=$((want-w)); [ "$pad" -lt 0 ] && pad=0
  printf '%s%*s' "$txt" "$pad" ''
}
# boxrow <左列> <右列> —— 输出对齐的两列表格行
boxrow() {
  local txt="$1" total="${2:-56}"
  printf '  │ %s │\n' "$(dpad "$txt" $((total-4)))"
}
boxrow2() {
  printf '  │ %s │ %s │\n' "$(dpad "$1" 16)" "$2"
}
ask()  { printf "%s[?]%s %s"      "$C_ASK"  "$C_OFF" "$*"; }

CONTAINER=""; FEATURES=""; THEME=""; FROST=""; PERROW=""; ASSUME_YES=0; MODE="install"; LIST_ONLY=0
LSTYLE=""   # 加载页样式变体
BSTYLE=""   # 首页轮播样式（hero/designer 系列；空=生产版 banner_home）
LOGOFILE="" # 加载页 LOGO 图片文件
NOLOGO=0    # 加载页不使用 LOGO
LOGOW=""    # 加载页 LOGO 显示宽度 px
FAVICONFILE="" # 浏览器标签图标图片文件（单独指定）
NOFAVICON=0    # 不替换浏览器标签图标
DEPLOY_IMGPROXY=0  # 是否在部署时顺带安装图片代理

# ── 主题预设（与 vanvy-home.js / vanvy-detail.js 一致）──
THEME_KEYS="aurora blackgold champagne emerald sakura sunset amber crimson violet graphite"
THEME_NAMES="极光蓝 黑金 香槟金 翡翠绿 樱花粉 落日橙 琥珀金 赤霞红 幻紫 石墨灰"

# ── 功能定义 ──
# 1 预热加载页  2 首页轮播  3 详情页Hero  4 第三方播放器  5 JAV增强  6 毛玻璃  7 卡片预告片
FEAT_KEYS="loading home detail players jav frost trailer login"
FEAT_NAMES=("预热加载页（品牌 LOGO + favicon）" "首页满屏轮播" "详情页结构增强（Hero 接管）" "第三方播放器（15 款真 logo + 真实调用）" "JAV 增强（小姐姐库专属：番号/标签/演员/外链）" "毛玻璃背景（详情页）" "列表卡片预告片（悬停静音预览 + 弹框）" "登录页美化（品牌头 + 毛玻璃表单）")
FEAT_MAX="$(echo "$FEAT_KEYS" | wc -w | tr -d ' ')"

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2;;
    --features)  FEATURES="$2"; shift 2;;
    --theme)     THEME="$2"; shift 2;;
    --frost)     FROST="$2"; shift 2;;     # off|weak|mid|strong
    --perrow)    PERROW="$2"; shift 2;;
    --lstyle)    LSTYLE="$2"; shift 2;;   # 加载页样式（aurora|cinema|minimal|split|logo|空）
    --bstyle)    BSTYLE="$2"; shift 2;;   # 首页轮播样式（production|classic|cinema|...；空/hero_banner=生产版）
    --logo)      LOGOFILE="$2"; shift 2;;  # 加载页 LOGO 图片（png/jpg/svg/webp）
    --no-logo)   NOLOGO=1; shift;;         # 加载页不使用 LOGO
    --logo-width) LOGOW="$2"; shift 2;;    # 加载页 LOGO 显示宽度 px
    --favicon)   FAVICONFILE="$2"; shift 2;;   # 浏览器标签图标（单独）
    --no-favicon) NOFAVICON=1; shift;;          # 不替换浏览器标签图标（保留 Emby 自带）
    --imgproxy)  DEPLOY_IMGPROXY=1; shift;;     # 部署时顺带安装图片代理
    --proxy)     VANVY_PROXY_URL="$2"; export VANVY_PROXY_URL; shift 2;;       # 图片代理出网代理(HTTP/SOCKS5)
    --proxy-mode) VANVY_PROXY_MODE="$2"; export VANVY_PROXY_MODE; shift 2;;    # auto|all|none
    --proxy-port) VANVY_IMG_PORT="$2"; export VANVY_IMG_PORT; shift 2;;        # 图片代理监听端口
    --img-proxy) VANVY_IMG_PROXY="$2"; export VANVY_IMG_PROXY; shift 2;;      # 图片代理对外地址
    --avdb)      VANVY_AVDB_BASE="$2"; export VANVY_AVDB_BASE; shift 2;;      # AVDB 引擎地址
    --avdb-key)  VANVY_AVDB_KEY="$2"; export VANVY_AVDB_KEY; shift 2;;        # AVDB API Key
    --metatube)  VANVY_METATUBE_BASE="$2"; export VANVY_METATUBE_BASE; shift 2;;  # MetaTube 后端地址
    --tmdb-key)  VANVY_TMDB_KEY="$2"; export VANVY_TMDB_KEY; shift 2;;        # TMDB API Key（写入连接器配置）
    --lstyle-login) VANVY_LOGIN_STYLE="$2"; export VANVY_LOGIN_STYLE; shift 2;;  # 登录页风格(glass/aurora/cinema/minimal/split/neon/paper/orbital)
    --socks5)    VANVY_PROXY_URL="$2"; export VANVY_PROXY_URL; shift 2;;      # 上游 SOCKS5 代理（同 --proxy）
    --doc-url)   VANVY_DOC_URL="$2"; export VANVY_DOC_URL; shift 2;;  # 安装引导页地址
    --yes|-y)    ASSUME_YES=1; shift;;
    --uninstall) MODE="uninstall"; shift;;
    --list)      LIST_ONLY=1; shift;;
    *) warn "忽略未知参数: $1"; shift;;
  esac
done

banner() {
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════════╗"
  echo "  ║   🦐 Vanvy Emby Suite (VES) · 统一安装器                       ║"
  echo "  ║   预热加载 · 首页轮播 · 详情页Hero · 播放器 · JAV · 毛玻璃      ║"
  echo ""
  echo "  📖 安装引导（图文教程 · 首次安装建议先看）"
  _doc="$(vanvy_doc_url 2>/dev/null || true)"
  if [ -n "$_doc" ]; then
    echo "     ${C_ASK}${_doc}${C_OFF}"
  else
    echo "     ${C_DIM}随包文档 docs/INSTALL.md（部署细节 docs/DEPLOY.md）${C_OFF}"
  fi
  echo ""
}

# 是否具备可交互终端（有控制终端就能问问题）
if [ -r /dev/tty ]; then HAS_TTY=1; else HAS_TTY=0; fi

# 归一化终端输入：清掉 ANSI/控制字符，尤其是「粘贴」时终端自动加的
#   bracketed-paste 标记 ESC[200~ … ESC[201~。
#   ⚠️ 不清洗的后果（2026-09-14 用户实测）：粘贴 "1,2,3,…" 后首个 token 变成
#   "[200~1" → 被当成非法功能项丢弃 → 功能①丢失 → 加载页 LOGO/标签图标提问整段消失。
_sanitize_input() {
  printf '%s' "$1" | tr -d '\r\000-\010\013\014\016-\037' | sed -e 's/\[200~//g' -e 's/\[201~//g'
}

uread() {
  # 只从控制终端读答案。
  # 🔴 绝对不要读 stdin：`curl … | bash` 时 stdin 是脚本本体，
  #    读它要么「吞掉后面的脚本」，要么在 EOF 处拿到空值 → 所有提问都取默认值
  #    → 变成「不问自装」（2026-09-13 用户实测踩到，教训严重）。
  #    无控制终端时本函数返回空串，由调用方决定「用默认值」还是「直接中止」。
  local __v="$1" __d="$2" __r=""
  if [ "$HAS_TTY" = "1" ]; then
    read -r __r </dev/tty 2>/dev/null || __r=""
    __r="$(_sanitize_input "$__r")"
  fi
  eval "$__v=\"\${__r:-\$__d}\""
}

# 关键提问专用：拿不到用户答案（无终端 / 输入结束）→ **直接中止**，绝不用默认值蒙混。
#   用于「装到哪个容器」「是否确认安装」这类一旦猜错就会改坏别人环境的提问。
uread_req() {
  local __v="$1" __d="$2" __why="$3" __r=""
  if [ "$HAS_TTY" = "1" ]; then
    read -r __r </dev/tty 2>/dev/null || __r=""
    __r="$(_sanitize_input "$__r")"
  fi
  if [ -z "$__r" ]; then
    echo ""
    err "无法获取你的选择（${__why:-需要确认}）——已中止，未做任何修改。"
    echo "   ${C_DIM}非交互场景请显式传参，例如：${C_OFF}"
    echo "     bash install-ves.sh --container <容器名> --features 1,2,3 --yes"
    exit 2
  fi
  eval "$__v=\"\$__r\""
}

list_containers() { docker ps --format '{{.Names}}' 2>/dev/null | grep -i emby | sort; }

# 判断某容器是否**真的是 Emby 服务**（而不是名字里带 emby 的其它容器，如 nginx/海报工具）
#   判据：存在 /system/dashboard-ui/index.html 且其内容含 Emby 标记。
#   ⚠️ 没有这道闸门时，名字里带 emby 的其它容器会被误装（2026-09-13 教训）。
is_emby_container() {
  local c="$1" wp
  wp="$(docker exec "$c" sh -c '
    for p in /system/dashboard-ui /app/emby/dashboard-ui /opt/emby-server/system/dashboard-ui \
             /usr/lib/emby-server/system/dashboard-ui /config/dashboard-ui; do
      [ -f "$p/index.html" ] && { echo "$p"; break; }
    done' 2>/dev/null || true)"
  [ -n "$wp" ] || return 1
  docker exec "$c" sh -c "grep -qiE 'emby' '$wp/index.html'" >/dev/null 2>&1
}

banner

ALL="$(list_containers || true)"
if [ "$LIST_ONLY" = "1" ]; then echo "emby 容器："; echo "$ALL" | sed 's/^/  - /'; exit 0; fi
[ -n "$ALL" ] || { err "未发现 emby 容器（请确认 docker 可用）"; exit 1; }

# ─────────────────────────────────────────────────────────────
# ① 选容器
# ─────────────────────────────────────────────────────────────
if [ -z "$CONTAINER" ]; then
  # 🔴 无交互终端时**绝不自动挑容器**（否则会静默装到别人身上）
  if [ "$HAS_TTY" != "1" ]; then
    echo ""
    err "当前没有可交互终端，无法询问「要装到哪个容器」。"
    echo "   ${C_DIM}请显式指定，例如：${C_OFF}"
    echo "     curl -sL <安装脚本> | bash -s -- --container <容器名> --features 1,2,3 --yes"
    echo ""
    echo "   本机检测到的 emby 容器："
    echo "$ALL" | sed 's/^/     - /'
    exit 2
  fi
  echo "  ┌──────────────────────────────────────────────┐"
  echo "  │  🐳 选择目标容器                              │"
  i=1
  for c in $ALL; do
    img="$(docker ps --filter "name=^/${c}$" --format '{{.Image}}' 2>/dev/null | head -1)"
    tag=""
    is_emby_container "$c" || tag="  ${C_WARN}⚠ 非 Emby，会被拒绝${C_OFF}"
    printf "  │    [%d] %-16s %s%s\n" "$i" "$c" "$img" "$tag"
    i=$((i+1))
  done
  echo "  └──────────────────────────────────────────────┘"
  ask "选择 [1-$((i-1))]: "; uread_req CSEL "" "选择目标容器"
  # 校验为纯数字并夹在范围内（防 sed 打印全部行）
  case "$CSEL" in ''|*[!0-9]*) err "请输入容器编号（1-$((i-1))）"; exit 2;; esac
  [ "$CSEL" -lt 1 ] || [ "$CSEL" -gt "$((i-1))" ] && { err "编号超出范围（1-$((i-1))）"; exit 2; }
  CONTAINER="$(echo "$ALL" | sed -n "${CSEL}p" | head -1)"
fi
[ -n "$CONTAINER" ] || { err "未选择容器"; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { err "容器不存在: $CONTAINER"; exit 1; }
# 🔴 安全闸门：必须是真正的 Emby 服务，否则拒绝（防止误装到名字含 emby 的其它容器）
if ! is_emby_container "$CONTAINER"; then
  err "「$CONTAINER」看起来不是 Emby 服务（未找到含 Emby 标记的 dashboard-ui/index.html）。"
  echo "   ${C_DIM}为避免改坏其它容器，已中止。若确要强制安装：VES_FORCE_CONTAINER=1 重跑。${C_OFF}"
  [ "${VES_FORCE_CONTAINER:-0}" = "1" ] || exit 2
  warn "VES_FORCE_CONTAINER=1 → 跳过检查继续"
fi
# ── 环境探测：皮肤路径 + Emby 版本（多路兜底）──────────────
probe_env() {
  local c="$1"
  # 皮肤根目录（不同安装方式路径不同）
  local wp
  wp="$(docker exec "$c" sh -c '
    for p in /system/dashboard-ui /app/emby/dashboard-ui /opt/emby-server/system/dashboard-ui \
             /usr/lib/emby-server/system/dashboard-ui /config/dashboard-ui; do
      [ -f "$p/index.html" ] && { echo "$p"; break; }
    done' 2>/dev/null || true)"
  [ -n "$wp" ] && WEB="$wp"

  # Emby 版本：查询容器内 8096 端口的 Public Info（不依赖宿主端口映射）
  local v
  v="$(docker exec "$c" sh -c '
    (curl -s -m 4 http://127.0.0.1:8096/emby/System/Info/Public 2>/dev/null \
     || wget -qO- -T 4 http://127.0.0.1:8096/emby/System/Info/Public 2>/dev/null) | head -c 800' 2>/dev/null \
    | grep -oE "\"Version\":\"[0-9.]+\"" | grep -oE "[0-9.]+" | head -1 || true)"
  VER="${v:-未知}"
}
probe_env "$CONTAINER"
ok "目标容器：$CONTAINER  Emby ${VER}  皮肤: $WEB"

# 兼容性提示（只警告，不阻塞）
case "$VER" in
  4.8.*|4.9.*) : ;;
  4.10.*|4.11.*) warn "Emby $VER 未充分测试，如异常请回滚（--uninstall）" ;;
  未知) warn "无法探测 Emby 版本（继续，功能不受影响）" ;;
  *) warn "Emby $VER 未经测试" ;;
esac

# ─────────────────────────────────────────────────────────────
# ② 卸载
# ─────────────────────────────────────────────────────────────
if [ "$MODE" = "uninstall" ]; then
  info "卸载 VES 全部组件（$CONTAINER）"
  # 尽力清干净（无论选择哪种轮播/样式）
  bash "$SRC_DIR/components/loading/vanvy/install-loading.sh" --container "$CONTAINER" --uninstall 2>/dev/null || true
  docker exec "$CONTAINER" sh -c "cd $WEB && sed -i '/vanvy-loading\/config.js/d' index.html" 2>/dev/null || true
  bash "$SRC_DIR/components/home/banner_home/install.sh"      --container "$CONTAINER" --uninstall 2>/dev/null || true
  bash "$SRC_DIR/components/features/detail/install-detail.sh" --container "$CONTAINER" --uninstall 2>/dev/null || true
  bash "$SRC_DIR/components/home/banner_designer/install-banner-designer.sh" --container "$CONTAINER" --uninstall >/dev/null 2>&1 || true
  bash "$SRC_DIR/components/home/hero_studio/install-hero-studio.sh" --container "$CONTAINER" --uninstall >/dev/null 2>&1 || true
  bash "$SRC_DIR/components/features/list_trailer/install-list-trailer.sh" --container "$CONTAINER" --uninstall >/dev/null 2>&1 || true
  bash "$SRC_DIR/components/features/login/install-login.sh" --container "$CONTAINER" --uninstall >/dev/null 2>&1 || true
  # 图片代理服务（若装过）也一并卸
  [ -f "$SRC_DIR/components/imgproxy/install-imgproxy.sh" ] && bash "$SRC_DIR/components/imgproxy/install-imgproxy.sh" --uninstall >/dev/null 2>&1 || true
  # ⚠️ vanvy-core/vanvy-registry.js 那行没有 VANVY-VES 标记，必须单独删，否则 404
  docker exec "$CONTAINER" sh -c "cd $WEB && sed -i '/VANVY-VES/d' index.html; sed -i '/vanvy-core\/vanvy-registry.js/d' index.html; sed -i '/vanvy-detail\/config.js/d' index.html; sed -i '/vanvy-detail-boot/d' index.html; sed -i '/vanvy-list-trailer\//d' index.html; sed -i '/vanvy-login\//d' index.html; sed -i '/vanvy-detail\/vanvy-detail\.\(js\|css\)/d' index.html; sed -i '/vanvy-home\/vanvy-home\.\(js\|css\)/d' index.html; sed -i '/vanvy-loading\/vanvy-loading\.\(js\|css\)/d' index.html; rm -rf vanvy-detail vanvy-home vanvy-loading vanvy-list-trailer vanvy-login vanvy-core vanvy vanvy-hero"
  # 清理遗留备份目录（含旧版卸载分支误生成的 .bak-vanvy-<TS>.index.html 散文件）
  docker exec "$CONTAINER" sh -c "cd $WEB && ls -d .bak-vanvy-* 2>/dev/null | xargs -r rm -rf" 2>/dev/null || true
  ok "已卸载（含图片代理/残留注入/备份）。浏览器 Ctrl+F5 强刷。"
  exit 0
fi

# ─────────────────────────────────────────────────────────────
# ②b 沿用容器现有配置（未显式指定时**不覆盖**）
#     背景：部分部署（如只装 --features 3）或忘传参时，
#     旧逻辑回退到默认值，会把用户选好的配色/毛玻璃/每行数/加载样式冲掉。
# ─────────────────────────────────────────────────────────────
if [ -n "$CONTAINER" ]; then
  _EC="$(docker exec "$CONTAINER" cat "$WEB/vanvy-detail/config.js" 2>/dev/null || true)"
  _EL="$(docker exec "$CONTAINER" cat "$WEB/vanvy-loading/config.js" 2>/dev/null || true)"
  if [ -z "$THEME" ] && [ -n "$_EC" ]; then
    _t="$(printf '%s' "$_EC" | grep -oE "theme: *'[^']+'" | head -1 | sed "s/.*'\\(.*\\)'.*/\\1/")"
    [ -n "$_t" ] && { THEME="$_t"; info "未指定 --theme → 沿用现有配色: $THEME"; }
  fi
  if [ -z "$PERROW" ] && [ -n "$_EC" ]; then
    _p="$(printf '%s' "$_EC" | grep -oE "perRow: *[0-9]+" | head -1 | grep -oE "[0-9]+")"
    [ -n "$_p" ] && { PERROW="$_p"; info "未指定 --perrow → 沿用现有每行数: $PERROW"; }
  fi
  if [ -z "$FROST" ] && [ -n "$_EC" ]; then
    _fb="$(printf '%s' "$_EC" | grep -oE "frostBlur: *[0-9]+" | head -1 | grep -oE "[0-9]+")"
    case "$_fb" in
      0)  FROST=off;    info "未指定 --frost → 沿用现有毛玻璃: off";;
      10) FROST=weak;   info "未指定 --frost → 沿用现有毛玻璃: weak";;
      18) FROST=mid;    info "未指定 --frost → 沿用现有毛玻璃: mid";;
      32) FROST=strong; info "未指定 --frost → 沿用现有毛玻璃: strong";;
    esac
  fi
  if [ -z "$LSTYLE" ] && [ -n "$_EL" ]; then
    _ls="$(printf '%s' "$_EL" | grep -oE "style: *'[^']*'" | head -1 | sed "s/.*'\\(.*\\)'.*/\\1/")"
    [ -n "$_ls" ] && { LSTYLE="$_ls"; info "未指定 --lstyle → 沿用现有加载样式: $LSTYLE"; }
  fi
fi

# ─────────────────────────────────────────────────────────────
# ③ 功能多选
# ─────────────────────────────────────────────────────────────
if [ -z "$FEATURES" ]; then
  echo "  ┌──────────────────────────────────────────────────────────┐"
  echo "  │  ⚡ 功能多选（逗号分隔；0=不装）                          │"
  i=1
  for nm in "${FEAT_NAMES[@]}"; do printf "  │    [%d] %-50s│\n" "$i" "$nm"; i=$((i+1)); done
  echo "  └──────────────────────────────────────────────────────────┘"
  echo "  ${C_DIM}提示：4/5/6 依赖 3（详情页）；选 0 只卸载不装${C_OFF}"
  _defk=""; _i=1; while [ "$_i" -le "$FEAT_MAX" ]; do _defk="${_defk:+$_defk,}$_i"; _i=$((_i+1)); done
  ask "选择 [默认 $_defk]: "; uread FSEL "$_defk"
  FEATURES="$FSEL"
fi
# 归一化功能选择串：all/全选/* → 全选；全角数字/逗号 → 半角
case "$(printf '%s' "$FEATURES" | tr -d ' \t' | tr 'A-Z' 'a-z')" in
  all|全选|全部|\*) FEATURES="$(seq -s, 1 "$FEAT_MAX")";;
esac
FEATURES="$(printf '%s' "$FEATURES" | sed -e 's/，/,/g; s/０/0/g; s/１/1/g; s/２/2/g; s/３/3/g; s/４/4/g; s/５/5/g; s/６/6/g; s/７/7/g; s/８/8/g; s/９/9/g')"
SEL=(); _BAD=""
for n in $(echo "$FEATURES" | tr ',' ' '); do
  case "$n" in
    '') continue;;
    *[!0-9]*)
      # 兼容直接写功能名（如 --features loading,detail），不区分大小写
      _n="$(printf '%s' "$n" | tr 'A-Z' 'a-z')"
      case " $FEAT_KEYS " in *" $_n "*) SEL+=("$_n");; *) _BAD="${_BAD:+$_BAD、}[$n]";; esac
      ;;
    *)
      [ "$n" -ge 1 ] && [ "$n" -le "$FEAT_MAX" ] || { _BAD="${_BAD:+$_BAD、}[$n·越界]"; continue; }
      SEL+=("$(echo "$FEAT_KEYS" | cut -d' ' -f"$n")")
      ;;
  esac
done
# 有被丢弃的项就明确报出来（避免「静默少装」——功能①被丢时加载页提问会整段消失）
if [ -n "$_BAD" ]; then
  warn "无法识别的功能项，已忽略：$_BAD"
  echo "   ${C_DIM}有效输入：1-${FEAT_MAX}（逗号分隔）或功能名；留空 / 输入 all = 全选${C_OFF}"
fi
# 归一化去重（⚠️ 不能写成 SEL=("${UNIQ[@]:-}")：空数组会展开成一个空串，
#   导致后面的「未选择任何功能」检查失效 → 什么也不装却报部署成功）
UNIQ=(); for s in "${SEL[@]:-}"; do [ -z "$s" ] && continue; case " ${UNIQ[*]:-} " in *" $s "*) ;; *) UNIQ+=("$s");; esac; done
SEL=(); [ "${#UNIQ[@]}" -gt 0 ] && SEL=("${UNIQ[@]}")
has() { case " ${SEL[*]:-} " in *" $1 "*) return 0;; *) return 1;; esac; }

# 依赖：4/5/6 → 3
if { has players || has jav || has frost; } && ! has detail; then
  warn "播放器/JAV/毛玻璃 依赖详情页组件，已自动加入 [3]"
  SEL+=("detail")
fi

if [ "${#SEL[@]}" = "0" ]; then
  warn "未选择任何功能。"; exit 0
fi

# ─────────────────────────────────────────────────────────────
# ④ 配色
# ─────────────────────────────────────────────────────────────
if [ -z "$THEME" ]; then
  echo "  ┌──────────────────────────────────────┐"
  echo "  │  🎨 配色（10 选 1）                    │"
  i=1
  for k in $THEME_KEYS; do nm="$(echo $THEME_NAMES | cut -d' ' -f$i)"; printf "  │    [%2d] %-8s %s\n" "$i" "$nm" "$k"; i=$((i+1)); done
  echo "  └──────────────────────────────────────┘"
  ask "选择 [1-10, 默认 2 黑金]: "; uread TSEL "2"
  THEME="$(echo $THEME_KEYS | cut -d' ' -f"$TSEL")"
fi
case " $THEME_KEYS " in *" $THEME "*) ;; *) warn "无效配色，回落 blackgold"; THEME=blackgold;; esac
ok "配色：$THEME"

# ─────────────────────────────────────────────────────────────
# ⑤ 参数
# ─────────────────────────────────────────────────────────────
if has frost; then
  if [ -z "$FROST" ]; then
    echo "  ┌──────────────────────────────────────┐"
    echo "  │  🧊 毛玻璃强度                        │"
    echo "  │    [1] 关   (0px)                     │"
    echo "  │    [2] 弱   (10px) 默认                │"
    echo "  │    [3] 中   (18px)                     │"
    echo "  │    [4] 强   (32px)                     │"
    echo "  └──────────────────────────────────────┘"
    ask "选择 [1-4, 默认 2 弱]: "; uread FRSEL "2"
    case "$FRSEL" in 1) FROST=off;; 3) FROST=mid;; 4) FROST=strong;; *) FROST=weak;; esac
  fi
fi
case "${FROST:-weak}" in
  off)    FROST_BLUR=0;  FROST_TINT=0.0;;
  weak)   FROST_BLUR=10; FROST_TINT=0.42;;
  mid)    FROST_BLUR=18; FROST_TINT=0.70;;
  strong) FROST_BLUR=32; FROST_TINT=0.72;;
  *)      FROST_BLUR=10; FROST_TINT=0.42; FROST=weak;;
esac

if has detail && [ -z "$PERROW" ]; then
  ask "每行卡片数（详情页内容行）[默认 6]: "; uread PERROW "6"
fi
case "${PERROW:-6}" in ''|*[!0-9]*) PERROW=6;; esac
[ "$PERROW" -ge 3 ] && [ "$PERROW" -le 10 ] || PERROW=6

# ─────────────────────────────────────────────────────────────
# ⑤a 加载页样式（若装了加载页）
# ─────────────────────────────────────────────────────────────
# 首页轮播样式（HERO 工作室新开发优先，其后为设计师系列）
if has home && [ -z "$BSTYLE" ]; then
  BCANDS=(
    "hero_banner|★ 生产版|经典满屏 Hero，最稳妥（官方推荐）"
    "classic|经典满屏|底部文案 + 左右箭头 + 分页点"
    "cinema|电影感|满屏背景 + 右侧可滚动缩略图轨"
    "spotlight|聚光|鼠标光斑跟随 + 3D 倾斜海报"
    "gallery|画廊|横向滑动大图廊（可拖拽/滚轮）"
    "wave|波浪|海报沿弧线起伏，当前卡发光"
    "mosaic|马赛克墙|左大图+右卡片列，全屏背景"
    "neo|霓虹赛博|霓虹灯管+扫描线+网格地面（历史款）"
    "glass|毛玻璃|玻璃卡片+模糊背景（历史款）"
    "orbital|太空轨道|星球轨道+星尘粒子（历史款）"
    "retro|复古胶片|胶片颗粒+VHS扫描（历史款）"
    "paper|纸艺|纸质分层+印刷质感（历史款）"
    "minimal|极简|超大排版+留白（历史款）"
    "light|日光|米白暖调（历史款，唯一亮色）"
  )
  # 过滤掉本机没有的
  BAVAIL=()
  for c in "${BCANDS[@]}"; do
    id="${c%%|*}"; rest="${c#*|}"; cn="${rest%%|*}"; desc="${rest#*|}"
    if [ "$id" = "hero_banner" ] || [ -d "$SRC_DIR/components/home/hero_studio/hero_$id" ] \
       || [ -d "$SRC_DIR/components/home/banner_designer/banner_$id" ]; then
      BAVAIL+=("$c")
    fi
  done
  if [ "${#BAVAIL[@]}" -gt 0 ]; then
    echo ""
    echo "  🎬 首页轮播样式"
    echo "  ──────────────────────────────────────────────────────────────"
    i=0
    for c in "${BAVAIL[@]}"; do
      rest="${c#*|}"; cn="${rest%%|*}"; desc="${rest#*|}"
      boxrow2 "$(printf '[%2d] %s' "$i" "$cn")" "$desc"
      i=$((i+1))
    done
    echo "  ──────────────────────────────────────────────────────────────"
    ask "选择 [默认 0]: "; uread BSSEL "0"
    case "$BSSEL" in
      ''|*[!0-9]*) BSSEL=0;;
    esac
    if [ "$BSSEL" -ge 0 ] && [ "$BSSEL" -lt "${#BAVAIL[@]}" ]; then
      c="${BAVAIL[$BSSEL]}"; id="${c%%|*}"
      [ "$id" = "hero_banner" ] || BSTYLE="$id"
    fi
  fi
fi

# 加载页 LOGO（选装）
if has loading && [ "${NOLOGO:-0}" = "0" ] && [ -z "${LOGOFILE:-}" ]; then
  _ldef="无内置"
  [ -d "$SRC_DIR/components/loading/vanvy/logos/$CONTAINER" ] && _ldef="容器专属"
  [ "$_ldef" = "无内置" ] && [ -f "$SRC_DIR/components/loading/vanvy/logo/brand.png" ] && _ldef="通用"
  echo ""
  echo "  🖼 加载页 LOGO（可跳过）"
  echo "  ──────────────────────────────────────────────────────────────"
  echo "     [0] 用默认（${_ldef}）"
  echo "     [1] 指定图片文件或图片 URL（png/jpg/svg/webp）"
  echo "     [2] 不要 LOGO（只用文字 + 进度线）"
  ask "选择 [默认 0]: "; uread LSEL "0"
  case "$LSEL" in
    1) ask "图片路径或图片 URL: "; uread _lf ""; [ -n "$_lf" ] && LOGOFILE="$_lf";;
    2) NOLOGO=1;;
  esac
  if [ "${NOLOGO:-0}" = "0" ] && [ -z "${LOGOW:-}" ]; then
    ask "LOGO 显示宽度 px [默认 190]: "; uread _lw "190"
    case "$_lw" in ''|*[!0-9]*) _lw=190;; esac
    LOGOW="$_lw"
  fi
fi

# 浏览器标签图标 favicon（选装；与加载页 LOGO 相互独立）
# 登录页外观风格（8 套）
if has login && [ -z "${VANVY_LOGIN_STYLE:-}" ] && [ -f "$SRC_DIR/components/features/login/vanvy-login.js" ]; then
  echo ""
  echo "  🔐 登录页风格（字体/背景/卡片观感）"
  echo "  ──────────────────────────────────────────────────────────────"
  echo "     [0] 默认 · 黑金毛玻璃(glass)"
  echo "     [1] 极光(aurora)   [2] 影院(cinema)   [3] 极简浅色(minimal)"
  echo "     [4] 左右分屏(split) [5] 霓虹(neon)     [6] 纸感暖色(paper)"
  echo "     [7] 轨道(orbital)"
  echo "  ──────────────────────────────────────────────────────────────"
  ask "选择 [默认 0]: "; uread LGSEL "0"
  case "$LGSEL" in
    1) VANVY_LOGIN_STYLE=aurora;;  2) VANVY_LOGIN_STYLE=cinema;;
    3) VANVY_LOGIN_STYLE=minimal;; 4) VANVY_LOGIN_STYLE=split;;
    5) VANVY_LOGIN_STYLE=neon;;    6) VANVY_LOGIN_STYLE=paper;;
    7) VANVY_LOGIN_STYLE=orbital;; *) VANVY_LOGIN_STYLE=glass;;
  esac
  export VANVY_LOGIN_STYLE
fi

# 优先级: --favicon 文件 > --no-favicon > 交互选择
if has loading && [ "${NOFAVICON:-0}" = "0" ] && [ -z "${FAVICONFILE:-}" ]; then
  echo ""
  echo "  🏷 浏览器标签图标（favicon，可跳过）"
  echo "  ──────────────────────────────────────────────────────────────"
  echo "     [0] 用加载页 LOGO（默认）"
  echo "     [1] 单独指定图片文件或 URL（png/ico/jpg/svg）"
  echo "     [2] 不替换（保留 Emby 自带标签图标）"
  ask "选择 [默认 0]: "; uread FVSEL "0"
  case "$FVSEL" in
    1) ask "标签图标路径: "; uread _ff ""; [ -n "$_ff" ] && FAVICONFILE="$_ff";;
    2) NOFAVICON=1;;
  esac
fi

if has loading && [ -z "$LSTYLE" ]; then
  LCANDS=(
    "|默认 · 极简进度|LOGO + 文案 + 细进度线（推荐，最耐看）"
    "aurora|极光|极光渐变 + 8 颗浮粒子 + 双层旋转光环"
    "cinema|影院|胶片卷轴环抱 LOGO + 放映机光束"
    "split|分屏|左右异色面板 + 中缝分隔线"
    "minimal|极简|只有三点脉冲动画，最轻量"
    "logo|纯 LOGO|品牌 LOGO 呼吸发光"
    "orbit|轨道|三层同心轨道反向自转 + 卫星点 + 扫描光"
    "pulse|声波|16 根频谱音柱错峰起伏 + 中央光晕（影音感）"
  )
  LAVAIL=()
  for c in "${LCANDS[@]}"; do
    id="${c%%|*}"; rest="${c#*|}"
    if [ -z "$id" ] || [ -f "$SRC_DIR/components/loading/$id/style.css" ]; then
      LAVAIL+=("$c")
    fi
  done
  if [ "${#LAVAIL[@]}" -gt 0 ]; then
    echo ""
    echo "  🎞 加载页样式"
    echo "  ──────────────────────────────────────────────────────────────"
    i=0
    for c in "${LAVAIL[@]}"; do
      rest="${c#*|}"; cn="${rest%%|*}"; desc="${rest#*|}"
      boxrow2 "$(printf '[%2d] %s' "$i" "$cn")" "$desc"
      i=$((i+1))
    done
    echo "  ──────────────────────────────────────────────────────────────"
    ask "选择 [默认 0]: "; uread LSSEL "0"
    case "$LSSEL" in ''|*[!0-9]*) LSSEL=0;; esac
    if [ "$LSSEL" -gt 0 ] && [ "$LSSEL" -lt "${#LAVAIL[@]}" ]; then
      c="${LAVAIL[$LSSEL]}"; LSTYLE="${c%%|*}"
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────
# ⑤b 后端依赖（JAV 增强需要可选服务；不填=自动降级）
# ─────────────────────────────────────────────────────────────
# 图片代理一键部署（选择本机安装时调用）
deploy_imgproxy() {
  # ① 出网代理（HTTP / SOCKS5）
  vanvy_ask_env VANVY_PROXY_URL "   出网代理（HTTP/SOCKS5，可留空=直连；多个用逗号分隔）" ""
  if [ -n "${VANVY_PROXY_URL:-}" ]; then
    for _p in $(printf '%s' "$VANVY_PROXY_URL" | tr ',' ' '); do
      case "$_p" in
        http://*|https://*|socks5://*|socks5h://*) : ;;
        *) warn "代理格式可疑（应以 http:// https:// socks5:// socks5h:// 开头）: $_p" ;;
      esac
    done
  else
    info "未填出网代理 → 图片代理将直连图床（仅适合图床本身可访问）"
  fi
  # ② 代理模式
  if [ -z "${VANVY_PROXY_MODE:-}" ]; then
    echo "     代理模式：[1] auto 仅墙外域名(推荐)  [2] all 全部  [3] none 从不"
    ask "     选择 [默认 1]: "; uread _pms "1"
    case "$_pms" in 2) VANVY_PROXY_MODE=all;; 3) VANVY_PROXY_MODE=none;; *) VANVY_PROXY_MODE=auto;; esac
  fi
  # ③ 端口
  if [ -z "${VANVY_IMG_PORT:-}" ]; then
    ask "     监听端口 [默认 18098]: "; uread _pt "18098"
    case "$_pt" in ''|*[!0-9]*) _pt=18098;; esac
    VANVY_IMG_PORT="$_pt"
  fi
  export VANVY_PROXY_URL VANVY_PROXY_MODE VANVY_IMG_PORT
  # ④ 部署（root+systemd 优先，否则 docker）
  local _imode=""
  if [ "$(id -u 2>/dev/null)" = "0" ] && command -v systemctl >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    _imode="--systemd"
  elif command -v docker >/dev/null 2>&1; then
    _imode="--docker"
  fi
  if [ -z "$_imode" ]; then
    warn "本机既无 root+systemd 也无 docker → 跳过自动部署（可手动跑 components/imgproxy/install-imgproxy.sh）"
  else
    info "部署图片代理（$_imode）..."
    local -a _iargs=("$_imode" --mode "$VANVY_PROXY_MODE" --port "$VANVY_IMG_PORT")
    [ -n "${VANVY_PROXY_URL:-}" ] && _iargs+=(--proxy "$VANVY_PROXY_URL")
    [ -n "${VANVY_TMDB_KEY:-}" ] && _iargs+=(--tmdb-key "$VANVY_TMDB_KEY")
    bash "$SRC_DIR/components/imgproxy/install-imgproxy.sh" "${_iargs[@]}" || warn "图片代理部署失败（不影响其它组件）"
  fi
  # ④b TMDB API Key（可选）—— 让「正经库资料增强」在只配代理的机器上也能用
  if [ -z "${VANVY_TMDB_KEY:-}" ]; then
    echo "     TMDB API Key（可选，留空=正经库资料增强仅走本机 enrich 服务）"
    echo "       获取：themoviedb.org → 设置 → API；填了才开放 /tmdb 通道"
    ask "     粘贴 Key [留空跳过]: "; uread _tk ""
    [ -n "$_tk" ] && VANVY_TMDB_KEY="$_tk"
    _tk=""
  fi
  export VANVY_TMDB_KEY

  # ⑤ 对外访问地址（填进 Emby 前端）
  local _lanip _idef
  _lanip="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -n "$_lanip" ] || _lanip="<本机IP>"
  _idef="http://$_lanip:$VANVY_IMG_PORT"
  vanvy_ask_env VANVY_IMG_PROXY "   连接器对外地址（可填多个用逗号分隔，例 http://$_lanip:$VANVY_IMG_PORT,https://你的域名/vdimg）" "$_idef"
  info "提示：填多个时前端会自动挑可用的 → 在家走内网、在外走公网。"
  info "      若 Emby 走 HTTPS，公网地址也需 HTTPS（可 nginx 反代 /vdimg/，片段见 components/imgproxy/nginx-vdimg.conf）"
}

if has jav; then
  if [ -z "${VANVY_METATUBE_BASE:-}" ] && [ -z "${VANVY_AVDB_BASE:-}" ]; then
    echo "  ┌────────────────────────────────────────────────────────────────┐"
    echo "  │  🧩 JAV 增强 · 可选后端（不填 = 自动降级，不影响其它模块）      │"
    echo "  ├────────────────────────────────────────────────────────────────┤"
    echo "  │  ① MetaTube —— JAV 元数据（番号/演员/标签/封面）                │"
    echo "  │     填法：http://<主机>:<端口>        例 http://192.168.1.10:28080│"
    echo "  │     获取：github.com/metatube-community（Emby/Jellyfin 刮削服务）│"
    echo "  │     不填 → JAV 页只显示 Emby 本地已有的信息                      │"
    echo "  ├────────────────────────────────────────────────────────────────┤"
    echo "  │  ② AVDB —— JavDB 搜索 / 短评 / 图片解码                         │"
    echo "  │     填法：http://<主机>:<端口>        例 http://192.168.1.10:38000│"
    echo "  │     需配套 API Key（形如 9a60dc…，在该引擎后台查看）             │"
    echo "  ├────────────────────────────────────────────────────────────────┤"
    echo "  │  ③ 图片代理 —— 图床被墙时转发（JavDB封面/YouTube缩略图）         │"
    echo "  │     [0] 跳过（部分图不显示，其它模块不受影响）                    │"
    echo "  │     [1] 我已有图片代理服务 → 填地址（例 https://你的域名/vdimg）  │"
    echo "  │     [2] 本机一键部署（会问你出网代理 HTTP/SOCKS5，可留空=直连）   │"
    echo "  ├────────────────────────────────────────────────────────────────┤"
    echo "  │  💡 地址一律带 http:// 或 https:// 前缀；内网填内网 IP 即可       │"
    echo "  │  💡 不确定能否连通？可先留空安装，之后编辑容器内 config.js 补上    │"
    echo "  └────────────────────────────────────────────────────────────────┘"
    ask "是否配置后端服务？[y/N]: "; uread USEBE "n"
    case "$USEBE" in
      y|Y|yes|YES)
        # ① 先问：本机一键构建 还是 填已有地址（主人 2026-09-13）
        echo "     ①/② 后端从哪来？"
        echo "         [1] 本机一键构建（docker 自动拉起 AVDB + MetaTube，推荐）"
        echo "         [2] 我已有这些服务 → 填地址"
        echo "         [0] 跳过（自动降级，其它模块不受影响）"
        ask "     选择 [默认 1]: "; uread EXTSEL "1"
        case "$EXTSEL" in
          1)
            if [ -x "$SRC_DIR/components/external/install-external.sh" ] || [ -f "$SRC_DIR/components/external/install-external.sh" ]; then
              _eip="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -n "$_eip" ] || _eip="<本机IP>"
              info "开始构建外部服务（AVDB + MetaTube，含各自 PostgreSQL）..."
              bash "$SRC_DIR/components/external/install-external.sh" --avdb --metatube \
                   ${VANVY_PROXY_URL:+--proxy "$VANVY_PROXY_URL"} --yes || warn "外部服务构建出现问题（可稍后单独重跑）"
              VANVY_METATUBE_BASE="${VANVY_METATUBE_BASE:-http://$_eip:28080}"
              VANVY_AVDB_BASE="${VANVY_AVDB_BASE:-http://$_eip:38000}"
              export VANVY_METATUBE_BASE VANVY_AVDB_BASE
              info "已自动回填：MetaTube=$VANVY_METATUBE_BASE  AVDB=$VANVY_AVDB_BASE"
            else
              warn "未找到 components/external/install-external.sh（旧包？）→ 请手动填地址"
              vanvy_ask_env VANVY_METATUBE_BASE "① MetaTube 地址" ""
              vanvy_ask_env VANVY_AVDB_BASE     "② AVDB 地址"     ""
            fi
            ;;
          2)
            vanvy_ask_env VANVY_METATUBE_BASE "① MetaTube 地址（例 http://192.168.1.10:28080；留空跳过）" ""
            vanvy_ask_env VANVY_AVDB_BASE     "② AVDB 地址（例 http://192.168.1.10:38000；留空跳过）"     ""
            ;;
          *) info "跳过外部后端（JAV 页仅显示 Emby 本地已有信息）";;
        esac
        if [ -n "${VANVY_AVDB_BASE:-}" ]; then
          vanvy_ask_env VANVY_AVDB_KEY   "   AVDB API Key（该引擎后台查看）"                       ""
        fi
        # ③ 图片代理：三选一（已有服务 / 本机部署 / 跳过）
        if [ -n "${VANVY_IMG_PROXY:-}" ]; then
          ok "图片代理已从 vanvy.env 读取：${VANVY_IMG_PROXY}"
        else
          echo "     ③ 图片代理：[0] 跳过  [1] 已有服务填地址  [2] 本机一键部署"
          ask "     选择 [默认 0]: "; uread IMGSEL "0"
          case "$IMGSEL" in
            1) vanvy_ask_env VANVY_IMG_PROXY "     连接器地址（可多个用逗号分隔：内网 http://IP:18098 与 公网 https://域名/vdimg）" "";;
            2) deploy_imgproxy;;
            *) info "跳过图片代理（JavDB 封面 / YouTube 缩略图可能不显示）";;
          esac
        fi
        # 简单格式校验
        for _v in VANVY_METATUBE_BASE VANVY_AVDB_BASE VANVY_IMG_PROXY; do
          _val="$(eval echo \"\${$_v:-}\")"
          case "$_val" in
            '') : ;;
            http://*|https://*) : ;;
            *) warn "$_v 看起来不像 URL（应以 http:// 或 https:// 开头）: $_val" ;;
          esac
        done
        ;;
      *) info "跳过后端配置 → JAV 增强仅使用本地库信息" ;;
    esac
  else
    ok "后端依赖已从 vanvy.env 读取（MetaTube=${VANVY_METATUBE_BASE:-无} AVDB=${VANVY_AVDB_BASE:-无} 图片代理=${VANVY_IMG_PROXY:-无}）"
  fi
fi

# ─────────────────────────────────────────────────────────────
# ⑥ 安装摘要
# ─────────────────────────────────────────────────────────────
echo ""
echo "  📖 安装引导 / 样式效果预览："
_doc="$(vanvy_doc_url 2>/dev/null || true)"
if [ -n "$_doc" ]; then
  echo "     图文教程  ${_doc}"
  case "$_doc" in
    */mockup/setup-guide/) echo "     样式预览  ${_doc%setup-guide/}";;
  esac
  echo "     部署细节  docs/DEPLOY.md"
else
  echo "     图文教程  随包文档 docs/INSTALL.md（部署细节 docs/DEPLOY.md）"
  echo "     ${C_DIM}（可选）--doc-url <网址> 或 vanvy.env 的 VANVY_DOC_URL 可指定引导页${C_OFF}"
fi
echo ""

FNAMES=""
for f in "${SEL[@]:-}"; do
  case "$f" in
    loading) FNAMES="${FNAMES:+$FNAMES }预热加载页";;
    home)    FNAMES="${FNAMES:+$FNAMES }首页轮播";;
    detail)  FNAMES="${FNAMES:+$FNAMES }详情页Hero";;
    players) FNAMES="${FNAMES:+$FNAMES }第三方播放器";;
    jav)     FNAMES="${FNAMES:+$FNAMES }JAV增强";;
    frost)   FNAMES="${FNAMES:+$FNAMES }毛玻璃";;
    trailer) FNAMES="${FNAMES:+$FNAMES }卡片预告片";;
    login)   FNAMES="${FNAMES:+$FNAMES }登录页美化";;
  esac
done
case "${BSTYLE:-}" in
  __prod__) _bn="生产版";;
  "")       _bn="生产版满屏轮播（官方推荐）";; classic) _bn="经典满屏 classic";;
  cinema)   _bn="电影感 cinema";;    spotlight) _bn="聚光 spotlight";;
  gallery)  _bn="画廊 gallery";;     wave)   _bn="波浪 wave";;
  mosaic)   _bn="马赛克墙 mosaic";;  neo)    _bn="霓虹赛博 neo";;
  glass)    _bn="毛玻璃 glass";;     orbital)_bn="太空轨道 orbital";;
  retro)    _bn="复古胶片 retro";;   paper)  _bn="纸艺 paper";;
  minimal)  _bn="极简 minimal";;     light)  _bn="日光 light";;
  *)        _bn="$BSTYLE";;
esac
case "${LSTYLE:-}" in
  "") _ln="默认极简进度";; aurora) _ln="极光 aurora";; cinema) _ln="影院 cinema";;
  split) _ln="分屏 split";; minimal) _ln="极简 minimal";; logo) _ln="纯LOGO logo";;
  *) _ln="$LSTYLE";;
esac
case "${FROST:-}" in
  off) _fn="关闭";; weak) _fn="弱";; mid) _fn="中";; strong) _fn="强";; *) _fn="${FROST:-}";;
esac

echo "  ┌──────────────────────────────────────────────────────────────"
echo "  │  📋 安装摘要"
echo "  ├──────────────────────────────────────────────────────────────"
kv() { printf '  │  %s %s\n' "$(dpad "$1" 10)" "$2"; }
kv "目标容器"  "$CONTAINER"
kv "将安装"    "${SEL[*]}"
kv "功能名称"  "${FNAMES# }"
kv "配色"      "$THEME"
has home    && kv "轮播样式" "$_bn"
has loading && kv "加载样式" "$_ln"
if has loading; then
  if [ "${NOLOGO:-0}" = "1" ]; then
    _lg="不使用（仅文字）"
  elif [ -n "${LOGOFILE:-}" ]; then
    _lg="自定义 $(basename "$LOGOFILE")"
  else
    _lg="默认"
  fi
  [ -n "${LOGOW:-}" ] && [ "${NOLOGO:-0}" != "1" ] && _lg="$_lg (${LOGOW}px)"
  kv "加载页LOGO" "$_lg"
  if [ "${NOFAVICON:-0}" = "1" ]; then
    _fv="不替换（Emby 自带）"
  elif [ -n "${FAVICONFILE:-}" ]; then
    _fv="自定义 $(basename "$FAVICONFILE")"
  else
    _fv="随加载页 LOGO"
  fi
  kv "标签图标" "$_fv"
fi
has frost   && kv "毛玻璃"   "$_fn (${FROST_BLUR}px / ${FROST_TINT})"
has detail  && kv "每行卡片" "$PERROW"
if has jav; then
  kv "后端依赖" "MetaTube = ${VANVY_METATUBE_BASE:-未配置（降级）}"
  kv ""         "AVDB     = ${VANVY_AVDB_BASE:-未配置（降级）}"
  kv ""         "图片代理 = ${VANVY_IMG_PROXY:-未配置（降级）}"
  [ -n "${VANVY_LOGIN_STYLE:-}" ] && kv "" "登录页风格 = ${VANVY_LOGIN_STYLE}"
fi
echo "  ├──────────────────────────────────────────────────────────────"
echo ""
if [ "$ASSUME_YES" != "1" ]; then
  # 🔴 无交互终端时不能「默认确认」（否则就是不问自装）
  if [ "$HAS_TTY" != "1" ]; then
    echo ""
    err "当前没有可交互终端，无法确认安装。"
    echo "   ${C_DIM}确认要装请显式加 --yes：${C_OFF}"
    echo "     bash install-ves.sh --container $CONTAINER --features <...> --yes"
    exit 2
  fi
  ask "确认安装？[Y/n]: "; uread_req CFM "" "确认安装"
  case "$CFM" in n|N|no|NO) err "已取消"; exit 0;; esac
fi

# ─────────────────────────────────────────────────────────────
# 执行
# ─────────────────────────────────────────────────────────────
TS=$(date +%Y%m%d-%H%M%S); BK="$WEB/.bak-vanvy-$TS"
docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/" && ok "已快照 index.html → $BK"
docker exec "$CONTAINER" sh -c "ls -dt $WEB/.bak-vanvy-* 2>/dev/null | tail -n +6 | xargs -r rm -rf" 2>/dev/null || true

FAIL=0

# ⓪ 共享内核（注册表）：所有模块共用，供后续扩展钩子
if [ -f "$SRC_DIR/lib/vanvy-registry.js" ]; then
  docker exec "$CONTAINER" sh -c "rm -rf $WEB/vanvy-core && mkdir -p $WEB/vanvy-core" 2>/dev/null || true
  docker cp "$SRC_DIR/lib/vanvy-registry.js" "$CONTAINER:$WEB/vanvy-core/vanvy-registry.js" 2>/dev/null \
    && ok "共享内核 vanvy-core ✔" || warn "共享内核部署失败（不影响主功能）"
fi

if has loading; then
  _largs=()
  [ "${NOLOGO:-0}" = "1" ] && _largs+=(--no-logo)
  if [ -n "${LOGOFILE:-}" ] && [ "${NOLOGO:-0}" = "0" ]; then _largs+=(--logo "$LOGOFILE"); fi
  [ -n "${LOGOW:-}" ] && [ "${NOLOGO:-0}" = "0" ] && _largs+=(--logo-width "$LOGOW")
  [ "${NOFAVICON:-0}" = "1" ] && _largs+=(--no-favicon)
  [ -n "${FAVICONFILE:-}" ] && _largs+=(--favicon "$FAVICONFILE")
  bash "$SRC_DIR/components/loading/vanvy/install-loading.sh" --container "$CONTAINER" --theme "$THEME" ${LSTYLE:+--style "$LSTYLE"} "${_largs[@]}" \
    && ok "预热加载页 ✔" || { err "预热加载页 失败"; FAIL=1; }
fi
# 参数规范化：--bstyle 接受 production / hero_banner / banner / default（都=生产版）
case "$BSTYLE" in production|hero_banner|banner|default|生产版) BSTYLE="__prod__";; esac

# ⚠️ 未指定 --bstyle 时不能直接回退到生产版！
#   部分部署（如只装 --features 3）或忘记传参，会把用户选好的轮播样式覆盖掉。
#   规则：未指定 → **沿用容器现有样式**（无则生产版）。
if has home && [ "$BSTYLE" = "" ]; then
  _cur_hero="$(docker exec "$CONTAINER" grep -oE "style: *'[A-Za-z_]+'" "$WEB/vanvy-hero/config.js" 2>/dev/null | head -1 | sed "s/.*'\\(.*\\)'.*/\\1/" || true)"
  if [ -n "$_cur_hero" ] && [ -d "$SRC_DIR/components/home/hero_studio/hero_$_cur_hero" ]; then
    BSTYLE="$_cur_hero"; info "未指定 --bstyle → 沿用现有轮播样式: $BSTYLE"
  elif [ -n "$_cur_hero" ] && [ -d "$SRC_DIR/components/home/banner_designer/banner_$_cur_hero" ]; then
    BSTYLE="$_cur_hero"; info "未指定 --bstyle → 沿用现有轮播样式: $BSTYLE"
  elif docker exec "$CONTAINER" sh -c "test -f $WEB/vanvy-home/vanvy-home.js" 2>/dev/null; then
    BSTYLE="__prod__"; info "未指定 --bstyle → 沿用现有轮播样式: 生产版"
  fi
fi
[ "$BSTYLE" = "__prod__" ] && BSTYLE=""

# 轮播样式合法性预检（在卸载任何东西之前！否则写错名字会把现有轮播卸掉）
if has home && [ -n "$BSTYLE" ]; then
  if [ ! -d "$SRC_DIR/components/home/hero_studio/hero_$BSTYLE" ] \
     && [ ! -d "$SRC_DIR/components/home/banner_designer/banner_$BSTYLE" ]; then
    err "未知轮播样式: $BSTYLE（保持现有轮播不变，未做任何修改）"
    echo "     可选：production | classic | cinema | spotlight | gallery | wave | mosaic | neo | glass | orbital | retro | paper | minimal | light"
    exit 2
  fi
fi

if has home; then
  # 两种轮播互斥：先全部卸载，再装选中的那款
  bash "$SRC_DIR/components/home/banner_home/install.sh" --container "$CONTAINER" --uninstall >/dev/null 2>&1 || true
  bash "$SRC_DIR/components/home/banner_designer/install-banner-designer.sh" --container "$CONTAINER" --uninstall >/dev/null 2>&1 || true
  bash "$SRC_DIR/components/home/hero_studio/install-hero-studio.sh" --container "$CONTAINER" --uninstall >/dev/null 2>&1 || true
  if [ -n "$BSTYLE" ]; then
    if [ -d "$SRC_DIR/components/home/hero_studio/hero_$BSTYLE" ]; then
      bash "$SRC_DIR/components/home/hero_studio/install-hero-studio.sh" --container "$CONTAINER" --style "$BSTYLE" --theme "$THEME" \
        && ok "首页轮播 ✔ (hero/$BSTYLE)" || { err "首页轮播 失败"; FAIL=1; }
    elif [ -d "$SRC_DIR/components/home/banner_designer/banner_$BSTYLE" ]; then
      bash "$SRC_DIR/components/home/banner_designer/install-banner-designer.sh" --container "$CONTAINER" --style "$BSTYLE" --theme "$THEME" \
        && ok "首页轮播 ✔ (designer/$BSTYLE)" || { err "首页轮播 失败"; FAIL=1; }
    else
      err "未知轮播样式: $BSTYLE"; FAIL=1
    fi
  else
    bash "$SRC_DIR/components/home/banner_home/install.sh" --container "$CONTAINER" --theme "$THEME" \
      && ok "首页轮播 ✔ (生产版)" || { err "首页轮播 失败"; FAIL=1; }
  fi
fi
if has trailer; then
  bash "$SRC_DIR/components/features/list_trailer/install-list-trailer.sh" --container "$CONTAINER" \
    && ok "卡片预告片 ✔" || { err "卡片预告片 失败"; FAIL=1; }
fi
if has login; then
  bash "$SRC_DIR/components/features/login/install-login.sh" --container "$CONTAINER" \
    && ok "登录页美化 ✔" || { err "登录页美化 失败"; FAIL=1; }
fi
if has detail; then
  bash "$SRC_DIR/components/features/detail/install-detail.sh" --container "$CONTAINER" --theme "$THEME" && ok "详情页组件 ✔" || { err "详情页组件 失败"; FAIL=1; }
  # 写入完整 config（覆盖 install-detail 的简化版）
  # ⚠️ SP/JP 不能只看「本次是否选中功能」：部分功能重部署（如只装 --features 3）
  #    会把播放器/JAV 误关。规则：选中=开；未选=**沿用容器现有值**（没配置则默认开）；
  #    可用 VANVY_SHOW_PLAYERS / VANVY_SHOW_JAV 显式覆盖。
  _old_cfg="$(docker exec "$CONTAINER" cat "$WEB/vanvy-detail/config.js" 2>/dev/null || true)"
  _ONELINE="$(printf '%s' "$_old_cfg" | tr '\n' ' ')"
  _keep() {  # _keep <键> <当前bool>
    printf '%s' "$_old_cfg" | grep -qE "$1: *true" && echo true && return
    printf '%s' "$_old_cfg" | grep -qE "$1: *false" && echo false && return
    echo "$2"
  }
  _oldstr() {  # _oldstr <键>  → 旧字符串值（去引号）；无则空
    printf '%s' "$_ONELINE" | sed -n "s/.*[ ,{]$1: *'\([^']*\)'.*/\1/p" | head -1
  }
  _oldraw() {  # _oldraw <键>  → 旧原始值（bool/数字；不含嵌套）
    printf '%s' "$_ONELINE" | sed -n "s/.*[ ,{]$1: *\([^,}]*\).*/\1/p" | head -1
  }
  _oldobj() {  # _oldobj <键>  → 旧嵌套对象 {…}（平衡括号，单行）
    printf '%s' "$_ONELINE" | awk -v k="$1:" '{
      idx = index($0, k); if (idx == 0) exit
      s = substr($0, idx + length(k)); p = index(s, "{"); if (p == 0) exit
      s = substr(s, p); d = 0; out = ""
      for (i = 1; i <= length(s); i++) { c = substr(s, i, 1); out = out c
        if (c == "{") d++; else if (c == "}") { d--; if (d == 0) break } }
      print out
    }'
  }
  _has() { printf '%s' "$_ONELINE" | grep -qE "[ ,{]$1: " ; }
  # 未传环境变量时 → 沿用容器现有值（避免重部署把已配好的东西凒掉）
  _keepstr() {  # _keepstr <键> <env值> <默认>
    if [ -n "$2" ]; then printf '%s' "$2"; return; fi
    if _has "$1"; then _oldstr "$1"; return; fi
    printf '%s' "$3"
  }
  _keepraw() {  # _keepraw <键> <env值> <默认>
    if [ -n "$2" ]; then printf '%s' "$2"; return; fi
    if _has "$1"; then _oldraw "$1"; return; fi
    printf '%s' "$3"
  }
  SP="true"; JP="true"
  has players || SP="$(_keep showPlayers true)"
  has jav     || JP="$(_keep showJav true)"
  case "${VANVY_SHOW_PLAYERS:-}" in true|false) SP="$VANVY_SHOW_PLAYERS";; esac
  # 逗号分隔 → JS 数组字面量（用于 enrichBases 等）
  _json_arr() {
    [ -n "$1" ] || { printf ''; return; }
    printf '%s' "$1" | tr ',' '\n' | awk 'NF{gsub(/^[ \t]+|[ \t]+$/,"");
      printf "%s\"%s\"", (n++?",":""), $0}'
  }
  case "${VANVY_SHOW_JAV:-}" in true|false) JP="$VANVY_SHOW_JAV";; esac
  # 演员别名映射（JSON）：显式传入 → 用新的；未传 → 沿用现有；都没有 → {}
  ALIAS_JSON="${VANVY_ACTOR_ALIAS:-}"
  if [ -z "$ALIAS_JSON" ] && _has actorAlias; then
    ALIAS_JSON="$(_oldobj actorAlias)"
  fi
  [ -n "$ALIAS_JSON" ] || ALIAS_JSON='{}'
  case "$ALIAS_JSON" in '{'*'}'|'['*']') : ;; *) warn "VANVY_ACTOR_ALIAS 不是合法 JSON → 已忽略"; ALIAS_JSON='{}';; esac
  # 元数据源 / 图片代理：未传 → 沿用现有（否则重部署会静默清空）
  META_BASE="$(_keepstr metaTubeBase "${VANVY_METATUBE_BASE:-}" "")"
  AVDB_BASE="$(_keepstr avdbBase    "${VANVY_AVDB_BASE:-}" "")"
  AVDB_KEY="$(_keepstr avdbKey      "${VANVY_AVDB_KEY:-}" "")"
  IMG_PROXY="$(_keepstr imgProxyBase "${VANVY_IMG_PROXY:-}" "")"
  # 二期开关（可整体关：VANVY_P2=off；或单项 VANVY_P2_SORT=off 等）
  #   单项未传 → 沿用现有；都没有 → 默认 on
  if [ "${VANVY_P2:-}" = "off" ]; then
    P2_JSON='{}'
  else
    _p2k() {  # _p2k <键> <env原始值(未传为空)>  → true/false，未传则沿用现有
      if [ -n "$2" ]; then [ "$2" = "off" ] && echo false || echo true; return; fi
      printf '%s' "$_ONELINE" | grep -qE "$1: *false" && { echo false; return; }
      printf '%s' "$_ONELINE" | grep -qE "$1: *true"  && { echo true;  return; }
      echo true
    }
    P2_JSON="{
    sortEpisodes: $(_p2k sortEpisodes "${VANVY_P2_SORT-}"),
    castContextMenu: $(_p2k castContextMenu "${VANVY_P2_CASTMENU-}"),
    sectionMore: $(_p2k sectionMore "${VANVY_P2_MORE-}"),
    javSeriesWall: $(_p2k javSeriesWall "${VANVY_P2_SERIESWALL-}"),
    mediaInfoPanel: $(_p2k mediaInfoPanel "${VANVY_P2_MEDIAINFO-}"),
    headerGlass: $(_p2k headerGlass "${VANVY_P2_HEADER-}"),
    inheritSeriesLogo: $(_p2k inheritSeriesLogo "${VANVY_P2_SERIESLOGO-}"),
    extSitesFull: $(_p2k extSitesFull "${VANVY_P2_EXTSITES-}"),
    hideRealPath: $(_p2k hideRealPath "${VANVY_P2_HIDEPATH-}"),
    enrich: $(_p2k enrich "${VANVY_P2_ENRICH-}"),
    enrichBases: [$(_json_arr "${VANVY_ENRICH_BASE:-}")],
    javGallery: $(_p2k javGallery "${VANVY_P2_JAVGALLERY-}"),
    javActorProfile: $(_p2k javActorProfile "${VANVY_P2_JAVACTOR-}"),
    javMagnets: $(_p2k javMagnets "${VANVY_P2_JAVMAGNETS-}"),
    textLogo: '$(_keepstr textLogo "${VANVY_P2_TEXTLOGO:-}" auto)',
    headerGlassMode: '$(_keepstr headerGlassMode "${VANVY_P2_HEADERMODE:-}" glass)'
  }"
  fi
  case "$P2_JSON" in '{'*'}'|'['*']') : ;; *) warn "P2 配置生成异常 → 已忽略"; P2_JSON='{}';; esac


# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

  cat > $TMPD/ves-detail-config.js <<EOF
window.VANVY_DETAIL_CONFIG = {
  theme: '$THEME',
  frostBlur: $FROST_BLUR,
  frostTint: $FROST_TINT,
  hero: true,
  hideNativeTop: true,
  showPlayers: $SP,
  showJav: $JP,
  javAutoRoute: true,
  playersOnlyOS: true,
  linksCollapsed: true,
  perRow: $PERROW,
  maxFanart: 24,
  metaTubeBase: '$META_BASE',
  avdbBase: '$AVDB_BASE',
  avdbKey: '$AVDB_KEY',
  imgProxyBase: '$IMG_PROXY',
  bgBlur: 6,
  javdbReviewsUrl: '',
  actorAlias: $ALIAS_JSON,
  // ── 二期增强开关（可用 --no-p2 / 单项关闭）──
  p2: $P2_JSON
};
EOF
  docker cp $TMPD/ves-detail-config.js "$CONTAINER:$WEB/vanvy-detail/config.js" && rm -f $TMPD/ves-detail-config.js
  ok "配置：theme=$THEME frost=$FROST_BLUR/${FROST_TINT} players=$SP jav=$JP perRow=$PERROW p2=$([ "$P2_JSON" = '{}' ] && echo off || echo on)"
fi

# 核心注册表注入（幂等，放 head 最先）
docker exec "$CONTAINER" sh -c "
  cd $WEB
  grep -q 'vanvy-core/vanvy-registry.js' index.html && exit 0
  cp index.html /tmp/.ves$$_vc.html
  sed -i 's#</head>#<script src=\"vanvy-core/vanvy-registry.js\"></script>\n</head>#' /tmp/.ves$$_vc.html
  cp /tmp/.ves$$_vc.html index.html && rm -f /tmp/.ves$$_vc.html
" 2>/dev/null || true

# 标记（幂等）
docker exec "$CONTAINER" sh -c "cd $WEB && grep -q 'VANVY-VES' index.html || sed -i 's#</body>#<!-- VANVY-VES -->\n</body>#' index.html"

echo ""
if [ "$FAIL" = "0" ]; then ok "🎉 VES 部署完成！浏览器 Ctrl+F5 强刷查看。"; else err "部分组件失败，请检查上面日志。"; fi
echo "  ${C_DIM}回滚：docker exec $CONTAINER sh -c 'cp $BK/index.html $WEB/index.html && rm -rf $WEB/vanvy-detail $WEB/vanvy-home $WEB/vanvy-loading'${C_OFF}"
echo "  快照：$BK"
_doc="$(vanvy_doc_url 2>/dev/null || true)"
if [ -n "$_doc" ]; then
  echo "  📖 安装引导（有问题先看这里）：$_doc"
else
  echo "  📖 安装引导（有问题先看这里）：随包文档 docs/INSTALL.md"
fi
exit $FAIL
