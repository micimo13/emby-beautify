#!/usr/bin/env bash
# =============================================================================
#  vanvy-login 安装/卸载（在 UNRAID 宿主机运行）
#  Emby 登录页美化（用户选择页 + 密码页）：品牌头 + 满屏背景 + 毛玻璃卡片
#  用法:
#    bash install-login.sh --container emby-302
#    bash install-login.sh --container emby-302 --uninstall
# =============================================================================
set -eu
CONTAINER=""; MODE="install"; SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB=/system/dashboard-ui; DIR=$WEB/vanvy-login; MARK='<!-- VANVY-LOGIN -->'

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
    sed -i '/vanvy-login\//d' index.html
    rm -rf $DIR
    echo '残留:'; grep -c vanvy-login index.html || true"
  echo "✅ 已卸载 vanvy-login ($CONTAINER)"; exit 0
fi

docker exec "$CONTAINER" sh -c "mkdir -p $BK && cp $WEB/index.html $BK/"
docker exec "$CONTAINER" sh -c "ls -dt $WEB/.bak-vanvy-* 2>/dev/null | tail -n +6 | xargs -r rm -rf" 2>/dev/null || true

docker exec "$CONTAINER" sh -c "rm -rf $DIR && mkdir -p $DIR"
docker cp "$SRC/vanvy-login.js"  "$CONTAINER:$DIR/vanvy-login.js"
docker cp "$SRC/vanvy-login.css" "$CONTAINER:$DIR/vanvy-login.css"

# 保留已有配置（只补缺省），避免重部署把用户设置冲掉
if docker exec "$CONTAINER" sh -c "test -f $DIR/config.js" 2>/dev/null; then
  echo "ℹ️  已有 config.js → 保留现有设置"
else
  docker exec "$CONTAINER" sh -c "cat > $DIR/config.js <<'EOF'
window.VANVY_LOGIN_CONFIG = { enabled: true, subtitle: '欢迎回来', blur: 22, tint: 0.42 };
EOF"
fi

docker exec "$CONTAINER" sh -c "
  cd $WEB
  cp index.html /tmp/.ves\$\$_vl.html
  sed -i '/$MARK/d' /tmp/.ves\$\$_vl.html
  sed -i '/vanvy-login\//d' /tmp/.ves\$\$_vl.html
  sed -i 's#</body>#<link rel=\"stylesheet\" href=\"vanvy-login/vanvy-login.css\" id=\"vl-css\">\n<script src=\"vanvy-login/config.js\"></script>\n<script src=\"vanvy-login/vanvy-login.js\"></script>\n$MARK\n</body>#' /tmp/.ves\$\$_vl.html
  cp /tmp/.ves\$\$_vl.html index.html && rm -f /tmp/.ves\$\$_vl.html
  echo '--- 注入 ---'; grep -n 'vanvy-login' index.html"
echo "✅ 已安装 vanvy-login ($CONTAINER, 快照:$BK)"
echo "   回滚: docker exec $CONTAINER sh -c 'cp $BK/index.html $WEB/index.html && rm -rf $DIR'"
