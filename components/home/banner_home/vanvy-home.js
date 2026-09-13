/**
 * =============================================================================
 *  Vanvy Home Banner · vanvy-home.js
 *  ---------------------------------------------------------------------------
 *  真·可注入组件（非设计稿）。目标：
 *    1. 满屏轮播（100svh），按媒体库分组
 *    2. 每个媒体库取最新入库 N 个（默认 8），自动循环 + 手动切换
 *    3. 顶部媒体库 Tab，点击切库，库和片都可自动轮播
 *    4. 背景图不透明度/模糊/遮罩色调可调
 *    5. 原生首页其余行「零改动」，只在最前面插一个 section
 *
 *  注入方式（与现有 kit 完全一致）：
 *    index.html 尾部 <link> css + <script src="vanvy/banner_home/vanvy-home.js">
 *
 *  挂载点（跨版本）：
 *    .view:not(.hide) .homeSectionsContainer   ← 4.8 / 4.9 主路径
 *    .view:not(.hide) .sections                 ← 兜底
 *
 *  数据层（跨 4.8 / 4.9 / 4.10，全部是稳定 REST 路径）：
 *    ApiClient.getCurrentUserId()
 *    ApiClient.getJSON(ApiClient.getUrl('Users/{uid}/Views'))
 *    ApiClient.getJSON(ApiClient.getUrl('Users/{uid}/Items', {...}))
 *    ApiClient.getImageUrl(itemId, {type:'Backdrop',maxWidth:1920})
 *
 *  版本兼容：仅用 Emby 长期稳定的 ApiClient 方法；探测失败时降级为 demo，
 *  整个组件 try/catch 包裹，任何异常只 console.warn，绝不影响原生渲染。
 * =============================================================================
 */
(function () {
  'use strict';
  if (window.VanvyHome) return;

  var CFG = {
    perLib: 8,            // 每个媒体库取几条
    slideMs: 6500,        // 单片停留
    libMs: 0,             // >0 时自动切库（毫秒），0=关闭
    theme: 'aurora',      // 配色预设 key（由部署脚本写入 config.js，用户安装时选）

    // ── 配色预设（用户可在页面上切换，存 localStorage）─────────────
    presets: [
      { key: 'aurora',  name: '极光蓝', a: '#3ea6ff', b: '#7c5cff', bg: '#08080c' },
      { key: 'blackgold',name: '黑金',  a: '#e8c66a', b: '#a8741a', bg: '#070608' },
      { key: 'champagne',name:'香槟金', a: '#f2dfa8', b: '#c9a86a', bg: '#08070a' },
      { key: 'emerald', name: '翡翠绿', a: '#10d9a3', b: '#0ea5e9', bg: '#050b0a' },
      { key: 'sakura',  name: '樱花粉', a: '#ff6b9d', b: '#c86dd7', bg: '#0c070c' },
      { key: 'sunset',  name: '落日橙', a: '#ff9a3d', b: '#ff4d6d', bg: '#0c0805' },
      { key: 'amber',   name: '琥珀金', a: '#ffc93c', b: '#e08e2b', bg: '#0a0805' },
      { key: 'crimson', name: '赤霞红', a: '#ff4d5e', b: '#a1213f', bg: '#0c0507' },
      { key: 'violet',  name: '幻紫',   a: '#a855f7', b: '#6366f1', bg: '#08060e' },
      { key: 'graphite',name: '石墨灰', a: '#cbd5e1', b: '#64748b', bg: '#0a0b0d' }
    ],
    // 默认自动载入 config.js（部署时由 install.sh 生成）
    configUrl: (function () {
      try { return (document.currentScript && document.currentScript.src || '').replace(/\/[^/]*$/, '/') + 'config.js'; }
      catch (e) { return 'vanvy-home/config.js'; }
    })(),
    skipTypes: { boxsets: 1, playlists: 1, folders: 1, livetv: 1, 'homevideos': 1 },
    imageMaxW: 1920,
    backdropOpacity: 1,            // 背景图不透明度 (0~1) — 1=完整显示
    backdropBlur: 0,               // 背景图模糊 (px)
    backdropTint: 'rgba(8,8,12,0)',   // 整体色调层（默认透明，不遮图）
    veilStrength: 0.55             // 底部渐隐强度（仅保证文字可读，不遮挡画面主体）
  };

  var state = { views: [], cur: 0, slide: 0, slideTimer: null, libTimer: null, mounted: false, mounting: false, sig: null, retryAt: 0 };
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ── 切换动效（统一运动系统 v1）──────────────────────────────
     与设计师/hero 引擎同一套节奏：文字错峰浮现 + 背景图柔和溶解。
     只动 opacity/transform/filter；尊重 prefers-reduced-motion。*/
  var MOTION = (function () {
    var CFG = { text: 620, img: 700, stagger: 65, max: 8, ease: 'cubic-bezier(.22,.75,.2,1)' };
    try { if (window.VANVY_MOTION_CFG) for (var k in window.VANVY_MOTION_CFG) CFG[k] = window.VANVY_MOTION_CFG[k]; } catch (e) {}
    var reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    function css() {
      if (document.getElementById('vanvy-motion-css')) return;
      var s = document.createElement('style'); s.id = 'vanvy-motion-css';
      s.textContent =
        '@keyframes vnvTextIn{from{opacity:0;transform:translate3d(0,16px,0);filter:blur(7px)}to{opacity:1;transform:none;filter:blur(0)}}'
        + '@keyframes vnvImgIn{from{opacity:.5}to{opacity:1}}'
        + '@media (prefers-reduced-motion:reduce){.vnv-a-text,.vnv-a-img{animation:none!important}}';
      (document.head || document.documentElement).appendChild(s);
    }
    function restart(el, anim) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = anim;
    }
    function play(root) {
      if (!root || reduced || window.VANVY_MOTION === false) return;
      css();
      // 文字：标题/元信息/简介/按钮 错峰浮现
      var blocks = ['#vh-info .vh-tag', '#vh-info h1', '#vh-info .vh-meta', '#vh-info .vh-syn', '#vh-info .vh-cta'];
      var n = 0;
      blocks.forEach(function (sel) {
        Array.prototype.forEach.call(root.querySelectorAll(sel), function (el) {
          if (n >= CFG.max) return;
          try { if (getComputedStyle(el).display === 'none') return; } catch (e) {}
          restart(el, 'vnvTextIn ' + CFG.text + 'ms ' + CFG.ease + ' ' + (n * CFG.stagger) + 'ms both');
          n++;
        });
      });
      // 背景图：柔和溶解
      var bd = root.querySelector('#vh-bd');
      if (bd && bd.getAttribute('src')) restart(bd, 'vnvImgIn ' + CFG.img + 'ms ease both');
    }
    return { play: play, cfg: CFG, reduced: reduced };
  })();

  // 等待 Emby 的 ApiClient 就绪（页面上下文内可直接用）
  async function waitApiClient(timeout) {
    var t0 = Date.now();
    while (Date.now() - t0 < (timeout || 20000)) {
      if (window.ApiClient) {
        try { await window.ApiClient.getCurrentUserId(); return window.ApiClient; } catch (e) { /* not ready */ }
      }
      await sleep(120);
    }
    return null;
  }

  // ── 数据层 ────────────────────────────────────────────────────────────────
  async function loadData() {
    // demo 模式：本地预览注入真实快照
    if (!window.ApiClient && window.__VANVY_DEMO_DATA__) {
      return window.__VANVY_DEMO_DATA__.libs.map(function (l) {
        return { name: l.name, id: l.id, items: l.items.map(normDemo) };
      });
    }
    var api = await waitApiClient();
    if (!api) throw new Error('ApiClient 不可用');
    var uid = await api.getCurrentUserId();
    var views = await api.getJSON(api.getUrl('Users/' + uid + '/Views'));

    var libs = [];
    for (var i = 0; i < views.Items.length; i++) {
      var v = views.Items[i];
      if (CFG.skipTypes[v.CollectionType]) continue;
      var res;
      try {
        res = await api.getJSON(api.getUrl('Users/' + uid + '/Items', {
          ParentId: v.Id,
          SortBy: 'DateCreated',
          SortOrder: 'Descending',
          Recursive: true,
          IncludeItemTypes: 'Movie,Series',
          Limit: CFG.perLib,
          ImageTypes: 'Backdrop,Primary',
          Fields: 'ProductionYear,CommunityRating,Overview,Genres,RunTimeTicks,UserData'
        }));
      } catch (e) { console.warn('[VanvyHome] 库读取失败', v.Name, e); continue; }

      var items = (res.Items || []).filter(function (it) {
        return (it.CommunityRating > 0) || ((it.ProductionYear || 0) >= 2020);
      }).slice(0, CFG.perLib).map(function (it) {
        return {
          id: it.Id,
          title: it.Name,
          type: it.Type,
          year: it.ProductionYear,
          rating: it.CommunityRating ? Math.round(it.CommunityRating * 10) / 10 : 0,
          genres: (it.Genres || []).slice(0, 3),
          overview: (it.Overview || '').replace(/\s+/g, ' ').slice(0, 220),
          runtime: it.RunTimeTicks ? Math.round(it.RunTimeTicks / 600000000) : 0,
          fav: !!(it.UserData && it.UserData.IsFavorite),
          backdrop: api.getImageUrl(it.Id, { type: 'Backdrop', maxWidth: CFG.imageMaxW }),
          poster: api.getImageUrl(it.Id, { type: 'Primary', maxWidth: 420 })
        };
      });
      if (items.length) libs.push({ name: v.Name, id: v.Id, items: items });
    }
    return libs;
  }

  function normDemo(it) { return it; } // data.json 已是目标结构(相对路径)

  // ── 渲染层 ────────────────────────────────────────────────────────────────
  function metaHtml(it) {
    var g = (it.genres || []).join(' / ');
    var rt = it.runtime ? Math.floor(it.runtime / 60) + 'h ' + (it.runtime % 60) + 'm' : '';
    return '<span class="vh-star">★ ' + (it.rating || '—') + '</span>'
      + (it.year ? '<span>' + it.year + '</span><span>·</span>' : '')
      + (g ? '<span>' + esc(g) + '</span>' : '')
      + (rt ? '<span>·</span><span>' + rt + '</span>' : '')
      + '<span class="vh-chip res">4K</span>';
  }

  function root() { return $('.vanvy-home'); }

  function renderTabs() {
    var el = $('#vh-tabs', root());
    if (!el) return;
    el.innerHTML = state.views.map(function (l, i) {
      return '<button class="' + (i === state.cur ? 'on' : '') + '" data-i="' + i + '">'
        + '<span class="nm">' + esc(l.name) + '</span><span class="cnt">' + l.items.length + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(el.children, function (b) {
      b.onclick = function () { switchLib(+b.dataset.i, true); };
    });
  }

  function markTabs() {
    var t = $('#vh-tabs', root()); if (!t) return;
    Array.prototype.forEach.call(t.children, function (b, i) {
      b.classList.toggle('on', i === state.cur);
    });
  }

  function renderHero() {
    var r = root(); if (!r) return;
    var L = state.views[state.cur]; if (!L || !L.items.length) return;
    var it = L.items[state.slide % L.items.length];

    var img = $('#vh-bd', r);
    // 优先等背景图真正解码完成再通知外部（消除"先白一下再出图"的卡顿）
    img.onload = function () { markReady(); };
    img.onerror = function () { img.onerror = null; img.src = it.poster; markReady(); };
    img.src = it.backdrop;
    if (img.complete && img.naturalWidth > 0) markReady();

    $('#vh-info', r).innerHTML =
      '<div class="vh-tag">' + esc(L.name) + ' · 最新入库</div>'
      + '<h1>' + esc(it.title) + '</h1>'
      + '<div class="vh-meta">' + metaHtml(it) + '</div>'
      + (it.overview ? '<p class="vh-syn">' + esc(it.overview) + '</p>' : '')
      + '<div class="vh-cta">'
      + '<div class="vh-btn play" data-act="play">▶&nbsp; 立即播放</div>'
      + '<div class="vh-btn ghost" data-act="fav">' + (it.fav ? '♥&nbsp; 已收藏' : '♥&nbsp; 收藏') + '</div>'
      + '<div class="vh-btn ghost" data-act="detail">ⓘ&nbsp; 详情</div>'
      + '</div>';

    // 按钮 → 原生跳转（详情/播放用 Emby 原生路由，功能不丢）
    Array.prototype.forEach.call(r.querySelectorAll('.vh-btn'), function (b) {
      b.onclick = function () { nativeAction(b.dataset.act, it, b); };
    });

    var dots = $('#vh-dots', r);
    dots.innerHTML = L.items.map(function (_, i) { return '<i class="' + (i === state.slide ? 'on' : '') + '"></i>'; }).join('');
    try { MOTION.play(r); } catch (e) {}   // 切张动效
    Array.prototype.forEach.call(dots.children, function (d, i) { d.onclick = function () { show(i); restart(); }; });

    var th = $('#vh-thumbs', r);
    th.innerHTML = L.items.slice(0, 6).map(function (x, i) {
      return '<div class="t ' + (i === state.slide ? 'on' : '') + '"><img src="' + x.backdrop
        + '" onerror="this.onerror=null;this.src=\'' + x.poster + '\'"></div>';
    }).join('');
    Array.prototype.forEach.call(th.children, function (t, i) { t.onclick = function () { show(i); restart(); }; });
  }

  // 调用 Emby 原生：详情页 / 播放器（保证功能完全保留）
  function nativeAction(act, it, b) {
    try {
      if (act === 'detail') {
        var srv = (window.ApiClient && ApiClient.serverId && ApiClient.serverId()) || '';
        if (window.Emby && Emby.Page && Emby.Page.showItem) Emby.Page.showItem(it.id, srv);
        else location.hash = '!/item?id=' + it.id + (srv ? ('&serverId=' + srv) : '');
        return;
      }
      if (act === 'play') {
        if (window.Emby && Emby.Page) Emby.Page.playItem({ ids: [it.id], serverId: window.ApiClient.serverId() });
        return;
      }
      if (act === 'fav') {
        var nf = !it.fav;
        if (window.ApiClient) window.ApiClient.updateFavorite(it.id, nf);
        it.fav = nf;
        if (b) { b.innerHTML = nf ? '♥&nbsp; 已收藏' : '♥&nbsp; 收藏'; b.classList.toggle('on', nf); }
      }
    } catch (e) { console.warn('[VanvyHome] nativeAction', e); }
  }

  // 向外部（预热加载页）宣告：大屏轮播已就绪，可以无缝切过去
  function markReady() {
    if (window.__VANVY_HOME_READY__) return;
    window.__VANVY_HOME_READY__ = true;
    document.body.classList.add('vanvy-home-ready');
    console.log('[VanvyHome] 首屏就绪 (__VANVY_HOME_READY__)');
  }
  window.__vanvyHomeReady = markReady;

  function show(n) {
    var L = state.views[state.cur];
    state.slide = (n + L.items.length) % L.items.length;
    renderHero();
  }
  function nextSlide() { show(state.slide + 1); }
  function restart() { clearInterval(state.slideTimer); state.slideTimer = setInterval(nextSlide, CFG.slideMs); }
  function switchLib(i, user) {
    state.cur = i; state.slide = 0;
    markTabs(); renderHero(); restart();
    positionTabs();
    if (user) { clearInterval(state.libTimer); if (CFG.libMs) state.libTimer = setInterval(cycleLib, CFG.libMs); }
  }
  function cycleLib() { if (state.views.length > 1) switchLib((state.cur + 1) % state.views.length, false); }
  window.__vhGo = function (d) { show(state.slide + d); restart(); };

  // 把库标签定位到 Emby 原生标签栏【下方】，避免重叠（桌面/手机都适用）
  function positionTabs() {
    var r = root(); if (!r) return;
    var el = $('#vh-tabs', r); if (!el) return;
    try {
      if (window.scrollY > 8) return;            // 只在页顶测量，避免滚动误判
      var heroTop = r.getBoundingClientRect().top;
      // 原生标签栏（首页/收藏夹）可能是独立元素，也算进 header
      var sel = '.tabs-viewmenubar, .headerMiddle.sectionTabs, .sectionTabs';
      var nodes = document.querySelectorAll(sel);
      var bottom = -1;
      for (var i = 0; i < nodes.length; i++) {
        var b = nodes[i].getBoundingClientRect().bottom;
        if (b > bottom) bottom = b;
      }
      if (bottom < 0 || bottom - heroTop < 20) {
        var hdr = document.querySelector('.skinHeader');
        bottom = hdr ? hdr.getBoundingClientRect().bottom : heroTop + 72;
      }
      var top = bottom - heroTop + 10;           // 原生标签下方 10px
      el.style.setProperty('--vh-tabs-top', Math.max(56, Math.round(top)) + 'px');
    } catch (e) {}
  }

  function scheduleTabPosition() {
    [0, 200, 500, 900, 1600, 2600].forEach(function (ms) { setTimeout(positionTabs, ms); });
  }

  // ── 配色主题（由部署时 config.js 决定，无页面 UI）──────────────
  function presetByKey(k) {
    for (var i = 0; i < CFG.presets.length; i++) if (CFG.presets[i].key === k) return CFG.presets[i];
    return CFG.presets[0];
  }
  function applyTheme(r, key) {
    var p = presetByKey(key);
    r.setAttribute('data-vh-theme', p.key);
    r.style.setProperty('--vh-accent', p.a);
    r.style.setProperty('--vh-accent2', p.b);
    r.style.setProperty('--vh-bg', p.bg);
    state.theme = p.key;
  }
  function currentTheme() { return CFG.theme || 'aurora'; }
  function setTheme(key) { var r = root(); if (r) applyTheme(r, key); }
  // 载入 config.js（部署时生成）并应用主题
  function loadConfig() {
    return new Promise(function (resolve) {
      try {
        if (window.VANVY_HOME_CONFIG) {
          if (window.VANVY_HOME_CONFIG.theme) CFG.theme = window.VANVY_HOME_CONFIG.theme;
          return resolve();
        }
      } catch (e) {}
      var s = document.createElement('script');
      s.src = CFG.configUrl + (CFG.configUrl.indexOf('?') === -1 ? '?t=' + Date.now() : '');
      s.onload = function () {
        try { if (window.VANVY_HOME_CONFIG && window.VANVY_HOME_CONFIG.theme) CFG.theme = window.VANVY_HOME_CONFIG.theme; } catch (e) {}
        resolve();
      };
      s.onerror = function () { resolve(); };   // 没配置就用默认，不影响
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // ── 背景层参数（由 CSS 变量控制，无 UI）──────────────────────────────────
  function applyBackdrop(r) {
    r.style.setProperty('--vh-bd-opacity', CFG.backdropOpacity);
    r.style.setProperty('--vh-bd-blur', CFG.backdropBlur + 'px');
    r.style.setProperty('--vh-tint', CFG.backdropTint);
    r.style.setProperty('--vh-veil', CFG.veilStrength);
  }

  function template() {
    var d = document.createElement('div');
    d.className = 'vanvy-home';
    d.innerHTML = [
      '<div class="vh-bdwrap"><img id="vh-bd" alt=""></div>',
      '<div class="vh-tint"></div><div class="vh-veil"></div>',
      '<div class="vh-tabs" id="vh-tabs"></div>',
      '<div class="vh-in" id="vh-info"></div>',
      '<div class="vh-arrow l" onclick="__vhGo(-1)">‹</div>',
      '<div class="vh-arrow r" onclick="__vhGo(1)">›</div>',
      '<div class="vh-dots" id="vh-dots"></div>',
      '<div class="vh-thumbs" id="vh-thumbs"></div>'
    ].join('');
    var sec = document.createElement('section');
    sec.className = 'vanvy-home-section';
    sec.appendChild(d);
    return sec;
  }

  // ── 挂载 / 清理（路由感知）────────────────────────────────────────────────
  // 高度自适应：hero 高度 = 所在滚动容器的可视高度
  //  4.8: 首页内容在 body 里流动 → 按视口算
  //  4.9: .homeSectionsContainer 是固定视口高的独立滚动区 → 按其下边缘算（否则底部留白）
  function fitHomeHeight(sec) {
    if (!sec) return;
    var hr = sec.getBoundingClientRect();
    var avail = window.innerHeight - hr.top;
    var n = sec.parentElement, scroller = null;
    while (n && n !== document.documentElement) {
      var cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.clientHeight > 0) { scroller = n; break; }
      n = n.parentElement;
    }
    if (scroller) {
      var sr = scroller.getBoundingClientRect();
      avail = Math.min(sr.bottom, window.innerHeight) - hr.top;
    }
    var H = Math.max(320, Math.min(avail, window.innerHeight));
    try { sec.style.setProperty('--vh-hero-h', Math.round(H) + 'px'); } catch (e) {}
  }

  function findContainer() {
    return $('.view:not(.hide) .homeSectionsContainer') || $('.view:not(.hide) .sections') || $('.homeSectionsContainer');
  }

  function cleanup() {
    clearInterval(state.slideTimer); clearInterval(state.libTimer);
    // 解绑本轮 mount 注册的 window/document 监听（否则每次回首页都累积一份）
    try { if (state.sig) { state.sig.abort(); state.sig = null; } } catch (e) {}
    document.querySelectorAll('.vanvy-home-section').forEach(function (el) { el.remove(); });
    document.body.classList.remove('vanvy-home-active');
    state.mounted = false;
  }

  async function mount() {
    if (state.mounted || state.mounting) return;
    var c = findContainer();
    if (!c) return false;
    state.mounting = true;
    try {
      if (!state.views.length) {
        state.views = await loadData();
      }
      if (!state.views.length) return false;   // 未登录/无数据 → 下个 tick 再试

      // 防重：已存在就清理
      document.querySelectorAll('.vanvy-home-section').forEach(function (el) { el.remove(); });

      // 统一取消源：cleanup 时一次性解绑所有 window/document 监听
      try { state.sig = new AbortController(); } catch (e) { state.sig = null; }
      var _sig = state.sig ? { signal: state.sig.signal } : {};

      state.mounted = true;
      var sec = template();
      // 抵消 Emby 首页容器的顶部内边距，让轮播从滚动区最顶端开始
      try {
        var pt = parseFloat(getComputedStyle(c).paddingTop) || 0;
        if (pt > 0) sec.style.marginTop = (-pt) + 'px';
      } catch (e) {}
      c.insertBefore(sec, c.firstChild);
      fitHomeHeight(sec);
      setTimeout(function () { fitHomeHeight(sec); }, 120);
      setTimeout(function () { fitHomeHeight(sec); }, 700);
      window.addEventListener('resize', function () { fitHomeHeight(sec); }, _sig);
      document.body.classList.add('vanvy-home-active');

    var r = root();
    applyBackdrop(r);
    applyTheme(r, currentTheme());
    renderTabs(); renderHero(); restart();
    scheduleTabPosition();
    window.addEventListener('resize', positionTabs, _sig);
    window.addEventListener('orientationchange', function () { setTimeout(positionTabs, 300); }, _sig);

    // 进入详情页时收起定时器，回首页恢复
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') window.__vhGo(1);
      if (e.key === 'ArrowLeft') window.__vhGo(-1);
    }, _sig);
    var x0 = null;
    r.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    r.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) window.__vhGo(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
    r.addEventListener('mouseenter', function () { clearInterval(state.slideTimer); });
    r.addEventListener('mouseleave', restart);

    // 兑底：即使图片事件未触发，也最迟 2.5s 告知就绪，绝不卡死
    setTimeout(markReady, 2500);
    return true;
    } finally { state.mounting = false; }
  }

  function isHome() { return location.href.indexOf('!/home') !== -1 || location.hash === '' || location.hash === '#!/home'; }

  async function tick() {
    try {
      if (!isHome()) { if (state.mounted) cleanup(); return; }
      if (Date.now() < state.retryAt) return;       // 取数失败退避，避免 1.2s 一次的无谓请求
      if (!state.mounted) {
        var ok = await mount();
        if (ok === false && !state.views.length) state.retryAt = Date.now() + 10000;
      }
    } catch (e) { console.warn('[VanvyHome] tick', e); state.retryAt = Date.now() + 10000; }
  }

  async function init() {
    // 关键：先起轮询，绝不因首次数据失败而放弃（登录前 ApiClient 未就绪）
    window.addEventListener('hashchange', tick);
    setInterval(tick, 1200);
    await loadConfig();   // 读取部署时选定的配色
    try {
      state.views = await loadData();
      console.log('[VanvyHome] 数据就绪:', state.views.map(function (l) { return l.name + '(' + l.items.length + ')'; }).join(' '));
    } catch (e) {
      console.log('[VanvyHome] 首次取数未就绪(稍后重试):', e && e.message ? e.message : e);
    }
    await tick();
  }

  window.VanvyHome = { init: init, state: state, switchLib: switchLib, cleanup: cleanup, setTheme: setTheme, presets: CFG.presets };
  console.log('[VanvyHome] loaded');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
