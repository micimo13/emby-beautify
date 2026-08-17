# 🎨 Emby 美化引擎 · V4 最终设计方案（覆盖主人 7 点需求）

> 角色：前端工程师 · 编制：虾子🦐 · 2026-08-11
> 调研资产：8 个开源项目 + 群晖自研资产（88+11 文件）+ 主人 Custom CSS

---

## 一、需求确认（主人 7 点 → 设计落点）

| # | 主人需求 | 设计落点 |
|---|---|---|
| 1 | 两个轮播风格不同，要有风格选择 | **轮播引擎支持多风格**：经典(crx) / Fluent / Banner图(主人自研) 三选一 |
| 2 | 常用组件要有一键安装的组件包 | **预置组件包**：观影全家桶 / 详情页全家桶 / 极简包 / 全功能包 |
| 3 | 主题延伸更多样式，与轮播不冲突，毛玻璃多颜色 | **毛玻璃多色主题**：蓝/紫/绿/粉/琥珀/石墨 等 6+ 色变体，CSS 变量驱动 |
| 4 | 群晖上的美化参与调研 | ✅ 已完成：同步 99 个文件，解构 BannerCarousel/emby-loading/douban |
| 5 | 加载 LOGO、浏览器标签 LOGO 注入支持 | **品牌注入**：logo/favicon/splash 三件套，URL 下载注入 + 持久化 |
| 6 | Emby 前端还原和美化删除 | **--reset 完全还原** + --only/--all 精确卸载 |
| 7 | 主人的 Custom CSS 纳入参考 | ✅ 已解析：LOGO替换/椭圆标签/简介弹框/剧集列表/播放页布局 |

---

## 二、轮播引擎设计（多风格，核心自研）

### 2.1 三种轮播风格（用户可选）

```
banner-engine.js 核心框架 + 风格插件化
│
├── 风格 A: 经典轮播 (classic)
│    ├─ 来源: emby-crx (Backdrop 大图 + 信息 + LOGO)
│    └─ 特点: 8s 自动滚动, 简单经典
│
├── 风格 B: Fluent 轮播 (fluent)  
│    ├─ 来源: Emby-Fluent (幽灵克隆无缝滚动 + 失败清理)
│    └─ 特点: 无缝循环 + 左右导航按钮 + 健壮性
│
└── 风格 C: Banner 图轮播 (banner) ← 主人自研!
     ├─ 来源: 群晖 BannerCarousel.js
     └─ 特点: 用 Banner 横幅图(非Backdrop) + 随机排序 + 按钮控制
```

### 2.2 引擎架构（防冲突核心）

```javascript
(function () {
  'use strict';
  const NS = 'VanvyBanner';
  
  class BannerEngine {
    static register(style) { /* 风格插件注册 */ }
    static start() { /* 按用户选择启动对应风格 */ }
  }
  
  // 幂等: 已初始化不重复
  if (document.documentElement.dataset[NS]) return;
  document.documentElement.dataset[NS] = '1';
  
  // 所有 DOM/CSS 加 vanvy-banner- 前缀
  // 4.8/4.9 版本适配层
})();
```

**风格选择流程**：安装时询问"选择轮播风格：[1]经典 [2]Fluent [3]Banner图"，引擎加载对应插件，**同一时间只装一个风格**（首页区互斥）。

---

## 三、组件包设计（一键安装）

### 3.1 预置组件包

| 组件包 | 包含 | 适用 |
|---|---|---|
| 📦 **极简包** | 轮播(经典) + 毛玻璃主题 + 加载LOGO | 家庭影音，干净简洁 |
| 📦 **观影包** | 轮播(风格自选) + 毛玻璃多色 + 弹幕 + 豆瓣 + 剧照 + 倍速 | 影视爱好者，功能全 |
| 📦 **详情包** | JAV详情页全家桶 + 剧照 + Trailer + 豆瓣 | R18 库 / 详情页重度 |
| 📦 **全家桶** | 全部组件（自动排除冲突） | 折腾党 |

### 3.2 组件包实现

```
manifest 增加 packages 声明:
  packages:
    minimal:  [banner-classic, theme-glass-blue, branding]
    movie:    [banner-fluent, theme-glass-purple, danmaku, douban, extrafanart, playbackrate]
    detail:   [jav-details, extrafanart, trailer, douban]
    full:     [全部, 引擎自动排除冲突]

安装: bash install.sh --package movie → 自动装 6 个组件
```

---

## 四、主题系统（多色毛玻璃 + 零冲突）

### 4.1 毛玻璃多色主题（主人需求 3）

```
theme-base.css (变量定义)
│
├── 🍇 石墨黑 glass-graphite   (默认, 蓝紫调)
├── 🔵 冰川蓝 glass-blue       (冷色调)
├── 🟣 极光紫 glass-purple     (紫调)
├── 🟢 翡翠绿 glass-emerald    (绿调)
├── 🩷 樱花粉 glass-pink       (粉调)
├── 🟠 琥珀金 glass-amber      (暖调)
└── ⬜ 极简白 minimal          (无毛玻璃)

每个主题 = 一组 CSS 变量, 只改颜色不改结构:
:root.vanvy-glass-blue {
  --vanvy-glass-bg: rgba(30, 58, 138, 0.55);   /* 蓝色毛玻璃底 */
  --vanvy-glass-blur: blur(18px) saturate(160%);
  --vanvy-accent: #3b82f6;
  --vanvy-radius: 14px;
}
```

### 4.2 与轮播零冲突（三层隔离）

```
1. 选择器隔离: 所有主题规则用 html.vanvy-theme-xxx 前缀
2. 变量驱动: 只改 CSS 变量, 不覆盖具体组件
3. 轮播保护: .vanvy-banner-* 元素在主题中豁免 (不继承玻璃效果)
```

---

## 五、品牌注入（主人需求 5）

| 注入点 | 位置 | 实现 |
|---|---|---|
| **加载 LOGO** | `.app-splash` 背景 | 下载 → 注入覆盖样式 |
| **浏览器标签图标** | `<link rel="shortcut icon">` | 下载 → 改 href |
| **侧边栏 LOGO** | `.adminDrawerLogo img` | 主人 CSS 的 content:url 方案 |
| **标题 LOGO** | `.pageTitleWithLogo` | 主人 CSS 的 background-image 方案 |

> 品牌图 URL 由用户提供，支持 ico/png/jpg/webp，持久化到 /config（重建不丢）。

---

## 六、还原/卸载（主人需求 6）

```
bash uninstall.sh --reset      # 完全还原: 镜像原始 index.html + 删全部美化 + 清持久化
bash uninstall.sh --all        # 卸载全部(含清持久化, 防重建复活)
bash uninstall.sh --only jav   # 精确卸载单个
```

---

## 七、主人的 Custom CSS 纳入（需求 7 解析）

已从主人的 CSS 提取 6 个可复用模块，纳入自研组件：

| 模块 | 功能 | 成为 |
|---|---|---|
| LOGO 三连 | 侧边栏/标题/图标 LOGO 替换 | branding 组件 |
| 椭圆标签 | 分类/媒体信息标签半透明椭圆 | detail-enhance 组件 |
| 简介弹框 | 毛玻璃弹框 + 点击展开 | detail-enhance 组件 |
| 剧集列表 | hover 缩放 + 简介渐显 | list-enhance 组件 |
| 播放页布局 | OSD 按钮/音量适配 | player-enhance 组件 |
| 冗余隐藏 | 隐藏多余元素精简界面 | ui-clean 组件 |

> 这些以"vanvy- 细节增强"组件形式提供，**可独立开关**，与轮播/主题零冲突（不同 DOM 区域）。

---

## 八、镜像体检引擎（避坑核心）

```
detect_image():
  amilys/embyserver → 开心版: 内置旧版crx + ext.sh清parentId
    → 自动: 覆盖官方版main.js + 接管ext.sh钩子
  官方 emby → 干净: 直接注入
  linuxserver/emby → 干净
  docker.vanvy.cc → 同 amilys

detect_builtin():
  index.html 有 emby-crx/main.js? → 旧版, 覆盖
  config.js parentId 被清? → ext.sh接管
  danmaku.min.js? → 内置弹幕检测
  ext.js? → 镜像扩展检测

输出体检报告 → 自动推荐方案 + 标注需绕开的坑
```

---

## 九、业务流程（完整用户视角）

```
bash install.sh
  ├─ ① 识别容器 (自动/手动)
  ├─ ② 镜像体检 → 报告: [开心版 amilys 4.8] 内置旧版crx(将覆盖) ext.sh(将接管)
  ├─ ③ 版本识别 → 4.8/4.9
  ├─ ④ 方案推荐:
  │     📦 组件包: [1]极简 [2]观影 [3]详情 [4]全家桶 [5]自定义
  │     (选自定义时↓)
  │     🎠 轮播风格: [1]经典 [2]Fluent [3]Banner图
  │     🎨 主题: 毛玻璃多色(6选) / 极简 / 暗色系(可多选)
  │     ⚡ 功能: 弹幕/豆瓣/剧照/倍速/播放器/细节增强(可多选)
  │     🏷️ 品牌: Logo/Favicon URL
  ├─ ⑤ 用户选择 → 依赖排序 → 注入
  ├─ ⑥ 部署验证 → 每组件校验
  └─ ⑦ 持久化 → ext.sh 钩子 (重建不丢)
```

---

## 十、开发计划

| 阶段 | 内容 |
|---|---|
| P0 | 本方案主人确认 |
| P1 | lib 三件套（detect/engine/persist）+ 体检引擎 |
| P2 | 轮播引擎 3 风格（classic/fluent/banner） |
| P3 | 主题系统（毛玻璃 6 色 + 极简 + 暗色） |
| P4 | 功能组件（弹幕/豆瓣/剧照/倍速/播放器/细节增强） |
| P5 | 组件包 + 品牌注入 + --reset |
| P6 | 三台真机回归 → 验证报告 → 主人验收 → 才上传 |

---

## 待主人确认

1. **轮播 3 风格**（经典/Fluent/Banner图）——主人自研的 BannerCarousel 也纳入，对吗？
2. **毛玻璃 6 色**：石墨黑/冰川蓝/极光紫/翡翠绿/樱花粉/琥珀金——够吗？还要加色？
3. **组件包 4 个**：极简/观影/详情/全家桶——划分合理吗？
4. **细节增强组件**（主人 CSS 拆的 6 个模块）——是否纳入？
5. **项目名**：你定。

---

*调研资产：`emby-research/`（8 开源 + 群晖 99 文件 + 主人 CSS）*
