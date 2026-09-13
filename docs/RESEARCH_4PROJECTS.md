# 🔬 竞品调研报告 — 4 个 Emby 美化/增强项目 vs Vanvy Emby Kit

> 调研日期: 2026-08-13
> 调研对象:
> 1. Baiganjia/EmbyCarouselGUI
> 2. rockyzhao3000/emby-home-beautify
> 3. heichaowo/Emby-Fluent
> 4. xueayi/Emby-Plugin-Quick-Deployment
> 对比基线: Vanvy Emby Kit (`emby-kit/`, 本项目 V 系列)

---

## 一、项目总览

| # | 项目 | Star | 授权 | 定位 | 技术形态 | 与我们重叠区 |
|---|------|:---:|------|------|---------|------------|
| 1 | **EmbyCarouselGUI** | 10 | - | 轮播**内容策展**工具 | Python GUI + 定时任务，生成 `data_pc.js` 数据文件（喂给 Emby Theater PC 客户端 intro 页） | ⚡ 低重叠，纯互补 |
| 2 | **emby-home-beautify** | 0 | MIT | Web 首页美化（轮播+响应式） | Bash 安装脚本注入 `home.js`+`style.css`（Swiper），备份/卸载齐全 | ⚠️ 高重叠（首页轮播区） |
| 3 | **Emby-Fluent** | 9 | MIT | Fluent 风格 UI 增强 | **Chrome 扩展 MV3** + 服务端注入双模 | ⚠️ 高重叠（我们 banner_fluent 源自它） |
| 4 | **Emby-Plugin-Quick-Deployment** | 19 | - | 插件**一键安装器**（集成 4 个社区插件） | Bash + PowerShell 双脚本，带备份管理 | 🟡 中重叠（安装器理念） |

**结论先行：我们已经是"集大成者"** —— 第 4 个项目装的东西（emby-crx 皮肤 / dd-danmaku 弹幕 / embyExternalUrl 外播 / Home Swiper 轮播）我们 kit 里全都有自研/吸收版本。真正值得吸收的是：
- #1 的**轮播内容策展规则**（最大增量价值）
- #3 的**布局细节**（侧边栏浮层/毛玻璃标签/字体栈）
- #2 的**备份与防坑设计**（时间戳备份 + 已踩坑清单）
- #4 的 **PowerShell 版安装器 + 外播协议文档**

---

## 二、逐个深度分析

### 1️⃣ Baiganjia/EmbyCarouselGUI — 轮播内容策展（值得吸收 ⭐⭐⭐）

**做什么**：作者认为"纯随机抽卡的轮播没有意义"，做一个 Python GUI 让你**自定义抽取规则**，生成轮播数据文件。

**核心能力**：
- 最多 10 个轮播选项卡（每日电影/近期上映/近期剧集/随机合集/高分推荐/自定义主题…）
- 每个选项卡独立规则：媒体类型（电影/剧集/合集）、**指定媒体库**（还能排除小姐姐库 😏）、排序（随机/首映日期/评分/年份）、最小首映日期、每库搜索数、最终保留数
- **优先展示**：手输片名（中文逗号分隔）强制置顶
- 模板一键套用 + 配置持久化 config.json
- NoGUI 版 + 计划任务 → 每天自动更新轮播数据
- 配套 EMBY_HotMovie_Importer_V2 可做"实时热门"合集

**与我们的差异**：
- 它生成静态数据文件给 **PC 客户端**；我们注入 **Web UI**。技术零冲突，理念可移植。
- 我们的轮播目前是 JS 内**固定查询**（Backdrop+Logo、最近入库），没有"内容运营"能力。

**吸收方案（推荐优先级 P0）**：
> 给 3 款 banner 轮播加 **`carousel-rules.json` 可选配置**（banner 同款查询参数化）：
> ```json
> {
>   "tabs": [
>     { "name": "每日推荐", "type": "Movie", "libraries": ["电影"], "sort": "Random", "minPremiereDays": 45, "keep": 1, "pin": ["流浪地球"] },
>     { "name": "高分精选", "type": "Movie", "sort": "CommunityRating", "keep": 5 }
>   ]
> }
> ```
> - banner JS 启动时先读配置，没配置就回退现有默认查询（向后兼容）
> - 提供一个 `scripts/gen_carousel_rules.py`（可 cron），扫描 Emby API 生成/刷新规则 → 实现"每日推荐"自动化
> - 这样我们同时拿到 #1 的策展能力 + Web UI 的沉浸式展示，且**不动它的代码**（参考理念，不复制实现）

---

### 2️⃣ rockyzhao3000/emby-home-beautify — 工程健壮性（值得吸收 ⭐⭐）

**做什么**：Docker 版 Emby Web 首页美化，Swiper 沉浸式轮播 + 背景遮罩 + 响应式。针对 Emby 4.9.3.0 整理。

**核心能力 / 亮点**：
- ✅ **资源更新不重复注入 index.html**（注入一次，之后只换文件）
- ✅ 首次安装**自动备份原始 index.html** → `/config/backups/emby-home-beautify/<timestamp>/index.html.before`
- ✅ 安全卸载脚本 uninstall.sh
- ✅ 已踩坑修复清单（我们应逐条对照审计）：
  1. 旧版脚本与新版首页逻辑**同时加载** → 双轮播
  2. 登录后**持续转圈**
  3. 脚本执行**早于 DOM 初始化**
- ✅ 安装脚本可重复运行（幂等）
- ⚠️ 挂载方式：Compose 只读挂载目录 + `docker exec`，和我们在线安装器理念不同

**对照我们**：
- 我们的 persist.sh 有持久化恢复 ✅；uninstall.sh 有 `--reset` ✅
- **缺失**：时间戳化 index.html 原始备份（我们恢复的是注入后状态，没有"出厂原件"历史栈）
- **缺失**：双加载/登录转圈/DOM 竞态的显式防护声明（我们修过黑屏转圈，但值得加自动化自检）

**吸收方案（P1）**：
> 1. install 时把原始 index.html 存到 `<persist>/backups/<timestamp>/index.html.before`（历史栈，可回滚任意版本）
> 2. uninstall.sh 增加 `--list-backups` / 按时间戳恢复
> 3. 把 4.9 双加载防护、登录 spinner 防护、DOM ready 等待做成 **core 里的标准守卫函数**（banner 三款共用）
> 4. 参考它的幂等设计：确认我们"文件更新不重注入"的链路（marker 幂等已有，验证资源替换时不需要动 index.html）

---

### 3️⃣ heichaowo/Emby-Fluent — Fluent 细节（部分已吸收，继续补 ⭐⭐⭐）

**做什么**：Emby 4.8/4.9 Fluent 风格 UI 增强，**Chrome 扩展（MV3）+ 服务端注入**双模部署。已克隆在 `emby-research/emby-fluent/`，我们的 banner_fluent 即源自它。

**它有的**：
| 特性 | 我们现状 | 差距 |
|------|---------|------|
| Banner 轮播：10s 自动、克隆帧无缝循环、隐藏式左右导航、失败自动清理 | ✅ 已吸收（clone×4, fallback×6, npmmirror×5） | 无 |
| 智能筛选：**同时有 Backdrop + Logo** 才入选 | ⚠️ 需核实我们是否也双条件 | 待查 |
| maxWidth 3000 高清图 | ✅ 已吸收（×2） | 无 |
| **毛玻璃媒体库标签**（always/hover/none 三模式，`:root` 变量切换） | ❌ 无 | **补** |
| 媒体库卡片入场动画 + LOGO 淡入 + hover 缩放 1.1 | ⚠️ 部分（主题里） | 待查 |
| **字体栈**：Plus Jakarta Sans + HarmonyOS Sans SC（预分片）+ 霞鹜文楷，jsDelivr→npmmirror 回退 | ⚠️ 只在 banner_fluent 内注入，未全局 | **提为全局主题选项** |
| **侧边栏浮层化**（禁 docked 推移、默认收起）、透明渐变顶栏、0.3em 细滚动条 | ❌ 无（主题 css 未含） | **补** |
| Chrome 扩展版（MV3）打包 | ❌ 我们纯服务端 | 可选 |

**冲突点**：它的 banner 也是抢占 `section0`（替换首页第一个 section）——和我们三款 banner 同 zone。**不能同时装**，我们的 manifest 互斥机制已天然防住 ✅。

**吸收方案（P1）**：
> 1. 新增主题选项或 theme 级 CSS：**媒体库标签毛玻璃三模式**（`--vek-library-label-mode: always|hover|none`，默认 always）
> 2. 布局层 CSS 提取成独立组件 `components/layout/fluent_layout`（侧边栏浮层 + 透明顶栏 + 细滚动条 + 入场动画），**可独立勾选**，不绑死 banner
> 3. 字体栈抽成 `components/themes/global_fonts`（可选勾选，jsDelivr→npmmirror 双回退，沿用我们"外链全部本地化/超时兜底"的防黑屏铁律——字体优先本地打包，其次 CDN 回退）
> 4. 保留其双模部署思路：后续可把 kit 打包成 MV3 扩展作为可选项（P2，先不做）

---

### 4️⃣ xueayi/Emby-Plugin-Quick-Deployment — 安装器形态（吸收 ⭐⭐）

**做什么**：一键安装 4 个社区插件（emby-crx 皮肤 / dd-danmaku 弹幕 / embyExternalUrl 外播 / Emby-Home-Swiper 轮播），**bash + PowerShell 双脚本**。

**亮点**：
- ✅ **Windows PowerShell 版**（Emby 跑 Windows 也能装）—— 我们是纯 bash
- ✅ **备份管理菜单**：3) 备份管理 → 恢复历史版本；`.plugin_backups/index.html.original` 手动兜底
- ✅ **互斥警告**：emby-crx 与 Home Swiper 冲突，4.8 用 crx、4.9+ 用 Swiper（与我们的风格互斥设计一致，验证了方向正确）
- ✅ **外播协议文档**：mpv-handler 注册、PotPlayer 注册表修复、中文乱码原因、多开参数（externalPlayer.js 删 `/current`）——对我们 localplayer 是现成 FAQ
- ✅ 页面标题被插件改掉的坑（SN FTP SERVER）—— 提醒我们组件注入别覆盖 `Emby.Page.setTitle`

**吸收方案（P2）**：
> 1. `scripts/` 增加 `install_plugins.ps1`（PowerShell 版安装器，复用 manifest 逻辑的翻译版）——覆盖 Windows 用户
> 2. install.sh 交互菜单加"备份管理"子菜单（列备份/恢复历史/还原出厂）
> 3. 把外播协议三件套文档收进 `docs/`（mpv-handler / PotPlayer 注册表 / 中文乱码 / 多开）——服务我们已有的 localplayer 功能
> 4. 借鉴其"版本推荐"逻辑：install.sh 里 4.8 默认推荐经典轮播、4.9+ 默认推荐 Fluent/Banner

---

## 三、特性对比矩阵

| 能力 | CarouselGUI | home-beautify | Emby-Fluent | Quick-Deploy | **Vanvy Kit** |
|------|:---:|:---:|:---:|:---:|:---:|
| 首页轮播 | 数据源(PC) | ✅ Swiper | ✅ Fluent | ✅ Swiper | ✅ 三款任选 |
| 轮播内容策展规则 | ✅ 强 | ❌ | ❌ | ❌ | ⚠️ 固定查询 |
| 毛玻璃主题 | ❌ | ❌ | 标签级 | ❌ | ✅ 7 款+品牌 |
| 弹幕 | ❌ | ❌ | ❌ | ✅ dd-danmaku | ✅ 内置 |
| 豆瓣/Bangumi 评分 | ❌ | ❌ | ❌ | ❌ | ✅ 内置 |
| 剧照展示 | ❌ | ❌ | ❌ | ❌ | ✅ 内置 |
| JAV 元数据 | ❌ | ❌ | ❌ | ❌ | ✅ 内置(独家) |
| 播放倍速 | ❌ | ❌ | ❌ | ❌ | ✅ 内置 |
| 第三方播放器 | ❌ | ❌ | ❌ | ✅ embyExternalUrl | ✅ 内置 |
| 播放页增强/远程路径 | ❌ | ❌ | ❌ | ❌ | ✅ 内置 |
| 多容器识别 | ❌ | ❌ | ❌ | ❌ | ✅ 强 |
| 环境检测(镜像差异) | ❌ | 仅官方路径 | 仅官方路径 | ❌ | ✅ 强 |
| 持久化/重建恢复 | ❌ | ❌ | ❌ | ❌ | ✅ 强 |
| 时间戳备份栈 | ❌ | ✅ | ❌ | ✅ 菜单 | ⚠️ 待补 |
| 卸载还原 | ❌ | ✅ | ❌ | ✅ | ✅ 强 |
| 双模部署(扩展+服务端) | ❌ | ❌ | ✅ | ❌ | ❌ 可加 |
| Windows 安装器 | ❌ | ❌ | ❌ | ✅ | ❌ 可加 |
| 在线安装(公网一键) | ❌ | ❌ | ❌ | ✅ wget | ✅ 强(双版本) |
| 中文+英文文档 | ❌ | ✅ | ✅ | ✅ | ⚠️ 中文为主 |

---

## 四、冲突矩阵（避免打架）

| 组合 | 冲突 | 说明 |
|------|:---:|------|
| 我们 3 款 banner 之间 | 🔴 | 同占 section0，manifest 已互斥 ✅ |
| 我们 banner vs Emby-Fluent(heichaowo) | 🔴 | 同占 section0，装了他就不能装我们 banner |
| 我们 banner vs Emby-Home-Swiper(sohag1192) | 🔴 | 同上（Quick-Deploy 文档也警告） |
| 我们 7 款毛玻璃主题之间 | 🔴 | 毛玻璃互斥只能选一个（安装器已提示） |
| 我们主题 vs banner | 🟡 | 主题 CSS 变量若覆盖 banner 选择器会串色 → 命名空间隔离（vanvy- 前缀） |
| 我们 danmaku vs dd-danmaku | 🔴 | 功能重复，装了会双弹幕 → 安装器检测到外部弹幕注入时警告 |
| 我们 localplayer vs embyExternalUrl | 🟡 | 功能重复，双按钮 → 检测 embyExternalUrl 存在则跳过注入 |
| 组件注入 vs Emby.Page.setTitle | 🟡 | Quick-Deploy 踩过坑（标题被改 SN FTP SERVER），我们组件禁用 setTitle 覆写 |
| emby-crx(Nolovenodie) vs 我们主题 | 🟡 | 都是全站皮肤，双 CSS 会互相覆盖 → 检测到 emby-crx 时提示先卸载 |

**防冲突机制（现状 + 补强）**：
1. ✅ 已有：style 互斥 / marker 幂等 / 命名空间 vanvy- 前缀
2. ➕ 补：install 时**预检常见外部插件注入串**（emby-crx、dd-danmaku、embyExternalUrl、Home Swiper 的 marker），检测到就提示冲突/让用户选择接管

---

## 五、吸收优先级路线图

### P0 — 本周（最大增量价值）✅ 已完成 2026-08-13
- [x] **轮播内容策展**：`carousel-rules.json` 可选配置 + `gen_carousel_rules.py` 生成器（吸收 CarouselGUI 理念）
  - 规则：类型/媒体库/排序/最小首映/保留数/优先置顶片名
  - 无配置回退默认查询，向后兼容
  - 已实测：rules-loader 解析/媒体库解析/日期过滤/pin 置顶断言全过
- [x] **时间戳备份栈**：原始 index.html 历史备份 + `--list-backups`/按版本恢复
  - 已实测：pristine 出厂备份 / list / restore / reset 回退闭环全通

### P1 — 两周内（已完成核心 3 项）
- [x] **布局增强组件** `fluent_layout`：侧边栏浮层 + 透明顶栏 + 细滚动条 + 入场动画（吸收 Emby-Fluent 未吸收部分）
- [x] **媒体库标签毛玻璃三模式**（always/hover/none，body class 切换）
- [x] **全局字体栈主题选项**（本地打包优先 + jsDelivr/npmmirror 双回退 + 7天冷却防黑屏）
- [x] **core 标准守卫函数**：DOM ready 等待 / 登录 spinner 防护 / 双加载去重（三款 banner 共用）
- [x] **外部插件冲突预检**（安装器检测 emby-crx 等 marker 并警告，排除自家 vanvy/ 注入）
- [x] **轮播版本自动 fallback**（4.8→经典，4.9→Fluent，package 模式自动切换）

### P2 — 后续（可选）✅ 已完成 2026-08-13
- [x] **PowerShell 版安装器**（`install_plugins.ps1`: Windows 非 Docker 部署, 功能对等 bash 版, 含备份/注入/卸载/fallback）
- [x] **MV3 Chrome 扩展打包**（`extension/` + `scripts/build_extension.sh`, 双模部署, 与服务端版同源组件）
- [x] **外播协议三件套 FAQ 文档**（`docs/PLAYER_FAQ.md`: mpv-handler/PotPlayer 注册表/乱码/多开/排查清单）
- [x] 版本推荐逻辑（4.8→经典轮播，4.9+→Fluent/Banner）✅ 已在 fallback 中实现
- [x] banner 智能筛选升级为"Backdrop+Logo 双条件" ✅ 三款均已通过 EnableImageTypes: Logo,Backdrop 实现

---

## 六、风险与注意

1. **许可合规**：heichaowo 为 MIT、home-beautify 为 MIT（内嵌 Swiper MIT）→ 吸收代码需保留原 LICENSE 声明（THIRD_PARTY_NOTICES.md 机制）
2. **Emby 版本漂移**：4.8/4.9/4.10 DOM 差异大，布局组件需像 heichaowo 一样做版本适配（manifest 的 compat 字段已支持）
3. **国内网络铁律**：任何新组件的外链资源必须遵循"本地化优先 + CDN 双回退 + 非阻塞加载 + 超时兜底"，防止重蹈黑屏转圈
4. **双版本铁律**：本地版用 vanvy.top，GitHub 版自动转 api.github.com（sync_github.sh 已接管，新组件同步纳入泄露检查）

---

## 七、结论

- **我们不是追赶者，是集大成者**：4 个项目的能力 80% 已覆盖，且我们在多容器识别、环境检测、持久化、在线安装、JAV 独家功能上全面领先
- **最大增量**：CarouselGUI 的**内容策展**（把"随机轮播"升级成"运营位"）
- **其次**：Emby-Fluent 的**布局细节**（侧边栏/毛玻璃标签/字体栈）和 home-beautify/Quick-Deploy 的**工程健壮性**（备份栈/幂等/冲突预检）
- **冲突天然可控**：同 zone 组件 manifest 互斥 + 补外部插件预检即可
- 集成方向明确：**P0 两项先做，P1 五项跟进**，全部走"组件化 + 可勾选 + 向后兼容"路线，不动现有用户配置
