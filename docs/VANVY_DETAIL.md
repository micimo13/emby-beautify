# Vanvy Detail · 详情页 开发与部署文档

> 2026-09-10 | 虾子🦐 for Marnie✨✨🎊
> 状态：**设计稿阶段完成**（未上真机）

---

## 一、目标与需求演进

| 时间 | 需求 | 结果 |
|---|---|---|
| 17:11 | 详情页设计；JAV + 第三方播放器是刚需 | 开始调研 |
| 17:17 | 「JAV」= **Emby-Javascript-Details (EDE)**，参考不抄 | 方向纠正 |
| 17:25 | 先出设计稿 | 正经库设计稿 v1 |
| 17:32 | 播放器要有十几款 **真 logo** + 旧版交互 | 换真 logo + 5 开关 |
| 17:36 | 正经库不该显示 JAV 演员信息 | JAV 区改**条件模块** |
| 17:38 | 用 **emby-18** 测（小电影库） | 真数据设计稿 |
| 17:46 | 背景太花 → 要毛玻璃 | 加 `backdrop-filter` 毛玻璃 |
| 17:49 | ①图标模式失灵 ②毛玻璃默认弱 ③EDE 功能不止演员卡 | 全部修复 + 功能做全 |

---

## 二、🔀 智能路由（核心）

**同一个组件**，按条目类型自动切换两套详情页表现：

```
                     ┌── 识别条目类型 ──┐
                     │                  │
              JAV 特征命中            无 JAV 特征
                     │                  │
             ┌───────▼───────┐   ┌──────▼───────┐
             │  JAV 详情增强  │   │  正经库详情   │
             │  番号/标签/演员│   │  海报/演职员  │
             │  外链矩阵/短评 │   │  剧照/推荐    │
             └───────────────┘   └──────────────┘
```

### 判定信号（按可靠度排序）

| # | 信号 | 说明 | 可靠度 |
|---|---|---|---|
| 1 | `ProviderIds.MetaTube` 存在 | MetaTube 刮削过 → 几乎必是 JAV | ⭐⭐⭐⭐⭐ |
| 2 | 标题匹配番号正则 | `\b([A-Z]{2,6})[-_ ]?(\d{2,5})\b`，如 `SSIS-910`、`FC2-4901244` | ⭐⭐⭐⭐ |
| 3 | `OfficialRating` = `JP-18+` | 日系成人分级 | ⭐⭐⭐⭐ |
| 4 | 媒体库名关键词 | 有码/无码/素人/番号/MADV… | ⭐⭐⭐ |
| 5 | Genres 含 AV 专属标签 | 单体作品/中出し/女优名/片商: xxx | ⭐⭐⭐ |
| 6 | Path 含特征目录 | `/『有码』/`、`/『无码』/` | ⭐⭐⭐ |

**判定策略**：命中 **≥2 条** 或 命中 **#1** → 走 JAV 增强。
非 JAV → 走正经库详情（JAV 块完全不渲染）。

### 实测验证（两库对照）

| 库 | 类型 | 样本 | 判定 | 表现 |
|---|---|---|---|---|
| **emby-302** | 正经库 | 奥本海默 (2023) | 无信号 | ✅ **不显示** JAV 区 |
| **emby-18** | 小电影库 | SSIS-910 | MetaTube+番号+JP-18+ | ✅ 显示完整 JAV 区 |

---

## 三、页面结构

### 3.1 通用（两库共用）

```
┌──────────────────────────────────────────┐
│ 满屏背景图（毛玻璃：blur + 半透明遮罩）     │
│ ┌海报┐  面包屑(电影/剧集 or 🔞JAV)        │
│ │    │  标题 (+番号/分级 badge)            │
│ │    │  ★评分 · 年份 · 日期 · 类型 · 时长   │
│ │    │  [4K][杜比][中字]                   │
│ └────┘  简介…                             │
│         【▶立即播放】【＋收藏】【ⓘ更多】    │
│  ─────────────  第三方播放器  ────────────  │
│  开关: 仅本机可用/图标模式/多开Pot/STRM/断点 │
│  [真logo ×15]                             │
└──────────────────────────────────────────┘
   ↓ 下滑
  剧照 · 演员/导演 · 预告片 · 更多类似
```

### 3.2 JAV 专属块（仅小电影库）

在播放器下方插入 `.jav` 卡片：

| 模块 | 内容 |
|---|---|
| 动作条 | 复制番号 · 复制路径 · 跳转Emby · 翻译标题 · 翻译详情 · 刷新数据 · 加入合集 |
| 信息栅格 | 番号/发行/片长/片商/系列/评分/类型/导演 |
| 内容标签 | 影片**内容**标签（职业装/女大学生/深喉…）可点击筛选 |
| 演员卡 | 头像 + 姓名 + 作品数 → 演员页 |
| **外链矩阵** | **16 站**一键搜索（javdb/javbus/javlibrary/missav/7mmtv/dmm/mgstage/tokyohot/caribbean/1pondo/heyzo/jvrlibrary/tktube/javsubtitled/javtrailers/subtitlecat），**6 个中字站高亮** |
| JavDB 短评 | 星级 + 用户名 + 日期 + 有用数 |

> ⚠️ 关键区分：JAV 区展示的是**影片内容标签**，不是「演员信息」。
> 正经库不应出现此块。

---

## 四、第三方播放器（两库共用）

### 4.1 15 款真 logo

PotPlayer · VLC · IINA · Infuse · nPlayer · MX Player · MX Pro · 恒星播放器
MPV · 弹弹Play · Fileball · SenPlayer · OmniPlayer · FigPlayer · 复制串流地址

图标源：`https://emby-external-url.7o7o.cc/embyWebAddExternalUrl/icons/*.webp`
（与旧版 `external-player.js` 同源；emby-18/302 容器内 `css/icons/` 也有）

### 4.2 5 个交互开关（对齐旧版能力）

| 开关 | 作用 |
|---|---|
| 仅显示本机可用 | 按 OS 过滤（Windows 只留 Pot/VLC/恒星/MPV/弹弹Play/复制） |
| 图标模式 | 只显 logo，隐藏文字 |
| 多开 PotPlayer | 允许多开 |
| STRM 直通 | 跳过服务端处理 |
| 断点续播 | 带 `/seek=` 从上次位置 |

➕ **记住上次播放器**（高亮 + 「上次」金标）

### 4.3 OS 兼容映射

| 播放器 | Windows | macOS | Android | iOS |
|---|---|---|---|---|
| PotPlayer | ✅ | | | |
| VLC | ✅ | ✅ | ✅ | ✅ |
| IINA | | ✅ | | |
| Infuse | | ✅ | | ✅ |
| nPlayer | | | ✅ | ✅ |
| MX / MX Pro | | | ✅ | |
| 恒星播放器 | ✅ | ✅ | ✅ | |
| MPV | ✅ | ✅ | ✅ | |
| 弹弹Play | ✅ | | ✅ | |
| Fileball | | ✅ | | ✅ |
| SenPlayer | | | | ✅ |
| OmniPlayer / FigPlayer | | ✅ | | |
| 复制串流地址 | 全平台 | | | |

---

## 五、毛玻璃背景

```css
.frost{
  backdrop-filter: blur(var(--frost-blur)) saturate(115%);
  -webkit-backdrop-filter: blur(var(--frost-blur)) saturate(115%);
  background: rgba(7,6,8, var(--frost-tint));
}
```

| 档 | blur | tint | 说明 |
|---|---|---|---|
| 关 | 0 | 0 | 原始（太花） |
| **弱（默认）** | 10px | 42% | ✅ 主推 |
| 中 | 18px | 70% | 更净 |
| 强 | 32px | 72% | 极度虚化 |

- 真·`backdrop-filter` 虚化（非调暗背景图）
- 附加 **饱和度 +15%**，避免毛玻璃发灰

---

## 六、设计稿预览地址

| 页面 | URL |
|---|---|
| 正经库（奥本海默 / 主Emby 4.9.5） | `https://github.com/micimo13/emby-beautifydetail/` |
| 小电影库（SSIS-910 / emby-18） | `https://github.com/micimo13/emby-beautifydetail-jav/` |
| 毛玻璃档位 | `.../detail-jav/?frost=0\|10\|18\|32` |

源码归档：`docs/design/detail/detail-legit.html`、`detail-jav.html`

---

## 七、开发原则（主人定）

1. **参考不抄** — EDE 与 beautify 的增强**参考功能**，重写成我们自己的模块化实现
   - 原因：那些增强正是历史 bug 源头（全局 DOM 劫持 + 多观察器冲突）
2. **统一框架** — 单一观察器、命名空间隔离、特性开关、版本探测、失败降级
3. **布局参考 aurora 设计稿**（`docs/design/aurora.png`）
4. **正经库与小电影库分离** — JAV 块条件渲染，绝不污染正经库

---

## 八、真实组件（已落地并双库实测）

### 8.1 文件

```
components/features/detail/
├── vanvy-detail.js      # 逻辑（增强式，不重建原生）
├── vanvy-detail.css     # 样式（.vd- 作用域）
├── icons/*.webp         # 15 款播放器真 logo
└── install-detail.sh    # 安装/卸载/选色
```

### 8.2 部署命令

```bash
bash install-detail.sh --container emby-18  --theme blackgold
bash install-detail.sh --container emby-302 --theme blackgold
bash install-detail.sh --container emby-18  --uninstall
```

注入 `index.html`：`vanvy-detail/{config.js,vanvy-detail.js,vanvy-detail.css}`

### 8.3 架构（关键）

- **增强式**：只在原生 DOM 上追加，不重建页面 → 原生功能零丢失
- **注入点**：播放器插在 `.mainDetailButtons` 之后；JAV 块在其后
- **毛玻璃**：给 `.backdropContainer` 追加 `.vd-frost`（`backdrop-filter`）
- **单一 MutationObserver + 1200ms 轮询**；`try/catch` 全包，失败不挂载
- **⚠️ 踩坑**：Emby 页面里全局 `$` 是 **jQuery**！组件内必须用 IIFE 局部 `$` 遮蔽，否则 `$('.x')` 返回 jQuery 对象（无 `classList`）→ 挂载失败

### 8.4 双库实测结果

| 容器 | 版本 | 条目 | 播放器 | JAV 块 | 毛玻璃 | 坏图 |
|---|---|---|---|---|---|---|
| **emby-18** | 4.8.11 | SSIS-910 | 6 款 | ✅ 显示（16 外链/12 标签/演员） | ✅ | 0 |
| **emby-302** | 4.9.5 | 赌霸 | 6 款 | ✅ **不显示**（智能路由） | ✅ | 0 |

### 8.5 版本差异（重要）

| | 4.8.11 | 4.9.5 |
|---|---|---|
| 详情页根容器 | `.itemView` | `.itemView`（同） |
| 按钮容器 | `.mainDetailButtons` | `.mainDetailButtons`（同） |
| 导航 | `appRouter.showItem(id)` | **`Emby.Page.showItem(id)`** |

> 4.9 路由 API 不同：`appRouter.showItem` 失效，需 `Emby.Page.showItem`。
> 组件本身用 hash + DOM 探测，不受影响。

---

## 九、待办 / 下一步

- [ ] 补 EDE 剩余功能：**系列更多作品**、**全屏剧照查看器**
- [ ] 播放器「真实调用」（现为占位，需接 Emby 原生流地址 + 各播放器协议）
- [ ] JavDB 短评（需登录）接入
- [ ] 4.10 兼容验证
- [ ] 列表页/演员页增强（EDE 其余脚本）
