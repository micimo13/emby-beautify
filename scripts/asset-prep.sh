#!/usr/bin/env bash
# =============================================================================
#  资源预处理 · asset-prep.sh
#  ---------------------------------------------------------------------------
#  把「本地文件 或 图片 URL」统一变成「本地已就绪的图片文件」：
#    ① 下载（URL；直连失败按 VANVY_PROXY_URL 逐个代理回退）
#    ② 魔数校验（PNG/JPEG/GIF/WEBP/ICO/SVG）→ 404 页/HTML 直接拒绝
#    ③ 超大图自动缩小（LOGO ≤800px / favicon ≤256px，有 PIL/ffmpeg/convert 才做）
#
#  用法: bash scripts/asset-prep.sh <logo|favicon> <src> <out-dir>
#        成功: stdout 打印最终文件路径，退出码 0
#        失败: 打印原因到 stderr，退出码 1
# =============================================================================
set -u

KIND="${1:-logo}"; SRC="${2:-}"; OUTDIR="${3:-/tmp}"; OUTDIR="${OUTDIR%/}"
mkdir -p "$OUTDIR" 2>/dev/null || true

say() { printf '%s\n' "$*" >&2; }

# ── 扩展名推断 ────────────────────────────────────────────────
asset_ext() {
  local s="${1%%\?*}"
  case "$s" in
    *.png) printf png;; *.jpg|*.jpeg) printf jpg;; *.svg) printf svg;;
    *.webp) printf webp;; *.gif) printf gif;; *.ico) printf ico;; *) printf png;;
  esac
}

# ── 拉取（本地复制 或 URL 下载）───────────────────────────────
fetch() {
  local src="$1" out="$2"
  case "$src" in
    http://*|https://*)
      local DL=""
      command -v curl >/dev/null 2>&1 && DL=curl
      [ -z "$DL" ] && command -v wget >/dev/null 2>&1 && DL=wget
      [ -z "$DL" ] && { say "本机无 curl/wget，无法下载"; return 1; }
      local -a tries=(""); local p
      for p in $(printf '%s' "${VANVY_PROXY_URL:-}" | tr ',' ' '); do [ -n "$p" ] && tries+=("$p"); done
      for p in "${tries[@]}"; do
        if [ "$DL" = curl ]; then
          if [ -n "$p" ]; then curl -fsSL --connect-timeout 8 --max-time 90 --proxy "$p" "$src" -o "$out" 2>/dev/null
          else curl -fsSL --connect-timeout 8 --max-time 90 "$src" -o "$out" 2>/dev/null; fi
        else
          if [ -n "$p" ]; then wget -q --timeout=8 --tries=1 -e use_proxy=yes -e "http_proxy=$p" -e "https_proxy=$p" -O "$out" "$src" 2>/dev/null
          else wget -q --timeout=8 --tries=1 -O "$out" "$src" 2>/dev/null; fi
        fi
        [ -s "$out" ] && return 0
      done
      rm -f "$out" 2>/dev/null || true
      return 1;;
    *) [ -f "$src" ] || { say "文件不存在: $src"; return 1; }; cp "$src" "$out" 2>/dev/null || return 1; return 0;;
  esac
}

# ── 魔数校验 ──────────────────────────────────────────────────
is_image() {
  local f="$1"; [ -s "$f" ] || return 1
  local h; h="$(head -c 16 "$f" | od -An -tx1 2>/dev/null | tr -d ' \n')"
  case "$h" in
    89504e47*|ffd8ff*|47494638*|52494646*57454250*|00000100*|00000200*) return 0;;
  esac
  head -c 400 "$f" 2>/dev/null | grep -qi '<svg' && return 0
  return 1
}

# ── 超大图缩小（有工具才做）────────────────────────────────────
shrink() {
  local f="$1" ext="$2"
  [ "$ext" = svg ] && return 0                    # 矢量图不动
  local sz; sz="$(wc -c <"$f" 2>/dev/null | tr -d ' ')"
  local LIMIT=524288; [ "$KIND" = favicon ] && LIMIT=262144
  [ "${sz:-0}" -lt "$LIMIT" ] && return 0         # 本来就不大 → 跳过
  local MAX=800; [ "$KIND" = favicon ] && MAX=256
  local tmp="$f.shrink.$ext"
  if command -v python3 >/dev/null 2>&1 && python3 -c 'import PIL' >/dev/null 2>&1; then
    if python3 - "$f" "$MAX" "$KIND" <<'PY' >/dev/null 2>&1
import sys, os
from PIL import Image
p, mx, kind = sys.argv[1], int(sys.argv[2]), sys.argv[3]
try:
    im = Image.open(p)
except Exception:
    sys.exit(1)
if max(im.size) <= mx:
    sys.exit(3)
im = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA", "PA") else im.convert("RGB")
im.thumbnail((mx, mx), Image.LANCZOS)
out = p + ".out" + (os.path.splitext(p)[1] or ".png")
if os.path.splitext(p)[1].lower() in (".jpg", ".jpeg"):
    im.convert("RGB").save(out, quality=88, optimize=True)
else:
    im.save(out, optimize=True)
PY
    then
      _out="$f.out.$ext"
      if [ -s "$_out" ]; then mv "$_out" "$f"; say "   ↳ 已压缩（$((${sz:-0}/1024))KB → $(($(wc -c <"$f" | tr -d ' ')/1024))KB）"; fi
      rm -f "$_out" 2>/dev/null || true
      return 0
    fi
  fi
  if command -v ffmpeg >/dev/null 2>&1; then
    if ffmpeg -y -loglevel error -i "$f" -vf "scale='min($MAX,iw)':-1" -pix_fmt rgba "$tmp" >/dev/null 2>&1 && [ -s "$tmp" ]; then
      mv "$tmp" "$f"; say "   ↳ 已压缩（ffmpeg）"; return 0
    fi
  fi
  if command -v convert >/dev/null 2>&1 || command -v magick >/dev/null 2>&1; then
    local IC=convert; command -v convert >/dev/null 2>&1 || IC=magick
    if $IC "$f" -resize "${MAX}x${MAX}>" "$tmp" >/dev/null 2>&1 && [ -s "$tmp" ]; then
      mv "$tmp" "$f"; say "   ↳ 已压缩（$IC）"; return 0
    fi
  fi
  say "   ⚠️ 图片偏大（$((${sz:-0}/1024))KB），本机没有 python3+PIL / ffmpeg / ImageMagick，未压缩"
  return 0
}

# ── 主流程 ────────────────────────────────────────────────────
[ -n "$SRC" ] || { say "用法: asset-prep.sh <logo|favicon> <源> [输出目录]"; exit 1; }
EXT="$(asset_ext "$SRC")"
OUT="$OUTDIR/vanvy-$KIND.$EXT"
fetch "$SRC" "$OUT" || { say "下载/复制失败: $SRC"; exit 1; }
is_image "$OUT" || { rm -f "$OUT"; say "不是有效图片（可能是 404 页/HTML）: $SRC"; exit 1; }
shrink "$OUT" "$EXT"
printf '%s\n' "$OUT"
