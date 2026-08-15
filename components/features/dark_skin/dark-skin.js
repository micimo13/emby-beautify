/* ═══════════════════════════════════════════════════════════
   Vanvy Emby Kit · dark_skin 深色皮肤层 · JS 激活器
   ───────────────────────────────────────────────────────────
   职责:
   1. 检测当前是否处于管理后台路由 (#/dashboard... 或 .dashboardContainer)
   2. 在 <html> 上维护标记 class:
        html.vanvy-admin      → 管理后台 (dark_skin 全部还原默认)
        html:not(.vanvy-admin) → 用户浏览界面 (深黑皮肤生效)
   3. 用户界面下防御性钉黑背景 (路由重建时重钉)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.VanvyDarkSkinLoaded) return;
  window.VanvyDarkSkinLoaded = true;

  var ADMIN_CLASS = 'vanvy-admin';
  var BLACK = '#0a0a0c';
  var BLACK2 = '#070709';

  /** 判断是否管理后台: 路由 hash 含 /dashboard 或 DOM 出现 .dashboardContainer */
  function isAdminRoute() {
    try {
      if (document.querySelector('.dashboardContainer')) return true;
      var h = (location.hash || '');
      if (/dashboard/.test(h)) return true;
      return false;
    } catch (e) { return false; }
  }

  /** 维护 html.vanvy-admin 标记, 返回是否管理后台 */
  function markAdmin() {
    var admin = isAdminRoute();
    var root = document.documentElement;
    try {
      if (admin) root.classList.add(ADMIN_CLASS);
      else root.classList.remove(ADMIN_CLASS);
    } catch (e) {}
    return admin;
  }

  /** 用户界面下钉黑背景 (管理后台跳过) */
  function apply() {
    try {
      if (markAdmin()) return;
      var html = document.documentElement;
      var body = document.body;
      if (html) { html.style.backgroundColor = BLACK; }
      if (body) { body.style.backgroundColor = BLACK; body.style.color = '#e7e5e4'; }
      var bgs = document.querySelectorAll('.backgroundContainer, .backdropContainer');
      for (var i = 0; i < bgs.length; i++) {
        var el = bgs[i];
        if (el.style.background && el.style.background.indexOf(BLACK) !== -1) continue;
        el.style.background = 'linear-gradient(180deg, ' + BLACK + ' 0%, ' + BLACK2 + ' 100%)';
      }
    } catch (e) {}
  }

  // 初始执行
  function init() {
    apply();
    // Emby 路由切换 (hash 变化) → 重新判定
    window.addEventListener('hashchange', apply);
    // DOM 变化 (Emby 视图重建) → 重新判定
    try {
      if (document.body) {
        var mo = new MutationObserver(function () {
          var prev = document.documentElement.classList.contains(ADMIN_CLASS);
          var now = markAdmin();
          if (prev !== now) apply();
        });
        mo.observe(document.body, { childList: true, subtree: true });
      }
    } catch (e) {}
    // 每 2s 兜底重钉 (幂等且便宜)
    setInterval(apply, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
