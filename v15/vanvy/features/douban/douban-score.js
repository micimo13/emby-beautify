(function () {
    "use strict";

    // 样式注入
    const style = document.createElement('style');
    style.textContent = `
        .emby-douban-score, .emby-bangumi-score {
            background: #ffffff;
            display: inline-block;
            color: #242322;
            padding: 8px 12px;
            border-radius: 6px;
            margin: 4px 0;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .emby-douban-comment {
            margin: 1em 0;
            padding: 1em;
            background-color: #f5f5f5;
            border-left: 4px solid #e5c55a;
        }
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
        .starRatingContainer.douban, .starRatingContainer.bgm {
            background: transparent !important;
        }
    `;
    document.head.appendChild(style);

    // 调试日志系统
    const logger = {
        error: (...args) => console.error('[EmbyDouban-ERROR]', ...args),
        info: (...args) => console.info('[EmbyDouban-INFO]', ...args),
        debug: (...args) => console.debug('[EmbyDouban-DEBUG]', ...args)
    };

    // 配置参数
    const config = {
        enableDoubanComment: true,
        enableBangumi: true,
        cacheTTL: 7 * 24 * 60 * 60 * 1000, // 缓存有效期（7天）
        retryDelay: 3000, // 重试间隔
        maxRetries: 3
    };

    // 本地存储封装
    const storage = {
        get(key) {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : null;
            } catch (e) {
                return null;
            }
        },
        set(key, value) {
            localStorage.setItem(key, JSON.stringify(value));
        },
        isExpired(timestamp) {
            return Date.now() - timestamp > config.cacheTTL;
        }
    };

    // 获取可见元素
    function getVisibleElement(elements) {
        if (!elements) return null;
        for (const el of elements) {
            if (el.offsetParent !== null) return el;
        }
        return null;
    }

    // 文本相似度计算
    function textSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;
        const set1 = new Set(text1.toLowerCase());
        const set2 = new Set(text2.toLowerCase());
        const intersection = [...set1].filter(c => set2.has(c)).length;
        return intersection / Math.min(text1.length, text2.length);
    }

    // 获取Emby标题
    function getEmbyTitle() {
        const container = getVisibleElement(document.querySelectorAll('.itemPrimaryNameContainer'));
        if (!container) return '';
        
        const textTitle = container.querySelector('.itemName-primary');
        if (textTitle?.textContent) {
            return textTitle.textContent.trim();
        }
        
        const imgTitle = container.querySelector('.itemName-primary-logo img');
        return imgTitle?.getAttribute('alt')?.trim() || '';
    }

    // 创建SVG图标
    function createIcon(type) {
        const icons = {
            douban: `
                <svg viewBox="0 0 16 16" width="16" height="16">
                    <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.1 8-8-3.6-8-8-8zm0 15c-3.9 0-7-3.1-7-7s3.1-7 7-7 7 3.1 7 7-3.1 7-7 7z" fill="#E5C55A"/>
                    <path d="M11 6H5v1h6V6zm0 3H5v1h6V9z" fill="#E5C55A"/>
                </svg>
            `,
            bangumi: `
                <svg viewBox="0 0 16 16" width="16" height="16">
                    <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 15c-3.9 0-7-3.1-7-7s3.1-7 7-7 7 3.1 7 7-3.1 7-7 7z" fill="#FF9900"/>
                    <path d="M5 4h6v1H5zm0 3h6v1H5zm0 3h4v1H5z" fill="#FF9900"/>
                </svg>
            `
        };
        return icons[type] || '';
    }

    // 插入评分显示
    function insertRating(container, data) {
        // 检查是否已存在
        if (document.getElementById(data.id)) return;

        // 创建评分元素
        const ratingDiv = document.createElement('div');
        ratingDiv.className = `starRatingContainer mediaInfoItem ${data.type}`;
        ratingDiv.innerHTML = `
            <a id="${data.id}" href="${data.url}" target="_blank" class="button-link">
                ${createIcon(data.type)}
                <span>${data.rating}</span>
            </a>
        `;

        // 插入位置
        const yearDiv = getVisibleElement(document.querySelectorAll('.mediaInfoItem'));
        if (yearDiv) {
            yearDiv.parentNode.insertBefore(ratingDiv, yearDiv);
        }
    }

    // 插入热评显示
    function insertComment(data) {
        if (!config.enableDoubanComment || !data.comment) return;

        const commentDiv = document.createElement('div');
        commentDiv.className = 'emby-douban-comment';
        commentDiv.innerHTML = `
            <strong>豆瓣热评：</strong>
            <p style="margin-left: 1em;">${data.comment}</p>
        `;

        const overview = document.querySelector('.overview-text');
        if (overview) {
            overview.parentNode.insertBefore(commentDiv, overview.nextSibling);
        }
    }

    // 创建外部链接按钮
    function createExternalLink(href, text, type) {
        const link = document.createElement('a');
        link.className = 'raised item-tag-button nobackdropfilter emby-button';
        link.href = href;
        link.target = '_blank';
        link.innerHTML = `
            <i class="md-icon button-icon">${type === 'douban' ? 'movie_filter' : 'tv'}</i>
            ${text}
        `;
        return link;
    }

    // 获取豆瓣信息
    async function fetchDoubanInfo(title) {
        try {
            const response = await fetch(`https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(title)}`);
            if (!response.ok) throw new Error('豆瓣搜索失败');
            
            const data = await response.json();
            if (!Array.isArray(data) || data.length === 0) return null;

            const item = data[0];
            const similarity = textSimilarity(title, item.title);
            
            if (similarity < 0.4 && textSimilarity(title, item.sub_title) < 0.4) {
                logger.info(`标题不匹配：${title} vs ${item.title} ${item.sub_title || ''}`);
                return null;
            }

            // 获取详细评分
            const detailResponse = await fetch(`https://movie.douban.com/j/subject_abstract?subject_id=${item.id}`);
            const detailData = await detailResponse.json();
            
            return {
                id: `douban-${item.id}`,
                type: 'douban',
                url: `https://movie.douban.com/subject/${item.id}/`,
                rating: detailData.subject.rate || '暂无评分',
                comment: detailData.subject.short_comment?.content || '',
                title: item.title
            };
        } catch (error) {
            logger.error('获取豆瓣信息失败:', error);
            return null;
        }
    }

    // 获取Bangumi信息
    async function fetchBangumiInfo(title, year) {
        if (!config.enableBangumi) return null;
        
        try {
            const response = await fetch(`https://api.bgm.tv/v0/search/subjects?limit=1`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: title,
                    filter: {
                        type: [2], // 动画类型
                        air_date: [
                            `>=${year}-01-01`,
                            `<=${year}-12-31`
                        ]
                    }
                })
            });
            
            if (!response.ok) throw new Error('Bangumi搜索失败');
            
            const data = await response.json();
            if (!data.data || data.data.length === 0) return null;

            const item = data.data[0];
            const similarity = textSimilarity(title, item.name);
            
            if (similarity < 0.4 && textSimilarity(title, item.name_cn) < 0.4) {
                logger.info(`Bangumi标题不匹配：${title} vs ${item.name} ${item.name_cn || ''}`);
                return null;
            }

            return {
                id: `bangumi-${item.id}`,
                type: 'bangumi',
                url: `https://bgm.tv/subject/${item.id}`,
                rating: item.score || 'N/A',
                title: item.name
            };
        } catch (error) {
            logger.error('获取Bangumi信息失败:', error);
            return null;
        }
    }

    // 主要处理逻辑
    async function processItem() {
        const title = getEmbyTitle();
        if (!title) return;

        // 获取IMDb链接
        const imdbButton = document.querySelector('.linksSection a[href^="https://www.imdb"]');
        if (!imdbButton) return;

        // 检查缓存
        const cacheKey = `emby_douban_${title}`;
        const cached = storage.get(cacheKey);
        
        if (cached && !storage.isExpired(cached.timestamp)) {
            if (cached.douban) insertRating(document.body, cached.douban);
            if (cached.comment) insertComment(cached.douban);
            if (cached.bangumi) insertRating(document.body, cached.bangumi);
            return;
        }

        // 获取豆瓣信息
        let result = {
            timestamp: Date.now()
        };

        const doubanData = await fetchDoubanInfo(title);
        if (doubanData) {
            insertRating(document.body, doubanData);
            insertComment(doubanData);
            result.douban = doubanData;
        }

        // 获取Bangumi信息
        const yearDiv = document.querySelector('.mediaInfoItem');
        const year = yearDiv?.textContent.match(/^\d{4}/)?.[0];
        if (year) {
            const bangumiData = await fetchBangumiInfo(title, year);
            if (bangumiData) {
                insertRating(document.body, bangumiData);
                result.bangumi = bangumiData;
            }
        }

        // 保存缓存
        storage.set(cacheKey, result);
    }

    // DOM观察器
    const observer = new MutationObserver((mutations) => {
        if (document.querySelector('.itemPrimaryNameContainer')) {
            setTimeout(processItem, 1000);
        }
    });

    // 初始化
    function init() {
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        // 首次执行
        setTimeout(processItem, 1500);
    }

    // 在DOM加载完成后启动
    document.addEventListener('DOMContentLoaded', init);
})();