/* ═══════════════════════════════════════════════════════════
   Vanvy Hero Studio · 轮播核心引擎 v3
   ───────────────────────────────────────────────────────────
   设计目标：**动态效果优先 + 布局多样**
   与旧 carousel-core 的区别：
     · 内置运动引擎（Ken Burns / 视差 / 交叉淡入 / 滑动）
     · 布局与动作解耦：布局只描述"长什么样"，动作由引擎驱动
     · 统一生命周期：init → slide(i) → enter → leave
     · 触屏/键盘/自动轮播/悬停暂停 全部内置

   用法：
     VanvyHero.register('cinema', {
       query: {...},                        // 可选，覆盖默认查询
       init:  function (api) {...},         // 建 DOM，返回 true
       slide: function (item, i, api) {...}, // 切到第 i 张（更新内容）
       leave: function (item, i, api) {...}  // 可选，离场动画
     });
     VanvyHero.start('cinema');
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.VanvyHero) return;

  var DESIGNS = {};
  var uid = 0;

  // 主题运行时切换：全局只注册一次（旧实现每次 mount 都注册 → 监听器泄漏）
  var THEME_ROOTS = [];
  var _themeBound = false;
  function bindThemeBus() {
    if (_themeBound) return;
    _themeBound = true;
    try {
      if (window.Vanvy && Vanvy.on) Vanvy.on('theme', function () {
        THEME_ROOTS.forEach(function (el) { try { if (el && el.isConnected) applyTheme(el); } catch (e) {} });
      });
    } catch (e) {}
  }

  /* ── 配色预设（与加载页/详情页同源）────────────────────── */
  var PRESETS = {
    aurora:    { a: '#3ea6ff', b: '#7c5cff', bg: '#08080c' },
    blackgold: { a: '#e8c66a', b: '#a8741a', bg: '#070608' },
    champagne: { a: '#f2dfa8', b: '#c9a86a', bg: '#08070a' },
    emerald:   { a: '#10d9a3', b: '#0ea5e9', bg: '#050b0a' },
    sakura:    { a: '#ff6b9d', b: '#c86dd7', bg: '#0c070c' },
    sunset:    { a: '#ff9a3d', b: '#ff4d6d', bg: '#0c0805' },
    amber:     { a: '#ffc93c', b: '#e08e2b', bg: '#0a0805' },
    crimson:   { a: '#ff4d5e', b: '#a1213f', bg: '#0c0507' },
    violet:    { a: '#a855f7', b: '#6366f1' , bg: '#08060e' },
    graphite:  { a: '#cbd5e1', b: '#64748b', bg: '#0a0b0d' }
  };
  function themeKey() {
    try {
      if (window.VANVY_HERO_CONFIG && window.VANVY_HERO_CONFIG.theme) return window.VANVY_HERO_CONFIG.theme;
      if (window.VANVY_CORE_CONFIG && window.VANVY_CORE_CONFIG.theme) return window.VANVY_CORE_CONFIG.theme;
      if (window.Vanvy && window.Vanvy.theme) return window.Vanvy.theme;
    } catch (e) {}
    return 'blackgold';
  }
  function applyTheme(root) {
    var p = PRESETS[themeKey()] || PRESETS.blackgold;
    if (!root) return p;
    root.style.setProperty('--vh-acc', p.a);
    root.style.setProperty('--vh-acc2', p.b);
    root.style.setProperty('--vh-bg', p.bg);
    root.setAttribute('data-vh-theme', themeKey());
    return p;
  }

  /* ── 切换动效（统一运动系统 v1）──────────────────────────────
     目标：轮播切张时「文字错峰浮现 + 图片柔和溶解」，让过渡有节奏感。
     原则：① 不改任何设计稿的 DOM/CSS；② 只动 opacity/transform/filter，
           不碰设计自身的 Ken Burns / 视差（它们用 transform）→ 不打架；
           ③ 跳过隐藏层（否则会把非当前背景层点亮）；
           ④ 尊重 prefers-reduced-motion；⑤ window.VANVY_MOTION = false 可关闭。 */
  var MOTION = (function () {
    var CFG = { text: 620, img: 700, stagger: 65, max: 8, ease: 'cubic-bezier(.22,.75,.2,1)' };
    try { if (window.VANVY_MOTION_CFG) for (var k in window.VANVY_MOTION_CFG) CFG[k] = window.VANVY_MOTION_CFG[k]; } catch (e) {}
    var reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    var TEXT_SEL = '[class*="-title"],[class*="-h1"],[class*="-h2"],[class*="-sub"],[class*="-meta"],[class*="-desc"]'
      + ',[class*="-syn"],[class*="-tag"],[class*="-badge"],[class*="-btns"],[class*="-cta"],[class*="-chip"]'
      + ',[class*="-kicker"],[class*="-rating"],[class*="-year"],[class*="-genres"],h1,h2';
    var IMG_SEL = '[class*="-bd"],[class*="-bg"],[class*="-poster"]';
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
      void el.offsetWidth;                 // 强制重排 → 动画可重复触发
      el.style.animation = anim;
    }
    function textBlocks(root) {
      var all = Array.prototype.slice.call(root.querySelectorAll(TEXT_SEL));
      var out = [];
      all.forEach(function (el) {
        // ⚠️ 不能用「当前是否为空」来过滤：hero 的标题是逐字打字（play 时 textContent 还是空串）
        //     → 只按「可见性」+ 祖先去重筛选；空盒的淡入无视觉副作用。
        for (var i = 0; i < all.length; i++) { var p = all[i]; if (p !== el && p.contains(el)) return; }
        try { var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return; } catch (e) {}
        out.push(el);
      });
      return out.slice(0, CFG.max);
    }
    function play(root) {
      if (!root || reduced || window.VANVY_MOTION === false) return;
      css();
      textBlocks(root).forEach(function (el, i) {
        restart(el, 'vnvTextIn ' + CFG.text + 'ms ' + CFG.ease + ' ' + (i * CFG.stagger) + 'ms both');
      });
      Array.prototype.slice.call(root.querySelectorAll(IMG_SEL)).forEach(function (el) {
        try {
          var cs = getComputedStyle(el);
          if (!cs.backgroundImage || cs.backgroundImage === 'none') return;
          if (parseFloat(cs.opacity) < 0.15) return;   // 非当前层，别点亮
          if (el.querySelector('*')) return;            // 含子层的容器跳过
        } catch (e) { return; }
        restart(el, 'vnvImgIn ' + CFG.img + 'ms ease both');
      });
    }
    return { play: play, cfg: CFG, reduced: reduced };
  })();

  /* ── 通用工具 ────────────────────────────────────────────── */
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function year(it) { return it.ProductionYear || ''; }
  function rating(it) { return it.CommunityRating ? (Math.round(it.CommunityRating * 10) / 10).toFixed(1) : ''; }
  function genres(it, n) { return (it.Genres || []).slice(0, n || 2).join(' / '); }
  function clip(s, n) { s = s || ''; return s.length > n ? s.slice(0, n) + '…' : s; }

  /* ── 内置运动：Ken Burns（缓慢推拉）──────────────────────── */
  function kenBurns(el, seed) {
    if (!el) return;
    var variants = [
      'scale(1.14) translate(2%, 1%)',
      'scale(1.10) translate(-2%, -1%)',
      'scale(1.16) translate(-1%, 2%)',
      'scale(1.11) translate(1%, -2%)'
    ];
    var v = variants[(seed || 0) % variants.length];
    el.style.transition = 'opacity .9s ease';
    el.style.transformOrigin = seed % 2 ? '30% 40%' : '70% 60%';
    el.style.transform = v;
  }

  /* ── 内置运动：视差（鼠标/陀螺仪）────────────────────────── */
  function parallax(root, layers, strength) {
    if (!root || !layers.length) return;
    var st = strength || 14;
    var raf = null, tx = 0, ty = 0;
    function apply() {
      raf = null;
      layers.forEach(function (L) {
        var d = L.depth == null ? 1 : L.depth;
        L.el.style.transform = 'translate3d(' + (-tx * st * d) + 'px,' + (-ty * st * d) + 'px,0)';
      });
    }
    function onMove(e) {
      var r = root.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    }
    // ⚠️ 统一用 mount() 建立的 AbortController（cleanup 时一次性解绑，避免 listener 泄漏）
    var _sig = (root.__vdAC) ? { signal: root.__vdAC.signal } : {};
    root.addEventListener('mousemove', onMove, _sig);
    root.addEventListener('mouseleave', function () { tx = ty = 0; if (!raf) raf = requestAnimationFrame(apply); }, _sig);
    // 陀螺仪（移动端）
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 45));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
      if (!raf) raf = requestAnimationFrame(apply);
    }, _sig);
  }

  /* ── 内置运动：文字逐字/逐行浮现 ─────────────────────────── */
  function typeIn(el, text, speed) {
    if (!el) return;
    el.textContent = '';
    var i = 0, sp = speed || 42;
    clearInterval(el.__vt);
    el.__vt = setInterval(function () {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(el.__vt);
    }, sp);
  }

  /* ── 数字滚动（评分等）───────────────────────────────────── */
  function countTo(el, to, dur) {
    if (!el) return;
    var from = 0, t0 = performance.now(), d = dur || 700;
    (function step(t) {
      var k = Math.min(1, (t - t0) / d);
      k = 1 - Math.pow(1 - k, 3);
      el.textContent = (from + (to - from) * k).toFixed(1);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ── 顶栏避让：抵消首页容器的 padding-top ──────────────────
     4.8 的 .homeSectionsContainer 带 padding-top(=顶栏高度 131px)，
     不抵消的话 hero 从 y=131 起 → 图片进不到顶栏后面（设计稿是 100vh 从 0 起）。
     banner_home(生产版) 就是这么做的，这里保持一致。 */
  function offsetTopPadding(sec) {
    if (!sec) return;
    try {
      var c = sec.parentElement, pt = 0;
      while (c && c !== document.body) {
        var v = parseFloat(getComputedStyle(c).paddingTop) || 0;
        if (v > 0) { pt = v; break; }
        c = c.parentElement;
      }
      sec.style.marginTop = pt > 0 ? (-pt) + 'px' : '';
    } catch (e) {}
  }

  /* ── 高度自适应：hero 高度 = 所在滚动容器的可视高度 ────────
     为什么不用 100vh / 86vh？
       Emby 4.8 首页内容在 body 里正常流动；
       Emby 4.9 的 .homeSectionsContainer 是「固定视口高的独立滚动区」，
       写死 86vh 时底部会露出下一区块的留白 → 实测 4.9 差 126px。
     实测滚动容器可视高度后写进 CSS 变量，两个版本都能铺满。 */
  function fitHero(rootEl) {
    if (!rootEl) return;
    var hr = rootEl.getBoundingClientRect();
    var avail = window.innerHeight - hr.top;
    // 找最近的纵向滚动容器（固定高滚动区需要按它的下边缘算）
    var n = rootEl.parentElement, scroller = null;
    while (n && n !== document.documentElement) {
      var cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.clientHeight > 0) { scroller = n; break; }
      n = n.parentElement;
    }
    if (scroller) {
      var sr = scroller.getBoundingClientRect();
      avail = Math.min(sr.bottom, window.innerHeight) - hr.top;
    }
    // 夹取：不小于 320，不超过一屏
    var H = Math.max(320, Math.min(avail, window.innerHeight));
    try { rootEl.style.setProperty('--vh-hero-h', Math.round(H) + 'px'); } catch (e) {}
  }

  /* ── 图片 URL（Emby 要 itemId 字符串！）──────────────────── */
  function img(item, opts) {
    opts = opts || {};
    var type = opts.type || 'Backdrop';
    var w = opts.maxWidth || 1920;
    var id = (item && typeof item === 'object') ? (item.Id || '') : (item || '');
    if (!id) return '';
    try {
      if (window.ApiClient && window.ApiClient.getImageUrl) {
        return window.ApiClient.getImageUrl(id, { type: type, maxWidth: w });
      }
    } catch (e) {}
    var base = (window.ApiClient && window.ApiClient.serverAddress) ? window.ApiClient.serverAddress() : '';
    return base + '/emby/Items/' + id + '/Images/' + type + '?maxWidth=' + w;
  }

  /* ── 数据 ────────────────────────────────────────────────── */
  var DEFAULT_QUERY = {
    ImageTypes: 'Backdrop',
    EnableImageTypes: 'Backdrop,Primary,Logo,Thumb',
    IncludeItemTypes: 'Movie,Series',
    SortBy: 'DateCreated',
    Recursive: true,
    Limit: 8,
    Fields: 'ProductionYear,Overview,CommunityRating,Genres,OfficialRating,RunTimeTicks',
    EnableUserData: false,
    EnableTotalRecordCount: false
  };

  function getItems(query) {
    return new Promise(function (resolve) {
      var tries = 0;
      (function wait() {
        if (window.ApiClient && window.ApiClient.getCurrentUserId) {
          try {
            window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), query)
              .then(function (d) { resolve(d || { Items: [] }); })
              .catch(function () { resolve({ Items: [] }); });
          } catch (e) { resolve({ Items: [] }); }
          return;
        }
        if (++tries > 150) return resolve({ Items: [] });
        setTimeout(wait, 100);
      })();
    });
  }

  /* ── 引擎实例 ────────────────────────────────────────────── */
  function createApi(id, root, items, def) {
    var api = {
      id: id, root: root, items: items, index: -1, total: items.length,
      $: function (s) { return $(s, root); },
      $$: function (s) { return $$(s, root); },
      img: img, esc: esc, year: year, rating: rating, genres: genres, clip: clip,
      kenBurns: kenBurns, parallax: parallax, typeIn: typeIn, countTo: countTo,
      applyTheme: function () { return applyTheme(root); },
      theme: function () { return (PRESETS[themeKey()] || PRESETS.blackgold); },
      /** 切到第 i 张 */
      go: function (i) {
        if (!api.total) return;
        var prev = api.index;
        i = ((i % api.total) + api.total) % api.total;
        if (i === prev && prev >= 0) return;   // 首次(index=-1)允许
        api.index = i;
        if (def.leave && prev >= 0) { try { def.leave(items[prev], prev, api); } catch (e) {} }
        try { def.slide(items[i], i, api); } catch (e) { console.warn('[VanvyHero] slide', id, e); }
        try { MOTION.play(root); } catch (e) {}   // 切张动效：文字错峰浮现 + 图片溶解
        api.emit('slide', { index: i, item: items[i] });
      },
      next: function () { api.go(api.index + 1); },
      prev: function () { api.go(api.index - 1); },
      /** 自动轮播（毫秒）；悬停暂停 */
      autoplay: function (ms) {
        api.__ms = ms;                       // 记住间隔，供 mouseleave 恢复
        api.stopAuto();
        if (!ms || api.total < 2) return;
        api.__auto = setInterval(api.next, ms);
        // ⚠️ 监听器只绑一次（旧实现每次 autoplay 都重绑，mouseleave 里又递归调 autoplay → 指数增长）
        if (api.__hoverBound) return;
        api.__hoverBound = 1;
        root.addEventListener('mouseenter', function () {
          api.__autoPaused = true;
          api.stopAuto();
        });
        root.addEventListener('mouseleave', function () {
          if (!api.__autoPaused) return;
          api.__autoPaused = false;
          api.stopAuto();
          if (api.__ms && api.total >= 2) api.__auto = setInterval(api.next, api.__ms);
        });
      },
      stopAuto: function () { if (api.__auto) { clearInterval(api.__auto); api.__auto = null; } },
      /** 事件总线 */
      on: function (evt, fn) { (api.__ev[evt] = api.__ev[evt] || []).push(fn); return api; },
      emit: function (evt, d) { (api.__ev[evt] || []).forEach(function (f) { try { f(d); } catch (e) {} }); },
      __ev: {}
    };
    return api;
  }

  window.VanvyHero = {
    /** 注册布局 */
    register: function (id, def) {
      if (!id || !def) return false;
      DESIGNS[id] = def;
      return true;
    },
    list: function () { return Object.keys(DESIGNS); },
    get: function (id) { return DESIGNS[id] || null; },

    /** 挂载（按注册名）*/
    mount: function (id, rootEl) {
      var def = DESIGNS[id];
      if (!def || !rootEl) return Promise.resolve(null);
      // 统一取消源：所有 window/document/visibility 监听器都带 signal，cleanup 时一次性解绑
      try { rootEl.__vdAC = new AbortController(); } catch (e) { rootEl.__vdAC = null; }
      var _sig = rootEl.__vdAC ? { signal: rootEl.__vdAC.signal } : {};
      applyTheme(rootEl);                      // ① 主题先落地（CSS 变量）
      var query = Object.assign({}, DEFAULT_QUERY, def.query || {});
      return getItems(query).then(function (data) {
        var items = (data && data.Items) ? data.Items : [];
        if (!items.length) { rootEl.remove(); return null; }
        var api = createApi(id, rootEl, items, def);
        try {
          var ok = def.init ? def.init(api) : true;
          if (ok === false) { rootEl.remove(); return null; }
        } catch (e) {
          console.warn('[VanvyHero] init 失败', id, e); rootEl.remove(); return null;
        }
        api.__started = true;
        offsetTopPadding(rootEl);
        fitHero(rootEl);
        setTimeout(function () { offsetTopPadding(rootEl); fitHero(rootEl); }, 120);
        setTimeout(function () { offsetTopPadding(rootEl); fitHero(rootEl); }, 700);
        // 移动端：工具栏收展 / 旋转 / 可视视口变化都要重算（innerHeight 会变）
        var refit = function () { offsetTopPadding(rootEl); fitHero(rootEl); };
        window.addEventListener('resize', refit, _sig);
        window.addEventListener('orientationchange', function () { setTimeout(refit, 300); }, _sig);
        try {
          if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', refit, _sig);
            window.visualViewport.addEventListener('scroll', refit, _sig);
          }
        } catch (e) {}
        // 轮播容器尺寸变化（布局完成/图片撑开）再对一次
        try {
          if (window.ResizeObserver) {
            rootEl.__vdRO = new ResizeObserver(function () { fitHero(rootEl); });
            rootEl.__vdRO.observe(rootEl.parentElement || rootEl);
          }
        } catch (e) {}
        // 首图加载完再校一次（移动端起图慢，布局可能后变）
        try {
          var _im = rootEl.querySelector('img');
          if (_im) { if (_im.complete) setTimeout(refit, 200); else _im.addEventListener('load', function () { setTimeout(refit, 60); }, { once: true }); }
        } catch (e) {}
        api.go(0);
        // 主题切换时实时跟随（总线只注册一次）
        THEME_ROOTS.push(rootEl); bindThemeBus();
        // 键盘
        document.addEventListener('keydown', function (e) {
          var v = document.querySelector('.vanvy-hero-' + id);
          if (!v || v.offsetParent === null) return;
          if (e.key === 'ArrowRight') api.next();
          if (e.key === 'ArrowLeft') api.prev();
        }, _sig);
        // 触屏滑动
        var sx = 0;
        rootEl.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
        rootEl.addEventListener('touchend', function (e) {
          var dx = (e.changedTouches[0].clientX - sx);
          if (Math.abs(dx) > 46) { dx < 0 ? api.next() : api.prev(); }
        }, { passive: true });
        window.__vanvyHeroReady = true;
        return api;
      });
    },

    /** 启动（监听首页路由，挂载/清理）*/
    start: function (id) {
      var KEY = 'VanvyHero_' + id + '_on';
      if (window[KEY]) return;
      window[KEY] = true;
      var cls = 'vanvy-hero-' + id;
      function cleanup() {
        document.querySelectorAll('.' + cls).forEach(function (e) {
          // ① 解绑所有带 signal 的 window/document 监听器
          try { if (e.__vdAC) { e.__vdAC.abort(); e.__vdAC = null; } } catch (er) {}
          // ② 断开 ResizeObserver
          try { if (e.__vdRO) { e.__vdRO.disconnect(); e.__vdRO = null; } } catch (er) {}
          // ③ 清理定时器（含子元素上的打字/自动轮播）
          var _i = THEME_ROOTS.indexOf(e);
          if (_i >= 0) THEME_ROOTS.splice(_i, 1);
          try { if (e.__vbdTimer) { clearInterval(e.__vbdTimer); e.__vbdTimer = null; } } catch (er) {}
          try { if (e.__vt) { clearInterval(e.__vt); e.__vt = null; } } catch (er) {}
          e.querySelectorAll('*').forEach(function (k) {
            try { if (k.__vt) { clearInterval(k.__vt); k.__vt = null; } } catch (er) {}
            try { if (k.__vbdTimer) { clearInterval(k.__vbdTimer); k.__vbdTimer = null; } } catch (er) {}
          });
          e.remove();
        });
      }
      var last = location.href;
      // 取数失败/无数据时的退避：避免每 160ms 重建-销毁-再请求的死循环
      var retryAt = 0;
      setInterval(function () {
        if (location.href !== last) {
          last = location.href;
          if (location.href.indexOf('!/home') === -1) cleanup();
        }
        if (location.href.indexOf('!/home') === -1) { cleanup(); return; }
        if (Date.now() < retryAt) return;
        $$('.hide .' + cls).forEach(function (e) { e.remove(); });
        var c = $('.view:not(.hide) .homeSectionsContainer') || $('.view:not(.hide) .sections') ||
                $('.homeSectionsContainer') || $('.sections');
        if (!c) return;
        if (c.closest && c.closest('.hide')) return;
        if ($('.' + cls)) return;
        var root = document.createElement('div');
        root.className = cls;
        c.insertBefore(root, c.firstChild);
        Promise.resolve(window.VanvyHero.mount(id, root)).then(function (api) {
          if (!api) retryAt = Date.now() + 15000;   // 15s 后再试（登录前/空库友好）
        }).catch(function () { retryAt = Date.now() + 15000; });
      }, 160);
    },

    version: '3.3.2',
    fitHero: fitHero,
    presets: PRESETS,
    motion: MOTION,
    applyTheme: applyTheme,
    _utils: { img: img, esc: esc, kenBurns: kenBurns, parallax: parallax, typeIn: typeIn, countTo: countTo, clip: clip, year: year, rating: rating, genres: genres }
  };
  console.log('[VanvyHero] core v3.3.2 loaded');
})();
