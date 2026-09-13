# VES 部署指南（用户版）

> Vanvy Emby Suite · 预热加载页 / 首页轮播 / 详情页 Hero / 第三方播放器 / JAV 增强 / 毛玻璃
> 支持 Emby 4.8 / 4.9 / 4.10（Docker 部署）

> 🌐 **安装引导（图文教程）**：https://github.com/micimo13/emby-beautify#readme
> 样式效果预览：https://github.com/micimo13/emby-beautify
> （自建分发时把域名换成你自己的；安装脚本会用 `--doc-url` / `VANVY_DOC_URL` 自动打印该地址）

---

## 一、前置条件

| 项目 | 要求 | 说明 |
|---|---|---|
| Docker | 必需 | 宿主机上能执行 `docker ps` |
| Emby | 4.8+ | Docker 方式安装（裸机/群晖套件不支持） |
| 磁盘 | ~5 MB | 只往容器里追加 `vanvy-*` 目录 |
| 浏览器 | 现代版 | Chrome/Edge/Safari 最新版 |
| Bash | 4.0+ | 部署机需有 bash（群晖/UNRAID/普通 Linux 均可） |

> **不影响原有数据**：只修改容器内 `/system/dashboard-ui/index.html` 并新增目录，卸载可完全还原。

---

## 二、可选组件：你需要准备什么

**只有你想启用对应功能时才需要准备。不准备也能装，只是该功能自动降级。**

### 1. 预热加载页（必选其一：品牌 LOGO）

| 准备项 | 必需? | 说明 |
|---|---|---|
| 品牌 LOGO `brand.png` | ⭕ 可选 | 透明底色 PNG，建议宽 400-800px。**不提供则用 Emby 默认外观** |
| 浏览器标签图标 `favicon.png` | ⭕ 可选 | 标签页小图标，建议 128×128 透明 PNG。**不提供则自动用 `brand.png`**；也可选「不替换」保留 Emby 自带 |

**放置位置**：组件目录 `components/loading/vanvy/logos/<容器名>/brand.png`
（`<容器名>` = 你的 Emby 容器名，如 `emby`；也可放 `logo/` 作为通用）

> 加载页 LOGO 与浏览器标签图标是**两项独立设置**：交互向导会分别问你，
> 也可用命令行参数 `--logo <文件或URL>` / `--favicon <文件或URL>` / `--no-logo` / `--no-favicon` 分别指定。
> **两种来源都可以**：本地图片文件，或直接给**图片 URL**（部署时自动下载，下载走 `VANVY_PROXY_URL` 代理回退）。

---

### 2. 首页轮播（可选：TMDB 增强）

| 准备项 | 必需? | 说明 |
|---|---|---|
| TMDB API Key | ⭕ 可选 | 用于补全影片海报/年份/评分。**不填 = 只用 Emby 本地数据**（功能正常） |

**如何申请 TMDB Key**：
1. 注册 https://www.themoviedb.org/
2. 访问 https://www.themoviedb.org/settings/api → 申请 API Key（免费）
3. 填入部署向导，或写进 `vanvy.env` 的 `VANVY_TMDB_KEY`

> ⚠️ TMDB 在中国大陆需代理才能访问，否则该增强自动失效（不影响其它功能）

---

### 3. 详情页增强（无需额外准备）

Hero 结构、剧照、演员、更多类似等全部基于 **Emby 自身接口**，开箱可用。

---

### 4. 第三方播放器（无需额外准备）

内置 15 款播放器真实调用协议（PotPlayer / IINA / VLC / Infuse / MPV / nPlayer …）。
点图标即唤起本机播放器，无需服务端。

---

### 5. JAV 增强（可选：需要自建后端服务）

> **这是唯一需要自己搭服务的模块。** 不搭也能用，但只能显示 Emby 本地已有的信息，
> 拿不到番号/演员/标签/短评/外链。

| 服务 | 用途 | 必需? | 获取方式 |
|---|---|---|---|
| **MetaTube** | JAV 元数据（番号、演员、标签、发行日期、封面） | ⭕ 强烈建议 | 开源的 Emby/Jellyfin 刮削插件服务，见 https://github.com/metatube-community |
| **AVDB 本地引擎** | JavDB 搜索 / 短评 / 剧照图片解码 | ⭕ 可选 | 自建 JavDB 数据 API（见你所用引擎的文档） |
| **图片代理** | 把被墙的图床图片转到可访问地址 | ⭕ 可选 | 自建 Nginx/CDN 反代，或留空（部分图不显示） |

**部署时向导会引导你填写**，形如：
```
是否配置后端服务？[y/N]: y
  MetaTube 地址（留空跳过）: http://192.168.1.10:28080
  AVDB 地址（留空跳过）:     http://192.168.1.10:38000
  AVDB API Key:             xxxxxxxx
  图片代理地址（可留空）:     https://your-domain.com/vdimg
```

> 💡 想看**不接后端**的效果？可以直接装，JAV 页面会显示 Emby 本地信息 + 基础外链。

#### 演员名不一致怎么办（简体 ⇄ 繁体/日文）

本地 Emby 演员名可能是简体（如 `弥生美月`），而 JavDB 上是繁体/日文（`彌生美月` / `弥生みづき`）。
**默认全自动**：搜演员（能认简体名）→ 取官方名 + 别名 → 逐个试搜作品 → 选“标题命中最高的”那个名，
并按该名过滤掉全文本搜索的噪声结果。

实测（本地库）：

| 本地名 | 自动解析为 | JavDB 演员页 | 作品 |
|---|---|---|---|
| 弥生美月 | 弥生みづき | `/actors/Jekq` | 21 条 ✅ |
| 三上悠亚 | 三上悠亜 | `/actors/Av2e` | 11 条 ✅ |
| 桥本有菜（已改名） | 新ありな | `/actors/RJM8` | 22 条 ✅ |

手动指定（可选，优先于自动）：
```bash
VANVY_ACTOR_ALIAS='{"弥生美月":"弥生みづき","三上悠亚":["三上悠亜","三上悠亞"]}' \
  bash install-ves.sh --container emby --features 5 --theme blackgold --yes
# 写成 vanvy.env 里的 VANVY_ACTOR_ALIAS 也行
```
也可以装完直接改容器内 `vanvy-detail/config.js` 的 `actorAlias` 字段，然后强刷。

> 自动结果缓存在浏览器 `localStorage`（key `vanvy:actorAlias:v1`），第二次打开秒出；
> 想重新适应：控制台 `localStorage.removeItem('vanvy:actorAlias:v1')`。

---

### 6. 二期增强（无需额外准备 · 默认全开）

| # | 功能 | 说明 |
|---|---|---|
| ① | **剧集正序/倒序** | 剧集/季列表右上角切换，偏好存本地；Emby 用虚拟列表 → 走数据层倒序 |
| ② | **演员头像右键菜单** | 右键头像 → Emby 原生菜单（编辑元数据 / 修改图像 / 刮削 / 刷新） |
| ③ | **内容容器「查看更多」** | 合集/剧集页的影片、视频容器右上角跳对应列表页 |
| ④ | **JAV 同系列影片墙** | 取 JavDB 关联影片（零额外请求），带「查看更多」到系列页 |
| ⑤ | **信息面板重设计** | 卡片化 + 路径默认**打码** + 「查看完整信息」弹框（全部字段） |
| ⑥ | **顶栏** | **详情页/首页透明**（满屏背景上最好看）；**媒体库等原生页毛玻璃**（与侧栏一致 `blur(18px) saturate(1.25)`）；模式 `glass`（默认）/`clear`（全透明）/`solid`（全实心） |
| ⑦ | **单集继承剧集 LOGO** | 单集无徽标时用所属剧集 Logo + 「来自剧集 XXX」面包屑 |
| ⑧ | **外站全量 16+** | 不再按番号类型只显示几个；存疑站点置灰标注 |
| ⑩ | **无徽标 → 文字徽标** | 自身 Logo → 剧集 Logo → 名称文字徽标（金色渐变） |

> 开关：`vanvy.env` 里 `VANVY_P2=off` 全关，或 `VANVY_P2_SORT=off` 等逐项关（详见 docs/DEPLOY.md）。

### 7. ~~MDC-NG 联动~~（已移除 · 2026-09-13）

MDC-NG 联动按钮**已从项目中移除**（主人 2026-09-13 决定）。原因：MDC-NG 自身不发 CORS 头、
不处理 OPTIONS 预检，浏览器跨端口直连必被拦，需要额外维护 nginx 反代与路径映射，性价比低。

**替代方案**：详情页已内置两套更简单的资料增强，覆盖了原本想从 MDC 拿的信息：
- **正经库**：`CFG.p2.enrich`（本机 TMDB 聚合服务 → 剧照/演员/预告/同类）
- **R18 库**：`CFG.p2.javGallery` / `javActorProfile` / `javMagnets`（本地 AVDB 引擎，浏览器直连）

详见 `docs/ENRICH_RESEARCH_20260913.md`。

### 8. 毛玻璃背景（无需额外准备）

纯 CSS 效果，5 档强度可选。

---

## 三、安装步骤

### 方式 A · 在线安装（推荐）

```bash
# 1. 把项目下载到部署机（或直接在项目目录下执行）
# 2. 交互式向导（推荐首次使用）
bash install-ves.sh
```

向导会依次询问：
```
① 选择目标容器         → 自动列出 emby-* 容器
② 功能多选             → 1,2,3,4,5,6（或只装想要的）
③ 加载页样式           → 默认 / aurora / cinema / minimal / split / logo
④ 浏览器标签图标       → 用加载页 LOGO / 单独指定 / 不替换
⑤ 配色（10 套）        → 黑金 / 极光蓝 / 香槟金 / 翡翠绿 …
⑥ 毛玻璃强度           → 关 / 弱 / 中 / 强
⑦ 每行卡片数           → 默认 6
⑧ 后端依赖（JAV）      → MetaTube / AVDB / 图片代理
   图片代理三选一：跳过 / 已有服务填地址 / 本机一键部署
   本机部署时会问：出网代理（HTTP/SOCKS5）→ 模式 → 端口 → 对外地址
⑨ 确认摘要 → 开始部署
```

### 方式 B · 一条命令（老手）

```bash
bash install-ves.sh --container emby --features 1,2,3,4,5,6 \
                    --theme blackgold --frost weak --perrow 6 --yes
```

### 方式 C · 配置文件（批量/自动化）

```bash
cp vanvy.env.example vanvy.env
vi vanvy.env          # 填好容器、域名、后端地址
bash install-ves.sh --container emby --features 1,2,3,4,5,6 --theme blackgold --yes
```

---

## 四、参数速查

| 参数 | 取值 | 说明 |
|---|---|---|
| `--container` | 容器名 | Emby 容器（必填） |
| `--features` | `1,2,3,4,5,6` | 1加载页 2轮播 3详情页 4播放器 5JAV 6毛玻璃 |
| `--theme` | 见下表 | 全局配色（三模块共用） |
| `--frost` | `off/weak/mid/strong` | 毛玻璃强度 |
| `--perrow` | 3-10 | 详情页内容行每排卡片数 |
| `--lstyle` | `aurora/cinema/minimal/split/logo` | 加载页样式（不填=默认极简） |
| `--bstyle` | 见轮播列表 | 首页轮播样式（不填=生产版满屏） |
| `--doc-url` | 网址 | 指定安装引导页地址（不填=自动推导/看 docs） |
| `--favicon` | 图片路径或 URL | 单独指定浏览器标签图标（png/ico/jpg/svg） |
| `--no-favicon` | — | 不替换标签图标（保留 Emby 自带） |
| `--proxy` | 代理URL | 图片代理出网代理（HTTP/SOCKS5，逗号分隔多个） |
| `--proxy-mode` | `auto/all/none` | 图片代理走代理范围 |
| `--proxy-port` | 端口 | 图片代理监听端口（默认 18098） |
| `--imgproxy` | — | 部署时顺带安装本机图片代理 |
| `--img-proxy` | 网址 | 直接指定图片代理对外地址 |
| `--uninstall` | — | 卸载并还原 |
| `--list` | — | 只列出 emby 容器 |
| `--yes` | — | 跳过确认（自动化用） |

### 10 套配色

| 序号 | key | 名称 |
|---|---|---|
| 1 | `aurora` | 极光蓝 |
| 2 | `blackgold` | 黑金（默认） |
| 3 | `champagne` | 香槟金 |
| 4 | `emerald` | 翡翠绿 |
| 5 | `sakura` | 樱花粉 |
| 6 | `sunset` | 落日橙 |
| 7 | `amber` | 琥珀金 |
| 8 | `crimson` | 赤霞红 |
| 9 | `violet` | 幻紫 |
| 10 | `graphite` | 石墨灰 |

---

## 五、安装后

1. 浏览器 **Ctrl+F5 强制刷新**（清 CSS/JS 缓存）
2. 手机端同样需要下拉刷新

---

## 六、卸载 / 回滚

```bash
# 卸载全部组件（自动还原 index.html）
bash install-ves.sh --container emby --uninstall
```

每次安装都会自动快照 `index.html`，保留最近 5 份：

```bash
# 手动回滚到某次快照
docker exec emby sh -c 'cp /system/dashboard-ui/.bak-vanvy-<时间戳>/index.html /system/dashboard-ui/index.html'
```

---

## 七、常见问题

**Q：装完没变化？**
A：Ctrl+F5 强刷。仍无变化 → 检查 `docker exec <容器> grep vanvy /system/dashboard-ui/index.html`

**Q：加载页一直不消失？**
A：检查是否装了首页轮播。加载页会等轮播就绪，最长 12 秒后强制淡出（已内置兜底）。

**Q：JAV 页面没有番号/演员信息？**
A：说明未配置 MetaTube。见「二、5」。

**Q：JavDB 图片不显示？**
A：需要图片代理（图床被墙）。留空则跳过，页面其它内容正常。

**Q：影响 Emby 升级吗？**
A：Emby 升级会覆盖 `index.html` → 美化失效。**升级后重新运行一次安装即可**（幂等，不会重复注入）。

**Q：支持群晖/裸机 Emby 吗？**
A：目前只支持 Docker 部署的 Emby。

---

## 八、安全说明

- 本项目**不上传任何数据**，所有配置存在浏览器 localStorage + 容器内 `config.js`
- 后端地址/密钥只写在你自己的 `config.js` 里，**不经过任何第三方服务器**
- 分发包**不含**任何作者私密信息（已用 `scripts/scan-secrets.sh` 校验）
