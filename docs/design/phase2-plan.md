# VES 二期 · 需求规划与落地评估（2026-09-12）

> ✅ **已全部实施并通过真机验收**（4.8 × 2 台 + 4.9 × 1 台 + 飞牛）
> 实施提交：`5256bd2`（功能）/ `94e473b`（修正）· 设计稿：`docs/design/phase2-design.html`

> 设计稿：`docs/design/phase2-design.html`（可本地打开，或看截图 `docs/design/phase2/*.png`）
> 巡检环境：4.8.11（emby-302 / emby-18）、4.9.5（UNRAID emby / 飞牛 embyserver）

---

## 总览

| # | 需求 | 落地性 | 风险 | 状态 |
|---|---|---|---|---|
| 1 | 剧集列表 正序/倒序 切换 | ✅ 可做 | 低 | **✅ 已实施** |
| 2 | 演员头像右键菜单 | ✅ 可做 | 低 | **✅ 已实施** |
| 3 | 合集页容器「查看更多」 | ✅ 可做 | 低 | **✅ 已实施** |
| 4 | JAV 同系列影片墙 | 🟡 有取舍 | 中 | **✅ 已实施** |
| 5 | 其他信息/媒体信息重设计 + 隐藏路径 | ✅ 已实施 | 中 | **✅ 已实施** |
| 6 | 顶栏毛玻璃/透明 | ✅ 可做 | 低 | **✅ 已实施** |
| 7 | 单集继承剧集 LOGO/名称 | ✅ | 低 | **✅ 已实施** |
| 8 | JAV 外站扩充到 16+ | ✅ 可做 | 低 | **✅ 已实施** |
| 9 | ~~MDC-NG 联动~~ | ❌ | — | **已移除（2026-09-13）** |
| 10 | 无徽标 → 文字徽标 | ✅ 可做 | 低 | **✅ 已实施** |

---

## ① 剧集列表：正序/倒序切换

**现状**：Emby 原生剧集固定升序（S01E01 最左），新集在最右，要滑到底。

**实测**：剧集列表在 `.seriesItemsSection` / `.childrenItemsContainer`，
卡片 class 含 `virtualScrollItem`（**虚拟滚动**）。
分季请求：`/emby/Shows/{id}/Seasons`。

**方案**
- A（选中）：**纯前端重排** —— 给滚动容器加 `flex-direction: row-reverse`
  或 reverse class，视觉反转，不动虚拟列表内部结构；偏好存 localStorage。
- B（备选）：拦截 `ApiClient.getJSON`，对 `Shows/{id}/Episodes` 注入 `SortOrder=Descending`。
  更"真"，但需重新请求 + 有缓存键风险。

**推荐 A**，加切换按钮，默认沿用上次选择。

---

## ② 演员头像右键菜单

**实测**：Emby 暴露 `Emby.App / Emby.Page / Emby.InputManager / Emby.importModule`，
**没有** `Emby.ContextMenu`；原生右键菜单由 itemscontainer 内部处理，外部难以直接调用。
（对合成卡片派发 `contextmenu` 事件不会触出原生菜单。）

**方案**：自建同风格菜单（`.vd-ctxmenu`），右键头像弹出：
- 查看演员页（现有左键行为）
- 编辑元数据 → Emby 路由
- 编辑图片 → Emby 路由
- 刷新元数据
- （JAV）JavDB 全部作品 ← 复用已做好的演员名映射

**待办**：确认 Emby 元数据编辑页的确切路由（`getRoutes()` 返回空，需实机再探一次）。

---

## ③ 合集页容器「查看更多」

**实测**（BoxSet 页）：`linked-Movie-section` / `linkedItems` / `linked-Video-section` /
`.autoScrollSection` 均存在；原生已有 `moreFromSeasonSection` 可参考。
本例 `linked` 容器 1362×329，含 4 张卡。

**方案**：区块标题右侧加统一胶囊按钮「查看更多 ›」，
跳 Emby 列表页（带 `ParentId`/类型筛选，与现有媒体库路由映射逻辑一致）。
无更多内容时自动隐藏按钮。

---

## ④ JAV 同系列影片墙

**数据源已摸清**（AVDB 本地引擎）：

| 接口 | 返回 |
|---|---|
| `movies/{id}` | `series`(id+name) · `series_id` · `series_name` · **`relative_movies`**（带封面）· `actor_movies` · `tags` · `maker` |
| `search?type=series` | 系列列表（id/name/videos_count） |
| `series/{id}` | ⚠️ **只有元数据，无影片列表** |
| `movies/may-also-like` | 返回空 |

**结论**：可做，**零额外请求**（`relative_movies` 就在详情里）。
- 影片墙 = `relative_movies`
- 「查看更多」= JavDB 系列页 `https://javdb.com/series/{series_id}`
- **取舍**：AVDB 无「按系列列片」接口，故影片墙是「同系相近影片」而非严格同系列 → 界面会标注来源。

系列名同样有简/繁/日文差异 → 复用演员那套名称映射（搜系列 → 取官方名 → 过滤）。

---

## ⑤ 其他信息 / 媒体信息 重设计 + 隐藏真实路径

**实测（关键）**：`.audioVideoMediaInfo` 会**直接暴露真实路径**：
```
http://192.168.1.2:8024/smartstrm_fid/天翼158/225483227630457294/资源订阅/综艺/2025 bilibili 跨年晚会/第1篇章：日落 晚会全程回顾.mp4
MP4 | 15.7 GB | 添加于 2026/1/2 9:54 | 4K H264 | 比特率 25mbps | 色域 bt709 | 8 bit | yuv420p …
```
→ 内网地址 + 网盘目录全裸奔（`smartstrm_fid/天翼158/…`）。

**重设计**（已出设计稿）
- 两栏卡片：左「影片信息」（流派 chips / 片商 / 系列 / 数据库链接），
  右「媒体信息」（大号：大小 · 格式 · 分辨率 · 添加日期）
- **路径默认打码**（blur），提供 👁显示 / ⧉复制 按钮
- 编码详情（20+ 行技术参数）折叠到「显示编码详情」开关后
- 默认策略：**全局隐藏真实路径**，可在设置里关

---

## ⑥ 顶部导航栏 毛玻璃/透明

**实测**：`.skinHeader` 131px 高，`background-color: rgba(0,0,0,0)`（本身透明），
实心黑来自子元素 `skinHeader-withBackground`。class 串：
`skinHeader … headerTop skinHeader-withBackground skinHeader-withfulldrawer adjustHeaderForEmbeddedScroll headerTop-withSectionTabs`

**方案**：三档 `实心 / 透明 / 毛玻璃`，默认毛玻璃；
顶部时全透明，向下滚动后淡入玻璃层（`backdrop-filter: blur(18px) saturate(150%)`）。
作用域限定 `body.vanvy-*` 前缀，避免污染 Emby 其它页面。

---

## ⑦ 单集详情页：继承剧集 LOGO / 名称

**实测**：单集条目**已带** `SeriesId` / `SeriesName` / `SeriesPrimaryImageTag`（本例 true）
→ 可直接取剧集 Logo，**无需额外请求**。

**方案**：单集详情页顶部优先级
`单集自身 LOGO` → `剧集 LOGO`（`/Items/{SeriesId}/Images/Logo`）→ 文字；
并显示面包屑「来自剧集 XXX」（可点击回剧集）+ `S01 · E01` 标识。

---

## ⑧ JAV 外部站点扩充

**现状**：代码里写了 16 个站，但**按条件分支只显示其中几个**
（`无码` / `VR` / `普通` 三分支）→ 实际只出 3~6 个。

**方案**：改为**全站点平铺 + 可靠性排序**（能确定的在前，存疑标灰），补齐：
TKTUBE、JavSubtitle（新增）；JavTrailers / SubtitleCat / AVEntertainments / 番号库（已有）；
站点表抽成**单一配置**，后续加站只改一处。

目标站点（16+）：JavDB · JavBus · JavLibrary · MissAV · 7mmtv · DMM · MGStage ·
Tokyo-Hot · Caribbean · 1Pondo · Heyzo · JVR Library · TKTUBE · JavSubtitle · JavTrailers · SubtitleCat

---

## ⑩ 无徽标时：LOGO 容器自动改用「文字徽标」

**现状（代码实情）**：`vanvy-detail.js` 第 339-342 行
```js
var logoTag = (item.ImageTags || {}).Logo;
var logoHtml = logoTag ? '<div class="vd-logo">…' : '';   // ← 没 Logo 就什么都不渲染
```
→ 无徽标的电影/剧集，顶部一大片留白，标题只缩成一个小 chip（`.vd-title-chip`）。

**方案**：无徽标时，LOGO 容器改用**文字徽标**。

优先级链（与 ⑦ 合并，一套逻辑）：
```
① 本条目自身的 Logo 图
② （单集）所属剧集的 Logo 图        ← 需求 ⑦
③ 名称文字徽标（中/英双行，最多 2 行截断）  ← 需求 ⑩
```

**样式规格**（已出设计稿）
| 项 | 值 |
|---|---|
| 字重/字号 | 900 / `clamp(26px, 3.4vw, 44px)` |
| 渐变 | `#fff → #f3e0b0 → #e8c66a`（黑金主题，其他配色跟随主题变量） |
| 行数 | 中文主行最多 2 行（超出省略）；英文名可做副行（小一号、降透明度） |
| 描边/阴影 | `drop-shadow(0 3px 18px rgba(0,0,0,.45))`（不用 text-shadow，避免与 background-clip 冲突） |
| 实现要点 | `-webkit-background-clip: text` + `-webkit-text-fill-color: transparent` + `-webkit-line-clamp:2` |
| 开关 | `useTextLogo: auto （默认，没徽标才用） / always / never` |

**验证**：DOM 实测 4 个文字徽标均 `background-clip:text` 生效、字号正确、无溢出（长标题 2 行截断正常）。

---

## ⑨ ~~MDC-NG~~（已移除 2026-09-13）

> 结论：MDC-NG 不发 CORS、不处理 OPTIONS 预检，浏览器直连必被拦，需额外反代+路径映射，
> 性价比低 → **已移除**。其诉求由「⑪ 资料增强（TMDB）」与「⑫ R18 AVDB 增强」覆盖。

---

## 实施建议

- **第一批（低风险纯前端，可独立开关）**：① ② ③ ⑥ ⑦ ⑧ ⑩
- **第二批（需设计确认/新数据）**：④ ⑤
- 每批次都：改前快照 → 假 docker 干跑 → 真机 Playwright 实测 → `verify-deploy --fix` → 推送 GitHub
