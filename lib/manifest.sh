#!/usr/bin/env bash
# =============================================================================
#  Emby 美化引擎 · 组件注册表 (manifest)
#  ---------------------------------------------------------------------------
#  所有组件统一声明，install.sh 动态读取生成菜单。
#  字段格式 (| 分隔):
#    id|类型|名称|版本适配|描述|资源路径|zone|注入行...|marker|deps
#  类型: style(首页美化,互斥) / theme(CSS主题,可叠加) / feature(功能) / branding(品牌)
#  版本适配: 4.8 / 4.9 / 4.10 / all
#  zone: 页面区域 (home=首页 / detail=详情页 / global=全局 / theme=主题)
#  marker: 幂等判断的注入特征串（一般是资源路径）
# =============================================================================

# ─────────── 首页美化 styles (互斥, 按版本+风格) ───────────
MANIFEST_STYLES=(
  "banner_classic|style|🎠 经典轮播|4.8|Backdrop 大图 + 信息 + LOGO，8 秒自动滚动|components/home/banner_classic|home|<link rel=\"stylesheet\" id=\"theme-css\" href=\"vanvy/banner_classic/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/core/common-utils.js\"></script>|<script src=\"vanvy/core/jquery-3.6.0.min.js\"></script>|<script src=\"vanvy/core/md5.min.js\"></script>|<script src=\"vanvy/banner_classic/banner-classic.js\"></script>|vanvy/banner_classic/banner-classic.js|"
  "banner_fluent|style|🎠 Fluent轮播|4.8,4.9|无缝循环 + 左右导航 + 失败自动清理|components/home/banner_fluent|home|<link rel=\"stylesheet\" id=\"theme-css\" href=\"vanvy/banner_fluent/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/core/common-utils.js\"></script>|<script src=\"vanvy/core/jquery-3.6.0.min.js\"></script>|<script src=\"vanvy/core/md5.min.js\"></script>|<script src=\"vanvy/banner_fluent/banner-fluent.js\"></script>|vanvy/banner_fluent/banner-fluent.js|"
  "banner_carousel|style|🎠 Banner图轮播|4.8,4.9|Banner 横幅图 + 随机排序 + 按钮控制|components/home/banner_carousel|home|<script src=\"vanvy/core/common-utils.js\"></script>|<script src=\"vanvy/core/jquery-3.6.0.min.js\"></script>|<script src=\"vanvy/core/md5.min.js\"></script>|<script src=\"vanvy/banner_carousel/banner-carousel.js\"></script>|vanvy/banner_carousel/banner-carousel.js|"
  "banner_homeswiper|style|🎠 封面流轮播|4.8,4.9|Swiper 封面流: 主图+缩略图联动 (emby-crx 原版)|components/home/banner_homeswiper|home|<link rel=\"stylesheet\" id=\"theme-css\" href=\"vanvy/banner_homeswiper/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/core/common-utils.js\"></script>|<script src=\"vanvy/core/jquery-3.6.0.min.js\"></script>|<script src=\"vanvy/core/md5.min.js\"></script>|<script src=\"vanvy/banner_homeswiper/HomeSwiper.js\"></script>|vanvy/banner_homeswiper/HomeSwiper.js|"
  "banner_aurora|style|🌌 AURORA 极光轮播|4.8,4.9|原创: 极光光晕+封面流+毛玻璃 (6色可选)|components/home/banner_aurora|home|<link rel=\"stylesheet\" href=\"vanvy/banner_aurora/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_aurora/banner-aurora.js\"></script>|vanvy/banner_aurora/banner-aurora.js|"
  "banner_cinema|style|🎬 CINEMA 影院黑金|4.8,4.9|原创: 21:9超宽画幅+上下黑边+胶片帧条+放映按钮 (6色可选)|components/home/banner_cinema|home|<link rel=\"stylesheet\" href=\"vanvy/banner_cinema/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_cinema/banner-cinema.js\"></script>|vanvy/banner_cinema/banner-cinema.js|"
  "banner_split|style|📐 SPLIT 分屏新视界|4.8,4.9|原创: 左竖版海报+右毛玻璃信息面板+网格光效 (6色可选)|components/home/banner_split|home|<link rel=\"stylesheet\" href=\"vanvy/banner_split/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_split/banner-split.js\"></script>|vanvy/banner_split/banner-split.js|"
  # ── 设计师原创 7 款 (2026-08-16 从 V2 集成) ──
  "banner_neo|style|🌀 NEO 霓虹赛博|4.8,4.9|原创: 赛博朋克霓虹灯管+扫描线+网格地面+故障毛刺|components/home/banner_designer/banner_neo|home|<link rel=\"stylesheet\" href=\"vanvy/banner_neo/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_neo/vanvy-carousel-core.js\"></script>|<script src=\"vanvy/banner_neo/banner-neo.js\"></script>|<script src=\"vanvy/banner_neo/banner_neo-activate.js\"></script>|vanvy/banner_neo/banner-neo.js|"
  "banner_glass|style|🪟 GLASS 毛玻璃|4.8,4.9|原创: 半透明毛玻璃+光影层次|components/home/banner_designer/banner_glass|home|<link rel=\"stylesheet\" href=\"vanvy/banner_glass/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_neo/vanvy-carousel-core.js\"></script>|<script src=\"vanvy/banner_glass/banner-glass.js\"></script>|<script src=\"vanvy/banner_glass/banner_glass-activate.js\"></script>|vanvy/banner_glass/banner-glass.js|"
  "banner_orbital|style|🛰 ORBITAL 太空轨道|4.8,4.9|原创: 环形轨道+行星视角|components/home/banner_designer/banner_orbital|home|<link rel=\"stylesheet\" href=\"vanvy/banner_orbital/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_neo/vanvy-carousel-core.js\"></script>|<script src=\"vanvy/banner_orbital/banner-orbital.js\"></script>|<script src=\"vanvy/banner_orbital/banner_orbital-activate.js\"></script>|vanvy/banner_orbital/banner-orbital.js|"
  "banner_retro|style|📼 RETRO 复古胶片|4.8,4.9|原创: VHS 复古+胶片颗粒+CRT|components/home/banner_designer/banner_retro|home|<link rel=\"stylesheet\" href=\"vanvy/banner_retro/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_neo/vanvy-carousel-core.js\"></script>|<script src=\"vanvy/banner_retro/banner-retro.js\"></script>|<script src=\"vanvy/banner_retro/banner_retro-activate.js\"></script>|vanvy/banner_retro/banner-retro.js|"
  "banner_paper|style|📄 PAPER 纸艺|4.8,4.9|原创: 纸艺拼贴+手作风|components/home/banner_designer/banner_paper|home|<link rel=\"stylesheet\" href=\"vanvy/banner_paper/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_neo/vanvy-carousel-core.js\"></script>|<script src=\"vanvy/banner_paper/banner-paper.js\"></script>|<script src=\"vanvy/banner_paper/banner_paper-activate.js\"></script>|vanvy/banner_paper/banner-paper.js|"
  "banner_minimal|style|⬜ MINIMAL 极简|4.8,4.9|原创: 极简编辑排版|components/home/banner_designer/banner_minimal|home|<link rel=\"stylesheet\" href=\"vanvy/banner_minimal/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_neo/vanvy-carousel-core.js\"></script>|<script src=\"vanvy/banner_minimal/banner-minimal.js\"></script>|<script src=\"vanvy/banner_minimal/banner_minimal-activate.js\"></script>|vanvy/banner_minimal/banner-minimal.js|"
  "banner_light|style|☀️ LIGHT 日光|4.8,4.9|原创: 明亮日光浅色|components/home/banner_designer/banner_light|home|<link rel=\"stylesheet\" href=\"vanvy/banner_light/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/banner_neo/vanvy-carousel-core.js\"></script>|<script src=\"vanvy/banner_light/banner-light.js\"></script>|<script src=\"vanvy/banner_light/banner_light-activate.js\"></script>|vanvy/banner_light/banner-light.js|"
)

# ─────────── CSS 主题 themes (可叠加, 变量驱动) ───────────
MANIFEST_THEMES=(
  "glass_graphite|theme|🍇 石墨黑毛玻璃|all|石墨黑毛玻璃|components/themes/glass_graphite|theme|<link rel=\"stylesheet\" href=\"vanvy/themes/glass_graphite.css\" type=\"text/css\" media=\"all\" />|vanvy/themes/glass_graphite.css|"
  "glass_blue|theme|🔵 冰川蓝毛玻璃|all|冰川蓝毛玻璃|components/themes/glass_blue|theme|<link rel=\"stylesheet\" href=\"vanvy/themes/glass_blue.css\" type=\"text/css\" media=\"all\" />|vanvy/themes/glass_blue.css|"
  "glass_purple|theme|🟣 极光紫毛玻璃|all|极光紫毛玻璃|components/themes/glass_purple|theme|<link rel=\"stylesheet\" href=\"vanvy/themes/glass_purple.css\" type=\"text/css\" media=\"all\" />|vanvy/themes/glass_purple.css|"
  "glass_emerald|theme|🟢 翡翠绿毛玻璃|all|翡翠绿毛玻璃|components/themes/glass_emerald|theme|<link rel=\"stylesheet\" href=\"vanvy/themes/glass_emerald.css\" type=\"text/css\" media=\"all\" />|vanvy/themes/glass_emerald.css|"
  "glass_pink|theme|🩷 樱花粉毛玻璃|all|樱花粉毛玻璃|components/themes/glass_pink|theme|<link rel=\"stylesheet\" href=\"vanvy/themes/glass_pink.css\" type=\"text/css\" media=\"all\" />|vanvy/themes/glass_pink.css|"
  "glass_amber|theme|🟠 琥珀金毛玻璃|all|琥珀金毛玻璃|components/themes/glass_amber|theme|<link rel=\"stylesheet\" href=\"vanvy/themes/glass_amber.css\" type=\"text/css\" media=\"all\" />|vanvy/themes/glass_amber.css|"
  "vanvy_custom|theme|👑 Vanvy 定制美化|all|VANVY 品牌美化：LOGO 替换 / 椭圆标签 / 简介弹框 / 剧集列表 / 播放页|components/themes/vanvy_custom|theme|<link rel=\"stylesheet\" href=\"vanvy/themes/vanvy_custom.css\" type=\"text/css\" media=\"all\" />|vanvy/themes/vanvy_custom.css|"
)

# ─────────── 功能增强 features ───────────
MANIFEST_FEATURES=(
  "vanvy_core|feature|🧩 核心库|all|核心运行库：API 通信 / DOM 工具 / 命名空间|core|global|<script src=\"vanvy/core/vanvy-core.js\"></script>|vanvy/core/vanvy-core.js|"
  "jav_details|feature|🔞 JAV元数据美化|all|Javdb 刮削 / 番号识别 / 演员作品 / 翻译 / 预告片|components/features/jav_details|detail|<script src=\"vanvy/features/jav_details/cn2t.js\"></script>|<script src=\"vanvy/features/jav_details/trailer_more_button.js\"></script>|<script src=\"vanvy/features/jav_details/emby_detail_page.js\"></script>|<script src=\"vanvy/features/jav_details/list_page_trailer.js\"></script>|<script src=\"vanvy/features/jav_details/actor_page.js\"></script>|vanvy/features/jav_details/emby_detail_page.js|"
  "danmaku|feature|💬 弹幕|all|多源弹幕（B站 / 抖音等）|components/features/danmaku|global|<script src=\"vanvy/features/danmaku/ede.js\" charset=\"utf-8\"></script>|vanvy/features/danmaku/ede.js|"
  "douban|feature|⭐ 豆瓣/Bangumi评分|all|详情页豆瓣评分|components/features/douban|detail|<script src=\"vanvy/features/douban/douban-score.js\"></script>|vanvy/features/douban/douban-score.js|"
  "playbackrate|feature|⏩ 播放倍速|all|快捷键调节倍速|components/features/playbackrate|global|<script src=\"vanvy/features/playbackrate/playback-speed.js\"></script>|vanvy/features/playbackrate/playback-speed.js|"
  "localplayer|feature|🎬 第三方播放器|all|调用 PotPlayer/mpv|components/features/localplayer|global|<script src=\"vanvy/features/localplayer/external-player.js\"></script>|vanvy/features/localplayer/external-player.js|"
  "player_enhance|feature|🎞️ 播放页增强|all|OSD 布局 / 音量条适配|components/features/player_enhance|global|<link rel=\"stylesheet\" href=\"vanvy/features/player_enhance/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/features/player_enhance/player-enhance.js\"></script>|vanvy/features/player_enhance/player-enhance.js|"
  "fluent_layout|feature|🪟 Fluent布局|all|侧边栏浮层 / 透明顶栏 / 毛玻璃标签 / 细滚动条|components/features/fluent_layout|global|<script src=\"vanvy/features/fluent_layout/fluent-layout.js\"></script>|vanvy/features/fluent_layout/fluent-layout.js|"
  "dark_skin|feature|🖤 深色皮肤层|all|全局纯黑 + 卡片质感 + 主题色强调 (吸收社区黑金强化经验)|components/features/dark_skin|global|<link rel=\"stylesheet\" href=\"vanvy/features/dark_skin/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/features/dark_skin/dark-skin.js\"></script>|vanvy/features/dark_skin/style.css|"
  "global_fonts|feature|🔤 全局字体|all|Plus Jakarta + HarmonyOS + 霞鹜文楷 (双CDN回退)|components/features/global_fonts|global|<link rel=\"stylesheet\" href=\"vanvy/features/global_fonts/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/features/global_fonts/global-fonts.js\"></script>|vanvy/features/global_fonts/global-fonts.js|"
  "hover_glow|feature|✨ 悬停发光|all|卡片 hover 放大+蓝框 (CSS-only)|components/features/hover_glow|global|<link rel=\"stylesheet\" href=\"vanvy/features/hover_glow/style.css\" type=\"text/css\" media=\"all\" />|<script src=\"vanvy/features/hover_glow/hover-glow.js\"></script>|vanvy/features/hover_glow/hover-glow.js|"
  "detail_extra|feature|🖼️ 详情增强|all|剧照+预告片+相似影片+演员作品 (JavDB可选)|components/features/detail_extra|global|<script src=\"vanvy/features/detail_extra/extrafanart-trailers.js\"></script>|vanvy/features/detail_extra/extrafanart-trailers.js|"
  "embytool|feature|🔗 远程路径助手|all|显示远程资源路径并支持复制|components/features/embytool|global|<script src=\"vanvy/features/embytool/remote-path.js\"></script>|vanvy/features/embytool/remote-path.js|"  "extrafanart|feature|🖼️ 剧照展示|all|详情页高清剧照|components/features/extrafanart|detail|<script src=\"vanvy/features/extrafanart/stills.js\"></script>|vanvy/features/extrafanart/stills.js|"
)

# ─────────── 品牌 branding ───────────
MANIFEST_BRANDING=(
  "branding|branding|🏷️ 品牌定制|all|加载LOGO/标签图标/侧边栏LOGO (URL注入)|components/branding|global|vanvy/branding/|"
)

# ─────────── 组件包 packages ───────────
MANIFEST_PACKAGES=(
  "minimal|📦 极简包|banner_classic,vanvy_custom"
  "movie|📦 观影包|banner_classic,vanvy_custom,danmaku,douban,playbackrate,localplayer,embytool,fluent_layout,global_fonts,extrafanart"
  "detail|📦 详情包|banner_classic,vanvy_custom,jav_details"
  "full|📦 全家桶|banner_classic,vanvy_custom,danmaku,douban,playbackrate,localplayer,embytool,jav_details,player_enhance,fluent_layout,global_fonts,hover_glow,detail_extra,extrafanart"
)

# ─────────── 解析工具 ───────────
manifest_field() {
  echo "$1" | awk -F'|' -v n="$2" '{print $n}'
}

# 按类型列出所有条目
manifest_list() {
  local type="$1" line
  for line in "${MANIFEST_STYLES[@]}" "${MANIFEST_THEMES[@]}" "${MANIFEST_FEATURES[@]}" "${MANIFEST_BRANDING[@]}"; do
    [ "$(manifest_field "$line" 2)" = "$type" ] && echo "$line"
  done
}

# 查找组件
manifest_find() {
  local type="$1" id="$2" line
  for line in "${MANIFEST_STYLES[@]}" "${MANIFEST_THEMES[@]}" "${MANIFEST_FEATURES[@]}" "${MANIFEST_BRANDING[@]}"; do
    # 匹配 id + type (type 为空则只按 id)
    if [ "$(manifest_field "$line" 1)" = "$id" ]; then
      if [ -z "$type" ] || [ "$(manifest_field "$line" 2)" = "$type" ]; then
        echo "$line" && return 0
      fi
    fi
  done
  return 1
}

# marker = 注入特征串
manifest_marker() {
  echo "$1" | awk -F'|' '{ for(i=NF;i>=1;i--) if ($i ~ /\// || $i ~ /\.css$/) { print $i; exit } }'
}

# 注入行 = 从字段8到marker前
manifest_inject_lines() {
  local entry="$1" marker line
  marker="$(manifest_marker "$entry")"
  echo "$entry" | awk -F'|' -v m="$marker" '{ for(i=8;i<=NF;i++){ if($i==m) break; print $i } }'
}

# 版本适配判断
manifest_compat() {
  local compat="$1" ver="$2"
  [ "$compat" = "all" ] && return 0
  echo "$compat" | tr ',' '\n' | grep -qx "$ver"
}

# resdir 提取 (字段6: 资源路径)
manifest_resdir() {
  echo "$1" | awk -F'|' '{print $6}'
}

# zone 提取 (字段7: 页面区域)
manifest_zone() {
  echo "$1" | awk -F'|' '{print $7}'
}
