(function () {
    "use strict";
    /* page item.Type "Person" "Movie" "Series" "Season" "Episode" "BoxSet" "video-osd" so. */
    const show_pages = ["Movie", "Series", "Episode", "Season", "video-osd"];
    var item, paly_mutation;

    /* document.addEventListener("itemshow", function (e) {
        item = e.detail.item;
        // if (showFlag() && item.People) {
        //     item.People = item.People.filter(p => p.PrimaryImageTag);
        // }
    }); */
    document.addEventListener("viewbeforeshow", function (e) {
        paly_mutation?.disconnect();
        if (e.detail.path === "/item" || e.detail.type === "video-osd") {
            if (!e.detail.isRestored) {
                const mutation = new MutationObserver(async function () {
                    item = e.target.controller?.currentItem || e.target.controller?.videoOsd?.currentItem || e.target.controller?.currentPlayer?.streamInfo?.item;
                    if (item) {
                        mutation.disconnect();
                        if (showFlag()) {
                            if (!item.People) {
                                item = await ApiClient.getItem(ApiClient.getCurrentUserId(), item.Id);
                            }
                            if (item.People.length === 0) {
                                return;
                            }
                            e.detail.path === "/item" && (e.target.querySelector(".peopleItemsContainer").fetchData = filterPeople.bind(item));
                            /* item.People = item.People.filter(p => p.PrimaryImageTag);
                            e.detail.type === "video-osd" && setTimeout(() => {
                                e.target.controller.videoOsd && (e.target.controller.videoOsd.currentItem.People = item.People);
                                e.target.controller.currentItem && (e.target.controller.currentItem.People = item.People);
                            }, 1000); */
                            if (e.detail.type === "video-osd") {
                                paly_mutation = new MutationObserver(function () {
                                    let itemsContainer = e.target.querySelector('[data-index="2"].videoosd-itemstab .itemsContainer');
                                    if (itemsContainer) {
                                        paly_mutation.disconnect();
                                        itemsContainer.fetchData = filterPeople.bind(item);
                                    }

                                });
                                paly_mutation.observe(e.target.querySelector('[data-index="2"].videoosd-itemstab'), {
                                    childList: true,
                                    characterData: true,
                                    subtree: true,
                                });
                            }
                        }
                    }
                });
                mutation.observe(document.body, {
                    childList: true,
                    characterData: true,
                    subtree: true,
                });
            } else {
                item = e.target.controller.currentItem || e.target.controller.videoOsd?.currentItem;
            }
        }
    });
    function filterPeople(query) {
        var serverId = item.ServerId,
            people = (item.People || []).filter(function (p) {
                return p.PrimaryImageTag && (p.ServerId = serverId, "Person" !== p.Type && (p.PersonType = p.Type, p.Type = "Person"), !0)
            }),
            totalRecordCount = people.length;
        return query && (people = people.slice(query.StartIndex || 0),
            query.Limit && people.length > query.Limit && (people.length = query.Limit)),
            Promise.resolve({
                Items: people,
                TotalRecordCount: totalRecordCount
            })
    }
    function showFlag() {
        for (let show_page of show_pages) {
            if (item.Type == show_page) {
                return true;
            }
        }
        return false;
    }

})();

/* ═══════════════════════════════════════════════════════════
   Vanvy · 音量记忆 (吸收 DefaultMuteVolume)
   默认记住上次音量, 新会话音量恢复 (key 用 vanvy_ 前缀防撞)
   ═══════════════════════════════════════════════════════════ */
(function () {
    "use strict";
    var VOLUME_KEY = "vanvy_session_volume";
    var LOCK_MS = 500;

    function getSavedVolume() {
        try {
            var v = parseFloat(localStorage.getItem(VOLUME_KEY));
            return isNaN(v) ? 1 : v; // 默认满音量 (比原版默认静音更友好)
        } catch (e) { return 1; }
    }

    function applyVolume(video) {
        if (!video || video.dataset.vanvyVolApplying === "true") return;
        // 排除群晖 extrafanart 的视频容器 (JavDB 预览等)
        if (video.closest(".jv-card-overlay") ||
            video.closest("#jv-similar-container") ||
            video.closest("#jv-image-container") ||
            video.closest("#jv-video-player")) return;
        var target = getSavedVolume();
        if (Math.abs(video.volume - target) > 0.05) {
            video.dataset.vanvyVolApplying = "true";
            video.volume = target;
            video.muted = (target === 0);
            setTimeout(function () { delete video.dataset.vanvyVolApplying; }, LOCK_MS);
        }
        if (!video.dataset.vanvyVolListener) {
            video.addEventListener("volumechange", function () {
                if (this.dataset.vanvyVolApplying === "true") return;
                try { localStorage.setItem(VOLUME_KEY, this.volume.toString()); } catch (e) { /* ignore */ }
            });
            video.dataset.vanvyVolListener = "true";
        }
    }

    // MutationObserver 捕获新 video
    var observer = new MutationObserver(function () {
        document.querySelectorAll("video").forEach(function (v) {
            setTimeout(function () { applyVolume(v); }, 300);
        });
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener("DOMContentLoaded", function () {
        observer.observe(document.body, { childList: true, subtree: true });
    });

    // 播放开始时强制应用
    document.addEventListener("play", function (e) {
        if (e.target && e.target.tagName === "VIDEO") applyVolume(e.target);
    }, true);

    // 视图切换
    window.addEventListener("viewshow", function () {
        setTimeout(function () {
            document.querySelectorAll("video").forEach(applyVolume);
        }, 500);
    });
})();