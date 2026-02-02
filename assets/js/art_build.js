// assets/js/art_build.js
(function () {
  "use strict";

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

  function loadShopCatalog(timeoutMs) {
    var existing = window.MELKAPOW_PRODUCTS_BY_ART_ID;
    if (existing && typeof existing === "object") {
      shopCatalogStatus = "ready";
      return Promise.resolve(existing);
    }
    if (shopCatalogPromise) return shopCatalogPromise;

    var apiBase = getApiBase();
    if (!apiBase || typeof fetch !== "function") return Promise.resolve(null);
    shopCatalogStatus = "loading";

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
          shopCatalogStatus = "failed";
          return null;
        }
        var products = data.products;
        if (!products || typeof products !== "object") {
          shopCatalogStatus = "failed";
          return null;
        }
        window.MELKAPOW_PRODUCTS_BY_ART_ID = products;
        shopCatalogStatus = "ready";
        return products;
      })
      .catch(function () {
        shopCatalogStatus = "failed";
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

  var SIZE_RE = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i;

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

    for (var i = 0; i < candidates.length; i++) {
      var id = candidates[i];
      if (!id) continue;
      if (Object.prototype.hasOwnProperty.call(shopMap, id)) return shopMap[id];
    }

    return null;
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
    statusEl.textContent = message || "";
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
    "Canvas thickness: 1.25″ (3.18 cm)",
    "Printed on textured and fade-resistant canvas (OBA-Free)",
    "Mounting brackets included",
    "Hand-glued solid wood stretcher bars",
    "Blank product sourced from the US, Canada, Europe, UK, or Australia"
  ];

  var STATIC_DESCRIPTION_LINES = {
    canvas: [
      "Canvas thickness: 1.25″ (3.18 cm)",
      "Printed on textured and fade-resistant canvas (OBA-Free)",
      "Mounting brackets included",
      "Hand-glued solid wood stretcher bars",
      "Blank product sourced from the US, Canada, Europe, UK, or Australia"
    ],
    "framed-canvas": [
      "Pine tree frame",
      "Canvas fabric, polyester cotton blend",
      "Frame thickness: 1.25″ (3.18 cm)",
      "Hanging hardware attached",
      "Floating canvas effect",
      "Blank product sourced from Canada, the UK, and the US"
    ],
    "canvas-frame": [
      "Pine tree frame",
      "Canvas fabric, polyester cotton blend",
      "Frame thickness: 1.25″ (3.18 cm)",
      "Hanging hardware attached",
      "Floating canvas effect",
      "Blank product sourced from Canada, the UK, and the US"
    ],
    "gloss-metal-print": [
      "Technique: Design is printed with dye ink on paper and transferred directly onto product with heat",
      "Aluminum metal surface, corrosion resistant",
      "MDF wood frame, highly durable material",
      "An additional coating applied for true color replication",
      "Gloss finish for vivid dimensional look",
      "Scratch and fade resistant",
      "Product sourced from the US",
      "Important: This product is available in the US only. If your shipping address is outside this region, please choose a different product."
    ],
    "metal-print": [
      "Technique: Design is printed with dye ink on paper and transferred directly onto product with heat",
      "Aluminum metal surface, corrosion resistant",
      "MDF wood frame, highly durable material",
      "An additional coating applied for true color replication",
      "Gloss finish for vivid dimensional look",
      "Scratch and fade resistant",
      "Product sourced from the US",
      "Important: This product is available in the US only. If your shipping address is outside this region, please choose a different product."
    ],
    metal: [
      "Technique: Design is printed with dye ink on paper and transferred directly onto product with heat",
      "Aluminum metal surface, corrosion resistant",
      "MDF wood frame, highly durable material",
      "An additional coating applied for true color replication",
      "Gloss finish for vivid dimensional look",
      "Scratch and fade resistant",
      "Product sourced from the US",
      "Important: This product is available in the US only. If your shipping address is outside this region, please choose a different product."
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

  function createDescriptionContainer() {
    var container = document.createElement("div");
    container.className = "purchase-description";

    var heading = document.createElement("h4");
    heading.textContent = "Product details";
    container.appendChild(heading);

    var list = document.createElement("ul");
    list.className = "purchase-description-list";
    container.appendChild(list);

    return { container: container, list: list };
  }

  function updateDescriptionList(listEl, text) {
    if (!listEl) return;
    var lines = splitDescriptionText(text);
    listEl.innerHTML = "";
    lines.forEach(function (line) {
      var li = document.createElement("li");
      li.textContent = line;
      listEl.appendChild(li);
    });
    listEl.style.display = lines.length ? "" : "none";
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

    var descriptionParts = createDescriptionContainer();
    box.appendChild(descriptionParts.container);
    var descriptionList = descriptionParts.list;

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

    var defaultFinish = catalog.finishes.length === 1 ? catalog.finishes[0] : null;

    var fields = document.createElement("div");
    fields.className = "fields";

    var fieldFinish = document.createElement("div");
    fieldFinish.className = "field";

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
    fieldSize.className = "field";

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
        updateDescriptionList(descriptionList, resolveDescriptionText(art, null));
        return;
      }

      sizeSelect.disabled = false;

      for (var s = 0; s < finishObj.sizes.length; s++) {
        var size = finishObj.sizes[s];
        sizeById[size.id] = size;

        var o = document.createElement("option");
        o.value = size.id;
        o.textContent = size.label + " — " + formatMoney(size.priceCents);
        sizeSelect.appendChild(o);
      }

      updateDescriptionList(descriptionList, resolveDescriptionText(art, finishObj));
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
    fieldQty.className = "field";

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
      if (i === 0) input.checked = true;
      slider.appendChild(input);
    }

    var slidesEl = document.createElement("div");
    slidesEl.className = "slides";

    for (var j = 0; j < slides.length; j++) {
      var img = document.createElement("img");
      img.src = slides[j].src;
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

  function buildArtArticle(art) {
    var article = document.createElement("article");
    article.id = "shop-" + String(art.id);
    article.className = "from-shop";
    article.setAttribute("data-generated", "shop-art");

    var heading = document.createElement("h2");
    heading.className = "major";
    heading.textContent = art.title || "Artwork";
    article.appendChild(heading);

    var slider = buildSlider(art);
    if (slider) article.appendChild(slider);

    if (art.caption) {
      var caption = document.createElement("p");
      caption.className = "mt-2rem art-caption";
      caption.textContent = art.caption;
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

    return article;
  }

  function refreshPurchaseBoxes() {
    var list = getArtList();
    if (!list.length) return;

    for (var i = 0; i < list.length; i++) {
      var art = list[i];
      if (!art || !art.id) continue;

      var article = document.getElementById("shop-" + String(art.id));
      if (!article) continue;

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
      var article = buildArtArticle(list[i]);
      mainEl.insertBefore(article, insertBefore);
    }
  }

  function init() {
    var promise = loadShopCatalog(8000);
    buildArtArticles();

    promise
      .then(function (products) {
        if (!isShopEnabled()) return;
        refreshPurchaseBoxes();
      })
      .catch(function () { /* ignore */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
