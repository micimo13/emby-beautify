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
console.log('[VanvyCinema] v20 (20260822-2230) loaded, origin=' + location.origin);
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
      console.log('[VanvyCinema] 影院轮播启动 v20');

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

      // 统一清理: 移除轮播DOM + 释放 scroll 监听 + 定时刷新器
      const cleanupAll = () => {
        document.querySelectorAll('.vanvy-cinema').forEach(el => {
          if (el._vanvyScrollCleanup) { try { el._vanvyScrollCleanup(); } catch (e) {} }
          if (el._vanvyRefreshTimer) { try { clearInterval(el._vanvyRefreshTimer); } catch (e) {} }
          if (el.parentNode) el.parentNode.removeChild(el);
        });
        this.initStart = false;
        this.root = null;
        document.body.classList.remove('vanvy-carousel-active');
      };
      // 监听路由变化: 离开首页立即清理 (Emby.Page.show 用 history API, 需同时监听 popstate)
      const cleanupAway = () => {
        if (window.location.href.indexOf('!/home') === -1) {
          cleanupAll();
        }
      };
      window.addEventListener('hashchange', cleanupAway);
      window.addEventListener('popstate', cleanupAway);

      let lastUrl = window.location.href;

      // 轮询: 仅首页视图(!/home) + 容器就绪即挂载 (提前显示 loading)
      setInterval(() => {
        // URL 变化检测 (Emby.Page.show 用 history API, 不触发 hashchange/popstate)
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          if (window.location.href.indexOf('!/home') === -1) {
            cleanupAll();
          }
        }
        const onHome = window.location.href.indexOf('!/home') !== -1;
        if (onHome) {
          // 清理隐藏视图残留
          document.querySelectorAll('.hide .vanvy-cinema').forEach(el => {
            if (el._vanvyScrollCleanup) { try { el._vanvyScrollCleanup(); } catch (e) {} }
            el.remove();
          });
          // 轮播不在 DOM → 允许重新挂载 (离开首页回来后的关键!)
          if (!document.querySelector('.vanvy-cinema')) {
            this.initStart = false;
            document.body.classList.remove('vanvy-carousel-active');
          }
          // 首页容器出现 + 轮播不在 → 挂载
          if (!this.initStart &&
              document.querySelector('.view:not(.hide) .homeSectionsContainer, .view:not(.hide) .sections') &&
              !document.querySelector('.vanvy-cinema')) {
            this.initStart = true;
            this.init();
          }
        } else {
          // 离开首页 → 清理轮播残留
          cleanupAll();
        }
      }, 150);
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
    /* ── 图片 URL 直连构造 (不依赖桥接, 最稳; 类型: Backdrop/Thumb/Primary 等) ── */
    static getImageUrl(itemId, options) {
      // 直连 Emby Images 端点: /emby/Items/{id}/Images/{type}?maxWidth=&quality=&api_key=
      const type = (options && options.type) || 'Backdrop';
      const maxW = (options && options.maxWidth) || 1920;
      const q = (options && options.quality) || 90;
      let origin = window.location.origin;
      if (!origin) origin = window.location.protocol + '//' + window.location.host;
      let ak = '';
      try { if (window.ApiClient && typeof window.ApiClient.accessToken === 'function') { const t = window.ApiClient.accessToken(); if (t) ak = t; } } catch (e) {}
      let url = origin + '/emby/Items/' + encodeURIComponent(itemId) + '/Images/' + type + '?maxWidth=' + maxW + '&quality=' + q;
      if (ak) url += '&api_key=' + encodeURIComponent(ak);
      return Promise.resolve(url);
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
        // 1.1 Emby 4.9 大屏模式左侧 mainDrawer 默认展开(238px) → 轮播移出 view 的 stacking context, fixed 全屏盖住导航
        //     4.8 drawer 折叠宽0 → 自动跳过, 不影响
        try {
          const _drawer = document.querySelector('.mainDrawer');
          const _dw = _drawer ? _drawer.getBoundingClientRect().width : 0;
          if (_dw > 100) {
            // 占位: 保持首页内容流 (内容在轮播下方)
            const _spacer = document.createElement('div');
            _spacer.className = 'vanvy-cinema-spacer';
            _spacer.style.height = '100vh';
            _spacer.style.flex = '0 0 auto';
            container.insertBefore(_spacer, section);
            // 移到 body 脱离 view 的 stacking context, 才能盖过 mainDrawer(z999)
            document.body.appendChild(section);
            section.style.position = 'fixed';
            section.style.left = '0';
            section.style.top = '0';
            section.style.width = '100vw';
            section.style.height = '100vh';
            section.style.margin = '0';
            section.style.zIndex = '1001';
            // 滚动后让位: 内容滚上来时轮播隐藏, 回到顶部恢复 (4.9 滚动容器内部 scroller, 用轮询最稳)
            const _pollHide = setInterval(function () {
              try {
                const sc = document.querySelector('.view:not(.hide) .scrollFrameY') || document.querySelector('.scrollFrameY');
                const y = sc ? sc.scrollTop : 0;
                if (y > 50) { section.style.opacity = '0'; section.style.pointerEvents = 'none'; }
                else { section.style.opacity = '1'; section.style.pointerEvents = 'auto'; }
              } catch (e) {}
            }, 200);
            section._vanvyScrollCleanup = function () { clearInterval(_pollHide); };
            console.log('[VanvyCinema] 4.9 drawer ' + Math.round(_dw) + 'px → 轮播 fixed 全屏');
          }
        } catch (e) {}
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
        // 图源判定: 横向图优先, 竖图 Primary 也能进轮播(大屏模糊铺底/卡片cover裁切), 保证轮播不空
        const _hasBg = function(i){ return (i.ImageTags && (i.ImageTags.Backdrop || i.ImageTags.Thumb || i.ImageTags.Banner || i.ImageTags.Primary)) || ((i.BackdropImageTags || []).length) || (window._vanvyTmdbBd && window._vanvyTmdbBd[String(i.Id)]); };
        const _withBackdrop = _all.filter(function(i){return (i.ImageTags && i.ImageTags.Backdrop) || ((i.BackdropImageTags || []).length);});
        const _withTmdb = _all.filter(function(i){return _hasBg(i) && !((i.ImageTags && i.ImageTags.Backdrop) || ((i.BackdropImageTags || []).length));});
        // 池策略: 有图(Backdrop/其他图)优先; 若无图候选里有“最近入库”的新片(DateCreated 近 60 天), 也保留展示
        // (无图新片走 Primary/渐变占位兑底, 保证主人新入库的片能出现在轮播)
        const _recent = _all.filter(function(i){ return !_hasBg(i) && i.DateCreated && (Date.now() - Date.parse(i.DateCreated)) < 60 * 24 * 3600 * 1000; });
        const _poolBase = (_withBackdrop.length ? _withBackdrop : _withTmdb);
        const _pool = _poolBase.concat(_recent);
        // 去重 + 截断(最多 40 候选, 保证展示池有图为主)
        const _seen = new Map();
        const _poolDedup = [];
        _pool.forEach(function(i){ if (!_seen.has(i.Id)) { _seen.set(i.Id, 1); _poolDedup.push(i); } });
        const _base = _poolDedup.length ? _poolDedup : _all;
        // 时间×评分权衡排序(评分高优先, 但保持够新)
        // 注: getItems 返回的 items 通常不带 CommunityRating(定制版 API 丢 Fields), 用 fetch 补拉真实评分
        await CinemaBanner._augmentRatings(_base);
        // 电影/剧集分组各自按时间×评分排好, 再交替合并 → 轮播不偏科(电影剧集混排)
        const _movies = _base.filter(function (i) { return i.Type === 'Movie'; });
        const _series = _base.filter(function (i) { return i.Type === 'Series'; });
        const _rankMo = CinemaBanner.rankByTimeRating(_movies);
        const _rankSe = CinemaBanner.rankByTimeRating(_series);
        this.items = CinemaBanner.interleave(_rankMo, _rankSe, 8);
        console.log('[VanvyCinema] 拉取电影' + _groups.movies.length + '剧集' + _groups.series.length + ' -> 图源后电影' + _movies.length + '/剧集' + _series.length + ' -> 展示' + this.items.length);

        // 3. 渲染首屏轮播 + 独立媒体库卡片流
        await this.loadSlide(0, true);
        this.renderMediaLibrary();

        // 4. 就绪
        this.startAutoplay();
        this.bindEvents();
        this.hideLoading();
        document.body.classList.add('vanvy-carousel-active');
        window.dispatchEvent(new CustomEvent('vanvy:carousel-ready'));

        // 5. 定时刷新: 每 15 分钟重拉候选并刷新轮播(新入库片自动出现), 仅首页存在时有效
        if (section && !section._vanvyRefreshTimer) {
          section._vanvyRefreshTimer = setInterval(function () {
            if (window.location.href.indexOf('!/home') === -1) return;
            CinemaBanner.refreshData();
          }, 15 * 60 * 1000);
        }
      } catch (e) {
        console.warn('[VanvyCinema] 初始化失败', e);
        this.hideLoading();
      }
    }

    /* 重拉候选并刷新轮播(保留当前播放位置尽量不跳) */
    static async refreshData() {
      try {
        if (window.VanvyCinemaRefreshing) return;
        window.VanvyCinemaRefreshing = true;
        console.log('[VanvyCinema] 定时刷新候选...');
        const curIdx = this.currentIndex || 0;
        const groups = await this._fetchBannerCandidates().catch(function () { return { movies: [], series: [] }; });
        const all = [].concat(groups.movies || [], groups.series || []);
        if (!all.length) { window.VanvyCinemaRefreshing = false; return; }
        const hasBg = function(i){ return (i.ImageTags && (i.ImageTags.Backdrop || i.ImageTags.Thumb || i.ImageTags.Banner || i.ImageTags.Primary)) || ((i.BackdropImageTags || []).length) || (window._vanvyTmdbBd && window._vanvyTmdbBd[String(i.Id)]); };
        const withBackdrop = all.filter(function(i){return (i.ImageTags && i.ImageTags.Backdrop) || ((i.BackdropImageTags || []).length);});
        const withTmdb = all.filter(function(i){return hasBg(i) && !((i.ImageTags && i.ImageTags.Backdrop) || ((i.BackdropImageTags || []).length));});
        const recent = all.filter(function(i){ return !hasBg(i) && i.DateCreated && (Date.now() - Date.parse(i.DateCreated)) < 60 * 24 * 3600 * 1000; });
        const poolBase = (withBackdrop.length ? withBackdrop : withTmdb);
        const pool = poolBase.concat(recent);
        const seen = new Map(); const dedup = [];
        pool.forEach(function(i){ if (!seen.has(i.Id)) { seen.set(i.Id, 1); dedup.push(i); } });
        const base = dedup.length ? dedup : all;
        await this._augmentRatings(base);
        const movies = base.filter(function (i) { return i.Type === 'Movie'; });
        const series = base.filter(function (i) { return i.Type === 'Series'; });
        this.items = CinemaBanner.interleave(CinemaBanner.rankByTimeRating(movies), CinemaBanner.rankByTimeRating(series), 8);
        if (this.items.length) {
          // 尽量停在原位置, 越界则回 0
          const ni = this.currentIndex < this.items.length ? this.currentIndex : 0;
          await this.loadSlide(ni, true);
          this.renderMediaLibrary();
          console.log('[VanvyCinema] 刷新完成, 展示' + this.items.length + '部');
        }
      } catch (e) {
        console.warn('[VanvyCinema] 刷新失败', e);
      } finally {
        window.VanvyCinemaRefreshing = false;
      }
    }

    /* 确保 TMDB 高清宽幅映射已加载(最多等 1500ms, 实时API兜底后不再依赖映射表) */
    static _ensureTmdbReady() {
      return new Promise(function (resolve) {
        const t0 = Date.now();
        const check = function () {
          if (window._vanvyTmdbBd && Object.keys(window._vanvyTmdbBd).length) { resolve(); return; }
          if (Date.now() - t0 > 1500) { resolve(); return; }
          setTimeout(check, 200);
        };
        check();
      });
    }

    /* ── TMDB ID 提取: 优先 ProviderIds, 其次文件名/路径里的 tmdbid 标记(飞牛strm库常见) ── */
    static _tmdbIdOf(item) {
      if (!item) return '';
      try { if (item.ProviderIds && item.ProviderIds.Tmdb) return String(item.ProviderIds.Tmdb); } catch (e) {}
      const hay = String(item.Name || '') + ' ' + String(item.Path || '');
      let m = hay.match(/tmdbid[-=](\d+)/i) || hay.match(/\{tmdbid=(\d+)\}/i) || hay.match(/\[tmdb[:_\s-]*(\d+)\]/i);
      if (m) return m[1];
      return '';
    }

    /* ── 标题键: 清洗后标题 + 真实年份, 用于查服务器预生成的标题键映射 (strm库无tmdbid时靠它) ── */
    static _titleKeyOf(item) {
      if (!item) return '';
      const name = String(item.Name || '');
      let year = '';
      const ym = name.match(/\.(19[0-9]{2}|20[0-2][0-9])\./);
      if (ym) year = ym[1];
      let t = name
        .replace(/\s*[\[\{]\s*tmdbid[-=][\s\S]*$/i, '')
        .replace(/\.\d{4}\.\d+p.*$/i, '')
        .replace(/\.(1080p|720p|2160p|4k|h265|h264|x265|x264|webrip|bluray|web-dl|hdtv).*/i, '')
        .replace(/[._]+/g, ' ').trim();
      return 'T:' + t + '|' + year;
    }

    /* ── TMDB 高清宽幅兜底: 映射表(item.Id/tmdbid/标题键 三查) → localStorage 缓存 → 实时 TMDB API 搜索 ── */
    static async _tmdbLookup(item, maxWidth) {
      try {
        const tmdbId = this._tmdbIdOf(item);
        // ① 映射表: 先按标题键(服务器预生成, strm库最稳), 再按 tmdbid, 再按 item.Id 兼容旧部署
        if (window._vanvyTmdbBd) {
          const tkey = this._titleKeyOf(item);
          if (tkey && window._vanvyTmdbBd[tkey]) return this._tmdbSize(window._vanvyTmdbBd[tkey], maxWidth);
          if (tmdbId && window._vanvyTmdbBd[tmdbId]) return this._tmdbSize(window._vanvyTmdbBd[tmdbId], maxWidth);
          if (window._vanvyTmdbBd[String(item.Id)]) return this._tmdbSize(window._vanvyTmdbBd[String(item.Id)], maxWidth);
        }
        if (!tmdbId) return '';
        // ② localStorage 缓存 (避免每次刷新都调 API)
        const ck = 'vanvy_tmdb_bd_' + tmdbId;
        try { const cached = localStorage.getItem(ck); if (cached) return this._tmdbSize(cached, maxWidth); } catch (e) {}
        // ③ 实时 TMDB API: 标题+年份搜索, 取第一条 backdrop
        const title = String(item.Name || '')
          .replace(/\s*[\[\{]\s*tmdbid[-=][\s\S]*$/i, '')
          .replace(/\.\d{4}\.\d+p.*$/i, '')
          .replace(/\.(1080p|720p|2160p|4k|h265|h264|x265|x264).*/i, '')
          .replace(/[._]+/g, ' ').trim();
        const year = (item.ProductionYear || '').toString();
        const type = (item.Type === 'Series' || item.Type === 'Season') ? 'tv' : 'movie';
        const apiKey = '844e66732d07009c3c6c8e3f7565f571';
        const url = 'https://api.themoviedb.org/3/search/' + type + '?api_key=' + apiKey +
          '&query=' + encodeURIComponent(title) + '&language=zh-CN&page=1' + (year ? '&year=' + year : '');
        const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!resp.ok) return '';
        const d = await resp.json();
        if (!d.results || !d.results.length || !d.results[0].backdrop_path) return '';
        const u = 'https://image.tmdb.org/t/p/w1920' + d.results[0].backdrop_path;
        try { localStorage.setItem(ck, u); } catch (e) {}
        return this._tmdbSize(u, maxWidth);
      } catch (e) { return ''; }
    }

    static _tmdbSize(u, maxWidth) {
      if (!u) return '';
      if (maxWidth && maxWidth <= 640) {
        return u.replace(/\/w1920\//, '/w500/').replace(/\/w1280\//, '/w500/').replace(/\/original\//, '/w500/');
      }
      return u;
    }

    /* 由 banner 自己拉电影&剧集候选: 双池合并 = 发行最新30 + 最近入库20 (各类型), 保证新入库片子能进轮播
       返回 { movies:[], series:[] }, item 自带 CommunityRating(直接走 fetch 带 Fields). */
    static async _fetchBannerCandidates() {
      let ak = '', uid = '';
      try { if (window.ApiClient && typeof window.ApiClient.accessToken === 'function') ak = window.ApiClient.accessToken() || ''; } catch (e) {}
      try { if (window.ApiClient && typeof window.ApiClient.getCurrentUserId === 'function') uid = window.ApiClient.getCurrentUserId() || ''; } catch (e) {}
      let origin = window.location.origin;
      if (!origin) origin = window.location.protocol + '//' + window.location.host;
      const LIMIT = 30;  // 每类拉 30 (发行最新)
      const FRESH = 20;  // 每类再拉 20 最近入库
      const fields = 'ProductionYear,CommunityRating,Overview,Genres,MediaSources,BackdropImageTags,ProviderIds,Path,DateCreated';
      const base = origin + '/Users/' + uid + '/Items?EnableImageTypes=Backdrop,Thumb,Banner,Logo,Primary&Recursive=true&ImageTypeLimit=1&Limit=' + LIMIT +
        '&SortBy=ProductionYear,PremiereDate,SortName&SortOrder=Descending&Fields=' + fields + '&EnableTotalRecordCount=false&api_key=' + encodeURIComponent(ak);
      const freshBase = origin + '/Users/' + uid + '/Items?EnableImageTypes=Backdrop,Thumb,Banner,Logo,Primary&Recursive=true&ImageTypeLimit=1&Limit=' + FRESH +
        '&SortBy=DateCreated&SortOrder=Descending&Fields=' + fields + '&EnableTotalRecordCount=false&api_key=' + encodeURIComponent(ak);
      async function fetchType(includeType) {
        try {
          const [a, b] = await Promise.all([
            fetch(base + '&IncludeItemTypes=' + includeType, { credentials: 'same-origin' }),
            fetch(freshBase + '&IncludeItemTypes=' + includeType, { credentials: 'same-origin' })
          ]);
          const seen = new Map();
          const out = [];
          for (const resp of [a, b]) {
            if (!resp.ok) continue;
            const d = await resp.json();
            (d.Items || []).forEach(function (it) {
              if (!seen.has(it.Id)) { seen.set(it.Id, 1); out.push(it); }
            });
          }
          return out;
        } catch (e) { return []; }
      }
      const [movies, series] = await Promise.all([fetchType('Movie'), fetchType('Series')]);
      return { movies: movies, series: series };
    }

    /* 时间 × 评分 加权排序(轮播选片用).
       入参: 候选数组(可能来自策展规则的随机池).
       时间分: 基于真实首映日期 PremiereDate/ProductionYear(越新越高); 最近入库(DateCreated 60天内)额外 +0.15 提升新片曝光.
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
        // 最近入库加成: 60 天内入库的新片时间分 +0.15 (保证新入库能露脸)
        let freshBoost = 0;
        if (it.DateCreated) { const dc = Date.parse(it.DateCreated); if (!isNaN(dc) && (Date.now() - dc) < 60 * 24 * 3600 * 1000) freshBoost = 0.15; }
        const rt = (typeof it.CommunityRating === 'number' && it.CommunityRating > 0) ? it.CommunityRating : null;
        const rateScore = rt != null ? Math.min(rt / 10, 1) : 0.5;
        const weighted = 0.5 * Math.min(timeScore + freshBoost, 1) + 0.5 * rateScore;
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
          const url = origin + '/Users/' + uid + '/Items?Ids=' + encodeURIComponent(chunk.join(',')) +
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
          const frag = document.createDocumentFragment();
          items.forEach(v => {
            const card = document.createElement('div');
            card.className = 'vml-card';
            card.innerHTML =
              '<div class="vml-card-blur"></div><div class="vml-card-img"><div class="vml-card-shine"></div></div>' +
              '<div class="vml-card-meta"><span class="vml-card-name"></span><span class="vml-card-type"></span></div>';
            card.querySelector('.vml-card-name').textContent = v.Name || '';
            card.querySelector('.vml-card-type').textContent = (v.CollectionType || 'folder').toUpperCase();
            card.addEventListener('click', () => {
              // Emby 官方 getRouteUrl 路由映射 (参考 modules/approuter.js)
              const ct = v.CollectionType || '';
              const serverId = (window.ApiClient && window.ApiClient.serverId) ? window.ApiClient.serverId() : 'ae50a1a9e2374a0a8d03596566460c0f';
              let url;
              if (ct === 'movies' || ct === 'homevideos' || ct === 'musicvideos' || ct === '') {
                url = '/videos?serverId=' + serverId + '&parentId=' + v.Id;
              } else if (ct === 'tvshows') {
                url = '/tv?serverId=' + serverId + '&parentId=' + v.Id;
              } else if (ct === 'music' || ct === 'audiobooks') {
                url = '/music?serverId=' + serverId + '&parentId=' + v.Id;
              } else if (ct === 'games') {
                url = '/games?serverId=' + serverId + '&parentId=' + v.Id;
              } else if (ct === 'books') {
                url = '/books?serverId=' + serverId + '&parentId=' + v.Id;
              } else if (ct === 'boxsets' || ct === 'playlists') {
                url = '/list/list.html?parentId=' + v.Id + '&serverId=' + serverId + '&context=' + ct;
              } else {
                url = '/list/list.html?parentId=' + v.Id + '&serverId=' + serverId;
              }
              // 优先用 Emby 官方路由 (AppRouter 挂 globalThis.Emby.Page)
              if (window.Emby && window.Emby.Page && window.Emby.Page.show) {
                window.Emby.Page.show(url);
              } else {
                window.location.hash = '!/' + url.replace(/^\//, '');
              }
            });
            frag.appendChild(card);
            card.setAttribute('data-id', v.Id);
            // GPT方案: 优先用该媒体库代表性影片宽幅剧照(Backdrop)做高级封面, 替代默认库图标
            // 注意: 绝不能回退到媒体库Primary(CollectionFolder的artwork图带"动漫电影"白字)! 只显示影片剧照(无字)或纯黑渐变.
            CinemaBanner._getViewHeroImage(v.Id, v).then(function (heroUrl) {
              if (heroUrl) {
                card.querySelector('.vml-card-img').style.backgroundImage = 'url("' + heroUrl + '")';
                card.querySelector('.vml-card-blur').style.backgroundImage = 'url("' + heroUrl + '")';
              } else {
                // 无影片剧照 -> 纯黑渐变底(不显示带白字的媒体库artwork)
                card.querySelector('.vml-card-img').style.backgroundImage = 'none';
                card.querySelector('.vml-card-img').style.background = 'linear-gradient(160deg, #0b0b0d, #1c1c20)';
                card.querySelector('.vml-card-blur').style.backgroundImage = 'none';
              }
              return null;
            }).then(function (u) {
              if (!u) return;
              // (不再使用媒体库Primary回退)
            }).catch(function () {
              // 异常兜底: 纯黑渐变
              try {
                card.querySelector('.vml-card-img').style.backgroundImage = 'none';
                card.querySelector('.vml-card-img').style.background = 'linear-gradient(160deg, #0b0b0d, #1c1c20)';
              } catch (e) {}
            });
          });
          track.appendChild(frag);
          requestAnimationFrame(() => {
            track.querySelectorAll('.vml-card').forEach((c, i) => {
              setTimeout(() => c.classList.add('vml-in'), i * 35);
            });
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
          // 加 EnableImageTypes+Fields 让媒体库自身图片 tag 可用 (Backdrop/Thumb/Primary)
          const apiUrl = base + '/Users/' + uid + '/Views?EnableImageTypes=Backdrop,Thumb,Primary&ImageTypeLimit=1&Fields=BackdropImageTags,PrimaryImageTag&api_key=' +
            (window.ApiClient ? window.ApiClient.accessToken() : '');
          fetch(apiUrl).then(r => r.json()).then(resolve).catch(() => resolve(null));
        } catch (e) { resolve(null); }
      });
    }

    /* 获取媒体库代表性影片宽幅剧照(Backdrop), 替代默认图标(GPT方案 2026-08-17)
       返回 Promise<url|null>: 取库内按评分排序的 Movie/Series, 优先有 Backdrop 的影片,
       用它作卡片高级封面。失败/无图返回 null(调用方回退库Primary或渐变)。 */
    static _getViewHeroImage(viewId, viewItem) {
      return new Promise((resolve) => {
        try {
          // ── 媒体库自身图片绝对优先 (主人要求: 用用户给媒体库设置的图) ──
          if (viewItem) {
            const tags = viewItem.ImageTags || {};
            const bdtags = viewItem.BackdropImageTags || [];
            // ① 媒体库自身横向背景图 (Backdrop 可能存 BackdropImageTags 数组)
            if (bdtags.length) {
              resolve(this.getImageUrl(viewItem.Id, { type: 'Backdrop', maxWidth: 1200 }));
              return;
            }
            if (tags.Backdrop) {
              resolve(this.getImageUrl(viewItem.Id, { type: 'Backdrop', maxWidth: 1200 }));
              return;
            }
            // ② 媒体库自身横向缩略图
            if (tags.Thumb) {
              resolve(this.getImageUrl(viewItem.Id, { type: 'Thumb', maxWidth: 1200 }));
              return;
            }
            // ③ 媒体库自身 Primary (用户设置的库图标/背景, 竖图也直接用)
            if (tags.Primary) {
              resolve(this.getImageUrl(viewItem.Id, { type: 'Primary', maxWidth: 800 }));
              return;
            }
          }
          // ── 媒体库自身没图 → 才去库里找影片剧照兜底 ──
          const uid = window.ApiClient ? window.ApiClient.getCurrentUserId() : '';
          const tok = window.ApiClient ? window.ApiClient.accessToken() : '';
          const base = window.location.origin;
          if (!uid || !tok) { resolve(null); return; }
          const url = base + '/Users/' + uid + '/Items?ParentId=' + encodeURIComponent(viewId) +
            '&IncludeItemTypes=Movie,Series&Recursive=true&SortBy=CommunityRating,PremiereDate' +
            '&SortOrder=Descending&Limit=8&Fields=BackdropImageTags,PrimaryImageTag&EnableImageTypes=Backdrop,Thumb,Primary' +
            '&ImageTypeLimit=1&api_key=' + encodeURIComponent(tok);
          fetch(url).then(r => r.json()).then((data) => {
            const items = (data && data.Items) ? data.Items : [];
            // 优先有 Backdrop 的 (含 BackdropImageTags 数组)
            let hero = items.find(function (x) { return (x.ImageTags && x.ImageTags.Backdrop) || ((x.BackdropImageTags || []).length); });
            if (!hero) hero = items.find(function (x) { return x.ImageTags && x.ImageTags.Thumb; });
            if (!hero) hero = items[0];
            if (!hero) { resolve(null); return; }
            const htags = hero.ImageTags || {};
            if (htags.Backdrop || (hero.BackdropImageTags || []).length) {
              resolve(this.getImageUrl(hero.Id, { type: 'Backdrop', maxWidth: 1200 }));
            } else if (htags.Thumb) {
              resolve(this.getImageUrl(hero.Id, { type: 'Thumb', maxWidth: 1200 }));
            } else if (htags.Primary) {
              resolve(this.getImageUrl(hero.Id, { type: 'Primary', maxWidth: 600 }));
            } else {
              resolve(null);
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
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        el.scrollLeft += e.deltaY;
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

      // 宽幅背景: 横向图优先 (Backdrop/fanart → Thumb/landscape → Banner → TMDB宽幅), 最次 Primary 竖图模糊铺底
      try {
        let bgUrl = "";

        // 1) Emby Backdrop (fanart/backdrop.jpg 横向, 首选; 注意 Emby 把 Backdrop 存 BackdropImageTags 数组, ImageTags.Backdrop 常为空!)
        if ((item.ImageTags && item.ImageTags.Backdrop) || (item.BackdropImageTags && item.BackdropImageTags.length)) {
          try { bgUrl = await this.getImageUrl(item.Id, this.backdropOptions); } catch (e) { bgUrl = ""; }
        }

        // 2) Emby Thumb (landscape.jpg 横向缩略图)
        if (!bgUrl && item.ImageTags && item.ImageTags.Thumb) {
          try { bgUrl = await this.getImageUrl(item.Id, { type: 'Thumb', maxWidth: 1920, quality: 90 }); } catch (e) { bgUrl = ""; }
        }

        // 2.5) Emby Banner (横向横幅, 部分元数据有)
        if (!bgUrl && item.ImageTags && item.ImageTags.Banner) {
          try { bgUrl = await this.getImageUrl(item.Id, { type: 'Banner', maxWidth: 1920, quality: 90 }); } catch (e) { bgUrl = ""; }
        }

        // 3) TMDB 高清宽幅(映射表 + 实时API 兜底, 横图)
        if (!bgUrl) {
          try { bgUrl = (await this._tmdbLookup(item, 1920)) || ""; } catch (e) { bgUrl = ""; }
        }

        if (bgUrl) {
          bg.style.backgroundImage = 'url("' + bgUrl + '")';
          bg.style.backgroundSize = 'cover';
          bg.style.backgroundPosition = 'center';
          bg.style.filter = '';
          bg.style.transform = '';   // 清掉上一张 Primary 兑底的 scale 残留
        } else {
          // 4) 无横向图(Backdrop/Thumb/TMDB都没有): Primary 竖图模糊铺底 — 保证有图, 竖形状柔化成色彩氛围
          if (item.ImageTags && item.ImageTags.Primary) {
            try {
              const pu = await this.getImageUrl(item.Id, { type: 'Primary', maxWidth: 600, quality: 85 });
              if (pu) {
                bg.style.backgroundImage = 'url("' + pu + '")';
                bg.style.backgroundSize = 'cover';
                bg.style.backgroundPosition = 'center';
                bg.style.filter = 'blur(42px) brightness(1.05) saturate(1.1)';
                bg.style.transform = 'scale(1.25)';
              } else {
                bg.style.backgroundImage = 'none';
                bg.style.background = 'linear-gradient(160deg, #0b0b0d 0%, #14141a 45%, #1c1c24 100%)';
              }
            } catch (e2) {
              bg.style.backgroundImage = 'none';
              bg.style.background = 'linear-gradient(160deg, #0b0b0d 0%, #14141a 45%, #1c1c24 100%)';
            }
          } else {
            bg.style.backgroundImage = 'none';
            bg.style.background = 'linear-gradient(160deg, #0b0b0d 0%, #14141a 45%, #1c1c24 100%)';
          }
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
    static async resolveBannerUrl(item, maxWidth) {
      if (!item) return Promise.resolve('');
      // ① Emby Backdrop (横向; 注意 Emby 把 Backdrop 存 BackdropImageTags 数组, ImageTags.Backdrop 常为空!)
      if ((item.ImageTags && item.ImageTags.Backdrop) || (item.BackdropImageTags && item.BackdropImageTags.length)) {
        return Promise.resolve(this.getImageUrl(item.Id, { type: 'Backdrop', maxWidth: maxWidth, adjustForPixelRatio: false })).catch(function () { return ''; });
      }
      // ② Emby Thumb 横向缩略图 (landscape.jpg, strm库常见)
      if (item.ImageTags && item.ImageTags.Thumb) {
        return Promise.resolve(this.getImageUrl(item.Id, { type: 'Thumb', maxWidth: maxWidth, adjustForPixelRatio: false })).catch(function () { return ''; });
      }
      // ②.5 Emby Banner 横向横幅
      if (item.ImageTags && item.ImageTags.Banner) {
        return Promise.resolve(this.getImageUrl(item.Id, { type: 'Banner', maxWidth: maxWidth, adjustForPixelRatio: false })).catch(function () { return ''; });
      }
      // ③ TMDB 图(映射表 + 实时API, 横向)
      if (item) {
        try {
          const tmdbUrl = await this._tmdbLookup(item, maxWidth);
          if (tmdbUrl) return Promise.resolve(tmdbUrl);
        } catch (e) {}
      }
      // ④ Primary 竖海报(最后兜底, 保证有图 — 卡片小图 cover 裁中间也能看清主体)
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
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        inner.scrollLeft += e.deltaY;
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
      const wrap = root.querySelector('.cinema-episodes');
      const lib = root.querySelector('.vanvy-cinema-library');
      if (!wrap) return;
      if (!item || item.Type !== 'Series') {
        // 切回电影: 释放上一剧的剧集缩略图 blob 资源; 季集面板隐藏, 媒体库恢复显示
        CinemaBanner.revokeEpThumbs();
        wrap.style.display = 'none';
        if (lib) lib.style.display = '';
        if (root.classList) root.classList.remove('ce-showing');
        this.setNativeHidden(false);
        return;
      }
      // 电视剧: 隐藏媒体库容器, 用季集面板替换它
      if (lib) lib.style.display = 'none';
      const sid = item.Id;
      if (this._lastEpSid && this._lastEpSid !== sid) {
        // 切换到另一部剧: 释放上一部剧的缩略图 blob
        CinemaBanner.revokeEpThumbs();
      }
      this._lastEpSid = sid;
      if (!this._epCache[sid]) {
        wrap.style.display = 'none';
        this._epCache[sid] = this.loadEpisodes(sid);
      }
      const p = this._epCache[sid];
      const self = this;
      if (p && p.then) {
        p.then(function (epsMap) {
          if (!root.isConnected) return;
          const seasons = epsMap.seasons || [];
          if (!seasons.length) { wrap.style.display = 'none'; if (lib) lib.style.display = ''; return; }
          self.buildEpisodesUI(sid, epsMap, seasons[0], wrap);
          wrap.style.display = 'block';
          if (root.classList) root.classList.add('ce-showing');
          self.setNativeHidden(true, CinemaBanner._hideGen);
        }).catch(function () { wrap.style.display = 'none'; if (lib) lib.style.display = ''; });
      } else if (p) {
        const seasons = p.seasons || [];
        if (seasons.length) { self.buildEpisodesUI(sid, p, seasons[0], wrap); wrap.style.display = 'block'; }
        else { wrap.style.display = 'none'; if (lib) lib.style.display = ''; }
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

    static buildEpisodesUI(seriesId, epsMap, activeSeason, wrap) {
      const self = this;
      const root = this.root;
      if (!root) return;
      // 季 tab
      const seasEl = wrap.querySelector('.ce-seasons');
      seasEl.innerHTML = '';
      (epsMap.seasons || []).forEach(function (sn) {
        const b = document.createElement('button');
        b.className = 'ce-season-tab' + (sn === activeSeason ? ' on' : '');
        b.textContent = '第' + sn + '季';
        b.dataset.s = sn;
        b.onclick = function () { self.buildEpisodesUI(seriesId, epsMap, sn, wrap); };
        seasEl.appendChild(b);
      });
      // 单集横排
      const track = wrap.querySelector('.ce-track');
      track.innerHTML = '';
      const eps = (epsMap.eps && epsMap.eps[activeSeason]) || [];
      if (!eps.length) { track.innerHTML = '<div class="ce-empty">暂无剧集</div>'; return; }
      var epsArr = eps.slice(0, 40);   // 上限40集防超重
      epsArr.forEach(function (ep, i) {
        const c = document.createElement('div');
        c.className = 'ce-ep';
        const num = 'S' + String(activeSeason).padStart(2, '0') + 'E' + String(ep.IndexNumber || (i + 1)).padStart(2, '0');
        // 无条件尝试加载缩略图(不再依赖 ImageTags.Primary 判断, 修复部分环境返回空导致全黑)
        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'ce-ep-thumb';
        // 用 <img> native 加载缩略图(不用 fetch+Blob+backgroundImage, 更稳更易诊断, ChatGPT建议), onerror 兜底剧集海报
        thumbDiv.innerHTML = '<img class="ce-ep-img" alt="" loading="lazy" decoding="async">' +
          '<span class="ce-ep-num">' + num + '</span>';
        thumbDiv.setAttribute('data-ep', ep.Id);
        thumbDiv.setAttribute('data-series', seriesId || '');
        c.appendChild(thumbDiv);
        const t = document.createElement('div'); t.className = 'ce-ep-title'; t.textContent = (ep.Name || num);
        c.appendChild(t);
        c.title = num + ' ' + (ep.Name || '');
        c.dataset.i = ep.Id;
        c.onclick = function () { self.playItem(ep); };
        track.appendChild(c);
      });
      // ── 剧集缩略图: <img> native 加载 + 批量调度 ──
      // 不再用 fetch+Blob+backgroundImage(GC/时序/兼容坑多), 改用 <img src=EmbyURL> 浏览器原生加载, onerror 兜底剧集海报
      const allThumbs = track.querySelectorAll('.ce-ep-thumb[data-ep]');
      CinemaBanner.loadAllEpImgs(allThumbs, seriesId, wrap);
    }

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
        const img = el.querySelector('img.ce-ep-img');
        if (!img) return;
        if (img.dataset.loading) return;  // 已调度过
        img.dataset.loading = '1';
        img.src = CinemaBanner.epImageUrl(epId);
        img.onload = function () { try { el.classList.add('ce-img-ok'); } catch (e) {} };
        img.onerror = function () {
          // Primary 无图 → 用 Series 海报兜底; Series 也没图 → 隐藏 img 露出编号+▶占位(干净不破图)
          if (fallback) {
            img.onerror = null;
            img.src = fallback;
            try { el.classList.add('ce-img-fb'); } catch (e) {}
          } else {
            try {
              img.style.display = 'none';
              el.classList.add('ce-img-fb');
            } catch (e) {}
          }
        };
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
