/**
 * =============================================================================
 *  Vanvy Emby Kit · 全局字体栈 (global_fonts)
 *  ---------------------------------------------------------------------------
 *  吸收自: heichaowo/Emby-Fluent (MIT) 的字体栈理念
 *    Plus Jakarta Sans (西文) + HarmonyOS Sans SC (中文, 预分片) + 霞鹜文楷
 *  铁律 (防黑屏): 外链资源 → 本地优先 + CDN 双回退 (jsDelivr → npmmirror) +
 *  非阻塞加载 + 失败静默 + localStorage 冷却 (失败 7 天内不重试)。
 *  字体加载失败绝不影响页面渲染 (font-display: swap 语义)。
 * =============================================================================
 */
(function () {
  'use strict';
  if (window.VanvyGlobalFonts) return;

  var COOLDOWN_KEY = 'vanvy-fonts-cooldown';
  var COOLDOWN_MS = 7 * 24 * 3600 * 1000; // 失败后 7 天冷却

  var LINKS = [
    { id: 'vanvy-font-jakarta', hrefs: [
      'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
      'https://fonts.loli.net/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'
    ]},
    { id: 'vanvy-font-harmony', hrefs: [
      'https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.1.0/dist/Regular.css',
      'https://registry.npmmirror.com/harmonyos-sans-sc-webfont-splitted/1.1.0/files/dist/Regular.css'
    ]},
    { id: 'vanvy-font-harmony-bold', hrefs: [
      'https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.1.0/dist/Bold.css',
      'https://registry.npmmirror.com/harmonyos-sans-sc-webfont-splitted/1.1.0/files/dist/Bold.css'
    ]},
    { id: 'vanvy-font-wenkai', hrefs: [
      'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css',
      'https://registry.npmmirror.com/lxgw-wenkai-webfont/1.7.0/files/style.css'
    ]}
  ];

  function inCooldown() {
    try {
      var ts = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10);
      return ts > Date.now();
    } catch (e) { return false; }
  }

  function setCooldown() {
    try { localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS)); } catch (e) { /* ignore */ }
  }

  function loadLink(link, idx) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.id = link.id;
    l.href = link.hrefs[idx];
    l.onerror = function () {
      // 尝试下一个回退源
      if (idx + 1 < link.hrefs.length) {
        loadLink(link, idx + 1);
      } else {
        document.getElementById(link.id) && document.getElementById(link.id).remove();
        // 所有源都失败 → 冷却 7 天
        setCooldown();
      }
    };
    (document.head || document.documentElement).appendChild(l);
  }

  function init() {
    // 应用字体族 class (字体加载失败自动回退系统字体, 不影响渲染)
    try { document.body.classList.add('vanvy-fonts-applied'); } catch (e) { /* ignore */ }
    if (inCooldown()) {
      console.log('[VanvyGlobalFonts] 字体冷却期内, 跳过外部加载 (使用系统字体)');
      return;
    }
    // 防黑屏: 10s 超时兜底, 之后若字体仍未加载成功则进入冷却
    var failTimer = setTimeout(function () {
      var allLoaded = LINKS.every(function (l) {
        var el = document.getElementById(l.id);
        return el && el.sheet && el.sheet.cssRules && el.sheet.cssRules.length > 0;
      });
      if (!allLoaded) setCooldown();
    }, 10000);
    // 成功后清除兜底定时器
    var okTimer = setInterval(function () {
      var done = LINKS.every(function (l) {
        var el = document.getElementById(l.id);
        return el && el.sheet && el.sheet.cssRules && el.sheet.cssRules.length > 0;
      });
      if (done) { clearInterval(okTimer); clearTimeout(failTimer); }
    }, 500);

    LINKS.forEach(function (l) { loadLink(l, 0); });
  }

  window.VanvyGlobalFonts = { init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();
