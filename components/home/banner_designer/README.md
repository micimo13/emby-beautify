# 首页轮播 · 设计师系列（banner_designer）

7 款原创轮播样式，共享一个自包含引擎 `vanvy-carousel-core.js`（只依赖 `window.ApiClient`）。

## 7 款

| id | 名称 | 风格 | 特点 |
|---|---|---|---|
| `banner_neo` | NEO 霓虹赛博 | 赛博朋克 | 霓虹管 + 扫描线 + 网格地面 + 故障毛刺 |
| `banner_glass` | GLASS 毛玻璃 | 现代通透 | 毛玻璃卡片 + 模糊背景 + 细描边 |
| `banner_orbital` | ORBITAL 太空轨道 | 科幻 | 星球轨道 + 星尘 + 光环旋转 |
| `banner_retro` | RETRO 复古胶片 | 怀旧 | 胶片颗粒 + VHS 扫描 + 暖色褪色 |
| `banner_paper` | PAPER 纸艺 | 文艺 | 纸质分层 + 撕边 + 印刷质感 |
| `banner_minimal` | MINIMAL 极简 | 克制 | 超大字排版 + 细线分隔 + 留白 |
| `banner_light` | LIGHT 日光 | 明亮 | 米白暖调（唯一亮色款） |

## 预览

**https://github.com/micimo13/emby-beautifybanner-gallery/**

## 结构

```
banner_designer/
├── vanvy-carousel-core.js       共享引擎（register / getItems / getImageUrl / mount / start）
├── banner_<id>/
│   ├── banner-<id>.js           注册组件（TEMPLATE + render）
│   └── style.css                样式（选择器收敛到 .vanvy-carousel-banner_<id>）
├── mock-data.js / mock-api.js   预览用假数据（生产不加载）
```

## 新增一款

```js
// banner_mine/banner-mine.js
window.VanvyCarouselCore.register('banner_mine', {
  query: { /* 覆盖默认查询 */ },
  render: function (items, root, core) {
    root.innerHTML = '<div class="mine">...</div>';
    // core.getImageUrl(item, {type:'Backdrop', maxWidth:1280})
  }
});
```
CSS 根选择器用 `.vanvy-carousel-banner_mine`。

## 已知坑（移植时踩过）

1. **JS 类名必须与 CSS 前缀一致** —— 移植时 JS 用了通用的 `v2c-*`，而 CSS 用风格前缀（`glass-*`/`retro-*`…），导致样式完全不生效。
2. **必须有内层包裹元素** —— CSS 把背景/网格定义在 `.glass` / `.minimal` / `.neo` 这类内层容器上；若模板只渲染根 div，会高度为 0、背景全丢。
3. 引擎 `mount(id)` 的 id 是**注册名**（`banner_neo`），root 类名是 `vanvy-carousel-` + 注册名。
