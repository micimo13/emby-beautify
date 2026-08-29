/**
 * =============================================================================
 *  Vanvy Emby Kit · CINEMA 影院黑金 (banner_cinema)
 *  ---------------------------------------------------------------------------
 *  原创设计: 21:9 超宽画幅 + 上下影院黑边 + 黑金配色
 *  + 金色光影 + 底部胶片帧条 + 「放映」按钮 (最强仪式感)
 *
 *  颜色主题: 复用 AURORA 6 色卡 CSS 变量 (vanvy-aurora-theme-*)
 *    默认 midnight(黑金) 观感最佳, 安装时注入 class
 *  数据层: 复用 Emby ApiClient (getItems/getImageUrl), Backdrop 宽幅
 *  响应式: 桌面 21:9 画幅 / 平板黑边减小 / 手机黑边更细+帧条3个
 *  兼容: Emby 4.8/4.9, 挂载 homeSectionsContainer 首位 (与现有轮播互斥)
 * =============================================================================
 */
(function () {
  'use strict';
  if (window.VanvyCinema) return;

  class CinemaUtils {
    static sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  }

  class CinemaBanner {
    static start() {
      if (window.VanvyCinemaStarted) return;
      window.VanvyCinemaStarted = true;
      console.log('[VanvyCinema] 影院轮播启动');

      // 主题: 从 html/body class 读取 (安装时注入), 默认 midnight
      this.theme = 'midnight';
      try {
        const m = document.body.className.match(/vanvy-aurora-theme-([a-z]+)/) ||
                 document.documentElement.className.match(/vanvy-aurora-theme-([a-z]+)/);
        if (m) this.theme = m[1];
      } catch (e) { /* ignore */ }

      this.itemQuery = {
        ImageTypes: 'Backdrop',
        EnableImageTypes: 'Backdrop,Logo,Primary',
        IncludeItemTypes: 'Movie,Series',
        SortBy: 'ProductionYear, PremiereDate, SortName',
        Recursive: true,
        ImageTypeLimit: 1,
        Limit: 60,
        Fields: 'ProductionYear,Overview,CommunityRating,Genres,MediaSources',
        SortOrder: 'Descending',
        EnableUserData: false,
        EnableTotalRecordCount: false
      };
      // 宽幅 Backdrop (21:9 裁切), 缩略图 Backdrop 小图
      this.backdropOptions = { type: 'Backdrop', maxWidth: 2560, adjustForPixelRatio: false };
      this.thumbOptions = { type: 'Backdrop', maxWidth: 320, adjustForPixelRatio: false };
      this.logoOptions = { type: 'Logo', maxWidth: 460, adjustForPixelRatio: false };
      this._epCache = {};   // seriesId -> 剧集缓存
      this.currentIndex = 0;
      this.items = [];
      this.timer = null;
      this.AUTOPLAY_MS = 9000;
      this.initStart = false;
      this.root = null;

      // 监听路由变化: 离开首页立即清理 (Emby.Page.show 用 history API, 需同时监听 popstate)
      const cleanupAway = () => {
        if (window.location.href.indexOf('!/home') === -1) {
          document.querySelectorAll('.vanvy-cinema').forEach(el => {
            if (el.parentNode) el.parentNode.removeChild(el);
          });
          this.initStart = false;
          this.root = null;
          document.body.classList.remove('vanvy-carousel-active');
        }
      };
      window.addEventListener('hashchange', cleanupAway);
      window.addEventListener('popstate', cleanupAway);

      let lastUrl = window.location.href;

      // ⚠️ 2026-08-18 性能修复: 裸 setInterval(无间隔) = 浏览器最小间隔 ~4ms 疯狂触发,
      //    每秒 250 次全 DOM 扫描 → 主线程占满 → 页面卡顿/点击无响应。
      //    路由检查 1 秒一次足够; 保存引用供离开首页时清理。
      var pollTimer = setInterval(() => {
        // URL 变化检测 (Emby.Page.show 用 history API, 不触发 hashchange/popstate)
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          if (window.location.href.indexOf('!/home') === -1) {
            document.querySelectorAll('.vanvy-cinema').forEach(el => {
              if (el.parentNode) el.parentNode.removeChild(el);
            });
            this.initStart = false;
            this.root = null;
            document.body.classList.remove('vanvy-carousel-active');
          }
        }
        const onHome = window.location.href.indexOf('!/home') !== -1;
        if (onHome) {
          // 清理隐藏视图残留
          document.querySelectorAll('.hide .vanvy-cinema').forEach(el => el.remove());
          // 轮播不在 DOM → 允许重新挂载 (离开首页回来后的关键!)
          if (!document.querySelector('.view:not(.hide) .vanvy-cinema')) {
            this.initStart = false;
            document.body.classList.remove('vanvy-carousel-active');
          }
          // 首页容器出现 + 轮播不在 → 挂载
          if (!this.initStart &&
              document.querySelector('.view:not(.hide) .homeSectionsContainer, .view:not(.hide) .sections') &&
              !document.querySelector('.view:not(.hide) .vanvy-cinema')) {
            this.initStart = true;
            this.init();
          }
        } else {
          // 离开首页 → 清理轮播残留
          document.querySelectorAll('.vanvy-cinema').forEach(el => {
            if (el.parentNode) el.parentNode.removeChild(el);
          });
          this.initStart = false;
          this.root = null;
          document.body.classList.remove('vanvy-carousel-active');
          // 离开首页后停止轮询(已清理完)
          try { clearInterval(pollTimer); } catch (e) {}
          return;
        }
      }, 1000);
    }

    static async init() {
      const container = document.querySelector('.view:not(.hide) .homeSectionsContainer') ||
        document.querySelector('.view:not(.hide) .sections');
      if (container) await this.initBanner(container);
    }

    /* 策展规则支持 (carousel-rules.json) */
    static async applyCarouselRules() {
      try {
        if (window.VanvyCarouselRules && window.VanvyCarouselRules.loaded) {
          const q = await window.VanvyCarouselRules.buildQuery();
          if (q) {
            this.itemQuery = Object.assign({}, this.itemQuery, q);
            console.log('[VanvyCinema] 已应用策展规则');
          }
        }
      } catch (e) { console.warn('[VanvyCinema] 策展规则失败, 用默认', e); }
    }

    /* ── Emby API 调用 (复用 VanvyKit 桥, 否则自包含 BroadcastChannel) ── */
    static injectCall(func, arg) {
      if (window.VanvyKit && typeof window.VanvyKit.injectCall === 'function') {
        return window.VanvyKit.injectCall(func, arg);
      }
      return new Promise((resolve) => {
        const hash = 'vc' + Math.random().toString(36).slice(2, 10);
        const channel = new BroadcastChannel(hash);
        channel.addEventListener('message', (e) => { resolve(e.data); channel.close(); });
        const script = document.createElement('script');
        script.className = 'vanvy-i-' + hash;
        script.textContent = `
          (async () => {
            const client = await new Promise(res => {
              const t = setInterval(() => { if (window.ApiClient !== undefined) { clearInterval(t); res(window.ApiClient); } }, 16);
              setTimeout(() => { clearInterval(t); res(null); }, 10000);
            });
            try { const r = await client.${func}(${arg}); new BroadcastChannel('${hash}').postMessage(r); }
            catch (e) { new BroadcastChannel('${hash}').postMessage({ error: String(e) }); }
            document.querySelector('script.vanvy-i-${hash}')?.remove();
          })();`;
        (document.head || document.documentElement).appendChild(script);
      });
    }

    static getItems(query) {
      return this.injectCall('getItems', 'client.getCurrentUserId(), ' + JSON.stringify(query));
    }
    static getImageUrl(itemId, options) {
      // itemId 必须 JSON 序列化 (带引号), 否则注入脚本里是裸标识符 ReferenceError
      return this.injectCall('getImageUrl', JSON.stringify(itemId) + ', ' + JSON.stringify(options))
        .then(u => (u && typeof u === 'object' && u.Url) ? u.Url : u);
    }

    /* ── 渲染主流程 (先插结构显示 loading, 数据/媒体库并行预加载) ── */
    static async initBanner(container) {
      try {
        // 1. 立即插入全屏结构 (专属 loading 立即可见)
        const section = document.createElement('div');
        section.className = 'vanvy-cinema vanvy-aurora-theme-' + this.theme;
        section.innerHTML = this.buildHTML();
        this.root = section;
        container.insertBefore(section, container.firstChild);
        this.showLoading();

        // 2. 并行: 轮播数据预取 (不再依赖/触碰原 section0)
        // 注: 策展规则(maxCount被normalize压到30+Random)候选太少/电影少 → 改由自己分别拉电影&剧集各LIMIT, 保证两类都充足
        await this._ensureTmdbReady();
        const _groups = await this._fetchBannerCandidates().catch(function () { return { movies: [], series: [] }; });
        const _all = [].concat(_groups.movies || [], _groups.series || []);

        if (!_all.length) {
          this.hideLoading();
          console.warn('[VanvyCinema] 无数据');
          return;
        }
        // 图源判定: Emby Backdrop → TMDB 高清宽幅映射 (轮播是 21:9 超大横幅, 只有 Backdrop 或 TMDB 宽图才不糊; Primary 竖海报放大必糊 → 不进轮播, 宁缺毋滥别出黑底/糊图)
        const _hasBg = function(i){ return (i.ImageTags && i.ImageTags.Backdrop) || (window._vanvyTmdbBd && window._vanvyTmdbBd[String(i.Id)]); };
        const _withBackdrop = _all.filter(function(i){return i.ImageTags && i.ImageTags.Backdrop;});
        const _withTmdb = _all.filter(function(i){return _hasBg(i) && !(i.ImageTags && i.ImageTags.Backdrop);});
        const _pool = _withBackdrop.length ? _withBackdrop : _withTmdb;
        // 时间×评分权衡排序(评分高优先, 但保持够新)
        // 注: getItems 返回的 items 通常不带 CommunityRating(定制版 API 丢 Fields), 用 fetch 补拉真实评分
        const _base = _pool && _pool.length ? _pool : _all;
        await CinemaBanner._augmentRatings(_base);
        // 电影/剧集分组各自按时间×评分排好, 再交替合并 → 轮播不偏科(电影剧集混排)
        const _movies = _base.filter(function (i) { return i.Type === 'Movie'; });
        const _series = _base.filter(function (i) { return i.Type === 'Series'; });
        const _rankMo = CinemaBanner.rankByTimeRating(_movies);
        const _rankSe = CinemaBanner.rankByTimeRating(_series);
        this.items = CinemaBanner.interleave(_rankMo, _rankSe, 8);
        console.log('[VanvyCinema] 拉取电影' + _groups.movies.length + '剧集' + _groups.series.length + ' -> 图源后电影' + _movies.length + '/剧集' + _series.length + ' -> 展示' + this.items.length);

        // 3. 渲染首屏轮播 + 独立媒体库卡片流
        // 2026-08-18 修复时序: 先渲染媒体库, 再 loadSlide(0)——
        // 否则第1张若是剧集, renderEpisodesFor 在媒体库渲染前执行, _libraryHTML 保存不到 → 切回电影时媒体库丢失
        this.renderMediaLibrary();
        await this.loadSlide(0, true);
        // 媒体库渲染完成后, 若当前是剧集则重新触发剧集列表(确保 _libraryHTML 已保存)
        const firstItem = this.items[0];
        if (firstItem && firstItem.Type === 'Series') {
          this.renderEpisodesFor(firstItem);
        }

        // 4. 就绪
        this.startAutoplay();
        this.bindEvents();
        this.hideLoading();
        document.body.classList.add('vanvy-carousel-active');
        window.dispatchEvent(new CustomEvent('vanvy:carousel-ready'));
      } catch (e) {
        console.warn('[VanvyCinema] 初始化失败', e);
        this.hideLoading();
      }
    }

    /* 确保 TMDB 高清宽幅映射已加载(最多等 6000ms), 否则轮播无图源判定会失真 */
    static _ensureTmdbReady() {
      return new Promise(function (resolve) {
        const t0 = Date.now();
        const check = function () {
          if (window._vanvyTmdbBd && Object.keys(window._vanvyTmdbBd).length) { resolve(); return; }
          if (Date.now() - t0 > 6000) { resolve(); return; }
          setTimeout(check, 250);
        };
        check();
      });
    }

    /* 由 banner 自己拉电影&剧集候选(各 LIMIT 部, 按最新上映倒序), 不再依赖策展规则的随机小池.
       返回 { movies:[], series:[] }, item 自带 CommunityRating(直接走 fetch 带 Fields). */
    static async _fetchBannerCandidates() {
      let ak = '', uid = '';
      try { if (window.ApiClient && typeof window.ApiClient.accessToken === 'function') ak = window.ApiClient.accessToken() || ''; } catch (e) {}
      try { if (window.ApiClient && typeof window.ApiClient.getCurrentUserId === 'function') uid = window.ApiClient.getCurrentUserId() || ''; } catch (e) {}
      let origin = window.location.origin;
      if (!origin) origin = window.location.protocol + '//' + window.location.host;
      const LIMIT = 30;  // 每类拉 30, 总共 60 候选
      const base = origin + (origin.indexOf('/emby') === -1 ? '/emby' : '') + '/Users/' + uid + '/Items?ImageTypes=Backdrop&EnableImageTypes=Backdrop,Logo,Primary&Recursive=true&ImageTypeLimit=1&Limit=' + LIMIT +
        '&SortBy=ProductionYear,PremiereDate,SortName&SortOrder=Descending&Fields=ProductionYear,CommunityRating,Overview,Genres,MediaSources&EnableTotalRecordCount=false&api_key=' + encodeURIComponent(ak);
      async function fetchType(includeType) {
        try {
          const resp = await fetch(base + '&IncludeItemTypes=' + includeType, { credentials: 'same-origin' });
          if (!resp.ok) return [];
          const d = await resp.json();
          return d.Items || [];
        } catch (e) { return []; }
      }
      const [movies, series] = await Promise.all([fetchType('Movie'), fetchType('Series')]);
      return { movies: movies, series: series };
    }

    /* 时间 × 评分 加权排序(轮播选片用).
       入参: 候选数组(可能来自策展规则的随机池).
       时间分: 基于真实首映日期 PremiereDate/ProductionYear(越新越高), 与候选池位置无关(策展Random时位置失真).
       评分分: CommunityRating/10 归一化; 无评分给中性 0.5.
       打分: 0.5×时间 + 0.5×评分 → 够新又评分高的优先; 新高分片压倒老片; 无评分不过度拔高也不压底. */
    static rankByTimeRating(items) {
      if (!items || !items.length) return [];
      // 计算日期数值: PremiereDate(优先) → ProductionYear → 兜底
      function dateNum(it) {
        const pd = it.PremiereDate;
        if (pd) { const t = Date.parse(pd); if (!isNaN(t)) return t; }
        if (it.ProductionYear) return new Date(it.ProductionYear, 0, 1).getTime();
        return 0;
      }
      let min = Infinity, max = -Infinity;
      items.forEach(function (it) { const v = dateNum(it); if (v < min) min = v; if (v > max) max = v; });
      const span = (max - min) || 1;
      const scored = items.map(function (it) {
        const timeScore = (dateNum(it) - min) / span;   // 0(最老)→1(最新)
        const rt = (typeof it.CommunityRating === 'number' && it.CommunityRating > 0) ? it.CommunityRating : null;
        const rateScore = rt != null ? Math.min(rt / 10, 1) : 0.5;
        const weighted = 0.5 * timeScore + 0.5 * rateScore;
        return { it: it, weighted: weighted, timeScore: timeScore, rateScore: rateScore };
      });
      scored.sort(function (a, b) { return b.weighted - a.weighted; });
      return scored.map(function (s) { return s.it; });
    }

    /* 电影/剧集交替合并成 count 个(轮播不偏科).
       两个已按时间×评分排好的数组, 交叉取: 剧集/电影轮流, 一部少的则另一部补位. */
    static interleave(movies, series, count) {
      const out = [];
      let m = 0, s = 0;
      // 交替模式: 优先剧集开头, 然后电影/剧集轮换(视觉均衡)
      while (out.length < count && (m < movies.length || s < series.length)) {
        if (out.length % 2 === 1 && m < movies.length) { out.push(movies[m++]); }
        else if (s < series.length) { out.push(series[s++]); }
        else if (m < movies.length) { out.push(movies[m++]); }
        else break;
      }
      return out;
    }

    /* 用 fetch 按候选 Id 自身补拉真实评分(CommunityRating): 定制版 getItems 丢 Fields, 且策展池与普通列表不一致.
       逐个/分批用 Ids= 查询, 回填到 item.CommunityRating. */
    static async _augmentRatings(items) {
      try {
        if (!items || !items.length) return;
        let ak = '';
        try { if (window.ApiClient && typeof window.ApiClient.accessToken === 'function') { const t = window.ApiClient.accessToken(); if (t) ak = t; } } catch (e) {}
        if (!ak) return;
        let origin = window.location.origin;
        if (!origin) origin = window.location.protocol + '//' + window.location.host;
        const uid = (window.ApiClient && typeof window.ApiClient.getCurrentUserId === 'function') ? window.ApiClient.getCurrentUserId() : '';
        // 分批 Ids= 查询(每批20个), Emby 支持逗号分隔多 id
        const ids = items.map(function (it) { return String(it.Id); });
        const byId = new Map();
        for (let i = 0; i < ids.length; i += 20) {
          const chunk = ids.slice(i, i + 20);
          const url = origin + (origin.indexOf('/emby') === -1 ? '/emby' : '') + '/Users/' + uid + '/Items?Ids=' + encodeURIComponent(chunk.join(',')) +
            '&Fields=ProductionYear,CommunityRating&ImageTypeLimit=0&EnableImageTypes=&api_key=' + encodeURIComponent(ak);
          const resp = await fetch(url, { credentials: 'same-origin' });
          if (!resp.ok) continue;
          const data = await resp.json();
          (data.Items || []).forEach(function (it) { if ('CommunityRating' in it) byId.set(String(it.Id), it.CommunityRating); });
        }
        let hit = 0;
        items.forEach(function (it) {
          const v = byId.get(String(it.Id));
          if (v != null) { it.CommunityRating = v; hit++; }
        });
        if (hit) console.log('[VanvyCinema] 补拉评分命中', hit, '/', items.length);
      } catch (e) { /* 评分拉取失败不影响排序(无评分走中性) */ }
    }

    /* 加载轮播数据 */
    static async loadData() {
      await this.applyCarouselRules();
      const data = await this.getItems(this.itemQuery);
      if (window.VanvyCarouselRules && window.VanvyCarouselRules.loaded && data && data.Items) {
        data.Items = window.VanvyCarouselRules.applyPin(data.Items);
      }
      return data;
    }


    /* 媒体库: 独立渲染卡片流 (不碰原 section0) */
    static renderMediaLibrary() {
      const lib = this.root.querySelector('.vanvy-cinema-library');
      if (!lib) return;
      lib.classList.add('vml-ready');
      lib.style.display = '';
      lib.innerHTML =
        '<div class="vml-header">' +
          '<span class="vml-title">🎬 媒体库</span>' +
          '<span class="vml-hint">滚轮 / 拖拽浏览</span>' +
        '</div>' +
        '<div class="vml-track"></div>';
      const track = lib.querySelector('.vml-track');
      this.getViews()
        .then(views => {
          const items = (views && views.Items) ? views.Items : [];
          if (!items.length) { lib.style.display = 'none'; return; }
          // 2026-08-18 重构: 媒体库 HTML 独立构建到临时容器, 先存 _libraryHTML 再决定显示
          // (避免 getViews 异步返回时 lib 已被剧集列表覆盖 → 媒体库丢失)
          const tmpLib = document.createElement('div');
          tmpLib.className = 'vanvy-cinema-library vml-ready';
          tmpLib.innerHTML =
            '<div class="vml-header">' +
              '<span class="vml-title">🎬 媒体库</span>' +
              '<span class="vml-hint">滚轮 / 拖拽浏览</span>' +
            '</div>' +
            '<div class="vml-track"></div>';
          const tmpTrack = tmpLib.querySelector('.vml-track');
          const cardFrag = document.createDocumentFragment();
          items.forEach(v => {
            const card = document.createElement('div');
            card.className = 'vml-card';
            card.innerHTML =
              '<div class="vml-card-blur"></div><div class="vml-card-img"><div class="vml-card-shine"></div></div>' +
              '<div class="vml-card-meta"><span class="vml-card-name"></span><span class="vml-card-type"></span></div>';
            card.querySelector('.vml-card-name').textContent = v.Name || '';
            card.querySelector('.vml-card-type').textContent = (v.CollectionType || 'folder').toUpperCase();
            // 事件委托: data 属性 + lib 上绑定 (bindEvents)
            card.setAttribute('data-id', v.Id);
            card.setAttribute('data-ct', v.CollectionType || '');
            cardFrag.appendChild(card);
            // ⚠️ hero 图加载统一在下方 Promise.all 中处理(等全部完成再存 _libraryHTML)
          });
          tmpTrack.appendChild(cardFrag);
          // ⚠️ 2026-08-18 修复: 等 hero 图异步加载完成再保存 _libraryHTML,
          //    否则保存的 HTML 无背景图 → 媒体库卡片全无图 (主人反馈问题1)
          var heroPromises = [];
          items.forEach(function (v) {
            heroPromises.push(CinemaBanner._getViewHeroImage(v.Id));
          });
          Promise.all(heroPromises).then(function (heroUrls) {
            try {
              var cards = tmpTrack.querySelectorAll('.vml-card');
              cards.forEach(function (card, ci) {
                var heroUrl = heroUrls[ci];
                if (heroUrl) {
                  card.querySelector('.vml-card-img').style.backgroundImage = 'url("' + heroUrl + '")';
                  card.querySelector('.vml-card-blur').style.backgroundImage = 'url("' + heroUrl + '")';
                } else {
                  card.querySelector('.vml-card-img').style.backgroundImage = 'none';
                  card.querySelector('.vml-card-img').style.background = 'linear-gradient(160deg, #0b0b0d, #1c1c20)';
                  card.querySelector('.vml-card-blur').style.backgroundImage = 'none';
                }
              });
              CinemaBanner._libraryHTML = tmpLib.innerHTML;
              // 当前若是媒体库视图(标题 🎬), 直接显示媒体库; 否则保持剧集视图不动
              const titleEl = lib.querySelector('.vml-title');
              const isLibView = titleEl && titleEl.textContent.indexOf('🎬') === 0;
              if (isLibView) {
                lib.innerHTML = CinemaBanner._libraryHTML;
                lib.style.display = '';
                requestAnimationFrame(() => {
                  const tr = lib.querySelector('.vml-track');
                  if (!tr) return;
                  tr.querySelectorAll('.vml-card').forEach((c, i) => {
                    setTimeout(() => c.classList.add('vml-in'), i * 35);
                  });
                });
              }
            } catch (e) {}
          });
        })
        .catch(() => { lib.style.display = 'none'; });
      this.initDragScroll(track);
      // 左右滚动按钮 (与 AURORA 对齐)
      const leftBtn = lib.querySelector('.vml-scroll-left');
      const rightBtn = lib.querySelector('.vml-scroll-right');
      const scrollWrap = lib.querySelector('.vml-scroll-wrap');
      const updateArrows = () => {
        if (!leftBtn || !rightBtn) return;
        leftBtn.classList.toggle('vml-btn-disabled', track.scrollLeft <= 0);
        rightBtn.classList.toggle('vml-btn-disabled', track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
      };
      if (leftBtn) leftBtn.addEventListener('click', () => { track.scrollBy({ left: -260, behavior: 'smooth' }); });
      if (rightBtn) rightBtn.addEventListener('click', () => { track.scrollBy({ left: 260, behavior: 'smooth' }); });
      track.addEventListener('scroll', updateArrows);
      setTimeout(updateArrows, 300);
      setTimeout(() => {
        if (scrollWrap) scrollWrap.classList.add('vml-wrap-ready');
      }, 500);
    }

    /* 获取用户媒体库分类 (Emby ApiClient 无 getViews 方法, 直接 fetch API) */
    static getViews() {
      return new Promise((resolve) => {
        try {
          // 优先复用当前 ApiClient 的 token
          const uid = window.ApiClient ? window.ApiClient.getCurrentUserId() : 'a5c37a4222164109b5be3f24376524ae';
          const base = window.location.origin;
          // 2026-08-18 修复: Emby API 需要 /emby 前缀 (原代码漏了 → 404 → 媒体库隐藏)
          const apiPrefix = (base.indexOf('/emby') === -1) ? '/emby' : '';
          const apiUrl = base + apiPrefix + '/Users/' + uid + '/Views?api_key=' +
            (window.ApiClient ? window.ApiClient.accessToken() : '');
          fetch(apiUrl).then(r => r.json()).then(resolve).catch(() => resolve(null));
        } catch (e) { resolve(null); }
      });
    }

    /* 获取媒体库代表性影片宽幅剧照(Backdrop), 替代默认图标(GPT方案 2026-08-17)
       返回 Promise<url|null>: 取库内按评分排序的 Movie/Series, 优先有 Backdrop 的影片,
       用它作卡片高级封面。失败/无图返回 null(调用方回退库Primary或渐变)。 */
    static _getViewHeroImage(viewId) {
      return new Promise((resolve) => {
        try {
          const uid = window.ApiClient ? window.ApiClient.getCurrentUserId() : '';
          const tok = window.ApiClient ? window.ApiClient.accessToken() : '';
          const base = window.location.origin;
          if (!uid || !tok) { resolve(null); return; }
          const url = base + (base.indexOf('/emby') === -1 ? '/emby' : '') + '/Users/' + uid + '/Items?ParentId=' + encodeURIComponent(viewId) +
            '&IncludeItemTypes=Movie,Series&Recursive=true&SortBy=CommunityRating,PremiereDate' +
            '&SortOrder=Descending&Limit=8&Fields=BackdropImageTags,PrimaryImageTag&EnableImageTypes=Backdrop,Primary' +
            '&ImageTypeLimit=1&api_key=' + encodeURIComponent(tok);
          fetch(url).then(r => r.json()).then((data) => {
            const items = (data && data.Items) ? data.Items : [];
            // 优先有 Backdrop 的
            let hero = items.find(function (x) { return x.BackdropImageTags && x.BackdropImageTags.length; });
            if (!hero) hero = items[0];
            if (!hero) { resolve(null); return; }
            if (hero.BackdropImageTags && hero.BackdropImageTags.length) {
              resolve(base + (base.indexOf('/emby') === -1 ? '/emby' : '') + '/Items/' + hero.Id + '/Images/Backdrop/0?MaxWidth=1200&tag=' + encodeURIComponent(hero.BackdropImageTags[0]));
            } else {
              // 无 Backdrop -> 用该影片 Primary(竖图, 卡片宽图可能裁, 但比库图标好)
              resolve(base + (base.indexOf('/emby') === -1 ? '/emby' : '') + '/Items/' + hero.Id + '/Images/Primary?maxWidth=600');
            }
          }).catch(() => resolve(null));
        } catch (e) { resolve(null); }
      });
    }

    /* 拖拽/滚轮横向滚动 */
    static initDragScroll(el) {
      let isDown = false, startX, scrollLeft;
      el.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') {
          isDown = true; startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft;
          el.style.cursor = 'grabbing'; el.style.scrollBehavior = 'auto';
        }
      });
      el.addEventListener('pointerleave', () => { isDown = false; el.style.cursor = ''; });
      el.addEventListener('pointerup', () => { isDown = false; el.style.cursor = ''; });
      el.addEventListener('pointermove', e => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        el.scrollLeft = scrollLeft - (x - startX);
      });
      el.addEventListener('wheel', e => {
        // ⚠️ 2026-08-18 修复: 只拦截横向滚动意图, 垂直滚动放行(否则整页无法滚动!)
        //    原代码无条件 preventDefault → 鼠标在轮播区时页面永远滚不动 → 点不到原生媒体库/继续播放
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;  // 垂直滚动 → 交给页面
        e.preventDefault();
        el.scrollLeft += e.deltaX;
      }, { passive: false });
    }

    /* loading 控制 */
    static showLoading() {
      // loading 独立创建并挂到 body 顶层 (彻底脱离轮播容器, 不残留)
      let l = document.getElementById('vanvy-global-loading');
      if (!l) {
        l = document.createElement('div');
        l.id = 'vanvy-global-loading';
        l.className = 'vanvy-loading';
        l.innerHTML = this.buildLoadingHTML();
        document.body.appendChild(l);
      }
      l.classList.remove('vl-hide');
      // 主题变量复制到 body
      if (this.root) {
        const themeCls = this.root.className.match(/vanvy-aurora-theme-[a-z]+/);
        if (themeCls) document.body.classList.add(themeCls[0]);
      }
      document.body.classList.add('vanvy-loading-active');
    }
    static hideLoading() {
      const l = document.getElementById('vanvy-global-loading');
      document.body.classList.remove('vanvy-loading-active');
      document.body.className = document.body.className.replace(/vanvy-aurora-theme-[a-z]+/g, '').replace(/\s+/g, ' ').trim();
      if (l) {
        l.classList.add('vl-hide');
        setTimeout(function () { if (l.parentNode) l.parentNode.removeChild(l); }, 650);
      }
    }

    /* 生成全屏加载动画 HTML (独立挂 body, 不残留轮播容器) */
    static buildLoadingHTML() {
      return `        <div class="vanvy-loading">
          <div class="vl-bg"></div>
          <div class="vl-reel"></div>
          <div class="vl-particles">
            <i class="vp vp-1"></i><i class="vp vp-2"></i><i class="vp vp-3"></i>
            <i class="vp vp-4"></i><i class="vp vp-5"></i><i class="vp vp-6"></i>
            <i class="vp vp-7"></i><i class="vp vp-8"></i>
          </div>
          <div class="vl-inner">
            <div class="vl-logo-wrap">
              <div class="vl-glow"></div>
              <div class="vl-ring"></div>
              <div class="vl-ring vl-ring-2"></div>
              <img class="vl-logo" alt="" src="vanvy/branding/splash-logo.png" onerror="this.style.display='none'">
            </div>
            <div class="vl-bar"><i></i></div>
            <div class="vl-brand">VANVY CINEMA</div>
          </div>
        </div>

`;
    }

    /* 生成轮播结构 (不含 loading, loading 独立挂 body) */
    static buildHTML() {
      return `
        <div class="cinema-top-bar"></div>
        <div class="cinema-frame">
          <div class="cinema-screen">
            <div class="cinema-bg"></div>
            <div class="cinema-glow"></div>
            <div class="cinema-vignette"></div>

            <div class="cinema-content">
              <img class="cinema-logo" alt="logo" style="display:none">
              <div class="cinema-logo-fallback" style="display:none"></div>
              <div class="cinema-meta">
                <span class="cinema-rating"></span>
                <span class="cinema-tag cinema-year"></span>
                <span class="cinema-tag cinema-genre"></span>
                <span class="cinema-tag cinema-quality"></span>
              </div>
              <div class="cinema-title"></div>
              <div class="cinema-desc"></div>
              <div class="cinema-btns">
                <button class="cinema-btn cinema-btn-play">▶ 放映</button>
                <button class="cinema-btn cinema-btn-info">ⓘ 详情</button>
              </div>

            </div>
          </div>
          <div class="cinema-nav">
            <button class="cinema-nav-btn cinema-prev">‹</button>
            <button class="cinema-nav-btn cinema-next">›</button>
          </div>
        </div>
        <div class="cinema-strip">
          <div class="cinema-strip-inner"></div>
        </div>
        <div class="cinema-progress"><i></i></div>
        <div class="cinema-episodes" style="display:none">
          <div class="ce-seasons"></div>
          <div class="ce-track-wrap">
            <div class="ce-track"></div>
          </div>
        </div>
        <div class="vanvy-cinema-library"></div>`;
    }

    static async loadSlide(idx, immediate) {
      const item = this.items[idx];
      if (!item) return;
      this.currentIndex = idx;
      // 每次切换轮播先恢复原生媒体区, 并递增 hides 代(使上一轮未完成的剧集展开回调失效)
      if (!CinemaBanner._hideGen) CinemaBanner._hideGen = 0;
      CinemaBanner._hideGen++;
      CinemaBanner.setNativeHidden(false);
      const root = this.root;
      if (!root) return;
      const bg = root.querySelector('.cinema-bg');
      const logoEl = root.querySelector('.cinema-logo');
      const logoFallback = root.querySelector('.cinema-logo-fallback');
      const titleEl = root.querySelector('.cinema-title');
      const descEl = root.querySelector('.cinema-desc');
      const ratingEl = root.querySelector('.cinema-rating');
      const yearEl = root.querySelector('.cinema-year');
      const genreEl = root.querySelector('.cinema-genre');
      const qualityEl = root.querySelector('.cinema-quality');
      const playBtn = root.querySelector('.cinema-btn-play');
      const infoBtn = root.querySelector('.cinema-btn-info');

      // 宽幅背景: 优先 Emby 原生 Backdrop, 其次 TMDB 高清宽幅图, 都没有则黑金渐变压底(不糊不放大)
      try {
        let bgUrl = "";

        // 1) Emby 原生 Backdrop(高清, 本地零请求)
        if (item.ImageTags && item.ImageTags.Backdrop) {
          try { bgUrl = await this.getImageUrl(item.Id, this.backdropOptions); } catch (e) { bgUrl = ""; }
        }

        // 2) TMDB 高清宽幅(映射表 tmdb-backdrops.json), 仅当没有 Emby Backdrop 时
        if (!bgUrl && window._vanvyTmdbBd) {
          try {
            bgUrl = window._vanvyTmdbBd[String(item.Id)] || "";
          } catch (e) { bgUrl = ""; }
        }

        // 3) Primary 海报兜底（strm/无 Backdrop 库：宁可竖图放大做背景，也不出黑屏）
        if (!bgUrl && item.ImageTags && item.ImageTags.Primary) {
          try {
            bgUrl = await this.getImageUrl(item.Id, { type: 'Primary', maxWidth: 1920 });
          } catch (e) { bgUrl = ""; }
        }

        if (bgUrl) {
          bg.style.backgroundImage = `url("${bgUrl}")`;
          bg.style.backgroundSize = "cover";
          bg.style.backgroundPosition = "center";
          bg.style.filter = "";   // 取消任何压暗滤镜, 高清原图直出
        } else {
          bg.style.background = "linear-gradient(160deg,#0b0b0d,#1c1c20)";
        }
      } catch (e) { bg.style.background = 'linear-gradient(160deg,#0b0b0d,#1c1c20)'; }

      // Logo (有则显示, 无则回退文字)
      let hasLogo = false;
      if (item.ImageTags && item.ImageTags.Logo) {
        try {
          const logoUrl = await this.getImageUrl(item.Id, this.logoOptions);
          logoEl.src = logoUrl;
          logoEl.style.display = 'block';
          logoFallback.style.display = 'none';
          hasLogo = true;
        } catch (e) { hasLogo = false; }
      }
      if (!hasLogo) {
        logoEl.style.display = 'none';
        logoFallback.textContent = item.Name || '';
        logoFallback.style.display = 'block';
      }

      // 标题/简介/评分
      titleEl.textContent = item.Name || '';
      descEl.textContent = item.Overview ? (item.Overview.length > 130 ? item.Overview.slice(0, 130) + '…' : item.Overview) : '';
      const year = item.ProductionYear || (item.PremiereDate || '').slice(0, 4);
      yearEl.textContent = year || '';
      yearEl.style.display = yearEl.textContent ? '' : 'none';
      const rating = item.CommunityRating ? item.CommunityRating.toFixed(1) : '';
      ratingEl.innerHTML = rating ? `★ ${rating}` : '';
      ratingEl.style.display = rating ? '' : 'none';
      genreEl.textContent = (item.Genres && item.Genres[0]) || '';
      genreEl.style.display = genreEl.textContent ? '' : 'none';
      qualityEl.textContent = item.MediaSources && item.MediaSources[0] ?
        ((item.MediaSources[0].Height >= 2160 ? '4K' : item.MediaSources[0].Height >= 1080 ? '1080p' : 'HD')) : '';
      qualityEl.style.display = qualityEl.textContent ? '' : 'none';

      playBtn.onclick = () => { this.playItem(item); };
      infoBtn.onclick = () => {
        const serverId = item.ServerId || (window.ApiClient ? window.ApiClient.serverId() : '');
        const url = '/item?id=' + item.Id + '&serverId=' + serverId;
        if (window.Emby && window.Emby.Page && window.Emby.Page.show) {
          window.Emby.Page.show(url);
        } else {
          window.location.hash = '#!/' + url.replace(/^\//, '');
        }
      };

      this.renderEpisodesFor(item);
      await this.renderStrip(idx);
      this.updateProgress();
      this.preloadNextSlide(idx + 1);
    }

    /* 预加载下一张轮播主图(切换到下一张时不卡) */
    static preloadNextSlide(nextIdx) {
      try {
        const items = this.items;
        if (!items || !items.length) return;
        const ni = nextIdx % items.length;
        const it = items[ni];
        if (!it) return;
        // 只预载主背景图(不重复预载已加载过的)
        if (it._preloaded) return;
        it._preloaded = true;
        this.resolveBannerUrl(it, 1920).then(function (u) {
          if (!u) return;
          var img = new Image();
          img.src = u;
        }).catch(function () {});
      } catch (e) {}
    }

    /* 统一取最优背景图: ①Emby Backdrop → ②TMDB高清宽幅 → ③Primary海报 */
    static resolveBannerUrl(item, maxWidth) {
      if (!item) return Promise.resolve('');
      // ① Emby Backdrop
      if (item.ImageTags && item.ImageTags.Backdrop) {
        return Promise.resolve(this.getImageUrl(item.Id, { type: 'Backdrop', maxWidth: maxWidth, adjustForPixelRatio: false })).catch(function () { return ''; });
      }
      // ② TMDB 图(映射表) — 小图降分辨率省流量加快, 大图保持高清
      if (window._vanvyTmdbBd && window._vanvyTmdbBd[String(item.Id)]) {
        var u = window._vanvyTmdbBd[String(item.Id)];
        // 小尺寸需求(如帧条≤640)把 w1920 降为 w500, 秒快
        if (maxWidth && maxWidth <= 640) {
          u = u.replace(/\/w1920\//, '/w500/').replace(/\/w1280\//, '/w500/')
               .replace(/\/original\//, '/w500/');
        }
        return Promise.resolve(u);
      }
      // ③ Primary 海报(兜底, 不至于黑)
      if (item.ImageTags && item.ImageTags.Primary) {
        return Promise.resolve(this.getImageUrl(item.Id, { type: 'Primary', maxWidth: maxWidth, adjustForPixelRatio: false })).catch(function () { return ''; });
      }
      return Promise.resolve('');
    }

    /* 底部胶片帧条 (缩略图横排, 全部渲染 + 拖拽滚动) */
    static async renderStrip(activeIdx) {
      const root = this.root;
      const inner = root.querySelector('.cinema-strip-inner');
      const thumbs = this.items;
      let html = '';
      for (let i = 0; i < thumbs.length; i++) {
        const it = thumbs[i];
        let thumbUrl = '';
        try { thumbUrl = await this.resolveBannerUrl(it, 320); } catch (e) { /* ignore */ }
        html += `<div class="cinema-frame-card${i === activeIdx ? ' active' : ''}" data-idx="${i}" title="${(it.Name || '').replace(/"/g, '&quot;')}">
          <div class="cinema-frame-img" style="background-image:url('${thumbUrl}')"></div>
          <div class="cinema-frame-num">${String(i + 1).padStart(2, '0')}</div>
        </div>`;
      }
      inner.innerHTML = html;
      inner.classList.add('cinema-strip-scroll');
      inner.querySelectorAll('.cinema-frame-card').forEach(card => {
        card.addEventListener('click', () => {
          this.stopAutoplay();
          this.loadSlide(parseInt(card.dataset.idx, 10));
          this.startAutoplay();
        });
      });
      // 横向拖拽 + 滚轮
      let isDown = false, startX, scrollLeft;
      inner.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') { isDown = true; startX = e.pageX - inner.offsetLeft; scrollLeft = inner.scrollLeft; inner.style.cursor = 'grabbing'; }
      });
      inner.addEventListener('pointerleave', () => { isDown = false; inner.style.cursor = ''; });
      inner.addEventListener('pointerup', () => { isDown = false; inner.style.cursor = ''; });
      inner.addEventListener('pointermove', e => {
        if (!isDown) return;
        e.preventDefault();
        inner.scrollLeft = scrollLeft - (e.pageX - startX);
      });
      inner.addEventListener('wheel', e => {
        // ⚠️ 2026-08-18 修复: 同 initDragScroll, 垂直滚动放行, 只拦横向
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        inner.scrollLeft += e.deltaX;
      }, { passive: false });
    }

    static updateProgress() {
      const bar = this.root ? this.root.querySelector('.cinema-progress i') : null;
      if (bar) {
        bar.style.transition = 'none';
        bar.style.width = '0%';
        requestAnimationFrame(() => {
          bar.style.transition = `width ${this.AUTOPLAY_MS}ms linear`;
          bar.style.width = '100%';
        });
      }
    }

    static playItem(item) {
      // Emby 4.8 官方播放 (参考 approuter.js): loadPlaybackManager → play({fullscreen, ids, serverId})
      try {
        if (window.Emby && window.Emby.importModule) {
          window.Emby.importModule('./modules/common/playback/playbackmanager.js').then(function (pm) {
            pm.play({
              fullscreen: true,
              ids: [item.Id],
              serverId: item.ServerId || (window.ApiClient ? window.ApiClient.serverId() : '')
            });
          }).catch(function () {
            if (window.Emby && window.Emby.Page) window.Emby.Page.show('/item?id=' + item.Id + '&serverId=' + (item.ServerId || ''));
          });
        } else {
          if (window.Emby && window.Emby.Page) window.Emby.Page.show('/item?id=' + item.Id + '&serverId=' + (item.ServerId || ''));
        }
      } catch (e) {
        if (window.Emby && window.Emby.Page) window.Emby.Page.show('/item?id=' + item.Id + '&serverId=' + (item.ServerId || ''));
      }
    }

    static startAutoplay() {
      this.stopAutoplay();
      this.timer = setInterval(() => {
        const next = (this.currentIndex + 1) % this.items.length;
        this.loadSlide(next);
      }, this.AUTOPLAY_MS);
    }
    static stopAutoplay() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    static bindEvents() {
      const root = this.root;
      if (!root) return;
      root.querySelector('.cinema-prev').addEventListener('click', () => {
        this.stopAutoplay();
        this.loadSlide((this.currentIndex - 1 + this.items.length) % this.items.length);
        this.startAutoplay();
      });
      root.querySelector('.cinema-next').addEventListener('click', () => {
        this.stopAutoplay();
        this.loadSlide((this.currentIndex + 1) % this.items.length);
        this.startAutoplay();
      });
      root.addEventListener('mouseenter', () => this.stopAutoplay());
      root.addEventListener('mouseleave', () => this.startAutoplay());

      // ══ 2026-08-18 重构: vml-track 事件委托 (一次绑定, 媒体库/剧集列表通用) ══
      // 媒体库卡片 → data-id/data-ct 跳路由; 剧集卡片 → data-ep 直接播放
      // 委托绑在 .vanvy-cinema-library 上(节点不重建), 而非 vml-track(恢复 HTML 时会重建)
      const lib = root.querySelector('.vanvy-cinema-library');
      if (lib && !lib.dataset.vmlBound) {
        lib.dataset.vmlBound = '1';
        lib.addEventListener('click', (e) => {
          const card = e.target.closest('.vml-card');
          if (!card) return;
          const epId = card.getAttribute('data-ep');
          if (epId) {
            // 剧集卡片: 直接播放
            const item = { Id: epId, ServerId: (window.ApiClient && window.ApiClient.serverId) ? window.ApiClient.serverId() : '' };
            CinemaBanner.playItem(item);
            return;
          }
          const vId = card.getAttribute('data-id');
          if (!vId) return;
          // 媒体库卡片: Emby 官方路由
          const ct = card.getAttribute('data-ct') || '';
          const serverId = (window.ApiClient && window.ApiClient.serverId) ? window.ApiClient.serverId() : 'ae50a1a9e2374a0a8d03596566460c0f';
          let url;
          if (ct === 'movies' || ct === 'homevideos' || ct === 'musicvideos' || ct === '') {
            url = '/videos?serverId=' + serverId + '&parentId=' + vId;
          } else if (ct === 'tvshows') {
            url = '/tv?serverId=' + serverId + '&parentId=' + vId;
          } else if (ct === 'music' || ct === 'audiobooks') {
            url = '/music?serverId=' + serverId + '&parentId=' + vId;
          } else if (ct === 'games') {
            url = '/games?serverId=' + serverId + '&parentId=' + vId;
          } else if (ct === 'books') {
            url = '/books?serverId=' + serverId + '&parentId=' + vId;
          } else if (ct === 'boxsets' || ct === 'playlists') {
            url = '/list/list.html?parentId=' + vId + '&serverId=' + serverId + '&context=' + ct;
          } else {
            url = '/list/list.html?parentId=' + vId + '&serverId=' + serverId;
          }
          if (window.Emby && window.Emby.Page && window.Emby.Page.show) {
            window.Emby.Page.show(url);
          } else {
            window.location.hash = '!/' + url.replace(/^\//, '');
          }
        });
      }
    }

    /* ===== 剧集快捷播放: 轮播到剧集时显示分季/分集, 点集直接播 ===== */
    /* 隐藏/恢复 Emby 原生首页媒体区(.sections 的非 banner 兄弟), 防止剧集区与其重叠 */
    static setNativeHidden(hidden, gen) {
      // 2026-08-17: 不再隐藏 Emby 原生媒体区(.sections)。原因: 轮播到剧集时 setNativeHidden(true)
      // 会把 .sections 的"最新XX"原生媒体行 display:none, 导致首页黑卡; 且恢复不彻底。
      // 分季/分集UI已由 .cinema-episodes absolute 浮层方案处理, 无需隐藏原生区。
      // 保留空实现以兼容调用点。
      return;
    }

    static renderEpisodesFor(item) {
      const root = this.root;
      if (!root) return;
      const lib = root.querySelector('.vanvy-cinema-library');
      const wrap = root.querySelector('.cinema-episodes');
      if (!lib) return;
      if (!item || item.Type !== 'Series') {
        // 切回电影/其他: 恢复媒体库视图
        CinemaBanner.revokeEpThumbs();
        if (wrap) wrap.style.display = 'none';
        if (root.classList) root.classList.remove('ce-showing');
        if (this._libraryHTML) {
          lib.innerHTML = this._libraryHTML;
          lib.style.display = '';
          // 恢复 header 文案
          const t = lib.querySelector('.vml-title');
          if (t) t.textContent = '🎬 媒体库';
          const h = lib.querySelector('.vml-hint');
          if (h) h.textContent = '滚轮 / 拖拽浏览';
          // 重新绑定 vml-in 动画
          requestAnimationFrame(function () {
            const track = lib.querySelector('.vml-track');
            if (!track) return;
            track.querySelectorAll('.vml-card').forEach(function (c, i) {
              setTimeout(function () { c.classList.add('vml-in'); }, i * 25);
            });
          });
        }
        return;
      }
      const sid = item.Id;
      if (this._lastEpSid && this._lastEpSid !== sid) {
        CinemaBanner.revokeEpThumbs();
      }
      this._lastEpSid = sid;
      // 保存媒体库 HTML（首次进入剧集时, 此时媒体库已渲染好）
      if (!this._libraryHTML) {
        // 若 track 当前是媒体库卡片(有 data-id), 才保存; 否则等 renderMediaLibrary 填充后由 loadSlide 重试时保存
        const trackNow = lib.querySelector('.vml-track');
        if (trackNow && trackNow.querySelector('.vml-card[data-id]')) {
          this._libraryHTML = lib.innerHTML;
        }
      }
      if (!this._epCache[sid]) {
        if (wrap) wrap.style.display = 'none';
        this._epCache[sid] = this.loadEpisodes(sid);
      }
      const p = this._epCache[sid];
      const self = this;
      if (p && p.then) {
        p.then(function (epsMap) {
          if (!root.isConnected) return;
          const seasons = epsMap.seasons || [];
          if (!seasons.length) { if (wrap) wrap.style.display = 'none'; return; }
          self.buildEpisodesUI(sid, epsMap, seasons[0], lib);
          if (wrap) wrap.style.display = 'none';
          if (root.classList) root.classList.add('ce-showing');
        }).catch(function () { if (wrap) wrap.style.display = 'none'; });
      } else if (p) {
        const seasons = p.seasons || [];
        if (seasons.length) { self.buildEpisodesUI(sid, p, seasons[0], lib); if (wrap) wrap.style.display = 'none'; }
        else if (wrap) wrap.style.display = 'none';
      }
    }

    static loadEpisodes(seriesId) {
      // 返回 Promise<{seasons:[], eps:{season:[eps]}}>
      return this.getItems({
        ParentId: seriesId,
        IncludeItemTypes: 'Episode',
        Recursive: true,
        SortBy: 'IndexNumber',
        SortOrder: 'Ascending',
        Fields: 'Name,IndexNumber,ParentIndexNumber,ImageTags,RunTimeTicks,Overview',
        EnableImageTypes: 'Primary',
        ImageTypeLimit: 1,
        Limit: 600,
        EnableTotalRecordCount: false
      }).then(function (data) {
        const raw = (data && data.Items) ? data.Items : [];
        const seas = {};
        raw.forEach(function (ep) {
          if (!ep) return;
          const sn = (ep.ParentIndexNumber != null) ? ep.ParentIndexNumber : 1;
          if (!seas[sn]) seas[sn] = [];
          seas[sn].push(ep);
        });
        // 每季内按集数 IndexNumber 数字升序排(兜底: Emby 排序不稳定时也保证 1,2,3...顺序)
        Object.keys(seas).forEach(function (sn) {
          seas[sn].sort(function (a, b) {
            const ai = (a.IndexNumber != null) ? a.IndexNumber : 9999;
            const bi = (b.IndexNumber != null) ? b.IndexNumber : 9999;
            return ai - bi;
          });
        });
        const seasons = Object.keys(seas).map(Number).sort(function (a, b) { return a - b; });
        return { seasons: seasons, eps: seas };
      }).catch(function () { return { seasons: [], eps: {} }; });
    }

    static buildEpisodesUI(seriesId, epsMap, activeSeason, lib) {
      const self = this;
      const root = this.root;
      if (!root || !lib) return;
      const seriesName = (this.items && this.items.find(function(i){ return i.Id === seriesId; })) ?
        this.items.find(function(i){ return i.Id === seriesId; }).Name || '剧集' : '剧集';
      // 2026-08-18 重构: 保留 lib 的 header + vml-track 节点(事件委托绑在 track 上),
      // 只改 header 文案 + 重填 track 内容, 不整块 innerHTML 替换(否则丢失委托)
      lib.classList.add('vml-ready');
      lib.style.display = '';
      // 确保 header 结构存在
      if (!lib.querySelector('.vml-header')) {
        lib.innerHTML =
          '<div class="vml-header">' +
            '<span class="vml-title"></span>' +
            '<span class="vml-hint ce-seasons"></span>' +
          '</div>' +
          '<div class="vml-track"></div>';
      }
      const titleEl = lib.querySelector('.vml-title');
      if (titleEl) titleEl.textContent = '📺 ' + seriesName;
      // 季 tab 放 header 右侧 (vml-hint 位置)
      let seasEl = lib.querySelector('.ce-seasons');
      if (!seasEl) {
        const hint = lib.querySelector('.vml-hint');
        if (hint) {
          hint.className = 'vml-hint ce-seasons';
          hint.textContent = '';
          seasEl = hint;
        }
      }
      if (seasEl) {
        seasEl.innerHTML = '';
        (epsMap.seasons || []).forEach(function (sn) {
          const b = document.createElement('button');
          b.className = 'ce-season-tab' + (sn === activeSeason ? ' on' : '');
          b.textContent = 'S' + sn;
          b.dataset.s = sn;
          b.onclick = function () { self.buildEpisodesUI(seriesId, epsMap, sn, lib); };
          seasEl.appendChild(b);
        });
      }
      // 单集横排（复用 vml-card 卡片样式，与媒体库一致）— 保留 track 节点, 只换内容
      let track = lib.querySelector('.vml-track');
      if (!track) {
        track = document.createElement('div');
        track.className = 'vml-track';
        lib.appendChild(track);
      }
      track.innerHTML = '';
      const eps = (epsMap.eps && epsMap.eps[activeSeason]) || [];
      if (!eps.length) { track.innerHTML = '<div class="ce-empty">暂无剧集</div>'; return; }
      var epsArr = eps.slice(0, 40);   // 上限40集防超重
      const frag = document.createDocumentFragment();
      epsArr.forEach(function (ep, i) {
        const c = document.createElement('div');
        c.className = 'vml-card vml-ep-card';
        const num = 'S' + String(activeSeason).padStart(2, '0') + 'E' + String(ep.IndexNumber || (i + 1)).padStart(2, '0');
        c.innerHTML =
          '<div class="vml-card-blur"></div><div class="vml-card-img"><div class="vml-card-shine"></div></div>' +
          '<div class="vml-card-meta"><span class="vml-card-name"></span><span class="vml-card-year"></span></div>';
        c.querySelector('.vml-card-name').textContent = (ep.Name || num);
        c.querySelector('.vml-card-year').textContent = num;
        c.setAttribute('data-ep', ep.Id);
        c.setAttribute('data-series', seriesId || '');
        c.title = num + ' ' + (ep.Name || '');
        c.dataset.i = ep.Id;
        // 事件由 vml-track 委托处理 (bindEvents), 不再单独 onclick
        frag.appendChild(c);
      });
      track.appendChild(frag);
      requestAnimationFrame(function () {
        track.querySelectorAll('.vml-card').forEach(function (card, i) {
          setTimeout(function () { card.classList.add('vml-in'); }, i * 35);
        });
      });
      // ── 剧集缩略图: <img> native 加载 + 批量调度 ──
      const allThumbs = track.querySelectorAll('.vml-ep-card[data-ep]');
      CinemaBanner.loadAllEpImgs(allThumbs, seriesId, lib);
      // 拖动/滚动（与媒体库一致）
      this.initDragScroll(track);
    }

    /* 恢复媒体库视图事件 — 2026-08-18 已废弃: 改用 vml-track 事件委托(bindEvents), 无需重绑 */
    static _restoreLibraryEvents(lib) {}

    /* ── 剧集缩略图: <img> native 加载(浏览器原生缓存/加载, 最稳最简单, ChatGPT定稿) ──
       不用 fetch+Blob+backgroundImage(GC/时序/兼容坑多, 且难诊断)。
       Emby Primary 端点实测对所有剧集都能返回图(重器/若泽/财神/对话杀人魔均200)。
       onerror 兜底 → 剧集 Series 海报(letterbox 不乱拉)
       调度: 首屏前8张立即set src, 其余每70ms排1张, 避免同时挤爆 Emby 缩略图生产 */
    static epImageUrl(id) {
      try {
        let origin = window.location.origin;
        if (!origin) origin = window.location.protocol + '//' + window.location.host;
        let ak = '';
        try { if (window.ApiClient && typeof window.ApiClient.accessToken === 'function') { const t = window.ApiClient.accessToken(); if (t) ak = t; } } catch (e) {}
        let url = origin + '/emby/Items/' + id + '/Images/Primary?maxWidth=300&quality=90';
        if (ak) url += '&api_key=' + encodeURIComponent(ak);
        return url;
      } catch (e) { return ''; }
    }
    static loadAllEpImgs(thumbs, seriesId, wrap) {
      if (!thumbs || !thumbs.length) return;
      // 找到剧集 Series 主图做兜底(每部剧算一次)
      let fallback = '';
      try {
        const sitem = (CinemaBanner.items || []).find(function (x) { return String(x.Id) === String(seriesId); });
        if (sitem && sitem.ImageTags && sitem.ImageTags.Primary) {
          fallback = CinemaBanner.epImageUrl(sitem.Id).replace('maxWidth=300', 'maxWidth=400');
        }
      } catch (e) {}
      let i = 0;
      const TIMER = 70, FIRST = 8;
      function setOne(idx) {
        if (idx >= thumbs.length) return;
        const el = thumbs[idx];
        if (!el || !el.isConnected) return;
        const epId = el.getAttribute('data-ep');
        if (!epId) return;
        // vml-card 结构：用 .vml-card-img 背景图（与媒体库一致）
        const bgEl = el.querySelector('.vml-card-img');
        if (bgEl && bgEl.dataset.loading) return;  // 已调度过
        if (bgEl) {
          bgEl.dataset.loading = '1';
          const url = CinemaBanner.epImageUrl(epId);
          const probe = new Image();
          probe.onload = function () {
            bgEl.style.backgroundImage = 'url("' + url + '")';
            const blur = el.querySelector('.vml-card-blur');
            if (blur) blur.style.backgroundImage = 'url("' + url + '")';
            try { el.classList.add('ce-img-ok'); } catch (e) {}
          };
          probe.onerror = function () {
            if (fallback) {
              const f2 = fallback;
              const probe2 = new Image();
              probe2.onload = function () {
                bgEl.style.backgroundImage = 'url("' + f2 + '")';
                const blur = el.querySelector('.vml-card-blur');
                if (blur) blur.style.backgroundImage = 'url("' + f2 + '")';
                try { el.classList.add('ce-img-fb'); } catch (e) {}
              };
              probe2.onerror = function () {
                try { el.classList.add('ce-img-fb'); } catch (e) {}
              };
              probe2.src = f2;
            } else {
              try { el.classList.add('ce-img-fb'); } catch (e) {}
            }
          };
          probe.src = url;
        } else {
          // 兼容旧结构
          const img = el.querySelector('img.ce-ep-img');
          if (!img || img.dataset.loading) { if (img) return; }
          if (img) {
            img.dataset.loading = '1';
            img.src = CinemaBanner.epImageUrl(epId);
            img.onload = function () { try { el.classList.add('ce-img-ok'); } catch (e) {} };
            img.onerror = function () {
              if (fallback) {
                img.onerror = null;
                img.src = fallback;
                try { el.classList.add('ce-img-fb'); } catch (e) {}
              } else {
                try { img.style.display = 'none'; el.classList.add('ce-img-fb'); } catch (e) {}
              }
            };
          }
        }
        // 下一张(首屏先下8张后改成秒间隔)
        if (i < FIRST) { i++; setOne(idx + 1); }
        else { setTimeout(function () { i++; setOne(idx + 1); }, TIMER); }
      }
      setOne(0);
    }
    static revokeEpThumbs() {
      // 切剧/清理: 不需要主动清 src(切剧时 buildEpisodesUI track.innerHTML='' 会自然销毁旧 img)。
      // 保留为空操作以防旧引用; 不清 src 避免自动轮播切回时重新加载慢/闪。
      try {
        document.querySelectorAll('.vanvy-cinema .ce-ep-thumb img.ce-ep-img').forEach(function (im) {
          im.removeAttribute('data-loading');
        });
      } catch (e) {}
    }

  }

  window.VanvyCinema = CinemaBanner;
  // 自动启动: 检测到 Emby 页面特征即启动 (内部轮询处理时机)
  const isEmby = () => {
    // 宽松检测: 官方/开心版/自定义服务器名都适用
    const meta = document.querySelector('meta[name="application-name"]');
    if (meta && /emby/i.test(meta.getAttribute('content') || '')) return true;
    if (document.querySelector('.accent-emby')) return true;
    if (document.querySelector('.skinBody') || document.querySelector('.mainAnimatedPages')) return true;
    return false;
  };
  const tryStart = () => {
    if (window.ApiClient !== undefined && isEmby()) {
      CinemaBanner.start();
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const t = setInterval(() => {
        if (window.ApiClient !== undefined) { clearInterval(t); tryStart(); }
      }, 300);
      setTimeout(() => clearInterval(t), 20000);
    });
  } else {
    const t = setInterval(() => {
      if (window.ApiClient !== undefined) { clearInterval(t); tryStart(); }
    }, 300);
    setTimeout(() => clearInterval(t), 20000);
  }
})();
