// assets/js/shop_gallery_build.js
(function () {
  "use strict";

  var PLACEHOLDER_IMG_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  var THUMB_DIR = "__IMAGE_REMOVED__";
  var SHOP_CATALOG_STORAGE_KEY = "melkapow_shop_catalog_v1";
  var SHOP_CATALOG_STORAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  var SHOP_CATALOG_TOTAL_WAIT_MS = 90000; // Render free tier cold starts can be ~1 minute
  var SHOP_CATALOG_TIMEOUT_MS = 15000;

  function $(sel) { return document.querySelector(sel); }

  function getArtList() {
    return Array.isArray(window.MELKAPOW_ART) ? window.MELKAPOW_ART : [];
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function getLocalStorage() {
    try {
      if (!window.localStorage) return null;
      var testKey = "__melkapow_shop_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (_) {
      return null;
    }
  }

  function readCatalogCache(apiBase) {
    var storage = getLocalStorage();
    if (!storage) return null;

    var raw = null;
    try {
      raw = storage.getItem(SHOP_CATALOG_STORAGE_KEY);
    } catch (_) {
      raw = null;
    }
    if (!raw) return null;

    var parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    var cacheBase = String(parsed.apiBase || "").replace(/\/+$/, "");
    if (!cacheBase || cacheBase !== String(apiBase || "").replace(/\/+$/, "")) return null;

    var ts = parseInt(parsed.ts, 10) || 0;
    if (!ts) return null;
    if (Date.now() - ts > SHOP_CATALOG_STORAGE_MAX_AGE_MS) return null;

    var products = parsed.products;
    if (!products || typeof products !== "object") return null;
    return products;
  }

  function writeCatalogCache(apiBase, products) {
    var storage = getLocalStorage();
    if (!storage) return;
    if (!apiBase || !products || typeof products !== "object") return;

    try {
      storage.setItem(
        SHOP_CATALOG_STORAGE_KEY,
        JSON.stringify({ apiBase: String(apiBase).replace(/\/+$/, ""), ts: Date.now(), products: products })
      );
    } catch (_) {
      // ignore quota / privacy errors
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, parseInt(ms, 10) || 0));
    });
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    if (typeof fetch !== "function") return Promise.reject(new Error("fetch-unavailable"));

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () {
        try { controller.abort(); } catch (_) { /* ignore */ }
      }, Math.max(500, parseInt(timeoutMs, 10) || SHOP_CATALOG_TIMEOUT_MS));
    }

    var opts = options && typeof options === "object" ? options : {};
    if (controller) opts.signal = controller.signal;

    return fetch(url, opts).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function parseRetryAfterMs(value) {
    var raw = String(value || "").trim();
    if (!raw) return 0;
    var n = parseInt(raw, 10);
    if (!isFinite(n) || n <= 0) return 0;
    return n * 1000;
  }

  function isRetriableHttpStatus(status) {
    var code = parseInt(status, 10) || 0;
    if (code === 429) return true;
    return code >= 500 && code <= 599;
  }

  function isRemoteUrl(url) {
    var s = String(url || "");
    return /^https?:\/\//i.test(s) || /^data:/i.test(s);
  }

  function slugify(value) {
    var val = String(value || "").trim().toLowerCase();
    val = val.replace(/[^a-z0-9]+/g, "-");
    val = val.replace(/^-+/, "").replace(/-+$/, "");
    return val;
  }

  function basenameWithoutExt(path) {
    var raw = String(path || "");
    if (!raw) return "";
    var clean = raw.split("?")[0].split("#")[0];
    var parts = clean.split("/");
    var last = parts.length ? parts[parts.length - 1] : clean;
    return last.replace(/\.[a-z0-9]+$/i, "");
  }

  function basename(path) {
    var raw = String(path || "");
    if (!raw) return "";
    var clean = raw.split("?")[0].split("#")[0];
    var parts = clean.split("/");
    return parts.length ? parts[parts.length - 1] : clean;
  }

  function toThumbUrl(src) {
    var raw = String(src || "").trim();
    if (!raw) return "";
    if (isRemoteUrl(raw)) return raw;
    if (raw.indexOf("/thumbnails/") !== -1) return raw;

    var file = basename(raw);
    if (!file) return raw;
    return THUMB_DIR + file;
  }

  function getShopProductForArt(shopMap, art) {
    if (!shopMap || typeof shopMap !== "object" || !art) return null;

    var candidates = [];
    if (art.id) candidates.push(slugify(art.id));
    if (art.title) candidates.push(slugify(art.title));
    if (art.galleryTitle) candidates.push(slugify(art.galleryTitle));
    if (art.thumb) candidates.push(slugify(basenameWithoutExt(art.thumb)));
    if (art.thumb) candidates.push(slugify(basename(art.thumb)));

    for (var i = 0; i < candidates.length; i++) {
      var id = candidates[i];
      if (!id) continue;
      if (Object.prototype.hasOwnProperty.call(shopMap, id)) return shopMap[id];
    }

    return null;
  }

  var shopStatusEl = null;
  var shopCatalogHasNetworkResult = false;

  function ensureShopCatalogLoader() {
    if (window.MELKAPOW_SHOP_CATALOG && typeof window.MELKAPOW_SHOP_CATALOG.load === "function") {
      return window.MELKAPOW_SHOP_CATALOG;
    }

    var state = {
      status: "idle", // "idle" | "loading" | "ready" | "failed"
      promise: null,
      lastError: ""
    };

    function hydrateFromCache(apiBase) {
      var existing = window.MELKAPOW_PRODUCTS_BY_ART_ID;
      if (existing && typeof existing === "object") return existing;

      var cached = readCatalogCache(apiBase);
      if (cached && typeof cached === "object") {
        window.MELKAPOW_PRODUCTS_BY_ART_ID = cached;
        state.status = "ready";
        return cached;
      }
      return null;
    }

    function load(opts) {
      var options = opts && typeof opts === "object" ? opts : {};
      var apiBase = getApiBase();
      if (!apiBase || typeof fetch !== "function") return Promise.resolve(null);

      var forceRefresh = !!options.forceRefresh;
      var timeoutMs = parseInt(options.timeoutMs, 10) || SHOP_CATALOG_TIMEOUT_MS;
      var totalWaitMs = parseInt(options.totalWaitMs, 10) || SHOP_CATALOG_TOTAL_WAIT_MS;

      hydrateFromCache(apiBase);

      var existing = window.MELKAPOW_PRODUCTS_BY_ART_ID;
      var hadExisting = !!(existing && typeof existing === "object");

      if (hadExisting && !forceRefresh) {
        state.status = "ready";
        return Promise.resolve(existing);
      }

      if (state.promise) return state.promise;

      var start = Date.now();
      var attempt = 0;
      var delayMs = 750;

      // If we already have cached products, keep the UI "ready" while we refresh in the background.
      state.status = hadExisting ? "ready" : "loading";

      function stillWaiting() {
        return Date.now() - start < totalWaitMs;
      }

      function fetchOnce() {
        attempt += 1;
        return fetchWithTimeout(apiBase + "/api/shop/catalog", {
          method: "GET",
          headers: { "Accept": "application/json" },
          cache: "no-store"
        }, timeoutMs)
          .then(function (res) {
            if (!res.ok) {
              var err = new Error("http-" + String(res.status));
              err.status = res.status;
              err.retryAfterMs = parseRetryAfterMs(res.headers && res.headers.get ? res.headers.get("Retry-After") : "");
              throw err;
            }
            return res.json().catch(function () { return null; });
          })
          .then(function (data) {
            if (!data || typeof data !== "object") throw new Error("invalid-catalog");
            var products = data.products;
            if (!products || typeof products !== "object") throw new Error("invalid-catalog");

            window.MELKAPOW_PRODUCTS_BY_ART_ID = products;
            writeCatalogCache(apiBase, products);
            state.status = "ready";
            state.lastError = "";
            shopCatalogHasNetworkResult = true;
            return products;
          })
          .catch(function (err) {
            var status = err && err.status ? parseInt(err.status, 10) : 0;

            // Non-retriable 4xx (except 429 rate limit).
            if (status && status < 500 && status !== 429) {
              state.status = hadExisting ? "ready" : "failed";
              state.lastError = err && err.message ? String(err.message) : "request-failed";
              return null;
            }

            if (!stillWaiting()) {
              state.status = hadExisting ? "ready" : "failed";
              state.lastError = err && err.message ? String(err.message) : "timeout";
              return null;
            }

            // Retry on network errors, timeouts, 429, and 5xx.
            if (status && !isRetriableHttpStatus(status)) {
              state.status = hadExisting ? "ready" : "failed";
              state.lastError = err && err.message ? String(err.message) : "request-failed";
              return null;
            }

            var waitMs = Math.max(750, delayMs);
            if (err && err.retryAfterMs) {
              waitMs = Math.max(waitMs, parseInt(err.retryAfterMs, 10) || 0);
            }

            delayMs = Math.min(8000, Math.round(delayMs * 1.6));
            return sleep(waitMs).then(fetchOnce);
          });
      }

      var promise = fetchOnce().finally(function () {
        state.promise = null;
        if (window.MELKAPOW_SHOP_CATALOG_PROMISE === promise) window.MELKAPOW_SHOP_CATALOG_PROMISE = null;
      });

      state.promise = promise;
      // Back-compat for any scripts that look for this global inflight.
      window.MELKAPOW_SHOP_CATALOG_PROMISE = promise;
      return promise;
    }

    function warm() {
      var apiBase = getApiBase();
      if (!apiBase || typeof fetch !== "function") return;
      fetchWithTimeout(apiBase + "/api/health", { method: "GET", headers: { "Accept": "application/json" }, cache: "no-store" }, 5000)
        .catch(function () { /* ignore */ });
    }

    var loader = {
      hydrateFromCache: function () { return hydrateFromCache(getApiBase()); },
      load: load,
      warm: warm,
      getStatus: function () { return state.status; },
      getLastError: function () { return state.lastError; }
    };

    window.MELKAPOW_SHOP_CATALOG = loader;
    return loader;
  }

  // Kick off a warm-up request ASAP (before DOMContentLoaded) so Render can wake up.
  // UI updates still happen in `init()` once the DOM is ready.
  (function prewarmShop() {
    var loader = ensureShopCatalogLoader();
    loader.warm();
    loader.hydrateFromCache();
    loader.load({ timeoutMs: SHOP_CATALOG_TIMEOUT_MS, totalWaitMs: SHOP_CATALOG_TOTAL_WAIT_MS, forceRefresh: true });
  })();

  function buildShopGallery(products) {
    var wrap = $("#shopGallery");
    if (!wrap) return 0;

    wrap.innerHTML = "";

    if (!products || typeof products !== "object") {
      return 0;
    }

    var list = getArtList();
    var count = 0;

    for (var i = 0; i < list.length; i++) {
      var art = list[i];
      if (!art || !art.id) continue;
      if (!getShopProductForArt(products, art)) continue;

      var a = document.createElement("a");
      a.className = "gallery-item";
      a.href = "#shop-" + String(art.id);

      var fullThumbSrc = String(art.thumb || "").trim();
      var thumbSrc = toThumbUrl(fullThumbSrc);

      var img = document.createElement("img");
      img.src = PLACEHOLDER_IMG_SRC;
      img.setAttribute("data-src", thumbSrc || fullThumbSrc);
      img.alt = art.alt || art.title || String(art.id);
      img.loading = "lazy";
      img.decoding = "async";

      if (thumbSrc && fullThumbSrc && thumbSrc !== fullThumbSrc) {
        img.setAttribute("data-fallback-src", fullThumbSrc);
        img.addEventListener("error", function onError() {
          img.removeEventListener("error", onError);
          var fallback = img.getAttribute("data-fallback-src");
          if (fallback) img.src = fallback;
        });
      }

      var cap = document.createElement("span");
      cap.className = "caption";
      cap.textContent = art.galleryTitle || art.title || String(art.id);

      a.appendChild(img);
      a.appendChild(cap);
      wrap.appendChild(a);
      count++;
    }

    if (shopStatusEl) {
      if (count) shopStatusEl.textContent = "";
      else if (shopCatalogHasNetworkResult) shopStatusEl.textContent = "No shop items are listed right now.";
    }

    return count;
  }

  function getApiBase() {
    var base = window.MELKAPOW_API_BASE;
    if (typeof base === "string" && base.trim()) return base.replace(/\/+$/, "");

    var host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]" || host === "0:0:0:0:0:0:0:1") {
      return "http://127.0.0.1:8000";
    }

    var isPrivateIp = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(host);
    if (isPrivateIp) return location.protocol + "//" + host + ":8000";

    return "";
  }

  function isShopEnabled() {
    var apiBase = getApiBase();
    return !!(apiBase && typeof fetch === "function");
  }

  function init() {
    var wrap = $("#shopGallery");
    if (!wrap) return;

    shopStatusEl = $("#shopStatus");
    var loader = ensureShopCatalogLoader();
    loader.warm();
    loader.hydrateFromCache();

    var initialCount = buildShopGallery(window.MELKAPOW_PRODUCTS_BY_ART_ID);

    if (!isShopEnabled()) {
      if (shopStatusEl) shopStatusEl.textContent = "Shop temporarily unavailable.";
      return;
    }

    if (shopStatusEl && initialCount === 0 && !shopCatalogHasNetworkResult) shopStatusEl.textContent = "Loading shop…";

    var nudgeTimer = null;
    if (shopStatusEl && initialCount === 0 && !shopCatalogHasNetworkResult) {
      nudgeTimer = setTimeout(function () {
        if (shopStatusEl && !shopCatalogHasNetworkResult) {
          shopStatusEl.textContent = "Waking up the shop… (this can take up to a minute)";
        }
      }, 12000);
    }

    loader
      .load({ timeoutMs: SHOP_CATALOG_TIMEOUT_MS, totalWaitMs: SHOP_CATALOG_TOTAL_WAIT_MS, forceRefresh: true })
      .then(function (products) {
        if (nudgeTimer) clearTimeout(nudgeTimer);

        if (products && typeof products === "object") {
          shopCatalogHasNetworkResult = true;
          buildShopGallery(products);
          return;
        }

        // If we have cached products, keep showing them even if refresh fails.
        var cached = window.MELKAPOW_PRODUCTS_BY_ART_ID;
        if (cached && typeof cached === "object") return;

        if (shopStatusEl) {
          shopStatusEl.textContent = "Shop is still starting up. Please refresh in a moment.";
        }
      })
      .catch(function () {
        if (nudgeTimer) clearTimeout(nudgeTimer);
        var cached = window.MELKAPOW_PRODUCTS_BY_ART_ID;
        if (cached && typeof cached === "object") return;
        if (shopStatusEl) shopStatusEl.textContent = "Shop temporarily unavailable.";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
