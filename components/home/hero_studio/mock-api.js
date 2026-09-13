/* 预览用 mock ApiClient：让设计师轮播在无 Emby 环境下也能真实渲染 */
(function () {
  var ITEMS = window.VANVY_PREVIEW_ITEMS || [];
  /* 兼容：引擎现在传的是 itemId 字符串（真实 Emby 也是这个签名）*/
  function idxOf(item) {
    if (item == null) return 1;
    if (typeof item === 'string') return parseInt(item.replace('preview', ''), 10) || 1;
    if (item._idx) return item._idx;
    var p = String(item.Id || '').replace('preview', '');
    return parseInt(p, 10) || 1;
  }
  window.ApiClient = {
    getCurrentUserId: function () { return 'preview-user'; },
    serverAddress: function () { return ''; },
    getImageUrl: function (item, opts) {
      opts = opts || {};
      var t = opts.type || 'Backdrop';
      var i = idxOf(item);
      if (t === 'Primary') return 'img/primary' + i + '.jpg';
      if (t === 'Logo')    return 'img/logo' + i + '.jpg';
      if (t === 'Thumb')   return 'img/backdrop' + i + '.jpg';
      return 'img/backdrop' + i + '.jpg';
    },
    getItems: function () {
      return Promise.resolve({ Items: ITEMS, TotalRecordCount: ITEMS.length });
    },
    getPlaybackInfo: function () { return Promise.resolve({}); },
    // ── 供生产版轮播（banner_home）等组件使用 ──
    serverId: function () { return 'preview-server'; },
    getUrl: function (path, params) {
      var q = '';
      if (params) {
        var kv = [];
        Object.keys(params).forEach(function (k) {
          kv.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
        });
        if (kv.length) q = '?' + kv.join('&');
      }
      return '/emby/' + String(path || '').replace(/^\//, '') + q;
    },
    getJSON: function (url) {
      var u = String(url || '');
      if (/\/Views/.test(u)) {
        return Promise.resolve({ Items: [
          { Id: 'lib-movies', Name: '电影', CollectionType: 'movies' },
          { Id: 'lib-tv',     Name: '剧集', CollectionType: 'tvshows' }
        ]});
      }
      if (/\/Items/.test(u)) {
        return Promise.resolve({ Items: ITEMS, TotalRecordCount: ITEMS.length });
      }
      return Promise.resolve({ Items: [] });
    }
  };
})();
