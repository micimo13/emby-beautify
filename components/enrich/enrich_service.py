#!/usr/bin/env python3
"""
enrich_service.py — VES 第三方资料增强服务（纯标准库，零依赖）
=============================================================================
用途：
  详情页「资料增强」容器的后端。把 Emby 原生没有/不全的第三方资料
  （剧照、演员与角色、预告片、同类推荐）聚合后返回给浏览器。
  · 正经库 → TMDB（ProviderIds.Tmdb）
  · （预留）R18 库 → 本地 AVDB 引擎（浏览器可直连，无需本服务）

为什么需要它：
  · 直接在浏览器里调 TMDB 需要「用户那边能出网」，国内不可靠；
    本机（飞牛）有出网代理 + 磁盘缓存，一次抓取全站共享。
  · 顺带把 API Key 收在服务端，前端只拿数据，不落凭据。

访问：
  GET /healthz                                              # 健康检查
  GET /api/detail?tmdb=<id>&type=movie|tv[&lang=zh-CN]      # 聚合资料（单次请求）
  GET /api/search?q=<title>&year=&type=movie|tv             # 按标题找 TMDB id
  GET /api/person?id=<personId>[&lang=zh-CN]                # 演员简介（P1 用）

特性：
  · CORS *（含 OPTIONS 预检）→ 浏览器可从 Emby 页面跨端口/跨域直连
  · 单次 TMDB 请求（append_to_response）聚合 剧照/演员/预告/同类
  · 内存 + 磁盘两级缓存（默认 7 天），磁盘缓存跨重启
  · 上游代理链（http/https，按序回退 + 全挂回落直连），复用 img_proxy 同款配置风格
  · 全失败优雅降级：返回 {"ok":false} 而非 5xx，前端据此退回 Emby 原生

配置（环境变量优先，其次 config.json，其次 DEFAULTS）：
  VANVY_ENRICH_PORT      默认 18097
  VANVY_TMDB_KEY         TMDB API Key（必填，否则服务只提供 /healthz）
  VANVY_ENRICH_PROXIES   代理链，逗号分隔，如 http://user:pass@host:10080
  VANVY_ENRICH_TTL       缓存秒数，默认 604800
=============================================================================
"""
import hashlib
import json
import os
import socketserver
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

VERSION = "1.0.0"

DEFAULTS = {
    "port": 18097,
    "host": "0.0.0.0",
    "tmdb_key": "",
    "proxies": [],              # ["http://user:pass@host:port", ...]
    "proxy_fallback_direct": True,
    "ttl": 604800,              # 7 天
    "timeout": 20,
    "cache_dir": "",            # 留空 = 系统临时目录下 vanvy-enrichcache
    "lang": "zh-CN",
    "debug": False,
}
ENV_MAP = {
    "VANVY_ENRICH_PORT": ("port", "int"),
    "VANVY_ENRICH_HOST": ("host", "str"),
    "VANVY_TMDB_KEY": ("tmdb_key", "str"),
    "VANVY_ENRICH_PROXIES": ("proxies", "list"),
    "VANVY_ENRICH_TTL": ("ttl", "int"),
    "VANVY_ENRICH_TIMEOUT": ("timeout", "int"),
    "VANVY_ENRICH_CACHE_DIR": ("cache_dir", "str"),
    "VANVY_ENRICH_LANG": ("lang", "str"),
    "VANVY_ENRICH_DEBUG": ("debug", "bool"),
}
CFG = dict(DEFAULTS)
TMDB = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p"

_lock = threading.Lock()
_mem = {}          # key -> (expire_ts, payload)


# ── 配置装载 ────────────────────────────────────────────────────────────────
def _load_config():
    global CFG
    path = os.environ.get("VANVY_ENRICH_CONFIG", "")
    cands = [path] if path else []
    cands += [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "enrich_config.json"),
        os.path.join(os.getcwd(), "enrich_config.json"),
        "/vol1/@apphome/trim.openclaw/data/workspace/scripts/enrich_config.json",
    ]
    for c in cands:
        try:
            if c and os.path.isfile(c):
                with open(c, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    CFG.update({k: v for k, v in data.items() if k in DEFAULTS})
        except Exception as e:
            print("[warn] 读取配置失败 %s: %s" % (c, e))
    for env, (key, typ) in ENV_MAP.items():
        v = os.environ.get(env)
        if v is None or v == "":
            continue
        try:
            if typ == "int":
                CFG[key] = int(v)
            elif typ == "bool":
                CFG[key] = v.strip().lower() in ("1", "true", "yes", "on")
            elif typ == "list":
                CFG[key] = [x for x in (s.strip() for s in v.split(",")) if x]
            else:
                CFG[key] = v
        except Exception as e:
            print("[warn] 环境变量 %s 解析失败: %s" % (env, e))
    if not CFG["cache_dir"]:
        CFG["cache_dir"] = os.path.join(tempfile.gettempdir(), "vanvy-enrichcache")
    try:
        os.makedirs(CFG["cache_dir"], exist_ok=True)
    except Exception:
        CFG["cache_dir"] = ""


# ── 出网（带代理链）─────────────────────────────────────────────────────────
def _openers():
    """按代理链构造 opener 列表：每个代理一个，最后一个是直连（可关）。"""
    out = []
    for p in CFG["proxies"]:
        out.append(urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": p, "https": p})))
    if CFG["proxy_fallback_direct"] or not out:
        out.append(urllib.request.build_opener(urllib.request.ProxyHandler({})))
    return out


_OPENERS = None


def _fetch_json(url, timeout=None):
    """依次尝试代理链，返回 (dict, err)。"""
    global _OPENERS
    if _OPENERS is None:
        _OPENERS = _openers()
    timeout = timeout or CFG["timeout"]
    last = ""
    for i, op in enumerate(_OPENERS):
        try:
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "VanvyEnrich/%s" % VERSION,
            })
            with op.open(req, timeout=timeout) as r:
                raw = r.read()
            return json.loads(raw.decode("utf-8", "replace")), None
        except Exception as e:
            last = "opener#%d %s" % (i, e)
            continue
    return None, last or "no-opener"


# ── 缓存 ────────────────────────────────────────────────────────────────────
def _ckey(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:24]


def _disk_path(key):
    return os.path.join(CFG["cache_dir"], key + ".json") if CFG["cache_dir"] else ""


def cache_get(key):
    now = time.time()
    with _lock:
        hit = _mem.get(key)
    if hit and hit[0] > now:
        return hit[1]
    p = _disk_path(key)
    if p and os.path.isfile(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                obj = json.load(f)
            if isinstance(obj, dict) and obj.get("__exp", 0) > now:
                with _lock:
                    _mem[key] = (obj["__exp"], obj.get("data"))
                return obj.get("data")
        except Exception:
            pass
    return None


def cache_set(key, data, ttl=None):
    exp = time.time() + (ttl or CFG["ttl"])
    with _lock:
        _mem[key] = (exp, data)
    p = _disk_path(key)
    if p:
        try:
            with open(p + ".tmp", "w", encoding="utf-8") as f:
                json.dump({"__exp": exp, "data": data}, f, ensure_ascii=False)
            os.replace(p + ".tmp", p)
        except Exception:
            pass


# ── TMDB 归一化 ─────────────────────────────────────────────────────────────
def _img(path, size="w780"):
    return ("%s/%s%s" % (IMG, size, path)) if path else ""


def _youtube(key):
    return "https://www.youtube.com/watch?v=" + key if key else ""


def build_payload(tmdb_id, mtype, lang):
    """单次 TMDB 请求聚合所需资料；返回 dict 或 None。"""
    if not CFG["tmdb_key"]:
        return None
    mtype = "tv" if str(mtype).lower() in ("tv", "series", "season", "episode") else "movie"
    # ⚠️ include_video_language 必须显式给：只传 language=zh-CN 时 TMDB 的视频列表常为空
    #    （中文预告片很多片没有）→ 退化为英文/null 仍然能拿到官方预告。
    url = ("%s/%s/%s?api_key=%s&language=%s&append_to_response=%s"
           "&include_image_language=%s&include_video_language=%s"
           % (TMDB, mtype, urllib.parse.quote(str(tmdb_id)), urllib.parse.quote(CFG["tmdb_key"]),
              urllib.parse.quote(lang), "images,credits,videos,recommendations,similar",
              urllib.parse.quote("%s,en,null" % lang.split("-")[0]),
              urllib.parse.quote("%s,en,null" % lang.split("-")[0])))
    d, err = _fetch_json(url)
    if not d or d.get("success") is False:
        return {"ok": False, "err": err or (d or {}).get("status_message", "tmdb error")}

    # 剧照（Backdrop）：优先 16:9，取前 24 张
    stills = []
    for im in (d.get("images") or {}).get("backdrops", [])[:24]:
        stills.append({"w": im.get("width"), "h": im.get("height"), "url": _img(im.get("file_path"))})
    posters = [{"url": _img(p.get("file_path"), "w500")}
               for p in (d.get("images") or {}).get("posters", [])[:12]]

    # 演员（含角色 + 头像）
    cast = []
    for c in (d.get("credits") or {}).get("cast", [])[:20]:
        cast.append({
            "id": c.get("id"), "name": c.get("name"),
            "character": c.get("character") or "",
            "profile": _img(c.get("profile_path"), "w185"),
        })

    # 预告片（YouTube 优先，其次其它站点）
    trs = []
    for v in (d.get("videos") or {}).get("results", []):
        if (v.get("site") or "").lower() != "youtube":
            continue
        if (v.get("type") or "") not in ("Trailer", "Teaser", "Clip"):
            continue
        trs.append({"name": v.get("name") or "预告片", "site": "YouTube",
                    "key": v.get("key"), "url": _youtube(v.get("key")),
                    "type": v.get("type"), "official": bool(v.get("official"))})
    trs.sort(key=lambda x: (0 if x["official"] else 1, 0 if x["type"] == "Trailer" else 1))

    # 同类推荐（recommendations 优先，不足补 similar）
    sim, seen = [], set()
    for src in ("recommendations", "similar"):
        for m in (d.get(src) or {}).get("results", []):
            mid = m.get("id")
            if not mid or mid in seen:
                continue
            seen.add(mid)
            sim.append({
                "tmdbId": mid,
                "title": m.get("title") or m.get("name") or "",
                "year": (m.get("release_date") or m.get("first_air_date") or "")[:4],
                "poster": _img(m.get("poster_path"), "w300"),
                "rating": m.get("vote_average"),
            })
            if len(sim) >= 18:
                break
        if len(sim) >= 18:
            break

    col = d.get("belongs_to_collection") or None
    out = {
        "ok": True, "source": "tmdb", "mediaType": mtype, "tmdbId": d.get("id"),
        "imdbId": d.get("imdb_id") or (d.get("external_ids") or {}).get("imdb_id"),
        "title": d.get("title") or d.get("name") or "",
        "overview": d.get("overview") or "",
        "year": (d.get("release_date") or d.get("first_air_date") or "")[:4],
        "runtime": d.get("runtime") or (d.get("episode_run_time") or [None])[0],
        "rating": d.get("vote_average"),
        "votes": d.get("vote_count"),
        "genres": [g.get("name") for g in (d.get("genres") or [])],
        "tagline": d.get("tagline") or "",
        "stills": stills, "posters": posters, "cast": cast,
        "trailers": trs, "similar": sim,
        "collection": ({"id": col.get("id"), "name": col.get("name"),
                        "poster": _img(col.get("poster_path"), "w300")} if col else None),
        "fetchedAt": int(time.time()),
    }
    return out


def do_detail(qs):
    tmdb_id = (qs.get("tmdb") or [""])[0].strip()
    if not tmdb_id.isdigit():
        return {"ok": False, "err": "bad tmdb id"}
    mtype = (qs.get("type") or ["movie"])[0]
    lang = (qs.get("lang") or [CFG["lang"]])[0]
    key = _ckey("detail", tmdb_id, mtype, lang)
    hit = cache_get(key)
    if hit is not None:
        hit = dict(hit)
        hit["cached"] = True
        return hit
    data = build_payload(tmdb_id, mtype, lang)
    if not data:
        return {"ok": False, "err": "tmdb key not configured"}
    if data.get("ok"):
        cache_set(key, data)
    return data


def do_search(qs):
    q = (qs.get("q") or [""])[0].strip()
    if not q:
        return {"ok": False, "err": "empty q"}
    mtype = "tv" if str((qs.get("type") or ["movie"])[0]).lower() in ("tv", "series") else "movie"
    year = (qs.get("year") or [""])[0].strip()
    lang = (qs.get("lang") or [CFG["lang"]])[0]
    key = _ckey("search", q, mtype, year, lang)
    hit = cache_get(key)
    if hit is not None:
        return hit
    url = ("%s/search/%s?api_key=%s&language=%s&query=%s"
           % (TMDB, mtype, urllib.parse.quote(CFG["tmdb_key"]), urllib.parse.quote(lang),
              urllib.parse.quote(q)))
    if year:
        url += "&year=" + urllib.parse.quote(year)
    d, err = _fetch_json(url)
    if not d:
        return {"ok": False, "err": err or "tmdb error"}
    items = []
    for m in (d.get("results") or [])[:10]:
        items.append({
            "tmdbId": m.get("id"),
            "title": m.get("title") or m.get("name") or "",
            "year": (m.get("release_date") or m.get("first_air_date") or "")[:4],
            "poster": _img(m.get("poster_path"), "w300"),
            "rating": m.get("vote_average"),
            "overview": (m.get("overview") or "")[:160],
        })
    out = {"ok": True, "source": "tmdb", "items": items}
    cache_set(key, out, ttl=86400)
    return out


def do_person(qs):
    pid = (qs.get("id") or [""])[0].strip()
    if not pid.isdigit():
        return {"ok": False, "err": "bad person id"}
    lang = (qs.get("lang") or [CFG["lang"]])[0]
    key = _ckey("person", pid, lang)
    hit = cache_get(key)
    if hit is not None:
        return hit
    url = ("%s/person/%s?api_key=%s&language=%s&append_to_response=combined_credits"
           % (TMDB, urllib.parse.quote(pid), urllib.parse.quote(CFG["tmdb_key"]),
              urllib.parse.quote(lang)))
    d, err = _fetch_json(url)
    if not d:
        return {"ok": False, "err": err or "tmdb error"}
    out = {"ok": True, "source": "tmdb", "id": d.get("id"), "name": d.get("name"),
           "biography": d.get("biography") or "",
           "birthday": d.get("birthday"), "placeOfBirth": d.get("place_of_birth"),
           "profile": _img(d.get("profile_path"), "w300")}
    cache_set(key, out)
    return out


# ── HTTP ────────────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    server_version = "VanvyEnrich/" + VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if CFG["debug"]:
            sys.stderr.write("[enrich] " + (fmt % args) + "\n")

    def _send(self, code, body=b"", ctype="application/json; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except Exception:
                pass

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._send(204, b"", extra={
            "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400",
        })

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        path = u.path.rstrip("/") or "/"
        qs = urllib.parse.parse_qs(u.query)
        try:
            if path == "/healthz":
                return self._json({
                    "ok": True, "service": "vanvy-enrich", "version": VERSION,
                    "tmdb": bool(CFG["tmdb_key"]),
                    "proxies": len(CFG["proxies"]),
                    "cache": CFG["cache_dir"], "ttl": CFG["ttl"],
                })
            if path in ("/", "/api"):
                return self._json({"ok": True, "service": "vanvy-enrich", "version": VERSION,
                                   "routes": ["/healthz", "/api/detail", "/api/search", "/api/person"]})
            if path == "/api/detail":
                return self._json(do_detail(qs))
            if path == "/api/search":
                return self._json(do_search(qs))
            if path == "/api/person":
                return self._json(do_person(qs))
            return self._json({"ok": False, "err": "not found"}, 404)
        except Exception as e:
            return self._json({"ok": False, "err": "internal: %s" % e}, 500)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    _load_config()
    print("vanvy-enrich v%s listening on %s:%d" % (VERSION, CFG["host"], CFG["port"]))
    print("  TMDB key : %s" % ("已配置" if CFG["tmdb_key"] else "未配置（仅 /healthz 可用）"))
    print("  代理链   : %s" % (", ".join(CFG["proxies"]) if CFG["proxies"] else "直连"))
    print("  缓存     : %s (ttl=%ds)" % (CFG["cache_dir"], CFG["ttl"]))
    srv = Server((CFG["host"], CFG["port"]), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
