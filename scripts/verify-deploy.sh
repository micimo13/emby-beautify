#!/usr/bin/env bash
# =============================================================================
#  部署新鲜度巡检 · verify-deploy.sh
#  ---------------------------------------------------------------------------
#  作用：比对「已发布到分发目录的产物」与「当前仓库」是否一致。
#        不一致 = 有人改了代码但忘了重新打包/发布。
#
#  检查三样：
#    ① ves.tar.gz        —— 包内 BUILD.json 的 git_head 是否 == 仓库 HEAD
#    ② 重新构建一次       —— sha256 是否与已发布包相同（最强校验）
#    ③ 预览页组件        —— hero-core / registry 版本是否与仓库一致
#
#  用法：
#    bash scripts/verify-deploy.sh            # 人看（彩色输出）
#    bash scripts/verify-deploy.sh --quiet    # 只输出结论（cron 用）
#    bash scripts/verify-deploy.sh --fix      # 不一致时自动重新打包并发布
#
#  退出码：0=一致  1=不一致  2=环境问题
# =============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

QUIET=0; FIX=0
for a in "$@"; do
  case "$a" in
    --quiet|-q) QUIET=1;;
    --fix)      FIX=1;;
    -h|--help)  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
  esac
done

# ── 分发目录（可用环境变量覆盖）──
DIST_DIR="${VANVY_DIST_DIR:-/vol1/1001/web}"
PKG="$DIST_DIR/ves.tar.gz"
PREVIEW_DIR="$DIST_DIR/mockup"

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { [ "$QUIET" = "1" ] || printf '%s\n' "$*"; }
ok()   { say "${C_OK}[OK]${C_OFF} $*"; }
err()  { say "${C_ERR}[X]${C_OFF} $*"; }
warn() { say "${C_WARN}[!]${C_OFF} $*"; }
info() { say "${C_DIM}·${C_OFF} $*"; }

FAIL=0
NOTES=()

# ── 环境 ──────────────────────────────────────────────────────
command -v git >/dev/null 2>&1 || { err "缺少 git"; exit 2; }
[ -d .git ] || { err "不是 git 工作区: $ROOT"; exit 2; }
[ -f "$PKG" ] || { err "找不到已发布包: $PKG"; exit 2; }

HEAD="$(git rev-parse HEAD)"
SHORT="${HEAD:0:8}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# ── ① 包内构建戳 ─────────────────────────────────────────────

# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if ! tar xzf "$PKG" -C "$TMP" 2>/dev/null; then
  err "已发布包无法解压（可能损坏）"; exit 2
fi
BJ="$(find "$TMP" -maxdepth 2 -name BUILD.json | head -1)"

if [ -z "$BJ" ]; then
  warn "包内没有 BUILD.json（老版本包，无法追溯）"
  NOTES+=("已发布包缺少构建戳 → 建议重新打包")
  FAIL=1
else
  PKG_HEAD="$(grep -oE '"git_head": *"[^"]*"' "$BJ" | grep -oE '[0-9a-f]{7,}' | head -1)"
  PKG_TIME="$(grep -oE '"built_at": *"[^"]*"' "$BJ" | cut -d'"' -f4)"
  PKG_DIRTY="$(grep -oE '"git_dirty": *[0-9]+' "$BJ" | grep -oE '[0-9]+')"
  PKG_HERO="$(grep -oE '"hero_core": *"[^"]*"' "$BJ" | cut -d'"' -f4)"
  info "包内戳: git ${PKG_HEAD:0:8} @ ${PKG_TIME}  hero-core v${PKG_HERO}${PKG_DIRTY:+ dirty=$PKG_DIRTY}"

  if [ "$PKG_HEAD" = "$HEAD" ]; then
    ok "① 包内 git 戳 == 仓库 HEAD (${SHORT})"
  else
    err "① 包内 git 戳 (${PKG_HEAD:0:8}) != 仓库 HEAD (${SHORT})"
    NOTES+=("已发布包落后于仓库（包=${PKG_HEAD:0:8} 仓库=$SHORT）")
    FAIL=1
  fi
  [ "${PKG_DIRTY:-0}" != "0" ] && { warn "包是 dirty 状态下构建的"; NOTES+=("已发布包构建时工作区不干净"); FAIL=1; }
fi

# ── ② 重新构建比对 sha256（最强校验）──────────────────────────
info "重新构建以比对内容 ..."
REBUILD_OUT="$TMP/out"
if bash scripts/build-package.sh --version _verify --out "$REBUILD_OUT" --force >"$TMP/build.log" 2>&1; then
  NEW="$REBUILD_OUT/ves-_verify.tar.gz"
  if [ -f "$NEW" ]; then
    # 逐文件比对（tar 内含时间戳/metadata，不能直接比整包 sha）
    A="$TMP/old"; B="$TMP/new"
    mkdir -p "$A" "$B"
    # --strip-components=1：忽略外层目录名差异（ves-stable vs ves-_verify）
    tar xzf "$PKG" -C "$A" --strip-components=1 2>/dev/null
    tar xzf "$NEW" -C "$B" --strip-components=1 2>/dev/null
    # 忽略 BUILD.json（每次构建时间不同）
    DIFF="$(diff -rq --exclude=BUILD.json "$A" "$B" 2>/dev/null | head -20)"
    if [ -z "$DIFF" ]; then
      ok "② 已发布包内容 == 当前仓库（逐文件一致）"
    else
      err "② 已发布包与当前仓库内容不一致："
      printf '%s\n' "$DIFF" | sed "s|$A|  [已发布]|; s|$B|  [仓库]  |" | sed 's/^/      /' | head -12 | while IFS= read -r l; do say "$l"; done
      NOTES+=("已发布包内容与仓库不一致（文件有增删改）")
      FAIL=1
    fi
  else
    warn "② 重新构建失败，跳过内容比对"
  fi
else
  warn "② 重新构建失败（看 $TMP/build.log）：$(tail -2 "$TMP/build.log" | tr '\n' ' ')"
fi

# ── ③ 预览页组件版本 ─────────────────────────────────────────
repo_ver() { grep -oE "$2" "$1" 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'; }
RH="$(repo_ver components/home/hero_studio/vanvy-hero-core.js 'core v[0-9.]+')"
if [ -f "$PREVIEW_DIR/hero-gallery/comps/vanvy-hero-core.js" ]; then
  PH="$(repo_ver "$PREVIEW_DIR/hero-gallery/comps/vanvy-hero-core.js" 'core v[0-9.]+')"
  if [ "$RH" = "$PH" ]; then
    ok "③ 预览页 hero-core 一致 (v$RH)"
  else
    err "③ 预览页 hero-core 落后 (预览 v$PH vs 仓库 v$RH)"
    NOTES+=("预览页未重建（hero-core 预览 v$PH vs 仓库 v$RH）")
    FAIL=1
  fi
else
  warn "③ 预览页未部署，跳过"
fi

# ── 结论 / 可选自动修复 ───────────────────────────────────────
if [ "$FAIL" = "0" ]; then
  say ""
  ok "🎉 部署产物与仓库一致（git ${BRANCH} @ ${SHORT}）"
  exit 0
fi

# 自动修复
if [ "$FIX" = "1" ]; then
  say ""
  warn "--fix：自动重新打包并发布 ..."
  if bash scripts/build-package.sh --version stable --force >/dev/null 2>&1 \
     && cp -f dist/ves-stable.tar.gz "$DIST_DIR/ves.tar.gz" \
     && cp -f online-install.sh "$DIST_DIR/online-install.sh" \
     && bash scripts/build-preview.sh >/dev/null 2>&1; then
    rm -rf dist
    ok "已重新打包并发布 → 再跑一次本脚本应显示一致"
    exit 0
  else
    err "自动修复失败，请手动处理"
    exit 2
  fi
fi

say ""
err "❌ 发现 ${#NOTES[@]} 项不一致："
for n in "${NOTES[@]}"; do say "   ${C_DIM}·${C_OFF} $n"; done
say ""
say "   ${C_DIM}修复：bash scripts/verify-deploy.sh --fix${C_OFF}"

# 输出一行机器可读结论（cron 用）
if [ "$QUIET" = "1" ]; then
  printf 'STALE %s %s\n' "$SHORT" "${NOTES[*]}"
fi
exit 1
