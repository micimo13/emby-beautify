# 🎨 Vanvy Emby Kit V2

> Emby 网页美化 — 纯净部署 · 方案驱动 · 运行时主题 · 版本自适应

## ✨ 特性

- **单点注入**：一行 loader 管理全部美化，卸载/升级/换方案零残留
- **纯净优先**：部署前可还原纯净 html（4 级来源兜底），杜绝污染冲突
- **10 套方案**：影院黑金 / 极光 / 分屏 / 霓虹赛博 / 玻璃拟态 / 复古胶片 / 极简 / 轨道 / 白昼 / 封面流
- **运行时主题面板**：右下角 🎨 按钮，实时调色/圆角/阴影/毛玻璃/卡片风格/布局/字号，每用户独立
- **版本自适应**：4.8/4.9/4.10 自动识别，不兼容项自动隐藏
- **一键卸载还原**：--all / --reset / --restore-pure / --restore-backup

## 🚀 安装

```bash
curl -sL https://api.github.com/repos/micimo13/emby-beautify/scripts/online-install.sh | bash
```

## 📚 文档

- [使用文档](docs/USAGE.md)
- [配置获取指引](docs/CONFIG_GUIDE.md)
- [项目管理章程](docs/PROJECT_CHARTER.md)

## 🏗️ 项目结构

```
emby-kit-v2/
├── install.sh              # 主安装器 (检测/基底/方案/部署)
├── uninstall.sh            # 一键卸载/还原
├── lib/                    # detect / restore / deploy / persist / common
├── runtime/                # loader / skin / panel / carousel-core / themes.css
├── profiles/               # 10 套方案 (profile.json + profile.js)
├── components/             # 14 款轮播组件 + 功能组件
├── scripts/                # online-install / 生成工具
└── docs/                   # 使用文档 + 配置指引
```

## 🧪 技术架构

- **皮肤激活引擎**：用户媒体路由白名单 → `html.vanvy-skin-active`，管理后台天然零黑化
- **零内联残留**：JS 只维护 class，不写 style 属性（杜绝切页残留 bug）
- **CSS 变量驱动**：所有可调参数走 `--vanvy-*` 变量，面板 setProperty 实时改
- **持久化**：amilys 钩子自愈 / 官方 --restore

## 📜 许可

仅供个人学习使用，请勿商用。
