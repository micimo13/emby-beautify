#!/usr/bin/env python3
"""
img_proxy.py — 通用图片代理 / 轻量 CDN（纯标准库，零依赖）
=============================================================================
用途：
  把「浏览器访问不到」的图床（被墙 / 需认证 / 防盗链）转发出来，
  供 Emby 美化详情页使用。也可当普通图片缓存代理用。

特性：
  · 零依赖（纯 stdlib，自实现 HTTP CONNECT 与 SOCKS5 含认证）
  · 配置化：环境变量 或 config.json（也支持两者混用，env 优先）
  · 上游代理：http / https / socks5 / socks5h，支持 用户名密码认证
  · 多代理回退链：主挂自动切备，全挂可回落直连（可关）
  · 按域名走代理（auto 模式）：只让墙外图走代理，省流量
  · 白名单（可留空=全放行，启动时会警告）
  · 磁盘缓存 + 魔数嗅探（避免 octet-stream 导致 <img> 拒渲染）
  · 自检：python3 img_proxy.py --test 逐个诊断链路

用法：
  python3 img_proxy.py                      # 启动服务
  python3 img_proxy.py --test               # 自检（代理连通性 / 白名单 / 缓存）
  python3 img_proxy.py --gen-config         # 生成 config.json 模板
  python3 img_proxy.py -c /path/config.json # 指定配置

访问：
  http://<host>:18098/i?u=<urlencoded 原图地址>
  http://<host>:18098/healthz                # 健康检查
=============================================================================
"""
import base64
import hashlib
import http.server
import json
import logging
import os
import socket
import socketserver
import ssl
import struct
import sys
import threading
import time
import urllib.parse
import urllib.request

# ═══════════════════════════════════════════════════════════════════════════
#  默认配置（全部可被 config.json / 环境变量覆盖）
# ═══════════════════════════════════════════════════════════════════════════
DEFAULTS = {
    "port": 18098,
    "host": "0.0.0.0",
    "cache_dir": "",              # 留空 = 系统临时目录下 vanvy-imgcache
    "cache_ttl": 604800,          # 7 天（秒）
    "max_bytes": 12 * 1024 * 1024,
    "timeout": 20,

    # ── 上游代理（可留空=直连；数组=按序回退）────────────────────────
    # 格式: scheme://[user:pass@]host:port
    #   scheme: http | https | socks5 | socks5h(socks5 且 DNS 走代理侧)
    "proxies": [],

    # none = 从不走代理 | auto = 仅 proxy_hosts 命中时走 | all = 全走
    "proxy_mode": "auto",
    "proxy_hosts": [
        "ytimg.com", "youtube.com", "googlevideo.com",
        "dmm.co.jp", "dmm.com",
        "api.themoviedb.org", "image.tmdb.org"      # TMDB 增强走的域名
    ],
    # 代理全部失败时是否回退直连
    "proxy_fallback_direct": True,
    # 代理列表整体失败几次后，本次请求直接直连（熔断）
    "proxy_breaker_seconds": 60,

    # ── 图床白名单（空数组 = 允许任意域名，启动时会警告）──────────────
    "allow_hosts": [
        "tp.spfcas.com", "spfcas.com",
        "javdb.com", "cdn.javdb.com", "c0.jdbstatic.com", "jdbstatic.com",
        "i.ytimg.com", "img.youtube.com", "ytimg.com",
        "pics.dmm.co.jp", "awsimgsrc.dmm.co.jp",
        "raw.githubusercontent.com",
        "image.tmdb.org", "www.themoviedb.org"
    ],

    # ── 通用透传 /p?u= 允许的域名（直链媒体/预告片；空=只认图床白名单）──
    "passthrough_hosts": [
        "dmm.co.jp", "dmm.com", "awsimgsrc.dmm.co.jp", "pics.dmm.co.jp",
        "youtube.com", "googlevideo.com", "ytimg.com",
        "javdb.com", "cdn.javdb.com", "jdbstatic.com",
        "spfcas.com", "tp.spfcas.com"
    ],

    # ── 可选：TMDB API Key（配了才开放 /tmdb/ 通道）──────────────────
    "tmdb_key": "",

    # ── 可选：上游解码引擎（能解 JavDB 的混淆图；公共用户可留空）──────
    # 形如 http://host:port/api/v1/img-proxy/?url=  ；留空则跳过
    "decoder_base": "",

    # ── HTTP 细节 ────────────────────────────────────────────────────
    "user_agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "referer": "",
    "allow_private_network": False,   # 是否允许代理内网地址（默认禁，防 SSRF）
}

CFG = dict(DEFAULTS)
# 需要走代理的域名（auto 模式）
_PROXY_HOSTS = []
_PROXY_BREAK_UNTIL = 0.0
_config_path = ""
_NO_RETRY = False          # 自检时关闭重试，避免等待过久

# 环境变量映射（env 名 -> 配置键）
ENV_MAP = {
    "VANVY_IMG_PORT": ("port", int),
    "VANVY_IMG_HOST": ("host", str),
    "VANVY_IMG_CACHE_DIR": ("cache_dir", str),
    "VANVY_IMG_CACHE_TTL": ("cache_ttl", int),
    "VANVY_IMG_MAX_BYTES": ("max_bytes", int),
    "VANVY_IMG_TIMEOUT": ("timeout", int),
    "VANVY_IMG_PROXY": ("proxies", "list"),            # 逗号分隔
    "VANVY_PROXY_URL": ("proxies", "list"),            # 兼容别名
    "VANVY_PROXY_MODE": ("proxy_mode", str),
    "VANVY_PROXY_HOSTS": ("proxy_hosts", "list"),
    "VANVY_PROXY_FALLBACK": ("proxy_fallback_direct", "bool"),
    "VANVY_IMG_ALLOW_HOSTS": ("allow_hosts", "list"),
    "VANVY_IMG_DECODER": ("decoder_base", str),
    "VANVY_IMG_UA": ("user_agent", str),
    "VANVY_IMG_REFERER": ("referer", str),
    "VANVY_IMG_ALLOW_PRIVATE": ("allow_private_network", "bool"),
    "VANVY_PASSTHROUGH_HOSTS": ("passthrough_hosts", "list"),
    "VANVY_TMDB_KEY": ("tmdb_key", "str"),
}


# ═══════════════════════════════════════════════════════════════════════════
#  配置加载
# ═══════════════════════════════════════════════════════════════════════════
def _cast(kind, val):
    if kind is int:
        return int(val)
    if kind is str:
        return str(val)
    if kind == "bool":
        return str(val).strip().lower() in ("1", "true", "yes", "y", "on")
    if kind == "list":
        if isinstance(val, (list, tuple)):
            return [str(x).strip() for x in val if str(x).strip()]
        return [x.strip() for x in str(val).split(",") if x.strip()]
    return val


def load_config(path=None):
    """加载顺序：DEFAULTS ← config.json ← 环境变量（后者优先）"""
    global CFG, _config_path
    # ① config.json
    cands = []
    if path:
        cands.append(path)
    env_p = os.environ.get("VANVY_IMG_CONFIG")
    if env_p:
        cands.append(env_p)
    here = os.path.dirname(os.path.abspath(__file__))
    cands += [os.path.join(here, "config.json"), "/etc/vanvy-imgproxy/config.json"]
    for c in cands:
        if c and os.path.isfile(c):
            try:
                with open(c, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for k, v in (data or {}).items():
                    if k in DEFAULTS:
                        CFG[k] = _cast(type(DEFAULTS[k]), v) if not isinstance(DEFAULTS[k], list) \
                                 else _cast("list", v)
                _config_path = c
                logging.info("已加载配置: %s", c)
                break
            except Exception as e:
                logging.warning("配置文件读取失败 %s: %s", c, e)

    # ② 环境变量（覆盖）
    for env_k, (key, kind) in ENV_MAP.items():
        v = os.environ.get(env_k)
        if v is None or v == "":
            continue
        try:
            CFG[key] = _cast(kind, v)
        except Exception as e:
            logging.warning("环境变量 %s 解析失败: %s", env_k, e)

    # ③ 派生
    global _PROXY_HOSTS
    _PROXY_HOSTS = [h.lower().lstrip(".") for h in CFG["proxy_hosts"]]
    if not CFG["cache_dir"]:
        import tempfile
        CFG["cache_dir"] = os.path.join(tempfile.gettempdir(), "vanvy-imgcache")
    os.makedirs(CFG["cache_dir"], exist_ok=True)
    return CFG


def gen_config_template():
    tpl = dict(DEFAULTS)
    tpl["cache_dir"] = "/var/cache/vanvy-imgproxy"
    tpl["proxies"] = ["socks5h://user:password@127.0.0.1:1080"]
    tpl["_说明"] = [
        "proxies: 可填多个，按序回退；scheme 支持 http/https/socks5/socks5h；带认证写成 user:pass@",
        "proxy_mode: none=不走代理 | auto=仅 proxy_hosts 命中时走 | all=全部走",
        "allow_hosts: 留空数组 = 允许任意图床（有 SSRF 风险，仅内网可信环境使用）",
        "decoder_base: 可选，指向能解 JavDB 混淆图的上游引擎；留空则跳过",
    ]
    return json.dumps(tpl, ensure_ascii=False, indent=2)


# ═══════════════════════════════════════════════════════════════════════════
#  代理隧道（纯 stdlib）
# ═══════════════════════════════════════════════════════════════════════════
class ProxySpec:
    __slots__ = ("scheme", "host", "port", "user", "pwd", "raw")

    def __init__(self, scheme, host, port, user, pwd, raw):
        self.scheme, self.host, self.port = scheme, host, port
        self.user, self.pwd, self.raw = user, pwd, raw

    def __repr__(self):
        auth = ("%s:***@" % self.user) if self.user else ""
        return "%s://%s%s:%d" % (self.scheme, auth, self.host, self.port)


def parse_proxy(u):
    """socks5h://user:pass@host:port → ProxySpec（解析失败返回 None）"""
    if not u:
        return None
    raw = u.strip()
    if "://" not in raw:
        raw = "socks5h://" + raw          # 简写默认按 socks5h
    try:
        p = urllib.parse.urlparse(raw)
        scheme = (p.scheme or "").lower()
        if scheme not in ("http", "https", "socks5", "socks5h", "socks4"):
            logging.warning("不支持的代理协议: %s", scheme)
            return None
        if not p.hostname or not p.port:
            logging.warning("代理地址缺少 host/port: %s", raw)
            return None
        return ProxySpec(scheme, p.hostname, int(p.port),
                         urllib.parse.unquote(p.username or ""),
                         urllib.parse.unquote(p.password or ""), raw)
    except Exception as e:
        logging.warning("代理解析失败 %s: %s", u, e)
        return None


def _http_connect_tunnel(ps, host, port, timeout):
    """HTTP/HTTPS 代理 → CONNECT 隧道（带回显诊断）"""
    s = socket.create_connection((ps.host, ps.port), timeout)
    if ps.scheme == "https":
        s = ssl.create_default_context().wrap_socket(s, server_hostname=ps.host)
    req = ("CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\n" % (host, port, host, port))
    if ps.user:
        tok = base64.b64encode(("%s:%s" % (ps.user, ps.pwd)).encode()).decode()
        req += "Proxy-Authorization: Basic %s\r\n" % tok
    req += "Proxy-Connection: keep-alive\r\n\r\n"
    s.sendall(req.encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        c = s.recv(4096)
        if not c:
            break
        buf += c
        if len(buf) > 65536:
            break
    line = buf.split(b"\r\n")[0].decode("latin-1", "ignore")
    if "200" not in line:
        s.close()
        raise OSError("CONNECT 被拒: " + line[:80])
    return s


def _socks5_tunnel(ps, host, port, timeout):
    """SOCKS5 隧道（RFC1928 + RFC1929 认证；socks5h 走远程 DNS）"""
    s = socket.create_connection((ps.host, ps.port), timeout)
    # ① 协商方法
    methods = [0x00] if not ps.user else [0x00, 0x02]
    s.sendall(bytes([5, len(methods)] + methods))
    r = s.recv(2)
    if len(r) < 2 or r[0] != 5:
        s.close(); raise OSError("SOCKS5 握手失败")
    chosen = r[1]
    if chosen == 0x02:
        ub, pb = ps.user.encode(), (ps.pwd or "").encode()
        s.sendall(bytes([1, len(ub)]) + ub + bytes([len(pb)]) + pb)
        rr = s.recv(2)
        if len(rr) < 2 or rr[1] != 0:
            s.close(); raise OSError("SOCKS5 认证失败（用户名/密码错误）")
    elif chosen == 0xFF:
        s.close(); raise OSError("SOCKS5 无可用认证方式（代理要求认证）")
    elif chosen == 0x00 and ps.user:
        logging.warning("代理未要求认证，但已提供凭据（继续）")
    # ② CONNECT
    rdns = (ps.scheme == "socks5h")
    if rdns:
        hb = host.encode()
        req = bytes([5, 1, 0, 3, len(hb)]) + hb + struct.pack(">H", port)
    else:
        try:
            ip = socket.gethostbyname(host)
        except Exception as e:
            s.close(); raise OSError("本地 DNS 解析失败(%s): %s" % (host, e))
        req = bytes([5, 1, 0, 1]) + socket.inet_aton(ip) + struct.pack(">H", port)
    s.sendall(req)
    r = s.recv(10)
    if len(r) < 2 or r[1] != 0:
        code = r[1] if len(r) > 1 else -1
        MSG = {1: "代理一般性失败", 2: "规则不允许", 3: "网络不可达",
               4: "主机不可达", 5: "连接被拒", 6: "TTL 超时", 7: "命令不支持",
               8: "地址类型不支持"}
        s.close(); raise OSError("SOCKS5 连接失败: %s(%d)" % (MSG.get(code, "未知"), code))
    return s


def open_tunnel(ps, host, port, timeout):
    """按协议打开到目标的隧道"""
    if ps.scheme in ("http", "https"):
        return _http_connect_tunnel(ps, host, port, timeout)
    return _socks5_tunnel(ps, host, port, timeout)


def fetch_via_tunnel(ps, url, timeout):
    """经代理隧道拉取 URL → (data, ctype)"""
    p = urllib.parse.urlparse(url)
    host = p.hostname
    port = p.port or (443 if p.scheme == "https" else 80)
    t = open_tunnel(ps, host, port, timeout)
    try:
        if p.scheme == "https":
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            t = ctx.wrap_socket(t, server_hostname=host)
        path = p.path or "/"
        if p.query:
            path += "?" + p.query
        hdrs = ["GET %s HTTP/1.1" % path, "Host: %s" % host,
                "User-Agent: %s" % CFG["user_agent"],
                "Accept: image/avif,image/webp,image/*,*/*;q=0.8",
                "Accept-Encoding: identity",     # 不做压缩，省去解压；下面自解 chunked
                "Connection: close"]
        if CFG.get("referer"):
            hdrs.append("Referer: %s" % CFG["referer"])
        t.sendall(("\r\n".join(hdrs) + "\r\n\r\n").encode())
        buf = b""
        limit = CFG["max_bytes"] + 8192
        while True:
            c = t.recv(65536)
            if not c:
                break
            buf += c
            if len(buf) > limit:
                break
    finally:
        try:
            t.close()
        except Exception:
            pass
    head, _, body = buf.partition(b"\r\n\r\n")
    if not head:
        raise OSError("连接被重置/无响应（可能网络抖动）")
    line = head.split(b"\r\n")[0].decode("latin-1", "ignore")
    if "200" not in line:
        raise OSError("上游返回: " + line[:80])
    ctype = "image/jpeg"
    chunked = False
    for ln in head.decode("latin-1", "ignore").split("\r\n")[1:]:
        if ln.lower().startswith("content-type:"):
            ctype = ln.split(":", 1)[1].strip()
        if ln.lower().startswith("transfer-encoding:") and "chunked" in ln.lower():
            chunked = True
    # ⚠️ HTTP/1.1 常见 chunked 分块：不解析会把「分块长度」混进正文
    #    （实测 TMDB JSON 头部出现 "6e1" 之类 → 浏览器 JSON.parse 直接失败）
    if chunked:
        body = _dechunk(body)
    if len(body) > CFG["max_bytes"]:
        raise ValueError("too large")
    return body, ctype


def _dechunk(buf):
    """解析 Transfer-Encoding: chunked 正文"""
    out, i = b"", 0
    while True:
        j = buf.find(b"\r\n", i)
        if j < 0:
            break
        try:
            size = int(buf[i:j].split(b";")[0].strip(), 16)
        except Exception:
            break
        if size == 0:
            break
        out += buf[j + 2: j + 2 + size]
        i = j + 2 + size + 2
    return out


def fetch_direct(url, timeout):
    """直连拉取（无视系统代理）"""
    req = urllib.request.Request(url, headers={
        "User-Agent": CFG["user_agent"],
        "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
        **({"Referer": CFG["referer"]} if CFG.get("referer") else {}),
    })
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with op.open(req, timeout=timeout) as r:
        ctype = r.headers.get("Content-Type", "image/jpeg")
        data = r.read(CFG["max_bytes"] + 1)
    if len(data) > CFG["max_bytes"]:
        raise ValueError("too large")
    return data, ctype


# ═══════════════════════════════════════════════════════════════════════════
#  抓取策略
# ═══════════════════════════════════════════════════════════════════════════
def _sniff(data, hinted):
    """按魔数识别真实图片类型（避免 octet-stream/nosniff 导致 <img> 拒渲染）"""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:2] == b"BM":
        return "image/bmp"
    if data[:4] in (b"\x00\x00\x01\x00", b"\x00\x00\x02\x00"):
        return "image/x-icon"
    if data[4:12] in (b"ftypavif", b"ftypavis"):
        return "image/avif"
    if hinted and hinted.startswith("image/"):
        return hinted
    return hinted or "image/jpeg"


def _use_proxy_for(host):
    """该域名本次是否走代理"""
    mode = CFG["proxy_mode"]
    if mode == "none" or not CFG["proxies"]:
        return False
    if mode == "all":
        return True
    h = (host or "").lower()
    return any(h == p or h.endswith("." + p) for p in _PROXY_HOSTS)


def _retry(fn, tries=2, delay=0.6, what=""):
    """网络抖动重试（最后一次异常原样抛出）"""
    if _NO_RETRY:
        return fn()
    last = None
    for i in range(max(1, tries)):
        try:
            return fn()
        except Exception as e:
            last = e
            if i < tries - 1:
                logging.info("%s 第%d次失败，重试: %s", what, i + 1, str(e)[:60])
                time.sleep(delay)
    raise last


def fetch(url, want_json=False):
    global _PROXY_BREAK_UNTIL
    timeout = CFG["timeout"]
    host = urllib.parse.urlparse(url).hostname
    errs = []

    # ① 可选：上游解码引擎（能解 JavDB 混淆图）
    dec = (CFG.get("decoder_base") or "").strip()
    if dec:
        try:
            d, ct = _retry(lambda: fetch_direct(dec + urllib.parse.quote(url, safe=""), timeout),
                           tries=2, what="解码引擎")
            return d, _sniff(d, ct)
        except Exception as e:
            errs.append("decoder: %s" % e)

    # ② 代理链（如需）
    if _use_proxy_for(host) and time.time() >= _PROXY_BREAK_UNTIL:
        ok_any = False
        for raw in CFG["proxies"]:
            ps = parse_proxy(raw)
            if not ps:
                continue
            try:
                d, ct = _retry(lambda: fetch_via_tunnel(ps, url, timeout),
                               tries=2, what="代理")
                logging.info("代理命中 %s ← %s", ps, url[:70])
                return d, _sniff(d, ct)
            except Exception as e:
                errs.append("%s: %s" % (ps, e))
                logging.warning("代理失败 %s → %s", ps, str(e)[:80])
        # 全部代理失败 → 熔断一段时间
        _PROXY_BREAK_UNTIL = time.time() + CFG["proxy_breaker_seconds"]
        logging.warning("代理链全失败，熔断 %ds", CFG["proxy_breaker_seconds"])
        if not CFG["proxy_fallback_direct"]:
            raise OSError("代理全部失败且不允许回退直连 | " + " | ".join(errs[:3]))

    # ③ 直连
    try:
        d, ct = _retry(lambda: fetch_direct(url, timeout), tries=2, what="直连")
        return d, _sniff(d, ct)
    except Exception as e:
        errs.append("direct: %s" % e)
        raise OSError(" | ".join(errs[-3:]) if errs else str(e))


# ═══════════════════════════════════════════════════════════════════════════
#  HTTP 服务
# ═══════════════════════════════════════════════════════════════════════════
def host_allowed(host):
    hosts = CFG["allow_hosts"]
    if not hosts:
        return True
    h = (host or "").lower()
    return any(h == a or h.endswith("." + a) for a in hosts)


def is_private(host):
    """粗判内网/回环地址（防 SSRF）"""
    if not host:
        return True
    if host in ("localhost",) or host.endswith(".local"):
        return True
    try:
        ips = socket.getaddrinfo(host, None)
    except Exception:
        return False
    for fam, _, _, _, sa in ips:
        ip = sa[0]
        if ip.startswith("127.") or ip.startswith("10.") or ip.startswith("192.168.") \
           or ip.startswith("169.254.") or ip == "::1":
            return True
        if ip.startswith("172."):
            try:
                if 16 <= int(ip.split(".")[1]) <= 31:
                    return True
            except Exception:
                pass
    return False


def cache_path(url):
    return os.path.join(CFG["cache_dir"], hashlib.sha1(url.encode("utf-8")).hexdigest())


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "vanvy-imgproxy/2.0"

    def log_message(self, fmt, *args):
        logging.info("%s - %s", self.address_string(), fmt % args)

    def _send(self, code, body=b"", ctype="text/plain; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, extra={"Access-Control-Allow-Headers": "*"})

    # ── /p?u= 通用透传（复用代理链/白名单/缓存）──────────────────────
    def _handle_passthrough(self, parsed):
        qs = urllib.parse.parse_qs(parsed.query)
        target = (qs.get("u") or qs.get("url") or [""])[0].strip()
        if not target:
            return self._send(400, b"missing u")
        if not target.startswith(("http://", "https://")):
            target = "https://" + target
        host = urllib.parse.urlparse(target).hostname or ""
        # 直链媒体域名通常不在图床白名单内 → 这里用扩展白名单
        extra = [h.lower().lstrip(".") for h in CFG.get("passthrough_hosts", [])]
        if not host_allowed(host) and not any(host == h or host.endswith("." + h) for h in extra):
            return self._send(403, ("host not allowed: %s" % host).encode())
        if not CFG["allow_private_network"] and is_private(host):
            return self._send(403, b"private address blocked")
        cp = cache_path(target)
        if os.path.exists(cp) and (time.time() - os.path.getmtime(cp)) < CFG["cache_ttl"]:
            try:
                with open(cp, "rb") as f:
                    data = f.read()
                ctype = "application/octet-stream"
                if os.path.exists(cp + ".ct"):
                    with open(cp + ".ct") as f:
                        ctype = f.read().strip() or ctype
                return self._send(200, data, ctype, {"Cache-Control": "public, max-age=86400"})
            except Exception:
                pass
        try:
            data, ctype = fetch(target)
        except Exception as e:
            logging.warning("passthrough fail %s: %s", target[:70], e)
            return self._send(502, ("upstream error: %s" % e).encode())
        try:
            with open(cp, "wb") as f:
                f.write(data)
            with open(cp + ".ct", "w") as f:
                f.write(ctype or "")
        except Exception:
            pass
        self._send(200, data, ctype or "application/octet-stream",
                   {"Cache-Control": "public, max-age=86400"})

    # ── /tmdb/<path>：TMDB API 代理（服务端持 Key，走同一代理链）───────
    def _handle_tmdb(self, parsed):
        key = CFG.get("tmdb_key") or ""
        if not key:
            return self._send(501, json.dumps(
                {"ok": False, "err": "tmdb_key 未配置（config.json: tmdb_key）"}, ensure_ascii=False).encode(),
                "application/json; charset=utf-8")
        path = parsed.path[len("/tmdb"):]           # 例：/movie/872585
        qs = urllib.parse.parse_qs(parsed.query)
        params = {k: v[0] for k, v in qs.items() if k != "api_key"}
        params["api_key"] = key
        url = "https://api.themoviedb.org/3" + path + "?" + urllib.parse.urlencode(params)
        cp = cache_path("tmdb:" + url)
        if os.path.exists(cp) and (time.time() - os.path.getmtime(cp)) < CFG["cache_ttl"]:
            try:
                with open(cp, "rb") as f:
                    return self._send(200, f.read(), "application/json; charset=utf-8",
                                      {"Cache-Control": "public, max-age=86400"})
            except Exception:
                pass
        try:
            data, _ = fetch(url, want_json=True)
        except Exception as e:
            logging.warning("tmdb fail %s: %s", path[:60], e)
            return self._send(502, json.dumps({"ok": False, "err": str(e)}, ensure_ascii=False).encode(),
                              "application/json; charset=utf-8")
        try:
            with open(cp, "wb") as f:
                f.write(data)
        except Exception:
            pass
        self._send(200, data, "application/json; charset=utf-8", {"Cache-Control": "public, max-age=86400"})

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        # ── 通用透传 /p?u=<url>：把「直链媒体」类流量也走本机代理链 ──────
        #   用途（主人 2026-09-13）：浏览器不一定挂代理，预告片(mp4/m3u8)常看不了；
        #   由本服务代取，复用同一套上游代理 + 缓存 + 白名单。
        if parsed.path in ("/p", "/proxy", "/passthrough"):
            return self._handle_passthrough(parsed)
        # ── TMDB 直连通道 /tmdb/<path>：服务端持 Key + 走代理 ───────────
        #   用途：外网环境下 TMDB 增强不可用 → 由本服务代理请求 TMDB API。
        if parsed.path.startswith("/tmdb/"):
            return self._handle_tmdb(parsed)
        # 健康检查
        if parsed.path in ("/healthz", "/health"):
            info = {
                "ok": True, "port": CFG["port"],
                "proxy_mode": CFG["proxy_mode"],
                "proxies": [repr(parse_proxy(p)) for p in CFG["proxies"] if parse_proxy(p)],
                "allow_hosts": len(CFG["allow_hosts"]),
                "decoder": bool(CFG.get("decoder_base")),
                "cache_dir": CFG["cache_dir"],
            }
            self._send(200, json.dumps(info, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            return
        if parsed.path not in ("/i", "/img", "/"):
            self._send(404, b"not found")
            return

        qs = urllib.parse.parse_qs(parsed.query)
        target = (qs.get("u") or qs.get("url") or [""])[0].strip()
        if not target:
            self._send(400, b"missing u")
            return
        if not target.startswith(("http://", "https://")):
            target = "https://" + target
        host = urllib.parse.urlparse(target).hostname

        if not host_allowed(host):
            self._send(403, ("host not allowed: %s" % host).encode())
            return
        if not CFG["allow_private_network"] and is_private(host):
            self._send(403, b"private address blocked")
            return

        cp = cache_path(target)
        if os.path.exists(cp) and (time.time() - os.path.getmtime(cp)) < CFG["cache_ttl"]:
            try:
                with open(cp, "rb") as f:
                    data = f.read()
                ctype = "image/jpeg"
                if os.path.exists(cp + ".ct"):
                    with open(cp + ".ct") as f:
                        ctype = f.read().strip() or ctype
                if not ctype.startswith("image/"):
                    ctype = _sniff(data, ctype)
                self._send(200, data, ctype, {"Cache-Control": "public, max-age=604800"})
                return
            except Exception:
                pass

        try:
            data, ctype = fetch(target)
        except Exception as e:
            logging.warning("fetch fail %s: %s", target[:70], e)
            self._send(502, ("upstream error: %s" % e).encode())
            return

        try:
            with open(cp, "wb") as f:
                f.write(data)
            with open(cp + ".ct", "w") as f:
                f.write(ctype)
        except Exception:
            pass
        self._send(200, data, ctype, {"Cache-Control": "public, max-age=604800"})


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# ═══════════════════════════════════════════════════════════════════════════
#  自检
# ═══════════════════════════════════════════════════════════════════════════
TEST_TARGETS = [
    ("YouTube 缩略图", "https://i.ytimg.com/vi/_TRSvK-Omwc/hqdefault.jpg", True),
    ("TMDB 图片",      "https://image.tmdb.org/t/p/w200/qeQJx07rK2xm8SD2sJxFKhE7gs0.jpg", False),
]


def self_test():
    global _NO_RETRY
    _NO_RETRY = True
    CFG["timeout"] = min(int(CFG["timeout"]), 7)    # 自检不必久等（DNS 卡顿也在该量级）
    print("=" * 66)
    print(" 图片代理自检")
    print("=" * 66)
    print(" 配置来源 :", _config_path or "（内置默认 + 环境变量）")
    print(" 监听     : %s:%d" % (CFG["host"], CFG["port"]))
    print(" 缓存目录 : %s" % CFG["cache_dir"])
    print(" 代理模式 : %s" % CFG["proxy_mode"])
    if CFG["proxies"]:
        for i, raw in enumerate(CFG["proxies"], 1):
            ps = parse_proxy(raw)
            print("   %d. %s" % (i, repr(ps) if ps else "❌ 解析失败: " + raw))
    else:
        print("   代理     : （未配置 → 全部直连）")
    print(" 白名单   : %s" % ("（空 = 允许所有域名 ⚠️ 有风险）" if not CFG["allow_hosts"]
                              else "%d 个域名" % len(CFG["allow_hosts"])))
    print(" 解码引擎 : %s" % (CFG["decoder_base"] or "（未配置，跳过）"))
    print("─" * 66)

    # 白名单检查
    bad = [h for h in ("tp.spfcas.com", "i.ytimg.com") if not host_allowed(h)]
    print(" 白名单  :", "✅ 关键图床已放行" if not bad else "⚠️ 以下被拦: %s" % bad)

    # 逐个目标实测（含代理）
    for name, url, needs in TEST_TARGETS:
        host = urllib.parse.urlparse(url).hostname
        via = "代理" if _use_proxy_for(host) else "直连"
        t0 = time.time()
        try:
            d, ct = fetch(url)
            dt = (time.time() - t0) * 1000
            kind = "❌" if not d else "✅"
            print(" %-14s %s %s  %s/%dB  %.0fms" % (name, kind, via, ct, len(d), dt))
        except Exception as e:
            dt = (time.time() - t0) * 1000
            hint = "（直连不可达 → 建议配代理）" if needs else ""
            print(" %-14s ❌ %s  %s  %.0fms %s" % (name, via, str(e)[:52], dt, hint))

    # 逐个代理单测
    if CFG["proxies"]:
        print("─" * 66)
        print(" 逐代理连通性:")
        for raw in CFG["proxies"]:
            ps = parse_proxy(raw)
            if not ps:
                continue
            t0 = time.time()
            try:
                d, ct = fetch_via_tunnel(ps, TEST_TARGETS[0][1], CFG["timeout"])
                print("   ✅ %-42s %dB  %.0fms" % (repr(ps), len(d), (time.time() - t0) * 1000))
            except Exception as e:
                print("   ❌ %-42s %s" % (repr(ps), str(e)[:60]))
    print("=" * 66)


# ═══════════════════════════════════════════════════════════════════════════
def main():
    global CFG
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    args = sys.argv[1:]
    cfg_path = None
    if "-c" in args:
        cfg_path = args[args.index("-c") + 1]
    CFG = load_config(cfg_path)

    if "--gen-config" in args:
        print(gen_config_template())
        return
    if "--test" in args:
        self_test()
        return
    if "--help" in args or "-h" in args:
        print(__doc__)
        return

    if not CFG["allow_hosts"]:
        logging.warning("allow_hosts 为空 → 允许任意图床（仅建议内网使用）")
    if CFG["proxy_mode"] != "none" and not CFG["proxies"]:
        logging.info("未配置代理，全部直连")
    for raw in CFG["proxies"]:
        parse_proxy(raw)

    logging.info("img-proxy 启动 :%d  mode=%s proxies=%d cache=%s",
                 CFG["port"], CFG["proxy_mode"], len(CFG["proxies"]), CFG["cache_dir"])
    ThreadingServer((CFG["host"], CFG["port"]), Handler).serve_forever()


if __name__ == "__main__":
    main()
