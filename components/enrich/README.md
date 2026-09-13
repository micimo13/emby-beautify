# vanvy-enrich · VES 第三方资料增强服务

详情页「资料增强」容器（剧照 / 演员 / 预告片 / 同类推荐）的后端。
纯标准库、零依赖、单文件。**正经库走 TMDB**（R18 库直接调本地 AVDB，不需要本服务）。

## 为什么要它
浏览器直接请求 TMDB 依赖「用户那台设备能出网」，国内不可靠；
本机（有出网代理的那台机器）统一抓取 + 磁盘缓存，全站共享，
并把 API Key 收在服务端——前端只拿数据，不落凭据。

## 安装
```bash
bash install-enrich.sh --key <你的TMDB_KEY>   # 首次
bash install-enrich.sh                        # 更新（读同目录 enrich_config.json）
bash install-enrich.sh --test                 # 自检
bash install-enrich.sh --uninstall            # 卸载
```
装好后会自动加两条 cron：`@reboot` 启动 + 每 3 分钟看门狗（幂等，不清空既有 crontab）。

## 接口
| 路由 | 说明 |
|---|---|
| `GET /healthz` | 健康检查 |
| `GET /api/detail?tmdb=<id>&type=movie\|tv[&lang=zh-CN]` | 聚合资料（**单次 TMDB 请求**，append_to_response） |
| `GET /api/search?q=<标题>&year=&type=movie\|tv` | 按标题查 TMDB id |
| `GET /api/person?id=<personId>` | 演员资料（简介/生日/头像，供后续扩展） |

`/api/detail` 返回：`stills[]`（剧照 24 张）`cast[]`（演员 + 角色 + 头像）`trailers[]`（YouTube 预告，官方优先）
`similar[]`（同类推荐 18 部）`collection`（系列合集）等。

全部路由带 `Access-Control-Allow-Origin: *` 且响应 OPTIONS 预检 → 浏览器可跨域直连。

## 前端对接
`components/features/detail/vanvy-detail.js` → `CFG.p2.enrich*`：
```js
p2: {
  enrich: true,          // 总开关（关=容器不注入、零请求）
  enrichStills: true, enrichCast: true, enrichTrailers: true, enrichSimilar: true,
  enrichBases: []        // 留空 = 内置默认（局域网优先，失败回落公网 /enrich）
}
```
服务不可达 / 无 TMDB id / 无数据 → 容器不出现，自动退回 Emby 原生区块（零副作用）。

## nginx（公网 HTTPS 可用时）
```nginx
location /enrich/ {
    proxy_pass http://127.0.0.1:18097/;      # 或宿主机内网 IP
    proxy_set_header Host $host;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
# 注意：上游已自带 CORS，此处不要再 add_header，否则 ACAO 重复浏览器会拒。
```

## 安全
- 只读外网 TMDB，不写任何外部系统；缓存限在 `cache_dir`。
- 配置含 TMDB Key → 权限 600，**不进 git / 不进分发包**（分发只带 `enrich_config.example.json`）。
- 无鉴权设计：仅建议部署在内网/反代之后；如需公网暴露，请自行加访问控制。
