/**
 * =============================================================================
 *  Vanvy Loading · vanvy-loading.js  (A 款 · 极简进度)
 *  ---------------------------------------------------------------------------
 *  功能:
 *    1. 预热加载页（满屏，深色，细进度线）— 进入首页前展示，就绪后平滑淡出
 *    2. 文案按【服务器名称】动态显示（无需等待 API，优先读 localStorage 凭据）
 *    3. 品牌 LOGO 可替换（加载页中央）
 *    4. 浏览器标签 LOGO(favicon) 可替换
 *
 *  兼容: Emby 4.8 / 4.9 / 4.10（只用稳定 API；全程 try/catch，失败直接跳过）
 *  挂载: body 末尾 <script src="vanvy-loading/vanvy-loading.js"></script>
 * =============================================================================
 */
(function () {
  'use strict';
  if (window.VanvyLoading) return;

  var BASE = (function () {
    // 组件目录（用于加载 LOGO 等本地资源）
    var s = document.currentScript;
    if (s && s.src) return s.src.replace(/\/[^/]*$/, '/');
    return 'vanvy-loading/';
  })();

  var CFG = {
    // ── 文案模板 ──────────────────────────────────────────────
    textTemplate: '正在准备 {server} 的媒体库',   // {server} 会替换为服务器名
    textFallback: '正在准备你的媒体库',            // 取不到服务器名时用这句
    // ── 样式变体（aurora/cinema/minimal/split/logo；'' = 默认极简进度）──
    style: '',
    // 各款样式的内部结构（CSS 由 styles/<style>.css 提供，见 install-loading.sh）
    styleHtml: {
      aurora: [
        '<div class="vl-bg"></div>',
        '<div class="vl-particles">',
        '<i class="vp vp-1"></i><i class="vp vp-2"></i><i class="vp vp-3"></i><i class="vp vp-4"></i>',
        '<i class="vp vp-5"></i><i class="vp vp-6"></i><i class="vp vp-7"></i><i class="vp vp-8"></i>',
        '</div>',
        '<div class="vl-inner">',
        '  <div class="vl-logo-wrap"><div class="vl-glow"></div><div class="vl-ring"></div><div class="vl-ring vl-ring-2"></div>',
        '    <img class="vl-logo" alt="" src="{logo}" onerror="this.style.display=\'none\'"></div>',
        '  <div class="vl-bar"><i></i></div>',
        '  <div class="vl-brand">VANVY</div>',
        '</div>'
      ].join(''),
      cinema: [
        '<div class="vl-bg"></div>',
        '<div class="vl-inner">',
        '  <div class="vl-logo-wrap">',
        '    <div class="vl-reel"></div><div class="vl-glow"></div>',
        '    <img class="vl-logo" alt="" src="{logo}" onerror="this.style.display=\'none\'">',
        '  </div>',
        '  <div class="vl-bar"><i></i></div>',
        '  <div class="vl-brand">CINEMA</div>',
        '</div>'
      ].join(''),
      split: [
        '<div class="vl-split-l"></div><div class="vl-split-r"></div>',
        '<div class="vl-inner">',
        '  <div class="vl-logo-wrap"><img class="vl-logo" alt="" src="{logo}" onerror="this.style.display=\'none\'"></div>',
        '  <div class="vl-bar"><i></i></div>',
        '  <div class="vl-brand">VANVY</div>',
        '</div>'
      ].join(''),
      minimal: [
        '<div class="vl-inner">',
        '  <div class="vl-dots"><i></i><i></i><i></i></div>',
        '  <div class="vl-brand">Loading</div>',
        '</div>'
      ].join(''),
      logo: [
        '<div class="vl-inner">',
        '  <div class="vl-logo-wrap"><img class="vl-logo" alt="" src="{logo}" onerror="this.style.display=\'none\'"></div>',
        '  <div class="vl-brand">VANVY</div>',
        '</div>'
      ].join('')
    },
    // ── 配色主题（与首页轮播 / 详情页 PRESETS 一致）──────────────
    theme: 'aurora',                              // 由部署时 config.js 写入
    presets: {
      aurora:   { a: '#3ea6ff', b: '#7c5cff', bg: '#08080c' },
      blackgold:{ a: '#e8c66a', b: '#a8741a', bg: '#070608' },
      champagne:{ a: '#f2dfa8', b: '#c9a86a', bg: '#08070a' },
      emerald:  { a: '#10d9a3', b: '#0ea5e9', bg: '#050b0a' },
      sakura:   { a: '#ff6b9d', b: '#c86dd7', bg: '#0c070c' },
      sunset:   { a: '#ff9a3d', b: '#ff4d6d', bg: '#0c0805' },
      amber:    { a: '#ffc93c', b: '#e08e2b', bg: '#0a0805' },
      crimson:  { a: '#ff4d5e', b: '#a1213f', bg: '#0c0507' },
      violet:   { a: '#a855f7', b: '#6366f1', bg: '#08060e' },
      graphite: { a: '#cbd5e1', b: '#64748b', bg: '#0a0b0d' }
    },
    // ── 品牌资源 ──────────────────────────────────────────────
    brandLogo: BASE + 'logo/brand.png',           // 加载页中央 LOGO（透明 PNG 最佳）
    brandLogoWidth: 190,                          // 显示宽度 px
    favicon: BASE + 'logo/favicon.png',           // 浏览器标签图标
    useLogo: true,                                // false = 不显示 LOGO（仅文字/进度）
    replaceFavicon: true,                         // 是否替换浏览器标签图标
    // ── 时长 ──────────────────────────────────────────────────
    minShowMs: 1300,     // 最短展示（避免一闪而过）
    maxShowMs: 12000,    // 最长兜底（超过就淡出，绝不卡死）
    // 登录页出现时立即让路（不参与"等轮播就绪"）
    yieldOnLogin: true
  };

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var state = { shownAt: 0, done: false, el: null };

  // ── 读取部署时写入的配置（与首页/详情页同一 theme key）──────────
  function loadConfig() {
    try {
      var c = window.VANVY_LOADING_CONFIG;
      if (!c) return;
      if (c.theme && CFG.presets[c.theme]) CFG.theme = c.theme;
      if (c.style) CFG.style = c.style;      if (c.textTemplate) CFG.textTemplate = c.textTemplate;
      if (c.textFallback) CFG.textFallback = c.textFallback;
      if (typeof c.brandLogoWidth === 'number') CFG.brandLogoWidth = c.brandLogoWidth;
      if (typeof c.useLogo === 'boolean') CFG.useLogo = c.useLogo;
      if (typeof c.brandLogo === 'string' && c.brandLogo) CFG.brandLogo = /^(https?:|\/)/.test(c.brandLogo) ? c.brandLogo : BASE + c.brandLogo;
      if (typeof c.favicon === 'string' && c.favicon) CFG.favicon = /^(https?:|\/)/.test(c.favicon) ? c.favicon : BASE + c.favicon;
      if (typeof c.minShowMs === 'number') CFG.minShowMs = c.minShowMs;
      if (typeof c.maxShowMs === 'number') CFG.maxShowMs = c.maxShowMs;
      if (typeof c.replaceFavicon === 'boolean') CFG.replaceFavicon = c.replaceFavicon;
    } catch (e) { console.warn('[VanvyLoading] config', e); }
    // 尽早注入样式变体 CSS（避免渲染后样式才到位导致闪现）
    try {
      if (CFG.style && !document.getElementById('vanvy-vl-style-' + CFG.style)) {
        var lk = document.createElement('link');
        lk.id = 'vanvy-vl-style-' + CFG.style;
        lk.rel = 'stylesheet';
        lk.href = BASE + 'styles/' + CFG.style + '.css';
        (document.head || document.documentElement).appendChild(lk);
      }
    } catch (e2) {}
  }

  // ── 服务器名（优先 localStorage 凭据 → 标题 → API）──────────────
  function serverNameSync() {
    try {
      var raw = localStorage.getItem('servercredentials3');
      if (raw) {
        var d = JSON.parse(raw);
        var list = (d && d.Servers) || [];
        // 优先当前地址匹配的服务器
        var host = location.origin;
        var hit = null;
        for (var i = 0; i < list.length; i++) {
          var s = list[i];
          var addrs = [s.LocalAddress, s.ManualAddress, s.RemoteAddress].filter(Boolean);
          for (var j = 0; j < addrs.length; j++) {
            if (addrs[j].indexOf(host) === 0) { hit = s; break; }
          }
          if (hit) break;
        }
        var srv = hit || list[0];
        if (srv && srv.Name) return srv.Name;
      }
    } catch (e) { /* ignore */ }
    // 兜底：Emby 会把服务器名写进 document.title
    try {
      var t = (document.title || '').trim();
      if (t && t !== 'Emby' && t.length < 40) return t;
    } catch (e) {}
    return '';
  }

  function fillText(name) {
    var tpl = CFG.textTemplate;
    if (name) return tpl.replace(/\{server\}/g, name);
    return CFG.textFallback;
  }

  // ── favicon 替换 ──────────────────────────────────────────────
  //  难点：Emby 外壳会重写 <head>（多次 apple-touch-icon / manifest），
  //  且浏览器对 favicon 缓存极顽固 → 这里做两件事：
  //   ① 在 head 里保证一个真正的 <link rel="icon" type="image/png">
  //   ② 延迟几次重施 + 监听 head 变动（有上限），防止被 Emby 覆写
  function applyFavicon() {
    if (!CFG.replaceFavicon || !CFG.favicon) return;
    try {
      var url = CFG.favicon;
      var head = document.head || document.documentElement;
      // ① 保证 rel="icon" 存在（桌面浏览器标签页以它为准）
      var main = head.querySelector('link[rel="icon"]');
      if (!main) {
        main = document.createElement('link');
        main.rel = 'icon';
        head.appendChild(main);
      }
      main.type = 'image/png';
      main.setAttribute('sizes', 'any');
      if (main.getAttribute('href') !== url) main.setAttribute('href', url);
      // ② 同步其它同类声明
      var others = head.querySelectorAll('link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
      Array.prototype.forEach.call(others, function (l) {
        if (l.getAttribute('href') !== url) l.setAttribute('href', url);
      });
    } catch (e) { console.warn('[VanvyLoading] favicon', e); }
  }

  var _favTimers = 0;
  function setFavicon() {
    applyFavicon();
    // 延迟重施（Emby 初始化、路由切换、登录后都可能重写 head）
    [600, 1800, 4000].forEach(function (ms) {
      setTimeout(applyFavicon, ms);
    });
    // head 变动时重施（有上限，避免死循环/耗能）
    try {
      if (window.MutationObserver && !window.__vanvyFavObs) {
        var obs = new MutationObserver(function () {
          if (_favTimers > 40) { obs.disconnect(); window.__vanvyFavObs = null; return; }
          _favTimers++;
          applyFavicon();
        });
        obs.observe(document.head, { childList: true, subtree: false, attributeFilter: ['href', 'rel'] });
        window.__vanvyFavObs = obs;
      }
    } catch (e) {}
  }

  // ── 构建加载页 ────────────────────────────────────────────────
  function build(name) {
    var el = document.createElement('div');
    el.id = 'vanvy-loading';
    el.className = 'vl';
    if (CFG.useLogo === false) el.classList.add('vl-nologo');
    // 应用主题强调色（与首页/详情页同源）
    try {
      var p = CFG.presets[CFG.theme] || CFG.presets.aurora;
      el.style.setProperty('--vl-acc', p.a);
      el.style.setProperty('--vl-acc2', p.b);
      el.style.setProperty('--vl-bg', p.bg);
      el.setAttribute('data-vl-theme', CFG.theme);
      if (CFG.style) {
        el.setAttribute('data-vl-style', CFG.style);
        el.classList.add('vl-style-' + CFG.style);
        // 注入该样式变体的 CSS（styles/<style>.css，由 install-loading.sh 落位）
        try {
          var sid = 'vanvy-vl-style-' + CFG.style;
          if (!document.getElementById(sid)) {
            var lk = document.createElement('link');
            lk.id = sid; lk.rel = 'stylesheet';
            lk.href = BASE + 'styles/' + CFG.style + '.css';
            (document.head || document.documentElement).appendChild(lk);
          }
        } catch (e3) {}
        // 通过注册表注入（若该样式由扩展注册了额外 CSS）
        try {
          if (window.Vanvy && Vanvy.get) {
            var sd = Vanvy.get('loadingStyle', CFG.style);
            if (sd && sd.css && Vanvy.injectCss) Vanvy.injectCss(sd.css);
            if (sd && typeof sd.mount === 'function') sd.mount(el);
          }
        } catch (e2) {}
      }
    } catch (e) {}
    var tpl = (CFG.style && CFG.styleHtml[CFG.style]) || '';
    if (tpl) {
      // 样式化结构：{logo} 占位替换；文案以浮层形式补充在下方
      el.innerHTML = tpl.replace(/\{logo\}/g, CFG.brandLogo).replace(/\{logoW\}/g, CFG.brandLogoWidth)
        + '<div class="vl-caption">' + escapeHtml(fillText(name)) + '</div>';
    } else {
      el.innerHTML = [
        '<div class="vl-inner">',
        '  <img class="vl-logo" src="' + CFG.brandLogo + '" alt="" ',
        '       style="width:' + CFG.brandLogoWidth + 'px" onerror="this.style.display=\'none\'">',
        '  <div class="vl-text">' + escapeHtml(fillText(name)) + '</div>',
        '  <div class="vl-bar"><i></i></div>',
        '  <div class="vl-sub">LOADING</div>',
        '</div>'
      ].join('');
    }
    return el;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
    });
  }

  function show() {
    if (state.el || state.done) return;
    var name = serverNameSync();
    // favicon 尽早替换
    setFavicon();
    try {
      var el = build(name);
      document.body.appendChild(el);
      state.el = el; state.shownAt = Date.now();
      document.body.classList.add('vanvy-loading-active');
      // 隐藏 Emby 自带 splash
      document.querySelectorAll('.app-splash-container, .app-splash, .app-splash-expanded')
        .forEach(function (e) { e.style.display = 'none'; });
      console.log('[VanvyLoading] 展示中 · 服务器:', name || '(未知)');
    } catch (e) { console.warn('[VanvyLoading] show', e); }
  }

  function hide() {
    if (state.done) return;
    var el = state.el;
    var wait = Math.max(0, CFG.minShowMs - (Date.now() - state.shownAt));
    setTimeout(function () {
      state.done = true;
      try {
        if (el) {
          el.classList.add('vl-hide');
          setTimeout(function () { el && el.parentNode && el.parentNode.removeChild(el); }, 600);
        }
        document.body.classList.remove('vanvy-loading-active');
      } catch (e) {}
      try { if (window.Vanvy) { Vanvy._markReady(); Vanvy.emit('loading:done', {}); } } catch (e) {}
      console.log('[VanvyLoading] 已淡出');
    }, wait);
  }

  function homeExpected() {
    try {
      if (window.VanvyHome) return true;
      return !!document.querySelector('script[src*="vanvy-home"]');
    } catch (e) { return false; }
  }

  function onLoginPage() {
    try {
      if ($('.view-startup-login input[type=password]')) return true;
      if (location.href.indexOf('startup/login') !== -1 && $('.view-startup-login .emby-button')) return true;
    } catch (e) {}
    return false;
  }

  // ── 就绪判定 ─────────────────────────────────────────────────
  function appReady() {
    try {
      // 1) 登录页：立即让路（不能等轮播，否则会挡住登录框）
      if (CFG.yieldOnLogin && onLoginPage()) return true;

      // 2) 启用了大屏轮播 → 等它真正就绪（首屏背景图已解码），
      //    淡出后直接看到轮播，不再先卡一下原生首页
      if (homeExpected()) return !!window.__VANVY_HOME_READY__;

      // 3) 无轮播：原生首页就绪即可
      if ($('.homeSectionsContainer .verticalSection')) return true;
      var c = $('.view:not(.hide) .homeSectionsContainer, .view:not(.hide) .sections');
      if (c && c.children.length > 0) return true;
    } catch (e) {}
    return false;
  }

  function whenBody(fn) {
    if (document.body) return fn();
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  function start() {
    loadConfig();
    show();
    var t0 = Date.now();
    // 若首次取的是兜底名，等 ApiClient 就绪后校正为真实服务器名
    var fixed = false;
    var nameTimer = setInterval(function () {
      if (fixed || state.done) { clearInterval(nameTimer); return; }
      try {
        var api = window.ApiClient;
        if (api && api.serverName) {
          var real = api.serverName();
          if (real) {
            fixed = true;
            var t = document.querySelector('#vanvy-loading .vl-text') || document.querySelector('#vanvy-loading .vl-caption');
            if (t) { var nt = fillText(real); if (t.textContent !== nt) t.textContent = nt; }
            console.log('[VanvyLoading] 服务器名校正为:', real);
          }
        }
      } catch (e) {}
      if (Date.now() - t0 > CFG.maxShowMs) clearInterval(nameTimer);
    }, 200);

    var timer = setInterval(function () {
      if (appReady()) { clearInterval(timer); clearInterval(nameTimer); hide(); return; }
      if (Date.now() - t0 > CFG.maxShowMs) { clearInterval(timer); clearInterval(nameTimer); hide(); }
    }, 250);
  }

  window.VanvyLoading = {
    init: function (opt) { if (opt) Object.assign(CFG, opt); whenBody(start); },
    // 供外部（注册表）读取当前样式/主题
    preset: function (key) { return CFG.presets[key] || CFG.presets.aurora; },
    hide: hide,
    cfg: CFG
  };

  console.log('[VanvyLoading] loaded');
  whenBody(start);
})();
