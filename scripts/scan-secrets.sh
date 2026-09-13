#!/usr/bin/env bash
# =============================================================================
#  secrets 泄露扫描 · 分发前必跑
#  ---------------------------------------------------------------------------
#  用法:
#    bash scripts/scan-secrets.sh            # 扫描整个项目
#    bash scripts/scan-secrets.sh --dist     # 只扫描会被分发的文件（推荐）
#
#  退出码: 0=干净  1=发现敏感信息
#
#  规则: 敏感值统一抽到 vanvy.env（已 gitignore），
#        代码里用 $VANVY_* 变量引用；模板见 vanvy.env.example
# =============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_OFF=$'\033[0m'; C_DIM=$'\033[2m'

DIST_ONLY=0
for a in "$@"; do case "$a" in --dist) DIST_ONLY=1;; esac; done

# 分界符：用 @@，与正则里的 | 互不冲突
SEP='@@'

# 格式: 说明@@正则@@排除正则(可选)
PATTERNS=(
  "内网IP${SEP}(^|[^0-9])(10\\.[0-9]{1,3}|192\\.168\\.[0-9]{1,3}|172\\.(1[6-9]|2[0-9]|3[01])\\.[0-9]{1,3})\\.[0-9]{1,3}${SEP}example\\.com|0\\.0\\.0\\.0|192\\.168\\.1\\.10|192\\.168\\.0\\.1|10\\.0\\.0\\.1|10\\.0\\.0\\.5|127\\.0\\.0\\.1"
  "私有域名${SEP}emby-beautify\\.vanvy\\.top${SEP}"
  "私有域名后缀${SEP}\\.vanvy\\.(top|cc)${SEP}"
  "AVDB API Key${SEP}9a60dcad886d1ceba839524c9b61c5f1${SEP}"
  "TMDB API Key${SEP}844e66732d07009c3c6c8e3f7565f571${SEP}"
  "长密钥(64+ hex)${SEP}[0-9a-f]{64,}${SEP}"
  "Emby Token/ServerId${SEP}[0-9a-f]{32}(?![0-9a-f])${SEP}blob/|/commit/|md5|test|example|xxxxxxxx"
  "SSH 密码${SEP}Vanvy1991\\.11\\.8|Ci20060319${SEP}"
  "Telegram Bot Token${SEP}[0-9]{8,12}:AA[A-Za-z0-9_-]{30,}${SEP}"
  "个人用户名${SEP}micimo${SEP}"
  "GitHub 仓库名${SEP}micimo13${SEP}"
)

# 白名单（模板/文档/扫描器自身允许出现占位符与说明）
is_whitelisted() {
  case "${1#./}" in
    vanvy.env.example|vanvy.env) return 0;;
    scripts/scan-secrets.sh) return 0;;
    scripts/sync_github.sh) return 0;;
    scripts/deploy_guard.sh) return 0;;   # 凭据已改为从 vanvy.env 读取
    scripts/ves-persist.sh) return 0;;
    # 分发入口：域名/GitHub 仓库本就是公开信息（用户就是 curl 它安装）。
    # GitHub 版由 sync_github.sh 推前统一替换为占位符/公网地址。
    online-install.sh) return 0;;
    # 根 README：GitHub 首页展示用，徽章/安装命令本就含公开仓库地址；
    # （发布包的泄露闸门由 scan-secrets --dist 负责，README 不在其扫描范围）
    README.md) return 0;;
    docs/*|memory/*) return 0;;
    *) return 1;;
  esac
}

if [ "$DIST_ONLY" = "1" ]; then
  echo "🔍 扫描【分发范围】..."
  FILES=$(find install-ves.sh install.sh uninstall.sh online-install.sh vanvy.env.example \
               components lib core scripts/online-install.sh -type f \
               \( -name '*.sh' -o -name '*.js' -o -name '*.css' -o -name '*.html' \
                  -o -name '*.json' -o -name '*.md' -o -name '*.txt' \) 2>/dev/null \
          | grep -v '/core/jquery' | sort -u)
else
  echo "🔍 扫描【整个项目】..."
  FILES=$(find . -type f \
            \( -name '*.sh' -o -name '*.js' -o -name '*.css' -o -name '*.html' \
               -o -name '*.json' -o -name '*.md' -o -name '*.py' -o -name '*.txt' -o -name '*.env' \) \
            ! -path ./.git/\* ! -path ./node_modules/\* ! -path ./core/\* \
            ! -path ./legacy/\* \
            ! -path ./emby-showcase/\* ! -path ./emby-blackgold/\* ! -path ./v15/\* \
            ! -name '*.tar.gz' 2>/dev/null | sort -u)
fi

HITS=0; FILES_HIT=0
for f in $FILES; do
  is_whitelisted "$f" && continue
  file_hit=0
  for entry in "${PATTERNS[@]}"; do
    desc="${entry%%${SEP}*}"; rest="${entry#*${SEP}}"
    pat="${rest%%${SEP}*}"
    if [ "$rest" = "$pat" ]; then excl=""; else excl="${rest#*${SEP}}"; fi
    [ -n "$pat" ] || continue
    # 文档(.md)/预览页(preview)里的“私有域名”属正常（sync_github 推送时会替换成公网地址），
    #   .md 里的 GitHub 仓库名也本就是公开信息；但密钥/Token/内网IP 等仍然照查。
    case "$f" in
      *.md) case "$desc" in '私有域名'*|'GitHub 仓库名') continue;; esac;;
      ./preview/*) case "$desc" in '私有域名'*) continue;; esac;;
    esac
    if grep -qP '' /dev/null 2>/dev/null; then
      match=$(grep -nP "$pat" "$f" 2>/dev/null | { [ -n "$excl" ] && grep -vP "$excl" || cat; } | head -3)
    else
      match=$(grep -nE "$pat" "$f" 2>/dev/null | { [ -n "$excl" ] && grep -vE "$excl" || cat; } | head -3)
    fi
    if [ -n "$match" ]; then
      [ "$file_hit" = "0" ] && { echo ""; printf "%s⚠️  %s%s\n" "$C_WARN" "$f" "$C_OFF"; file_hit=1; FILES_HIT=$((FILES_HIT+1)); }
      printf "   %s%s%s\n" "$C_DIM" "$desc" "$C_OFF"
      printf "%s\n" "$match" | sed 's/^/     /' | cut -c1-150
      HITS=$((HITS+1))
    fi
  done
done

# ── 占位符检查：部署源里绝不能留未替换的 <...> 占位符 ──
#  教训（2026-09-12）：把 nginx conf 的私有 IP 换成 <图片代理主机> 占位符后，
#  容器 nginx 直接启动失败（host not found in upstream）。占位符只应存在于 GitHub 版。
echo ""
PLACEHOLDER_HIT=0
for f in nginx/default.conf nginx/vdimg.conf; do
  [ -f "$f" ] || continue
  m=$(grep -nE 'proxy_pass[^;]*<[^>]+>|[^#]*<图片代理主机>' "$f" 2>/dev/null | grep -v '^\s*#' || true)
  if [ -n "$m" ]; then
    printf "%s⚠️  %s 含未替换占位符（部署会失败！）%s\n" "$C_WARN" "$f" "$C_OFF"
    printf "%s\n" "$m" | sed 's/^/     /' | cut -c1-150
    PLACEHOLDER_HIT=$((PLACEHOLDER_HIT+1))
  fi
done
if [ "$PLACEHOLDER_HIT" != "0" ]; then
  printf "%s❌ 部署源含占位符 —— 本地仓库必须保留真实可用值%s\n" "$C_ERR" "$C_OFF"
  echo "   ${C_DIM}占位符的替换只在 sync_github.sh 生成「开源版」时进行${C_OFF}"
  exit 1
fi

echo ""
if [ "$HITS" = "0" ]; then
  printf "%s✅ 未发现敏感信息，可安全分发%s\n" "$C_OK" "$C_OFF"
  exit 0
else
  printf "%s❌ 发现 %d 处敏感信息（%d 个文件），禁止分发！%s\n" "$C_ERR" "$HITS" "$FILES_HIT" "$C_OFF"
  echo "   ${C_DIM}修复：敏感值抽到 vanvy.env（已 gitignore），代码用 \$VANVY_* 引用${C_OFF}"
  echo "   ${C_DIM}参考：vanvy.env.example · lib/vanvy-env.sh${C_OFF}"
  exit 1
fi
