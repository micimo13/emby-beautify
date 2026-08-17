# 🔧 Emby 美化项目 · 工程师深度解析与 V2 构思

> 角色：技术负责人 · 编制：虾子🦐 · 日期：2026-08-11
> 基于：镜像解包分析（amilys/embyserver:4.8.11.0）+ 6 个开源项目调研 + 事故复盘

---

## 第一部分：开心版镜像机制彻底解析（工程师视角）

### 1.1 amilys/embyserver 完整启动链

```
容器启动
  └─ /init (execlineb) → s6-overlay init-stage1
       └─ services.d/emby-server/run
            ├─ /config/config/ext.sh 不存在？→ cp /etc/ext.sh → /config/config/ext.sh
            ├─ chmod 777 + 执行 /config/config/ext.sh
            │    ├─ MediaId="" → sed 清空 emby-crx/config.js 的 this.parentId
            │    └─ extmod='[]' → sed 清空 ext.js 的扩展插件数组
            ├─ /etc/regoff.sh (开心版注册校验)
            └─ s6-applyuidgid 启动 EmbyServer
```

### 1.2 "轮播消失"根因链（镜像自带三重机制）

| 层 | 内容 | 作用 |
|---|---|---|
| **镜像层** | 内置旧版 emby-crx（main.js md5=70b01825，含 `new Config()`） | 依赖 config.js 白名单 |
| **镜像层** | index.html 已注入 emby-crx 5 个文件（含 config.js） | 新容器天然"已安装" |
| **启动钩子** | ext.sh 用空 `MediaId=""` 清空 parentId | 每次启动把白名单清空 |
| **JS 逻辑** | 旧版 main.js：`parentIds.length===0 → 删除 #theme-css` | 白名单空 → 禁用轮播 |

> **结论：只要用 amilys 镜像，旧版 emby-crx 就是"装好但永远不显示轮播"——除非覆盖成官方版 main.js（不依赖 config.js）。**

### 1.3 ext.sh 的另一半：ext.js 插件机制

```sh
extmod='[]'
sed -i '/\ extmod/s/\[.*\]/'$extmod'/g' /system/dashboard-ui/ext.js
```
- 镜像支持通过 `extmod='["embyLaunchPotplayer","ede.user","actorPlus"]'` 启用内置扩展
- 但默认 `[]` 全部禁用 —— 这是镜像的"扩展开关"

### 1.4 对我们的意义（关键结论）

| 事实 | 应对策略 |
|---|---|
| ext.sh 每次启动都会跑 | **接管它**：把我们的持久化钩子写进 ext.sh（exit 0 前），启动时自动恢复官方版 |
| 镜像内置旧版 emby-crx | **覆盖 main.js**：官方版不依赖 config.js，绕开白名单机制 |
| ext.sh 的 MediaId 清空逻辑 | **保留无害**：官方版 main.js 不读 config.js，清空无影响（或注释掉） |
| ext.sh 的 extmod 开关 | **可复用**：作为镜像自带扩展的开关，文档说明 |

---

## 第二部分：不同镜像的兼容性矩阵（需验证）

| 镜像 | 版本 | 内置 emby-crx? | ext.sh? | 需要绕开的坑 |
|---|---|---|---|---|
| **amilys/embyserver**（开心版） | 4.8/4.9 | ✅ 旧版 | ✅ 清 parentId | 覆盖 main.js + 接管 ext.sh |
| **官方 emby/embyserver** | 4.8/4.9 | ❌ | ❌ | 无（干净，直接注入） |
| **linuxserver/emby** | 4.8/4.9 | ❌ | ❌ | 无（干净） |
| **docker.vanvy.cc 镜像源** | 4.8.11 | ✅ 同 amilys | ✅ | 同 amilys |

> ⚠️ 待验证：不同 tag（如 latest vs 4.8.11.0）、其他开心版（如 emby 中国版）的差异。
> 设计原则：**脚本启动时先"镜像体检"——识别镜像类型 → 检测内置美化 → 给出针对性方案**。

---

## 第三部分：V2 项目构思（独立项目）

### 3.1 项目定位

> **Emby 美化智能管家（EmbyBeautify Manager）** —— 一个能"看懂"各种 Emby 镜像（官方版/开心版/各版本）、自动识别冲突、给出**可落地美化方案**的一键脚本。

### 3.2 核心设计原则（吸收全部教训）

```
1. 智能识别优先 —— 先体检（镜像类型/版本/内置美化/冲突源），再给方案
2. 不猜，要验证 —— 每个组件安装后有部署验证（文件 md5/版本特征）
3. 持久化兜底 —— 所有文件修改走 /config 持久卷 + ext.sh 钩子
4. 可完全还原 —— --reset 恢复镜像原始层，不留痕迹
5. 组件互补不冲突 —— 按"页面区域"划分，冲突检测基于真实 DOM 操作区域
6. 声明式组件库 —— 新增组件只改 manifest，不碰核心逻辑
```

### 3.3 系统架构

```
emby-beautify/                    ← 独立项目
├── install.sh                    # 主入口（交互 + CLI）
├── uninstall.sh                  # 卸载/初始化（--only/--all/--reset）
├── lib/
│   ├── detect.sh                 # 🆕 镜像体检引擎（核心新增）
│   │   ├── detect_image()        #   识别镜像类型（amilys/官方/lsio/自定义）
│   │   ├── detect_version()      #   识别 Emby 版本（4.8/4.9/API）
│   │   ├── detect_builtin()      #   检测镜像自带美化（旧版crx/fluent/home.js）
│   │   ├── detect_ext_hook()     #   检测 ext.sh 机制（清parentId/扩展开关）
│   │   └── detect_conflicts()    #   检测页面区域冲突
│   ├── deploy.sh                 # 部署引擎（注入/覆盖/持久化）
│   ├── persist.sh                # 持久化引擎（/config + ext.sh 钩子）
│   └── manifest.sh               # 组件注册表（声明式）
├── components/                   # 🆕 组件库（按区域分类，每个独立）
│   ├── home/                     # 首页美化（互斥，按版本）
│   │   ├── emby-crx-official/    #   官方版（4.8）
│   │   ├── home-beautify/        #   4.9 版
│   │   └── fluent/               #   Fluent 皮肤
│   ├── themes/                   # CSS 主题（可叠加）
│   │   ├── appleglass/           #   毛玻璃
│   │   ├── embymalism/           #   极简
│   │   └── dark-*/               #   暗色系
│   ├── features/                 # 功能增强
│   │   ├── danmaku/              #   弹幕
│   │   ├── douban/               #   豆瓣评分
│   │   ├── extrafanart/          #   剧照
│   │   ├── playbackrate/         #   倍速
│   │   ├── localplayer/          #   第三方播放器
│   │   └── jav-details/          #   JAV 详情页
│   └── branding/                 # 品牌（Logo/Favicon）
├── scripts/
│   └── online-install.sh         # 在线一键安装
└── docs/
    ├── DESIGN.md                 # 架构文档
    └── COMPATIBILITY.md          # 镜像兼容矩阵
```

### 3.4 镜像体检引擎（V2 灵魂）

```
install.sh 启动
  │
  ├─ ① 识别容器 → docker inspect
  ├─ ② 识别镜像 → 镜像名匹配 (amilys/官方/lsio/自定义)
  ├─ ③ 识别版本 → System/Info/Public API + index.html 特征
  ├─ ④ 体检内置美化 → 检测 emby-crx 旧版/fluent/home.js/config.js
  │     ├─ 有旧版 → 提示"镜像自带旧版, 将覆盖为官方版"
  │     └─ 有 ext.sh 清空逻辑 → 提示"将接管 ext.sh 持久化"
  ├─ ⑤ 生成"适配方案" → 按版本给推荐组件 + 自动排除冲突
  ├─ ⑥ 用户选择 → 安装
  └─ ⑦ 部署验证 → 每个组件装完校验（md5/特征/页面实测）
```

### 3.5 组件冲突模型（按页面区域，而非凭感觉）

| 页面区域 | 互斥组件 | 说明 |
|---|---|---|
| **首页轮播区** | emby-crx / home-beautify / fluent / bannercarousel / loading | 都操作首页 Banner，三选一 |
| **详情页区** | jav / douban / extrafanart / detailtabs / trailer | 都操作详情页，互斥 |
| **全局样式** | 各 CSS 主题 | 可叠加（后加载覆盖） |
| **独立区** | danmaku / playbackrate / localplayer / embytool / branding | 互不干扰 |

> 关键改进：冲突检测不再靠 manifest 里"手工声明 conflicts"，而是**每个组件声明自己操作的"页面区域"**，引擎自动算冲突 —— 更可靠、不易漏。

### 3.6 部署验证清单（每个组件装完必查）

```bash
# 首页美化: 验证 main.js 是官方版 (无 new Config)
grep -q "new Config()" emby-crx/main.js → 失败则报错

# 主题: 验证 css 文件存在 + index.html 注入行存在
# 品牌: 验证图片文件存在 + href 已改
# 持久化: 验证 /config/emby-*-official/ + ext.sh 钩子
# 页面: playwright 实测 .misty-banner 是否渲染 (可选, 有浏览器环境时)
```

---

## 第四部分：开发计划（本地验证 → 主人验收 → 才上传）

### 阶段 1：基础框架（1-2 天）
- [ ] lib/detect.sh 镜像体检引擎（识别 4 类镜像 + 版本 + 内置美化）
- [ ] lib/deploy.sh + persist.sh 重构（吸收旧代码经验）
- [ ] install.sh 交互菜单重构（按体检结果给推荐）

### 阶段 2：核心组件（2-3 天）
- [ ] 首页美化：emby-crx 官方版 / home-beautify / fluent 三选一（自动按版本推荐）
- [ ] 主题：AppleGlass + Embymalism + 暗色系（可叠加）
- [ ] 功能：danmaku / douban / extrafanart / playbackrate / localplayer / jav

### 阶段 3：健壮性（2 天）
- [ ] --reset 完全初始化（镜像层恢复）
- [ ] 持久化钩子（recreate 恢复）全组件覆盖
- [ ] 部署验证全组件
- [ ] 镜像兼容矩阵实测（amilys 4.8/4.9、官方版）

### 阶段 4：验收（1 天）
- [ ] 三台真机完整回归（emby / emby-18 / emby-302）
- [ ] 输出验证报告 → 主人过目
- [ ] 主人点头 → 才建仓库上传

---

## 第五部分：待主人确认

1. **项目名**：EmbyBeautify Manager？还是你有更好的名字？
2. **组件范围**：先做核心 10 个（3 首页美化 + 4 主题 + 6 功能），JAV 详情页这种大的后加？
3. **版本策略**：4.8 和 4.9 都支持，还是先聚焦 4.8（主人的两台）？
4. **测试环境**：可以用 emby-302 做测试机吗？（每次验证前先 --reset 干净环境）
5. **ext.sh 接管**：确认可以修改镜像自带的 ext.sh（加我们的钩子）？

---

*本构思基于对 amilys 镜像的实际解包分析（652MB 导出、启动链追踪），非猜测。请主人评审，通过后开始阶段 1 开发。*
