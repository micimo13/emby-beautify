// ==EmbyHelper==
// @name         Emby助手
// @description  显示远程资源路径并支持点击复制
// @author       VNAVY
// @license      GPLv3
// ==/EmbyHelper==

(function () {
    "use strict";

    // 样式注入
    const style = document.createElement('style');
    style.textContent = `
        .remote-source-path {
            background: #ffffff;
            display: inline-block;
            color: #242322;
            padding: 10px;
            border-radius: 6px;
            margin: 4px 0;
            cursor: pointer;
            font-size: 14px;
        }
        /* Toast样式 */
        .eh-toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #333;
            color: #fff;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 99999;
            opacity: 0;
            transition: opacity 0.5s;
        }
        .eh-toast.show {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);

    // 复制功能实现
    function copyText(text) {
        navigator.clipboard.writeText(text)
            .then(() => showToast({ text: '已复制到剪贴板' }))
            .catch(err => console.error('复制失败:', err));
    }

    // Toast通知实现
    function showToast(options) {
        const toast = document.createElement('div');
        toast.className = 'eh-toast';
        toast.textContent = options.text;
        document.body.appendChild(toast);
        
        // 触发动画
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        // 自动隐藏
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 500);
        }, 2000);
    }

    // URL类型定义
    const UrlType = {
        cd2: {
            pattern: /\/static\/http\/.+\/(True|False)\//i,
            pathExtractor: (url) => {
                const p = url.split(/\/False|True\//i)[1];
                return decodeURIComponent(p).substring(1);
            },
        },
        alist: {
            matchPath: true,
            pattern: /^\/d/,
            pathExtractor: (url) => {
                const u = new URL(url);
                const p = u.pathname.replace(/^\/d/, '');
                return decodeURIComponent(p);
            },
        },
    };

    // URL检测工具
    function detectUrlType(url) {
        for (const [type, { matchPath, pattern }] of Object.entries(UrlType)) {
            let text = url;
            if (matchPath) {
                try {
                    const u = new URL(url);
                    text = u.pathname;
                } catch (e) {
                    continue;
                }
            }
            if (pattern.test(text)) return type;
        }
        return null;
    }

    function extractPath(url) {
        const type = detectUrlType(url);
        if (!type || !UrlType[type].pathExtractor) return url;
        return UrlType[type].pathExtractor(url);
    }

    // 元素检测工具
    function isRemote(text) {
        return /^[^\/]/.test(text);
    }

    function findSourceElements() {
        return document.querySelectorAll(
            `.mediaSources > .mediaSource > div.padded-left > .sectionTitle > div:nth-child(1)`
        );
    }

    // 渲染远程路径标签
    function render(el, text) {
        const elPath = document.createElement('div');
        elPath.textContent = text;
        elPath.title = '点击复制路径';
        elPath.classList.add('remote-source-path');

        elPath.addEventListener('click', () => copyText(text));

        // 插入到原始元素之后
        el.parentNode.insertBefore(elPath, el.nextSibling);
    }

    // 主处理函数
    function processElements() {
        const sourceElements = findSourceElements();
        if (!sourceElements?.length) return;

        for (const el of sourceElements) {
            // 避免重复添加
            if (el.parentNode.querySelector('.remote-source-path')) continue;
            
            const sourceText = el.textContent.trim();
            if (isRemote(sourceText)) {
                const path = extractPath(sourceText);
                render(el, path);
            }
        }
    }

    // DOM观察器
    const observer = new MutationObserver((mutations) => {
        // 优化性能：防抖处理
        clearTimeout(observer.timer);
        observer.timer = setTimeout(() => {
            processElements();
        }, 300);
    });

    // 初始化
    function init() {
        // 首次立即执行
        processElements();
        
        // 开始观察DOM变化
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
    }

    // 在DOM加载完成后启动
    document.addEventListener('DOMContentLoaded', init);
})();