#!/usr/bin/env bash
# =============================================================================
#  vanvy-home 安装/卸载（在 UNRAID 宿主机上运行）
#  用法:
#    bash install.sh --container emby-302                # 安装/升级
#    bash install.sh --container emby-302 --uninstall    # 卸载（完全还原）
#  说明:
#    - 改动前自动快照 index.html 到 /system/dashboard-ui/.bak-vanvy-<TS>/
#    - 幂等：重复执行不会叠加注入
#    - 只动 index.html + vanvy-home/ 目录，不碰媒体库/数据库/其它文件
# =============================================================================
set -eu
CONTAINER=""; MODE="install"; THEME=""; SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB=/system/dashboard-ui; DIR=$WEB/vanvy-home; MARK='<!-- VANVY-HOME -->'

# 配色预设（与 vanvy-home.js 的 CFG.presets 保持一致）
PRESET_KEYS="aurora blackgold champagne emerald sakura sunset amber crimson violet graphite"
PRESET_NAMES="极光蓝 黑金 香槟金 翡翠绿 樱花粉 落日橙 琥珀金 赤霞红 幻紫 石墨灰"

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2;;
    --theme) THEME="$2"; shift 2;;
    --uninstall) MODE="uninstall"; shift;;
    *) echo "未知参数: $1"; exit 1;;
  esac
done
[ -n "$CONTAINER" ] || { echo "请指定 --container emby-302"; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "容器不存在: $CONTAINER"; exit 1; }

TS=$(date +%Y%m%d-%H%M%S)
BK="$WEB/.bak-vanvy-$TS"

if [ "$MODE" = "uninstall" ]; then
  docker exec "$CONTAINER" sh -c "
    cd $WEB
    mkdir -p $BK && cp index.html $BK/ 2>/dev/null || true
    ls -dt $WEB/.bak-vanvy-* 2>/dev/null | tail -n +6 | xargs -r rm -rf
    sed -i '/$MARK/d' index.html
    sed -i '/vanvy-home\/vanvy-home.css/d' index.html
    sed -i '/vanvy-home\/vanvy-home.js/d' index.html
    sed -i '/vanvy-home\/config.js/d' index.html
    rm -rf $DIR
    echo '--- 清理后残留检查 ---'
    grep -c vanvy-home index.html || true
  "
  echo "✅ 已卸载 $CONTAINER"
  exit 0
fi

# 选择配色（命令行参数 > 交互选择 > 默认）
if [ -z "$THEME" ]; then
  echo
  echo "================ 选择首页配色 ================"
  i=1
  for k in $PRESET_KEYS; do
    nm=$(echo $PRESET_NAMES | cut -d' ' -f$i)
    printf "  %d) %-8s (%s)\n" "$i" "$nm" "$k"
    i=$((i+1))
  done
  echo "============================================="
  printf "请选择 [1-10]（直接回车=1 极光蓝）: "
  SEL=""
  read -r SEL </dev/tty 2>/dev/null || read -r SEL || true
  [ -z "$SEL" ] && SEL=1
  THEME=$(echo $PRESET_KEYS | cut -d' ' -f"$SEL" 2>/dev/null || echo aurora)
  case " $PRESET_KEYS " in *" $THEME "*) ;; *) echo "无效选择，用默认 aurora"; THEME=aurora;; esac
fi
echo "✔ 配色: $THEME"
# 快照
docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/"
docker exec "$CONTAINER" sh -c "ls -dt $WEB/.bak-vanvy-* 2>/dev/null | tail -n +6 | xargs -r rm -rf"

# 落位文件（清空旧目录，避免测试残留）
docker exec "$CONTAINER" sh -c "rm -rf $DIR && mkdir -p $DIR"
docker cp "$SRC_DIR/vanvy-home.js"  "$CONTAINER:$DIR/vanvy-home.js"
docker cp "$SRC_DIR/vanvy-home.css" "$CONTAINER:$DIR/vanvy-home.css"

# 写入 deploy 选定配色 → config.js

# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

echo "window.VANVY_HOME_CONFIG={theme:'$THEME'};" > $TMPD/vanvy-home-config.js
docker cp $TMPD/vanvy-home-config.js "$CONTAINER:$DIR/config.js"; rm -f $TMPD/vanvy-home-config.js

# 注入（幂等）
docker exec "$CONTAINER" sh -c "
  cd $WEB
  cp index.html /tmp/.ves$$_idx.html
  sed -i '/$MARK/d' /tmp/.ves$$_idx.html
  sed -i '/vanvy-home\/vanvy-home.css/d' /tmp/.ves$$_idx.html
  sed -i '/vanvy-home\/vanvy-home.js/d' /tmp/.ves$$_idx.html
  sed -i '/vanvy-home\/config.js/d' /tmp/.ves$$_idx.html
  sed -i 's#</head>#<link rel=\"stylesheet\" href=\"vanvy-home/vanvy-home.css\" id=\"vanvy-home-css\">\n</head>#' /tmp/.ves$$_idx.html
  sed -i 's#</body>#<script src=\"vanvy-home/config.js\"></script>\n<script src=\"vanvy-home/vanvy-home.js\"></script>\n$MARK\n</body>#' /tmp/.ves$$_idx.html
  cp /tmp/.ves$$_idx.html index.html && rm -f /tmp/.ves$$_idx.html
  echo '--- 注入结果 ---'
  grep -n 'vanvy-home' index.html
"
echo "✅ 已安装到 $CONTAINER（主题: $THEME, 快照: $BK）"
echo "   换色: 重新运行本脚本选其它颜色（不用卸载）"
echo "   回滚: docker exec $CONTAINER sh -c 'cp $BK/index.html $WEB/index.html && rm -rf $DIR'"
