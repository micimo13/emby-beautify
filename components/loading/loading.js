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
            
            // 隐藏 Emby 顶栏
            document.body.classList.add('vanvy-loading-hide-header');
            
            console.log(`[VanvyLoading] ${style} 已激活`);
        },
        
        hide() {
            const loading = document.getElementById('vanvy-global-loading');
            if (!loading) return;
            
            loading.classList.add('vl-hide');
            document.body.classList.remove('vanvy-loading-active', 'vanvy-loading-hide-header');
            
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
    
    // 暴露全局接口
    window.VanvyLoading = Loading;
})();
