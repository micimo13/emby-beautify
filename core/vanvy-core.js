/**
 * Vanvy Emby Kit · 核心库
 * 命名空间: VanvyKit
 * 功能: Emby API 通信 (BroadcastChannel 机制) / DOM 工具 / 命名空间
 * 设计: IIFE 封装, 零全局污染, 所有组件依赖此库
 */
(function () {
  'use strict';

  if (window.VanvyKit) return; // 幂等

  const NS = 'VanvyKit';

  /** Emby API 通信: 注入 script 进页面上下文, 通过 BroadcastChannel 回传 */
  function injectCode(code) {
    const hash = 'vanvy' + Math.random().toString(36).slice(2, 10);
    return new Promise((resolve, reject) => {
      let channel = null;
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel(hash);
        channel.addEventListener('message', (e) => { resolve(e.data); cleanup(); });
      } else if ('postMessage' in window) {
        window.addEventListener('message', function handler(e) {
          if (e.data && e.data.channel === hash) { resolve(e.data.message); cleanup(); }
        });
      }
      function cleanup() {
        if (channel) channel.close();
        const s = document.querySelector('script.vanvy-i-' + hash);
        if (s) s.remove();
      }
      const script = document.createElement('script');
      script.className = 'vanvy-i-' + hash;
      script.textContent = `
        setTimeout(async () => {
          async function __vanvyRun${hash}(){${code}}
          try {
            const result = await __vanvyRun${hash}();
            ${'BroadcastChannel' in window
              ? `const ch = new BroadcastChannel(${JSON.stringify(hash)}); ch.postMessage(result);`
              : `window.parent.postMessage({channel:${JSON.stringify(hash)},message:result}, "*");`}
          } catch (err) {
            ${'BroadcastChannel' in window
              ? `const ch = new BroadcastChannel(${JSON.stringify(hash)}); ch.postMessage({error: String(err)});`
              : `window.parent.postMessage({channel:${JSON.stringify(hash)},message:{error: String(err)}}, "*");`}
          }
          const s = document.querySelector('script.vanvy-i-${hash}');
          if (s) s.remove();
        }, 16);
      `;
      (document.head || document.documentElement).appendChild(script);
    });
  }

  /** 调用 Emby API 方法 */
  function injectCall(func, arg) {
    const code = `
      const client = await new Promise((resolve) => {
        const t = setInterval(() => {
          if (window.ApiClient !== undefined) { clearInterval(t); resolve(window.ApiClient); }
        }, 16);
        setTimeout(() => { clearInterval(t); resolve(null); }, 10000);
      });
      if (!client) return null;
      return await client.${func}(${arg});
    `;
    return injectCode(code);
  }

  /** 获取当前用户 ID */
  function currentUserId() {
    return injectCall('getCurrentUserId', '');
  }

  /** 查询媒体项 (自动匹配媒体库) */
  function getItems(query) {
    return injectCall('getItems', `client.getCurrentUserId(), ${JSON.stringify(query)}`);
  }

  /** 获取单个媒体详情 (带缓存) */
  function getItem(itemId) {
    return injectCall('getItem', `client.getCurrentUserId(), "${itemId}"`);
  }

  /** 获取图片 URL */
  function getImageUrl(itemId, options) {
    return injectCall('getImageUrl', `${itemId}, ${JSON.stringify(options)}`);
  }

  /** 获取服务器名称 */
  function serverName() {
    return injectCall('serverName', '');
  }

  /** DOM 工具 */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  /** 等待条件成立 */
  function waitFor(cond, timeout = 15000, interval = 50) {
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (cond()) { clearInterval(t); resolve(true); }
      }, interval);
      setTimeout(() => { clearInterval(t); resolve(false); }, timeout);
    });
  }

  /** 版本检测 */
  function detectVersion() {
    const html = document.documentElement.outerHTML;
    if (html.includes('modules/fonts')) return '4.9';
    if (html.includes('require.js')) return '4.8';
    return 'unknown';
  }

  const VanvyKit = {
    NS,
    injectCode,
    injectCall,
    currentUserId,
    getItems,
    getItem,
    getImageUrl,
    serverName,
    $, $$,
    waitFor,
    detectVersion,
  };

  window.VanvyKit = VanvyKit;
  console.log('[VanvyKit] 核心库已加载', 'version:', detectVersion());
})();
