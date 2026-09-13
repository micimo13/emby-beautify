# Vanvy Detail · 部署手册

> 2026-09-10 | 虾子🦐

---

## 🚀 三种部署方式

### 方式 1：在线一键（推荐，最省事）

在 **UNRAID / 装了 docker 的宿主机**上执行：

```bash
bash <(curl -sL https://github.com/micimo13/emby-beautify/vanvy-detail-install.sh)
```

脚本会：
1. 自动列出所有 emby 容器 → 让你选
2. 下载组件包
3. 弹配色菜单（黑金/极光蓝/香槟金/翡翠绿/樱花粉/落日橙）
4. 注入 + 快照

**非交互**（适合脚本/批量）：
```bash
CONTAINER=emby-18 THEME=blackgold \
  bash <(curl -sL https://github.com/micimo13/emby-beautify/vanvy-detail-install.sh)
```

**卸载**：
```bash
CONTAINER=emby-18 bash <(curl -sL https://github.com/micimo13/emby-beautify/vanvy-detail-install.sh) --uninstall
```

---

### 方式 2：本地脚本

```bash
# 1) 组件拷到宿主机
scp -r components/features/detail user@NAS:/tmp/vd-install

# 2) 在宿主机执行
bash /tmp/vd-install/install-detail.sh --container emby-18 --theme blackgold
bash /tmp/vd-install/install-detail.sh --container emby-18 --uninstall
```

---

### 方式 3：手动注入（理解原理用）

```bash
C=emby-18
docker exec $C mkdir -p /system/dashboard-ui/vanvy-detail
docker cp vanvy-detail.js  $C:/system/dashboard-ui/vanvy-detail/
docker cp vanvy-detail.css $C:/system/dashboard-ui/vanvy-detail/
docker cp icons            $C:/system/dashboard-ui/vanvy-detail/

# index.html 注入 3 行
docker exec $C sh -c '
  cd /system/dashboard-ui
  sed -i "s#</head>#<link rel=\"stylesheet\" href=\"vanvy-detail/vanvy-detail.css\">\n</head>#" index.html
  sed -i "s#</body>#<script src=\"vanvy-detail/vanvy-detail.js\"></script>\n</body>#" index.html
'
```

---

## ⚙️ 配置项

部署时写入 `vanvy-detail/config.js`：

```js
window.VANVY_DETAIL_CONFIG = {
  theme: 'blackgold',     // 配色: blackgold/aurora/champagne/emerald/sakura/sunset
  frostBlur: 10,          // 毛玻璃模糊 px（弱=10 中=18 强=32 关=0）
  frostTint: 0.42,        // 毛玻璃遮罩（0~1）
  showPlayers: true,      // 第三方播放器区
  showJav: true,          // JAV 增强区
  playersOnlyOS: true,    // 默认「仅显示本机可用」
  javAutoRoute: true      // 智能路由（关=强制显/隐，见 showJav）
};
```

改配置：编辑 `config.js` 后强刷即可，**无需重装**。

---

## 🔄 回滚

每次安装自动快照 `index.html` 到 `.bak-vanvy-<时间戳>/`（保留最近 5 份）：

```bash
docker exec emby-18 sh -c \
  'cp /system/dashboard-ui/.bak-vanvy-20260910-195421/index.html /system/dashboard-ui/index.html &&
   rm -rf /system/dashboard-ui/vanvy-detail'
```

或用脚本：
```bash
bash install-detail.sh --container emby-18 --uninstall
```

---

## 📦 分发包

| 文件 | 地址 |
|---|---|
| 组件包 | `https://github.com/micimo13/emby-beautify/vanvy-detail.tar.gz` |
| 在线安装器 | `https://github.com/micimo13/emby-beautify/vanvy-detail-install.sh` |
| 本地分发目录 | `/vol1/1001/web/`（飞牛） |

重新打包：
```bash
cd components/features/detail
tar czf /vol1/1001/web/vanvy-detail.tar.gz \
  vanvy-detail.js vanvy-detail.css icons install-detail.sh \
  --transform 's,^,vanvy-detail/,'
```

---

## ✅ 当前部署状态

| 容器 | 版本 | 库类型 | 状态 |
|---|---|---|---|
| emby-18 | 4.8.11 | 小电影库 | ✅ 已装（JAV 区显示） |
| emby-302 | 4.9.5 | 正经库 | ✅ 已装（JAV 区不显示） |

---

## ⚠️ 注意事项

1. **强刷生效**：部署后浏览器 `Ctrl+F5` 强刷
2. **改前必快照**：install 脚本已自动快照
3. **失败不影响原生**：组件全程 `try/catch`，出错只是不增强，页面照常用
4. **版本兼容**：4.8 / 4.9 实测；4.10 靠运行时探测兜底
