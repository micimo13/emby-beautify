/**
 * =============================================================================
 *  Vanvy Emby Suite · 核心注册表 (vanvy-registry.js)
 *  ---------------------------------------------------------------------------
 *  三个模块（加载页 / 首页轮播 / 详情页）共享的轻量内核，提供：
 *    ① 样式注册    Vanvy.register(kind, key, def)      —— 加新样式无需改老代码
 *    ② 生命周期    Vanvy.on(evt, fn) / Vanvy.ready(fn) —— 挂载前/后钩子
 *    ③ 全局主题    Vanvy.theme / Vanvy.setTheme(key)   —— 三模块共用一套强调色
 *    ④ 配置合并    Vanvy.config(kind)                  —— 读取 window.VANVY_*_CONFIG
 *
 *  加载方式：必须最先加载（在其它 vanvy-*.js 之前）
 *    <script src="vanvy-core/vanvy-registry.js"></script>
 *
 *  注册 kind 约定：
 *    loadingStyle  加载页样式   { label, css:[], theme?(){} , mount?(el){}, onFade?(el){} }
 *    banner        首页轮播     { label, css:[], mount(root,cfg){}, unmount?(){} }
 *    detailSection 详情页区块   { label, order, mount(host,item,ctx){} }
 *
 *  扩展示例（新增一款加载页样式）：
 *    Vanvy.register('loadingStyle', 'myshine', {
 *      label: '我的光效',
 *      css: ['vanvy-loading/styles/myshine.css'],
 *      mount: function (el) { el.classList.add('vl-myshine'); }
 *    });
 *    然后在部署向导里选它，或在 config.js 里写 style:'myshine'
 * =============================================================================
 */
(function () {
  'use strict';
  if (window.Vanvy && window.Vanvy.__core) return;

  var VERSION = '2.0.0';
  var _reg = {};        // kind -> { key: def }
  var _evt = {};        // event -> [fn]
  var _readyQ = [];     // Vanvy.ready 队列
  var _isReady = false;
  var _theme = '';      // 全局主题 key（'' = 未指定）

  function _kind(kind) {
    if (!_reg[kind]) _reg[kind] = {};
    return _reg[kind];
  }

  function register(kind, key, def) {
    if (!kind || !key || !def) { console.warn('[Vanvy] register 参数不完整', kind, key); return false; }
    var bucket = _kind(kind);
    if (bucket[key]) console.warn('[Vanvy] 覆盖已存在的注册项:', kind, '/', key);
    bucket[key] = def;
    emit('register', { kind: kind, key: key, def: def });
    return true;
  }

  function list(kind) {
    var bucket = _reg[kind] || {};
    return Object.keys(bucket).map(function (k) {
      return { key: k, label: (bucket[k] && bucket[k].label) || k, def: bucket[k] };
    });
  }

  function get(kind, key) { return (_reg[kind] || {})[key] || null; }

  function on(evt, fn) {
    if (typeof fn !== 'function') return function () {};
    (_evt[evt] = _evt[evt] || []).push(fn);
    return function off() {
      _evt[evt] = (_evt[evt] || []).filter(function (f) { return f !== fn; });
    };
  }

  function emit(evt, data) {
    (_evt[evt] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { console.warn('[Vanvy] 钩子异常', evt, e); }
    });
    // 通配监听：'*'
    (_evt['*'] || []).forEach(function (fn) {
      try { fn({ event: evt, data: data }); } catch (e) {}
    });
  }

  function ready(fn) {
    if (typeof fn !== 'function') return;
    if (_isReady) { try { fn(window.Vanvy); } catch (e) {} return; }
    _readyQ.push(fn);
  }

  function _markReady() {
    if (_isReady) return;
    _isReady = true;
    emit('ready', { version: VERSION, theme: _theme });
    var q = _readyQ.slice(); _readyQ.length = 0;
    q.forEach(function (fn) { try { fn(window.Vanvy); } catch (e) {} });
  }

  // ── 注入 CSS（去重，幂等）────────────────────────────────────
  function injectCss(hrefs) {
    (hrefs || []).forEach(function (h) {
      if (!h) return;
      var id = 'vanvy-css-' + String(h).replace(/[^a-z0-9]+/gi, '-');
      if (document.getElementById(id)) return;
      var l = document.createElement('link');
      l.id = id; l.rel = 'stylesheet'; l.href = h;
      (document.head || document.documentElement).appendChild(l);
    });
  }

  // ── 读取部署配置 window.VANVY_<KIND>_CONFIG ──────────────────
  function config(kind) {
    var map = {
      loading: 'VANVY_LOADING_CONFIG',
      home: 'VANVY_HOME_CONFIG',
      detail: 'VANVY_DETAIL_CONFIG',
      core: 'VANVY_CORE_CONFIG'
    };
    try { return window[map[kind] || ''] || {}; } catch (e) { return {}; }
  }

  function setTheme(key) {
    if (!key) return;
    _theme = key;
    try { document.documentElement.setAttribute('data-vanvy-theme', key); } catch (e) {}
    emit('theme', { key: key });
  }

  function _deriveTheme() {
    try {
      return config('loading').theme || config('home').theme || config('detail').theme || config('core').theme || '';
    } catch (e) { return ''; }
  }

  window.Vanvy = {
    __core: true,
    version: VERSION,
    register: register,
    list: list,
    get: get,
    on: on,
    emit: emit,
    ready: ready,
    injectCss: injectCss,
    config: config,
    // theme 为懒读取：config.js 可能晚于本脚本加载，取不到时每次再试
    get theme() { return _theme || _deriveTheme(); },
    setTheme: setTheme,
    _markReady: _markReady,
    get isReady() { return _isReady; }
  };

  // 首次尝试（config.js 一般在本脚本之后，这里大概率取不到）
  var _t0 = _deriveTheme();
  if (_t0) setTheme(_t0);

  // config.js 加载完后再补一次
  function _lateDerive() {
    var t = _deriveTheme();
    if (t && t !== _theme) setTheme(t);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _lateDerive, { once: true });
  }
  window.addEventListener('load', _lateDerive, { once: true });
  setTimeout(_lateDerive, 1200);

  console.log('[Vanvy] registry v' + VERSION + ' loaded');
})();
