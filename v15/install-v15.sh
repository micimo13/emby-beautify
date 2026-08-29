#!/usr/bin/env bash
# =============================================================================
#  install-v15.sh — Vanvy Emby Kit V1.5 部署脚本（替代 V1 散弹注入）
#  ---------------------------------------------------------------------------
#  核心变化：
#   1. index.html 只注入一行 <script src="vanvy/vanvy-setup.js" defer>
#   2. 组件清单由 vanvy-manifest.json 声明（manifest 驱动加载）
#   3. 换轮播 = 只改 manifest，不再动 index.html（零残留）
#   4. core 库全局一份，不重复注入
#   5. 部署前自动跑纯净环境验收（mock + Playwright）
#
#  用法:
#    bash install-v15.sh --container emby-302          # 指定容器
#    bash install-v15.sh --banner banner_cinema        # 指定轮播
#    bash install-v15.sh --themes glass_graphite       # 指定主题(逗号分隔)
#    bash install-v15.sh --features a,b,c              # 指定功能
#    bash install-v15.sh --no-pure-check               # 跳过纯净验收
#    bash install-v15.sh --uninstall                   # 卸载(移除loader+清vanvy)
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VANVY_DIR="$SCRIPT_DIR/vanvy"
CONTAINER=""
BANNER="banner_cinema"
THEMES="glass_graphite,vanvy_custom"
FEATURES="danmaku,douban,playbackrate,localplayer,fluent_layout,global_fonts,jav_details,embytool,detail_extra,player_enhance"
PURE_CHECK=1
UNINSTALL=0
WEBROOT="/system/dashboard-ui"

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2 ;;
    --banner) BANNER="$2"; shift 2 ;;
    --themes) THEMES="$2"; shift 2 ;;
    --features) FEATURES="$2"; shift 2 ;;
    --no-pure-check) PURE_CHECK=0; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

c_info() { echo "  ✅ $1"; }
c_err() { echo "  ❌ $1" >&2; }
c_warn() { echo "  ⚠️  $1"; }

echo "══════════════════════════════════════════════"
echo "  Vanvy Emby Kit V1.5 · manifest 驱动部署"
echo "══════════════════════════════════════════════"

# ── 卸载模式 ──
if [ "$UNINSTALL" = 1 ]; then
  [ -z "$CONTAINER" ] && { c_err "请指定 --container"; exit 1; }
  echo "== 卸载 V1.5 =="
  docker exec "$CONTAINER" sh -c "
    INDEX='$WEBROOT/index.html'
    sed -i '/vanvy-setup.js/d' \"\$INDEX\" 2>/dev/null
    rm -rf '$WEBROOT/vanvy' '$WEBROOT/vanvy-manifest.json' 2>/dev/null
  " && c_info "已移除 loader 注入 + vanvy 目录"
  echo "完成。刷新 Emby 即恢复默认。"
  exit 0
fi

[ -z "$CONTAINER" ] && { c_err "请指定 --container (如 emby-302)"; exit 1; }
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  c_err "容器 [$CONTAINER] 不存在或未运行"
  exit 1
fi

# ── 1. 生成 manifest ──
echo "== [1/5] 生成 manifest =="
python3 "$SCRIPT_DIR/gen-manifest.py" "$BANNER" \
  --themes "$THEMES" --features "$FEATURES" \
  -o "$VANVY_DIR/vanvy-manifest.json" || exit 1
c_info "banner=$BANNER themes=$THEMES features=$FEATURES"

# ── 2. 纯净环境验收（默认开启）──
if [ "$PURE_CHECK" = 1 ]; then
  echo "== [2/5] 纯净环境验收 (mock + Playwright) =="
  if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "import playwright" 2>/dev/null; then
    c_warn "Playwright 不可用，跳过纯净验收（生产环境建议安装）"
  else
    # 起 mock 服务器
    MOCK_DIR="/tmp/v15-mock"
    rm -rf "$MOCK_DIR" && mkdir -p "$MOCK_DIR"
    cp -r "$VANVY_DIR" "$MOCK_DIR/vanvy"
    cp "$SCRIPT_DIR/test/mock/index.html" "$MOCK_DIR/index.html"
    echo '{}' > "$MOCK_DIR/config.json"
    # 复用已有 8899 或新起
    if ! curl -s -o /dev/null http://127.0.0.1:8899/index.html 2>/dev/null; then
      (python3 -m http.server 8899 --directory "$MOCK_DIR" >/tmp/v15-mock-server.log 2>&1 &)
      sleep 2
    fi
    cp "$VANVY_DIR/vanvy-manifest.json" "$MOCK_DIR/vanvy/vanvy-manifest.json"
    if python3 "$SCRIPT_DIR/test/verify_pure.py" "$BANNER" --mock "http://127.0.0.1:8899/index.html" 2>&1 | tee /tmp/v15-pure-check.log | grep -q "✅ 验收通过"; then
      c_info "纯净验收通过"
    else
      c_err "纯净验收失败，请查看 /tmp/v15-pure-check.log；可用 --no-pure-check 强制部署"
      exit 1
    fi
  fi
else
  echo "== [2/5] 纯净验收已跳过 =="
fi

# ── 3. 备份现有 ──
echo "== [3/5] 备份现有文件 =="
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="${WEBROOT}/.vanvy15_backup_${STAMP}"
docker exec "$CONTAINER" mkdir -p "$BACKUP" 2>/dev/null
docker exec "$CONTAINER" sh -c "test -e '$WEBROOT/index.html' && cp '$WEBROOT/index.html' '$BACKUP/' || true"
docker exec "$CONTAINER" sh -c "test -d '$WEBROOT/vanvy' && cp -r '$WEBROOT/vanvy' '$BACKUP/' || true"
c_info "备份 → $BACKUP"

# ── 4. 部署资源 ──
echo "== [4/5] 部署资源 =="
# 清理旧 V1 残留的轮播脚本注入（防止多份轮播并存）
docker exec "$CONTAINER" sh -c "
  INDEX='$WEBROOT/index.html'
  sed -i '/banner_classic\/banner-classic.js/d;/banner_fluent\/banner-fluent.js/d;/banner_carousel\/banner-carousel.js/d;/banner_homeswiper\/HomeSwiper.js/d;/banner_aurora\/banner-aurora.js/d;/banner_cinema\/banner-cinema.js/d;/banner_split\/banner-split.js/d;/vanvy\/core\//d;/vanvy\/themes\//d;/vanvy\/features\//d;/carousel_rules\/rules-loader.js/d' \"\$INDEX\" 2>/dev/null
  rm -rf '$WEBROOT/vanvy' 2>/dev/null
" && c_info "已清理旧 V1 残留注入"
docker cp "$VANVY_DIR" "$CONTAINER:$WEBROOT/vanvy" 2>/dev/null || { c_err "部署 vanvy 目录失败"; exit 1; }
# jav_details 需要 config.json 在 web 根
docker exec "$CONTAINER" sh -c "test -f '$WEBROOT/vanvy/features/jav_details/config.json' && cp '$WEBROOT/vanvy/features/jav_details/config.json' '$WEBROOT/config.json' || true"
c_info "vanvy 资源已部署"

# ── 5. 注入 loader（幂等）──
echo "== [5/5] 注入 loader =="
docker exec "$CONTAINER" sh -c "
  INDEX='$WEBROOT/index.html'
  if grep -q 'vanvy-setup.js' \"\$INDEX\"; then
    echo '已存在 vanvy-setup.js，跳过注入'
  else
    sed -i 's#</body>#    <script src=\"vanvy/vanvy-setup.js\" defer></script>\n</body>#' \"\$INDEX\" 2>/dev/null \
      && echo '已注入 vanvy-setup.js' || echo 'sed 失败，请手动注入'
  fi
"
c_info "部署完成！Ctrl+F5 强刷 Emby 查看效果"
echo "  回滚: docker exec $CONTAINER sh -c 'cp $BACKUP/index.html $WEBROOT/index.html && rm -rf $WEBROOT/vanvy'"
echo "══════════════════════════════════════════════"
