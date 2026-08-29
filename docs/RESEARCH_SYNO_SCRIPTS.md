# 🔬 深度调研：群晖 Emby 脚本集 vs Vanvy Emby Kit — 冲突分析报告

> 调研角色：前端工程师
> 调研日期：2026-08-13
> 来源：`/volume1/web/www.micimo.love/emby/`（群晖 192.168.100.231）
> 对象：HomeSwiper.js / extrafanart&trailers.js / RememberPlaybackSpeed.js / DefaultMuteVolume.js / HoverGlowEffect.css

---

## 一、结论速览

| 文件 | 定位 | 与我们冲突？ | 集成方式 |
|------|------|:---:|---------|
| **HomeSwiper.js** (236KB) | Swiper 首页轮播（封面流+主图联动） | 🟡 可解决 | ✅ 已集成 (第4款轮播, 改 CommonUtils→HomeSwiperUtils) |
| **extrafanart&trailers.js** (176KB) | 详情页剧照+预告片+JavDB短评+相似影片 | 🟡 低冲突 | ✅ 已集成 detail_extra（jv- 命名空间天然隔离） |
| **RememberPlaybackSpeed.js** | 倍速记忆（跨刷新/重启） | 🟢 无冲突 | ✅ 已融合进 playbackrate |
| **DefaultMuteVolume.js** | 音量记忆（会话音量） | 🟢 无冲突 | ✅ 已融合进 player_enhance |
| **HoverGlowEffect.css** | 卡片 hover 发光+放大 | 🟡 低冲突 | ✅ 已集成 hover_glow（vanvy-glow 前缀） |

---

## 二、逐项深度技术分析

### 1️⃣ HomeSwiper.js — 🟡 可集成（已解决冲突）

**技术形态**：内嵌完整 Swiper 引擎（约 110KB 压缩）+ 自定义封面流逻辑。

**DOM 结构（冲突核心）**：
```
插入点: insertPoint.parentNode.insertBefore(elem, insertPoint)
insertPoint = .sections || .homeSectionsContainer || .verticalSection:first-child || .homeSection:first-child
```
→ **和我们三款 banner 的 prepend 到 `homeSectionsContainer` 首位是同一位置！** 同时装 = 双轮播叠加、布局完全错乱。

**类名冲突**：
| 类名 | HomeSwiper | 我们 banner_classic |
|------|:---:|:---:|
| `.misty-loading` | ✅ 用（loading 遮罩） | ✅ 用（loading 遮罩） |
| `.misty-banner-*` | ❌ | ✅ |

→ **`.misty-loading` 类名直接撞车**。若同时加载，两个 loading 互相覆盖，行为不可预测。

**副作用**：
- `Emby.Page.setTitle("每日推荐")` 改页面标题（会污染浏览器标签/历史）
- 依赖用户手动勾选媒体库（首次弹设置面板），有 `localStorage` 持久化
- 236KB 体积，是 3 款 banner 总和的 2 倍

**结论**：**已作为第 4 款轮播集成**（`banner_homeswiper`）。冲突全部解决：
- 位置冲突 → manifest 互斥机制天然解决（与其他 3 款轮播三选一）
- `CommonUtils` 同名冲突（致命）→ 已改名 `HomeSwiperUtils`（实测 0 残留）
- `Emby.Page.setTitle("每日推荐")` 标题污染 × 2 → 已移除
- 236KB 体积 → 作为可选组件，不选不加载，不影响默认用户
- 另修复 inject_to_index 静默失败 bug（awk 只匹配行首 anchor，单行 html 时注入失败但不报错）

---

### 2️⃣ extrafanart&trailers.js — 🟡 低冲突，可吸收

**技术形态**：单 class `ExtraFanart`，`jv-` 前缀命名空间（`jv-image-container` / `jv-similar-container` / `jv-video-player` / `jv-zoom-*`）。

**功能清单（配置项）**：
- `enableWebLinks` 网络链接容器
- `enableJavdbReviews` JavDB 短评（账号凭据加密存 localStorage）
- `enableSimilarItems` 相似影片（最多 20）
- `enableActorMoreItems` 演员其他作品
- **预告片自动播放**（`createVideoPlayer` + `jv-video-player`）
- 剧照 zoom 大图查看（`jv-zoom-mask` + 左右按钮）

**与我们 stills.js 对比**：
| 维度 | 我们 stills.js | 群晖 extrafanart |
|------|:---:|:---:|
| 定位 | 剧集列表 hover 优化 | 详情页剧照+trailer+短评 |
| 命名空间 | `extrafanart` / `extraFlag` | `jv-*` |
| 页面 | 列表页 | 详情页 |
| 功能重叠 | 几乎为零 | — |

→ **完全不冲突**，`jv-` 与 `extrafanart` 无交集。是纯增量。

**吸收方案**：新增 `detail_extra` 组件，原样保留 jv- 命名空间（已验证不冲突），只把 JavDB 短评做成可选开关（涉及账号，默认关闭）。

---

### 3️⃣ RememberPlaybackSpeed.js — 🟢 无冲突，融合

**技术形态**：单 class，`localStorage` key `emby_playback_speed`，监听 `video` 元素 ratechange + loadedmetadata/canplay/play 事件，**带防重置保护**（10 次×500ms 检查，防止被 Emby 重置为 1x）。

**与我们 playbackrate 对比**：
| 维度 | 我们 playback-speed.js | RememberPlaybackSpeed |
|------|:---:|:---:|
| 功能 | 快捷键调速（左右方向键） | 记忆+恢复倍速 |
| 存储 | ❌ 无 | ✅ localStorage |
| Theater 兼容 | ❌ | ✅ Electron 检测 |
| 冲突 | — | 🟢 无（不同 key、不同事件） |

→ **完美互补**。快捷键调速 + 记忆恢复，可共存。

**吸收方案**：把"记忆+恢复+防重置"逻辑融合进 playback-speed.js（保留快捷键功能），加 `RememberPlaybackSpeed` 部分，存储 key 改为 `vanvy_playback_speed`（避免和群晖版/其他脚本撞 key）。

---

### 4️⃣ DefaultMuteVolume.js — 🟢 无冲突，融合

**技术形态**：sessionStorage key `emby_session_volume`，MutationObserver 监听新 video，`applyVolume` + volumechange 记录。默认新标签页音量 0（静音），带 500ms 锁防覆盖。

**与我们 player_enhance 对比**：player_enhance 是 OSD 布局/音量条适配，无音量记忆 → 无冲突。

**吸收方案**：融合进 player_enhance，存储 key 改为 `vanvy_session_volume`。

---

### 5️⃣ HoverGlowEffect.css — 🟡 低冲突，可吸收

**技术形态**：纯 CSS，**无命名空间**，直接命中 Emby 原生类：
```
div.card.portraitCard .cardBox, div.card.squareCard .cardBox,
div.card.backdropCard .cardBox, div.card.smallBackdropCard .cardBox { ... }
```

**冲突分析**：
- 我们所有主题/组件都带 `vanvy-` 前缀命名空间（`vanvy-fluent .xxx`、`vanvy-label-mode-*`）
- HomeSwiper 用 `.swiper-slide`（Swiper 引擎类）—— 不冲突
- **唯一风险**：我们的 fluent_layout 里也有 `.card:hover { transform: scale(1.05) }`（带 `.vanvy-fluent` 前缀）——与 HoverGlowEffect 的 `.cardBox:hover .cardContent { transform: scale(1.05) }` 作用对象不同（外层 cardBox vs 内层 cardContent），且都受 `!important` 保护，理论上不冲突但**视觉可能叠加放大**（1.05 × 1.05）

**吸收方案**：作为独立 `hover_glow` 组件（CSS-only），自带说明：与 fluent_layout 同用时若视觉叠加，二选一。默认加 `.vanvy-glow` 前缀包裹避免全局污染（比原版更干净）。

---

## 三、冲突矩阵总表

| 组合 | 冲突 | 说明 |
|------|:---:|------|
| HomeSwiper vs 我们 3 款 banner | 🔴 | 同占 homeSectionsContainer 首位 |
| HomeSwiper vs banner_classic | 🔴 | 共用 `.misty-loading` 类名 |
| HomeSwiper vs fluent_layout | 🟡 | fluent_layout 改 section0 卡片，HomeSwiper 替换它 → 视觉错乱 |
| extrafanart vs stills.js | 🟢 | jv- vs extrafanart，零交集 |
| RememberPlaybackSpeed vs playbackrate | 🟢 | 互补 |
| DefaultMuteVolume vs player_enhance | 🟢 | 互补 |
| HoverGlowEffect vs fluent_layout | 🟡 | 可能 1.05×1.05 叠加放大 |

---

## 四、部署方式设计（防冲突）

```
┌─────────────────────────────────────────────────────┐
│  Vanvy Emby Kit · 新增组件部署设计                    │
├─────────────────────────────────────────────────────┤
│ 1. detail_extra (新组件, feature)                    │
│    命名空间: jv- (已验证不冲突)                       │
│    注入: vanvy/features/detail_extra/                │
│    与 stills.js 共存 (不同页面)                       │
│                                                     │
│ 2. playbackrate 融合 RememberPlaybackSpeed           │
│    存储 key: vanvy_playback_speed (改 key 防撞)       │
│    保留快捷键 + 新增记忆恢复                          │
│                                                     │
│ 3. player_enhance 融合 DefaultMuteVolume             │
│    存储 key: vanvy_session_volume (改 key)            │
│                                                     │
│ 4. hover_glow (新组件, CSS-only)                     │
│    加 .vanvy-glow 前缀 (比原版更干净)                 │
│    与 fluent_layout 二选一提示                        │
│                                                     │
│ 5. HomeSwiper ❌ 不集成                              │
│    原因: 位置冲突 + 类名冲突 + 236KB + 改标题         │
│    替代: 后续 banner_fluent 加封面流增强              │
└─────────────────────────────────────────────────────┘
```

**防冲突机制**（沿用现有）：
1. manifest 互斥（style 三选一已挡住 HomeSwiper 类冲突）
2. marker 幂等注入
3. 冲突预检：`detect_external_conflicts` 增加检测 `mySwiper` / `swiperLibraryAccess` / `jv-video-player` marker，提示用户先卸载群晖脚本
4. 存储 key 全部 `vanvy_` 前缀，不与群晖脚本/其他插件撞 key

---

## 五、集成优先级

| 优先级 | 内容 | 工作量 |
|:---:|------|:---:|
| P0 | playbackrate 融合倍速记忆 | 小 |
| P0 | player_enhance 融合音量记忆 | 小 |
| P1 | hover_glow 组件（CSS-only） | 极小 |
| P1 | detail_extra 组件（剧照+trailer+短评开关） | 中 |
| P2 | 冲突预检增强（检测群晖脚本 marker） | 小 |
| ❌ | HomeSwiper 整包集成 | 不做 |
