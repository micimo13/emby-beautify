#!/usr/bin/env bash
# =============================================================================
#  vanvy-loading 安装/卸载（在 UNRAID 宿主机上运行）
#  用法:
#    bash install-loading.sh --container emby-302
#    bash install-loading.sh --container emby-18          # 自动匹配该容器专属 LOGO
#    bash install-loading.sh --container emby-302 --logo-dir /path/logos   # 手动指定
#    bash install-loading.sh --container emby-302 --favicon /path/tab.png   # 单独指定浏览器标签图标
#    bash install-loading.sh --container emby-302 --no-favicon              # 保留 Emby 自带标签图标
#    bash install-loading.sh --container emby-302 --uninstall
#  说明:
#    - 改动前自动快照 index.html
#    - 幂等：重复执行不叠加注入
#    - 只动 index.html + vanvy-loading/ 目录
# =============================================================================
set -eu
CONTAINER=""; MODE="install"; LOGO_DIR=""; THEME=""; STYLE=""; SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGO_FILE=""; NO_LOGO=0; LOGO_WIDTH=""; FAVICON_FILE=""; NO_FAVICON=0
WEB=/system/dashboard-ui; DIR=$WEB/vanvy-loading; MARK='<!-- VANVY-LOADING -->'

# 加载环境变量（可选；文件不存在也照常运行）
for _env in "$SRC_DIR/../../../lib/vanvy-env.sh" "$SRC_DIR/../../lib/vanvy-env.sh"; do
  [ -f "$_env" ] && . "$_env" && break
done

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2;;
    --logo-dir) LOGO_DIR="$2"; shift 2;;       # 目录（含 brand.png / favicon.png）
    --logo)     LOGO_FILE="$2"; shift 2;;      # 直接指定图片：本地文件 或 http(s):// URL
    --no-logo)  NO_LOGO=1; shift;;             # 不使用 LOGO（仅文字/进度）
    --logo-width) LOGO_WIDTH="$2"; shift 2;;   # LOGO 显示宽度 px
    --favicon)  FAVICON_FILE="$2"; shift 2;;   # 浏览器标签图标：本地文件 或 http(s):// URL
    --no-favicon) NO_FAVICON=1; shift;;        # 不替换浏览器标签图标（保留 Emby 自带）
    --theme) THEME="$2"; shift 2;;
    --style) STYLE="$2"; shift 2;;      # 样式变体: aurora|cinema|minimal|split|logo （空=默认）
    --uninstall) MODE="uninstall"; shift;;
    *) echo "未知参数: $1"; exit 1;;
  esac
done
# 未指定主题时回退环境变量 → 默认黑金
[ -n "$THEME" ] || THEME="${VANVY_THEME:-blackgold}"
[ -n "$CONTAINER" ] || { echo "请指定 --container emby-302"; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "容器不存在: $CONTAINER"; exit 1; }

TS=$(date +%Y%m%d-%H%M%S); BK="$WEB/.bak-vanvy-$TS"

if [ "$MODE" = "uninstall" ]; then
  docker exec "$CONTAINER" sh -c "
    cd $WEB
    sed -i '/$MARK/d' index.html
    sed -i '/vanvy-loading\/vanvy-loading.css/d' index.html
    sed -i '/vanvy-loading\/vanvy-loading.js/d' index.html
    sed -i '/vanvy-loading\/config.js/d' index.html
    rm -rf $DIR
    echo '--- 残留检查 ---'; grep -c vanvy-loading index.html || true
  "
  echo "✅ 已卸载 vanvy-loading ($CONTAINER)"; exit 0
fi

# ── 资源获取：本地文件 或 远程 URL（自动下载 + 魔数校验 + 超大图自动缩小）──
#   优先用 scripts/asset-prep.sh（统一实现）；找不到时用本文件内的兼容实现。
ASSET_PREP=""
for _c in "$SRC_DIR/../../../scripts/asset-prep.sh" "$SRC_DIR/../../scripts/asset-prep.sh" "$SRC_DIR/scripts/asset-prep.sh"; do
  [ -f "$_c" ] && ASSET_PREP="$_c" && break
done

# prepare_asset <logo|favicon> <src> <outdir>  → 成功时打印本地文件路径
prepare_asset() {
  local kind="$1" src="$2" dir="$3"
  if [ -n "$ASSET_PREP" ]; then
    VANVY_PROXY_URL="${VANVY_PROXY_URL:-}" bash "$ASSET_PREP" "$kind" "$src" "$dir" 2>&1
    return $?
  fi
  # 回退：直接 fetch（无压缩）
  case "$src" in
    http://*|https://*) fetch_asset "$src" "$dir/vanvy-$kind.png" || return 1; printf '%s\n' "$dir/vanvy-$kind.png"; return 0;;
    *) [ -f "$src" ] || return 1; cp "$src" "$dir/vanvy-$kind.png" && printf '%s\n' "$dir/vanvy-$kind.png"; return 0;;
  esac
}

# ── 资源获取：本地文件 或 远程 URL（自动下载，带代理回退）──────
#   用法: fetch_asset <src> <out>   → 0=成功
#   代理来源: $VANVY_PROXY_URL（逗号分隔多个，如 socks5h://…,http://…）
fetch_asset() {
  local src="$1" out="$2"
  case "$src" in
    http://*|https://*)
      local DL=""
      command -v curl >/dev/null 2>&1 && DL=curl
      [ -z "$DL" ] && command -v wget >/dev/null 2>&1 && DL=wget
      [ -z "$DL" ] && { echo "   ⚠️  本机无 curl/wget，无法下载 URL"; return 1; }
      local -a tries=("")
      local _p
      for _p in $(printf '%s' "${VANVY_PROXY_URL:-}" | tr ',' ' '); do [ -n "$_p" ] && tries+=("$_p"); done
      for _p in "${tries[@]}"; do
        if [ "$DL" = curl ]; then
          if [ -n "$_p" ]; then
            curl -fsSL --connect-timeout 8 --max-time 90 --proxy "$_p" "$src" -o "$out" 2>/dev/null
          else
            curl -fsSL --connect-timeout 8 --max-time 90 "$src" -o "$out" 2>/dev/null
          fi
        else
          if [ -n "$_p" ]; then
            wget -q --timeout=8 --tries=1 -e use_proxy=yes -e "http_proxy=$_p" -e "https_proxy=$_p" -O "$out" "$src" 2>/dev/null
          else
            wget -q --timeout=8 --tries=1 -O "$out" "$src" 2>/dev/null
          fi
        fi
        if [ -s "$out" ]; then
          [ -n "$_p" ] && echo "   （经代理下载成功）"
          return 0
        fi
      done
      rm -f "$out" 2>/dev/null || true
      return 1;;
    *)
      [ -f "$src" ] || return 1
      cp "$src" "$out" 2>/dev/null || return 1
      return 0;;
  esac
}

# 从来源推断图片扩展名（用于 favicon 这类对扩展名/MIME 敏感的资源）
asset_ext() {  # asset_ext <src-or-已下载文件>
  local s="${1%%\?*}"
  case "$s" in
    *.png) printf png;; *.jpg|*.jpeg) printf jpg;; *.svg) printf svg;;
    *.webp) printf webp;; *.gif) printf gif;; *.ico) printf ico;; *) printf png;;
  esac
}

# 魔数校验（避免把 404 页面/HTML 当成图片装进去）
asset_is_image() {
  local f="$1"; [ -s "$f" ] || return 1
  local head; head="$(head -c 16 "$f" | od -An -tx1 2>/dev/null | tr -d ' \n')"
  case "$head" in
    89504e47*) return 0;;        # PNG
    ffd8ff*)   return 0;;        # JPEG
    47494638*) return 0;;        # GIF
    52494646*57454250*) return 0;; # WEBP
    00000100*|00000200*) return 0;; # ICO
  esac
  # SVG（文本）
  if head -c 400 "$f" 2>/dev/null | grep -qi '<svg'; then return 0; fi
  return 1
}

# ── LOGO 选择（全部可选；找不到就降级，不阻断安装）──────────────
# 优先级: --logo 文件 > --logo-dir 目录 > logos/<容器> > logo/ 通用 > 无
TMP_LD=""
USE_LOGO=1
if [ "$NO_LOGO" = "1" ]; then
  USE_LOGO=0; echo "🖼️  按要求不使用 LOGO"
elif [ -n "$LOGO_FILE" ]; then
  TMP_LD="$(mktemp -d)"
  _lgout="$(prepare_asset logo "$LOGO_FILE" "$TMP_LD" 2>&1)" && _lgrc=0 || _lgrc=$?
  _lgfile="$(printf '%s\n' "$_lgout" | tail -1)"
  if [ "$_lgrc" = 0 ] && [ -n "$_lgfile" ] && [ -f "$_lgfile" ]; then
    [ "$_lgfile" != "$TMP_LD/brand.png" ] && { rm -f "$TMP_LD/brand.png"; cp "$_lgfile" "$TMP_LD/brand.png"; }
    LOGO_DIR="$TMP_LD"
    printf '%s\n' "$_lgout" | grep '↳' || true
    case "$LOGO_FILE" in http://*|https://*) echo "🖼️  从 URL 加载 LOGO: $LOGO_FILE";; *) echo "🖼️  使用指定 LOGO: $LOGO_FILE";; esac
  else
    echo "⚠️  取不到 LOGO（不存在 / 下载失败 / 不是图片）: $LOGO_FILE → 改用默认"
    printf '%s\n' "$_lgout" | grep -E '⚠️|不是|失败|不存在' | head -2 || true
    rm -rf "$TMP_LD" 2>/dev/null || true; TMP_LD=""; USE_LOGO=0
  fi
elif [ -z "$LOGO_DIR" ]; then
  if [ -d "$SRC_DIR/logos/$CONTAINER" ]; then
    LOGO_DIR="$SRC_DIR/logos/$CONTAINER"; echo "🖼️  容器专属 LOGO: logos/$CONTAINER"
  elif [ -f "$SRC_DIR/logo/brand.png" ]; then
    LOGO_DIR="$SRC_DIR/logo"; echo "🖼️  通用 LOGO: logo/"
  else
    # ⚠️ 未指定任何来源：若容器里已有真实 LOGO（非 1x1 占位）就**沿用，不覆盖**
    _ex_sz="$(docker exec "$CONTAINER" sh -c "wc -c < $DIR/logo/brand.png" 2>/dev/null | tr -d ' ' || echo 0)"
    if [ "${_ex_sz:-0}" -gt 200 ] 2>/dev/null; then
      USE_LOGO=2   # 2 = 保留现有，不重写
      echo "️  未指定 LOGO → 沿用容器现有 LOGO（不覆盖）"
    else
      USE_LOGO=0
    fi
  fi
fi
# 目录存在但缺图 → 也降级
if [ "$USE_LOGO" = "1" ] && { [ -z "$LOGO_DIR" ] || [ ! -f "$LOGO_DIR/brand.png" ]; }; then
  USE_LOGO=0
fi
if [ "$USE_LOGO" = "1" ]; then
  echo "🖼️  LOGO 就绪 (${LOGO_DIR##*/})"
elif [ "$USE_LOGO" = "2" ]; then
  :   # 沿用现有，无需提示
else
  echo "ℹ️  未提供 LOGO → 加载页仅显示文字与进度（可随时补充）"
fi

# ── 浏览器标签图标(favicon)选择（与加载页 LOGO 相互独立）───────
# 优先级: --favicon 文件 > --logo-dir 里的 favicon.png > 加载页 LOGO > 不替换
TMP_FD=""; FAV_SRC=""; USE_FAV=1; FAV_EXT="png"
if [ "$NO_FAVICON" = "1" ]; then
  USE_FAV=0
elif [ -n "$FAVICON_FILE" ]; then
  TMP_FD="$(mktemp -d)"
  _fvout="$(prepare_asset favicon "$FAVICON_FILE" "$TMP_FD" 2>&1)" && _fvrc=0 || _fvrc=$?
  _fvfile="$(printf '%s\n' "$_fvout" | tail -1)"
  if [ "$_fvrc" = 0 ] && [ -n "$_fvfile" ] && [ -f "$_fvfile" ]; then
    FAV_EXT="$(asset_ext "$_fvfile")"
    FAV_SRC="$TMP_FD/favicon.$FAV_EXT"
    [ "$_fvfile" != "$FAV_SRC" ] && cp "$_fvfile" "$FAV_SRC"
    printf '%s\n' "$_fvout" | grep '↳' || true
    case "$FAVICON_FILE" in http://*|https://*) echo "🖼️  从 URL 加载标签图标: $FAVICON_FILE";; *) echo "🖼️  浏览器标签图标: $FAVICON_FILE";; esac
  else
    echo "⚠️  取不到标签图标（不存在 / 下载失败 / 不是图片）: $FAVICON_FILE → 不替换"
    printf '%s\n' "$_fvout" | grep -E '⚠️|不是|失败|不存在' | head -2 || true
    rm -rf "$TMP_FD" 2>/dev/null || true; TMP_FD=""; USE_FAV=0
  fi
elif [ "$USE_LOGO" = "1" ] && [ -f "$LOGO_DIR/favicon.png" ]; then
  FAV_SRC="$LOGO_DIR/favicon.png"
elif [ "$USE_LOGO" = "1" ] && [ -f "$LOGO_DIR/brand.png" ]; then
  FAV_SRC="$LOGO_DIR/brand.png"
else
  # 未指定来源：容器已有真实图标（非 1x1 占位）→ 沿用不覆盖
  _ex_fav="$(docker exec "$CONTAINER" sh -c "wc -c < $DIR/logo/favicon.png" 2>/dev/null | tr -d ' ' || echo 0)"
  if [ "${_ex_fav:-0}" -gt 200 ] 2>/dev/null; then
    USE_FAV=2
  else
    USE_FAV=0
  fi
fi
if [ "$USE_FAV" = "1" ]; then
  echo "🖼️  标签图标就绪（浏览器标签页）"
elif [ "$USE_FAV" = "2" ]; then
  echo "ℹ️  未指定标签图标 → 沿用容器现有（不覆盖）"
else
  echo "ℹ️  不替换浏览器标签图标（保留 Emby 自带）"
fi

# 快照
docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/"
docker exec "$CONTAINER" sh -c "ls -dt $WEB/.bak-vanvy-* 2>/dev/null | tail -n +6 | xargs -r rm -rf"

# 沿用模式：先把现有 logo 文件取出，重建目录后再放回
KEEP_LOGO_FROM=""
if [ "$USE_LOGO" = "2" ] || [ "$USE_FAV" = "2" ]; then
  KEEP_LOGO_FROM="$(mktemp -d)"
  docker cp "$CONTAINER:$DIR/logo/." "$KEEP_LOGO_FROM/" >/dev/null 2>&1 || true
fi

# 落位文件（整个目录，含 logo/）
docker exec "$CONTAINER" sh -c "rm -rf $DIR && mkdir -p $DIR/logo"
docker cp "$SRC_DIR/vanvy-loading.js"  "$CONTAINER:$DIR/vanvy-loading.js"
docker cp "$SRC_DIR/vanvy-loading.css" "$CONTAINER:$DIR/vanvy-loading.css"
# 先把沿用的图标放回（后续显式指定时会被覆盖）
if [ -n "$KEEP_LOGO_FROM" ]; then
  for _kf in "$KEEP_LOGO_FROM"/*.png "$KEEP_LOGO_FROM"/*.ico "$KEEP_LOGO_FROM"/*.svg "$KEEP_LOGO_FROM"/*.jpg; do
    [ -f "$_kf" ] || continue
    _kb="$(basename "$_kf")"
    [ "$USE_LOGO" = "2" ] && [ "$_kb" = "brand.png" ] && { docker cp "$_kf" "$CONTAINER:$DIR/logo/brand.png" >/dev/null 2>&1 || true; continue; }
    [ "$USE_FAV" = "2" ] && case "$_kb" in favicon.*) docker cp "$_kf" "$CONTAINER:$DIR/logo/$_kb" >/dev/null 2>&1 || true;; esac
  done
  rm -rf "$KEEP_LOGO_FROM" 2>/dev/null || true
fi
if [ "$USE_LOGO" = "1" ]; then
  docker cp "$LOGO_DIR/brand.png"   "$CONTAINER:$DIR/logo/brand.png"
else
  # 无 LOGO：放一个 1x1 透明 PNG 占位，保证 <img> 不报 404

# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > $TMPD/_blank.png
  docker cp $TMPD/_blank.png "$CONTAINER:$DIR/logo/brand.png"
  rm -f $TMPD/_blank.png
fi
# 标签图标：需要替换才落位；不需要就放占位（JS 端 replaceFavicon=false，不会用它）
FAV_REL="logo/favicon.png"
if [ "$USE_FAV" = "1" ] && [ -n "$FAV_SRC" ]; then
  FAV_REL="logo/favicon.$FAV_EXT"
  docker cp "$FAV_SRC" "$CONTAINER:$DIR/$FAV_REL"
  # 清掉可能残留的旧扩展名文件
  for _e in png jpg svg webp gif ico; do
    [ "logo/favicon.$_e" = "$FAV_REL" ] || docker exec "$CONTAINER" sh -c "rm -f $DIR/logo/favicon.$_e" 2>/dev/null || true
  done
else
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > $TMPD/_blank_fav.png
  docker cp $TMPD/_blank_fav.png "$CONTAINER:$DIR/logo/favicon.png"
  rm -f $TMPD/_blank_fav.png
fi

# 样式变体：把 components/loading/<style>/style.css 装到 styles/<style>.css
STYLE_LINE=""
if [ -n "$STYLE" ]; then
  SSRC="$SRC_DIR/../$STYLE/style.css"
  if [ -f "$SSRC" ]; then
    docker exec "$CONTAINER" sh -c "mkdir -p $DIR/styles"
    docker cp "$SSRC" "$CONTAINER:$DIR/styles/$STYLE.css"
    STYLE_LINE="  style: '$STYLE',"
    echo "🎨 加载页样式: $STYLE"
  else
    echo "⚠️  未找到样式 $STYLE（$SSRC），使用默认样式"; STYLE=""
  fi
fi

# 写入主题+样式配置（与首页轮播/详情页同一 theme key，保证强调色一致）
# ── 缓存破坏：浏览器对 favicon / LOGO 缓存极顽固 → 网址带内容指纹 ──
_hash8() { md5sum "$1" 2>/dev/null | cut -c1-8 || cksum "$1" 2>/dev/null | cut -d' ' -f1; }
BRAND_V="$(_hash8 "$LOGO_DIR/brand.png" 2>/dev/null || echo 0)"
FAV_V="$(_hash8 "$FAV_SRC" 2>/dev/null || echo 0)"
[ -n "$BRAND_V" ] || BRAND_V=0
[ -n "$FAV_V" ] || FAV_V=0

cat > $TMPD/vl-config.js <<EOF
window.VANVY_LOADING_CONFIG = {
$STYLE_LINE
  theme: '$THEME',
  useLogo: $([ "${USE_LOGO:-0}" = "1" ] || [ "${USE_LOGO:-0}" = "2" ] && echo true || echo false),
  replaceFavicon: $([ "${USE_FAV:-0}" = "1" ] || [ "${USE_FAV:-0}" = "2" ] && echo true || echo false),
  favicon: 'logo/favicon.$FAV_EXT?v=$FAV_V',
  brandLogo: 'logo/brand.png?v=$BRAND_V'${LOGO_WIDTH:+,
  brandLogoWidth: $LOGO_WIDTH}
};
EOF
docker cp $TMPD/vl-config.js "$CONTAINER:$DIR/config.js"; rm -f $TMPD/vl-config.js

# 注入（幂等）：CSS 进 head，JS 紧挨 apploader.js 之前（尽早执行，零闪烁）
docker exec "$CONTAINER" sh -c "
  cd $WEB
  cp index.html /tmp/.ves$$_idx2.html
  sed -i '/$MARK/d' /tmp/.ves$$_idx2.html
  sed -i '/vanvy-loading\/vanvy-loading.css/d' /tmp/.ves$$_idx2.html
  sed -i '/vanvy-loading\/vanvy-loading.js/d' /tmp/.ves$$_idx2.html
  sed -i '/vanvy-loading\/config.js/d' /tmp/.ves$$_idx2.html
  sed -i 's#</head>#<link rel=\"stylesheet\" href=\"vanvy-loading/vanvy-loading.css\" id=\"vanvy-loading-css\">\n</head>#' /tmp/.ves$$_idx2.html
  # 优先插到 apploader.js 之前
  if grep -q 'apploader.js' /tmp/.ves$$_idx2.html; then
    sed -i 's#<script src=\"apploader.js#<script src=\"vanvy-loading/config.js\"></script>\n<script src=\"vanvy-loading/vanvy-loading.js\"></script>\n$MARK\n<script src=\"apploader.js#' /tmp/.ves$$_idx2.html
  else
    sed -i 's#</body>#<script src=\"vanvy-loading/config.js\"></script>\n<script src=\"vanvy-loading/vanvy-loading.js\"></script>\n$MARK\n</body>#' /tmp/.ves$$_idx2.html
  fi
  cp /tmp/.ves$$_idx2.html index.html && rm -f /tmp/.ves$$_idx2.html
  echo '--- 注入结果 ---'
  grep -n 'vanvy-loading\|vanvy-home' index.html
"
if [ "$USE_LOGO" = "1" ]; then _lg="$(basename "${LOGO_DIR:-未指定}")"; else _lg="未使用（仅文字）"; fi
if [ "$USE_FAV" = "1" ]; then _fv="已替换"; else _fv="不替换（Emby 自带）"; fi
echo "✅ 已安装 vanvy-loading ($CONTAINER, 主题:$THEME, 样式:${STYLE:-默认}, LOGO: $_lg, 标签图标: $_fv)  快照: $BK"
[ "$USE_LOGO" = "0" ] && echo "   💡 想加 LOGO？把品牌图放到 components/loading/vanvy/logo/brand.png 后重跑即可"
[ "$USE_FAV" = "0" ] && echo "   💡 想换浏览器标签图标？用 --favicon 图片路径 重跑即可"
# 清理临时 LOGO 目录
[ -n "$TMP_LD" ] && rm -rf "$TMP_LD" || true
[ -n "$TMP_FD" ] && rm -rf "$TMP_FD" || true
echo "   回滚: docker exec $CONTAINER sh -c 'cp $BK/index.html $WEB/index.html && rm -rf $DIR'"
