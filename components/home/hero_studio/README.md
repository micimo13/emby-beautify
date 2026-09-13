# HERO 工作室 · 动态轮播（全新开发）

> 与 `banner_designer/`（历史产物）不同，这里是重新开发的布局。
> 目标：**更强动态 + 更多布局可能**。共享引擎 `vanvy-hero-core.js` v3.1。

## 预览（含媒体库行演示）

**https://github.com/micimo13/emby-beautifyhero-gallery/**

## 布局

| id | 名称 | 结构 | 动态效果 |
|---|---|---|---|
| `classic` | 经典满屏 | 底部对齐文案 + 左右箭头 + 分页点（对齐原始设计稿） | 背景推拉 · 文案逐层上浮 |
| `cinema` | 电影感 | 满屏背景 + 右侧可滚动缩略图轨 | KenBurns · 三层视差 · 逐字标题 · 数字滚动 |
| `spotlight` | 聚光 | 暗场 + 鼠标光斑 + 3D 倾斜海报 | 光斑跟随 · 呼吸光晕 · 悬停浮起 |
| `gallery` | 画廊 | 横向 snap 滚动大图廊（**原生可滚**） | 滚轮/拖拽/触屏 · snap 居中放大 · 背景虚化换图 |
| `wave` | 波浪 | 海报沿正弦曲线起伏排布 | 正弦排布 · 弹性过渡 · 拖拽/滚轮/箭头 · 全屏虚化背景 |
| `mosaic` | 马赛克墙 | **整块 hero = 一张全屏背景图**；文字 + 右侧可滚动卡片列浮于其上 | 背景推拉 · 文案逐层上浮 · 卡片依次翻入 · 悬停放大 |

全部支持：**左右箭头切换** · 分页点 · 键盘 ← → · 触屏滑动 · 悬停暂停 · 自动轮播。

## 主题贯通

引擎在挂载时写入 CSS 变量（与加载页/详情页同源）：

```
--vh-acc / --vh-acc2 / --vh-bg
```

取值来自 `window.VANVY_HERO_CONFIG.theme`（部署时写入）→ 10 套预设。
**组件 CSS 里不得硬编码颜色**，一律用变量。

## 部署

```bash
bash install-hero-studio.sh --container emby --style classic --theme blackgold
# 或统一安装器（自动路由 hero_studio → banner_designer）
bash install-ves.sh --container emby --features 2 --bstyle classic --theme blackgold --yes
```

## 引擎 API

```js
VanvyHero.register(id, { query, init(api), slide(item,i,api), leave(item,i,api) })
VanvyHero.start(id)   // 监听首页路由，自动挂载/清理
```
运动工具：`api.kenBurns(el,i)` `api.parallax(root,layers)` `api.typeIn(el,txt)` `api.countTo(el,n)`；
切页：`api.go(i)/next()/prev()` `api.autoplay(ms)`；主题：`api.theme()`。

## 铁律

1. `ApiClient.getImageUrl(itemId, opts)` 第一参数是 **id 字符串**（用 `api.img()`，别绕过）
2. **mock 必须模仿真实 API 签名** —— 否则"假的通过"（本项目踩过两次）
3. **组件 CSS 用 `--vh-acc` 等变量**，不硬编码颜色
4. 满屏用 `Backdrop maxWidth:1920`；海报 `Primary 560-640`；缩略图 `Thumb`
5. 动画加 `prefers-reduced-motion` 降级
6. **遮罩别太狠** —— 背景图是主角，文字区压暗即可；全局压到 `brightness(.3)` 或 `rgba(...,.94)` 会让背景完全看不见（主人明确反馈过）
7. **全屏背景 = 背景层与 hero 等大（甚至略大 inset:-2%）**，内容/卡片列浮在它上面（自身背景必须透明或用玻璃），不要另做一块带图的面板
