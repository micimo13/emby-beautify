# VES 维护手册

> 面向维护者：项目结构、健康检查、故障排查、版本升级。

---

## 一、项目健康自检

```bash
# ① 泄露扫描（分发前必跑）
bash scripts/scan-secrets.sh --dist

# ② 语法检查（全部脚本 + JS）
for f in install-ves.sh online-install.sh scripts/*.sh lib/*.sh \
         components/*/*/install*.sh; do bash -n "$f" || echo "❌ $f"; done
for f in lib/*.js components/*/*/*.js components/*/*/*/*.js; do node --check "$f" || echo "❌ $f"; done

# ③ 引用完整性（安装器引用的路径都在）
grep -oE '\$SRC_DIR/components/[a-z_/]+' install-ves.sh | sort -u | while read p; do
  d="${p/\$SRC_DIR\//}"; ls -d ${d}* >/dev/null 2>&1 || echo "❌ 缺失: $d"
done

# ④ 打包冒烟
bash scripts/build-package.sh --check-only
```

---

## 二、项目结构约定

```
components/<类别>/<组件>/
  ├── install-*.sh        安装脚本（--container/--uninstall/--list）
  ├── *.js / *.css        运行时代码
  └── README.md           组件说明（含已知坑）
```

**规则**
1. 组件必须**自包含**：安装脚本、运行时、样式、文档齐全
2. 安装脚本统一支持 `--container` / `--uninstall`，且**幂等**
3. 改动前**快照** `index.html`，保留最近 5 份
4. 组件之间**互斥**的（如三种轮播）要在安装器里显式处理
5. 组件 CSS **不得硬编码颜色**，一律用主题变量：
   - 加载页 `--vl-acc / --vl-acc2 / --vl-bg`
   - 轮播 `--vh-acc / --vh-acc2 / --vh-bg`
   - 详情页 `--vd-acc / --vd-acc2 / --vd-bg`

---

## 三、主题变量贯通（最容易出错）

三个模块各自读取 `window.VANVY_*_CONFIG.theme`，由安装器写入容器内 `config.js`：

| 模块 | config 文件 | 变量前缀 |
|---|---|---|
| 加载页 | `vanvy-loading/config.js` | `--vl-*` |
| 轮播 | `vanvy-home/config.js` 或 `vanvy-hero/config.js` | `--vh-*` |
| 详情页 | `vanvy-detail/config.js` | `--vd-*` |

**新增一套配色**要改 4 处（保持一致）：
1. `components/loading/vanvy/vanvy-loading.js` → `CFG.presets`
2. `components/home/hero_studio/vanvy-hero-core.js` → `PRESETS`
3. `components/features/detail/vanvy-detail.js` → `PRESETS`
4. `install-ves.sh` → `THEME_KEYS` / `THEME_NAMES`

---

## 四、常见故障排查

### 4.1 美化不生效

```bash
# 看注入点数量
docker exec <容器> sh -c "grep -cE 'vanvy-|VANVY-' /system/dashboard-ui/index.html"
# 0 → 没注入成功
```
排查顺序：
1. 浏览器 **Ctrl+F5** 强刷（CSS/JS 缓存）
2. 确认容器内文件在：`docker exec <容器> ls /system/dashboard-ui/ | grep vanvy`
3. 看浏览器 Console 报错
4. 重跑安装器（幂等）

### 4.2 首屏闪烁 / 卡顿

- **禁止** `MutationObserver` 监听整个 body（Emby DOM 变动频繁 → 观察风暴 → 主线程卡死）
- 防闪烁用**纯 CSS 门控**（`:not(.ready)` 隐藏原生块），别靠 JS 抢时间
- 这是本项目踩过的坑，见 `docs/DEVELOP.md`

### 4.3 主题色不生效

- 检查组件 CSS 是否硬编码了颜色（应为 `var(--vh-acc)` 等）
- 检查 JS 是否在 `slide()` 里又写了一遍值，**覆盖 CSS**
- 检查 `config.js` 是否写入容器

### 4.4 图片 404 (`Items/[object Object]`)

Emby 的 `ApiClient.getImageUrl(itemId, opts)` **第一参数要 id 字符串**，传对象会得到
`/Items/[object%20Object]/...`。统一用 `api.img(item, opts)` 封装。

### 4.5 预览页显示正常但真机坏了

**mock 必须模仿真实 API 签名**，否则"假的通过"。本项目因此踩过两次。

---

## 四点五、Emby 版本兼容（4.8 / 4.9 / 4.10）

### 首页容器机制不同（已适配）

| 版本 | 首页布局 | 影响 |
|---|---|---|
| **4.8** | 内容在 `body` 正常流动，后续区块紧跟 | 写死 `vh` 也能铺满 |
| **4.9** | `.homeSectionsContainer` 是**固定视口高的独立滚动区**（absolute），内部区块带 `padded-top-page` | ⚠️ hero 写死 `86vh` 会**底部留白**（实测差 126px） |

**解决办法（已实现，勿回退）**：hero 高度**不写死 `vh`**，改为运行时实测：

```js
// vanvy-hero-core.js → fitHero()   /   banner_home → fitHomeHeight()
// 找最近纵向滚动容器 → avail = min(容器下边缘, 视口底) - hero 顶
// → 写入 CSS 变量 --vh-hero-h
sec.style.setProperty('--vh-hero-h', H + 'px');
```
```css
/* 样式里统一用变量，100svh 兜底 */
height: var(--vh-hero-h, 100svh);
```

> 同一个坑在**详情页**也踩过（`100vh` 硬编码 → `fitHero()` 动态算）。
> **规则：任何"满屏"高度都必须运行时实测，不要依赖 `vh`。**

### ⚠️ 移动端媒体查询是最容易漏的地方（2026-09-12 踩到）

桌面端修好了，**移动端 `@media` 里的写死高度把实测变量又盖回去了**：

```css
/* ❌ 桌面用变量，移动端写死 —— 4.9 手机底部留白 169px */
@media (max-width: 620px) { .vanvy-hero-mosaic .vhm { height: 80vh; } }

/* ✅ 移动端同样用实测变量（前一条是旧浏览器兜底） */
@media (max-width: 620px) { .vanvy-hero-mosaic .vhm { height: 80vh; height: var(--vh-hero-h, 80svh); } }
```

实测数据（UNRAID emby 4.9.5 / 390×844）：`--vh-hero-h` 已算对 = 844px，
但 `.vhm` 被移动端规则覆盖成 `80vh`=675px → **底部留白 169px**。

**自检脚本（已接入 `build-package.sh`）**：

```bash
bash scripts/check-hero-height.sh     # 扫出所有写死满屏高度，rc=1 即有漏
```

> 另：hero 根节点不要出现**重复的** `height` 声明（`height: var(...); height: 100svh;` 会把变量盖掉）。
> `banner_neo` 曾带全局 `html,body{height:100%;overflow:hidden}`，注入 Emby 后会**冻结整页滚动** —— 已改为根节点自身高度。

### 改动后必须双版本回归

```bash
# 4.8
bash install-ves.sh --container emby-302 --features 2 --theme blackgold --yes
# 4.9
bash install-ves.sh --container embyserver --features 2 --bstyle mosaic --yes
# 两端都量：hero 高度应 == 视口高度，gap == 0
```

---

## 五、Emby 升级后处理

```bash
# 一键恢复
bash scripts/ves-persist.sh restore --container <容器>

# 或重装（幂等）
bash install-ves.sh --container <容器> --features 1,2,3,4,5,6 --theme blackgold --yes
```

建议在部署后**立刻** `ves-persist.sh save`，并挂上 `hook install`。

---

## 六、仓库瘦身（历史 blob 清理）

当前 `.git` 仍含历史大文件（设计稿 PNG / 示例图 / 旧 tar.gz）。如需彻底瘦身：

```bash
# ⚠️ 会重写历史，务必先备份 + 通知协作者
pip install git-filter-repo
git filter-repo --strip-blobs-bigger-than 200K

# 之后强制推送
git push --force
```

> 分发包不受影响（`build-package.sh` 用白名单，只带运行必需文件）。

---

## 六点五、防「发旧包」三重保险 🔒

> **踩过的坑**：改完 bug 修了代码，但**忘了重新打包** → 用户装到的还是旧版。
> 这类问题肉眼看不出来，必须靠机制。

### 保险 ①：打包前检查（build-package.sh）

打包时会检查**会进分发包的文件**是否有未提交改动：

```bash
bash scripts/build-package.sh --version 2.1.0
# 若有未提交改动 →
#   [!] 以下【会进分发包】的文件尚未提交：
#          M lib/vanvy-registry.js
#   [X] 为避免发出「与仓库不一致的包」，已中止。   ← 退出码 2
```

确认无误要强行打包时用 `--force`（包内会标记 `git_dirty: true`）。

### 保险 ②：包内构建戳（BUILD.json）

每个包内置：

```json
{
  "built_at": "2026-09-12T00:37:45+08:00",
  "git_branch": "main",
  "git_head": "c95848ac...",
  "git_head_short": "c95848ac",
  "git_dirty": 0,
  "components": { "hero_core": "3.3.0", "registry": "2.0.0", "img_proxy": "2.0" }
}
```

一眼就能看出「这包是哪次提交、包含哪个版本的组件」。

### 保险 ③：巡检脚本（verify-deploy.sh）

```bash
bash scripts/verify-deploy.sh          # 人看
bash scripts/verify-deploy.sh --quiet  # 机器读（cron）
bash scripts/verify-deploy.sh --fix    # 自动重新打包并发布
```

它做三件事：
1. 比对**包内 git 戳**与仓库 HEAD
2. **重新构建一次做逐文件 diff**（忽略 BUILD.json）← 最强校验，能抓出"改了没打包"
3. 比对**预览页组件版本**

退出码：`0`=一致 · `1`=不一致 · `2`=环境问题

### 自动巡检（cron，已配置）

```
*/30 * * * * flock -n /tmp/deploy_guard.lock \
  bash .../emby-beautify/scripts/deploy_guard.sh >/dev/null 2>&1
```

- 每 30 分钟跑一次，**发现落后就 TG 告警**（6 小时冷却，不刷屏）
- 手动自检：`bash scripts/deploy_guard.sh --force-notify`
- 自动修复：`bash scripts/deploy_guard.sh --auto-fix`
- 日志：`/tmp/deploy_guard.log`

> **规则：改完代码 → 跑一次 `verify-deploy.sh --fix`（或让 cron 自动发现）。**
> 别再依赖"我记得要打包"。

---

## 七、发布流程

```bash
# 1. 确认工作区干净
git status

# 2. 自检
bash scripts/scan-secrets.sh --dist

# 3. 更新版本号（可选）
#    改 README 里的版本 & CHANGELOG

# 4. 打包（会自动拦截「有未提交改动」的情况）
bash scripts/build-package.sh --version 2.1.0

# 4.5 发到分发目录后，立刻自检
cp dist/ves-2.1.0.tar.gz /vol1/1001/web/ves.tar.gz
bash scripts/verify-deploy.sh          # 必须显示 🎉 一致

# 5. 提交
git add -A && git commit -m "release: v2.1.0"

# 6. 分发
#    上传 dist/ves-2.1.0.tar.gz 到你的分发域名
```

---

## 八、性能与安全基线

| 项 | 基线 |
|---|---|
| 主线程 | 无长任务；轮询间隔 ≥180ms；不监听 body |
| CSS 作用域 | 全部收敛到 `.vanvy-*` / `.vd-*` / `.vh*-*` / `#vanvy-loading` |
| 主题 | 零硬编码颜色 |
| 泄露 | `scan-secrets.sh --dist` 必须 ✅ |
| 快照 | 每次改动前自动，保留 5 份 |
| 动画 | 必须有 `prefers-reduced-motion` 降级 |
