/**
 * =============================================================================
 *  Vanvy Emby Kit · Chrome 扩展入口 (content.js)
 *  ---------------------------------------------------------------------------
 *  双模部署的扩展版: 在浏览器端装配 kit 组件, 无需改服务端文件。
 *  与 server 版共用同一套组件逻辑 (rules-loader / banner-fluent / fluent-layout / global-fonts)。
 *
 *  差异处理:
 *   - carousel-rules.json 从服务端 fetch (同源, 无需额外权限)
 *   - 组件通过 chrome.runtime.getURL 取扩展内资源
 * =============================================================================
 */
(function () {
  'use strict';

  const IS_EMBY = document.querySelector('meta[name="application-name"][content="Emby"]')
    || document.title.includes('Emby')
    || window.location.pathname.includes('/web/index.html');
  if (!IS_EMBY) return;

  console.log('[VanvyKit-Ext] 检测到 Emby 页面, 装配扩展组件...');

  // 1. 注入字体 CSS (全局字体应用)
  function injectCSS(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    (document.head || document.documentElement).appendChild(link);
  }

  // 2. 注入 JS 组件
  function injectScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve(true);
      s.onerror = () => { console.warn('[VanvyKit-Ext] 组件加载失败: ' + src); resolve(false); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // 3. 加载服务端 carousel-rules.json (同源 fetch; 失败则用默认规则)
  function fetchServerRules() {
    return fetch('vanvy/carousel-rules.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
  }

  async function boot() {
    const base = chrome.runtime.getURL('');

    // 先注入依赖库
    await injectScript(base + 'static/js/jquery-3.6.0.min.js');
    await injectScript(base + 'static/js/common-utils.js');
    await injectScript(base + 'static/js/md5.min.js');
    injectCSS(base + 'static/css/style.css');

    // 注入核心组件 (顺序: rules-loader → banner → 布局 → 字体)
    await injectScript(base + 'content/rules-loader.js');
    await injectScript(base + 'content/banner-fluent.js');
    await injectScript(base + 'content/fluent-layout.js');
    await injectScript(base + 'content/global-fonts.js');

    // 尝试加载服务端策展规则 (扩展环境 fetch 同源可行; 失败则组件用默认查询)
    const serverRules = await fetchServerRules();
    if (serverRules && window.VanvyCarouselRules) {
      // 已有默认规则, 服务端有则覆盖 (rules-loader 已 fetch 过, 这里做二次同步)
      console.log('[VanvyKit-Ext] 服务端策展规则: ' + ((serverRules.rule || {}).name || '默认'));
    }

    console.log('[VanvyKit-Ext] 组件装配完成');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }
})();
