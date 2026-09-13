/**
 * VANVY Loading · 预热加载动画激活器
 * 独立组件：支持 5 种 Loading 样式
 */
(function() {
    'use strict';
    
    const Loading = {
        type: 'aurora', // 默认风格
        
        init(style) {
            if (!style) style = this.detectStyleFromBanner();
            this.type = style || 'aurora';
            this.activate();
        },
        
        // 检测当前启用的轮播组件，使用对应的 Loading 风格
        detectStyleFromBanner() {
            const banners = ['aurora', 'cinema', 'split'];
            for (const banner of banners) {
                if (document.body.classList.contains(`vanvy-${banner}-active`) ||
                    document.querySelector(`.vanvy-${banner}`)) {
                    return banner;
                }
            }
            return null;
        },
        
        activate() {
            if (document.getElementById('vanvy-global-loading')) return;
            
            const style = this.type;
            const loading = document.createElement('div');
            loading.id = 'vanvy-global-loading';
            loading.className = `vanvy-loading-${style}`;
            loading.innerHTML = this.buildHTML(style);
            
            document.body.appendChild(loading);
            document.body.classList.add('vanvy-loading-active');
            // 记录显示时刻 (最低展示时长用)
            window.__vanvyLoadingShownAt = Date.now();
            
            // 隐藏 Emby 顶栏
            document.body.classList.add('vanvy-loading-hide-header');
            
            // 隐藏 Emby 原生加载页 (避免与本加载页重叠)
            document.querySelectorAll('.app-splash-container, .app-splash, .app-splash-expanded').forEach(function (el) {
                el.style.display = 'none';
            });
            
            console.log(`[VanvyLoading] ${style} 已激活`);
        },
        
        hide() {
            const loading = document.getElementById('vanvy-global-loading');
            if (!loading) return;
            
            loading.classList.add('vl-hide');
            document.body.classList.remove('vanvy-loading-active', 'vanvy-loading-hide-header');
            
            // 恢复 Emby 原生加载页 (app 已就绪, 由 Emby 自行控制)
            document.querySelectorAll('.app-splash-container, .app-splash, .app-splash-expanded').forEach(function (el) {
                el.style.display = '';
            });
            
            setTimeout(() => {
                if (loading.parentNode) loading.parentNode.removeChild(loading);
            }, 600);
            
            console.log('[VanvyLoading] 已隐藏');
        },
        
        buildHTML(style) {
            const htmls = {
                aurora: `
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
                        <div class="vl-brand">VANVY</div>
                    </div>`,
                cinema: `
                    <div class="vl-bg"></div>
                    <div class="vl-reel"></div>
                    <div class="vl-inner">
                        <div class="vl-logo-wrap">
                            <div class="vl-glow"></div>
                            <img class="vl-logo" alt="" src="vanvy/branding/splash-logo.png" onerror="this.style.display='none'">
                        </div>
                        <div class="vl-bar"><i></i></div>
                        <div class="vl-brand">CINEMA</div>
                    </div>`,
                split: `
                    <div class="vl-split-l"></div>
                    <div class="vl-split-r"></div>
                    <div class="vl-inner">
                        <div class="vl-logo-wrap">
                            <img class="vl-logo" alt="" src="vanvy/branding/splash-logo.png" onerror="this.style.display='none'">
                        </div>
                        <div class="vl-bar"><i></i></div>
                        <div class="vl-brand">VANVY</div>
                    </div>`,
                minimal: `
                    <div class="vl-inner">
                        <div class="vl-dots">
                            <i></i><i></i><i></i>
                        </div>
                        <div class="vl-brand">Loading</div>
                    </div>`,
                logo: `
                    <div class="vl-inner">
                        <div class="vl-logo-wrap">
                            <img class="vl-logo" alt="" src="vanvy/branding/splash-logo.png" onerror="this.style.display='none'">
                        </div>
                        <div class="vl-brand">VANVY</div>
                    </div>`
            };
            return htmls[style] || htmls.aurora;
        }
    };
    
    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Loading.init());
    } else {
        Loading.init();
    }

    // ── 独立自动隐藏 (无轮播场景: 单装加载页也能正常淡出) ──
    // 触发条件: ① Emby app 加载完成 (首页渲染出内容) ② 6 秒超时兑底
    // 轮播场景: 外部会发 vanvy:carousel-ready 事件调 hide()
    function tryHideWhenReady() {
        // Emby 首页渲染完成特征: 存在 emby-scroller / homePage 等 DOM
        var appReady = !!document.querySelector('.emby-scroller, .homePage, .mainDrawer, .skinHeader');
        var inHome = /#!\/home/.test(window.location.hash) || window.location.hash === '' || !window.location.hash;
        // 最低展示时长 1.5s: 避免页面骨架元素过早触发隐藏, 让品牌动画可见
        var shownMs = Date.now() - (window.__vanvyLoadingShownAt || 0);
        if (appReady && inHome && shownMs >= 1500) {
            Loading.hide();
        }
    }

    // 轮播就绪事件 (外部轮播组件发) → 立即隐藏
    window.addEventListener('vanvy:carousel-ready', function () { Loading.hide(); });
    // Emby SPA 路由变化 → 重试检测
    window.addEventListener('hashchange', function () {
        // 离开首页或加载完成都隐藏
        if (!/#!\/home/.test(window.location.hash)) { Loading.hide(); return; }
        tryHideWhenReady();
    });
    // 轮询检测 (app 加载快慢不定)
    var pollCount = 0;
    var pollTimer = setInterval(function () {
        pollCount++;
        tryHideWhenReady();
        if (pollCount > 12) { // 最多 ~6 秒
            clearInterval(pollTimer);
            Loading.hide(); // 超时兑底, 绝不卡页面
        }
    }, 500);

    // 暴露全局接口
    window.VanvyLoading = Loading;
})();
