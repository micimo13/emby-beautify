/* ═══════════════════════════════════════════════════════════
   Hero Studio · CINEMA 电影感满屏
   ───────────────────────────────────────────────────────────
   动态：背景 Ken Burns 缓慢推拉 · 三层视差 · 标题逐字浮现
        评分数字滚动 · 缩略图进度条自动推进
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.VanvyHero) return;

  window.VanvyHero.register('cinema', {
    query: { SortBy: 'DateCreated', Limit: 8 },

    init: function (api) {
      var it = api.items[0];
      api.root.innerHTML = [
        '<div class="vhc">',
        '  <div class="vhc-bgs"></div>',
        '  <div class="vhc-veil"></div>',
        '  <div class="vhc-grain"></div>',
        '  <div class="vhc-inner">',
        '    <div class="vhc-left">',
        '      <div class="vhc-badge">▶ 正在热映</div>',
        '      <h1 class="vhc-title"></h1>',
        '      <div class="vhc-meta">',
        '        <span class="vhc-score"><b>0.0</b><i>分</i></span>',
        '        <span class="vhc-dot"></span><span class="vhc-year"></span>',
        '        <span class="vhc-dot"></span><span class="vhc-cls"></span>',
        '        <span class="vhc-dot"></span><span class="vhc-gen"></span>',
        '      </div>',
        '      <p class="vhc-desc"></p>',
        '      <div class="vhc-cta">',
        '        <button class="vhc-btn pri" data-a="play">▶ 立即播放</button>',
        '        <button class="vhc-btn" data-a="info">ⓘ 详情</button>',
        '      </div>',
        '    </div>',
        '    <div class="vhc-rail"></div>',
        '  </div>',
        '  <button class="vhc-arrow l" data-a="prev" aria-label="上一个">‹</button>',
        '  <button class="vhc-arrow r" data-a="next" aria-label="下一个">›</button>',
        '  <div class="vhc-hint">鼠标移入暂停 · ← → 切换 · 可滚动缩略图</div>',
        '</div>'
      ].join('');

      // 背景层（多层，用于视差 + 交叉淡入）
      var bgs = api.$('.vhc-bgs');
      api.__layers = [];
      api.items.forEach(function (item, i) {
        var d = document.createElement('div');
        d.className = 'vhc-bg';
        d.dataset.i = i;
        bgs.appendChild(d);
      });

      // 视差层
      api.parallax(api.root, [
        { el: api.$('.vhc-title').parentNode, depth: 0.55 },
        { el: api.$('.vhc-grain'), depth: 0.18 }
      ], 18);

      // 缩略图轨
      var rail = api.$('.vhc-rail');
      api.items.forEach(function (item, i) {
        var t = document.createElement('button');
        t.className = 'vhc-thumb';
        t.style.backgroundImage = 'url("' + api.img(item, { type: 'Thumb', maxWidth: 320 }) + '")';
        t.innerHTML = '<i class="vhc-bar"></i>';
        t.addEventListener('click', function () { api.go(i); });
        rail.appendChild(t);
      });

      api.$('[data-a="prev"]').addEventListener('click', function () { api.stopAuto(); api.prev(); });
      api.$('[data-a="next"]').addEventListener('click', function () { api.stopAuto(); api.next(); });
      // 缩略图轨：滚轮纵向滚动
      rail.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { rail.scrollTop += e.deltaY; e.preventDefault(); }
      }, { passive: false });

      // 按钮
      api.$('[data-a="play"]').addEventListener('click', function () {
        var item = api.items[api.index];
        if (window.Emby && Emby.Page && Emby.Page.showItem) Emby.Page.showItem(item.Id, (window.ApiClient && ApiClient.serverId()) || '');
        else location.hash = '#!/item?id=' + item.Id;
      });
      api.$('[data-a="info"]').addEventListener('click', function () {
        var item = api.items[api.index];
        if (window.Emby && Emby.Page && Emby.Page.showItem) Emby.Page.showItem(item.Id, (window.ApiClient && ApiClient.serverId()) || '');
        else location.hash = '#!/item?id=' + item.Id;
      });

      api.autoplay(7000);
      return true;
    },

    slide: function (item, i, api) {
      // ① 背景：旧层淡出，新层 Ken Burns 推入
      api.$$('.vhc-bg').forEach(function (el, k) {
        var on = (k === i);
        el.style.opacity = on ? '1' : '0';
        el.style.zIndex = on ? '2' : '1';
        if (on) {
          el.style.backgroundImage = 'url("' + api.img(item, { type: 'Backdrop', maxWidth: 1920 }) + '")';
          el.style.transition = 'opacity 1s ease';
          api.kenBurns(el, i);
        } else {
          el.style.transform = 'scale(1.02)';
          el.style.transformOrigin = 'center';
        }
      });

      // ② 文字：逐字标题 + 数字滚动
      api.typeIn(api.$('.vhc-title'), item.Name || '', 38);
      var sc = api.$('.vhc-score b');
      api.countTo(sc, item.CommunityRating || 0, 800);
      api.$('.vhc-year').textContent = api.year(item) || '';
      api.$('.vhc-cls').textContent = item.OfficialRating || '未分级';
      api.$('.vhc-gen').textContent = api.genres(item, 2);
      api.$('.vhc-desc').textContent = api.clip(item.Overview || '暂无简介', 130);

      // ③ 缩略图状态（并滚动到可见）
      var ths = api.$$('.vhc-thumb');
      var railEl = api.$('.vhc-rail');
      if (railEl && ths[i]) {
        var t = ths[i];
        var want = t.offsetTop - (railEl.clientHeight - t.offsetHeight) / 2;
        railEl.scrollTo({ top: Math.max(0, want), behavior: 'smooth' });
      }
      ths.forEach(function (t, k) { t.classList.toggle('on', k === i); });
      // 进度条动画
      var bar = ths[i] && ths[i].querySelector('.vhc-bar');
      api.$$('.vhc-bar').forEach(function (b) { b.style.transition = 'none'; b.style.width = '0%'; });
      if (bar) {
        requestAnimationFrame(function () {
          bar.style.transition = 'width 7s linear';
          bar.style.width = '100%';
        });
      }
    },

    leave: function (item, i, api) {
      var el = api.$$('.vhc-bg')[i];
      if (el) el.style.transition = 'opacity .9s ease';
    }
  });
})();
