// assets/js/checkout.js
(function () {
  "use strict";

  var ADDRESS_KEY = "melkapow_checkout_address_v1";

  var storage = null;

  (function initStorage() {
    try {
      var testKey = "__melkapow_checkout_test__";
      window.sessionStorage.setItem(testKey, "1");
      window.sessionStorage.removeItem(testKey);
      storage = window.sessionStorage;
      return;
    } catch (_) {
      // ignore
    }

    try {
      var testKey2 = "__melkapow_checkout_test__";
      window.localStorage.setItem(testKey2, "1");
      window.localStorage.removeItem(testKey2);
      storage = window.localStorage;
    } catch (_) {
      storage = null;
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

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function getApiBase() {
    var base = window.MELKAPOW_API_BASE;
    if (typeof base === "string" && base.trim()) return base.replace(/\/+$/, "");

    var host = location.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "0:0:0:0:0:0:0:1"
    ) {
      return "http://127.0.0.1:8000";
    }

    var isPrivateIp = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(host);
    if (isPrivateIp) return location.protocol + "//" + host + ":8000";

    return "";
  }

  function isShopEnabled() {
    return !!(getApiBase() && typeof fetch === "function");
  }

  function formatMoney(cents) {
    if (window.MELKAPOW_CART && typeof window.MELKAPOW_CART.formatMoney === "function") {
      return window.MELKAPOW_CART.formatMoney(cents);
    }
    var n = parseInt(cents, 10);
    if (!isFinite(n)) n = 0;
    return "$" + (n / 100).toFixed(2);
  }

  function normalizeQty(qty) {
    var n = parseInt(qty, 10);
    if (!isFinite(n) || n < 1) n = 1;
    if (n > 99) n = 99;
    return n;
  }

  function normalizePositiveInt(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n) || n <= 0) return null;
    return n;
  }

  function getCart() {
    if (window.MELKAPOW_CART && typeof window.MELKAPOW_CART.load === "function") {
      return window.MELKAPOW_CART.load();
    }
    return { items: [] };
  }

  function getCartSubtotalCents(cart) {
    if (window.MELKAPOW_CART && typeof window.MELKAPOW_CART.totalCents === "function") {
      return window.MELKAPOW_CART.totalCents();
    }
    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      total += (parseInt(it.priceCents, 10) || 0) * normalizeQty(it.qty);
    }
    return total;
  }

  function getCartKey(cart) {
    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      parts.push(String(it.key || "") + ":" + String(normalizeQty(it.qty)));
    }
    parts.sort();
    return parts.join("|");
  }

  function loadSavedAddress() {
    var raw = storageGet(ADDRESS_KEY);
    var parsed = raw ? safeJsonParse(raw) : null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      country_code: String(parsed.country_code || "US").trim().toUpperCase() || "US",
      state_code: String(parsed.state_code || "").trim().toUpperCase(),
      zip: String(parsed.zip || "").trim(),
      address1: String(parsed.address1 || "").trim(),
      address2: String(parsed.address2 || "").trim(),
      city: String(parsed.city || "").trim()
    };
  }

  function saveAddress(addr) {
    if (!storage || !addr) return;
    storageSet(
      ADDRESS_KEY,
      JSON.stringify({
        country_code: String(addr.country_code || "US").trim().toUpperCase() || "US",
        state_code: String(addr.state_code || "").trim().toUpperCase(),
        zip: String(addr.zip || "").trim(),
        address1: String(addr.address1 || "").trim(),
        address2: String(addr.address2 || "").trim(),
        city: String(addr.city || "").trim()
      })
    );
  }

  function getEls() {
    return {
      empty: document.getElementById("checkoutEmpty"),
      estimateBox: document.getElementById("checkoutEstimateBox"),
      form: document.getElementById("checkoutEstimateForm"),
      country: document.getElementById("checkoutCountry"),
      state: document.getElementById("checkoutState"),
      zip: document.getElementById("checkoutZip"),
      address1: document.getElementById("checkoutAddress1"),
      address2: document.getElementById("checkoutAddress2"),
      city: document.getElementById("checkoutCity"),
      btn: document.getElementById("checkoutEstimateBtn"),
      status: document.getElementById("checkoutEstimateStatus"),
      breakdown: document.getElementById("checkoutEstimateBreakdown")
    };
  }

  function setStatus(els, message) {
    if (!els || !els.status) return;
    els.status.textContent = message || "";
  }

  function setBreakdown(els, message) {
    if (!els || !els.breakdown) return;
    var text = message || "";
    if (!text) {
      els.breakdown.textContent = "";
      els.breakdown.hidden = true;
      return;
    }
    els.breakdown.textContent = text;
    els.breakdown.hidden = false;
  }

  function renderCheckout(els, cart) {
    if (!els || !els.empty || !els.estimateBox) return;

    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    var hasItems = !!items.length;

    els.empty.hidden = hasItems;
    els.estimateBox.hidden = !hasItems || !isShopEnabled();

    if (!hasItems) {
      setStatus(els, "");
      setBreakdown(els, "");
      return;
    }
  }

  var estimateState = { cartKey: "", result: null, error: "" };

  function buildEstimateRequest(cart, addr) {
    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    var pfItems = [];

    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var qty = normalizeQty(it.qty);

      var syncId = normalizePositiveInt(it.printful_sync_variant_id || it.printfulSyncVariantId);
      var variantId = normalizePositiveInt(it.printful_variant_id || it.printfulVariantId);

      if (!syncId && !variantId) continue;

      pfItems.push({
        printful_sync_variant_id: syncId,
        printful_variant_id: variantId,
        quantity: qty
      });
    }

    if (!pfItems.length) return null;

    var country = String((addr && addr.country_code) || "US").trim().toUpperCase() || "US";
    var state = String((addr && addr.state_code) || "").trim().toUpperCase();
    var zip = String((addr && addr.zip) || "").trim();
    var address1 = String((addr && addr.address1) || "").trim();
    var address2 = String((addr && addr.address2) || "").trim();
    var city = String((addr && addr.city) || "").trim();

    return {
      country_code: country,
      state_code: state || null,
      zip: zip || null,
      address1: address1 || null,
      address2: address2 || null,
      city: city || null,
      items: pfItems
    };
  }

  function renderEstimate(els, cart) {
    if (!els) return;
    var cartKey = getCartKey(cart);
    if (estimateState.cartKey && estimateState.cartKey !== cartKey) {
      estimateState.result = null;
      estimateState.error = "";
    }
    estimateState.cartKey = cartKey;

    if (estimateState.error) {
      setStatus(els, estimateState.error);
      setBreakdown(els, "");
      return;
    }

    if (estimateState.result && estimateState.result.ok) {
      var shipping = formatMoney(estimateState.result.shippingCents);
      var tax = formatMoney(estimateState.result.taxCents);
      var total = formatMoney(estimateState.result.totalCents);
      setStatus(els, "");
      setBreakdownRows(els, [
        { label: "Shipping", amount: shipping },
        { label: "Taxes", amount: tax },
        { label: "Total", amount: total, isTotal: true }
      ]);
      return;
    }

    setStatus(els, "");
    setBreakdownRows(els, []);
  }

  function clearBreakdown(els) {
    if (!els || !els.breakdown) return;
    els.breakdown.innerHTML = "";
    els.breakdown.hidden = true;
  }

  function setBreakdownRows(els, rows) {
    if (!els || !els.breakdown) return;
    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      clearBreakdown(els);
      return;
    }

    els.breakdown.innerHTML = "";
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || {};
      var label = String(row.label || "").trim();
      var amount = String(row.amount || "").trim();
      if (!label) continue;

      var elRow = document.createElement("div");
      elRow.className = "estimate-row" + (row.isTotal ? " estimate-row-total" : "");

      var elLabel = document.createElement("span");
      elLabel.className = "estimate-label";
      elLabel.textContent = label;

      var elAmount = document.createElement("span");
      elAmount.className = "estimate-amount";
      elAmount.textContent = amount;

      elRow.appendChild(elLabel);
      elRow.appendChild(elAmount);
      els.breakdown.appendChild(elRow);
    }

    els.breakdown.hidden = !els.breakdown.childNodes.length;
  }

  function wireCheckout() {
    var els = getEls();
    if (!els || !els.btn || !els.form) return;

    if (els.btn.__melkapowBound) return;
    els.btn.__melkapowBound = true;

    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
    });

    var saved = loadSavedAddress();
    if (saved) {
      if (els.country && saved.country_code) els.country.value = saved.country_code;
      if (els.state && saved.state_code) els.state.value = saved.state_code;
      if (els.zip && saved.zip) els.zip.value = saved.zip;
      if (els.address1 && saved.address1) els.address1.value = saved.address1;
      if (els.address2 && saved.address2) els.address2.value = saved.address2;
      if (els.city && saved.city) els.city.value = saved.city;
    }

    function refresh() {
      var cart = getCart();
      renderCheckout(els, cart);
      renderEstimate(els, cart);
    }

    els.btn.addEventListener("click", function () {
      var cart = getCart();
      if (!cart.items || !cart.items.length) {
        estimateState.result = null;
        estimateState.error = "Your cart is empty.";
        refresh();
        return;
      }

      var apiBase = getApiBase();
      if (!apiBase || typeof fetch !== "function") {
        estimateState.result = null;
        estimateState.error = "Shop server isn't available right now.";
        refresh();
        return;
      }

      var countryCode = els.country ? String(els.country.value || "US") : "US";
      var stateCode = els.state ? String(els.state.value || "") : "";
      var zipCode = els.zip ? String(els.zip.value || "") : "";
      var address1 = els.address1 ? String(els.address1.value || "") : "";
      var address2 = els.address2 ? String(els.address2.value || "") : "";
      var city = els.city ? String(els.city.value || "") : "";

      var countryUpper = String(countryCode).trim().toUpperCase() || "US";

      if (!String(address1).trim()) {
        estimateState.result = null;
        estimateState.error = "Please enter Address line 1 for an estimate.";
        refresh();
        return;
      }

      if (!String(city).trim()) {
        estimateState.result = null;
        estimateState.error = "Please enter a City for an estimate.";
        refresh();
        return;
      }

      if (countryUpper === "US" && !String(stateCode).trim()) {
        estimateState.result = null;
        estimateState.error = "Please enter a State code (e.g., CA) for an estimate.";
        refresh();
        return;
      }

      if (countryUpper === "US" && !String(zipCode).trim()) {
        estimateState.result = null;
        estimateState.error = "Please enter a ZIP code for an estimate.";
        refresh();
        return;
      }

      var addr = {
        country_code: countryUpper,
        state_code: String(stateCode || "").trim().toUpperCase(),
        zip: String(zipCode || "").trim(),
        address1: String(address1 || "").trim(),
        address2: String(address2 || "").trim(),
        city: String(city || "").trim()
      };

      saveAddress(addr);

      var req = buildEstimateRequest(cart, addr);
      if (!req) {
        estimateState.result = null;
        estimateState.error = "This cart can't be estimated yet.";
        refresh();
        return;
      }

      estimateState.error = "";
      estimateState.result = null;
      setStatus(els, "Calculating\u2026");
      setBreakdown(els, "");

      var originalText = els.btn.textContent;
      els.btn.disabled = true;
      els.btn.textContent = "Calculating\u2026";

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = null;
      if (controller) {
        timeoutId = setTimeout(function () {
          try { controller.abort(); } catch (_) { /* ignore */ }
        }, 20000);
      }

      fetch(apiBase + "/api/shop/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) {
              if (!res.ok) {
                var msg = (data && data.detail) ? String(data.detail) : "Estimate failed.";
                throw new Error(msg);
              }
              return data;
            });
        })
        .then(function (data) {
          estimateState.cartKey = getCartKey(cart);
          estimateState.result = data;
          estimateState.error = "";
          refresh();
        })
        .catch(function (err) {
          var msg = err && err.message ? String(err.message) : "";
          if (err && err.name === "AbortError") msg = "Estimate timed out. Please try again.";
          if (msg.toLowerCase().includes("failed to fetch")) {
            msg = "Can't reach the shop server at " + apiBase + ".";
          }
          estimateState.result = null;
          estimateState.error = msg || "Estimate failed.";
          refresh();
        })
        .finally(function () {
          if (timeoutId) clearTimeout(timeoutId);
          els.btn.disabled = false;
          els.btn.textContent = originalText;
        });
    });

    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#checkout") refresh();
    });

    window.addEventListener("melkapow:cart-updated", function () {
      if (window.location.hash === "#checkout") refresh();
    });

    // Initial.
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireCheckout);
  } else {
    wireCheckout();
  }
})();
