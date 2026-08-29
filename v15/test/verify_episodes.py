#!/usr/bin/env python3
"""验证 banner-cinema 加强版：轮播到剧集时 vml-track / cinema-episodes 显示季/集
用法: python3 verify_episodes.py
"""
import os, time, json
os.environ['TMPDIR'] = '/vol1/@apphome/trim.openclaw/data/workspace/tmp-pw'
from playwright.sync_api import sync_playwright

MOCK = 'http://127.0.0.1:8899/index.html#!/home'

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
        pg.goto(MOCK, wait_until='domcontentloaded', timeout=30000)
        pg.wait_for_timeout(9000)

        # 检查轮播容器 + 媒体库容器 + 剧集季集结构
        info = pg.evaluate("""() => {
          const q = s => document.querySelector(s);
          const car = q('.vanvy-cinema');
          const lib = q('.vml-library, .vanvy-cinema-library');
          const track = q('.vml-track');
          // 剧集季/集浮层
          const eps = q('.cinema-episodes');
          const seasons = q('.ce-seasons');
          const seasonTabs = document.querySelectorAll('.ce-season-tab');
          const epItems = document.querySelectorAll('.ce-ep, .cinema-ep');
          // 轮播里有没有剧集(Series)
          const seriesInBanner = Array.from(document.querySelectorAll('.cinema-slide, [class*=slide]')).filter(el =>
            el.textContent && (el.textContent.includes('三体') || el.textContent.includes('漫长的季节'))
          ).length;
          return {
            carousel: !!car,
            library: !!lib,
            track: !!track,
            episodesLayer: !!eps,
            seasonsEl: !!seasons,
            seasonTabs: seasonTabs.length,
            epItems: epItems.length,
            seriesInBanner: seriesInBanner,
            bodyText: document.body.innerText.slice(0, 100)
          };
        }""")
        print("轮播容器:", '✅' if info['carousel'] else '❌')
        print("媒体库容器:", '✅' if info['library'] else '❌')
        print("vml-track:", '✅' if info['track'] else '❌')
        print("剧集季/集浮层:", '✅' if info['episodesLayer'] else '❌(未显示，可能需切到剧集)')
        print("季tab数:", info['seasonTabs'], "| 集item数:", info['epItems'])
        print("轮播中剧集数:", info['seriesInBanner'])
        print("pageErrors:", len(errs), errs[:3])

        # 截图看实际效果
        pg.screenshot(path='/tmp/v15test/cinema-episodes-check.png', timeout=8000, animations='disabled')
        print("📸 截图: /tmp/v15test/cinema-episodes-check.png")
        b.close()

if __name__ == '__main__':
    main()
