# 🌌 预热加载页 · vanvy-loading (A 款 · 极简进度)

进入 Emby 首页前展示的**全屏品牌加载页**：品牌 LOGO + 服务器名文案 + 极简进度线，
**等首页轮播真正就绪后**才平滑淡出，用户进来直接看到成品页面。

## 特性

- **极简进度**风（Apple TV 质感）：LOGO + 文案 + 细进度线 + LOADING
- **文案按服务器名动态显示**：`正在准备 {服务器名} 的媒体库`
- **品牌 LOGO 可替换**（`logo/brand.png`）
- **浏览器标签图标可替换**（`logo/favicon.png`）
- **真预加载**：等大屏轮播首屏图就绪才撤（`__VANVY_HOME_READY__`）
- **登录页自动让路**（不挡登录框）
- 最短展示 1.3s / 最长兜底 12s
- 全程 `try/catch`，出错跳过，绝不影响进首页

## 安装

```bash
# 单独安装（默认极简样式）
bash install-loading.sh --container <容器名> --theme blackgold

# 指定样式变体
bash install-loading.sh --container <容器名> --theme blackgold --style aurora

# 通过统一安装器（推荐）
bash install-ves.sh --container <容器名> --features 1 --theme blackgold --lstyle aurora --yes
```

## 卸载

```bash
bash install-loading.sh --container <容器名> --uninstall
```

## 配色（跟随全局主题）

加载页强调色**与首页轮播 / 详情页同源**，由 `--theme` 一处决定：

| 变量 | 说明 |
|---|---|
| `--vl-acc` | 主强调色（进度条起点） |
| `--vl-acc2` | 次强调色（进度条终点 / LOGO 光晕） |
| `--vl-bg` | 背景色 |

主题 key 写入容器内 `vanvy-loading/config.js`：
```js
window.VANVY_LOADING_CONFIG = { style: 'aurora', theme: 'blackgold' };
```

可用样式变体（`--style`）：`aurora` / `cinema` / `minimal` / `split` / `logo`
（不填 = 默认极简进度）

> 新增样式：见 [`docs/DEVELOP.md`](../../docs/DEVELOP.md) 第三节。

## 换 LOGO

加载页 LOGO 与浏览器标签图标（favicon）是 **两项独立设置**：

```bash
# 加载页 LOGO（本地文件）
bash install-loading.sh --container emby --logo /path/我的logo.png
# 加载页 LOGO（直接给 URL，安装时自动下载；可走 VANVY_PROXY_URL 代理）
bash install-loading.sh --container emby --logo https://img.example.com/logo.png
# 浏览器标签图标（单独指定，png / ico / jpg / svg）
bash install-loading.sh --container emby --favicon https://img.example.com/tab.png
# 不用 LOGO / 不替换标签图标（保留 Emby 自带）
bash install-loading.sh --container emby --no-logo --no-favicon
```

也可以替换 `logo/brand.png`（加载页中央，建议透明 PNG，宽 ~760px）
与 `logo/favicon.png`（浏览器标签，建议透明 PNG，256×256），然后重跑安装。

> 只提供 `brand.png` 时，标签图标会自动取 `brand.png`；
> 都不提供则**不替换**标签图标（保留 Emby 自带的），不会出现空白标签。

## 配置（`vanvy-loading.js` 顶部 `CFG`）

| 项 | 默认 | 说明 |
|---|---|---|
| `textTemplate` | `正在准备 {server} 的媒体库` | `{server}` 替换为服务器名 |
| `textFallback` | `正在准备你的媒体库` | 取不到服务器名时 |
| `brandLogo` | `logo/brand.png` | 加载页 LOGO |
| `brandLogoWidth` | 190 | 显示宽度 px |
| `favicon` | `logo/favicon.png` | 浏览器标签图标 |
| `replaceFavicon` | true | 是否替换标签图标 |
| `minShowMs` | 1300 | 最短展示 |
| `maxShowMs` | 12000 | 最长兜底 |

## 就绪判定逻辑

1. 登录页出现 → **立即让路**（不挡登录框）
2. 检测到首页轮播脚本 → **等 `window.__VANVY_HOME_READY__`**
3. 无轮播 → 原生首页行出现即撤

## 兼容性

Emby **4.8 / 4.9** 实测通过（4.10 待测，失败即跳过）。
