# VES 图片代理（img-provider）

把「浏览器访问不到」的图床（被墙 / 需认证 / 防盗链）转发出来，供 Emby 美化详情页使用。
**零依赖**（纯 Python 标准库，不需要 `pip install` 任何东西）。

---

## 什么时候需要它

| 场景 | 需要吗 |
|---|---|
| JAV 增强要显示 JavDB 封面 / 演员图 | ✅ 需要（图床被墙） |
| 轮播/详情页用到 YouTube 缩略图 | ✅ 需要 |
| 只用 Emby 本地图片（海报/背景图） | ❌ 不需要 |
| 不确定 | 先**留空**，不影响的模块照常工作 |

---

## 最快上手

```bash
cd components/imgproxy

# ① 先自检（不动系统，看看链路通不通）
bash install-imgproxy.sh --check

# ② 有代理就这样装（systemd）
sudo bash install-imgproxy.sh --systemd \
     --proxy "socks5h://用户名:密码@代理地址:端口" \
     --mode auto

# ③ 没有代理（图床本身能直连）
sudo bash install-imgproxy.sh --systemd --mode none
```

装完在 nginx 里加 `/vdimg/` 反代（片段见 `nginx-vdimg.conf`），
然后在 VES 安装向导里填：

```
③ 图片代理地址：https://你的域名/vdimg
```

**验证**：浏览器打开
```
https://你的域名/vdimg/i?u=https%3A%2F%2Fi.ytimg.com%2Fvi%2F_TRSvK-Omwc%2Fhqdefault.jpg
```
能看到图片就成功了。

---

## 代理怎么填

**格式**：`scheme://[用户名:密码@]主机:端口`

| scheme | 说明 | 推荐度 |
|---|---|---|
| `socks5h` | SOCKS5，且 **DNS 由代理解析**（防污染） | ⭐ 推荐 |
| `socks5` | SOCKS5，本机解析 DNS | 可用 |
| `http` | HTTP 代理（明文 / CONNECT 隧道） | 可用 |
| `https` | HTTPS 代理 | 可用 |

**带认证**：直接把用户名密码写进 URL

```bash
--proxy "socks5h://myuser:mypass@10.0.0.5:1080"
--proxy "http://myuser:mypass@proxy.example.com:8080"
```

**多个代理**（按序回退，前一个挂了自动试下一个）：

```bash
--proxy "socks5h://a:pw@主代理:1080,socks5h://a:pw@备用代理:1080"
```

---

## 三种代理模式

| 模式 | 行为 | 何时用 |
|---|---|---|
| `none` | **从不走代理**，全部直连 | 图床本身能直连 / 有全局透明代理 |
| `auto`（默认） | **仅** `proxy_hosts` 里的域名走代理 | ⭐ 推荐，省流量更快 |
| `all` | 所有请求都走代理 | 网络环境严格，或想统一出口 |

`auto` 模式的域名清单在配置里（默认含 `ytimg.com / youtube.com / dmm.co.jp`）。

---

## 配置文件（推荐生产用）

```bash
python3 img_proxy.py --gen-config > /etc/vanvy-imgproxy/config.json
vi /etc/vanvy-imgproxy/config.json
```

关键字段：

```jsonc
{
  "port": 18098,
  "proxies": ["socks5h://user:pass@127.0.0.1:1080"],  // 留空=直连
  "proxy_mode": "auto",                                // none | auto | all
  "proxy_hosts": ["ytimg.com", "youtube.com"],
  "proxy_fallback_direct": true,                       // 代理全挂时回退直连
  "allow_hosts": ["i.ytimg.com", "..."],               // 留空=全放行（⚠️有风险）
  "decoder_base": "",                                  // 可选：能解 JavDB 混淆图的上游
  "cache_dir": "/var/cache/vanvy-imgproxy",
  "cache_ttl": 604800,                                 // 缓存 7 天
  "timeout": 20
}
```

### 也可以用环境变量（优先级高于 config.json）

| 环境变量 | 对应字段 |
|---|---|
| `VANVY_IMG_PORT` | `port` |
| `VANVY_PROXY_URL` / `VANVY_IMG_PROXY` | `proxies`（逗号分隔） |
| `VANVY_PROXY_MODE` | `proxy_mode` |
| `VANVY_PROXY_HOSTS` | `proxy_hosts`（逗号分隔） |
| `VANVY_PROXY_FALLBACK` | `proxy_fallback_direct` |
| `VANVY_IMG_ALLOW_HOSTS` | `allow_hosts`（逗号分隔） |
| `VANVY_IMG_DECODER` | `decoder_base` |
| `VANVY_IMG_CACHE_DIR` / `_CACHE_TTL` | 缓存 |
| `VANVY_IMG_TIMEOUT` | `timeout` |
| `VANVY_IMG_ALLOW_PRIVATE` | 允许代理内网地址（默认禁，防 SSRF） |

---

## Docker 部署

```bash
sudo bash install-imgproxy.sh --docker \
     --proxy "socks5h://user:pass@10.0.0.5:1080" --mode auto
docker logs -f vanvy-imgproxy
```

---

## 命令行

```bash
python3 img_proxy.py                      # 启动
python3 img_proxy.py --test               # 自检（逐个测代理/图床/白名单）
python3 img_proxy.py --gen-config         # 打印配置模板
python3 img_proxy.py -c /path/config.json # 指定配置
```

自检输出示例：

```
 代理模式 : auto
   1. socks5h://user:***@your-proxy.example.com:1080
 白名单   : 14 个域名
 白名单  : ✅ 关键图床已放行
 YouTube 缩略图    ✅ 代理  image/jpeg/22030B  9111ms
 TMDB 图片        ✅ 直连  image/webp/4996B  8641ms
 逐代理连通性:
   ✅ socks5h://user:***@your-proxy:1080  22030B  4980ms
```

---

## 接口

| 路径 | 说明 |
|---|---|
| `/i?u=<urlencoded>` | 取图（`/img?u=` 同义） |
| `/healthz` | 健康检查（返回当前配置概览，**不含密码**） |

响应头带 `Cache-Control: public, max-age=604800`，第二次访问直接命中本地缓存（毫秒级）。

---

## 安全说明

| 项 | 默认 | 说明 |
|---|---|---|
| 图床白名单 | 14 个常见图床 | 留空 = 全放行（**有 SSRF 风险，仅内网用**） |
| 内网地址 | **禁止** | 挡住 `127.0.0.1` / `10.x` / `192.168.x`，防 SSRF |
| 单图大小 | 12 MB | 超出拒绝 |
| 上游超时 | 20s | 自检时降到 7s |
| 凭据 | 只在你自己的 config.json | **不进仓库、不上传** |

> 代理凭据写错时，`/healthz` 与启动日志都会**用 `***` 脱敏**，不会泄露。

---

## 常见问题

**Q：自检里 YouTube ❌ 但代理 ✅？**
冷启动或网络抖动，重跑一次通常就好（已内置 2 次重试）。

**Q：HTTP 代理报 `CONNECT 被拒`？**
该代理不支持 CONNECT 隧道（只能明文转发）。换 SOCKS5，或确认代理支持 HTTPS 隧道。

**Q：SOCKS5 报「认证失败」？**
用户名/密码错误。注意密码里的特殊字符要 URL 编码（`@` → `%40`）。

**Q：不想暴露内网代理给外网？**
图片代理**不要**直接对公网开放。正确做法：只监听内网 + nginx 做 `/vdimg/` 反代（可加鉴权）。

**Q：可以只当普通图片缓存吗？**
可以。`--mode none` + 填好 `allow_hosts`，就是一个带缓存的图片代理。
