#!/usr/bin/env bash
# =============================================================================
#  vanvy-list-trailer 安装/卸载（在 UNRAID 宿主机运行）
#  卡片预告片：悬停静音预览 + 展开按钮弹框（正经库 / R18 库通用）
#  用法:
#    bash install-list-trailer.sh --container emby-302
#    bash install-list-trailer.sh --container emby-302 --uninstall
# =============================================================================
set -eu
CONTAINER=""; MODE="install"; SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB=/system/dashboard-ui; DIR=$WEB/vanvy-list-trailer; MARK='<!-- VANVY-LIST-TRAILER -->'

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2;;
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
    mkdir -p $BK && cp index.html $BK/ 2>/dev/null || true
    sed -i '/$MARK/d' index.html
    sed -i '/vanvy-list-trailer\//d' index.html
    rm -rf $DIR
    echo '残留:'; grep -c vanvy-list-trailer index.html || true"
  echo "✅ 已卸载 vanvy-list-trailer ($CONTAINER)"; exit 0
fi

docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/"
docker exec "$CONTAINER" sh -c "ls -dt $WEB/.bak-vanvy-* 2>/dev/null | tail -n +6 | xargs -r rm -rf" 2>/dev/null || true

# ── 临时目录自愈（容器内一律用 /tmp/.ves$$_*）──
docker exec "$CONTAINER" sh -c "rm -rf $DIR && mkdir -p $DIR"
docker cp "$SRC/vanvy-list-trailer.js"  "$CONTAINER:$DIR/vanvy-list-trailer.js"
docker cp "$SRC/vanvy-list-trailer.css" "$CONTAINER:$DIR/vanvy-list-trailer.css"

# 保留已有配置（只补缺省），避免重部署把用户开关冲掉
if docker exec "$CONTAINER" sh -c "test -f $DIR/config.js" 2>/dev/null; then
  echo "ℹ️  已有 config.js → 保留现有设置"
else
  docker exec "$CONTAINER" sh -c "cat > $DIR/config.js <<'EOF'
window.VANVY_LIST_TRAILER_CONFIG = { enabled: true, hover: true, expand: true, delay: 320 };
EOF"
fi

docker exec "$CONTAINER" sh -c "
  cd $WEB
  cp index.html /tmp/.ves\$\$_vlt.html
  sed -i '/$MARK/d' /tmp/.ves\$\$_vlt.html
  sed -i '/vanvy-list-trailer\//d' /tmp/.ves\$\$_vlt.html
  sed -i 's#</head>#<link rel=\"stylesheet\" href=\"vanvy-list-trailer/vanvy-list-trailer.css\" id=\"vtl-css\">\n</head>#' /tmp/.ves\$\$_vlt.html
  sed -i 's#</body>#<script src=\"vanvy-list-trailer/config.js\"></script>\n<script src=\"vanvy-list-trailer/vanvy-list-trailer.js\"></script>\n$MARK\n</body>#' /tmp/.ves\$\$_vlt.html
  cp /tmp/.ves\$\$_vlt.html index.html && rm -f /tmp/.ves\$\$_vlt.html
  echo '--- 注入 ---'; grep -n 'vanvy-list-trailer' index.html"
echo "✅ 已安装 vanvy-list-trailer ($CONTAINER, 快照:$BK)"
echo "   回滚: docker exec $CONTAINER sh -c 'cp $BK/index.html $WEB/index.html && rm -rf $DIR'"
