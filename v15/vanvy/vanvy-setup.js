/*!
 * vanvy-setup.js — Vanvy Emby Kit V1.5 统一加载器（manifest 驱动）
 * ============================================================
 * 替代 V1 的"散弹式注入"：不再往 index.html 塞一堆 <script>，
 * 而是读 vanvy-manifest.json（由 install.sh 生成），按依赖顺序
 * 动态加载已启用的组件。幂等、容错、缓存 bust、SPA 周期重钉。
 *
 * manifest 结构（由 install.sh --gen-manifest 生成）:
 * {
 *   "version": "20260817_1",
 *   "banner": "banner_cinema",              // 当前启用的轮播 id
 *   "bannerThemeClass": "vanvy-aurora-theme-midnight", // 轮播主题 class
 *   "themes": ["glass_graphite"],           // 启用的 CSS 主题列表
 *   "features": ["danmaku","douban",...],   // 启用的功能增强列表
 *   "baseBlack": true,                      // 是否加载纯黑基础覆盖层
 *   "blackGold": true                       // 是否加载黑金增强层
 * }
 * ============================================================
 */
(function () {
  'use strict';
  if (window.VanvySetupLoaded) return;
  window.VanvySetupLoaded = true;

  var BASE = 'vanvy/';      // 相对 web 根
  var VER = 'v15_20260817_2'; // 全局缓存 bust 版本号（install.sh 可覆盖）

  function log() {
    try { console.log('[vanvy-v15]', [].slice.call(arguments).join(' ')); } catch (e) {}
  }

  function loadJS(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = BASE + src + '?v=' + VER;
      s.onload = function () { resolve(true); };
      s.onerror = function () { log('加载失败(js): ' + src); resolve(false); };
      document.head.appendChild(s);
    });
  }
  function loadCSS(href) {
    return new Promise(function (resolve) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = BASE + href + '?v=' + VER;
      l.onload = function () { resolve(true); };
      l.onerror = function () { log('加载失败(css): ' + href); resolve(false); };
      document.head.appendChild(l);
    });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ⚠️ 关键：等 Emby 核心就绪后再启动美化，绝不干扰 splash 初始化
  // （曾因在 splash 阶段抢跑导致卡 LOGO）
  function waitForEmbyReady() {
    return new Promise(function (resolve) {
      // ⚠️ 2026-08-18 最终方案: 等 homeSectionsContainer 出现 = 登录完成 + 首页已渲染。
      //    登录页阶段 ApiClient 也存在, 若仅凭 ApiClient 判定会在登录页提前启动 → require.config
      //    干扰 Emby connectionmanager 加载 → 登录失败(connectionmanager.js 404)。
      //    等 home 出现才启动 vanvy, 同时 splash 动画立即盖上, 解决"先显示原生首页再出动画"的时序问题
      var t0 = Date.now();
      var iv = setInterval(function () {
        if (document.querySelector('.homeSectionsContainer, .homePageSections, .homeSectionsContainer, .sections')) {
          clearInterval(iv); resolve();
        } else if (Date.now() - t0 > 120000) {
          // 2 分钟兑底(极端情况), 尽力而为不阻塞
          clearInterval(iv); resolve();
        }
      }, 300);
    });
  }

  // ⚠️ 2026-08-18 修复：等离开登录页后再加载组件（登录页不激活美化，避免干扰原生登录 UI）
  function waitLeaveLoginPage() {
    // ⚠️ 2026-08-18: 登录页判定已并入 waitForEmbyReady(login检测), 此函数保留为幂等空操作
    return Promise.resolve();
  }

  // 预检资源是否存在（避免无谓 404 和 console 报错）
  function exists(src) {
    return fetch(BASE + src, { method: 'HEAD', cache: 'no-store' })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  // 加载 css（不存在则跳过，不报错）
  async function loadCSSIfExists(href) {
    var ok = await exists(href);
    if (!ok) { log('跳过(不存在): ' + href); return false; }
    return loadCSS(href);
  }

  // 从 localStorage 读主题（用户可运行时切换），校验合法值
  function resolveThemeClass(manifestThemeClass) {
    var theme = '';
    try { theme = localStorage.getItem('vanvy-aurora-theme') || ''; } catch (e) {}
    var allowed = /^(midnight|emerald|sakura|gold|aurora|ember|sky|graphite|blue|purple|pink|amber)$/;
    if (allowed.test(theme)) return 'vanvy-aurora-theme-' + theme;
    return manifestThemeClass || 'vanvy-aurora-theme-midnight';
  }

  async function setup() {
    log('V1.5 loader 启动…');

    // 0. ⚠️ 等 Emby 核心就绪（不抢 splash）
    //    同时: 一旦 home 渲染完成立即盖上加载动画(解决"先出原生再出动画")
    //    盖层由 setup 级样式实现, 不依赖轮播数据
    var loadingEl = null;
    var showSetupLoading = function () {
      try {
        if (document.getElementById('vanvy-setup-loading')) return;
        var l = document.createElement('div');
        l.id = 'vanvy-setup-loading';
        l.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999999;background:#060607;display:flex;align-items:center;justify-content:center;transition:opacity .4s';
        // ⚠️ 2026-08-18 修复: 加载动画显示主人的加载logo(s8zmm1.png → branding/splash-logo.png),
        //    不是转圈文字 (主人反馈"加载logo没改")
        l.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:18px">' +
          '<img src="vanvy/branding/splash-logo.png" style="max-width:200px;max-height:90px;object-fit:contain;animation:vanvySetupBreathe 2.2s ease-in-out infinite" alt="">' +
          '<div style="width:200px;height:3px;border-radius:99px;background:rgba(216,173,85,.15);overflow:hidden">' +
          '<div style="width:40%;height:100%;border-radius:99px;background:linear-gradient(90deg,transparent,#d8ad55,transparent);animation:vanvySetupSlide 1.1s ease-in-out infinite"></div>' +
          '</div>' +
          '</div>';
        var style = document.createElement('style');
        style.textContent = '@keyframes vanvySetupSpin{to{transform:rotate(360deg)}}@keyframes vanvySetupBreathe{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.04);opacity:1}}@keyframes vanvySetupSlide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}';
        document.head.appendChild(style);
        document.body.appendChild(l);
        loadingEl = l;
      } catch (e) {}
    };
    var hideSetupLoading = function () {
      try {
        // ⚠️ 2026-08-18 修复: 必须用 getElementById 直接查, 不依赖 loadingEl 变量——
        //    变量可能在时序中已为 null, 导致 opacity:0 的覆盖层残留 DOM → 全屏拦截点击 (主人反馈"主页无法点击")
        var l = document.getElementById('vanvy-setup-loading');
        if (l) {
          l.style.opacity = '0';
          l.style.pointerEvents = 'none';  // 立即放行点击
          setTimeout(function () { if (l && l.parentNode) l.parentNode.removeChild(l); }, 500);
        }
        loadingEl = null;
      } catch (e) {}
    };

    await waitForEmbyReady();
    // home 已渲染 → 立即盖上加载动画, 再加载轮播资源(用户看到的是动画而非原生首页)
    showSetupLoading();
    // ⚠️ 2026-08-18：等离开登录页（登录页不激活组件，避免干扰原生登录 UI）
    await waitLeaveLoginPage();
    // 额外等待: Emby AMD(require.js) 完全初始化 + 主线程空闲
    // （features 里的 require([...]) 调用会与 Emby 初始化并发冲突 → 模块404 → 卡LOGO）
    // ⚠️ 2026-08-18: home 已渲染(等 ready 时) → 缩短等待, 立即启动 splash + 轮播, 解决"先出原生再出动画"
    await new Promise(function (r) {
      var done = false;
      var finish = function () { if (!done) { done = true; r(); } };
      // 等主线程空闲 + 短延时(让 Emby 首屏绘制完成)
      if (document.readyState === 'complete') { setTimeout(finish, 800); }
      else { window.addEventListener('load', function () { setTimeout(finish, 800); }); }
      setTimeout(finish, 5000);  // 兜底
    });
    log('Emby 完全就绪(load+3s)，开始加载美化');

    // 0.5 拉取 manifest
    var manifest = null;
    try {
      var resp = await fetch(BASE + 'vanvy-manifest.json', { cache: 'no-store' });
      manifest = await resp.json();
    } catch (e) {
      log('manifest 加载失败，使用内置默认（cinema + black）');
    }
    var m = manifest || {
      version: VER, banner: 'banner_cinema',
      bannerThemeClass: 'vanvy-aurora-theme-midnight',
      themes: [], features: [], baseBlack: true, blackGold: true
    };
    if (m.version) VER = m.version;
    log('manifest: banner=' + m.banner + ' themes=' + (m.themes||[]).join(',') + ' features=' + (m.features||[]).length);

    // 1. 主题 class → body（组件从 body/html class 读主题）
    var themeClass = resolveThemeClass(m.bannerThemeClass);
    document.body.classList.add(themeClass);
    log('主题 class: ' + themeClass);

    // 2. core 依赖库（common-utils/md5/vanvy-core）
    // 2026-08-18 修复: 不再加载 core/jquery-3.6.0.min.js —— 全局 $ 覆盖 Emby 内部 jQuery,
    //   导致 Emby 4.8.11 详情页组件(dom.js 等)失效 → 详情页坏 + JAV 增强不生效
    await loadJS('core/common-utils.js');
    await loadJS('core/md5.min.js');
    await loadJS('core/vanvy-core.js');

    // 3. carousel_rules（轮播策展规则，banner 依赖）
    await loadJS('carousel_rules/rules-loader.js');

    // 3.5 ⚠️ 2026-08-18 修复: 给 RequireJS 补 paths 映射（danmaku/playbackrate 等组件用 require([...]) 加载 Emby 模块）
    //    Emby 4.8.11 用 importMap, 但 RequireJS 无 paths 配置 → 解析到错误路径 → 404 → 详情页功能崩
    //    ⚠️ 不能用 baseUrl: BASE (vanvy/), 否则 Emby 模块全解析到 vanvy 目录 → 404
    try {
      if (window.require && window.require.config) {
        var wb = window.location.origin + '/emby/web/';
        window.require.config({
          paths: {
            'toast': wb + 'modules/toast/toast',
            'dialog': wb + 'modules/dialog/dialog',
            'alert': wb + 'modules/common/dialogs/alert',
            'inputmanager': wb + 'modules/common/inputmanager',
            'playbackManager': wb + 'modules/common/playback/playbackmanager',
            'events': wb + 'modules/emby-apiclient/events',
            'emby-select': wb + 'modules/emby-elements/emby-select/emby-select',
            'emby-checkbox': wb + 'modules/emby-elements/emby-checkbox/emby-checkbox',
            'emby-slider': wb + 'modules/emby-elements/emby-slider/emby-slider',
            'emby-textarea': wb + 'modules/emby-elements/emby-textarea/emby-textarea',
            'emby-collapse': wb + 'modules/emby-elements/emby-collapse/emby-collapse'
          }
        });
        log('RequireJS paths 已配置(不覆盖baseUrl)');
      }
    } catch (e) { log('RequireJS 配置失败: ' + e); }

    // 4. 轮播组件（style 二选一）
    var bannerId = m.banner || 'banner_cinema';
    var bannerDir = 'banner/' + bannerId;
    // 支持两种 css 命名（style.css 或 <id>.css）
    await loadCSS(bannerDir + '/style.css').then(function (ok) {
      if (!ok) return loadCSS(bannerDir + '/' + bannerId + '.css');
    });
    await loadJS(bannerDir + '/' + (bannerId === 'banner_cinema' ? 'banner-cinema.js'
      : bannerId === 'banner_aurora' ? 'banner-aurora.js'
      : bannerId === 'banner_split' ? 'banner-split.js'
      : bannerId === 'banner_fluent' ? 'banner-fluent.js'
      : bannerId === 'banner_classic' ? 'banner-classic.js'
      : bannerId === 'banner_homeswiper' ? 'HomeSwiper.js'
      : bannerId === 'banner_carousel' ? 'banner-carousel.js' : 'banner-cinema.js'));
    log('轮播已加载: ' + bannerId);

    // 5. 主题 CSS（可叠加）— V1 实际结构是 themes/<id>.css 平铺，需加 html class 激活
    var t = (m.themes || []);
    for (var i = 0; i < t.length; i++) {
      var tid = t[i];
      var ok = await loadCSSIfExists('themes/' + tid + '.css');
      if (ok && tid !== 'vanvy_custom') {
        document.documentElement.classList.add('vanvy-theme-' + tid);
        log('主题激活: vanvy-theme-' + tid);
      }
    }

    // 6. features 功能增强
    var f = (m.features || []);
    for (var j = 0; j < f.length; j++) {
      var fid = f[j];
      // 组件自己的 css（如有，不存在自动跳过）
      await loadCSSIfExists('features/' + fid + '/style.css');
      // 组件 js（按 id 映射文件名，支持多 js 逗号分隔）
      var jsMap = {
        'danmaku': 'ede.js',
        'detail_extra': 'extrafanart-trailers.js',
        'douban': 'douban-score.js',
        'embytool': 'remote-path.js',
        'extrafanart': 'stills.js',
        'fluent_layout': 'fluent-layout.js',
        'global_fonts': 'global-fonts.js',
        'hover_glow': 'hover-glow.js',
        'jav_details': 'cn2t.js,trailer_more_button.js,emby_detail_page.js,list_page_trailer.js,actor_page.js',
        'localplayer': 'external-player.js',
        'playbackrate': 'playback-speed.js',
        'player_enhance': 'player-enhance.js'
      };
      var jsList = (jsMap[fid] || '').split(',');
      // ⚠️ 2026-08-18 修复: jav_details 的 cn2t.js(OpenCC) 是 UMD 库,
      //    RequireJS(define.amd) 存在时会注册成 AMD 模块而非全局 OpenCC → emby_detail_page 引用 OpenCC 崩溃
      //    加载 jav_details 前临时禁用 define.amd, 加载完恢复
      var amdBackup = null;
      if (fid === 'jav_details') {
        try {
          if (window.define && window.define.amd) {
            amdBackup = window.define.amd;
            window.define.amd = false;
            log('jav_details: 临时禁用 define.amd(让 OpenCC 挂全局)');
          }
        } catch (e) {}
      }
      for (var k = 0; k < jsList.length; k++) {
        if (jsList[k]) await loadJS('features/' + fid + '/' + jsList[k]);
      }
      if (amdBackup !== null) {
        try { window.define.amd = amdBackup; } catch (e) {}
        // 若 OpenCC 仍未挂全局, 从 RequireJS 注册表手动补挂
        try {
          if (typeof OpenCC === 'undefined' && window.require && window.require.s && window.require.s.contexts) {
            var ctx = window.require.s.contexts._;
            if (ctx && ctx.defined && ctx.defined.cn2t) {
              window.OpenCC = ctx.defined.cn2t;
              log('OpenCC 从 RequireJS 注册表补挂全局');
            }
          }
        } catch (e) {}
      }
    }

    // 6.5 branding 品牌定制（加载页 LOGO / 侧边栏）— 有文件才加载
    try {
      var splashOk = await exists('branding/vanvy-splash.js');
      if (splashOk) await loadJS('branding/vanvy-splash.js');
    } catch (e) { log('branding 加载跳过: ' + e); }

    // 7. 全局覆盖层（最后加载 = 最高优先级）— 默认关闭，仅在 manifest 显式开启时加载
    //    ⚠️ 2026-08-18 修复：V1.5 曾默认强制加载 377 个 !important 覆盖层 → 原有页面全乱
    //    主人 V1 配置里的“黑金”= banner_cinema 的 midnight 主题色，不是这套暴力覆盖层
    if (m.baseBlack === true) {
      var black = document.createElement('link');
      black.rel = 'stylesheet'; black.href = BASE + 'vanvy-black.css?v=' + VER;
      document.head.appendChild(black);
    }
    if (m.blackGold === true) {
      var gold = document.createElement('link');
      gold.rel = 'stylesheet'; gold.href = BASE + 'vanvy-black-gold.css?v=' + VER;
      document.head.appendChild(gold);
    }

    // 9. 预载 TMDB 高清宽幅图映射（轮播背景回退用）
    try {
      fetch(BASE + 'tmdb-backdrops.json', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (mm) { window._vanvyTmdbBd = mm || {}; log('TMDB 图映射: ' + Object.keys(mm || {}).length + ' 张'); })
        .catch(function () {});
    } catch (e) {}

    // 10. 广播完成事件（版本水印已移除，避免遮挡页面）
    try { window.dispatchEvent(new CustomEvent('vanvy:setup-done')); } catch (e) {}
    log('V1.5 资源加载完成');
    // 资源加载完成 → 隐藏 setup 加载动画(轮播即将显示)
    hideSetupLoading();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setup(); });
  } else {
    setup();
  }
})();
