// assets/js/checkout.js
(function () {
  "use strict";

  var LAST_SESSION_KEY = "melkapow_last_checkout_session_v1";
  var ESTIMATE_ZIP_KEY = "melkapow_cart_estimate_zip_v1";
  var ESTIMATE_STATE_KEY = "melkapow_cart_estimate_state_v1";

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

  function normalizeQty(qty) {
    var n = parseInt(qty, 10);
    if (!isFinite(n) || n < 1) n = 1;
    if (n > 99) n = 99;
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

  function getCart() {
    if (window.MELKAPOW_CART && typeof window.MELKAPOW_CART.load === "function") {
      return window.MELKAPOW_CART.load();
    }
    return { items: [] };
  }

  function getCheckoutShipTo() {
    var zip = "";
    var state = "";

    var zipInput = document.getElementById("cartEstimateZip");
    var stateInput = document.getElementById("cartEstimateState");
    if (zipInput) zip = normalizeZip(zipInput.value);
    if (stateInput) state = normalizeState(stateInput.value);

    var zipDigits = zip.replace(/\D/g, "");
    if (zipDigits.length < 5 || state.length < 2) {
      zip = normalizeZip(storageGet(ESTIMATE_ZIP_KEY) || "");
      state = normalizeState(storageGet(ESTIMATE_STATE_KEY) || "");
      zipDigits = zip.replace(/\D/g, "");
    }

    if (zipDigits.length < 5 || state.length < 2) return null;
    return { zip: zip, state_code: state };
  }

  function buildCheckoutRequest(cart) {
    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    var out = [];

    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var qty = normalizeQty(it.qty);

      var syncId = parseInt(it.printful_sync_variant_id || it.printfulSyncVariantId, 10);
      if (!isFinite(syncId) || syncId <= 0) syncId = null;

      var variantId = parseInt(it.printful_variant_id || it.printfulVariantId, 10);
      if (!isFinite(variantId) || variantId <= 0) variantId = null;

      if (!syncId && !variantId) continue;

      out.push({
        printful_sync_variant_id: syncId,
        printful_variant_id: variantId,
        quantity: qty,
        art_id: String(it.artId || ""),
        title: String(it.title || "")
      });
    }

    var req = { items: out };
    var shipTo = getCheckoutShipTo();
    if (shipTo) {
      req.zip = shipTo.zip;
      req.state_code = shipTo.state_code;
    }
    return req;
  }

  function storageSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_) {
      // ignore
    }
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {
      // ignore
    }
  }

  function storageGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (_) {
      // ignore
    }
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function handleCheckoutReturn() {
    if (!("URLSearchParams" in window)) return;

    var hash = String(window.location.hash || "");
    var search = String(window.location.search || "");

    var params = null;
    try {
      params = new URLSearchParams(search);
    } catch (_) {
      params = null;
    }
    if (!params) return;

    var state = String(params.get("checkout") || "").trim().toLowerCase();
    if (!state) return;

    if (state === "success" && hash === "#checkout-success") {
      var sid = String(params.get("session_id") || "").trim();
      if (sid) storageSet(LAST_SESSION_KEY, sid);
      if (window.MELKAPOW_CART && typeof window.MELKAPOW_CART.clear === "function") {
        window.MELKAPOW_CART.clear();
      }
    }

    // Remove query params so refresh/back doesn't re-trigger.
    try {
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState({}, document.title, window.location.pathname + hash);
      }
    } catch (_) {
      // ignore
    }
  }

  function formatMoney(cents, currency) {
    var c = parseInt(cents, 10);
    if (!isFinite(c)) c = 0;
    var cur = String(currency || "USD").trim().toUpperCase() || "USD";

    if (typeof Intl === "object" && Intl && typeof Intl.NumberFormat === "function") {
      try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(c / 100);
      } catch (_) {
        // ignore
      }
    }

    var sym = cur === "USD" ? "$" : (cur === "EUR" ? "€" : (cur === "GBP" ? "£" : ""));
    var amount = (c / 100).toFixed(2);
    if (sym) return sym + amount;
    return cur + " " + amount;
  }

  function formatPaymentLabel(payment) {
    var p = payment && typeof payment === "object" ? payment : {};
    var pmType = String(p.type || "").trim().toLowerCase();
    var brand = String(p.brand || "").trim();
    var last4 = String(p.last4 || "").trim();

    // Preferred: show last4 if Stripe provides it.
    if (last4) {
      var b = brand ? brand.replace(/_/g, " ").trim().toUpperCase() : "CARD";
      return b + " ****" + last4;
    }

    // Otherwise, keep it simple/professional.
    if (pmType) return "STRIPE";
    if (brand) return "STRIPE";
    return "STRIPE";
  }

  function joinNonEmpty(parts, sep) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = String(parts[i] || "").trim();
      if (s) out.push(s);
    }
    return out.join(sep || "\n");
  }

  function normalizeAddressPart(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function addressSignature(addr) {
    var a = addr && typeof addr === "object" ? addr : {};
    return [
      normalizeAddressPart(a.line1),
      normalizeAddressPart(a.line2),
      normalizeAddressPart(a.city),
      normalizeAddressPart(a.state),
      normalizeAddressPart(a.postal_code),
      normalizeAddressPart(a.country)
    ].join("|");
  }

  function formatAddressBlock(name, addr) {
    var a = addr && typeof addr === "object" ? addr : {};
    var line1 = a.line1 || "";
    var line2 = a.line2 || "";
    var city = a.city || "";
    var state = a.state || "";
    var postal = a.postal_code || "";
    var country = a.country || "";

    var cityState = joinNonEmpty([city, state], ", ");
    var cityStatePostal = joinNonEmpty([cityState, postal], " ").trim();
    return joinNonEmpty([name, line1, line2, cityStatePostal, country], "\n");
  }

  function wireReceipt() {
    var receiptBox = document.getElementById("receiptBox");
    var statusMsg = document.getElementById("receiptStatusMsg");
    if (!receiptBox || !statusMsg) return;

    var loadingBox = document.getElementById("checkoutSuccessLoading");
    var contentBox = document.getElementById("checkoutSuccessContent");

    var elNumber = document.getElementById("receiptNumber");
    var elDate = document.getElementById("receiptDate");
    var elBilling = document.getElementById("receiptBilling");
    var elShippingBlock = document.getElementById("receiptShippingBlock");
    var elShipping = document.getElementById("receiptShipping");
    var elItemsBody = document.getElementById("receiptItemsBody");
    var elSubtotal = document.getElementById("receiptSubtotal");
    var elShippingRow = document.getElementById("receiptShippingRow");
    var elShippingAmt = document.getElementById("receiptShippingAmount");
    var elTaxRow = document.getElementById("receiptTaxRow");
    var elTax = document.getElementById("receiptTax");
    var elDiscountRow = document.getElementById("receiptDiscountRow");
    var elDiscount = document.getElementById("receiptDiscount");
    var elTotal = document.getElementById("receiptTotal");
    var elPaymentDate = document.getElementById("receiptPaymentDate");
    var elPaymentMethod = document.getElementById("receiptPaymentMethod");
    var elPaymentAmount = document.getElementById("receiptPaymentAmount");

    var lastLoadedSession = "";
    var lastEmailedSession = "";
    var emailInFlight = false;

    function splitItemDescription(item) {
      var it = item && typeof item === "object" ? item : {};
      var raw = String(it.description || "").trim();
      var title = String(it.title || "").trim();
      var details = String(it.details || "").trim();

      if ((!title || !details) && raw && raw.indexOf("—") >= 0) {
        var parts = raw
          .split("—")
          .map(function (p) { return String(p || "").trim(); })
          .filter(Boolean);

        if (parts.length > 1) {
          if (!title) title = parts[0];
          if (!details) details = parts.slice(1).join(" · ");
        }
      }

      if (!title) title = raw || "Item";
      return { title: title, details: details };
    }

    function setStatus(text) {
      var msg = text || "";
      statusMsg.textContent = msg;
      statusMsg.hidden = !msg;
    }

    function setHidden(el, hidden) {
      if (!el) return;
      el.hidden = !!hidden;
    }

    function setLoading(loading) {
      if (loadingBox) loadingBox.hidden = !loading;
      if (contentBox) contentBox.hidden = !!loading;
    }

    function render(receipt) {
      var r = receipt && typeof receipt === "object" ? receipt : {};
      var currency = String(r.currency || "USD").trim().toUpperCase() || "USD";

      setHidden(receiptBox, false);

      if (elNumber) elNumber.textContent = String(r.orderNumber || r.sessionId || "—");

      var createdIso = String(r.created || "");
      var dateText = "—";
      if (createdIso) {
        try {
          var d = new Date(createdIso);
          if (isFinite(d.getTime())) {
            var mm = String(d.getUTCMonth() + 1).padStart(2, "0");
            var dd = String(d.getUTCDate()).padStart(2, "0");
            var yy = String(d.getUTCFullYear()).slice(-2);
            dateText = mm + "/" + dd + "/" + yy;
          } else {
            dateText = createdIso;
          }
        } catch (_) {
          dateText = createdIso;
        }
      }
      if (elDate) elDate.textContent = dateText;
      if (elPaymentDate) elPaymentDate.textContent = dateText;

      var customer = r.customer && typeof r.customer === "object" ? r.customer : {};
      var shipping = r.shipping && typeof r.shipping === "object" ? r.shipping : {};

      var email = String(customer.email || "").trim();

      var billingText = formatAddressBlock(String(customer.name || ""), customer.address);
      if (!billingText) billingText = formatAddressBlock(String(shipping.name || ""), shipping.address);
      if (email) billingText = joinNonEmpty([billingText, email], "\n");
      if (elBilling) elBilling.textContent = billingText || "—";

      var billingSig = addressSignature(customer.address);
      if (!billingSig && shipping && shipping.address) billingSig = addressSignature(shipping.address);

      var shippingText = formatAddressBlock(String(shipping.name || ""), shipping.address);
      var shippingSig = addressSignature(shipping.address);
      var showShipping = !!(shippingText && shippingSig && billingSig && shippingSig !== billingSig);

      setHidden(elShippingBlock, !showShipping);
      if (elShipping) elShipping.textContent = showShipping ? shippingText : "";

      if (elItemsBody) {
        elItemsBody.innerHTML = "";
        var items = Array.isArray(r.items) ? r.items : [];
        for (var i = 0; i < items.length; i++) {
          var it = items[i] || {};
          var tr = document.createElement("tr");

          var tdItem = document.createElement("td");
          var desc = splitItemDescription(it);
          tdItem.textContent = "";
          var titleEl = document.createElement("div");
          titleEl.className = "receipt-item-title";
          titleEl.textContent = desc.title;
          tdItem.appendChild(titleEl);
          if (desc.details) {
            var detailsEl = document.createElement("div");
            detailsEl.className = "receipt-item-details";
            detailsEl.textContent = desc.details;
            tdItem.appendChild(detailsEl);
          }

          var tdQty = document.createElement("td");
          tdQty.className = "align-right receipt-mono";
          tdQty.textContent = String(parseInt(it.quantity, 10) || 1);

          var tdUnit = document.createElement("td");
          tdUnit.className = "align-right receipt-mono";
          var unit = parseInt(it.unitAmountCents, 10);
          tdUnit.textContent = isFinite(unit) && unit > 0 ? formatMoney(unit, currency) : "—";

          var tdTotal = document.createElement("td");
          tdTotal.className = "align-right receipt-mono";
          var lineTotal = parseInt(it.amountTotalCents, 10);
          tdTotal.textContent = isFinite(lineTotal) ? formatMoney(lineTotal, currency) : "—";

          tr.appendChild(tdItem);
          tr.appendChild(tdQty);
          tr.appendChild(tdUnit);
          tr.appendChild(tdTotal);
          elItemsBody.appendChild(tr);
        }
      }

      var subtotal = parseInt(r.amountSubtotalCents, 10);
      if (elSubtotal) elSubtotal.textContent = isFinite(subtotal) ? formatMoney(subtotal, currency) : "—";

      var shipCents = parseInt(r.amountShippingCents, 10) || 0;
      setHidden(elShippingRow, false);
      if (elShippingAmt) elShippingAmt.textContent = formatMoney(shipCents, currency);

      var taxCents = parseInt(r.amountTaxCents, 10) || 0;
      setHidden(elTaxRow, false);
      if (elTax) elTax.textContent = formatMoney(taxCents, currency);

      var discCents = parseInt(r.amountDiscountCents, 10) || 0;
      setHidden(elDiscountRow, !discCents);
      if (elDiscount) elDiscount.textContent = "-" + formatMoney(Math.abs(discCents), currency);

      var total = parseInt(r.amountTotalCents, 10);
      if (elTotal) elTotal.textContent = isFinite(total) ? formatMoney(total, currency) : "—";

      var payment = r.payment && typeof r.payment === "object" ? r.payment : {};
      if (elPaymentMethod) elPaymentMethod.textContent = formatPaymentLabel(payment) || "—";
      if (elPaymentAmount) elPaymentAmount.textContent = isFinite(total) ? formatMoney(total, currency) : "—";

    }

    function emailInvoiceOnce(sessionId, apiBase) {
      var sid = String(sessionId || "").trim();
      var base = String(apiBase || "").trim();
      if (!sid || !base || typeof fetch !== "function") return;
      if (emailInFlight) return;
      if (lastEmailedSession === sid) return;
      lastEmailedSession = sid;
      emailInFlight = true;

      fetch(base + "/api/shop/checkout/session/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, force: false })
      })
        .then(function (res) {
          if (res && res.ok) return;
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) {
              var msg = (data && data.detail) ? String(data.detail) : "Invoice email unavailable.";
              throw new Error(msg);
            });
        })
        .catch(function () {
          setStatus("Invoice email could not be sent automatically right now. If you don't receive it soon, please contact us.");
        })
        .finally(function () {
          emailInFlight = false;
        });
    }

    function refresh() {
      var atSuccess = window.location.hash === "#checkout-success";
      if (!atSuccess) {
        setStatus("");
        return;
      }

      var sessionId = String(storageGet(LAST_SESSION_KEY) || "").trim();
      if (!sessionId) {
        setHidden(receiptBox, true);
        setStatus("Invoice details are unavailable. If you need help, contact us.");
        setLoading(false);
        return;
      }

      if (lastLoadedSession === sessionId && !receiptBox.hidden) {
        setStatus("");
        setLoading(false);
        return;
      }
      lastLoadedSession = sessionId;

      setLoading(true);

      var apiBase = getApiBase();
      if (!apiBase || typeof fetch !== "function") {
        setHidden(receiptBox, true);
        setStatus("Can't reach the shop server to load your invoice.");
        setLoading(false);
        return;
      }

      setHidden(receiptBox, true);
      setStatus("");

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = null;
      if (controller) {
        timeoutId = setTimeout(function () {
          try { controller.abort(); } catch (_) { /* ignore */ }
        }, 20000);
      }

      fetch(apiBase + "/api/shop/checkout/session?session_id=" + encodeURIComponent(sessionId), {
        method: "GET",
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) {
              if (!res.ok) {
                var msg = (data && data.detail) ? String(data.detail) : "Failed to load invoice.";
                throw new Error(msg);
              }
              return data;
            });
        })
        .then(function (data) {
          if (!data || !data.ok) throw new Error("Failed to load invoice.");
          render(data);
          emailInvoiceOnce(sessionId, apiBase);
          setStatus("");
          setLoading(false);
        })
        .catch(function () {
          setHidden(receiptBox, true);
          setStatus("Invoice details are unavailable right now. Please check your email for a receipt.");
          setLoading(false);
        })
        .finally(function () {
          if (timeoutId) clearTimeout(timeoutId);
        });
    }

    window.addEventListener("hashchange", refresh);
    refresh();
  }

  function wireCartCheckout() {
    var btn = document.getElementById("cartCheckoutBtn");
    if (!btn) return;

    if (btn.__melkapowBound) return;
    btn.__melkapowBound = true;

    var statusEl = document.getElementById("cartCheckoutStatus");

    function setStatus(message) {
      if (!statusEl) return;
      var text = message || "";
      statusEl.textContent = text;
      statusEl.hidden = !text;
    }

    function refresh() {
      var cart = getCart();
      var items = cart && Array.isArray(cart.items) ? cart.items : [];
      var hasItems = !!items.length;

      if (!hasItems) {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        setStatus("");
        return;
      }

      if (!isShopEnabled()) {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        setStatus("Shop server isn't available right now.");
        return;
      }

      btn.disabled = false;
      btn.setAttribute("aria-disabled", "false");
    }

    btn.addEventListener("click", function () {
      var cart = getCart();
      if (!cart.items || !cart.items.length) {
        setStatus("Your cart is empty.");
        refresh();
        return;
      }

      var apiBase = getApiBase();
      if (!apiBase || typeof fetch !== "function") {
        setStatus("Shop server isn't available right now.");
        refresh();
        return;
      }

      var req = buildCheckoutRequest(cart);
      if (!req.items || !req.items.length) {
        setStatus("This cart can't be checked out yet.");
        refresh();
        return;
      }

      var originalText = btn.textContent;
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      btn.textContent = "Starting checkout\u2026";
      setStatus("");

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = null;
      if (controller) {
        timeoutId = setTimeout(function () {
          try { controller.abort(); } catch (_) { /* ignore */ }
        }, 25000);
      }

      fetch(apiBase + "/api/shop/checkout", {
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
                var msg = (data && data.detail) ? String(data.detail) : "Checkout failed.";
                throw new Error(msg);
              }
              return data;
            });
        })
        .then(function (data) {
          var url = data && data.url ? String(data.url) : "";
          if (!url) throw new Error("Checkout URL missing.");
          setStatus("Redirecting\u2026");
          window.location.assign(url);
        })
        .catch(function (err) {
          var msg = err && err.message ? String(err.message) : "";
          if (err && err.name === "AbortError") msg = "Checkout timed out. Please try again.";
          if (msg.toLowerCase().includes("failed to fetch")) {
            msg = "Can't reach the shop server at " + apiBase + ".";
          }
          setStatus(msg || "Checkout failed.");
          refresh();
        })
        .finally(function () {
          if (timeoutId) clearTimeout(timeoutId);
          btn.textContent = originalText;
          refresh();
        });
    });

    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#cart") refresh();
    });

    window.addEventListener("melkapow:cart-updated", function () {
      if (window.location.hash === "#cart") refresh();
    });

    // Initial.
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      handleCheckoutReturn();
      wireCartCheckout();
      wireReceipt();
    });
  } else {
    handleCheckoutReturn();
    wireCartCheckout();
    wireReceipt();
  }
})();
