# 🎨 Vanvy Emby · 完整前端替换项目

一条命令把整个 Emby 前端替换为 Vanvy 自研前端，支持一键还原。

## 🚀 部署 (UNRAID 上执行)
```bash
# 美化 (交互选择容器)
curl -sL https://emby-beautify.vanvy.top/emby-showcase/scripts/install.sh | bash

# 指定容器
curl -sL https://emby-beautify.vanvy.top/emby-showcase/scripts/install.sh | bash -s -- --container <名字>

# 还原原始 Emby 前端
curl -sL https://emby-beautify.vanvy.top/emby-showcase/scripts/uninstall.sh | bash -s -- --container <名字>
```

## 📁 结构
- `app/` — 自研完整前端
  - `js/emby-api.js` — Emby HTTP API 封装 (登录/数据/图/播放/进度上报)
  - `js/app.js` — 路由+渲染 (登录/首页/媒体库/详情/搜索/播放)
  - `css/app.css` — CINEMA 深紫鎏金主题
- `scripts/install.sh` — 部署 (备份原 index.html → 替换 → 完成)
- `scripts/uninstall.sh` — 还原 (恢复备份 → 删 vanvy-app)
- `showcase/` — 11 套架构×配色概念稿 (设计素材)
- `docs/` — 设计总览墙

## ✅ 功能模块 (已实测)
- 🔐 登录 (Emby 账号认证 + 会话持久)
- 🏠 首页 (大轮播 + 继续观看 + 媒体库 + 最近添加)
- 🎬 媒体库 (电影/剧集浏览, 真实数据)
- 📄 详情页 (简介/海报/演员/季集)
- 🔍 搜索 (Items API 实时搜索)
- ▶️ 播放器 (服务端流 URL + video 播放 + 进度上报)

## 🔧 技术方案
- 纯原生 JS (无框架, 轻量可控)
- 直接对接 Emby HTTP API (4.8 兼容)
- 替换 index.html 加载入口, 彻底替换前端 (非补丁)
- 备份原文件, 一键还原

## 📦 设计方向 (showcase/)
CINEMA 影院 / STREAM 玻璃流 / MAGAZINE 影志 / NEON 赛博 / ZEN 极简
当前实现: CINEMA 深紫鎏金
