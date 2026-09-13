#!/usr/bin/env bash
# =============================================================================
#  HERO 工作室 · 安装/卸载（全新开发的动态轮播布局）
#  ---------------------------------------------------------------------------
#  用法:
#    bash install-hero-studio.sh --container emby-302 --style cinema --theme blackgold
#    bash install-hero-studio.sh --container emby-302 --uninstall
#    bash install-hero-studio.sh --list
#  可选样式: cinema | spotlight | coverflow | mosaic
#  说明: 改动前自动快照; 幂等; 与 banner_home / banner_designer 互斥
# =============================================================================
set -eu
CONTAINER=""; MODE="install"; STYLE=""; THEME=""
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB=/system/dashboard-ui; MARK='<!-- VANVY-HERO-STUDIO -->'
STYLES="classic cinema spotlight gallery wave mosaic"

for _env in "$SRC_DIR/../../../lib/vanvy-env.sh" "$SRC_DIR/../../lib/vanvy-env.sh"; do
  [ -f "$_env" ] && . "$_env" && break
done

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2;;
    --style)     STYLE="$2"; shift 2;;
    --theme)     THEME="$2"; shift 2;;
    --uninstall) MODE="uninstall"; shift;;
    --list)      echo "可选 HERO 布局:"; for s in $STYLES; do echo "  - $s"; done; exit 0;;
    *) echo "未知参数: $1"; exit 1;;
  esac
done
[ -n "$THEME" ] || THEME="${VANVY_THEME:-blackgold}"

# 清理 index.html 里的所有 HERO 痕迹
clean_index() {
  docker exec "$1" sh -c "
    cd $WEB
    sed -i '/vanvy-hero\//d' index.html
    sed -i '/data-vanvy-hero/d' index.html
    sed -i '/VanvyHero\.start(/d' index.html
    sed -i '/$MARK/d' index.html
  " 2>/dev/null || true
}

if [ "$MODE" = "uninstall" ]; then
  [ -n "$CONTAINER" ] || { echo "请指定 --container"; exit 1; }
  TS=$(date +%Y%m%d-%H%M%S); BK="$WEB/.bak-vanvy-$TS"
  docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/" 2>/dev/null || true
  clean_index "$CONTAINER"
  docker exec "$CONTAINER" sh -c "rm -rf $WEB/vanvy-hero" 2>/dev/null || true
  echo "✅ 已卸载 HERO 工作室 ($CONTAINER)  快照: $BK"; exit 0
fi

[ -n "$CONTAINER" ] || { echo "请指定 --container emby-302"; exit 1; }
case " $STYLES " in *" $STYLE "*) ;; *) echo "❌ 未知样式: $STYLE（可选: $STYLES）"; exit 1;; esac
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "容器不存在: $CONTAINER"; exit 1; }

DIR="$WEB/vanvy-hero"
TS=$(date +%Y%m%d-%H%M%S); BK="$WEB/.bak-vanvy-$TS"
docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/"
docker exec "$CONTAINER" sh -c "ls -dt $WEB/.bak-vanvy-* 2>/dev/null | tail -n +6 | xargs -r rm -rf" 2>/dev/null || true

docker exec "$CONTAINER" sh -c "rm -rf $DIR && mkdir -p $DIR/hero_$STYLE"
docker cp "$SRC_DIR/vanvy-hero-core.js" "$CONTAINER:$DIR/vanvy-hero-core.js"
docker cp "$SRC_DIR/hero_$STYLE/."       "$CONTAINER:$DIR/hero_$STYLE"


# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

printf "window.VANVY_HERO_CONFIG = { style: '%s', theme: '%s' };\n" "$STYLE" "$THEME" > $TMPD/vhs-config.js
docker cp $TMPD/vhs-config.js "$CONTAINER:$DIR/config.js"; rm -f $TMPD/vhs-config.js

# 先清理旧痕迹，再注入
clean_index "$CONTAINER"
docker exec "$CONTAINER" sh -c "cd $WEB && cp index.html /tmp/.ves$$_vhs.html && \
  sed -i 's#</head>#<link rel=\"stylesheet\" href=\"vanvy-hero/hero_$STYLE/style.css\" id=\"vhs-css\">\n</head>#' /tmp/.ves$$_vhs.html && \
  sed -i 's#</body>#<script src=\"vanvy-hero/config.js\"></script>\n<script src=\"vanvy-hero/vanvy-hero-core.js\"></script>\n<script src=\"vanvy-hero/hero_$STYLE/hero-$STYLE.js\"></script>\n<script data-vanvy-hero=\"1\">(function(){var n=0,t=setInterval(function(){n++;if(window.VanvyHero){clearInterval(t);try{VanvyHero.start(\"$STYLE\")}catch(e){}}else if(n>60){clearInterval(t)}},200)})();</script>\n$MARK\n</body>#' /tmp/.ves$$_vhs.html && \
  cp /tmp/.ves$$_vhs.html index.html && rm -f /tmp/.ves$$_vhs.html && \
  echo '--- 注入结果 ---' && grep -n 'vanvy-hero' index.html"

echo "✅ 已安装 HERO [$STYLE] ($CONTAINER, 主题:$THEME)  快照: $BK"
echo "   回滚: docker exec $CONTAINER sh -c 'cp $BK/index.html $WEB/index.html && rm -rf $WEB/vanvy-hero'"
