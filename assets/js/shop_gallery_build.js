// assets/js/shop_gallery_build.js
(function () {
  "use strict";

  function $(sel) { return document.querySelector(sel); }

  function getArtList() {
    return Array.isArray(window.MELKAPOW_ART) ? window.MELKAPOW_ART : [];
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

  function buildShopGallery(products) {
    var wrap = $("#shopGallery");
    if (!wrap) return;

    wrap.innerHTML = "";

    if (!products || typeof products !== "object") {
      return;
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

      var img = document.createElement("img");
      img.src = String(art.thumb || "");
      img.alt = art.alt || art.title || String(art.id);
      img.loading = "lazy";
      img.decoding = "async";

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
      else shopStatusEl.textContent = "No shop items are listed right now.";
    }
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

  function loadShopCatalog(timeoutMs) {
    var existing = window.MELKAPOW_PRODUCTS_BY_ART_ID;
    if (existing && typeof existing === "object") return Promise.resolve(existing);

    var inflight = window.MELKAPOW_SHOP_CATALOG_PROMISE;
    if (inflight && typeof inflight.then === "function") return inflight;

    var apiBase = getApiBase();
    if (!apiBase || typeof fetch !== "function") return Promise.resolve(null);

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () {
        try { controller.abort(); } catch (_) { /* ignore */ }
      }, Math.max(500, parseInt(timeoutMs, 10) || 2500));
    }

    var promise = fetch(apiBase + "/api/shop/catalog", {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) throw new Error("shop-catalog-unavailable");
        return res.json().catch(function () { return null; });
      })
      .then(function (data) {
        if (!data || typeof data !== "object") return null;
        var products = data.products;
        if (!products || typeof products !== "object") return null;
        window.MELKAPOW_PRODUCTS_BY_ART_ID = products;
        return products;
      })
      .catch(function () { return null; })
      .finally(function () {
        if (timer) clearTimeout(timer);
        if (window.MELKAPOW_SHOP_CATALOG_PROMISE === promise) window.MELKAPOW_SHOP_CATALOG_PROMISE = null;
      });

    window.MELKAPOW_SHOP_CATALOG_PROMISE = promise;
    return promise;
  }

  function init() {
    var wrap = $("#shopGallery");
    if (!wrap) return;

    shopStatusEl = $("#shopStatus");

    buildShopGallery(window.MELKAPOW_PRODUCTS_BY_ART_ID);

    if (!isShopEnabled()) {
      if (shopStatusEl) shopStatusEl.textContent = "Shop temporarily unavailable.";
      return;
    }

    if (shopStatusEl) shopStatusEl.textContent = "Loading shop catalog…";

    loadShopCatalog(8000)
      .then(function (products) {
        if (!products) {
          if (shopStatusEl) shopStatusEl.textContent = "Shop temporarily unavailable.";
          return;
        }
        buildShopGallery(products);
      })
      .catch(function () {
        if (shopStatusEl) shopStatusEl.textContent = "Shop temporarily unavailable.";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
