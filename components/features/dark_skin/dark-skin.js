/* ═══════════════════════════════════════════════════════════
   Vanvy Emby Kit · dark_skin 深色皮肤层 · JS 激活器
   ───────────────────────────────────────────────────────────
   v3 架构: 只做 .backgroundContainer 背景钉黑 (防御路由重建)
   - 管理后台 (.dashboardContainer) 无 .backgroundContainer 元素
     → 天然豁免, 不需要任何路由检测/class 切换
   - CSS 负责全部皮肤样式 + 管理后台还原 (后代选择器)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.VanvyDarkSkinLoaded) return;
  window.VanvyDarkSkinLoaded = true;

  var BLACK = '#0a0a0c';
  var BLACK2 = '#070709';

  function apply() {
    try {
      var html = document.documentElement;
      var body = document.body;
      if (html && !html.querySelector('.dashboardContainer')) {
        html.style.backgroundColor = BLACK;
      }
      if (body && !body.querySelector('.dashboardContainer')) {
        body.style.backgroundColor = BLACK;
        body.style.color = '#e7e5e4';
      }
      // 钉黑 .backgroundContainer (dashboard 无此元素, 天然豁免)
      var bgs = document.querySelectorAll('.backgroundContainer');
      for (var i = 0; i < bgs.length; i++) {
        var el = bgs[i];
        if (el.style.background && el.style.background.indexOf(BLACK) !== -1) continue;
        el.style.background = 'linear-gradient(180deg, ' + BLACK + ' 0%, ' + BLACK2 + ' 100%)';
      }
    } catch (e) {}
  }

  function init() {
    apply();
    // Emby 路由重建背景容器 → 每 2s 重钉 (幂等且便宜)
    setInterval(apply, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
