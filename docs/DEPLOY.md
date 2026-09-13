# VES 部署手册

> Vanvy Emby Suite · 在任意 Emby（Docker）上部署美化套件
> 适用：UNRAID / 群晖 / 普通 Linux / 任何能跑 Docker 的机器

---

## 〇、两代项目共存（重要）

本项目有**两代**安装入口，互不影响，各自有独立 URL：

| 代数 | 在线安装命令 | 装的是什么 |
|---|---|---|
| **新版（VES）** | `curl -sL https://<域名>/online-install.sh \| bash` | 当前项目（`ves.tar.gz` + `install-ves.sh`） |
| **旧版（emby-kit）** | `curl -sL https://<域名>/scripts/online-install.sh \| bash` | 上一代（`emby-kit.tar.gz` + `install.sh`） |

> 旧版入口**保持可用**，老用户不受影响；新用户走新 URL。
> 旧版源码在本仓库 `legacy/old-top/`（install.sh 等）与 `legacy/old-scripts/`（online-install.sh），
> 旧版发布包 `emby-kit.tar.gz` 仍在分发目录中保留。

---

## 一、快速开始

```bash
# ① 拿到项目
git clone <你的仓库> && cd emby-beautify     # 或解压分发包
# ② 交互式部署（推荐首次）
bash install-ves.sh
```

向导依次问你：**容器 → 功能 → 样式 → 配色 → 毛玻璃 → 每行卡片数 → 后端依赖 → 确认**

---

## 二、环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| Docker | 必需 | 宿主机能执行 `docker ps` |
| Emby | **4.8+**，Docker 部署 | 已在 4.8.11 实测；4.9 兼容；4.10+ 有告警但不阻塞 |
| bash | 4.0+ | 部署机需要 |
| 磁盘 | ~5 MB | 只往容器追加 `vanvy-*` 目录 |
| 网络 | 可选 | 只有 JAV 增强/图片代理需要外网 |

> 安装器会**自动探测**：Emby 版本（走容器内 8096 API）与皮肤路径
> （`/system/dashboard-ui` 等多路径兜底）。

---

## 三、功能模块与参数

### 3.1 六个功能模块

| # | 模块 | 参数 | 说明 |
|---|---|---|---|
| 1 | 预热加载页 | `--lstyle` | LOGO + 预热，消除首屏白屏 |
| 2 | 首页轮播 | `--bstyle` | Hero 大屏轮播 |
| 3 | 详情页增强 | `--perrow` | Hero 接管 + 剧照/演员/更多类似 |
| 4 | 第三方播放器 | — | 15 款播放器一键唤起 |
| 5 | JAV 增强 | 需后端 | 番号/演员/标签/短评/外链 |
| 6 | 毛玻璃 | `--frost` | off / weak / mid / strong |

### 3.2 加载页样式 `--lstyle`

`aurora` 极光 · `cinema` 影院 · `split` 分屏 · `minimal` 极简 · `logo` 纯LOGO
（不填 = **默认极简进度**）

### 3.3 首页轮播样式 `--bstyle`

**HERO 工作室（新开发，推荐）**
`classic` 经典满屏 · `cinema` 电影感 · `spotlight` 聚光 · `gallery` 画廊 · `wave` 波浪 · `mosaic` 马赛克墙

**设计师系列（历史产物）**
`neo` 霓虹 · `glass` 毛玻璃 · `orbital` 太空 · `retro` 复古 · `paper` 纸艺 · `minimal` 极简 · `light` 日光

（不填 = **生产版满屏轮播**）

> 在线预览：
> - 加载页 https://<你的域名>/mockup/loading-gallery/
> - 设计师轮播 https://<你的域名>/mockup/banner-gallery/
> - HERO 新轮播 https://<你的域名>/mockup/hero-gallery/

### 3.4 十套配色 `--theme`

| key | 名称 | key | 名称 |
|---|---|---|---|
| `blackgold` | 黑金（默认） | `amber` | 琥珀金 |
| `aurora` | 极光蓝 | `crimson` | 赤霞红 |
| `champagne` | 香槟金 | `violet` | 幻紫 |
| `emerald` | 翡翠绿 | `graphite` | 石墨灰 |
| `sakura` | 樱花粉 | `sunset` | 落日橙 |

> 配色**一处选择、三模块同步**（加载页 / 轮播 / 详情页共用一个 key）。

---

## 四、可选后端服务

> **不配也能用**，对应子功能自动降级。

### 4.1 JAV 增强

| 服务 | 用途 | 获取 |
|---|---|---|
| **MetaTube** | 番号 / 演员 / 标签 / 发行日期 | https://github.com/metatube-community |
| **AVDB 引擎** | JavDB 搜索 / 短评 / 图片解码 | 自建 JavDB 数据 API |
| **图片代理** | 图床被墙时转发 | 自建 Nginx/CDN 反代，可留空 |

向导会引导填写；也可提前写进 `vanvy.env`（见下）。

### 4.2 TMDB（轮播增强）

轮播本身**不需要** TMDB。若想补全评分/年份走本地 Emby 数据即可。

---

## 五、配置文件 `vanvy.env`

```bash
cp vanvy.env.example vanvy.env
vi vanvy.env
```

| 变量 | 说明 |
|---|---|
| `VANVY_DEPLOY_HOST` / `_PASS` | 远程部署目标（开发用；建议改用 SSH 密钥） |
| `VANVY_PUBLIC_DOMAIN` | 你自己的分发域名（用于图片代理） |
| `VANVY_METATUBE_BASE` | MetaTube 地址 |
| `VANVY_AVDB_BASE` / `_KEY` | AVDB 地址与密钥 |
| `VANVY_IMG_PROXY` | 图片代理对外地址（https://你的域名/vdimg） |
| `VANVY_PROXY_URL` | 图片代理出网代理（HTTP/SOCKS5，逗号分隔多个） |
| `VANVY_PROXY_MODE` | 图片代理走代理范围：`auto` / `all` / `none` |
| `VANVY_IMG_PORT` | 图片代理监听端口（默认 18098） |
| `VANVY_DOC_URL` | 安装引导页地址（默认 `<分发域名>/mockup/setup-guide/`） |
| `VANVY_ACTOR_ALIAS` | 演员别名映射（JSON：本地名 → JavDB 名）；留空=全自动 |
| `VANVY_P2` | 二期增强总开关（`off` = 全部关闭；默认 on） |
| `VANVY_P2_SORT` | ① 剧集正序/倒序（on/off） |
| `VANVY_P2_CASTMENU` | ② 演员头像右键菜单（on/off） |
| `VANVY_P2_MORE` | ③ 内容容器「查看更多」（on/off） |
| `VANVY_P2_SERIESWALL` | ④ JAV 同系列影片墙（on/off） |
| `VANVY_P2_MEDIAINFO` | ⑤ 信息面板 + 完整信息弹框（on/off） |
| `VANVY_P2_HEADER` / `VANVY_P2_HEADERMODE` | ⑥ 顶栏开关 / `glass`（详情·首页透明+媒体库毛玻璃，默认）`clear`（全透明）`solid`（全实心） |
| `VANVY_P2_SERIESLOGO` | ⑦ 单集继承剧集 LOGO（on/off） |
| `VANVY_P2_EXTSITES` | ⑧ 外站全量展示（on/off） |
| `VANVY_P2_TEXTLOGO` | ⑩ 文字徽标 `auto\|always\|never` |
| `VANVY_P2_HIDEPATH` | 隐藏真实路径（on/off，默认 on） |
| `VANVY_P2_ENRICH` | ⑪ 正经库资料增强容器（on/off，默认 on） |
| `VANVY_ENRICH_BASE` | 资料增强服务地址（逗号分隔多地址回退；留空=自动推导） |
| `VANVY_P2_JAVGALLERY` | ⑫ R18 剧照墙（AVDB，on/off） |
| `VANVY_P2_JAVACTOR` | ⑫ R18 演员资料（AVDB，on/off） |
| `VANVY_P2_JAVMAGNETS` | ⑫ R18 磁力面板（AVDB，on/off） |

> ⚠️ `vanvy.env` 已被 `.gitignore` 忽略，**绝不会**进仓库或分发包。

---

## 六、命令行速查

```bash
# 交互式
bash install-ves.sh

# 一条命令
bash install-ves.sh --container emby --features 1,2,3,4,5,6 \
                    --theme blackgold --frost weak --perrow 6 --yes

# 只装轮播（HERO 波浪款）
bash install-ves.sh --container emby --features 2 --bstyle wave --theme violet --yes

# 列出容器
bash install-ves.sh --list

# 卸载（还原 index.html）
bash install-ves.sh --container emby --uninstall
```

| 参数 | 取值 |
|---|---|
| `--container` | 容器名（必填） |
| `--features` | `1,2,3,4,5,6` |
| `--theme` | 见 3.4 |
| `--frost` | `off/weak/mid/strong` |
| `--perrow` | 3-10 |
| `--lstyle` / `--bstyle` | 见 3.2 / 3.3 |
| `--uninstall` / `--list` / `--yes` | — |

---

## 七、持久化与重建恢复 ⭐

**Emby 升级/重建会覆盖 `index.html` → 美化丢失。** 用 `ves-persist.sh` 解决：

```bash
# ① 部署后立刻备份到宿主机
bash scripts/ves-persist.sh save --container emby-302

# ② 查看备份
bash scripts/ves-persist.sh list
bash scripts/ves-persist.sh status --container emby-302

# ③ 容器重建/升级后一键恢复
bash scripts/ves-persist.sh restore --container emby-302

# ④ 可选：安装「自动恢复」钩子
bash scripts/ves-persist.sh hook install --container emby-302
#    然后把打印出的 cron 行挂到宿主机定时任务
```

- 备份位置：`/mnt/user/appdata/ves-backup/<容器>/`（可用 `VANVY_BACKUP_DIR` 覆盖）
- 保留最近 **5 份**，自动清理
- **恢复前**会自动给容器现状拍快照（可回滚）
- 备份内容：`index.html` + 全部 `vanvy-*` 目录 + `meta.json`

---

## 八、打包分发

```bash
bash scripts/build-package.sh --version 2.1.0
```

产出（`dist/`）：
- `ves-2.1.0.tar.gz` — 干净分发包（**不含**密钥/内网信息/开发脚本）
- `ves-2.1.0.sha256` — 校验和
- `ves-2.1.0.manifest.txt` — 文件清单

构建前会**强制**跑泄露扫描，不通过则中止。

---

## 九、在线安装（无仓库）

```bash
curl -sL https://raw.githubusercontent.com/<你的仓库>/main/online-install.sh | bash
```

或本地：
```bash
bash online-install.sh
```

---

## 十、常见问题

**Q：装完没变化？**
Ctrl+F5 强刷。仍无变化 → `docker exec <容器> grep -c vanvy /system/dashboard-ui/index.html`

**Q：加载页不消失？**
会等轮播就绪，最长 12 秒强制淡出（内置兜底）。若一直卡 → 检查轮播是否正常。

**Q：Emby 升级后美化没了？**
正常，用 `ves-persist.sh restore` 一条命令恢复。

**Q：JAV 页面没有番号/演员？**
未配 MetaTube。见第四节。

**Q：支持群晖/裸机吗？**
只支持 **Docker 部署**的 Emby。

**Q：多台 Emby 能一起装吗？**
可以，逐台运行 `--container <各自容器名>`。

---

## 十一、目录结构

```
emby-beautify/
├── install-ves.sh              ← 统一安装器（唯一入口）
├── online-install.sh           ← 在线安装
├── vanvy.env.example           ← 配置模板（复制为 vanvy.env）
├── lib/
│   ├── vanvy-registry.js       ← 共享内核（样式注册/钩子/主题）
│   └── vanvy-env.sh            ← 环境变量加载器
├── components/
│   ├── loading/vanvy/          ← 预热加载页（+ 5 款样式）
│   ├── home/banner_home/       ← 生产版满屏轮播
│   ├── home/hero_studio/       ← HERO 工作室（6 款新布局）
│   ├── home/banner_designer/   ← 设计师系列（7 款）
│   └── features/detail/        ← 详情页 Hero 增强
├── preview/                    ← 三个在线预览页
├── scripts/
│   ├── build-package.sh        ← 打包分发
│   ├── ves-persist.sh          ← 持久化/恢复 ⭐
│   ├── scan-secrets.sh         ← 泄露扫描
│   └── build-preview.sh        ← 重建预览页
├── legacy/                     ← 历史归档（不参与部署）
└── docs/                       ← 文档
```

---

## Emby 4.9 兼容说明（2026-09-13）

4.9 的 `.details-additionalContent` 是 **row + flex-wrap** 容器（4.8 是块级）。
注入块若只用 `max-width` 收窄、不写 `width:100%`，会被 max-content 撑开并溢出被裁。
项目已在 `.vd-sections-host` 等处显式声明 `width:100%`；
防回归检查：`bash scripts/check-detail-width.sh`（非零退出即有问题）。

---

## 外部服务与代理（2026-09-13）

### 连接器（components/imgproxy）—— 一个服务解决「图 / 预告片 / TMDB」
除原有 `/i?u=` 图床外，新增两条通道（同一端口，同一上游代理链）：

| 路由 | 用途 | 说明 |
|---|---|---|
| `GET /i?u=<url>` | 图片代理 | 图床/缩略图（带缓存 + 白名单） |
| `GET /p?u=<url>` | 通用透传 | **直链媒体**（mp4/m3u8 预告片等）→ 浏览器不必自己能出网 |
| `GET /tmdb/<path>` | TMDB API | **服务端持 Key** + 走上游代理 → 外网环境也能用 TMDB 资料增强 |

配置项（`config.json` / 环境变量）：
```jsonc
{
  "proxies": ["http://user:pass@host:port", "socks5h://user:pass@host:1080"],
  "proxy_mode": "auto",             // none | auto(默认,仅 proxy_hosts) | all
  "proxy_hosts": ["youtube.com","googlevideo.com","api.themoviedb.org","image.tmdb.org","dmm.co.jp"],
  "passthrough_hosts": ["dmm.co.jp","spfcas.com","javdb.com"],   // /p 允许的域名
  "tmdb_key": "<你的 TMDB API Key>",  // 配了才开放 /tmdb
  "decoder_base": "http://<AVDB>:38000/api/v1/img-proxy/?url="   // 可选：JavDB 混淆图解码
}
```
环境变量：`VANVY_PROXY_URL`(逗号分隔多个) · `VANVY_PROXY_MODE` · `VANVY_TMDB_KEY` · `VANVY_PASSTHROUGH_HOSTS`

> **普通用户只需一个 HTTP 或 SOCKS5 代理**：填进 `proxies` 并把 `proxy_mode` 设为 `all`，
> 图 / 预告片 / TMDB 就全部走它，浏览器自身不需要挂代理。

### 一键配置（install-ves.sh）
```bash
bash install-ves.sh --container emby-302 \
  --avdb http://192.168.1.10:38000 --avdb-key <KEY> \
  --metatube http://192.168.1.10:28080 \
  --img-proxy https://你的域名/vdimg \
  --proxy "socks5h://user:pass@10.0.0.5:1080" --proxy-mode all \
  --tmdb-key <TMDB_KEY>
```
交互式安装时也会依次询问：AVDB / MetaTube / 出网代理(HTTP/SOCKS5) / 监听端口 / TMDB Key。

### ⚠️ 反向代理注意
上游 img_proxy 自己会返回 `Access-Control-Allow-Origin: *` 并处理 OPTIONS 预检。
**nginx 里不要再 `add_header` 同一个头**，否则响应会出现两个 ACAO → 浏览器直接拒绝
（本项目曾因此导致 `/tmdb` 通道被拦）。
