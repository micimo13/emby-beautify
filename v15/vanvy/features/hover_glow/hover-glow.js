/**
 * Vanvy Emby Kit · 卡片悬停发光增强 (hover_glow) 激活脚本
 * 给 body 加 .vanvy-glow 前缀, 激活 CSS (命名空间隔离)
 */
(function () {
    'use strict';
    if (window.VanvyHoverGlow) return;
    function activate() {
        if (!document.body.classList.contains('vanvy-glow')) {
            document.body.classList.add('vanvy-glow');
        }
        console.log('[VanvyHoverGlow] 卡片悬停发光已启用');
    }
    if (document.body) activate();
    else document.addEventListener('DOMContentLoaded', activate);
    window.VanvyHoverGlow = { activate: activate };
})();
