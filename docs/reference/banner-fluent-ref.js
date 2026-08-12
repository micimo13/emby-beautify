// 动态注入字体 (Chrome 扩展 CSS 不支持 @import 外部资源, 需通过 JS 注入)
// 仅在 Emby 页面上注入, 避免在无关网站触发 CSP 错误
(function injectFonts() {
	const isEmby = document.querySelector('meta[name="application-name"][content="Emby"]')
		|| document.title.includes('Emby')
		|| window.location.pathname.includes('/web/index.html');
	if (!isEmby) return;

	/**
	 * 加载样式表, 支持 CDN 降级回退.
	 * @param {string} primary - 主 CDN 地址 (全球)
	 * @param {string} [fallback] - 备用 CDN 地址 (国内镜像)
	 */
	const loadCSS = (primary, fallback) => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = primary;
		if (fallback) {
			link.onerror = () => {
				console.log(`[Emby-Fluent] CDN fallback: ${primary} → ${fallback}`);
				link.remove();
				const fb = document.createElement('link');
				fb.rel = 'stylesheet';
				fb.href = fallback;
				document.head.appendChild(fb);
			};
		}
		document.head.appendChild(link);
	};

	// Plus Jakarta Sans — Google Fonts (全球可用)
	loadCSS('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

	// HarmonyOS Sans SC — jsDelivr → npmmirror 回退
	loadCSS(
		'https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.1.0/dist/Regular.css',
		'https://registry.npmmirror.com/harmonyos-sans-sc-webfont-splitted/1.1.0/files/dist/Regular.css'
	);
	loadCSS(
		'https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.1.0/dist/Bold.css',
		'https://registry.npmmirror.com/harmonyos-sans-sc-webfont-splitted/1.1.0/files/dist/Bold.css'
	);

	// 霞鹜文楷 — jsDelivr → npmmirror 回退
	loadCSS(
		'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css',
		'https://registry.npmmirror.com/lxgw-wenkai-webfont/1.7.0/files/style.css'
	);
})();

class Home {
	static start() {
		console.log('[Emby-Fluent] Home.start() called');
		this.cache = {
			items: undefined,
			item: new Map(),
		};
		this.itemQuery = { ImageTypes: "Backdrop,Logo", EnableImageTypes: "Logo,Backdrop", IncludeItemTypes: "Movie,Series", SortBy: "ProductionYear, PremiereDate, SortName", Recursive: true, ImageTypeLimit: 1, Limit: 10, Fields: "ProductionYear", SortOrder: "Descending", EnableUserData: false, EnableTotalRecordCount: false };
		this.coverOptions = { type: "Backdrop", maxWidth: 3000 };
		this.logoOptions = { type: "Logo", maxWidth: 3000 };
		this.initStart = false;
		setInterval(() => {
			if (window.location.href.indexOf("!/home") != -1) {
				if ($(".view:not(.hide) .heicha-banner").length == 0 && $(".heicha-loading").length == 0) {
					this.initStart = false;
					this.initLoading();
				}
				if ($(".hide .heicha-banner").length != 0) {
					$(".hide .heicha-banner").remove();
				}
				// v4.9 compat: .section0 不存在时, 将第一个可见 verticalSection 标记为 section0
				if ($(".section0").length == 0) {
					const $vs = $(".view:not(.hide) .homeSectionsContainer .verticalSection:not(.hide)").first();
					if ($vs.length > 0) {
						$vs.addClass("section0");
						console.log('[Emby-Fluent] v4.9 compat: tagged verticalSection as section0');
					}
				}
				if (!this.initStart && $(".section0 .card").length != 0 && $(".view:not(.hide) .heicha-banner").length == 0) {
					this.initStart = true;
					this.init();
				}
			}
		}, 233);
	}

	static async init() {
		// Beta
		$(".view:not(.hide)").attr("data-type", "home");
		// Loading
		const serverName = await this.injectCall("serverName", "");
		$(".heicha-loading h1").text(serverName).addClass("active");
		// Banner
		await this.initBanner();
		this.initEvent();
	}

	/* 插入Loading */
	static initLoading() {
		const load = `
		<div class="heicha-loading">
			<h1></h1>
			<div class="mdl-spinner"><div class="mdl-spinner__layer mdl-spinner__layer-1"><div class="mdl-spinner__circle-clipper mdl-spinner__left"><div class="mdl-spinner__circle mdl-spinner__circleLeft"></div></div><div class="mdl-spinner__circle-clipper mdl-spinner__right"><div class="mdl-spinner__circle mdl-spinner__circleRight"></div></div></div></div>
		</div>
		`;
		$("body").append(load);
	}

	static injectCode(code) {
		let hash = md5(code + Math.random().toString());
		return new Promise((resolve, reject) => {
			if ("BroadcastChannel" in window) {
				const channel = new BroadcastChannel(hash);
				channel.addEventListener("message", (event) => resolve(event.data));
			} else if ("postMessage" in window) {
				window.addEventListener("message", (event) => {
					if (event.data.channel === hash) {
						resolve(event.data.message);
					}
				});
			}
			const script = `
			<script class="I${hash}">
				setTimeout(async ()=> {
					async function R${hash}(){${code}};
					if ("BroadcastChannel" in window) {
						const channel = new BroadcastChannel("${hash}");
						channel.postMessage(await R${hash}());
					} else if ('postMessage' in window) {
						window.parent.postMessage({channel:"${hash}",message:await R${hash}()}, "*");
					}
					document.querySelector("script.I${hash}").remove()
				}, 16)
			</script>
			`;
			$(document.head || document.documentElement).append(script);
		});
	}

	static injectCall(func, arg) {
		const script = `
		// const client = (await window.require(["ApiClient"]))[0];
		const client = await new Promise((resolve, reject) => {
			setInterval(() => {
				if (window.ApiClient != undefined) resolve(window.ApiClient);
			}, 16);
		});
		return await client.${func}(${arg})
		`;
		return this.injectCode(script);
	}

	static getItems(query) {
		if (this.cache.items == undefined) {
			this.cache.items = this.injectCall("getItems", "client.getCurrentUserId(), " + JSON.stringify(query));
		}
		return this.cache.items;
	}

	static async getItem(itemId) {
		// 双缓存 优先使用 WebStorage
		if (typeof Storage !== "undefined" && !localStorage.getItem("CACHE|" + itemId) && !this.cache.item.has(itemId)) {
			const data = JSON.stringify(await this.injectCall("getItem", `client.getCurrentUserId(), "${itemId}"`));
			if (typeof Storage !== "undefined") localStorage.setItem("CACHE|" + itemId, data);
			else this.cache.item.set(itemId, data);
		}
		return JSON.parse(typeof Storage !== "undefined" ? localStorage.getItem("CACHE|" + itemId) : this.cache.item.get(itemId));
	}

	static getImageUrl(itemId, options) {
		return this.injectCall("getImageUrl", itemId + ", " + JSON.stringify(options));
	}

	/* 插入Banner */
	static async initBanner() {
		const banner = `
		<div class="heicha-banner">
			<div class="heicha-banner-body">
			</div>
			<button class="heicha-banner-nav heicha-banner-prev" aria-label="Previous">&#10094;</button>
			<button class="heicha-banner-nav heicha-banner-next" aria-label="Next">&#10095;</button>
			<div class="heicha-banner-library">
				<div class="heicha-banner-logos"></div>
			</div>
		</div>
		`;
		$(".view:not(.hide) .homeSectionsContainer").prepend(banner);
		// $(".view:not(.hide) .section0").detach().appendTo(".view:not(.hide) .heicha-banner-library");

		// 插入数据 — 并行获取所有 item 详情和图片URL, 按原始顺序 append DOM
		const data = await this.getItems(this.itemQuery);
		const slides = await Promise.all(data.Items.map(async (item) => {
			const detail = await this.getItem(item.Id);
			const coverUrl = await this.getImageUrl(detail.Id, this.coverOptions);
			const logoUrl = await this.getImageUrl(detail.Id, this.logoOptions);
			return { detail, coverUrl, logoUrl };
		}));

		for (const { detail, coverUrl, logoUrl } of slides) {
			const itemHtml = `
			<div class="heicha-banner-item" id="${detail.Id}">
				<img draggable="false" loading="eager" decoding="async" class="heicha-banner-cover" src="${coverUrl}" alt="Backdrop" style="">
				<div class="heicha-banner-info padded-left padded-right">
					<h1>${detail.Name}</h1>
					<div><p>${detail.Overview}</p></div>
					<div><button onclick="appRouter.showItem('${detail.Id}')">MORE</button></div>
				</div>
			</div>
			`;
			if (detail.ImageTags && detail.ImageTags.Logo) {
				$(".heicha-banner-logos").append(`
				<img id="${detail.Id}" draggable="false" loading="auto" decoding="lazy" class="heicha-banner-logo" data-banner="img-title" alt="Logo" src="${logoUrl}">
				`);
			}
			$(".heicha-banner-body").append(itemHtml);
		}

		// 等待所有图片加载完毕 (成功或失败), 10s 超时
		await new Promise((resolve) => {
			const check = () => {
				const covers = document.querySelectorAll('.heicha-banner-cover');
				if (covers.length === 0) { resolve(); return; }
				const allComplete = Array.from(covers).every(img => img.complete);
				if (allComplete) { resolve(); return; }
			};
			const interval = setInterval(check, 50);
			setTimeout(() => { clearInterval(interval); resolve(); }, 10000);
			check();
		});

		// 移除加载失败的幻灯片 (Backdrop 500 等)
		$(".heicha-banner-cover").each((i, img) => {
			if (img.complete && img.naturalHeight === 0) {
				const $item = $(img).closest('.heicha-banner-item');
				const itemId = $item.attr('id');
				$item.remove();
				if (itemId) $(`.heicha-banner-logo[id="${itemId}"]`).remove();
				console.warn(`[Emby-Fluent] Removed failed slide: ${itemId}`);
			}
		});

		const remainingSlides = $(".heicha-banner-item").length;
		console.log(`[Emby-Fluent] Slides remaining after cleanup: ${remainingSlides}`);

		// 如果所有图片都失败, 跳过 Banner 逻辑
		if (remainingSlides === 0) {
			console.warn('[Emby-Fluent] All backdrop images failed, skipping banner');
			$(".heicha-banner").remove();
			$(".heicha-loading").fadeOut(500, () => $(".heicha-loading").remove());
			return;
		}

		// 克隆第一张作为幽灵幻灯片（无限滚动幻觉）, 放在图片加载后确保 slide 已存在
		const firstItem = $(".heicha-banner-item").first();
		if (firstItem.length) {
			const cloneItem = firstItem.clone().addClass("heicha-banner-clone").removeAttr("id");
			cloneItem.find(".heicha-banner-info").css("visibility", "hidden"); // CR-5: 隐藏克隆的信息面板
			$(".heicha-banner-body").append(cloneItem);
		}

		// 判断section0加载完毕 (15s 超时保护)
		await new Promise((resolve) => {
			let waitsection0 = setInterval(() => {
				if ($(".view:not(.hide) .section0 .emby-scrollbuttons").length > 0 && $(".view:not(.hide) .section0.hide").length == 0) {
					clearInterval(waitsection0);
					resolve();
				}
			}, 16);
			setTimeout(() => { clearInterval(waitsection0); resolve(); }, 15000);
		});

		$(".view:not(.hide) .section0 .emby-scrollbuttons").remove();
		const itemsEl = $(".view:not(.hide) .section0 .emby-scroller .itemsContainer")[0];
		const items = itemsEl?.items;
		if (!itemsEl) console.warn("[Emby-Fluent] section0 itemsContainer not found, library items binding skipped");
		if (CommonUtils.checkType() === 'pc') {
			$(".view:not(.hide) .section0").detach().appendTo(".view:not(.hide) .heicha-banner-library");
		}

		$(".heicha-loading").fadeOut(500, () => $(".heicha-loading").remove());
		await CommonUtils.sleep(150);
		const itemsEl2 = $(".view:not(.hide) .section0 .emby-scroller .itemsContainer")[0];
		if (itemsEl2 && items) itemsEl2.items = items;

		// 置入场动画
		let delay = 80; // 动媒体库画间隔
		let id = $(".heicha-banner-item").eq(0).addClass("active").attr("id"); // 初次信息动画
		$(`.heicha-banner-logo[id=${id}]`).addClass("active");

		await CommonUtils.sleep(200); // 间隔动画
		$(".section0 > div").addClass("heicha-banner-library-overflow"); // 关闭overflow 防止媒体库动画溢出
		$(".heicha-banner .card").each((i, dom) => setTimeout(() => $(dom).addClass("heicha-banner-library-show"), i * delay)); // 媒体库动画
		await CommonUtils.sleep(delay * 8 + 1000); // 等待媒体库动画完毕
		$(".section0 > div").removeClass("heicha-banner-library-overflow"); // 开启overflow 防止无法滚动

		// 滚屏逻辑（无限滚动幻觉）
		var index = 0;
		var isWrapping = false; // 防抖锁: wrap-around 动画期间屏蔽操作
		const realCount = $(".heicha-banner-item:not(.heicha-banner-clone)").length;
		const $body = $(".heicha-banner-body");
		const startCarousel = () => {
			clearInterval(this.bannerInterval);
			this.bannerInterval = setInterval(() => {
				// 背景切换
				if (window.location.href.endsWith("home") && !document.hidden) {
					index++;
					$body.css("left", -(index * 100).toString() + "%");

					if (index >= realCount) {
						// 滑入克隆幻灯片（视觉上就是第一张）, 等 transition 结束后瞬间跳回真正的第一张
						// 信息 & LOGO 切换到第一张
						$(".heicha-banner-item.active").removeClass("active");
						let firstId = $(".heicha-banner-item").eq(0).addClass("active").attr("id");
						$(".heicha-banner-logo.active").removeClass("active");
						$(`.heicha-banner-logo[id=${firstId}]`).addClass("active");

						// 暂停定时器, 防止 reset 期间再次触发
						clearInterval(this.bannerInterval);
						setTimeout(() => {
							// 关闭过渡, 瞬间跳回位置0
							$body.addClass("heicha-banner-notransition");
							$body.css("left", "0%");
							// 强制回流后重新开启过渡
							if ($body[0]) $body[0].offsetHeight;
							$body.removeClass("heicha-banner-notransition");
							index = 0;
							// 重新启动定时器
							startCarousel();
						}, 1600); // 等待 1.5s transition 完成 + 100ms 安全余量
					} else {
						// 正常切换
						$(".heicha-banner-item.active").removeClass("active");
						let id = $(".heicha-banner-item").eq(index).addClass("active").attr("id");
						$(".heicha-banner-logo.active").removeClass("active");
						$(`.heicha-banner-logo[id=${id}]`).addClass("active");
					}
				}
			}, 10000);
		};
		startCarousel();

		// 手动导航：跳转到指定 slide 并重启自动轮播
		const goToSlide = (targetIndex) => {
			if (isWrapping) return;
			clearInterval(this.bannerInterval);
			index = targetIndex;
			$body.css("left", -(index * 100).toString() + "%");
			$(".heicha-banner-item.active").removeClass("active");
			let id = $(".heicha-banner-item").eq(index).addClass("active").attr("id");
			$(".heicha-banner-logo.active").removeClass("active");
			$(`.heicha-banner-logo[id=${id}]`).addClass("active");
			startCarousel();
		};

		// 通过克隆 slide 实现无缝 wrap-around（前进方向）
		const wrapForward = () => {
			if (isWrapping) return;
			isWrapping = true;
			clearInterval(this.bannerInterval);
			index = realCount; // 滑入克隆 slide
			$body.css("left", -(index * 100).toString() + "%");
			// 信息 & LOGO 切换到第一张
			$(".heicha-banner-item.active").removeClass("active");
			let firstId = $(".heicha-banner-item").eq(0).addClass("active").attr("id");
			$(".heicha-banner-logo.active").removeClass("active");
			$(`.heicha-banner-logo[id=${firstId}]`).addClass("active");
			setTimeout(() => {
				$body.addClass("heicha-banner-notransition");
				$body.css("left", "0%");
				if ($body[0]) $body[0].offsetHeight;
				$body.removeClass("heicha-banner-notransition");
				index = 0;
				isWrapping = false;
				startCarousel();
			}, 1600);
		};

		// 通过克隆 slide 实现无缝 wrap-around（后退方向）
		const wrapBackward = () => {
			if (isWrapping) return;
			isWrapping = true;
			clearInterval(this.bannerInterval);
			// 先瞬间跳到克隆 slide 位置（视觉上就是第一张）
			$body.addClass("heicha-banner-notransition");
			$body.css("left", -(realCount * 100).toString() + "%");
			if ($body[0]) $body[0].offsetHeight;
			$body.removeClass("heicha-banner-notransition");
			// 然后平滑滑到最后一张真实 slide
			index = realCount - 1;
			$body.css("left", -(index * 100).toString() + "%");
			$(".heicha-banner-item.active").removeClass("active");
			let id = $(".heicha-banner-item").eq(index).addClass("active").attr("id");
			$(".heicha-banner-logo.active").removeClass("active");
			$(`.heicha-banner-logo[id=${id}]`).addClass("active");
			isWrapping = false;
			startCarousel();
		};

		// 上一张
		$(".heicha-banner-prev").on("click", () => {
			if (index <= 0) {
				wrapBackward();
			} else {
				goToSlide(index - 1);
			}
		});

		// 下一张
		$(".heicha-banner-next").on("click", () => {
			if (index >= realCount - 1) {
				wrapForward();
			} else {
				goToSlide(index + 1);
			}
		});
	}

	/* 初始事件 */
	static initEvent() {
		// 通过注入方式, 方可调用appRouter函数, 以解决Content-Script window对象不同步问题
		const script = `
		// 挂载appRouter
		if (!window.appRouter) window.appRouter = (await window.require(["appRouter"]))[0];
		/* // 修复library事件参数
		const serverId = ApiClient._serverInfo.Id,
			librarys = document.querySelectorAll(".view:not(.hide) .section0 .card");
		librarys.forEach(library => {
			library.setAttribute("data-serverid", serverId);
			library.setAttribute("data-type", "CollectionFolder");
		}); */
		`;
		this.injectCode(script);
	}
}

// 运行
console.log('[Emby-Fluent] Entry check:', {
	meta: $("meta[name=application-name]").attr("content"),
	accentEmby: $(".accent-emby").length,
	hasBroadcast: "BroadcastChannel" in window,
});
if ("BroadcastChannel" in window || "postMessage" in window) {
	if ($("meta[name=application-name]").attr("content") == "Emby" || $(".accent-emby") != undefined) {
		Home.start();
	}
}
