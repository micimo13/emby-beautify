/* Vanvy Cinema · TMDB 高清宽幅图映射加载器 (V1 组件版)
   供 banner-cinema.js 使用: 把 tmdb-backdrops.json 载入 window._vanvyTmdbBd
   路径: V1 部署后 tmdb-backdrops.json 位于 /web/vanvy/banner_cinema/ 下
   (加载失败静默跳过, 轮播回退 Emby Backdrop, 不糊图) */
(function () {
  'use strict';
  if (window._vanvyTmdbBd) return;
  try {
    fetch('/web/vanvy/banner_cinema/tmdb-backdrops.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (m) { window._vanvyTmdbBd = m || {}; })
      .catch(function () { window._vanvyTmdbBd = {}; });
  } catch (e) { window._vanvyTmdbBd = {}; }
})();
