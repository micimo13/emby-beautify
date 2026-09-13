/* ═══════════════════════════════════════════════════════════
   Vanvy Emby Kit V2 · NEO 霓虹赛博轮播组件
   ───────────────────────────────────────────────────────────
   设计: 赛博朋克 — 霓虹灯管发光 / 扫描线 / 网格地面 / 故障毛刺
   数据: Emby API (Backdrop + Primary + Logo)
   用法: VanvyCarouselCore.register('banner_neo', {...})
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.VanvyNeo) return;
  window.VanvyNeo = {};

  var TEMPLATE = '' +
    '<div class="neo">' + '<div class="vbd-bd"></div><div class="vbd-scrim"></div>' +
    '<div class="neo-corner">SYSTEM // <b>VANVY</b> // 2077</div>' +
    '<div class="neo-side">NEON PROTOCOL — 霓虹协议</div>' +
    '<div class="neo-bar b1"></div>' +
    '<div class="neo-bar b2"></div>' +
    '<div class="neo-slide">' +
    '  <div class="neo-poster"><div class="neo-poster-img"></div><div class="neo-poster-glow"></div></div>' +
    '  <div class="neo-info">' +
    '    <div class="neo-tag">// CYBER-PROTOCOL //</div>' +
    '    <div class="neo-title"></div>' +
    '    <div class="neo-sub"></div>' +
    '    <div class="neo-meta">' +
    '      <span class="neo-chip">★ <b class="neo-rating"></b></span>' +
    '      <span class="neo-chip cyan neo-year"></span>' +
    '      <span class="neo-chip cyan neo-genres"></span>' +
    '    </div>' +
    '    <div class="neo-desc"></div>' +
    '    <div class="neo-btns">' +
    '      <button class="neo-btn play" data-action="play">▶ 进入播放</button>' +
    '      <button class="neo-btn detail" data-action="detail">ⓘ 系统详情</button>' +
    '    </div>' +
    '  </div>' +
    '</div>' +
    '<div class="neo-thumbs"></div>' +
    '</div>';

  window.VanvyCarouselCore.register('banner_neo', {
    query: {
      ImageTypes: 'Backdrop',
      EnableImageTypes: 'Backdrop,Primary,Logo',
      IncludeItemTypes: 'Movie,Series',
      SortBy: 'DateCreated',
      Recursive: true,
      Limit: 8,
      Fields: 'ProductionYear,Overview,CommunityRating,Genres',
      EnableUserData: false,
      EnableTotalRecordCount: false
    },

    render: function (items, root, core) {
      root.innerHTML = TEMPLATE;
      var idx = 0;
      var posterEl = root.querySelector('.neo-poster-img');
      var bdEl = root.querySelector('.vbd-bd');
      var titleEl = root.querySelector('.neo-title');
      var subEl = root.querySelector('.neo-sub');
      var ratingEl = root.querySelector('.neo-rating');
      var yearEl = root.querySelector('.neo-year');
      var genresEl = root.querySelector('.neo-genres');
      var descEl = root.querySelector('.neo-desc');
      var thumbsEl = root.querySelector('.neo-thumbs');

      function renderSlide(i) {
        idx = (i + items.length) % items.length;
        var item = items[idx];
        // 海报: 优先 Primary, 回退 Backdrop
        var imgUrl = core.getImageUrl(item, { type: 'Primary', maxWidth: 600 });
        posterEl.style.backgroundImage = 'url("' + imgUrl + '")';
        if (bdEl) bdEl.style.backgroundImage = 'url("' + core.getImageUrl(item, { type: 'Backdrop', maxWidth: 1920 }) + '")';
        // 标题/副标题
        var name = item.Name || '';
        var prodYear = item.ProductionYear || '';
        titleEl.textContent = name;
        subEl.textContent = (item.OriginalTitle || name) + (prodYear ? ' · ' + prodYear : '');
        // 评分/年份/类型
        ratingEl.textContent = item.CommunityRating ? item.CommunityRating.toFixed(1) : 'N/A';
        yearEl.textContent = prodYear || '';
        var genres = (item.Genres || []).slice(0, 2).join(' / ');
        genresEl.textContent = genres;
        // 简介
        var ov = item.Overview || '';
        descEl.textContent = ov.length > 120 ? ov.slice(0, 120) + '…' : ov;
        // 缩略图
        renderThumbs();
        if (core && core.motion) core.motion.play(root);   // 切张动效：文字错峰浮现 + 图片溶解
      }

      function renderThumbs() {
        thumbsEl.innerHTML = '';
        items.forEach(function (it, i) {
          var t = document.createElement('div');
          t.className = 'neo-thumb' + (i === idx ? ' active' : '');
          var u = core.getImageUrl(it, { type: 'Backdrop', maxWidth: 220 });
          t.style.backgroundImage = 'url("' + u + '")';
          t.addEventListener('click', function () { renderSlide(i); });
          thumbsEl.appendChild(t);
        });
      }

      // 按钮
      root.querySelector('[data-action="play"]').addEventListener('click', function () {
        var item = items[idx];
        if (window.ApiClient) {
          var url = window.ApiClient.getPlaybackInfo ? '' : '';
          window.location.hash = '#!/item?id=' + item.Id + '&play=true';
        }
      });
      root.querySelector('[data-action="detail"]').addEventListener('click', function () {
        var item = items[idx];
        window.location.hash = '#!/item?id=' + item.Id;
      });

      renderSlide(0);
      // 自动轮播
      var timer = setInterval(function () { renderSlide(idx + 1); }, 8000);
      root.__vbdTimer = timer;
      root.addEventListener('mouseenter', function () { clearInterval(timer); root.__vbdTimer = null; });
      root.addEventListener('mouseleave', function () {
        clearInterval(timer);
        timer = setInterval(function () { renderSlide(idx + 1); }, 8000);
        root.__vbdTimer = timer;
      });
    }
  });

  // 启动 (profile 调用)
  window.VanvyNeo.start = function () {
    window.VanvyCarouselCore.start('banner_neo');
  };
})();
