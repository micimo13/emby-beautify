/* Vanvy Emby Kit V2 · RETRO 复古胶片 轮播组件 (由效果图演进) */
(function () {
  'use strict';
  if (window.VanvyRetro) return;
  window.VanvyRetro = {};

  window.VanvyCarouselCore.register('banner_retro', {
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
      root.innerHTML = '<div class="retro">' + '<div class="vbd-bd"></div><div class="vbd-scrim"></div>' +
        '<div class="retro-slide">' +
        '<div class="retro-poster" data-poster><div data-overlay></div></div>' +
        '  <div class="retro-info">' +
        '    <div class="retro-title"></div>' +
        '    <div class="retro-sub"></div>' +
        '    <div class="retro-meta"><span class="retro-rating">★ </span><span class="retro-year"></span><span class="retro-genres"></span></div>' +
        '    <div class="retro-desc"></div>' +
        '    <div class="retro-btns">' +
        '      <button class="retro-btn retro-play" data-action="play">▶ 播放</button>' +
        '      <button class="retro-btn retro-detail" data-action="detail">ⓘ 详情</button>' +
        '    </div>' +
        '  </div>' +
        '</div>' +
        '<div class="retro-thumbs"></div>' +
      '</div>';

      var idx = 0;
      var titleEl = root.querySelector('.retro-title');
      var subEl = root.querySelector('.retro-sub');
      var descEl = root.querySelector('.retro-desc');
      var ratingEl = root.querySelector('.retro-rating');
      var yearEl = root.querySelector('.retro-year');
      var genresEl = root.querySelector('.retro-genres');
      var posterEl = root.querySelector('[data-poster]');
      var bdEl = root.querySelector('.vbd-bd');
      var thumbsEl = root.querySelector('.retro-thumbs');

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
          t.className = 'retro-thumb' + (i === idx ? ' active' : '');
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

  window.VanvyRetro.start = function () {
    window.VanvyCarouselCore.start('banner_retro');
  };
})();
