/* ═══════════════════════════════════════════════════════════
   Hero Studio · MOSAIC 马赛克墙（全屏背景版）
   结构：整张背景图铺满整个 hero（与内容一体）
        · 左侧文字直接叠在背景图上
        · 右侧「备选卡片列」浮在整张背景图之上，可滚动
   动态：背景缓慢推拉 · 文案逐层上浮 · 卡片列依次翻入 · 悬停放大
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.VanvyHero) return;

  window.VanvyHero.register('mosaic', {
    query: { SortBy: 'Random', Limit: 7 },

    init: function (api) {
      api.root.innerHTML = [
        '<div class="vhm">',
        // ① 全屏背景（整块 hero 就是这张图）
        '  <div class="vhm-bg"></div>',
        '  <div class="vhm-scrim"></div>',
        // ② 内容（浮在背景之上）
        '  <div class="vhm-in">',
        '    <div class="vhm-txt">',
        '      <div class="vhm-k">本月精选 · FEATURED</div>',
        '      <h2 class="vhm-title"></h2>',
        '      <div class="vhm-meta"></div>',
        '      <p class="vhm-desc"></p>',
        '      <div class="vhm-cta">',
        '        <button class="vhm-btn pri" data-a="play">▶&nbsp; 立即播放</button>',
        '        <button class="vhm-btn" data-a="more">查看详情 ›</button>',
        '      </div>',
        '    </div>',
        // ③ 右侧备选卡片列（可滚动，浮在背景上）
        '    <aside class="vhm-side">',
        '      <div class="vhm-side-hd">备选推荐 <span class="vhm-side-n"></span></div>',
        '      <div class="vhm-tiles"></div>',
        '    </aside>',
        '  </div>',
        '  <button class="vhm-arrow l" data-a="prev" aria-label="上一个">‹</button>',
        '  <button class="vhm-arrow r" data-a="next" aria-label="下一个">›</button>',
        '  <div class="vhm-bar"></div>',
        '</div>'
      ].join('');

      var tiles = api.$('.vhm-tiles');
      var n = Math.max(0, api.total - 1);
      for (var k = 0; k < n; k++) {
        var t = document.createElement('button');
        t.className = 'vhm-tile';
        t.innerHTML = '<span class="vhm-tile-bg"></span>' +
                      '<span class="vhm-tile-cap"><b></b><i></i></span>';
        (function (el) {
          // ⚠️ 不能用静态下标：卡片内容在每帧重新映射（见 slide 里的 (i+1+k)%total）
          // → 点击时必须读当帧写入的 data-go，否则会跳到错误的片子
          el.addEventListener('click', function () {
            var g = parseInt(el.dataset.go, 10);
            if (!isNaN(g)) { api.stopAuto(); api.go(g); }
          });
        })(t);
        tiles.appendChild(t);
      }
      api.$('.vhm-side-n').textContent = n + ' 部';

      api.$('[data-a="prev"]').addEventListener('click', function () { api.stopAuto(); api.prev(); });
      api.$('[data-a="next"]').addEventListener('click', function () { api.stopAuto(); api.next(); });
      api.$('[data-a="play"]').addEventListener('click', function () { open(api); });
      api.$('[data-a="more"]').addEventListener('click', function () { open(api); });
      function open(a) {
        var it = a.items[a.index];
        if (window.Emby && Emby.Page && Emby.Page.showItem) Emby.Page.showItem(it.Id, (window.ApiClient && ApiClient.serverId()) || '');
        else location.hash = '#!/item?id=' + it.Id;
      }

      var bar = api.$('.vhm-bar');
      api.items.forEach(function (_, i) {
        var b = document.createElement('button');
        b.className = 'vhm-b';
        b.addEventListener('click', function () { api.go(i); });
        bar.appendChild(b);
      });

      api.autoplay(7000);
      return true;
    },

    slide: function (item, i, api) {
      // 全屏背景（整张铺满，低遮罩 → 图看得清）
      var bg = api.$('.vhm-bg');
      bg.style.opacity = '0';
      clearTimeout(api.__bgT);
      api.__bgT = setTimeout(function () {
        bg.style.backgroundImage = 'url("' + api.img(item, { type: 'Backdrop', maxWidth: 1920 }) + '")';
        bg.style.opacity = '1';
        api.kenBurns(bg, i);
      }, 120);

      api.$('.vhm-title').textContent = item.Name || '';
      var m = [];
      if (item.CommunityRating) m.push('<b>★ ' + api.rating(item) + '</b>');
      if (item.ProductionYear) m.push(api.year(item));
      if (item.OfficialRating) m.push(api.esc(item.OfficialRating));
      if (api.genres(item, 2)) m.push(api.esc(api.genres(item, 2)));
      api.$('.vhm-meta').innerHTML = m.map(function (t) { return '<span>' + t + '</span>'; }).join('<i>·</i>');
      api.$('.vhm-desc').textContent = api.clip(item.Overview || '暂无简介', 118);

      // 备选卡片列：依次翻入
      api.$$('.vhm-tile').forEach(function (el, k) {
        var gi = (i + 1 + k) % api.total;
        var it = api.items[gi];
        el.dataset.go = gi;                       // 点击目标（每帧更新，修“点 A 显示 B”）
        el.querySelector('.vhm-tile-bg').style.backgroundImage =
          'url("' + api.img(it, { type: 'Backdrop', maxWidth: 640 }) + '")';
        el.querySelector('.vhm-tile-cap b').textContent = api.clip(it.Name || '', 12);
        el.querySelector('.vhm-tile-cap i').textContent =
          (api.year(it) || '') + (it.CommunityRating ? ' · ★' + api.rating(it) : '');
        el.classList.remove('in');
        setTimeout(function () { el.classList.add('in'); }, 60 + k * 80);
        el.classList.remove('cur');
      });

      // 焦点文案重新入场
      var t = api.$('.vhm-txt');
      t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');

      api.$$('.vhm-b').forEach(function (b, k) { b.classList.toggle('on', k === i); });
    }
  });
})();
