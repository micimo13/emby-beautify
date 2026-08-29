/**
 * Vanvy Emby Kit · 品牌加载动画 (vanvy-splash)
 * =============================================================================
 * 原创设计: 深色极光渐变底 + LOGO 光晕呼吸 + 底部流光进度条
 * 机制:
 *   1. 进入首页(#!/home)时显示品牌动画覆盖层
 *   2. 监听轮播就绪事件 `vanvy:carousel-ready` → 淡出(600ms)后移除
 *   3. 12 秒兜底超时自动淡出, 防止轮播异常时卡住页面
 *   4. 离开首页立即隐藏
 * 零依赖, 自包含 (CSS 内嵌注入)
 */
(function () {
  'use strict';
  if (window.VanvySplash) return;
  window.VanvySplash = true;

  var SPLASH_ID = 'vanvy-splash';
  var FADE_MS = 600;
  var TIMEOUT_MS = 12000;
  var shown = false;
  var fading = false;
  var splashEl = null;
  var timeoutTimer = null;

  /* ── CSS (内嵌) ── */
  var css = [
    '#' + SPLASH_ID + '{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;',
    'background:radial-gradient(1200px 600px at 20% 0%,rgba(88,101,242,.18),transparent 60%),',
    'radial-gradient(1000px 500px at 80% 100%,rgba(255,176,59,.12),transparent 55%),',
    'linear-gradient(160deg,#0a0e1a 0%,#0d1124 45%,#101430 100%);',
    'transition:opacity ' + FADE_MS + 'ms ease;opacity:1;}',
    '#' + SPLASH_ID + '.vanvy-splash-hide{opacity:0;pointer-events:none;}',
    '#' + SPLASH_ID + ' .vs-inner{display:flex;flex-direction:column;align-items:center;gap:28px;}',
    '#' + SPLASH_ID + ' .vs-logo-wrap{position:relative;width:160px;height:160px;display:flex;align-items:center;justify-content:center;}',
    '#' + SPLASH_ID + ' .vs-logo{max-width:120px;max-height:120px;object-fit:contain;position:relative;z-index:2;',
    'animation:vs-breathe 2.4s ease-in-out infinite;}',
    '#' + SPLASH_ID + ' .vs-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,255,255,.08);}',
    '#' + SPLASH_ID + ' .vs-ring::before{content:"";position:absolute;inset:-2px;border-radius:50%;',
    'border:2px solid transparent;border-top-color:rgba(255,255,255,.55);border-right-color:rgba(255,255,255,.25);',
    'animation:vs-spin 1.4s linear infinite;}',
    '#' + SPLASH_ID + ' .vs-glow{position:absolute;inset:20px;border-radius:50%;filter:blur(24px);',
    'background:radial-gradient(circle,rgba(255,255,255,.22),transparent 70%);',
    'animation:vs-glowpulse 2.4s ease-in-out infinite;}',
    '#' + SPLASH_ID + ' .vs-bar{width:220px;height:3px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;}',
    '#' + SPLASH_ID + ' .vs-bar i{display:block;height:100%;width:40%;border-radius:99px;',
    'background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);',
    'animation:vs-slide 1.2s ease-in-out infinite;}',
    '#' + SPLASH_ID + ' .vs-brand{font-size:13px;letter-spacing:5px;color:rgba(255,255,255,.45);',
    'font-weight:300;text-transform:uppercase;}',
    '@keyframes vs-spin{to{transform:rotate(360deg)}}',
    '@keyframes vs-breathe{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.06);opacity:1}}',
    '@keyframes vs-glowpulse{0%,100%{opacity:.5;transform:scale(.95)}50%{opacity:1;transform:scale(1.08)}}',
    '@keyframes vs-slide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('vanvy-splash-style')) return;
    var st = document.createElement('style');
    st.id = 'vanvy-splash-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function buildSplash() {
    var el = document.createElement('div');
    el.id = SPLASH_ID;
    el.innerHTML =
      '<div class="vs-inner">' +
      '<div class="vs-logo-wrap">' +
      '<div class="vs-glow"></div>' +
      '<div class="vs-ring"></div>' +
      '<img class="vs-logo" alt="" src="vanvy/branding/splash-logo.png" onerror="this.style.display=\'none\'">' +
      '</div>' +
      '<div class="vs-bar"><i></i></div>' +
      '<div class="vs-brand">VANVY</div>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }

  function show() {
    if (shown || fading) return;
    // 轮播已就绪 → 无需显示品牌动画 (防止 ready 事件早于 show 的时序问题)
    if (document.body.classList.contains('vanvy-carousel-active')) return;
    shown = true;
    injectCss();
    if (!splashEl) splashEl = buildSplash();
    splashEl.classList.remove('vanvy-splash-hide');
    // 兜底: 12 秒后强制淡出
    timeoutTimer = setTimeout(hide, TIMEOUT_MS);
  }

  function hide() {
    if (!shown || fading) return;
    fading = true;
    if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    if (splashEl) {
      splashEl.classList.add('vanvy-splash-hide');
      setTimeout(function () {
        if (splashEl && splashEl.parentNode) splashEl.parentNode.removeChild(splashEl);
        splashEl = null;
        shown = false;
        fading = false;
      }, FADE_MS + 50);
    } else {
      shown = false;
      fading = false;
    }
  }

  /* 轮播就绪 → 淡出 */
  window.addEventListener('vanvy:carousel-ready', hide);

  /* 路由轮询: 仅首页显示 */
  /* 路由轮询: 仅首页显示 — ⚠️ 2026-08-18 性能优化: 400→800ms, 减少主线程占用 */
  setInterval(function () {
    var onHome = window.location.href.indexOf('!/home') !== -1;
    if (onHome && !shown && !fading) {
      show();
    } else if (!onHome && shown) {
      hide();
    }
    // 顶栏透明回收: 首页没有任何轮播时取消透明
    var anyCarousel = document.querySelector('.view:not(.hide) .vanvy-aurora, .view:not(.hide) .vanvy-cinema, .view:not(.hide) .vanvy-split, .view:not(.hide) .heicha-banner, .view:not(.hide) .vanvy-banner');
    if (!anyCarousel) {
      document.body.classList.remove('vanvy-carousel-active');
    }
  }, 800);

  console.log('[VanvySplash] 品牌加载动画就绪');
})();
