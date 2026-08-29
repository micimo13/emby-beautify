#!/usr/bin/env python3
"""V1.5 纯净环境验收 — Playwright 加载 mock 台，检查 loader/轮播/主题/features
用法:
  python3 test/verify_pure.py [banner_id] [--mock http://127.0.0.1:8899] [--shot out.png]
不传 banner = 用 manifest 里的值
"""
import os, sys, json, time
os.environ['TMPDIR'] = '/vol1/@apphome/trim.openclaw/data/workspace/tmp-pw'
from playwright.sync_api import sync_playwright

MOCK = 'http://127.0.0.1:8899/index.html'
WS = '/vol1/1001/web/v15'
BANNER = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else None
if '--mock' in sys.argv: MOCK = sys.argv[sys.argv.index('--mock') + 1]
SHOT = None
if '--shot' in sys.argv: SHOT = sys.argv[sys.argv.index('--shot') + 1]

def main():
    manifest = json.load(open(f'{WS}/vanvy/vanvy-manifest.json'))
    banner = BANNER or manifest['banner']
    print(f"🎯 验收轮播: {banner} | manifest: {manifest['version']}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = ctx.new_page()
        logs, errors = [], []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text[:120]}'))
        page.on('pageerror', lambda e: errors.append(str(e)[:200]))

        page.goto(MOCK + '#!/home', wait_until='domcontentloaded', timeout=30000)
        page.wait_for_timeout(10000)

        result = page.evaluate("""(bannerId) => {
          const q = s => document.querySelector(s);
          // 各轮播独立类名
          const selMap = {
            banner_cinema: '.vanvy-cinema, .cinema-banner, [class*=cinema-banner]',
            banner_aurora: '.vanvy-aurora, [class*=aurora-banner]',
            banner_split: '.vanvy-split, [class*=split-banner]',
            banner_fluent: '.heicha-banner, .emby-banner-fluent, [class*=banner-fluent]',
            banner_classic: '.misty-banner, .emby-banner-classic, [class*=banner-classic]',
            banner_homeswiper: '.mySwiper-main, .homeswiper, [class*=HomeSwiper], [class*=homeswiper], [class*=mySwiper]',
            banner_carousel: '[class*=banner-carousel]'
          };
          const sel = selMap[bannerId] || '[class*=banner]';
          const car = q(sel);
          const cssLoaded = !!q('link[href*="banner/' + bannerId + '"]');
          return {
            loader: !!window.VanvySetupLoaded,
            manifestBanner: (window.__vanvyManifest || {}).banner || null,
            themeClass: document.body.className.match(/vanvy-aurora-theme-\\w+/) ? document.body.className.match(/vanvy-aurora-theme-\\w+/)[0] : null,
            carousel: !!car,
            carClass: car ? car.className : null,
            title: car ? (car.textContent || '').slice(0, 60) : null,
            slides: car ? car.querySelectorAll('[class*=slide], [class*=thumb], [class*=card], [class*=frame], [class*=item]').length : 0,
            images: car ? car.querySelectorAll('img, [style*="background-image"]').length : 0,
            blackBg: getComputedStyle(document.body).backgroundColor,
            goldCss: !!q('link[href*="black-gold"]'),
            baseCss: !!q('link[href*="vanvy-black.css"]'),
            bodyBgApplied: (document.body.style.backgroundColor || '')
          };
        }""", banner)

        print(f"loader:      {'✅' if result['loader'] else '❌'}")
        print(f"manifest:    {manifest['version']}")
        print(f"themeClass:  {result['themeClass']}")
        print(f"carousel:    {'✅ ' + result['carClass'] if result['carousel'] else '❌ MISSING'}")
        print(f"  title:     {result['title']}")
        print(f"  slides:    {result['slides']} | images: {result['images']}")
        print(f"baseCss:     {'✅' if result['baseCss'] else '❌'} | goldCss: {'✅' if result['goldCss'] else '❌'}")
        print(f"bodyBg:      {result['blackBg']} (inline: {result['bodyBgApplied'] or '无'})")
        print(f"pageErrors:  {len(errors)}")
        for e in errors[:5]: print(f"  ⛔ {e}")
        err_console = [l for l in logs if l.startswith('error')]
        if err_console:
            print(f"console errors: {len(err_console)}")
            for l in err_console[:5]: print(f"  ⛔ {l}")

        if SHOT:
            page.screenshot(path=SHOT, full_page=False, timeout=8000, animations='disabled')
            print(f"📸 截图: {SHOT}")

        browser.close()

        ok = result['loader'] and result['carousel'] and len(errors) == 0
        print(f"\n{'✅ 验收通过' if ok else '❌ 验收失败'}")
        sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
