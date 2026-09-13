# VES 第三方资料增强 · 调研报告

- **日期**：2026-09-13
- **项目**：虾子🦐 / VES（`emby-beautify`）
- **作者**：ENRICH_RESEARCH 子代理
- **主题**：为 Emby 详情页增加「第三方站点资料增强」容器（剧照 / 预告片 / 演员 / 同类），同时服务**正经库**与 **R18 库**
- **结论先行**：**推荐方案①（浏览器端增强 + 本地 AVDB 引擎）**。本地 AVDB 引擎 `192.168.1.10:38000` **自带完整 CORS 与 OPTIONS 预检**（这是与 MDC-NG 的本质差别），且已存在「Emby item id → AVDB 资料」的映射端点；正经库走 Emby 原生 + TMDB，R18 走 AVDB，优雅降级，无需新增常驻服务。

> ⚠️ 本报告所有凭据一律写成 `<见 vanvy.env>`，不落任何 token/key。

---

## 1. 背景与真实需求

### 1.1 现状
VES 详情页（`components/features/detail/vanvy-detail.js`）已有：剧照（Emby Backdrop）、演员/导演、预告片（RemoteTrailers → YouTube 缩略卡 + 页内弹框）、更多类似、JAV 资料卡、JavDB 同系列墙（`CFG.p2.javSeriesWall`）、外站 19 站链接、演员作品（已入库 + JavDB 全部）。

### 1.2 之前的挫折：MDC-NG 联动
项目曾尝试把 MDC-NG（小电影刮削工具）接进详情页，卡点：
1. MDC-NG **不发 CORS 头**，浏览器从 Emby 页面（另一个端口）调它必被拦；
2. MDC-NG **不处理 OPTIONS 预检**；
3. 路径映射复杂（Emby 视角 `/media/...` vs MDC 容器视角）；
4. 只对 R18 有用。

项目已在 `nginx/mdc-proxy.conf` 里准备了一个「加 CORS 的反代片段」（OPTIONS 返回 204 + 手工补 `Access-Control-Allow-*`），但这需要额外维护 nginx 与网络路径。

### 1.3 主人真实需求（原话大意）
> MDC 视乎很难开发，其实核心需求就是**增强 Emby 服务器 R18 的刮削或者更多信息的能力**，比如我们自己做个第三方站点信息增强功能？这个功能**可能不限于 R18 库**，可以通过第三方站点显示更多信息，如剧照、预告片、演员信息、同类影片？在我们 emby 页面上有个容器可以直接查看这些内容。类似 JAV 增强的更多推荐逻辑。

**拆解为可交付目标：**
- **T1**：详情页有一个「资料增强」容器，展示 剧照 / 预告片 / 演员 / 同类（更多推荐）。
- **T2**：R18 库用第三方（AVDB / JavDB）数据；正经库也能用（TMDB / Emby 原生）。
- **T3**：不重蹈 MDC 覆辙（CORS / 预检 / 路径映射）。
- **T4**：可开关、可降级、不出网、不出安全问题。

---

## 2. 实测环境与方法

| 角色 | 地址 | 备注 |
|---|---|---|
| 主 Emby（正经库，4.9） | `http://192.168.1.2:8097/emby` | token `<见 vanvy.env>` |
| 网盘 Emby / Link（4.8） | `http://192.168.1.2:8096/emby` | token `<见 vanvy.env>` |
| Emby-18（R18 / 特辑） | `http://192.168.1.2:18088/emby` | token `<见 vanvy.env>` |
| **本地 AVDB 数据引擎** | `http://192.168.1.10:38000` | `X-API-Key: <见 vanvy.env>`；OpenAPI 256 端点 |
| imgproxy | `http://192.168.1.10:18098` | 图床转发，公网走 `/vdimg` |

所有 curl 均加 `--noproxy '*'`（内网直连）。Emby 取 item 需带 user 前缀：`/emby/Users/{userId}/Items/{id}`（直接 `/emby/Items/{id}` 会 404）。

---

## 3. A. 本地 AVDB 数据引擎实测（重点）

### 3.1 ⭐ 关键发现：引擎自带 CORS + OPTIONS 预检

```
$ curl -sI -H "X-API-Key: <见 vanvy.env>" -H "Origin: http://192.168.1.2:8097" \
    "http://192.168.1.10:38000/api/v1/javdb/search?q=SSIS-698&type=movie&limit=1"
HTTP/1.1 200 OK
access-control-allow-origin: *
access-control-allow-credentials: true

$ curl -sI -X OPTIONS -H "Origin: http://192.168.1.2:8097" \
    -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: x-api-key" \
    "http://192.168.1.10:38000/api/v1/javdb/search?q=x&type=movie&limit=1"
HTTP/1.1 200 OK
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
access-control-allow-headers: x-api-key
access-control-allow-origin: http://192.168.1.2:8097
access-control-max-age: 600
```

**结论**：GET 返回 `Access-Control-Allow-Origin: *`，OPTIONS 预检**回显 Origin 并允许 `x-api-key` 头**。即 **浏览器可跨端口直连**（我们是自定义头 `X-API-Key`，非 Cookie 凭据，故 `*` 不触发 credentials 限制）。**这一条直接判了 MDC 方案的死，也判了方案①的活。**

> 注意：`allow-origin: *` + `allow-credentials: true` 组合对**携带 Cookie** 的请求非法。本项目用 `X-API-Key` 头而非 Cookie，fetch 不设 `credentials`，安全。

### 3.2 端点清单（实测可用）

| # | 端点 | 方法 | 用途 | 实测 |
|---|---|---|---|---|
| 1 | `/api/v1/javdb/search?q=&type=movie&limit=` | GET | 番号/词搜片 | ✅ |
| 2 | `/api/v1/javdb/search?q=&type=actor&limit=` | GET | 搜演员 | ✅ |
| 3 | `/api/v1/javdb/movies/{id}` | GET | 影片全量详情（**data.movie**） | ✅ |
| 4 | `/api/v1/javdb/movies/{id}/magnets` | GET | 磁力列表 | ✅ |
| 5 | `/api/v1/javdb/movies/tags?series_id=&series_type=1&limit=` | GET | 同系列作品列表 | ✅ |
| 6 | `/api/v1/javdb/series/{id}` | GET | 系列信息 | ✅ |
| 7 | `/api/v1/javdb/actors/{id}` | GET | 演员资料（三围/生日） | ✅ |
| 8 | `/api/v1/javdb/actors/{id}/collection` | POST | 收藏演员 | 未写操作，未调 |
| 9 | `/api/v1/articles/javdb-gallery?number=&limit=` | GET | **按番号**取剧照（已代理） | ✅ |
| 10 | `/api/v1/articles/javdb-gallery/image?number=&source_url=&position=` | GET | 剧照图片代理 | ✅ |
| 11 | `/api/v1/javdb/preview/assets?url=&movie_id=` | GET | **预览视频 m3u8 代理**（重写切片签名） | ✅ |
| 12 | `/api/v1/javdb/movies/{id}/preview.m3u8` | GET | 预览 m3u8（**实测 404**，见 3.10） | ⚠️ |
| 13 | `/api/v1/articles/emby-items/{emby_item_id}/detail` | GET | ⭐**Emby item id → 资料+剧照** | ✅ |
| 14 | `/api/v1/articles/emby-items/{emby_item_id}/emby-meta` | GET | Emby 元数据补全 | ✅ |
| 15 | `/api/v1/actors/{id}/image?image_type=Primary\|Thumb\|Backdrop&tag=&image_index=` | GET | 演员/条目图片代理 | ✅ |

> 引擎共 256 个端点，正文只列与「详情页增强」相关者。完整清单：`GET /openapi.json`。

### 3.3 样本 1 · 搜片

```
$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/javdb/search?q=SSIS-698&type=movie&limit=3"
{"code":0,"message":"操作成功","data":{"movies":[
 {"id":"5EWRKD","number":"SSIS-698","title":"三上悠亜と新ありなと相沢みなみ…",
  "thumb_url":"https://tp.spfcas.com/.../small_covers/5e/5EWRKD.jpg",
  "cover_url":"https://tp.spfcas.com/.../covers/5e/5EWRKD.jpg","duration":170,
  "magnets_count":19,"can_play":true,"has_cnsub":true,"has_preview_video":true,
  "has_preview_images":true,"release_date":"2023-05-10"}, …]}}
```
**要点**：`search` 命中第一条即精确番号；`movies[].id`（如 `5EWRKD`）是后续取详情的 key。

### 3.4 样本 2 · 影片详情（`data.movie`）

```
$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/javdb/movies/5EWRKD"
```
实测 `data.movie` 字段（**注意是 `data.movie`，不是 `data` 直属**）：

| 字段 | 实测值 | 详情页用途 |
|---|---|---|
| `number` | `SSIS-698` | 标题/匹配 |
| `title` / `origin_title` | 中文标题 / 日文原标题 | 展示 |
| `summary` | 中文简介 | 简介 |
| `score` | `4.63` | 评分★ |
| `duration` | `170`（分钟） | 时长 |
| `release_date` | `2023-05-10` | 发行日期 |
| `tags[]` | `['淫乱真实','偶像','荡妇','美乳','滥交','4K','无码破解','两男两女']` | 标签 chips |
| `actors[]` | `[{'name':'新ありな','avatar_url':...}, ...]` | 演员（含头像） |
| `series_id` / `series_name` | `BWEG` / `相部屋NTR…`（本片为 None） | 系列墙 |
| `relative_movies[]` | 9 条，`{id,number,thumb_url,cover_url}` | 同系列/相关墙 |
| `preview_images[]` | 10 条，`{thumb_url,large_url}` | 剧照墙 |
| `preview_video_url` | `https://jdforrepam.com/.../720p.m3u8?sign=…&t=…` | 预告 |
| `preview_video_proxy_url` | `/api/v1/javdb/movies/5EWRKD/preview.m3u8` | 预告（代理，⚠️见3.10） |
| `actor_movies[]` | 演员其他作品 | 演员作品 |
| `magnets_count` | `19` | 磁力数 |
| `has_cnsub` / `can_play` / `play_sources` | `true/true/[...]` | 中字/可播标记 |

`preview_images[0..2]`：
```
[{"thumb_url":"https://tp.spfcas.com/rhe951l4q/samples/5e/5EWRKD_s_0.jpg",
  "large_url":"https://tp.spfcas.com/rhe951l4q/samples/5e/5EWRKD_l_0.jpg"}, …]
```

### 3.5 样本 3 · 按番号直接取剧照（更省一次 search）

```
$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/articles/javdb-gallery?number=PRED-750&limit=20"
{"code":0,"data":{"number":"PRED-750","total":11,"images":[
 "/api/v1/articles/javdb-gallery/image?number=PRED-750&source_url=https%3A%2F%2Ftp.spfcas.com%2F...%2FGZJvMq_l_0.jpg&position=0", …]}}
```
**要点**：拿到的是**已经指向本引擎的代理 URL**（内网、无防盗链、无 CORS 问题），前端直接 `<img src>` 即可。这比先 search 再取 `preview_images` 的原图 URL 更稳（原图 `tp.spfcas.com` 对公网客户端可能被墙，需再过 imgproxy）。

### 3.6 样本 4 · 演员资料

```
$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/javdb/search?q=三上悠亜&type=actor&limit=5"
{"data":{"actors":[{"id":"Av2e","avatar_url":"https://tp.spfcas.com/.../avatars/av/Av2e.jpg",
  "name":"三上悠亜","name_zht":"三上悠亜","other_name":"鬼头桃菜","videos_count":318}]}}

$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/javdb/actors/Av2e"
{"data":{"has_collected":false,"actor":{
  "name":"三上悠亜","name_zht":"三上悠亜","other_name":"三上悠亞, 鬼头桃菜",
  "birthday":"1993-08-16","age":33,"cons":"狮子座","height":159,
  "bust":84,"cup":"F","waist":58,"hips":88,
  "twitter_id":"yua_mikami","instagram_id":"yua_mikami","videos_count":323}}}
```
**要点**：比 Emby 原生演员卡丰富得多（生日/三围/罩杯/社交账号/作品数），是 R18 页「演员资料」模块的数据源。

### 3.7 样本 5 · 系列 + 同系列作品

```
$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/javdb/series/BWEG"
{"data":{"series":{"id":"BWEG","type":0,"name":"相部屋NTR 不倫セックスに明け暮れた出張先の夜","videos_count":21}}}

$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/javdb/movies/tags?series_id=BWEG&series_type=1&limit=30"
{"code":0,"data":{"movies":[{"number":"SONE-613", …}],"has_collected":false,"current_page":1}}
# ⚠️ 去掉 series_type 会 400：{"detail":"系列类型不能为空"}（实测 HTTP 400）
```
**要点**：`movies/tags` **必须**带 `series_type`；返回 21 部同系列。这是「同系列墙」的权威数据源。

### 3.8 样本 6 · 磁力

```
$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/javdb/movies/5EWRKD/magnets"
{"data":{"magnets":[{"name":"SSIS-698-UC.torrent.无码破解","hash":"ca5a…","size":8160,
  "cnsub":true,"hd":true,"files_count":1,"created_at":"2023-05-11",
  "magnet_url":"magnet:?xt=urn:btih:ca5a…","size_bytes":8556380160,"source_label":"在线"}, …]}}
```

### 3.9 ⭐ 样本 7 · Emby item id 直达资料（金矿）

```
$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/articles/emby-items/740998/detail"
{"code":0,"data":{
  "id":"740998","number":"PRED-750","name":"PRED-750 与大嫂出差同行途中…",
  "original_title":"PRED-750 義姉の出張同行中に…","overview":"从豪雨逃进来的地方，是酒店相房…",
  "community_rating":8.78,"production_year":2025,
  "image_url":"/api/v1/actors/740998/image?image_type=Primary&tag=b40e…",
  "gallery_images":[
    "/api/v1/actors/740998/image?image_type=Thumb&tag=c8d8…",
    "/api/v1/actors/740998/image?image_type=Backdrop&tag=b144…&image_index=1",
    "/api/v1/actors/740998/image?image_type=Backdrop&tag=93cc…&image_index=2", …],
  "actors":[{"id":"742219","name":"白峰美羽","type":"Actor",
     "image_url":"/api/v1/actors/742219/image?image_type=Primary&tag=5aa6…"}],
  "genres":["1080P","白峰美羽","不伦","发行: エレガンス","姐妹","酒店","片商: PREMIUM","无码破解","窈窕","中出","中文字幕","HEV1","PRED"],
  "provider_ids":{"metatube":"AVBASE:premium%3APRED-750"},
  "direct_playback":true,
  "emby_detail_url":"http://192.168.1.2:18088/web/index.html#!/item?id=740998&serverId=ae50…",
  "source_media":{"path":"/media/『无码破解』/PRED-750-U-C/PRED-750-U-C.mp4","exists":true,
     "content_type":"mp4","size":8263443277}}}
```
**要点**：
- 该引擎已把 **Emby item id 映射到 AVDB/Emby 详情**，返回封面 + 剧照 + 演员（含头像代理）+ 番号/类型/片商 + 片源路径 + `provider_ids.metatube`。
- 引擎**绑定的是 R18 台（emby-18，18088）**：拿正经库 id（如 8097 的 `1531339`）去查返回 `{"code":1,"message":"未从 Emby 读取到影片详情","data":null}`——**天然不会误伤正经库**。
- `provider_ids.metatube = AVBASE:premium:PRED-750` 说明 R18 台已配 MetaTube-AVBASE 刮削源，可作为「是否 R18」的判定信号之一。

### 3.10 坑与注意（实测）

1. **`data.movie` 层级**：`/javdb/movies/{id}` 的影片对象在 `data.movie`，不是 `data`。
2. **`movies/tags` 必须带 `series_type`**，否则 HTTP 400「系列类型不能为空」。
3. **`/javdb/movies/{id}/preview.m3u8` 实测 404**（两个样本 `5EWRKD`、`GZJvMq` 均 404）。**可用的预览代理是** `GET /api/v1/javdb/preview/assets?url=<上游m3u8>&movie_id=<id>`，返回 200 + `application/vnd.apple.mpegurl`，且**把切片 URL 重写了新的 `sign`+`t`**（即代理会续签，避免上游链接过期）：
   ```
   $ curl -s -H "X-API-Key: <见 vanvy.env>" -G \
     --data-urlencode "url=<preview_video_url>" --data-urlencode "movie_id=5EWRKD" \
     "http://192.168.1.10:38000/api/v1/javdb/preview/assets"
   HTTP 200  content-type: application/vnd.apple.mpegurl
   #EXTM3U
   #EXT-X-KEY:METHOD=AES-128,URI="https://h1.hnhr01.com/.../encryption.key"
   #EXTINF:13.947,
   https://h1.hnhr01.com/.../seg-1-v1-a1.ts?sign=4512…&t=1789262345
   ```
4. **正经库搜 AVDB 会误命中垃圾**（见 §5.6），**绝不能拿正经库标题去 AVDB 搜**。
5. `tp.spfcas.com` 图床在**内网直连可达**（实测 200），但**公网客户端需过 imgproxy `/vdimg`**；从内网 curl 直取封面时可能拿到非图片字节（需带正确 Referer 或走 imgproxy）。

---

## 4. B. Emby 侧能力实测

### 4.1 三台服务器 trailer / backdrop 统计（各取前 40 部）

| 服务器 | 总片量 | 样本 | RemoteTrailers | LocalTrailerCount>0 | 有 Backdrop |
|---|---|---|---|---|---|
| 主 Emby 8097（正经 4.9） | 14175 | 40 | **29/40**（多为 YouTube） | 0/40 | 39/40 |
| 网盘 Emby 8096（Link 4.8） | 14045 | 40 | **35/40**（多为 YouTube） | 0/40 | 38/40 |
| Emby-18 18088（R18） | 24514 | 40 | **39/40**（DMM/1pondo 直链 mp4） | **28/40** | 40/40 |

**结论**：三台都有丰富 Backdrop（剧照）；正经库预告基本是 YouTube 远程链接；R18 台预告是 DMM/1pondo 直链 mp4，且**近 7 成有本地 trailer 文件**。

样本：
```
# 正经库
"骗骗喜欢你" → RemoteTrailers[0].Url = https://www.youtube.com/watch?v=EEJmPf8WL28
# R18 库
PRED-750 → RemoteTrailers[0].Url = https://cc3001.dmm.co.jp/litevideo/freepv/p/pre/pred00750/pred00750_dm_w.mp4
"001"    → RemoteTrailers[0].Url = http://smovie.1pondo.tv/sample/movies/092017_001/480p.mp4
```

### 4.2 剧照（多图）

- **字段**：`BackdropImageTags[]`（数组，实测 R18 单条目 12~22 张）。
- **端点**：`GET /emby/Items/{id}/Images/Backdrop/{index}?maxWidth=900`（同源，任意 item id 即可，无需 user 前缀）；列出可用图用 `ApiClient.getItemImageInfos(id)`（前端已用）或 `GET /emby/Items/{id}/Images`…
- **实测**：`/emby/Items/1757475/Images/Backdrop/0?api_key=…&maxWidth=900` → `JPEG 900x506`；`Backdrop/1` 不存在（返回非图片文本，前端需 `onerror` 处理）。

### 4.3 演员 / 导演

- **字段**：`People[]`，每项 `{Id,Name,Role,Type,PrimaryImageTag}`，`Type ∈ {Actor,Director,...}`。
- **头像**：`GET /emby/Items/{personId}/Images/Primary?maxWidth=200`（实测 200x300 JPEG）。
- **实测**：正经片「骗骗喜欢你」People 含 `大喜/孙阳/李雪琴/王皓/王耀庆/柳岩`，均 Actor 且有头像。
- **注意**：R18 台 People 通常只有 1 人（`Actor`），且名字可能是日文原名（如 `涼森れむ`），与 AVDB 中文名 `name_zht` 不同 → 需别名映射（项目已有 `CFG.actorAlias`）。

### 4.4 预告片（两种）

| 概念 | 字段 / 端点 | 实测 |
|---|---|---|
| 远程预告 | `item.RemoteTrailers[] = {Name,Url}` | 正经库=YouTube；R18=DMM/1pondo mp4 |
| 本地预告 | `item.LocalTrailerCount`；`GET /emby/Users/{uid}/Items/{id}/LocalTrailers` | R18 台 `001` → `[{"Name":"001-Trailer","Id":"837705","Type":"Trailer","MediaType":"Video"}]` |

**注意**：`LocalTrailers` 端点**必须带 user 前缀**（`/emby/Items/{id}/LocalTrailers` 会返回「找不到文件」）。本地 trailer 是独立 item，可用 `/emby/Videos/{trailerId}/stream?api_key=…` 播放。

### 4.5 更多类似

- **端点**：`GET /emby/Items/{id}/Similar?UserId={uid}&Limit=12`（前端已用 `api.getJSON(api.getUrl('Items/'+id+'/Similar',…))`）。
- 无需第三方，正经库/R18 都可直接用。

### 4.6 「正经库 vs R18」Emby 侧区分信号

| 信号 | 正经库 | R18 |
|---|---|---|
| `ProviderIds` | `Tmdb/Imdb/Tvdb` | 常无或只有 `MetaTube` |
| `OfficialRating` | `PG-13` 等 | `JP-18+` |
| 库名 | 电影/剧集/纪录片 | 含「特辑/MADV/无码/番号/成人」 |
| 片名 | 中文标题 | `番号 + 标题` 前缀 |
| Emby-18 引擎 `emby-items` 详情 | `code:1` 无数据 | `code:0` 有数据 |

项目现有 `javScore()`（`vanvy-detail.js`）已用 `ProviderIds.MetaTube + 番号正则 + OfficialRating + 库名 + 标签` 打分，阈值 `hit = score>=2`。**本方案沿用并强化该判定**（见 §5.6）。

---

## 5. C. 方案设计与取舍

### 方案①（✅ 推荐）浏览器端增强 + 本地 AVDB 引擎

**做法**：在详情页注入「资料增强」容器（纯前端，单文件 JS）。
- **R18 分支**：番号（来自 Emby `Name` 前缀或 `emby-items/{id}/detail.number`）→ AVDB `search` → `movies/{id}` → 渲染 剧照墙 / 演员资料 / 同系列 / 磁力 / 预告。
- **正经库分支**：只用 Emby 原生（Backdrop/People/Similar/RemoteTrailers）+ 可选 TMDB 补充；**不打 AVDB**。

**优点**：零新增常驻服务；复用已有 `avdbBase/avdbKey` 配置；CORS 已验证可用；与现有 JAV 增强同构，改动面小。
**缺点**：数据实时性依赖前端（可缓存缓解）；直接暴露内网引擎地址给浏览器（仅内网客户端可见，风险低）。

### 方案② 自建元数据服务（FastAPI 聚合 + 缓存，甚至反代 MDC）

**做法**：起一个内部 FastAPI：对外统一 `/enrich/{embyId}`，内部调 AVDB + TMDB + 缓存；顺带反代 MDC 补 CORS。

**优点**：前端只认一个同源接口，彻底绕开 CORS；可做服务端缓存/合并；未来接 MDC / MetaTube 更灵活。
**缺点**：**新增常驻服务**（部署/监控/端口/证书成本），违背 VES「尽量零依赖」哲学；仍是内网，收益主要是「解耦」而非「能力」。**建议作为 P2 可选演进**，而非首选。

### 方案③ 继续 MDC-NG 联动

**为什么难**（实测/文档双重证据）：
1. MDC-NG **不发 CORS 头**（`nginx/mdc-proxy.conf` 注释明确写了）；
2. **不处理 OPTIONS 预检** → 必须靠 nginx 手工 `return 204` 补头；
3. **路径映射复杂**（Emby `/media/…` vs MDC 容器视角，需 `VANVY_MDC_MAP` 逐条映射）；
4. **仅 R18**，且**只对 `emby-18` 成立**（`VANVY_MDC_CONTAINERS="emby-18"`）；
5. MDC 是「刮削/整理」能力，**不提供剧照/演员/同类等信息展示**，与本次需求（信息增强）**不是一回事**。

**结论**：MDC 联动与「资料增强」是两条正交需求，不应为了 showcase 硬捆。若仍要做，代价 = 维护 nginx 反代 + CORS 补丁 + 路径映射 + 单容器白名单，**且收益与本次目标无关**。

### 方案对比

| 维度 | ①浏览器端+AVDB | ②自建服务 | ③MDC-NG |
|---|---|---|---|
| 新增常驻服务 | ❌ 无 | ✅ 需 | ❌ 无（但需 nginx 片段） |
| CORS 风险 | 低（已验证） | 无（同源） | 高（需反代补头） |
| 覆盖正经库 | ✅ 原生+TMDB | ✅ | ❌ |
| 覆盖 R18 | ✅ AVDB | ✅ | 部分（仅刮削） |
| 提供剧照/演员/同类 | ✅ | ✅ | ❌ |
| 落地速度 | ⭐⭐⭐ | ⭐ | ⭐ |
| 运维成本 | 低 | 高 | 中 |
| **推荐** | **✅ 首选** | P2 演进 | ✗ |

### 5.1 数据流图

```
┌──────────────────────────── 浏览器（Emby Web 详情页）────────────────────────────┐
│                                                                                 │
│  ① 识别   item: Name / 库名 / OfficialRating / ProviderIds.MetaTube              │
│           └─ javScore() → { hit:true|false, why:[] }                            │
│                              │                                                  │
│              hit=true（R18） │  hit=false（正经库）                              │
│                              ▼                            ▼                     │
│  ② 取数   AVDB 引擎 ─────┐                    Emby 原生 API（同源）             │
│           (106:38000)    │                    Items / Images / People /         │
│           · search(番号)  │                    Similar / RemoteTrailers          │
│           · movies/{id}   │                    + TMDB（经代理，补简介/剧照）     │
│           · javdb-gallery │                              │                       │
│           · actors / series│                             │                       │
│           · magnets       │                              │                       │
│                          ▼                              ▼                       │
│  ③ 缓存   内存 Map + localStorage（TTL 6h~7d，命中即先渲染后刷新）               │
│                              │                                                  │
│  ④ 渲染   「资料增强」毛玻璃容器（模块可独立开关；失败静默，不影响原生区块）     │
└─────────────────────────────────────────────────────────────────────────────────┘
                     │                          │
                     ▼                          ▼
          imgproxy :18098 → /vdimg       Emby 同源图片端点
          （图床/YouTube 缩略图转发）      （Backdrop/Person 原图）
```

### 5.2 接口清单（前端调用）

```
# —— R18 分支（AVDB 引擎，跨源，带 X-API-Key，CORS 已放行）——
GET  {avdbBase}/api/v1/javdb/search?q={番号}&type=movie&limit=1
GET  {avdbBase}/api/v1/javdb/movies/{movieId}                 # data.movie
GET  {avdbBase}/api/v1/articles/javdb-gallery?number={番号}    # 剧照（已代理）
GET  {avdbBase}/api/v1/javdb/actors/{actorId}                 # 演员资料
GET  {avdbBase}/api/v1/javdb/movies/tags?series_id={id}&series_type=1
GET  {avdbBase}/api/v1/javdb/movies/{movieId}/magnets
GET  {avdbBase}/api/v1/javdb/preview/assets?url={m3u8}&movie_id={id}
# 可选：Emby id 直达
GET  {avdbBase}/api/v1/articles/emby-items/{embyItemId}/detail

# —— 正经库分支（Emby 同源，ApiClient 自带鉴权）——
GET  /emby/Users/{uid}/Items/{id}?Fields=BackdropImageTags,People,RemoteTrailers,LocalTrailerCount,Similar
GET  /emby/Items/{id}/Images/Backdrop/{i}?maxWidth=900
GET  /emby/Items/{personId}/Images/Primary?maxWidth=200
GET  /emby/Users/{uid}/Items/{id}/LocalTrailers
GET  /emby/Items/{id}/Similar?UserId={uid}&Limit=12
```

### 5.3 缓存策略

| 层级 | 内容 | TTL | 说明 |
|---|---|---|---|
| 内存 Map | 本次会话已取过的 movie/actor/series | 会话级 | 详情页内前进后退不重复请求 |
| localStorage | `ves:enrich:{serverId}:{itemId}` → 精简 JSON（剧照 URL、演员、同类） | **6h**（影片）/**7d**（演员/系列） | 二次进入秒开；命中先渲染旧值，后台静默刷新 |
| 图片 | 由 imgproxy / Emby 自带 `Cache-Control` | 7d | 前端不额外缓存二进制 |

**key 设计**：`ves:enrich:v1:{serverId}:{itemId}`；`v1` 便于结构升级时整体失效。

### 5.4 性能预算

- **首屏零新增阻塞请求**：容器在原生详情页渲染完成后**异步**注入（`requestIdleCallback`/`setTimeout 0`）。
- **首屏新增网络请求 ≤ 1 次**（AVDB `search`）；`movies/{id}`、`gallery`、`actors` 等**并行发**，且**只有容器进入视口**才发（IntersectionObserver）。
- **超时 5s**（`AbortController`），超时即隐藏容器，不阻塞任何原生功能。
- 单条目图片 `loading="lazy"`，首屏最多解码 6 张缩略图。
- 目标：容器对 LCP 影响 < 50ms；无第三方同步脚本。

### 5.5 安全边界

1. **仅内网**：`avdbBase`、`imgproxyBase` 均为内网地址；前端**不向公网**发任何媒体/用户数据。
2. **凭据注入**：`avdbKey` 由部署时 `window.VANVY_DETAIL_CONFIG` 注入（现有机制），**不硬编码进组件源码**；报告与前端源码不落 key。
3. **XSS**：所有第三方字段经 `esc()` 转义后再插值；**不使用 `innerHTML` 拼接未转义数据**；图片 URL 走白名单前缀校验。
4. **不落盘敏感信息**：localStorage 只存展示用精简字段，不含凭据。
5. **CORS 说明**：`allow-origin:*` + `allow-credentials:true` 组合下，前端 fetch **不设 `credentials`**（仅自定义头），符合规范。
6. **不外泄**：不调用任何外部上报/埋点。

### 5.6 ⭐ 同一套增强如何同时服务「正经库」和「R18 库」

**核心：数据源二分流 + 统一容器 UI。**

| | 正经库 | R18 库 |
|---|---|---|
| 判定 | `ProviderIds` 有 `Tmdb/Imdb/Tvdb`、无番号、`OfficialRating` 非 18+ | 番号命中 / `MetaTube` / `JP-18+` / 库名命中 |
| 数据源 | **Emby 原生 + TMDB** | **本地 AVDB 引擎**（+ Emby 兜底） |
| 剧照 | Emby `Backdrop`（实测 39/40 有） | AVDB `javdb-gallery`（实测 11~10 张）+ Emby Backdrop |
| 演员 | Emby `People` + 头像 | AVDB `actors/{id}`（三围/生日）+ Emby People 兜底 |
| 预告 | YouTube（RemoteTrailers） | DMM/1pondo mp4 + AVDB `preview/assets` |
| 同类 | Emby `/Similar` | AVDB `relative_movies` + `movies/tags`（同系列） |
| 磁力 | — | AVDB `magnets`（可选，一键转存） |

**为什么正经库不能走 AVDB**（实测反证）：
```
$ curl -s -H "X-API-Key: <见 vanvy.env>" \
  "…/api/v1/javdb/search?q=骗骗喜欢你&type=movie&limit=3"
→ 命中 CESD-089 / ZZZM-1379 / FC2-1101834   ← 全是垃圾，纯误命中
$ curl -s -H "X-API-Key: <见 vanvy.env>" "…/api/v1/articles/emby-items/1531339/detail"
→ {"code":1,"message":"未从 Emby 读取到影片详情","data":null}   ← 引擎本身即拒绝
```
**双重保险**：① 判定层只在命中番号/MetaTube 时走 AVDB；② 即便走错，引擎对正经 id 也返回空 → 容器自动降级为「Emby 原生 + TMDB」。

### 5.7 防误判（沿用项目教训：不要把「演员信息」当成 JAV 内容）

- **绝不**仅凭「有演员/有 People」就判 JAV；**必须**命中 `番号正则` 或 `ProviderIds.MetaTube` 或 `JP-18+`。
- 番号正则收紧：`^[A-Z]{2,6}-\d{2,6}$`（词首锚定）比现有 `\b[A-Za-z]{2,8}[-_ ]?\d{2,6}\b` 更安全；新增**白名单放行**（如 `SE7EN`、`1917`、`B-52` 之类误伤词）。
- 库名判定用**白名单**而非黑名单（避免「有码」被正经片名包含）。
- 命中 < 阈值 → **不显示 AVDB 模块**，只显示原生+TMDB 模块。

### 5.8 开关设计（遵循现有 `CFG.p2` 风格）

```js
// 在 CFG.p2 中新增（逐项独立，可由 config.js 覆盖）
p2: {
  enrich: true,          // ★总开关：整个「资料增强」容器
  enrichStills: true,    // 剧照墙
  enrichCast: true,      // 演员资料
  enrichTrailers: true,  // 预告片
  enrichSimilar: true,   // 同系列 / 更多类似
  enrichMagnets: false,  // 磁力（默认关，避免误触下载）
  enrichLibs: '',        // 限定媒体库（逗号分隔，空=全部）
  enrichAvdbContainers: ['emby-18']  // 仅这些服务器走 AVDB（呼应 VANVY_MDC_CONTAINERS）
}
```
- 总开关关闭 → 容器完全不注入，**零请求**。
- 分模块关闭 → 该模块不渲染、不请求。
- `enrichAvdbContainers` 与现有 `CFG.mdc` 白名单思路一致，避免在正经库乱打 AVDB。

### 5.9 降级路径

| 故障 | 行为 |
|---|---|
| AVDB 超时 / 不可达 | 5s 后隐藏 AVDB 模块，**Emby 原生区块零影响** |
| AVDB 无命中（正经库/冷门番号） | 只显示「Emby 原生 + TMDB」模块 |
| 图片 404 | `onerror` 隐藏该图/占位，不破版 |
| `LocalTrailers`/`Similar` 报错 | 单模块 try/catch 静默跳过（现有风格） |
| localStorage 命中 | 先渲染旧数据（可能略旧），后台刷新后无感替换 |

**铁律**：任何第三方失败都**不得**抛到原生详情页渲染链路上。

### 5.10 分阶段落地计划

| 阶段 | 内容 | 上线 | 回滚 |
|---|---|---|---|
| **P0** | 正经库「资料增强」容器：剧照(Backdrop) + 演员(People) + 预告(YouTube) + 更多类似(Similar)。**纯 Emby 原生 + TMDB**，不动 AVDB | 独立上线 | 关 `CFG.p2.enrich` 即回滚（零副作用） |
| **P1** | R18 容器：剧照墙(`javdb-gallery`) + 演员资料(`actors/{id}`) + 同系列(`relative_movies`/`movies/tags`) | 仅 `emby-18` 白名单 | 关 `enrichAvdbContainers` 或分模块开关 |
| **P2** | 磁力面板（一键转存到迅雷/115）+ 预览视频弹框（`preview/assets`）+ 可选自建聚合服务（方案②） | 按需 | 关 `enrichMagnets` / 整体开关 |

每阶段互不依赖：P0 无 AVDB 依赖；P1 只在 R18 白名单；P2 可选。

---

## 6. D. 设计落地效果图

渲染方式：`/usr/bin/google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --window-size=1440,H --virtual-time-budget=3000 --screenshot=<out.png> file://<html>`；HTML 用本地 `file://` 打开，图片为真实样本（已落盘到 `preview/enrich-lab/img/`）。

| 效果图 | 源文件 | 说明 |
|---|---|---|
| `legit-enrich.png`（1440×1180） | `legit-enrich.html` | 正经库详情页「资料增强」容器：剧照条 + 演员圆角卡 + YouTube 预告卡 + 更多类似 + 开关 chips |
| `r18-enrich.png`（1440×1780） | `r18-enrich.html` | R18 详情页增强容器：封面+元数据 + 剧照墙(11 张,大图 span) + 预告双卡(DMM/AVDB) + 演员资料(三围/生日) + 同系列墙 + 磁力 chip |
| `architecture.png`（1440×1040） | `architecture.html` | 架构/数据流示意：浏览器流程 4 步 → 数据源层 4 路 → 降级/安全双栏 |

风格：深色 + 黑金（主色 `#e8c66a`、次 `#a8741a`），卡片圆角 20px，毛玻璃 `backdrop-filter: blur(24px)`，与现有详情页一致。

**产物路径**：
- 源 + PNG：`emby-beautify/preview/enrich-lab/`（含 `img/` 样本图）
- nginx 分发副本：`/vol1/1001/web/mockup/enrich-lab/`（PNG + HTML + img）

> 自查：三张 PNG 均经 `image` 工具核验，布局完整、图片正常加载、无文字重叠/截断。

---

## 7. 风险与开放问题

1. **引擎稳定性**：`preview.m3u8` 实测 404，`preview/assets` 可用但属「非文档化」路径，需容错；建议 P2 前再压测。
2. **图床可用性**：`tp.spfcas.com` 图床若变更，需依赖 imgproxy；建议图片统一走 imgproxy，避免直连。
3. **别名映射**：R18 台 People 日文名 vs AVDB 中文名需 `CFG.actorAlias` 或不依赖 Emby 名，直接用 `emby-items/{id}/detail.actors`。
4. **AVDB 引擎绑定单一 Emby**：目前只映射 R18 台（18088）；若将来正经库也想接自建元数据，需引擎侧支持，或走方案②。
5. **隐私**：容器展示 R18 内容，需确保**仅在对应库/白名单容器**出现（已用 `enrichAvdbContainers` 约束）。
6. **性能**：真实网络下 AVDB 首次响应时延未知（本次为内网毫秒级），上线前需实测并校准超时。

---

## 8. 附录 · 关键实测命令

```bash
# 内网直连（不设代理）
NOP='--noproxy *'

# A. AVDB 引擎
curl -s $NOP -H "X-API-Key: <见 vanvy.env>" "http://192.168.1.10:38000/openapi.json" | jq '.paths|length'   # 256
curl -s $NOP -H "X-API-Key: <见 vanvy.env>" "http://192.168.1.10:38000/api/v1/javdb/search?q=SSIS-698&type=movie&limit=3"
curl -s $NOP -H "X-API-Key: <见 vanvy.env>" "http://192.168.1.10:38000/api/v1/javdb/movies/5EWRKD"          # data.movie
curl -s $NOP -H "X-API-Key: <见 vanvy.env>" "http://192.168.1.10:38000/api/v1/articles/javdb-gallery?number=PRED-750&limit=20"
curl -s $NOP -H "X-API-Key: <见 vanvy.env>" "http://192.168.1.10:38000/api/v1/javdb/actors/Av2e"
curl -s $NOP -H "X-API-Key: <见 vanvy.env>" "http://192.168.1.10:38000/api/v1/javdb/movies/tags?series_id=BWEG&series_type=1&limit=30"
curl -s $NOP -H "X-API-Key: <见 vanvy.env>" "http://192.168.1.10:38000/api/v1/articles/emby-items/740998/detail"
# CORS
curl -s $NOP -D - -o /dev/null -H "Origin: http://192.168.1.2:8097" -H "X-API-Key: <见 vanvy.env>" \
  "http://192.168.1.10:38000/api/v1/javdb/search?q=x&type=movie&limit=1"

# B. Emby（需先取 user id）
TOK='<见 vanvy.env>'; BASE='http://192.168.1.2:18088/emby'
UID=$(curl -s $NOP "$BASE/Users?api_key=$TOK" | jq -r '.[0].Id')
curl -s $NOP "$BASE/Users/$UID/Items/740998?api_key=$TOK&Fields=RemoteTrailers,LocalTrailerCount,BackdropImageTags,People"
curl -s $NOP "$BASE/Users/$UID/Items/740998/LocalTrailers?api_key=$TOK"
curl -s $NOP "$BASE/Items/740998/Images/Backdrop/0?api_key=$TOK&maxWidth=900" -o /tmp/bd.jpg

# D. 渲染效果图
/usr/bin/google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=1440,1780 --virtual-time-budget=3000 \
  --screenshot=r18-enrich.png "file://$PWD/r18-enrich.html"
```

---

## 9. 一句话结论

**方案①**：在详情页加一个可开关、可降级的「资料增强」毛玻璃容器——**正经库走 Emby 原生 + TMDB，R18 走本地 AVDB 引擎（自带 CORS，实测可用）**；不碰 MDC，不新增常驻服务，P0/P1/P2 三阶段各自可独立上线与回滚。

---

## 10. 补充 · 需求②「合集/系列页 外部站点画廊」—— **已实现上线（2026-09-13）**

> 主人原话：*「合集和一些其他页面它会额外显示一个 JavDB 这些外部站点对应合集的作品画廊，可以方便用户快速查看同类型或者合集外部站点都有哪些片子，用户可以点击跳转到对应外部站点的对应页面。」*

### 实现位置
`components/features/detail/vanvy-detail.js` → `injectAvdbSeriesGallery(view, item)`
（仅在 `item.Type === 'BoxSet'` 时触发；复用既有 `CFG.p2.javSeriesWall` 开关与 `.vd-strip / .vd-jcard / .vd-jser-tip` 样式，零新增皮肤。）

### 数据流
```
合集(BoxSet) 详情页
  → 归一化合集名
  → GET /api/v1/javdb/search?q=<合集名>&type=series&limit=8
  → 归一化后**严格同名**才算命中，且 videos_count ≥ 3
  → GET /api/v1/javdb/movies/tags?series_id=<id>&series_type=<type>&limit=24
  → 渲染封面墙（点击封面 → javdb.com/search?q=<番号>）
     标题右侧「在 JavDB 打开 ›」→ javdb.com/series/<id>
```

### ⚠️ 安全闸门（本节最关键）
AVDB 的系列搜索是**模糊匹配**，直接拿来用会大量误命中。实测反证：

| 输入（正经库合集名） | AVDB 返回 | 若不加闸门 |
|---|---|---|
| `哈利·波特（系列）` | `1ヶ月だけ洗脳特権` / `ワープエンタテインメント 1年まるごと特別総集編` | ❌ 误报 |
| `007（系列）` | `しゃぶる007` | ❌ 误报 |
| `加勒比海盗（系列）` | `港区系インフルエンサー女子と1日中コスプレSEX` … | ❌ 误报 |
| `骗骗喜欢你` / `阿凡达（系列）` | 空 | ✅ 不显示 |

因此实现要求**双条件**：① 归一化全等（去「（系列）」/括号后缀/`系列` 结尾/空白与分隔符，忽略大小写）；② `videos_count ≥ 3`。

**用真实数据做的回归（本机可复跑）**：

| 合集名 | 归一化 | AVDB 候选 | 结论 |
|---|---|---|---|
| `スポえろジャーニー` | `スポえろジャーニー` | 同名（37 部） | ✅ 显示 |
| `街角シロウトナンパ` | `街角シロウトナンパ` | 同名（169 部） | ✅ 显示 |
| `NTRモニタリング` | `ntrモニタリング` | 同名但仅 3 部 | ✅ 显示（阈值 3）|
| `哆骗喜欢你` / `阿凡达（系列）` | — | 空 | ⛔ 不显示 |
| `哈利·波特（系列）` / `007（系列）` / `加勒比海盗（系列）` / `人类清除计划（系列）` | — | 有结果但**不同名** | ⛔ 不显示 |

→ **正经库零误报**；未命中时整块容器**不出现**（自然降级，不打扰原生页面）。

### 与「单部影片 · 同系列墙」的分工
| | 触发页 | 索引方式 | 数据 |
|---|---|---|---|
| `injectJavSeriesWall`（既有） | 单部影片 | 按**番号** | `movies/{id}.relative_movies`（带封面） |
| `injectAvdbSeriesGallery`（本次新增） | **合集/系列页** | 按**合集名** | `movies/tags?series_id`（该系列全量作品） |

### 复跑命令
```bash
# 闸门回归（真数据）
node -e '…(见本次提交说明中的 /tmp/gate.mjs 逻辑)…'
# 或手工：
curl -s -H "X-API-Key: <见 vanvy.env>" \
  -G --data-urlencode "q=哈利·波特（系列）" --data type=series --data limit=8 \
  http://192.168.1.10:38000/api/v1/javdb/search
```

---

## 11. 落地记录 · P0「正经库资料增强容器」—— **已实现上线（2026-09-13）**

### 交付物
| 位置 | 内容 |
|---|---|
| `components/enrich/enrich_service.py` | 本机资料聚合服务（纯标准库单文件，端口 18097） |
| `components/enrich/install-enrich.sh` | 安装/更新/自检/卸载（幂等 cron 保活） |
| `components/features/detail/vanvy-detail.js` | `injectEnrich()` + `CFG.p2.enrich*` 开关 |
| nginx `location /enrich/` | 公网 HTTPS 出口（上游自带 CORS，**不再 add_header** 以免重复） |
| `preview/enrich-lab/legit-enrich-real.html` | 用**组件真 CSS + 真实 TMDB 数据**渲染的实装效果图 |

### 为什么最终仍需一个小服务
P0 原计划「纯 Emby 原生 + TMDB，零新增服务」，但实测：**浏览器直连 TMDB 需要用户那台设备能出网**——
`curl https://api.themoviedb.org` 直连返回 `000`（国内不可达），只有走代理才通。
因此把 TMDB 放在**本机**（有出网代理的那台）聚合：一次抓取 + 磁盘缓存 7 天 + Key 留在服务端。

### 关键实现点
- **单次 TMDB 请求聚合整套资料**：`?append_to_response=images,credits,videos,recommendations,similar`
  ⚠️ 踩坑：只传 `language=zh-CN` 时 TMDB `videos` 常为空（该片无中文预告）→ 必须显式
  `include_image_language` / `include_video_language` 补 `en, null` 才能拿到官方预告（实测 0 → 8~9 段）。
- **正经库命中 TMDB id 的比例实测 = 100%**（emby-302 与主 Emby 各抽 30 部，30/30 有 `ProviderIds.Tmdb`）。
- **接管而非叠加**：容器启用时 `injectSections` 跳过独立的 剧照/演员/预告/同类 四块（置
  `view.__vdEnrich` 且**按 item.Id 记账**——Emby 会复用 `.itemView` 元素，用布尔标记会把下一个条目挡掉）。
- **零副作用降级**：服务不可达 / 无 TMDB id / 无数据 → 容器不出现，原生四块照常渲染。
- **兜底地址推导**而非硬编码（否则会泄露内网 IP）：`VANVY_ENRICH_BASE` → 图片代理同源 + `/enrich`。
- **前端缓存**：localStorage 6h；命中直接渲染，不再打服务。

### 实测证据
```
# 服务（真数据）
/api/detail?tmdb=872585 → 奥本海默 2023 | 剧照 24 演员 20 预告 8 同类 18
/api/detail?tmdb=371608 → 只杀陌生人2 2018 | 剧照 24 演员 13 预告 9 同类 18
/api/search?q=奥本海默   → 命中 2；/api/person?id=2037 → 基利安·墨菲 920 字简介
OPTIONS 预检 → 204 + allow-origin:*/methods/headers；公网 https://…/enrich 200（缓存命中 0.27s）

# 前端（headless 真组件 + 真 CSS）
服务可用 → .vd-enrich-section 含 4 模块（剧照|TMDB·24 张 / 演员|·20 位 / 预告|·8 段 / 更多类似|·18 部）
          且 .vd-fanart/.vd-cast/.vd-trailer/.vd-similar = false（**不重复** ✅）
服务不可达 → 容器 false，且上述原生四块 = true,true,true,true（**降级完整** ✅）

# 容器
emby-302 / emby-18 部署后逐文件 md5 == 仓库；config.js 含 enrich:true 与 enrichBases
```

### 尚未做（P1 / P2）
- **P1：R18 走 AVDB**（`emby-18` 白名单）—— 剧照墙 `javdb-gallery`、演员资料 `actors/{id}`、
  同系列 `relative_movies`/`movies/tags`、磁力。**浏览器可直连 AVDB（自带 CORS）**，不需要本服务。
- **P2：磁力一键转存 / 预览视频弹框**（`preview/assets`）。

---

## 12. 落地记录 · P1 + P2「R18（小姐姐库）AVDB 增强」—— **已实现上线（2026-09-13）**

> 与 P0 的关键差别：**R18 不需要本机服务**。本地 AVDB 引擎自带完整 CORS（实测 GET `allow-origin:*`、
> OPTIONS 回显 Origin 且允许 `x-api-key`），浏览器**直连即可**。这正是不走 MDC 的核心理由。

### P1 已落地
| 能力 | 端点 | 说明 |
|---|---|---|
| **剧照墙** | `GET /api/v1/articles/javdb-gallery?number=<番号>` | 外站剧照（比 Emby Backdrop 更全），命中即**接管**剧照区块 |
| **演员资料** | `GET /api/v1/javdb/actors/{id}` | 别名/生日/年龄/身高/三围(含罩杯)/血型/出生地/作品数 + 外站主页 |

- 演员 id 解析：本地名 →（`actorAlias` 优先）→ `search?type=actor` → **精确同名优先**
  （含 `name_zht` / `other_name` 别名匹配）。实测必要性：本地「波多野結衣」直接取首命中有风险，
  改为同名优先后命中正确 id。
- 剧照图片：AVDB 图床端点需鉴权，`<img>` 带不了请求头 → 用 `api_key` 查询参数
  （该 key 本就随 config.js 下发到浏览器，**非新增暴露面**）。

### P2 已落地
| 能力 | 端点 | 说明 |
|---|---|---|
| **磁力面板** | `GET /api/v1/javdb/movies/{id}/magnets?number=` | 名称/来源/大小(自动换算)/标签(中字·高清·4K·破解·文件数)/日期 |

- 操作：**复制磁力** / **PikPak 外链** / **复制全部**。
- 🔒 **不做自动下载/转存**：那属于外部写操作（会直接给 QB/115 派任务），误触代价高 →
  只提供复制与链接，由用户自行决定。
- 外链一律 `target="_blank" rel="noopener"`。

### ⛔ 未做：预览视频弹框（实测不可用）
```
GET /api/v1/javdb/movies/{id}/preview.m3u8        → 404
GET /api/v1/javdb/preview/assets?url=…&movie_id=… → {"detail":"预览资源暂时无法连接"}
```
AVDB 侧取不到预览流，**不做无用的死按钮**。`preview_video_url` 字段（DMM 直链）仍可作为后续
备选，但需另配代理与探测，暂缓。

### 开关（全部独立，可单关）
```js
CFG.p2.javGallery      // 剧照墙（AVDB）
CFG.p2.javActorProfile // 演员资料（AVDB）
CFG.p2.javMagnets      // 磁力面板（AVDB）
```

### 实测证据（headless 真组件 + 真 AVDB）
```
JAV 条目  → 剧照墙「AVDB 外站 · 8 张」；演员资料 生日/年龄/身高/三围/血型/出生地/作品数 全渲染（波多野結衣）
           磁力「AVDB · 7 条」，标签 中字/高清/破解 正确，含 magnet 链与 PikPak ✅
           injectJavGallery 命中 → 原生 .vd-fanart-section 不出现（不重复）✅
AVDB 挂   → 画廊/磁力块均不出现；演员资料显示「未在外站找到该演员主页」；JAV 卡与原生区块照常 ✅
非 JAV 条目→ 三者均不注入（P1/P2 严格 JAV 专属）✅
容器      → emby-302 / emby-18 逐文件 md5 == 仓库 ✅
```

### 效果图
- `preview/enrich-lab/r18-p1-real.html` → `r18-p1-real` 实装（剧照墙 + 演员资料）
- `preview/enrich-lab/r18-p2-real.html` → `r18-p2-real` 实装（磁力面板，出图版片名已做脱敏）
- 同步分发：`/vol1/1001/web/mockup/enrich-lab/`

---

## 13. 后续变更 · MDC-NG 联动组件已移除（2026-09-13）

主人决定：**移除 MDC 组件**（"MDC 既然开发不了"）。

### 移除依据
本项目对 MDC 的所有依赖都建立在「能不能被浏览器调用」上，而结论是否定的（见 §1.2）：
不发 CORS、不处理 OPTIONS 预检 → 必须额外维护 nginx 反代 + 路径映射，且只对 R18 有效。
而 §11/§12 落地的两套增强已覆盖原本想从 MDC 获得的信息（剧照/演员/同类/预告）。

### 已移除
| 位置 | 内容 |
|---|---|
| `vanvy-detail.js` | `CFG.mdc` 配置块、config 合并分支、`injectMdcButton` 调用、整个 MDC 模块（113 行） |
| `vanvy-detail.css` | `.vd-mdc-*` 样式（22 行） |
| `install-ves.sh` | `VANVY_MDC_*` 沿用/重建分支 + 生成的 `mdc:` 配置块 |
| `vanvy.env` / `.example` | MDC 段全部变量 |
| `nginx/` | 删除 `mdc-proxy.conf` 与 `/mdc/` 反代（本地 + 部署两侧，`nginx -t` 通过并已 reload） |
| `scripts/ves_deploy.sh`、`lib/vanvy-env.sh` | 透传变量与注释（顺带补上 §11/§12 新增开关的透传） |
| `docs/INSTALL.md`、`DEPLOY.md`、`VANVY_SUITE.md`、`design/phase2-plan.md` | 同步更新/标注已移除 |

### 验证
```
旧路由 /mdc/            → 404 ✅
/enrich/（保留）         → 200 ✅
emby-302 / emby-18      → config.js 中 mdc 行数 = 0；js/css 中 mdc 命中 = 0；逐文件 md5 == 仓库 ✅
功能回归（headless）     → JAV 卡 / 剧照墙 / 演员资料 / 磁力 / 同系列墙 全部正常；页面无 mdc 残留；无 JS 报错 ✅
```

> ⚠️ UNRAID 上的 **MDC-NG 容器本身未动**（`MDC-NG` / `mdcng/mdc:latest` 仍在运行，含主数据库）。
> 本仓库只移除了「联动集成」。是否停用/删除该容器属破坏性操作，**需主人明确指示**。

---

## 14. 兼容性修复 · Emby 4.9 详情页注入块溢出（2026-09-13）

主人实测反馈：**4.9 的 emby 详情页「容器显示都不正常」，4.8 的 emby-302 正常**。

### 根因（4.9 现网 playwright 实测定位）
```
Emby 4.9  .details-additionalContent   display:flex; flex-wrap:wrap   ← row + wrap
Emby 4.8  同上                                      块级（非 flex）
```
注入块作为 flex item 时按 **max-content** 撑开，被 `--vd-col-max: 1500px` 顶满：
| | 容器宽 | 注入块宽 | 右边缘 | 溢出 |
|---|---|---|---|---|
| 修复前 | 1202 | **1500** | 1738 | **+298px（被裁）** |
| 修复后 | 1202 | 1202 | 1440 | **0** |

（1202 而非 1440，是因为 4.9 有左侧常驻抽屉占 238px。）

### 修法
凡是用「`max-width: var(--vd-col-max)` + `margin:auto`」收窄到内容列的注入块，
**必须显式声明 `width:100%`**（配合 `box-sizing:border-box`）：
- `.vd-sections-host`
- `body.vanvy-detail-active .details-additionalContent > .verticalSection:not(.vd-p2-about)`
- `.vd-p2-about` 原本用 `calc(100% - 2*pad)`，已安全，无需改

### 验证方式（**未改动 4.9 容器**）
用 playwright 登录 4.9 现网页面，**只注入这几条 CSS 规则**后重新测量：
`host 1202 → 各 section 1090 → right 1440 → overflow 0` ✅；
本地 harness 另证块级容器（4.8 结构）新旧写法宽度相同（1202 == 1202）→ **4.8 无回归**。

### 防回归
新增 `scripts/check-detail-width.sh`（先剥 CSS 注释再校验；反向测试可失败），已纳入发布包。
