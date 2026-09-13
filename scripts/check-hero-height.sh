#!/usr/bin/env bash
# =============================================================================
#  轮播/hero 布局防回归检查 · check-hero-height.sh
#  ---------------------------------------------------------------------------
#  规则（docs/MAINTENANCE.md 四点五）：
#    ① 任何「满屏」高度都必须运行时实测 → 必须写成
#         height: <fallback>vh; height: var(--vh-hero-h, <fallback>dvh);
#       不允许只写死 `height: NNvh` / `100vh` / `100svh` 当最终值，
#       否则 Emby 4.9（固定视口高滚动区）会底部留白 —— 4.8 看不出来，只在 4.9 暴露。
#    ② 组件子树必须显式声明 box-sizing: border-box。
#       Emby 全局是 content-box → 子元素 height:100% + padding 会多出 padding 的高度，
#       内容被推出 hero 外（手机端「立即播放」按钮被切到屏幕外）。
#
#  用法: bash scripts/check-hero-height.sh
#       退出码 0=通过  1=发现问题
# =============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_OFF=$'\033[0m'; C_DIM=$'\033[2m'

FILES=$(ls components/home/hero_studio/hero_*/style.css \
           components/home/banner_home/vanvy-home.css \
           components/home/banner_designer/banner_*/style.css 2>/dev/null)

HITS=0
for f in $FILES; do
  # ① 根节点高度写死（形如 height: 80vh / 100vh / 100svh，排除 min-/max-/line-height）
  BAD=$(grep -nP '(?<![-\w])height:[[:space:]]*(100|[0-9]{1,2})(vh|svh|dvh|lvh)' "$f" \
        | grep -v 'vh-hero-h' || true)
  if [ -n "$BAD" ]; then
    printf '%s[!]%s %s\n' "$C_WARN" "$C_OFF" "$f"
    printf '%s\n' "$BAD" | sed 's/^/     /' | cut -c1-140
    printf '     %s\n' "→ 写死的满屏高度（4.9 会底部留白）"
    HITS=$((HITS+1))
  fi
  # ② 有 height:100% 却没声明 box-sizing → content-box 下会溢出
  if grep -qP 'height:[[:space:]]*100%' "$f" && ! grep -q 'box-sizing' "$f"; then
    printf '%s[!]%s %s\n' "$C_WARN" "$C_OFF" "$f"
    printf '     %s\n' "→ 有 height:100% 但未声明 box-sizing（content-box 下 padding 会把内容顶出屏外）"
    HITS=$((HITS+1))
  fi
done

echo ""
if [ "$HITS" = "0" ]; then
  printf '%s✅ 满屏高度用实测变量、盒模型已统一（防 4.9 底部留白 / 移动端按钮被切）%s\n' "$C_OK" "$C_OFF"
  exit 0
else
  printf '%s❌ %d 处问题（写死高度 / 缺 box-sizing）%s\n' "$C_ERR" "$HITS" "$C_OFF"
  echo "   ${C_DIM}① height: NNvh; height: var(--vh-hero-h, NNdvh);（变量由 fitHero()/fitHeight() 写入）${C_OFF}"
  echo "   ${C_DIM}② .vanvy-hero-x, .vanvy-hero-x * { box-sizing: border-box; }${C_OFF}"
  exit 1
fi
