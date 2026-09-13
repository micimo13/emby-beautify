/* ═══════════════════════════════════════════════════════════
   Hero Studio · CLASSIC 经典满屏（对齐原始设计稿 mockup/index.html）
   动态：底部对齐文案 · 左右箭头 · 分页点 · 背景缓慢推拉 · 标题上浮
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.VanvyHero) return;

  window.VanvyHero.register('classic', {
    query: { SortBy: 'DateCreated', Limit: 6 },

    init: function (api) {
      api.root.innerHTML = [
        '<div class="vhk">',
        '  <div class="vhk-slides"></div>',
        '  <div class="vhk-in">',
        '    <div class="vhk-tag"></div>',
        '    <h1 class="vhk-h1"></h1>',
        '    <div class="vhk-meta"></div>',
        '    <p class="vhk-syn"></p>',
        '    <div class="vhk-cta">',
        '      <button class="vhk-btn play" data-a="play">▶&nbsp; 立即播放</button>',
        '      <button class="vhk-btn ghost" data-a="fav">♥&nbsp; 收藏</button>',
        '      <button class="vhk-btn ghost" data-a="info">ⓘ&nbsp; 详情</button>',
        '    </div>',
        '  </div>',
        '  <button class="vhk-arrow l" data-a="prev" aria-label="上一个">‹</button>',
        '  <button class="vhk-arrow r" data-a="next" aria-label="下一个">›</button>',
        '  <div class="vhk-dots"></div>',
        '</div>'
      ].join('');

      // 每张一个 slide（背景 + 遮罩），交叉淡入
      var slides = api.$('.vhk-slides');
      api.items.forEach(function (item, i) {
        var s = document.createElement('div');
        s.className = 'vhk-slide';
        s.innerHTML = '<img class="vhk-bd" alt="" loading="lazy"><div class="vhk-veil"></div>';
        slides.appendChild(s);
      });

      // 分页点
      var dots = api.$('.vhk-dots');
      api.items.forEach(function (_, i) {
        var b = document.createElement('button');
        b.className = 'vhk-dot';
        b.addEventListener('click', function () { api.go(i); });
        dots.appendChild(b);
      });

      api.$('[data-a="prev"]').addEventListener('click', function () { api.stopAuto(); api.prev(); });
      api.$('[data-a="next"]').addEventListener('click', function () { api.stopAuto(); api.next(); });
      api.$('[data-a="play"]').addEventListener('click', function () { open(api); });
      api.$('[data-a="info"]').addEventListener('click', function () { open(api); });
      api.$('[data-a="fav"]').addEventListener('click', function () {
        var it = api.items[api.index];
        if (window.ApiClient && ApiClient.updateFavorite) ApiClient.updateFavorite(it.Id, true);
        api.$('[data-a="fav"]').innerHTML = '♥&nbsp; 已收藏';
      });
      function open(a) {
        var it = a.items[a.index];
        if (window.Emby && Emby.Page && Emby.Page.showItem) Emby.Page.showItem(it.Id, (window.ApiClient && ApiClient.serverId()) || '');
        else location.hash = '#!/item?id=' + it.Id;
      }

      api.autoplay(8000);
      return true;
    },

    slide: function (item, i, api) {
      var ss = api.$$('.vhk-slide');
      ss.forEach(function (el, k) {
        var on = k === i;
        el.classList.toggle('on', on);
        var img = el.querySelector('.vhk-bd');
        if (on && !img.getAttribute('src')) {
          img.src = api.img(item, { type: 'Backdrop', maxWidth: 1920 });
        }
      });
      // 背景推拉
      var cur = ss[i] && ss[i].querySelector('.vhk-bd');
      if (cur) {
        cur.style.transition = 'none';
        cur.style.transform = 'scale(1.04)';
        requestAnimationFrame(function () {
          cur.style.transition = 'transform 9s linear';
          cur.style.transform = 'scale(1.13)';
        });
      }

      api.$('.vhk-tag').textContent = '本周精选 · FEATURED';
      api.$('.vhk-h1').textContent = item.Name || '';
      var m = [];
      if (item.CommunityRating) m.push('<span class="star">★ ' + api.rating(item) + '</span>');
      if (item.ProductionYear) m.push('<span>' + api.year(item) + '</span>');
      if (api.genres(item, 3)) m.push('<span>' + api.esc(api.genres(item, 3)) + '</span>');
      if (item.OfficialRating) m.push('<span class="chip">' + api.esc(item.OfficialRating) + '</span>');
      api.$('.vhk-meta').innerHTML = m.join('<i>·</i>');
      api.$('.vhk-syn').textContent = api.clip(item.Overview || '暂无简介', 150);
      api.$('[data-a="fav"]').innerHTML = '♥&nbsp; 收藏';

      // 文案重新入场
      var inn = api.$('.vhk-in');
      inn.classList.remove('in');
      void inn.offsetWidth;
      inn.classList.add('in');

      api.$$('.vhk-dot').forEach(function (d, k) { d.classList.toggle('on', k === i); });
    }
  });
})();
