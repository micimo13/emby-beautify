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

- 🎬 换上**沉浸式首页轮播**（经典 / Fluent / Banner 三选一）
- 🎨 一键应用 **7 款毛玻璃主题** + Vanvy 品牌定制
- ⚡ 叠加 **10 个功能增强**（弹幕 / 豆瓣评分 / 倍速 / 剧照 / JAV 元数据 / Fluent布局 / 字体…）
- 🎯 **轮播内容策展**（carousel-rules.json：每日推荐 / 近期上映 / 高分精选 / 优先置顶）
- 🛡️ **自动识别镜像环境**，官方版 / LinuxServer / 社区版通吃
- 💾 **持久化存储**，容器重建后一键恢复

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
curl -sL https://api.github.com/repos/micimo13/emby-beautify/scripts/online-install.sh | bash

# 网络可直连 GitHub 时，也可用官方源
curl -sL https://raw.githubusercontent.com/micimo13/emby-beautify/main/scripts/online-install.sh | bash

# 零交互快速安装（全家桶）
curl -sL https://api.github.com/repos/micimo13/emby-beautify/scripts/online-install.sh | bash -s -- --package full --yes

# 指定容器 + 指定组件
curl -sL https://api.github.com/repos/micimo13/emby-beautify/scripts/online-install.sh | bash -s -- --container emby --feature danmaku
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

## 🎠 首页轮播（三选一）

| 风格 | 效果 | 适配版本 |
|---|---|---|
| 🎠 经典轮播 | Backdrop 大图 + 信息 + LOGO，8 秒自动滚动 | 4.8 |
| 🎠 Fluent 轮播 | 无缝循环 + 左右导航 + 失败自动清理 | 4.8 / 4.9 |
| 🎠 Banner 轮播 | Banner 横幅图 + 随机排序 + 按钮控制 | 4.8 / 4.9 |

## 🎨 主题美化（毛玻璃互斥，可叠加品牌主题）

| 主题 | 效果 |
|---|---|
| 🍇 石墨黑 / 🔵 冰川蓝 / 🟣 极光紫 | 深色系毛玻璃质感 |
| 🟢 翡翠绿 / 🩷 樱花粉 / 🟠 琥珀金 | 彩色系毛玻璃质感 |
| 👑 **Vanvy 定制** | LOGO 替换 / 椭圆标签 / 简介弹框 / 剧集列表 / 播放页 |

## ⚡ 功能增强（12 个）

| 组件 | 功能 |
|---|---|
| 🎠 封面流轮播 | Swiper 封面流: 主图+缩略图联动 (可选, 与 3 款轮播互斥) |
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

## 🎠 轮播选择（4 款互斥）

| 风格 | 特点 | 版本 |
|---|---|---|
| 🎠 经典轮播 | 全宽大图 + Logo + 信息 | 4.8 |
| 🎠 Fluent轮播 | Fluent 风格 + 自动播放 | 4.8, 4.9 |
| 🎠 Banner图轮播 | 横幅图 + 随机 + 按钮 | 4.8, 4.9 |
| 🎠 封面流轮播 | Swiper 封面流: 主图+缩略图联动 | 4.8, 4.9 |

安装封面流轮播：
```bash
bash install.sh --container <名> --feature banner_homeswiper --yes
```

## 🛡️ 备份与冲突防护

- 首次安装自动备份**出厂原始 index.html**（时间戳栈）：`bash uninstall.sh --list-backups` 查看，`--restore-backup <时间戳>` 恢复
- 安装前自动**外部插件冲突预检**（emby-crx / dd-danmaku / embyExternalUrl / Home-Swiper / Emby-Fluent）
- 轮播组件版本不兼容时自动 fallback 到兼容风格（4.8→经典，4.9→Fluent）

## 🪟 双模部署

同一套组件支持两种部署方式：

### 1. 服务端注入版（默认，全端生效）
```bash
bash install.sh --package full --yes
```

### 2. Chrome 扩展版（免改服务端，单浏览器生效）
```bash
bash scripts/build_extension.sh   # 生成 extension/vanvy-emby-kit-extension.zip
```
Chrome → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择 `extension/` 目录

> 扩展版自动装配：轮播策展 + Fluent 布局 + 全局字体，规则文件仍从服务端读取（同源 fetch）

## 🖥️ Windows 部署（非 Docker）

Emby 跑在 Windows 上时，用 PowerShell 安装器（功能对等 bash 版）：
```powershell
# 管理员 PowerShell, 先停止 Emby Server 服务
.\install_plugins.ps1 -Package full        # 全家桶
.\install_plugins.ps1 -Style banner_fluent -Features danmaku,douban
.\install_plugins.ps1 -Uninstall           # 卸载
```

## 🎬 第三方播放器 FAQ

PotPlayer / MPV 调用问题（协议注册 / 乱码 / 多开 / 排查清单）：见 [docs/PLAYER_FAQ.md](docs/PLAYER_FAQ.md)

---

## 🏗️ 架构设计

```
emby-beautify/
├── install.sh              # 主安装器（交互 + CLI）
├── uninstall.sh            # 卸载/还原（--all/--only/--reset）
├── lib/
│   ├── detect.sh           # 环境识别（镜像类型/Web目录/版本/内置美化）
│   ├── manifest.sh         # 组件注册表（声明式）
│   ├── common.sh           # 注入/去重/备份工具
│   └── persist.sh          # 持久化（钩子 / restore 双模式）
├── core/                   # 核心库（vanvy-core.js + jquery/md5）
├── components/
│   ├── home/               # 轮播（三选一互斥）+ carousel_rules 策展
│   ├── themes/             # 毛玻璃主题 + Vanvy 定制
│   └── features/           # 功能增强（12个）
├── extension/              # Chrome 扩展版 (MV3, 双模部署)
├── install_plugins.ps1     # Windows PowerShell 安装器
├── scripts/
│   ├── gen_carousel_rules.py  # 轮播策展规则生成器（可 cron）
│   └── build_extension.sh     # 打包 Chrome 扩展
└── docs/
    ├── RESEARCH_4PROJECTS.md  # 4 项目调研报告
    └── PLAYER_FAQ.md          # 第三方播放器 FAQ
└── scripts/
    └── online-install.sh   # 在线安装入口
```

### 设计原则

- **精准注入**：只注入你选择的组件，绝不误装
- **幂等安装**：重复运行不会重复注入
- **自动识别**：镜像类型 / Web 目录 / 版本自动探测
- **安全备份**：每次注入前自动备份 index.html

---

## 🧪 兼容性

| 镜像 | Web 目录 | 持久化方式 |
|---|---|---|
| 官方版 `emby/embyserver` | `/system/dashboard-ui` | `--restore` |
| LinuxServer `linuxserver/emby` | `/app/emby/system/dashboard-ui` | `--restore` |
| 社区版 `amilys/embyserver` | `/system/dashboard-ui` | 自动钩子 |

Emby 版本：**4.8 / 4.9**（自动识别）

---

## 🙏 致谢

本项目的美化设计参考了以下优秀的开源项目，在此表示衷心感谢：

| 项目 | 贡献 |
|---|---|
| [emby-crx](https://github.com/Nolovenodie/emby-crx) | 经典轮播设计 |
| [Emby-Fluent](https://github.com/heichaowo/Emby-Fluent) | Fluent 轮播与毛玻璃设计 |
| [dd-danmaku](https://github.com/chen3861229/dd-danmaku) | 弹幕组件 |
| [embyToLocalPlayer](https://github.com/kjtsune/embyToLocalPlayer) | 豆瓣评分与外部播放器方案 |
| [Emby-Javascript-Details](https://github.com/XingyiHua2024/Emby-Javascript-Details) | JAV 详情页 |

其余组件均为本项目自研。

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  <b>Vanvy Emby Kit</b> · Make your Emby beautiful 🎨
</p>
