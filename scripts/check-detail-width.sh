#!/usr/bin/env bash
# =============================================================================
#  check-detail-width.sh — 详情页「内容列」宽度防回归
#  ---------------------------------------------------------------------------
#  背景（2026-09-13 主人实测）：
#    Emby 4.9 的 .details-additionalContent 是「row + flex-wrap」容器，
#    注入块作为 flex item 会按 max-content 撑开 → 被 --vd-col-max(1500px) 顶到
#    1500px，而容器只有 ~1202px（4.9 有左侧常驻抽屉）→ 右侧溢出被裁、
#    与 hero 左边缘对不齐。4.8 是块级容器，同样的 CSS 看不出问题。
#  规则：凡是用「max-width + margin:auto」收窄到内容列的注入块，
#    必须同时声明 width:100%（+ box-sizing），否则在 4.9 上会被撑开。
#
#  用法: bash scripts/check-detail-width.sh        # 检查（失败非零退出）
# =============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSS="$ROOT/components/features/detail/vanvy-detail.css"
FAIL=0

# ⚠️ 必须先剥掉 /* … */ 注释：我们的说明注释里就写着 "width:100%"，
#    不剥的话会把注释当成命中 → 反向测试无法失败（踩过）。
STRIPPED="$(python3 - "$CSS" <<'PY'
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()
sys.stdout.write(re.sub(r'/\*.*?\*/', '', src, flags=re.S))
PY
)"

chk() { # chk <选择器描述> <awk 提取的块>
  local name="$1" blk="$2"
  if printf '%s' "$blk" | grep -q 'max-width:[^;]*--vd-col-max'; then
    if ! printf '%s' "$blk" | grep -q 'width: *100%'; then
      echo "✗ $name 用了 --vd-col-max 收窄但没有 width:100%（4.9 上会被撑开溢出）"
      FAIL=1
    else
      echo "✓ $name"
    fi
  fi
}

# ① .vd-sections-host
chk ".vd-sections-host" "$(printf '%s' "$STRIPPED" | awk '/^\.vd-sections-host \{/,/^\}/')"
# ② 原生容器收窄规则
chk "details-additionalContent > .verticalSection" \
    "$(printf '%s' "$STRIPPED" | awk '/details-additionalContent > \.verticalSection/,/^\}/')"
# ③ .vd-p2-about（用 calc(100% - pad) 写法，等价安全）
if printf '%s' "$STRIPPED" | awk '/\.vd-p2-about \{/,/^\}/' | grep -q 'width: calc(100% - 2 \* var(--vd-col-pad))'; then
  echo "✓ .vd-p2-about (用 calc(100% - 2*pad)，安全)"
else
  echo "✗ .vd-p2-about 宽度写法异常（应为 calc(100% - 2 * var(--vd-col-pad))）"; FAIL=1
fi

if [ "$FAIL" = 0 ]; then echo "✅ 详情页内容列宽度规则合规"; else echo "❌ 存在会溢出 4.9 的规则"; fi
exit "$FAIL"
