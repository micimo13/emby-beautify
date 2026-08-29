#!/usr/bin/env python3
"""V1.5 mock 服务器 — 支持 Emby REST API 端点（加强版轮播用）
模拟: /Users/{uid}/Items?IncludeItemTypes=Movie|Series|Episode|Season...
用法: python3 mock_server.py [port] [mock_dir]
"""
import json, os, sys, re
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

MOCK_DIR = sys.argv[2] if len(sys.argv) > 2 else "/tmp/v15test"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899

# 与 test/mock/index.html 的 _movies/_seriesList/_series 一致
MOVIES = [
    {"Id": "m1", "Name": "赛博朋克2077·边缘行者", "OriginalTitle": "Cyberpunk: Edgerunners", "ProductionYear": 2022, "CommunityRating": 8.9, "Overview": "在夜之城的霓虹深渊中，边缘行者们游走于法律与科技的边界。", "Genres": ["动画", "科幻", "动作"], "ImageTags": {"Primary": "p", "Backdrop": "b"}, "Type": "Movie"},
    {"Id": "m2", "Name": "银翼杀手2049", "OriginalTitle": "Blade Runner 2049", "ProductionYear": 2017, "CommunityRating": 8.3, "Overview": "复制人与人类的边界逐渐模糊。", "Genres": ["科幻", "惊悚"], "ImageTags": {"Primary": "p", "Backdrop": "b"}, "Type": "Movie"},
    {"Id": "m3", "Name": "星际穿越", "OriginalTitle": "Interstellar", "ProductionYear": 2014, "CommunityRating": 9.4, "Overview": "地球濒临毁灭，探险家穿越虫洞寻找新家园。", "Genres": ["科幻", "冒险"], "ImageTags": {"Primary": "p", "Backdrop": "b"}, "Type": "Movie"},
    {"Id": "m4", "Name": "奥本海默", "OriginalTitle": "Oppenheimer", "ProductionYear": 2023, "CommunityRating": 8.8, "Overview": "原子弹之父的传奇一生。", "Genres": ["剧情", "传记"], "ImageTags": {"Primary": "p", "Backdrop": "b"}, "Type": "Movie"},
]
SERIES = [
    {"Id": "s1", "Name": "三体", "ProductionYear": 2023, "CommunityRating": 8.7, "Overview": "地球文明与三体文明的第一次接触。", "Genres": ["科幻", "悬疑"], "ImageTags": {"Primary": "p", "Backdrop": "b"}, "Type": "Series"},
    {"Id": "s2", "Name": "漫长的季节", "ProductionYear": 2023, "CommunityRating": 9.4, "Overview": "一座小城里的悬案。", "Genres": ["剧情", "悬疑"], "ImageTags": {"Primary": "p", "Backdrop": "b"}, "Type": "Series"},
]
EPS = {
    "s1": [
        {"Id": "s1e1", "SeriesId": "s1", "SeasonId": "sea1", "Season": 1, "ParentIndexNumber": 1, "IndexNumber": 1, "Name": "科学边界", "ImageTags": {"Primary": "p"}},
        {"Id": "s1e2", "SeriesId": "s1", "SeasonId": "sea1", "Season": 1, "ParentIndexNumber": 1, "IndexNumber": 2, "Name": "射手与农场主", "ImageTags": {"Primary": "p"}},
        {"Id": "s1e3", "SeriesId": "s1", "SeasonId": "sea1", "Season": 1, "ParentIndexNumber": 1, "IndexNumber": 3, "Name": "红岸基地", "ImageTags": {"Primary": "p"}},
        {"Id": "s1e4", "SeriesId": "s1", "SeasonId": "sea2", "Season": 2, "ParentIndexNumber": 2, "IndexNumber": 1, "Name": "黑暗森林", "ImageTags": {"Primary": "p"}},
        {"Id": "s1e5", "SeriesId": "s1", "SeasonId": "sea2", "Season": 2, "ParentIndexNumber": 2, "IndexNumber": 2, "Name": "面壁计划", "ImageTags": {"Primary": "p"}},
    ],
    "s2": [
        {"Id": "s2e1", "SeriesId": "s2", "SeasonId": "sea2a", "Season": 1, "ParentIndexNumber": 1, "IndexNumber": 1, "Name": "桦林", "ImageTags": {"Primary": "p"}},
        {"Id": "s2e2", "SeriesId": "s2", "SeasonId": "sea2a", "Season": 1, "ParentIndexNumber": 1, "IndexNumber": 2, "Name": "响", "ImageTags": {"Primary": "p"}},
    ],
}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=MOCK_DIR, **kw)

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _img(self, name):
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="#2a2a3a"/><text x="50%" y="50%" fill="rgba(255,255,255,.5)" font-size="40" text-anchor="middle">{name}</text></svg>'
        body = svg.encode()
        self.send_response(200)
        self.send_header("Content-Type", "image/svg+xml")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        path = u.path
        q = parse_qs(u.query)

        # 图片请求 /emby/Items/{id}/Images/{type}
        m = re.match(r"^/emby/Items/([^/]+)/Images/(\w+)", path)
        if m:
            return self._img(m.group(1))

        # 用户 Items 列表
        m = re.match(r"^/Users/([^/]+)/Items$", path)
        if m:
            uid = m.group(1)
            it = (q.get("IncludeItemTypes") or [""])[0]
            items = MOVIES + SERIES
            if it == "Movie":
                items = MOVIES
            elif it == "Series":
                items = SERIES
            elif it == "Episode":
                parent = (q.get("ParentId") or q.get("SeriesId") or [""])[0]
                items = EPS.get(parent, [])
                sid = (q.get("SeasonId") or [""])[0]
                if sid:
                    items = [e for e in items if e["SeasonId"] == sid]
            elif it == "Season":
                parent = (q.get("ParentId") or q.get("SeriesId") or [""])[0]
                seas = []
                for e in EPS.get(parent, []):
                    if e["SeasonId"] not in [s["Id"] for s in seas]:
                        seas.append({"Id": e["SeasonId"], "Name": "季 " + str(e["Season"]), "IndexNumber": e["Season"], "SeriesId": parent, "Type": "Season"})
                items = seas
            # ImageTypes 过滤（加强版要求 Backdrop）
            if "ImageTypes" in q and items:
                imgtypes = q["ImageTypes"][0].split(",")
                items = [i for i in items if any(t in (i.get("ImageTags") or {}) for t in imgtypes)] or items
            return self._json({"Items": items, "TotalRecordCount": len(items)})

        # 单 item
        m = re.match(r"^/Users/[^/]+/Items/([^/]+)$", path)
        if m:
            iid = m.group(1)
            for i in MOVIES + SERIES:
                if i["Id"] == iid:
                    return self._json(i)
            for sid, eps in EPS.items():
                for e in eps:
                    if e["Id"] == iid:
                        return self._json(e)
            return self._json({"Id": iid, "Name": "Unknown"}, 404)

        # 其余走静态文件
        return super().do_GET()

    def log_message(self, fmt, *args):
        if "Items" in (args[0] if args else "") or "Images" in (args[0] if args else ""):
            sys.stderr.write(f"[mock-api] {fmt % args}\n")

if __name__ == "__main__":
    os.makedirs(MOCK_DIR, exist_ok=True)
    srv = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"mock server: http://127.0.0.1:{PORT} (dir={MOCK_DIR})")
    srv.serve_forever()
