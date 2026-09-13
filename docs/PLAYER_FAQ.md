# 🎬 第三方播放器 (PotPlayer / MPV) 配置 FAQ

> 配合 Kit 内置 `localplayer` 组件使用（external-player.js）
> 经验吸收自: [bpking1/embyExternalUrl](https://github.com/bpking1/embyExternalUrl) + [xueayi/Emby-Plugin-Quick-Deployment](https://github.com/xueayi/Emby-Plugin-Quick-Deployment)

## 核心条件（缺一不可）

第三方播放器按钮要生效，需要**前端脚本** + **本地协议处理器** 双端就绪：

1. **前端（Web UI）**: Kit 的 `localplayer` 组件已在详情页注入播放按钮 ✅
2. **协议（本地电脑）**: 必须安装播放器及其协议处理器，否则点击无反应

---

## MPV

### mpv-handler 注册（必须）
- 项目: https://github.com/akiirui/mpv-handler
- 按 README 配置，确保 `mpv://` 协议已关联到本机 MPV
- 检查: 浏览器地址栏输入 `mpv://test` 应能唤起 MPV

### Windows 快速安装
```powershell
# 下载 mpv-handler 最新 release
winget install mpv-handler  # 或手动下载 zip
# 运行后按提示注册协议
```

---

## PotPlayer

### 推荐版本
- **务必使用 PotPlayer 官方最新版**（注册表关联完整性最好）
- 字幕支持: 完美调用外挂字幕。若网页端未选特定字幕，默认加载同目录中文外挂字幕

### 点击无反应 → 修复
99% 情况是**注册表关联丢失**：
```powershell
# 方法 1: 重新安装官方最新版安装包（自动修复关联）
# 方法 2: 手动检查协议
reg query HKEY_CLASSES_ROOT\potplayer  # 应存在
```

### 中文乱码
PotPlayer 官方版对 URL 编码的中文标题可能显示乱码 — 属播放器本身问题，等官方修复。

### 多开支持
默认 PotPlayer 单实例。如需多开，编辑 `external-player.js` 第 186 行附近 potplayer:// 启动参数，**删除 `/current`**。

---

## 常见问题

### Q: 点播放器图标没反应？
A: 99% 是本地没装协议处理器：
- MPV → 检查 mpv-handler 是否注册
- PotPlayer → 重装官方最新版

### Q: 按钮没显示？
A: 检查 Kit 组件是否已装：`bash uninstall.sh --container <名> --list-backups` 确认注入，或重跑安装选 localplayer。

### Q: 播放报错/黑屏？
A: 检查 `useRealFileName` 配置（external-player.js 顶部）——它依赖 nginx-emby2Alist 的 location rewrite，如原始链接播放失败请关闭此选项。

### Q: 移动端能用吗？
A: external-player.js 内置 OS 检测（Android/iOS/macOS/Windows），按系统隐藏不适用按钮。移动端建议直接用 Emby 官方播放器。

---

## 排查清单

```bash
# 1. 确认组件已注入
docker exec <容器> sh -c "grep -c 'ExternalPlayersBtns\|external-player' /system/dashboard-ui/index.html"

# 2. 浏览器 F12 → Network，点播放按钮看是否发起 potplayer:// / mpv:// 请求
# 3. 本地测试协议:
#    - PotPlayer: 浏览器地址栏 potplayer://test
#    - MPV:       浏览器地址栏 mpv://test
```
