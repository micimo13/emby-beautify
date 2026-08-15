/* ═══════════════════════════════════════════════════════════
   Vanvy Emby Kit · dark_skin 深色皮肤层 · JS 激活器
   职责: 无 —— 纯 CSS 组件, 此文件仅为占位 (manifest 需脚本)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.VanvyDarkSkinLoaded) return;
  window.VanvyDarkSkinLoaded = true;
  // CSS 已覆盖全部样式, JS 仅做防御性背景锁定 (路由重建时重钉)
  var BLACK = '#0a0a0c';
  var BLACK2 = '#070709';
  function apply() {
    try {
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
  apply();
  // Emby 路由切换会重建背景容器, 每 2s 重钉 (幂等且便宜)
  setInterval(apply, 2000);
})();
