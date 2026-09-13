/* Vanvy Emby Kit V2 · ORBITAL 轨道 轮播组件 (由效果图演进) */
(function () {
  'use strict';
  if (window.VanvyOrbital) return;
  window.VanvyOrbital = {};

  window.VanvyCarouselCore.register('banner_orbital', {
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
      // 容器结构
      root.innerHTML = '<div class="orbital">' + '<div class="vbd-bd"></div><div class="vbd-scrim"></div>' +
        '<div class="orbital-slide">' +
        '<div class="orbital-poster" data-poster><div data-overlay></div></div>' +
        '  <div class="orbital-info">' +
        '    <div class="orbital-title"></div>' +
        '    <div class="orbital-sub"></div>' +
        '    <div class="orbital-meta"><span class="orbital-rating">★ </span><span class="orbital-year"></span><span class="orbital-genres"></span></div>' +
        '    <div class="orbital-desc"></div>' +
        '    <div class="orbital-btns">' +
        '      <button class="orbital-btn orbital-play" data-action="play">▶ 播放</button>' +
        '      <button class="orbital-btn orbital-detail" data-action="detail">ⓘ 详情</button>' +
        '    </div>' +
        '  </div>' +
        '</div>' +
        '<div class="orbital-thumbs"></div>' +
      '</div>';

      var idx = 0;
      var titleEl = root.querySelector('.orbital-title');
      var subEl = root.querySelector('.orbital-sub');
      var descEl = root.querySelector('.orbital-desc');
      var ratingEl = root.querySelector('.orbital-rating');
      var yearEl = root.querySelector('.orbital-year');
      var genresEl = root.querySelector('.orbital-genres');
      var posterEl = root.querySelector('[data-poster]');
      var bdEl = root.querySelector('.vbd-bd');
      var thumbsEl = root.querySelector('.orbital-thumbs');

      function renderSlide(i) {
        idx = (i + items.length) % items.length;
        var item = items[idx];
        titleEl.textContent = item.Name || '';
        subEl.textContent = (item.OriginalTitle || item.Name || '') + (item.ProductionYear ? ' · ' + item.ProductionYear : '');
        ratingEl.textContent = '★ ' + (item.CommunityRating ? item.CommunityRating.toFixed(1) : 'N/A');
        yearEl.textContent = item.ProductionYear || '';
        genresEl.textContent = (item.Genres || []).slice(0, 2).join(' / ');
        var ov = item.Overview || '';
        descEl.textContent = ov.length > 120 ? ov.slice(0, 120) + '…' : ov;
        if (posterEl) {
          var u = core.getImageUrl(item, { type: 'Primary', maxWidth: 600 });
          posterEl.style.backgroundImage = 'url("' + u + '")';
        }
        if (bdEl) bdEl.style.backgroundImage = 'url("' + core.getImageUrl(item, { type: 'Backdrop', maxWidth: 1920 }) + '")';
        renderThumbs();
        if (core && core.motion) core.motion.play(root);   // 切张动效：文字错峰浮现 + 图片溶解
      }

      function renderThumbs() {
        thumbsEl.innerHTML = '';
        items.forEach(function (it, i) {
          var t = document.createElement('div');
          t.className = 'orbital-thumb' + (i === idx ? ' active' : '');
          t.setAttribute('data-thumb', '');
          var u = core.getImageUrl(it, { type: 'Backdrop', maxWidth: 220 });
          t.style.backgroundImage = 'url("' + u + '")';
          t.addEventListener('click', function () { renderSlide(i); });
          thumbsEl.appendChild(t);
        });
      }

      root.querySelector('[data-action="play"]').addEventListener('click', function () {
        var item = items[idx];
        window.location.hash = '#!/item?id=' + item.Id + '&play=true';
      });
      root.querySelector('[data-action="detail"]').addEventListener('click', function () {
        var item = items[idx];
        window.location.hash = '#!/item?id=' + item.Id;
      });

      renderSlide(0);
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

  window.VanvyOrbital.start = function () {
    window.VanvyCarouselCore.start('banner_orbital');
  };
})();
