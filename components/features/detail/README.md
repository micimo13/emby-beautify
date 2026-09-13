# 详情页 Hero 增强（vanvy-detail）

把 Emby 详情页改造成「Hero 接管」结构：满屏背景 + 大海报 + 元数据 + 第三方播放器行 +
剧照 / 演员 / 预告片 / 更多类似 / JAV 专属区块。

---

## 安装

```bash
# 单独安装
bash install-detail.sh --container emby --theme blackgold

# 通过统一安装器（推荐）
bash install-ves.sh --container emby --features 3,4,5,6 --theme blackgold --yes
```

## 卸载

```bash
bash install-detail.sh --container emby --uninstall
```

---

## 目录内容

| 文件 | 说明 |
|---|---|
| `vanvy-detail.js` | 主逻辑（Hero 渲染、区块注入、播放器、JAV 增强、更多类似） |
| `vanvy-detail.css` | 全部样式（作用域 `.vd-*` / `body.vanvy-detail-active`） |
| `install-detail.sh` | 安装/卸载脚本（自动快照 index.html） |
| `icons/` | 15 款第三方播放器 logo |

---

## 部署配置（写入容器内 `vanvy-detail/config.js`）

```js
window.VANVY_DETAIL_CONFIG = {
  theme: 'blackgold',      // 配色 key，见 docs/DEVELOP.md
  frostBlur: 10,           // 毛玻璃模糊 px（0=关）
  frostTint: 0.42,         // 毛玻璃暗度
  hero: true,              // Hero 接管
  hideNativeTop: true,     // 隐藏原生顶部信息块（保留 .trackList 剧集列表）
  showPlayers: true,       // 第三方播放器行
  showJav: true,           // JAV 增强
  javAutoRoute: true,      // 自动识别 JAV 条目
  playersOnlyOS: true,     // 播放器只显示本机可用
  linksCollapsed: true,    // 内容标签默认收起
  perRow: 6,               // 内容行每排卡片数
  maxFanart: 24,           // 剧照最多显示张数
  bgBlur: 6,               // 背景图模糊
  // ↓ 可选后端（不填=对应子功能降级）
  metaTubeBase: '',        // MetaTube 地址
  avdbBase: '',            // AVDB 引擎地址
  avdbKey: '',             // AVDB API Key
  imgProxyBase: '',        // 图片代理地址
  javdbSecretKey: '',      // JavDB 签名密钥（可选）
  actorAlias: {},          // 演员名映射：本地名 → JavDB 名（留空=全自动）
};
```

> 后端参数由 `install-ves.sh` 从 `vanvy.env` 读取或交互式询问写入；
> 手动安装时需自行编辑容器内 `config.js`。

---

## 功能清单

### 基础
- Hero 接管：满屏背景 + 大 LOGO/标题 + 圆形演员头像 + CTA 按钮组
- 首屏边界：正好一屏（`fitHero()` 按真实视口动态算），结尾停在「当前设备…」行
- 剧集页：播出季列表排在最前（`.seriesItemsSection` / `.childrenItemsContainer` 优先）
- 内容行：剧照（点击 Lightbox）/ 演员 / 预告片（页内弹窗） / 更多类似（整页网格）
- 防闪烁：纯 CSS 门控 + `.vd-ready` 就绪类

### 播放器（features 4）
- 15 款真实 logo，点击直接唤起本机播放器
- 5 个开关：仅本机可用 / 图标模式 / 多开 PotPlayer / STRM 直通 / 断点续播
- **偏好持久化**（localStorage `vanvy-p-*`），刷新不丢

### JAV 增强（features 5，自动识别）
- 番号 / 片商 / 系列 / 演员 / 内容标签
- 标签可点击 → 跳该标签的 Emby 列表页
- 演员作品面板：库内（横版 16:10） + JavDB 全部作品（新标签打开）
- **演员名自动映射**：本地简体名 → JavDB 名（在官方名 + 别名里选“标题命中最高的”），
  例：`弥生美月`→`弥生みづき`、`三上悠亚`→`三上悠亜`、`桥本有菜`→`新ありな`；
  可用 `actorAlias` 手动覆盖；自动结果缓存在浏览器 `localStorage`（`vanvy:actorAlias:v1`）
- JavDB 短评（免登录接口）
- 外部站点外链（javdb / javbus / missav / dmm 等按类型智能生成）
- 分段可收起（影片信息 / 演员 / 标签 / 外站 / 短评）

### 毛玻璃（features 6）
- 4 档强度：关 / 弱(10px) / 中(18px) / 强(32px)

---

## 依赖

| 依赖 | 必需? | 说明 |
|---|---|---|
| Emby 4.8+ | ✅ | Docker 部署 |
| MetaTube | ⭕ | JAV 元数据；不填=只显示本地信息 |
| AVDB 引擎 | ⭕ | JavDB 搜索/短评/图片；不填=跳过 |
| 图片代理 | ⭕ | 图床被墙时用；不填=部分图不显示 |

---

## 扩展开发

见 [`docs/DEVELOP.md`](../../docs/DEVELOP.md) 第五节「新增详情页区块」。

---

## 已知坑（改代码前必读）

1. **禁止** `MutationObserver` 监听 body → 观察风暴卡死（用路由拦截 + 轻量轮询）
2. `.topDetailsContainer` 不能整块隐藏 → 会连带干掉季页面剧集列表 `.trackList`
3. `Emby.Page.showItem(id)` **必须传 serverId**，否则不导航
4. Emby 卡片没有 `data-id`，itemId 只能从 `<img src=".../Items/<id>/Images/...">` 提取
5. `Emby.importModule('./modules/imageeditor/imageeditor.js')` —— 路径要带两级
6. 变量命名避开 `esc`（会遮蔽全局 HTML 转义函数）
