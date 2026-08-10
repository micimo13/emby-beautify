# Emby 美化全家桶 · 重构设计报告

> 作者: 虾子🦐（项目经理视角）| 2026-08-11
> 基于: 2026-08-10 深度调研 + 实际部署教训

---

## 一、问题复盘（为什么现在项目"越改越废"）

### 1.1 核心问题：注入冲突无感知

所有 Emby 美化方案（emby-crx / home-beautify / detailpage / CustomCssJS）都通过**往 index.html 的 `</head>` 前注入 `<script>`/`<link>`** 实现。它们**互不感知**，导致：

| 冲突类型 | 实例 | 后果 |
|---------|------|------|
| **JS 顺序冲突** | detailpage 在 jquery 之前加载 | 依赖 jQuery 的脚本报错 |
| **JS 重复注入** | opencc/detailpage 注入两组 | 重复执行、功能混乱 |
| **CSS 覆盖** | AppleGlass 全局 `.card` 规则 | 覆盖轮播布局 |
| **配置覆盖** | config.js 被空 parentId 覆盖 | 轮播消失 |
| **脚本残留** | 旧版 main.js 与新版混用 | 行为不确定 |

### 1.2 根源

1. **manifest 只有组件声明，没有"注入顺序"和"互斥关系"的强约束**
2. **安装时用"事后警告"而非"事前剔除"**——主人明确要求：冲突组件**不应出现在选项中**
3. **版本混乱**：emby-crx 官方版（自动匹配）vs 魔改版（parentId 白名单）混用
4. **测试污染**：反复安装/卸载/恢复导致容器内文件混乱

---

## 二、参考项目最新调研（2026-08-11 拉取）

| 项目 | 版本 | 注入方式 | 配置方式 | 亮点 |
|------|------|---------|---------|------|
| [emby-crx](https://github.com/Nolovenodie/emby-crx) master | 1.0.4 | `</head>` 前 5 文件 | **无 config，自动匹配所有媒体库**（Recursive:true） | 简单可靠 |
| [emby-home-beautify](https://github.com/rockyzhao3000/emby-home-beautify) | — | `</head>` 前 2 文件 | 无（自动全库） | 4.9 沉浸轮播 |
| [Emby-Javascript-Details](https://github.com/XingyiHua2024/Emby-Javascript-Details) | — | `<head>` 前 + OpenCC CDN | config.json（javdb/OpenAI） | JAV 详情增强 |
| [Emby.CustomCssJS](https://github.com/Shurelol/Emby.CustomCssJS) | — | **服务端插件 + app.js 模块注入** | 管理界面（用户可选脚本） | 最先进的管理方式 |
| [dd-danmaku](https://github.com/chen3861229/dd-danmaku) | — | `</body>` 前 ede.js | 无 | 多源弹幕 |
| [Emby-Fluent](https://github.com/heichaowo/Emby-Fluent) | — | 同 emby-crx | 无 | Fluent 皮肤 |

### 关键结论
1. **官方 emby-crx 无需 config.js**（自动匹配媒体库）——应作为 4.8 标准
2. **冲突根源是注入互不感知** → 需要统一注入管理器
3. **CustomCssJS 的"服务端管理"是最优解**，但依赖插件部署，通用性差
4. **app.js 模块注入**（`Promise.all(list.map(loadPlugin))`）是比 index.html 更干净的注入点

---

## 三、重构方案（两条线）

### 线 1：修复现有项目（前端工程师）

**目标**：当前脚本正确、稳定、无冲突。

1. **manifest 强化**：
   - 每个组件声明 `order`（注入顺序）和 `conflicts`（互斥）
   - **安装菜单生成时，冲突组件直接不显示**（事前剔除，非事后警告）
2. **统一注入引擎**：
   - 按 `order` 排序注入，保证 jquery → 组件 → detailpage 的正确顺序
   - 注入前检测重复（marker 精确匹配）
3. **emby-crx 换官方版**：
   - 用官方 master main.js（自动匹配媒体库，去 config.js 依赖）
   - config.js 改为可选（保留兼容）
4. **主题隔离**：
   - CSS 主题用 `@import` 包裹或作用域限制，避免全局规则冲突
5. **卸载彻底**：
   - 精确匹配本工具管理的所有 marker，清理残留

### 线 2：全新项目（项目经理）

**目标**：更好的兼容性、选择性、配置便捷性、前端美观。

**架构：统一注入管理器 + 插件市场 + 服务端配置**

```
emby-beautify v2 (全新)
├── install.sh            # 交互向导 (manifest 驱动, 冲突事前剔除)
├── lib/
│   ├── manifest.sh       # 插件注册表 (含 order/conflicts/versions)
│   ├── engine.sh         # 统一注入引擎 (顺序/幂等/备份/回滚)
│   ├── detector.sh       # 版本识别 + 冲突检测 + 已装检测
│   └── config.sh         # 配置管理 (自动检测媒体库/账号)
├── plugins/              # 插件市场 (每个插件独立目录)
│   ├── crx/              # emby-crx 官方版
│   ├── home-beautify/    # 4.9 轮播
│   ├── fluent/           # Fluent
│   ├── jav/              # JAV 详情
│   ├── danmaku/          # 弹幕
│   └── ...
├── themes/               # CSS 主题 (作用域隔离)
├── features/             # 功能增强
└── docs/
    └── DESIGN.md         # 设计文档
```

**核心设计决策**：

| 决策 | 方案 | 理由 |
|------|------|------|
| 注入点 | `</head>` 前 + 顺序号 | 兼容所有版本，可控 |
| 冲突处理 | **事前剔除**（菜单不显示冲突项） | 主人明确要求 |
| 配置方式 | 自动检测（媒体库/账号）+ 交互确认 | 通用性 |
| 主题隔离 | CSS 加前缀作用域 / 提供"兼容模式" | 避免全局覆盖 |
| 回滚 | 每次注入前快照，可一键还原 | 安全 |
| 版本 | emby-crx 用官方版（自动匹配） | 消除 config 依赖 |

**插件市场（拟定 20+ 组件）**：
- 首页美化 3：crx / home-beautify / fluent
- CSS 主题 13：Embymalism / Dark×8 / AppleGlass(标注4.10) / Vanvy×2
- 功能增强 12：JAV / 弹幕 / 豆瓣 / 剧照 / 倍速 / 加载 / 路径 / 播放器 / Banner / Tabs / Trailer / 自定义CSS

---

## 四、实施计划

| 阶段 | 内容 | 产出 |
|------|------|------|
| 1 | 线1: manifest 强化 + 统一注入引擎 + emby-crx 官方版 | 修复版脚本 |
| 2 | 线1: UNRAID 实测（3台 emby 全流程） | 验证报告 |
| 3 | 线2: 新架构搭建 + 插件迁移 | v2 骨架 |
| 4 | 线2: 冲突事前剔除 + 配置自动检测 | v2 完整版 |
| 5 | 线2: 设计报告 + 文档 + 效果图 | 交付 |

---

*报告完*
