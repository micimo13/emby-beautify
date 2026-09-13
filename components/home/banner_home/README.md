# 🎠 首页满屏轮播 · banner_home

给 Emby 首页加一个**满屏沉浸式轮播**：按媒体库分组，每库取最新入库影片，自动轮播 + 手动切换，原生首页零改动。

## 特性

- **满屏** 100svh 大图轮播，自适应桌面/平板/手机
- **按媒体库分组**：电影 / 电视剧 / 动漫 / 纪录片 / 综艺 …
- **每库最新 N 条**（默认 8），带质量过滤（去误识别垃圾条目）
- **自动轮播**（默认 6.5s）+ 手动切换（缩略图 / 圆点 / 箭头 / 键盘 / 手机滑动）
- **顶部媒体库 Tab**：点击切库，自动避让 Emby 原生标签栏
- **10 套配色**（部署时选择，无页面控件）
- **原生零破坏**：只在最前面插一块，播放/详情走 Emby 原生路由
- **无缝衔接加载页**：首屏图片就绪后通知预热页淡出

## 安装

```bash
bash install.sh --container <容器名>            # 交互选配色
bash install.sh --container <容器名> --theme blackgold   # 指定配色
```

## 卸载 / 回滚

```bash
bash install.sh --container <容器名> --uninstall
# 或从快照回滚
docker exec <容器名> sh -c \
  'cp /system/dashboard-ui/.bak-vanvy-<时间戳>/index.html /system/dashboard-ui/index.html &&
   rm -rf /system/dashboard-ui/vanvy-home'
```

## 配置（`vanvy-home.js` 顶部 `CFG`）

| 项 | 默认 | 说明 |
|---|---|---|
| `perLib` | 8 | 每个媒体库取几条 |
| `slideMs` | 6500 | 单片停留毫秒 |
| `libMs` | 0 | 自动切库间隔（0=关） |
| `theme` | aurora | 配色 key（被 config.js 覆盖） |
| `backdropOpacity` | 1 | 背景图不透明度 |
| `veilStrength` | 0.55 | 底部渐隐强度（0=不渐隐） |

## 配色预设

`aurora` 极光蓝 · `blackgold` 黑金 · `champagne` 香槟金 · `emerald` 翡翠绿 · `sakura` 樱花粉
`sunset` 落日橙 · `amber` 琥珀金 · `crimson` 赤霞红 · `violet` 幻紫 · `graphite` 石墨灰

## 兼容性

Emby **4.8 / 4.9** 实测通过（4.10 待测，运行时探测兜底，失败不影响原生）。

## 调试 API

```js
VanvyHome.switchLib(2)        // 切到第 3 个库
VanvyHome.setTheme('sakura')  // 临时换色
VanvyHome.presets             // 预设列表
VanvyHome.cleanup()           // 卸载
```
