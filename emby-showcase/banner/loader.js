/* ═══════════════════════════════════════════════════════════
   Vanvy Noir · 首页轮播增强 loader
   在官方 Emby 首页 sections 前注入大屏 hero 轮播
   - 使用官方 ApiClient 拉真实数据 (Latest/Resume)
   - 保留官方 sections (继续观看/推荐等) 全部功能
   - 主题: vanvy-noir
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.VanvyNoirLoaded) return;
  window.VanvyNoirLoaded = true;

  var STYLE_ID = 'vanvy-noir-banner-style';
  var BANNER_CLS = 'vanvy-noir-banner';

  /* ── 注入样式 ── */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = '' +
      '.' + BANNER_CLS + '{position:relative;height:420px;border-radius:18px;overflow:hidden;margin:16px 24px 24px;' +
      '  box-shadow:0 20px 60px rgba(0,0,0,.5);' +
      '  background:linear-gradient(135deg,#3d2a66 0%,#221440 45%,#120b24 100%);}' +
      '.' + BANNER_CLS + ' .vnb-slide{position:absolute;inset:0;background-size:cover;background-position:center;' +
      '  opacity:0;transition:opacity .7s;pointer-events:none;}' +
      '.' + BANNER_CLS + ' .vnb-slide.on{opacity:1;pointer-events:auto;}' +
      '.' + BANNER_CLS + ' .vnb-shade{position:absolute;inset:0;' +
      '  background:linear-gradient(90deg,hsla(258,30%,7%,.92) 0%,transparent 55%),linear-gradient(0deg,hsla(258,30%,7%,.9) 0%,transparent 40%);}' +
      '.' + BANNER_CLS + ' .vnb-content{position:relative;z-index:2;padding:44px 40px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;max-width:620px;}' +
      '.' + BANNER_CLS + ' .vnb-tag{font-size:11px;letter-spacing:3px;color:#f5c518;margin-bottom:10px;display:flex;align-items:center;gap:8px;}' +
      '.' + BANNER_CLS + ' .vnb-tag::before{content:"";width:24px;height:1px;background:#f5c518;}' +
      '.' + BANNER_CLS + ' .vnb-title{font-size:40px;font-weight:800;line-height:1.08;margin-bottom:6px;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.7);}' +
      '.' + BANNER_CLS + ' .vnb-sub{font-size:13px;letter-spacing:2px;color:rgba(255,255,255,.6);margin-bottom:10px;}' +
      '.' + BANNER_CLS + ' .vnb-meta{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;}' +
      '.' + BANNER_CLS + ' .vnb-chip{padding:2px 12px;font-size:11px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.85);}' +
      '.' + BANNER_CLS + ' .vnb-chip.gold{background:rgba(245,197,24,.15);border-color:rgba(245,197,24,.5);color:#f5c518;}' +
      '.' + BANNER_CLS + ' .vnb-desc{font-size:13px;line-height:1.7;color:rgba(255,255,255,.72);max-width:480px;margin-bottom:18px;}' +
      '.' + BANNER_CLS + ' .vnb-btns{display:flex;gap:10px;}' +
      '.' + BANNER_CLS + ' .vnb-play{padding:11px 28px;border:none;border-radius:999px;font-size:13px;font-weight:700;cursor:pointer;background:#f5c518;color:#161616;}' +
      '.' + BANNER_CLS + ' .vnb-play:hover{background:#ffd94a;}' +
      '.' + BANNER_CLS + ' .vnb-detail{padding:11px 22px;border-radius:999px;font-size:13px;cursor:pointer;background:transparent;color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.2);}' +
      '.' + BANNER_CLS + ' .vnb-detail:hover{border-color:#f5c518;color:#f5c518;}' +
      '.' + BANNER_CLS + ' .vnb-dots{position:absolute;right:24px;bottom:20px;display:flex;gap:5px;z-index:3;}' +
      '.' + BANNER_CLS + ' .vnb-dot{width:20px;height:3px;border-radius:2px;background:rgba(255,255,255,.3);cursor:pointer;}' +
      '.' + BANNER_CLS + ' .vnb-dot.on{background:#f5c518;width:32px;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ── 拉数据 ── */
  function waitApi(cb) {
    var t = 0;
    var timer = setInterval(function () {
      t += 200;
      if (window.ApiClient && window.ApiClient.getCurrentUserId) {
        clearInterval(timer);
        cb(window.ApiClient);
      } else if (t > 20000) {
        clearInterval(timer);
      }
    }, 200);
  }

  function getLatest(api) {
    var uid = api.getCurrentUserId();
    // 优先取电影 (strm 库剧集常无图, 电影刮削完整有 Primary)
    return api.getItems(uid, {
      IncludeItemTypes: 'Movie',
      SortBy: 'DateCreated',
      SortOrder: 'Descending',
      Recursive: true,
      Limit: 10,
      Fields: 'ProductionYear,Overview,CommunityRating,Genres,PrimaryImageAspectRatio',
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary,Backdrop,Thumb'
    }).then(function (d) {
      var items = d.Items || [];
      // 过滤: 必须有 Primary 图
      return items.filter(function (i) { return i.ImageTags && i.ImageTags.Primary; }).slice(0, 6);
    }).catch(function () { return []; });
  }

  function imgUrl(api, item, type, w) {
    // 直接拼 URL (带 token), 最稳定: /emby/Items/{id}/Images/{type}?maxWidth=&tag=&api_key=
    try {
      var base = api.serverAddress ? api.serverAddress().replace(/\/$/, '') : window.location.origin;
      var tag = (item.ImageTags && item.ImageTags[type]) ? item.ImageTags[type] : '';
      var token = api.accessKey ? api.accessKey() : '';
      // 无 token 时尝试从 localStorage 拿
      if (!token) {
        try {
          var creds = JSON.parse(localStorage.getItem('embyCredentials') || 'null');
          if (creds && creds.Servers && creds.Servers[0]) token = creds.Servers[0].AccessToken || '';
        } catch (e) {}
      }
      var q = 'maxWidth=' + w + '&quality=90';
      if (tag) q += '&tag=' + encodeURIComponent(tag);
      if (token) q += '&api_key=' + token;
      return base + '/emby/Items/' + item.Id + '/Images/' + type + '?' + q;
    } catch (e) { return ''; }
  }

  /* ── 渲染 banner ── */
  function render(api) {
    if (document.querySelector('.' + BANNER_CLS)) return;
    getLatest(api).then(function (items) {
      var withImg = items.filter(function (i) {
        return i.ImageTags && (i.ImageTags.Thumb || i.ImageTags.Backdrop || i.ImageTags.Primary);
      });
      var hero = withImg.length >= 2 ? withImg : items;
      if (!hero.length) return;

      var container = document.querySelector('.homeSectionsContainer, .sections');
      if (!container) return;

      var banner = document.createElement('div');
      banner.className = BANNER_CLS;
      var slides = hero.map(function (m, i) {
        var bg = imgUrl(api, m, m.ImageTags && m.ImageTags.Thumb ? 'Thumb' : (m.ImageTags && m.ImageTags.Backdrop ? 'Backdrop' : 'Primary'), 1280);
        var genres = (m.Genres || []).slice(0, 3);
        return '<div class="vnb-slide' + (i === 0 ? ' on' : '') + '" style="background-image:url(' + bg + ')">' +
          '<div class="vnb-shade"></div>' +
          '<div class="vnb-content">' +
          '  <div class="vnb-tag">' + (i === 0 ? '推荐 · 本周主打' : (m.Type === 'Series' ? '热门剧集' : '热门电影')) + '</div>' +
          '  <div class="vnb-title">' + (m.Name || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }) + '</div>' +
          '  <div class="vnb-sub">' + (m.ProductionYear || '') + (m.CommunityRating ? ' · ★ ' + m.CommunityRating.toFixed(1) : '') + '</div>' +
          '  <div class="vnb-meta">' + genres.map(function (g) { return '<span class="vnb-chip gold">' + g + '</span>'; }).join('') + '</div>' +
          '  <div class="vnb-desc">' + ((m.Overview || '').slice(0, 110) + ((m.Overview || '').length > 110 ? '…' : '')) + '</div>' +
          '  <div class="vnb-btns">' +
          '    <button class="vnb-play" data-id="' + m.Id + '" data-name="' + (m.Name || '').replace(/"/g, '&quot;') + '">▶ 立即播放</button>' +
          '    <button class="vnb-detail" data-id="' + m.Id + '">详情</button>' +
          '  </div>' +
          '</div></div>';
      }).join('');
      var dots = hero.map(function (_, i) { return '<span class="vnb-dot' + (i === 0 ? ' on' : '') + '" data-i="' + i + '"></span>'; }).join('');
      banner.innerHTML = slides + '<div class="vnb-dots">' + dots + '</div>';
      container.insertBefore(banner, container.firstChild);

      // 交互: 详情/播放
      banner.querySelectorAll('.vnb-detail').forEach(function (b) {
        b.addEventListener('click', function () {
          window.location.hash = '#!/item?id=' + b.getAttribute('data-id');
        });
      });
      banner.querySelectorAll('.vnb-play').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-id');
          var name = b.getAttribute('data-name');
          // 用官方播放器: 直接跳官方播放路由
          window.location.hash = '#!/item?id=' + id + '&play=true';
        });
      });
      // 轮播切换
      var idx = 0;
      var slidesEls = banner.querySelectorAll('.vnb-slide');
      var dotsEls = banner.querySelectorAll('.vnb-dot');
      function go(i) {
        idx = (i + slidesEls.length) % slidesEls.length;
        slidesEls.forEach(function (s, k) { s.classList.toggle('on', k === idx); });
        dotsEls.forEach(function (d, k) { d.classList.toggle('on', k === idx); });
      }
      dotsEls.forEach(function (d) {
        d.addEventListener('click', function () { go(parseInt(d.getAttribute('data-i'), 10)); });
      });
      setInterval(function () { go(idx + 1); }, 8000);
    });
  }

  /* ── 启动: 等待首页出现 ── */
  injectStyle();
  var lastUrl = '';
  setInterval(function () {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // 离开首页清理 banner (保留官方功能)
      if (window.location.href.indexOf('!/home') === -1) {
        document.querySelectorAll('.' + BANNER_CLS).forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
      }
    }
    if (window.location.href.indexOf('!/home') !== -1) {
      waitApi(function (api) { render(api); });
    }
  }, 500);
})();
