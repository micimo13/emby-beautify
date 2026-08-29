/**
 * =============================================================================
 *  Vanvy Emby Kit · 轮播内容策展加载器 (carousel-rules)
 *  ---------------------------------------------------------------------------
 *  吸收自: Baiganjia/EmbyCarouselGUI 的策展理念
 *  核心思想: 首页轮播不该是"随机抽卡", 而应是可以运营的内容位。
 *  通过一个可选的规则文件 vanvy/carousel-rules.json, 让轮播变成:
 *    - 每日推荐 / 近期上映 / 高分精选 / 随机合集 ...
 *  无配置文件时回退默认查询 (与旧版行为完全一致, 向后兼容)。
 *
 *  规则文件结构 (V1):
 *  {
 *    "version": 1,
 *    "rule": {
 *      "name": "每日推荐",                    // 规则名 (仅展示用)
 *      "types": ["Movie", "Series"],         // Movie / Series / BoxSet
 *      "libraries": [],                      // 空=全部库; 或 ["电影", "美剧"] 媒体库名称
 *      "sort": "PremiereDate",               // PremiereDate / CommunityRating /
 *                                            // DateCreated / ProductionYear / Random
 *      "order": "Descending",                // Ascending / Descending (Random 时忽略)
 *      "minPremiereDays": 45,                // 仅最近 N 天首映 (null=不限)
 *      "maxCount": 10,                       // 轮播保留数量
 *      "pin": ["流浪地球", "奥本海默"]        // 优先置顶 (名称模糊匹配, 可空)
 *    }
 *  }
 * =============================================================================
 */
(function () {
  'use strict';
  if (window.VanvyCarouselRules) return; // 幂等

  var RULES_URL = 'vanvy/carousel-rules.json';
  var RULES_TIMEOUT = 3000;

  var DEFAULT_RULE = {
    name: '默认推荐',
    types: ['Movie', 'Series'],
    libraries: [],
    sort: 'ProductionYear, PremiereDate, SortName',
    order: 'Descending',
    minPremiereDays: null,
    maxCount: 10,
    pin: []
  };

  var state = { loaded: false, rule: null, libs: null };

  /** 极简 fetch + 超时 (兼容旧浏览器) */
  function fetchJSON(url, timeoutMs) {
    return new Promise(function (resolve) {
      if (typeof fetch !== 'function') { resolve(null); return; }
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, timeoutMs || 3000);
      fetch(url, { cache: 'no-store' }).then(function (r) {
        if (done) return;
        done = true; clearTimeout(timer);
        if (!r.ok) { resolve(null); return; }
        r.json().then(resolve).catch(function () { resolve(null); });
      }).catch(function () {
        if (!done) { done = true; clearTimeout(timer); resolve(null); }
      });
    });
  }

  /** 调用 Emby API (复用 VanvyKit, 否则自包含极简版) */
  function injectCall(func, arg) {
    if (window.VanvyKit && typeof window.VanvyKit.injectCall === 'function') {
      return window.VanvyKit.injectCall(func, arg);
    }
    // 自包含极简实现 (banner 之前的兜底)
    return new Promise(function (resolve) {
      var hash = 'vcr' + Math.random().toString(36).slice(2, 10);
      var channel = null;
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel(hash);
        channel.addEventListener('message', function (e) { resolve(e.data); cleanup(); });
      } else if ('postMessage' in window) {
        window.addEventListener('message', function handler(e) {
          if (e.data && e.data.channel === hash) { resolve(e.data.message); cleanup(); }
        });
      }
      function cleanup() {
        if (channel) channel.close();
        var s = document.querySelector('script.vanvy-i-' + hash);
        if (s) s.remove();
      }
      var script = document.createElement('script');
      script.className = 'vanvy-i-' + hash;
      script.textContent = [
        'setTimeout(async () => {',
        '  async function __vcr' + hash + '(){',
        '    const client = await new Promise((res) => {',
        '      const t = setInterval(() => { if (window.ApiClient !== undefined) { clearInterval(t); res(window.ApiClient); } }, 16);',
        '      setTimeout(() => { clearInterval(t); res(null); }, 10000);',
        '    });',
        '    if (!client) return null;',
        '    return await client.' + func + '(' + arg + ');',
        '  }',
        '  try {',
        '    const result = await __vcr' + hash + '();',
        '    const ch = new BroadcastChannel(' + JSON.stringify(hash) + '); ch.postMessage(result);',
        '  } catch (err) {',
        '    const ch = new BroadcastChannel(' + JSON.stringify(hash) + '); ch.postMessage({ error: String(err) });',
        '  }',
        '  const s = document.querySelector("script.vanvy-i-' + hash + '"); if (s) s.remove();',
        '}, 16);'
      ].join('\n');
      (document.head || document.documentElement).appendChild(script);
    });
  }

  /** 解析规则: 合并默认值 + 容错 */
  function normalizeRule(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var r = raw.rule || raw;
    if (!r || typeof r !== 'object') return null;
    var rule = {
      name: typeof r.name === 'string' ? r.name : DEFAULT_RULE.name,
      types: Array.isArray(r.types) && r.types.length ? r.types : DEFAULT_RULE.types.slice(),
      libraries: Array.isArray(r.libraries) ? r.libraries.filter(function (x) { return typeof x === 'string' && x; }) : [],
      sort: typeof r.sort === 'string' && r.sort ? r.sort : DEFAULT_RULE.sort,
      order: r.order === 'Ascending' ? 'Ascending' : 'Descending',
      minPremiereDays: typeof r.minPremiereDays === 'number' && r.minPremiereDays > 0 ? r.minPremiereDays : null,
      maxCount: typeof r.maxCount === 'number' && r.maxCount > 0 ? Math.min(r.maxCount, 30) : DEFAULT_RULE.maxCount,
      pin: Array.isArray(r.pin) ? r.pin.filter(function (x) { return typeof x === 'string' && x; }) : []
    };
    return rule;
  }

  /** 获取媒体库列表 (CollectionFolder), 缓存 */
  function getLibraries() {
    if (state.libs) return Promise.resolve(state.libs);
    return injectCall('getItems', 'client.getCurrentUserId(), ' + JSON.stringify({
      Recursive: false,
      IncludeItemTypes: 'CollectionFolder',
      EnableTotalRecordCount: false
    })).then(function (data) {
      state.libs = (data && data.Items) || [];
      return state.libs;
    }).catch(function () { state.libs = []; return state.libs; });
  }

  /** 库名称 → parentId (取第一个匹配, 精确优先, 其次模糊) */
  function resolveLibraryId(names) {
    return getLibraries().then(function (libs) {
      if (!libs.length) return null;
      for (var i = 0; i < names.length; i++) {
        var hit = libs.filter(function (l) { return l.Name === names[i]; })[0];
        if (hit) return hit.Id;
      }
      for (var j = 0; j < names.length; j++) {
        var fuzzy = libs.filter(function (l) {
          return l.Name && l.Name.indexOf(names[j]) !== -1;
        })[0];
        if (fuzzy) return fuzzy.Id;
      }
      return null;
    });
  }

  /** 根据规则构造 Emby 查询 (核心) */
  function buildQuery() {
    var rule = state.rule || DEFAULT_RULE;
    var query = {
      ImageTypes: 'Backdrop',
      EnableImageTypes: 'Logo,Backdrop',
      IncludeItemTypes: rule.types.join(','),
      Recursive: true,
      ImageTypeLimit: 1,
      Limit: rule.maxCount,
      Fields: 'ProductionYear',
      SortBy: rule.sort,
      SortOrder: rule.order,
      EnableUserData: false,
      EnableTotalRecordCount: false
    };
    // Random: 删除排序字段
    if (/random/i.test(rule.sort)) {
      delete query.SortBy;
      delete query.SortOrder;
    }
    // 最近 N 天首映
    if (rule.minPremiereDays) {
      query.MinPremiereDate = new Date(Date.now() - rule.minPremiereDays * 86400000).toISOString();
    }
    // 指定媒体库
    if (rule.libraries.length) {
      return resolveLibraryId(rule.libraries).then(function (pid) {
        if (pid) query.ParentId = pid;
        return query;
      });
    }
    return Promise.resolve(query);
  }

  /** 优先置顶: 把 pin 命中的条目按配置顺序排到最前 */
  function applyPin(items) {
    var rule = state.rule;
    if (!rule || !rule.pin.length || !items || !items.length) return items;
    var pins = rule.pin.map(function (n) { return String(n).toLowerCase(); });
    var pinned = [], rest = [];
    for (var i = 0; i < items.length; i++) {
      var name = String(items[i].Name || '').toLowerCase();
      if (pins.indexOf(name) !== -1) { pinned.push(items[i]); }
      else { rest.push(items[i]); }
    }
    // 按 pin 配置顺序重排
    var ordered = [];
    for (var j = 0; j < pins.length; j++) {
      for (var k = 0; k < pinned.length; k++) {
        if (String(pinned[k].Name || '').toLowerCase() === pins[j]) {
          ordered.push(pinned[k]);
          break;
        }
      }
    }
    // 补充 pin 中未命中/重复的
    for (var m = 0; m < pinned.length; m++) {
      if (ordered.indexOf(pinned[m]) === -1) ordered.push(pinned[m]);
    }
    return ordered.concat(rest);
  }

  /** 加载规则 (幂等, 可重试) */
  function load() {
    return fetchJSON(RULES_URL, RULES_TIMEOUT).then(function (raw) {
      state.rule = normalizeRule(raw);
      state.loaded = true;
      if (state.rule) {
        console.log('[VanvyCarouselRules] 已加载策展规则: ' + state.rule.name);
      } else {
        console.log('[VanvyCarouselRules] 无规则文件, 使用默认查询');
      }
      return state;
    });
  }

  window.VanvyCarouselRules = {
    loaded: false,
    rule: null,
    load: load,
    buildQuery: buildQuery,
    applyPin: applyPin,
    getLibraries: getLibraries,
    resolveLibraryId: resolveLibraryId,
    injectCall: injectCall,
    getState: function () { return state; }
  };

  // 自动加载 (非阻塞, 失败静默回退默认)
  load().then(function (s) {
    window.VanvyCarouselRules.loaded = s.loaded;
    window.VanvyCarouselRules.rule = s.rule;
  }).catch(function () {
    window.VanvyCarouselRules.loaded = false;
  });
})();
