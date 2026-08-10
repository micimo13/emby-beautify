#!/usr/bin/env bash
# =============================================================================
#  Emby 美化全家桶 · 公共函数库
#  lib/common.sh — 被 install.sh / uninstall.sh 引用
# =============================================================================

set -u

# ── 颜色输出 ──
C_INFO='\033[1;36m'; C_OK='\033[1;32m'; C_WARN='\033[1;33m'
C_ERR='\033[1;31m'; C_ASK='\033[1;35m'; C_OFF='\033[0m'

c_info()  { printf "${C_INFO}[信息]${C_OFF} %s\n" "$*"; }
c_ok()    { printf "${C_OK}[成功]${C_OFF} %s\n" "$*"; }
c_warn()  { printf "${C_WARN}[警告]${C_OFF} %s\n" "$*"; }
c_err()   { printf "${C_ERR}[错误]${C_OFF} %s\n" "$*"; }
c_ask()   { printf "${C_ASK}[询问]${C_OFF} %s" "$*"; }

die() { c_err "$*"; exit 1; }

# 安全读取用户输入: 优先 stdin(真实终端) → /dev/tty(管道安装) → 默认值
# 用法: safe_read <变量名> [默认值]
safe_read() {
  local var="$1" default="${2:-}" val=""
  if [ -t 0 ]; then
    read -r val 2>/dev/null
  else
    # 尝试从 /dev/tty 读取, 失败静默(不打印错误)
    { read -r val < /dev/tty; } 2>/dev/null || val=""
  fi
  [ -z "$val" ] && val="$default"
  eval "$var=\"$val\""
}

# ── 演练模式 ──
maybe() {
  if [ "${DRY_RUN:-0}" = "1" ]; then
    printf '    ▶ (演练) %s\n' "$*"
  else
    eval "$*" 2>/dev/null
  fi
}

# ── 下载（GitHub 直连 → 镜像加速）──
download() {
  local url="$1" dest="$2" mirror murl
  [ "${DRY_RUN:-0}" = "1" ] && { printf '    ▶ (演练) 下载 %s\n' "$url"; return 0; }
  if curl -fsSL --connect-timeout 10 --max-time 90 -o "$dest" "$url" 2>/dev/null; then
    return 0
  fi
  for mirror in "https://gh-proxy.com/https://raw.githubusercontent.com" "https://mirror.ghproxy.com/https://raw.githubusercontent.com"; do
    murl="${url/https:\/\/raw.githubusercontent.com/$mirror}"
    if curl -fsSL --connect-timeout 10 --max-time 120 -o "$dest" "$murl" 2>/dev/null; then
      c_warn "GitHub 直连失败，已通过镜像 $mirror 下载"
      return 0
    fi
  done
  return 1
}

# ─────────────────────────────── 容器发现 ───────────────────────────────

list_emby_containers() {
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null \
    | awk -F'\t' 'tolower($1) ~ /emby/ || tolower($2) ~ /emby/ {print}'
}

pick_container() {
  local list total sel
  list="$(list_emby_containers)"
  if [ -z "$list" ]; then
    c_warn "未发现名称或镜像含 emby 的运行中容器。"
    c_ask "请手动输入容器名称: "
    safe_read CONTAINER
    [ -z "$CONTAINER" ] && die "未输入容器名。"
    docker inspect "$CONTAINER" >/dev/null 2>&1 || die "容器 $CONTAINER 不存在。"
    return
  fi

  # 有交互能力（真实终端 或 管道但存在 /dev/tty）→ 让用户选择
  if [ -t 0 ] || [ -e /dev/tty ]; then
    c_info "发现以下 Emby 容器:"
    echo "$list" | nl -w2 -s'. '
    total=$(echo "$list" | wc -l)
    c_ask "请选择容器 [1-$total]: "
    safe_read sel
    if echo "$sel" | grep -qE '^[0-9]+$' && [ "$sel" -ge 1 ] && [ "$sel" -le "$total" ]; then
      CONTAINER=$(echo "$list" | sed -n "${sel}p" | cut -f1)
      c_ok "已选择容器: $CONTAINER"
      return
    fi
    c_warn "输入无效，自动使用第一个容器。"
  fi

  # 完全无交互环境（cron/CI）→ 自动第一个
  CONTAINER=$(echo "$list" | head -1 | cut -f1)
  c_ok "自动选择容器: $CONTAINER"
}

# ─────────────────────────────── 版本识别 ───────────────────────────────

detect_version() {
  local image_tag ver_api ports p v
  # L1: 镜像 tag
  image_tag=$(docker inspect "$CONTAINER" --format '{{.Config.Image}}' 2>/dev/null)
  if echo "$image_tag" | grep -qiE '4\.8\.'; then
    VER="4.8"; VER_SRC="镜像tag ($image_tag)"; return
  elif echo "$image_tag" | grep -qiE '4\.9\.'; then
    VER="4.9"; VER_SRC="镜像tag ($image_tag)"; return
  fi
  # L2: 容器内 API 探测
  ports="${API_PORT:-8096}"
  for p in $ports; do
    ver_api=$(docker exec "$CONTAINER" sh -c \
      "curl -s --max-time 5 http://127.0.0.1:$p/System/Info/Public 2>/dev/null || wget -qO- --timeout=5 http://127.0.0.1:$p/System/Info/Public 2>/dev/null" 2>/dev/null)
    if [ -n "$ver_api" ]; then
      API_PORT="$p"
      v=$(echo "$ver_api" | grep -oE '"Version":"[^"]+"' | head -1 | cut -d'"' -f4)
      case "$v" in
        4.8*) VER="4.8"; VER_SRC="API版本 ($v)"; return ;;
        4.9*) VER="4.9"; VER_SRC="API版本 ($v)"; return ;;
      esac
    fi
  done
  # L3: UI 结构特征
  if docker exec "$CONTAINER" sh -c 'grep -q "require.js" /system/dashboard-ui/index.html' 2>/dev/null; then
    VER="4.9"; VER_SRC="UI特征 (require.js 模块化)"; return
  fi
  if docker exec "$CONTAINER" sh -c 'grep -qE "danmaku\.min\.js|modules/fonts" /system/dashboard-ui/index.html' 2>/dev/null; then
    VER="4.8"; VER_SRC="UI特征 (旧版模块/弹幕库)"; return
  fi
  VER="unknown"; VER_SRC="无法自动识别"
}

ask_version_manual() {
  local vsel
  c_warn "无法自动识别版本，请手动选择。"
  c_ask "Emby 版本: [1] 4.8.x  [2] 4.9.x  [3] 不确定: "
  safe_read vsel ""
  case "$vsel" in
    1) VER="4.8"; VER_SRC="手动选择" ;;
    2) VER="4.9"; VER_SRC="手动选择" ;;
    *) VER="unknown"; VER_SRC="手动·不确定" ;;
  esac
}

# ─────────────────────────────── 注入引擎 ───────────────────────────────

# 容器内 dashboard 路径探测（官方镜像: /system/dashboard-ui 或 /app/emby/system/dashboard-ui 等）
detect_dashboard_dir() {
  local d
  for d in /system/dashboard-ui /app/emby/system/dashboard-ui /usr/lib/emby-server/web; do
    if docker exec "$CONTAINER" sh -c "[ -f '$d/index.html' ]" 2>/dev/null; then
      DASHBOARD_DIR="$d"; return 0
    fi
  done
  DASHBOARD_DIR="/system/dashboard-ui"
  return 1
}

# 幂等注入: inject_marker <marker字符串> <inject文件(容器内路径)> <目标index.html>
# 把 inject 文件内容插入 </head> 前；若 marker 已存在则跳过
inject_to_index() {
  local marker="$1" inject_file="$2" index_file="$3"
  docker exec -i "$CONTAINER" sh -c "
    set -e
    INDEX='$index_file'
    if grep -qF '$marker' \"\$INDEX\"; then
      echo '[已存在] $marker 已注入，跳过'
      exit 0
    fi
    mkdir -p /config/backups/emby-beautify
    cp \"\$INDEX\" \"/config/backups/emby-beautify/index.html.bak.\$(date +%Y%m%d-%H%M%S)\"
    # 自适应锚点: 优先 </head>, 没有则用 <body (4.9 新版无闭合 head 标签)
    if grep -q '</head>' \"\$INDEX\"; then
      ANCHOR='</head>'
    else
      ANCHOR='<body'
    fi
    awk -v anchor=\"\$ANCHOR\" 'FNR==NR { lines[NR]=\$0; n=NR; next } index(\$0, anchor)==1 && !injected { for (i=1; i<=n; i++) print lines[i]; injected=1 } { print }' \\
      '$inject_file' \"\$INDEX\" > \"\$INDEX.new\"
    mv \"\$INDEX.new\" \"\$INDEX\"
    echo \"[注入] $marker 完成\"
  " 2>&1 | sed 's/^/    /'
}

# 往容器拷贝资源并返回容器内路径
push_assets() {
  # push_assets <本地资源目录> <容器目标目录>
  # 特殊保护: config.js 若容器内已有非空 parentId 配置, 不覆盖(避免破坏用户轮播配置)
  local src_dir="$1" dst_dir="$2" f
  maybe "docker exec \"$CONTAINER\" sh -c 'mkdir -p $dst_dir'"
  if [ "${DRY_RUN:-0}" = "0" ]; then
    docker exec "$CONTAINER" sh -c "mkdir -p '$dst_dir'" 2>/dev/null || die "容器内创建目录失败: $dst_dir"
    for f in "$src_dir"/*; do
      [ -f "$f" ] || continue
      local fname
      fname="$(basename "$f")"
      # config.js 保护: 容器内已有且 parentId 非空 → 跳过覆盖
      if [ "$fname" = "config.js" ]; then
        # 仅当容器 config.js 的实际配置行(this.parentId = "含ID")非空才保护
        if docker exec "$CONTAINER" sh -c "grep -qE '^\s*this\.parentId\s*=\s*\"[0-9a-fA-F,]' '$dst_dir/config.js'" 2>/dev/null; then
          echo "    ⏭ 保留容器内 config.js (已配置媒体库, 避免覆盖破坏轮播)"
          continue
        fi
      fi
      if ! docker cp "$f" "$CONTAINER:$dst_dir/$fname" 2>/dev/null; then
        die "docker cp 失败: $f → $dst_dir/"
      fi
      echo "    ✓ 复制 $fname"
    done
  fi
}

# 卸载指定 marker（删除注入行 + 可选资源目录）
remove_injection() {
  local marker="$1" asset_dir="${2:-}" index_file="$3"
  docker exec -i "$CONTAINER" sh -c "
    INDEX='$index_file'
    TMP=\"$INDEX.eb-rm.$$\"
    sed -E '/$marker/d' \"$INDEX\" > \"\$TMP\"
    mv \"\$TMP\" \"$INDEX\"
    rm -rf '$asset_dir'
    echo '[卸载] 已移除 $marker'
  " 2>&1 | sed 's/^/    /'
}

# 生成注入行文件（本地）
gen_inject_file() {
  # gen_inject_file <输出文件> <行1> <行2> ...
  local out="$1"; shift
  : > "$out"
  for line in "$@"; do
    printf '%s\n' "$line" >> "$out"
  done
}


# 列出本地可用主题
list_themes() {
  local d="$SCRIPT_DIR/themes"
  [ -d "$d/dark" ] && for f in "$d"/dark/*.css; do echo "  dark/$(basename "$f" .css)"; done
  for f in "$d"/*.css; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in
      Embymalism.css) echo "  embymalism" ;;
      *) echo "  $(basename "$f" .css)" ;;
    esac
  done
}
