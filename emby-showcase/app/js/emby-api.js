/* ═══════════════════════════════════════════════════════════
   Vanvy Emby · API 封装层
   完全对接 Emby HTTP API (4.8), 不依赖 Emby 自带前端
   ═══════════════════════════════════════════════════════════ */
window.Vanvy = window.Vanvy || {};
(function () {
  'use strict';

  // 服务地址: 优先用户配置 (localStorage), 否则当前 URL
  function serverBase() {
    try {
      var cfg = localStorage.getItem('vanvy_server');
      if (cfg) return cfg;
    } catch (e) {}
    var w = window.location;
    return w.protocol + '//' + w.host;
  }

  function setServer(base) {
    try { localStorage.setItem('vanvy_server', base.replace(/\/$/, '')); } catch (e) {}
    API = serverBase() + '/emby';
  }

  var API = serverBase() + '/emby';
  var token = null;
  var userId = null;
  var currentUser = null;

  var CLIENT_HEADER = 'MediaBrowser Client="Vanvy", Device="Browser", DeviceId="vanvy-web-' + Math.random().toString(36).slice(2, 10) + '", Version="1.0.0"';

  function headers(extra) {
    var h = {
      'Content-Type': 'application/json',
      'X-Emby-Authorization': CLIENT_HEADER
    };
    if (token) h['X-Emby-Token'] = token;
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function qs(obj) {
    var parts = [];
    for (var k in obj) {
      if (obj[k] === undefined || obj[k] === null || obj[k] === '') continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function get(path, params) {
    return fetch(API + path + qs(params), { headers: headers(), credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function post(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  var Emby = {
    serverBase: serverBase,
    setServer: setServer,

    /* ── 认证 ── */
    login: function (username, pw) {
      return post('/Users/AuthenticateByName', { Username: username, Pw: pw }).then(function (res) {
        token = res.AccessToken;
        userId = res.User.Id;
        currentUser = res.User;
        return res;
      });
    },

    logout: function () {
      token = null; userId = null; currentUser = null;
      try { localStorage.removeItem('vanvy_emby_token'); localStorage.removeItem('vanvy_emby_user'); } catch (e) {}
    },

    restore: function () {
      try {
        var t = localStorage.getItem('vanvy_emby_token');
        var u = JSON.parse(localStorage.getItem('vanvy_emby_user') || 'null');
        if (t && u) { token = t; userId = u.Id; currentUser = u; return true; }
      } catch (e) {}
      return false;
    },

    persist: function () {
      try {
        localStorage.setItem('vanvy_emby_token', token);
        localStorage.setItem('vanvy_emby_user', JSON.stringify(currentUser));
      } catch (e) {}
    },

    hasToken: function () { return !!token; },
    getToken: function () { return token; },
    getUserId: function () { return userId; },
    getUser: function () { return currentUser; },

    /* ── 用户视图 (媒体库列表) ── */
    getViews: function () {
      return get('/Users/' + userId + '/Views');
    },

    /* ── 首页数据 ── */
    getResume: function (limit) {
      return get('/Users/' + userId + '/Items/Resume', {
        Limit: limit || 12, Fields: 'PrimaryImageAspectRatio,ProductionYear,Overview,CommunityRating', EnableTotalRecordCount: false
      });
    },
    getLatest: function (parentId, limit) {
      return get('/Users/' + userId + '/Items/Latest', {
        Limit: limit || 12, Fields: 'PrimaryImageAspectRatio,ProductionYear,Overview,CommunityRating'
      }).then(function (res) {
        // Latest API 直接返回数组
        return { Items: Array.isArray(res) ? res : (res.Items || []) };
      });
    },
    getNextUp: function (limit) {
      return get('/Shows/NextUp', {
        UserId: userId, Limit: limit || 12, Fields: 'PrimaryImageAspectRatio,ProductionYear,Overview,CommunityRating'
      });
    },

    /* ── 媒体库浏览 ── */
    getItems: function (params) {
      return get('/Users/' + userId + '/Items', params);
    },

    /* ── 详情 ── */
    getItem: function (itemId) {
      return get('/Users/' + userId + '/Items/' + itemId, {
        Fields: 'Overview,Genres,People,ProductionYear,CommunityRating,MediaSources,Studios,Taglines,MediaStreams,Chapters,Path'
      });
    },
    getSeasons: function (seriesId) {
      return get('/Shows/' + seriesId + '/Seasons', { UserId: userId, Fields: 'Overview,PrimaryImageAspectRatio' });
    },
    getEpisodes: function (seriesId, seasonId) {
      return get('/Shows/' + seriesId + '/Episodes', {
        UserId: userId, SeasonId: seasonId, Fields: 'Overview,PrimaryImageAspectRatio,ProductionYear,CommunityRating', EnableTotalRecordCount: false
      });
    },

    /* ── 搜索 (Items API 实时搜, Search/Hints 依赖索引不可靠) ── */
    search: function (term, limit) {
      return get('/Users/' + userId + '/Items', {
        SearchTerm: term, Recursive: true, Limit: limit || 30,
        IncludeItemTypes: 'Movie,Series,Episode',
        Fields: 'PrimaryImageAspectRatio,ProductionYear,CommunityRating',
        EnableTotalRecordCount: false
      });
    },

    /* ── 图片 URL ── */
    imageUrl: function (item, type, maxW) {
      if (!item || !item.Id) return '';
      type = type || 'Primary';
      var tag = (item.ImageTags && item.ImageTags[type]) || '';
      var w = maxW || 500;
      return API + '/Items/' + item.Id + '/Images/' + type + '?maxWidth=' + w + '&tag=' + encodeURIComponent(tag) + '&quality=90';
    },

    thumbUrl: function (item, maxW) {
      var types = ['Thumb', 'Backdrop', 'Primary'];
      for (var i = 0; i < types.length; i++) {
        if (item.ImageTags && item.ImageTags[types[i]]) return this.imageUrl(item, types[i], maxW);
      }
      return '';
    },

    /* ── 播放 ── */
    // 直连 URL (浏览器可直接播的格式用)
    playUrl: function (item, ms) {
      var srcId = ms ? ms.Id : item.Id;
      return API + '/Videos/' + item.Id + '/stream?static=true&api_key=' + token + '&mediaSourceId=' + srcId;
    },
    // 转码 URL (mkv/hevc 等浏览器不支持的用, 自动 h264+aac)
    transcodeUrl: function (item, ms, opts) {
      opts = opts || {};
      var srcId = ms ? ms.Id : item.Id;
      var u = API + '/Videos/' + item.Id + '/stream?api_key=' + token + '&mediaSourceId=' + srcId +
        '&VideoCodec=h264&AudioCodec=aac&MaxVideoBitrate=' + (opts.bitrate || 20000000) + '&Container=mp4';
      if (opts.audioIndex !== undefined) u += '&AudioStreamIndex=' + opts.audioIndex;
      if (opts.subtitleIndex !== undefined) u += '&SubtitleStreamIndex=' + opts.subtitleIndex;
      return u;
    },
    // 判断是否需要转码 (mkv/hevc 等浏览器不支持)
    needsTranscode: function (item, ms) {
      ms = ms || (item.MediaSources && item.MediaSources[0]);
      if (!ms) return true;
      var c = (ms.Container || '').toLowerCase();
      var codecs = ((ms.MediaStreams || []).filter(function (s) { return s.Type === 'Video'; }).map(function (s) { return (s.Codec || '').toLowerCase(); })).join(',');
      // 浏览器原生支持的容器/编码
      var okContainer = ['mp4', 'm4v', 'webm'].indexOf(c) > -1;
      var okCodec = !codecs || codecs.indexOf('h264') > -1 || codecs.indexOf('avc') > -1 || codecs.indexOf('vp9') > -1;
      return !(okContainer && okCodec);
    },
    // 获取媒体源 (含音轨/字幕流)
    getMediaSources: function (itemId) {
      return get('/Items/' + itemId + '/PlaybackInfo', {
        UserId: userId, StartTimeTicks: 0, AutoOpenLiveStream: false
      }).then(function (res) {
        return (res && res.MediaSources) || [];
      }).catch(function () { return []; });
    },

    /* ── 播放进度上报 ── */
    reportPlaybackStart: function (item, position) {
      try {
        fetch(API + '/Sessions/Playing', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({
            ItemId: item.Id, MediaSourceId: item.Id, PositionTicks: position || 0,
            IsPaused: false, IsMuted: false, PlayMethod: 'DirectPlay', CanSeek: true
          })
        });
      } catch (e) {}
    },
    reportPlaybackProgress: function (item, position, paused) {
      try {
        fetch(API + '/Sessions/Playing/Progress', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({
            ItemId: item.Id, MediaSourceId: item.Id, PositionTicks: position || 0,
            IsPaused: !!paused, IsMuted: false, PlayMethod: 'DirectPlay', CanSeek: true
          })
        });
      } catch (e) {}
    },
    reportPlaybackStopped: function (item, position) {
      try {
        fetch(API + '/Sessions/Playing/Stopped', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ ItemId: item.Id, MediaSourceId: item.Id, PositionTicks: position || 0 })
        });
      } catch (e) {}
    },

    /* ── 工具 ── */
    fmtDuration: function (ticks) {
      if (!ticks) return '';
      var sec = Math.floor(ticks / 10000000);
      var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
      return h ? h + ':' + (m < 10 ? '0' : '') + m + ':00' : m + ':00';
    },
    esc: function (s) {
      return String(s || '').replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
  };

  window.Vanvy.Emby = Emby;
})();
