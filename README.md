<p align="center">
  <img src="docs/ves-banner.jpg" alt="Vanvy Emby Suite" width="100%"/>
</p>

<h1 align="center">🦐 Vanvy Emby Suite · VES</h1>

<p align="center">
  <b>一站式 Emby 前端美化套件</b> —— 预热加载页 · 13 款首页轮播 · 详情页 Hero · 第三方播放器 · JAV 增强 · 毛玻璃<br/>
  一条命令，自动识别环境，模块自由组合，随时一键还原。
</p>

<p align="center">
  <a href="https://github.com/micimo13/emby-beautify/stargazers"><img src="https://img.shields.io/github/stars/micimo13/emby-beautify?style=flat-square" alt="Stars"/></a>
  <a href="https://github.com/micimo13/emby-beautify/commits/main"><img src="https://img.shields.io/github/last-commit/micimo13/emby-beautify?style=flat-square" alt="Last commit"/></a>
  <img src="https://img.shields.io/badge/Emby-4.8%20%7C%204.9%20%7C%204.10-green?style=flat-square" alt="Emby"/>
  <img src="https://img.shields.io/badge/Deploy-Docker%20%7C%20NAS-blueviolet?style=flat-square" alt="Docker/NAS"/>
  <img src="https://img.shields.io/badge/Mobile-适应手机端-orange?style=flat-square" alt="Mobile"/>
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License"/>
</p>

---

## ✨ 效果预览
<table>
<tr>
  <td width="50%"><img src="docs/screenshots/loading-desktop.jpg" alt="预热加载页"/><br/><sub align="center">① 预热加载页 · 品牌 LOGO + 进度线（等首页就绪才淡出）</sub></td>
  <td width="50%"><img src="docs/screenshots/home-desktop.jpg" alt="首页轮播 · 生产版"/><br/><sub align="center">② 首页轮播 · 生产版（经典满屏 Hero）</sub></td>
</tr>
<tr>
  <td><img src="docs/screenshots/hero-mosaic-desktop.jpg" alt="马赛克墙"/><br/><sub align="center">③ 首页轮播 · 马赛克墙（左大图 + 右备选卡片列）</sub></td>
  <td><img src="docs/screenshots/hero-cinema-desktop.jpg" alt="电影感"/><br/><sub align="center">④ 首页轮播 · 电影感（满屏背景 + 缩略图轨）</sub></td>
</tr>
<tr>
  <td><img src="docs/screenshots/hero-wave-desktop.jpg" alt="波浪"/><br/><sub align="center">⑤ 首页轮播 · 波浪（海报沿弧线起伏）</sub></td>
  <td><img src="docs/screenshots/hero-gallery-desktop.jpg" alt="画廊"/><br/><sub align="center">⑥ 首页轮播 · 画廊（横向滑动大图廊）</sub></td>
</tr>
<tr>
  <td><img src="docs/screenshots/detail-hero.jpg" alt="详情页 Hero"/><br/><sub align="center">⑦ 详情页 Hero（满屏背景 + 元数据 + 播放按钮）</sub></td>
  <td><img src="docs/screenshots/detail-sections.jpg" alt="详情页内容行"/><br/><sub align="center">⑧ 内容行（剧照 / 演员 / 预告片 / 更多类似）</sub></td>
</tr>
<tr>
  <td><img src="docs/screenshots/home-mobile.jpg" alt="手机端"/><br/><sub align="center">⑨ 手机端适配（轮播铺满、按钮不出框）</sub></td>
  <td><img src="docs/screenshots/install-wizard.jpg" alt="安装向导"/><br/><sub align="center">⑩ 安装向导（全交互，选完即装）</sub></td>
</tr>
</table>

> 截图均来自真实媒体库。手机端另有 `docs/screenshots/hero-mosaic-mobile.jpg`、`loading-mobile.jpg`。

---

## 🧩 二期详情页增强（默认全开，可逐项关闭）

| # | 功能 | 说明 |
|---|---|---|
| ① | **剧集正序/倒序** | 剧集/季列表右上角一键切换，偏好本地记忆 |
| ② | **演员头像右键菜单** | 右键头像 → Emby 原生菜单（编辑元数据 / 修改图像 / 刮削 / 刷新） |
| ③ | **「查看更多」** | 合集/剧集页的影片、视频容器右上角直达列表页 |
| ④ | **JAV 同系列影片墙** | 复用 JavDB 关联影片（零额外请求），可跳系列页 |
| ⑤ | **信息面板重设计** | 卡片化 + **真实路径默认打码** + 「查看完整信息」弹框（全字段不丢） |
| ⑥ | **顶栏** | **详情页/首页透明**（满屏背景上最好看）；**媒体库等原生页毛玻璃**（与侧栏一致 `blur(18px) saturate(1.25)`）；模式 `glass`（默认）/`clear`（全透明）/`solid`（全实心） |
| ⑦ | **单集继承剧集 LOGO** | 单集无徽标时用所属剧集 Logo + 「来自剧集 XXX」 |
| ⑧ | **外站全量 16+** | 不再只显示 3~6 个；存疑站点置灰标注 |
| ⑩ | **无徽标 → 文字徽标** | 优先级：自身 Logo → 剧集 Logo → 名称金色渐变大字 |

> 关闭方式：`vanvy.env` 里 `VANVY_P2=off`，或 `VANVY_P2_SORT=off` 等逐项关闭。

<table>
<tr>
  <td width="50%"><img src="docs/screenshots/p2-sort.jpg" alt="剧集排序"/><br/><sub align="center">① 剧集正序 / 倒序一键切换</sub></td>
  <td width="50%"><img src="docs/screenshots/p2-mediainfo.jpg" alt="完整媒体信息"/><br/><sub align="center">⑤ 「查看完整信息」弹框（全部字段，路径已打码）</sub></td>
</tr>
<tr>
  <td><img src="docs/screenshots/p2-textlogo.jpg" alt="文字徽标"/><br/><sub align="center">⑩ 无徽标 → 名称文字徽标（金色渐变）</sub></td>
  <td><img src="docs/screenshots/detail-hero.jpg" alt="详情页"/><br/><sub align="center">详情页 Hero 总览</sub></td>
</tr>
</table>

---

## 🚀 快速开始

```bash
# 交互式向导（推荐）
curl -sL https://github.com/micimo13/emby-beautify/raw/main/online-install.sh | bash

# 免交互一键装（全家桶）
curl -sL https://github.com/micimo13/emby-beautify/raw/main/online-install.sh | bash -s -- \
  --container emby --features 1,2,3,4,5,6 --theme blackgold --frost weak --yes
```

> 国内网络不畅时，可用镜像源：
> ```bash
> curl -sL https://gh-proxy.com/https://raw.githubusercontent.com/micimo13/emby-beautify/main/online-install.sh | bash
> ```

装完 **Ctrl+F5 / Cmd+Shift+R** 强刷浏览器即可看到效果 ✨

### 向导会依次问你

```
① 选择目标容器          → 自动列出 emby-* 容器并识别版本
② 功能多选              → 1,2,3,4,5,6（也可以只装想要的）
③ 加载页样式            → 默认极简 / 极光 / 影院 / 分屏 / 纯LOGO
④ 加载页 LOGO           → 默认 / 指定图片（本地文件或 URL）/ 不要
⑤ 浏览器标签图标        → 用加载页 LOGO / 单独指定 / 不替换
⑥ 首页轮播样式          → 13 款任选（含「生产版」经典满屏）
⑦ 配色                  → 黑金 / 极光蓝 / 香槟金 / 翡翠绿 / 樱花粉 …10 套
⑧ 毛玻璃强度            → 关 / 弱 / 中 / 强
⑨ 每行卡片数            → 详情页内容行每排几个
⑩ 后端依赖（JAV 增强）  → MetaTube / AVDB / 图片代理（可跳过）
⑪ 确认摘要 → 开始部署
```

---

## 🧩 六大模块

| # | 模块 | 说明 |
|---|---|---|
| 1 | 🌌 **预热加载页** | 进首页先显示品牌加载页（LOGO + 文案 + 进度线），首页轮播就绪后平滑淡出；5 款样式、10 套配色、品牌 LOGO / 浏览器标签图标可换 |
| 2 | 🎠 **首页轮播** | **13 款样式**任选：生产版（经典满屏）、经典满屏、电影感、聚光、画廊、波浪、马赛克墙、霓虹赛博、毛玻璃、太空轨道、复古胶片、纸艺、极简、日光 |
| 3 | 🎬 **详情页 Hero** | 满屏背景 + 大海报 + 元数据 + 剧照 / 演员 / 预告片 / 更多类似；可切换毛玻璃质感。<br/>**二期增强**：剧集正序/倒序 · 演员头像右键原生菜单 · 内容容器「查看更多」 · JAV 同系列影片墙 · 信息面板重设计（路径打码 + 完整信息弹框） · 单集继承剧集 LOGO · 无徽标文字徽标 |
| 4 | ▶️ **第三方播放器** | PotPlayer / VLC / MPV / IINA 等 **15 款**，点击直接唤起本机播放器；支持 STRM 直通、断点续播 |
| 5 | 🔞 **JAV 增强** | 番号 / 演员 / 标签 / 短评 / 剧照 / 演员作品 与 JavDB 全量作品；**演员名自动映射**（简体 ⇄ 繁体/日文） |
| 6 | 🧊 **毛玻璃** | 详情页与卡片统一的磨砂玻璃质感，4 档强度 |

### 🎠 首页轮播 13 款

| 样式 | id | 特点 |
|---|---|---|
| ★ 生产版 | `production`（默认） | 经典满屏 Hero，最稳妥 |
| 经典满屏 | `classic` | 底部文案 + 左右箭头 + 分页点 |
| 电影感 | `cinema` | 满屏背景 + 右侧可滚动缩略图轨 |
| 聚光 | `spotlight` | 鼠标光斑跟随 + 3D 倾斜海报 |
| 画廊 | `gallery` | 横向滑动大图廊（可拖拽 / 滚轮） |
| 波浪 | `wave` | 海报沿弧线起伏，当前卡发光 |
| 马赛克墙 | `mosaic` | 左大图 + 右卡片列，全屏背景 |
| 霓虹赛博 | `neo` | 霓虹灯管 + 扫描线 + 网格地面 |
| 毛玻璃 | `glass` | 玻璃卡片 + 模糊背景 |
| 太空轨道 | `orbital` | 星球轨道 + 星尘粒子 |
| 复古胶片 | `retro` | 胶片颗粒 + VHS 扫描 |
| 纸艺 | `paper` | 纸质分层 + 印刷质感 |
| 极简 | `minimal` | 超大排版 + 留白 |
| 日光 | `light` | 米白暖调（唯一亮色） |

---

## 🛠 命令行参数

```bash
bash install-ves.sh --container emby                 # 交互式
bash install-ves.sh --container emby --yes           # 全默认，免确认
bash install-ves.sh --container emby --uninstall     # 卸载还原
bash install-ves.sh --list                           # 只列出可用容器
```

| 参数 | 取值 | 说明 |
|---|---|---|
| `--container` | 容器名 | 目标 Emby 容器（`docker ps` 里的名字） |
| `--features` | `1,2,3,4,5,6` | 1 加载页 · 2 轮播 · 3 详情页 · 4 播放器 · 5 JAV · 6 毛玻璃 |
| `--theme` | 见下方 10 套配色 | 主题配色 |
| `--bstyle` | 见轮播表 | 首页轮播样式（不填 = 生产版） |
| `--lstyle` | `aurora/cinema/minimal/split/logo` | 加载页样式 |
| `--logo` | 文件或 URL | 加载页 LOGO（**支持直接给图片 URL**，自动下载） |
| `--favicon` | 文件或 URL | 浏览器标签图标（可单独设置） |
| `--no-logo` / `--no-favicon` | — | 不使用 / 不替换 |
| `--frost` | `off/weak/mid/strong` | 毛玻璃强度 |
| `--perrow` | `3-10` | 详情页每行卡片数 |
| `--imgproxy` / `--proxy` | — / `socks5h://…` | 一键部署图片代理 / 指定出网代理 |
| `--doc-url` | 网址 | 指定安装引导页地址 |
| `--uninstall` | — | 卸载并还原 |

**配色（10 套）**：`aurora` 极光蓝 · `blackgold` 黑金 · `champagne` 香槟金 · `emerald` 翡翠绿 · `sakura` 樱花粉 · `sunset` 落日橙 · `amber` 琥珀金 · `crimson` 赤霞红 · `violet` 幻紫 · `graphite` 石墨灰

---

## 🖼 常见配置

### 换 LOGO / 浏览器标签图标

```bash
# 加载页 LOGO（本地文件或 URL 都行）
bash components/loading/vanvy/install-loading.sh --container emby \
     --logo https://img.example.com/logo.png

# 浏览器标签图标（独立设置；也可 --no-favicon 保留 Emby 自带）
bash components/loading/vanvy/install-loading.sh --container emby \
     --favicon https://img.example.com/tab.png
```

> 给定 URL 会自动下载并做**图片魔数校验**（下到 404 页会拒绝并降级）；
> 图片过大会**自动压缩**（LOGO → ≤800px，标签图标 → ≤256px）。

### JAV 演员名映射（简体 ⇄ 繁体/日文）

本地演员名是简体 `弥生美月`，而 JavDB 上是 `彌生美月` / `弥生みづき` 时，
**默认全自动**：搜演员 → 取官方名 + 别名 → 逐个试搜作品 → 选标题命中最高的那个名。

```
弥生美月 → 弥生みづき     三上悠亚 → 三上悠亜
桥本有菜 → 新ありな       波多野结衣 → 波多野結衣
```

也可手动指定（写入 `vanvy.env` 的 `VANVY_ACTOR_ALIAS`，或装完改容器内 `vanvy-detail/config.js`）：

```bash
VANVY_ACTOR_ALIAS='{"弥生美月":"弥生みづき"}' bash install-ves.sh --container emby ...
```

### 图片代理（图床被墙时）

向导第 ⑩ 步提供三选一：**跳过** / **已有服务填地址** / **本机一键部署**。
选本机部署时会问你出网代理（HTTP / SOCKS5，可留空直连）：

```
出网代理（HTTP/SOCKS5，可留空=直连；多个用逗号分隔）: socks5h://user:pass@host:1080
代理模式：[1] auto 仅墙外域名  [2] all 全部  [3] none 从不
监听端口 [默认 18098]:
```

---

## 🐳 兼容性

| 项目 | 支持 |
|---|---|
| Emby 版本 | **4.8 / 4.9 / 4.10**（首页容器机制在 4.9 有变化，已做运行时自适应） |
| 部署方式 | Docker（官方镜像 / LinuxServer / 社区版 amilys 等） |
| 操作系统 | UNRAID、群晖、威联通、飞牛 fnOS、普通 Linux |
| 终端要求 | Bash 4.0+、`docker` 可用（可选 `curl`/`python3`） |
| 手机端 | 已适配（轮播满屏、按钮不出框、底部无留白） |

> **不改动你的数据**：只往容器内追加 `vanvy-*` 目录并注入少量 `index.html` 引用；
> 每次安装前自动快照，`--uninstall` 一键还原。

---

## 📁 目录结构

```
online-install.sh        在线安装器（curl 一行装）
install-ves.sh           统一安装器（交互向导 / 命令行）
components/
  loading/vanvy/         预热加载页（5 样式 + LOGO/favicon 可换）
  home/banner_home/      首页轮播 · 生产版
  home/hero_studio/      首页轮播 · 6 款（classic/cinema/spotlight/gallery/wave/mosaic）
  home/banner_designer/  首页轮播 · 7 款（neo/glass/orbital/retro/paper/minimal/light）
  features/detail/       详情页 Hero + 播放器 + JAV 增强 + 毛玻璃
  imgproxy/              图片代理（一键部署脚本 + nginx 片段）
lib/                     公共库（manifest / 环境变量 / 引导网址解析）
docs/                    安装部署文档 + 截图
preview/                 样式画廊 + 安装引导页（静态 HTML）
scripts/                 打包 / 发布 / 防回归检查
```

---

## ❓ FAQ

<details><summary><b>装完没变化？</b></summary>

浏览器强制刷新：**Ctrl+F5**（Mac：Cmd+Shift+R）。仍不行就检查是否装到了正确的容器：
`docker ps | grep -i emby` 看容器名，用 `--container <名字>` 重装。
</details>

<details><summary><b>4.9 首页底部有留白 / 按钮被切？</b></summary>

已修复。4.9 的首页是「固定视口高的独立滚动区」，写死 `vh` 会留白；本项目**所有满屏高度都运行时实测**。
若仍异常，请提 issue 并附上 Emby 版本号。
</details>

<details><summary><b>会不会影响 Emby 升级 / 重建容器？</b></summary>

不会。文件挂在 `/system/dashboard-ui/` 内，容器重建后会丢失，重跑一次安装即可；
每次安装都会自动快照，`--uninstall` 可完全还原。
</details>

<details><summary><b>需要我准备什么？</b></summary>

什么都不用。只有 **JAV 增强** 想要完整元数据时才需要自建 MetaTube / AVDB 服务，不搭也能装（自动降级）。
</details>

---

## 📄 License

MIT · 仅供个人自建媒体库美化使用
