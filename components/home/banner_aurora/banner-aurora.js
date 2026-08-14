/**
 * =============================================================================
 *  Vanvy Emby Kit · AURORA 极光沉浸式轮播 (banner_aurora)
 *  ---------------------------------------------------------------------------
 *  原创设计: 动态极光光晕 + 左侧信息层级 + 右侧封面流缩略图联动
 *  + 毛玻璃半透明面板 (backdrop-filter 强化)
 *
 *  颜色主题: CSS 变量驱动, 根容器 class 切换 (theme-*)
 *    默认 aurora(蓝紫极光) / emerald(青绿) / sakura(粉紫) / gold(暖金) / ocean(深海) / midnight(黑金)
 *  数据层: 复用 Emby ApiClient (getItems/getImageUrl)
 *  响应式: 桌面全功能 / 平板缩略图减量 / 手机隐藏缩略图+精简信息
 *  兼容: Emby 4.8/4.9, 挂载 homeSectionsContainer 首位 (与现有轮播互斥)
 * =============================================================================
 */
(function () {
  'use strict';
  if (window.VanvyAurora) return;

  class CommonUtils {
    static sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    static loadExtastyle(content, id) {
      if (document.getElementById(id)) return;
      const style = document.createElement('style');
      style.type = 'text/css';
      style.id = id;
      style.innerHTML = content;
      document.head.appendChild(style);
    }
  }

  class AuroraBanner {
    static start() {
      if (window.VanvyAuroraStarted) return;
      window.VanvyAuroraStarted = true;
      console.log('[VanvyAurora] 极光轮播启动');

      // 主题: 从 html/body class 读取 (安装时注入), 默认 aurora
      this.theme = 'aurora';
      try {
        const m = document.body.className.match(/vanvy-aurora-theme-([a-z]+)/) ||
                 document.documentElement.className.match(/vanvy-aurora-theme-([a-z]+)/);
        if (m) this.theme = m[1];
      } catch (e) { /* ignore */ }

      this.itemQuery = {
        ImageTypes: 'Backdrop',
        EnableImageTypes: 'Logo,Backdrop',
        IncludeItemTypes: 'Movie,Series',
        SortBy: 'ProductionYear, PremiereDate, SortName',
        Recursive: true,
        ImageTypeLimit: 1,
        Limit: 10,
        Fields: 'ProductionYear,Overview,CommunityRating',
        SortOrder: 'Descending',
        EnableUserData: false,
        EnableTotalRecordCount: false
      };
      this.coverOptions = { type: 'Backdrop', maxWidth: 1920, adjustForPixelRatio: false };
      this.logoOptions = { type: 'Logo', maxWidth: 500, adjustForPixelRatio: false };
      this.thumbOptions = { type: 'Backdrop', maxWidth: 640, adjustForPixelRatio: false };
      this.currentIndex = 0;
      this.items = [];
      this.timer = null;
      this.AUTOPLAY_MS = 8000;
      this.initStart = false;
      this.root = null;

      // 监听路由变化: 离开首页立即清理 (Emby.Page.show 用 history API, 需同时监听 popstate)
      const cleanupAway = () => {
        if (window.location.href.indexOf('!/home') === -1) {
          document.querySelectorAll('.vanvy-aurora').forEach(el => {
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

      // 轮询: 仅首页视图(!/home) + 容器就绪即挂载
      // 关键: 离开首页(进媒体库/详情)时 Emby 销毁视图, 轮播 DOM 被移除
      //      回到首页后检测到轮播不在 DOM → 重置 initStart 重新挂载 (参考 crx 交互)
      setInterval(() => {
        // URL 变化检测 (Emby.Page.show 用 history API, 不触发 hashchange/popstate)
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          if (window.location.href.indexOf('!/home') === -1) {
            document.querySelectorAll('.vanvy-aurora').forEach(el => {
              if (el.parentNode) el.parentNode.removeChild(el);
            });
            this.initStart = false;
            this.root = null;
            document.body.classList.remove('vanvy-carousel-active');
          }
        }
        const onHome = window.location.href.indexOf('!/home') !== -1;
        const banner = document.querySelector('.view:not(.hide) .vanvy-aurora');
        if (onHome) {
          // 清理隐藏视图残留
          document.querySelectorAll('.hide .vanvy-aurora').forEach(el => el.remove());
          // 轮播不在 DOM → 允许重新挂载 (离开首页回来后的关键!)
          if (!banner) {
            this.initStart = false;
            document.body.classList.remove('vanvy-carousel-active');
          }
          // 首页容器出现 + 轮播不在 → 挂载
          if (!this.initStart &&
              document.querySelector('.view:not(.hide) .homeSectionsContainer, .view:not(.hide) .sections') &&
              !document.querySelector('.view:not(.hide) .vanvy-aurora')) {
            this.initStart = true;
            this.init();
          }
        } else {
          // 离开首页 → 清理轮播残留 + 取消顶栏透明
          document.querySelectorAll('.vanvy-aurora').forEach(el => {
            if (el.parentNode) el.parentNode.removeChild(el);
          });
          this.initStart = false;
          this.root = null;
          document.body.classList.remove('vanvy-carousel-active');
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
            console.log('[VanvyAurora] 已应用策展规则');
          }
        }
      } catch (e) { console.warn('[VanvyAurora] 策展规则失败, 用默认', e); }
    }

    /* ── Emby API 调用 (复用 VanvyKit 桥, 否则自包含) ── */
    static injectCall(func, arg) {
      if (window.VanvyKit && typeof window.VanvyKit.injectCall === 'function') {
        return window.VanvyKit.injectCall(func, arg);
      }
      return new Promise((resolve) => {
        const hash = 'va' + Math.random().toString(36).slice(2, 10);
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
        section.className = 'vanvy-aurora vanvy-aurora-theme-' + this.theme;
        section.innerHTML = this.buildHTML();
        this.root = section;
        container.insertBefore(section, container.firstChild);
        this.showLoading();

        // 2. 并行: 轮播数据预取 (不再依赖/触碰原 section0)
        const data = await this.loadData().catch(() => null);

        if (!data || !data.Items || !data.Items.length) {
          this.hideLoading();
          console.warn('[VanvyAurora] 无数据');
          return;
        }
        this.items = data.Items.slice(0, 12);

        // 3. 渲染首屏轮播 + 独立媒体库卡片流
        await this.loadSlide(0, true);
        this.renderMediaLibrary();

        // 4. 就绪: 轮播交互 + 淡出 loading + 顶栏透明
        this.startAutoplay();
        this.bindEvents();
        this.hideLoading();
        document.body.classList.add('vanvy-carousel-active');
        window.dispatchEvent(new CustomEvent('vanvy:carousel-ready'));
      } catch (e) {
        console.warn('[VanvyAurora] 初始化失败', e);
        this.hideLoading();
      }
    }

    /* 预取轮播数据 */
    static async loadData() {
      await this.applyCarouselRules();
      const data = await this.getItems(this.itemQuery);
      if (window.VanvyCarouselRules && window.VanvyCarouselRules.loaded && data && data.Items) {
        data.Items = window.VanvyCarouselRules.applyPin(data.Items);
      }
      return data;
    }

    /* 生成轮播结构 (含专属 loading + 主舞台 + 媒体库容器) */
    /* 生成全屏加载动画 HTML (独立挂 body, 不残留轮播容器) */
    static buildLoadingHTML() {
      return `        <div class="vanvy-loading">
          <div class="vl-bg"></div>
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
            <div class="vl-brand">VANVY AURORA</div>
          </div>
        </div>

`;
    }

    /* 生成轮播结构 (不含 loading, loading 独立挂 body) */
    static buildHTML() {
      return `
        <div class="aurora-stage">
          <div class="aurora-bg"></div>
          <div class="aurora-glow"></div>
          <div class="aurora-glow aurora-glow-2"></div>
          <div class="aurora-vignette"></div>

          <div class="aurora-main">
            <div class="aurora-info">
              <img class="aurora-logo" alt="logo" style="display:none">
              <div class="aurora-logo-fallback" style="display:none"></div>
              <div class="aurora-meta">
                <span class="aurora-rating"></span>
                <span class="aurora-tag aurora-year"></span>
                <span class="aurora-tag aurora-genre"></span>
                <span class="aurora-tag aurora-quality"></span>
              </div>
              <div class="aurora-title"></div>
              <div class="aurora-desc"></div>
              <div class="aurora-btns">
                <button class="aurora-btn aurora-btn-play">▶ 立即播放</button>
                <button class="aurora-btn aurora-btn-info">ⓘ 详情</button>
              </div>
            </div>
            <div class="aurora-side"></div>
          </div>

          <div class="aurora-progress"><i></i></div>
          <div class="aurora-nav">
            <button class="aurora-nav-btn aurora-prev">‹</button>
            <button class="aurora-nav-btn aurora-next">›</button>
          </div>
        </div>

        <div class="vanvy-aurora-library"></div>`;
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

    /* 渲染单张轮播 */
    static async loadSlide(idx, immediate) {
      const item = this.items[idx];
      if (!item) return;
      this.currentIndex = idx;
      const root = this.root;
      if (!root) return;
      const bg = root.querySelector('.aurora-bg');
      const logoEl = root.querySelector('.aurora-logo');
      const logoFallback = root.querySelector('.aurora-logo-fallback');
      const titleEl = root.querySelector('.aurora-title');
      const descEl = root.querySelector('.aurora-desc');
      const ratingEl = root.querySelector('.aurora-rating');
      const yearEl = root.querySelector('.aurora-year');
      const genreEl = root.querySelector('.aurora-genre');
      const qualityEl = root.querySelector('.aurora-quality');
      const playBtn = root.querySelector('.aurora-btn-play');
      const infoBtn = root.querySelector('.aurora-btn-info');

      // 背景
      try {
        const bgUrl = await this.getImageUrl(item.Id, this.coverOptions);
        bg.style.backgroundImage = `url("${bgUrl}")`;
      } catch (e) { bg.style.background = 'linear-gradient(160deg,#0b1230,#1a1440)'; }

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
      // 标题 = 简介 (与 Logo 徽标不重复, 更生动); 简介空时回退片名
      let overview = item.Overview || '';
      if (!overview) overview = item.Name || '';
      titleEl.textContent = overview.length > 100 ? overview.slice(0, 100) + '…' : overview;
      descEl.textContent = '';
      const year = item.ProductionYear || (item.PremiereDate || '').slice(0, 4);
      yearEl.textContent = year || '';
      yearEl.style.display = yearEl.textContent ? '' : 'none';
      let rating = '';
      if (item.CommunityRating) {
        rating = item.CommunityRating.toFixed(1);
      } else if (item.VoteAverage) {
        rating = Number(item.VoteAverage).toFixed(1);
      }
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

      await this.renderSide(idx);
      this.updateProgress();
    }


    /* 媒体库: 渲染真实媒体库分类卡片 (非影片列表, 避免与右侧缩略图冲突) */
    static renderMediaLibrary() {
      const lib = this.root.querySelector('.vanvy-aurora-library');
      if (!lib) return;
      lib.classList.add('vml-ready');
      lib.innerHTML =
        '<div class="vml-header">' +
          '<span class="vml-title">📚 媒体库</span>' +
          '<span class="vml-hint">滚轮 / 拖拽浏览</span>' +
        '</div>' +
        '<div class="vml-scroll-wrap">' +
          '<button class="vml-scroll-btn vml-scroll-left" title="向左滚动">‹</button>' +
          '<div class="vml-track"></div>' +
          '<button class="vml-scroll-btn vml-scroll-right" title="向右滚动">›</button>' +
        '</div>';
      const track = lib.querySelector('.vml-track');
      // 异步获取媒体库分类 (Views)
      this.getViews()
        .then(views => {
          const items = (views && views.Items) ? views.Items : [];
          if (!items.length) { lib.style.display = 'none'; return; }
          const frag = document.createDocumentFragment();
          items.forEach(v => {
            const card = document.createElement('div');
            card.className = 'vml-card';
            card.innerHTML =
              '<div class="vml-card-img"><div class="vml-card-shine"></div></div>' +
              '<div class="vml-card-meta"><span class="vml-card-name"></span><span class="vml-card-type"></span></div>' +
              '<span class="vml-enter-hint">进入媒体库 ↗</span>';
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
            if (v.ImageTags && v.ImageTags.Primary) {
              this.getImageUrl(v.Id, { type: 'Primary', maxWidth: 640, adjustForPixelRatio: false })
                .then(u => { card.querySelector('.vml-card-img').style.backgroundImage = `url("${u}")`; })
                .catch(() => {});
            } else {
              card.querySelector('.vml-card-img').style.background =
                'linear-gradient(160deg, var(--vanvy-bg-1), var(--vanvy-bg-3))';
            }
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
      // 左右滚动按钮
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
      // 可滚动时显示按钮
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
          const apiUrl = base + '/Users/' + uid + '/Views?api_key=' +
            (window.ApiClient ? window.ApiClient.accessToken() : '');
          fetch(apiUrl).then(r => r.json()).then(resolve).catch(() => resolve(null));
        } catch (e) { resolve(null); }
      });
    }

    /* 拖拽/滚轮横向滚动 (pc: 拖拽 + shift滚轮; 触屏: 原生滚动) */
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
      // 滚轮横向滚动
      el.addEventListener('wheel', e => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }, { passive: false });
    }

    /* 缩略图区: 全部渲染 + 可上下滚动 (垂直拖拽) */
    static async renderSide(activeIdx) {
      const root = this.root;
      const side = root.querySelector('.aurora-side');
      if (!side) return;
      const thumbs = this.items;
      let html = '';
      for (let i = 0; i < thumbs.length; i++) {
        const it = thumbs[i];
        let thumbUrl = '';
        try { thumbUrl = await this.getImageUrl(it.Id, this.thumbOptions); } catch (e) { /* ignore */ }
        html += `<div class="aurora-side-card${i === activeIdx ? ' active' : ''}" data-idx="${i}" title="${(it.Name || '').replace(/"/g, '&quot;')}">
          <div class="aurora-thumb" style="background-image:url('${thumbUrl}')"></div>
          <div class="aurora-thumb-title">${(it.Name || '').slice(0, 12)}</div>
        </div>`;
      }
      side.innerHTML = html;
      side.classList.add('aurora-side-scroll');
      side.querySelectorAll('.aurora-side-card').forEach(card => {
        card.addEventListener('click', () => {
          this.stopAutoplay();
          this.loadSlide(parseInt(card.dataset.idx, 10));
          this.startAutoplay();
        });
      });
      // 垂直拖拽滚动
      let isDown = false, startY, scrollTop;
      side.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') { isDown = true; startY = e.pageY; scrollTop = side.scrollTop; side.style.cursor = 'grabbing'; }
      });
      side.addEventListener('pointerleave', () => { isDown = false; side.style.cursor = ''; });
      side.addEventListener('pointerup', () => { isDown = false; side.style.cursor = ''; });
      side.addEventListener('pointermove', e => {
        if (!isDown) return;
        e.preventDefault();
        side.scrollTop = scrollTop - (e.pageY - startY);
      });
      // 上下滚动按钮
      const upBtn = document.createElement('button');
      upBtn.className = 'aurora-side-scroll-btn aurora-side-scroll-up';
      upBtn.innerHTML = '▲';
      upBtn.title = '向上滚动';
      const downBtn = document.createElement('button');
      downBtn.className = 'aurora-side-scroll-btn aurora-side-scroll-down';
      downBtn.innerHTML = '▼';
      downBtn.title = '向下滚动';
      const updateSideArrows = () => {
        upBtn.classList.toggle('vml-btn-disabled', side.scrollTop <= 0);
        downBtn.classList.toggle('vml-btn-disabled', side.scrollTop + side.clientHeight >= side.scrollHeight - 4);
      };
      upBtn.addEventListener('click', () => { side.scrollBy({ top: -200, behavior: 'smooth' }); });
      downBtn.addEventListener('click', () => { side.scrollBy({ top: 200, behavior: 'smooth' }); });
      side.addEventListener('scroll', updateSideArrows);
      side.appendChild(upBtn);
      side.appendChild(downBtn);
      setTimeout(updateSideArrows, 300);
    }

    static updateProgress() {
      const bar = this.root ? this.root.querySelector('.aurora-progress i') : null;
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
      root.querySelector('.aurora-prev').addEventListener('click', () => {
        this.stopAutoplay();
        this.loadSlide((this.currentIndex - 1 + this.items.length) % this.items.length);
        this.startAutoplay();
      });
      root.querySelector('.aurora-next').addEventListener('click', () => {
        this.stopAutoplay();
        this.loadSlide((this.currentIndex + 1) % this.items.length);
        this.startAutoplay();
      });
      // hover 暂停
      root.addEventListener('mouseenter', () => this.stopAutoplay());
      root.addEventListener('mouseleave', () => this.startAutoplay());
    }
  }

  window.VanvyAurora = AuroraBanner;
  // 自动启动: 检测到 Emby 页面特征即启动 (内部轮询处理时机)
  const isEmby = () => {
    // 宽松检测: 官方/开心版/自定义服务器名都适用
    const meta = document.querySelector('meta[name="application-name"]');
    if (meta && /emby/i.test(meta.getAttribute('content') || '')) return true;
    if (document.querySelector('.accent-emby')) return true;
    // 兜底: Emby 页面特征 class (开心版/魔改版通用)
    if (document.querySelector('.skinBody') || document.querySelector('.mainAnimatedPages')) return true;
    return false;
  };
  const tryStart = () => {
    if (window.ApiClient !== undefined && isEmby()) {
      AuroraBanner.start();
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
