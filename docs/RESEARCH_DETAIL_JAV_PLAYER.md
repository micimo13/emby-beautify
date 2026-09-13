# 详情页 / JAV / 第三方播放器 · 深度调研报告

> 2026-09-10 | 虾子🦐 for Marnie✨✨🎊
> 目的：摸清 JAV 元数据与第三方播放器两项「刚需」的现状、资产与深度开发空间

---

## ⚠️ 重要更正（17:17 主人澄清）

主人所指的「JAV 项目」= **[Emby-Javascript-Details (EDE)](https://github.com/XingyiHua2024/Emby-Javascript-Details)**，
即 **Emby 详情页/列表页/演员页 增强脚本集**（不是外网刮削器）。

- **我们本地已有其源码**：`components/features/jav_details/` 与上游文件大小**完全一致**
  （`emby_detail_page.js` 269866 / `actor_page.js` 63162 / `list_page_trailer.js` 30250 / `trailer_more_button.js` 17872）
- 上游 README 标注「最后更新 2025 年 12 月」
- EDE **实际功能**：
  1. **随机推荐**（"更多类似" 随机化）
  2. **剧照展示**（详情页高清 fanart，可排序）
  3. **演员 / 导演作品**展示
  4. **标题翻译**（Google API / 亦可 OpenAI）
  5. **JavDB 内容加载** + 短评（需登录，`javdbSecretKey`）
  6. **Trailer 自动播放**（列表页 hover）
  7. **Trailer 增强**（显示源信息）
  8. **合集页添加影片**
- 部署方式：直接把 `.js` 放 `index.html` 同级 + `config.json`，或 Emby.CustomCssJS，或 `install/patch.sh`
- ⚠️ emby-302 上那个 `ede.user.js` **名不副实**——实际内容是弹幕插件 dd-danmaku v1.42；**EDE 本身并未安装**

### 主人定的开发原则（17:17 / 17:36）
1. **参考** EDE 的功能，但**不要抄**——深度开发成我们自己的实现
2. 也**参考** beautify 里的增强功能（danmaku/douban/playbackrate/…），**同样不抄**
   - 原因：那些增强正是我们项目各种 bug 的来源（全局 DOM 劫持、观察器冲突）
3. **详情页布局**可参考 **aurora 设计稿**的部分设计（`docs/design/aurora.png`）
4. ⚠️ **主人的库是「正经库」**（非 JAV 库）→ EDE 的 JavDB 那套**不适用于其主库**
   - JAV 区必须是**条件模块**：仅当条目被识别为 JAV（标题含番号）才出现；正经库不显示
   - 误判教训：不要把「演员信息」当成「影片 JAV 内容」
5. **第三方播放器**要保留旧版的**真 logo（十几款）+ 完整交互**（开关：仅本机可用/图标模式/多开Pot/STRM直通/断点续播 + 记住上次）

### 详情页设计稿 v1（2026-09-10 已出）
- 在线: `https://github.com/micimo13/emby-beautifydetail/`（真实数据：奥本海默 / 主Emby 4.9.5）
- 配色黑金，与首页一致；两套布局：A 海报左 / B 全宽沉浸
- 首屏：满屏背景图 + 海报/标题/标签/简介/CTA + **第三方播放器条**（15 款真 logo + 5 个交互开关）
- 下方：剧照 / 演员·导演 / 预告片 / 更多类似(随机)
- **JAV 区 = 条件模块** `#javBox`（默认 hidden，标题匹配 `\b[A-Z]{2,6}[-_ ]?\d{2,5}\b` 才显示）
- 实测：正经片→JAV区不显示 ✅；播放器 15 款 logo 全映射 ✅；坏图 0 ✅

---

### 旧版补充（已并入上方）

---

## 一、结论速览

| 能力 | 现状 | 结论 |
|---|---|---|
| JAV 元数据 | kit 有 `jav_details`（客户端刮削）；**MDC-NG 在 UNRAID 运行中** | 有底子，但**方向该换**：从"浏览器现刮"改为"本地数据源" |
| 第三方播放器 | kit 有 `localplayer`（bpking1 版，14 款）；emby-302 装的是**老版** | 基本齐全，需**升级 + 集成进详情页 + 体验增强** |

**核心判断**：客户端刮削（现 jav_details）是**过时路线**——站点改版就挂、CORS/代理麻烦、每次现刮很慢。而我们本地已经有一台**数据引擎**（MDC-NG）没被用起来。

---

## 二、家底盘点

### 2.1 本地 kit 已有

**`components/features/jav_details/`（7109 行）**
- 刮削源 20+：javdb / javbus / javlibrary / dmm / missav / tokyo-hot / 1pondo / caribbeancom / mgstage / heyzo / aventertainments / javtrailers / javsubtitled / 7mmtv / jvrlibrary / jdforrepam / tktube …
- 功能：番号识别、JavDB 短评（需登录）、OpenAI 翻译、演员页、预告片列表、繁体转换
- 配置：`config.json`（adminUserId / openaiApiKey / javdbSecretKey / nameMap）
- ⚠️ 全部是**浏览器端抓取**

**`components/features/localplayer/external-player.js`（31KB）**
- 基于 `bpking1/embyExternalUrl`
- 支持 14 款：PotPlayer / VLC / IINA / nPlayer / MXPlayer / MXPro / Infuse / 恒星 / MPV / 弹弹Play / Fileball / OmniPlayer / FigPlayer / SenPlayer + 复制串流地址
- 特性：按 OS 过滤、图标模式、多开 PotPlayer、STRM 直通、`/seek=` 断点、`/sub=` 字幕

### 2.2 emby-302 当前实际部署（旧式注入）

| 文件 | 实体 | 说明 |
|---|---|---|
| `ede.user.js` (191KB) | **弹幕插件** | chen3861229/dd-danmaku v1.42（文件名误导，非详情增强） |
| `embyLaunchPotplayer.js` (20KB) | 第三方播放器 | **v1.1.0 老版** |
| `actorPlus.js` (4KB) | 演员页增强 | |
| `danmaku.min.js` | 弹幕内核 | |
| `emby-crx/*` | 浏览器扩展 | jquery + config + main |
| ❌ 无 JAV 详情刮削 | — | kit 里那套**没装** |

### 2.3 🏆 UNRAID 上的隐藏资产：MDC-NG（运行中）

`mdcng/mdc:latest`，端口 **9208**，Next.js 应用

**数据（`/config/data/`）**：
| 文件 | 大小 | 内容 |
|---|---|---|
| `mdc_ng.db` | **366 MB** | 主库，**2026-09-10 15:09 刚更新** |
| `Actress.db` | 11 MB | **20,783 女优**：生日/年龄/身高/三围/罩杯/出生地/出道期/简介 |
| — | | **36,842 别名映射**（日文/罗马音/中文） |
| `face_recognition_model.bin` | 1.2 MB | **人脸识别模型** |
| `c_number.json` | 2.3 MB | 番号映射 |
| `mapping_actor.xml` / `mapping_eu_code.json` / `mapping_info.xml` | | 演员/番号/信息映射表 |

**已实测 Actress.db 表结构**：
```
Info (20783 行): Name, Roma, Href, Birthday, Age, Height, Bust, Waist, Hip, Cup, Birthplace, CareerPeriod, ...
Names (36842 行): Alias, Name, Roma
Urls (20783 行): Name, Href, Youma, Wuma, UpdateTime
```

> ⚠️ MDC-NG 的 REST API 走 Next.js server actions，**不是**标准 REST；但它**只读**数据文件（SQLite/JSON），完全可被我们直接消费。

---

## 三、外部生态调研

### JAV 元数据
| 项目 | 形态 | 说明 |
|---|---|---|
| **MetaTube** (`metatube-community`) | Jellyfin/Emby 插件 + 自建 server | 社区事实标准，30+ 提供方，服务端刮削 |
| **OpenAver** (`slive777`) | 桌面应用 | 8 内置源 + Metatube 联邦(30+)，**REST API for AI agents**，今日仍在更新 |
| **MDC-NG** | Docker | 番号识别 + 重命名 + NFO 生成（**我们已在跑**） |

### 第三方播放器
| 项目 | 说明 |
|---|---|
| `bpking1/embyExternalUrl` | **主流方案**（我们的 localplayer 就是它） |
| `red217/EmbyExternalPlayerLauncher` | MPC-HC 专用，较旧 |

**判断**：播放器侧现成方案已足够好，重点在**集成与体验**，不在重造。

---

## 四、深度开发方案（建议）

### 🎯 方向 A：JAV 详情页 —— 从"现刮"改为"本地引擎"

```
Emby 详情页
  → 识别番号（从标题/文件名）
  → 调【自建元数据 API】(FastAPI, 我可开发)
       ├─ 读 mdc_ng.db   → 元数据/演员/系列/标签
       ├─ 读 Actress.db  → 演员资料（三围/生日/出道/简介）
       └─ 番号归一化（mapping_*.xml/json）
  → 渲染富信息卡 + 演员卡 + 预告片
```

**优势**：快（本地毫秒级）、稳（不受站点改版影响）、可缓存、无 CORS 问题

**可做**：
1. **自建元数据 API**（FastAPI，端口如 18096）：`/api/actress/{name}`、`/api/code/{番号}`、`/api/search`
2. **详情页重做**：番号 → 演员卡 → 系列 → 标签 → 评分 → 预告片 → 同类推荐
3. **演员页**：作品墙 + 资料卡（用 Actress.db 的 20,783 条资料）
4. **人脸识别**（模型已在）：截图 → 标注演员
5. **降级策略**：本地 API 挂了 → 回退到 javdb 客户端刮削（保留旧逻辑）

### 🎬 方向 B：第三方播放器 —— 升级 + 集成 + 体验

1. **升级**到最新 bpking1 版（当前 emby-302 是老版 v1.1.0）
2. **集成进详情页**：播放按钮区一手可点（不再藏菜单里）
3. **记住上次播放器**（localStorage）
4. **按 OS 智能过滤**（手机只显示本机可用的）
5. **字幕 / 断点续播 / 多开**已有 → 保留并暴露为开关
6. **黑金主题适配**
7. **直链直通**（配合 AList/strm，第三方播放器直接拉流）

### 📐 详情页整体设计（含上述两块）

```
┌─────────────────────────────────────┐
│  背景大图（可调透明度）               │
│  ┌── 海报 ──┐  片名 (年份) ★评分      │
│  │          │  类型 · 时长 · 分辨率    │
│  │          │  【▶播放】【+收藏】【⋯】  │
│  └──────────┘  ─────────────────     │
│               🎬 第三方播放器 [Pot][VLC][IINA]…│
│               ─────────────────      │
│               🔞 番号 / 演员 / 系列    │  ← JAV 区
├─────────────────────────────────────┤
│  演员卡 · 预告片 · 同类推荐 · 剧照     │
└─────────────────────────────────────┘
```

---

## 五、落地顺序建议

1. **先出详情页设计稿**（含播放器区 + JAV 信息区）→ 主人过目
2. 定稿后实现：先**第三方播放器集成**（快、风险低）
3. 再做**自建元数据 API + JAV 详情区**（工作量大，但价值最高）
4. 最后**演员页 + 人脸识别**

---

## 六、待主人拍板的点

1. 详情页**走哪套风格**？（跟首页黑金一致 / 独立设计）
2. JAV 区**展示到什么程度**？（番号+演员 简版 / 含预告片+同类 全版）
3. 播放器**默认给哪几款**？（14 款全上 / 按需精简）
4. 元数据 API 用 **FastAPI 自建**（我可全包）还是接 MetaTube server？
