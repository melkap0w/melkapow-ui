// assets/js/art_build.js
(function () {
  "use strict";

  var PLACEHOLDER_IMG_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  function getArtList() {
    return Array.isArray(window.MELKAPOW_ART) ? window.MELKAPOW_ART : [];
  }

  function formatMoney(cents) {
    var n = parseInt(cents, 10);
    if (!isFinite(n)) n = 0;
    return "$" + (n / 100).toFixed(2);
  }

  var shopCatalogPromise = null;
  var shopCatalogStatus = "idle"; // "idle" | "loading" | "ready" | "failed"

  function getApiBase() {
    var base = window.MELKAPOW_API_BASE;
    if (typeof base === "string" && base.trim()) return base.replace(/\/+$/, "");

    var host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]" || host === "0:0:0:0:0:0:0:1") {
      return "http://127.0.0.1:8000";
    }

    // Allow LAN testing (phone on same Wi‑Fi)
    var isPrivateIp = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(host);
    if (isPrivateIp) return location.protocol + "//" + host + ":8000";

    return "";
  }

  function isShopEnabled() {
    var apiBase = getApiBase();
    return !!(apiBase && typeof fetch === "function");
  }

  function loadShopCatalog(opts) {
    var options = (opts && typeof opts === "object") ? opts : { timeoutMs: opts };
    var timeoutMs = parseInt(options.timeoutMs, 10) || 8000;
    var totalWaitMs = parseInt(options.totalWaitMs, 10) || 90000;
    var forceRefresh = !!options.forceRefresh;

    var existing = window.MELKAPOW_PRODUCTS_BY_ART_ID;
    var hadExisting = !!(existing && typeof existing === "object");
    if (hadExisting && !forceRefresh) {
      shopCatalogStatus = "ready";
      return Promise.resolve(existing);
    }

    var apiBase = getApiBase();
    if (!apiBase || typeof fetch !== "function") {
      shopCatalogStatus = hadExisting ? "ready" : "failed";
      return Promise.resolve(null);
    }

    // Prefer the shared loader from shop_gallery_build.js to avoid duplicate wake/retry loops.
    var shared = window.MELKAPOW_SHOP_CATALOG;
    if (shared && typeof shared.load === "function") {
      if (shopCatalogPromise) return shopCatalogPromise;

      // Keep UI usable if we have cached catalog data.
      shopCatalogStatus = hadExisting ? "ready" : "loading";

      shopCatalogPromise = Promise.resolve(
        shared.load({ timeoutMs: timeoutMs, totalWaitMs: totalWaitMs, forceRefresh: forceRefresh })
      )
        .then(function (products) {
          if (products && typeof products === "object") {
            shopCatalogStatus = "ready";
            return products;
          }
          shopCatalogStatus = hadExisting ? "ready" : "failed";
          return null;
        })
        .catch(function () {
          shopCatalogStatus = hadExisting ? "ready" : "failed";
          return null;
        })
        .finally(function () {
          shopCatalogPromise = null;
        });

      return shopCatalogPromise;
    }

    if (shopCatalogPromise) return shopCatalogPromise;
    shopCatalogStatus = hadExisting ? "ready" : "loading";

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () {
        try { controller.abort(); } catch (_) { /* ignore */ }
      }, Math.max(500, parseInt(timeoutMs, 10) || 1500));
    }

    shopCatalogPromise = fetch(apiBase + "/api/shop/catalog", {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) throw new Error("shop-catalog-unavailable");
        return res.json().catch(function () { return null; });
      })
      .then(function (data) {
        if (!data || typeof data !== "object") {
          shopCatalogStatus = hadExisting ? "ready" : "failed";
          return null;
        }
        var products = data.products;
        if (!products || typeof products !== "object") {
          shopCatalogStatus = hadExisting ? "ready" : "failed";
          return null;
        }
        window.MELKAPOW_PRODUCTS_BY_ART_ID = products;
        shopCatalogStatus = "ready";
        return products;
      })
      .catch(function () {
        shopCatalogStatus = hadExisting ? "ready" : "failed";
        return null;
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
        shopCatalogPromise = null;
      });

    return shopCatalogPromise;
  }

  function removeGeneratedArticles(mainEl) {
    var existing = mainEl.querySelectorAll('article[data-generated="shop-art"]');
    for (var i = existing.length - 1; i >= 0; i--) {
      existing[i].parentNode.removeChild(existing[i]);
    }
  }

  function normalizeLegacySizeId(optionId) {
    var id = String(optionId || "");
    if (!id) return "";
    return id.replace(/^canvas-/, "").replace(/^print-/, "");
  }

  function mapLegacyOptionsToSizes(options) {
    var list = Array.isArray(options) ? options : [];
    var sizes = [];

    for (var i = 0; i < list.length; i++) {
      var opt = list[i];
      if (!opt || !opt.id) continue;

      var sizeId = normalizeLegacySizeId(opt.id);
      if (!sizeId) continue;

      sizes.push({
        id: sizeId,
        label: opt.label || sizeId,
        priceCents: parseInt(opt.priceCents, 10) || 0
      });
    }

    sortSizesAscending(sizes);
    return sizes;
  }

  // Support common label formats like:
  // - "12×18"
  // - "12 x 18 in"
  // - "12″ × 18″"
  // - "12in x 18in"
  var SIZE_RE = /(\d+(?:\.\d+)?)[^0-9]*[x×][^0-9]*(\d+(?:\.\d+)?)/i;

  function parseSizeDims(value) {
    var text = String(value || "");
    if (!text) return null;
    var m = SIZE_RE.exec(text);
    if (!m) return null;

    var a = parseFloat(m[1]);
    var b = parseFloat(m[2]);
    if (!isFinite(a) || !isFinite(b)) return null;

    var small = Math.min(a, b);
    var large = Math.max(a, b);
    return { area: small * large, large: large, small: small };
  }

  function sortSizesAscending(sizes) {
    if (!Array.isArray(sizes) || sizes.length < 2) return;

    sizes.sort(function (a, b) {
      var da = parseSizeDims(a && (a.id || a.label)) || parseSizeDims(a && a.label);
      var db = parseSizeDims(b && (b.id || b.label)) || parseSizeDims(b && b.label);

      if (!da && !db) {
        var la = String((a && (a.label || a.id)) || "");
        var lb = String((b && (b.label || b.id)) || "");
        return la.localeCompare(lb);
      }
      if (!da) return 1;
      if (!db) return -1;

      if (da.area !== db.area) return da.area < db.area ? -1 : 1;
      if (da.large !== db.large) return da.large < db.large ? -1 : 1;
      if (da.small !== db.small) return da.small < db.small ? -1 : 1;

      var sa = String((a && (a.label || a.id)) || "");
      var sb = String((b && (b.label || b.id)) || "");
      return sa.localeCompare(sb);
    });
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

    var seen = {};
    var matches = [];
    for (var i = 0; i < candidates.length; i++) {
      var id = candidates[i];
      if (!id || seen[id]) continue;
      seen[id] = true;
      if (Object.prototype.hasOwnProperty.call(shopMap, id)) matches.push(shopMap[id]);
    }

    if (!matches.length) return null;
    if (matches.length === 1) return matches[0];

    var merged = { finishes: [], finishThumbUrls: {} };

    function mergeFinish(fromFinish) {
      if (!fromFinish || typeof fromFinish !== "object" || !fromFinish.id) return;

      var finishId = String(fromFinish.id);
      var finishLabel = String(fromFinish.label || fromFinish.id);

      var existing = null;
      for (var j = 0; j < merged.finishes.length; j++) {
        if (merged.finishes[j] && merged.finishes[j].id === finishId) {
          existing = merged.finishes[j];
          break;
        }
      }

      if (!existing) {
        existing = { id: finishId, label: finishLabel, sizes: [] };
        if (fromFinish.description) existing.description = String(fromFinish.description);
        merged.finishes.push(existing);
      } else {
        if (!existing.label && finishLabel) existing.label = finishLabel;
        if (!existing.description && fromFinish.description) existing.description = String(fromFinish.description);
      }

      var sizesRaw = Array.isArray(fromFinish.sizes) ? fromFinish.sizes : [];
      var have = {};
      for (var k = 0; k < existing.sizes.length; k++) {
        var s0 = existing.sizes[k];
        if (s0 && s0.id) have[String(s0.id)] = true;
      }
      for (var s = 0; s < sizesRaw.length; s++) {
        var size = sizesRaw[s];
        if (!size || !size.id) continue;
        var sid = String(size.id);
        if (have[sid]) continue;
        existing.sizes.push(size);
        have[sid] = true;
      }
    }

    for (var m = 0; m < matches.length; m++) {
      var product = matches[m];
      if (!product || typeof product !== "object") continue;

      if (product.thumbUrl && !merged.thumbUrl) merged.thumbUrl = String(product.thumbUrl);

      var thumbs = product.finishThumbUrls;
      if (thumbs && typeof thumbs === "object") {
        Object.keys(thumbs).forEach(function (key) {
          if (!key) return;
          if (!merged.finishThumbUrls[key]) merged.finishThumbUrls[key] = thumbs[key];
        });
      }

      var finishes = Array.isArray(product.finishes) ? product.finishes : [];
      for (var f = 0; f < finishes.length; f++) mergeFinish(finishes[f]);
    }

    return merged;
  }

  function getCatalogForArt(art) {
    var shopMap = window.MELKAPOW_PRODUCTS_BY_ART_ID;
    var usingShop = shopCatalogStatus === "ready" && shopMap && typeof shopMap === "object";

    if (usingShop) {
      var shopProducts = getShopProductForArt(shopMap, art);
      if (!shopProducts) return { finishes: [] };
      var finishesRaw = Array.isArray(shopProducts.finishes) ? shopProducts.finishes : null;
      if (!finishesRaw) return { finishes: [] };

      var finishes = [];
      for (var i = 0; i < finishesRaw.length; i++) {
        var f = finishesRaw[i] || {};
        if (!f.id) continue;

        var sizesRaw = Array.isArray(f.sizes) ? f.sizes : [];
        var sizes = [];
        for (var j = 0; j < sizesRaw.length; j++) {
          var s = sizesRaw[j] || {};
          if (!s.id) continue;

          sizes.push({
            id: String(s.id),
            label: String(s.label || s.id),
            priceCents: parseInt(s.priceCents, 10) || 0,
            currency: s.currency ? String(s.currency) : "",
            printfulVariantId: s.printfulVariantId,
            printfulSyncVariantId: s.printfulSyncVariantId,
            printfulProductId: s.printfulProductId
          });
        }

        if (!sizes.length) continue;

        sortSizesAscending(sizes);
        finishes.push({
          id: String(f.id),
          label: String(f.label || f.id),
          sizes: sizes
        });
      }

      return { finishes: finishes };
    }

    // If shop is enabled, do not fall back to hardcoded options.
    if (isShopEnabled()) return { finishes: [] };

    var defaults = window.MELKAPOW_PRODUCTS_DEFAULT || {};
    var src = art && art.products ? art.products : defaults;

    var finishesRaw = Array.isArray(src.finishes)
      ? src.finishes
      : (Array.isArray(defaults.finishes) ? defaults.finishes : null);

    // Back-compat: if someone still uses { canvas: [], prints: [] }.
    if (!finishesRaw) {
      var canvas = Array.isArray(src.canvas) ? src.canvas : (Array.isArray(defaults.canvas) ? defaults.canvas : []);
      var prints = Array.isArray(src.prints) ? src.prints : (Array.isArray(defaults.prints) ? defaults.prints : []);

      finishesRaw = [];
      if (prints.length) {
        finishesRaw.push({
          id: "fine-art-print",
          label: "Fine Art Print",
          sizes: mapLegacyOptionsToSizes(prints)
        });
      }
      if (canvas.length) {
        finishesRaw.push({
          id: "canvas",
          label: "Canvas",
          sizes: mapLegacyOptionsToSizes(canvas)
        });
      }
    }

    var finishes = [];
    for (var i = 0; i < finishesRaw.length; i++) {
      var f = finishesRaw[i] || {};
      if (!f.id) continue;

      var sizesRaw = Array.isArray(f.sizes) ? f.sizes : [];
      var sizes = [];
      for (var j = 0; j < sizesRaw.length; j++) {
        var s = sizesRaw[j] || {};
        if (!s.id) continue;

        sizes.push({
          id: String(s.id),
          label: String(s.label || s.id),
          priceCents: parseInt(s.priceCents, 10) || 0
        });
      }

      if (!sizes.length) continue;

      sortSizesAscending(sizes);
      finishes.push({
        id: String(f.id),
        label: String(f.label || f.id),
        sizes: sizes
      });
    }

    return { finishes: finishes };
  }

  function setPurchaseStatus(statusEl, message) {
    if (!statusEl) return;
    var text = String(message || "");
    statusEl.textContent = text;
    if (!text) {
      statusEl.removeAttribute("data-state");
      return;
    }
    if (/added to cart/i.test(text)) {
      statusEl.setAttribute("data-state", "success");
      return;
    }
    statusEl.setAttribute("data-state", "error");
  }

  function buildUnavailablePurchaseBox(art) {
    var box = document.createElement("div");
    box.className = "box purchase-box purchase-box-unavailable";

    var heading = document.createElement("h3");
    heading.textContent = "Buy Options";
    box.appendChild(heading);

    var message = document.createElement("p");
    message.className = "purchase-unavailable align-center";
    message.textContent = "Out of stock.";
    box.appendChild(message);
    return box;
  }

  function buildShopUnavailablePurchaseBox() {
    var box = document.createElement("div");
    box.className = "box purchase-box purchase-box-unavailable";

    var heading = document.createElement("h3");
    heading.textContent = "Buy Options";
    box.appendChild(heading);

    var message = document.createElement("p");
    message.className = "purchase-unavailable align-center";
    message.textContent = "Shop temporarily unavailable.";
    box.appendChild(message);

    return box;
  }

  function buildLoadingPurchaseBox() {
    var box = document.createElement("div");
    box.className = "box purchase-box purchase-box-unavailable";

    var heading = document.createElement("h3");
    heading.textContent = "Buy Options";
    box.appendChild(heading);

    var message = document.createElement("p");
    message.className = "purchase-unavailable align-center";
    message.textContent = "Loading options…";
    box.appendChild(message);

    return box;
  }

  var DEFAULT_DESCRIPTION_LINES = [
	    "Canvas Depth: 1.25″ (3.18 cm)",
      "Material: Polyester / Cotton blend",
	    "Finish: Textured, fade-resistant canvas (OBA-free)",
	    "Hardware: Mounting brackets included",
	    "Origin: US / Canada / Europe / UK / Australia (varies)"
	  ];

	  var STATIC_DESCRIPTION_LINES = {
	    canvas: [
	      "Canvas Depth: 1.25″ (3.18 cm)",
        "Material: Polyester / Cotton blend",
	      "Finish: Textured, fade-resistant canvas (OBA-free)",
	      "Hardware: Mounting brackets included",
	      "Origin: US / Canada / Europe / UK / Australia (varies on location)"
	    ],
	    "framed-canvas": [
	      "Canvas: Polyester / Cotton blend",
	      "Frame thickness: 1.25″ (3.18 cm)",
	      "Hardware: Hanging hardware attached",
	      "Style: Floating frame effect",
	      "Origin: Canada / UK / US"
	    ],
	    "canvas-frame": [
	      "Frame: Pine",
	      "Canvas: Polyester / cotton blend",
	      "Frame thickness: 1.25″ (3.18 cm)",
	      "Hardware: Hanging hardware attached",
	      "Style: Floating frame effect",
	      "Origin: Canada / UK / US"
	    ],
	    "gloss-metal-print": [
	      "Technique: Dye-sublimation transfer (heat)",
	      "Surface: Aluminum metal (corrosion resistant)",
	      "Backing: MDF wood frame",
	      "Coating: Protective layer for color fidelity",
	      "Finish: Gloss for vivid depth",
	      "Origin: US"
	    ],
	    "metal-print": [
	      "Technique: Dye-sublimation transfer (heat)",
	      "Surface: Aluminum metal (corrosion resistant)",
	      "Backing: MDF wood frame",
	      "Coating: Protective layer for color fidelity",
	      "Finish: Gloss for vivid depth",
	      "Origin: US"
	    ],
	    metal: [
	      "Technique: Dye-sublimation transfer (heat)",
	      "Surface: Aluminum metal (corrosion resistant)",
	      "Backing: MDF wood frame",
	      "Coating: Protective layer for color fidelity",
	      "Finish: Gloss for vivid depth",
	      "Origin: US"
	    ]
	  };

  var DEFAULT_DESCRIPTION_TEXT = DEFAULT_DESCRIPTION_LINES.join("\n");

  function splitDescriptionText(text) {
    var raw = String(text || "").trim();
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  }

  function mapFinishId(finishId) {
    if (!finishId) return "";
    return String(finishId || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
  }

  function resolveArtCollectionLabel(art) {
    var info = art && art.productInfo && typeof art.productInfo === "object" ? art.productInfo : null;
    var raw = info && info.collection ? String(info.collection).trim().toLowerCase() : "";
    return raw === "classic" ? "Classic Collection" : "Grandeur Collection";
  }

  function isMetalFinishId(finishId) {
    var id = mapFinishId(finishId);
    return id === "metal-print" || id === "gloss-metal-print" || id === "metal";
  }

  function resolveCollectionHeading(art, finish) {
    if (finish && isMetalFinishId(finish.id)) return "Metal Collection";
    return resolveArtCollectionLabel(art);
  }

  function resolveDescriptionText(art, finish) {
    var finishId = finish ? mapFinishId(finish.id) : "";
    var staticLines = STATIC_DESCRIPTION_LINES[finishId];
    if (staticLines && staticLines.length) {
      return staticLines.join("\n");
    }
    if (finish && finish.description) return String(finish.description).trim();
    if (art && art.description) return String(art.description).trim();
    return DEFAULT_DESCRIPTION_TEXT;
  }

  function createDescriptionContainer(art) {
    var container = document.createElement("div");
    container.className = "purchase-description";

    var heading = document.createElement("h4");
    heading.textContent = resolveCollectionHeading(art, null);
    container.appendChild(heading);

    var dl = document.createElement("dl");
    dl.className = "purchase-specs";
    container.appendChild(dl);

    return { container: container, specs: dl, heading: heading };
  }

  function updateDescriptionSpecs(specsEl, text) {
    if (!specsEl) return;
    var lines = splitDescriptionText(text);
    specsEl.innerHTML = "";

    lines.forEach(function (line) {
      var idx = line.indexOf(":");
      var label = "";
      var value = "";

      if (idx > 0 && idx < line.length - 1) {
        label = line.slice(0, idx).trim();
        value = line.slice(idx + 1).trim();
      }

      if (label && value) {
        var dt = document.createElement("dt");
        dt.textContent = label;
        var dd = document.createElement("dd");
        dd.textContent = value;
        specsEl.appendChild(dt);
        specsEl.appendChild(dd);
        return;
      }

      var dtNote = document.createElement("dt");
      dtNote.className = "sr-only";
      dtNote.textContent = "Detail";

      var ddNote = document.createElement("dd");
      ddNote.className = "purchase-specs-note";
      ddNote.textContent = line;

      specsEl.appendChild(dtNote);
      specsEl.appendChild(ddNote);
    });

    specsEl.style.display = lines.length ? "" : "none";
  }

  function setMultilineText(el, text) {
    if (!el) return;

    var raw = String(text || "");
    raw = raw.replace(/<br\s*\/?>/gi, "\n").replace(/\\n/g, "\n");

    var lines = raw.split(/\r?\n/);
    el.textContent = "";

    for (var i = 0; i < lines.length; i++) {
      if (i) el.appendChild(document.createElement("br"));
      el.appendChild(document.createTextNode(lines[i]));
    }
  }

  function isUsOnlyFinish(finishObj) {
    if (!finishObj || !finishObj.id) return false;
    var id = mapFinishId(finishObj.id);
    return id === "metal-print" || id === "gloss-metal-print" || id === "metal";
  }

  function createImportantNotice() {
    var p = document.createElement("p");
    p.className = "purchase-important";
    p.hidden = true;

    var strong = document.createElement("strong");
    strong.textContent = "Important:";
    p.appendChild(strong);
    p.appendChild(document.createTextNode(" This product is available in the US only. If your shipping address is outside this region, please choose a different product."));
    return p;
  }

  function buildPurchaseBox(art) {
    var shopMode = isShopEnabled();
    if (!shopMode) return buildShopUnavailablePurchaseBox();
    if (shopCatalogStatus === "idle" || shopCatalogStatus === "loading") return buildLoadingPurchaseBox();
    if (shopCatalogStatus === "failed") return buildShopUnavailablePurchaseBox();

    var catalog = getCatalogForArt(art);
    if (!catalog.finishes.length) return buildUnavailablePurchaseBox(art);

    var box = document.createElement("div");
    box.className = "box purchase-box";

    var descriptionParts = createDescriptionContainer(art);
    box.appendChild(descriptionParts.container);
    var descriptionSpecs = descriptionParts.specs;
    var descriptionHeading = descriptionParts.heading;

    var importantNotice = createImportantNotice();
    box.appendChild(importantNotice);

    var form = document.createElement("form");
    form.className = "purchase-form";
    form.action = "#";
    form.addEventListener("submit", function (e) { e.preventDefault(); });

    var sectionHeading = document.createElement("h4");
    sectionHeading.className = "purchase-section-heading";
    sectionHeading.textContent = "Buy Options";
    form.appendChild(sectionHeading);

    var status = document.createElement("p");
    status.className = "purchase-status align-center";
    status.setAttribute("aria-live", "polite");

    var finishById = {};
    for (var i = 0; i < catalog.finishes.length; i++) {
      finishById[catalog.finishes[i].id] = catalog.finishes[i];
    }

    var defaultFinish = null;
    if (catalog.finishes.length === 1) {
      defaultFinish = catalog.finishes[0];
    } else {
      for (var df = 0; df < catalog.finishes.length; df++) {
        var cand = catalog.finishes[df];
        var candId = cand ? mapFinishId(cand.id) : "";
        if (candId === "canvas" || candId === "stretched-canvas") {
          defaultFinish = cand;
          break;
        }
      }
    }

    var fields = document.createElement("div");
    fields.className = "fields";

    var fieldFinish = document.createElement("div");
    fieldFinish.className = "field purchase-field purchase-field-finish";

    var finishId = "buy-" + String(art.id) + "-finish";
    var finishLabel = document.createElement("label");
    finishLabel.htmlFor = finishId;
    finishLabel.textContent = "Type";

    var finishSelect = document.createElement("select");
    finishSelect.id = finishId;
    finishSelect.name = "finish";
    finishSelect.className = "purchase-select purchase-select-finish";

    if (!defaultFinish) {
      var finishPlaceholder = document.createElement("option");
      finishPlaceholder.value = "";
      finishPlaceholder.textContent = "Select a type…";
      finishSelect.appendChild(finishPlaceholder);
    }

    for (var f = 0; f < catalog.finishes.length; f++) {
      var finish = catalog.finishes[f];
      var opt = document.createElement("option");
      opt.value = finish.id;
      opt.textContent = finish.label;
      finishSelect.appendChild(opt);
    }

    fieldFinish.appendChild(finishLabel);
    fieldFinish.appendChild(finishSelect);

    var fieldSize = document.createElement("div");
    fieldSize.className = "field purchase-field purchase-field-size";

    var sizeId = "buy-" + String(art.id) + "-size";
    var sizeLabel = document.createElement("label");
    sizeLabel.htmlFor = sizeId;
    sizeLabel.textContent = "Size";

    var sizeSelect = document.createElement("select");
    sizeSelect.id = sizeId;
    sizeSelect.name = "size";
    sizeSelect.disabled = true;
    sizeSelect.className = "purchase-select purchase-select-size";

    fieldSize.appendChild(sizeLabel);
    fieldSize.appendChild(sizeSelect);

    var currentFinish = null;
    var sizeById = {};

    function setSizeOptions(finishObj) {
      currentFinish = finishObj || null;
      sizeById = {};

      sizeSelect.innerHTML = "";

      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = finishObj ? "Select a size…" : "Select a type first…";
      sizeSelect.appendChild(placeholder);

      if (!finishObj) {
        sizeSelect.disabled = true;
        if (descriptionHeading) descriptionHeading.textContent = resolveCollectionHeading(art, null);
        updateDescriptionSpecs(descriptionSpecs, resolveDescriptionText(art, null));
        importantNotice.hidden = true;
        return;
      }

      sizeSelect.disabled = false;
      if (descriptionHeading) descriptionHeading.textContent = resolveCollectionHeading(art, finishObj);

      for (var s = 0; s < finishObj.sizes.length; s++) {
        var size = finishObj.sizes[s];
        sizeById[size.id] = size;

        var o = document.createElement("option");
        o.value = size.id;
        o.textContent = size.label + " — " + formatMoney(size.priceCents);
        sizeSelect.appendChild(o);
      }

      updateDescriptionSpecs(descriptionSpecs, resolveDescriptionText(art, finishObj));
      importantNotice.hidden = !isUsOnlyFinish(finishObj);
    }

    setSizeOptions(null);

    finishSelect.addEventListener("change", function () {
      setPurchaseStatus(status, "");
      var selected = finishSelect.value || "";
      setSizeOptions(selected ? finishById[selected] : null);
    });

    if (defaultFinish) {
      finishSelect.value = defaultFinish.id;
      setSizeOptions(defaultFinish);
    }

    var fieldQty = document.createElement("div");
    fieldQty.className = "field purchase-field purchase-field-qty";

    var qtyId = "buy-" + String(art.id) + "-qty";
    var qtyLabel = document.createElement("label");
    qtyLabel.htmlFor = qtyId;
    qtyLabel.textContent = "Quantity";

    var qty = document.createElement("input");
    qty.type = "number";
    qty.min = "1";
    qty.max = "99";
    qty.value = "1";
    qty.id = qtyId;
    qty.name = "qty";
    qty.className = "purchase-qty";

    fieldQty.appendChild(qtyLabel);
    fieldQty.appendChild(qty);

    fields.appendChild(fieldFinish);
    fields.appendChild(fieldSize);
    fields.appendChild(fieldQty);
    form.appendChild(fields);

    var actions = document.createElement("ul");
    actions.className = "actions";

    var liAdd = document.createElement("li");
    var btnAdd = document.createElement("button");
    btnAdd.type = "button";
    btnAdd.className = "button primary";
    btnAdd.textContent = "Add to Cart";
    liAdd.appendChild(btnAdd);
    actions.appendChild(liAdd);

    form.appendChild(actions);

    btnAdd.addEventListener("click", function () {
      setPurchaseStatus(status, "");

      if (!currentFinish) {
        setPurchaseStatus(status, "Please select a type.");
        return;
      }

      var selectedSizeId = sizeSelect.value || "";
      if (!selectedSizeId) {
        setPurchaseStatus(status, "Please select a size.");
        return;
      }

      var chosenSize = sizeById[selectedSizeId];
      if (!chosenSize) {
        setPurchaseStatus(status, "That size isn't available right now.");
        return;
      }

      if (!window.MELKAPOW_CART || typeof window.MELKAPOW_CART.add !== "function") {
        setPurchaseStatus(status, "Cart isn't available on this page.");
        return;
      }

      var qtyVal = parseInt(qty.value, 10);
      if (!isFinite(qtyVal) || qtyVal < 1) qtyVal = 1;
      if (qtyVal > 99) qtyVal = 99;

      var optionId = currentFinish.id + "::" + chosenSize.id;
      var optionLabel = currentFinish.label + " — " + chosenSize.label;

      window.MELKAPOW_CART.add({
        artId: art.id,
        title: art.title,
        thumb: art.thumb,
        optionId: optionId,
        optionLabel: optionLabel,
        finishId: currentFinish.id,
        finishLabel: currentFinish.label,
        sizeId: chosenSize.id,
        sizeLabel: chosenSize.label,
        printful_variant_id: chosenSize.printfulVariantId || null,
        printful_sync_variant_id: chosenSize.printfulSyncVariantId || null,
        printful_product_id: chosenSize.printfulProductId || null,
        priceCents: chosenSize.priceCents,
        qty: qtyVal
      });

      setPurchaseStatus(status, "Added to cart.");

      // Reset controls back to defaults for the next add.
      qty.value = "1";
      if (defaultFinish) {
        finishSelect.value = defaultFinish.id;
        setSizeOptions(defaultFinish);
      } else {
        finishSelect.value = "";
        setSizeOptions(null);
      }
    });

    box.appendChild(form);

    box.appendChild(status);
    return box;
  }

  function buildSlider(art) {
    var slides = Array.isArray(art.slides) ? art.slides.slice(0, 4) : [];
    if (slides.length === 0) return null;

    var slider = document.createElement("div");
    slider.className = "art-slider";

    var name = String(art.id) + "-slider";

    for (var i = 0; i < slides.length; i++) {
      var input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.id = String(art.id) + "-" + String(i + 1);
      input.setAttribute("data-slide-index", String(i));
      if (i === 0) input.checked = true;
      slider.appendChild(input);
    }

    var slidesEl = document.createElement("div");
    slidesEl.className = "slides";

    for (var j = 0; j < slides.length; j++) {
      var img = document.createElement("img");
      img.src = PLACEHOLDER_IMG_SRC;
      img.setAttribute("data-src", slides[j].src);
      img.alt = slides[j].alt || art.title || "";
      img.decoding = "async";
      img.loading = "lazy";
      slidesEl.appendChild(img);
    }

    slider.appendChild(slidesEl);

    if (slides.length > 1) {
      for (var k = 0; k < slides.length; k++) {
        var nav = document.createElement("div");
        nav.className = "nav nav-" + String(k + 1);

        var prevIdx = (k - 1 + slides.length) % slides.length;
        var nextIdx = (k + 1) % slides.length;

        var prev = document.createElement("label");
        prev.htmlFor = String(art.id) + "-" + String(prevIdx + 1);
        prev.textContent = "\u276E";

        var next = document.createElement("label");
        next.htmlFor = String(art.id) + "-" + String(nextIdx + 1);
        next.textContent = "\u276F";

        nav.appendChild(prev);
        nav.appendChild(next);
        slider.appendChild(nav);
      }
    }

    return slider;
  }

  function populateArtArticle(article, art) {
    if (!article || !art) return;
    if (article.getAttribute("data-rendered") === "true") return;

    var closeEl = null;
    var children = article.children;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child && child.classList && child.classList.contains("close")) {
        closeEl = child;
        break;
      }
    }
    if (closeEl && closeEl.parentNode) closeEl.parentNode.removeChild(closeEl);

    article.textContent = "";
    article.className = "from-shop";
    article.setAttribute("data-generated", "shop-art");
    article.setAttribute("data-rendered", "true");

    var heading = document.createElement("h2");
    heading.className = "major";
    heading.textContent = art.title || "Artwork";
    article.appendChild(heading);

    var slider = buildSlider(art);
    if (slider) article.appendChild(slider);

    if (art.caption) {
      var caption = document.createElement("p");
      caption.className = "mt-2rem art-caption";
      setMultilineText(caption, art.caption);
      article.appendChild(caption);
    }

    var purchase = buildPurchaseBox(art);
    if (purchase) article.appendChild(purchase);

    var actions = document.createElement("ul");
    actions.className = "actions";

    var liCart = document.createElement("li");
    var aCart = document.createElement("a");
    aCart.href = "#cart";
    aCart.className = "button primary";
    aCart.textContent = "View Cart";
    liCart.appendChild(aCart);

    var liBack = document.createElement("li");
    var aBack = document.createElement("a");
    aBack.href = "#shop";
    aBack.className = "button";
    aBack.textContent = "Back to Shop";
    liBack.appendChild(aBack);

    actions.appendChild(liBack);
    actions.appendChild(liCart);
    article.appendChild(actions);

    if (closeEl) article.appendChild(closeEl);
  }

  function refreshPurchaseBoxes() {
    var list = getArtList();
    if (!list.length) return;

    for (var i = 0; i < list.length; i++) {
      var art = list[i];
      if (!art || !art.id) continue;

      var article = document.getElementById("shop-" + String(art.id));
      if (!article) continue;
      if (article.getAttribute("data-rendered") !== "true") continue;

      var existing = article.querySelector(".purchase-box");
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      var next = buildPurchaseBox(art);
      if (!next) continue;

      var actions = article.querySelector("ul.actions");
      if (actions && actions.parentNode) actions.parentNode.insertBefore(next, actions);
      else article.appendChild(next);
    }
  }

  function buildArtArticles() {
    var mainEl = document.getElementById("main");
    if (!mainEl) return;

    var list = getArtList();
    if (list.length === 0) return;

    removeGeneratedArticles(mainEl);

    var insertBefore = document.getElementById("about");
    for (var i = 0; i < list.length; i++) {
      var art = list[i];
      if (!art || !art.id) continue;

      var article = document.createElement("article");
      article.id = "shop-" + String(art.id);
      article.className = "from-shop";
      article.setAttribute("data-generated", "shop-art");
      article.setAttribute("data-rendered", "false");

      var heading = document.createElement("h2");
      heading.className = "major";
      heading.textContent = art.title || "Artwork";
      article.appendChild(heading);

      var note = document.createElement("p");
      note.className = "align-center";
      note.textContent = "Loading…";
      article.appendChild(note);

      mainEl.insertBefore(article, insertBefore);
    }
  }

  function findArtById(id) {
    var list = getArtList();
    var needle = String(id || "");
    if (!needle) return null;

    for (var i = 0; i < list.length; i++) {
      var art = list[i];
      if (!art || !art.id) continue;
      if (String(art.id) === needle) return art;
    }

    return null;
  }

  function ensureRenderedForHash(hash) {
    var h = String(hash || "");
    if (!h.startsWith("#shop-")) return;

    var id = h.slice("#shop-".length);
    if (!id) return;

    var art = findArtById(id);
    if (!art) return;

    var article = document.getElementById("shop-" + String(id));
    if (!article) return;
    populateArtArticle(article, art);

    // If the user is viewing a shop detail page, make sure we're loading the latest catalog in the background.
    loadShopCatalog({ timeoutMs: 15000, totalWaitMs: 90000, forceRefresh: true });
  }

  function handleHashChange() {
    ensureRenderedForHash(window.location.hash || "");
  }

  function init() {
    buildArtArticles();
    ensureRenderedForHash(window.location.hash || "");
    window.addEventListener("hashchange", handleHashChange, true);

    // Keep rendered purchase boxes in sync when the shared catalog loader updates.
    window.addEventListener("melkapow:shop-catalog-updated", function () {
      refreshPurchaseBoxes();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
