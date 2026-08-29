/**
 * =============================================================================
 *  Vanvy Emby Kit · Fluent 布局增强 (fluent_layout)
 *  ---------------------------------------------------------------------------
 *  吸收自: heichaowo/Emby-Fluent (MIT) 未吸收的布局细节
 *  - 侧边栏浮层化: 禁止 docked 模式推移内容, 始终作为浮层 (默认收起)
 *  - 顶部导航栏透明渐变, 融入 Banner
 *  - 超细滚动条 (0.3em)
 *  - 媒体库卡片入场动画 + LOGO 淡入 + hover 缩放
 *  - 毛玻璃媒体库标签 (always / hover / none 三模式, :root 变量切换)
 *
 *  独立组件, 可与任何 banner/主题共存。通过 vanvy/features/fluent_layout 加载。
 *  样式全部使用 vanvy- 前缀命名空间, 不污染 Emby 原生类。
 * =============================================================================
 */
(function () {
  'use strict';
  if (window.VanvyFluentLayout) return; // 幂等

  var CSS_ID = 'vanvy-fluent-layout-css';

  var CSS = `
/* ── 侧边栏浮层化: 禁止 docked 推移, 始终作为浮层 ── */
.vanvy-fluent .withDrawerOpen,
.vanvy-fluent .mainDrawer-docked,
.vanvy-fluent body.bodyWithPopupOpen-withDrawer {
  left: 0 !important;
  margin-left: 0 !important;
  padding-left: 0 !important;
}
.vanvy-fluent .withDrawerOpen .skinHeader { left: 0 !important; }
.vanvy-fluent .mainDrawer.drawer-docked {
  position: fixed !important;
  z-index: 999 !important;
}
.vanvy-fluent .mainDrawer:not(.drawer-open) {
  transform: translateX(-100%) !important;
}

/* ── 顶部导航栏透明渐变 ── */
.vanvy-fluent .skinHeader-withBackground {
  right: 0 !important;
  background-image: linear-gradient(rgba(0,0,0,.5), transparent) !important;
  background-color: unset !important;
}
.vanvy-fluent .view:not(.hide) .skinHeader,
.vanvy-fluent .skinHeader-withBackground.headroom-scrolling {
  width: auto;
  background-image: linear-gradient(black, transparent) !important;
  background-color: unset !important;
}

/* ── 超细滚动条 ── */
.vanvy-fluent ::-webkit-scrollbar { width: .3em !important; height: .3em !important; }

/* ── 媒体库卡片入场动画 ── */
.vanvy-fluent .view:not(.hide) .section0 .card {
  animation: vanvy-card-in .5s cubic-bezier(.25,.46,.45,.94) both;
}
@keyframes vanvy-card-in {
  from { opacity: 0; transform: translateY(1.2em); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── LOGO 淡入 ── */
.vanvy-fluent .view:not(.hide) .section0 .card img {
  animation: vanvy-logo-fade .8s ease both;
}
@keyframes vanvy-logo-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── 卡片 hover 缩放 ── */
.vanvy-fluent .view:not(.hide) .section0 .card:hover {
  transform: scale(1.05);
  transition: transform .35s cubic-bezier(.25,.46,.45,.94);
}

/* ── 毛玻璃媒体库标签 (section0 大图卡片底部标题条) ── */
/* 模式: always (默认) / hover / none, 通过 html class vanvy-label-mode-* 切换 */
.vanvy-fluent .view:not(.hide) .section0 .cardText {
  position: absolute;
  bottom: 0;
  left: 0;
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: .6em 0 !important;
  background: linear-gradient(to top, rgba(0,0,0,.7) 0%, rgba(0,0,0,.3) 60%, transparent 100%);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  backdrop-filter: blur(12px) saturate(1.2);
  font-weight: 600;
  font-size: .85em;
  letter-spacing: .03em;
  text-align: center !important;
  border-radius: 0 0 .3em .3em;
  opacity: .6;
  transition: transform .35s cubic-bezier(.25,.46,.45,.94), opacity .3s ease;
}
.vanvy-fluent .view:not(.hide) .section0 .backdropCard:hover .cardText {
  opacity: 1;
}
.vanvy-fluent .view:not(.hide) .section0 .cardText .cardTextActionButton {
  width: 100% !important;
  text-align: center !important;
  padding: 0 !important;
  margin: 0 !important;
}

/* hover 模式: 仅悬浮时显示 */
.vanvy-fluent.vanvy-label-mode-hover .view:not(.hide) .section0 .cardText {
  transform: translateY(100%);
  opacity: 0;
}
.vanvy-fluent.vanvy-label-mode-hover .view:not(.hide) .section0 .backdropCard:hover .cardText {
  transform: translateY(0);
  opacity: 1;
}

/* none 模式: 完全隐藏 */
.vanvy-fluent.vanvy-label-mode-none .view:not(.hide) .section0 .cardText {
  display: none !important;
}
`;

  function injectCSS() {
    if (document.getElementById(CSS_ID)) return;
    var style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function init() {
    // 给 body 加命名空间 class (所有样式前缀 vanvy-fluent, 不影响其他组件)
    document.body.classList.add('vanvy-fluent');
    // 标签模式: 读取配置 (html class 或 localStorage), 默认 always
    var mode = 'always';
    var cfg = null;
    try {
      cfg = JSON.parse(localStorage.getItem('vanvy-fluent-cfg') || 'null');
      if (cfg && cfg.labelMode) mode = cfg.labelMode;
    } catch (e) { /* ignore */ }
    document.body.classList.add('vanvy-label-mode-' + mode);
    injectCSS();
    console.log('[VanvyFluentLayout] 已启用, 标签模式: ' + mode);
  }

  window.VanvyFluentLayout = {
    init: init,
    setLabelMode: function (m) {
      if (['always', 'hover', 'none'].indexOf(m) === -1) return;
      document.body.classList.remove('vanvy-label-mode-always', 'vanvy-label-mode-hover', 'vanvy-label-mode-none');
      document.body.classList.add('vanvy-label-mode-' + m);
      try { localStorage.setItem('vanvy-fluent-cfg', JSON.stringify({ labelMode: m })); } catch (e) { /* ignore */ }
    }
  };

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
