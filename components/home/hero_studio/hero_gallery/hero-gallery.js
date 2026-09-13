/* ═══════════════════════════════════════════════════════════
   Hero Studio · GALLERY 画廊（横向 snap 滚动大图廊）
   动态：原生横向滚动（滚轮/拖拽/触屏）· snap 居中放大 · 虚化背景换图
        当前卡片上浮发光 · 左右箭头 · 分页点
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.VanvyHero) return;

  window.VanvyHero.register('gallery', {
    query: { SortBy: 'Random', Limit: 10 },

    init: function (api) {
      api.root.innerHTML = [
        '<div class="vhg">',
        '  <div class="vhg-bg"></div>',
        '  <div class="vhg-fade"></div>',
        '  <div class="vhg-head">',
        '    <div class="vhg-k">探索片库 · EXPLORE</div>',
        '    <div class="vhg-title"></div>',
        '    <div class="vhg-sub"></div>',
        '  </div>',
        '  <button class="vhg-arrow l" data-a="prev" aria-label="上一个">‹</button>',
        '  <div class="vhg-scroll" tabindex="0"><div class="vhg-track"></div></div>',
        '  <button class="vhg-arrow r" data-a="next" aria-label="下一个">›</button>',
        '  <div class="vhg-dots"></div>',
        '</div>'
      ].join('');

      var track = api.$('.vhg-track');
      api.items.forEach(function (item, i) {
        var c = document.createElement('button');
        c.className = 'vhg-card';
        c.innerHTML =
          '<span class="vhg-poster"></span>' +
          '<span class="vhg-info">' +
          '  <b>' + api.esc(item.Name || '') + '</b>' +
          '  <em>' + (api.year(item) || '') + (item.CommunityRating ? ' · ★' + api.rating(item) : '') + '</em>' +
          '</span>';
        c.querySelector('.vhg-poster').style.backgroundImage =
          'url("' + api.img(item, { type: 'Primary', maxWidth: 620 }) + '")';
        c.addEventListener('click', function () { api.go(i); });
        c.addEventListener('dblclick', function () { open(api, i); });
        track.appendChild(c);
      });

      var dots = api.$('.vhg-dots');
      api.items.forEach(function (_, i) {
        var b = document.createElement('button');
        b.className = 'vhg-dot';
        b.addEventListener('click', function () { api.go(i); });
        dots.appendChild(b);
      });

      api.$('[data-a="prev"]').addEventListener('click', function () { api.stopAuto(); api.prev(); });
      api.$('[data-a="next"]').addEventListener('click', function () { api.stopAuto(); api.next(); });
      api.$('.vhg-scroll').addEventListener('dblclick', function () { open(api); });

      function open(a, i) {
        var it = a.items[i == null ? a.index : i];
        if (window.Emby && Emby.Page && Emby.Page.showItem) Emby.Page.showItem(it.Id, (window.ApiClient && ApiClient.serverId()) || '');
        else location.hash = '#!/item?id=' + it.Id;
      }
      api.__open = open;

      // 滚轮 → 横向滚动（不劫持页面纵向）
      var sc = api.$('.vhg-scroll');
      sc.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          sc.scrollLeft += e.deltaY;
          e.preventDefault();
          api.stopAuto();
        }
      }, { passive: false });
      // 拖动
      var down = false, sx = 0, sl = 0;
      sc.addEventListener('mousedown', function (e) { down = true; sx = e.clientX; sl = sc.scrollLeft; sc.classList.add('drag'); });
      window.addEventListener('mousemove', function (e) { if (down) { sc.scrollLeft = sl - (e.clientX - sx); api.stopAuto(); } });
      window.addEventListener('mouseup', function () { down = false; sc.classList.remove('drag'); });

      api.autoplay(6000);
      return true;
    },

    slide: function (item, i, api) {
      // 卡片状态
      var cards = api.$$('.vhg-card');
      cards.forEach(function (c, k) { c.classList.toggle('on', k === i); });

      // 滚动到居中
      var sc = api.$('.vhg-scroll'), cur = cards[i];
      if (sc && cur && !sc.classList.contains('drag')) {
        var target = cur.offsetLeft - (sc.clientWidth - cur.offsetWidth) / 2;
        sc.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      }

      // 背景（虚化）交叉淡入
      var bg = api.$('.vhg-bg');
      bg.style.opacity = '0';
      clearTimeout(api.__bgT);
      api.__bgT = setTimeout(function () {
        bg.style.backgroundImage = 'url("' + api.img(item, { type: 'Backdrop', maxWidth: 1920 }) + '")';
        bg.style.opacity = '.62';
        api.kenBurns(bg, i);
      }, 140);

      api.$('.vhg-title').textContent = item.Name || '';
      var m = [];
      if (item.ProductionYear) m.push(api.year(item));
      if (api.genres(item, 2)) m.push(api.genres(item, 2));
      if (item.CommunityRating) m.push('★ ' + api.rating(item));
      api.$('.vhg-sub').textContent = m.join(' · ');
      api.$('.vhg-k').textContent = '探索片库 · ' + (i + 1) + ' / ' + api.total;

      api.$$('.vhg-dot').forEach(function (d, k) { d.classList.toggle('on', k === i); });
    }
  });
})();
