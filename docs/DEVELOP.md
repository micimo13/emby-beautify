# VES 开发指南（扩展开发）

> 面向想**新增样式/模块**的开发者。核心是 `vanvy-core/vanvy-registry.js` 提供的注册表。

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  vanvy-core/vanvy-registry.js      ← 共享内核（最先加载）      │
│    · register(kind,key,def)  样式注册                        │
│    · on(evt,fn) / ready(fn)  生命周期钩子                    │
│    · theme / setTheme(key)   全局配色                        │
│    · config(kind)            读取部署配置                    │
└───────┬──────────────┬──────────────┬───────────────────────┘
        │              │              │
   vanvy-loading   vanvy-home    vanvy-detail
   （加载页）      （首页轮播）   （详情页 Hero）
```

**加载顺序**（`index.html` 里已按此注入）：
```
vanvy-core/vanvy-registry.js      ← head 最先
  → vanvy-loading/config.js + vanvy-loading.js
  → vanvy-home/config.js + vanvy-home.js
  → vanvy-detail/config.js + vanvy-detail.js
```

---

## 二、注册表 API

### 2.1 样式注册

```js
Vanvy.register(kind, key, def)
```

| kind | 用途 | def 字段 |
|---|---|---|
| `loadingStyle` | 加载页样式 | `label`, `css[]`, `mount(el)`, `onFade(el)` |
| `banner` | 首页轮播样式 | `label`, `css[]`, `mount(root,cfg)`, `unmount()` |
| `detailSection` | 详情页自定义区块 | `label`, `order`, `mount(host,item,ctx)` |

### 2.2 生命周期钩子

```js
Vanvy.on('ready',   fn)   // 注册表就绪
Vanvy.on('theme',   fn)   // 主题变更   → fn({key})
Vanvy.on('register',fn)   // 有新的注册 → fn({kind,key,def})
Vanvy.on('loading:done',fn)// 加载页淡出完成
Vanvy.on('*',       fn)   // 通配监听
Vanvy.on('detail:mounted', fn)  // 详情页完成渲染（detail 模块发出）
Vanvy.ready(fn)           // 就绪后执行（等价于 $(document).ready）
```

### 2.3 其它

```js
Vanvy.list('loadingStyle')   // → [{key,label,def}, ...]
Vanvy.get('loadingStyle','aurora')
Vanvy.config('detail')       // → window.VANVY_DETAIL_CONFIG
Vanvy.theme                  // → 'blackgold'（懒读取，config 后加载也能拿到）
Vanvy.setTheme('sakura')
Vanvy.injectCss(['path/to.css'])   // 自动去重、幂等
```

---

## 三、实战：新增一款加载页样式

### 步骤 1 · 建样式文件

```
components/loading/myshine/style.css
```

```css
/* 作用域必须收敛到 #vanvy-loading，避免全局污染 */
#vanvy-loading.vl-style-myshine .vl-bar i {
  background: linear-gradient(90deg, var(--vl-acc), var(--vl-acc2));
  box-shadow: 0 0 18px var(--vl-acc);
}
#vanvy-loading.vl-style-myshine .vl-logo {
  animation: myshine-pulse 2s ease-in-out infinite;
}
@keyframes myshine-pulse {
  0%,100% { filter: drop-shadow(0 0 6px var(--vl-acc)); }
  50%     { filter: drop-shadow(0 0 22px var(--vl-acc2)); }
}
```

> **主题色变量**（已自动注入到 `#vanvy-loading`）：
> `--vl-acc`（主强调色）、`--vl-acc2`（次强调色）、`--vl-bg`（背景色）
> 直接用它们，就能跟随全局主题。

### 步骤 2 · 注册（可选，纯 CSS 可跳过）

新建 `components/loading/myshine/register.js`：

```js
(function () {
  if (!window.Vanvy) return;
  Vanvy.register('loadingStyle', 'myshine', {
    label: '流光',
    css: ['vanvy-loading/styles/myshine.css'],
    mount: function (el) { el.classList.add('vl-myshine'); },
    onFade: function (el) { /* 淡出前清理 */ }
  });
})();
```

### 步骤 3 · 部署

```bash
bash install-ves.sh --container emby --features 1 --lstyle myshine --yes
```

> 部署脚本会自动把 `components/loading/myshine/style.css`
> 复制到容器内 `vanvy-loading/styles/myshine.css`，并在 config 写 `style:'myshine'`。

---

## 四、实战：新增首页轮播样式

放在 `components/home/<你的样式名>/`，包含 `install.sh` + JS + CSS：

```bash
bash components/home/mybanner/install.sh --container emby --theme blackgold
```

约定：
- 样式类名加前缀避免冲突（如 `.vb-*`）
- 读取主题：`Vanvy.theme` 或 `window.VANVY_HOME_CONFIG.theme`
- 就绪通知（**加载页会等这个信号**）：
  ```js
  window.__VANVY_HOME_READY__ = true;
  Vanvy.emit('home:ready', {});
  ```

---

## 五、实战：新增详情页区块

```js
(function () {
  if (!window.Vanvy) return;
  Vanvy.register('detailSection', 'mysection', {
    label: '我的区块',
    order: 50,                       // 数字越小越靠前
    mount: function (host, item, ctx) {
      var sec = document.createElement('section');
      sec.className = 'vd-injected-section';
      sec.innerHTML = '<h2 class="vd-h2">我的区块</h2><div class="vd-strip">…</div>';
      host.appendChild(sec);
    }
  });
})();
```

详情页会在渲染完内置区块后，按 `order` 依次调用已注册的 `detailSection`。

---

## 六、CSS 变量约定（务必遵守）

| 变量 | 作用域 | 含义 |
|---|---|---|
| `--vl-acc` / `--vl-acc2` / `--vl-bg` | `#vanvy-loading` | 加载页主题色 |
| `--vh-accent` / `--vh-accent2` / `--vh-bg` | `.vanvy-home` | 首页轮播主题色 |
| `--vd-acc` / `--vd-acc2` / `--vd-bg` | `:root` | 详情页主题色 |

**新样式不要硬编码颜色**，一律引用上表变量 → 自动跟随全局主题。

---

## 七、颜色预设（10 套，三模块共用）

```js
aurora   { a:'#3ea6ff', b:'#7c5cff', bg:'#08080c' }
blackgold{ a:'#e8c66a', b:'#a8741a', bg:'#070608' }
champagne{ a:'#f2dfa8', b:'#c9a86a', bg:'#08070a' }
emerald  { a:'#10d9a3', b:'#0ea5e9', bg:'#050b0a' }
sakura   { a:'#ff6b9d', b:'#c86dd7', bg:'#0c070c' }
sunset   { a:'#ff9a3d', b:'#ff4d6d', bg:'#0c0805' }
amber    { a:'#ffc93c', b:'#e08e2b', bg:'#0a0805' }
crimson  { a:'#ff4d5e', b:'#a1213f', bg:'#0c0507' }
violet   { a:'#a855f7', b:'#6366f1', bg:'#08060e' }
graphite { a:'#cbd5e1', b:'#64748b', bg:'#0a0b0d' }
```

新增配色：在 `vanvy-detail.js` 的 `PRESETS`、`vanvy-home.js` 的 `CFG.presets`、
`vanvy-loading.js` 的 `CFG.presets` 三处同步添加（保持一致），并在 `install-ves.sh`
的 `THEME_KEYS/THEME_NAMES` 补一项。

---

## 八、敏感信息铁律

```bash
bash scripts/scan-secrets.sh --dist   # 分发前必跑，必须 ✅
```

**规则**：
1. 绝不硬编码内网 IP / 域名 / API Key / Token / 密码
2. 全部走 `vanvy.env`（已 gitignore）→ 由 `lib/vanvy-env.sh` 加载
3. 前端通过 `config.js` 注入（`window.VANVY_*_CONFIG`）
4. 新增环境变量时，同步更新 `vanvy.env.example`

**目录结构**：
```
vanvy.env.example   ← 模板（进仓库）
vanvy.env           ← 真实值（.gitignore，绝不进仓库/分发包）
lib/vanvy-env.sh    ← 加载器（被所有 .sh source）
```

---

## 九、本地开发流程

```bash
# 1. 配置私有环境
cp vanvy.env.example vanvy.env && vi vanvy.env

# 2. 一键部署到开发机
bash scripts/ves_deploy.sh emby-302 --features 1,2,3,4,5,6 --theme blackgold --yes

# 3. 改完再跑一次（幂等，自动快照）

# 4. 卸载
bash scripts/ves_deploy.sh emby-302 --uninstall

# 5. 泄露检查
bash scripts/scan-secrets.sh --dist

# 6. 推送 GitHub（自动替换私密域名）
bash scripts/sync_github.sh
```

---

## 十、兼容性注意

| 点 | 说明 |
|---|---|
| Emby 版本 | 只用稳定 API；4.8/4.9 实测通过，4.10 有兜底探测 |
| 皮肤路径 | 默认 `/system/dashboard-ui`，其他路径可用 `--web-root` 覆盖 |
| 路由 | 用 `Emby.Page.show / showItem`（**必须传 serverId**，否则不导航） |
| 性能 | **禁止**用 `MutationObserver` 监听整个 body（Emby DOM 变动频繁 → 观察风暴卡死主线程）。用「拦截路由 + 轻量轮询」 |
| 防闪烁 | 用**纯 CSS 门控**（`.xxx:not(.ready)` 隐藏原生块），别靠 JS 抢时间 |
| 全局污染 | 所有 CSS 必须收敛到模块根类/ID；JS 挂在 `window.Vanvy*` 命名空间 |
