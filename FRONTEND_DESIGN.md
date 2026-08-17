# 🎨 Emby 美化引擎 · 前端工程师视角项目构思（V3 从零设计）

> 角色：前端工程师（兼技术负责人）· 编制：虾子🦐 · 2026-08-11
> 核心理念：**不解构部署别人的整个项目，而是解构其优秀代码 → 提取可复用模块 → 重组为自研组件库**
> 这样代码完全可控，从根源消除"美化打架"。

---

## 一、调研解构成果（8 个项目源码已下载分析）

### 1.1 各项目技术解构

| 项目 | 核心代码 | 解构出的可复用模块 | 独有亮点 |
|---|---|---|---|
| **emby-crx** (1252★) | main.js 236行 / style.css 316行 | ① injectCode/injectCall（BroadcastChannel 通信绕过 window 隔离）② getItems 自动媒体库查询 ③ 轮播 DOM 结构 ④ loading 动画 | 行业标杆，注入机制最成熟 |
| **Emby-Fluent** (9★) | main.js 446行 / style.css 438行 | ① Promise.all 并行加载 ② **失败幻灯片清理** ③ **幽灵克隆无缝滚动** ④ 10s 超时兜底 ⑤ **v4.9 兼容（.section0 标记）** ⑥ 毛玻璃 CSS ⑦ 字体栈（Plus Jakarta + HarmonyOS） | **健壮性最强**，几乎每个 await 都有超时/失败处理 |
| **Embymalism** (11★) | CSS 3273行 | ① **Custom CSS 通道安装**（不碰文件系统）② 极简风全套选择器 | 主题零侵入方案 |
| **Emby-JS-Details** (43★) | JS 19文件 | 详情页增强（剧照/演员/翻译/Javdb） | JAV 详情页全家桶 |
| **Dark-Themes** (51★) | CSS 10色 | 暗色系主题变量化 | 10 色一键切换 |
| **Spotlight** | JS 2860行 | 首页 Spotlight 搜索条 | 首页搜索增强 |
| **Reviews** | JS | 详情页评论区 | 详情页增强 |
| **emby-crx-tool** (0★) | shell 100行 | 一键脚本骨架（容器检测/下载/注入） | 简单直接 |

### 1.2 关键技术资产提取（我们要复用的）

```
✅ 注入通信机制   ← emby-crx 的 injectCode/injectCall (BroadcastChannel)
✅ 轮播渲染引擎   ← Emby-Fluent 的健壮版 (Promise.all + 失败清理 + 幽灵克隆 + 超时)
✅ 数据查询       ← emby-crx 的 getItems (Recursive 全库自动匹配)
✅ v4.9 兼容      ← Emby-Fluent 的 section0 标记
✅ 毛玻璃/字体    ← Emby-Fluent 的 CSS 设计
✅ 主题通道       ← Embymalism 的 Custom CSS 方案 (零侵入)
✅ 暗色变量       ← Dark-Themes 的变量化配色
✅ 一键骨架       ← emby-crx-tool 的容器检测流程
```

---

## 二、冲突根源分析（为什么之前会打架）

### 2.1 冲突类型学（前端工程师视角）

| 冲突类型 | 本质 | 之前案例 | 解决方案 |
|---|---|---|---|
| **DOM 区域抢占** | 多个脚本操作同一 DOM 区域 | 首页轮播：crx / fluent / bannercarousel / loading 全抢 `.section0` | **按区域模块化**：首页区只装一个引擎 |
| **全局 CSS 污染** | 主题 CSS 互相覆盖 | AppleGlass 的 `.card` 规则盖掉 crx 的卡片样式 | **CSS 作用域隔离**：每个组件加唯一前缀 + 变量化 |
| **JS 全局变量冲突** | 多个脚本定义同名变量/函数 | 都定义 `Home` 类、`Config` | **IIFE 封装** + 命名空间唯一前缀 |
| **注入顺序依赖** | 脚本 A 依赖脚本 B 先加载 | crx 依赖 jquery/md5 | **依赖声明**：manifest 声明依赖，引擎排序注入 |
| **版本不兼容** | 4.8 / 4.9 DOM 结构不同 | `.section0` 在 4.9 不存在 | **版本适配层**：检测版本，用对应选择器 |

### 2.2 镜像层冲突（开心版特有）

| 镜像机制 | 冲突 | 解决 |
|---|---|---|
| 内置旧版 emby-crx | 依赖 config.js 白名单，ext.sh 清空 → 轮播禁用 | 覆盖为自研官方版（不读 config.js）|
| ext.sh 每次启动跑 | 清 parentId / 清 extmod | 接管 ext.sh：先执行我们的钩子，再跑原逻辑 |
| 内置 danmaku/embyHappy | 与我们的弹幕冲突 | 检测到内置 → 提示禁用或绕开 |

---

## 三、V3 架构设计（自研组件库）

### 3.1 总体架构

```
emby-beautify/                    ← 独立项目
├── install.sh                    # 主入口: 容器体检 → 版本识别 → 方案推荐 → 安装
├── uninstall.sh                  # 卸载/初始化
├── lib/
│   ├── detect.sh                 # 🧬 体检引擎 (镜像/版本/内置美化/ext.sh/冲突源)
│   ├── engine.sh                 # ⚙️ 部署引擎 (依赖排序/注入/作用域隔离/持久化)
│   ├── persist.sh                # 💾 持久化 (ext.sh 钩子接管)
│   └── manifest.sh               # 📦 组件注册表 (声明式)
├── core/                         # 🧩 自研核心 (前端工程师重构的代码!)
│   ├── banner-engine.js          # 轮播引擎 (吸收 crx + fluent 精华, 重写)
│   ├── banner-style.css          # 轮播样式 (前缀隔离)
│   ├── loading-engine.js         # 加载动画
│   ├── theme-base.css            # 主题基座 (CSS 变量)
│   └── utils/
│       ├── emby-api.js           # API 通信 (BroadcastChannel 机制)
│       └── dom-utils.js          # DOM 工具
├── components/                   # 📦 组件 (按页面区域)
│   ├── home/                     # 【首页区】互斥, 引擎驱动
│   │   ├── banner-classic/       #   经典轮播 (4.8)
│   │   ├── banner-fluent/        #   Fluent 轮播 (4.8/4.9)
│   │   └── banner-minimal/       #   极简轮播 (4.9)
│   ├── themes/                   # 【主题区】可叠加, CSS 变量驱动
│   │   ├── appleglass/           #   毛玻璃
│   │   ├── minimal/              #   极简
│   │   └── dark-*/               #   暗色变量集
│   ├── features/                 # 【功能区】独立, IIFE 封装
│   │   ├── danmaku/  douban/  extrafanart/
│   │   ├── playbackrate/  localplayer/  embytool/
│   │   └── jav-details/
│   └── branding/                 # 【品牌区】Logo/Favicon
└── scripts/online-install.sh     # 在线安装
```

### 3.2 核心：自研轮播引擎（banner-engine.js）

```javascript
// 吸收 emby-crx 的注入机制 + Emby-Fluent 的健壮性, 重写为自研
(function () {
  'use strict';
  const NS = 'VanvyBanner';  // 唯一命名空间, 杜绝全局冲突

  class VanvyBanner {
    static start() {
      // 轮询检测首页 + 幂等 (命名空间标记, 不重复初始化)
      // 4.8/4.9 兼容: section0 不存在时标记第一个 verticalSection
    }
    static async loadItems() {
      // getItems: Recursive 全库, Backdrop+Logo 过滤
      // Promise.all 并行 + 失败项清理 + 10s 超时
    }
    static render() {
      // DOM 全部使用 .vanvy-banner-* 前缀 (不与任何主题冲突)
      // 幽灵克隆无缝滚动
    }
  }

  // IIFE 启动, 检测 Emby 环境
  if (window.Emby && document.querySelector('meta[name="application-name"]')) {
    VanvyBanner.start();
  }
})();
```

**为什么不会冲突**：
- ✅ 所有 DOM/CSS 类名加 `vanvy-` 前缀 → 不污染任何主题
- ✅ IIFE + 命名空间 → 无全局变量泄漏
- ✅ 幂等检测（`data-vanvy-banner="init"`）→ 重复注入不重复执行
- ✅ 版本适配层 → 4.8/4.9 各自选择器

### 3.3 主题系统（CSS 变量驱动，可叠加不打架）

```css
/* theme-base.css: 定义变量, 主题只改变量 */
:root {
  --vanvy-accent: #00a4dc;
  --vanvy-radius: 12px;
  --vanvy-glass: blur(18px) saturate(160%);
  --vanvy-card-hover: scale(1.05);
}

/* appleglass 主题: 只覆盖变量 + 自己的前缀规则 */
.vanvy-theme-appleglass { --vanvy-radius: 22px; --vanvy-glass: blur(22px) saturate(180%); }
.vanvy-theme-appleglass .card { border-radius: var(--vanvy-radius); }

/* minimal 主题: 只覆盖变量 */
.vanvy-theme-minimal { --vanvy-radius: 4px; --vanvy-glass: none; }
```

**为什么可叠加**：所有主题通过 `html.vanvy-theme-xxx` 作用域隔离 + CSS 变量驱动，**同时装多个只改变量不互相覆盖**。

### 3.4 部署引擎（依赖排序 + 作用域隔离）

```
manifest 声明:
  banner-classic:
    zone: home          ← 页面区域
    version: 4.8        ← 版本适配
    deps: [jquery, md5] ← 依赖
    files: [banner-engine.js, banner-style.css]

  appleglass:
    zone: theme         ← 主题区(可叠加)
    version: all
    deps: [theme-base]
    files: [appleglass.css]

引擎逻辑:
  1. 按 zone 分组 → 互斥区(首页)只选一个, 叠加区(主题)全选
  2. 依赖拓扑排序 → jquery 先于 banner-engine
  3. 注入 → 每个文件带作用域标记
  4. 验证 → 文件存在 + 版本特征 + (可选)页面实测
```

### 3.5 镜像体检引擎（前端的"看懂镜像"）

```
detect_image:
  amilys/embyserver → 开心版: 内置旧版crx + ext.sh 清parentId
  官方 emby/embyserver → 干净: 直接注入
  linuxserver/emby → 干净
  docker.vanvy.cc/... → 同 amilys

detect_builtin:
  index.html 有 emby-crx/main.js? → 旧版, 覆盖
  config.js parentId 被清? → ext.sh 接管
  danmaku.min.js? → 内置弹幕, 冲突检测
  ext.js? → 镜像扩展开关

输出"体检报告" → 自动推荐可用组件 + 标注需绕开的坑
```

---

## 四、业务流程（用户视角）

```
用户: bash install.sh
  │
  ├─ ① 识别容器 (自动/手动)
  ├─ ② 镜像体检 → 报告: [开心版 amilys 4.8] 内置旧版crx(将覆盖) ext.sh(将接管)
  ├─ ③ 版本识别 → 4.8 → 推荐轮播引擎
  ├─ ④ 方案推荐 (按版本+镜像, 自动排除冲突):
  │     🎠 首页美化: [1] 经典轮播(4.8) [2] Fluent轮播(4.8/4.9) [3] 极简轮播(4.9)
  │     🎨 主题(可多选): 毛玻璃/极简/暗色系
  │     ⚡ 功能(可多选): 弹幕/豆瓣/剧照/倍速/播放器
  │     🏷️ 品牌: Logo/Favicon
  ├─ ⑤ 用户选择 → 依赖排序 → 注入
  ├─ ⑥ 部署验证 → 每组件校验 (文件/md5/特征)
  └─ ⑦ 持久化 → ext.sh 钩子 (重建不丢)
```

---

## 五、开发计划（本地验证 → 验收 → 才上传）

| 阶段 | 内容 | 产出 |
|---|---|---|
| **P0 设计定稿** | 本方案主人确认 | 架构文档 |
| **P1 核心引擎** | lib/detect + engine + persist 重构 | 体检/部署/持久化 |
| **P2 自研前端** | core/banner-engine.js (重写) + theme-base.css | 轮播引擎 v1 |
| **P3 组件库** | home×3 + themes×4 + features×6 + branding | 全组件 |
| **P4 健壮性** | --reset + 全组件持久化 + 冲突回归 | 稳定版 |
| **P5 验收** | 三台真机全流程 → 报告给主人 → 才上传 | 验收通过 |

---

## 六、待主人确认

1. **思路确认**：解构重组、自研组件库（而非部署别人整个项目）——对吗？
2. **轮播风格**：经典（crx 风格）/ Fluent / 极简——先做哪个？还是全做？
3. **主题范围**：毛玻璃 + 极简 + 暗色系，够吗？
4. **自研程度**：核心引擎完全自研（重写），样式风格参考但代码重写——OK？
5. **项目名**：Emby 美化引擎？Vanvy Emby Kit？你定。

---

*附：8 个项目源码已下载到 `workspace/emby-research/`，可随时深入查看。*
