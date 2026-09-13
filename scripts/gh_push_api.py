#!/usr/bin/env python3
"""
把本地目录整树推送为 GitHub 仓库的一个新 commit（用 Git Data API）。

比 git clone/push 更抗网络抖动：一次提交、无历史下载、原子替换整棵树
（远端多余文件会随新 tree 一起消失 = 镜像效果）。

用法:
  python3 gh_push_api.py <dir> <owner/repo> <branch> <pat> [commit-message]
"""
import base64, json, os, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

DIR, SLUG, BRANCH, PAT = sys.argv[1:5]
MSG = sys.argv[5] if len(sys.argv) > 5 else "sync"
API = "https://api.github.com"


def req(method, path, body=None, raw=False):
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {PAT}")
    r.add_header("Accept", "application/vnd.github+json")
    r.add_header("User-Agent", "ves-sync")
    if data:
        r.add_header("Content-Type", "application/json")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(r, timeout=180) as resp:
                b = resp.read()
                return json.loads(b) if b and not raw else b
        except urllib.error.HTTPError as e:
            detail = e.read()[:200]
            if e.code in (502, 503, 504) and attempt < 3:
                continue
            raise RuntimeError(f"HTTP {e.code} {method} {path}: {detail}")
        except Exception as e:
            if attempt < 3:
                continue
            raise


def files():
    out = []
    for root, dirs, fs in os.walk(DIR):
        dirs[:] = [d for d in dirs if d != ".git"]
        for f in fs:
            p = os.path.join(root, f)
            rel = os.path.relpath(p, DIR)
            if rel.startswith(".git/") or rel == ".git":
                continue
            out.append((rel, p))
    return out


def main():
    fs = files()
    print(f"  {len(fs)} 个文件 → 生成 blob ...")

    def mk_blob(item):
        rel, p = item
        with open(p, "rb") as fh:
            content = fh.read()
        b = req("POST", f"/repos/{SLUG}/git/blobs",
                {"content": base64.b64encode(content).decode(), "encoding": "base64"})
        return rel, b["sha"]

    entries = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for rel, sha in ex.map(mk_blob, fs):
            entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": sha})
    print(f"  ✅ blob 完成：{len(entries)}")

    # 当前 HEAD
    try:
        ref = req("GET", f"/repos/{SLUG}/git/ref/heads/{BRANCH}")
        head = ref["object"]["sha"]
    except RuntimeError as e:
        if "HTTP 404" in str(e):
            head = None
        else:
            raise

    tree = req("POST", f"/repos/{SLUG}/git/trees", {"tree": entries})
    print(f"  ✅ tree {tree['sha'][:10]}")

    commit_body = {"message": MSG, "tree": tree["sha"]}
    if head:
        commit_body["parents"] = [head]
    commit = req("POST", f"/repos/{SLUG}/git/commits", commit_body)
    print(f"  ✅ commit {commit['sha'][:10]}")

    if head:
        req("PATCH", f"/repos/{SLUG}/git/refs/heads/{BRANCH}", {"sha": commit["sha"], "force": False})
    else:
        req("POST", f"/repos/{SLUG}/git/refs", {"ref": f"refs/heads/{BRANCH}", "sha": commit["sha"]})
    print(f"  ✅ 已更新 refs/heads/{BRANCH}")


main()
