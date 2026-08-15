/* ═══════════════════════════════════════════════════════════
   Vanvy Emby Kit · dark_skin 深色皮肤层 · JS 激活器
   ───────────────────────────────────────────────────────────
   v5 架构 (2026-08-15): 用户媒体路由白名单激活
   - Emby hashbang 路由: #!/home #!/movies #!/users/user 等
   - 采用「白名单」而非「黑名单」: 只有用户媒体/浏览路由才
     激活深色皮肤, 管理路由 (settings/dashboard/admin...) 完全不激活
   - 关键修复: #!/users/user (用户个人资料页) 是用户界面!
     之前黑名单把 users 误判为管理后台 → 用户页皮肤消失
   - 兼容旧内核, 不受视图缓存影响, 幂等
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.VanvyDarkSkinLoaded) return;
  window.VanvyDarkSkinLoaded = true;

  var ACTIVE_CLASS = 'vanvy-skin-active';
  var BLACK = '#0a0a0c';
  var BLACK2 = '#070709';

  // 用户媒体/浏览路由白名单 (base route, 去 .html 后缀)
  // 管理路由 (settings/dashboard/plugins/librarysetup/users 管理/
  //   managedownloads/manageserver/admin...) 不在白名单 → 不激活
  var USER_ROUTES = [
    'home', 'movies', 'tvshows', 'shows', 'series',
    'books', 'boxsets', 'games', 'kids', 'livetv',
    'playlists', 'search', 'list', 'folders', 'videos',
    'music', 'news', 'newepisodes', 'onnow', 'recordedtv',
    'programs', 'sports', 'latest', 'users' // users/user = 个人资料页(用户界面)
  ];

  /** 解析 hashbang 路由的 base */
  function parseRoute() {
    try {
      var h = location.hash || '';
      // 格式: #!/settings?tab=... 或 #/settings
      var route = h.replace(/^#!?\//, '').split('?')[0].split('#')[0].toLowerCase();
      return route.split('.')[0]; // 去 .html
    } catch (e) { return ''; }
  }

  /** 是否用户媒体路由 (白名单) */
  function isUserRoute() {
    var route = parseRoute();
    if (!route) return false; // 空路由(登录页)不激活
    for (var i = 0; i < USER_ROUTES.length; i++) {
      if (route === USER_ROUTES[i] || route.indexOf(USER_ROUTES[i] + '/') === 0) {
        return true;
      }
    }
    return false;
  }

  /** 维护 html.vanvy-skin-active 标记, 返回是否激活 */
  function markActive() {
    var active = isUserRoute();
    var root = document.documentElement;
    try {
      if (active) root.classList.add(ACTIVE_CLASS);
      else root.classList.remove(ACTIVE_CLASS);
    } catch (e) {}
    return active;
  }

  /** 激活时钉黑背景; 非激活时清除内联样式残留 (还原 Emby 默认) */
  function apply() {
    try {
      var active = markActive();
      var html = document.documentElement;
      var body = document.body;
      if (!active) {
        // 关键: 清除之前激活时残留的内联样式, 否则管理页背景仍黑
        if (html) html.style.backgroundColor = '';
        if (body) { body.style.backgroundColor = ''; body.style.color = ''; }
        var bgs0 = document.querySelectorAll('.backgroundContainer');
        for (var j = 0; j < bgs0.length; j++) {
          bgs0[j].style.background = '';
        }
        return;
      }
      if (html) { html.style.backgroundColor = BLACK; }
      if (body) { body.style.backgroundColor = BLACK; body.style.color = '#e7e5e4'; }
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
    // hash 路由变化 → 重新判定
    window.addEventListener('hashchange', apply);
    // 每 2s 兜底 (覆盖 SPA 内部跳转不触发 hashchange)
    setInterval(apply, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
