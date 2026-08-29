#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
 Vanvy Emby Kit · 轮播策展规则生成器 (gen_carousel_rules.py)
 ---------------------------------------------------------------------------
 吸收自: Baiganjia/EmbyCarouselGUI 的策展理念
 把首页轮播从"随机抽卡"升级为可运营的内容位:
   - 每日推荐 / 近期上映 / 高分精选 / 随机合集 / 最近入库
 生成的规则文件供 rules-loader.js 使用 (vanvy/carousel-rules.json)。

 用法:
   python3 gen_carousel_rules.py --server http://127.0.0.1:8096 --token XXX list
   python3 gen_carousel_rules.py --server ... --token ... gen --template daily --keep 3
   python3 gen_carousel_rules.py --container emby gen --template recent --days 45 --libraries 电影,剧集
   python3 gen_carousel_rules.py --container emby gen --template top-rated --keep 5 --deploy
   # cron 每日自动刷新:
   0 6 * * * cd ... && python3 gen_carousel_rules.py --container emby gen --template daily --keep 1 --deploy

 模板:
   daily      每日推荐: 随机 1 部 (或 --keep N 部)
   recent     近期上映: 最近 N 天首映, 按首映日期倒序
   new-added  最近入库: 按 DateCreated 倒序
   top-rated  高分精选: 按 CommunityRating 倒序 (可配 --min-rating)
   collection 随机合集: BoxSet 类型随机
 =============================================================================
"""
import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request
import urllib.parse

DEFAULT_SERVER = "http://127.0.0.1:8096"
DEFAULT_TOKEN = ""
RULES_PATH = "components/home/carousel_rules/carousel-rules.json"  # 相对 kit 根
KIT_ROOT = "/vol1/@apphome/trim.openclaw/data/workspace/emby-kit"


def api_get(server, token, path, params=None):
    url = server.rstrip("/") + "/emby/" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    req.add_header("X-Emby-Token", token)
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"  ❌ API 请求失败: {e}")
        return None


def get_libraries(server, token):
    data = api_get(server, token, "Library/MediaFolders", {
        "EnableTotalRecordCount": "false",
    })
    return (data or {}).get("Items", [])


def list_libraries(server, token):
    libs = get_libraries(server, token)
    if not libs:
        print("  ⚠️ 未获取到媒体库列表 (检查 server/token)")
        return
    print(f"  📚 共 {len(libs)} 个媒体库:")
    for l in libs:
        print(f"    - {l.get('Name')}  (type={l.get('CollectionType')}, id={l.get('Id')})")


def resolve_library_ids(server, token, names):
    """库名 → parentId 列表"""
    libs = get_libraries(server, token)
    by_name = {l.get("Name"): l.get("Id") for l in libs}
    ids = []
    for n in names:
        n = n.strip()
        if not n:
            continue
        if n in by_name:
            ids.append(by_name[n])
        else:
            # 模糊匹配
            hit = [v for k, v in by_name.items() if k and n in k]
            if hit:
                ids.append(hit[0])
            else:
                print(f"  ⚠️ 媒体库未找到: {n} (可先运行 list 查看)")
    return ids


def build_rule(template, keep, days, libraries, min_rating):
    if template == "daily":
        return {
            "name": "每日推荐",
            "types": ["Movie", "Series"],
            "libraries": libraries,
            "sort": "Random",
            "order": "Descending",
            "minPremiereDays": None,
            "maxCount": keep,
            "pin": [],
        }
    if template == "recent":
        return {
            "name": f"近期上映 ({days}天)",
            "types": ["Movie", "Series"],
            "libraries": libraries,
            "sort": "PremiereDate",
            "order": "Descending",
            "minPremiereDays": days,
            "maxCount": keep,
            "pin": [],
        }
    if template == "new-added":
        return {
            "name": "最近入库",
            "types": ["Movie", "Series"],
            "libraries": libraries,
            "sort": "DateCreated",
            "order": "Descending",
            "minPremiereDays": None,
            "maxCount": keep,
            "pin": [],
        }
    if template == "top-rated":
        return {
            "name": f"高分精选 (≥{min_rating})",
            "types": ["Movie", "Series"],
            "libraries": libraries,
            "sort": "CommunityRating",
            "order": "Descending",
            "minPremiereDays": None,
            "maxCount": keep,
            "pin": [],
        }
    if template == "collection":
        return {
            "name": "随机合集",
            "types": ["BoxSet"],
            "libraries": libraries,
            "sort": "Random",
            "order": "Descending",
            "minPremiereDays": None,
            "maxCount": keep,
            "pin": [],
        }
    raise ValueError(f"未知模板: {template}")


def write_rules(rule, out_path):
    payload = {"version": 1, "rule": rule}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  ✅ 规则已写入: {out_path}")
    print(f"     name={rule['name']} types={rule['types']} sort={rule['sort']} "
          f"limit={rule['maxCount']} libs={rule['libraries'] or '全部'}")


def deploy_to_container(container, rules_path):
    """docker cp 进容器 vanvy/carousel_rules/"""
    try:
        r = subprocess.run(
            ["docker", "exec", container, "sh", "-c",
             "mkdir -p /system/dashboard-ui/vanvy/carousel_rules"],
            capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            # 尝试探测真实 dashboard 目录
            probe = subprocess.run(
                ["docker", "exec", container, "sh", "-c",
                 "for d in /system/dashboard-ui /app/emby/system/dashboard-ui /usr/lib/emby-server/web /opt/emby-server/system/dashboard-ui; do [ -f \"$d/index.html\" ] && echo \"$d\" && break; done"],
                capture_output=True, text=True, timeout=10)
            dash = probe.stdout.strip().splitlines()
            if not dash:
                print("  ❌ 无法探测容器 dashboard 目录")
                return False
            dash = dash[0]
        else:
            dash = "/system/dashboard-ui"
        subprocess.run(
            ["docker", "cp", rules_path,
             f"{container}:{dash}/vanvy/carousel_rules/carousel-rules.json"],
            capture_output=True, text=True, timeout=15)
        print(f"  ✅ 已部署到容器 {container}:{dash}/vanvy/carousel_rules/carousel-rules.json")
        return True
    except Exception as e:
        print(f"  ❌ 部署失败: {e}")
        return False


def main():
    ap = argparse.ArgumentParser(description="Vanvy Emby Kit 轮播策展规则生成器")
    ap.add_argument("--server", default=DEFAULT_SERVER, help=f"Emby 地址 (默认 {DEFAULT_SERVER})")
    ap.add_argument("--token", default=DEFAULT_TOKEN, help="Emby API Key")
    ap.add_argument("--container", help="Emby 容器名 (优先于 --server/--token, 从容器内探测)")
    ap.add_argument("--kit-root", default=KIT_ROOT, help="kit 根目录")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="列出媒体库")
    p_gen = sub.add_parser("gen", help="生成规则")
    p_gen.add_argument("--template", required=True,
                       choices=["daily", "recent", "new-added", "top-rated", "collection"])
    p_gen.add_argument("--keep", type=int, default=5, help="轮播保留数量 (默认 5)")
    p_gen.add_argument("--days", type=int, default=45, help="recent 模板的最近天数 (默认 45)")
    p_gen.add_argument("--libraries", default="", help="媒体库名, 逗号分隔 (空=全部)")
    p_gen.add_argument("--min-rating", type=float, default=7.0, help="top-rated 最低评分 (默认 7.0)")
    p_gen.add_argument("--pin", default="", help="优先置顶片名, 逗号分隔 (可选)")
    p_gen.add_argument("--out", help="输出路径 (默认写入 kit 组件目录)")
    p_gen.add_argument("--deploy", action="store_true", help="生成后直接 docker cp 进容器")

    args = ap.parse_args()

    # 容器模式: 探测 server/token (从容器 config 或默认)
    if args.container:
        try:
            api_key = subprocess.run(
                ["docker", "exec", args.container, "sh", "-c",
                 "cat /config/config/system.xml 2>/dev/null | grep -oP '(?<=<ApiKey>).*?(?=</ApiKey>)' | head -1"],
                capture_output=True, text=True, timeout=10).stdout.strip()
            if not api_key:
                # 兜底: 从 mp 或环境变量? 直接要求 --token
                pass
            if api_key:
                args.token = api_key or args.token
        except Exception:
            pass
        if not args.token:
            print("  ⚠️ 容器模式未取到 API Key, 请用 --token 指定")
            # 不退出, 让 list 尝试无 token (可能 401)

    if args.cmd == "list":
        list_libraries(args.server, args.token)
        return

    # gen
    libs = []
    if args.libraries:
        libs = [n.strip() for n in args.libraries.split(",") if n.strip()]

    rule = build_rule(args.template, args.keep, args.days, libs, args.min_rating)
    if args.pin:
        rule["pin"] = [n.strip() for n in args.pin.split(",") if n.strip()]

    out = args.out or f"{args.kit_root}/{RULES_PATH}"
    write_rules(rule, out)

    if args.deploy:
        if not args.container:
            print("  ❌ --deploy 需要 --container 指定容器名")
        else:
            deploy_to_container(args.container, out)


if __name__ == "__main__":
    main()
