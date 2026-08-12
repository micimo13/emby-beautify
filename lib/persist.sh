#!/usr/bin/env bash
# =============================================================================
#  Emby 美化引擎 · 持久化引擎 (persist)
#  ---------------------------------------------------------------------------
#  通用持久化方案 (按镜像机制自动选择):
#    - amilys 社区版: 有 ext.sh 启动钩子 → 写入钩子, 容器每次启动自动恢复
#    - 官方版 / LinuxServer 版: 无启动钩子 → 文件存持久卷 /config/vanvy-official/,
#      容器重建后运行 `install.sh --restore` 一键恢复
#  所有路径使用 $DASHBOARD_DIR，兼容所有镜像布局。
# =============================================================================

# ── 把资源存入持久卷 (所有镜像通用) ──
persist_assets() {
  local persist_dir="/config/vanvy-official"
  docker exec "$CONTAINER" sh -c "mkdir -p '$persist_dir'" 2>/dev/null
  # 持久化 core 库
  for f in "$SCRIPT_DIR/core/"*.js "$SCRIPT_DIR/core/"*.css; do
    [ -f "$f" ] || continue
    docker cp "$f" "$CONTAINER:$persist_dir/$(basename "$f")" 2>/dev/null
  done
  # 持久化 JAV config.json
  if [ -f "$SCRIPT_DIR/components/features/jav_details/config.json" ]; then
    docker cp "$SCRIPT_DIR/components/features/jav_details/config.json" "$CONTAINER:$persist_dir/config.json" 2>/dev/null
  fi
  # 持久化 index.html 注入行快照
  docker exec "$CONTAINER" sh -c "grep 'vanvy/' '$DASHBOARD_DIR/index.html' > '$persist_dir/injections.txt' 2>/dev/null"
  local inject_count
  inject_count=$(docker exec "$CONTAINER" sh -c "wc -l < '$persist_dir/injections.txt'" 2>/dev/null | tr -d ' ')
  echo "    注入行快照: ${inject_count:-0} 行"
  # 持久化整个 vanvy 目录
  docker exec "$CONTAINER" sh -c "rm -rf '$persist_dir/vanvy'; cp -r '$DASHBOARD_DIR/vanvy' '$persist_dir/vanvy' 2>/dev/null"
  local vanvy_count
  vanvy_count=$(docker exec "$CONTAINER" sh -c "find '$persist_dir/vanvy' -type f | wc -l" 2>/dev/null | tr -d ' ')
  echo "    vanvy 全量备份: ${vanvy_count:-0} 文件"
  # 记录 dashboard 路径 (供 --restore 使用)
  docker exec "$CONTAINER" sh -c "echo '$DASHBOARD_DIR' > '$persist_dir/dashboard_path.txt' 2>/dev/null"
  c_ok "✓ 美化已持久化 → /config/vanvy-official/"
}

# ── 写入 ext.sh 钩子 (仅 amilys 等有钩子机制的镜像) ──
persist_write_hook() {
  [ "$EXT_HOOK" = "1" ] || return 0
  local ext_file="/config/config/ext.sh"
  local marker="vanvy-beautify-persist"
  docker exec "$CONTAINER" sh -c "mkdir -p /config/config 2>/dev/null; [ -f '$ext_file' ] || { echo '#!/bin/sh' > '$ext_file'; chmod +x '$ext_file'; }"
  if docker exec "$CONTAINER" sh -c "grep -q '$marker' '$ext_file'" 2>/dev/null; then
    c_ok "✓ 持久化钩子已存在, 跳过"
    return 0
  fi
  # 备份原 ext.sh
  docker exec "$CONTAINER" sh -c "cp '$ext_file' '$ext_file.bak.\$(date +%Y%m%d-%H%M%S)' 2>/dev/null"
  # 生成钩子文件 (内部使用真实 DASHBOARD_DIR)
  local hook="/tmp/vanvy-persist-hook.sh"
  cat > "$hook" << EOF
#!/bin/sh
# ==== vanvy-beautify 持久化部署 ====
VANVY_DIR='/config/vanvy-official'
INDEX='$DASHBOARD_DIR/index.html'
if [ -d "\$VANVY_DIR" ]; then
  # 1. 整体恢复 vanvy 目录
  if [ -d "\$VANVY_DIR/vanvy" ]; then
    rm -rf '$DASHBOARD_DIR/vanvy'
    cp -r "\$VANVY_DIR/vanvy" '$DASHBOARD_DIR/vanvy' 2>/dev/null
    echo "  ✓ vanvy 全量恢复: \$(find '$DASHBOARD_DIR/vanvy' -type f | wc -l) 文件"
  fi
  # 2. 恢复 JAV config.json
  if [ -f "\$VANVY_DIR/config.json" ]; then
    cp -f "\$VANVY_DIR/config.json" '$DASHBOARD_DIR/config.json' 2>/dev/null
  fi
  # 3. 从快照恢复 index.html 注入
  if [ -f "\$VANVY_DIR/injections.txt" ]; then
    while IFS= read -r line; do
      [ -z "\$line" ] && continue
      grep -qF "\$line" "\$INDEX" || {
        if grep -q '</head>' "\$INDEX" 2>/dev/null; then
          sed -i "s|</head>|\$line\n</head>|" "\$INDEX"
        else
          sed -i "s|<body|\$line\n<body|" "\$INDEX"
        fi
      }
    done < "\$VANVY_DIR/injections.txt"
    echo "  ✓ index.html 注入已恢复"
  fi
  echo "  ✓ vanvy 美化已恢复"
fi
# ==== end vanvy-beautify 持久化 ====
EOF
  docker cp "$hook" "$CONTAINER:/tmp/vanvy-persist-hook.sh" 2>/dev/null
  # 插到 exit 0 前
  docker exec "$CONTAINER" sh -c "
    EXT='$ext_file'
    if grep -q '^exit 0' \"\$EXT\"; then
      awk 'BEGIN{while((getline l < \"/tmp/vanvy-persist-hook.sh\")>0) h=h l \"\\n\"} /^exit 0/ && !d {printf \"%s\", h; d=1} {print}' \"\$EXT\" > \"\$EXT.new\" && mv \"\$EXT.new\" \"\$EXT\"
    else
      cat /tmp/vanvy-persist-hook.sh >> \"\$EXT\"
    fi
    rm -f /tmp/vanvy-persist-hook.sh
    echo '  ✓ 持久化钩子已写入'
  " 2>&1 | sed 's/^/    /'
  rm -f "$hook"
  c_ok "✓ 已接管启动钩子 (容器重建后自动恢复)"
}

# ── 恢复已持久化的美化 (官方版/lsio 容器重建后调用) ──
restore_assets() {
  local persist_dir="/config/vanvy-official"
  if ! docker exec "$CONTAINER" sh -c "[ -d '$persist_dir' ]" 2>/dev/null; then
    c_warn "未找到持久化数据 ($persist_dir)，无需恢复"
    return 0
  fi
  # 读取记录的 dashboard 路径 (兼容旧版无记录的情况)
  local saved_dir
  saved_dir=$(docker exec "$CONTAINER" sh -c "cat '$persist_dir/dashboard_path.txt' 2>/dev/null" 2>/dev/null)
  [ -n "$saved_dir" ] && [ -d "$saved_dir" ] 2>/dev/null && DASHBOARD_DIR="$saved_dir"
  c_info "从持久卷恢复美化 → $DASHBOARD_DIR ..."
  # 1. 恢复 vanvy 目录
  if docker exec "$CONTAINER" sh -c "[ -d '$persist_dir/vanvy' ]" 2>/dev/null; then
    docker exec "$CONTAINER" sh -c "
      rm -rf '$DASHBOARD_DIR/vanvy'
      cp -r '$persist_dir/vanvy' '$DASHBOARD_DIR/vanvy' 2>/dev/null
    "
    c_ok "✓ vanvy 目录已恢复"
  fi
  # 2. 恢复 JAV config.json
  if docker exec "$CONTAINER" sh -c "[ -f '$persist_dir/config.json' ]" 2>/dev/null; then
    docker exec "$CONTAINER" sh -c "cp -f '$persist_dir/config.json' '$DASHBOARD_DIR/config.json'" 2>/dev/null
    c_ok "✓ config.json 已恢复"
  fi
  # 3. 恢复 index.html 注入
  if docker exec "$CONTAINER" sh -c "[ -f '$persist_dir/injections.txt' ]" 2>/dev/null; then
    docker exec "$CONTAINER" sh -c "
      INDEX='$DASHBOARD_DIR/index.html'
      cp \"\$INDEX\" \"/config/backups/emby-beautify/index.html.pre-restore.\$(date +%Y%m%d-%H%M%S)\" 2>/dev/null
      while IFS= read -r line; do
        [ -z \"\$line\" ] && continue
        grep -qF \"\$line\" \"\$INDEX\" || {
          if grep -q '</head>' \"\$INDEX\" 2>/dev/null; then
            sed -i \"s|</head>|\$line\n</head>|\" \"\$INDEX\"
          else
            sed -i \"s|<body|\$line\n<body|\" \"\$INDEX\"
          fi
        }
      done < '$persist_dir/injections.txt'
    "
    c_ok "✓ index.html 注入已恢复"
  fi
  c_ok "✅ 美化已恢复完成!"
}

# ── 完整持久化 ──
persist_all() {
  persist_assets
  if [ "$EXT_HOOK" = "1" ]; then
    persist_write_hook
  else
    c_warn "此镜像无启动钩子机制，容器重建后请运行: install.sh --restore"
  fi
}
