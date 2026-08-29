#!/usr/bin/env bash
# =============================================================================
#  Emby 美化全家桶 · 插件注册表 (manifest)
#  ---------------------------------------------------------------------------
#  所有可选组件统一在此声明，install.sh 动态读取生成菜单。
#  字段格式 (| 分隔):
#    style/theme:  id|类型|名称|版本适配|描述|资源路径|注入行...|marker
#    feature:      id|类型|名称|版本适配|描述|资源目录|容器目录|注入行...|marker|conflicts
#  类型: style=首页美化 / theme=CSS主题 / feature=功能增强
#  版本适配: 4.8 / 4.9 / all
#  marker: 幂等判断的注入特征串（一般是资源路径）
#  conflicts: feature 最后字段，逗号分隔冲突组件 id（可带 :type 指定类型）
# =============================================================================

# ─────────── 首页美化 styles (互斥, 三选一) ───────────
MANIFEST_STYLES=(
  "home_beautify|style|✨ emby-home-beautify|4.9|沉浸式首页轮播 (最近添加/Backdrop/Logo/简介)|styles/home_beautify|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"emby-crx/jquery-3.6.0.min.js\"></script>|<script src=\"emby-crx/md5.min.js\"></script>|<script src=\"emby-crx/home.js\" defer></script>|emby-crx/home.js"
  "emby_crx|style|🎨 emby-crx|4.8|加载动画+Banner轮播+媒体库悬浮 (自动匹配媒体库)|styles/emby_crx|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"emby-crx/common-utils.js\"></script>|<script src=\"emby-crx/jquery-3.6.0.min.js\"></script>|<script src=\"emby-crx/md5.min.js\"></script>|<script src=\"emby-crx/main.js\"></script>|emby-crx/main.js"
  "emby_fluent|style|🪟 emby-fluent|4.8|Fluent 设计语言风格 (emby-crx 皮肤版)|styles/emby_fluent|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"emby-crx/common-utils.js\"></script>|<script src=\"emby-crx/jquery-3.6.0.min.js\"></script>|<script src=\"emby-crx/md5.min.js\"></script>|<script src=\"emby-crx/main.js\"></script>|emby-crx/main.js"
)

# ─────────── CSS 主题 themes (可叠加, 不冲突) ───────────
MANIFEST_THEMES=(
  "embymalism|theme|🌿 Embymalism|all|极简风|themes/Embymalism.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-embymalism.css\" type=\"text/css\" media=\"all\" />|Embymalism.css"
  "dark-red|theme|🔴 Dark RED|all|暗红深色|themes/dark/RED.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-dark-RED.css\" type=\"text/css\" media=\"all\" />|RED.css"
  "dark-pink|theme|🌸 Dark PINK|all|暗粉深色|themes/dark/PINK.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-dark-PINK.css\" type=\"text/css\" media=\"all\" />|PINK.css"
  "dark-orange|theme|🟠 Dark ORANGE|all|暗橙深色|themes/dark/ORANGE.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-dark-ORANGE.css\" type=\"text/css\" media=\"all\" />|ORANGE.css"
  "dark-plex|theme|🟠 Dark ORANGE-PLEX|all|Plex 橙|themes/dark/ORANGE-PLEX.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-dark-ORANGE-PLEX.css\" type=\"text/css\" media=\"all\" />|ORANGE-PLEX.css"
  "dark-blue|theme|🔵 Dark BLUE|all|暗蓝深色|themes/dark/BLUE-DARK.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-dark-BLUE-DARK.css\" type=\"text/css\" media=\"all\" />|BLUE-DARK.css"
  "dark-purple|theme|🟣 Dark PURPLE|all|暗紫深色|themes/dark/PURPLE.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-dark-PURPLE.css\" type=\"text/css\" media=\"all\" />|PURPLE.css"
  "dark-green|theme|🟢 Dark GREEN|all|暗绿深色|themes/dark/GREEN.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-dark-GREEN.css\" type=\"text/css\" media=\"all\" />|GREEN.css"
  "dark-gray|theme|⚪ Dark GRAY|all|暗灰深色|themes/dark/GRAY.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-dark-GRAY.css\" type=\"text/css\" media=\"all\" />|GRAY.css"
  "apple-glass|theme|🍎 Apple Glass|all|苹果毛玻璃 (实验, 4.10主题, 与4.8轮播有冲突)|themes/AppleGlass.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-AppleGlass.css\" type=\"text/css\" media=\"all\" />|AppleGlass.css|emby_crx:style,emby_fluent:style"
  "vanvy-dark|theme|🏴 Vanvy Dark|all|Vanvy 深色主题|themes/SynoDark.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-SynoDark.css\" type=\"text/css\" media=\"all\" />|SynoDark.css"
  "vanvy-detail|theme|📄 Vanvy Detail|all|Vanvy 详情页主题|themes/SynoDetail.css|<link rel=\"stylesheet\" id=\"theme-css\" href=\"emby-crx/theme-SynoDetail.css\" type=\"text/css\" media=\"all\" />|SynoDetail.css"
)

# ─────────── 功能增强 features ───────────
# 冲突组说明:
#   详情页组: jav / douban / extrafanart / detailtabs / trailer 互斥(都操作详情页)
#   首页组:   bannercarousel / loading 与 emby_crx,emby_fluent 冲突(自带banner/loading)
MANIFEST_FEATURES=(
  "jav|feature|🔞 JAV元数据美化工程|all|Javdb刮削/番号识别/演员作品/翻译/预告片 (Emby-Javascript-Details)|features/detailpage|emby-detailpage|<script src=\"https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/cn2t.js\"></script>|<script src=\"emby-detailpage/emby_detail_page.js\"></script>|<script src=\"emby-detailpage/list_page_trailer.js\"></script>|<script src=\"emby-detailpage/actor_page.js\"></script>|<script src=\"emby-detailpage/trailer_more_button.js\"></script>|emby-detailpage/emby_detail_page.js|douban,extrafanart,detailtabs,trailer"
  "danmaku|feature|💬 弹幕 dd-danmaku|all|B站/抖音等多源弹幕 (官方服务端版)|features/danmaku|emby-danmaku|<script src=\"emby-danmaku/ede.js\" charset=\"utf-8\"></script>|emby-danmaku/ede.js|"
  "douban|feature|⭐ 豆瓣/Bangumi评分|all|详情页显示豆瓣/番组评分 (embyDouban)|features/douban|emby-douban|<script src=\"emby-douban/douban-score.js\"></script>|emby-douban/douban-score.js|jav"
  "extrafanart|feature|🖼️ 剧照展示|all|详情页高清剧照 (Vanvy 自研)|features/extrafanart|emby-extrafanart|<script src=\"emby-extrafanart/stills.js\"></script>|emby-extrafanart/stills.js|jav"
  "playbackrate|feature|⏩ 播放倍速|all|快捷键调节倍速 (Vanvy 自研)|features/playbackrate|emby-playbackrate|<script src=\"emby-playbackrate/playback-speed.js\"></script>|emby-playbackrate/playback-speed.js|"
  "loading|feature|🌀 加载动画|all|首页加载动画+服务器名 (Vanvy 自研)|features/loading|emby-loading|<script src=\"emby-loading/loading-animation.js\"></script>|emby-loading/loading-animation.js|emby_crx:style,emby_fluent:style"
  "embytool|feature|🔗 远程路径助手|all|显示远程资源路径并可复制 (Vanvy 自研)|features/embytool|emby-tool|<script src=\"emby-tool/remote-path.js\"></script>|emby-tool/remote-path.js|"
  "localplayer|feature|🎬 第三方播放器|all|调用 PotPlayer/mpv 等 (Vanvy 自研)|features/localplayer|emby-localplayer|<script src=\"emby-localplayer/external-player.js\"></script>|emby-localplayer/external-player.js|"
  "bannercarousel|feature|📺 Banner轮播|all|自定义 Banner 轮播 (Vanvy 自研)|features/bannercarousel|emby-bannercarousel|<script src=\"emby-bannercarousel/banner-carousel.js\"></script>|emby-bannercarousel/banner-carousel.js|emby_crx:style,emby_fluent:style"
  "detailtabs|feature|📑 详情页Tabs|all|详情页自定义 Tabs 栏目 (Vanvy 自研)|features/detailtabs|emby-detailtabs|<script src=\"emby-detailtabs/detail-tabs.js\"></script>|emby-detailtabs/detail-tabs.js|jav"
  "trailer|feature|🎞️ Trailer增强|all|详情页 Trailer 自动播放 (Vanvy 自研)|features/trailer|emby-trailer|<script src=\"emby-trailer/trailer-enhance.js\"></script>|emby-trailer/trailer-enhance.js|jav"
  "customcss|feature|🎨 自定义CSS加载|all|按服务器加载自定义 CSS (Vanvy 自研)|features/customcss|emby-customcss|<script src=\"emby-customcss/custom-css.js\"></script>|emby-customcss/custom-css.js|"
)

# ─────────────────────────────── 解析工具 ───────────────────────────────

# manifest_field <"$entry"> <字段号>
manifest_field() {
  local entry="$1" field="$2"
  echo "$entry" | awk -F'|' -v f="$field" '{print $f}'
}

# 注入行: feature 从字段8到NF-1(排除末尾conflicts), 其他从7到NF-1
manifest_inject_lines() {
  # 注入行 = 所有以 < 开头的字段 (script/link 标签)
  local entry="$1"
  echo "$entry" | awk -F'|' '{ for(i=1;i<=NF;i++) if (substr($i,1,1)=="<") print $i }'
}

# marker: 资源路径字段 (包含 / 或 .css 的字段, 用于幂等/卸载匹配)
# 规则: 从后往前找第一个匹配 路径模式 的字段
manifest_marker() {
  local entry="$1"
  echo "$entry" | awk -F'|' '{ for(i=NF;i>=1;i--) if ($i ~ /\// || $i ~ /\.css$/) { print $i; exit } }'
}

# conflicts: 最后字段 (任何类型都可带)
manifest_conflicts() {
  local entry="$1"
  local nf
  nf=$(echo "$entry" | awk -F'|' '{print NF}')
  # feature 固定9字段以上, theme 带conflicts 时 9字段
  if [ "$(manifest_field "$entry" 2)" = "feature" ] || [ "$nf" -ge 9 ]; then
    echo "$entry" | awk -F'|' '{print $NF}'
  fi
}

# 容器目录 (feature 用): 字段7
manifest_condir() {
  local entry="$1"
  echo "$entry" | awk -F'|' '{print $7}'
}

# 列出某类型的全部条目
manifest_list() {
  local type="$1" line
  for line in "${MANIFEST_STYLES[@]}" "${MANIFEST_THEMES[@]}" "${MANIFEST_FEATURES[@]}"; do
    [ "$(manifest_field "$line" 2)" = "$type" ] && echo "$line"
  done
}

# 按 id 查条目
manifest_find() {
  local type="$1" id="$2" line
  for line in "${MANIFEST_STYLES[@]}" "${MANIFEST_THEMES[@]}" "${MANIFEST_FEATURES[@]}"; do
    [ "$(manifest_field "$line" 1)" = "$id" ] && [ "$(manifest_field "$line" 2)" = "$type" ] && { echo "$line"; return 0; }
  done
  return 1
}

# 版本兼容检查
manifest_compat() {
  local compat="$1" cur="$2"
  [ "$compat" = "all" ] && return 0
  [ "$cur" = "unknown" ] && return 0
  echo "$compat" | grep -q "$cur"
}
