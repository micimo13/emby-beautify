/* ═══════════════════════════════════════════════════════════
   Vanvy Emby · 前端核心 (路由 + 渲染)
   自研 Emby 前端: 登录 / 首页 / 媒体库 / 详情 / 播放 / 搜索
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var Emby = window.Vanvy.Emby;
  var app = document.getElementById('app');

  /* ── 极简 hash 路由 ── */
  var routes = {
    '/': renderHome,
    '/login': renderLogin,
    '/movies': function () { renderLibrary('Movie', '电影'); },
    '/tv': function () { renderLibrary('Series', '剧集'); },
    '/search': renderSearch,
    '/settings': renderSettings,
    '/item': renderDetail,
    '/collection': renderCollection
  };

  function currentRoute() {
    var h = window.location.hash.replace(/^#/, '') || '/';
    return h.split('?')[0];
  }
  function currentQuery() {
    var q = {};
    var h = window.location.hash;
    var qi = h.indexOf('?');
    if (qi > -1) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        var p = kv.split('=');
        q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    return q;
  }

  function navigate(path) {
    window.location.hash = path;
  }

  window.addEventListener('hashchange', function () {
    route();
  });
  function route() {
    var r = currentRoute();
    if (!Emby.hasToken() && r !== '/login') {
      Emby.restore();
    }
    if (!Emby.hasToken()) {
      if (r !== '/login') { navigate('/login'); return; }
      renderLogin();
      return;
    }
    var fn = routes[r];
    if (fn) fn(currentQuery());
    else renderHome();
    // 侧栏媒体库 (异步加载用户实际媒体库)
    setTimeout(loadNavViews, 150);
  }

  /* ═══════ 登录页 ═══════ */
  function renderLogin() {
    app.innerHTML = '' +
      '<div class="login-wrap">' +
      '  <div class="login-card">' +
      '    <div class="login-logo">VANVY<span>·影院</span></div>' +
      '    <p class="login-sub">登录你的 Emby 媒体库</p>' +
      '    <input id="login-user" class="login-input" placeholder="用户名" autocomplete="username">' +
      '    <input id="login-pw" class="login-input" type="password" placeholder="密码" autocomplete="current-password">' +
      '    <button id="login-btn" class="login-btn">进入影院</button>' +
      '    <div id="login-err" class="login-err hidden"></div>' +
      '  </div>' +
      '</div>';
    var go = function () {
      var u = document.getElementById('login-user').value.trim();
      var p = document.getElementById('login-pw').value;
      var err = document.getElementById('login-err');
      var btn = document.getElementById('login-btn');
      if (!u || !p) { err.textContent = '请输入用户名和密码'; err.classList.remove('hidden'); return; }
      btn.textContent = '登录中...'; btn.disabled = true;
      Emby.login(u, p).then(function () {
        Emby.persist();
        navigate('/');
      }).catch(function () {
        err.textContent = '登录失败, 请检查用户名密码';
        err.classList.remove('hidden');
        btn.textContent = '进入影院'; btn.disabled = false;
      });
    };
    document.getElementById('login-btn').addEventListener('click', go);
    document.getElementById('login-pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    document.getElementById('login-user').addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('login-pw').focus(); });
  }

  /* ═══════ 顶栏 + 侧栏骨架 ═══════ */
  function shell(inner) {
    return '' +
      '<div class="drawer">' +
      '  <div class="brand" onclick="location.hash=\'#/\'">VANVY<i>·影院</i></div>' +
      '  <div class="nav-sec">浏览</div>' +
      '  <a class="nav-it" href="#/"><span class="ic">◈</span>首页</a>' +
      '  <div id="nav-views"></div>' +
      '  <a class="nav-it" href="#/search"><span class="ic">⌕</span>搜索</a>' +
      '  <div class="nav-sec">系统</div>' +
      '  <a class="nav-it" href="#/settings"><span class="ic">⚙</span>设置</a>' +
      '  <a class="nav-it" href="#" onclick="window.Vanvy.UI.logout();return false;"><span class="ic">↪</span>退出登录</a>' +
      '</div>' +
      '<div class="topbar">' +
      '  <div class="search-box"><input id="global-search" placeholder="搜索电影、剧集、演员..." onkeydown="if(event.key===\'Enter\')window.Vanvy.UI.doSearch(this.value)"></div>' +
      '  <div style="flex:1"></div>' +
      '  <button class="hbtn" onclick="location.hash=\'#/settings\'" title="设置">⚙</button>' +
      '  <span class="top-user" id="top-user"></span>' +
      '</div>' +
      '<div class="main">' + inner + '</div>';
  }

  /* 侧栏媒体库: 按用户实际媒体库动态生成 */
  function loadNavViews() {
    var box = document.getElementById('nav-views');
    if (!box) return;
    Emby.getViews().then(function (res) {
      var views = res.Items || [];
      var html = views.map(function (v) {
        var ico = v.CollectionType === 'movies' ? '▦' : v.CollectionType === 'tvshows' ? '▤' : v.CollectionType === 'music' ? '♬' : '▧';
        var label = v.Name || '媒体库';
        return '<a class="nav-it" href="#/collection?id=' + v.Id + '&name=' + encodeURIComponent(label) + '"><span class="ic">' + ico + '</span>' + Emby.esc(label) + '</a>';
      }).join('');
      if (html) box.innerHTML = html;
      else box.innerHTML = '';
    }).catch(function () {});
  }


  /* 卡片图: 有图用图, 无图用渐变占位 */
  function cardImg(item, w) {
    var img = Emby.imageUrl(item, 'Primary', w || 400);
    var has = item.ImageTags && (item.ImageTags.Primary || item.ImageTags.Backdrop || item.ImageTags.Thumb);
    if (!has) {
      // 无图: 用首字母 + 渐变占位
      return 'style="background:linear-gradient(160deg,hsl(var(--bg-h),var(--bg-s),calc(var(--bg-l)+14%)),hsl(var(--bg-h),var(--bg-s),calc(var(--bg-l)+4%)));display:flex;align-items:center;justify-content:center"';
    }
    return 'style="background-image:url(' + img + ')"';
  }
  function cardFallback(name) {
    return '<span style="font-size:34px;font-weight:800;color:hsla(var(--bg-h),var(--bg-s),80%,.35)">' + Emby.esc((name || '?').charAt(0)) + '</span>';
  }

  /* ═══════ 首页 ═══════ */
  function renderHome() {
    app.innerHTML = shell('<div class="page-loading">加载中...</div>');
    var user = Emby.getUser();
    var uname = user && user.Name ? user.Name : '';
    document.getElementById('top-user').textContent = uname;
    document.getElementById('global-search').value = '';

    // 并行加载首页数据
    Promise.all([
      Emby.getResume(8).catch(function () { return { Items: [] }; }),
      Emby.getLatest(null, 10).catch(function () { return { Items: [] }; }),
      Emby.getNextUp(8).catch(function () { return { Items: [] }; }),
      Emby.getViews().catch(function () { return { Items: [] }; })
    ]).then(function (res) {
      var resume = res[0].Items || [];
      var latest = res[1].Items || [];
      var nextup = res[2].Items || [];
      var views = res[3].Items || [];

      // 轮播数据: 优先最近添加的前几个有图标的
      var heroItems = latest.filter(function (i) { return i.ImageTags && (i.ImageTags.Backdrop || i.ImageTags.Primary); }).slice(0, 6);
      if (!heroItems.length) heroItems = latest.slice(0, 6);

      var heroHtml = heroItems.length ? heroItems.map(function (m, i) {
        var hasImg = m.ImageTags && (m.ImageTags.Thumb || m.ImageTags.Backdrop || m.ImageTags.Primary);
        // 无图兜底: 用固定深紫渐变 (CSS 变量在 hsl+calc 里 Chrome 解析不稳, 用硬编码色最稳)
        var bgStyle = hasImg
          ? 'background-image:url(' + Emby.thumbUrl(m, 1280) + ')'
          : 'background:linear-gradient(135deg,#3d2a66 0%,#221440 45%,#120b24 100%)';
        return '<div class="hero-slide' + (i === 0 ? ' active' : '') + '" style="' + bgStyle + '">' +
          '<div class="hero-shade"></div>' +
          '<div class="hero-content">' +
          '  <div class="hero-tag">' + (i === 0 ? '推荐 · 本周主打' : '热门 · ' + m.Type) + '</div>' +
          '  <h1 class="hero-title">' + Emby.esc(m.Name) + '</h1>' +
          '  <div class="hero-sub">' + Emby.esc(m.ProductionYear || '') + (m.CommunityRating ? ' · ★ ' + m.CommunityRating.toFixed(1) : '') + '</div>' +
          '  <div class="hero-meta">' + (m.Genres || []).slice(0, 3).map(function (g) { return '<span class="chip">' + Emby.esc(g) + '</span>'; }).join('') + '</div>' +
          '  <div class="hero-btns">' +
          '    <button class="pbtn" onclick="window.Vanvy.UI.play(\'' + m.Id + '\')">▶ 播放</button>' +
          '    <button class="dbtn" onclick="location.hash=\'#/item?id=' + m.Id + '\'">详情</button>' +
          '  </div>' +
          '</div></div>';
      }).join('') : '<div class="hero-empty">媒体库暂无内容</div>';

      var heroDots = heroItems.map(function (_, i) { return '<span class="hero-dot' + (i === 0 ? ' on' : '') + '" onclick="window.Vanvy.UI.heroGo(' + i + ')"></span>'; }).join('');

      // 继续观看
      var resumeHtml = resume.length ? resume.map(function (m) {
        var t = Emby.thumbUrl(m, 300);
        return '<div class="rcard" onclick="location.hash=\'#/item?id=' + m.Id + '\'">' +
          '<div class="rcard-t" style="background-image:url(' + t + ')"></div>' +
          '<div class="rcard-i"><div class="rcard-n">' + Emby.esc(m.Name) + '</div>' +
          '<div class="rcard-s">' + Emby.esc(m.SeriesName || m.ProductionYear || '') + (m.UserData && m.UserData.PlayedPercentage ? ' · ' + Math.round(m.UserData.PlayedPercentage) + '%' : '') + '</div></div>' +
          '<button class="rcard-p" onclick="event.stopPropagation();window.Vanvy.UI.play(\'' + m.Id + '\')">▶</button>' +
          '</div>';
      }).join('') : '<div class="empty-hint">暂无观看记录</div>';

      // 最近添加
      var latestHtml = latest.map(function (m) {
        return '<div class="card" onclick="location.hash=\'#/item?id=' + m.Id + '\'">' +
          '<div class="card-p" ' + cardImg(m, 400) + '>' +
          (m.CommunityRating ? '<span class="card-rt">★ ' + m.CommunityRating.toFixed(1) + '</span>' : '') +
          (m.ProductionYear ? '<span class="card-yr">' + m.ProductionYear + '</span>' : '') +
          '<div class="card-nm">' + Emby.esc(m.Name) + '</div>' + cardFallback(m.Name) + '</div></div>';
      }).join('');

      // 媒体库视图
      var viewsHtml = views.filter(function (v) { return v.CollectionType === 'movies' || v.CollectionType === 'tvshows' || !v.CollectionType; }).map(function (v) {
        var hasImg = v.ImageTags && v.ImageTags.Primary;
        var label = v.CollectionType === 'movies' ? '电影' : v.CollectionType === 'tvshows' ? '剧集' : v.Name;
        var imgStyle = hasImg ? 'background-image:url(' + Emby.imageUrl(v, 'Primary', 400) + ')' : 'background:linear-gradient(160deg,hsl(var(--bg-h),var(--bg-s),calc(var(--bg-l)+14%)),hsl(var(--bg-h),var(--bg-s),calc(var(--bg-l)+4%)))';
        return '<div class="vcard" onclick="window.Vanvy.UI.openView(\'' + v.Id + '\',\'' + Emby.esc(label) + '\')">' +
          '<div class="vcard-p" style="' + imgStyle + '">' + (hasImg ? '' : '<span style="font-size:26px;font-weight:800;color:hsla(var(--bg-h),var(--bg-s),80%,.4)">' + Emby.esc((v.Name || '?').charAt(0)) + '</span>') + '</div>' +
          '<div class="vcard-n">' + Emby.esc(v.Name) + '</div></div>';
      }).join('');

      document.querySelector('.main').innerHTML =
        '<div class="hero">' + heroHtml +
        '  <div class="hero-dots">' + heroDots + '</div>' +
        '</div>' +

        (resume.length ? '<div class="sec"><div class="sec-h"><h2>继续观看</h2></div><div class="row">' + resumeHtml + '</div></div>' : '') +

        (viewsHtml ? '<div class="sec"><div class="sec-h"><h2>媒体库</h2></div><div class="vrow">' + viewsHtml + '</div></div>' : '') +

        '<div class="sec"><div class="sec-h"><h2>最近添加</h2></div><div class="grid">' + latestHtml + '</div></div>' +

        (nextup.length ? '<div class="sec"><div class="sec-h"><h2>下一集</h2></div><div class="row">' + nextup.map(function (m) {
          var t = Emby.thumbUrl(m, 300);
          return '<div class="rcard" onclick="location.hash=\'#/item?id=' + m.Id + '\'">' +
            '<div class="rcard-t" style="background-image:url(' + t + ')"></div>' +
            '<div class="rcard-i"><div class="rcard-n">' + Emby.esc(m.Name) + '</div><div class="rcard-s">' + Emby.esc(m.SeriesName || '') + ' · S' + (m.ParentIndexNumber || '') + 'E' + (m.IndexNumber || '') + '</div></div>' +
            '<button class="rcard-p" onclick="event.stopPropagation();window.Vanvy.UI.play(\'' + m.Id + '\')">▶</button></div>';
        }).join('') + '</div></div>' : '');

      // 轮播自动切换
      window.Vanvy.UI.initHero();
    }).catch(function (e) {
      document.querySelector('.main').innerHTML = '<div class="page-error">加载失败: ' + Emby.esc(e.message) + '</div>';
    });
  }

  /* ═══════ 媒体库 ═══════ */
  function renderLibrary(type, title) {
    app.innerHTML = shell('<div class="page-loading">加载中...</div>');
    document.getElementById('top-user').textContent = (Emby.getUser() || {}).Name || '';
    document.getElementById('global-search').value = '';
    Emby.getItems({
      IncludeItemTypes: type,
      Recursive: true,
      SortBy: 'DateCreated',
      SortOrder: 'Descending',
      Limit: 60,
      Fields: 'ProductionYear,Overview,CommunityRating,PrimaryImageAspectRatio',
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary,Backdrop,Thumb'
    }).then(function (res) {
      var items = res.Items || [];
      var grid = items.map(function (m) {
        return '<div class="card" onclick="location.hash=\'#/item?id=' + m.Id + '\'">' +
          '<div class="card-p" ' + cardImg(m, 400) + '>' +
          (m.CommunityRating ? '<span class="card-rt">★ ' + m.CommunityRating.toFixed(1) + '</span>' : '') +
          (m.ProductionYear ? '<span class="card-yr">' + m.ProductionYear + '</span>' : '') +
          '<div class="card-nm">' + Emby.esc(m.Name) + '</div>' + cardFallback(m.Name) + '</div></div>';
      }).join('');
      document.querySelector('.main').innerHTML =
        '<div class="lib-head"><h1>' + Emby.esc(title) + '</h1></div>' +
        '<div class="lib-toolbar"><span class="lib-count">共 ' + items.length + ' 项</span></div>' +
        (grid ? '<div class="grid">' + grid + '</div>' : '<div class="empty-hint">暂无内容</div>');
    }).catch(function (e) {
      document.querySelector('.main').innerHTML = '<div class="page-error">加载失败: ' + Emby.esc(e.message) + '</div>';
    });
  }

  function renderCollection(q) {
    var pid = q.id, name = q.name || '媒体库';
    app.innerHTML = shell('<div class="page-loading">加载中...</div>');
    document.getElementById('top-user').textContent = (Emby.getUser() || {}).Name || '';
    document.getElementById('global-search').value = '';
    Emby.getItems({
      ParentId: pid, Recursive: true, SortBy: 'SortName', Limit: 60,
      Fields: 'ProductionYear,Overview,CommunityRating,PrimaryImageAspectRatio'
    }).then(function (res) {
      var items = res.Items || [];
      var grid = items.map(function (m) {
        return '<div class="card" onclick="location.hash=\'#/item?id=' + m.Id + '\'">' +
          '<div class="card-p" ' + cardImg(m, 400) + '>' +
          (m.CommunityRating ? '<span class="card-rt">★ ' + m.CommunityRating.toFixed(1) + '</span>' : '') +
          '<div class="card-nm">' + Emby.esc(m.Name) + '</div>' + cardFallback(m.Name) + '</div></div>';
      }).join('');
      document.querySelector('.main').innerHTML = '<div class="lib-head"><h1>' + Emby.esc(name) + '</h1></div>' +
        '<div class="lib-toolbar"><span class="lib-count">共 ' + items.length + ' 项</span></div>' + (grid ? '<div class="grid">' + grid + '</div>' : '<div class="empty-hint">暂无内容</div>');
    });
  }

  /* ═══════ 详情页 ═══════ */
  function renderDetail(q) {
    var id = q.id;
    if (!id) { renderHome(); return; }
    app.innerHTML = shell('<div class="page-loading">加载中...</div>');
    document.getElementById('top-user').textContent = (Emby.getUser() || {}).Name || '';
    document.getElementById('global-search').value = '';

    Emby.getItem(id).then(function (item) {
      var bg = Emby.thumbUrl(item, 1280);
      var poster = Emby.imageUrl(item, 'Primary', 500);
      var isSeries = item.Type === 'Series';
      var html = '' +
        '<div class="detail">' +
        '  <div class="detail-bg" style="background-image:url(' + bg + ')"></div>' +
        '  <div class="detail-shade"></div>' +
        '  <div class="detail-top">' +
        '    <button class="back-btn" onclick="history.back()">← 返回</button>' +
        '  </div>' +
        '  <div class="detail-body">' +
        '    <div class="detail-poster"><img src="' + poster + '" onerror="this.style.display=\'none\'"></div>' +
        '    <div class="detail-info">' +
        '      <h1>' + Emby.esc(item.Name) + '</h1>' +
        '      <div class="detail-sub">' + (item.ProductionYear || '') +
        (item.CommunityRating ? ' · ★ ' + item.CommunityRating.toFixed(1) : '') +
        (item.RunTimeTicks ? ' · ' + Emby.fmtDuration(item.RunTimeTicks) : '') + '</div>' +
        '      <div class="detail-meta">' + (item.Genres || []).slice(0, 5).map(function (g) { return '<span class="chip">' + Emby.esc(g) + '</span>'; }).join('') + '</div>' +
        '      <div class="detail-btns">' +
        '        <button class="pbtn big" onclick="window.Vanvy.UI.play(\'' + item.Id + '\')">▶ 立即播放</button>' +
        '      </div>' +
        '      <div class="detail-desc">' + Emby.esc(item.Overview || '暂无简介') + '</div>' +
        '      <div class="detail-people">' + (item.People || []).slice(0, 8).map(function (p) {
          return '<div class="person"><div class="person-p" style="background-image:url(' + Emby.imageUrl(p, 'Primary', 200) + ')"></div><div class="person-n">' + Emby.esc(p.Name) + '</div><div class="person-r">' + Emby.esc(p.Role || p.Type || '') + '</div></div>';
        }).join('') + '</div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="detail-seasons" id="seasons-wrap"></div>' +
        '</div>';
      document.querySelector('.main').innerHTML = html;

      // 剧集: 季卡片网格 → 点季展开集列表 (Emby 风格)
      if (isSeries) {
        Emby.getSeasons(item.Id).then(function (sres) {
          var seasons = (sres.Items || []).filter(function (s) { return s.IndexNumber !== 0; }); // 隐藏特辑季
          if (!seasons.length) seasons = sres.Items || [];
          if (!seasons.length) return;
          var wrap = document.getElementById('seasons-wrap');
          var seasonHtml = '<div class="sec"><div class="sec-h"><h2>季</h2></div>' +
            '<div class="season-grid">' + seasons.map(function (s, i) {
              var hasImg = s.ImageTags && s.ImageTags.Primary;
              var imgStyle = hasImg ? 'background-image:url(' + Emby.imageUrl(s, 'Primary', 400) + ')' : 'background:linear-gradient(160deg,#2a1f45,#181230)';
              return '<div class="season-card" data-sid="' + s.Id + '" data-idx="' + i + '">' +
                '<div class="season-card-p" style="' + imgStyle + '">' +
                (hasImg ? '' : '<span class="season-fallback">' + Emby.esc((s.Name || 'S' + s.IndexNumber).charAt(0)) + '</span>') +
                '<span class="season-num">' + (s.IndexNumber ? 'S' + s.IndexNumber : '') + '</span>' +
                '</div>' +
                '<div class="season-card-n">' + Emby.esc(s.Name || ('第 ' + s.IndexNumber + ' 季')) + '</div>' +
                '</div>';
            }).join('') + '</div>' +
            '<div class="ep-list" id="ep-list" style="display:none"></div></div>';
          wrap.innerHTML = seasonHtml;
          // 点季卡片 → 显示集列表
          wrap.querySelectorAll('.season-card').forEach(function (card) {
            card.addEventListener('click', function () {
              var sid = card.getAttribute('data-sid');
              var list = document.getElementById('ep-list');
              wrap.querySelectorAll('.season-card').forEach(function (c) { c.classList.remove('on'); });
              card.classList.add('on');
              list.style.display = 'block';
              loadEpisodes(item.Id, sid);
              list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
          });
          // 自动展开第一季
          var first = wrap.querySelector('.season-card');
          if (first) first.click();
        }).catch(function () {});
      }
    }).catch(function (e) {
      document.querySelector('.main').innerHTML = '<div class="page-error">加载失败: ' + Emby.esc(e.message) + '</div>';
    });
  }

  function loadEpisodes(seriesId, seasonId) {
    var list = document.getElementById('ep-list');
    if (!list) return;
    list.innerHTML = '<div class="page-loading small">加载分集...</div>';
    Emby.getEpisodes(seriesId, seasonId).then(function (res) {
      var eps = res.Items || [];
      list.innerHTML = eps.map(function (ep) {
        var t = Emby.thumbUrl(ep, 300);
        return '<div class="ep-item" onclick="window.Vanvy.UI.play(\'' + ep.Id + '\')">' +
          '<div class="ep-thumb" style="background-image:url(' + t + ')">' +
          (ep.IndexNumber ? '<span class="ep-num">' + ep.IndexNumber + '</span>' : '') + '</div>' +
          '<div class="ep-info"><div class="ep-name">' + (ep.IndexNumber ? 'E' + ep.IndexNumber + ' · ' : '') + Emby.esc(ep.Name) + '</div>' +
          '<div class="ep-overview">' + Emby.esc((ep.Overview || '').slice(0, 80)) + '</div></div>' +
          '<button class="ep-play">▶</button></div>';
      }).join('') || '<div class="empty-hint">暂无分集</div>';
    }).catch(function () {
      list.innerHTML = '<div class="empty-hint">分集加载失败</div>';
    });
  }

  /* ═══════ 搜索 ═══════ */
  function renderSearch(q) {
    app.innerHTML = shell('<div class="search-page"><h1>搜索</h1><div class="search-big"><input id="big-search" placeholder="输入关键词..." value="' + Emby.esc(q.q || '') + '" onkeydown="if(event.key===\'Enter\')window.Vanvy.UI.doSearch(this.value)"></div><div id="search-results"></div></div>');
    document.getElementById('top-user').textContent = (Emby.getUser() || {}).Name || '';
    document.getElementById('global-search').value = q.q || '';
    if (q.q) doSearch(q.q);
  }

  function doSearch(term) {
    if (!term) return;
    navigate('/search?q=' + encodeURIComponent(term));
    var box = document.getElementById('search-results');
    if (!box) return;
    box.innerHTML = '<div class="page-loading small">搜索中...</div>';
    Emby.search(term, 30).then(function (res) {
      var items = res.Items || [];
      box.innerHTML = items.map(function (m) {
        var p = Emby.imageUrl(m, 'Primary', 300);
        return '<div class="srow" onclick="location.hash=\'#/item?id=' + m.Id + '\'">' +
          '<div class="srow-p" style="background-image:url(' + p + ')"></div>' +
          '<div class="srow-i"><div class="srow-n">' + Emby.esc(m.Name) + '</div>' +
          '<div class="srow-s">' + Emby.esc(m.Type || '') + (m.ProductionYear ? ' · ' + m.ProductionYear : '') + '</div></div>' +
          '<span class="srow-go">→</span></div>';
      }).join('') || '<div class="empty-hint">无结果</div>';
    }).catch(function () {
      box.innerHTML = '<div class="empty-hint">搜索失败</div>';
    });
  }

  /* ═══════ 设置页 ═══════ */
  function renderSettings() {
    var user = Emby.getUser() || {};
    var curServer = (function () { try { return localStorage.getItem('vanvy_server') || window.location.host; } catch (e) { return window.location.host; } })();
    app.innerHTML = shell('' +
      '<div class="settings-page">' +
      '  <h1>设置</h1>' +
      '  <div class="set-card">' +
      '    <div class="set-h">Emby 服务器</div>' +
      '    <div class="set-row"><span>服务器地址</span></div>' +
      '    <input id="set-server" class="login-input" placeholder="http://192.168.100.254:8096" value="' + Emby.esc(curServer) + '">' +
      '    <button class="dbtn" onclick="window.Vanvy.UI.saveServer()" style="margin-top:10px">保存并重连</button>' +
      '  </div>' +
      '  <div class="set-card">' +
      '    <div class="set-row"><span>当前用户</span><b>' + Emby.esc(user.Name || '') + '</b></div>' +
      '    <div class="set-row"><span>主题</span><b>Vanvy CINEMA · 深紫鎏金</b></div>' +
      '  </div>' +
      '  <div class="set-card">' +
      '    <div class="set-h">关于</div>' +
      '    <div class="set-text">自研 Emby 前端替换项目。如需还原原始 Emby 界面，请在服务器上运行还原脚本。</div>' +
      '  </div>' +
      '  <div class="set-card">' +
      '    <div class="set-h">账户</div>' +
      '    <button class="pbtn" onclick="window.Vanvy.UI.logout()">退出登录</button>' +
      '  </div>' +
      '</div>');
    document.getElementById('top-user').textContent = user.Name || '';
    document.getElementById('global-search').value = '';
  }

  function saveServer() {
    var v = document.getElementById('set-server').value.trim();
    if (!v) return;
    Emby.setServer(v);
    Emby.logout();
    navigate('/login');
  }

  /* ═══════ 播放页 ═══════ */
  var playerOpen = false;
  function play(itemId) {
    Emby.getItem(itemId).then(function (item) {
      openPlayer(item);
    }).catch(function () {});
  }

  function openPlayer(item) {
    if (playerOpen) return;
    playerOpen = true;
    var pc = document.getElementById('player-container');
    var isVideo = item.Type === 'Movie' || item.Type === 'Episode' || item.MediaType === 'Video';
    pc.classList.remove('hidden');
    pc.innerHTML = '' +
      '<div class="player">' +
      '  <div class="player-top"><span class="player-title">' + Emby.esc(item.Name) + '</span>' +
      '    <div class="player-tracks">' +
      '      <select id="audio-track" class="track-sel" title="音轨"></select>' +
      '      <select id="subtitle-track" class="track-sel" title="字幕"></select>' +
      '    </div>' +
      '    <button class="player-close" onclick="window.Vanvy.UI.closePlayer()">✕</button>' +
      '  </div>' +
      (isVideo ?
        '<video id="vplayer" controls autoplay style="width:100%;height:calc(100vh - 50px);background:#000"></video>' :
        '<audio id="vplayer" controls autoplay style="width:100%;margin-top:20vh"></audio>') +
      '</div>';
    var v = document.getElementById('vplayer');
    if (!v) return;
    var pos = item.UserData && item.UserData.PlaybackPositionTicks ? item.UserData.PlaybackPositionTicks : 0;
    Emby.reportPlaybackStart(item, pos);

    // 加载媒体源 (音轨/字幕), 然后决定 direct/transcode
    Emby.getMediaSources(item.Id).then(function (sources) {
      var ms = sources[0] || null;
      var audioSels = ms ? (ms.MediaStreams || []).filter(function (s) { return s.Type === 'Audio'; }) : [];
      var subSels = ms ? (ms.MediaStreams || []).filter(function (s) { return s.Type === 'Subtitle'; }) : [];
      var aSel = document.getElementById('audio-track');
      var sSel = document.getElementById('subtitle-track');
      // 音轨下拉
      if (aSel && audioSels.length > 1) {
        aSel.innerHTML = audioSels.map(function (s, i) {
          return '<option value="' + s.Index + '">' + Emby.esc(s.DisplayTitle || ('音轨 ' + (i + 1))) + '</option>';
        }).join('');
        aSel.style.display = 'inline-block';
      }
      // 字幕下拉
      if (sSel) {
        var subOpts = '<option value="">无字幕</option>' + subSels.map(function (s) {
          return '<option value="' + s.Index + '">' + Emby.esc(s.DisplayTitle || ('字幕 ' + s.Index)) + '</option>';
        }).join('');
        sSel.innerHTML = subOpts;
        if (subSels.length) sSel.style.display = 'inline-block';
      }
      // 决定播放 URL: 需要转码则转码, 否则直连
      var useTranscode = Emby.needsTranscode(item, ms);
      var url = useTranscode ? Emby.transcodeUrl(item, ms) : Emby.playUrl(item, ms);
      v.src = url;
      // 转码提示
      if (useTranscode) {
        var tip = document.createElement('div');
        tip.className = 'player-tip';
        tip.textContent = '⏳ 转码中, 请稍候...';
        pc.appendChild(tip);
        setTimeout(function () { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 5000);
      }
      // 音轨/字幕切换 (转码模式重载)
      function reloadTrack() {
        var ai = aSel && aSel.value !== '' ? parseInt(aSel.value, 10) : undefined;
        var si = sSel && sSel.value !== '' ? parseInt(sSel.value, 10) : undefined;
        if (ai === undefined && si === undefined) return;
        var cur = v.currentTime;
        v.src = Emby.transcodeUrl(item, ms, { audioIndex: ai, subtitleIndex: si });
        v.currentTime = cur;
        v.play();
      }
      if (aSel) aSel.addEventListener('change', reloadTrack);
      if (sSel) sSel.addEventListener('change', reloadTrack);
    }).catch(function () {
      // 拿不到媒体源: 直接直连
      v.src = Emby.playUrl(item);
    });

    // 进度上报
    v.addEventListener('timeupdate', function () {
      Emby.reportPlaybackProgress(item, Math.floor(v.currentTime * 10000000), v.paused);
    });
    v.addEventListener('pause', function () { Emby.reportPlaybackProgress(item, Math.floor(v.currentTime * 10000000), true); });
    v.addEventListener('ended', function () { Emby.reportPlaybackStopped(item, Math.floor(v.currentTime * 10000000)); });
  }

  function closePlayer() {
    var pc = document.getElementById('player-container');
    var v = document.getElementById('vplayer');
    if (v) { Emby.reportPlaybackStopped(null, 0); v.pause(); }
    pc.classList.add('hidden');
    pc.innerHTML = '';
    playerOpen = false;
  }

  /* ═══════ UI 工具 ═══════ */
  function logout() {
    Emby.logout();
    navigate('/login');
  }

  function openView(id, name) {
    navigate('/collection?id=' + id + '&name=' + encodeURIComponent(name));
  }

  var heroIdx = 0;
  var heroTimer = null;
  function initHero() {
    var slides = document.querySelectorAll('.hero-slide');
    var dots = document.querySelectorAll('.hero-dot');
    if (!slides.length) return;
    heroIdx = 0;
    if (heroTimer) clearInterval(heroTimer);
    heroTimer = setInterval(function () { heroGo(heroIdx + 1); }, 8000);
  }
  function heroGo(i) {
    var slides = document.querySelectorAll('.hero-slide');
    var dots = document.querySelectorAll('.hero-dot');
    if (!slides.length) return;
    heroIdx = (i + slides.length) % slides.length;
    slides.forEach(function (s, k) { s.classList.toggle('active', k === heroIdx); });
    dots.forEach(function (d, k) { d.classList.toggle('on', k === heroIdx); });
  }

  window.Vanvy.UI = {
    logout: logout, play: play, closePlayer: closePlayer, saveServer: saveServer,
    doSearch: doSearch, openView: openView, initHero: initHero, heroGo: heroGo
  };

  /* ── 启动 ── */
  route();
})();
