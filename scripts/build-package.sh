#!/usr/bin/env bash
# =============================================================================
#  VES · 构建分发包
#  ---------------------------------------------------------------------------
#  产出一个干净、可分发、可校验的 tar.gz（不含密钥/内网信息/开发脚本）。
#
#  用法:
#    bash scripts/build-package.sh                  # 构建到 dist/
#    bash scripts/build-package.sh --version 2.1.0  # 指定版本
#    bash scripts/build-package.sh --check-only     # 只做泄露检查
#
#  产物:
#    dist/ves-<version>.tar.gz
#    dist/ves-<version>.sha256
#    dist/ves-<version>.manifest.txt
# =============================================================================
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=""
CHECK_ONLY=0
FORCE=0
OUT="$ROOT/dist"
while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2;;
    --out)     OUT="$2"; shift 2;;
    --check-only) CHECK_ONLY=1; shift;;
    --force)      FORCE=1; shift;;          # 跳过「未提交改动」检查
    *) echo "未知参数: $1"; exit 1;;
  esac
done
[ -n "$VERSION" ] || VERSION="$(date +%Y%m%d)"
DIST_NAME="ves-$VERSION"

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
ok()   { printf '%s[OK]%s %s\n' "$C_OK" "$C_OFF" "$*"; }
err()  { printf '%s[X]%s %s\n' "$C_ERR" "$C_OFF" "$*"; }
warn() { printf '%s[!]%s %s\n' "$C_WARN" "$C_OFF" "$*"; }
info() { printf '\033[36m[i]\033[0m %s\n' "$*"; }

# ══════════════════════════════════════════════════════════════
#  ① 泄露检查（必须通过，否则中止）
# ══════════════════════════════════════════════════════════════
info "泄露检查 ..."
if [ -f scripts/scan-secrets.sh ]; then

# ── 临时目录自愈：/tmp 不可写时（如根分区只读）回退到用户缓存目录 ──
TMPD="${VES_TMPDIR:-/tmp}"
if [ ! -d "$TMPD" ] || ! ( : > "$TMPD/.ves_wtest" ) 2>/dev/null; then
  TMPD="${VES_TMPDIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ves-tmp}"
  mkdir -p "$TMPD" 2>/dev/null || TMPD="$HOME/.ves-tmp"
  mkdir -p "$TMPD" 2>/dev/null || true
fi
rm -f "$TMPD/.ves_wtest" 2>/dev/null || true
export TMPDIR="$TMPD"

  if bash scripts/scan-secrets.sh --dist >$TMPD/_ves_scan.log 2>&1; then
    ok "未发现敏感信息"
  else
    err "发现敏感信息，构建中止："
    sed 's/^/    /' $TMPD/_ves_scan.log | tail -20
    exit 1
  fi
else
  warn "缺少 scripts/scan-secrets.sh，跳过泄露检查"
fi
# ── ①b 满屏高度防回归（4.9 底部留白）───────────────────
if [ -f scripts/check-hero-height.sh ]; then
  if bash scripts/check-hero-height.sh >$TMPD/_ves_h.log 2>&1; then
    ok "满屏高度均用实测变量"
  else
    warn "发现写死的满屏高度（4.9 会底部留白）："
    sed 's/^/    /' $TMPD/_ves_h.log | tail -12
  fi
fi
[ "$CHECK_ONLY" = "1" ] && { ok "仅检查模式，结束"; exit 0; }

# ══════════════════════════════════════════════════════════════
#  ① 打包前检查：分发包涉及的文件必须已提交（防打旧包）
# ══════════════════════════════════════════════════════════════
GIT_HEAD=""; GIT_BRANCH=""; GIT_DIRTY=""
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  GIT_HEAD="$(git rev-parse HEAD 2>/dev/null || true)"
  GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  # 仅检查会进包的范围
  DIRTY="$(git status --porcelain -- install-ves.sh online-install.sh vanvy.env.example \
              lib components scripts docs preview README.md 2>/dev/null || true)"
  if [ -n "$DIRTY" ]; then
    GIT_DIRTY="1"
    warn "以下【会进分发包】的文件尚未提交："
    printf '%s\n' "$DIRTY" | sed 's/^/      /' | head -15
    if [ "$FORCE" = "1" ]; then
      warn "--force 已指定 → 继续（包内会标记 dirty:true）"
    else
      err "为避免发出「与仓库不一致的包」，已中止。"
      echo "   ${C_DIM}先 git commit，或确认无误后用 --force 强制打包${C_OFF}"
      exit 2
    fi
  fi
  ok "打包源 = git ${GIT_BRANCH:-?} @ ${GIT_HEAD:0:8}${GIT_DIRTY:+ (dirty)}"
else
  warn "非 git 工作区 → 无法校验与仓库一致性"
fi

# ══════════════════════════════════════════════════════════════
#  ② 组装分发包（白名单：只带运行必需的）
# ══════════════════════════════════════════════════════════════
info "组装分发包 ..."
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
D="$STAGE/$DIST_NAME"
mkdir -p "$D"

# ── 核心文件 ──
cp install-ves.sh            "$D/"
cp online-install.sh         "$D/"
cp vanvy.env.example         "$D/"
mkdir -p "$D/lib" "$D/scripts"

# lib：共享内核 + 环境加载器
cp lib/vanvy-registry.js     "$D/lib/"
cp lib/vanvy-env.sh          "$D/lib/"

# scripts：打包/检查/恢复/预览构建
for s in scan-secrets.sh check-hero-height.sh check-detail-width.sh ves-persist.sh build-preview.sh fetch-preview-images.py; do
  [ -f "scripts/$s" ] && cp "scripts/$s" "$D/scripts/"
done

# components：只带接入主安装器的
copy_comp() {  # $1=源目录 $2=目标子路径
  mkdir -p "$D/$(dirname "$2")"
  cp -r "$1" "$D/$2"
}
copy_comp components/loading/vanvy                        components/loading/vanvy
# 加载页样式：自动收录所有 components/loading/<样式>/style.css
#   （以前写死白名单 aurora cinema minimal split logo，漏了 orbit/pulse
#    → 线上包缺这两款样式，向导只列 6 款。改成自动发现，新增样式无需再改此处）
for _ld in components/loading/*/; do
  _ls="$(basename "$_ld")"
  [ "$_ls" = "vanvy" ] && continue
  [ -f "$_ld/style.css" ] && copy_comp "$_ld" "components/loading/$_ls"
done
copy_comp components/features/detail                      components/features/detail
copy_comp components/features/list_trailer                components/features/list_trailer
copy_comp components/features/login                       components/features/login
copy_comp components/external                             components/external
copy_comp components/enrich                              components/enrich
copy_comp components/imgproxy                             components/imgproxy
copy_comp components/home/banner_home                     components/home/banner_home
copy_comp components/home/banner_designer                 components/home/banner_designer
copy_comp components/home/hero_studio                     components/home/hero_studio

# 预览页模板（可选，给用户看效果图上用）
mkdir -p "$D/preview"
cp -r preview/* "$D/preview/" 2>/dev/null || true

# 文档
mkdir -p "$D/docs"
for d in INSTALL.md DEVELOP.md DEPLOY.md MAINTENANCE.md; do
  [ -f "docs/$d" ] && cp "docs/$d" "$D/docs/"
done
cp README.md "$D/" 2>/dev/null || true

# ── 清理：排除任何私有/开发物 ──
find "$D" -type f \( -name 'vanvy.env' -o -name 'ves_deploy.sh' -o -name '*.bak-*' \
     -o -name '.DS_Store' -o -name '*.log' \) -delete 2>/dev/null || true
find "$D" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
# 去掉开发者专用脚本
rm -f "$D/scripts/ves_deploy.sh" 2>/dev/null || true

# ══════════════════════════════════════════════════════════════
#  ③ manifest + 校验和
# ══════════════════════════════════════════════════════════════
# ── ② 写入构建戳 BUILD.json（可追溯「这包是不是最新的」）──
info "写入构建戳 BUILD.json ..."
_ver_of() {  # 从文件里按正则抓版本号（抓不到返回 ?）
  local raw; raw="$(grep -oE "$2" "$1" 2>/dev/null | head -1)"
  local v;   v="$(printf '%s' "$raw" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)"
  printf '%s' "${v:-?}"
}
HERO_V="$(_ver_of components/home/hero_studio/vanvy-hero-core.js "core v[0-9.]+")"
REG_V="$(_ver_of lib/vanvy-registry.js "VERSION = '[0-9.]+'")"
IMG_V="$(_ver_of components/imgproxy/img_proxy.py "imgproxy/[0-9.]+")"
NF_TMP=$(find "$D" -type f | wc -l)
cat > "$D/BUILD.json" <<EOF
{
  "name": "$DIST_NAME",
  "version": "$VERSION",
  "built_at": "$(date -Iseconds)",
  "host": "$(hostname)",
  "git_branch": "${GIT_BRANCH:-unknown}",
  "git_head": "${GIT_HEAD:-unknown}",
  "git_head_short": "${GIT_HEAD:0:8}",
  "git_dirty": ${GIT_DIRTY:-0},
  "files": $NF_TMP,
  "components": {
    "hero_core": "$HERO_V",
    "registry": "$REG_V",
    "img_proxy": "${IMG_V:-?}"
  }
}
EOF
ok "构建戳: git ${GIT_HEAD:0:8}${GIT_DIRTY:+ (dirty)} | hero-core v$HERO_V | registry v$REG_V"

info "生成 manifest 与校验和 ..."
mkdir -p "$OUT"
( cd "$STAGE" && find "$DIST_NAME" -type f | LC_ALL=C sort ) > "$OUT/$DIST_NAME.manifest.txt"
NFILES=$(wc -l < "$OUT/$DIST_NAME.manifest.txt")

tar -czf "$OUT/$DIST_NAME.tar.gz" -C "$STAGE" "$DIST_NAME"
( cd "$OUT" && sha256sum "$DIST_NAME.tar.gz" > "$DIST_NAME.sha256" )

SZ=$(du -h "$OUT/$DIST_NAME.tar.gz" | cut -f1)
ok "构建完成: $OUT/$DIST_NAME.tar.gz"
printf '   版本   : %s\n   git    : %s @ %s%s\n   hero   : v%s\n   大小   : %s\n   文件数 : %s\n   校验   : %s\n' \
  "$VERSION" "${GIT_BRANCH:-?}" "${GIT_HEAD:0:8}" "${GIT_DIRTY:+ (dirty)}" "$HERO_V" \
  "$SZ" "$NFILES" "$(cut -d' ' -f1 "$OUT/$DIST_NAME.sha256" | cut -c1-16)..."

# 分发明细预览
echo
info "包内含："
sed 's|^[^/]*/||' "$OUT/$DIST_NAME.manifest.txt" | awk -F/ 'NF>1{print $1"/"$2}' | sort -u | sed 's/^/    /' | head -20
