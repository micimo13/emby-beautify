# Vanvy Home Banner + 预热加载页 · 开发与部署文档

> 记录日期: 2026-09-10
> 作者: 虾子🦐 (for Marnie✨✨🎊)
> 状态: **已上线 emby-302（Link Emby 4.8.11）实测通过**

本文档记录两个新组件的**开发过程**、**技术决策**、**部署/回滚方式**与**踩坑记录**。

---

## 一、目标与需求演进

| 时间 | 需求 | 结果 |
|---|---|---|
| 09-10 15:16 | 一步一步来，用设计图/HTML 看效果 | 出 3 版设计稿 + 真实数据原型 |
| 15:23 | 大屏轮播要满屏、自适应设备 | v2 满屏轮播 |
| 15:29 | 跨版本？背景图可调？横版卡片？每库轮播？ | 真机调研 + 结论 |
| 15:41 | 用 emby-302 测试 | 开始真机落地 |
| 16:01 | 删掉右下角背景控件 | 改为 CFG 配置项 |
| 16:04 | 做预热加载页 | 4 款设计稿 → 选 A |
| 16:26 | 文案按服务器名 / 品牌LOGO / favicon 可换 | 全部实现 |
| 16:32 | ①预热页要真正预加载轮播 ②去掉背景遮罩 | 无缝衔接 + 去遮罩 |
| 16:41 | 手机端标签与原生标签重叠 | 动态测量修复 |
| 16:47 | 主题配色给用户选 | 10 套预设 |
| 16:53 | 不要页面控件/emoji，改为部署时选 | 部署脚本菜单 |
| 16:56 | 要黑金配色 | 新增黑金 + 香槟金 |

---

## 二、交付物清单

```
emby-beautify/components/
├── home/banner_home/          # ① 首页满屏轮播
│   ├── vanvy-home.js          (436 行, 逻辑)
│   ├── vanvy-home.css         (136 行, 样式)
│   ├── install.sh             (98 行, 安装/卸载/选色)
│   └── README.md
└── loading/vanvy/             # ② 预热加载页
    ├── vanvy-loading.js       (227 行)
    ├── vanvy-loading.css      (89 行)
    ├── logo/
    │   ├── brand.png          (品牌 LOGO 760×266, 透明)
    │   └── favicon.png        (标签图标 256×256, 透明)
    └── install-loading.sh     (70 行)
```

设计稿（线上可看）：
- 首页设计稿: `https://github.com/micimo13/emby-beautify`
- 真实数据原型: `https://github.com/micimo13/emby-beautifydemo/`
- 集成验证页: `https://github.com/micimo13/emby-beautifydemo/harness.html`
- 加载页 4 款对比: `https://github.com/micimo13/emby-beautifyloading/`

---

## 三、技术架构

### 3.1 注入方式（与 kit 一致）

只改容器内 `index.html`，追加 3 行 + 落位 1 个目录：

```html
<!-- head -->
<link rel="stylesheet" href="vanvy-loading/vanvy-loading.css" id="vanvy-loading-css">
<link rel="stylesheet" href="vanvy-home/vanvy-home.css" id="vanvy-home-css">

<!-- body 末尾 -->
<script src="vanvy-loading/vanvy-loading.js"></script>   <!-- 插在 apploader.js 之前 -->
<script src="vanvy-home/config.js"></script>              <!-- 部署时生成的配色 -->
<script src="vanvy-home/vanvy-home.js"></script>
```

- 不动容器内任何其它文件（媒体库/数据库/配置零改动）
- 幂等：重复安装不会叠加注入（`sed` 先删旧行再写）
- 可完全卸载：删 3 行 + `rm -rf vanvy-home vanvy-loading`

### 3.2 首页轮播（vanvy-home.js）

**挂载点**（跨版本双选择器）：
```js
'.view:not(.hide) .homeSectionsContainer'   // Emby 运行时给 .sections 加的类
|| '.view:not(.hide) .sections'              // 兜底
→ container.insertBefore(heroSection, container.firstChild)
```

**零破坏原则**：只在最前面插一个 `section`，原生行完全不碰。
按钮走原生路由：
- 详情 → `Emby.Page.showItem(id)`
- 播放 → `Emby.Page.playItem({ids:[id], serverId})`

**数据层**（只用稳定的 REST 路径，4.8/4.9/4.10 通用）：
```
ApiClient.getCurrentUserId()
ApiClient.getJSON(ApiClient.getUrl('Users/{uid}/Views'))
ApiClient.getJSON(ApiClient.getUrl('Users/{uid}/Items', {
    ParentId, SortBy:'DateCreated', SortOrder:'Descending',
    Recursive:true, IncludeItemTypes:'Movie,Series', Limit:N,
    ImageTypes:'Backdrop,Primary', Fields:'ProductionYear,CommunityRating,Overview,Genres,RunTimeTicks' }))
ApiClient.getImageUrl(itemId, {type:'Backdrop', maxWidth:1920})
```

**核心机制**：
| 机制 | 实现 |
|---|---|
| 每库最新 N 条 | `CFG.perLib`（默认 8），带质量过滤（评分>0 或年份≥2020） |
| 自动轮播 | `CFG.slideMs`（默认 6.5s） |
| 片单切换 | 缩略图 / 圆点 / 左右箭头 / 键盘←→ / 手机滑动 |
| 库切换 | 顶部 Tab 点击；`CFG.libMs>0` 可自动轮换库（默认关） |
| 顶栏避让 | `positionTabs()` 实测原生标签栏底边 + 10px，见 3.4 |
| 预加载就绪信号 | 首屏背景图 `onload` → `window.__VANVY_HOME_READY__`（+2.5s 兜底） |
| 离开首页 | `cleanup()` 卸载 + 清定时器；回首页重挂 |

**暴露 API**：
```js
VanvyHome.state        // { views, cur, slide, mounted }
VanvyHome.switchLib(i) // 切库
VanvyHome.setTheme(k)  // 切配色（无 UI，供调试/外部调用）
VanvyHome.presets      // 预设列表
VanvyHome.cleanup()    // 卸载
```

### 3.3 预热加载页（vanvy-loading.js）

| 机制 | 实现 |
|---|---|
| 服务器名 | 三级取源：localStorage `servercredentials3`.Servers[].Name（按 origin 匹配）→ `document.title` → `ApiClient.serverName()` 就绪后实时校正 |
| 文案模板 | `CFG.textTemplate='正在准备 {server} 的媒体库'`；取不到用 `textFallback` |
| 品牌 LOGO | `CFG.brandLogo` 指向 `logo/brand.png`（组件目录用 `document.currentScript.src` 推导） |
| 浏览器图标 | 改写所有 `link[rel*=icon]` 的 href |
| 展示时长 | 最短 `minShowMs=1300`（防闪），最长 `maxShowMs=12000`（防卡死） |
| 就绪判定 | ①登录页→立即让路 ②检测到 `script[src*=vanvy-home]`→**等 `__VANVY_HOME_READY__`** ③无轮播→原生首页行出现 |
| 失败保护 | 全程 `try/catch`，出错直接跳过，绝不影响进首页 |

### 3.4 手机端标签重叠修复（关键技术点）

**问题**：Emby 手机端原生「首页/收藏夹」标签是**独立元素**（`.tabs-viewmenubar`），
不在 `.skinHeader` 里。按顶栏高度算位置 → 我方标签压在原生标签上。

**修复**：运行时实测 + 多点重测
```js
function positionTabs(){
  // 取 .tabs-viewmenubar / .headerMiddle.sectionTabs / .sectionTabs 中最低的 bottom
  // 我方标签 top = bottom - heroTop + 10px
}
scheduleTabPosition();  // 0/200/500/900/1600/2600ms 各测一次
window.addEventListener('resize', positionTabs);
window.addEventListener('orientationchange', ...);
```
手机端标签额外改为**单行横向滚动**（`flex-wrap:nowrap + overflow-x:auto`）。

### 3.5 无缝衔接（预热页 → 轮播）

```
轮播挂载 → 背景图 onload → __VANVY_HOME_READY__ = true
预热页轮询 → 检测到该信号 → 淡出（此时轮播已渲染完成）
```
实测时间线：轮播就绪 `5.93s` → 预热页淡出 `6.58s` → 用户直接看到轮播，**无卡顿**。

### 3.6 配色系统（部署时选择，无页面控件）

10 套预设，定义在 `vanvy-home.js` 的 `CFG.presets[]`（`a`/`b` 渐变两端 + `bg` 底色）：

| key | 名称 | a | b | bg |
|---|---|---|---|---|
| aurora | 极光蓝 | #3ea6ff | #7c5cff | #08080c |
| **blackgold** | **黑金** | #e8c66a | #a8741a | #070608 |
| champagne | 香槟金 | #f2dfa8 | #c9a86a | #08070a |
| emerald | 翡翠绿 | #10d9a3 | #0ea5e9 | #050b0a |
| sakura | 樱花粉 | #ff6b9d | #c86dd7 | #0c070c |
| sunset | 落日橙 | #ff9a3d | #ff4d6d | #0c0805 |
| amber | 琥珀金 | #ffc93c | #e08e2b | #0a0805 |
| crimson | 赤霞红 | #ff4d5e | #a1213f | #0c0507 |
| violet | 幻紫 | #a855f7 | #6366f1 | #08060e |
| graphite | 石墨灰 | #cbd5e1 | #64748b | #0a0b0d |

**选择流程**：
```
install.sh 弹菜单 → 用户选 1-10 → 写 vanvy-home/config.js
  window.VANVY_HOME_CONFIG = { theme: 'blackgold' }
→ 组件 loadConfig() 读取 → applyTheme() 写 CSS 变量
```
换色无需卸载，重跑脚本即可。也支持非交互：`--theme blackgold`。

---

## 四、部署方式

### 4.1 首次安装

```bash
# ① 组件文件传到 NAS
scp -r components/home/banner_home components/loading/vanvy root@NAS:/tmp/

# ② 在 NAS 宿主机上执行（容器名按实际填）
bash /tmp/banner_home/install.sh   --container emby-302      # 首页轮播（会弹配色菜单）
bash /tmp/vanvy/install-loading.sh --container emby-302      # 预热加载页
```

### 4.2 换配色

```bash
bash install.sh --container emby-302            # 交互选
bash install.sh --container emby-302 --theme blackgold   # 非交互
```

### 4.3 卸载

```bash
bash install.sh         --container emby-302 --uninstall
bash install-loading.sh --container emby-302 --uninstall
```

### 4.4 回滚（快照机制）

每次安装前自动快照 `index.html` 到 `/system/dashboard-ui/.bak-vanvy-<时间戳>/`（保留最近 5 份）：

```bash
docker exec emby-302 sh -c \
  'cp /system/dashboard-ui/.bak-vanvy-20260910-170001/index.html /system/dashboard-ui/index.html &&
   rm -rf /system/dashboard-ui/vanvy-home /system/dashboard-ui/vanvy-loading'
```

### 4.5 验证（自动化）

```bash
# UI 登录一次并保存状态（Playwright storage_state）
python3 tmp-mockup/ui_login.py
# 无缝衔接 + 主题验证
python3 tmp-mockup/verify_seamless2.py
```

---

## 五、版本兼容性（实测）

对比 emby-302 (4.8.11) 与主 Emby (4.9.5) 的前端模块：

| | 4.8.11 | 4.9.5 |
|---|---|---|
| 模块总数 | 78 | 75 |
| 共有 | **74** | |
| `emby-apiclient` | ✅ | ✅ |
| `backdrop` | ✅ | ✅ |
| `cardbuilder` | ✅ | ✅ |
| `homesections` | ✅ | ❌ 已移除 |

**结论**：
- 数据层/图片层 4.8/4.9 **完全通用**
- 4.9 移除 `homesections` → 首页 DOM 有差异 → 用双选择器 + 运行时探测兜底
- **4.10**（2026-09-08 发布）无测试实例 → 只能运行时探测；探测失败整块不挂，**绝不影响原生**（全程 try/catch）

---

## 六、踩坑记录

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 组件永不挂载 | `init()` 在登录前 `loadData()` 抛异常 → 整个 init 中断，轮询未启动 | 先起轮询，再 `try/catch` 取数 |
| 2 | 轮播重复挂载 | `mount()` 并发竞态（两次 tick 同时通过 `mounted` 检查） | 加 `state.mounting` 同步标志 |
| 3 | 轮播不贴顶 | `.sections` 有 `padded-top-page` 内边距（实测 131px） | 挂载时抵消 `paddingTop` |
| 4 | 手机标签重叠 | 原生标签是独立元素，不在 `.skinHeader` | `positionTabs()` 实测原生标签底边 |
| 5 | 预热页白做（卡顿） | 预热页撤得早，轮播还没渲染 | 等 `__VANVY_HOME_READY__` 再撤 |
| 6 | 背景图看不见 | 横向重压暗渐变（.97→.80） | 删除；不透明度 1、色调透明、仅底部渐隐 |
| 7 | 服务器名不准 | HTML `<title>` 与 API `ServerName` 不一致 | 优先凭据 Name，ApiClient 就绪后校正 |
| 8 | 容器内自测页 JS 不执行 | **Emby 服务端会注释掉非 index.html 的 HTML 里的 `<script>`** | 改为本地 harness 或直接验证 index.html |
| 9 | 伪造登录态无效 | Emby 4.8 启动不 apply 手工写的 `servercredentials3` | 必须走真实登录流程（`ui_login.py`） |
| 10 | 视觉模型看错颜色 | 它把原生标签旧色当成主题色 | **改用 Playwright `computedStyle` + 截图像素采样**验证 |

---

## 七、相关文件与命令速查

**服务器**: UNRAID `192.168.1.2`（`sshpass -p <PASSWORD>`）
**测试容器**: `emby-302`（Link Emby 4.8.11，端口 8096）
**登录**: `vanvy / ********`
**内网访问必须绕代理**: `curl --noproxy '*'` / Playwright `--no-proxy-server`

**关键目录（容器内）**:
```
/system/dashboard-ui/vanvy-home/          组件 + config.js
/system/dashboard-ui/vanvy-loading/       组件 + logo/
/system/dashboard-ui/.bak-vanvy-*/        回滚快照
```
