# 🎨 Vanvy Emby Kit V2 — 使用文档

> Emby 网页美化 · 纯净部署 · 方案驱动 · 运行时主题

## 一、快速安装

```bash
curl -sL https://api.github.com/repos/micimo13/emby-beautify/scripts/online-install.sh | bash
```

安装器自动完成：
1. **环境检测** — 识别容器 / 镜像 / 版本 / html 纯净度
2. **基底选择** — 还原纯净 html 再部署（推荐，小白安全）或增量部署
3. **方案选择** — 10 套方案任选（版本自动过滤）
4. **部署** — 单点注入一行 loader，Ctrl+F5 刷新生效

## 二、可用方案

| 方案 ID | 名称 | 轮播 | 主题色 |
|---|---|---|---|
| cinema-blackgold | 🎬 影院黑金 | CINEMA 21:9 画幅+胶片帧条 | 黑金 |
| aurora | 🌌 极光蓝紫 | AURORA 极光光晕 | 蓝紫 |
| split | 📐 分屏深海 | SPLIT 左海报右信息面板 | 深海 |
| neo | 🧪 霓虹赛博 | NEO 霓虹灯管+扫描线 | 黑金 |
| glass | 💎 玻璃拟态 | GLASS 毛玻璃层叠 | 冰蓝 |
| retro | 📼 复古胶片 | RETRO VHS 噪点+日期戳 | 琥珀 |
| minimal | 📰 极简杂志 | MINIMAL 超大排版 | 石墨 |
| orbital | 🪐 轨道环绕 | ORBITAL 星空+轨道卡片 | 紫 |
| light | 🌅 白昼浅色 | LIGHT 浅色清新 | 暖阳 |
| homeswiper | 🎠 封面流 | HomeSwiper 主图+缩略图联动 | 黑金 |

## 三、运行时主题面板

安装后，用户界面右下角出现 **🎨 悬浮按钮**：

- **色调**：6 预设色块 + 自定义取色器
- **主题**：深色 / 浅色 / 跟随 / 幻紫 / 琥珀 / 石墨
- **边框**：无 / 细 / 粗
- **圆角**：无 / 小 / 默认 / 大 / 超大
- **阴影**：滑块 0-100
- **毛玻璃**：透明度滑块
- **卡片风格**：扁平 / 立体 / 玻璃 / 黑金
- **布局**：垂直 / 折叠 / 水平
- **字号**：90-130%
- **保存 / 重置 / 导出 / 导入**配置

> 所有调整**实时生效**，自动保存到浏览器 localStorage，每用户独立。

## 四、功能增强（方案内置）

| 功能 | 说明 |
|---|---|
| JAV 元数据美化 | Javdb 刮削 / 番号识别 / 演员作品 / 翻译 / 预告片 |
| 弹幕 | 多源弹幕（B站/抖音等），开箱即用 |
| 豆瓣/Bangumi 评分 | 详情页显示评分 |
| 播放倍速 | 快捷键调倍速 |
| 第三方播放器 | 调用 PotPlayer / mpv |
| 播放页增强 | OSD 布局 / 音量条适配 |
| Fluent 布局 | 侧边栏浮层 / 透明顶栏 / 毛玻璃标签 |
| 深色皮肤层 | 全局纯黑 + 卡片质感 + 主题色强调 |
| 全局字体 | Plus Jakarta + HarmonyOS + 霞鹜文楷 |
| 详情增强 | 剧照 + 预告片 + 相似影片 + 演员作品 |
| 远程路径助手 | 显示远程资源路径并复制 |

## 五、版本兼容

| 组件 | Emby 4.8 | Emby 4.9+ |
|---|---|---|
| 全部方案轮播 | ✅ | ✅ |
| HomeSwiper（变种）| ✅ | ✅ |
| 功能增强 / 主题面板 | ✅ | ✅ |

安装器自动检测版本，不兼容项自动隐藏。

## 六、卸载 / 还原

```bash
# 卸载全部美化（保留持久化）
bash uninstall.sh --container <名> --all

# 完全还原（清持久化 + 恢复纯净 html）
bash uninstall.sh --container <名> --reset

# 只还原纯净 html
bash uninstall.sh --container <名> --restore-pure

# 列出备份
bash uninstall.sh --container <名> --list-backups
```

## 七、容器重建后恢复

```bash
bash install.sh --container <名> --restore
```
amilys 镜像会自动写启动钩子，重建后自动恢复。

## 八、常见问题

**Q: 设置页/管理后台变黑？**
A: 皮肤只在用户媒体路由激活（白名单），管理后台天然不受影响。若异常请 Ctrl+F5 强刷。

**Q: 换方案怎么操作？**
A: 修改 index.html 中 loader 的 `data-profile` 属性，或清浏览器 localStorage 后重装。

**Q: 主题面板不见了？**
A: 确认在用户媒体页面（首页/电影/剧集），且已登录。面板只在 `vanvy-skin-active` 状态显示。
