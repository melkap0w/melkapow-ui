// assets/js/cart.js
(function () {
  "use strict";

  var STORAGE_KEY = "melkapow_cart_v1";
  var MAX_QTY = 99;

  var ESTIMATE_ZIP_KEY = "melkapow_cart_estimate_zip_v1";
  var ESTIMATE_STATE_KEY = "melkapow_cart_estimate_state_v1";

  var estimateEls = null;
  var estimateInFlight = false;
  var lastEstimateCartSig = "";
  var lastEstimate = null;

  // Cart should clear when the tab/browser session ends, so prefer sessionStorage.
  // Falls back to localStorage if sessionStorage isn't available.
  var storage = null;
  var usingSessionStorage = false;

  (function initStorage() {
    try {
      var testKey = "__melkapow_cart_test__";
      window.sessionStorage.setItem(testKey, "1");
      window.sessionStorage.removeItem(testKey);
      storage = window.sessionStorage;
      usingSessionStorage = true;
      return;
    } catch (_) {
      // ignore
    }

    try {
      var testKey2 = "__melkapow_cart_test__";
      window.localStorage.setItem(testKey2, "1");
      window.localStorage.removeItem(testKey2);
      storage = window.localStorage;
      usingSessionStorage = false;
    } catch (_) {
      storage = null;
      usingSessionStorage = false;
    }
  })();

  function storageGet(key) {
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    if (!storage) return;
    try {
      storage.setItem(key, value);
    } catch (_) {
      // ignore
    }
  }

  function storageRemove(key) {
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch (_) {
      // ignore
    }
  }

  // One-time migration: if an older cart exists in localStorage, move it into sessionStorage and delete it.
  // This keeps the current session smooth, but future visits start empty.
  (function migrateLegacyCart() {
    if (!usingSessionStorage) return;
    if (storageGet(STORAGE_KEY)) return;

    var legacyRaw = null;
    try {
      legacyRaw = window.localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      legacyRaw = null;
    }

    if (!legacyRaw) return;

    storageSet(STORAGE_KEY, legacyRaw);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // ignore
    }
  })();

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function normalizeQty(qty) {
    var n = parseInt(qty, 10);
    if (!isFinite(n) || n < 1) n = 1;
    if (n > MAX_QTY) n = MAX_QTY;
    return n;
  }

  function normalizePositiveInt(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n) || n <= 0) return null;
    return n;
  }

  function normalizeZip(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    raw = raw.replace(/[^\d-]/g, "");
    if (raw.length > 10) raw = raw.slice(0, 10);
    return raw;
  }

  function normalizeState(value) {
    var raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";
    raw = raw.replace(/[^A-Z]/g, "");
    if (raw.length > 2) raw = raw.slice(0, 2);
    return raw;
  }

  function buildEstimateItems(cart) {
    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    var out = [];

    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var qty = normalizeQty(it.qty);

      var syncId = normalizePositiveInt(it.printful_sync_variant_id || it.printfulSyncVariantId);
      var variantId = normalizePositiveInt(it.printful_variant_id || it.printfulVariantId);
      if (!syncId && !variantId) continue;

      out.push({
        printful_sync_variant_id: syncId,
        printful_variant_id: variantId,
        quantity: qty
      });
    }

    return out;
  }

  function cartSignature(cart) {
    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    if (!items.length) return "";

    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var key = String(it.key || "");
      var qty = normalizeQty(it.qty);
      if (!key) continue;
      parts.push(key + "=" + String(qty));
    }
    parts.sort();
    return parts.join("|");
  }

  function formatMoney(cents) {
    var n = parseInt(cents, 10);
    if (!isFinite(n)) n = 0;
    var dollars = (n / 100).toFixed(2);
    return "$" + dollars;
  }

  function getEstimateForCart(cart) {
    if (!lastEstimate || typeof lastEstimate !== "object") return null;
    var sig = cartSignature(cart);
    if (!sig) return null;
    if (String(lastEstimate.cartSig || "") !== sig) return null;
    return lastEstimate;
  }

  function clearEstimate() {
    lastEstimate = null;
  }

  var lastLeaveClearAt = 0;
  function clearEstimateOnCartLeave() {
    var now = Date.now ? Date.now() : new Date().getTime();
    if (now - lastLeaveClearAt < 300) return;
    lastLeaveClearAt = now;
    clearEstimateLocationInputs({ clearStorage: true });
  }

  function clearEstimateLocationInputs(opts) {
    var options = opts && typeof opts === "object" ? opts : {};
    var clearStorage = options.clearStorage !== false;

    if (estimateEls && estimateEls.zip) estimateEls.zip.value = "";
    if (estimateEls && estimateEls.state) estimateEls.state.value = "";

    if (clearStorage) {
      storageRemove(ESTIMATE_ZIP_KEY);
      storageRemove(ESTIMATE_STATE_KEY);
    }

    clearEstimate();
    lastEstimateCartSig = "";

    if (estimateEls) {
      if (estimateEls.shipping) estimateEls.shipping.textContent = "\u2014";
      if (estimateEls.tax) estimateEls.tax.textContent = "\u2014";
      if (estimateEls.discountRow) estimateEls.discountRow.hidden = true;
      if (estimateEls.discount) estimateEls.discount.textContent = "\u2014";
      if (estimateEls.status) {
        estimateEls.status.hidden = true;
        estimateEls.status.textContent = "";
      }
    }

    renderCartSubtotalLine(loadCart());
    refreshEstimateWidget(loadCart());
  }

  function renderCartSubtotalLine(cart) {
    var amountEl = document.getElementById("cartTotal");
    if (!amountEl) return;
    var labelEl = document.getElementById("cartTotalLabel");

    var base = getTotalCents(cart);
    var est = getEstimateForCart(cart);
    var ship = est ? parseInt(est.shippingCents, 10) : 0;
    var tax = est ? parseInt(est.taxCents, 10) : 0;
    var discount = est ? parseInt(est.discountCents, 10) : 0;
    var total = est ? parseInt(est.totalCents, 10) : NaN;
    if (!isFinite(ship)) ship = 0;
    if (!isFinite(tax)) tax = 0;
    if (!isFinite(discount)) discount = 0;

    if (est) {
      if (!isFinite(total)) total = base + ship + tax - discount;
      amountEl.textContent = formatMoney(total);
      if (labelEl) labelEl.textContent = "Estimated subtotal";
    } else {
      amountEl.textContent = formatMoney(base);
      if (labelEl) labelEl.textContent = "Subtotal";
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
    return !!(getApiBase() && typeof fetch === "function");
  }

  function findArtById(artId) {
    var id = String(artId || "");
    if (!id) return null;

    var list = window.MELKAPOW_ART;
    if (!Array.isArray(list)) return null;

    for (var i = 0; i < list.length; i++) {
      var art = list[i];
      if (!art) continue;
      if (String(art.id) === id) return art;
    }

    return null;
  }

  function getCartThumbSources(item) {
    var it = item || {};
    var art = findArtById(it.artId);

    var fallback = String(it.thumb || (art && art.thumb) || "").trim();
    var primary = "";

    if (art && Array.isArray(art.slides) && art.slides.length) {
      var preferred = art.slides.length > 1 ? art.slides[1] : art.slides[0];
      if (preferred && preferred.src) primary = String(preferred.src || "").trim();
    }

    if (!primary) primary = fallback;
    if (!fallback) fallback = primary;

    return { primary: primary, fallback: fallback };
  }

  function createCartThumbImg(item) {
    var src = getCartThumbSources(item);
    if (!src.primary && !src.fallback) return null;

    var img = document.createElement("img");
    img.className = "cart-thumb";
    img.src = src.primary || src.fallback;
    img.alt = String((item && (item.title || item.artId)) || "Artwork");
    img.loading = "lazy";
    img.decoding = "async";

    if (src.primary && src.fallback && src.primary !== src.fallback) {
      img.addEventListener("error", function onError() {
        img.removeEventListener("error", onError);
        img.src = src.fallback;
      });
    }

    return img;
  }

  function loadCart() {
    var raw = storageGet(STORAGE_KEY);

    var parsed = raw ? safeJsonParse(raw) : null;
    var items = parsed && Array.isArray(parsed.items) ? parsed.items : [];

    // Sanitize.
    var clean = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      if (!it.key || !it.artId || !it.optionId) continue;

      var optionLabel = String(it.optionLabel || "");
      var split = optionLabel.indexOf("—") !== -1 ? optionLabel.split("—") : null;

      var finishId = String(it.finishId || "");
      var finishLabel = String(it.finishLabel || "");
      var sizeId = String(it.sizeId || "");
      var sizeLabel = String(it.sizeLabel || "");

      if (!finishId && String(it.optionId || "").indexOf("::") !== -1) {
        finishId = String(it.optionId || "").split("::")[0] || "";
      }

      if (!sizeId && String(it.optionId || "").indexOf("::") !== -1) {
        var parts = String(it.optionId || "").split("::");
        sizeId = parts.length > 1 ? (parts[1] || "") : "";
      }

      if (!finishLabel && split && split.length) finishLabel = String(split[0] || "").trim();
      if (!sizeLabel && split && split.length > 1) sizeLabel = split.slice(1).join("—").trim();

      // Legacy fallbacks.
      if (!finishId && it.productType === "canvas") finishId = "canvas";
      if (!finishId && it.productType === "prints") finishId = "fine-art-print";

      if (!finishLabel && it.productType === "canvas") finishLabel = "Canvas";
      if (!finishLabel && it.productType === "prints") finishLabel = "Fine Art Print";

      if (!sizeLabel) sizeLabel = optionLabel || String(it.optionId || "");

      var printfulVariantId = normalizePositiveInt(it.printful_variant_id || it.printfulVariantId);
      var printfulSyncVariantId = normalizePositiveInt(it.printful_sync_variant_id || it.printfulSyncVariantId);
      var printfulProductId = normalizePositiveInt(it.printful_product_id || it.printfulProductId);

      clean.push({
        key: String(it.key),
        artId: String(it.artId),
        title: String(it.title || ""),
        thumb: String(it.thumb || ""),
        optionId: String(it.optionId),
        optionLabel: optionLabel,
        finishId: finishId,
        finishLabel: finishLabel,
        sizeId: sizeId,
        sizeLabel: sizeLabel,
        printful_variant_id: printfulVariantId,
        printful_sync_variant_id: printfulSyncVariantId,
        printful_product_id: printfulProductId,
        priceCents: parseInt(it.priceCents, 10) || 0,
        qty: normalizeQty(it.qty)
      });
    }

    return { items: clean };
  }

  function saveCart(cart) {
    storageSet(STORAGE_KEY, JSON.stringify(cart));
  }

  function getCount(cart) {
    var total = 0;
    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    for (var i = 0; i < items.length; i++) total += normalizeQty(items[i].qty);
    return total;
  }

  function getTotalCents(cart) {
    var total = 0;
    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      total += (parseInt(it.priceCents, 10) || 0) * normalizeQty(it.qty);
    }
    return total;
  }

  function dispatchUpdated() {
    var dispatched = false;
    try {
      window.dispatchEvent(new CustomEvent("melkapow:cart-updated"));
      dispatched = true;
    } catch (_) {
      dispatched = false;
    }

    if (!dispatched) {
      refreshFab();
      if (window.location.hash === "#cart") renderCartPage();
    }
  }

  function upsertItem(next) {
    var cart = loadCart();
    var items = cart.items;

    for (var i = 0; i < items.length; i++) {
      if (items[i].key === next.key) {
        items[i].qty = normalizeQty(items[i].qty + next.qty);

        // Fill in any newer metadata (helps when upgrading stored cart schema).
        if (!items[i].title && next.title) items[i].title = next.title;
        if (!items[i].thumb && next.thumb) items[i].thumb = next.thumb;
        if (!items[i].optionLabel && next.optionLabel) items[i].optionLabel = next.optionLabel;

        if (!items[i].finishId && next.finishId) items[i].finishId = next.finishId;
        if (!items[i].finishLabel && next.finishLabel) items[i].finishLabel = next.finishLabel;
        if (!items[i].sizeId && next.sizeId) items[i].sizeId = next.sizeId;
        if (!items[i].sizeLabel && next.sizeLabel) items[i].sizeLabel = next.sizeLabel;

        if (!items[i].printful_variant_id && next.printful_variant_id) items[i].printful_variant_id = next.printful_variant_id;
        if (!items[i].printful_sync_variant_id && next.printful_sync_variant_id) items[i].printful_sync_variant_id = next.printful_sync_variant_id;
        if (!items[i].printful_product_id && next.printful_product_id) items[i].printful_product_id = next.printful_product_id;

        saveCart(cart);
        dispatchUpdated();
        return cart;
      }
    }

    items.push(next);
    saveCart(cart);
    dispatchUpdated();
    return cart;
  }

  function removeItem(key) {
    var cart = loadCart();
    var items = cart.items;
    var next = [];

    for (var i = 0; i < items.length; i++) {
      if (items[i].key !== key) next.push(items[i]);
    }

    cart.items = next;
    saveCart(cart);
    dispatchUpdated();
    return cart;
  }

  function updateQty(key, qty) {
    var cart = loadCart();
    var items = cart.items;
    var q = normalizeQty(qty);

    for (var i = 0; i < items.length; i++) {
      if (items[i].key === key) {
        items[i].qty = q;
        break;
      }
    }

    saveCart(cart);
    dispatchUpdated();
    return cart;
  }

  function clearCart() {
    var cart = { items: [] };
    saveCart(cart);
    dispatchUpdated();
    return cart;
  }

  // ----- UI: floating cart icon + cart page -----
  function getFab() {
    return document.getElementById("cartFab");
  }

  function getBadge() {
    return document.getElementById("cartBadge");
  }

  function refreshFab() {
    var fab = getFab();
    var badge = getBadge();
    if (!fab || !badge) return;

    var cart = loadCart();
    var count = getCount(cart);

    var hash = window.location.hash || "";
    var atHome = hash === "" || hash === "#";
    var articleVisible = false;
    if (document.body && document.body.classList) {
      articleVisible = document.body.classList.contains("is-article-visible");
    }

    if (count > 0 && atHome && !articleVisible) {
      fab.hidden = false;
      badge.textContent = String(count);
      fab.setAttribute("aria-label", "Cart (" + String(count) + " items)");
    } else {
      fab.hidden = true;
      badge.textContent = "";
      fab.setAttribute("aria-label", "Cart");
    }
  }

  function renderCartPage() {
    var wrap = document.getElementById("cartItems");
    var empty = document.getElementById("cartEmpty");
    if (!wrap || !empty) return;

    var cart = loadCart();
    var items = cart.items;

    wrap.innerHTML = "";

    if (!items.length) {
      empty.hidden = false;
      clearEstimate();
      renderCartSubtotalLine(cart);
      refreshEstimateWidget(cart);
      return;
    }

    empty.hidden = true;

    var isMobile = false;
    if (window.matchMedia) isMobile = window.matchMedia("(max-width: 736px)").matches;

    if (isMobile) {
      var list = document.createElement("div");
      list.className = "cart-list";

      for (var i = 0; i < items.length; i++) {
        var it = items[i];

        var itemBox = document.createElement("div");
        itemBox.className = "box cart-item";

        var top = document.createElement("div");
        top.className = "cart-item-top";

        var headingWrap = document.createElement("div");
        headingWrap.className = "cart-item-heading";

        var thumb = createCartThumbImg(it);
        if (thumb) headingWrap.appendChild(thumb);

        var title = document.createElement("h4");
        title.className = "cart-item-title";
        title.textContent = it.title || it.artId;

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "button small cart-remove cart-remove-x";
        removeBtn.textContent = "\u2715";
        removeBtn.setAttribute("data-key", it.key);
        removeBtn.setAttribute("aria-label", "Remove from cart");

        headingWrap.appendChild(title);

        top.appendChild(headingWrap);
        top.appendChild(removeBtn);
        itemBox.appendChild(top);

        var meta = document.createElement("p");
        meta.className = "cart-item-meta";
        var finish = it.finishLabel || it.finishId || "";
        if (String(finish).toLowerCase() === "default") finish = "";
        var size = it.sizeLabel || it.optionLabel || it.optionId || "";
        meta.textContent = [finish, size].filter(Boolean).join(" \u2022 ");
        itemBox.appendChild(meta);

        var controls = document.createElement("div");
        controls.className = "cart-item-controls";

        var qtyWrap = document.createElement("div");
        qtyWrap.className = "cart-item-qty";

        var qtyLabel = document.createElement("span");
        qtyLabel.className = "cart-item-qty-label";
        qtyLabel.textContent = "Qty";

        var qtyValue = document.createElement("span");
        qtyValue.className = "cart-item-qty-value";
        qtyValue.textContent = String(normalizeQty(it.qty));

        qtyWrap.appendChild(qtyLabel);
        qtyWrap.appendChild(qtyValue);

        var price = document.createElement("span");
        price.className = "cart-item-price";
        price.textContent = formatMoney(it.priceCents);

        controls.appendChild(qtyWrap);
        controls.appendChild(price);
        itemBox.appendChild(controls);

        list.appendChild(itemBox);
      }

      wrap.appendChild(list);
    } else {
      var tableWrap = document.createElement("div");
      tableWrap.className = "table-wrapper";

      var table = document.createElement("table");
      table.className = "cart-table";

      var thead = document.createElement("thead");
      thead.innerHTML =
        "<tr>" +
        "<th>Item</th>" +
        "<th>Type</th>" +
        "<th>Size</th>" +
        "<th>Qty</th>" +
        "<th>Unit</th>" +
        "<th></th>" +
        "</tr>";
      table.appendChild(thead);

      var tbody = document.createElement("tbody");

      for (var j = 0; j < items.length; j++) {
        var it2 = items[j];

        var tr = document.createElement("tr");

        var tdTitle = document.createElement("td");
        var titleWrap = document.createElement("div");
        titleWrap.className = "cart-item-cell";

        var thumb2 = createCartThumbImg(it2);
        if (thumb2) titleWrap.appendChild(thumb2);

        var titleText = document.createElement("span");
        titleText.className = "cart-item-name";
        titleText.textContent = it2.title || it2.artId;
        titleWrap.appendChild(titleText);

        tdTitle.appendChild(titleWrap);

        var tdFinish = document.createElement("td");
        var finishText = it2.finishLabel || it2.finishId || "";
        if (String(finishText).toLowerCase() === "default") finishText = "";
        tdFinish.textContent = finishText;

        var tdSize = document.createElement("td");
        tdSize.textContent = it2.sizeLabel || it2.optionLabel || it2.optionId;

        var tdQty = document.createElement("td");
        tdQty.textContent = String(normalizeQty(it2.qty));

        var tdUnit = document.createElement("td");
        tdUnit.textContent = formatMoney(it2.priceCents);

        var tdRemove = document.createElement("td");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "button small cart-remove cart-remove-x";
        btn.textContent = "\u2715";
        btn.setAttribute("data-key", it2.key);
        btn.setAttribute("aria-label", "Remove from cart");
        tdRemove.appendChild(btn);

        tr.appendChild(tdTitle);
        tr.appendChild(tdFinish);
        tr.appendChild(tdSize);
        tr.appendChild(tdQty);
        tr.appendChild(tdUnit);
        tr.appendChild(tdRemove);
        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      tableWrap.appendChild(table);
      wrap.appendChild(tableWrap);
    }

    renderCartSubtotalLine(cart);
    refreshEstimateWidget(cart);

    // Wire up events.
    var removeBtns = wrap.querySelectorAll(".cart-remove");
    for (var r = 0; r < removeBtns.length; r++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-key") || "";
          removeItem(key);
        });
      })(removeBtns[r]);
    }

  }

  function wireEstimateWidget() {
    var box = document.getElementById("cartEstimateBox");
    var form = document.getElementById("cartEstimateForm");
    var zipInput = document.getElementById("cartEstimateZip");
    var stateInput = document.getElementById("cartEstimateState");
    var statusEl = document.getElementById("cartEstimateStatus");
    var breakdown = document.getElementById("cartEstimateBreakdown");
    var itemsSubtotalEl = document.getElementById("cartEstimateItemsSubtotal");
    var shipEl = document.getElementById("cartEstimateShipping");
    var taxEl = document.getElementById("cartEstimateTax");
    var discountRow = document.getElementById("cartEstimateDiscountRow");
    var discountEl = document.getElementById("cartEstimateDiscount");
    if (!box || !form || !zipInput || !stateInput || !statusEl || !breakdown || !itemsSubtotalEl || !shipEl || !taxEl) return;

    if (form.__melkapowBound) return;
    form.__melkapowBound = true;

    estimateEls = {
      box: box,
      form: form,
      zip: zipInput,
      state: stateInput,
      status: statusEl,
      breakdown: breakdown,
      itemsSubtotal: itemsSubtotalEl,
      shipping: shipEl,
      tax: taxEl,
      discountRow: discountRow,
      discount: discountEl,
      btn: form.querySelector("button[type=\"submit\"]")
    };

    breakdown.hidden = false;

    try {
      zipInput.value = normalizeZip(storageGet(ESTIMATE_ZIP_KEY) || "");
      stateInput.value = normalizeState(storageGet(ESTIMATE_STATE_KEY) || "");
    } catch (_) {
      // ignore
    }

    function setStatus(text) {
      var msg = String(text || "");
      statusEl.textContent = msg;
      statusEl.hidden = !msg;
    }

    function setAmounts(shipText, taxText) {
      shipEl.textContent = shipText;
      taxEl.textContent = taxText;
    }

    function setDiscountCents(cents) {
      if (!discountRow || !discountEl) return;
      var n = parseInt(cents, 10);
      if (!isFinite(n) || !n) {
        discountRow.hidden = true;
        discountEl.textContent = "\u2014";
        return;
      }
      discountRow.hidden = false;
      discountEl.textContent = "-$" + (Math.abs(n) / 100).toFixed(2);
    }

    function renderItemsSubtotal(cart) {
      itemsSubtotalEl.textContent = formatMoney(getTotalCents(cart));
    }

	    function resetAmounts() {
	      setAmounts("\u2014", "\u2014");
	      setDiscountCents(0);
	    }

	    var autoTimer = null;
	    var estimateReqSeq = 0;
	    var activeEstimateReqId = 0;
	    var estimateAbortController = null;

	    function clearAutoTimer() {
	      if (!autoTimer) return;
	      clearTimeout(autoTimer);
	      autoTimer = null;
	    }

	    function abortInFlightEstimate() {
	      if (!estimateInFlight) return;
	      activeEstimateReqId = 0;
	      estimateInFlight = false;

	      if (estimateAbortController && typeof estimateAbortController.abort === "function") {
	        try {
	          estimateAbortController.abort();
	        } catch (_) {
	          // ignore
	        }
	      }
	      estimateAbortController = null;

	      if (estimateEls && estimateEls.btn) estimateEls.btn.disabled = false;
	    }

	    function scheduleAutoEstimate() {
	      clearAutoTimer();
	      autoTimer = setTimeout(function () {
	        autoTimer = null;
	        var zipNow = normalizeZip(zipInput.value);
	        var stateNow = normalizeState(stateInput.value);
	        var zipDigitsNow = zipNow.replace(/\D/g, "");
	        if (zipDigitsNow.length < 5 || stateNow.length < 2) return;
	        runEstimate({ normalizeInputs: false, showMissingZipError: false });
	      }, 650);
	    }

	    function runEstimate(opts) {
	      try {
	        var options = opts && typeof opts === "object" ? opts : {};
	        var normalizeInputs = !!options.normalizeInputs;
	        var showMissingZipError = !!options.showMissingZipError;

	        var cart = loadCart();
	        renderItemsSubtotal(cart);
	        if (!cart.items || !cart.items.length) {
	          clearEstimate();
	          resetAmounts();
	          renderCartSubtotalLine(cart);
	          if (showMissingZipError) setStatus("Your cart is empty.");
	          refreshEstimateWidget(cart);
	          return;
	        }

	        if (!isShopEnabled()) {
	          clearEstimate();
	          resetAmounts();
	          renderCartSubtotalLine(cart);
	          if (showMissingZipError) setStatus("Shipping estimates are unavailable right now.");
	          refreshEstimateWidget(cart);
	          return;
	        }

	        var zip = normalizeZip(zipInput.value);
	        var state = normalizeState(stateInput.value);
	        var zipDigits = zip.replace(/\D/g, "");
	        if (normalizeInputs) {
	          zipInput.value = zip;
	          stateInput.value = state;
	        }

	        if (!zipDigits || zipDigits.length < 5) {
	          clearEstimate();
	          resetAmounts();
	          renderCartSubtotalLine(cart);
	          if (showMissingZipError) setStatus("Please enter a ZIP code.");
	          return;
	        }

	        if (!state || state.length < 2) {
	          clearEstimate();
	          resetAmounts();
	          renderCartSubtotalLine(cart);
	          if (showMissingZipError) setStatus("Please enter your 2-letter state code (e.g., CA).");
	          return;
	        }

	        try {
	          storageSet(ESTIMATE_ZIP_KEY, zip);
	          storageSet(ESTIMATE_STATE_KEY, state);
	        } catch (_) {
	          // ignore
	        }

	        var apiBase = getApiBase();
	        if (!apiBase || typeof fetch !== "function") {
	          clearEstimate();
	          resetAmounts();
	          renderCartSubtotalLine(cart);
	          setStatus("Shipping estimates are unavailable right now.");
	          return;
	        }

	        var estimateItems = buildEstimateItems(cart);
	        if (!estimateItems.length) {
	          clearEstimate();
	          resetAmounts();
	          renderCartSubtotalLine(cart);
	          setStatus("This cart can't be estimated yet.");
	          return;
	        }

	        var sig = cartSignature(cart);
	        if (
	          lastEstimate &&
	          String(lastEstimate.cartSig || "") === sig &&
	          String(lastEstimate.zip || "") === zip &&
	          String(lastEstimate.state || "") === state
	        ) {
	          setStatus("");
	          return;
	        }

	        clearAutoTimer();

	        if (estimateInFlight) return;
	        estimateInFlight = true;

	        var reqId = ++estimateReqSeq;
	        activeEstimateReqId = reqId;

	        if (estimateAbortController && typeof estimateAbortController.abort === "function") {
	          try {
	            estimateAbortController.abort();
	          } catch (_) {
	            // ignore
	          }
	        }
	        estimateAbortController = typeof AbortController === "function" ? new AbortController() : null;

	        setStatus("Calculating\u2026");
	        setAmounts("\u2026", "\u2026");
	        setDiscountCents(0);
	        if (estimateEls.btn) estimateEls.btn.disabled = true;

	        var req = {
	          country_code: "US",
	          zip: zip,
	          items: estimateItems
	        };
	        if (state) req.state_code = state;

	        var fetchOpts = {
	          method: "POST",
	          headers: { "Content-Type": "application/json" },
	          body: JSON.stringify(req)
	        };
	        if (estimateAbortController) fetchOpts.signal = estimateAbortController.signal;

	        fetch(apiBase + "/api/shop/estimate", fetchOpts)
	          .then(function (res) {
	            return res
	              .json()
	              .catch(function () { return {}; })
	              .then(function (data) {
	                if (reqId !== activeEstimateReqId) return null;
	                if (!res.ok) {
	                  var msg = (data && data.detail) ? String(data.detail) : "Estimate failed.";
	                  throw new Error(msg);
	                }
	                return data;
	              });
	          })
	          .then(function (data) {
	            if (reqId !== activeEstimateReqId) return;
	            if (!data || !data.ok) throw new Error("Estimate failed.");

	            var currentCart = loadCart();
	            var currentSig = cartSignature(currentCart);
	            var currentZip = normalizeZip(zipInput.value);
	            var currentState = normalizeState(stateInput.value);
	            var currentZipDigits = currentZip.replace(/\D/g, "");
	            if (currentSig !== sig || currentZipDigits !== zipDigits || currentState !== state) return;

	            var ship = parseInt(data.shippingCents, 10) || 0;
	            var tax = parseInt(data.taxCents, 10) || 0;
	            var discount = parseInt(data.discountCents, 10) || 0;
	            var total = parseInt(data.totalCents, 10);
	            if (!isFinite(total)) total = getTotalCents(currentCart) + ship + tax - discount;

	            shipEl.textContent = formatMoney(ship);
	            taxEl.textContent = formatMoney(tax);
	            setDiscountCents(discount);

	            lastEstimate = {
	              cartSig: sig,
	              zip: zip,
	              state: state,
	              shippingCents: ship,
	              taxCents: tax,
	              discountCents: discount,
	              totalCents: total
	            };

	            setStatus("");
	            renderCartSubtotalLine(currentCart);
	          })
	          .catch(function (err) {
	            if (reqId !== activeEstimateReqId) return;
	            if (err && err.name === "AbortError") return;

	            var msg = err && err.message ? String(err.message) : "";
	            if (!msg) msg = "Estimate failed.";

	            // Browsers often surface network failures as a generic "Failed to fetch".
	            if (/failed to fetch|networkerror|load failed|err_connection/i.test(msg)) {
	              msg = "Unable to reach the shop server right now. Please try again in a moment.";
	            }
	            clearEstimate();
	            resetAmounts();
	            renderCartSubtotalLine(loadCart());
	            setStatus(msg);
	          })
	          .finally(function () {
	            if (reqId !== activeEstimateReqId) return;
	            estimateInFlight = false;
	            activeEstimateReqId = 0;
	            estimateAbortController = null;
	            if (estimateEls && estimateEls.btn) estimateEls.btn.disabled = false;
	            refreshEstimateWidget(loadCart());
	          });
	      } catch (err) {
	        // Fail-safe: never let estimate exceptions break the cart UI.
	        abortInFlightEstimate();
	        clearEstimate();
	        resetAmounts();
	        renderCartSubtotalLine(loadCart());
	        setStatus("Estimate failed.");
	        refreshEstimateWidget(loadCart());
	      }
	    }

	    form.addEventListener("submit", function (e) {
	      e.preventDefault();
	      e.stopPropagation();
	      clearAutoTimer();
	      runEstimate({ normalizeInputs: true, showMissingZipError: true });
	    });

	    zipInput.addEventListener("input", function () {
	      if (estimateInFlight) abortInFlightEstimate();
	      var cart = loadCart();
	      renderItemsSubtotal(cart);
	      var sig = cartSignature(cart);
	      var zip = normalizeZip(zipInput.value);
	      var zipDigits = zip.replace(/\D/g, "");
	      var state = normalizeState(stateInput.value);

	      if (!zipDigits || zipDigits.length < 5) {
	        if (state && state.length >= 2) setStatus("Enter your ZIP code to calculate.");
	        else setStatus("");
	      } else if (!state || state.length < 2) {
	        setStatus("Enter your state code to calculate.");
	      } else {
	        setStatus("");
	      }

	      if (lastEstimate && String(lastEstimate.cartSig || "") === sig) {
	        if (String(lastEstimate.zip || "") !== zip || String(lastEstimate.state || "") !== state) {
	          clearEstimate();
	          resetAmounts();
	          renderCartSubtotalLine(cart);
	        }
	      }

	      if (zipDigits && zipDigits.length >= 5 && state && state.length >= 2) scheduleAutoEstimate();
	      else clearAutoTimer();
	    });

	    zipInput.addEventListener("blur", function () {
	      zipInput.value = normalizeZip(zipInput.value);
	    });

    function onEnterKey(e) {
      var key = e && (e.key || e.keyCode);
      var isEnter = key === "Enter" || key === 13;
      if (!isEnter) return;
      e.preventDefault();
      e.stopPropagation();
      runEstimate({ normalizeInputs: true, showMissingZipError: true });
    }

	    zipInput.addEventListener("keydown", onEnterKey);

	    stateInput.addEventListener("input", function () {
	      if (estimateInFlight) abortInFlightEstimate();
	      var cart = loadCart();
	      renderItemsSubtotal(cart);
	      var sig = cartSignature(cart);
	      var zip = normalizeZip(zipInput.value);
	      var zipDigits = zip.replace(/\D/g, "");
	      var state = normalizeState(stateInput.value);

	      if (!zipDigits || zipDigits.length < 5) {
	        if (state && state.length >= 2) setStatus("Enter your ZIP code to calculate.");
	        else setStatus("");
	      } else if (!state || state.length < 2) {
	        setStatus("Enter your state code to calculate.");
	      } else {
	        setStatus("");
	      }

	      if (lastEstimate && String(lastEstimate.cartSig || "") === sig) {
	        if (String(lastEstimate.zip || "") !== zip || String(lastEstimate.state || "") !== state) {
	          clearEstimate();
	          resetAmounts();
	          renderCartSubtotalLine(cart);
	        }
	      }

	      if (zipDigits && zipDigits.length >= 5 && state && state.length >= 2) scheduleAutoEstimate();
	      else clearAutoTimer();
	    });

    stateInput.addEventListener("blur", function () {
      stateInput.value = normalizeState(stateInput.value);
    });

    stateInput.addEventListener("keydown", onEnterKey);

    refreshEstimateWidget(loadCart());
  }

  function refreshEstimateWidget(cart) {
    if (!estimateEls || !estimateEls.box) return;

    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    var hasItems = !!items.length;
    var canEstimate = hasItems && isShopEnabled();

    estimateEls.box.hidden = !canEstimate;
    if (estimateEls.breakdown) estimateEls.breakdown.hidden = false;
    if (estimateEls.itemsSubtotal) estimateEls.itemsSubtotal.textContent = formatMoney(getTotalCents(cart));

    if (!canEstimate) {
      clearEstimate();
      if (estimateEls.shipping) estimateEls.shipping.textContent = "\u2014";
      if (estimateEls.tax) estimateEls.tax.textContent = "\u2014";
      if (estimateEls.discountRow) estimateEls.discountRow.hidden = true;
      if (estimateEls.discount) estimateEls.discount.textContent = "\u2014";
      if (estimateEls.status) {
        estimateEls.status.hidden = true;
        estimateEls.status.textContent = "";
      }
      renderCartSubtotalLine(cart);
    }

    var sig = cartSignature(cart);
    if (sig !== lastEstimateCartSig) {
      lastEstimateCartSig = sig;
      clearEstimate();
      if (estimateEls.shipping) estimateEls.shipping.textContent = "\u2014";
      if (estimateEls.tax) estimateEls.tax.textContent = "\u2014";
      if (estimateEls.discountRow) estimateEls.discountRow.hidden = true;
      if (estimateEls.discount) estimateEls.discount.textContent = "\u2014";
      estimateEls.status.hidden = true;
      estimateEls.status.textContent = "";
      renderCartSubtotalLine(cart);
    }

    if (estimateEls.btn) {
      estimateEls.btn.disabled = !canEstimate || estimateInFlight;
    }
  }

  function wireFab() {
    var fab = getFab();
    if (!fab) return;
    fab.addEventListener("click", function (e) {
      // Prevent Dimension's "click outside article closes it" behavior from firing.
      e.stopPropagation();
    });
  }

  function wireArticleVisibilityObserver() {
    if (!("MutationObserver" in window)) return;
    if (!document.body) return;

    try {
      var obs = new MutationObserver(function () {
        refreshFab();
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (_) {
      // ignore
    }
  }

  function wireCartLeaveObserver() {
    if (!("MutationObserver" in window)) return;
    var cartArticle = document.getElementById("cart");
    if (!cartArticle) return;

    var wasActive = cartArticle.classList.contains("active");
    try {
      var obs = new MutationObserver(function () {
        var isActive = cartArticle.classList.contains("active");
        if (wasActive && !isActive) {
          clearEstimateOnCartLeave();
        }
        wasActive = isActive;
      });
      obs.observe(cartArticle, { attributes: true, attributeFilter: ["class"] });
    } catch (_) {
      // ignore
    }
  }

  function wireCartLayoutWatcher() {
    var mq = null;
    try {
      mq = window.matchMedia ? window.matchMedia("(max-width: 736px)") : null;
    } catch (_) {
      mq = null;
    }

    var lastIsMobile = mq ? !!mq.matches : null;
    var timer = null;

    function isMobileNow() {
      if (!window.matchMedia) return false;
      try {
        return window.matchMedia("(max-width: 736px)").matches;
      } catch (_) {
        return false;
      }
    }

    function schedule() {
      if (timer) return;
      timer = setTimeout(function () {
        timer = null;
        var next = isMobileNow();
        if (lastIsMobile === null) {
          lastIsMobile = next;
          return;
        }
        if (next !== lastIsMobile) {
          lastIsMobile = next;
          if (window.location.hash === "#cart") renderCartPage();
        }
      }, 100);
    }

    if (mq) {
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", schedule);
      else if (typeof mq.addListener === "function") mq.addListener(schedule);
    }

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
  }

  // Public API for art pages.
  function addToCart(payload) {
    if (!payload || !payload.artId || !payload.optionId) return { items: [] };

    var item = {
      key: String(payload.artId) + "::" + String(payload.optionId),
      artId: String(payload.artId),
      title: String(payload.title || payload.artId),
      thumb: String(payload.thumb || ""),
      optionId: String(payload.optionId),
      optionLabel: String(payload.optionLabel || ""),
      finishId: String(payload.finishId || ""),
      finishLabel: String(payload.finishLabel || ""),
      sizeId: String(payload.sizeId || ""),
      sizeLabel: String(payload.sizeLabel || ""),
      printful_variant_id: normalizePositiveInt(payload.printful_variant_id || payload.printfulVariantId),
      printful_sync_variant_id: normalizePositiveInt(payload.printful_sync_variant_id || payload.printfulSyncVariantId),
      printful_product_id: normalizePositiveInt(payload.printful_product_id || payload.printfulProductId),
      priceCents: parseInt(payload.priceCents, 10) || 0,
      qty: normalizeQty(payload.qty)
    };

    return upsertItem(item);
  }

  window.MELKAPOW_CART = {
    load: loadCart,
    add: addToCart,
    remove: removeItem,
    updateQty: updateQty,
    clear: clearCart,
    count: function () { return getCount(loadCart()); },
    totalCents: function () { return getTotalCents(loadCart()); },
    formatMoney: formatMoney,
    refreshFab: refreshFab,
    render: renderCartPage
  };

  // Init.
  window.addEventListener("melkapow:cart-updated", function () {
    refreshFab();
    if (window.location.hash === "#cart") renderCartPage();
  });

  // Only needed when using localStorage (cross-tab updates).
  if (!usingSessionStorage) {
    window.addEventListener("storage", function (e) {
      if (e && e.key === STORAGE_KEY) refreshFab();
    });
  }

  var lastHash = window.location.hash || "";
  window.addEventListener("hashchange", function () {
    var nextHash = window.location.hash || "";
    var leavingCart = lastHash === "#cart" && nextHash !== "#cart";
    lastHash = nextHash;

    if (leavingCart) {
      clearEstimateOnCartLeave();
    }

    refreshFab();
    if (nextHash === "#cart") renderCartPage();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      refreshFab();
      wireFab();
      wireEstimateWidget();
      wireArticleVisibilityObserver();
      wireCartLeaveObserver();
      wireCartLayoutWatcher();
      if (window.location.hash === "#cart") renderCartPage();
    });
  } else {
    refreshFab();
    wireFab();
    wireEstimateWidget();
    wireArticleVisibilityObserver();
    wireCartLeaveObserver();
    wireCartLayoutWatcher();
    if (window.location.hash === "#cart") renderCartPage();
  }
})();
