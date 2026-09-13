/* ═══════════════════════════════════════════════════════════
   Hero Studio · SPOTLIGHT 聚光
   动态：鼠标跟随光斑揭示背景 · 中央聚光 · 竖排大字 · 呼吸光晕
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.VanvyHero) return;

  window.VanvyHero.register('spotlight', {
    query: { SortBy: 'Random', Limit: 6 },

    init: function (api) {
      api.root.innerHTML = [
        '<div class="vhs">',
        '  <div class="vhs-bg"></div>',
        '  <div class="vhs-spot"></div>',
        '  <div class="vhs-amb"></div>',
        '  <div class="vhs-grid">',
        '    <div class="vhs-side">',
        '      <span class="vhs-idx"></span>',
        '      <span class="vhs-line"></span>',
        '      <span class="vhs-tot"></span>',
        '    </div>',
        '    <div class="vhs-mid">',
        '      <div class="vhs-kicker">FEATURED · 精选推荐</div>',
        '      <h2 class="vhs-title"></h2>',
        '      <div class="vhs-tags"></div>',
        '      <p class="vhs-desc"></p>',
        '      <div class="vhs-cta">',
        '        <button class="vhs-btn" data-a="play">▶ 播放</button>',
        '        <button class="vhs-btn ghost" data-a="info">详情</button>',
        '      </div>',
        '    </div>',
        '    <div class="vhs-poster"></div>',
        '  </div>',
        '  <button class="vhs-arrow l" data-a="prev" aria-label="上一个">‹</button>',
        '  <button class="vhs-arrow r" data-a="next" aria-label="下一个">›</button>',
        '  <div class="vhs-nav"><div class="vhs-dots"></div></div>',
        '</div>'
      ].join('');

      // 鼠标跟随光斑
      var spot = api.$('.vhs-spot'), root = api.root, raf = null, mx = 50, my = 42;
      root.addEventListener('mousemove', function (e) {
        var r = root.getBoundingClientRect();
        mx = ((e.clientX - r.left) / r.width) * 100;
        my = ((e.clientY - r.top) / r.height) * 100;
        if (!raf) raf = requestAnimationFrame(function () {
          raf = null;
          spot.style.setProperty('--mx', mx + '%');
          spot.style.setProperty('--my', my + '%');
        });
      });

      // 分页点
      var dots = api.$('.vhs-dots');
      api.items.forEach(function (_, i) {
        var b = document.createElement('button');
        b.className = 'vhs-dot';
        b.addEventListener('click', function () { api.go(i); });
        dots.appendChild(b);
      });

      api.$('[data-a="prev"]').addEventListener('click', function () { api.stopAuto(); api.prev(); });
      api.$('[data-a="next"]').addEventListener('click', function () { api.stopAuto(); api.next(); });
      api.$('[data-a="play"]').addEventListener('click', function () { api.emit('open', api.index); goItem(api); });
      api.$('[data-a="info"]').addEventListener('click', function () { goItem(api); });
      function goItem(a) {
        var it = a.items[a.index];
        if (window.Emby && Emby.Page && Emby.Page.showItem) Emby.Page.showItem(it.Id, (window.ApiClient && ApiClient.serverId()) || '');
        else location.hash = '#!/item?id=' + it.Id;
      }

      api.$('.vhs-tot').textContent = String(api.total).padStart(2, '0');
      api.autoplay(6500);
      return true;
    },

    slide: function (item, i, api) {
      var bg = api.$('.vhs-bg');
      bg.style.opacity = '0';
      setTimeout(function () {
        bg.style.backgroundImage = 'url("' + api.img(item, { type: 'Backdrop', maxWidth: 1920 }) + '")';
        bg.style.opacity = '1';
        api.kenBurns(bg, i);
      }, 120);

      api.$('.vhs-poster').style.backgroundImage =
        'url("' + api.img(item, { type: 'Primary', maxWidth: 620 }) + '")';

      api.$('.vhs-idx').textContent = String(i + 1).padStart(2, '0');
      api.$('.vhs-title').textContent = item.Name || '';
      api.$('.vhs-desc').textContent = api.clip(item.Overview || '暂无简介', 118);

      var tags = [];
      if (item.CommunityRating) tags.push('★ ' + api.rating(item));
      if (item.ProductionYear) tags.push(api.year(item));
      if (item.OfficialRating) tags.push(item.OfficialRating);
      (item.Genres || []).slice(0, 2).forEach(function (g) { tags.push(g); });
      api.$('.vhs-tags').innerHTML = tags.map(function (t) { return '<span>' + api.esc(t) + '</span>'; }).join('');

      api.$$('.vhs-dot').forEach(function (d, k) { d.classList.toggle('on', k === i); });
    }
  });
})();
