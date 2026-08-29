<p align="center">
  <img src="docs/vek-banner.png" alt="Vanvy Emby Kit" width="1000"/>
</p>

# 🎨 Vanvy Emby Kit

> **让每一台 Emby，都成为艺术品。**
> 一行命令，自动识别你的 Emby 环境，自由组合美化组件。

<p align="center">
  <a href="https://github.com/micimo13/emby-beautify/stargazers"><img src="https://img.shields.io/github/stars/micimo13/emby-beautify" alt="Stars"/></a>
  <a href="https://github.com/micimo13/emby-beautify/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"/></a>
  <img src="https://img.shields.io/badge/Emby-4.8%20%7C%204.9-green" alt="Emby 4.8|4.9"/>
  <img src="https://img.shields.io/badge/Platform-Docker%20%7C%20NAS-blueviolet" alt="Docker|NAS"/>
  <img src="https://img.shields.io/badge/镜像-官方%20%7C%20LinuxServer%20%7C%20社区-orange" alt="镜像兼容"/>
</p>

---

## ✨ 它是什么？

**Vanvy Emby Kit** 是一个面向自建媒体库爱好者的 **Emby 前端美化工具箱**。无论你的 Emby 跑在群晖、威联通、飞牛、UNRAID 还是任何 Linux 服务器上，只需一行命令，就能：

- 🎠 换上**沉浸式首页轮播**（**7 款可选**，含 3 款原创设计：AURORA 极光 / CINEMA 影院黑金 / SPLIT 分屏新视界）
- 🌌 **品牌加载动画**：进入首页先有全屏专属过渡动画（极光 / 放映机 / 分屏呼吸），轮播就绪后平滑淡出
- 🎬 **轮播内媒体库**：底部卡片流浏览真实媒体库分类，可拖拽 / 滚轮 / 左右箭头滚动，hover 有扫光 + 发光 + 进入提示
- 🎯 **影片备选列表**：右侧 / 底部缩略图流，全量渲染可滚动，点击即切换轮播
- 📺 **一键直达**：详情按钮跳官方详情页，播放按钮调官方播放器（全屏直播）
- 🎨 一键应用 **7 款毛玻璃主题** + Vanvy 品牌定制
- ⚡ 叠加 **13 个功能增强**（弹幕 / 豆瓣评分 / 倍速记忆 / 剧照 / JAV 元数据 / Fluent布局 / 字体…）
- 🛡️ **自动识别镜像环境**，官方版 / LinuxServer / 社区版通吃
- 💾 **持久化存储**，容器重建后一键恢复（社区版自动注入启动钩子）

> 💡 自动探测容器内的 Web 目录与 Emby 版本，适配所有主流镜像布局，无需关心镜像差异。

---

## 📸 效果预览

> 以下截图来自真实媒体库运行环境（VANVY 定制 Emby）

### 🏠 首页推荐位

<p align="center">
  <img src="docs/shot-home.jpg" alt="首页推荐位" width="880"/>
  <br/>
  <em>沉浸式大图推荐位 + 毛玻璃信息层</em>
</p>

### 🎬 详情页与剧集列表

<p align="center">
  <img src="docs/shot-detail-1.jpg" alt="详情页 1" width="430"/>
  <img src="docs/shot-detail-2.jpg" alt="详情页 2" width="430"/>
  <br/>
  <em>详情页：高清海报 + 媒体信息 + 播放按钮</em>
</p>

<p align="center">
  <img src="docs/shot-series-1.jpg" alt="剧集列表 1" width="430"/>
  <img src="docs/shot-series-2.jpg" alt="剧集列表 2" width="430"/>
  <br/>
  <em>剧集列表：卡片式剧集 + 简介</em>
</p>

<p align="center">
  <img src="docs/shot-series-3.jpg" alt="剧集列表 3" width="880"/>
  <br/>
  <em>剧集详情：分集信息 + 演职人员</em>
</p>

### 🖥️ 一键安装

<p align="center">
  <img src="docs/vek-terminal.png" alt="终端安装演示" width="820"/>
  <br/>
  <em>交互式向导：选容器 → 选轮播 → 选主题 → 完成</em>
</p>

---

## 🚀 30 秒上手

```bash
# 交互式完整向导（推荐：GitHub API 直取，无缓存永远最新，国内可访问）
curl -sL https://emby-beautify.vanvy.top/scripts/online-install.sh | bash

# 网络可直连 GitHub 时，也可用官方源
curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash

# 零交互快速安装（全家桶）
curl -sL https://emby-beautify.vanvy.top/scripts/online-install.sh | bash -s -- --package full --yes

# 指定容器 + 指定组件
curl -sL https://emby-beautify.vanvy.top/scripts/online-install.sh | bash -s -- --container emby --feature danmaku
```

安装完成后，浏览器 **Ctrl+F5 / Cmd+Shift+R** 强制刷新即可看到效果 ✨

### 🛠️ 命令行详解

```bash
bash install.sh                          # 交互式向导
bash install.sh --container emby         # 指定容器
bash install.sh --package full --yes     # 全家桶免确认
bash install.sh --feature danmaku,douban # 只装指定组件
bash install.sh --restore                # 容器重建后恢复美化
bash install.sh --detect-only            # 只检测环境

bash uninstall.sh --container emby --all          # 卸载全部
bash uninstall.sh --container emby --only danmaku # 卸载单个组件
bash uninstall.sh --container emby --reset        # 完全还原出厂
```

### 💾 容器重建后恢复

- **官方版 / LinuxServer 版**：重建后运行一次 `bash install.sh --restore` 即可恢复全部美化
- **社区版（amilys 等）**：自动写入启动钩子，重建后自动恢复，无需手动操作

---

## 📦 组件包

| 包 | 包含组件 |
|---|---|
| 📦 **极简包** | 经典轮播 + Vanvy 品牌主题 |
| 📦 **观影包** | 轮播 + 弹幕 / 豆瓣 / 剧照 / 倍速 / 播放器 / 远程路径 |
| 📦 **详情包** | 轮播 + 品牌主题 + JAV 元数据 |
| 📦 **全家桶** | 以上全部 + 播放页增强 |

---

## 🎠 首页轮播（7 款可选，三款原创）

### 🌌 原创轮播（自研，6 色主题可选）

| 风格 | 效果 | 专属加载动画 | 布局亮点 |
|---|---|---|---|
| 🌌 **AURORA 极光** | 极光光晕 + 封面流 + 毛玻璃 | 极光流动 + LOGO 呼吸 + 流光进度 | 左侧信息卡 + 右侧竖排影片备选（5行可滚）+ 底部媒体库卡片流 |
| 🎬 **CINEMA 影院黑金** | 21:9 超宽画幅 + 上下黑边 + 胶片帧条 | 放映机光束 + 胶片帧条滚动 | 右下角毛玻璃信息卡 + 底部胶片缩略图 + 媒体库卡片流 |
| 📐 **SPLIT 分屏新视界** | 左竖版海报 + 右毛玻璃面板 + 网格光效 | 左右分屏呼吸 | 全屏背景 + 悬浮海报卡 + 底部横图缩略流 + 媒体库卡片流 |

> 原创轮播统一支持：**6 色主题**（蓝紫极光 / 青绿 / 粉紫 / 暖金 / 深海 / 黑金）、**品牌加载动画**、**媒体库卡片流**（拖拽 + 滚轮 + 箭头滚动）、**影片备选列表**（全量渲染可滚）、**详情/播放按钮**（官方路由直跳）、**顶栏悬浮透明**（轮播真满屏）、**手机响应式**。

### 🎠 经典轮播（三选一 + 封面流）

| 风格 | 效果 | 适配版本 |
|---|---|---|
| 🎠 经典轮播 | Backdrop 大图 + 信息 + LOGO，8 秒自动滚动 | 4.8 |
| 🎠 Fluent 轮播 | 无缝循环 + 左右导航 + 失败自动清理 | 4.8 / 4.9 |
| 🎠 封面流轮播 | Swiper 封面流: 主图+缩略图联动 (emby-crx 原版) | 4.8 / 4.9 |

## 🎨 主题美化（毛玻璃互斥，可叠加品牌主题）

| 主题 | 效果 |
|---|---|
| 🍇 石墨黑 / 🔵 冰川蓝 / 🟣 极光紫 | 深色系毛玻璃质感 |
| 🟢 翡翠绿 / 🩷 樱花粉 / 🟠 琥珀金 | 彩色系毛玻璃质感 |
| 👑 **Vanvy 定制** | LOGO 替换 / 椭圆标签 / 简介弹框 / 剧集列表 / 播放页 |

## ⚡ 功能增强（13 个）

| 组件 | 功能 |
|---|---|
| 🔞 JAV 元数据 | Javdb 刮削 / 番号识别 / 演员作品 / 翻译 / 预告片 |
| 💬 弹幕 | 多源弹幕（B站 / 抖音等） |
| ⭐ 豆瓣评分 | 豆瓣 / Bangumi 评分展示 |
| ⏩ 播放倍速 | 快捷键调速 + **倍速记忆**（刷新/重启恢复） |
| 🎬 外部播放器 | PotPlayer / VLC / MPV 等 |
| 🎞️ 播放页增强 | OSD 布局 + **音量记忆**（会话恢复） |
| 🔗 远程路径 | 显示远程资源路径并可复制 |
| 🪟 Fluent 布局 | 侧边栏浮层 / 透明顶栏 / 毛玻璃标签 / 细滚动条 |
| 🔤 全局字体 | Plus Jakarta + HarmonyOS + 霞鹜文楷（双 CDN 回退） |
| ✨ 悬停发光 | 卡片 hover 放大 + 蓝框发光（CSS-only） |
| 🖼️ 详情增强 | 剧照轮播 + 预告片 + 相似影片 + 演员作品（JavDB 可选） |
| 🖼️ 剧照展示 | 剧集列表 hover 剧照（与 JAV 剧照互补，排在最后避免覆盖） |
| 📚 媒体库卡片流 | 原创轮播底部媒体库分类卡片（拖拽/滚轮/箭头滚动 + hover 特效） |

## 🎯 轮播内容策展（吸收 EmbyCarouselGUI）

首页轮播不再"随机抽卡"，而是可运营的内容位。编辑容器内 `vanvy/carousel_rules/carousel-rules.json`：

```json
{
  "version": 1,
  "rule": {
    "name": "高分精选",
    "types": ["Movie"],
    "libraries": ["电影"],
    "sort": "CommunityRating",
    "order": "Descending",
    "minPremiereDays": 90,
    "maxCount": 5,
    "pin": ["星际穿越", "流浪地球"]
  }
}
```

- `types`: Movie / Series / BoxSet（可组合）
- `libraries`: 媒体库名称（空 = 全部，支持模糊匹配）
- `sort`: PremiereDate / CommunityRating / DateCreated / ProductionYear / Random
- `minPremiereDays`: 仅最近 N 天首映
- `pin`: 优先置顶片名（按配置顺序）

生成器脚本（可 cron 自动刷新）：

```bash
python3 scripts/gen_carousel_rules.py --container emby gen --template daily --keep 1 --deploy
python3 scripts/gen_carousel_rules.py --container emby gen --template top-rated --keep 5 --deploy
# cron: 每天 6 点刷新每日推荐
0 6 * * * python3 scripts/gen_carousel_rules.py --container emby gen --template daily --keep 1 --deploy
```

模板：`daily`（每日推荐）/ `recent`（近期上映）/ `new-added`（最近入库）/ `top-rated`（高分精选）/ `collection`（随机合集）

---

## 🧠 技术亮点

- **加载动画全屏化**：`position:fixed` 挂载到 `document.body` 顶层，避开容器 `mask-image` 的包含块陷阱，真正占满视口（100vw×100vh），顶栏 `display:none` 彻底移除
- **返回首页自动恢复**：URL 变化检测（Emby 的 `Emby.Page.show` 用 History API，不触发 hashchange），离开首页清理轮播，返回自动重挂载，无需刷新
- **媒体库路由映射**：按 CollectionType 映射官方路由（movies/homevideos → `/videos`，tvshows → `/tv`，boxsets → `/list`），跳转带 `serverId`，点击即达
- **播放器接入**：`Emby.importModule` 加载官方 playbackManager，`play({fullscreen, ids, serverId})` 全屏直播
- **选择器提权**：顶栏透明规则用 `body.vanvy-carousel-active .skinHeader.skinHeader-withBackground`，避开主题 CSS 特异性冲突
- **防冲突设计**：轮播内置媒体库为独立渲染（不 detach 原 section0，不破坏原布局），与右侧影片备选分工明确

---

## 📄 License

MIT
