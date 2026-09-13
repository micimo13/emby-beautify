/**
 * =============================================================================
 *  Vanvy Detail · vanvy-detail.js   (VES v0.4 · Hero Takeover)
 *  ---------------------------------------------------------------------------
 *  详情页【结构对齐设计稿】：满屏 full-bleed 背景 + 海报左/标题右 hero + CTA
 *  + 第三方播放器 + JAV 条件卡 + 内容行（剧照/演员/类似）
 *
 *  参考不抄；单一观察器；命名空间隔离；特性开关；失败降级
 *  保功能：播放/收藏/标记已看/更多 → 全部转发到 Emby 原生按钮/API
 *
 *  ⚠️ Emby 全局 $ 是 jQuery → IIFE 内局部遮蔽
 * =============================================================================
 */
(function () {
  'use strict';
  if (window.VanvyDetail) return;

  var BASE = (function () {
    var s = document.currentScript;
    return s && s.src ? s.src.replace(/\/[^/]*$/, '/') : 'vanvy-detail/';
  })();

  var CFG = {
    theme: 'blackgold',
    frostBlur: 10, frostTint: 0.42,
    hero: true,                 // 详情页 hero 接管（结构对齐设计稿）
    hideNativeTop: true,        // 隐藏原生顶部字段流（用 hero 替代）
    showPlayers: true, showJav: true,
    javAutoRoute: true, playersOnlyOS: true,
    linksCollapsed: true,
    perRow: 6,
    maxFanart: 24,
    javdbReviewsUrl: '',
    // 演员别名映射：本地 Emby 演员名 → JavDB 可用名（简/繁/日文不同时用）
    //   例：{ '弥生美月': '弥生みづき', '三上悠亚': ['三上悠亜','三上悠亞'] }
    //   留空 = 全自动（搜演员 → 拿官方名+别名 → 逐个试搜选命中最高的）
    actorAlias: {},
    // ── 二期增强开关（每项独立，可单独关闭）─────────────
    p2: {
      sortEpisodes: true,      // ① 剧集列表 正序/倒序
      castContextMenu: true,   // ② 演员头像右键菜单
      sectionMore: true,       // ③ 内容容器「查看更多」
      javSeriesWall: true,     // ④ JAV 同系列影片墙
      mediaInfoPanel: true,    // ⑤ 信息面板重设计 + 完整信息弹框
      headerGlass: true,       // ⑥ 顶栏毛玻璃/透明
      inheritSeriesLogo: true, // ⑦ 单集继承剧集 LOGO
      extSitesFull: true,      // ⑧ 外站全量展示
      // ── ⑪ 第三方资料增强（正经库 · TMDB）主人 2026-09-13 ──
      //   总开关关闭 → 容器完全不注入、零请求；分模块可单独关。
      //   数据来自本机 enrich 服务（见 components/enrich/），前端只拿数据不落凭据。
      enrich: true,            // ★总开关
      enrichStills: true,      // 剧照（TMDB 补充）
      enrichCast: true,        // 演员（含角色 + 头像）
      enrichTrailers: true,    // 预告片（TMDB/YouTube）
      enrichSimilar: true,     // 同类推荐（TMDB）
      enrichBases: [],         // 留空=用内置默认（局域网优先，失败回落公网）
      // ── ⑫ R18（小姐姐库）· AVDB 增强 主人 2026-09-13（P1）──
      //   仅 JAV 条目生效；数据来自本地 AVDB 引擎（浏览器直连，自带 CORS）。
      javGallery: true,        // 剧照墙（AVDB 外站剧照，优先于 Emby Backdrop）
      javActorProfile: true,   // 演员资料（三围/生日/身高/别名/作品数）
      javMagnets: true,        // 磁力列表（只展示/复制，不自动下载）
      textLogo: 'auto',        // ⑩ 无徽标文字徽标 auto|always|never
      hideRealPath: true,      // ⑤ 隐藏真实路径
      headerGlassMode: 'glass' // ⑥ solid|clear|glass
    },
    // 后端依赖：全部由部署配置注入（window.VANVY_DETAIL_CONFIG），不硬编码
    metaTubeBase: '',
    avdbBase: '',
    avdbKey: '',
    imgProxyBase: '',
    bgBlur: 6,
    javLibKeys: ['有码','无码','素人','番号','MADV','FC2','无码破解','jav','JAV','成人','AV'],
    configUrl: BASE + 'config.js',
  };

  var PRESETS = {
    aurora:   { a:'#3ea6ff', b:'#7c5cff', bg:'#08080c' },
    blackgold:{ a:'#e8c66a', b:'#a8741a', bg:'#070608' },
    champagne:{ a:'#f2dfa8', b:'#c9a86a', bg:'#08070a' },
    emerald:  { a:'#10d9a3', b:'#0ea5e9', bg:'#050b0a' },
    sakura:   { a:'#ff6b9d', b:'#c86dd7', bg:'#0c070c' },
    sunset:   { a:'#ff9a3d', b:'#ff4d6d', bg:'#0c0805' },
    amber:    { a:'#ffc93c', b:'#e08e2b', bg:'#0a0805' },
    crimson:  { a:'#ff4d5e', b:'#a1213f', bg:'#0c0507' },
    violet:   { a:'#a855f7', b:'#6366f1', bg:'#08060e' },
    graphite: { a:'#cbd5e1', b:'#64748b', bg:'#0a0b0d' },
  };

  var PLAYERS = [
    { id:'pot',     n:'PotPlayer',  ico:'icon-PotPlayer.webp', os:['Windows'] },
    { id:'vlc',     n:'VLC',        ico:'icon-VLC.webp',       os:['Windows','macOS','Android','iOS'] },
    { id:'iina',    n:'IINA',       ico:'icon-IINA.webp',      os:['macOS'] },
    { id:'infuse',  n:'Infuse',     ico:'icon-infuse.webp',    os:['macOS','iOS'] },
    { id:'nplayer', n:'nPlayer',    ico:'icon-NPlayer.webp',   os:['iOS','Android'] },
    { id:'mx',      n:'MX Player',  ico:'icon-MXPlayer.webp',  os:['Android'] },
    { id:'mxpro',   n:'MX Pro',     ico:'icon-MXPlayerPro.webp', os:['Android'] },
    { id:'stellar', n:'恒星播放器',  ico:'icon-StellarPlayer.webp', os:['Windows','macOS','Android'] },
    { id:'mpv',     n:'MPV',        ico:'icon-MPV.webp',       os:['Windows','macOS','Android'] },
    { id:'ddplay',  n:'弹弹Play',    ico:'icon-DDPlay.webp',    os:['Windows','Android'] },
    { id:'fileball',n:'Fileball',   ico:'icon-Fileball.webp',  os:['macOS','iOS'] },
    { id:'senplay', n:'SenPlayer',  ico:'icon-SenPlayer.webp', os:['iOS'] },
    { id:'omni',    n:'OmniPlayer', ico:'icon-OmniPlayer.webp',os:['macOS'] },
    { id:'fig',     n:'FigPlayer',  ico:'icon-FigPlayer.webp', os:['macOS'] },
    { id:'copy',    n:'复制串流地址', ico:'icon-Copy.webp',      os:null },
  ];

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
    return { '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;', "'": '&#39;' }[c]; }); };
  var log = function () { try { console.log.apply(console, ['[VanvyDetail]'].concat([].slice.call(arguments))); } catch (e) {} };

  var state = { mountedFor: null, mounting: null, item: null, hero: null };
  var OS = (function () {
    var ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'Android';
    if (/iPad|iPhone|iPod/i.test(ua)) return 'iOS';
    if (/Macintosh|MacIntel/i.test(ua)) return 'macOS';
    return 'Windows';
  })();

  function loadConfig() {
    return new Promise(function (res) {
      if (window.VANVY_DETAIL_CONFIG) return apply(res);
      var s = document.createElement('script');
      s.src = CFG.configUrl + '?t=' + Date.now();
      s.onload = function () { apply(res); };
      s.onerror = function () { res(); };
      (document.head || document.documentElement).appendChild(s);
    });
    function apply(res) {
      try {
        var c = window.VANVY_DETAIL_CONFIG || {};
        if (c.theme) CFG.theme = c.theme;
        if (typeof c.frostBlur === 'number') CFG.frostBlur = c.frostBlur;
        if (typeof c.frostTint === 'number') CFG.frostTint = c.frostTint;
        ['hero','hideNativeTop','showPlayers','showJav','javAutoRoute','playersOnlyOS','linksCollapsed']
          .forEach(function (k) { if (typeof c[k] === 'boolean') CFG[k] = c[k]; });
        if (typeof c.maxFanart === 'number') CFG.maxFanart = c.maxFanart;
        if (typeof c.perRow === 'number') CFG.perRow = c.perRow;
        if (typeof c.javdbReviewsUrl === 'string') CFG.javdbReviewsUrl = c.javdbReviewsUrl;
        if (typeof c.metaTubeBase === 'string') CFG.metaTubeBase = c.metaTubeBase;
        if (typeof c.avdbBase === 'string') CFG.avdbBase = c.avdbBase;
        if (typeof c.avdbKey === 'string') CFG.avdbKey = c.avdbKey;
        if (typeof c.imgProxyBase === 'string') CFG.imgProxyBase = c.imgProxyBase;
        if (typeof c.bgBlur === 'number') CFG.bgBlur = c.bgBlur;
        if (c.players && c.players.length) CFG.playersAllow = c.players;
        mergeP2(c);
      } catch (e) {}
      res();
    }
  }

  // ── 二期配置合并（逐项类型校验，非法值忽略）─────────────
  function mergeP2(c) {
    if (!c || typeof c !== 'object') return;
    var B = ['sortEpisodes','castContextMenu','sectionMore','javSeriesWall','mediaInfoPanel',
             'headerGlass','inheritSeriesLogo','extSitesFull','hideRealPath'];
    B.forEach(function (k) { if (typeof c[k] === 'boolean') CFG.p2[k] = c[k]; });
    if (c.textLogo === 'auto' || c.textLogo === 'always' || c.textLogo === 'never') CFG.p2.textLogo = c.textLogo;
    if (c.headerGlassMode === 'solid' || c.headerGlassMode === 'clear' || c.headerGlassMode === 'glass')
      CFG.p2.headerGlassMode = c.headerGlassMode;
    if (c.p2 && typeof c.p2 === 'object') {
      Object.keys(c.p2).forEach(function (k) { if (c.p2[k] !== undefined) CFG.p2[k] = c.p2[k]; });
    }
  }

  function javScore(item, ctx) {
    // ── 修（主人 2026-09-13）：动漫剧集被误判成 JAV ─────────────────
    //   旧逻辑「番号正则 +2 即命中(>=2)」太宽：`Episode 094`、`Chapter 12`、
    //   `Part 03` 这类**剧集名**全部命中 [A-Za-z]{2,8}[-_ ]?\d{2,6} → 动漫库中招。
    //   现在要求：① 必须有**强信号**（MetaTube / 18+ 分级 / 库名关键字）；
    //            ② 番号只作为弱信号，且必须「名字以番号开头」或「带分隔符」；
    //            ③ Episode / Series 只有在 MetaTube 明确标记时才算 JAV。
    var strong = 0, weak = 0, why = [];
    try {
      var pid = item.ProviderIds || {};
      var t = item.Type || '';
      var isMetaTube = !!(pid.MetaTube || pid.Metatube);
      if (isMetaTube) { strong += 5; why.push('MetaTube'); }
      if (/JP-?18|18\+|R18/i.test(item.OfficialRating || '')) { strong += 4; why.push('18+分级'); }
      var ln = ((ctx && ctx.libName) || '').trim();
      if (ln && ln.length <= 40 && CFG.javLibKeys.some(function (k) { return ln.indexOf(k) >= 0; })) {
        strong += 4; why.push('库名');
      }
      // 番号（弱信号）：名字以番号开头，或番号带明确分隔符（IPX-123 / SIRO-4567）
      if (t === 'Movie') {
        var nm = item.Name || '';
        if (/^[A-Za-z]{2,8}[-_]\d{2,5}(\b|$)/.test(nm) || /\b[A-Za-z]{2,8}[-_]\d{2,5}\b/.test(nm)) {
          weak += 2; why.push('番号');
        }
      }
      var g = (item.Genres || []).join(' ');
      if (/单体作品|中出|素人|女优|片商:|无码|有码|人妻|痴女/.test(g)) { weak += 2; why.push('标签'); }
      var hit = strong >= 4;
      // 剧集/剧集库：无 MetaTube 标记一律不按 JAV 处理
      if ((t === 'Episode' || t === 'Series') && !isMetaTube) hit = false;
    } catch (e) { strong = weak = 0; }
    return { hit: hit, score: strong * 10 + weak, strong: strong, weak: weak, why: why };
  }

  function fetchItem(id) {
    var api = window.ApiClient;
    if (!api) return Promise.reject('no ApiClient');
    var uid = api.getCurrentUserId();
    return api.getJSON(api.getUrl('Users/' + uid + '/Items/' + id, {
      Fields: 'ProductionYear,CommunityRating,Overview,Genres,Studios,PremiereDate,RunTimeTicks,'
            + 'OfficialRating,ProviderIds,Path,People,Taglines,BackdropImageTags,ImageTags,'
            + 'MediaSources,MediaStreams,LocalTrailerCount,RemoteTrailers,UserData,SeriesId,SeasonId'
    }));
  }

  // ── 第三方播放器真实调用 ─────────────────────────────────────
  function getSubPath(ms) {
    try {
      var selSub = $("div[is='emby-scroller']:not(.hide) select.selectSubtitles");
      var streams = ms.MediaStreams || [];
      if (selSub && selSub.value > 0) {
        var i = streams.findIndex(function (m) { return m.Index == selSub.value && m.IsExternal; });
        if (i > -1) return '/' + ms.Id + '/Subtitles/' + streams[i].Index + '/Stream.' + streams[i].Codec;
      }
      var chi = streams.findIndex(function (m) { return m.Language === 'chi' && m.IsExternal; });
      if (chi > -1) return '/' + ms.Id + '/Subtitles/' + streams[chi].Index + '/Stream.' + streams[chi].Codec;
      var any = streams.findIndex(function (m) { return m.IsExternal; });
      if (any > -1) return '/' + ms.Id + '/Subtitles/' + streams[any].Index + '/Stream.' + streams[any].Codec;
    } catch (e) {}
    return '';
  }
  function b64(s) {
    try { return btoa(String.fromCharCode.apply(null, new Uint8Array(new TextEncoder().encode(s))))
      .replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, ''); } catch (e) { return ''; }
  }
  function seekStr(ms) {
    var p = ms * 10000, parts = [], h = p / 36e9;
    (h = Math.floor(h)) && parts.push(h);
    var m = (p -= 36e9 * h) / 6e8; p -= 6e8 * (m = Math.floor(m));
    m < 10 && h && (m = '0' + m); parts.push(m);
    var s = p / 1e7; return (s = Math.floor(s)) < 10 && (s = '0' + s), parts.push(s), parts.join(':');
  }
  function buildMediaInfo(item) {
    var api = window.ApiClient, token = api.accessToken();
    var ms = (item.MediaSources || [])[0];
    if (!ms) return null;
    var selSrc = $("div[is='emby-scroller']:not(.hide) select.selectSource:not([disabled])");
    if (selSrc && selSrc.value) { var f = (item.MediaSources || []).filter(function (x) { return x.Id == selSrc.value; })[0]; if (f) ms = f; }
    var base = (api._serverAddress || '').replace(/\/$/, '') + '/videos/' + item.Id;
    var subPath = getSubPath(ms);
    var subUrl = subPath ? base + subPath + '?api_key=' + token : '';
    var streamUrl, direct = false;
    try { direct = localStorage.getItem('vanvy-strm-direct') === '1'; } catch (e) {}
    var path = ms.Path || '';
    if (/^https?:\/\//.test(path) && direct) {
      streamUrl = decodeURIComponent(path);
    } else {
      var container = ms.Container || 'mp4';
      streamUrl = base + '/stream.' + container
        + '?api_key=' + token + '&Static=true&MediaSourceId=' + ms.Id
        + '&DeviceId=' + (api._deviceId || '');
    }
    var pos = 0; try { pos = parseInt((item.UserData || {}).PlaybackPositionTicks / 10000) || 0; } catch (e) {}
    var title = (path || item.Name || '').split(/[\\/]/).pop();
    return { streamUrl: streamUrl, subUrl: subUrl, position: pos, title: title };
  }
  function launchPlayer(pid, item) {
    var mi = buildMediaInfo(item);
    if (!mi) { toast('无法获取流地址'); return; }
    var u = encodeURI(mi.streamUrl), su = encodeURI(mi.subUrl), t = encodeURIComponent(mi.title || '');
    var pos = parseInt((item.UserData || {}).PlaybackPositionTicks / 10000) || 0;
    var seek = parseFloat((item.UserData || {}).PlaybackPositionTicks || 0) > 0 ? seekStr(pos) : '0';
    var url = '';
    switch (pid) {
      case 'pot': {
        var cur = ''; try { cur = localStorage.getItem('vanvy-pot-multi') === '1' ? '' : '/current'; } catch (e) {}
        writeClipboard('potplayer://' + u + ' /sub=' + su + ' ' + cur + ' /seek=' + seek + ' /title="' + t + '"');
        url = 'potplayer://' + cur + '/clipboard'; break;
      }
      case 'vlc':
        if (OS === 'Windows' || OS === 'macOS') url = 'vlc://' + u;
        else if (OS === 'iOS') url = 'vlc-x-callback://x-callback-url/stream?url=' + encodeURIComponent(mi.streamUrl) + '&sub=' + encodeURIComponent(mi.subUrl);
        else url = 'intent:' + u + '#Intent;package=org.videolan.vlc;type=video/*;S.subtitles_location=' + su + ';S.title=' + t + ';i.position=' + pos + ';end';
        break;
      case 'iina': url = 'iina://weblink?url=' + encodeURIComponent(mi.streamUrl) + '&new_window=1'; break;
      case 'infuse': url = 'infuse://x-callback-url/play?url=' + encodeURIComponent(mi.streamUrl) + '&sub=' + encodeURIComponent(mi.subUrl); break;
      case 'mpv': {
        var s64 = b64(mi.streamUrl);
        if (OS === 'iOS' || OS === 'Android') url = 'mpv://' + u;
        else if (OS === 'macOS') url = 'mpvplay://' + u;
        else url = 'mpv://play/' + s64 + (mi.subUrl ? '/?subfile=' + b64(mi.subUrl) : '');
        break;
      }
      case 'nplayer': url = 'nplayer-' + (OS === 'iOS' ? 'ios' : 'android') + '://' + u; break;
      case 'mx': url = 'intent:' + u + '#Intent;package=com.mxtech.videoplayer.ad;type=video/*;S.title=' + t + ';end'; break;
      case 'mxpro': url = 'intent:' + u + '#Intent;package=com.mxtech.videoplayer.pro;type=video/*;S.title=' + t + ';end'; break;
      case 'stellar': url = 'stellar://play/' + encodeURI(mi.streamUrl); break;
      case 'ddplay': url = 'ddplay://' + encodeURI(mi.streamUrl); break;
      case 'fileball': url = 'fileball://x-callback-url/play?url=' + encodeURIComponent(mi.streamUrl); break;
      case 'senplay': url = 'senplayer://x-callback-url/play?url=' + encodeURIComponent(mi.streamUrl); break;
      case 'omni': url = 'omniplayer://weblink?url=' + encodeURIComponent(mi.streamUrl); break;
      case 'fig': url = 'figplayer://weblink?url=' + encodeURIComponent(mi.streamUrl); break;
      case 'copy': writeClipboard(mi.streamUrl); toast('串流地址已复制'); return;
    }
    log('调用播放器:', pid, String(url).slice(0, 90));
    if (url) { try { window.open(url, '_self'); } catch (e) { location.href = url; } }
  }
  function writeClipboard(t) {
    try { navigator.clipboard.writeText(t); return true; }
    catch (e) {
      try { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch (e2) { return false; }
    }
  }
  function toast(msg) {
    var d = $('#vd-toast');
    if (!d) { d = document.createElement('div'); d.id = 'vd-toast'; document.body.appendChild(d); }
    d.textContent = msg; d.classList.add('on');
    clearTimeout(d._t); d._t = setTimeout(function () { d.classList.remove('on'); }, 1700);
  }

  // ── 满屏背景层（固定，全宽）─────────────────────────────────
  function ensureBg(item) {
    var api = window.ApiClient;
    var tags = item.BackdropImageTags || [];
    var url;
    if (tags.length) {
      url = api.getImageUrl(item.Id, { type: 'Backdrop', maxWidth: 1920, tag: tags[0] });
    } else if ((item.ImageTags || {}).Primary) {
      url = api.getImageUrl(item.Id, { type: 'Primary', maxWidth: 1400, tag: item.ImageTags.Primary });
    } else if ((item.ParentBackdropImageTags || []).length && item.ParentBackdropItemId) {
      // 季/集无自身背景图 → 用所属剧集的背景图（否则会拿断图当背景）
      url = api.getImageUrl(item.ParentBackdropItemId, { type: 'Backdrop', maxWidth: 1920, tag: item.ParentBackdropImageTags[0] });
    } else {
      url = '';
    }
    var bg = $('#vd-hero-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'vd-hero-bg'; bg.className = 'vd-hero-bg';
      var veil = document.createElement('div'); veil.className = 'vd-hero-veil';
      document.body.appendChild(bg); document.body.appendChild(veil);
    }
    if (url && bg._url !== url) { bg._url = url; bg.style.backgroundImage = 'url("' + url + '")'; }
    // 无任何背景图 → 用纯色渐变兜底（避免空白）
    bg.classList.toggle('vd-hero-bg-plain', !url);
    // 异步：若自身/父级都没背景图但有剧集 → 拉剧集背景图
    if (!url && item.SeriesId && !bg.__vdBgTried) {
      bg.__vdBgTried = 1;
      try {
        api.getJSON(api.getUrl('Users/' + api.getCurrentUserId() + '/Items/' + item.SeriesId, { Fields: 'BackdropImageTags' }))
          .then(function (s) {
            var st = (s && s.BackdropImageTags) || [];
            if (!st.length) return;
            var u2 = api.getImageUrl(item.SeriesId, { type: 'Backdrop', maxWidth: 1920, tag: st[0] });
            if (bg._url !== u2) { bg._url = u2; bg.style.backgroundImage = 'url("' + u2 + '")'; bg.classList.remove('vd-hero-bg-plain'); }
          }).catch(function () {});
      } catch (e) {}
    }
  }

  // ── Hero ─────────────────────────────────────────────────────
  function metaHtml(item) {
    var h = [];
    if (item.CommunityRating) h.push('<span class="vd-star">★ ' + (Math.round(item.CommunityRating * 10) / 10) + '</span>');
    if (item.ProductionYear) h.push('<span>' + item.ProductionYear + '</span>');
    var pd = (item.PremiereDate || '').slice(0, 10);
    if (pd) h.push('<span>·</span><span>' + pd + '</span>');
    var g = (item.Genres || []);
    if (g.length) h.push('<span>·</span><span>' + g.slice(0, 3).map(esc).join(' / ') + '</span>');
    var rt = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600000000) : 0;
    if (rt) h.push('<span>·</span><span>' + Math.floor(rt / 60) + 'h ' + (rt % 60) + 'm</span>');
    // 画质 chips
    try {
      var vs = ((item.MediaSources || [])[0] || {}).MediaStreams || [];
      var v0 = vs.filter(function (s) { return s.Type === 'Video'; })[0] || {};
      if (v0.Width >= 3800) h.push('<span class="vd-chip gold">4K</span>');
      if (/HDR|DOVI|HLG/i.test(v0.VideoRangeType || v0.VideoRange || '')) h.push('<span class="vd-chip gold">HDR</span>');
      else if (v0.Width >= 1900) h.push('<span class="vd-chip">1080P</span>');
    } catch (e) {}
    // 字幕 chips
    try {
      var ms0 = (item.MediaSources || [])[0] || {};
      if (((ms0.MediaStreams || []).filter(function (s) { return /chi|zh|zho/i.test(s.Language || ''); })).length)
        h.push('<span class="vd-chip">中字</span>');
    } catch (e) {}
    return h.join('');
  }

  // 首屏高度：让 hero 正好填满可视区（“当前设备…”行落在首屏底），不依赖固定顶栏高度
  //   ⚠️ resize 监听器全局只绑一次，永远作用于「当前那一张」hero；
  //     旧实现每进一个详情页绑一次（元素没了就残留），浏览几十部后 resize 会跑几十个回调。
  var _fitEl = null, _fitView = null, _fitBound = 0;
  function applyFit() {
    var el = _fitEl, view = _fitView;
    if (!el || !view || !el.isConnected) return;
    var inn = $('.vd-hero-in', el); if (!inn) return;
    var sc = $('.itemMainScrollSlider', view) || view;
    // hero 在滚动容器内的偏移（不受当前滚动位置影响）
    var off = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    // 滚动容器可见高度 = 视口高度 - 容器在视口中的顶部坐标
    var vis = window.innerHeight - sc.getBoundingClientRect().top;
    var avail = vis - off;
    if (avail < 240 || avail > window.innerHeight) avail = window.innerHeight - 80;
    inn.style.minHeight = Math.round(avail) + 'px';
  }
  function fitHero(el, view) {
    _fitEl = el; _fitView = view;
    applyFit();
    setTimeout(applyFit, 150);
    setTimeout(applyFit, 700);
    if (!_fitBound) { _fitBound = 1; window.addEventListener('resize', applyFit); }
  }

  function buildHero(view, item, jav) {
    if ($('.vd-hero', view)) return $('.vd-hero-in', view);
    var api = window.ApiClient;
    var isSeries = item.Type === 'Series' || item.Type === 'Season' || item.Type === 'Episode';
    var crumb, codeRow = '';
    if (jav) {
      crumb = '🔞 JAV · AV 影片';
      var _code = javCode(item), _src = javProvider(item);      codeRow = '<div class="vd-code">'
        + (_code ? '<b>' + esc(_code) + '</b>' : '')
        + '<span class="vd-badge">番号已识别</span>'
        + (_src ? '<span class="vd-badge dim">数据源：' + esc(_src) + '</span>'
                : '<span class="vd-badge dim">数据源：本地库</span>')
        + (item.OfficialRating ? '<span class="vd-badge dim">' + esc(item.OfficialRating) + '</span>' : '')
        + '</div>';
    } else {
      // 单集：直接标出「第几季·第几集」（无图集页也能一眼知道是哪一集）
      var _se = seLabel(item);
      crumb = (isSeries ? '剧集 · SERIES' : '电影 · MOVIE') + (item.OfficialRating ? '  ·  ' + esc(item.OfficialRating) : '');
      if (_se) crumb = '剧集 · ' + _se + (item.OfficialRating ? '  ·  ' + esc(item.OfficialRating) : '');
    }
    var poster = api.getImageUrl(item.Id, { type: 'Primary', maxWidth: 560, tag: (item.ImageTags || {}).Primary });
    var logoTag = (item.ImageTags || {}).Logo;
    // ⑦⑩ LOGO 优先级链：自身 Logo → （单集）剧集 Logo → 文字徽标
    //   先占位，插入 DOM 后再异步补全（剧集 Logo 需请求）
    var logoHtml = '<div class="vd-logo" data-vdlogo="1">'
      + (logoTag ? '<img src="' + esc(api.getImageUrl(item.Id, { type: 'Logo', maxWidth: 900, tag: logoTag })) + '" alt="">' : '')
      + '</div>';

    var el = document.createElement('section');
    el.className = 'vd-hero';
    // 无封面图（季/集常见）→ 隐藏海报容器，改用「方案 B」全宽排版
    if (!(item.ImageTags || {}).Primary) el.classList.add('vd-noposter');
    el.innerHTML =
      '<div class="vd-hero-in">'
      + '<div class="vd-top">'
      +   '<div class="vd-poster"><img src="' + esc(poster) + '" alt=""></div>'
      +   '<div class="vd-info">'
      +     logoHtml
      +     '<div class="vd-crumb"><span class="vd-crumb-t">' + crumb + '</span>'
      +       '<span class="vd-title-chip">' + esc(item.Name || '') + '</span></div>'
      +     codeRow
      +     '<div class="vd-meta">' + metaHtml(item) + '</div>'
      +     (item.Overview ? '<div class="vd-syn-wrap"><p class="vd-syn">' + esc(item.Overview) + '</p>'
              + (String(item.Overview).length > 88 ? '<span class="vd-syn-more" data-a="syn">阅读全文</span>' : '')
              + '</div>' : '')
      +     '<div class="vd-cta">'
      +       '<span class="vd-btn vd-play" data-a="play">▶&nbsp; <i class="vd-play-txt">' + (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'Episode' ? '播放' : '立即播放') + '</i></span>'
      +       '<span class="vd-btn vd-ghost" data-a="fav">♥&nbsp; ' + ((item.UserData || {}).IsFavorite ? '已收藏' : '收藏') + '</span>'
      +       '<span class="vd-btn vd-ghost" data-a="watched">✓&nbsp; ' + ((item.UserData || {}).Played ? '已看' : '标记已看') + '</span>'      +       '<span class="vd-btn vd-ghost" data-a="more">ⓘ&nbsp; 更多</span>'
      +       '<span class="vd-btn vd-ghost vd-btn-ic" data-a="editimg" title="更换海报/背景图">🖼&nbsp; 换图</span>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="vd-hero-extra"></div>'
      + '</div>';
    // 插到滚动容器最前
    var scroller = $('.itemMainScrollSlider', view) || view;
    scroller.insertBefore(el, scroller.firstChild);
    fitHero(el, view);

    // 隐藏原生顶部字段流（用 hero 替代）
    if (CFG.hideNativeTop) {
      var nat = $('.topDetailsContainer', view);
      if (nat) nat.classList.add('vd-native-top-hidden');
    }

    // CTA 绑定
    el.addEventListener('click', function (e) {
      // 「阅读全文」不是 .vd-btn，单独提前处理
      var sm = e.target.closest('.vd-syn-more');
      if (sm) { e.stopPropagation(); openSynModal(item); return; }
      var b = e.target.closest('.vd-btn'); if (!b) return;
      var a = b.dataset.a;
      if (a === 'play') vdPlay(view, item);
      else if (a === 'more') openMoreMenu(view, item, b);
      else if (a === 'editimg') openImageEditor(item);
      else if (a === 'watched') {
        // 标记已看/未看：先确认状态已翻转，再回写按钮文案（否则点了没反馈）
        forward(view, ['.btnPlaystate']);
        setTimeout(function () { syncWatched(view, item); }, 700);
        setTimeout(function () { syncWatched(view, item); }, 1600);
      }
      else if (a === 'syn') { openSynModal(item); }
      else if (a === 'fav') {
        toggleFavorite(item, b);
      }
    });

    var extra = $('.vd-hero-extra', el);
    if (CFG.showPlayers) injectPlayers(extra, item);
    // ⑦⑩ 异步补全 LOGO（剧集 Logo / 文字徽标）
    try { resolveHeroLogo(el, item); } catch (e) { log('LOGO 补全失败', e && e.message); }
    markReady(view);
    releaseBoot();
    return extra;
  }

  // ── ⑦⑩ LOGO 优先级链：自身 Logo → （单集）剧集 Logo → 文字徽标 ──
  function heroTextLogoHtml(name, sub) {
    var main = String(name || '').trim();
    if (!main) return '';
    var s = String(sub || '').trim();
    return '<div class="vd-textlogo" title="' + esc(main) + '">' + esc(main) + '</div>'
      + (s && s.toLowerCase() !== main.toLowerCase()
          ? '<div class="vd-textlogo sm">' + esc(s) + '</div>' : '');
  }
  function applyTextLogo(box, item, seriesName) {
    var mode = CFG.p2.textLogo;
    if (mode === 'never') { box.innerHTML = ''; return; }
    // 单集：主文字用「剧集名」（用户才知道是哪部剧），副行放本集名
    var main = item.Name || '';
    var sub = item.OriginalTitle || '';
    var isEp = isEpisodeLike(item);
    if (isEp && (seriesName || item.SeriesName)) {
      sub = item.Name || '';
      main = seriesName || item.SeriesName;
    }
    if (sub && sub.toLowerCase() === String(main).toLowerCase()) sub = '';
    box.innerHTML = heroTextLogoHtml(main, sub);
    box.classList.add('vd-logo-text');
    var txt = $('.vd-textlogo', box);
    if (txt) txt.classList.add('vd-textlogo-anim');
    if (isEp && (seriesName || item.SeriesName)) {
      var from = document.createElement('div');
      from.className = 'vd-logo-from';
      from.innerHTML = '来自剧集 <b>' + esc(seriesName || item.SeriesName) + '</b>'
        + (seLabel(item) ? ' · ' + esc(seLabel(item)) : '')
        + (item.ParentIndexNumber != null ? '' : '');
      box.appendChild(from);
    }
  }
  function isEpisodeLike(item) {
    if (!item) return false;
    if (item.Type === 'Episode') return true;
    return !!item.SeriesId && item.Type !== 'Series' && item.Type !== 'Movie';
  }
  // 单集标记：S01E286（缺字段时尽量退化显示）
  function seLabel(item) {
    if (!item || item.Type !== 'Episode') return '';
    var s = item.ParentIndexNumber, e = item.IndexNumber;
    if (s == null && e == null) return '';
    var p = [];
    if (s != null) p.push('S' + String(s).padStart(2, '0'));
    if (e != null) p.push('E' + String(e).padStart(2, '0'));
    return p.join('');
  }
  function resolveHeroLogo(el, item) {
    if (!CFG.hero) return;
    var box = $('.vd-logo[data-vdlogo]', el);
    if (!box) return;
    var api = window.ApiClient;
    var mode = CFG.p2.textLogo;

    // ① 自身 Logo（buildHero 已渲染）
    var self = box.querySelector('img');
    if (self) {
      if (mode !== 'always') return;                      // 正常情况：保持图片
      if (self.complete && self.naturalWidth > 0) return; // 图片有效，不换
      // always 模式且图片破了 → 继续走文字
      self.remove();
    }

    // ② 单集 → 继承所属剧集 Logo
    var isEp = isEpisodeLike(item);
    if (isEp && item.SeriesId && CFG.p2.inheritSeriesLogo && mode !== 'always') {
      api.getJSON(api.getUrl('Users/' + api.getCurrentUserId() + '/Items/' + item.SeriesId,
        { Fields: 'ImageTags' })).then(function (s) {
        var stag = (s && s.ImageTags || {}).Logo;
        var sname = (s && s.Name) || item.SeriesName || '';
        if (stag) {
          box.classList.remove('vd-logo-text');
          box.innerHTML = '<img src="' + esc(api.getImageUrl(item.SeriesId,
            { type: 'Logo', maxWidth: 900, tag: stag })) + '" alt="">'
            + '<div class="vd-logo-from">来自剧集 <b>' + esc(sname) + '</b>'
              + (seLabel(item) ? ' · ' + esc(seLabel(item)) : '') + '</div>';
          return;
        }
        applyTextLogo(box, item, sname);
      }).catch(function () { applyTextLogo(box, item, item.SeriesName || ''); });
      return;
    }

    // ③ 文字徽标
    applyTextLogo(box, item, item.SeriesName || '');
  }

  // 解除开机遮罩（避免原生页面闪现）
  var _bootReleased = false;
  function releaseBoot() {
    if (_bootReleased) return; _bootReleased = true;
    var rm = function () { document.documentElement.classList.remove('vd-boot'); };
    requestAnimationFrame(function () { requestAnimationFrame(rm); });
    setTimeout(rm, 400);
  }

  // ── 防闪烁（FOUC）：在 Emby 渲染前先遮住，hero 就绪后淡入 ──
  //    ⚠️ 不能用 MutationObserver 监听整个 body（Emby DOM 变动频繁 → 观察风暴 → 主线程卡死）
  var _lastPre = null;
  function isItemRoute() {
    var h = location.hash || '';
    return h.indexOf('item') >= 0 || h.indexOf('/details') >= 0;
  }
  function ensurePre(v) {
    if (!v) return;
    try { v.classList.add('vd-pre'); } catch (e) { return; }
    try { clearTimeout(v.__vdPreT); } catch (e) {}
    v.__vdPreT = setTimeout(function () { try { v.classList.remove('vd-pre'); } catch (e) {} }, 2600);
  }
  function markReady(v) {
    if (!v) return;
    v.__vdReady = 1;
    try { clearTimeout(v.__vdPreT); } catch (e) {}
    try { v.classList.remove('vd-pre'); } catch (e) {}
    try { v.classList.add('vd-ready'); } catch (e) {}
  }
  // 路由即将切换：立即回到未就绪态（body 已带 vanvy-detail-active → CSS 立即遮蔽原生块）
  function preArm() {
    var v = document.querySelector('.itemView');
    if (!v) return;
    if (isItemRoute()) {
      try { document.body.classList.add('vanvy-detail-active'); } catch (e) {}
      v.__vdReady = 0;
      try { v.classList.remove('vd-ready'); } catch (e) {}
      ensurePre(v);
      // 尽早重建 hero，缩短空白/延迟
      setTimeout(function () { try { tick(); } catch (e) {} }, 40);
      setTimeout(function () { try { tick(); } catch (e) {} }, 320);
    } else markReady(v);
  }
  function watchViews() {
    // ① 拦截程序化跳转（首页按钮/推荐卡片等都走 Emby.Page.show / showItem）
    try {
      if (window.Emby && Emby.Page && !Emby.Page.__vdPatched) {
        Emby.Page.__vdPatched = 1;
        ['show', 'showItem'].forEach(function (fn) {
          var orig = Emby.Page[fn];
          if (typeof orig !== 'function') return;
          Emby.Page[fn] = function () { try { preArm(); } catch (e) {} return orig.apply(this, arguments); };
        });
      }
    } catch (e) {}
    // ② hash/历史变化（浏览器后退/直接改 hash）
    window.addEventListener('hashchange', preArm, true);
    try { window.addEventListener('popstate', preArm, true); } catch (e) {}
    // ③ 轻量轮询：仅在未就绪时干活（无观察器，开销极低；兼做失败兜底）
    setInterval(function () {
      var v = document.querySelector('.itemView');
      if (!v) return;
      if (!isItemRoute()) { if (v.__vdReady !== 1) markReady(v); return; }
      // 条目变了（含程序化跳转）→ 立刻撤掉门控，先遮住原生内容
      var id = '';
      try { id = currentItemId() || ''; } catch (e) {}
      if (id && id !== state.mountedFor && v.__vdReady === 1) {
        v.__vdReady = 0;
        try { v.classList.remove('vd-ready'); } catch (e) {}
        ensurePre(v);
      }
      if (v.classList.contains('hide')) return;
      if (v.__vdReady === 1) return;
      if (v.querySelector('.vd-hero, .vd-injected')) { try { clearTimeout(v.__vdFailsafe); } catch (e) {} markReady(v); return; }
      ensurePre(v);
      // 兜底：超过 2.6s 仍未美化（如接口失败）也要放行，避免页面一直空白
      if (!v.__vdFailsafe) {
        v.__vdFailsafe = setTimeout(function () { markReady(v); }, 2600);
      }
    }, 180);
  }

  // 打开 Emby 原生图片编辑器（更换海报/背景）
  function openImageEditor(item) {
    var srv = (item && item.ServerId) || (window.ApiClient && window.ApiClient.serverId && window.ApiClient.serverId()) || '';
    var call = function (m) {
      var d = m && (m.default || m);
      if (d && d.show) { try { d.show({ itemId: item.Id, serverId: srv }); } catch (e) { toast('打开图片编辑器失败'); } }
      else toast('图片编辑器不可用');
    };
    try {
      if (window.Emby && Emby.importModule) { Emby.importModule('./modules/imageeditor/imageeditor.js').then(call).catch(function () { toast('图片编辑器不可用'); }); return; }
      var req = window.require || window.requirejs;
      if (req) { req(['modules/imageeditor/imageeditor'], call, function () { toast('图片编辑器不可用'); }); return; }
    } catch (e) {}
    toast('图片编辑器不可用');
  }
  // 更多菜单：用 Emby 原生 itemcontextmenu，锚定到我们的按钮（修复“弹框跑到左上角”）
  function openMoreMenu(view, item, anchor) {
    var api = window.ApiClient;
    var fallback = function () { forward(view, ['.btnMoreCommands']); };
    if (!api || !api.getCurrentUser) { fallback(); return; }
    var loadModule = function () {
      if (window.Emby && Emby.importModule) return Emby.importModule('./modules/itemcontextmenu.js');
      var req = window.require || window.requirejs;
      if (!req) return Promise.reject('no module loader');
      return new Promise(function (res, rej) { req(['itemcontextmenu'], res, rej); });
    };
    api.getCurrentUser().then(function (user) {
      loadModule().then(function (m) {
        var icm = (m && (m.default || m)) || null;
        if (!icm || !icm.show) { fallback(); return; }
        try {
          icm.show({
            items: [item], positionTo: anchor, positionY: 'center', positionX: 'after',
            transformOrigin: 'left top', open: false, play: false, playFromBeginning: true,
            playAllFromHere: false, cancelTimer: false, record: false, deleteItem: true,
            shuffle: true, instantMix: true, user: user, share: true, mediaSourceId: null,
            navigateOnDelete: 'back', showSeries: false, showSeason: true,
            createRecording: false, edit: true, editImages: true, favorites: true
          });
        } catch (e) { fallback(); }
      }).catch(function () { fallback(); });
    }).catch(fallback);
  }

  // ── 播放按钮：解析「该播哪一集」────────────────────────────
  //  主人实测反馈：季/剧集页的播放键播了首集，而期望播「当前集」（续看）。
  //  规则：单集→本集；季/剧→有继续观看目标就播它，否则播首集。
  function vdIsEpLike(it) { return !!it && (it.Type === 'Episode' || it.Type === 'Season' || it.Type === 'Series'); }
  function vdPlayTarget(item) {
    var api = window.ApiClient;
    if (!api || !item) return Promise.resolve(null);
    if (item.Type === 'Episode') return Promise.resolve(item);          // 单集：播自己
    var seriesId = item.Type === 'Series' ? item.Id : item.SeriesId;
    if (!seriesId) return Promise.resolve(null);
    var uid = api.getCurrentUserId();
    // ① 季页：在本季自己的集列表里找「当前集」（进行中 → 未看 → 第一集）
    if (item.Type === 'Season') {
      return vdSeasonTarget(api, uid, item, seriesId).then(function (t) {
        if (t) return t;
        // 退路：系列级续看 → 本剧第一集
        return api.getJSON(api.getUrl('Shows/NextUp', { UserId: uid, SeriesId: seriesId, Limit: 1 }))
          .then(function (d) { return ((d && d.Items) || [])[0] || vdFirstEpisode(api, uid, item, seriesId); })
          .catch(function () { return null; });
      });
    }
    // ② 剧集页：续看目标 → 本剧第一集
    return api.getJSON(api.getUrl('Shows/NextUp', { UserId: uid, SeriesId: seriesId, Limit: 1 }))
      .then(function (d) { return ((d && d.Items) || [])[0] || vdFirstEpisode(api, uid, item, seriesId); })
      .catch(function () { return null; });
  }
  // 季页「当前集」：本季剧集（升序）中 ①进行中 ②首个未看 ③第一集
  function vdSeasonTarget(api, uid, item, seriesId) {
    var q = { UserId: uid, SeasonId: item.Id, Limit: 500, Fields: 'UserData,IndexNumber,ParentIndexNumber,SeasonId',
              SortBy: 'IndexNumber', SortOrder: 'Ascending' };
    return api.getJSON(api.getUrl('Shows/' + seriesId + '/Episodes', q)).then(function (d) {
      var list = (d && d.Items) || [];
      if (!list.length) return null;
      var inProg = list.filter(function (e) { var u = e.UserData || {}; return (u.PlaybackPositionTicks || 0) > 0 && !u.Played; });
      if (inProg[0]) return inProg[0];
      var next = list.filter(function (e) { return !(e.UserData || {}).Played; });
      if (next[0]) return next[0];
      return list[0];
    }).catch(function () { return null; });
  }
  // 取「本季/本剧第一集」：先用季 id 查，空则退用季号过滤
  function vdFirstEpisode(api, uid, item, seriesId) {
    var base = { UserId: uid, Limit: 40, Fields: 'IndexNumber,ParentIndexNumber', SortBy: 'IndexNumber', SortOrder: 'Ascending', IncludeItemTypes: 'Episode' };
    var q1 = Object.assign({}, base); if (item.Type === 'Season') q1.SeasonId = item.Id;
    return api.getJSON(api.getUrl('Shows/' + seriesId + '/Episodes', q1)).then(function (d) {
      var it = (d && d.Items) || [];
      if (it[0]) return it[0];
      // 退路：全剧集列表里按季号过滤
      return api.getJSON(api.getUrl('Shows/' + seriesId + '/Episodes', base)).then(function (d2) {
        var all = (d2 && d2.Items) || [];
        if (item.Type === 'Season') all = all.filter(function (x) { return x.ParentIndexNumber === item.IndexNumber; });
        return all[0] || null;
      });
    }).catch(function () { return null; });
  }
  // 播放键文案：续看→「继续观看」；否则「播放」；电影/其它→「立即播放」
  function vdPlayLabel(item, target) {
    if (!item) return '立即播放';
    if (item.Type === 'Episode') return '立即播放';
    if (item.Type !== 'Series' && item.Type !== 'Season') return '立即播放';
    var n = target && target.IndexNumber;
    var sn = target && target.ParentIndexNumber;
    if (n != null && ((sn != null && sn > 1) || n > 1)) return '继续观看';
    return '播放';
  }
  function vdSetPlayLabel(view, item, target) {
    var t = $('.vd-play-txt', view); if (t) t.textContent = vdPlayLabel(item, target);
  }
  function vdPlay(view, item) {
    var fallback = function () { forward(view, ['.btnResume', '.btnPlay']); };
    if (!vdIsEpLike(item)) { fallback(); return; }        // 电影/其它 → 原生
    vdPlayTarget(item).then(function (t) {
      if (!t) { fallback(); return; }
      var rq = window.require || window.requirejs;
      if (!rq) { fallback(); return; }
      rq(['playbackManager'], function (pm) {
        try { pm.play({ items: [t] }); } catch (e) { fallback(); }
      }, function () { fallback(); });
    });
  }

  function forward(view, selectors) {    for (var i = 0; i < selectors.length; i++) {
      var b = $(selectors[i], view);
      if (b && !b.classList.contains('hide')) { try { b.click(); } catch (e) {} return true; }
    }
    // 兜底：即使 hide 也点第一个
    for (var j = 0; j < selectors.length; j++) { var c = $(selectors[j], view); if (c) { try { c.click(); } catch (e) {} return true; } }
    return false;
  }
  function refreshCta(view, item) {
    try {
      fetchItem(item.Id).then(function (it) { item.UserData = it.UserData; paintWatched(view, item); }).catch(function () {});
      // 同步播放键文案（续看→「继续观看」）
      if (vdIsEpLike(item)) vdPlayTarget(item).then(function (t) { vdSetPlayLabel(view, item, t); }).catch(function () {});
    } catch (e) {}
  }
  // 把「已看/未看」状态回写到 hero 按钮（点击后要有反馈）
  //  原生按钮已改服务端状态 → 重新拉一次 UserData 再回写（不能只看本地 item，会滞后）
  function syncWatched(view, item) {
    if (!item || !item.Id) return;
    fetchItem(item.Id).then(function (it) {
      if (it && it.UserData) item.UserData = it.UserData;
      paintWatched(view, item);
    }).catch(function () { paintWatched(view, item); });
  }
  function paintWatched(view, item) {
    var b = $('.vd-btn[data-a="watched"]', view) || $('[data-a="watched"]', view);
    if (!b) return;
    var played = !!((item.UserData || {}).Played);
    b.innerHTML = played ? '✓&nbsp; 已看' : '✓&nbsp; 标记已看';
    b.classList.toggle('on', played);
    b.title = played ? '点击取消已看' : '点击标记为已看';
  }

  // ── 注入：播放器 ─────────────────────────────────────────────
  function injectPlayers(host, item) {
    if (!CFG.showPlayers || $('.vd-players', host)) return;
    var tools = [
      ['onlyOS','仅显示本机可用', CFG.playersOnlyOS],
      ['iconOnly','图标模式', false],
      ['multiPot','多开 PotPlayer', false],
      ['strm','STRM 直通', false],
      ['seek','断点续播', true],
    ];
    var w = document.createElement('div');
    w.className = 'vd-players'; 
    w.innerHTML =
      '<div class="vd-sec-label">第三方播放器 · 直接串流</div>'
      + '<div class="vd-ptool">' + tools.map(function (t) {
          return '<span class="vd-tk' + (t[2] ? ' on' : '') + '" data-k="' + t[0] + '"><i class="vd-d"></i>' + t[1] + '</span>';
        }).join('') + '</div>'
      + '<div class="vd-prow"></div>'
      + '<div class="vd-pnote">当前设备：<b>' + OS + '</b> · 上次使用 <b class="vd-lastname">—</b> <span class="vd-hint">点击 logo 直接调用</span></div>';
    host.appendChild(w);

    var T = {
      onlyOS: lsGet('vanvy-p-onlyos', CFG.playersOnlyOS),
      iconOnly: lsGet('vanvy-p-icononly', false),
      multiPot: lsGet('vanvy-p-multipot', false),
      strm: lsGet('vanvy-p-strm', lsGet('vanvy-strm-direct', false)),
      seek: lsGet('vanvy-p-seek', true),
    };
    // 回填开关状态
    $$('.vd-tk', w).forEach(function (tk) { tk.classList.toggle('on', !!T[tk.dataset.k]); });
    function lsGet(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v === '1'; } catch (e) { return def; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} }
    function lastId() { try { return localStorage.getItem('vanvy-last-player') || ''; } catch (e) { return ''; } }
    function render() {
      var prow = $('.vd-prow', w), last = lastId();
      prow.classList.toggle('icononly', !!T.iconOnly);
      prow.innerHTML = PLAYERS.filter(function (p) { return !(T.onlyOS && p.os && p.os.indexOf(OS) < 0); })
        .map(function (p) {
          return '<span class="vd-pbtn' + (p.id === last ? ' on' : '') + '" data-p="' + p.id + '" title="' + esc(p.n) + '">'
            + (p.id === last ? '<span class="vd-lastb">上次</span>' : '')
            + '<span class="vd-ico" style="background-image:url(' + BASE + 'icons/' + p.ico + ')"></span>'
            + '<span class="vd-nm">' + esc(p.n) + '</span></span>';
        }).join('');
      var ln = (PLAYERS.filter(function (p) { return p.id === last; })[0] || {}).n || '未记录';
      $('.vd-lastname', w).textContent = ln;
    }
    $('.vd-ptool', w).addEventListener('click', function (e) {
      var tk = e.target.closest('.vd-tk'); if (!tk) return;
      var k = tk.dataset.k; T[k] = !T[k]; tk.classList.toggle('on', !!T[k]);
      // 所有开关选项均持久化（下次打开自动恢复）
      var KEY = { onlyOS: 'vanvy-p-onlyos', iconOnly: 'vanvy-p-icononly', multiPot: 'vanvy-p-multipot', strm: 'vanvy-p-strm', seek: 'vanvy-p-seek' };
      if (KEY[k]) lsSet(KEY[k], T[k]);
      if (k === 'multiPot') lsSet('vanvy-pot-multi', T[k]);
      if (k === 'strm') lsSet('vanvy-strm-direct', T[k]);
      if (k === 'onlyOS' || k === 'iconOnly') render();
      else toast(tk.textContent.trim() + (T[k] ? ' 已开启' : ' 已关闭'));
    });
    $('.vd-prow', w).addEventListener('click', function (e) {
      var b = e.target.closest('.vd-pbtn'); if (!b) return;
      var pid = b.dataset.p;
      try { localStorage.setItem('vanvy-last-player', pid); } catch (er) {}
      render(); launchPlayer(pid, item);
    });
    render();
  }

  // ── JAV 外链 + 卡片 ──────────────────────────────────────────
  //  ⑧ 全站平铺：不再按 无码/VR/普通 三分支只显示几个
  //  站点表单一配置（REL 字段：1=可靠 2=存疑→置灰）
  var JAV_SITES = [
    { t:'javdb',        c:'#ff8fb1', rel:1, u:function(x){ return 'https://javdb.com/search?q='+x.q+'&f=all'; } },
    { t:'javbus',       c:'#ff6b6b', rel:1, u:function(x){ return 'https://www.javbus.com/'+x.code; } },
    { t:'javlibrary',   c:'#bf60a6', rel:1, u:function(x){ return 'https://www.javlibrary.com/cn/vl_searchbyid.php?keyword='+x.code; } },
    { t:'missav',       c:'#ee98d7', rel:1, u:function(x){ return 'https://missav.ws/cn/search/'+x.code; } },
    { t:'7mmtv',        c:'#e17dbe', rel:1, u:function(x){ return 'https://7mmtv.sx/zh/searchform_search/all/index.html?search_keyword='+x.code+'&search_type=searchall&op=search'; } },
    { t:'dmm',          c:'#ff6b6b', rel:1, u:function(x){ return 'https://www.dmm.co.jp/mono/-/search/=/searchstr='+x.lower+'/'; } },
    { t:'dmm-vr',       c:'#ff6b6b', rel:1, only:function(x){ return x.isVr; }, u:function(x){ return 'https://www.dmm.co.jp/digital/videoa/-/list/search/=/device=vr/?searchstr='+x.lower; } },
    { t:'mgstage',      c:'#ff6b6b', rel:1, only:function(x){ return x.noNum!==x.code; }, u:function(x){ return 'https://www.mgstage.com/search/cSearch.php?search_word='+x.code; } },
    { t:'tokyo-hot',    c:'#ff6b6b', rel:1, only:function(x){ return /^n\d{4}$/.test(x.lower); }, u:function(x){ return 'https://my.tokyo-hot.com/product/?q='+x.lower+'&x=0&y=0'; } },
    { t:'caribbean',    c:'#4caf50', rel:1, only:function(x){ return /^\d+-\d+$/.test(x.code); }, u:function(x){ return 'https://www.caribbeancom.com/moviepages/'+x.lower+'/index.html'; } },
    { t:'1pondo',       c:'#e65fa7', rel:1, only:function(x){ return /^\d+_\d+$/.test(x.code); }, u:function(x){ return 'https://www.1pondo.tv/movies/'+x.lower+'/'; } },
    { t:'heyzo',        c:'#ff8fb1', rel:1, only:function(x){ return x.lower.indexOf('heyzo')>=0; }, u:function(x){ return 'https://www.heyzo.com/moviepages/'+x.code.split('-').pop()+'/index.html'; } },
    { t:'jvr library',  c:'#e8e086', rel:1, only:function(x){ return x.isVr; }, u:function(x){ return 'https://jvrlibrary.com/jvr?id='+x.code; } },
    { t:'tktube',       c:'#8ab4f8', rel:1, u:function(x){ return 'https://tktube.com/search/'+x.noNum+'/'; } },
    { t:'javsubtitle',  c:'#ffbf36', rel:1, u:function(x){ return 'https://javsubtitle.com/?s='+x.noNum; } },
    { t:'javtrailers',  c:'#ff6b6b', rel:1, u:function(x){ return 'https://javtrailers.com/search/'+x.noNum; } },
    { t:'subtitlecat',  c:'#ffbf36', rel:1, u:function(x){ return 'https://www.subtitlecat.com/index.php?search='+x.noNum; } },
    { t:'aventertainments', c:'#8a90a0', rel:2, only:function(x){ return x.isUncensored; }, u:function(x){ return 'https://www.aventertainments.com/ppv/search?lang=2&keyword='+x.code; } },
    { t:'番号库',        c:'#ADD8E6', rel:2, only:function(x){ return x.letter && !/\d/.test(x.letter); }, u:function(x){ return 'https://javdb.com/video_codes/'+(x.letter||''); } }
  ];
  function buildJavLinks(item, code) {
    var lower = (code || '').toLowerCase();
    var noNum = (code || '').replace(/^\d+(?=[A-Za-z])/, '');
    var g = (item.Genres || []).join(' ');
    var ctx = {
      code: code, lower: lower, noNum: noNum, letter: (code || '').split('-')[0] || '',
      isVr: /VR/i.test(g), isUncensored: /无码/.test(g)
    };
    var L = [];
    JAV_SITES.forEach(function (s) {
      if (s.only && !s.only(ctx)) return;
      try { L.push({ t: s.t, c: s.c, u: s.u(ctx), rel: s.rel }); } catch (e) {}
    });
    // ⑧ 非全量模式：保持旧行为（只留一部分），兼容回退
    if (!CFG.p2.extSitesFull) {
      L = L.filter(function (x) { return ['javdb','javbus','javlibrary','missav','dmm'].indexOf(x.t) >= 0; });
    }
    return L;
  }
  // ── ④ JAV 同系列影片墙（数据来自 AVDB 影片详情的 relative_movies）──
  //  零额外请求（详情接口已含），名称映射复用演员那套思路（系列名简/繁/日文差异）
  async function injectJavSeriesWall(view, item) {
    if (!CFG.p2.javSeriesWall || !CFG.showJav) return;
    if ($('.vd-jser-section', view)) return;
    if (view.__vdJserTried) return;
    view.__vdJserTried = 1;
    var code = javCode(item);
    if (!code || !CFG.avdbBase || !CFG.avdbKey) return;
    var mid = await javdbMovieId(code);
    if (!mid) return;
    var d = await avdbFetch('/api/v1/javdb/movies/' + encodeURIComponent(mid));
    var mv = d && d.data && d.data.movie;
    if (!mv) return;
    var rel = (mv.relative_movies || []).slice(0, 18);
    var series = mv.series || {};
    if (!rel.length && !series.id) return;
    var sname = series.name_zht || series.name || mv.series_name || '';

    var sec = document.createElement('section');
    sec.className = 'vd-jser-section vd-injected-section';
    var cards = rel.map(function (m) {
      var u = imgProxy(m.cover_url || m.thumb_url || '');
      var num = m.number || '';
      return '<span class="vd-pcard vd-jcard" data-num="' + esc(num) + '" data-jid="' + esc(m.id || '') + '">'
        + (u ? '<img src="' + esc(u) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '<img alt="">')
        + '<i>' + esc(num) + '</i></span>';
    }).join('');
    var javdbSeries = series.id ? ('https://javdb.com/series/' + encodeURIComponent(series.id)) : '';
    sec.innerHTML = '<h2 class="vd-h2">' + (sname ? esc(sname) : '同系列作品') + ' <span>JavDB 同系列</span>'
      + (javdbSeries ? '<span class="vd-h2-more" data-a="jserall">查看更多 ›</span>' : '') + '</h2>'
      + '<div class="vd-strip">' + (cards || '<div class="vd-aworks-empty">同系列暂无更多影片</div>') + '</div>'
      + '<div class="vd-jser-tip">数据来源：JavDB 推荐（按同系列/相近关联）' + (sname ? ' · 系列「' + esc(sname) + '」' : '') + '</div>';
    insertSection(view, sec);
    var more = $('.vd-h2-more', sec);
    if (more && javdbSeries) more.addEventListener('click', function () { window.open(javdbSeries, '_blank', 'noopener'); });
  }

  // ── ⑪ 第三方资料增强（正经库 · TMDB）主人 2026-09-13 ─────────
  //   为什么单独一个容器：剧照/演员/预告/同类 这四块由本容器统一输出
  //   （带来源徽标），并让 injectSections 跳过独立的同名区块，避免重复。
  //   失败即返回 false → 走原有区块（零副作用降级）。
  // ── ⑫ R18 · AVDB 增强（主人 2026-09-13 · P1）───────────────────
  //   剧照墙 / 演员资料。仅 jav 条目；全部走本地 AVDB（浏览器可直连，自带 CORS）。
  //   任何失败 → 静默不影响既有 JAV 卡与 Emby 原生区块。
  function avdbImgUrl(p) {
    // AVDB 的图床端点需要鉴权；<img> 无法带请求头 → 用 api_key 查询参数
    //   （该 key 本就随 config.js 下发到浏览器，非新增暴露面）
    var b = avdbBase();
    if (!b || !p) return '';
    return b + p + (p.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(CFG.avdbKey || '');
  }
  var _javGalleryCache = {};
  async function fetchJavGallery(code) {
    if (!code) return [];
    if (_javGalleryCache[code] !== undefined) return _javGalleryCache[code];
    var d = await avdbFetch('/api/v1/articles/javdb-gallery?number=' + encodeURIComponent(code));
    var arr = (d && d.data && d.data.images) || [];
    _javGalleryCache[code] = arr;
    return arr;
  }
  // 剧照墙：JAV 条目用 AVDB 外站剧照（含 AVDB 的编号/顺序），否则退回 Emby Backdrop
  // ── 剧照：多源合并（本地 + 第三方）主人 2026-09-13 ───────────────
  //   旧做法是「二选一」（有第三方就盖掉本地），导致用户看不到自己的本地剧照。
  //   现改为**顺序合并**：本地在前（不加标记），第三方在后（逐张打来源标记），
  //   同一个「剧照」容器里一起展示；标题显示各来源数量。
  async function collectLocalStills(api, item) {
    var out = [];
    try {
      var tags = item.BackdropImageTags || [];
      if (tags.length) {
        var infos = null;
        try { infos = await api.getItemImageInfos(item.Id); } catch (e) {}
        var bds = (infos || []).filter(function (x) { return x.ImageType === 'Backdrop'; });
        if (!bds.length) {                       // 拿不到 infos → 用 tags 顺序兜底
          bds = tags.map(function (t, i) { return { ImageType: 'Backdrop', ImageIndex: i }; });
        }
        bds.slice(0, CFG.maxFanart || 24).forEach(function (b) {
          var idx = (b.ImageIndex == null) ? 0 : b.ImageIndex;
          out.push(api.getImageUrl(item.Id, {
            type: 'Backdrop', index: idx, tag: tags[idx], maxWidth: 900
          }));
        });
      }
      // 竖版缩略图也算本地剧照（很多条目只有 Thumb）
      if (item.ImageTags && item.ImageTags.Thumb) {
        out.push(api.getImageUrl(item.Id, { type: 'Thumb', tag: item.ImageTags.Thumb, maxWidth: 900 }));
      }
    } catch (e) { log('本地剧照失败', e && e.message); }
    return out;
  }
  async function injectStills(view, item, jav) {
    if (!CFG.p2 || CFG.p2.enrichStills === false) return false;
    if ($('.vd-stills-section', view)) return true;
    if (view.__vdStillsTried === item.Id) return !!view.__vdStillsOk;
    view.__vdStillsTried = item.Id;
    var api = window.ApiClient;

    var local = await collectLocalStills(api, item);
    var ext = [];                                 // {u, src}
    if (jav) {
      var code = javCode(item);
      if (code && avdbBases().length && CFG.avdbKey) {
        var ga = await fetchJavGallery(code);
        (ga || []).slice(0, 24).forEach(function (p) { ext.push({ u: avdbImgUrl(p), src: 'AVDB' }); });
      }
    } else {
      ((view.__vdEnrichStills) || []).slice(0, 24).forEach(function (x) {
        if (x && x.url) ext.push({ u: imgProxy(x.url), src: 'TMDB' });
      });
    }
    var total = local.length + ext.length;
    if (!total) return false;

    var srcCount = {};
    ext.forEach(function (x) { srcCount[x.src] = (srcCount[x.src] || 0) + 1; });
    var sub = [];
    if (local.length) sub.push('本地 ' + local.length);
    Object.keys(srcCount).forEach(function (k) { sub.push(k + ' ' + srcCount[k]); });

    var cards = local.map(function (u) {
      return '<span class="vd-still" data-img="' + esc(u) + '"><img src="' + esc(u) + '" loading="lazy" onerror="this.style.display=\'none\'"></span>';
    }).concat(ext.map(function (x) {
      return '<span class="vd-still vd-still-ext" data-img="' + esc(x.u) + '"><img src="' + esc(x.u) + '" loading="lazy" onerror="this.style.display=\'none\'">'
        + '<i class="vd-src-tag">' + esc(x.src) + '</i></span>';
    })).join('');

    var sec = document.createElement('section');
    sec.className = 'vd-stills-section vd-injected-section';
    sec.innerHTML = '<h2 class="vd-h2">剧照 <span>' + sub.join(' · ') + ' 共 ' + total + ' 张</span></h2>'
      + '<div class="vd-strip">' + cards + '</div>';
    insertSection(view, sec);
    view.__vdStillsOk = 1;
    log('剧照合并：本地 ' + local.length + ' / 第三方 ' + ext.length);
    return true;
  }

  // 兼容旧调用（保留函数名，内部改走合并逻辑）
  async function injectJavGallery(view, item) {
    if (CFG.p2 && CFG.p2.javGallery === false) return false;
    return injectStills(view, item, true);
  }
  var _javActorCache = {};
  function _normActorName(x) {
    return String(x || '').replace(/[\s·・.。_\-—]+/g, '').toLowerCase();
  }
  async function injectJavActorProfile(view, item) {
    if (!CFG.p2 || CFG.p2.javActorProfile === false) return false;
    var box = $('.vd-jav', view);
    if (!box || box.__vdAP) return false;
    var actress = (item.People || [])[0];
    if (!actress) return false;
    if (!avdbBases().length || !CFG.avdbKey) return false;
    box.__vdAP = 1;
    var id = actress.Id;
    var row = $('.vd-actor', box);
    if (!row) return false;
    var hint = document.createElement('div');
    hint.className = 'vd-ap';
    hint.innerHTML = '<span class="vd-ap-ld">演员资料加载中…</span>';
    row.parentNode.insertBefore(hint, row.nextSibling);

    var aid = _javActorCache[id];
    if (aid === undefined) {
      // 本地名 → AVDB 演员 id（项目既有 javActorId 逻辑：搜演员取首个命中）
      var q = (CFG.actorAlias && CFG.actorAlias[actress.Name]) || actress.Name;
      var sr = await avdbFetch('/api/v1/javdb/search?q=' + encodeURIComponent(q) + '&type=actor&limit=5');
      var list = (sr && sr.data && (sr.data.actors || sr.data.actress || sr.data.items)) || [];
      // 优先「精确同名」命中（外站搜演员常把别名/他人排在前，项目已有 actorAlias 机制）
      var want = _normActorName(actress.Name);
      var best = null;
      list.forEach(function (x) {
        if (best) return;
        if (_normActorName(x.name) === want || _normActorName(x.name_zht) === want) best = x;
      });
      if (!best) {
        list.forEach(function (x) {
          if (best) return;
          var al = String(x.other_name || '').split(/[,，]/).map(_normActorName);
          if (al.indexOf(want) >= 0) best = x;
        });
      }
      aid = ((best || list[0] || {}).id) || '';
      _javActorCache[id] = aid;
    }
    if (!aid) { hint.innerHTML = '<span class="vd-ap-none">未在外站找到该演员主页</span>'; return false; }
    var ad = await avdbFetch('/api/v1/javdb/actors/' + encodeURIComponent(aid));
    var a = ad && ad.data && ad.data.actor;
    if (!a) { hint.innerHTML = '<span class="vd-ap-none">外站演员资料不可用</span>'; return false; }
    var facts = [];
    if (a.birthday) facts.push(['生日', a.birthday]);
    if (a.age) facts.push(['年龄', a.age + ' 岁']);
    if (a.height) facts.push(['身高', a.height + ' cm']);
    if (a.bust) facts.push(['三围', [a.bust, a.waist, a.hips].filter(Boolean).join(' - ') + (a.cup ? ' (' + a.cup + ')' : '')]);
    else if (a.waist || a.hips) facts.push(['三围', [a.bust, a.waist, a.hips].filter(Boolean).join(' - ')]);
    if (a.blood_type) facts.push(['血型', a.blood_type]);
    if (a.birthplace) facts.push(['出生地', a.birthplace]);
    if (a.videos_count) facts.push(['作品数', a.videos_count + ' 部']);
    var aurl = 'https://javdb.com/actors/' + encodeURIComponent(aid);
    hint.innerHTML = '<div class="vd-ap-hd">演员资料 <span class="vd-tip">数据来自 AVDB / JavDB</span>'
      + '<a class="vd-ap-more" href="' + esc(aurl) + '" target="_blank" rel="noopener">外站主页 ›</a></div>'
      + (a.other_name && a.other_name !== a.name ? '<div class="vd-ap-alias">别名：' + esc(a.other_name) + '</div>' : '')
      + (facts.length ? '<div class="vd-ap-grid">' + facts.map(function (f) {
          return '<span class="vd-ap-kv"><i>' + esc(f[0]) + '</i><b>' + esc(String(f[1])) + '</b></span>';
        }).join('') + '</div>' : '<div class="vd-ap-none">外站暂无更多资料</div>');
    log('AVDB 演员资料：' + (a.name || actress.Name));
    return true;
  }

  // 磁力列表（P2）：只做「展示 + 复制」，**不自动下载/转存**（下载属外部写操作，需用户自己点）
  function fmtSize(bytes, mb) {
    var n = Number(bytes || 0);
    if (!n || n < 1024) n = Number(mb || 0) * 1024 * 1024;
    if (!n) return '';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + ' ' + u[i];
  }
  function magnetFlags(m) {
    var f = [];
    if (m.cnsub) f.push(['中字', 'ok']);
    if (m.uhd) f.push(['4K', 'hot']); else if (m.hd) f.push(['高清', '']);
    if (m.uc) f.push(['破解', 'hot']);
    if (m.files_count) f.push([m.files_count + ' 文件', '']);
    return f;
  }
  async function injectJavMagnets(view, item) {
    if (!CFG.p2 || CFG.p2.javMagnets === false) return false;
    if ($('.vd-magnets-sec', view)) return true;
    var code = javCode(item);
    if (!code || !avdbBases().length || !CFG.avdbKey) return false;
    if (view.__vdMagTried) return false;
    view.__vdMagTried = 1;
    // 磁力块并入「JAV 增强卡」内（主人 2026-09-13），需等卡片就位
    var host = $('.vd-jav .vd-jav-body', view) || $('.vd-jav', view);
    if (!host) { setTimeout(function () { view.__vdMagTried = 0; injectJavMagnets(view, item); }, 800); return false; }

    // ① 先落「占位 + 搜索中动画」，让用户知道正在查（主人 2026-09-13：否则像卡住）
    //    形态与卡内其它小节一致：点标题收起/展开 + 右侧文字开关
    var sec = document.createElement('div');
    sec.className = 'vd-sec collapsed vd-magnets-sec';
    sec.innerHTML = '<div class="vd-subh">磁力资源 <span class="vd-tip" data-role="tip">正在搜索…</span>'
      + '<span class="vd-spin" data-role="spin" aria-hidden="true"></span>'
      + '<span class="vd-links-toggle" data-a="toggleMagnets">展开 ▾</span></div>'
      + '<div class="vd-mag-tools" data-role="tools" style="display:none">'
      + '<button type="button" class="vd-mag-all" data-a="magcopyall">⧉ 复制全部磁力</button></div>'
      + '<div class="vd-mags" data-role="list"></div>'
      + '<div class="vd-jser-tip" data-role="foot" style="display:none">数据来自 AVDB 资源聚合 · 仅展示与复制，不会自动下载</div>';
    host.appendChild(sec);
    var $q = function (k) { return sec.querySelector('[data-role="' + k + '"]'); };

    var mid = await javdbMovieId(code);
    var ms = [];
    if (mid) {
      var d = await avdbFetch('/api/v1/javdb/movies/' + encodeURIComponent(mid) + '/magnets?number=' + encodeURIComponent(code));
      ms = (d && d.data && d.data.magnets) || [];
    }
    if (!ms.length) { sec.remove(); return false; }      // 无资源 → 整块不留（不打扰）

    $q('spin').style.display = 'none';
    $q('tip').textContent = 'AVDB · ' + ms.length + ' 条';
    $q('tools').style.display = '';
    $q('foot').style.display = '';
    $q('list').innerHTML = ms.slice(0, 12).map(function (m) {
      var sz = fmtSize(m.size_bytes, m.size);
      var flags = magnetFlags(m).map(function (f) {
        return '<i class="vd-mag-f' + (f[1] ? ' vd-mag-f-' + f[1] : '') + '">' + esc(f[0]) + '</i>';
      }).join('');
      return '<div class="vd-mag"><div class="vd-mag-hd">'
        + '<b title="' + esc(m.name || '') + '">' + esc((m.name || '').slice(0, 60)) + '</b>'
        + '<span class="vd-mag-meta">' + esc(m.source_label || m.source || '') + (sz ? ' · ' + sz : '')
        + (m.created_at ? ' · ' + esc(String(m.created_at).slice(0, 10)) : '') + '</span>'
        + '<span class="vd-mag-flags">' + flags + '</span></div>'
        + '<div class="vd-mag-acts">'
        + '<button type="button" class="vd-mag-btn" data-a="magcopy" data-m="' + esc(m.magnet_url || '') + '">⧉ 复制磁力</button>'
        + (m.pikpak_url ? '<a class="vd-mag-btn" href="' + esc(m.pikpak_url) + '" target="_blank" rel="noopener">PikPak</a>' : '')
        + '</div></div>';
    }).join('');

    sec.addEventListener('click', function (e) {
      var tg = e.target.closest('[data-a="toggleMagnets"]');
      if (tg) { e.stopPropagation(); var c = sec.classList.toggle('collapsed');
        tg.textContent = c ? '展开 ▾' : '收起 ▴'; return; }
      var all = e.target.closest('[data-a="magcopyall"]');
      if (all) { e.stopPropagation(); writeClipboard(ms.map(function (x) { return x.magnet_url; }).filter(Boolean).join('\n')); toast('已复制 ' + ms.length + ' 条磁力'); return; }
      var c2 = e.target.closest('[data-a="magcopy"]');
      if (c2 && c2.dataset.m) { e.stopPropagation(); writeClipboard(c2.dataset.m); toast('磁力已复制'); }
    });
    log('AVDB 磁力：' + ms.length + ' 条');
    return true;
  }

  // 在本库内按标题搜（TMDB 同类卡片 / TMDB 演员 点击用）
  // ── 收藏（主人 2026-09-13：点收藏报「收藏失败」）─────────────────
  //   旧写法直接调 ApiClient.updateFavorite()，在部分版本/未登录态会抛错，
  //   且不检查结果。改为**直接打 REST 接口**并把真实错误透出来：
  //     POST   /Users/{uid}/FavoriteItems/{itemId}   加入收藏
  //     DELETE /Users/{uid}/FavoriteItems/{itemId}   取消收藏
  function favReq(item, on) {
    var api = window.ApiClient;
    if (!api) return Promise.reject(new Error('ApiClient 未就绪'));
    var uid = api.getCurrentUserId();
    var url = api.getUrl('Users/' + uid + '/FavoriteItems/' + item.Id);
    var tok = '';
    try { tok = api.accessToken() || ''; } catch (e) {}
    if (tok) url += (url.indexOf('?') < 0 ? '?' : '&') + 'api_key=' + encodeURIComponent(tok);
    if (api.ajax) {
      return Promise.resolve(api.ajax({ type: on ? 'POST' : 'DELETE', url: url, dataType: 'json' }))
        .then(function (r) { return r; });
    }
    return fetch(url, { method: on ? 'POST' : 'DELETE', headers: tok ? { 'X-Emby-Token': tok } : {} })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return true; });
  }
  function toggleFavorite(item, btn) {
    if (!item) return;
    var nf = !((item.UserData || {}).IsFavorite);
    if (btn) { btn.classList.add('vd-busy'); btn.disabled = true; }
    return favReq(item, nf).then(function () {
      item.UserData = item.UserData || {}; item.UserData.IsFavorite = nf;
      if (btn) {
        btn.innerHTML = '♥&nbsp; ' + (nf ? '已收藏' : '收藏');
        btn.classList.toggle('vd-on', nf);
        btn.disabled = false; btn.classList.remove('vd-busy');
      }
      toast(nf ? '已加入收藏' : '已取消收藏');
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.classList.remove('vd-busy'); }
      toast('收藏失败：' + ((e && e.message) || e));
      log('收藏失败', e && e.message);
    });
  }

  function searchLocalByTitle(title) {
    if (!title) return;
    var api = window.ApiClient;
    toast('正在本库搜索：' + title);
    var url = api.getUrl('Users/' + api.getCurrentUserId() + '/Items',
      { SearchTerm: title, Recursive: true, Limit: 1, IncludeItemTypes: 'Movie,Series,Episode,Video', Fields: 'ProductionYear' });
    api.getJSON(url).then(function (r) {
      var it = (r && r.Items && r.Items[0]) || null;
      // ⚠️ 找不到时**不再跳原生搜索页**：那页没有美化且会卡住（主人 2026-09-13 反馈），
      //    改为就地提示，避免把用户丢到一个卡死的页面上。
      if (it) goItem(it.Id); else toast('本库未找到：' + title);
    }).catch(function () { toast('搜索失败：' + title); });
  }

  // 按名字在本库找「人物」（演员头像点击 / 右键菜单用）
  function findEmbyPerson(name) {
    var api = window.ApiClient;
    if (!api || !name) return Promise.resolve(null);
    return api.getJSON(api.getUrl('Users/' + api.getCurrentUserId() + '/Items', {
      SearchTerm: name, Recursive: true, IncludeItemTypes: 'Person', Limit: 6
    })).then(function (r) {
      var its = (r && r.Items) || [], exact = null;
      its.forEach(function (p) { if (!exact && p && p.Name === name) exact = p; });
      return exact || its[0] || null;
    }).catch(function () { return null; });
  }
  function openPersonByName(name) {
    if (!name) return;
    toast('正在查找演员：' + name);
    findEmbyPerson(name).then(function (p) {
      if (p && p.Id) goItem(p.Id);
      else toast('本库未收录该演员：' + name);
    });
  }

  var _enrichBase = null;                       // 记住本次会话可用的 base
  // 兜底地址「推导」而非硬编码：① window.VANVY_ENRICH_BASE ② 图片代理同源 + /enrich
  //    （本部署里图片代理/enrich 服务同在一台 nginx 后面；换环境自动跟随，不写死内网 IP）
  function enrichBases() {
    var b = (CFG.p2 && CFG.p2.enrichBases) || [];
    if (b && b.length) return b.slice();
    var out = [];
    try { if (window.VANVY_ENRICH_BASE) out.push(String(window.VANVY_ENRICH_BASE)); } catch (e) {}
    try {
      if (CFG.imgProxyBase) {
        var u = new URL(CFG.imgProxyBase, location.href);
        if (u.origin && u.origin !== 'null') out.push(u.origin + '/enrich');
      }
    } catch (e) {}
    var seen = {}, uniq = [];
    out.forEach(function (x) { x = String(x || '').replace(/\/$/, ''); if (!x || seen[x]) return; seen[x] = 1; uniq.push(x); });
    return uniq;
  }
  function enrichCacheGet(key) {
    try {
      var raw = localStorage.getItem('vanvy:enrich:' + key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && o.__exp > Date.now() && o.data) return o.data;
    } catch (e) {}
    return null;
  }
  function enrichCacheSet(key, data) {
    try { localStorage.setItem('vanvy:enrich:' + key, JSON.stringify({ __exp: Date.now() + 6 * 3600 * 1000, data: data })); } catch (e) {}
  }
  function enrichFetch(tmdbId, mtype) {
    var key = mtype + ':' + tmdbId;
    var hit = enrichCacheGet(key);
    if (hit) return Promise.resolve(hit);
    var bases = _enrichBase ? [_enrichBase].concat(enrichBases().filter(function (x) { return x !== _enrichBase; })) : enrichBases();
    var i = 0;
    function tryNext() {
      if (i >= bases.length) return Promise.resolve(null);
      var base = String(bases[i++] || '').replace(/\/$/, '');
      if (!base) return tryNext();
      return fetch(base + '/api/detail?tmdb=' + encodeURIComponent(tmdbId) + '&type=' + encodeURIComponent(mtype), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.ok) {
            if (d && d.err && /unknown|500/.test(String(d.err))) return tryNext();
            return null;
          }
          _enrichBase = base;
          try { enrichCacheSet(key, d); } catch (e) {}
          return d;
        })
        .catch(function () { return tryNext(); });
    }
    return tryNext();
  }
  function tmdbIdOf(item) {
    var p = item.ProviderIds || {};
    var v = p.Tmdb || p.tmdb || p.TMDB || p.TmdbId;
    return (v && String(v).match(/^\d+$/)) ? String(v) : '';
  }
  function tmdbTypeOf(item) {
    if (item.Type === 'Movie') return 'movie';
    if (item.Type === 'Series') return 'tv';
    return '';
  }

  // ── 本地已入库索引（TMDB id → 本地条目）主人 2026-09-13 ──────────
  //   用途：让「更多类似」里的第三方条目能标出「已入库」，并支持一键跳到本地详情。
  //   只取 ProviderIds（很轻），分页拉movie/series，整场会话缓存一次。
  var _localIdx = null, _localIdxP = null;
  function localTmdbIndex() {
    if (_localIdx) return Promise.resolve(_localIdx);
    if (_localIdxP) return _localIdxP;
    var api = window.ApiClient;
    if (!api) return Promise.resolve({});
    var map = {}, start = 0, PAGE = 1000, MAX = 8;
    var page = function (n) {
      return api.getJSON(api.getUrl('Users/' + api.getCurrentUserId() + '/Items', {
        Recursive: true, IncludeItemTypes: 'Movie,Series', Fields: 'ProviderIds',
        StartIndex: start, Limit: PAGE
      })).then(function (r) {
        var its = (r && r.Items) || [];
        its.forEach(function (it) {
          var p = it.ProviderIds || {}, t = p.Tmdb || p.tmdb || p.TMDB;
          if (t) map[String(t)] = { id: it.Id, name: it.Name || '', type: it.Type };
        });
        if (its.length >= PAGE && n < MAX) { start += PAGE; return page(n + 1); }
        return map;
      });
    };
    _localIdxP = page(1).then(function (m) { _localIdx = m; log('本地索引：' + Object.keys(m).length + ' 条'); return m; })
      .catch(function () { _localIdx = {}; return {}; });
    return _localIdxP;
  }

  async function injectEnrich(view, item, jav) {
    if (!CFG.p2 || !CFG.p2.enrich) return false;
    if (jav) return false;                       // R18 走 P1（AVDB 直连），本容器不接管
    // ⚠️ 按 item.Id 记账：Emby 可能复用同一个 .itemView 元素承载不同条目，
    //    用布尔标记会把「下一个条目」直接挡掉。
    var st = view.__vdEnrich;
    if (st && st.id === item.Id) return !!st.covered;
    if ($('.vd-enrich-section', view)) { view.__vdEnrich = { id: item.Id, covered: true }; return true; }
    view.__vdEnrich = { id: item.Id, covered: false };
    var tmdb = tmdbIdOf(item), mt = tmdbTypeOf(item);
    if (!tmdb || !mt) return false;
    var d = await enrichFetch(tmdb, mt);
    if (!d || !d.ok) return false;
    var stills = CFG.p2.enrichStills !== false ? (d.stills || []) : [];
    var cast = CFG.p2.enrichCast !== false ? (d.cast || []) : [];
    var trs = CFG.p2.enrichTrailers !== false ? (d.trailers || []) : [];
    var sim = CFG.p2.enrichSimilar !== false ? (d.similar || []) : [];
    // 演员不单独占位：交给「演员 / 导演」容器（injectCast）合并渲染（主人 2026-09-13）
    view.__vdEnrichCast = cast;
    // 剧照同样不单独出容器 → 交给 injectStills 与**本地剧照合并**（本地在前、第三方带标记）
    view.__vdEnrichStills = stills;
    if (!stills.length && !cast.length && !trs.length && !sim.length) return false;

    var sec = document.createElement('section');
    sec.className = 'vd-enrich-section vd-injected-section';
    var mods = [];

    // 剧照不再在这里单独出容器 → 交给 injectStills 与本地剧照**合并**展示
    //   （主人 2026-09-13：本地有的正常显示，第三方带来源标记，二者并存）
    if (trs.length) {
      mods.push('<div class="ve-mod"><div class="ve-hd"><b>预告片</b><span class="ve-src tmdb">TMDB · ' + trs.length + ' 段</span></div>'
        + '<div class="vd-strip">' + trs.slice(0, 8).map(function (t) {
            var y = ''; try { y = (String(t.url).match(/[?&]v=([A-Za-z0-9_-]{6,})/) || [])[1] || ''; } catch (e) {}
            var img = y ? imgProxy('https://img.youtube.com/vi/' + y + '/hqdefault.jpg') : '';
            return '<a class="vd-tr-card" data-tr="' + esc(t.url) + '" role="button">'
              + (img ? '<img src="' + esc(img) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '')
              + '<span class="vd-tr-badge"><i></i></span>'
              + '<span class="vd-tr-name">' + esc(t.name || '预告片') + '</span></a>';
          }).join('') + '</div></div>');
    }
    if (sim.length) {
      // 「已入库」标记：本地索引命中 TMDB id → 打标 + 点击直达本地详情（主人 2026-09-13）
      var idx = {};
      try { idx = await localTmdbIndex(); } catch (e) {}
      var got = 0;
      var simCards = sim.slice(0, 14).map(function (m) {
        var u = m.poster ? imgProxy(m.poster) : '';
        var loc = idx[String(m.tmdbId || '')];
        if (loc) got++;
        return '<span class="vd-pcard' + (loc ? ' vd-pcard-lib' : '') + '" data-tmdb="' + esc(m.tmdbId || '') + '"'
          + ' data-ttl="' + esc(m.title || '') + '"' + (loc ? ' data-lid="' + esc(loc.id) + '"' : '') + '>'
          + (u ? '<img src="' + esc(u) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '')
          + (loc ? '<i class="vd-lib-tag">已入库</i>' : '')
          + '<i>' + esc((m.title || '').slice(0, 16)) + (m.year ? ' · ' + esc(m.year) : '') + '</i></span>';
      }).join('');
      mods.push('<div class="ve-mod"><div class="ve-hd"><b>更多类似</b><span class="ve-src tmdb">TMDB · ' + sim.length + ' 部'
        + (got ? ' · 已入库 ' + got : '') + '</span></div>'
        + '<div class="vd-strip">' + simCards + '</div></div>');
    }
    sec.innerHTML = '<h2 class="vd-h2">资料增强 <span>第三方数据 · TMDB</span></h2>'
      + '<div class="ve-body">' + mods.join('') + '</div>'
      + '<div class="ve-tip">数据来源：TMDB（本机聚合服务，已缓存）· 与 Emby 原生资料互补</div>';
    insertSection(view, sec);
    view.__vdEnrich = { id: item.Id, covered: true };
    log('资料增强：剧照' + stills.length + ' 预告' + trs.length + ' 同类' + sim.length + '（演员→合并进演员容器 ' + cast.length + '）');

    // 点击 TMDB 同类卡片 → 在本库内按标题搜（有则直接进详情，无则给出提示）
    sec.addEventListener('click', function (e) {
      var c = e.target.closest('.vd-pcard[data-tmdb]');
      if (c) {
        e.stopPropagation();
        // 已入库 → 直达本地详情；未入库 → 在本库按标题找（找不到给提示，不跳原生搜索页）
        if (c.dataset.lid) { goItem(c.dataset.lid); return; }
        searchLocalByTitle(c.dataset.ttl); return;
      }
    });
    return true;
  }

  // ═══ 二期增强模块 ══════════════════════════════════════════

  // ── ⑩ 合集(BoxSet)/系列页 · 外部站点「系列画廊」（主人 2026-09-13 需求②）──
  //   与上面 injectJavSeriesWall 的区别：
  //     · 那个是「单部影片」页 → 按番号取 JavDB 的 relative_movies
  //     · 这个是「合集(BoxSet)」页 → 按**合集名**在 JavDB 找同系列，列出该系列
  //       在外部站点的全部作品，点击可跳到外部站点对应页面
  //   ⚠️ 安全闸门：**必须**系列名严格匹配（归一化后全等）才显示。
  //     实测教训：AVDB 按名字模糊搜会大量误命中——
  //       「哈利·波特」→「1ヶ月だけ洗脳特権」、「007」→「しゃぶる007」；
  //       而正经片「骗骗喜欢你」→ 空。所以只能靠「严格同名」当护栏。
  function _normSeriesName(x) {
    return String(x || '')
      .replace(/[（(]\s*系列\s*[)）]/g, '')     // 「XXX（系列）」
      .replace(/[（(][^)）]*[)）]/g, '')          // 其它括号后缀
      .replace(/系列$/, '')
      .replace(/[\s·・:：\-—_]+/g, '')
      .toLowerCase();
  }
  async function injectAvdbSeriesGallery(view, item) {
    if (!CFG.p2 || !CFG.p2.javSeriesWall) return;
    if (!item || item.Type !== 'BoxSet') return;
    if ($('.vd-avseries-section', view)) return;
    if (view.__vdAvSeriesTried) return;
    view.__vdAvSeriesTried = 1;
    if (!avdbBases().length || !CFG.avdbKey) return;

    var want = _normSeriesName(item.Name);
    if (want.length < 2) return;

    var d = await avdbFetch('/api/v1/javdb/search?q=' + encodeURIComponent(item.Name) + '&type=series&limit=8');
    var ss = (d && d.data && d.data.series) || [];
    var hit = null;
    ss.forEach(function (s) {
      if (hit) return;
      if (_normSeriesName(s.name) === want) hit = s;
    });
    if (!hit || (hit.videos_count || 0) < 3) return;      // 严格同名 + 至少 3 部才算系列

    var type = (hit.type != null ? hit.type : 0);
    var coll = await avdbFetch('/api/v1/javdb/movies/tags?series_id=' + encodeURIComponent(hit.id)
      + '&series_type=' + encodeURIComponent(type) + '&limit=24');
    var ms = (coll && coll.data && coll.data.movies) || [];
    if (!ms.length) return;

    var javdbSeries = 'https://javdb.com/series/' + encodeURIComponent(hit.id);
    var sec = document.createElement('section');
    sec.className = 'vd-avseries-section vd-injected-section';
    var cards = ms.map(function (m) {
      var u = imgProxy(m.cover_url || m.thumb_url || '');
      var num = m.number || '';
      return '<span class="vd-pcard vd-jcard" data-num="' + esc(num) + '">'
        + (u ? '<img src="' + esc(u) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '<img alt="">')
        + '<i>' + esc(num) + '</i></span>';
    }).join('');
    sec.innerHTML = '<h2 class="vd-h2">' + esc(hit.name || item.Name) + ' <span>JavDB 系列画廊</span>'
      + '<span class="vd-h2-more" data-a="avserall">在 JavDB 打开 ›</span></h2>'
      + '<div class="vd-strip">' + cards + '</div>'
      + '<div class="vd-jser-tip">该合集在 JavDB 共 ' + esc(String(hit.videos_count || ms.length))
      + ' 部 · 点击封面可在 JavDB 查看对应页面</div>';
    insertSection(view, sec);
    var more = $('.vd-h2-more', sec);
    if (more) more.addEventListener('click', function () { window.open(javdbSeries, '_blank', 'noopener'); });
  }


  // ── ① 剧集列表 正序/倒序（数据层）─────────────────────────
  function epSortPref() { try { return localStorage.getItem('vanvy:epSort') || 'asc'; } catch (e) { return 'asc'; } }
  function epSortSave(v) { try { localStorage.setItem('vanvy:epSort', v); } catch (e) {} }

  // Emby 的剧集/季列表是「虚拟滚动 + 分页拉取(每次 Limit=30)」。
  //   ❌ 旧做法：把每一页返回的 Items 各自 reverse → 得到 [30..1, 60..31, ...]（严重错位）
  //   ✅ 正确做法：把「倒序」下推给服务端 —— 请求加 SortBy=IndexNumber&SortOrder=Descending，
  //      分页/虚拟滚动都自然正确（实测返回 286,285,284,…）。
  //   请求最终走 window.fetch（实测），同时兼容 getJSON 路径。
  var VD_EPDESC_Q = 'SortBy=IndexNumber&SortOrder=Descending';
  function vdEpDescUrl(url) {
    if (!url || epSortPref() !== 'desc') return url;
    if (!/\/Shows\/[^\/]+\/(Episodes|Seasons)\b/i.test(url)) return url;
    if (/[?&]SortOrder=/i.test(url)) return url;          // 已指定则不重复加
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + VD_EPDESC_Q;
  }
  function hookEpSortData() {
    if (window.__vdEpSortData) return;
    window.__vdEpSortData = 1;
    // ① 最终网络层：fetch（最稳，虚拟滚动的后续分页也走这里）
    if (window.fetch && !window.__vdFetchPatched) {
      window.__vdFetchPatched = 1;
      var of = window.fetch.bind(window);
      window.fetch = function (input, init) {
        try {
          var u = (typeof input === 'string') ? input : (input && input.url);
          var nu = vdEpDescUrl(u);
          if (u && nu !== u) {
            if (typeof input === 'string') input = nu;
            else if (input && input.url) input = new Request(nu, input);
          }
        } catch (e) {}
        return of(input, init);
      };
    }
    // ② 兼容层：ApiClient.getJSON（若以后改回走它）
    var api = window.ApiClient;
    if (api && api.getJSON && !api.__vdSortPatched) {
      api.__vdSortPatched = 1;
      var orig = api.getJSON.bind(api);
      api.getJSON = function (u) {
        var a = [].slice.call(arguments);
        try { a[0] = vdEpDescUrl(String(u || '')); } catch (e) {}
        return orig.apply(null, a);
      };
    }
  }
  // 切换后强制重载当前条目视图（离开再回，让 Emby 重新发请求 → 拿到倒序数据）
  function reloadItemView() {
    var item = state.item; if (!item) return;
    var id = item.Id;
    state.mountedFor = null;
    var back = function () {
      try { if (window.Emby && Emby.Page && Emby.Page.showItem) { Emby.Page.showItem(id); return; } } catch (e) {}
      location.hash = '#!/item?id=' + id;
    };
    try {
      if (window.Emby && Emby.Page && Emby.Page.show) { Emby.Page.show('/home'); setTimeout(back, 260); return; }
    } catch (e) {}
    location.hash = '#!/home';
    setTimeout(back, 260);
  }
  function applyEpSort(box, order) {
    // 排序已下推给服务端（见 hookEpSortData）→ 这里只同步按钮选中态。
    // 不再用 CSS 反转（对虚拟滚动无效，且会和分页叠加出错）。
    box.classList.remove('vd-epdesc');
    var host = box.closest('.seriesItemsSection, .childrenItemsContainer, .verticalSection') || box.parentElement || box;
    var seg = host.querySelector('.vd-epsort') || (box.parentElement && box.parentElement.querySelector('.vd-epsort'));
    if (seg) { $$('button', seg).forEach(function (b) { b.classList.toggle('on', b.dataset.o === order); }); }
  }
  // ── ③ 把原生「版本/字幕选择器」搬进 hero（否则被 hideNativeTop 一起藏掉）──
  function hoistTrackSelectors(view) {
    var hero = $('.vd-hero', view); if (!hero) return;
    var nat = $('.topDetailsContainer', view); if (!nat) return;
    var rows = $$('.trackSelections', nat);
    if (!rows.length) return;
    var host = $('.vd-trackhost', hero);
    if (!host) {
      host = document.createElement('div');
      host.className = 'vd-trackhost';
      var anchor = $('.vd-cta', hero);
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor);
      else hero.appendChild(host);
    }
    rows.forEach(function (r) { if (r.parentNode !== host) host.appendChild(r); });
    // 原生标签文字补个前缀，更符合我们设计稿
    return host;
  }

  function injectEpisodeSort(view) {
    if (!CFG.p2.sortEpisodes) return;
    // 先清理“孤儿”工具条：只保留“当前可见 itemView”里的，且后面紧跟 trackList 的
    $$('.vd-epsort-bar').forEach(function (bar) {
      var nx = bar.nextElementSibling;
      var ok = nx && nx.classList && nx.classList.contains('trackList')
        && !!nx.closest('.itemView:not(.hide)');
      if (!ok) bar.remove();
    });
    // 两类列表：Series/Season 页的季列表（横向）与集列表（纵向 trackList）
    //  ⚠️ 守卫必须用元素标记：closest() 可能返回全局容器 → 导致每次 tick 都重复插入
    var BLOCKS = [
      { sel: '.seriesItemsSection', min: 2 },
      { sel: '.childrenItemsContainer', min: 2 },
      { sel: '.trackList', min: 2 }
    ];
    BLOCKS.forEach(function (B) {
      $$(B.sel, view).forEach(function (blk) {
        var n = blk.querySelectorAll('.card, .listItem, .virtualScrollItem').length;
        if (n < B.min) return;
        if (blk.__vdSortBar) { applyEpSort(blk, epSortPref()); return; }
        var seg = document.createElement('div');
        seg.className = 'vd-epsort';
        seg.innerHTML = '<button data-o="asc" class="on">↑ 正序</button><button data-o="desc">↓ 倒序</button>';
        seg.addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          var o = b.dataset.o;
          if (o === epSortPref()) return;
          epSortSave(o);
          $$('.vd-epsort button', view).forEach(function (x) { x.classList.toggle('on', x.dataset.o === o); });
          toast(o === 'desc' ? '已切换为倒序（新集在前）' : '已切换为正序');
          reloadItemView();
        }, true);
        var host = blk.closest('.seriesItemsSection') || blk;
        var title = host.querySelector('.sectionTitle') || host.querySelector('h2');
        // ⚠️ 去重：同一宿主容器只能有一个工具条。
        //   旧 bug：title 分支没设 __vdSortBar → 每次 tick 都 append → 60 个按钮
        if (host.__vdSortHost) {
          // 已处理过：确保只剩一个 seg（清掉可能被 Emby 重渲染遗留的）
          var ex = $$('.vd-epsort', host);
          for (var q = 1; q < ex.length; q++) ex[q].remove();
          if (ex[0]) { blk.__vdSortBar = 1; }
          else { host.__vdSortHost = 0; }   // 已被清掉 → 允许重建
        }
        if (host.__vdSortHost) { applyEpSort(blk, epSortPref()); return; }
        if (B.sel === '.trackList') {
          // 纵向集列表：工具条插在列表上方（靠右）
          if (blk.__vdSortBar || !blk.parentNode) return;
          var bar = document.createElement('div');
          bar.className = 'vd-epsort-bar';
          bar.appendChild(seg);
          blk.parentNode.insertBefore(bar, blk);
          blk.__vdSortBar = 1; host.__vdSortHost = 1;
        } else if (title) {
          title.appendChild(seg); title.classList.add('vd-epsort-host');
          blk.__vdSortBar = 1; host.__vdSortHost = 1;
        } else {
          if (blk.__vdSortBar || !blk.parentNode) return;
          blk.parentNode.insertBefore(seg, blk);
          blk.__vdSortBar = 1; host.__vdSortHost = 1;
        }
        applyEpSort(blk, epSortPref());
        // 列表重渲染（切季/翻页）后重新套用
        if (!blk.__vdSortObs) {
          try {
            var ob = new MutationObserver(function () { applyEpSort(blk, epSortPref()); });
            ob.observe(blk, { childList: true });
            blk.__vdSortObs = ob;
          } catch (e) {}
        }
      });
    });
  }

  // ── ② 演员头像右键菜单（复用 Emby 原生 itemcontextmenu）────
  function castContextMenu(card, view) {
    var pid = card.dataset.pid;
    // TMDB 演员卡没有 Emby 人物 id → 先按名字解析出人物，再走原生菜单
    //   （旧版直接 return，「右键没反应」，主人 2026-09-13 反馈）
    if (!pid) {
      // 第三方（TMDB）演员：Emby 侧不存在该人物，元数据无处可编辑
      //   → 明确告知并给出去处，而不是静默无反应（主人 2026-09-13）
      if (card.dataset.tid) {
        toast('该头像来自 TMDB（外部资料，不可编辑）；本地演员头像可右键编辑');
        return;
      }
      var nm = card.dataset.name || (card.querySelector('b') || {}).textContent || '';
      if (!nm) return;
      findEmbyPerson(nm).then(function (p) {
        if (!p || !p.Id) { toast('本库未收录该演员：' + nm); return; }
        card.dataset.pid = p.Id;
        castContextMenu(card, view);
      });
      return;
    }
    var api = window.ApiClient;
    var srv = (state.item && state.item.ServerId) || (api && api.serverId && api.serverId()) || '';
    var show = function (person) {
      var loadModule = function () {
        if (window.Emby && Emby.importModule) return Emby.importModule('./modules/itemcontextmenu.js');
        var req = window.require || window.requirejs;
        if (!req) return Promise.reject('no loader');
        return new Promise(function (res, rej) { req(['itemcontextmenu'], res, rej); });
      };
      api.getCurrentUser().then(function (user) {
        loadModule().then(function (m) {
          var icm = (m && (m.default || m)) || null;
          if (!icm || !icm.show) { goItem(pid); return; }
          try {
            icm.show({
              items: [person], positionTo: card, positionY: 'center', positionX: 'after',
              transformOrigin: 'left top', open: false, play: false, playFromBeginning: false,
              playAllFromHere: false, cancelTimer: false, record: false, deleteItem: false,
              shuffle: false, instantMix: false, user: user, share: false, mediaSourceId: null,
              showSeries: false, showSeason: false, createRecording: false,
              edit: true, editImages: true, favorites: false
            });
          } catch (e) { goItem(pid); }
        }).catch(function () { goItem(pid); });
      }).catch(function () { goItem(pid); });
    };
    api.getJSON(api.getUrl('Users/' + api.getCurrentUserId() + '/Items/' + pid)).then(show).catch(function () {
      show({ Id: pid, Name: (card.querySelector('b') || {}).textContent || '', ServerId: srv, Type: 'Person', MediaType: 'Person' });
    });
  }
  function bindCastContextMenu(view) {
    if (!CFG.p2.castContextMenu || view.__vdCastCtx) return;
    view.__vdCastCtx = 1;
    view.addEventListener('contextmenu', function (e) {
      var card = e.target.closest('.vd-acard');
      if (!card) return;
      e.preventDefault(); e.stopPropagation();
      castContextMenu(card, view);
    }, true);
  }

  // ── ③ 内容容器「查看更多」───────────────────────────────
  function collectionMoreUrl(item) {
    var api = window.ApiClient;
    var srv = item.ServerId || (api && api.serverId && api.serverId()) || '';
    // 合集/剧集：列出其子项（就是该区块展示的那批）
    return '#!/list/list.html?serverId=' + srv + '&parentId=' + item.Id;
  }
  function injectSectionMore(view, item) {
    if (!CFG.p2.sectionMore) return;
    var t = item.Type || '';
    var okType = /^(BoxSet|Series|Season|Playlist)$/.test(t);
    if (!okType) return;
    var url = collectionMoreUrl(item);
    var sels = ['.linked-Movie-section', '.linked-Series-section', '.linked-Video-section',
                '.autoScrollSection', '.collectionItemsSection', '.linkedItems'];
    sels.forEach(function (sel) {
      $$(sel, view).forEach(function (sec) {
        if (sec.querySelector('.vd-secmore')) return;
        var title = sec.querySelector('.sectionTitle') || sec.querySelector('h2');
        if (!title) return;
        if (title.querySelector('.sectionTitleTextButton')) return;   // 原生已有
        var strip = sec.querySelector('.card');
        if (!strip) return;                                          // 空区块不加
        var a = document.createElement('a');
        a.className = 'vd-secmore';
        a.textContent = '查看更多 ›';
        a.href = url;
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          try { if (window.Emby && Emby.Page) Emby.Page.show('/list/list.html?serverId=' + (item.ServerId || '') + '&parentId=' + item.Id); else location.hash = url; }
          catch (e) { location.hash = url; }
        });
        title.appendChild(a);
      });
    });
  }

  // ── ⑤ 信息面板（其他信息 / 媒体信息）+ 完整信息弹框（数据驱动）───
  function fmtSize(b) {
    if (!b) return '—';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0; b = Number(b);
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (b >= 10 ? Math.round(b) : b.toFixed(1)) + ' ' + u[i];
  }
  function fmtDate(s) {
    if (!s) return '—';
    var d = new Date(s); if (isNaN(d.getTime())) return '—';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtRate(b) { return b ? Math.round(b / 1000) + ' kbps' : ''; }
  function streamRows(s) {
    var R = [];
    function add(k, v) { if (v !== undefined && v !== null && v !== '' && v !== false) R.push([k, String(v)]); }
    add('标题', s.Title || s.DisplayTitle);
    if (s.Type === 'Video') {
      add('编解码器', (s.Codec || '').toUpperCase() + (s.Profile ? ' (' + s.Profile + ')' : ''));
      add('分辨率', (s.Width && s.Height) ? (s.Width + '×' + s.Height) : '');
      add('宽高比', s.AspectRatio);
      add('帧率', s.RealFrameRate || s.AverageFrameRate);
      add('比特率', fmtRate(s.BitRate));
      add('位深度', s.BitDepth ? s.BitDepth + ' bit' : '');
      add('像素格式', s.PixelFormat);
      add('色域', s.ColorSpace); add('色彩范围', s.ColorRange);
      add('参考帧', s.RefFrames);
      add('HDR', (s.VideoRange && s.VideoRange !== 'SDR') ? s.VideoRange : '');
    } else if (s.Type === 'Audio') {
      add('语言', s.Language);
      add('编解码器', (s.Codec || '').toUpperCase());
      add('配置', s.Profile);
      add('声道', s.ChannelLayout || (s.Channels ? s.Channels + ' ch' : ''));
      add('比特率', fmtRate(s.BitRate));
      add('采样率', s.SampleRate ? (s.SampleRate / 1000) + ' kHz' : '');
      if (s.IsDefault) add('默认', '是');
    } else if (s.Type === 'Subtitle') {
      add('语言', s.Language);
      add('编解码器', (s.Codec || '').toUpperCase());
      if (s.IsDefault) add('默认', '是');
      if (s.IsForced) add('强制', '是');
      if (s.IsExternal) add('外挂', '是');
    } else {
      add('编解码器', (s.Codec || '').toUpperCase());
    }
    return R;
  }
  // 当前选定的媒体源 Id（多版本下拉）
  function curSourceId() {
    try {
      var s = document.querySelector("div[is='emby-scroller']:not(.hide) select.selectSource:not([disabled])")
           || document.querySelector('.vd-trackhost select.selectSource')
           || document.querySelector('.selectSource');
      return (s && s.value) ? s.value : '';
    } catch (e) { return ''; }
  }
  function pickSource(item, sid) {
    var list = (item && item.MediaSources) || [];
    if (!list.length) return {};
    if (sid) {
      var f = list.filter(function (x) { return String(x.Id) === String(sid); })[0];
      if (f) return f;
    }
    return list[0];
  }
  function mediaInfoData(item, sid) {
    var ms = pickSource(item, sid || curSourceId());
    var streams = ms.MediaStreams || [];
    var order = [] , groups = {};
    streams.forEach(function (s) {
      var t = s.Type === 'Video' ? '视频轨' : s.Type === 'Audio' ? '音频轨' : s.Type === 'Subtitle' ? '字幕轨' : (s.Type || '其他');
      if (!groups[t]) { groups[t] = []; order.push(t); }
      groups[t].push(s);
    });
    var vs = streams.filter(function (s) { return s.Type === 'Video'; })[0] || {};
    return {
      ms: ms, groups: groups, order: order,
      srcName: ms.Name || '',
      nSources: (item.MediaSources || []).length,
      // 严格用「选定版本」的字段；缺失则留空 → 前端显示 “-”
      size: ms.Size || 0,
      container: (ms.Container || '').toUpperCase(),
      res: (vs.Width && vs.Height) ? (vs.Width + '×' + vs.Height) : '',
      date: ms.DateCreated || '',
      path: ms.Path || '',
      codec: (vs.Codec || '').toUpperCase(),
      nFields: streams.reduce(function (a, s) { return a + streamRows(s).length; }, 0)
    };
  }
  // 版本切换器（弹框内，方便直接看其它版本）
  function srcSwitcherHtml(item, sid) {
    var list = (item.MediaSources || []);
    if (list.length < 2) return '';
    var cur = pickSource(item, sid || curSourceId());
    var opts = list.map(function (s, i) {
      var nm = s.Name || ('版本 ' + (i + 1));
      return '<option value="' + esc(s.Id) + '"' + (cur && String(s.Id) === String(cur.Id) ? ' selected' : '') + '>'
        + esc(nm) + '</option>';
    }).join('');
    return '<div class="vd-misrc"><span>版本</span><select class="vd-misrc-sel">' + opts + '</select></div>';
  }
  function pathBoxHtml(path) {
    if (!path) return '';
    var hide = CFG.p2.hideRealPath;
    return '<div class="vd-pathbox"><span class="vd-pb-k">路径</span>'
      + '<span class="vd-pb-v' + (hide ? ' hide' : '') + '" title="' + esc(path) + '">' + esc(path) + '</span>'
      + '<button type="button" class="vd-pb-eye">' + (hide ? '👁 显示' : '🙈 隐藏') + '</button>'
      + '<button type="button" class="vd-pb-cp">⧉ 复制</button></div>';
  }
  function statsHtml(d) {
    // 固定 4 格；无值显示 “-”（不隐式回落条目级，避免“切换版本没变化”的错觉）
    var cells = '';
    function cell(v, k) { cells += '<div><b>' + esc(v || '-') + '</b><span>' + k + '</span></div>'; }
    cell(d.size ? fmtSize(d.size) : '', '大小');
    cell(d.container, '格式');
    cell(d.res, '分辨率');
    cell(d.date ? fmtDate(d.date) : '', '添加日期');
    return '<div class="vd-mistats">' + cells + '</div>';
  }
  function groupsHtml(d, compact) {
    var h = '';
    d.order.forEach(function (t) {
      var list = d.groups[t];
      if (compact && t === '字幕轨' && list.length > 1) list = list.slice(0, 2);
      h += '<div class="vd-migrp"><h5>' + esc(t) + '<em>' + list.length + '</em></h5><div class="vd-migrid">';
      list.forEach(function (s, i) {
        var rows = streamRows(s);
        if (list.length > 1) h += '<div class="vd-mistream">#' + (i + 1) + '</div>';
        rows.forEach(function (r) {
          h += '<div class="vd-mikv"><span>' + esc(r[0]) + '</span><i>' + esc(r[1]) + '</i></div>';
        });
      });
      h += '</div></div>';
    });
    if (!d.order.length) {
      h = '<div class="vd-mi-empty">该版本 Emby 未提供媒体流信息（常见于合并版本，仅主版本含详情）。'
        + '已为你展示文件信息与路径。</div>';
    }
    return h;
  }
  function renderMiBody(item, sid) {
    var d = mediaInfoData(item, sid);
    return {
      d: d,
      html: '<div class="vd-misec"><h5>文件 <em class="vd-mi-vname">' + esc(d.srcName || '默认版本') + '</em></h5>' + statsHtml(d)
        + (d.codec ? '<div class="vd-mikv wide"><span>编码</span><i>' + esc(d.codec) + '</i></div>' : '') + '</div>'
        + (d.path ? '<div class="vd-misec"><h5>路径 <em class="masked-tag">已脱敏</em></h5>' + pathBoxHtml(d.path) + '</div>' : '')
        + '<div class="vd-misec"><h5>媒体流 <em>' + d.order.length + ' 组 / ' + d.nFields + ' 项</em></h5>' + groupsHtml(d) + '</div>'
    };
  }
  function openMediaInfoModal(item, sid) {
    var old = $('#vd-mi-modal'); if (old) old.remove();
    var init = sid || curSourceId();
    var first = renderMiBody(item, init);
    var m = document.createElement('div');
    m.id = 'vd-mi-modal'; m.className = 'vd-mi-modal';
    m.innerHTML = '<div class="vd-mi-mask"></div><div class="vd-mi-box">'
      + '<div class="vd-mi-hd"><div><h3>完整媒体信息</h3>'
      + '<p>' + esc(item.Name || '') + (item.SeriesName ? ' <span>· ' + esc(item.SeriesName) + '</span>' : '') + '</p>'
      + srcSwitcherHtml(item, init) + '</div>'
      + '<button class="vd-mi-x">✕</button></div>'
      + '<div class="vd-mi-body">' + first.html + '</div>'
      + '<div class="vd-mi-ft"><span>共 ' + first.d.nFields + ' 项技术参数 · 数据来自 Emby 媒体源</span>'
      + '<button class="vd-mi-copy">⧉ 复制全部</button></div></div>';
    document.body.appendChild(m);
    var close = function () { m.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    // 弹框内切版本 → 重渲染内容
    var sw = $('.vd-misrc-sel', m);
    if (sw) sw.addEventListener('change', function () {
      var r = renderMiBody(item, sw.value);
      $('.vd-mi-body', m).innerHTML = r.html;
      $('.vd-mi-ft > span', m).textContent = '共 ' + r.d.nFields + ' 项技术参数 · 数据来自 Emby 媒体源';
      syncSelectSource(sw.value);
    });
    m.addEventListener('click', function (e) {
      if (e.target.closest('.vd-mi-mask') || e.target.closest('.vd-mi-x')) { close(); return; }
      var eye = e.target.closest('.vd-pb-eye');
      if (eye) {
        var v = $('.vd-pb-v', eye.parentNode); v.classList.toggle('hide');
        eye.textContent = v.classList.contains('hide') ? '👁 显示' : '🙈 隐藏';
        return;
      }
      if (e.target.closest('.vd-pb-cp')) {
        var pv = $('.vd-pb-v', m); writeClipboard(pv ? (pv.getAttribute('title') || pv.textContent) : ''); toast('已复制路径'); return;
      }
      if (e.target.closest('.vd-mi-copy')) {
        writeClipboard(($('.vd-mi-body', m).innerText || '').replace(/\n{2,}/g, '\n').trim());
        toast('已复制完整媒体信息');
      }
    });
  }
  // 把选择同步到页面上的原生版本下拉（不触发其 change，避免重载）
  function syncSelectSource(sid) {
    try {
      var sels = $$('.selectSource');
      sels.forEach(function (s) {
        if (String(s.value) !== String(sid)) {
          s.value = sid;
          try { s.dispatchEvent(new Event('change', { bubbles: false })); } catch (e) {}
        }
      });
    } catch (e) {}
  }
  function enhanceInfoPanels(view, item) {
    if (!CFG.p2.mediaInfoPanel) return;
    var ab = $('.aboutSection', view), mi = $('.audioVideoMediaInfo', view);
    if (ab && !ab.classList.contains('vd-p2-about')) ab.classList.add('vd-p2-about');
    if (mi) {
      mi.classList.add('vd-p2-media');
      var natBox = mi.querySelector('.mediaSources');
      if (natBox) natBox.classList.add('vd-mi-native-hide');
      renderMiCard(mi, item);
    }
  }
  // 画/重画媒体信息摘要卡（跟随当前选定版本）
  function renderMiCard(mi, item) {
    var sid = curSourceId();
    var oldCard = mi.querySelector('.vd-micard');
    if (oldCard) oldCard.remove();
    var d = mediaInfoData(item, sid);
    var card = document.createElement('div');
    card.className = 'vd-micard';
    card.innerHTML = (d.nSources > 1 ? '<div class="vd-misrc"><span>版本</span><em>' + esc(d.srcName || '默认') + '</em></div>' : '')
      + statsHtml(d)
      + '<div class="vd-miact"><button type="button" class="vd-mi-open">查看完整信息 ›</button>'
      + (d.nFields ? '<span class="vd-mihint">含 ' + d.nFields + ' 项技术参数</span>' : '') + '</div>';
    mi.appendChild(card);
    card.dataset.sid = sid || '';
    card.addEventListener('click', function (e) {
      if (e.target.closest('.vd-mi-open')) { openMediaInfoModal(item, curSourceId()); return; }
      var eye = e.target.closest('.vd-pb-eye');
      if (eye) {
        var v = $('.vd-pb-v', card); v.classList.toggle('hide');
        eye.textContent = v.classList.contains('hide') ? '👁 显示' : '🙈 隐藏';
        return;
      }
      if (e.target.closest('.vd-pb-cp')) { writeClipboard(d.path); toast('已复制路径'); }
    });
  }

  // ── ⑥ 顶栏毛玻璃 ────────────────────────────────────────
  // ── 页面类型标记（全局，供顶栏样式使用）──────────────────
  //   detail = 详情页（满屏背景） / home = 首页轮播 / browse = 其它原生页（媒体库等）
  function markPageType() {
    try {
      var b = document.body;
      if (!b) return;
      var t;
      if (document.querySelector('.itemView:not(.hide)')) t = 'detail';
      else if (document.querySelector('[class^="vanvy-hero-"], [class*=" vanvy-hero-"], .vanvy-home-section')) t = 'home';
      else t = 'browse';
      if (b.getAttribute('data-vd-page') !== t) b.setAttribute('data-vd-page', t);
    } catch (e) {}
  }

  function applyHeaderGlass() {
    var b = document.body;
    if (!CFG.p2.headerGlass) {
      b.setAttribute('data-vd-hdr', 'solid');
    } else {
      b.setAttribute('data-vd-hdr', CFG.p2.headerGlassMode || 'glass');
    }
    b.classList.remove('vd-hdr-top');    // 已不用“随滚动透明”
  }

  // 二期同步（幂等、便宜）：挂载后可在 tick 里反复调用，保证异步渲染的容器也能命中
  // 绑定版本下拉 change → 摘要卡重画（跟随用户选定版本）
  function bindSourceChange(view, item) {
    var sels = $$('.selectSource', view);
    if (!sels.length) sels = $$('.selectSource');
    sels.forEach(function (s) {
      if (s.__vdSrcBound) return;
      s.__vdSrcBound = 1;
      s.addEventListener('change', function () {
        var mi = $('.audioVideoMediaInfo', $('.itemView:not(.hide)') || document);
        if (mi) renderMiCard(mi, state.item || item);
      });
    });
  }

  function p2Sync(view, item) {
    if (!view || !item) return;
    try { markPageType(); } catch (e) {}
    // 单项失败不影响其它项，但必须留日志（否则 bug 会被静默吞掉）
    var t = function (name, fn) { try { fn(); } catch (e) { log('二期[' + name + ']失败', e && e.message); } };
    t('顶栏', function () { applyHeaderGlass(); });
    t('版本选择器', function () { hoistTrackSelectors(view); });
    t('版本联动', function () { bindSourceChange(view, item); });
    t('剧集排序', function () { injectEpisodeSort(view); });
    t('右键菜单', function () { bindCastContextMenu(view); });
    t('查看更多', function () { injectSectionMore(view, item); });
    t('信息面板', function () { enhanceInfoPanels(view, item); });  }

  function imgProxy(u) {
    if (!u) return '';
    var b = (CFG.imgProxyBase || '').replace(/\/$/, '');
    if (!b) return u;
    return b + '/i?u=' + encodeURIComponent(u);
  }

  function injectJav(host, item, prepend) {
    if (!CFG.showJav || $('.vd-jav', host)) return;
    var code = javCode(item);
    var rt = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600000000) : 0;
    var actress = (item.People || [])[0] || null;
    var src = javProvider(item) || '本地库';
    var genres = (item.Genres || []).filter(function (g) { return !/^(片商|发行|系列):/.test(g); });
    var maker = (item.Studios && item.Studios[0] && item.Studios[0].Name)
      || ((item.Genres || []).filter(function (g) { return /^片商:/.test(g); })[0] || '').replace('片商:', '').trim() || '—';
    var series = ((item.Genres || []).filter(function (g) { return /^系列:/.test(g); })[0] || '').replace('系列:', '').trim() || '—';

    var el = document.createElement('div');
    el.className = 'vd-jav';
    el.innerHTML =
      '<div class="vd-jav-hd"><span class="vd-jav-t">🔞 AV 资料</span>'
      + '<span class="vd-badge">番号已识别</span>'
      + '<span class="vd-badge dim">数据源：' + esc(src) + '</span>'
      + '<span class="vd-jav-toggle" data-a="toggleJav">收起 ▴</span></div>'
      + '<div class="vd-jav-body">'
      + '<div class="vd-acts">'
      + '<span class="vd-act gold" data-a="code">⧉ 复制番号</span>'
      + '<span class="vd-act" data-a="path">⧉ 复制路径</span>'
      + '<span class="vd-act" data-a="translate">文 翻译标题</span>'
      + '<span class="vd-act" data-a="refresh">⟳ 刷新数据</span>'
      + '<span class="vd-act" data-a="collection">＋ 加入合集</span>'
      + '</div>'
      + '<div class="vd-subh">影片信息 <span class="vd-tip">来自本地库 / MetaTube</span></div>'
      + '<div class="vd-grid">'
      + kv('番号', code || '—')
      + kv('发行日期', (item.PremiereDate || '').slice(0, 10) || '—')
      + kv('片长', rt ? rt + ' 分钟' : '—')
      + kv('片商', maker, 'maker') + kv('系列', series, 'series')
      + kv('评分', item.CommunityRating ? '★ ' + (Math.round(item.CommunityRating * 10) / 10) + '/10' : '—', 'score')
      + kv('导演', '—', 'director')
      + '</div>'
      + (actress ? '<div class="vd-subh">演员</div><div class="vd-actor" data-aid="' + esc(actress.Id) + '">'
          + '<span class="vd-av" style="background-image:url(' + esc(window.ApiClient.getImageUrl(actress.Id, { type:'Primary', maxWidth:200 })) + ')"></span>'
          + '<div><div class="vd-anm">' + esc(actress.Name) + '</div><div class="vd-asub">点击展开作品列表 ▾</div></div></div>' : '')
      + (genres.length ? '<div class="vd-subh">内容标签 <span class="vd-tip">来自 MetaTube</span>'
          + '<span class="vd-links-toggle" data-a="toggleTags">展开 ▾</span></div>'
          + '<div class="vd-tags collapsed">'
          + genres.map(function (g) { return '<span class="vd-tag" data-tag="' + esc(g) + '" title="查看该标签的更多影片">' + esc(g) + '</span>'; }).join('') + '</div>' : '')
      + '<div class="vd-subh">外部站点 <span class="vd-tip">按番号类型智能生成</span>'
      + '<span class="vd-links-toggle" data-a="toggleLinks">' + (CFG.linksCollapsed ? '展开 ▾' : '收起 ▴') + '</span></div>'
      + '<div class="vd-links' + (CFG.linksCollapsed ? ' collapsed' : '') + '">'
      + buildJavLinks(item, code).map(function (l) {
          return '<a class="vd-lnk' + (l.rel === 2 ? ' vd-lnk-soft' : '') + '" target="_blank" rel="noopener" href="' + l.u + '" style="color:' + l.c + '"' + (l.rel === 2 ? ' title="站点可能已变更，仅供参考"' : '') + '><span class="vd-dot"></span>' + esc(l.t) + (l.rel === 2 ? '<i class="vd-lnk-q">?</i>' : '') + '</a>';
        }).join('') + '</div>'
      + '<div class="vd-subh">JavDB 短评 <span class="vd-tip">数据来自 JavDB</span>'
        + '<span class="vd-links-toggle" data-a="toggleRevs">展开 ▾</span></div>'
      + '<div class="vd-revs collapsed"><div class="vd-rev-empty">加载中…</div></div>'
      + '</div>';
    if (prepend && host.firstChild) host.insertBefore(el, host.firstChild);
    else host.appendChild(el);
    try { collapseSections($('.vd-jav-body', el)); } catch (e) {}
    try { mtEnrich(el, item); } catch (e) {}
    try { loadReviews($('.vd-revs', el), code); } catch (e) {}

    el.addEventListener('click', function (e) {
      var tj = e.target.closest('[data-a="toggleJav"]');
      if (tj) {
        var body = $('.vd-jav-body', el);
        var now = body.classList.toggle('hide');
        tj.textContent = now ? '展开 ▾' : '收起 ▴';
        el.classList.toggle('vd-jav-collapsed', now);
        return;
      }
      var tg = e.target.closest('[data-a="toggleLinks"]');
      if (tg) {
        var box = $('.vd-links', el); var open = box.classList.toggle('collapsed');
        tg.textContent = open ? '展开 ▾' : '收起 ▴';
        e.stopPropagation(); return;
      }
      var tg2 = e.target.closest('[data-a="toggleTags"]');
      if (tg2) {
        var tb = $('.vd-tags', el); var open2 = tb.classList.toggle('collapsed');
        tg2.textContent = open2 ? '展开 ▾' : '收起 ▴';
        e.stopPropagation(); return;
      }
      var tg3 = e.target.closest('[data-a="toggleRevs"]');
      if (tg3) {
        var rb = $('.vd-revs', el); var open3 = rb.classList.toggle('collapsed');
        tg3.textContent = open3 ? '展开 ▾' : '收起 ▴';
        e.stopPropagation(); return;
      }
      // ⚠️ 必须在 toggle 之后：子元素点击不能被「点击标题收起整段」抢走
      //   （旧 bug：内容标签按钮点了一直显示“展开”—— 被 .vd-sec > .vd-subh 分支提前 return）
      //   带头部开关的段落不参与“点标题收起”（否则两套机制打架）
      var sct = e.target.closest('.vd-sec > .vd-subh');
      if (sct) {
        if (sct.querySelector('.vd-links-toggle')) return;
        sct.parentNode.classList.toggle('collapsed'); return;
      }
      var tagEl = e.target.closest('.vd-tag');
      if (tagEl && tagEl.dataset.tag) { e.stopPropagation(); gotoTag(tagEl.dataset.tag, item); return; }
      var a = e.target.closest('.vd-act'); if (!a) return;
      var act = a.dataset.a;
      if (act === 'code') { writeClipboard(code); toast('番号已复制'); }
      else if (act === 'path') { writeClipboard(item.Path || ''); toast('路径已复制'); }
      else if (act === 'fav') { toggleFavorite(item, a); }
      else if (act === 'translate') { translateTitle(item, el); }
      else if (act === 'refresh') { try { window.ApiClient.itemRefresh(item.Id, true, true); toast('已请求刷新数据'); } catch (er) { toast('刷新失败'); } }
      else if (act === 'collection') { addToCollection(item); }
    });
  }
  function kv(k, v, key) { return '<div class="vd-kv"' + (key ? ' data-k="' + key + '"' : '') + '><span class="vd-k">' + esc(k) + '</span><span class="vd-v">' + esc(v) + '</span></div>'; }

  // 把每个 .vd-subh 及其后续内容包成可单独收起的 .vd-sec
  function collapseSections(body) {
    if (!body) return;
    var hs = Array.prototype.slice.call(body.querySelectorAll('.vd-subh'));
    hs.forEach(function (h) {
      if (h.parentNode.classList && h.parentNode.classList.contains('vd-sec')) return;
      var nodes = [], n = h.nextSibling;
      while (n && !(n.nodeType === 1 && n.classList && n.classList.contains('vd-subh'))) {
        nodes.push(n); n = n.nextSibling;
      }
      var sec = document.createElement('div');
      sec.className = 'vd-sec';
      body.insertBefore(sec, h);
      sec.appendChild(h);
      nodes.forEach(function (x) { sec.appendChild(x); });
      if (!h.querySelector('.vd-links-toggle')) {
        var ar = document.createElement('span');
        ar.className = 'vd-sec-ar'; ar.textContent = '▾';
        h.appendChild(ar);
      }
    });
  }

  // ── MetaTube 本地数据引擎（JAV 深数据 + 预告片）──────────
  function mtBase() { return (CFG.metaTubeBase || '').replace(/\/$/, ''); }
  function mtFetch(path) {
    var b = mtBase(); if (!b) return Promise.resolve(null);
    return fetch(b + path, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function mtLookup(item) {
    var pid = (item.ProviderIds || {}).MetaTube || (item.ProviderIds || {}).Metatube || '';
    var m = String(pid).match(/^([^:]+):(.+)$/);
    if (m) return mtFetch('/v1/movies/' + encodeURIComponent(m[1]) + '/' + encodeURIComponent(m[2])).then(function (d) { return d && d.data; });
    var code = javCode(item); if (!code) return Promise.resolve(null);
    return mtFetch('/v1/movies/search?q=' + encodeURIComponent(code)).then(function (d) {
      var arr = (d && d.data) || [];
      var norm = function (s) { return String(s || '').replace(/[-\s]/g, '').toUpperCase(); };
      var hit = arr.filter(function (x) { return norm(x.number) === norm(code); })[0] || arr[0];
      if (!hit) return null;
      return mtFetch('/v1/movies/' + encodeURIComponent(hit.provider) + '/' + encodeURIComponent(hit.id)).then(function (dd) { return dd && dd.data; });
    });
  }
  function setKv(root, key, val) {
    if (!val) return;
    var e = $('[data-k="' + key + '"] .vd-v', root);
    if (e) e.textContent = val;
  }
  function mtEnrich(el, item) {
    mtLookup(item).then(function (mt) {
      if (!mt) return;
      setKv(el, 'maker', mt.maker || '');
      setKv(el, 'series', mt.series || '');
      setKv(el, 'director', mt.director || '');
      if (mt.score) setKv(el, 'score', '★ ' + mt.score + '/10');
      var pv = mt.preview_video_url || mt.preview_video_hls_url;
      if (pv) injectJavTrailer(pv, mt, item);
      log('MetaTube 已接入:', mt.provider, mt.number);
    }).catch(function () {});
  }
  function injectJavTrailer(url, mt, item) {
    var view = $('.itemView:not(.hide)') || document;
    if ($('.vd-jav-trailer', view)) return;
    var api = window.ApiClient;
    var cover = imgProxy(mt.cover_url) || api.getImageUrl(item.Id, { type: 'Primary', maxWidth: 560, tag: (item.ImageTags || {}).Primary });
    var sec = document.createElement('section');
    sec.className = 'vd-trailer-section vd-injected-section vd-jav-trailer';
    sec.innerHTML = '<h2 class="vd-h2">预告片 <span>Preview</span></h2><div class="vd-strip">'
      + '<a class="vd-tr-card" data-tr="' + esc(url) + '" role="button">'
      + '<img src="' + esc(cover) + '" loading="lazy" onerror="this.style.display=\'none\'">'
      + '<span class="vd-tr-badge"><i></i></span>'
      + '<span class="vd-tr-name">' + esc((mt.number || javCode(item) || '') + ' 预告片') + '</span></a></div>';
    insertSection(view, sec);
  }

  // ── JAV 短评（JavDB）────────────────────────────────────────
  // 说明：JavDB 公开短评可通过本地 AVDB 引擎直接抓取（无需登录）
  function javdbMovieId(code) {
    code = (code || '').toUpperCase().replace(/\s+/g, '');
    if (!code) return Promise.resolve('');
    _javIdCache = _javIdCache || {};
    if (_javIdCache[code] !== undefined) return Promise.resolve(_javIdCache[code]);
    return avdbFetch('/api/v1/javdb/search?q=' + encodeURIComponent(code) + '&type=movie&limit=5')
      .then(function (d) {
        var ms = (d && d.data && d.data.movies) || [];
        var hit = null;
        ms.forEach(function (m) {
          var n = (m.number || '').toUpperCase().replace(/\s+/g, '');
          if (!hit && n === code) hit = m.id;
        });
        if (!hit && ms[0]) hit = ms[0].id;
        _javIdCache[code] = hit || '';
        return hit || '';
      }).catch(function () { _javIdCache[code] = ''; return ''; });
  }

  function loadReviews(box, code) {
    if (!box) return;
    var entry = '<div class="vd-rev-empty">短评暂不可用 · '
      + '<a href="https://javdb.com/search?q=' + encodeURIComponent(code || '') + '&f=all" target="_blank" rel="noopener" style="color:var(--vd-acc)">到 JavDB 查看短评 ›</a></div>';
    if (!CFG.avdbBase || !code) { box.innerHTML = entry; return; }
    javdbMovieId(code).then(function (mid) {
      if (!mid) { box.innerHTML = entry; return; }
      return avdbFetch('/api/v1/javdb/movies/' + encodeURIComponent(mid) + '/reviews?limit=8');
    }).then(function (d) {
      var list = (d && d.data && d.data.reviews) || [];
      if (!Array.isArray(list) || !list.length) { box.innerHTML = entry; return; }
      box.innerHTML = list.slice(0, 8).map(function (r2) {
        var u = r2.username || r2.user || '匿名';
        var s = parseInt(r2.score || 0, 10) || 0;
        var star = '★★★★★'.slice(0, s) + '☆☆☆☆☆'.slice(0, 5 - s);
        var dt = (r2.created_at || '').slice(0, 10);
        return '<div class="vd-rev"><div class="vd-rav">' + esc(String(u).slice(0, 1)) + '</div>'
          + '<div class="vd-rbd"><div class="vd-rhd"><b style="color:#dfe3ea">' + esc(u) + '</b>'
          + (s ? '<span class="vd-rsc">' + star + '</span>' : '')
          + (dt ? '<span>' + esc(dt) + '</span>' : '') + '</div>'
          + '<p>' + esc(r2.content || '') + '</p>'
          + '<div class="vd-rsub">👍 ' + (r2.likes_count || 0) + ' 有用</div></div></div>';
      }).join('');
    }).catch(function () { box.innerHTML = entry; });
  }
  var _javIdCache = {};

  // ── 翻译标题（Google gtx，尽力而为）────────────────────────
  function translateText(text, cb) {
    var q = encodeURIComponent(text || '');
    fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' + q)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var out = (d && d[0] || []).map(function (x) { return x && x[0] || ''; }).join('');
        cb(out || '');
      }).catch(function () { cb(''); });
  }
  function translateTitle(item, el) {
    var h = $('.vd-title', el && el.parentNode || document) || $('.vd-title');
    if (!h) return;
    translateText(item.Name || '', function (zh) {
      if (!zh) { toast('翻译服务不可用'); return; }
      h.textContent = zh;
      toast('标题已翻译');
    });
  }

  // 简介「阅读全文」弹框（对齐 Emby 原生小按钮行为）
  function openSynModal(item) {
    var txt = String((item && item.Overview) || '').trim();
    if (!txt) { toast('暂无简介'); return; }
    modal('<div class="vd-synmodal">'
      + '<div class="vd-mi-hd"><b>简介</b>'
      + '<button type="button" class="vd-mi-x" data-close="1" aria-label="关闭">✕</button></div>'
      + '<div class="vd-synmodal-body">' + esc(txt).replace(/\n/g, '<br>') + '</div>'
      + '</div>', null, 'vd-modal-box--syn');
    var m = $('#vd-modal');
    if (m) m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { e.stopPropagation(); m.remove(); }
    });
  }

  // ── 合集增强：加入合集 / 新建合集 ───────────────────────────
  function modal(html, onClose, boxClass) {
    var old = $('#vd-modal'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'vd-modal'; m.className = 'vd-modal';
    m.innerHTML = '<div class="vd-modal-box' + (boxClass ? ' ' + boxClass : '') + '">' + html + '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) { m.remove(); onClose && onClose(); } });
    return m;
  }
  async function addToCollection(item) {
    var api = window.ApiClient;
    var d;
    try {
      d = await api.getJSON(api.getUrl('Items', { UserId: api.getCurrentUserId(), IncludeItemTypes: 'BoxSet', Recursive: true, Limit: 60, Fields: 'Id,Name' }));
    } catch (e) { d = { Items: [] }; }
    var sets = d.Items || [];
    var m = modal(
      '<h3 class="vd-modal-t">＋ 加入合集</h3>'
      + '<div class="vd-modal-sub">选择已有合集，或新建一个：</div>'
      + '<div class="vd-modal-list">' + (sets.length ? sets.map(function (s) {
          return '<span class="vd-modal-item" data-sid="' + esc(s.Id) + '">' + esc(s.Name) + '</span>';
        }).join('') : '<div class="vd-rev-empty">暂无合集</div>') + '</div>'
      + '<div class="vd-modal-new"><input class="vd-modal-input" placeholder="新建合集名称…">'
      + '<button class="vd-modal-btn" data-act="create">新建并加入</button>'
      + '<button class="vd-modal-btn ghost" data-act="close">取消</button></div>'
    );
    m.addEventListener('click', async function (e) {
      var it = e.target.closest('.vd-modal-item');
      var act = e.target.closest('[data-act]');
      if (it && it.dataset.sid) {
        try {
          await api.ajax({ type: 'POST', url: api.getUrl('Collections/' + it.dataset.sid + '/Items', { Ids: item.Id }), dataType: 'json' });
          toast('已加入合集'); m.remove();
        } catch (er) { toast('加入失败'); }
      } else if (act && act.dataset.act === 'create') {
        var name = ($('.vd-modal-input', m) || {}).value || '';
        if (!name.trim()) { toast('请输入合集名称'); return; }
        try {
          await api.ajax({ type: 'POST', url: api.getUrl('Collections', { Name: name.trim(), Ids: item.Id }), dataType: 'json' });
          toast('已新建合集并加入'); m.remove();
        } catch (er) { toast('新建失败（可能需管理员权限）'); }
      } else if (act && act.dataset.act === 'close') { m.remove(); }
    });
  }

  // ── JAV 番号 / 数据源 / 工具 ─────────────────────────────
  function javCode(item) {
    var n = item.Name || '';
    var m = n.match(/\b([A-Za-z]{2,8})[-_ ]?(\d{2,6})\b/) || n.match(/\b(\d{2,6}[A-Za-z]{2,8})[-_ ]?(\d{2,6})\b/);
    return m ? (m[1] + '-' + m[2]).toUpperCase() : '';
  }
  function javProvider(item) {
    var pid = item.ProviderIds || {};
    var v = pid.MetaTube || pid.Metatube || '';
    return v ? String(v).split(':')[0] : '';
  }
  function roleName(t) {
    return t === 'Director' ? '导演' : t === 'Writer' ? '编剧' : t === 'GuestStar' ? '嘉宾'
      : t === 'Actor' ? '演员' : t === 'Producer' ? '制片' : (t || '');
  }
  function ytId(u) {
    var m = String(u || '').match(/(?:youtu\.be\/|[?&]v=|embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : '';
  }
  // ── 横向滚动（滚轮/拖拽）─────────────────────────────────
  function bindStripScroll() {
    document.addEventListener('wheel', function (e) {
      var st = e.target.closest('.vd-strip');
      if (!st) return;
      var max = st.scrollWidth - st.clientWidth;
      if (max <= 4) return;
      var d = (Math.abs(e.deltaY) > Math.abs(e.deltaX)) ? e.deltaY : e.deltaX;
      var next = st.scrollLeft + d;
      if ((d > 0 && st.scrollLeft < max - 1) || (d < 0 && st.scrollLeft > 1)) {
        e.preventDefault();
        st.scrollLeft = Math.max(0, Math.min(max, next));
      }
    }, { passive: false });
    // 拖拽滑动
    var drag = null;
    document.addEventListener('pointerdown', function (e) {
      var st = e.target.closest('.vd-strip');
      if (!st || st.scrollWidth - st.clientWidth <= 4) return;
      if (e.target.closest('a,button,video')) return;
      drag = { st: st, x: e.clientX, left: st.scrollLeft, moved: 0 };
    });
    document.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      drag.moved = Math.abs(dx);
      if (drag.moved > 6) { drag.st.classList.add('vd-dragging'); drag.st.scrollLeft = drag.left - dx; }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (!drag) return;
        drag.st.classList.remove('vd-dragging');
        if (drag.moved > 6) {
          var st = drag.st;
          st.addEventListener('click', function stop(ce) { ce.stopPropagation(); ce.preventDefault(); st.removeEventListener('click', stop, true); }, true);
        }
        drag = null;
      });
    });
  }

  function goItem(id) {
    if (!id) return;
    var api = window.ApiClient;
    var srv = (api && api.serverId && api.serverId()) || '';
    if (window.Emby && Emby.Page && Emby.Page.showItem) {
      try { Emby.Page.showItem(id, srv); return; } catch (e) {}
    }
    location.hash = '#!/item?id=' + id + (srv ? ('&serverId=' + srv) : '');
  }
  // 用番号搜种（沿用现有搜索入口）
  function searchByNumber(num) {
    if (!num) return;
    try {
      location.hash = '#!/search?query=' + encodeURIComponent(num);
      setTimeout(function () {
        var inp = document.querySelector('.searchFields .inputContainer input, input[type="search"]');
        if (inp) { inp.value = num; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      }, 900);
      toast('搜索：' + num);
    } catch (e) {}
  }

  // ── 内容行：剧照 / 演员 / 预告片 / 演员作品 / 更多类似 ──────────
  async function injectSections(view, item, jav) {
    var api = window.ApiClient;

    // ① 剧照：本地 + 第三方合并（主人 2026-09-13：不再二选一，第三方逐张带来源标记）
    try { await injectStills(view, item, jav); } catch (e) { log('剧照失败', e && e.message); }

    // ⑪ 是否由「资料增强」提供了 预告片/同类（保留其独占，避免重复区块）
    var _cov = !!(view.__vdEnrich && view.__vdEnrich.covered && view.__vdEnrich.id === item.Id);

    // ② 演员 / 导演（正经库）。⑪ 资料增强不单独出演员容器，而是把 TMDB 演员
    //    汇入这里合并渲染（主人 2026-09-13）→ 因此不再随 _cov 跳过。
    try { if (!jav) injectCast(view, item); } catch (e) { log('演员失败', e && e.message); }

    // ③ 预告片（⑪ 资料增强已接管 → 跳过）
    try { if (!_cov) injectTrailers(view, item); } catch (e) { log('预告片失败', e && e.message); }

    // ④ 演员作品（JAV）
    try {
      var actress = (item.People || [])[0];
      if (jav && actress && !$('.vd-actormore-section', view)) {
        var d = await api.getJSON(api.getUrl('Users/' + api.getCurrentUserId() + '/Items', {
          PersonIds: actress.Id, Recursive: true, Limit: 18, IncludeItemTypes: 'Movie',
          Fields: 'ProductionYear,CommunityRating', ImageTypes: 'Primary'
        }));
        var works = (d.Items || []).filter(function (w) { return w.Id !== item.Id; }).slice(0, 12);
        if (works.length) {
          var sec2 = document.createElement('section');
          sec2.className = 'vd-actormore-section vd-injected-section';
          sec2.innerHTML = '<h2 class="vd-h2">' + esc(actress.Name) + ' 的其他作品 <span>' + works.length + ' 部</span></h2>'
            + '<div class="vd-strip">' + works.map(function (w) {
                var u = api.getImageUrl(w.Id, { type:'Primary', maxWidth: 300, tag: (w.ImageTags || {}).Primary });
                return '<span class="vd-pcard" data-id="' + esc(w.Id) + '"><img src="' + esc(u) + '" loading="lazy">'
                  + '<i>' + esc(w.Name.length > 16 ? w.Name.slice(0, 16) + '…' : w.Name) + '</i></span>';
              }).join('') + '</div>';
          insertSection(view, sec2);
        }
      }
    } catch (e) { log('演员作品失败', e && e.message); }

    // ⑤ 更多类似 / 更多推荐（⑪ 资料增强已接管 → 跳过）
    try {
      if (!_cov && !$('.vd-similar-section', view)) {
        var r = await api.getJSON(api.getUrl('Items/' + item.Id + '/Similar',
          { UserId: api.getCurrentUserId(), Limit: 12, Fields: 'ProductionYear,ImageTags' }));
        var sim = (r.Items || r || []).filter(function (x) { return x && x.Id && x.Id !== item.Id; }).slice(0, 12);
        if (sim.length) {
          var sec3 = document.createElement('section');
          sec3.className = 'vd-similar-section vd-injected-section';
          sec3.innerHTML = '<h2 class="vd-h2">' + (jav ? '更多推荐 <span>同系列 / 同标签</span>' : '更多类似 <span>推荐</span>')
            + '<span class="vd-h2-more" data-a="simall">查看全部 ›</span></h2>'
            + '<div class="vd-strip">' + sim.map(function (w) {
                var u = api.getImageUrl(w.Id, { type:'Primary', maxWidth: 300, tag: (w.ImageTags || {}).Primary });
                return '<span class="vd-pcard" data-id="' + esc(w.Id) + '"><img src="' + esc(u) + '" loading="lazy">'
                  + '<i>' + esc((w.Name || '').slice(0, 16)) + '</i></span>';
              }).join('') + '</div>';
          insertSection(view, sec3);
          var more = $('.vd-h2-more', sec3);
          if (more) more.addEventListener('click', function () { openSimilarPage(item, jav); });
        }
      }
    } catch (e) { log('类似失败', e && e.message); }
  }

  // 标签 → 对应「更多影片」页面（Emby 原生 genre 列表）
  function gotoTag(name, item) {
    if (!name) return;
    var api = window.ApiClient;
    var srv = (item && item.ServerId) || (api && api.serverId && api.serverId()) || '';
    var fallback = function () {
      location.hash = '#!/search?query=' + encodeURIComponent(name) + (srv ? ('&serverId=' + srv) : '');
    };
    if (!api || !api.getJSON) { fallback(); return; }
    api.getJSON(api.getUrl('Genres', {
      UserId: api.getCurrentUserId(), Recursive: true, IncludeItemTypes: 'Movie', Limit: 1000
    })).then(function (r) {
      var items = r.Items || r || [];
      var want = String(name).trim().toLowerCase();
      var hit = items.filter(function (g) { return String(g.Name || '').trim().toLowerCase() === want; })[0];
      if (hit && hit.Id) location.hash = '#!/list/list.html?serverId=' + srv + '&genreId=' + hit.Id;
      else fallback();
    }).catch(function () { fallback(); });
  }

  // ── “更多类似”整页视图（Emby 无原生该页，自建）──
  function openSimilarPage(item, jav) {
    var api = window.ApiClient;
    var old = $('.vd-simpage'); if (old) old.remove();
    var page = document.createElement('div');
    page.className = 'vd-simpage';
    page.innerHTML = '<div class="vd-simpage-in"><div class="vd-simpage-hd">'
      + '<span class="vd-simpage-back" data-a="back">‹ 返回</span>'
      + '<h3>' + esc(item.Name || '') + '<em>' + (jav ? '更多推荐' : '更多类似') + '</em></h3></div>'
      + '<div class="vd-simpage-grid"><div class="vd-simpage-empty">加载中…</div></div></div>';
    document.body.appendChild(page);
    var close = function () { page.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    page.addEventListener('click', function (e) {
      if (e.target.closest('[data-a="back"]') || e.target === page) { close(); return; }
      var c = e.target.closest('.vd-pcard');
      if (c && c.dataset.id) { close(); goItem(c.dataset.id); }
    });
    api.getJSON(api.getUrl('Items/' + item.Id + '/Similar', {
      UserId: api.getCurrentUserId(), Limit: 200, Fields: 'ProductionYear,ImageTags'
    })).then(function (r) {
      var list = (r.Items || r || []).filter(function (x) { return x && x.Id && x.Id !== item.Id; });
      var grid = $('.vd-simpage-grid', page);
      if (!list.length) { grid.innerHTML = '<div class="vd-simpage-empty">暂无更多类似内容</div>'; return; }
      grid.innerHTML = list.map(function (w) {
        var u = api.getImageUrl(w.Id, { type: 'Primary', maxWidth: 320, tag: (w.ImageTags || {}).Primary });
        return '<span class="vd-pcard" data-id="' + esc(w.Id) + '"><img src="' + esc(u) + '" loading="lazy">'
          + '<i>' + esc((w.Name || '').slice(0, 20)) + (w.ProductionYear ? ' (' + esc(w.ProductionYear) + ')' : '') + '</i></span>';
      }).join('');
    }).catch(function () { $('.vd-simpage-grid', page).innerHTML = '<div class="vd-simpage-empty">加载失败</div>'; });
  }

  // ── 演员名解析：本地名 ↔ JavDB 名（简/繁/日文不一致）──────────
  //  优先级：① 配置 actorAlias  ② 本地缓存  ③ 自动解析（缓存结果）
  //  自动解析：AVDB 搜演员（模糊，能认简体名）→ 取官方名 + other_name 别名
  //           → 逐个试搜作品，取“命中最高的前几个”里的第一个
  function aliasCache() {
    try { return JSON.parse(localStorage.getItem('vanvy:actorAlias:v1') || '{}') || {}; } catch (e) { return {}; }
  }
  function aliasCacheSave(o) {
    try { localStorage.setItem('vanvy:actorAlias:v1', JSON.stringify(o)); } catch (e) {}
  }
  function aliasFromConfig(name) {
    var m = CFG.actorAlias;
    if (!m) return null;
    try {
      if (typeof m === 'function') { var r = m(name); return r ? [].concat(r) : null; }
      var v = m[name]; return v ? [].concat(v) : null;
    } catch (e) { return null; }
  }
  function hitsOf(name, movies) {
    var n = 0;
    for (var i = 0; i < movies.length; i++) { if (String(movies[i].title || '').indexOf(name) >= 0) n++; }
    return n;
  }
  async function searchMovies(name, limit) {
    try {
      var r = await avdbFetch('/api/v1/javdb/search?q=' + encodeURIComponent(name) + '&type=movie&limit=' + (limit || 24));
      return (r && r.data && r.data.movies) || [];
    } catch (e) { return []; }
  }
  // 在候选名里选最能让“标题命中”的那个（按优先级顺序，够好就停）
  async function pickBestName(cands) {
    var uniq = [];
    cands.forEach(function (c) { c = String(c || '').trim(); if (c && uniq.indexOf(c) < 0) uniq.push(c); });
    var best = uniq[0] || '', bestHit = -1, tried = 0;
    for (var i = 0; i < uniq.length && tried < 5; i++) {
      var ms = await searchMovies(uniq[i]); tried++;
      if (!ms.length) continue;
      var hit = hitsOf(uniq[i], ms);
      if (hit > bestHit) { bestHit = hit; best = uniq[i]; }
      if (hit >= 8) break;                    // 够好就别再试（避免命中短名谐音）
    }
    return { name: best, hits: Math.max(bestHit, 0) };
  }
  async function resolveActor(localName) {
    var out = { local: localName, id: '', canonical: localName, aliases: [], chosen: localName, via: '' };
    if (!localName) return out;
    var manual = aliasFromConfig(localName);
    if (manual && manual.length) { out.chosen = manual[0]; out.aliases = manual.slice(); out.via = 'config'; return out; }
    var cache = aliasCache()[localName];
    if (cache && cache.chosen) { out = cache; out.local = localName; return out; }
    if (!avdbBases().length || !CFG.avdbKey) return out;
    try {
      var ar = await avdbFetch('/api/v1/javdb/search?q=' + encodeURIComponent(localName) + '&type=actor&limit=5');
      var a0 = ((ar && ar.data && ar.data.actors) || [])[0];
      if (!a0 || !a0.id) return out;
      out.id = a0.id;
      try {
        var ad = await avdbFetch('/api/v1/javdb/actors/' + encodeURIComponent(a0.id));
        var act = (ad && ad.data && ad.data.actor) || {};
        out.canonical = act.name || a0.name || localName;
        out.aliases = String(act.other_name || '').split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      } catch (e2) { out.canonical = a0.name || localName; }
      // 本地名 → 官方名 → 别名（优先级顺序；简体/繁体官方名通常搜不到，别名才管用）
      var picked = await pickBestName([localName, out.canonical].concat(out.aliases));
      out.chosen = picked.name || out.canonical;
      out.via = 'auto';
      if (out.chosen !== localName) { var c = aliasCache(); c[localName] = out; aliasCacheSave(c); }
    } catch (e) { log('演员名解析失败', e && e.message); }
    return out;
  }

  // 演员 / 导演行（圆形头像）
  function _footName(ract, used) {
    if (ract && ract.local && ract.local !== used) return '演员名 ' + used + '（本地「' + ract.local + '」已自动映射）';
    return '演员名 ' + used;
  }
  function injectCast(view, item) {
    if ($('.vd-cast-section', view)) return;
    var api = window.ApiClient;
    var _n = function (s) { return String(s || '').replace(/[\s·・.。_\-—]+/g, '').toLowerCase(); };
    var tmdb = (CFG.p2 && CFG.p2.enrichCast !== false) ? (view.__vdEnrichCast || []) : [];
    var people = (item.People || []).filter(function (p) {
      return /^(Actor|Director|Writer|GuestStar|Producer)$/.test(p.Type || '');
    });
    var cards = [], seen = {};
    var personCard = function (p) {          // Emby 侧（有 Person Id，可进人物页/右键菜单）
      var u = api.getImageUrl(p.Id, { type: 'Primary', maxWidth: 260 });
      return '<span class="vd-acard" data-pid="' + esc(p.Id) + '">'
        + '<span class="vd-av"><img src="' + esc(u) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'"></span>'
        + '<b>' + esc(p.Name) + '</b><em>' + esc(p.Role || roleName(p.Type)) + '</em></span>';
    };
    // ⚠️ 顺序（主人 2026-09-13 定）：**本地演员在前**，TMDB 演员在后。
    //   原因：本地演员卡有 Emby 人物 id → 可右键编辑元数据；TMDB 演员是外部数据、
    //   无法编辑，放前面会把「可编辑的」挤到后面。外部头像加 TMDB 角标以示区分。
    var tmdbCard = function (p) {
      var u = p.profile ? imgProxy(p.profile) : '';
      return '<span class="vd-acard vd-acard-ext" data-tid="' + esc(p.id || '') + '" data-name="' + esc(p.name || '') + '"'
        + ' title="' + esc((p.name || '') + (p.character ? ' 饰 ' + p.character : '') + ' · 来自 TMDB（外部资料，点击看外站主页）') + '">'
        + '<span class="vd-av">' + (u ? '<img src="' + esc(u) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '')
        + '</span><i class="vd-av-tag">TMDB</i>'
        + '<b>' + esc(p.name) + '</b><em>' + esc(p.character || '演员') + '</em></span>';
    };
    // ① 本地（Emby）演员：可右键编辑 / 进人物页
    people.filter(function (p) { return /^Actor$/.test(p.Type || ''); }).slice(0, 12).forEach(function (p) {
      var k = _n(p.Name); if (!k || seen[k]) return; seen[k] = 1;
      cards.push(personCard(p));
    });
    // ② 本地非演员岗位（导演/编剧/嘉宾…）
    people.filter(function (p) { return !/^Actor$/.test(p.Type || ''); }).slice(0, 6).forEach(function (p) {
      var k = _n(p.Name); if (!k || seen[k]) return; seen[k] = 1;
      cards.push(personCard(p));
    });
    // ③ TMDB 演员（外部，带角标）
    tmdb.slice(0, 14).forEach(function (p) {
      var k = _n(p.name); if (!k || seen[k]) return; seen[k] = 1;
      cards.push(tmdbCard(p));
    });
    if (!cards.length) return;
    var sec = document.createElement('section');
    sec.className = 'vd-cast-section vd-injected-section';
    var tip = tmdb.length ? '<span class="vd-h2-tip">本地演员可右键编辑 / 点开作品页 · TMDB 头像点击去外站</span>' : '';
    sec.innerHTML = '<h2 class="vd-h2">演员 / 导演 <span>' + (tmdb.length ? 'Cast + TMDB' : 'Cast &amp; Crew') + '</span>' + tip + '</h2>'
      + '<div class="vd-strip">' + cards.join('') + '</div>';
    insertSection(view, sec);
  }

  // 预告片行
  function injectTrailers(view, item) {
    if ($('.vd-trailer-section', view)) return;
    var trs = (item.RemoteTrailers || []).filter(function (t) { return t && t.Url; });
    if (!trs.length) return;
    var sec = document.createElement('section');
    sec.className = 'vd-trailer-section vd-injected-section';
    sec.innerHTML = '<h2 class="vd-h2">预告片 <span>Trailers</span></h2><div class="vd-strip">'
      /* 点击卡片 → 页内弹框播放（见 bindDelegates） */
      + trs.slice(0, 8).map(function (t) {
          var y = ytId(t.Url);
          var img = y ? imgProxy('https://img.youtube.com/vi/' + y + '/hqdefault.jpg') : '';
          return '<a class="vd-tr-card" data-tr="' + esc(t.Url) + '" role="button">'
            + (img ? '<img src="' + esc(img) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '')
            + '<span class="vd-tr-badge"><i></i></span>'
            + '<span class="vd-tr-name">' + esc(t.Name || '预告片') + '</span></a>';
        }).join('') + '</div>';
    insertSection(view, sec);
  }
  // ── 剧照大图查看器（Lightbox）──────────────────────────
  function openLightbox(list, idx) {
    if (!list || !list.length) return;
    var old = $('#vd-lightbox'); if (old) old.remove();
    var m = document.createElement('div');
    m.id = 'vd-lightbox'; m.className = 'vd-lightbox';
    m.innerHTML = '<span class="vd-lb-close" title="关闭">✕</span>'
      + '<span class="vd-lb-nav vd-lb-prev" title="上一张">‹</span>'
      + '<img alt="">'
      + '<span class="vd-lb-nav vd-lb-next" title="下一张">›</span>'
      + '<span class="vd-lb-idx"></span>';
    document.body.appendChild(m);
    var img = $('img', m), cur = idx;
    function show(i) {
      cur = (i % list.length + list.length) % list.length;
      img.src = list[cur];
      $('.vd-lb-idx', m).textContent = (cur + 1) + ' / ' + list.length;
    }
    show(idx);
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(cur - 1);
      else if (e.key === 'ArrowRight') show(cur + 1);
    }
    function close() {
      if (m.classList.contains('vd-closing')) return;
      m.classList.add('vd-closing');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { m.remove(); }, 170);
    }
    m.addEventListener('click', function (e) {
      if (e.target.closest('.vd-lb-close') || e.target === m) close();
      else if (e.target.closest('.vd-lb-prev')) show(cur - 1);
      else if (e.target.closest('.vd-lb-next')) show(cur + 1);
    });
    document.addEventListener('keydown', onKey);
  }
  function openStills(el) {
    var all = $$('.vd-still');
    var list = all.map(function (s) {
      return s.dataset.img || (s.querySelector('img') || {}).src || '';
    }).filter(Boolean).map(function (u) { return u.replace(/maxWidth=\d+/, 'maxWidth=1600'); });
    openLightbox(list, all.indexOf(el));
  }

  // ── 预告片：页内弹框播放（不跳新标签）─────────────────
  function openTrailerModal(url, name) {
    if (!url) return;
    var old = document.getElementById('vd-trailer-modal'); if (old) old.remove();
    var yt = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
    var inner;
    if (yt) {
      // ⚠️ 站内嵌入 YouTube 的兼容做法（主人 2026-09-13 反馈「要登录/无法播放」）：
      //   ① 用 youtube-nocookie 域名（第三方 cookie 受限时更少被拦）
      //   ② 显式带 origin + enablejsapi（缺 origin 时 YouTube 常拒绝播放）
      //   ③ 打开 iframe API 通道，收 onError（101/150 = 作者禁止嵌入；100 = 已删除/私享）
      //      → 一旦报错立刻换成「在 YouTube 打开」的兜底卡片，不再让用户对着黑屏干等
      inner = ytFrame(yt[1]);
    } else if (/\.(mp4|m4v|webm|mov|m3u8)(\?|$)/i.test(url)) {
      inner = '<video src="' + esc(url) + '" controls autoplay playsinline></video>';
    } else {
      inner = '<iframe src="' + esc(url) + '" frameborder="0" allowfullscreen></iframe>';
    }
    var m = document.createElement('div');
    m.id = 'vd-trailer-modal'; m.className = 'vd-tmodal';
    m.innerHTML = '<div class="vd-tmodal-box"><div class="vd-tmodal-hd"><span>' + esc(name || '预告片') + '</span>'
      + (yt ? '<a class="vd-tmodal-out" href="https://www.youtube.com/watch?v=' + esc(yt[1])
              + '" target="_blank" rel="noopener">在 YouTube 打开 ↗</a>' : '')
      + '<i class="vd-tmodal-close">✕</i></div><div class="vd-tmodal-body">' + inner + '</div></div>';
    document.body.appendChild(m);
    if (yt) ytWire(m, yt[1]);
    function close() {
      var v = m.querySelector('video,iframe'); if (v) { v.src = ''; }
      m.remove(); document.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMsg);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function onMsg(e) {
      var f = m.querySelector('iframe'); if (!f || e.source !== f.contentWindow) return;
      var d; try { d = JSON.parse(e.data); } catch (er) { return; }
      if (d && d.event === 'onError') ytFallback(m, yt[1], d.info);
    }
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.classList.contains('vd-tmodal-close')) close();
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMsg);
  }

  // YouTube 嵌入 iframe（nocookie + origin + jsapi）
  function ytFrame(id) {
    var o = '';
    try { o = encodeURIComponent(location.origin || (location.protocol + '//' + location.host)); } catch (e) {}
    return '<iframe id="vd-ytf" src="https://www.youtube-nocookie.com/embed/' + esc(id)
      + '?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1'
      + (o ? ('&origin=' + o) : '') + '" frameborder="0" referrerpolicy="strict-origin-when-cross-origin" '
      + 'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" '
      + 'allowfullscreen></iframe>';
  }
  // 握手：告诉 YouTube 我们在监听（否则收不到 onError）
  function ytWire(root, id) {
    var f = root.querySelector('#vd-ytf'); if (!f) return;
    var ping = function () { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'vd', channel: 'widget' }), '*'); } catch (e) {} };
    var t = setInterval(ping, 700); setTimeout(function () { clearInterval(t); }, 6000);
    f.addEventListener('load', ping);
  }
  function ytFallback(root, id, info) {
    var body = root.querySelector('.vd-tmodal-body'); if (!body || body.__fb) return;
    body.__fb = 1;
    var why = (info === 101 || info === 150) ? '该预告片不允许站内嵌入播放'
            : (info === 100) ? '该预告片已下架或设为私享'
            : '站内播放失败';
    body.innerHTML = '<div class="vd-yt-fb"><b>' + esc(why) + '</b>'
      + '<span>可以点右上角，或直接到 YouTube 观看</span>'
      + '<a href="https://www.youtube.com/watch?v=' + esc(id) + '" target="_blank" rel="noopener">▶ 在 YouTube 打开</a></div>';
  }

  // ── 演员作品（已入库 + JavDB 全部作品）─────────────────────
  // ── AVDB 多地址自动回退（主人 2026-09-13：外网环境下 AVDB 内容看不到）──
  //   内网直连（192.168.x.x）只在家宽可用；外网访问 Emby 时内网地址不可达
  //   → 依次探测 CFG.avdbBases（内网 → 公网 /avdb 反代），记住本次会话可用的那个。
  var _avdbOK = null, _avdbProbing = null;
  function avdbBase() { return _avdbOK || (CFG.avdbBase || '').replace(/\/$/, ''); }
  function avdbBases() {
    var out = [], seen = {};
    var push = function (u) { u = String(u || '').replace(/\/$/, ''); if (!u || seen[u]) return; seen[u] = 1; out.push(u); };
    push(CFG.avdbBase);
    // 兜底推导：图片代理同源 + /avdb（本部署里 AVDB 反代挂在同一台 nginx 上）
    try {
      if (CFG.imgProxyBase) { var x = new URL(CFG.imgProxyBase, location.href); if (x.origin && x.origin !== 'null') push(x.origin + '/avdb'); }
    } catch (e) {}
    (CFG.avdbBases || []).forEach(push);
    try { if (window.VANVY_AVDB_BASE) push(window.VANVY_AVDB_BASE); } catch (e) {}
    return out;
  }
  function avdbProbe(base) {
    var ctl = null, tm = null;
    try { ctl = new AbortController(); tm = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 3500); } catch (e) {}
    return fetch(base + '/api/v1/javdb/movies/latest?limit=1', {
      headers: { 'X-API-Key': CFG.avdbKey }, signal: ctl ? ctl.signal : undefined
    }).then(function (r) { return r.ok; }).catch(function () { return false; })
      .then(function (ok) { if (tm) clearTimeout(tm); return ok; });
  }
  function avdbEnsure() {
    if (_avdbOK) return Promise.resolve(_avdbOK);
    if (_avdbProbing) return _avdbProbing;
    var list = avdbBases();
    if (!list.length || !CFG.avdbKey) return Promise.resolve('');
    // 探过一次就记进 sessionStorage，避免每次进详情页都空等内网超时
    try {
      var c = sessionStorage.getItem('vanvy:avdbBase');
      if (c && list.indexOf(c) >= 0) { _avdbOK = c; return Promise.resolve(c); }
    } catch (e) {}
    var i = 0;
    var step = function () {
      if (i >= list.length) { _avdbProbing = null; return ''; }
      var b = list[i++];
      return avdbProbe(b).then(function (ok) {
        if (ok) { _avdbOK = b; try { sessionStorage.setItem('vanvy:avdbBase', b); } catch (e) {} _avdbProbing = null; return b; }
        return step();
      });
    };
    _avdbProbing = step();
    return _avdbProbing;
  }
  function avdbFetch(path, opt) {
    if (!CFG.avdbKey) return Promise.resolve(null);
    return avdbEnsure().then(function (b) {
      if (!b) return null;
      return fetch(b + path, Object.assign({ headers: { 'X-API-Key': CFG.avdbKey } }, opt || {}))
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    });
  }
  async function toggleActorWorks(host, item, actress) {
    var box = $('.vd-aworks', host);
    if (box) { box.classList.toggle('hide'); if (!box.classList.contains('hide')) return; }
    if (box) return;
    box = document.createElement('div');
    box.className = 'vd-aworks';
    box.innerHTML = '<div class="vd-aworks-ld">加载中…</div>';
    var act = $('.vd-actor', host);
    if (act && act.parentNode) act.parentNode.insertBefore(box, act.nextSibling); else host.appendChild(box);
    var api = window.ApiClient;
    // ① 已入库作品（Emby）
    var libHtml = '';
    try {
      var d = await api.getJSON(api.getUrl('Users/' + api.getCurrentUserId() + '/Items', {
        PersonIds: actress.Id, Recursive: true, Limit: 24, IncludeItemTypes: 'Movie',
        Fields: 'ProductionYear,ImageTags', ImageTypes: 'Primary'
      }));
      var ws = (d.Items || []).filter(function (w) { return w.Id !== item.Id; });
      libHtml = (ws.length
        ? '<div class="vd-ascroll-wrap"><div class="vd-strip vd-aworks-strip">' + ws.map(function (w) {
            var tags = w.ImageTags || {};
            // 与 JavDB 卡片保持一致：横版 16:10，优先 Thumb/Backdrop，回退 Primary
            var t = tags.Thumb ? 'Thumb' : (tags.Backdrop ? 'Backdrop' : 'Primary');
            var u = api.getImageUrl(w.Id, { type: t, maxWidth: 480, tag: tags[t] });
            return '<span class="vd-pcard vd-jcard" data-id="' + esc(w.Id) + '" title="' + esc(w.Name || '') + '"><img src="' + esc(u) + '" loading="lazy">'
              + '<i>' + esc((w.Name || '').slice(0, 16)) + '</i></span>';
          }).join('') + '</div></div>'
        : '<div class="vd-aworks-empty">库内暂无其他作品</div>')
        + '<div class="vd-aworks-foot"><span>库内共 ' + ws.length + ' 部</span>'
        + '<a class="vd-aworks-all" data-a="alllib" data-pid="' + esc(actress.Id) + '">查看全部库内作品 ›</a></div>';
    } catch (e) { libHtml = '<div class="vd-aworks-empty">读取失败</div>'; }
    // ② JavDB 全部作品
    var jdbHtml = '<div class="vd-aworks-ld">JavDB 加载中…</div>';
    box.innerHTML =
      '<div class="vd-aworks-tabs"><span class="vd-aworks-tab active" data-t="lib">已入库</span>'
      + '<span class="vd-aworks-tab" data-t="jdb">JavDB 全部作品</span></div>'
      + '<div class="vd-aworks-pane" data-p="lib">' + libHtml + '</div>'
      + '<div class="vd-aworks-pane hide" data-p="jdb">' + jdbHtml + '</div>';
    $('.vd-aworks-tabs', box).addEventListener('click', function (e) {
      var t = e.target.closest('.vd-aworks-tab'); if (!t) return;
      $$('.vd-aworks-tab', box).forEach(function (x) { x.classList.toggle('active', x === t); });
      $$('.vd-aworks-pane', box).forEach(function (x) { x.classList.toggle('hide', x.dataset.p !== t.dataset.t); });
    });
    // “查看全部库内作品” → Emby 原生演员页
    box.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a="alllib"]');
      if (a && a.dataset.pid) { e.preventDefault(); goItem(a.dataset.pid); }
    });
    // 拉 JavDB（先把本地演员名解析成 JavDB 能搜到的名：简/繁/日文不一致时自动映射）
    var ract = { chosen: actress.Name, aliases: [], canonical: actress.Name, id: '', via: '' };
    try { ract = await resolveActor(actress.Name); } catch (e) {}
    var jdbName = ract.chosen || actress.Name;
    var res = await avdbFetch('/api/v1/javdb/search?q=' + encodeURIComponent(jdbName) + '&type=movie&limit=24');
    var movies = (res && res.data && res.data.movies) || [];
    // 去噪：全文本搜索会把无关片混进来 → 只留标题含演员名的（至少 3 条才敢过滤）
    var exact = movies.filter(function (m) { return String(m.title || '').indexOf(jdbName) >= 0; });
    if (exact.length >= 3) movies = exact;
    // 演员主页（用于“完整作品列表”外链）
    var aurl = 'https://javdb.com/search?q=' + encodeURIComponent(jdbName) + '&f=actor';
    if (ract.id) {
      aurl = 'https://javdb.com/actors/' + ract.id;
    } else {
      try {
        var ar = await avdbFetch('/api/v1/javdb/search?q=' + encodeURIComponent(jdbName) + '&type=actor&limit=5');
        var arr = (ar && ar.data && ar.data.actors) || [];
        if (arr[0] && arr[0].id) aurl = 'https://javdb.com/actors/' + arr[0].id;
      } catch (e) {}
    }
    var pane = $('.vd-aworks-pane[data-p="jdb"]', box);
    if (movies.length) {
      pane.innerHTML = '<div class="vd-ascroll-wrap">'
        + '<div class="vd-strip vd-aworks-strip">' + movies.map(function (m) {
          var num = esc(m.number || '');
          var u = esc(imgProxy(m.cover_url || m.thumb_url || ''));
          var jurl = m.id ? ('https://javdb.com/v/' + encodeURIComponent(m.id))
                  : ('https://javdb.com/search?q=' + encodeURIComponent(m.number || '') + '&f=all');
          return '<span class="vd-pcard vd-jcard" data-num="' + num + '" data-jurl="' + esc(jurl) + '" title="点击在 JavDB 新标签打开">'
            + '<img src="' + u + '" loading="lazy" onerror="this.style.display=\'none\'">'
            + '<i>' + num + '</i></span>';
        }).join('') + '</div>'
        + '</div></div>'
        + '<div class="vd-aworks-foot"><span>数据来自 JavDB（' + esc(_footName(ract, jdbName)) + ' · 共 ' + movies.length + ' 条）</span>'
        + '<a class="vd-aworks-all" href="' + esc(aurl) + '" target="_blank" rel="noopener">查看全部作品 ›</a></div>';
    } else {
      pane.innerHTML = '<div class="vd-aworks-empty">未取到 JavDB 数据 · '
        + '<a class="vd-aworks-all" href="' + esc(aurl) + '" target="_blank" rel="noopener" style="color:var(--vd-acc)">去 JavDB 查看全部作品 ›</a></div>';
    }
  }

  // 滑杆 ↔ 横向滚动条双向联动
  function bindRange(range, strip) {
    if (!range || !strip) return;
    function sync() {
      var max = strip.scrollWidth - strip.clientWidth;
      range.max = max > 0 ? max : 1;
      range.style.visibility = max > 4 ? 'visible' : 'hidden';
      range.value = strip.scrollLeft;
    }
    range.addEventListener('input', function () { strip.scrollLeft = parseInt(range.value, 10) || 0; });
    strip.addEventListener('scroll', function () {
      if (document.activeElement !== range) range.value = strip.scrollLeft;
    }, { passive: true });
    setTimeout(sync, 60);
    try { new ResizeObserver(sync).observe(strip); } catch (e) {}
  }

  function ensureSectionsHost(view) {
    var host = $('.vd-sections-host', view);
    if (!host) {
      host = document.createElement('div');
      host.className = 'vd-sections-host vd-injected';
      var addc = $('.details-additionalContent', view);
      if (addc) {
        // 播放顺序约束：播出季/剧集列表（seriesItemsSection/childrenItemsContainer）必须在我们的注入内容之前
        var anchor = $('.seriesItemsSection', addc) || $('.childrenItemsContainer', addc);
        // 向上找到 addc 的直接子容器（剧集块往往嵌套更深）
        var top = anchor;
        var guard = 0;
        while (top && top.parentNode && top.parentNode !== addc && guard++ < 8) top = top.parentNode;
        if (top && top.parentNode === addc) {
          if (top.nextSibling) addc.insertBefore(host, top.nextSibling);
          else addc.appendChild(host);
        } else addc.insertBefore(host, addc.firstChild);
      } else view.appendChild(host);
    }
    return host;
  }

  function insertSection(view, sec) {
    ensureSectionsHost(view).appendChild(sec);
  }

  // ── 毛玻璃 / 主题 ────────────────────────────────────────────
  function applyFrost(view) {
    if ($('.vd-frost', view)) return;
    var bd = $('.backdropContainer', view) || $('.itemBackdrop', view);
    if (!bd) return;
    var f = document.createElement('div');
    f.className = 'vd-frost';
    f.style.setProperty('--vd-blur', CFG.frostBlur + 'px');
    f.style.setProperty('--vd-tint', CFG.frostTint);
    bd.appendChild(f);
    bd.classList.add('vd-backdrop');
  }
  function applyTheme() {
    var p = PRESETS[CFG.theme] || PRESETS.blackgold;
    var r = document.documentElement.style;
    r.setProperty('--vd-acc', p.a); r.setProperty('--vd-acc2', p.b); r.setProperty('--vd-bg', p.bg);
    r.setProperty('--vd-perrow', String(CFG.perRow || 6));
    r.setProperty('--vd-bg-blur', (CFG.bgBlur != null ? CFG.bgBlur : 6) + 'px');
    document.body.setAttribute('data-vd-theme', CFG.theme);
  }

  // ── 主流程 ───────────────────────────────────────────────────
  function currentItemId() {
    var m = (location.hash || '').match(/[?&]id=([a-f0-9]+)/i);
    return m ? m[1] : null;
  }
  function cleanup() {
    $$('.vd-injected, .vd-frost, .vd-jav, .vd-players, .vd-hero, .vd-sections-host').forEach(function (e) { e.remove(); });    var bg = $('#vd-hero-bg'); if (bg) bg.remove();
    var veil = $('.vd-hero-veil'); if (veil) veil.remove();
    $$('.vd-native-top-hidden').forEach(function (e) { e.classList.remove('vd-native-top-hidden'); });
    $$('.vd-backdrop').forEach(function (e) { e.classList.remove('vd-backdrop'); });
    // 二期：清理注入物 + 还原原生容器
    $$('.vd-epsort').forEach(function (e) { e.remove(); });
    $$('.vd-epsort-bar').forEach(function (e) { e.remove(); });
    $$('.vd-trackhost').forEach(function (e) { e.remove(); });
    $$('.vd-micard').forEach(function (e) { e.remove(); });
    $$('.vd-epsort-host').forEach(function (e) { e.classList.remove('vd-epsort-host'); });
    $$('.vd-epdesc').forEach(function (e) { e.classList.remove('vd-epdesc'); });
    $$('.trackList, .seriesItemsSection, .childrenItemsContainer').forEach(function (e) {
      try { delete e.__vdSortBar; } catch (er) { e.__vdSortBar = 0; }
      try { delete e.__vdSortHost; } catch (er) { e.__vdSortHost = 0; }
    });
    $$('.vd-epsort button').forEach(function (e) { e.remove(); });
    $$('.vd-secmore').forEach(function (e) { e.remove(); });
    $$('.vd-epdesc').forEach(function (e) { e.classList.remove('vd-epdesc'); });
    $$('.vd-mi-open').forEach(function (e) { e.remove(); });
    $$('.vd-p2-about, .vd-p2-media').forEach(function (e) { e.classList.remove('vd-p2-about', 'vd-p2-media'); });
    $$('.vd-mask').forEach(function (s) {
      try { s.parentNode.replaceChild(document.createTextNode(s.textContent), s); } catch (e) {}
    });
    var mim = $('#vd-mi-modal'); if (mim) mim.remove();
    document.body.classList.remove('vanvy-detail-active', 'vd-hdr-glass');
    // 注意：data-vd-hdr 是全局状态（按页面类型生效），离开详情页不要清掉
    state.mountedFor = null; state.mounting = null; state.item = null; state.hero = null;
  }

  async function tick() {
    try {
      try { markPageType(); } catch (e) {}
      try { hookEpSortData(); } catch (e) {}
      var id = currentItemId();
      var view = $('.itemView:not(.hide)');
      if (!id || !view || !view.classList.contains('itemView')) { if (state.mountedFor) cleanup(); return; }
      var mdb = $('.mainDetailButtons', view) || $('.detailButtons', view);
      var topc = $('.topDetailsContainer', view);
      if (!mdb && !topc) return;
      if (state.mountedFor === id || state.mounting === id) { markReady(view); try { p2Sync(view, state.item); } catch (e) {} return; }
      if ($$('.vd-hero', view).length) { state.mountedFor = id; return; }
      state.mounting = id;

      var item = null;
      try { item = await fetchItem(id); } catch (e) { state.mounting = null; throw e; }
      if (!item) { state.mounting = null; markReady(view); return; }
      state.mountedFor = id; state.mounting = null; state.item = item;

      applyTheme();
      document.body.classList.add('vanvy-detail-active');
      ensureBg(item);
      if (!CFG.hero) applyFrost(view);

      var js = javScore(item, { libName: ($('.tabContent-active') || {}).textContent || '' });
      var jav = js.hit;
      document.body.setAttribute('data-vd-jav', jav ? '1' : '0');
      log('路由:', jav ? 'JAV' : '正经库', 'score=' + js.score, js.why.join(','));

      if (CFG.hero) {
        buildHero(view, item, jav);
      } else {
        applyFrost(view);
        var addc = $('.details-additionalContent', view);
        if (addc) { var hp = document.createElement('div'); hp.className = 'vd-injected'; addc.insertBefore(hp, addc.firstChild);
          injectPlayers(hp, item); if (jav && CFG.showJav) injectJav(hp, item, true); }
        releaseBoot();
      }
      // ── ⑪ 第三方资料增强（正经库 · TMDB）**先跑**──
      //   必须早于 injectSections：① 它决定 剧照/预告/同类 是否由增强容器接管
      //   （置 view.__vdEnrich.covered）；② 它把 TMDB 演员放进 view.__vdEnrichCast，
      //   供 injectSections 里的「演员 / 导演」容器合并渲染（主人 2026-09-13：演员不另起容器）。
      try { await injectEnrich(view, item, jav); } catch (e) { log('资料增强失败', e && e.message); }
      injectSections(view, item, jav);
      // JAV 资料卡：放在下滑区首位（首屏只到“当前设备”行）
      if (CFG.hero && jav && CFG.showJav) {
        try { injectJav(ensureSectionsHost(view), item, true); } catch (e) {}
      }
      // ── 二期增强（①③④⑤⑥⑧）────────────────
      try { p2Sync(view, item); } catch (e) { log('二期同步失败', e && e.message); }
      // 播放键文案：解析续看目标（季/剧集页 → 「继续观看」/「播放」）
      try { refreshCta(view, item); } catch (e) {}
      if (jav) { try { injectJavSeriesWall(view, item); } catch (e) { log('同系列墙失败', e && e.message); } }
      // ⑫ R18 演员资料（AVDB，异步补进 JAV 卡；不阻塞首屏）
      if (jav) { injectJavActorProfile(view, item).catch(function (e) { log('演员资料失败', e && e.message); }); }
      // ⑫ R18 磁力列表（AVDB，只展示/复制）
      if (jav) { injectJavMagnets(view, item).catch(function (e) { log('磁力失败', e && e.message); }); }
      try { injectAvdbSeriesGallery(view, item); } catch (e) { log('系列画廊失败', e && e.message); }
      log('完成:', item.Name);
      markReady(view);
    } catch (e) { state.mounting = null; try { markReady($('.itemView:not(.hide)')); } catch (_) {} log('tick 失败(不影响原生):', e && e.message || e); }
  }

  // 从原生卡片元素取出 itemId（兼容 data-id 与图片 URL）
  function cardItemId(card) {
    if (!card) return '';
    var id = card.getAttribute('data-id') || card.dataset && card.dataset.id;
    if (id) return id;
    var img = card.querySelector('img[src]');
    if (img) {
      var m = /\/Items\/([0-9a-f]{3,})\//i.exec(img.getAttribute('src') || '');
      if (m) return m[1];
    }
    var a = card.querySelector('a[href*="id="]');
    if (a) { var m2 = /[?&]id=([0-9a-f]+)/i.exec(a.getAttribute('href') || ''); if (m2) return m2[1]; }
    return '';
  }
  // 合集/所属合集/影片列表里的卡片：保证点击能进作品页（防止被卡片上的播放悬浮按钮抢走）
  function bindNativeCardClicks() {
    if (window.__vdCardClickBound) return; window.__vdCardClickBound = 1;
    document.addEventListener('click', function (e) {
      var hit = e.target.closest('.card');
      if (!hit) return;
      // 只接管这几个原生内容区，其余交给 Emby 自己
      var zone = hit.closest('.linkedItems, .appearsOnListsSection, .collectionItemsSection, .linked-Movie-section, .linked-Series-section, .childrenItemsContainer');
      if (!zone) return;
      if (e.target.closest('.cardOverlayButton, .chkItemSelectContainer')) {
        // 悬浮播放/菜单按钮 → 转成“进入作品页”
        if (e.target.closest('.cardOverlayButton[data-action="resume"], .cardOverlayButton[data-action="play"]')) {
          e.preventDefault(); e.stopPropagation();
          var id = cardItemId(hit); if (id) goItem(id);
        }
        return;
      }
      // 普通点击：Emby 已能处理就不重复跳；若 300ms 后 hash 未变则补跳
      var id2 = cardItemId(hit); if (!id2) return;
      var h0 = location.hash;
      setTimeout(function () {
        if (location.hash === h0 || /videoosd/.test(location.hash)) goItem(id2);
      }, 320);
    }, true);
  }

  async function init() {
    await loadConfig();
    try { applyHeaderGlass(); } catch (e) {}   // 顶栏模式：全局生效，需在启动时设一次
    try { hookEpSortData(); } catch (e) {}
    watchViews();
    try { bindNativeCardClicks(); } catch (e) {}
    setInterval(tick, 500);
    bindStripScroll();
    window.addEventListener('hashchange', function () { setTimeout(tick, 300); });
    document.addEventListener('click', function (e) {
      var c = e.target.closest('.vd-pcard');
      if (c && c.dataset.id) {
        if (window.Emby && Emby.Page) Emby.Page.showItem(c.dataset.id); else location.hash = '#!/item?id=' + c.dataset.id;
        return;
      }
      if (c && c.dataset.jurl) { window.open(c.dataset.jurl, '_blank', 'noopener'); return; }
      if (c && c.dataset.num) { window.open('https://javdb.com/search?q=' + encodeURIComponent(c.dataset.num) + '&f=all', '_blank', 'noopener'); return; }
      var tr = e.target.closest('.vd-tr-card');
      if (tr && tr.dataset.tr) {
        var nm = tr.querySelector('.vd-tr-name');
        openTrailerModal(tr.dataset.tr, nm ? nm.textContent : '预告片');
        return;
      }
      var a = e.target.closest('.vd-actor');
      if (a && a.dataset.aid) {
        var jhost = a.closest('.vd-jav') || a.parentNode;
        var actressObj = { Id: a.dataset.aid, Name: (a.querySelector('.vd-anm') || {}).textContent || '' };
        var cur = state.item || {};
        toggleActorWorks(jhost, cur, actressObj);
        return;
      }
      var pc = e.target.closest('.vd-acard');
      if (pc && pc.dataset.pid) { goItem(pc.dataset.pid); return; }
      // 第三方（TMDB）演员：无 Emby 人物 id → 跳 TMDB 人物页（主人 2026-09-13：
      //   第三方头像不编辑可以理解，点击应跳第三方对应页面，而不是在本库里瞎搜）
      if (pc && pc.dataset.tid) {
        window.open('https://www.themoviedb.org/person/' + encodeURIComponent(pc.dataset.tid), '_blank', 'noopener');
        return;
      }
      if (pc && pc.dataset.name) { openPersonByName(pc.dataset.name); return; }
      var st = e.target.closest('.vd-still');
      if (st) { openStills(st); }
    });
    tick();
    log('已加载 · 配色', CFG.theme, '· OS', OS, '· hero', CFG.hero);
  }

  window.VanvyDetail = { init: init, tick: tick, cleanup: cleanup, cfg: CFG, launchPlayer: launchPlayer };
  // ⚠️ 尽早挂 fetch 钩子（剧集倒序下推给服务端）：
  //    必须在首屏「第一次拉取剧集」之前生效，否则第一页仍是升序 → 顺序错乱
  try { hookEpSortData(); } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
