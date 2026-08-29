#!/usr/bin/env bash
# =============================================================================
#  Vanvy Emby Kit · 打包 Chrome 扩展 (MV3)
#  ---------------------------------------------------------------------------
#  用法: bash scripts/build_extension.sh
#  产物: extension/vanvy-emby-kit-extension.zip (Chrome 加载已解压的扩展直接可用)
# =============================================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_ROOT="$(dirname "$SCRIPT_DIR")"
EXT_DIR="$KIT_ROOT/extension"
OUT="$EXT_DIR/vanvy-emby-kit-extension.zip"

cd "$KIT_ROOT"
echo "🔨 构建 Chrome 扩展 (MV3)..."
# 同步最新组件到扩展目录 (保持扩展与 server 版同源)
cp core/jquery-3.6.0.min.js core/common-utils.js core/md5.min.js "$EXT_DIR/static/js/"
cp components/home/carousel_rules/rules-loader.js "$EXT_DIR/content/"
cp components/home/banner_fluent/banner-fluent.js "$EXT_DIR/content/"
cp components/features/fluent_layout/fluent-layout.js "$EXT_DIR/content/"
cp components/features/global_fonts/global-fonts.js "$EXT_DIR/content/"
cp components/features/global_fonts/style.css "$EXT_DIR/static/css/"
echo "  ✓ 组件已同步"

# 打包 (排除自身 zip)
rm -f "$OUT"
cd "$EXT_DIR"
zip -r "$OUT" manifest.json content static -x "*.zip" > /dev/null
echo "  ✓ 已打包: $OUT"
echo ""
echo "使用: Chrome → chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选择 $EXT_DIR"
echo "或直接解压 $OUT 后加载"
