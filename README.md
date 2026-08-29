<p align="center">
  <img src="docs/vek-banner.png" alt="Vanvy Emby Kit" width="1000"/>
</p>

# 🎨 Vanvy Emby Kit · 美化引擎

> **让每一台 Emby，都成为艺术品。**
> 一行命令，自动识别你的 Emby 版本，自由组合美化组件。

<p align="center">
  <a href="https://github.com/micimo13/emby-beautify/stargazers"><img src="https://img.shields.io/github/stars/micimo13/emby-beautify" alt="Stars"/></a>
  <a href="https://github.com/micimo13/emby-beautify/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"/></a>
  <img src="https://img.shields.io/badge/Emby-4.8%20%7C%204.9%20%7C%204.10-green" alt="Emby 版本"/>
  <img src="https://img.shields.io/badge/Platform-Docker%20%7C%20NAS-blueviolet" alt="平台支持"/>
</p>

---

## ✨ 功能总览

| 类别 | 数量 | 说明 |
|------|------|------|
| 🎠 首页轮播 | **7 款** | 经典/Fluent/封面流/AURORA/CINEMA/SPLIT/Banner |
| 🎬 Loading 预热 | **5 款** | **独立选择**·极光/影院/分屏/简约/Logo |
| 🎨 CSS 主题 | **7 款** | 石墨黑/冰川蓝/极光紫/翡翠绿/樱花粉/琥珀金/Vanvy定制 |
| ⚡ 功能增强 | **13 个** | 弹幕/豆瓣评分/倍速/第三方播放器/悬停发光/详情增强... |

---

## 🚀 快速安装

```bash
# 一键安装（自动识别容器）
curl -sL https://emby-beautify.vanvy.top/install.sh | bash

# 或（GitHub 源）
curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/install.sh | bash
```

安装过程自动检测：
- ✅ Emby 容器名称
- ✅ Emby 版本 (4.8 / 4.9 / 4.10)
- ✅ Web 目录路径
- ✅ 镜像类型

---

## 🎬 Loading 预热动画（独立选择）

> 可自由搭配任意轮播组件使用

| 样式 | 预览 | 描述 |
|------|------|------|
| 🌌 **AURORA 极光** | 极光粒子+光晕+双圆环 | 推荐搭配 AURORA 轮播 |
| 🎬 **CINEMA 影院** | 电影胶片卷轴+黑金配色 | 推荐搭配 CINEMA 轮播 |
| 📐 **SPLIT 分屏** | 左右分屏+毛玻璃+网格光效 | 推荐搭配 SPLIT 轮播 |
| ⚪ **MINIMAL 简约** | 细线动画+黑白极简 | 百搭任何风格 |
| 🖼️ **LOGO 动态** | 品牌Logo呼吸效果 | 彰显品牌 |

### 效果预览

```
┌─────────────────────────────────────────────────────────────┐
│  🌌 AURORA 极光              🎬 CINEMA 影院                  │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  ┌──────────────────────────┐  │
│  │    ✦  ✧    ✦    ✦  ✧    │  │     🎞️ 胶片旋转中...     │  │
│  │  ╭─╮   ╭─╮   ╭─╮       │  │   ┌────┐  ┌────┐         │  │
│  │  │✦│   │✦│   │✧│       │  │   │父父│  │父父│  ←转动   │  │
│  │  ╰─╯   ╰─╯   ╰─╯       │  │   └────┘  └────┘         │  │
│  │  ════════════════       │  │   ──────────────────     │  │
│  │  🎬 VANVY AURORA        │  │   🎬 CINEMA              │  │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎠 首页轮播（7 款可选）

### 原创设计（非社区版）

| 轮播 | 版本 | 特色 |
|------|------|------|
| 🌌 **AURORA 极光** | 4.8/4.9 | 极光光晕 + 封面流 + 毛玻璃 (6色) |
| 🎬 **CINEMA 影院黑金** | 4.8/4.9 | 21:9 超宽画幅 + 胶片帧条 + 放映按钮 |
| 📐 **SPLIT 分屏** | 4.8/4.9 | 左竖版海报 + 右毛玻璃信息 + 网格光效 |

### 经典 / 兼容版

| 轮播 | 版本 | 特色 |
|------|------|------|
| 🎠 **经典轮播** | 4.8 | Backdrop 大图 + 信息 + LOGO |
| 🪟 **Fluent 轮播** | 4.8/4.9 | 无缝循环 + 左右导航 |
| 🖼️ **Banner 图轮播** | 4.8/4.9 | 横幅图 + 随机排序 |
| 📚 **封面流轮播** | 4.8/4.9 | Swiper 主图 + 缩略图联动 |

---

## 🎨 CSS 主题（可叠加）

| 主题 | 风格 |
|------|------|
| 🍇 石墨黑毛玻璃 | 深色毛玻璃 |
| 🔵 冰川蓝毛玻璃 | 清爽蓝调 |
| 🟣 极光紫毛玻璃 | 梦幻紫 |
| 🟢 翡翠绿毛玻璃 | 自然绿 |
| 🩷 樱花粉毛玻璃 | 甜美粉 |
| 🟠 琥珀金毛玻璃 | 温暖金 |
| 👑 Vanvy 定制 | 品牌美化：Logo替换/椭圆标签/简介弹框 |

---

## ⚡ 功能增强（自由选择）

| 功能 | 说明 |
|------|------|
| 🔞 JAV 元数据 | Javdb 刮削 / 番号识别 / 演员作品 |
| 💬 弹幕 | 多源弹幕（B站/抖音等） |
| ⭐ 豆瓣/Bangumi 评分 | 详情页显示评分 |
| 🖼️ 剧照展示 | 详情页高清剧照 |
| ⏩ 播放倍速 | 快捷键调节倍速 |
| 🎬 第三方播放器 | 调用 PotPlayer/mpv |
| 🎞️ 播放页增强 | OSD 布局 / 音量条适配 |
| 🪟 Fluent 布局 | 侧边栏浮层 / 透明顶栏 / 毛玻璃标签 |
| 🔤 全局字体 | Plus Jakarta / HarmonyOS / 霞鹜文楷 |
| ✨ 悬停发光 | 卡片 hover 放大 + 蓝框发光 |
| 🖼️ 详情增强 | 剧照 + 预告片 + 相似影片 |
| 🔗 远程路径助手 | 显示远程资源路径 |

---

## 📸 效果预览

### 🏠 首页轮播效果

<p align="center">
  <img src="docs/shot-home.jpg" alt="首页轮播" width="900"/>
  <br/><em>AURORA 极光轮播 + 毛玻璃主题</em>
</p>

### 🎬 详情页效果

<p align="center">
  <img src="docs/shot-detail-1.jpg" alt="详情页" width="450"/>
  <img src="docs/shot-detail-2.jpg" alt="详情页2" width="450"/>
  <br/><em>Vanvy 定制主题 + 豆瓣评分 + 剧照展示</em>
</p>

### 📺 剧集列表

<p align="center">
  <img src="docs/shot-series-1.jpg" alt="剧集1" width="300"/>
  <img src="docs/shot-series-2.jpg" alt="剧集2" width="300"/>
  <img src="docs/shot-series-3.jpg" alt="剧集3" width="300"/>
  <br/><em>剧集列表优化 + 简介弹框 + 进度追踪</em>
</p>

---

## 🔧 使用方式

### 1. 在线安装（一键）
```bash
curl -sL https://emby-beautify.vanvy.top/install.sh | bash
```

### 2. 交互选择
```
═══════════════════════════════════════════════════════════
  🎨 Vanvy Emby Kit · 安装器
═══════════════════════════════════════════════════════════

检测到: emby-302 (emby 4.9)

  🎠 首页美化（互斥, 按版本）:
     [1] 🎠 经典轮播              (4.8)
     [2] 🪟 Fluent轮播            (4.8/4.9)
     [3] 🌌 AURORA 极光          (4.8/4.9) ✓
     [4] 🎬 CINEMA 影院黑金      (4.8/4.9) ✓
     [5] 📐 SPLIT 分屏           (4.8/4.9) ✓

  🎬 预热加载 (独立选择):
     [1] 🌌 AURORA 极光
     [2] 🎬 CINEMA 影院
     [3] 📐 SPLIT 分屏
     [4] ⚪ MINIMAL 简约
     [5] 🖼️ LOGO 动态

  🎨 主题 (可多选):
     [1] 🍇 石墨黑毛玻璃
     [2] 🔵 冰川蓝毛玻璃
     ...

  ⚡ 功能 (可多选):
     [1] 🔞 JAV元数据美化
     [2] 💬 弹幕
     ...
═══════════════════════════════════════════════════════════
```

### 3. 卸载
```bash
curl -sL https://emby-beautify.vanvy.top/uninstall.sh | bash
```

---

## 📋 版本兼容性

| Emby 版本 | 首页轮播 | 主题 | 功能 |
|-----------|---------|------|------|
| **4.8.x** | 经典/Fluent/AURORA/CINEMA/SPLIT | 全部 | 全部 |
| **4.9.x** | Fluent/AURORA/CINEMA/SPLIT | 全部 | 全部 |
| **4.10.x** | 暂无 | Apple Glass (实验) | 部分 |

---

## 🔄 更新日志

### v15 (2024-08)
- ✅ **NEW**: 5 款独立 Loading 预热动画（aurora/cinema/split/minimal/logo）
- ✅ **NEW**: 安装脚本支持独立选择 Loading 组件
- 🐛 **FIX**: 修复悬停发光 bug（卡片标题无法点击）
- ♻️ **REFACTOR**: 完全重构项目架构（components/home + components/themes + components/loading）

---

## 📄 License

MIT License - 自由使用，欢迎 Star ⭐

---

<p align="center">
  <em>Made with ❤️ by Vanvy</em>
</p>