// assets/js/cart.js
(function () {
  "use strict";

  var STORAGE_KEY = "melkapow_cart_v1";
  var MAX_QTY = 99;

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

  function formatMoney(cents) {
    var n = parseInt(cents, 10);
    if (!isFinite(n)) n = 0;
    var dollars = (n / 100).toFixed(2);
    return "$" + dollars;
  }

  function loadCart() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      raw = null;
    }

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
      if (!finishId && it.productType === "canvas") finishId = "stretched-canvas";
      if (!finishId && it.productType === "prints") finishId = "fine-art-paper";

      if (!finishLabel && it.productType === "canvas") finishLabel = "Stretched Canvas";
      if (!finishLabel && it.productType === "prints") finishLabel = "Fine Art Paper";

      if (!sizeLabel) sizeLabel = optionLabel || String(it.optionId || "");

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
        priceCents: parseInt(it.priceCents, 10) || 0,
        qty: normalizeQty(it.qty)
      });
    }

    return { items: clean };
  }

  function saveCart(cart) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (_) {
      // ignore
    }
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
    var totalEl = document.getElementById("cartTotal");
    if (!wrap || !empty || !totalEl) return;

    var cart = loadCart();
    var items = cart.items;

    wrap.innerHTML = "";

    if (!items.length) {
      empty.hidden = false;
      totalEl.textContent = formatMoney(0);
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

        var title = document.createElement("h4");
        title.className = "cart-item-title";
        title.textContent = it.title || it.artId;

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "button small cart-remove cart-remove-x";
        removeBtn.textContent = "\u2715";
        removeBtn.setAttribute("data-key", it.key);
        removeBtn.setAttribute("aria-label", "Remove from cart");

        top.appendChild(title);
        top.appendChild(removeBtn);
        itemBox.appendChild(top);

        var meta = document.createElement("p");
        meta.className = "cart-item-meta";
        var finish = it.finishLabel || it.finishId || "";
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
        "<th>Finish</th>" +
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
        tdTitle.textContent = it2.title || it2.artId;

        var tdFinish = document.createElement("td");
        tdFinish.textContent = it2.finishLabel || it2.finishId || "";

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

    totalEl.textContent = formatMoney(getTotalCents(cart));

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

  window.addEventListener("storage", function (e) {
    if (e && e.key === STORAGE_KEY) refreshFab();
  });

  window.addEventListener("hashchange", function () {
    refreshFab();
    if (window.location.hash === "#cart") renderCartPage();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      refreshFab();
      wireFab();
      wireArticleVisibilityObserver();
      if (window.location.hash === "#cart") renderCartPage();
    });
  } else {
    refreshFab();
    wireFab();
    wireArticleVisibilityObserver();
    if (window.location.hash === "#cart") renderCartPage();
  }
})();
