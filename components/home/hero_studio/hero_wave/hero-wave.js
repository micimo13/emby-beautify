/* ═══════════════════════════════════════════════════════════
   Hero Studio · WAVE 波浪（设计师款 · 替代 3D 卡片）
   动态：海报沿正弦曲线排布 · 当前卡挺立发光 · 邻卡依次下沉倾斜
        全屏虚化背景跟随 · 拖拽/滚动/箭头/键盘 · 平滑弹性过渡
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.VanvyHero) return;

  window.VanvyHero.register('wave', {
    query: { SortBy: 'Random', Limit: 9 },

    init: function (api) {
      api.root.innerHTML = [
        '<div class="vhw">',
        '  <div class="vhw-bg"></div>',
        '  <div class="vhw-veil"></div>',
        '  <div class="vhw-top">',
        '    <div class="vhw-k">围绕你的片库 · CURATED</div>',
        '    <h2 class="vhw-title"></h2>',
        '    <div class="vhw-meta"></div>',
        '  </div>',
        '  <div class="vhw-stage"><div class="vhw-track"></div></div>',
        '  <button class="vhw-arrow l" data-a="prev" aria-label="上一个">‹</button>',
        '  <button class="vhw-arrow r" data-a="next" aria-label="下一个">›</button>',
        '  <div class="vhw-dots"></div>',
        '  <div class="vhw-hint">拖拽 / 滚轮 / ← → 切换</div>',
        '</div>'
      ].join('');

      var track = api.$('.vhw-track');
      api.items.forEach(function (item, i) {
        var c = document.createElement('button');
        c.className = 'vhw-card';
        c.innerHTML =
          '<span class="vhw-poster"></span>' +
          '<span class="vhw-cap"><b>' + api.esc(api.clip(item.Name || '', 14)) + '</b>' +
          '<i>' + (api.year(item) || '') + '</i></span>';
        c.querySelector('.vhw-poster').style.backgroundImage =
          'url("' + api.img(item, { type: 'Primary', maxWidth: 560 }) + '")';
        c.addEventListener('click', function () {
          if (i === api.index) open(api, i); else api.go(i);
        });
        track.appendChild(c);
      });

      var dots = api.$('.vhw-dots');
      api.items.forEach(function (_, i) {
        var b = document.createElement('button');
        b.className = 'vhw-dot';
        b.addEventListener('click', function () { api.go(i); });
        dots.appendChild(b);
      });

      api.$('[data-a="prev"]').addEventListener('click', function () { api.stopAuto(); api.prev(); });
      api.$('[data-a="next"]').addEventListener('click', function () { api.stopAuto(); api.next(); });

      // 拖拽
      var st = api.$('.vhw-stage'), down = false, sx = 0, acc = 0;
      st.addEventListener('mousedown', function (e) { down = true; sx = e.clientX; acc = 0; st.classList.add('drag'); });
      window.addEventListener('mousemove', function (e) {
        if (!down) return; acc = e.clientX - sx;
      });
      window.addEventListener('mouseup', function () {
        if (!down) return; down = false; st.classList.remove('drag');
        if (acc < -46) { api.stopAuto(); api.next(); }
        else if (acc > 46) { api.stopAuto(); api.prev(); }
      });
      // 滚轮
      st.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault(); api.stopAuto();
          if (api.__wt) return;
          api.__wt = setTimeout(function () { api.__wt = null; }, 240);
          (e.deltaY > 0) ? api.next() : api.prev();
        }
      }, { passive: false });

      function open(a, i) {
        var it = a.items[i == null ? a.index : i];
        if (window.Emby && Emby.Page && Emby.Page.showItem) Emby.Page.showItem(it.Id, (window.ApiClient && ApiClient.serverId()) || '');
        else location.hash = '#!/item?id=' + it.Id;
      }
      api.__open = open;

      api.autoplay(6200);
      return true;
    },

    slide: function (item, i, api) {
      // 正弦波排布：横向位移 + 纵向起伏 + 缩放 + 旋转
      var cards = api.$$('.vhw-card');
      var W = api.root.getBoundingClientRect().width || 1400;
      var step = Math.max(96, Math.min(150, W * 0.098));   // 卡片间距(px)
      cards.forEach(function (c, k) {
        var off = k - i;
        var abs = Math.abs(off);
        if (abs > 5) { c.style.opacity = '0'; c.style.pointerEvents = 'none'; return; }
        var phase = off * 0.62;
        var y = Math.sin(phase) * (step * 0.42);           // 正弦起伏
        var rot = off * -5.5;                              // 轻微旋转
        var sc = off === 0 ? 1 : Math.max(0.62, 1 - abs * 0.13);
        c.style.opacity = abs > 3 ? '0.22' : String(Math.max(0.34, 1 - abs * 0.19));
        c.style.zIndex = String(120 - abs);
        c.style.pointerEvents = 'auto';
        c.classList.toggle('on', off === 0);
        c.style.transform =
          'translate(-50%,-50%) translateX(' + (off * step) + 'px) translateY(' + y + 'px) ' +
          'rotate(' + rot + 'deg) scale(' + sc + ')';
      });

      // 背景虚化换图
      var bg = api.$('.vhw-bg');
      bg.style.opacity = '0';
      clearTimeout(api.__bgT);
      api.__bgT = setTimeout(function () {
        bg.style.backgroundImage = 'url("' + api.img(item, { type: 'Backdrop', maxWidth: 1920 }) + '")';
        bg.style.opacity = '.64';
        api.kenBurns(bg, i);
      }, 130);

      api.$('.vhw-title').textContent = item.Name || '';
      var m = [];
      if (item.CommunityRating) m.push('<b>★ ' + api.rating(item) + '</b>');
      if (item.ProductionYear) m.push(api.year(item));
      if (item.OfficialRating) m.push(api.esc(item.OfficialRating));
      if (api.genres(item, 2)) m.push(api.esc(api.genres(item, 2)));
      api.$('.vhw-meta').innerHTML = m.map(function (t) { return '<span>' + t + '</span>'; }).join('<i>·</i>');

      api.$$('.vhw-dot').forEach(function (d, k) { d.classList.toggle('on', k === i); });
    }
  });
})();
