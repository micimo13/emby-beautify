/* ═══════════════════════════════════════════════════════════════════
   vanvy-list-trailer · 卡片预告片（悬停静音预览 + 展开按钮弹框）
   ───────────────────────────────────────────────────────────────────
   设计原则（严格遵守项目铁律）：
     ① 只做「加挂」——不劫持 Emby 内部方法、不改原生卡片结构、不接管原生点击
     ② 事件用 document 级委托 —— Emby 列表是虚拟滚动（节点会被回收复用），
        逐节点 addEventListener 必然导致监听器泄漏 / 重复绑定
     ③ 预告片地址「惰性获取」——只有真的 hover 到卡片才请求 1 次，且带 TTL 缓存
     ④ 触屏 / 无 hover 设备整体跳过（移动端没有 hover 语义，硬做只会误触）
     ⑤ 拿不到预告片 → 打标记，永不重试（避免每次划过都打一次 API）
     ⑥ 预览层 pointer-events:none —— 绝不影响用户点击卡片跳转
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__VANVY_LIST_TRAILER__) return;
  window.__VANVY_LIST_TRAILER__ = true;

  var CFG = {
    enabled: true,
    hover: true,        // 悬停静音自动预览
    expand: true,       // 卡片展开按钮（打开弹框看完整预告片）
    delay: 320,         // 悬停多久才加载（防误触 / 防快速划过打接口）
    ttlMin: 720,        // 缓存有效期（分钟）
    maxPreview: 1,      // 同屏最多几个预览（保险丝）
    forceHover: false,  // 触屏也强制启用（调试用）
    debug: false
  };
  try { if (window.VANVY_LIST_TRAILER_CONFIG) { for (var _k in window.VANVY_LIST_TRAILER_CONFIG) CFG[_k] = window.VANVY_LIST_TRAILER_CONFIG[_k]; } } catch (e) {}
  if (!CFG.enabled) return;

  function log() { if (!CFG.debug) return; try { console.log.apply(console, ['[VTL]'].concat([].slice.call(arguments))); } catch (e) {} }
  function $(s, r) { return (r || document).querySelector(s); }

  // ── 触屏 / 无 hover → 整体跳过 ──────────────────────────────────
  //   ⚠️ 只判 (hover:none) 不够：无头浏览器与部分远程桌面也报 hover:none，但照样有鼠标。
  //      必须叠加 pointer:coarse（真正的触屏设备）才算触屏。
  try {
    if (!CFG.forceHover && window.matchMedia &&
        window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
      log('触屏设备 (hover:none + pointer:coarse)，跳过'); return;
    }
  } catch (e) {}

  /* ── 预告片地址缓存（localStorage，带 TTL）────────────────────── */
  var CACHE_KEY = 'vtlCacheV1';
  var CACHE = (function () { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { return {}; } })();
  function cacheSave() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(CACHE)); } catch (e) {} }
  function cacheGet(id) {
    var e = CACHE[id]; if (!e) return undefined;
    if (Date.now() - (e.t || 0) > CFG.ttlMin * 60000) { delete CACHE[id]; return undefined; }
    return e.u;                                  // '' 表示「确认没有预告片」
  }
  function cacheSet(id, url) {
    CACHE[id] = { u: url || '', t: Date.now() }; cacheSave();
    // 防缓存无限增长
    var ks = Object.keys(CACHE);
    if (ks.length > 800) { ks.sort(function (a, b) { return (CACHE[a].t || 0) - (CACHE[b].t || 0); }); for (var i = 0; i < 200; i++) delete CACHE[ks[i]]; cacheSave(); }
  }

  /* ── 工具 ─────────────────────────────────────────────────────── */
  function ytId(u) {
    var m = String(u || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : '';
  }
  function isYouTube(u) { return !!ytId(u); }

  /* ── 从卡片解析 itemId（多路兜底，避免依赖单一 Emby 内部结构）─── */
  function hostOf(cardBox) { return cardBox.closest('.virtualScrollItem') || cardBox.parentElement || cardBox; }
  // Emby 虚拟滚动：数据源挂在 virtualScroller 上（源码：virtualScroller._itemSource），
  // 卡片节点只带 _dataItemIndex。⚠️ 不能用 itemParts —— 那是「模板 DOM 片段」，不是条目数据。
  function sourceOf(host) {
    var el = host.parentElement, n = 0;
    while (el && n < 8) {
      if (el._itemSource) return el._itemSource;
      if (Array.isArray(el.items)) return el.items;
      if (el.virtualScroller && el.virtualScroller._itemSource) return el.virtualScroller._itemSource;
      el = el.parentElement; n++;
    }
    return null;
  }
  function cardItemId(cardBox) {
    var host = hostOf(cardBox);
    // ① Emby 虚拟滚动：容器持有 _itemSource，节点持有 _dataItemIndex
    try {
      var src = sourceOf(host);
      var idx = host._dataItemIndex;
      if (idx == null && host.getAttribute) { var di = host.getAttribute('data-index'); if (di != null) idx = parseInt(di, 10); }
      var it = src && idx != null ? src[idx] : null;
      if (it && it.Id) return it.Id;
    } catch (e) {}
    // ② 标准 data-id（卡片本体 / 任意祖先）
    var d = host.getAttribute && host.getAttribute('data-id');
    if (d) return d;
    var p = cardBox.closest('[data-id]');
    if (p && p.getAttribute('data-id')) return p.getAttribute('data-id');
    // ③ 从图片地址里刨（Emby 图片路径形如 /Items/<32位hex>/Images/...）
    var imgs = [cardBox.querySelector('.cardImageContainer'), cardBox.querySelector('img')];
    for (var i = 0; i < imgs.length; i++) {
      var el = imgs[i]; if (!el) continue;
      var s = (el.style && el.style.backgroundImage) || el.getAttribute('src') || el.src || '';
      var m = String(s).match(/Items\/([a-f0-9]{32})\//i);
      if (m) return m[1];
    }
    return null;
  }

  /* ── 取预告片地址（Emby 数据；1 次 getItem，必要时再 1 次本地预告片）── */
  function api() { return window.ApiClient; }
  function apiUrl(path, params) {
    var c = api();
    try { if (c && c.getUrl) return c.getUrl(path, params); } catch (e) {}
    return path;
  }
  function trailerStreamUrl(id) {
    var c = api(), tok = '';
    try { tok = (c && c.accessToken && c.accessToken()) || ''; } catch (e) {}
    var u = apiUrl('/Videos/' + id + '/stream', { Static: true, api_key: tok });
    return u;
  }
  function fetchTrailer(id) {
    var c = api();
    if (!c || !c.getItem) return Promise.resolve(null);
    var uid; try { uid = c.getCurrentUserId(); } catch (e) { uid = null; }
    return Promise.resolve(c.getItem(uid, id)).then(function (item) {
      if (!item) return null;
      // 卡片是合集/人物/文件夹 → 不掺和
      if (item.Type === 'BoxSet' || item.Type === 'Person' || item.Type === 'Folder' ||
          item.Type === 'CollectionFolder' || item.Type === 'UserView') return null;
      var rt = (item.RemoteTrailers || []).filter(function (t) { return t && t.Url; });
      if (rt.length) return rt[0].Url;
      if ((item.LocalTrailerCount || 0) > 0 && c.getLocalTrailers) {
        return Promise.resolve(c.getLocalTrailers(uid, id)).then(function (ls) {
          if (!ls || !ls.length) return null;
          return trailerStreamUrl(ls[0].Id);
        }).catch(function () { return null; });
      }
      return null;
    }).catch(function (e) { log('getItem 失败', id, e && e.message); return null; });
  }

  /* ── 预览 / 弹框的媒体元素 ───────────────────────────────────── */
  function buildMedia(url, opts) {
    opts = opts || {};
    var y = ytId(url);
    if (y) {
      var f = document.createElement('iframe');
      var q = '?autoplay=1&playsinline=1&rel=0&loop=1&playlist=' + y;
      q += (opts.controls ? '&controls=1&modestbranding=1' : '&controls=0&modestbranding=1');
      q += (opts.muted ? '&mute=1' : '');
      // nocookie + origin：第三方 cookie 受限/缺 origin 时 YouTube 常拒绝播放（主人 2026-09-13 反馈）
      var org = '';
      try { org = encodeURIComponent(location.origin || (location.protocol + '//' + location.host)); } catch (e) {}
      if (org) q += '&origin=' + org;
      f.src = 'https://www.youtube-nocookie.com/embed/' + y + q;
      f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; web-share');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      f.setAttribute('frameborder', '0');
      f.className = 'vtl-media';
      return f;
    }
    var v = document.createElement('video');
    v.className = 'vtl-media';
    v.src = url;
    v.muted = !!opts.muted;
    v.autoplay = true; v.loop = !opts.controls; v.playsInline = true;
    v.setAttribute('playsinline', '');
    if (opts.controls) v.controls = true;
    v.addEventListener('error', function () { log('media error', url); });
    return v;
  }

  /* ── 单卡状态 ───────────────────────────────────────────────── */
  function markState(cardBox, st) { cardBox.setAttribute('data-vtl', st); }
  function stateOf(cardBox) { return cardBox.getAttribute('data-vtl') || ''; }

  /* ── 悬停预览 ───────────────────────────────────────────────── */
  var activeCard = null, hoverTimer = null;
  var previewCount = function () { return document.querySelectorAll('.vtl-preview').length; };

  function ensureDot(cardBox) {
    var ic = cardBox.querySelector('.cardImageContainer') || cardBox;
    ic.classList.add('vtl-ic');
    if (ic.querySelector('.vtl-ring')) return;
    var ring = document.createElement('i'); ring.className = 'vtl-ring';
    ic.appendChild(ring);
  }

  function stopPreview(cardBox) {
    if (!cardBox) return;
    var pv = cardBox.querySelector('.vtl-preview'); if (pv) pv.remove();
    var ic = cardBox.querySelector('.cardImageContainer');
    if (ic) ic.classList.remove('vtl-ic');
    cardBox.classList.remove('vtl-playing');
  }

  function startPreview(cardBox, url) {
    if (!cardBox || !url) return;
    if (previewCount() >= CFG.maxPreview) return;
    stopPreview(cardBox);
    // ⚠️ 预览层要贴「海报区」而不是整张卡片：Emby 的 .cardBox 含底部文字行，
    //    贴整张会把文字也盖住 → 观感就是「一大块黑块盖掉整张图」（旧版毛病）。
    var ic = cardBox.querySelector('.cardImageContainer') || cardBox;
    ic.classList.add('vtl-ic');
    var wrap = document.createElement('div');
    wrap.className = 'vtl-preview';
    var media = buildMedia(url, { muted: true, controls: false });
    wrap.appendChild(media);
    ic.appendChild(wrap);
    // 真正可播时才淡入（加载期不出黑块，海报一直透出）
    var onPlay = function () { wrap.classList.add('playing'); };
    if (media.tagName === 'VIDEO') {
      media.addEventListener('playing', onPlay, { once: true });
      media.addEventListener('loadeddata', onPlay, { once: true });
      var pr = media.play && media.play(); if (pr && pr.catch) pr.catch(function () {});
    } else { setTimeout(onPlay, 700); }
    cardBox.classList.add('vtl-playing');
    requestAnimationFrame(function () { wrap.classList.add('on'); });
  }

  function ensureExpandBtn(cardBox) {
    if (!CFG.expand) return;
    if (cardBox.querySelector('.vtl-expand')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vtl-expand';
    b.title = '看预告片';
    b.setAttribute('aria-label', '看预告片');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5v14l11-7z"/></svg>';
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var url = cardBox.__vtlUrl || cacheGet(cardBox.__vtlId);
      if (!url) { var id = cardBox.__vtlId || cardItemId(cardBox); if (id) { cardBox.__vtlId = id; openModalLoading(); fetchTrailer(id).then(function (u) { cacheSet(id, u); if (u) openModal(u); else closeModal(); }); } return; }
      openModal(url);
    });
    cardBox.appendChild(b);
  }

  function onEnter(cardBox) {
    var st = stateOf(cardBox);
    if (st === 'none') return;                       // 确认无预告片 → 不再理
    var id = cardBox.__vtlId || cardItemId(cardBox);
    if (!id) return;
    cardBox.__vtlId = id;

    if (st === 'ready') { if (CFG.hover) startPreview(cardBox, cardBox.__vtlUrl); return; }

    // 缓存命中：直接出
    var cached = cacheGet(id);
    if (cached !== undefined) {
      cardBox.__vtlUrl = cached;
      markState(cardBox, cached ? 'ready' : 'none');
      if (cached) { ensureExpandBtn(cardBox); ensureDot(cardBox); if (CFG.hover) startPreview(cardBox, cached); }
      return;
    }

    // 惰性请求（延迟，防误触）；pending 按卡记录，不阻塞其它卡片
    if (cardBox.__vtlPending) return;
    cardBox.__vtlPending = true;
    hoverTimer = setTimeout(function () {
      hoverTimer = null;
      fetchTrailer(id).then(function (url) {
        cardBox.__vtlPending = false;
        cacheSet(id, url);
        if (!cardBox.isConnected) return;             // 卡片已被虚拟滚动回收
        cardBox.__vtlUrl = url || '';
        markState(cardBox, url ? 'ready' : 'none');
        if (!url) return;
        ensureExpandBtn(cardBox); ensureDot(cardBox);
        if (CFG.hover && cardBox.matches(':hover')) startPreview(cardBox, url);
      });
    }, CFG.delay);
  }

  function onLeave(cardBox) {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (cardBox) cardBox.__vtlPending = false;
    stopPreview(cardBox);
    if (activeCard === cardBox) activeCard = null;
  }

  /* ── 弹框 ───────────────────────────────────────────────────── */
  function modalEl() { return document.getElementById('vtl-modal'); }
  function closeModal() {
    var m = modalEl(); if (!m) return;
    m.classList.remove('on');
    var v = m.querySelector('video'); if (v) { try { v.pause(); } catch (e) {} }
    setTimeout(function () { m.remove(); }, 180);
  }
  function openModal(url) {
    closeModal();
    var m = document.createElement('div');
    m.id = 'vtl-modal'; m.className = 'vtl-modal';
    m.innerHTML = '<div class="vtl-modal-mask"></div>'
      + '<div class="vtl-modal-box"><div class="vtl-modal-hd"><b>预告片</b>'
      + (isYouTube(url) ? '<a class="vtl-modal-out" href="' + esc(url) + '" target="_blank" rel="noopener">在 YouTube 打开 ↗</a>' : '')
      + '<button type="button" class="vtl-modal-x" aria-label="关闭">✕</button></div>'
      + '<div class="vtl-modal-body"></div></div>';
    m.querySelector('.vtl-modal-body').appendChild(buildMedia(url, { muted: false, controls: true }));
    document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add('on'); });
    m.addEventListener('click', function (e) {
      if (e.target.closest('.vtl-modal-mask') || e.target.closest('.vtl-modal-x')) closeModal();
    });
    document.addEventListener('keydown', escClose);
  }
  function openModalLoading() {
    var m = document.createElement('div');
    m.id = 'vtl-modal'; m.className = 'vtl-modal';
    m.innerHTML = '<div class="vtl-modal-mask"></div><div class="vtl-modal-box">'
      + '<div class="vtl-modal-hd"><b>预告片</b><button type="button" class="vtl-modal-x">✕</button></div>'
      + '<div class="vtl-modal-body vtl-loading">加载中…</div></div>';
    document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add('on'); });
    m.addEventListener('click', function (e) { if (e.target.closest('.vtl-modal-mask') || e.target.closest('.vtl-modal-x')) closeModal(); });
  }
  function escClose(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escClose); } }

  /* ── document 级委托（虚拟滚动友好）─────────────────────────── */
  document.addEventListener('mouseover', function (e) {
    var cb = e.target.closest && e.target.closest('.cardBox');
    if (!cb) return;
    // 同一卡片内部移动不重复触发
    if (cb.__vtlIn && cb.contains(e.relatedTarget)) return;
    cb.__vtlIn = true;
    if (activeCard && activeCard !== cb) onLeave(activeCard);
    activeCard = cb;
    cb.classList.add('vtl-host');
    onEnter(cb);
  }, true);

  document.addEventListener('mouseout', function (e) {
    var cb = e.target.closest && e.target.closest('.cardBox');
    if (!cb) return;
    if (cb.contains(e.relatedTarget)) return;        // 还在卡片内
    cb.__vtlIn = false;
    onLeave(cb);
  }, true);

  // 路由切换 → 收摊（清预览 + 关弹框，避免残留/播放占用）
  window.addEventListener('hashchange', function () {
    if (activeCard) onLeave(activeCard);
    activeCard = null;
    closeModal();
  });

  log('已加载 v1.0.0', CFG);
})();
