#!/usr/bin/env bash
# =============================================================================
#  首页轮播 · 设计师系列 安装/卸载（在 Docker 宿主机上运行）
#  ---------------------------------------------------------------------------
#  用法:
#    bash install-banner-designer.sh --container emby-302 --style neo
#    bash install-banner-designer.sh --container emby-302 --style glass --theme blackgold
#    bash install-banner-designer.sh --container emby-302 --uninstall
#    bash install-banner-designer.sh --list          # 列出可选样式
#  说明:
#    - 改动前自动快照 index.html
#    - 幂等：重复执行不叠加注入
#    - 只动 index.html + vanvy/ 目录
#  ⚠️ 与 banner_home（生产版满屏轮播）互斥：装了本款请先卸载 banner_home
# =============================================================================
set -eu
CONTAINER=""; MODE="install"; STYLE=""; THEME=""
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB=/system/dashboard-ui; MARK='<!-- VANVY-BANNER-DESIGNER -->'
STYLES="neo glass orbital retro paper minimal light"

for _env in "$SRC_DIR/../../../lib/vanvy-env.sh" "$SRC_DIR/../../lib/vanvy-env.sh"; do
  [ -f "$_env" ] && . "$_env" && break
done

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2;;
    --style)     STYLE="$2"; shift 2;;
    --theme)     THEME="$2"; shift 2;;
    --uninstall) MODE="uninstall"; shift;;
    --list)      echo "可选轮播样式:"; for s in $STYLES; do echo "  - $s"; done; exit 0;;
    *) echo "未知参数: $1"; exit 1;;
  esac
done
[ -n "$THEME" ] || THEME="${VANVY_THEME:-blackgold}"

if [ "$MODE" = "uninstall" ]; then
  [ -n "$CONTAINER" ] || { echo "请指定 --container"; exit 1; }
  TS=$(date +%Y%m%d-%H%M%S); BK="$WEB/.bak-vanvy-$TS"
  docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/"
  docker exec "$CONTAINER" sh -c "
    cd $WEB
    sed -i '/vanvy\/banner_/d' index.html
    sed -i '/data-vanvy-bd/d' index.html
    sed -i '/VanvyCarouselCore.start(/d' index.html
    sed -i '/$MARK/d' index.html
    rm -rf $WEB/vanvy
    echo '--- 残留检查 ---'; grep -c 'vanvy/banner_' index.html || true
  "
  echo "✅ 已卸载设计师轮播 ($CONTAINER)  快照: $BK"; exit 0
fi

[ -n "$CONTAINER" ] || { echo "请指定 --container emby-302"; exit 1; }
case " $STYLES " in *" $STYLE "*) ;; *) echo "❌ 未知样式: $STYLE（可选: $STYLES）"; exit 1;; esac
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "容器不存在: $CONTAINER"; exit 1; }

DIR="$WEB/vanvy/banner_$STYLE"
TS=$(date +%Y%m%d-%H%M%S); BK="$WEB/.bak-vanvy-$TS"

# 快照
docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/"
docker exec "$CONTAINER" sh -c "ls -dt $WEB/.bak-vanvy-* 2>/dev/null | tail -n +6 | xargs -r rm -rf" 2>/dev/null || true

# 落位文件
docker exec "$CONTAINER" sh -c "rm -rf $DIR && mkdir -p $DIR"
docker cp "$SRC_DIR/vanvy-carousel-core.js"        "$CONTAINER:$DIR/vanvy-carousel-core.js"
docker cp "$SRC_DIR/banner_$STYLE/banner-$STYLE.js" "$CONTAINER:$DIR/banner-$STYLE.js"
docker cp "$SRC_DIR/banner_$STYLE/style.css"        "$CONTAINER:$DIR/style.css"

# 写入配置（主题 + 样式）

# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

cat > $TMPD/vbd-config.js <<EOF
window.VANVY_BANNER_CONFIG = { style: '$STYLE', theme: '$THEME' };
EOF
docker cp $TMPD/vbd-config.js "$CONTAINER:$DIR/config.js"; rm -f $TMPD/vbd-config.js

# 注入（幂等）：CSS 进 head，脚本放 body 末尾
docker exec "$CONTAINER" sh -c "
  cd $WEB
  # ⚠️ 临时文件必须落在「容器内」的 /tmp（$TMPD 是宿主机路径，容器里可能不存在）
  cp index.html /tmp/.ves$$_vbd.html
  sed -i '/vanvy\/banner_/d' /tmp/.ves$$_vbd.html
  sed -i '/data-vanvy-bd/d' /tmp/.ves$$_vbd.html
  sed -i '/VanvyCarouselCore.start(/d' /tmp/.ves$$_vbd.html
  sed -i '/$MARK/d' /tmp/.ves$$_vbd.html
  sed -i 's#</head>#<link rel=\"stylesheet\" href=\"vanvy/banner_$STYLE/style.css\" id=\"vbd-css\">\n</head>#' /tmp/.ves$$_vbd.html
  sed -i 's#</body>#<script src=\"vanvy/banner_$STYLE/config.js\"></script>\n<script src=\"vanvy/banner_$STYLE/vanvy-carousel-core.js\"></script>\n<script src=\"vanvy/banner_$STYLE/banner-$STYLE.js\"></script>\n<script data-vanvy-bd=\"1\">(function(){var n=0,t=setInterval(function(){n++;if(window.VanvyCarouselCore\&\&window.VanvyCarouselCore.start){clearInterval(t);try{window.VanvyCarouselCore.start(\"banner_$STYLE\")}catch(e){}}else if(n>60){clearInterval(t)}},200)})();</script>\n$MARK\n</body>#' /tmp/.ves$$_vbd.html
  cp /tmp/.ves$$_vbd.html index.html && rm -f /tmp/.ves$$_vbd.html
  echo '--- 注入结果 ---'
  grep -n 'vanvy/banner_' index.html
"
echo "✅ 已安装设计师轮播 [$STYLE] ($CONTAINER, 主题:$THEME)  快照: $BK"
echo "   回滚: docker exec $CONTAINER sh -c 'cp $BK/index.html $WEB/index.html && rm -rf $WEB/vanvy'"
