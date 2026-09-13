#!/usr/bin/env bash
# =============================================================================
#  vanvy-enrich 安装/自检（在「有出网能力的那台机器」上运行，本项目为飞牛 NAS）
#  ---------------------------------------------------------------------------
#  作用：部署 VES 第三方资料增强服务（TMDB 剧照/演员/预告/同类），并配置保活。
#  为什么需要它：浏览器直连 TMDB 依赖用户网络能出网（国内不可靠），
#    本机有出网代理 + 磁盘缓存 + 前端只拿数据不落凭据。
#
#  用法：
#    bash install-enrich.sh                    # 安装/更新（读同目录 enrich_config.json）
#    bash install-enrich.sh --key <TMDB_KEY>   # 首次安装并写入 key
#    bash install-enrich.sh --test             # 只自检
#    bash install-enrich.sh --uninstall        # 卸载（停服务 + 移除 cron 条目）
# =============================================================================
set -eu
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${VANVY_ENRICH_DEST:-$HOME/.local/vanvy-enrich}"      # 部署目录
CONF="$DEST/enrich_config.json"
PORT="${VANVY_ENRICH_PORT:-18097}"
PIDF="/tmp/enrich_service.pid"
LOG="/tmp/enrich_service.log"
KEY=""; MODE="install"

while [ $# -gt 0 ]; do
  case "$1" in
    --key) KEY="$2"; shift 2;;
    --test) MODE="test"; shift;;
    --uninstall) MODE="uninstall"; shift;;
    *) echo "未知参数: $1"; exit 1;;
  esac
done

alive() { [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF" 2>/dev/null)" 2>/dev/null; }

if [ "$MODE" = "uninstall" ]; then
  alive && kill "$(cat "$PIDF")" 2>/dev/null && echo "已停止服务"
  rm -f "$PIDF"
  TMP=$(mktemp); crontab -l >"$TMP" 2>/dev/null || true
  grep -v "enrich_service.py" "$TMP" | grep -v "enrich-service 保活" > "$TMP.2" || true
  crontab "$TMP.2" 2>/dev/null && echo "已移除 cron 条目"
  rm -f "$TMP" "$TMP.2"
  echo "✅ 已卸载 vanvy-enrich（配置目录保留：$DEST）"; exit 0
fi

if [ "$MODE" = "test" ]; then
  echo "健康检查: $(curl -s -m 6 --noproxy '*' "http://127.0.0.1:$PORT/healthz" || echo '不可达')"
  echo "样例请求: $(curl -s -m 20 --noproxy '*' "http://127.0.0.1:$PORT/api/detail?tmdb=872585&type=movie" | head -c 200)"
  exit 0
fi

# ── 1) 配置 ────────────────────────────────────────────────────────────────
mkdir -p "$DEST"
if [ ! -f "$CONF" ]; then
  cp "$SRC/enrich_config.example.json" "$CONF"
  echo "ℹ️  已生成配置 $CONF（请按需修改 proxy/tmdb_key）"
fi
[ -n "$KEY" ] && python3 - "$CONF" "$KEY" <<'PY'
import json,sys
p,k=sys.argv[1],sys.argv[2]
d=json.load(open(p,encoding='utf-8')); d['tmdb_key']=k
json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
print("已写入 TMDB key")
PY
chmod 600 "$CONF" 2>/dev/null || true

# ── 2) 装文件 ──────────────────────────────────────────────────────────────
cp "$SRC/enrich_service.py" "$DEST/enrich_service.py"
python3 -m py_compile "$DEST/enrich_service.py"
echo "✅ 已部署到 $DEST"

# ── 3) 启服务 ──────────────────────────────────────────────────────────────
alive && kill "$(cat "$PIDF")" 2>/dev/null && sleep 1
nohup python3 -u "$DEST/enrich_service.py" >"$LOG" 2>&1 &
echo $! > "$PIDF"
sleep 2
curl -s -m 6 --noproxy '*' "http://127.0.0.1:$PORT/healthz" && echo || { echo "❌ 启动失败，见 $LOG"; tail -20 "$LOG"; exit 1; }

# ── 4) 保活（幂等追加，不清空既有 crontab）─────────────────────────────────
TMP=$(mktemp); crontab -l >"$TMP" 2>/dev/null || true
if ! grep -q "enrich_service.py" "$TMP"; then
  cat >>"$TMP" <<EOF

# enrich-service 保活（VES 第三方资料增强：TMDB 剧照/演员/预告/同类）
@reboot sleep 14 && nohup python3 -u $DEST/enrich_service.py >$LOG 2>&1 & echo \$! > $PIDF
*/3 * * * * kill -0 \$(cat $PIDF 2>/dev/null) 2>/dev/null || { nohup python3 -u $DEST/enrich_service.py >$LOG 2>&1 & echo \$! > $PIDF; }
EOF
  crontab "$TMP" && echo "✅ 已添加保活 cron（@reboot + 每 3 分钟看门狗）"
else
  echo "ℹ️  cron 保活已存在，跳过"
fi
rm -f "$TMP"

echo
echo "完成。前端默认探测地址："
echo "  局域网  http://<本机IP>:$PORT"
echo "  公网    https://<你的域名>/enrich     （nginx: location /enrich/ → 127.0.0.1:$PORT）"
echo "自检：bash $SRC/install-enrich.sh --test"
