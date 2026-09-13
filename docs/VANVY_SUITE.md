# 🎬 Vanvy Emby Suite（VES）· 项目主文档

> 代号：**VES** ｜ 中文名：**虾子 Emby 美化套件**
> 定位：Emby 前端增强套件（首页 / 预热页 / 详情页 / 播放器 / 详情增强）
> 作者：虾子🦐 for Marnie✨✨🎊
> 创建：2026-09-10 ｜ 状态：**v0.4 Hero Takeover 已双容器部署并验证（2026-09-11 凌晨）**
>
> ✅ v0.4 解决核心痛点①（详情页结构对齐设计稿）+ 痛点②（菜单式安装器）→ 见 **第十章**

---

## 一、项目命名（2026-09-10 定，以免与历史项目混淆）

| 名字 | 用途 |
|---|---|
| **Vanvy Emby Suite (VES)** | 本套件的正式代号 |
| **vanvy-home** | 组件：首页满屏轮播 |
| **vanvy-loading** | 组件：预热加载页 |
| **vanvy-detail** | 组件：详情页增强 |

⚠️ **与历史项目区分**（重要，避免混淆）：

| 旧项目 | 是什么 | 与 VES 关系 |
|---|---|---|
| `emby-beautify`（旧） | 早期美化包，含一堆增强脚本**（各种 bug 源头）** | **VES 的宿主仓库**，但 VES 是重写，不继承其 bug |
| `emby-showcase` | 独立前端工程（试图重建前端） | **已废弃**（会丢原生功能） |
| `emby-kit / emby-kit-v2` | 早期主题套件 | 已废弃 |
| `Emby-Javascript-Details (EDE)` | **第三方参考项目**（详情页增强脚本集） | **参考不抄**，VES 重写其功能 |
| `bpking1/embyExternalUrl` | 第三方播放器项目 | VES 参考其协议逻辑 |

---

## 二、架构总览

```
VES (Vanvy Emby Suite)
├── components/home/banner_home/    vanvy-home   首页满屏轮播
├── components/loading/vanvy/       vanvy-loading 预热加载页
└── components/features/detail/     vanvy-detail  详情页增强
```

**统一设计原则**：
1. **注入式**：只改容器 `index.html`，追加 N 行 + 落位目录 → 可完全卸载
2. **原生零破坏**：只在原生 DOM 上**追加**，不重建 → 原生功能不丢
3. **命名空间隔离**：CSS 全 `.vd- / .vh- / .vl-` 作用域；JS 用 IIFE 闭包
4. **单一观察器**：一个 MutationObserver + 轮询，不用多个观察器互相打架
5. **失败降级**：全程 `try/catch`，出错只是"不增强"，页面照常用
6. **改前快照**：安装脚本自动备份 `index.html` 到 `.bak-vanvy-<TS>/`

---

## 三、开发过程时间线（2026-09-10）

| 时间 | 事件 |
|---|---|
| 15:16 | 主人要求：一步一步来，先用设计图/HTML 看效果 |
| 15:23 | 首页要求：满屏轮播 + 自适应设备 |
| 15:29 | 主人 4 疑问：跨版本/背景可调/横版卡片/每库轮播 |
| 15:41 | 指定用 **emby-302** 测试 |
| 16:04 | 预热加载页 → 4 款设计稿 → 选 A |
| 16:26 | 文案按服务器名 / 品牌 LOGO / favicon 可换 |
| 16:32 | ①预热页要真预加载 ②去掉背景遮罩 |
| 16:41 | 手机端标签与原生标签重叠 → 动态测量修复 |
| 16:47→16:56 | 配色系统 → 改为部署时选 → 新增黑金 |
| 17:06 | 主人要求记录开发+部署方式 |
| 17:17 | 「JAV」= **EDE 项目**（详情页增强），参考不抄 |
| 17:25 | 详情页设计稿 v1 |
| 17:32 | 播放器要真 logo + 旧版交互 |
| 17:36→17:38 | JAV 区改条件模块；用 emby-18 测 |
| 17:46→17:49 | 毛玻璃；图标模式/默认弱/EDE 功能补齐 |
| 17:57 | 归档文档 |
| 17:58 | **开始完全体开发** |
| 19:51 | 主人问部署方式 → 出一键安装器 |
| 19:57 | ⚠️ 主人：真机与设计稿不一致（**位置 bug**） |
| 20:10 | ⚠️ 主人报 5 个 bug |
| 20:25 | ⚠️ 主人：布局太紧凑（**重叠 bug**） |
| 20:49 | 会话压缩中断 |
| 21:01 | 主人：记录开发过程+避坑；**给项目命名** |

---

## 四、🔴 避坑说明（血泪清单）

### 4.1 Emby 前端坑

| # | 坑 | 现象 | 解法 |
|---|---|---|---|
| 1 | **全局 `$` 是 jQuery** | 组件里 `$('.x')` 返回 jQuery 对象（无 `classList`）→ 挂载失败 | IIFE 内 `var $ = document.querySelector.bind(document)` **遮蔽** |
| 2 | **Emby 用 CSS `order` 排版** | 注入块默认 `order:0` → 被排到**最前**（原生按钮上方） | `host.style.order = getComputedStyle(原生按钮).order` |
| 3 | **详情页字段在右侧窄列** | 注入块宽 915，下方区块宽 1362 → 不对齐 | 挂到 **`.details-additionalContent`**（全宽容器） |
| 4 | **全宽会压住海报** | 海报 `x292 y80 h492`，全宽块 `y354` → 压住下半 | 放到海报**下方**的全宽容器，不在按钮后 |
| 5 | **服务端注释非 index.html 的 `<script>`** | 容器内自测页 JS 不执行（`<!--<script>-->`） | 本地 harness 或直接验证 index.html |
| 6 | **手机端原生标签是独立元素** | 不在 `.skinHeader`，按顶栏算位置会重叠 | 实测 `.tabs-viewmenubar` 底边 + 动态重测 |
| 7 | **4.9 移除了 `homesections`** | 首页 DOM 有差异 | 双选择器 + 运行时探测 |
| 8 | **4.9 导航 API 变了** | 4.8 `appRouter.showItem`；4.9 **`Emby.Page.showItem`** | 两路都试 |
| 9 | **伪造登录态无效** | 手工写 `servercredentials3` 不生效（启动不 apply） | 必须走真实登录流程 |
| 10 | **服务端名两个来源不一致** | `System/Info/Public.ServerName` vs HTML `<title>` | 优先凭据里的 Name |
| 11 | **`_serverAddress` 已含 `/emby`** | 拼出 `/emby/emby/videos/...` | `.replace(/\/$/,'')` 后再拼 `/videos/` |
| 12 | **`getSimilarItems` 调用 500** | API 签名不符 | 改 `Items/{id}/Similar?UserId=` |

### 4.2 组件自身坑

| # | 坑 | 现象 | 解法 |
|---|---|---|---|
| 13 | **init 在登录前抛异常** | 整个 init 中断 → 轮询不启动 → 永不挂载 | **先起轮询**再 try/catch 取数 |
| 14 | **mount 并发竞态** | 两次 tick 同时通过守卫 → 重复挂载（播放器 6→12） | 加 `state.mounting` **同步锁** + DOM 守卫 |
| 15 | **首页不贴顶** | `.sections` 有 `padded-top-page` 内边距（131px） | 挂载时抵消 `paddingTop` |
| 16 | **预热页白做（卡顿）** | 撤得早，轮播还没渲染 | 等 `window.__VANVY_HOME_READY__` 再撤 |
| 17 | **背景太花** | 横向重压暗渐变 | 删；改 `backdrop-filter` 毛玻璃 |

### 4.3 验证方法坑

| # | 坑 | 解法 |
|---|---|---|
| 18 | **视觉模型会看错颜色** | 它把 Emby 原生旧色当主题色 → **改用 `computedStyle` + 截图像素采样** |
| 19 | **视觉模型会夸大布局问题** | 必须**用矩形测量**核实（`getBoundingClientRect` + 重叠面积计算） |
| 20 | **内网访问必须绕代理** | `curl --noproxy '*'` / Playwright `--no-proxy-server` |
| 21 | **跨服务器 item id 不通用** | 用错 id → 路由跳回首页。**必须用本容器自己的 id** |
| 22 | **Playwright 登录 Emby** | 4.8 是**用户卡片** → 点卡片 → 密码框；`storage_state` 可复用 |

---

## 五、🎯 核心症结（2026-09-10 22:12 / 22:35 主人两次点明）

### 5.0 主人的原话（最重要，别丢）

> 22:12 "**主要是你正经库和小姐姐库的详情页和你参考的 html 效果都不一样**"
> 22:35 "**我的意思是你详情页完全跑偏了，实际部署上的和你给我参考的 html 结构都不一样！**
> 你参考是：`.../mockup/detail/` 和 `.../mockup/detail-jav/`
> 但是实际你部署出来的完全不是这个样式！**"

**⚠️ 结论：主人要的是"把详情页做成设计稿那个样子"，不是"在原页面上加几块"。**
我之前的理解错了 —— 我以为可以"增强式"慢慢逼近，但主人明确要的是**结构一致**。

### 5.0.1 参考基准（必须对齐这两个页面）

| 页面 | URL | 结构 |
|---|---|---|
| 正经库设计稿 | `https://github.com/micimo13/emby-beautifydetail/` | 满屏 hero + 海报左/标题右 + CTA + 播放器条 + 内容行 |
| 小姐姐库设计稿 | `https://github.com/micimo13/emby-beautifydetail-jav/` | 同上 + AV 资料卡（番号/标签/演员/外链） |

**下次开发目标 = 让真实部署的结构与这两个 HTML 一致**，而不是"接近"。

---

> 主人："**主要是你正经库和小姐姐库的详情页和你参考的 html 效果都不一样**"

这是**最核心的问题**，其他都是衍生。根因如下：

### 5.1 结构性差异（实测对比，非主观）

| 维度 | 设计稿（HTML mockup） | 实际部署（注入 Emby） |
|---|---|---|
| 左侧栏 | **无** | **有**（Emby 原生导航侧栏） |
| 背景 | **满屏 full-bleed** 大图 | 原生 backdrop（半透明，非全屏） |
| 海报位置 | **左侧** | 原生位置（偏中） |
| 标题位置 | 海报**右侧** | 海报**上方**（原生结构） |
| 首屏构成 | 海报+标题+简介+按钮 **浮在大图上** | 原生字段流 + 我的块**追加在下方** |
| 整体感 | 独立设计页（editorial 感） | 原生 IMDB 式详情页 |

### 5.2 根因一句话

> **设计稿是"独立整页"，部署是"往 Emby 原生骨架里塞块"。**
> 骨架不同（侧栏/字段流/顺序都是 Emby 的），所以**永远不可能长得一样**。

### 5.3 三条路（必须选一条，否则无法解决）

| 方案 | 做法 | 得到设计稿效果？ | 代价 |
|---|---|---|---|
| **A 增强式**（当前） | 保留原生骨架，追加模块 | ❌ 不可能 | 零风险，功能全保 |
| **B 接管式** | 详情页整个替换成设计稿 hero | ✅ 可以 | **原生功能要全部重做**（播放/收藏/预告/分季/合集/演员…），风险高、易出 bug |
| **C 折中·Hero 重做**（推荐） | **保留原生功能**，但把**顶部区域**重建成 hero：满屏大图 + 毛玻璃 + 海报/标题/按钮浮层；**详情页隐藏侧栏**；下面原生字段流保留 | ✅ 大部分 | 中风险，需处理原生元素重排 |

**关键决策点**：要不要为了"像设计稿"而**重排/隐藏原生元素**（侧栏、原生字段流）？
- 若**要** → 走 C（甚至 B）
- 若**不要** → 只能接受"增强式"，样子就是现在这样

---

### 5.4 ⚠️ 部署交互差距（22:35 主人点明）

> 主人："**部署脚本根本就没有让用户选择的部署选项，和以前我们项目的部署交互逻辑都不一样，用户都不知道部署的是啥**"

**老项目（emby-beautify）的部署交互**（多级菜单 + 自动推荐）：
```
pick_package    → 选组件包（观影包/美化包/自定义…）
pick_style      → 选轮播风格（自动推荐 + 手动选）
pick_theme_color→ 选主题色（6 色）
pick_themes     → 主题多选（1,2,3；毛玻璃互斥）
pick_loading    → 预热加载（独立选择，提示"多选仅首个生效"）
pick_features   → 功能多选（如 1,3,5）
  + 品牌 LOGO / favicon 输入
  + 内网直连源探测 / 多源下载校验 / 兜底换源
```

**我的实现（vanvy-detail-install.sh）—— 差距巨大**：
- 只有：选容器 → 选配色（1-6）
- ❌ 没有功能多选（播放器/JAV/毛玻璃/内容区 不能单独开关）
- ❌ 没有"当前配置预览"，用户不知道装了啥
- ❌ 没有分步确认 / 安装摘要

**下次要做**：对齐老项目的菜单式交互，至少包含：
1. 选容器
2. **功能多选**（第三方播放器 / JAV增强 / 毛玻璃 / 剧照 / 演员作品 / 类似推荐 / 全屏查看器）
3. 配色选择
4. 影响参数（毛玻璃强度、每行卡片数…）
5. **安装摘要确认**（"将安装：xxx / 主题：xxx / 请确认"）


## 六、❗ 主人尚未满意的点（下次一起开发）

> 主人 21:01：**"还是有很多不满意的地方，下次一起开发"**

| # | 不满意点 | 状态 | 备注 |
|---|---|---|---|
| 1 | **两个库详情页结构 ≠ 参考 HTML**（核心！） | ❌ 未解决 | 主人要**结构一致**（非"接近"）；详见 **5.0 / 5.1** |
| 1b | **部署脚本无选择交互** | ❌ 未解决 | 要像老项目那样**菜单式**：功能多选+配色+摘要确认；详见 **5.4** |
| 2 | **真机与设计稿观感差距** | ⚠️ 部分 | "布局/容器排列"设计稿更合理，真机偏紧凑（已放宽间距，仍待主人验收） |
| 3 | **JAV 区容器无法收起** | ⚠️ 外链已可折叠 | JAV 整块是否也要整体折叠/展开待定 |
| 4 | **播放器调用实测未验收** | ⏳ | 已实现真实调用，但主人未在真机确认（可能仍有型号点不动） |
| 5 | **全屏剧照查看器** | ❌ 未做 | EDE 有此功能 |
| 6 | **系列更多作品** | ⚠️ 部分 | 有"演员其他作品"，缺"同系列" |
| 7 | **JavDB 短评** | ❌ 未接入 | 需登录态 |
| 8 | **整体精细度** | ⚠️ | 主人要"完全体"，当前为 v0.3 |

---

## 七、部署速查

```bash
# 在线一键（UNRAID 上跑）
bash <(curl -sL https://github.com/micimo13/emby-beautify/vanvy-detail-install.sh)

# 非交互
CONTAINER=emby-18 THEME=blackgold bash <(curl -sL .../vanvy-detail-install.sh)

# 卸载
CONTAINER=emby-18 bash <(curl -sL .../vanvy-detail-install.sh) --uninstall
```

| 容器 | 版本 | 库 | VES 状态 |
|---|---|---|---|
| emby-18 | 4.8.11 | 小电影库 | ✅ JAV 区显示 |
| emby-302 | 4.9.5 | 正经库 | ✅ JAV 区不显示（智能路由） |

**配置**（容器内 `vanvy-detail/config.js`，改完强刷）：
```js
window.VANVY_DETAIL_CONFIG = {
  theme:'blackgold', frostBlur:10, frostTint:0.42,
  showPlayers:true, showJav:true, javAutoRoute:true, playersOnlyOS:true
};
```

---

## 八、分发包

| 文件 | 地址 |
|---|---|
| 组件包 | `https://github.com/micimo13/emby-beautify/vanvy-detail.tar.gz` |
| 安装器 | `https://github.com/micimo13/emby-beautify/vanvy-detail-install.sh` |
| 本地分发目录 | `/vol1/1001/web/`（飞牛） |

---

## 九、相关文档索引

- `docs/VANVY_HOME_LOADING.md` — 首页轮播 + 预热页 开发/部署
- `docs/VANVY_DETAIL.md` — 详情页 开发/部署 + 智能路由
- `docs/DEPLOY_DETAIL.md` — 详情页部署手册
- `docs/RESEARCH_DETAIL_JAV_PLAYER.md` — 调研 + EDE 方向更正
- `docs/design/detail/` — 设计稿源码归档

---

## 十、🚀 v0.4 · Hero Takeover 交付（2026-09-11 凌晨）

> 执行：虾子🦐 ｜ 依据 `WORKORDER_20260911.md`
> 目标：详情页【结构】对齐设计稿 + 菜单式安装器 + 双容器完整部署

### 10.1 核心改动：详情页从「增强式」→「Hero 接管」

**旧做法（v0.3，跑偏）**：保留 Emby 原生骨架（侧栏 + 原生字段流 + 海报/标题），仅在下方追加块 → 永远不像设计稿。

**新做法（v0.4，结构对齐）**：
1. 进入详情页 → 追加 `body.vanvy-detail-active`
2. **隐藏原生顶部字段流**（`.topDetailsContainer` → `.vd-native-top-hidden`，`display:none`）
3. **自建 hero**（`.vd-hero > .vd-hero-in`）：海报左 + 标题右 + 元数据 + 简介 + CTA
4. **满屏 full-bleed 背景**：`#vd-hero-bg`（`position:fixed; inset:0`）+ `.vd-hero-veil` 渐隐遮罩；隐藏原生 `.backdropContainer`
5. **侧栏玻璃化**：`.mainDrawer` 透明 + `backdrop-filter: blur(18px)`，导航仍可用
6. **CTA 保功能**：播放/更多/标记已看 → 转发点击原生按钮（`.btnResume/.btnPlay/.btnMoreCommands/.btnPlaystate`）；收藏 → `ApiClient.updateFavorite`
7. **原生内容保留**：剧集/分季/演员/更多信息等原生区块仍在 hero 下方（零破坏）

> ⚠️ 关键坑（本次新增）：
> - **不可把 `.itemView` 的 `position:absolute` 改成 `relative`** → 会触发水平溢出（body 宽 1838 > 1600）。只加 `z-index` 抬升即可。
> - hero 背景用 `position:fixed` 层，避免被 `.itemMainScrollSlider` 的 `overflow` 裁剪。

### 10.2 实测结构数据（Playwright `getBoundingClientRect`，1600×1000）

| 指标 | emby-18（小姐姐库） | emby-302（正经库） | 判定 |
|---|---|---|---|
| hero | ✅ | ✅ | 设计稿结构 |
| 海报 rect | x294 y234 232×347 | x294 y318 232×347 | **海报左** |
| 标题 rect | x566 y162 902×194 | x566 y376 902×65 | **标题右** |
| 原生顶部 | `display:none` | `display:none` | 已隐藏 |
| 满屏背景层 | ✅ `#vd-hero-bg`(fixed) | ✅ | full-bleed |
| 侧栏 | 透明 + blur(18px) | 同 | 玻璃化 |
| CTA | 立即播放/收藏/标记已看/更多 | 同 | 保功能 |
| 第三方播放器 | 6 款（Windows OS 过滤） | 6 款 | 15 款真 logo |
| JAV 卡 | ✅ 显示（10 标签/8 外链） | ❌ 不显示 | **智能路由正确** |
| 内容行 | 剧照 12 张 · 演员其他作品 12 部 | 剧照 · 更多类似 | ✅ |
| 坏图 | 0 | 0 | ✅ |
| 水平溢出 | 无（scrollW=1600） | 无 | ✅ |

功能验证（注入探针）：
- 点「立即播放」→ 原生 `.btnPlay` 触发 ✅
- 点「更多」→ 原生 `.btnMoreCommands` 触发 ✅
- 点「收藏」→ `ApiClient.updateFavorite(971470, true)` 触发，文案变「已收藏」✅
- 点 VLC → `vlc://…/videos/971470/stream.mp4?api_key=…` 真实拉起 ✅
- 剧集页（【我推的孩子】）→ 原生 `.seriesItemsSection`（分集）+ `.peopleSection` 保留在 hero 下方 ✅
- 首页轮播：1600×1000 满屏、`__VANVY_HOME_READY__` ✅、坏图 0
- 移动端 390×844：hero 正常、海报 119×178、无溢出、坏图 0

### 10.3 菜单式统一安装器 `install-ves.sh`

对齐老项目交互，6 步：
```
① 自动列出 emby 容器 → 选择
② 功能多选：1 预热页 / 2 首页轮播 / 3 详情页Hero / 4 第三方播放器 / 5 JAV增强 / 6 毛玻璃
   （4/5/6 自动依赖 3）
③ 配色 10 套（aurora…graphite）
④ 参数：毛玻璃强度（关/弱/中/强）、每行卡片数
⑤ 安装摘要确认（容器/功能/配色/参数）
⑥ 执行：快照 → 逐组件部署 → 写 config.js
```
非交互：`bash install-ves.sh --container emby-302 --features 1,2,3,4,5,6 --theme aurora --frost weak --perrow 6 --yes`
卸载：`bash install-ves.sh --container emby-302 --uninstall`

分发：`https://github.com/micimo13/emby-beautify/install-ves.sh` ｜ 部署助手 `scripts/ves_deploy.sh`（打包送到 UNRAID 并执行）

### 10.4 双容器部署状态（2026-09-11 02:1x）

| 容器 | 版本 | 库 | 预热页 | 轮播 | 详情Hero | 播放器 | JAV | 毛玻璃 | 主题 |
|---|---|---|---|---|---|---|---|---|---|
| emby-18 | 4.8.11 | 小姐姐库 | ✅ 18+LOGO | ✅ | ✅ | ✅ | ✅ 显示 | ✅ 弱 |
| emby-302 | 4.8.11 | 正经库 | ✅ VANVY LOGO | ✅ | ✅ | ✅ | ✅ 不显示 | ✅ 弱 | aurora |

### 10.5 v0.4 仍待完善（诚实清单）

- ⚠️ **侧栏保留**（玻璃化）而非「完全移除」：彻底移除需重排 Emby 绝对定位页面容器 + 处理导航入口，风险高，未做。
- ⚠️ 首屏 hero 高 `100svh-80`，JAV 卡较长时 hero 会超过一屏（内容行需下滑）。
- ⚠️ 剧集「分季 tabs」未单独定制（沿用原生）。
- ⚠️ 全屏剧照查看器、JavDB 短评、系列更多作品 仍未做（v0.3 遗留）。
- ⚠️ 4.10 未测（无实例）。

---

## 十一、🔧 v0.5 · 设计稿细节对齐（2026-09-11 早 · 主人反馈后）

> 触发：主人 08:05 反馈「还是不对吧」——详情页与设计稿仍有明显差异。

### 11.1 修复项（对照主人 3 条）

| # | 主人反馈 | 根因 | 修复 |
|---|---|---|---|
| 1 | 剧照/更多类似等**容器贴浏览器边缘** | 注入块落在 `.details-additionalContent`（宽 1362，无左右留白），右缘直达视口 1600 | `.vd-sections-host` 加 **版心**：`max-width:1500px; margin:0 auto; padding:0 clamp(18px,4vw,56px)` → 行内容 238→294 起，右缘 1600→1544 |
| 2 | **演员头像设计稿是圆的**，实际是 Emby 原生 | 原生 `.peopleSection`（方形头像）未隐藏，且无我们自己的演员行 | ① 隐藏 `body.vanvy-detail-active .peopleSection`；② 新增**圆形头像**演员/导演行（`.vd-acard .vd-av{border-radius:50%}`） |
| 3 | **标题旁标签样式不同** + JAV 增强没吃透 | hero 面包屑写死「电影 · MOVIE」，无番号徽标；JAV 卡缺评论/合集/导演/预告片 | ① JAV hero：面包屑「🔞 JAV · AV 影片」+ **番号大字 + 徽标**（番号已识别 / 数据源 / JP-18+）；② JAV 卡补：**导演**字段、**JavDB 短评**区、**加入合集**、翻译标题、刷新数据 |

### 11.2 新增能力

- **演员/导演行**（圆形头像，点击进人物页）— 正经库
- **预告片行**（Emby RemoteTrailers → YouTube 缩略图卡片，点击打开）
- **更多推荐行**（JAV：同系列/同标签；正经库：更多类似）
- **JAV 卡增强**：
  - 动作条：复制番号 / 复制路径 / **翻译标题**(Google gtx) / **刷新数据**(Emby itemRefresh) / **加入合集**
  - 字段：番号/发行/片长/片商/系列/评分/**导演**
  - **JavDB 短评**区（无凭据时给入口链接；配置 `javdbReviewsUrl` 后可接代理数据）
  - **MetaTube 本地引擎接入**（`metaTubeBase`，默认 `http://192.168.1.10:28080`）：补全 导演/片商/系列/评分，若有 `preview_video_url` 则出预告片行
- **加入合集弹窗**：列出已有合集 → 点击加入；或新建合集并加入（Emby Collections API）

### 11.3 实测（Playwright getBoundingClientRect，1600×1000）

| 指标 | emby-302（正经库） | emby-18（小姐姐库） |
|---|---|---|
| 行内容 rect | x294 → right 1544（**不再贴边**） | x294 → right 1544 |
| 演员头像 | `.vd-av` 137×137 · `border-radius:50%` ✅ 圆形 | JAV 卡演员卡（圆角矩形，对齐设计稿 `.actor`） |
| 原生 peopleSection | `display:none` ✅ | `display:none` ✅ |
| hero 面包屑 | 电影 · MOVIE · R | 🔞 JAV · AV 影片 |
| 标题旁徽标 | — | 番号 + 番号已识别 + 数据源：JavBus + JP-18+ |
| 内容行 | 剧照 / 演员·导演 / 预告片 / 更多类似 | 剧照 / 更多推荐 |
| JAV 短评区 | — | ✅「短评需登录 JavDB 获取 · 到 JavDB 查看」 |
| JS 报错 | 0（组件自身） | 0（组件自身） |

### 11.4 ⚠️ 仍待完善（诚实清单）

- **JAV 预告片**：当前 MetaTube 服务器（JavBus/JAV321/DUGA）`preview_video_url` 为空，故无片源 → 行会自动出现（有数据时）。真正的 JAV 预览片源需接 **JavDB（需登录）** 或 FANZA/DMM。
- **JavDB 短评**：真实短评需登录凭据（EDE 用 `javdbSecretKey`）。现给入口；配置 `javdbReviewsUrl` 代理即可填充。
- 侧栏仍为「玻璃化保留」（未彻底移除）。
- 全屏剧照查看器未做。

---

## 十二、🔧 v0.6 · 第二轮反馈修复（2026-09-11 早）

> 主人 08:38 四点：
> ① 剧集的「播出季/季文件夹」应在「剧照」**上面**（滚动到详情先看季）
> ② 详情页点「更多」弹框跑到**左上角**，没跟随按钮
> ③ 标题只有文字，**缺 Emby 原生 LOGO**，要加徽标显示区
> ④ **剧照不能点开看大图**

### 12.1 修复

| # | 根因 | 修复 |
|---|---|---|
| ① | 注入区 `vd-sections-host` 被插到 `.details-additionalContent` **最前面** | 改为插到 `.seriesItemsSection`（播出季/分集）**之后** → 顺序：hero → 播出季 → 剧照 → 演员… |
| ② | 直接 click 隐藏的原生 `.btnMoreCommands`（rect 0,0）→ actionsheet 锚点 = 左上角 | 改用 Emby 原生 `itemcontextmenu.show({items:[item], positionTo: 我们的按钮, positionX:'after', positionY:'center', transformOrigin:'left top'})`；失败才回退原生点击 |
| ③ | hero 只渲染文字标题，未用 `ImageTags.Logo` | 新增 `.vd-logo` 显示区（`/Images/Logo`，max-h 104px），有 Logo 时正文标题降级半级 |
| ④ | 剧照只是 `<span class="vd-still">` 无交互 | 新增 **Lightbox** 查看器：点击放大、左右箭头/方向键翻页、Esc/点背景关闭、计数「n / N」 |

### 12.2 实测（Playwright，1600×1000）

| 指标 | emby-302（剧集 500204） | emby-18（JAV 971494） |
|---|---|---|
| 播出季 y / 剧照 y | **1090 / 1478**（季在剧照上）✅ | — （无季，剧照 1537） |
| 内容行 | 剧照 / 演员·导演 / 预告片 / 更多类似 | 剧照 / 更多推荐 |
| Logo | ✅ 98px 真实加载 | 无 Logo（JAV 条目无图） |
| 演员头像 | border-radius 50% ✅ | 无（JAV 隐藏 peopleSection） |
| 「更多」弹框 | btn x976 → sheet x**1078** y380 ✅ 跟随按钮 | btn x976 → sheet x**1078** y448 ✅ |
| 剧照 Lightbox | ✅「1 / 5」1472px | ✅「1 / 6」800px |
| 水平溢出 | 无（scrollW 1600） | 无 |
| 卸载残留 | 已修（uninstall 漏删 `vanvy-detail/config.js` 行）✅ | 同 |

### 12.3 实现要点（备查）

- **锚点弹菜单**：`itemcontextmenu.show()` → 内部 `getCommands(options)` + `actionsheet.show()` → `dialoghelper.getPosition(options.positionTo)` 用 `positionTo.getBoundingClientRect()` 定位；故只需把**我们自己的按钮元素**传进去即可，无需动隐藏的原生容器。
- **注入区插入锚点**：`addc.insertBefore(host, seriesItemsSection.nextSibling)`，否则回退 `addc.firstChild`。

---

## 十三、🔧 v0.7 · 第三轮反馈（2026-09-11 上午）

> 主人 09:45 七条。

### 13.1 修复

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | **emby-302 预热页/轮播/LOGO 全没了** | 我早前 uninstall 测试后重装时只带 `--features 3,4,5,6`，**漏了 1(预热) 2(轮播)** | 重新按 `--features 1,2,3,4,5,6` 部署，预热页+满屏轮播+专属 LOGO 全部回归 |
| 2 | 文字标题与 LOGO 不协调 | 大号 `h1` 与 LOGO 抢视觉 | 去掉大标题，改成**面包屑一行内的小容器标题**（`.vd-title-chip`，13.5px），配色/布局与元数据行一致 |
| 3 | 预告片跳新标签 | 原来是 `<a target="_blank">` | 改**页内弹框播放**（YouTube→iframe embed / 直链→video 标签），Esc 或点背景关闭，关闭时清 src 停止播放 |
| 4 | emby-18 首屏「当前设备…」溢出 | hero `min-height:100svh` + 海报 230px + 简介 3 行 | JAV 专属压缩：`min-height:0`、海报 clamp(128,12vw,172)、简介 2 行、间距收紧 → 1366×768 下播放器行底 **602→524** |
| 5 | 内容标签应可收起（默认收起）且在演员下方 | 原为常显、在演员上方 | 调整 DOM 顺序（演员→内容标签），标签加 `.collapsed`（默认收起）+「展开/收起」开关 |
| 6 | JAV 演员需可点开作品列表 | 原来只跳演员页 | 改为**容器内展开**作品面板，两个 Tab：**已入库**（Emby PersonIds）+ **JavDB 全部作品**（AVDB 本地引擎），并给 JavDB 演员页外链看完整列表 |
| 7 | 详情页背景要浅毛玻璃 | hero 背景图无模糊 | `.vd-hero-bg { filter: blur(var(--vd-bg-blur,6px)) saturate(108%); transform:scale(1.06) }`，6px 轻模糊，veil 同步减淡 |

### 13.2 新增外部数据源（AVDB 本地引擎）

- 服务：`http://192.168.1.10:38000`（AVDB / 媒体资源库 Web）
- 鉴权：`X-API-Key: ********`（来自容器 `token` 表 `my_apikey`）
- CORS：`Access-Control-Allow-Origin: *` → 浏览器可直连
- 用到的端点：`/api/v1/javdb/search?q=&type=movie|actor`
- ⚠️ 说明：JavDB **没有**开放演员作品列表端点（`actors/{id}/collection` 只做收藏/取消）。故「全部作品」= 按演员名的 JavDB 搜索（相关性排序），并在页脚提供演员主页外链看权威完整列表。

### 13.3 实测（Playwright）

| 项 | 结果 |
|---|---|
| 302 标题 | 大标题已移除，chip="森林深处"，crumb="电影 · MOVIE · R" ✅ |
| 302 LOGO | 103px 加载 ✅ |
| 背景模糊 | `blur(6px) saturate(1.08)` ✅ |
| 预告片弹框 | 302《森林深处》点卡片 → iframe `youtube.com/embed/_TRSvK-Omwc`，Esc 关闭 ✅ |
| 内容标签 | collapsed=true + 可展开 ✅ |
| 演员顺序 | 演员(962) 在 内容标签(1109) 之上 ✅ |
| 演员作品 | Tab「已入库 / JavDB 全部作品」；JavDB 24 条 + 主页外链 ✅ |
| emby-18 首屏 | 1366×768 播放器行 bottom=524 ✅ |
| 预热/轮播 | emby-302 index.html 已含 vanvy-loading + vanvy-home + vanvy-detail ✅ |

---

## 十四、🔧 v1.0 · 第五轮反馈（2026-09-11 上午）

> 主人 10:40 五条。**核心发现：`body.vanvy-detail-active` 硬编码了 `--vd-acc`，把 JS 写到 `<html>` 的主题变量覆盖 → 所有主题都显示金色。**

### 14.1 修复

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 「电影 · MOVIE · PG-13」文字没跟主题强调色 | `body.vanvy-detail-active{--vd-acc:#e8c66a}` 覆盖了 JS 写到 `documentElement` 的主题色 | 从 body 规则移除 `--vd-acc/--vd-acc2/--vd-bg`，改到 `:root` 兜底；实测 302=#3ea6ff(蓝)/18=#e8c66a(金) |
| 2 | 首屏没到「当前设备」行结束 | hero-in 缺 `box-sizing:border-box` → min-height 变成 content-box，多出 padding 高度；且 JAV 卡在 hero 内 | ① 加 `box-sizing:border-box`；② **JAV 资料卡移出 hero，放到下滑区首位**（`ensureSectionsHost`+prepend）；③ 收敛 padding/gap/海报/LOGO 尺寸 → 首屏正好 100vh-80=920px |
| 3 | 演员作品需滑杆滚动条 + 查看全部 | 只有普通横向滚动 | 作品条下方加 range **滑杆**（↔ scrollLeft 双向联动 + ResizeObserver 自适应），页脚加「查看全部作品 ›」按钮 → JavDB 演员页 |
| 4 | JavDB 作品图不显示 | ① 图床 `tp.spfcas.com` 大陆不可达；② 就算代理回来，**文件是被混淆的非标准数据**（无 FF D8 FF 头） | 改用 **AVDB 本地引擎 `/api/v1/img-proxy/?url=`**（能解码混淆图、无需鉴权），再经公网 `/vdimg/` 前缀分发 |
| 5 | JavDB 短评需登录 | 之前实现依赖 `javdbReviewsUrl` 空模板 | 改用 AVDB `/api/v1/javdb/movies/{id}/reviews`（**公开短评，无需登录**）；番号→JavDB id 用本地 search 解析 |

### 14.2 新增基础设施（关键）

**图片代理链路**（解决「图床被墙 + 数据混淆」双难题）：
```
浏览器 → https://github.com/micimo13/emby-beautify/vdimg/i?u=<enc>
      → 飞牛 nginx(容器 emby-beautify-web, /vdimg/ 前缀反代)
      → 127.0.0.1:18098 img_proxy.py（白名单/缓存7天/HTTPS+去nosniff）
      → AVDB 192.168.1.10:38000/api/v1/img-proxy/?url=  ← 解码混淆图
```
- `scripts/img_proxy.py`：优先走 AVDB 图代理，失败回退直连/SOCKS5；按魔数嗅探真实类型（**不能带 X-Content-Type-Options:nosniff**，否则浏览器拒渲染 octet-stream）
- `scripts/vdimg_ensure.sh`：容器被重建后自动重新注入 nginx `/vdimg/` location（每 5 分钟）
- `emby-beautify/nginx/default.conf`：容器内 nginx 配置快照（已插入 /vdimg/）
- 两个 crontab 保活：`img_proxy.py`（进程）+ `vdimg_ensure.sh`（nginx 前缀）

### 14.3 实测（Playwright, 1600×1000）

| 项 | 302(正经库) | 18(JAV库) |
|---|---|---|
| 主题强调色 | #3ea6ff 蓝 ✅ | #e8c66a 金 ✅ |
| 首屏 heroBottom | 1000（正好一屏）✅ | 1000 ✅ |
| 「当前设备」行底 | 966 ✅ | 982 ✅ |
| 下滑区起始 | 1040 ✅ | JAV卡 1030 ✅ |
| JAV 卡位置 | — | 下滑区首位（可收起）✅ |
| 短评 | — | 真实 JavDB 短评(SSIS-910) ✅ |
| 图片 | — | 14/24 加载(其余懒加载) ✅ |
| 滑杆/查看全部 | — | max=3624 / 按钮 ✅ |

---

## 十五、🔧 v1.1 · 第六轮反馈（2026-09-11 中午）

> 六条。**核心 bug 根因：`.topDetailsContainer` 被整块 `display:none`，而季页面的剧集列表 `.trackList` 正好在它内部 → 剧集被一起干掉。**

### 15.1 修复

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 季页面没有剧集列表 | CSS `body.vanvy-detail-active .topDetailsContainer.vd-native-top-hidden{display:none!important}` 把整块隐藏；但结构是 `topDetailsContainer > topDetailsMain > detailMainContainerParent > { detailMainContainer(海报/信息), trackList(剧集) }` | 只隐藏 `.item-fixed-side` 和 `.detailMainContainer`，**保留 `.trackList`** |
| 2 | 首屏没到「当前设备」行就换页 | hero `min-height:calc(100svh - 80px)` 硬编码 80px 顶栏；实际顶栏更高时内容溢出 | 新增 `fitHero()`：按 `window.innerHeight - 滚动容器顶部坐标 - hero偏移` 动态设 min-height，resize 重算 → 1600×900 实测 heroBottom=900，当前设备行 868/882 |
| 3 | JAV 需每段都能收起/展开 | 只有整卡一个开关 | 新增 `collapseSections()`：把每个 `.vd-subh` 及后续内容包成 `.vd-sec`，点击标题单独收起；共 5 段（影片信息/演员/内容标签/外部站点/JavDB短评） |
| 4 | 演员作品交互难用 | 点作品走本地搜索 | JavDB 卡片 → `javdb.com/v/<id>` **新标签**；库内卡片 → Emby 作品页；两个 tab 各加「查看全部库内作品 ›」(→Emby person) / 「查看全部作品 ›」(→JavDB actor) |
| 5 | JavDB 作品卡片应横向 | 卡是 2:3 竖版，图是 800×538 横版 | `.vd-jcard` 改 `aspect-ratio:16/10` + 宽度 clamp(196,19vw,284) → 实测 230×167 横版（与源图 800×538 一致） |
| 6 | 302 用了蓝色 | 部署时传了 `--theme aurora` | 两个容器统一 `--theme blackgold`，实测 crumb `rgb(232,198,106)` 金 |

### 15.2 实测（Playwright, 1600×900）

| 项 | emby-302 | emby-18 |
|---|---|---|
| 强调色 | #e8c66a 金 ✅ | #e8c66a 金 ✅ |
| 首屏 heroBottom | 900（正好一屏）✅ | 900 ✅ |
| 「当前设备」行底 | 868 ✅ | 882 ✅ |
| 季页面剧集 | `trackList` 5660px 可见 · 「母与子」在 ✅ | — |
| JAV 分段收起 | — | 5 段，点击可单独收起 ✅ |
| JavDB 卡片 | — | 24 张 · 230×167 横版 ✅ |
| 查看全部按钮 | — | 库内→person/742952 · 库外→actors/p50Z ✅ |

git: 见提交 | 分发: /vol1/1001/web/{install-ves.sh,vanvy-detail.tar.gz}

---

## 十六、🔧 v1.2 · 第七轮反馈（2026-09-11 12:21）

> 四条：布局留白 / 切换闪烁 / 轮播"加入片单"含义不明 / 缺"修改媒体图片"按钮

### 16.1 修复

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | vd-top 与 vd-players 中间留白太多，不够紧凑 | `.vd-hero-in` 用了 `justify-content:space-between`，把两块推向两端 | 改 `justify-content:center`（与设计稿一致），JAV 同样；实测 302 gap 25px / 18 gap 32px |
| 2 | 切页先闪原生再跳美化 | 只做了首次加载遮罩，SPA 跳转没遮 | ① 装机时向 `<head>` 注入 `vd-boot` 内联 style+script（2.6s 兜底）；② 新增 **MutationObserver**：`.itemView` 出现的微任务阶段（首帧绘制前）加 `.vd-pre{opacity:0}`，hero 就绪后 `markReady()` 淡出；③ tick 各分支都 markReady（防死锁） |
| 3 | 轮播"加入片单"含义不明 | 实际调 `updateFavorite()` = 收藏，文案误导 | 文案改 **♥ 收藏 / 已收藏**，点击真实切换 + 状态回显（`Fields` 补 `UserData` 读初始态） |
| 4 | 美化后没有"修改媒体图片"入口 | 原生 topDetailsContainer 被隐藏，原按钮一起没了 | hero CTA 新增 **🖼 换图** 按钮 → `Emby.importModule('./modules/imageeditor/imageeditor.js')` → `show({itemId,serverId})`（⚠️ 路径必须带 `imageeditor/imageeditor.js`，`./modules/imageeditor.js` 会 404） |

### 16.2 防闪烁实测（导航后每 80ms 采样）

`(vd-pre, hero, opacity)` → `[true,false,"0"] → [false,true,"0"] → [false,true,"1"]`
即：**原生首帧出来前就已经 opacity:0**，hero 就绪后淡入，无原生闪烁 ✅

### 16.3 实测（1600×900）

| 项 | emby-302 | emby-18 |
|---|---|---|
| heroBottom | 900 ✅ | 900 ✅ |
| gap(顶部块→播放器) | 25px ✅ | 32px ✅ |
| CTA 按钮 | 立即播放/收藏/标记已看/更多/**换图** ✅ | 同 ✅ |
| 换图 | 弹出「修改图像」对话框（主图 680x1000 / 徽标 800x310）✅ | ✅ |
| 轮播按钮 | ♥ 收藏 ✅ | ♥ 收藏 ✅ |
| 季页剧集（回归） | trackList 5660 ✅ | — |
| JAV 5 段/短评（回归） | — | 5 段 + 真实短评 ✅ |

git: 见提交 | 分发: /vol1/1001/web/{install-ves.sh,vanvy-detail.tar.gz}

---

## 十七、🔧 v1.3 · 第八轮反馈（2026-09-11 14:12）

> 反馈：「vd-top 容器可以再大一些，不然媒体图片太小了，看起来不够大气」

### 17.1 调整（海报放大 3 档）

| 元素 | 之前 | 现在 | 设计稿参考 |
|---|---|---|---|
| 海报宽度(302, 1600px) | 206px | **300×448** | 230×344 |
| 海报宽度(18 JAV) | 194px | **256×384** | 230×344 |
| `.vd-top` 间距 | clamp(22,3.4vw,54) | clamp(26,3.8vw,62) | clamp(18,3vw,40) |
| LOGO 高 | clamp(40,6.2vh,72) | clamp(54,7.8vh,104) | — |
| 简介 | 2 行/14.5px | **3 行/15px** | — |
| 标题 chip | 13.5px | 14.5px | — |
| hero max-width | 1520 | 1620 | 1500 |

海报高度 448/900 = **50% 视口高**（设计稿 344/900 = 38%），比设计稿更大更"大气"。

### 17.2 实测（1600×900）

| 项 | emby-302 | emby-18 |
|---|---|---|
| 海报 | 300×448 ✅ | 256×384 ✅ |
| heroBottom | 900（正好一屏）✅ | 900 ✅ |
| 播放器行底 | 808 ✅ | 773 ✅ |
| 强调色 | #e8c66a 金 ✅ | #e8c66a 金 ✅ |
| CTA | 立即播放/收藏/标记已看/更多/换图 ✅ | 同 ✅ |
| 回归：季页剧集 | trackList 5660 ✅ | — |
| 回归：JAV 5 段 | — | ✅ |

> 注：真实 Emby 页面左侧有 238px 抽屉，hero 可用宽度 = 1362px，已接近极限（max-width 1620 不构成约束）。

git: 见提交 | 分发: /vol1/1001/web/{install-ves.sh,vanvy-detail.tar.gz}

---

## 十八、🔧 v1.4 · 第九轮反馈（2026-09-11 14:28）

> 四条：更多类似跳转 / 合集内影片可点击 / JAV 演员作品面板自适应+跳转 / 播放器偏好记忆

### 18.1 修复

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 「更多类似」需按钮跳转更多页 | Emby **没有**原生该页（`type=Similar` 不是有效过滤器，会退化成全库 12918 条） | 自建**整页网格视图** `openSimilarPage()`：全屏遮罩 + 标题(片名·更多类似) + 返回按钮 + 自动栅格 + `Items/{id}/Similar?Limit=200`；Esc/背景关闭；点卡进作品页 |
| 2 | 合集页「影片」不能点进作品页 | 卡片悬浮按钮 `data-action="resume"`（合集卡=播放全部）抢走点击；且 `cardItemId` 正则 `[0-9a-f]{6,}` 匹配不到 5 位 id（32341） | ① 捕获阶段监听，覆盖 `.linkedItems/.appearsOnListsSection/.collectionItemsSection/...`；② resume/play 悬浮按钮 → 改为进作品页；③ 普通点击 320ms 后若 hash 未变或变成 videoosd → 补跳；④ id 正则放宽为 `[0-9a-f]{3,}` |
| 3 | JAV 已入库作品不匹配 JavDB 方向、页脚要下滑才见、查看全部不跳转 | ① 库内卡用 2:3 竖版；② `.vd-aworks{max-height:420px}` 裁剪；③ 链接写死 `#!/person?id=` | ① 库内卡改**横版 16:10**，优先 Thumb/Backdrop 回退 Primary（与 JavDB 卡一致）；② `max-height:none` 自适应高度；③ 「查看全部库内作品」→ `goItem(personId)`（Emby 演员页 = `#!/item?id=<pid>`） |
| 4 | 播放器偏好（播放器/图标模式/多开/STRM/断点续播）每次刷新要重设 | 只持久化了 strm/multiPot/last-player | 全部 5 个开关 + 上次播放器 存 localStorage（`vanvy-p-*`），注入时回填开关状态与图标模式 |

### 18.2 踩坑记录（重要）

- **变量遮蔽**：`openSimilarPage` 内 `var esc = function(e){...}` 把全局 HTML 转义 `esc()` 遮蔽了 → 函数内先调用 `esc(item.Name)` 直接 TypeError，点击无反应。改名为 `onKey`。
- **Emby 卡片 id 提取**：卡片无 `data-id`，唯一可靠来源是 `<img src=".../emby/Items/<id>/Images/...">`。
- **`.vd-aworks` 重复规则**：后定义的 `max-height:420px` 覆盖了新规则，必须改原规则而不是追加。

### 18.3 实测（1600×900）

| 项 | emby-302 | emby-18 |
|---|---|---|
| 更多类似页 | 194 张全屏栅格 + 返回按钮 ✅ | — |
| 合集卡点击 | → `#!/item?id=32341`（007系列）✅ | — |
| 播放器偏好 | 图标模式/仅本机 刷新后保留 ✅ | — |
| 演员作品面板 | — | 自适应高度 · 横版 230×167 · 页脚可见 ✅ |
| 查看全部库内作品 | — | → `#!/item?id=742952`（演员页）✅ |
| 回归：首屏/主题 | heroBottom 900 · 海报 300×448 · #e8c66a ✅ | 5 段收起 ✅ |
| 回归：季页剧集 | trackList 5660 ✅ | — |

git: 见提交 | 分发: /vol1/1001/web/{install-ves.sh,vanvy-detail.tar.gz}

---

## 十九、🔧 v1.5 · 第十轮反馈（2026-09-11 15:03）

> 五条 + 追加一条（播出季回归）

### 19.1 性能事故（本轮最大问题，必须记住）

**现象**：详情页跳转后原生页面停留很久才变美化样式；CPU 68%，13 秒只跑了 4 次定时器。

**根因**：上一轮为了防闪烁加的 `MutationObserver.observe(document.body, {childList, subtree, attributes:['class']})`。
Emby 页面 DOM 变动极其频繁（虚拟滚动、进度条、卡片状态），每次变动都触发 `scan()`，而 scan 内部做 `document.querySelector('.vd-hero, .vd-injected')` 的大范围查询 → **观察风暴**，主线程被打满。

**修复**（零成本方案）：
- 删除 body 级 MutationObserver
- 改为：① 拦截 `Emby.Page.show / showItem`（程序化跳转的最早时机）② `hashchange/popstate`（实测 29ms 内触发）③ 180ms 轻量轮询（未就绪才干活，就绪后几乎零开销）
- `tick` 间隔 1200ms → **500ms**；跳转时额外 40ms/320ms 立即重建
- 效果：CPU **68% → 9%**，定时器恢复稳定 400ms 节拍

### 19.2 其余修复

| # | 问题 | 修复 |
|---|---|---|
| 1 | 切换仍有原生闪现 | **纯 CSS 门控**：`.itemView:not(.vd-ready) > .itemMainScrollSlider > .topDetailsContainer{visibility:hidden}`，hero 建好加 `.vd-ready` 才显示；`preArm()`(hashchange) 立即撤 ready 并遮罩；2.6s 兜底放行。实测：手动移除 vd-ready → 原生块立刻 hidden ✅ |
| 2 | 弹框生硬、像黑板 | 遮罩改半透明 `rgba(5,5,9,.62)` + **blur(26px) saturate(125%)**；新增 `vdOverlayIn/vdPopIn/vdImgIn` 入场动画（cubic-bezier .22,.7,.24,1）+ `vd-closing` 平滑退场；剧照图淡入+缩放 |
| 3 | JAV 演员作品滑杆多余 | DOM 与 CSS 双双移除 `.vd-ascroll`；保留 `overflow-x:auto` 真实滚动条（实测 `hasRange:false`, `overflowX:auto`）|
| 4 | JAV 标签不能跳更多影片 | 标签加 `data-tag`；点击 → `Genres` API 解析 genreId → 跳 Emby 原生 `#!/list/list.html?serverId=..&genreId=..`（实测 genreId=73）|
| 5 | 手机端 vd-top 与顶栏重叠 | 移动端 hero `padding-top: 22px → 96px`（实测 header 底 80 / vd-top 顶 107 → 间距 27px）|
| +1 | **播出季又被排到最后** | `ensureSectionsHost` 锚点判断错误（childrenItemsContainer 的父级不是 addc，判断失败走了兜底插到最前）→ 改为**向上找到 addc 的直接子容器**再插到其后；实测播出季(348px)先显示，我们的区块紧随其后 ✅ |
| 附 | 我们的按钮点了不跳转 | `Emby.Page.showItem(id)` 缺 serverId 时**不导航** → `goItem()` / 首页轮播“详情”改为 `showItem(id, serverId)` |

### 19.3 实测（Playwright）

| 项 | 结果 |
|---|---|
| 主线程 | 400ms 探针零丢帧；CPU 9% ✅ |
| CSS 门控 | 移除 vd-ready → 原生详情块 `hidden` ✅ |
| hashchange | 29ms 触发 ✅ |
| 剧照弹框 | bg rgba(5,5,9,.62) + blur(26px) + vdOverlayIn/vdImgIn ✅ |
| 预告片弹框 | blur(26px) + vdPopIn ✅ |
| JAV 滑杆 | 已移除，strip 可滚动 ✅ |
| 标签跳转 | → genreId=73 列表页 ✅ |
| 手机端 | 顶栏底 80 / vd-top 顶 107（不再重叠）✅ |
| 播出季顺序 | 可见顺序第一位 ✅ |

git: 见提交 | 分发: /vol1/1001/web/{install-ves.sh,vanvy-detail.tar.gz}
