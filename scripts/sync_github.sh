#!/usr/bin/env bash
# =============================================================================
#  Emby Beautify · GitHub 同步脚本 (本地版 → GitHub 版自动转换)
#  ---------------------------------------------------------------------------
#  规则 (主人 2026-08-12 定):
#    - 本地开发版: 下载源/命令/描述 用 https://emby-beautify.vanvy.top (私有域名)
#    - GitHub 开源版: 自动替换为 https://api.github.com 地址, 绝不泄露私有域名
#  用法:
#    bash scripts/sync_github.sh          # 转换 + 打包 + 推送 GitHub
#    bash scripts/sync_github.sh --check  # 只检查当前文件是否含私有域名
# =============================================================================
set -e

cd "$(dirname "$0")/.."
PROJ_DIR="$(pwd)"
GH_REPO="micimo13/emby-beautify"
GH_BRANCH="main"

# 私有域名 (本地版用) → 绝不进 GitHub
PRIVATE_DOMAIN="emby-beautify.vanvy.top"

if [ "$1" = "--check" ]; then
  echo "🔍 检查项目内是否含私有域名 $PRIVATE_DOMAIN ..."
  HITS=$(grep -rl "$PRIVATE_DOMAIN" --include="*.sh" --include="*.md" --include="*.json" --include="*.html" . 2>/dev/null | grep -v ".git/" | grep -v "sync_github.sh" || true)
  if [ -n "$HITS" ]; then
    echo "❌ 发现私有域名:"
    echo "$HITS"
    exit 1
  else
    echo "✅ 无私有域名, 可安全推送 GitHub"
    exit 0
  fi
fi

echo "🔄 本地版 → GitHub 版转换..."
TMPDIR=$(mktemp -d)
mkdir -p "$TMPDIR/proj"

# 1. 复制项目 (排除 .git / 旧包)
rsync -a --exclude='.git' --exclude='emby-kit.tar.gz' --exclude='*.tar.gz' "$PROJ_DIR/" "$TMPDIR/proj/"

# 2. 替换私有域名 → GitHub 地址 (包括下载源/README命令/描述)
echo "  · 替换 $PRIVATE_DOMAIN → api.github.com ..."
find "$TMPDIR/proj" -type f \( -name "*.sh" -o -name "*.md" -o -name "*.json" \) -exec sed -i \
  -e "s|https://${PRIVATE_DOMAIN}|https://api.github.com/repos/${GH_REPO}|g" \
  {} +

# 3. 下载源恢复 GitHub 优先级 (online-install.sh 特殊处理: 域名源删除, GitHub源排前)
echo "  · 重排下载源 (GitHub 优先)..."
OI="$TMPDIR/proj/scripts/online-install.sh"
if [ -f "$OI" ]; then
  # 移除域名源行
  sed -i "/${PRIVATE_DOMAIN}/d" "$OI"
  # 把 "2. GitHub codeload" 注释改为 "1." (纯美化, 不影响功能)
  sed -i 's|# 2. GitHub codeload 源码包|# 1. GitHub codeload 源码包|' "$OI" || true
fi

# 4. 打包 GitHub 版 tar.gz
echo "  · 打包 emby-kit.tar.gz ..."
cd "$TMPDIR/proj"
tar czf "$TMPDIR/emby-kit.tar.gz" --exclude='.git' --exclude='*.tar.gz' . 2>/dev/null

# 5. 检查无泄露
echo "  · 泄露检查 ..."
HITS=$(grep -rl "$PRIVATE_DOMAIN" --include="*.sh" --include="*.md" --include="*.json" . 2>/dev/null | grep -v "sync_github.sh" || true)
if [ -n "$HITS" ]; then
  echo "❌ 转换后仍含私有域名:"
  echo "$HITS"
  rm -rf "$TMPDIR"
  exit 1
fi
echo "  ✅ 无私有域名"

# 6. 推送 GitHub (API 方式, 单文件可靠)
echo "🚀 推送 GitHub ..."
PAT=$(grep -oP 'github_pat_[A-Za-z0-9_]{25,}' "$PROJ_DIR/../memory/credentials.md" | head -1)
[ -z "$PAT" ] && { echo "❌ 未找到 GitHub PAT"; rm -rf "$TMPDIR"; exit 1; }

push_file() {
  local rel="$1" src="$2"
  echo "  · $rel"
  SHA=$(curl -s -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GH_REPO}/contents/$rel" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sha',''))" 2>/dev/null)
  python3 - "$PAT" "$SHA" "$rel" "$src" "$GH_REPO" << 'PYEOF'
import json, base64, sys, urllib.request, urllib.error
pat, sha, rel, src, gh_repo = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
with open(src, 'rb') as f:
    content = f.read()
body = {'message': '🔄 自动同步: 本地版转 GitHub 版 (隐私保护)', 'content': base64.b64encode(content).decode(), 'branch': 'main'}
if sha:
    body['sha'] = sha
req = urllib.request.Request(f'https://api.github.com/repos/{gh_repo}/contents/{rel}', method='PUT')
req.add_header('Authorization', f'Bearer {pat}')
req.add_header('Accept', 'application/vnd.github+json')
req.add_header('User-Agent', 'curl')
req.add_header('Content-Type', 'application/json')
try:
    with urllib.request.urlopen(req, json.dumps(body).encode(), timeout=180) as r:
        print(f'    ✅ HTTP {r.status}')
except urllib.error.HTTPError as e:
    print(f'    ❌ HTTP {e.code}: {e.read()[:120]}')
PYEOF
}

# 推送关键文件 + tar.gz (README 描述也在转换范围内)
push_file "scripts/online-install.sh" "$TMPDIR/proj/scripts/online-install.sh"
push_file "README.md" "$TMPDIR/proj/README.md"
push_file "lib/manifest.sh" "$TMPDIR/proj/lib/manifest.sh"
push_file "emby-kit.tar.gz" "$TMPDIR/emby-kit.tar.gz"

rm -rf "$TMPDIR"
echo ""
echo "✅ GitHub 同步完成! (GitHub 版不含私有域名)"
