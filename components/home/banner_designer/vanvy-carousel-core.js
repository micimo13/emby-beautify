/* ═══════════════════════════════════════════════════════════
   Vanvy Emby Kit V2 · 轮播核心引擎 (carousel-core)
   ───────────────────────────────────────────────────────────
   通用: 首页路由监听 / 挂载管理 / Emby API 数据获取 / 图片URL
   设计师组件只需实现 render(items, root) 渲染自己的模板
   用法:
     VanvyCarouselCore.register('banner_neo', {
       query: {...},           // 覆盖默认查询
       render: function(items, root) { root.innerHTML = ... }
     })
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.VanvyCarouselCore) return;

  var COMPONENTS = {};

  /* ── 配色预设（与加载页/详情页/hero-core 同源）─────────────
     设计师系列里 banner_neo / orbital / retro 会读 --vanvy-accent-* ，
     其默认值（霓虹青/天蓝/胶片金）只是 CSS fallback；选了配色就该跟随。 */
  var PRESETS = {
    aurora:    { a: '#3ea6ff', b: '#7c5cff' },
    blackgold: { a: '#e8c66a', b: '#a8741a' },
    champagne: { a: '#f2dfa8', b: '#c9a86a' },
    emerald:   { a: '#10d9a3', b: '#0ea5e9' },
    sakura:    { a: '#ff6b9d', b: '#c86dd7' },
    sunset:    { a: '#ff9a3d', b: '#ff4d6d' },
    amber:     { a: '#ffc93c', b: '#e08e2b' },
    crimson:   { a: '#ff4d5e', b: '#a1213f' },
    violet:    { a: '#a855f7', b: '#6366f1' },
    graphite:  { a: '#cbd5e1', b: '#64748b' }
  };
  function hexRgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return '255,255,255';
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
  }
  function themeKey() {
    try {
      if (window.VANVY_BANNER_CONFIG && window.VANVY_BANNER_CONFIG.theme) return window.VANVY_BANNER_CONFIG.theme;
      if (window.Vanvy && window.Vanvy.theme) return window.Vanvy.theme;
    } catch (e) {}
    return '';
  }
  function applyTheme(rootEl) {
    var k = themeKey();
    var p = k ? PRESETS[k] : null;
    // 未指定主题 / 主题名不认 → 不覆盖，保留设计原色（CSS 里的 fallback）
    if (!p) return null;
    if (!rootEl || !rootEl.style) return p;
    rootEl.style.setProperty('--vanvy-accent', p.a);        // 主强调色（亮）
    rootEl.style.setProperty('--vanvy-accent-2', p.b);      // 次强调色（暗，用于描边/投影）
    rootEl.style.setProperty('--vanvy-accent-rgb', hexRgb(p.a));    // 供 rgba(var(...), .x) 发光用
    rootEl.style.setProperty('--vanvy-accent2-rgb', hexRgb(p.b));
    rootEl.setAttribute('data-vanvy-bd-theme', k);
    return p;
  }
  // 主题运行时切换：全局只注册一次（不能每次 mount 都注册，否则监听器泄漏）
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
        /* 文字溢出保护（主人 2026-09-13）：长标题/长简介不得溢出容器与屏幕 */
        + '[class*="-title"],[class*="-h1"],[class*="-sub"],[class*="-desc"],[class*="-syn"],[class*="-meta"]'
        + '{max-width:100%;overflow-wrap:anywhere;word-break:break-word}'
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

  window.VanvyCarouselCore = {
    applyTheme: applyTheme,
    presets: PRESETS,
    motion: MOTION,
    /** 注册轮播组件 */
    register: function (id, config) {
      COMPONENTS[id] = config;
    },

    /** 等待 Emby ApiClient 就绪 */
    waitApi: function () {
      return new Promise(function (resolve) {
        if (window.ApiClient) return resolve(window.ApiClient);
        var t = setInterval(function () {
          if (window.ApiClient) { clearInterval(t); resolve(window.ApiClient); }
        }, 100);
        setTimeout(function () { clearInterval(t); resolve(window.ApiClient || null); }, 15000);
      });
    },

    /** 获取数据 */
    getItems: function (query) {
      var self = this;
      return new Promise(function (resolve) {
        self.waitApi().then(function (client) {
          if (!client || !client.getCurrentUserId) return resolve({ Items: [] });
          try {
            client.getItems(client.getCurrentUserId(), query)
              .then(function (data) { resolve(data || { Items: [] }); })
              .catch(function () { resolve({ Items: [] }); });
          } catch (e) { resolve({ Items: [] }); }
        });
      });
    },

    /** 图片 URL
     *  ⚠️ Emby 的 ApiClient.getImageUrl 第一参数要 **itemId 字符串**，
     *     传整个 item 对象会得到 /Items/[object Object] 这种坏 URL。
     *  兼容：item 对象或 id 字符串都可以传。
     */
    getImageUrl: function (item, opts) {
      opts = opts || {};
      var type = opts.type || 'Backdrop';
      var maxWidth = opts.maxWidth || 1280;
      var id = (item && typeof item === 'object') ? (item.Id || '') : (item || '');
      if (!id) return '';
      try {
        if (window.ApiClient && window.ApiClient.getImageUrl) {
          return window.ApiClient.getImageUrl(id, { type: type, maxWidth: maxWidth });
        }
      } catch (e) { /* ignore */ }
      // 兜底: 直拼 URL
      var base = (window.ApiClient && window.ApiClient.serverAddress) ? window.ApiClient.serverAddress() : '';
      return base + '/emby/Items/' + id + '/Images/' + type + '?maxWidth=' + maxWidth;
    },

    /** 挂载轮播到首页首位 */
    /** 高度自适应：让轮播铺满所在滚动容器的可视高度
        为什么不用 78vh？
          Emby 4.8 首页内容在 body 流动；4.9 的 .homeSectionsContainer 是
          「固定视口高的独立滚动区」→ 写死 78vh 时底部会露出下一区块的留白。 */
    fitHeight: function (rootEl) {
      if (!rootEl) return;
      try {
        var hr = rootEl.getBoundingClientRect();
        var avail = window.innerHeight - hr.top;
        var n = rootEl.parentElement, sc = null;
        while (n && n !== document.documentElement) {
          var cs = getComputedStyle(n);
          if (/(auto|scroll)/.test(cs.overflowY) && n.clientHeight > 0) { sc = n; break; }
          n = n.parentElement;
        }
        if (sc) {
          var sr = sc.getBoundingClientRect();
          avail = Math.min(sr.bottom, window.innerHeight) - hr.top;
        }
        var H = Math.max(320, Math.min(avail, window.innerHeight));
        rootEl.style.setProperty('--vh-hero-h', Math.round(H) + 'px');
      } catch (e) {}
    },

    mount: function (id, rootEl) {
      var cfg = COMPONENTS[id];
      if (!cfg) return Promise.resolve(false);
      var self = this;
      var query = cfg.query || {
        ImageTypes: 'Backdrop',
        EnableImageTypes: 'Backdrop,Primary,Logo',
        IncludeItemTypes: 'Movie,Series',
        SortBy: 'SortName,ProductionYear',
        Recursive: true,
        Limit: 8,
        Fields: 'ProductionYear,Overview,CommunityRating,Genres,MediaSources',
        EnableUserData: false,
        EnableTotalRecordCount: false
      };
      // 统一取消源：cleanup 时一次性解绑 window/visualViewport 监听 + 断开 ResizeObserver
      try { rootEl.__vbdAC = new AbortController(); } catch (e) { rootEl.__vbdAC = null; }
      var _sig = rootEl.__vbdAC ? { signal: rootEl.__vbdAC.signal } : {};
      // 先落主题色变量，再渲染（避免先默认色再跳变）
      applyTheme(rootEl);
      THEME_ROOTS.push(rootEl); bindThemeBus();
      return this.getItems(query).then(function (data) {
        var items = (data && data.Items) ? data.Items : [];
        if (!items.length) { rootEl.remove(); return false; }
        try {
          cfg.render(items, rootEl, self);
        } catch (e) {
          console.warn('[VanvyCarousel] render error:', id, e);
          rootEl.remove();
          return false;
        }
        // 高度自适应（4.8/4.9 通用）+ 移动端工具栏收展/旋转重算
        var fit = function () { self.fitHeight(rootEl); };
        fit();
        setTimeout(fit, 120);
        setTimeout(fit, 700);
        window.addEventListener('resize', fit, _sig);
        window.addEventListener('orientationchange', function () { setTimeout(fit, 300); }, _sig);
        try {
          if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', fit, _sig);
            window.visualViewport.addEventListener('scroll', fit, _sig);
          }
        } catch (e) {}
        try {
          if (window.ResizeObserver) {
            rootEl.__vbdRO = new ResizeObserver(function () { fit(); });
            rootEl.__vbdRO.observe(rootEl.parentElement || rootEl);
          }
        } catch (e) {}
        try {
          var im = rootEl.querySelector('img');
          if (im) { if (im.complete) setTimeout(fit, 200); else im.addEventListener('load', function () { setTimeout(fit, 60); }, { once: true }); }
        } catch (e) {}
        return true;
      });
    },

    /** 启动轮播 (profile 调用): 监听首页路由, 挂载/清理 */
    start: function (id) {
      var startedKey = 'VanvyCarousel_' + id + '_started';
      if (window[startedKey]) return;
      window[startedKey] = true;

      var self = this;
      var lastUrl = window.location.href;

      function teardown(el) {
        // ① 解绑带 signal 的 window/visualViewport 监听
        try { if (el.__vbdAC) { el.__vbdAC.abort(); el.__vbdAC = null; } } catch (e) {}
        // ② 断开 ResizeObserver
        try { if (el.__vbdRO) { el.__vbdRO.disconnect(); el.__vbdRO = null; } } catch (e) {}
        // ③ 主题总线登记注销
        var _i = THEME_ROOTS.indexOf(el);
        if (_i >= 0) THEME_ROOTS.splice(_i, 1);
        // ③ 停掉自动轮播定时器（防路由切换后定时器泄漏）
        try { if (el.__vbdTimer) { clearInterval(el.__vbdTimer); el.__vbdTimer = null; } } catch (e) {}
        el.querySelectorAll('*').forEach(function (k) {
          try { if (k.__vbdTimer) { clearInterval(k.__vbdTimer); k.__vbdTimer = null; } } catch (e) {}
          try { if (k.__vt) { clearInterval(k.__vt); k.__vt = null; } } catch (e) {}
        });
        if (el.parentNode) el.parentNode.removeChild(el);
      }

      function cleanup() {
        document.querySelectorAll('.view:not(.hide) .vanvy-carousel-' + id).forEach(teardown);
        document.querySelectorAll('.vanvy-carousel-' + id).forEach(teardown);
      }

      // 取数失败/无数据时的退避：避免每 150ms 重建-销毁-再请求的死循环
      var retryAt = 0;
      setInterval(function () {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          if (window.location.href.indexOf('!/home') === -1) cleanup();
        }
        var onHome = window.location.href.indexOf('!/home') !== -1;
        if (!onHome) { cleanup(); return; }
        if (Date.now() < retryAt) return;
        // 清理隐藏视图残留
        document.querySelectorAll('.hide .vanvy-carousel-' + id).forEach(teardown);
        // 挂载条件: 容器出现 (兼容 .view 包裹 或 裸容器) + 轮播不在
        var container = document.querySelector('.view:not(.hide) .homeSectionsContainer, .view:not(.hide) .sections, .homeSectionsContainer, .sections');
        if (!container) return;
        // 若容器在隐藏视图内则跳过
        if (container.closest && container.closest('.hide')) return;
        if (document.querySelector('.vanvy-carousel-' + id)) return;
        var root = document.createElement('div');
        root.className = 'vanvy-carousel-' + id;
        container.insertBefore(root, container.firstChild);
        Promise.resolve(self.mount(id, root)).then(function (ok) {
          if (!ok) retryAt = Date.now() + 15000;    // 15s 后再试（登录前/空库友好）
        }).catch(function () { retryAt = Date.now() + 15000; });
      }, 150);
    }
  };
})();
