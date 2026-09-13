/* ═══════════════════════════════════════════════════════════════════
   vanvy-login · Emby 登录页美化
   ───────────────────────────────────────────────────────────────────
   目标：给「用户选择页」与「密码页」加一层品牌化外观（满屏背景 + 毛玻璃卡片），
        而不改动任何一个原生控件的功能。

   铁律：
     ① **不碰 DOM 结构**：不移动/不删除原生 input/button（Emby 靠类名与事件绑定，
        移动节点会导致登录失效）。只用 CSS 覆盖 + 少量装饰性插入。
     ② 装饰元素一律 pointer-events:none，绝不遮挡输入与按钮。
     ③ 只在登录相关页面生效（按 hash 判定 + 页面类名二次确认）。
     ④ 记住用户名/忘记密码/取消/手动登录 等功能全部保留。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__VANVY_LOGIN__) return;
  window.__VANVY_LOGIN__ = true;

  var CFG = {
    enabled: true,
    brand: '',            // 卡头标题；留空 = 取服务器名
    subtitle: '欢迎回来',
    logo: '',             // LOGO 图片 URL（留空 = 用文字首字母）
    backdrop: '',         // 背景图 URL（留空 = 用服务器背景/渐变）
    blur: 22,             // 卡片毛玻璃强度(px)
    tint: 0.42,           // 背景压暗
    theme: 'blackgold'
  };
  try { if (window.VANVY_LOGIN_CONFIG) for (var k in window.VANVY_LOGIN_CONFIG) if (VANVY_LOGIN_CONFIG[k] !== undefined) CFG[k] = VANVY_LOGIN_CONFIG[k]; } catch (e) {}
  if (!CFG.enabled) return;

  var THEMES = {
    aurora:    ['#3ea6ff', '#7c5cff'], blackgold: ['#e8c66a', '#a8741a'],
    champagne: ['#f2dfa8', '#c9a86a'], emerald:   ['#10d9a3', '#0ea5e9'],
    sakura:    ['#ff6b9d', '#c86dd7'], sunset:    ['#ff9a3d', '#ff4d6d'],
    amber:     ['#ffc93c', '#e08e2b'], crimson:   ['#ff4d5e', '#a1213f'],
    violet:    ['#a855f7', '#6366f1'], graphite:  ['#cbd5e1', '#64748b']
  };

  var IS_LOGIN = /\/startup\/(login|manuallogin|forgotpassword|selectserver)\.html/i;

  function host() { return document.documentElement; }

  function applyTheme() {
    var p = THEMES[CFG.theme] || THEMES.blackgold;
    var h = host(), st = h.style;
    // 与详情页一致：把强调色写到 <html> 上（不再各处硬编码）
    st.setProperty('--vanvy-accent', p[0]);
    st.setProperty('--vanvy-accent-2', p[1]);
    st.setProperty('--vanvy-login-blur', CFG.blur + 'px');
    st.setProperty('--vanvy-login-tint', CFG.tint);
    if (CFG.backdrop) st.setProperty('--vanvy-login-bg', 'url("' + CFG.backdrop.replace(/"/g, '%22') + '")');
  }

  function serverName() {
    try {
      if (window.ApiClient && ApiClient.serverName) return ApiClient.serverName() || '';
      if (window.ApiClient && ApiClient.serverInfo) return ApiClient.serverInfo().Name || '';
    } catch (e) {}
    try {
      var t = document.querySelector('.pageTitle');
      if (t && t.textContent.trim()) return t.textContent.trim();
      var h1 = document.querySelectorAll('h1');
      if (h1[1] && h1[1].textContent.trim()) return h1[1].textContent.trim();
    } catch (e) {}
    return 'Media Server';
  }

  // 装饰层：只插入 pointer-events:none 的元素
  function decorate() {
    if (!IS_LOGIN.test(location.hash || '')) { undecorate(); return; }
    var view = currentView();
    if (!view) return;

    // ① 背景层：全局只留一份
    var orn = document.querySelector('.vl-orn');
    if (!orn) {
      orn = document.createElement('div');
      orn.className = 'vl-orn';
      orn.innerHTML = '<i class="vl-orn-glow"></i><i class="vl-orn-glow vl-orn-glow2"></i>';
      document.body.appendChild(orn);
    }

    var isPwd = /manuallogin/i.test(location.hash || '');
    // 清理「上一次页面」留下的头部与类名（Emby 会把旧 view 留在 DOM 里）
    Array.prototype.forEach.call(document.querySelectorAll('.vl-head'), function (h) {
      if (!view.contains(h)) h.remove();
    });
    document.body.classList.toggle('vl-users', !isPwd);
    document.body.classList.toggle('vl-pwd', isPwd);
    Array.prototype.forEach.call(document.querySelectorAll('.vl-form'), function (f) { f.classList.remove('vl-form'); });

    // ② 卡片头：优先挂在 form（密码页），否则挂在滚动区（用户选择页）
    var anchor = view.querySelector('form') || view.querySelector('.scrollSlider') || view;
    if (!anchor.querySelector('.vl-head')) {
      var head = document.createElement('div');
      head.className = 'vl-head';
      var nm = CFG.brand || serverName();
      var initial = (nm || 'V').trim().charAt(0).toUpperCase();
      head.innerHTML = '<span class="vl-logo">'
        + (CFG.logo ? '<img src="' + CFG.logo.replace(/"/g, '%22') + '" alt="">' : initial)
        + '</span><span class="vl-txt"><b>' + esc(nm) + '</b><i>' + esc(CFG.subtitle || '') + '</i></span>';
      anchor.insertBefore(head, anchor.firstChild);
    }
    if (anchor.tagName === 'FORM') anchor.classList.add('vl-form');
    view.classList.add('vl-page');
  }

  // 当前可见的 view（Emby 每个页面一个 .view，旧的会加 .hide 但仍在 DOM）
  function currentView() {
    var vs = document.querySelectorAll('.view');
    for (var i = vs.length - 1; i >= 0; i--) {
      var v = vs[i];
      if (v.classList.contains('hide')) continue;
      try { if (getComputedStyle(v).display === 'none') continue; } catch (e) {}
      return v;
    }
    return document.querySelector('.view:not(.hide)') || null;
  }

  function undecorate() {
    try {
      document.querySelectorAll('.vl-orn').forEach(function (e) { e.remove(); });
      document.querySelectorAll('.vl-head').forEach(function (e) { e.remove(); });
      document.querySelectorAll('.vl-page,.vl-form').forEach(function (e) { e.classList.remove('vl-page', 'vl-form'); });
      document.body.classList.remove('vl-users', 'vl-pwd');
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function tick() {
    try { applyTheme(); } catch (e) {}
    try { if (IS_LOGIN.test(location.hash || '')) decorate(); else undecorate(); } catch (e) {}
  }

  function init() {
    var s = document.createElement('link');
    s.rel = 'stylesheet'; s.href = 'vanvy-login/vanvy-login.css';
    document.head.appendChild(s);
    tick();
    document.addEventListener('viewshow', function () { setTimeout(tick, 60); setTimeout(tick, 400); });
    window.addEventListener('hashchange', function () { setTimeout(tick, 60); setTimeout(tick, 600); setTimeout(tick, 1500); });
    [300, 1200, 2600].forEach(function (t) { setTimeout(tick, t); });
    console.log('[VanvyLogin] v1.0.0 loaded');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.VanvyLogin = { cfg: CFG, refresh: tick, themes: THEMES };
})();
