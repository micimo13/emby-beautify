#!/usr/bin/env bash
# =============================================================================
#  构建可视化预览页（从组件源码生成 → 保证「预览 = 实际部署效果」）
#  用法: bash scripts/build-preview.sh [--out /vol1/1001/web/mockup]
#  产出:
#    <out>/loading-gallery/   加载页：10 配色 × 8 样式（自动收录）
#    <out>/banner-gallery/    首页轮播：7 款设计师样式
# =============================================================================
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="/vol1/1001/web/mockup"
[ "${1:-}" = "--out" ] && OUT="$2"

# ── ① 加载页画廊 ─────────────────────────────────────────────
S="$ROOT/components/loading/vanvy"
D="$OUT/loading-gallery"
mkdir -p "$D/styles"
# 加载样式：自动收录 components/loading/<style>/style.css 下所有款
#  ⚠️ 曾写死白名单（aurora cinema minimal split logo）→ 新增的 orbit/pulse 漏发，
#     页面里这两张缩略图 404 后回落到「默认·极简」，看起来就是「效果图没换」
for d in "$ROOT"/components/loading/*/; do
  st="$(basename "$d")"
  [ "$st" = "vanvy" ] && continue          # 核心目录，非样式款
  [ -f "$d/style.css" ] || continue
  cp "$d/style.css" "$D/styles/$st.css"
done
cp "$S/vanvy-loading.css" "$D/vanvy-loading.css"
cp "$ROOT/preview/loading-gallery/preview.html" "$D/preview.html"
cp "$ROOT/preview/loading-gallery/index.html"   "$D/index.html"
if [ -f "$S/logos/emby-302/brand.png" ]; then
  cp "$S/logos/emby-302/brand.png" "$D/brand.png"
  cp "$S/logos/emby-302/favicon.png" "$D/favicon.png"
elif [ -f "$S/logo/brand.png" ]; then
  cp "$S/logo/brand.png" "$D/brand.png"
fi
echo "✅ 加载页预览 → $D"

# ── ② 轮播画廊 ───────────────────────────────────────────────
BD="$ROOT/components/home/banner_designer"
E="$OUT/banner-gallery"
mkdir -p "$E/comps"
for d in "$BD"/banner_*/; do
  id="$(basename "$d")"
  mkdir -p "$E/comps/$id"
  cp "$d"/banner-*.js "$E/comps/$id/" 2>/dev/null || true
  cp "$d"/style.css    "$E/comps/$id/" 2>/dev/null || true
done
cp "$BD/vanvy-carousel-core.js" "$E/comps/"
cp "$BD/mock-data.js" "$BD/mock-api.js" "$E/"
cp "$ROOT/preview/banner-gallery/preview.html" "$E/preview.html"
cp "$ROOT/preview/banner-gallery/index.html"   "$E/index.html"
# 示例图：若不存在则提示（用 scripts/fetch-preview-images.py 生成）
if [ ! -d "$E/img" ] || [ -z "$(ls -A "$E/img" 2>/dev/null)" ]; then
  echo "⚠️  缺少示例图 → 运行: VANVY_EMBY=... VANVY_EMBY_KEY=... VANVY_EMBY_UID=... python3 scripts/fetch-preview-images.py"
fi
echo "✅ 轮播预览 → $E"

# ── ③ HERO 工作室画廊 ────────────────────────────────────────
HS="$ROOT/components/home/hero_studio"
G="$OUT/hero-gallery"
mkdir -p "$G/comps"
for d in "$HS"/hero_*/; do
  id="$(basename "$d")"
  mkdir -p "$G/comps/$id"
  cp "$d"/*.js "$G/comps/$id/" 2>/dev/null || true
  cp "$d"/style.css "$G/comps/$id/" 2>/dev/null || true
done
cp "$HS/vanvy-hero-core.js" "$G/comps/"
# 生产版轮播（banner_home）也进画廊，供「★ 生产版」预览
if [ -d "$ROOT/components/home/banner_home" ]; then
  mkdir -p "$G/comps/hero_home"
  cp "$ROOT/components/home/banner_home/vanvy-home.js"  "$G/comps/hero_home/" 2>/dev/null || true
  cp "$ROOT/components/home/banner_home/vanvy-home.css" "$G/comps/hero_home/" 2>/dev/null || true
fi
[ -f "$HS/mock-data.js" ] && cp "$HS/mock-data.js" "$HS/mock-api.js" "$G/" || cp "$BD/mock-data.js" "$BD/mock-api.js" "$G/"
cp "$ROOT/preview/hero-gallery/preview.html" "$G/preview.html"
cp "$ROOT/preview/hero-gallery/home.html"    "$G/home.html"
cp "$ROOT/preview/hero-gallery/index.html"   "$G/index.html"
# 示例图复用轮播画廊的
if [ ! -d "$G/img" ] && [ -d "$E/img" ]; then cp -r "$E/img" "$G/img"; fi
echo "✅ HERO 预览 → $G"

# ── ④ 安装引导页 ─────────────────────────────────────────────
GUIDE="$OUT/setup-guide"
mkdir -p "$GUIDE"
cp "$ROOT/preview/setup-guide/index.html" "$GUIDE/index.html"
echo "✅ 安装引导 → $GUIDE"

echo
echo "在线地址:"
DOM="${VANVY_PUBLIC_DOMAIN:-<你的分发域名>}"
echo "  加载页 https://$DOM/mockup/loading-gallery/"
echo "  轮播   https://$DOM/mockup/banner-gallery/"
echo "  HERO   https://$DOM/mockup/hero-gallery/"
echo "  安装引导 https://$DOM/mockup/setup-guide/"
