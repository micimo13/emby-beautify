#!/usr/bin/env bash
# =============================================================================
#  Emby 美化引擎 · 公共函数库
# =============================================================================

C_INFO='\033[1;36m'; C_OK='\033[1;32m'; C_WARN='\033[1;33m'
C_ERR='\033[1;31m'; C_ASK='\033[1;35m'; C_OFF='\033[0m'

c_info()  { printf "${C_INFO}[信息]${C_OFF} %s\n" "$*"; }
c_ok()    { printf "${C_OK}[成功]${C_OFF} %s\n" "$*"; }
c_warn()  { printf "${C_WARN}[警告]${C_OFF} %s\n" "$*"; }
c_err()   { printf "${C_ERR}[错误]${C_OFF} %s\n" "$*"; }
c_ask()   { printf "${C_ASK}[询问]${C_OFF} %s" "$*"; }

die() { c_err "$*"; exit 1; }

# 从用户读取输入 (终端/管道/无tty 全兼容, 永不死等, 静默无报错)
# 优先级: 终端 stdin → /dev/tty 秒级超时尝试 (curl|bash 管道时用户终端仍可交互) → stdin 回退
read_from_user() {
  local var="$1" default="${2:-}" val=""
  if [ -t 0 ]; then
    read -r val
  else
    # 非终端: 尝试从 /dev/tty 读, 1秒超时 (避免 UNRAID Web终端等环境阻塞); 失败回退 stdin
    if read -r -t 1 val < /dev/tty 2>/dev/null; then
      :
    else
      read -r val
    fi
  fi
  # 防脚本残留: curl|bash 管道模式下 stdin 可能是脚本代码 (如 'rm -rf "$TMPDIR"'),
  # 读到含脚本特征的内容时视为无效输入, 用默认值
  if echo "$val" | grep -qE '\$\(|TMPDIR=|rm -rf|#!/|\$[A-Z_]|; then|\bif \b|\bfor \b'; then
    val=""
  fi
  [ -z "$val" ] && val="$default"
  eval "$var=\"$val\""
}

# 检测是否存在可用的 /dev/tty (1秒超时, 永不死等)
tty_available() {
  timeout 1 bash -c 'exec 3<> /dev/tty' 2>/dev/null
}

# 安全读取输入 (兼容旧调用, 内部走 read_from_user)
safe_read() {
  read_from_user "$@"
}

# 健壮多选解析: 把用户输入的数字列表拆成干净的数字数组
# 兼容: 半角/全角逗号(,) 顿号(、) 任意空格(含全角空格) 全角数字(１２３)
# 注意: 不用 sed 字符类处理多字节 (POSIX locale 下会把全角字符拆字节误伤)
# 用法: picks=($(parse_multi "1 ，5、6,7  8")) → (1 5 6 7 8)
parse_multi() {
  local raw="$1"
  # 逗号类字符 → 空格 (bash 参数扩展, 子串匹配不拆多字节)
  raw="${raw//，/ }"
  raw="${raw//、/ }"
  raw="${raw//,/ }"
  # 全角数字 → 半角
  raw="${raw//０/0}"; raw="${raw//１/1}"; raw="${raw//２/2}"; raw="${raw//３/3}"
  raw="${raw//４/4}"; raw="${raw//５/5}"; raw="${raw//６/6}"; raw="${raw//７/7}"
  raw="${raw//８/8}"; raw="${raw//９/9}"
  # 全角空格 → 半角
  raw="${raw//　/ }"
  # 按空白分割 (IFS 默认含空格/tab/换行)
  for token in $raw; do
    # 去残留空白字符
    token=$(printf '%s' "$token" | tr -d ' \t\r')
    [ -z "$token" ] && continue
    echo "$token"
  done
}

# 确认 (默认N, 支持管道输入)
confirm() {
  c_ask "$1 [y/N]: "
  local ans=""
  read_from_user ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ]
}

# 备份 index.html (每次注入前)
backup_index() {
  docker exec "$CONTAINER" sh -c "
    mkdir -p /config/backups/emby-beautify
    cp '$DASHBOARD_DIR/index.html' \"/config/backups/emby-beautify/index.html.bak.\$(date +%Y%m%d-%H%M%S)\"
  " 2>/dev/null && c_ok "✓ index.html 已备份"
}

# 幂等注入: 把注入行插入 </head> 前 (marker 已存在则跳过)
inject_to_index() {
  local marker="$1" inject_file="$2" index_file="$3"
  # 逐行检查已存在 (防重复), 过滤出真正需要注入的行
  local filtered="/tmp/vanvy-filtered.html"
  : > "$filtered"
  local total=0 exist=0 line
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    total=$((total+1))
    if docker exec "$CONTAINER" sh -c "grep -qF -- '${line}' '$index_file'" 2>/dev/null; then
      exist=$((exist+1))
    else
      printf '%s\n' "$line" >> "$filtered"
    fi
  done < "$inject_file"

  if [ "$total" -gt 0 ] && [ "$exist" -eq "$total" ]; then
    echo "    [已存在] $marker 相关注入已存在, 跳过"
    rm -f "$filtered"
    return 0
  fi
  if [ ! -s "$filtered" ]; then
    echo "    [已存在] 所有注入行已存在, 跳过"
    rm -f "$filtered"
    return 0
  fi

  # 上传过滤后的注入文件
  docker cp "$filtered" "$CONTAINER:/tmp/vanvy-inject-final.html" 2>/dev/null
  docker exec -i "$CONTAINER" sh -c "
    set -e
    INDEX='$index_file'
    if [ ! -s /tmp/vanvy-inject-final.html ]; then
      echo '[错误] 注入文件为空, 已中止'
      exit 1
    fi
    mkdir -p /config/backups/emby-beautify
    cp \"\$INDEX\" \"/config/backups/emby-beautify/index.html.bak.\$(date +%Y%m%d-%H%M%S)\" || exit 1
    if grep -q '</head>' \"\$INDEX\"; then
      ANCHOR='</head>'
    else
      ANCHOR='<body'
    fi
    awk -v anchor=\"\$ANCHOR\" 'FNR==NR { lines[NR]=\$0; n=NR; next } index(\$0, anchor)==1 && !injected { for (i=1; i<=n; i++) print lines[i]; injected=1 } { print }' \\
      /tmp/vanvy-inject-final.html \"\$INDEX\" > \"\$INDEX.new\"
    rm -f /tmp/vanvy-inject-final.html
    if [ -s \"\$INDEX.new\" ]; then
      mv \"\$INDEX.new\" \"\$INDEX\"
      echo \"[注入] $marker 完成\"
    else
      rm -f \"\$INDEX.new\"
      echo '注入失败: 新文件为空, 已保留原文件'
      exit 1
    fi
  " 2>&1 | sed 's/^/    /'
  rm -f "$filtered"
}

# 拷贝资源到容器
push_assets() {
  local src_dir="$1" dst_dir="$2"
  docker exec "$CONTAINER" sh -c "mkdir -p '$dst_dir'" 2>/dev/null
  for f in "$src_dir"/*; do
    [ -f "$f" ] || continue
    local fname
    fname="$(basename "$f")"
    docker cp "$f" "$CONTAINER:$dst_dir/$fname" 2>/dev/null || { c_err "复制失败: $fname"; return 1; }
    echo "    ✓ 复制 $fname"
  done
}

# 检查组件是否已注入
is_installed() {
  local marker="$1"
  [ -n "$marker" ] || return 1
  docker exec "$CONTAINER" sh -c "grep -qF '$marker' '$DASHBOARD_DIR/index.html'" 2>/dev/null
}

# 官方版检测: 首页美化是否官方版 (区分镜像自带旧版)
# 返回: 0=官方版 1=未装 2=旧版残留
is_banner_official() {
  local id="$1" dir="vanvy/banner_$id" mainjs
  if ! is_installed "vanvy/banner_$id/banner-$id.js"; then
    # 检查是否旧版美化残留
    if docker exec "$CONTAINER" sh -c "grep -q 'emby-crx/main.js' '$DASHBOARD_DIR/index.html'" 2>/dev/null; then
      return 2
    fi
    return 1
  fi
  return 0
}

# 清理镜像内置旧版美化残留 (社区镜像)
cleanup_builtin_crx() {
  if [ "$BUILTIN_CRX" = "1" ]; then
    c_warn "清理镜像内置旧版美化..."
    # 移除 index.html 中的旧版美化注入行
    docker exec "$CONTAINER" sh -c "
      INDEX='$DASHBOARD_DIR/index.html'
      cp \"\$INDEX\" \"/config/backups/emby-beautify/index.html.pre-clean.\$(date +%Y%m%d-%H%M%S)\" 2>/dev/null
      sed -i '/emby-crx\/style.css/d; /emby-crx\/common-utils.js/d; /emby-crx\/jquery/d; /emby-crx\/md5/d; /emby-crx\/config.js/d; /emby-crx\/main.js/d' \"\$INDEX\"
      # 保留目录(避免破坏), 但删旧版 main.js 防止误加载
      rm -f '$DASHBOARD_DIR/emby-crx/main.js' '$DASHBOARD_DIR/emby-crx/config.js'
      echo '  旧版美化注入已清理'
    " 2>&1 | sed 's/^/    /'
    BUILTIN_CRX=0
    c_ok "✓ 镜像内置旧版美化已清理"
  fi
}
