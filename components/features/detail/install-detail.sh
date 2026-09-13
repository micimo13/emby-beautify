#!/usr/bin/env bash
# =============================================================================
#  vanvy-detail 安装/卸载（在 UNRAID 宿主机运行）
#  用法:
#    bash install-detail.sh --container emby-18
#    bash install-detail.sh --container emby-18 --theme blackgold
#    bash install-detail.sh --container emby-18 --uninstall
# =============================================================================
set -eu
CONTAINER=""; MODE="install"; THEME=""; SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB=/system/dashboard-ui; DIR=$WEB/vanvy-detail; MARK='<!-- VANVY-DETAIL -->'
KEYS="aurora blackgold champagne emerald sakura sunset amber crimson violet graphite"
NAMES="极光蓝 黑金 香槟金 翡翠绿 樱花粉 落日橙 琥珀金 赤霞红 幻紫 石墨灰"

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2;;
    --theme) THEME="$2"; shift 2;;
    --uninstall) MODE="uninstall"; shift;;
    *) echo "未知参数: $1"; exit 1;;
  esac
done
[ -n "$CONTAINER" ] || { echo "请指定 --container"; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "容器不存在: $CONTAINER"; exit 1; }

TS=$(date +%Y%m%d-%H%M%S); BK="$WEB/.bak-vanvy-$TS"

if [ "$MODE" = "uninstall" ]; then
  docker exec "$CONTAINER" sh -c "
    cd $WEB
    sed -i '/$MARK/d' index.html
    sed -i '/vanvy-detail\/vanvy-detail.css/d' index.html
    sed -i '/vanvy-detail\/vanvy-detail.js/d' index.html
    sed -i '/vanvy-detail\/config.js/d' index.html
    sed -i '/vanvy-detail-boot/d' index.html
    rm -rf $DIR
    echo '残留:'; grep -c vanvy-detail index.html || true"
  echo "✅ 已卸载 vanvy-detail ($CONTAINER)"; exit 0
fi

[ -n "$THEME" ] || THEME=blackgold
case " $KEYS " in *" $THEME "*) ;; *) echo "无效主题，用 blackgold"; THEME=blackgold;; esac

docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/"
docker exec "$CONTAINER" sh -c "ls -dt $WEB/.bak-vanvy-* 2>/dev/null | tail -n +6 | xargs -r rm -rf"

# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

# ⚠️ 关键：必须在 rm -rf $DIR 之前把现有 config.js 抢救出来，
#    否则读到的已是空目录 → 走 else 分支写最简配置 → 富配置全丢。
rm -f "$TMPD/vd-config.js"
docker exec "$CONTAINER" sh -c "test -f $DIR/config.js" 2>/dev/null \
  && docker cp "$CONTAINER:$DIR/config.js" "$TMPD/vd-config.js" 2>/dev/null || true

# 写入组件文件（重建目录）
docker exec "$CONTAINER" sh -c "rm -rf $DIR && mkdir -p $DIR/icons"
docker cp "$SRC/vanvy-detail.js"  "$CONTAINER:$DIR/vanvy-detail.js"
docker cp "$SRC/vanvy-detail.css" "$CONTAINER:$DIR/vanvy-detail.css"
for f in "$SRC"/icons/*.webp; do docker cp "$f" "$CONTAINER:$DIR/icons/$(basename $f)"; done

# 配置写入：已有富配置（由 install-ves.sh 生成 / 上面抢救出来的）就只改主题
if [ -s "$TMPD/vd-config.js" ] && grep -q "VANVY_DETAIL_CONFIG" "$TMPD/vd-config.js"; then
  if grep -qE "theme: *'" "$TMPD/vd-config.js"; then
    sed -i "s/theme: *'[^']*'/theme: '$THEME'/" "$TMPD/vd-config.js"
  else
    sed -i "s/{\(.*\)/{\n  theme: '$THEME',\1/" "$TMPD/vd-config.js"
  fi
  echo "ℹ️  已有 config.js → 仅更新主题为 $THEME（保留其它设置）"
else
  echo "window.VANVY_DETAIL_CONFIG={theme:'$THEME'};" > "$TMPD/vd-config.js"
fi
docker cp "$TMPD/vd-config.js" "$CONTAINER:$DIR/config.js"; rm -f "$TMPD/vd-config.js"

docker exec "$CONTAINER" sh -c "
  cd $WEB
  cp index.html /tmp/.ves$$_vd.html
  sed -i '/$MARK/d' /tmp/.ves$$_vd.html
  sed -i '/vanvy-detail\/vanvy-detail.css/d' /tmp/.ves$$_vd.html
  sed -i '/vanvy-detail\/vanvy-detail.js/d' /tmp/.ves$$_vd.html
  sed -i '/vanvy-detail\/config.js/d' /tmp/.ves$$_vd.html
  sed -i '/vanvy-detail-boot/d' /tmp/.ves$$_vd.html
  sed -i 's#</head>#<link rel=\"stylesheet\" href=\"vanvy-detail/vanvy-detail.css\" id=\"vanvy-detail-css\">\n<style id=\"vanvy-detail-boot\">html.vd-boot .itemView,html.vd-boot .itemBackdropContainer,html.vd-boot .backdropContainer{opacity:0!important}</style>\n<script id=\"vanvy-detail-boot-js\">document.documentElement.classList.add(\"vd-boot\");setTimeout(function(){document.documentElement.classList.remove(\"vd-boot\")},2600)</script>\n</head>#' /tmp/.ves$$_vd.html
  sed -i 's#</body>#<script src=\"vanvy-detail/config.js\"></script>\n<script src=\"vanvy-detail/vanvy-detail.js\"></script>\n$MARK\n</body>#' /tmp/.ves$$_vd.html
  cp /tmp/.ves$$_vd.html index.html && rm -f /tmp/.ves$$_vd.html
  echo '--- 注入 ---'; grep -n 'vanvy-detail' index.html"
echo "✅ 已安装 vanvy-detail ($CONTAINER, 主题:$THEME, 快照:$BK)"
echo "   回滚: docker exec $CONTAINER sh -c 'cp $BK/index.html $WEB/index.html && rm -rf $DIR'"
