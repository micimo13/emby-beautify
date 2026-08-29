#!/usr/bin/env python3
"""gen-manifest.py — V1.5 manifest 生成器（install.sh 调用）
用法: gen-manifest.py <banner_id> [--themes a,b,c] [--features a,b,c]
      [--no-black] [--no-gold] [--theme-class xxx] [-o out.json]
"""
import argparse, json, sys, datetime

BANNERS = ["banner_classic", "banner_fluent", "banner_carousel",
           "banner_homeswiper", "banner_aurora", "banner_cinema", "banner_split"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("banner", nargs="?", default="banner_cinema")
    ap.add_argument("--themes", default="")
    ap.add_argument("--features", default="")
    ap.add_argument("--no-black", action="store_true")
    ap.add_argument("--no-gold", action="store_true")
    ap.add_argument("--theme-class", default="vanvy-aurora-theme-midnight")
    ap.add_argument("-o", "--out", default="")
    a = ap.parse_args()

    if a.banner not in BANNERS:
        print(f"❌ 未知轮播: {a.banner} (可选: {'/'.join(BANNERS)})", file=sys.stderr)
        sys.exit(1)

    themes = [x.strip() for x in a.themes.split(",") if x.strip()]
    features = [x.strip() for x in a.features.split(",") if x.strip()]

    m = {
        "version": "v15_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S"),
        "banner": a.banner,
        "bannerThemeClass": a.theme_class,
        "themes": themes,
        "features": features,
        "baseBlack": not a.no_black,
        "blackGold": not a.no_gold,
    }
    text = json.dumps(m, ensure_ascii=False, indent=2)
    if a.out:
        with open(a.out, "w") as f:
            f.write(text)
        print(f"✅ manifest 写入: {a.out}", file=sys.stderr)
    else:
        print(text)

if __name__ == "__main__":
    main()
