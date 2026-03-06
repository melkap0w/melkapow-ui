// assets/js/checkout.js
(function () {
  "use strict";

  var LAST_SESSION_KEY = "melkapow_last_checkout_session_v1";
  var SHIPPING_FORM_KEY = "melkapow_checkout_shipping_form_v1";
  var SHIPPING_ESTIMATE_KEY = "melkapow_checkout_shipping_estimate_v1";
  var LAST_SHIPPING_SNAPSHOT_KEY = "melkapow_last_checkout_shipping_snapshot_v1";
  var CHECKOUT_COUNTRIES_KEY = "melkapow_checkout_countries_v1";
  var CART_DISCOUNT_CODE_KEY = "melkapow_cart_discount_code_v1";
  var CART_DISCOUNT_PREVIEW_KEY = "melkapow_cart_discount_preview_v1";
  var CART_STORAGE_KEY = "melkapow_cart_v1";
  var CHECKOUT_ATTEMPT_KEY = "melkapow_checkout_attempt_v1";
  var CHECKOUT_RESULT_KEY = "melkapow_checkout_result_v1";
  var DISCOUNT_CODE_EVENT = "melkapow:discount-code-updated";
  var CHECKOUT_STALE_ATTEMPT_MESSAGE = "Payment not completed. Please try checkout again.";

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

  function storageRemove(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (_) {
      // ignore
    }
    try {
      window.localStorage.removeItem(key);
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

  function normalizeQty(qty) {
    var n = parseInt(qty, 10);
    if (!isFinite(n) || n < 1) n = 1;
    if (n > 99) n = 99;
    return n;
  }

  function normalizeSimpleText(value, maxLen) {
    var raw = String(value || "").replace(/\s+/g, " ").trim();
    var limit = parseInt(maxLen, 10);
    if (isFinite(limit) && limit > 0 && raw.length > limit) raw = raw.slice(0, limit).trim();
    return raw;
  }

  function pickOwnValue(obj, keys) {
    if (!obj || typeof obj !== "object") return undefined;
    var hasOwn = Object.prototype.hasOwnProperty;
    var list = Array.isArray(keys) ? keys : [];
    for (var i = 0; i < list.length; i++) {
      var key = String(list[i] || "");
      if (!key) continue;
      if (hasOwn.call(obj, key)) return obj[key];
    }
    return undefined;
  }

  function normalizeDiscountCode(value) {
    var raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";
    raw = raw.replace(/[^A-Z0-9_-]/g, "");
    if (raw.length > 20) raw = raw.slice(0, 20);
    return raw;
  }

  function splitFullName(value) {
    var fullName = normalizeSimpleText(value, 120);
    if (!fullName) return { firstName: "", lastName: "" };
    var parts = fullName.split(" ");
    if (parts.length < 2) {
      return { firstName: fullName, lastName: "" };
    }
    return {
      firstName: normalizeSimpleText(parts.shift(), 120),
      lastName: normalizeSimpleText(parts.join(" "), 120)
    };
  }

  function joinFullName(firstName, lastName) {
    var first = normalizeSimpleText(firstName, 120);
    var last = normalizeSimpleText(lastName, 120);
    return normalizeSimpleText(joinNonEmpty([first, last], " "), 120);
  }

  function loadDiscountCode() {
    return normalizeDiscountCode(storageGet(CART_DISCOUNT_CODE_KEY) || "");
  }

  function saveDiscountCode(code) {
    var normalized = normalizeDiscountCode(code);
    if (!normalized) {
      storageRemove(CART_DISCOUNT_CODE_KEY);
      clearDiscountPreviewState();
    } else {
      storageSet(CART_DISCOUNT_CODE_KEY, normalized);
    }

    try {
      window.dispatchEvent(new Event(DISCOUNT_CODE_EVENT));
    } catch (_) {
      // ignore
    }
    return normalized;
  }

  function normalizeDiscountPreviewState(raw) {
    if (!raw || typeof raw !== "object") return null;

    var code = normalizeDiscountCode(raw.code || raw.discountCode || "");
    if (!code) return null;

    var subtotalCents = parseInt(raw.subtotalCents, 10);
    if (!isFinite(subtotalCents) || subtotalCents < 0) subtotalCents = 0;

    var discountCents = parseInt(raw.discountCents, 10);
    if (!isFinite(discountCents) || discountCents < 0) discountCents = 0;
    if (discountCents > subtotalCents) discountCents = subtotalCents;

    var currency = String(raw.currency || "USD").trim().toUpperCase() || "USD";
    var ts = parseInt(raw.ts, 10);
    if (!isFinite(ts) || ts < 0) ts = 0;

    return {
      code: code,
      subtotalCents: subtotalCents,
      discountCents: discountCents,
      currency: currency,
      ts: ts
    };
  }

  function loadDiscountPreviewState() {
    return normalizeDiscountPreviewState(safeJsonParse(storageGet(CART_DISCOUNT_PREVIEW_KEY) || ""));
  }

  function saveDiscountPreviewState(next) {
    var normalized = normalizeDiscountPreviewState(next);
    if (!normalized) {
      storageRemove(CART_DISCOUNT_PREVIEW_KEY);
      return null;
    }

    storageSet(
      CART_DISCOUNT_PREVIEW_KEY,
      JSON.stringify({
        code: normalized.code,
        subtotalCents: normalized.subtotalCents,
        discountCents: normalized.discountCents,
        currency: normalized.currency,
        ts: Date.now()
      })
    );
    return normalized;
  }

  function clearDiscountPreviewState() {
    storageRemove(CART_DISCOUNT_PREVIEW_KEY);
  }

  function resolveDiscountForSubtotal(subtotalCents, discountCodeCandidate, discountCentsCandidate) {
    var subtotal = parseInt(subtotalCents, 10);
    if (!isFinite(subtotal) || subtotal < 0) subtotal = 0;

    var preview = loadDiscountPreviewState();
    var code = normalizeDiscountCode(discountCodeCandidate || loadDiscountCode() || "");
    if (!code && preview && parseInt(preview.subtotalCents, 10) === subtotal) {
      var previewCode = normalizeDiscountCode(preview.code || "");
      var previewDiscountForFallback = parseInt(preview.discountCents, 10);
      if (previewCode && isFinite(previewDiscountForFallback) && previewDiscountForFallback > 0) {
        code = previewCode;
      }
    }

    var discountCents = parseInt(discountCentsCandidate, 10);
    if (!isFinite(discountCents) || discountCents < 0) discountCents = 0;

    // Keep discount at zero unless a coupon code is applied.
    if (!code) discountCents = 0;

    if (code && preview && preview.code === code) {
      var previewDiscount = parseInt(preview.discountCents, 10);
      if (isFinite(previewDiscount) && previewDiscount > 0) {
        // If the backend estimate doesn't echo discount fields (or we just cleared estimateState),
        // fall back to the last preview so the displayed total doesn't "jump" during checkout.
        if (parseInt(preview.subtotalCents, 10) === subtotal) {
          if (previewDiscount > discountCents) discountCents = previewDiscount;
        } else if (!discountCents) {
          discountCents = previewDiscount;
        }
      }
    }

    if (discountCents > subtotal) discountCents = subtotal;
    if (discountCents < 0) discountCents = 0;

    return {
      code: code,
      cents: discountCents
    };
  }

  function loadCheckoutAttemptState() {
    var raw = safeJsonParse(storageGet(CHECKOUT_ATTEMPT_KEY) || "");
    if (!raw || typeof raw !== "object") return null;
    return {
      status: normalizeSimpleText(raw.status || "", 32).toLowerCase(),
      ts: parseInt(raw.ts, 10) || 0,
      message: normalizeSimpleText(raw.message || "", 220)
    };
  }

  function saveCheckoutAttemptState(next) {
    var s = next && typeof next === "object" ? next : {};
    storageSet(
      CHECKOUT_ATTEMPT_KEY,
      JSON.stringify({
        status: normalizeSimpleText(s.status || "", 32).toLowerCase(),
        ts: Date.now(),
        message: normalizeSimpleText(s.message || "", 220)
      })
    );
  }

  function clearCheckoutAttemptState() {
    storageRemove(CHECKOUT_ATTEMPT_KEY);
  }

  function loadCheckoutResultState() {
    var raw = safeJsonParse(storageGet(CHECKOUT_RESULT_KEY) || "");
    if (!raw || typeof raw !== "object") return null;
    var out = {
      status: normalizeSimpleText(raw.status || "", 32).toLowerCase(),
      ts: parseInt(raw.ts, 10) || 0,
      message: normalizeSimpleText(raw.message || "", 220)
    };
    // Migration: older builds persisted the "stale attempt" warning as a failed result.
    // Treat it as transient and clear it so it doesn't keep showing across pages/navigation.
    if (out.status === "failed") {
      var msgLc = String(out.message || "").trim().toLowerCase();
      if (
        msgLc.indexOf("payment attempt may not have completed") !== -1 ||
        msgLc.indexOf("payment not completed. please try checkout again") === 0
      ) {
        clearCheckoutResultState();
        return null;
      }
    }
    return out;
  }

  function saveCheckoutResultState(next) {
    var s = next && typeof next === "object" ? next : {};
    storageSet(
      CHECKOUT_RESULT_KEY,
      JSON.stringify({
        status: normalizeSimpleText(s.status || "", 32).toLowerCase(),
        ts: Date.now(),
        message: normalizeSimpleText(s.message || "", 220)
      })
    );
  }

  function clearCheckoutResultState() {
    storageRemove(CHECKOUT_RESULT_KEY);
  }

  function normalizeCountryCode(value) {
    var raw = String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!raw) return "";
    if (raw.length > 2) raw = raw.slice(0, 2);
    return raw;
  }

  function normalizeCountryName(value) {
    var name = normalizeSimpleText(value, 120);
    return name || "";
  }

  function normalizeCountryEntry(value) {
    if (!value || typeof value !== "object") return null;
    var code = normalizeCountryCode(value.code || value.country_code || value.id || "");
    if (!code) return null;
    var name = normalizeCountryName(value.name || value.label || value.country_name || "");
    return { code: code, name: name || code };
  }

  function normalizeCountryList(value) {
    var list = Array.isArray(value) ? value : [];
    if (!list.length) return [];

    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var row = normalizeCountryEntry(list[i]);
      if (!row) continue;
      if (seen[row.code]) continue;
      seen[row.code] = true;
      out.push(row);
    }
    return out;
  }

  var US_STATE_NAME_TO_CODE = {
    ALABAMA: "AL",
    ALASKA: "AK",
    ARIZONA: "AZ",
    ARKANSAS: "AR",
    CALIFORNIA: "CA",
    COLORADO: "CO",
    CONNECTICUT: "CT",
    DELAWARE: "DE",
    FLORIDA: "FL",
    GEORGIA: "GA",
    HAWAII: "HI",
    IDAHO: "ID",
    ILLINOIS: "IL",
    INDIANA: "IN",
    IOWA: "IA",
    KANSAS: "KS",
    KENTUCKY: "KY",
    LOUISIANA: "LA",
    MAINE: "ME",
    MARYLAND: "MD",
    MASSACHUSETTS: "MA",
    MICHIGAN: "MI",
    MINNESOTA: "MN",
    MISSISSIPPI: "MS",
    MISSOURI: "MO",
    MONTANA: "MT",
    NEBRASKA: "NE",
    NEVADA: "NV",
    NEWHAMPSHIRE: "NH",
    NEWJERSEY: "NJ",
    NEWMEXICO: "NM",
    NEWYORK: "NY",
    NORTHCAROLINA: "NC",
    NORTHDAKOTA: "ND",
    OHIO: "OH",
    OKLAHOMA: "OK",
    OREGON: "OR",
    PENNSYLVANIA: "PA",
    RHODEISLAND: "RI",
    SOUTHCAROLINA: "SC",
    SOUTHDAKOTA: "SD",
    TENNESSEE: "TN",
    TEXAS: "TX",
    UTAH: "UT",
    VERMONT: "VT",
    VIRGINIA: "VA",
    WASHINGTON: "WA",
    WESTVIRGINIA: "WV",
    WISCONSIN: "WI",
    WYOMING: "WY",

    DISTRICTOFCOLUMBIA: "DC",
    WASHINGTONDC: "DC",

    AMERICANSAMOA: "AS",
    GUAM: "GU",
    NORTHERNMARIANAISLANDS: "MP",
    PUERTORICO: "PR",
    USVIRGINISLANDS: "VI",
    VIRGINISLANDS: "VI",

    ARMEDFORCESAMERICAS: "AA",
    ARMEDFORCESEUROPE: "AE",
    ARMEDFORCESPACIFIC: "AP"
  };

  var US_STATE_CODE_SET = (function () {
    var out = {};
    var hasOwn = Object.prototype.hasOwnProperty;
    for (var k in US_STATE_NAME_TO_CODE) {
      if (!hasOwn.call(US_STATE_NAME_TO_CODE, k)) continue;
      out[US_STATE_NAME_TO_CODE[k]] = true;
    }
    // Military "states" commonly used for USPS addresses.
    out.AA = true;
    out.AE = true;
    out.AP = true;
    return out;
  })();

  function normalizeStateCode(value, countryCode) {
    var raw = String(value || "").trim();
    if (!raw) return "";

    var country = normalizeCountryCode(countryCode || "US") || "US";
    if (country === "US") {
      var letters = raw.toUpperCase().replace(/[^A-Z]/g, "");
      if (!letters) return "";
      if (letters.length === 2) return letters;

      // Handle full state names (e.g., "Pennsylvania" -> "PA") and common variants.
      var mapped = US_STATE_NAME_TO_CODE[letters];
      if (mapped) return mapped;

      // Handle "NY - New York" / "CA California" styles by trusting a valid prefix.
      var prefix = letters.slice(0, 2);
      if (US_STATE_CODE_SET[prefix]) return prefix;

      return "";
    }

    raw = raw.replace(/[^A-Za-z0-9 .'\-]/g, "");
    raw = raw.replace(/\s+/g, " ").trim();
    if (raw.length > 64) raw = raw.slice(0, 64).trim();
    return raw;
  }

  function normalizePostalCode(value, countryCode) {
    var raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";

    var country = normalizeCountryCode(countryCode || "US") || "US";
    if (country === "US") {
      raw = raw.replace(/[^\d-]/g, "");
      if (raw.length > 10) raw = raw.slice(0, 10);
      return raw;
    }

    raw = raw.replace(/[^A-Z0-9 -]/g, "");
    raw = raw.replace(/\s+/g, " ").trim();
    if (raw.length > 16) raw = raw.slice(0, 16).trim();
    return raw;
  }

  function normalizeShippingMethodId(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    raw = raw.replace(/[^a-zA-Z0-9 _:-]/g, "");
    if (raw.length > 80) raw = raw.slice(0, 80);
    return raw;
  }

  function normalizeShippingMethodName(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.length > 120) raw = raw.slice(0, 120);
    return raw;
  }

  function shippingMethodToken(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function normalizePositiveInt(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n) || n <= 0) return null;
    return n;
  }

  function normalizeIsoDate(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";

    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (!m) return "";
    return m[1] + "-" + m[2] + "-" + m[3];
  }

  function formatIsoDate(value) {
    var iso = normalizeIsoDate(value);
    if (!iso) return "";

    var parts = iso.split("-");
    if (parts.length !== 3) return "";

    var y = parseInt(parts[0], 10);
    var mo = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (!isFinite(y) || !isFinite(mo) || !isFinite(d)) return "";

    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (!isFinite(dt.getTime())) return "";

    if (typeof Intl === "object" && Intl && typeof Intl.DateTimeFormat === "function") {
      try {
        return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(dt);
      } catch (_) {
        // ignore
      }
    }

    return parts[1] + "/" + parts[2];
  }

  function normalizeDeliveryEstimate(value) {
    if (!value || typeof value !== "object") return null;

    var minDays = normalizePositiveInt(value.minDeliveryDays);
    var maxDays = normalizePositiveInt(value.maxDeliveryDays);
    if (minDays && maxDays && maxDays < minDays) {
      var swap = minDays;
      minDays = maxDays;
      maxDays = swap;
    }

    var minDate = normalizeIsoDate(value.minDeliveryDate);
    var maxDate = normalizeIsoDate(value.maxDeliveryDate);

    var methodId = normalizeShippingMethodId(value.shippingMethodId || value.id || "");
    var methodName = normalizeShippingMethodName(value.shippingMethodName || value.name || "");

    if (!minDays && !maxDays && !minDate && !maxDate && !methodName) return null;

    return {
      shippingMethodId: methodId,
      shippingMethodName: methodName,
      minDeliveryDays: minDays,
      maxDeliveryDays: maxDays,
      minDeliveryDate: minDate,
      maxDeliveryDate: maxDate
    };
  }

  function deliveryDaysText(delivery) {
    var d = delivery && typeof delivery === "object" ? delivery : {};
    var minDays = normalizePositiveInt(d.minDeliveryDays);
    var maxDays = normalizePositiveInt(d.maxDeliveryDays);

    if (minDays && maxDays) {
      if (maxDays < minDays) {
        var swap = minDays;
        minDays = maxDays;
        maxDays = swap;
      }
      if (minDays === maxDays) return String(minDays) + " business days";
      return String(minDays) + "-" + String(maxDays) + " business days";
    }

    if (minDays) return String(minDays) + "+ business days";
    if (maxDays) return "Up to " + String(maxDays) + " business days";
    return "";
  }

  function deliveryWindowText(delivery) {
    var d = normalizeDeliveryEstimate(delivery);
    if (!d) return "";

    var minDateLabel = formatIsoDate(d.minDeliveryDate);
    var maxDateLabel = formatIsoDate(d.maxDeliveryDate);
    if (minDateLabel && maxDateLabel) {
      return minDateLabel === maxDateLabel ? minDateLabel : (minDateLabel + " - " + maxDateLabel);
    }
    if (minDateLabel) return minDateLabel;
    if (maxDateLabel) return maxDateLabel;
    return deliveryDaysText(d);
  }

  function fallbackDeliveryWindowForMethod(methodId, methodName) {
    var tok = shippingMethodToken(methodId || methodName);
    if (tok === "standard") return "5-7 business days";
    if (tok === "express") return "1-3 business days";
    return "";
  }

  function prettyShippingMethodName(methodId, methodName) {
    var name = normalizeShippingMethodName(methodName);
    if (name) return name;

    var raw = normalizeShippingMethodId(methodId);
    if (!raw) return "Shipping";
    raw = raw.replace(/[_-]+/g, " ");
    raw = raw.replace(/\s+/g, " ").trim();
    if (!raw) return "Shipping";

    return raw
      .split(" ")
      .map(function (part) {
        var p = String(part || "").trim();
        if (!p) return "";
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      })
      .join(" ");
  }

  function normalizeShippingOption(value) {
    if (!value || typeof value !== "object") return null;

    var methodId = normalizeShippingMethodId(
      value.shippingMethodId || value.id || value.shipping_method_id || value.shipping || ""
    );
    var methodName = normalizeShippingMethodName(value.shippingMethodName || value.name || "");

    if (!methodId && methodName) {
      methodId = normalizeShippingMethodId(methodName.toLowerCase().replace(/\s+/g, "_"));
    }
    if (!methodId && !methodName) return null;

    var shippingCents = parseInt(value.shippingCents, 10);
    if (!isFinite(shippingCents) || shippingCents < 0) shippingCents = null;

    var delivery = normalizeDeliveryEstimate(value.deliveryEstimate || value);
    if (!methodId && delivery && delivery.shippingMethodId) {
      methodId = normalizeShippingMethodId(delivery.shippingMethodId);
    }
    if (!methodName && delivery && delivery.shippingMethodName) {
      methodName = normalizeShippingMethodName(delivery.shippingMethodName);
    }

    methodName = prettyShippingMethodName(methodId, methodName);
    if (!methodId && methodName) {
      methodId = normalizeShippingMethodId(methodName.toLowerCase().replace(/\s+/g, "_"));
    }
    if (!methodId) return null;

    return {
      shippingMethodId: methodId,
      shippingMethodName: methodName,
      shippingCents: shippingCents,
      deliveryEstimate: delivery
    };
  }

  function normalizeShippingOptions(value) {
    var list = Array.isArray(value) ? value : [];
    if (!list.length) return [];

    var out = [];
    var seen = {};

    for (var i = 0; i < list.length; i++) {
      var opt = normalizeShippingOption(list[i]);
      if (!opt) continue;

      var token = shippingMethodToken(opt.shippingMethodId || opt.shippingMethodName);
      if (!token) continue;

      if (seen[token]) {
        for (var j = 0; j < out.length; j++) {
          var existing = out[j];
          if (shippingMethodToken(existing.shippingMethodId || existing.shippingMethodName) !== token) continue;
          if (existing.shippingCents == null && opt.shippingCents != null) existing.shippingCents = opt.shippingCents;
          if (!existing.deliveryEstimate && opt.deliveryEstimate) existing.deliveryEstimate = opt.deliveryEstimate;
          if (!existing.shippingMethodName && opt.shippingMethodName) existing.shippingMethodName = opt.shippingMethodName;
          break;
        }
        continue;
      }

      seen[token] = true;
      out.push(opt);
    }

    out.sort(function (a, b) {
      var ta = shippingMethodToken(a.shippingMethodId || a.shippingMethodName);
      var tb = shippingMethodToken(b.shippingMethodId || b.shippingMethodName);
      var pa = ta === "standard" ? 0 : ta === "express" ? 1 : 2;
      var pb = tb === "standard" ? 0 : tb === "express" ? 1 : 2;
      if (pa !== pb) return pa - pb;
      var na = String(a.shippingMethodName || a.shippingMethodId || "").toLowerCase();
      var nb = String(b.shippingMethodName || b.shippingMethodId || "").toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    });

    return out;
  }

  function selectShippingOption(options, preferredId, fallbackDelivery) {
    var opts = Array.isArray(options) ? options : [];
    if (!opts.length) return null;

    var preferredToken = shippingMethodToken(preferredId);
    if (preferredToken) {
      for (var i = 0; i < opts.length; i++) {
        var tok = shippingMethodToken(opts[i].shippingMethodId || opts[i].shippingMethodName);
        if (tok && tok === preferredToken) return opts[i];
      }
    }

    var fallback = normalizeDeliveryEstimate(fallbackDelivery);
    var fallbackToken = shippingMethodToken(fallback && (fallback.shippingMethodId || fallback.shippingMethodName));
    if (fallbackToken) {
      for (var j = 0; j < opts.length; j++) {
        var tok2 = shippingMethodToken(opts[j].shippingMethodId || opts[j].shippingMethodName);
        if (tok2 && tok2 === fallbackToken) return opts[j];
      }
    }

    for (var k = 0; k < opts.length; k++) {
      var tok3 = shippingMethodToken(opts[k].shippingMethodId || opts[k].shippingMethodName);
      if (tok3 === "standard") return opts[k];
    }

    return opts[0];
  }

  function normalizeEstimateState(raw) {
    if (!raw || typeof raw !== "object") return null;

    var currency = pickOwnValue(raw, ["currency"]);
    var shippingCents = pickOwnValue(raw, ["shippingCents", "shipping_cents"]);
    var taxCents = pickOwnValue(raw, ["taxCents", "tax_cents"]);
    var taxProvider = pickOwnValue(raw, ["taxProvider", "tax_provider"]);
    var stripeTaxCalculationId = pickOwnValue(raw, ["stripeTaxCalculationId", "stripe_tax_calculation_id"]);
    var discountCents = pickOwnValue(raw, ["discountCents", "discount_cents"]);
    var discountCode = pickOwnValue(raw, ["discountCode", "discount_code"]);
    var totalCents = pickOwnValue(raw, ["totalCents", "total_cents", "total"]);
    var shippingOptions = pickOwnValue(raw, ["shippingOptions", "shipping_options"]);
    var selectedShippingMethodId = pickOwnValue(raw, ["selectedShippingMethodId", "selected_shipping_method_id", "shippingMethodId", "shipping_method_id"]);
    var selectedShippingMethodName = pickOwnValue(raw, ["selectedShippingMethodName", "selected_shipping_method_name", "shippingMethodName", "shipping_method_name"]);
    var deliveryEstimate = pickOwnValue(raw, ["deliveryEstimate", "delivery_estimate"]);

    var out = {
      cartSig: String(raw.cartSig || ""),
      formSig: String(raw.formSig || ""),
      currency: String(currency || "USD").trim().toUpperCase() || "USD",
      shippingCents: parseInt(shippingCents, 10) || 0,
      taxCents: parseInt(taxCents, 10) || 0,
      taxProvider: normalizeSimpleText(taxProvider || "", 32).toLowerCase(),
      stripeTaxCalculationId: normalizeSimpleText(stripeTaxCalculationId || "", 120),
      discountCents: parseInt(discountCents, 10) || 0,
      discountCode: normalizeDiscountCode(discountCode || ""),
      totalCents: parseInt(totalCents, 10),
      shippingOptions: normalizeShippingOptions(shippingOptions),
      selectedShippingMethodId: normalizeShippingMethodId(selectedShippingMethodId || ""),
      selectedShippingMethodName: normalizeShippingMethodName(selectedShippingMethodName || ""),
      deliveryEstimate: normalizeDeliveryEstimate(deliveryEstimate)
    };

    if (!isFinite(out.totalCents)) out.totalCents = NaN;
    return out;
  }

  function normalizeCheckoutCartItem(raw, idx) {
    var it = raw && typeof raw === "object" ? raw : {};
    var qty = normalizeQty(it.qty || it.quantity);
    var priceCents = parseInt(it.priceCents, 10);
    if (!isFinite(priceCents) || priceCents < 0) priceCents = 0;

    var syncId = parseInt(it.printful_sync_variant_id || it.printfulSyncVariantId, 10);
    if (!isFinite(syncId) || syncId <= 0) syncId = null;

    var variantId = parseInt(it.printful_variant_id || it.printfulVariantId, 10);
    if (!isFinite(variantId) || variantId <= 0) variantId = null;

    return {
      key: String(it.key || ("stored-" + String(idx || 0))),
      artId: String(it.artId || it.art_id || ""),
      title: String(it.title || it.artId || it.art_id || ""),
      optionId: String(it.optionId || it.option_id || ""),
      optionLabel: String(it.optionLabel || it.option_label || ""),
      priceCents: priceCents,
      qty: qty,
      printful_sync_variant_id: syncId,
      printful_variant_id: variantId
    };
  }

  function loadCartFromStorageFallback() {
    var rawCandidates = [];
    try {
      rawCandidates.push(window.sessionStorage.getItem(CART_STORAGE_KEY) || "");
    } catch (_) {
      // ignore
    }
    try {
      rawCandidates.push(window.localStorage.getItem(CART_STORAGE_KEY) || "");
    } catch (_) {
      // ignore
    }

    for (var c = 0; c < rawCandidates.length; c++) {
      var rawText = String(rawCandidates[c] || "");
      if (!rawText) continue;

      var parsed = safeJsonParse(rawText);
      var list = parsed && Array.isArray(parsed.items) ? parsed.items : [];
      if (!list.length) continue;

      var items = [];
      for (var i = 0; i < list.length; i++) {
        var item = normalizeCheckoutCartItem(list[i], i);
        if (!item) continue;
        items.push(item);
      }
      if (items.length) return { items: items };
    }

    return { items: [] };
  }

  function getCart() {
    var cartFromApi = null;
    if (window.MELKAPOW_CART && typeof window.MELKAPOW_CART.load === "function") {
      try {
        cartFromApi = window.MELKAPOW_CART.load();
      } catch (_) {
        cartFromApi = null;
      }
    }

    var apiItems = cartFromApi && Array.isArray(cartFromApi.items) ? cartFromApi.items : [];
    if (apiItems.length) {
      return cartFromApi;
    }

    var fallbackCart = loadCartFromStorageFallback();
    if (fallbackCart.items.length) return fallbackCart;

    return { items: [] };
  }

  function getCartSubtotalCents(cart) {
    var total = 0;
    var items = cart && Array.isArray(cart.items) ? cart.items : [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      total += (parseInt(it.priceCents, 10) || 0) * normalizeQty(it.qty);
    }
    return total;
  }

  function buildCheckoutItems(cart) {
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

    return out;
  }

  function buildEstimateItems(cart) {
    var checkoutItems = buildCheckoutItems(cart);
    var out = [];
    for (var i = 0; i < checkoutItems.length; i++) {
      var it = checkoutItems[i] || {};
      out.push({
        printful_sync_variant_id: it.printful_sync_variant_id,
        printful_variant_id: it.printful_variant_id,
        quantity: it.quantity
      });
    }
    return out;
  }

  function cartSignature(cart) {
    var checkoutItems = buildCheckoutItems(cart);
    if (!checkoutItems.length) return "";

    var parts = [];
    for (var i = 0; i < checkoutItems.length; i++) {
      var it = checkoutItems[i] || {};
      var vid = parseInt(it.printful_sync_variant_id || it.printful_variant_id, 10);
      if (!isFinite(vid) || vid <= 0) continue;
      var qty = normalizeQty(it.quantity);
      parts.push(String(vid) + "x" + String(qty));
    }
    parts.sort();
    return parts.join("|");
  }

  function formSignature(formState) {
    var s = formState && typeof formState === "object" ? formState : {};
    return [
      normalizeSimpleText(s.address1, 200).toLowerCase(),
      normalizeSimpleText(s.address2, 200).toLowerCase(),
      normalizeSimpleText(s.city, 120).toLowerCase(),
      normalizeStateCode(s.state_code, s.country_code).toLowerCase(),
      normalizePostalCode(s.zip, s.country_code).toLowerCase(),
      normalizeCountryCode(s.country_code),
      normalizeDiscountCode(s.discount_code).toLowerCase()
    ].join("|");
  }

  function isValidEmail(value) {
    var raw = normalizeSimpleText(value, 254);
    if (!raw) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  }

  function loadShippingFormState() {
    var raw = safeJsonParse(storageGet(SHIPPING_FORM_KEY) || "");
    if (!raw || typeof raw !== "object") raw = {};

    var countryCode = normalizeCountryCode(raw.country_code || raw.countryCode || "US") || "US";
    var legacyName = splitFullName(raw.full_name || raw.fullName || "");
    var firstNameRaw = pickOwnValue(raw, ["first_name", "firstName"]);
    var lastNameRaw = pickOwnValue(raw, ["last_name", "lastName"]);
    if (firstNameRaw == null) firstNameRaw = legacyName.firstName;
    if (lastNameRaw == null) lastNameRaw = legacyName.lastName;
    var firstName = normalizeSimpleText(firstNameRaw, 120);
    var lastName = normalizeSimpleText(lastNameRaw, 120);
    return {
      first_name: firstName,
      last_name: lastName,
      full_name: joinFullName(firstName, lastName),
      email: normalizeSimpleText(raw.email || "", 254),
      address1: normalizeSimpleText(raw.address1 || "", 200),
      address2: normalizeSimpleText(raw.address2 || "", 200),
      city: normalizeSimpleText(raw.city || "", 120),
      state_code: normalizeStateCode(raw.state_code || raw.stateCode || "", countryCode),
      zip: normalizePostalCode(raw.zip || raw.postal_code || "", countryCode),
      country_code: countryCode,
      shipping_method_id: normalizeShippingMethodId(raw.shipping_method_id || raw.shippingMethodId || "")
    };
  }

  function saveShippingFormState(formState) {
    var s = formState && typeof formState === "object" ? formState : {};
    var countryCode = normalizeCountryCode(s.country_code || "US") || "US";
    var firstName = normalizeSimpleText(s.first_name || s.firstName || "", 120);
    var lastName = normalizeSimpleText(s.last_name || s.lastName || "", 120);
    storageSet(
      SHIPPING_FORM_KEY,
      JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        full_name: joinFullName(firstName, lastName),
        email: normalizeSimpleText(s.email, 254),
        address1: normalizeSimpleText(s.address1, 200),
        address2: normalizeSimpleText(s.address2, 200),
        city: normalizeSimpleText(s.city, 120),
        state_code: normalizeStateCode(s.state_code, countryCode),
        zip: normalizePostalCode(s.zip, countryCode),
        country_code: countryCode,
        shipping_method_id: normalizeShippingMethodId(s.shipping_method_id || "")
      })
    );
  }

  function loadShippingEstimateState() {
    var raw = safeJsonParse(storageGet(SHIPPING_ESTIMATE_KEY) || "");
    return normalizeEstimateState(raw);
  }

  function saveShippingEstimateState(estimateState) {
    var normalized = normalizeEstimateState(estimateState);
    if (!normalized) {
      storageRemove(SHIPPING_ESTIMATE_KEY);
      return;
    }

    storageSet(
      SHIPPING_ESTIMATE_KEY,
      JSON.stringify({
        cartSig: normalized.cartSig,
        formSig: normalized.formSig,
        currency: normalized.currency,
        shippingCents: normalized.shippingCents,
        taxCents: normalized.taxCents,
        taxProvider: normalized.taxProvider,
        stripeTaxCalculationId: normalized.stripeTaxCalculationId,
        discountCents: normalized.discountCents,
        discountCode: normalized.discountCode,
        totalCents: normalized.totalCents,
        shippingOptions: normalized.shippingOptions,
        selectedShippingMethodId: normalized.selectedShippingMethodId,
        selectedShippingMethodName: normalized.selectedShippingMethodName,
        deliveryEstimate: normalized.deliveryEstimate
      })
    );
  }

  function clearShippingStepState() {
    storageRemove(SHIPPING_FORM_KEY);
    storageRemove(SHIPPING_ESTIMATE_KEY);
  }

  function normalizeShippingSnapshot(raw) {
    if (!raw || typeof raw !== "object") raw = {};

    var countryCode = normalizeCountryCode(raw.country_code || raw.countryCode || "US") || "US";
    var legacyName = splitFullName(raw.full_name || raw.fullName || "");
    var firstNameRaw = pickOwnValue(raw, ["first_name", "firstName"]);
    var lastNameRaw = pickOwnValue(raw, ["last_name", "lastName"]);
    if (firstNameRaw == null) firstNameRaw = legacyName.firstName;
    if (lastNameRaw == null) lastNameRaw = legacyName.lastName;
    var firstName = normalizeSimpleText(firstNameRaw, 120);
    var lastName = normalizeSimpleText(lastNameRaw, 120);
    return {
      first_name: firstName,
      last_name: lastName,
      full_name: joinFullName(firstName, lastName),
      email: normalizeSimpleText(raw.email || "", 254),
      address1: normalizeSimpleText(raw.address1 || "", 200),
      address2: normalizeSimpleText(raw.address2 || "", 200),
      city: normalizeSimpleText(raw.city || "", 120),
      state_code: normalizeStateCode(raw.state_code || raw.stateCode || "", countryCode),
      zip: normalizePostalCode(raw.zip || raw.postal_code || raw.postalCode || "", countryCode),
      country_code: countryCode,
      shipping_method_id: normalizeShippingMethodId(raw.shipping_method_id || raw.shippingMethodId || "")
    };
  }

  function saveLastShippingSnapshot(sessionId) {
    var sid = normalizeSimpleText(sessionId || "", 200);
    if (!sid) return;

    var form = loadShippingFormState();
    if (!form || typeof form !== "object") return;
    if (!normalizeSimpleText(form.full_name, 120)) return;
    if (!normalizeSimpleText(form.address1, 200)) return;

    try {
      storageSet(
        LAST_SHIPPING_SNAPSHOT_KEY,
        JSON.stringify({
          sessionId: sid,
          ts: Date.now(),
          shipping: form
        })
      );
    } catch (_) {
      // ignore
    }
  }

  function loadLastShippingSnapshot(sessionId) {
    var sid = normalizeSimpleText(sessionId || "", 200);
    var raw = safeJsonParse(storageGet(LAST_SHIPPING_SNAPSHOT_KEY) || "");
    if (!raw || typeof raw !== "object") return null;

    var storedSid = normalizeSimpleText(raw.session_id || raw.sessionId || "", 200);
    if (sid && storedSid && storedSid !== sid) return null;

    var ship = raw.shipping && typeof raw.shipping === "object" ? raw.shipping : null;
    if (!ship) return null;
    return normalizeShippingSnapshot(ship);
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

    if (state === "success") {
      var sid = String(params.get("session_id") || "").trim();
      if (sid) storageSet(LAST_SESSION_KEY, sid);
      if (sid) saveLastShippingSnapshot(sid);
      clearShippingStepState();
      clearCheckoutAttemptState();
      saveCheckoutResultState({ status: "success", message: "Payment received." });
      if (window.MELKAPOW_CART && typeof window.MELKAPOW_CART.clear === "function") {
        window.MELKAPOW_CART.clear();
      }
    } else if (state === "cancel") {
      clearCheckoutAttemptState();
      saveCheckoutResultState({ status: "cancel", message: "Payment was canceled before completion." });
    } else if (state === "failed") {
      clearCheckoutAttemptState();
      var reason = normalizeSimpleText(params.get("reason") || "", 180);
      saveCheckoutResultState({
        status: "failed",
        message: reason || "Payment failed. Please try again."
      });
    }

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

    var sym = cur === "USD" ? "$" : (cur === "EUR" ? "EUR " : (cur === "GBP" ? "GBP " : (cur + " ")));
    var amount = (c / 100).toFixed(2);
    return sym + amount;
  }

  function formatPaymentLabel(payment) {
    var p = payment && typeof payment === "object" ? payment : {};
    var pmType = String(p.type || "").trim().toLowerCase();
    var brand = String(p.brand || "").trim();
    var last4 = String(p.last4 || "").trim();

    if (last4) {
      var b = brand ? brand.replace(/_/g, " ").trim().toUpperCase() : "CARD";
      return b + " ****" + last4;
    }

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

  function wireShippingStep() {
    var form = document.getElementById("checkoutShippingForm");
    var continueBtn = document.getElementById("checkoutShippingContinueBtn");
    var calculateBtn = document.getElementById("checkoutShippingCalculateBtn");
    if (!form || !continueBtn || !calculateBtn) return;

    if (form.__melkapowBound) return;
    form.__melkapowBound = true;

    var firstNameEl = document.getElementById("checkoutShippingFirstName");
    var lastNameEl = document.getElementById("checkoutShippingLastName");
    var emailEl = document.getElementById("checkoutShippingEmail");
    var address1El = document.getElementById("checkoutShippingAddress1");
    var address2El = document.getElementById("checkoutShippingAddress2");
    var cityEl = document.getElementById("checkoutShippingCity");
    var stateEl = document.getElementById("checkoutShippingState");
    var postalEl = document.getElementById("checkoutShippingPostal");
    var countryEl = document.getElementById("checkoutShippingCountry");

    var shippingMethodBoxEl = document.getElementById("checkoutShippingMethodBox");
    var shippingMethodStaticEl = document.getElementById("checkoutShippingMethodStatic");
    var shippingMethodOptionsEl = document.getElementById("checkoutShippingMethodOptions");
    var shippingMethodHintEl = document.getElementById("checkoutShippingMethodHint");

    var statusEl = document.getElementById("checkoutShippingStatus");
    var itemsSubtotalEl = document.getElementById("checkoutShippingItemsSubtotal");
    var shippingSummaryEl = document.getElementById("checkoutShippingSummaryShipping");
    var taxSummaryEl = document.getElementById("checkoutShippingSummaryTax");
    var discountRowEl = document.getElementById("checkoutShippingSummaryDiscountRow");
    var discountLabelEl = document.getElementById("checkoutShippingSummaryDiscountLabel");
    var discountEl = document.getElementById("checkoutShippingSummaryDiscount");
    var totalSummaryEl = document.getElementById("checkoutShippingSummaryTotal");

    if (
      !firstNameEl || !lastNameEl || !emailEl || !address1El || !address2El || !cityEl || !stateEl || !postalEl || !countryEl ||
      !shippingMethodBoxEl || !shippingMethodStaticEl || !shippingMethodOptionsEl || !shippingMethodHintEl ||
      !statusEl || !itemsSubtotalEl || !shippingSummaryEl || !taxSummaryEl || !totalSummaryEl
    ) {
      return;
    }

    function readCountryOptionsFromSelect() {
      var out = [];
      var options = countryEl.options || [];
      for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        if (!opt) continue;
        out.push({
          code: normalizeCountryCode(opt.value || ""),
          name: normalizeCountryName(opt.textContent || opt.label || "")
        });
      }
      return normalizeCountryList(out);
    }

    function buildCountryLookup(options) {
      var out = {};
      var list = Array.isArray(options) ? options : [];
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        if (!row || typeof row !== "object") continue;
        var code = normalizeCountryCode(row.code || "");
        if (!code) continue;
        out[code] = true;
      }
      return out;
    }

    function loadStoredCheckoutCountries() {
      var raw = safeJsonParse(storageGet(CHECKOUT_COUNTRIES_KEY) || "");
      if (!raw || typeof raw !== "object") return [];
      return normalizeCountryList(raw.options || raw.countries || []);
    }

    function saveStoredCheckoutCountries(options) {
      var rows = normalizeCountryList(options);
      if (!rows.length) return;
      storageSet(
        CHECKOUT_COUNTRIES_KEY,
        JSON.stringify({
          ts: Date.now(),
          options: rows
        })
      );
    }

    var fallbackCountryOptions = readCountryOptionsFromSelect();
    if (!fallbackCountryOptions.length) {
      fallbackCountryOptions = [{ code: "US", name: "United States" }];
    }

    var activeCountryOptions = loadStoredCheckoutCountries();
    if (!activeCountryOptions.length) {
      activeCountryOptions = fallbackCountryOptions.slice();
    }
    var allowedCountryLookup = {};

    function applyCountryOptions(options, preferredCode) {
      var next = normalizeCountryList(options);
      if (!next.length) next = fallbackCountryOptions.slice();
      if (!next.length) next = [{ code: "US", name: "United States" }];

      activeCountryOptions = next;
      allowedCountryLookup = buildCountryLookup(activeCountryOptions);

      var targetCode = normalizeCountryCode(preferredCode || countryEl.value || "US") || "US";
      if (!allowedCountryLookup[targetCode]) {
        targetCode = activeCountryOptions[0].code;
      }

      countryEl.innerHTML = "";
      for (var i = 0; i < activeCountryOptions.length; i++) {
        var row = activeCountryOptions[i];
        var opt = document.createElement("option");
        opt.value = row.code;
        opt.textContent = row.name || row.code;
        countryEl.appendChild(opt);
      }

      countryEl.value = targetCode;
      if (countryEl.value !== targetCode && countryEl.options.length) {
        countryEl.value = countryEl.options[0].value;
      }

      return normalizeCountryCode(countryEl.value || targetCode) || "US";
    }

    applyCountryOptions(activeCountryOptions, countryEl.value || "US");

    var estimateInFlight = false;
    var estimateReqSeq = 0;
    var activeEstimateReqId = 0;
    var estimateAbortController = null;
    var estimateTimeoutId = null;
    var checkoutInFlight = false;
    var checkoutReqSeq = 0;
    var activeCheckoutReqId = 0;
    var checkoutAbortController = null;
    var checkoutTimeoutId = null;
    var continueBtnDefaultText = String(continueBtn.textContent || "");
    var countryFetchPromise = null;
    var countriesLoadedFromApi = false;
    var shippingStepMountedAt = Date.now();

    var estimateState = loadShippingEstimateState();
    var preferredShippingMethodId = "";
    var preferredShippingMethodName = "";

    function setStatus(message, state) {
      var text = String(message || "");
      statusEl.textContent = text;
      statusEl.hidden = !text;
      if (state) {
        statusEl.setAttribute("data-state", state);
      } else {
        statusEl.removeAttribute("data-state");
      }
    }

    function loadCheckoutCountries(force) {
      var shouldForce = !!force;
      if (!isShopEnabled()) return Promise.resolve(false);
      if (countriesLoadedFromApi && !shouldForce) return Promise.resolve(true);
      if (countryFetchPromise && !shouldForce) return countryFetchPromise;

      var apiBase = getApiBase();
      if (!apiBase || typeof fetch !== "function") return Promise.resolve(false);

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = null;
      if (controller) {
        timeoutId = setTimeout(function () {
          try { controller.abort(); } catch (_) { /* ignore */ }
        }, 12000);
      }

      var endpoint = apiBase + "/api/shop/checkout/countries";
      if (shouldForce) endpoint += "?refresh=1";

      countryFetchPromise = fetch(endpoint, {
        method: "GET",
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) {
              if (!res.ok) {
                var msg = (data && data.detail) ? String(data.detail) : "Country list unavailable.";
                throw new Error(msg);
              }
              return data;
            });
        })
        .then(function (data) {
          if (!data || !data.ok) throw new Error("Country list unavailable.");

          var options = normalizeCountryList(data.countries || data.options);
          if (!options.length) throw new Error("Country list unavailable.");

          var previousCountry = normalizeCountryCode(countryEl.value || "US") || "US";
          var nextCountry = applyCountryOptions(options, previousCountry);
          saveStoredCheckoutCountries(options);
          countriesLoadedFromApi = true;

          var warning = normalizeSimpleText(data.warning || "", 240);
          if (warning && window.console && typeof window.console.warn === "function") {
            window.console.warn("Checkout countries warning:", warning);
          }

          if (nextCountry !== previousCountry) {
            var formState = readFormState();
            saveShippingFormState(formState);
            if (estimateState && !estimateMatches(getCart(), formState, estimateState)) {
              estimateState = null;
              saveShippingEstimateState(null);
              clearShippingOptions();
              renderSummary(getCart(), null);
            }
            setContinueEnabled();
          } else {
            setContinueEnabled();
          }

          return true;
        })
        .catch(function (err) {
          if (err && err.name === "AbortError") return false;
          countriesLoadedFromApi = false;
          if (window.console && typeof window.console.warn === "function") {
            window.console.warn("Checkout country list fetch failed.", err);
          }
          return false;
        })
        .finally(function () {
          if (timeoutId) clearTimeout(timeoutId);
          countryFetchPromise = null;
        });

      return countryFetchPromise;
    }

    function setDiscountCents(cents, currency, discountCode) {
      if (!discountRowEl || !discountEl) return;
      var code = normalizeDiscountCode(discountCode || "");
      var n = parseInt(cents, 10);
      if (!isFinite(n) || !n) {
        discountRowEl.hidden = true;
        discountEl.textContent = "--";
        if (discountLabelEl) discountLabelEl.textContent = "Discount";
        return;
      }
      discountRowEl.hidden = false;
      discountEl.textContent = "-" + formatMoney(Math.abs(n), currency);
      if (discountLabelEl) {
        discountLabelEl.textContent = code ? ("Discount (" + code + ")") : "Discount";
      }
    }

    function readFormState() {
      var countryCode = normalizeCountryCode(countryEl.value || "US") || "US";
      var firstName = normalizeSimpleText(firstNameEl.value, 120);
      var lastName = normalizeSimpleText(lastNameEl.value, 120);
      return {
        first_name: firstName,
        last_name: lastName,
        full_name: joinFullName(firstName, lastName),
        email: normalizeSimpleText(emailEl.value, 254),
        address1: normalizeSimpleText(address1El.value, 200),
        address2: normalizeSimpleText(address2El.value, 200),
        city: normalizeSimpleText(cityEl.value, 120),
        state_code: normalizeStateCode(stateEl.value, countryCode),
        zip: normalizePostalCode(postalEl.value, countryCode),
        country_code: countryCode,
        discount_code: loadDiscountCode(),
        shipping_method_id: normalizeShippingMethodId(preferredShippingMethodId || "")
      };
    }

    function writeFormState(next) {
      var state = next && typeof next === "object" ? next : {};
      var countryCode = normalizeCountryCode(state.country_code || countryEl.value || "US") || "US";
      if (!allowedCountryLookup[countryCode]) {
        countryCode = activeCountryOptions.length ? activeCountryOptions[0].code : "US";
      }

      var normalizedFirst = normalizeSimpleText(state.first_name || state.firstName || "", 120);
      var normalizedLast = normalizeSimpleText(state.last_name || state.lastName || "", 120);
      if (!normalizedFirst && !normalizedLast) {
        var split = splitFullName(state.full_name || "");
        normalizedFirst = normalizeSimpleText(split.firstName, 120);
        normalizedLast = normalizeSimpleText(split.lastName, 120);
      }
      firstNameEl.value = normalizedFirst;
      lastNameEl.value = normalizedLast;
      emailEl.value = normalizeSimpleText(state.email, 254);
      address1El.value = normalizeSimpleText(state.address1, 200);
      address2El.value = normalizeSimpleText(state.address2, 200);
      cityEl.value = normalizeSimpleText(state.city, 120);
      countryEl.value = countryCode;
      if (countryEl.value !== countryCode && countryEl.options.length) {
        countryEl.value = countryEl.options[0].value;
      }

      var effectiveCountryCode = normalizeCountryCode(countryEl.value || countryCode) || "US";
      stateEl.value = normalizeStateCode(state.state_code, effectiveCountryCode);
      postalEl.value = normalizePostalCode(state.zip, effectiveCountryCode);

      preferredShippingMethodId = normalizeShippingMethodId(state.shipping_method_id || preferredShippingMethodId);
    }

    function validateFormState(formState) {
      var s = formState && typeof formState === "object" ? formState : {};
      var countryCode = normalizeCountryCode(s.country_code || "US") || "US";
      var zip = normalizePostalCode(s.zip, countryCode);
      var stateCode = normalizeStateCode(s.state_code, countryCode);

      if (!normalizeSimpleText(s.first_name, 120)) return "Enter your first name.";
      if (!normalizeSimpleText(s.last_name, 120)) return "Enter your last name.";
      if (!normalizeSimpleText(s.address1, 200)) return "Enter your shipping address.";
      if (!normalizeSimpleText(s.city, 120)) return "Enter your city.";
      if (!countryCode) return "Select your country.";
      if (!allowedCountryLookup[countryCode]) return "Select a supported shipping country.";
      if (!zip) return "Enter your ZIP/postal code.";

      if (countryCode === "US") {
        if (stateCode.length < 2) return "Enter your 2-letter state code (e.g., CA).";
        if (!US_STATE_CODE_SET[stateCode]) return "Enter a valid 2-letter state code (e.g., CA).";
        var zipDigits = zip.replace(/\D/g, "");
        if (zipDigits.length < 5) return "Enter a valid ZIP code.";
      } else if (zip.length < 3) {
        return "Enter a valid postal code.";
      }

      var email = normalizeSimpleText(s.email, 254);
      if (!email) return "Enter your email address.";
      if (!isValidEmail(email)) return "Enter a valid email address.";

      return "";
    }

    function clearShippingOptions() {
      shippingMethodBoxEl.hidden = false;
      shippingMethodStaticEl.hidden = false;
      shippingMethodStaticEl.textContent = "--";
      shippingMethodOptionsEl.hidden = true;
      shippingMethodOptionsEl.innerHTML = "";
      shippingMethodHintEl.hidden = true;
      shippingMethodHintEl.textContent = "";
    }

    function renderSummary(cart, estimate) {
      var c = cart && typeof cart === "object" ? cart : getCart();
      var subtotalCents = getCartSubtotalCents(c);
      var est = estimate && typeof estimate === "object" ? estimate : null;
      var currency = est ? String(est.currency || "USD").trim().toUpperCase() || "USD" : "USD";
      var storedDiscountCode = loadDiscountCode();
      var preview = loadDiscountPreviewState();

      if (!est) {
        if (
          preview &&
          preview.code &&
          storedDiscountCode &&
          preview.code === storedDiscountCode &&
          parseInt(preview.subtotalCents, 10) === subtotalCents
        ) {
          currency = String(preview.currency || currency || "USD").trim().toUpperCase() || "USD";
        }
      }

      itemsSubtotalEl.textContent = formatMoney(subtotalCents, currency);

      var shippingCents = est ? parseInt(est.shippingCents, 10) : NaN;
      var taxCents = est ? parseInt(est.taxCents, 10) : NaN;
      var resolvedDiscount = resolveDiscountForSubtotal(
        subtotalCents,
        est ? normalizeDiscountCode(est.discountCode || "") : storedDiscountCode,
        est ? parseInt(est.discountCents, 10) : 0
      );
      var discountCents = resolvedDiscount.cents;
      var discountCode = resolvedDiscount.code;
      var totalCents = est ? parseInt(est.totalCents, 10) : NaN;
      var computedTotal = subtotalCents;
      if (isFinite(shippingCents)) computedTotal += shippingCents;
      if (isFinite(taxCents)) computedTotal += taxCents;
      computedTotal -= discountCents;
      if (!isFinite(computedTotal) || computedTotal < 0) computedTotal = 0;

      if (est && isFinite(shippingCents)) {
        shippingSummaryEl.textContent = formatMoney(shippingCents, currency);
      } else {
        shippingSummaryEl.textContent = "--";
      }

      if (est && isFinite(taxCents)) {
        taxSummaryEl.textContent = formatMoney(taxCents, currency);
      } else {
        taxSummaryEl.textContent = "--";
      }

      setDiscountCents(discountCents, currency, discountCode);

      if (!isFinite(totalCents)) {
        totalCents = computedTotal;
      } else if (totalCents > computedTotal) {
        // Keep checkout summary stable: subtotal (+shipping/tax) - discount.
        totalCents = computedTotal;
      }

      totalSummaryEl.textContent = formatMoney(totalCents, currency);
    }

    function renderShippingOptions(estimate) {
      clearShippingOptions();

      var est = estimate && typeof estimate === "object" ? estimate : null;
      if (!est) return;

      var options = normalizeShippingOptions(est.shippingOptions);
      var selected = selectShippingOption(
        options,
        est.selectedShippingMethodId || preferredShippingMethodId,
        est.deliveryEstimate
      );

      var selectedMethodId = normalizeShippingMethodId(
        est.selectedShippingMethodId || (selected && selected.shippingMethodId) || preferredShippingMethodId
      );
      var selectedMethodName = normalizeShippingMethodName(
        est.selectedShippingMethodName || (selected && selected.shippingMethodName) || preferredShippingMethodName
      );
      if (!selectedMethodName && selectedMethodId) {
        selectedMethodName = prettyShippingMethodName(selectedMethodId, "");
      }

      if (selectedMethodId) preferredShippingMethodId = selectedMethodId;
      if (selectedMethodName) preferredShippingMethodName = selectedMethodName;

      if (!options.length) {
        if (selectedMethodId || selectedMethodName) {
          shippingMethodStaticEl.hidden = false;
          shippingMethodStaticEl.textContent = prettyShippingMethodName(selectedMethodId, selectedMethodName) + " (selected)";
          var fallbackWindow = deliveryWindowText(est.deliveryEstimate) ||
            fallbackDeliveryWindowForMethod(selectedMethodId, selectedMethodName);
          if (fallbackWindow) {
            shippingMethodHintEl.hidden = false;
            shippingMethodHintEl.textContent = "Estimated delivery: " + fallbackWindow;
          }
          shippingMethodBoxEl.hidden = false;
        }
        return;
      }

      shippingMethodStaticEl.hidden = true;
      shippingMethodStaticEl.textContent = "";

      var selectedToken = shippingMethodToken(selectedMethodId || (selected && selected.shippingMethodId));
      if (selectedToken && options.length) {
        var hasSelectedMatch = false;
        for (var s = 0; s < options.length; s++) {
          var existing = options[s];
          var existingId = normalizeShippingMethodId(existing && existing.shippingMethodId);
          var existingName = normalizeShippingMethodName(existing && existing.shippingMethodName);
          var existingToken = shippingMethodToken(existingId || existingName);
          if (existingToken && existingToken === selectedToken) {
            hasSelectedMatch = true;
            break;
          }
        }
        if (!hasSelectedMatch) {
          selectedToken = "";
          selectedMethodId = "";
          selectedMethodName = "";
        }
      }
      if (!selectedToken && options.length) {
        var defaultOption = options[0];
        selectedMethodId = normalizeShippingMethodId(defaultOption.shippingMethodId || "");
        selectedMethodName = normalizeShippingMethodName(defaultOption.shippingMethodName || "");
        selectedToken = shippingMethodToken(selectedMethodId || selectedMethodName);
        if (selectedMethodId) preferredShippingMethodId = selectedMethodId;
        if (selectedMethodName) preferredShippingMethodName = selectedMethodName;
      }

      var optionUsedForHint = selected && typeof selected === "object" ? selected : null;
      for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        var optId = normalizeShippingMethodId(opt.shippingMethodId);
        if (!optId) continue;

        var optName = normalizeShippingMethodName(opt.shippingMethodName);
        var optToken = shippingMethodToken(optId || optName);
        var isSelected = !!(selectedToken && optToken && selectedToken === optToken);
        if (!selectedToken && i === 0) isSelected = true;
        if (isSelected && !optionUsedForHint) optionUsedForHint = opt;

        var label = document.createElement("label");
        label.className = "estimate-shipping-option" + (isSelected ? " is-selected" : "");

        var left = document.createElement("span");
        left.className = "estimate-shipping-option-main";

        var radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "checkoutShippingMethodOption";
        radio.value = optId;
        radio.checked = isSelected;
        radio.addEventListener("change", function () {
          if (!this.checked) return;
          var nextId = normalizeShippingMethodId(this.value);
          if (!nextId || nextId === normalizeShippingMethodId(preferredShippingMethodId)) return;
          preferredShippingMethodId = nextId;
          preferredShippingMethodName = "";
          runEstimate({ force: true, showValidationErrors: false, normalizeInputs: true });
        });
        left.appendChild(radio);

        var copy = document.createElement("span");
        copy.className = "estimate-shipping-option-copy";

        var copyLabel = document.createElement("span");
        copyLabel.className = "estimate-shipping-option-label";
        copyLabel.textContent = prettyShippingMethodName(optId, optName);
        copy.appendChild(copyLabel);

        var metaText = deliveryWindowText(opt.deliveryEstimate) ||
          fallbackDeliveryWindowForMethod(optId, optName);
        if (metaText) {
          var meta = document.createElement("span");
          meta.className = "estimate-shipping-option-meta";
          meta.textContent = "Est. delivery: " + metaText;
          copy.appendChild(meta);
        }

        left.appendChild(copy);

        var amount = document.createElement("span");
        amount.className = "estimate-shipping-option-amount";
        amount.textContent = (opt.shippingCents == null) ? "--" : formatMoney(opt.shippingCents, est.currency);

        label.appendChild(left);
        label.appendChild(amount);
        shippingMethodOptionsEl.appendChild(label);
      }

      shippingMethodOptionsEl.hidden = !shippingMethodOptionsEl.children.length;
      if (!shippingMethodOptionsEl.hidden) {
        shippingMethodBoxEl.hidden = false;
        shippingMethodHintEl.hidden = true;
        shippingMethodHintEl.textContent = "";

        shippingMethodBoxEl.hidden = false;
      } else {
        shippingMethodStaticEl.hidden = false;
        shippingMethodStaticEl.textContent = "--";
        shippingMethodHintEl.hidden = true;
        shippingMethodHintEl.textContent = "";
        shippingMethodBoxEl.hidden = false;
      }
    }

    function estimateMatches(cart, formState, est) {
      if (!est || typeof est !== "object") return false;
      var cartSig = cartSignature(cart);
      var stateSig = formSignature(formState);
      if (!cartSig || !stateSig) return false;
      if (String(est.cartSig || "") !== cartSig) return false;
      if (String(est.formSig || "") !== stateSig) return false;
      return true;
    }

    function setContinueEnabled() {
      var cart = getCart();
      var hasItems = !!(cart && Array.isArray(cart.items) && cart.items.length);
      var formState = readFormState();
      var validForm = !validateFormState(formState);

      var hasFreshEstimate = estimateMatches(cart, formState, estimateState);
      var needsMethod = hasFreshEstimate && estimateState && Array.isArray(estimateState.shippingOptions) && estimateState.shippingOptions.length > 1;

      var selectedMethodId = normalizeShippingMethodId(
        preferredShippingMethodId || (estimateState && estimateState.selectedShippingMethodId) || ""
      );
      var methodReady = !needsMethod || !!selectedMethodId;

      var enabled = hasItems && validForm && isShopEnabled() && !estimateInFlight && !checkoutInFlight;
      if (hasFreshEstimate && !methodReady) enabled = false;
      continueBtn.disabled = !enabled;
      continueBtn.setAttribute("aria-disabled", enabled ? "false" : "true");

      var calcEnabled = hasItems && isShopEnabled() && !estimateInFlight && !checkoutInFlight;
      calculateBtn.disabled = !calcEnabled;
      calculateBtn.setAttribute("aria-disabled", calcEnabled ? "false" : "true");
    }

    function cancelActiveCheckout() {
      if (!checkoutInFlight && !activeCheckoutReqId && !checkoutAbortController) return;

      activeCheckoutReqId = 0;
      checkoutInFlight = false;

      if (checkoutTimeoutId) {
        clearTimeout(checkoutTimeoutId);
        checkoutTimeoutId = null;
      }

      if (checkoutAbortController && typeof checkoutAbortController.abort === "function") {
        try {
          checkoutAbortController.abort();
        } catch (_) {
          // ignore
        }
      }
      checkoutAbortController = null;

      // If the user navigates away mid-request, don't keep showing "stale attempt" errors later.
      clearCheckoutAttemptState();

      continueBtn.textContent = continueBtnDefaultText;
      setContinueEnabled();
    }

    function normalizeEstimateResponse(data, cart, formState) {
      var currencyRaw = pickOwnValue(data, ["currency"]);
      var shippingOptionsRaw = pickOwnValue(data, ["shippingOptions", "shipping_options"]);
      var selectedShippingMethodIdRaw = pickOwnValue(data, ["selectedShippingMethodId", "selected_shipping_method_id", "shippingMethodId", "shipping_method_id"]);
      var selectedShippingMethodNameRaw = pickOwnValue(data, ["selectedShippingMethodName", "selected_shipping_method_name", "shippingMethodName", "shipping_method_name"]);
      var shippingCentsRaw = pickOwnValue(data, ["shippingCents", "shipping_cents"]);
      var taxCentsRaw = pickOwnValue(data, ["taxCents", "tax_cents"]);
      var taxProviderRaw = pickOwnValue(data, ["taxProvider", "tax_provider"]);
      var stripeTaxCalculationIdRaw = pickOwnValue(data, ["stripeTaxCalculationId", "stripe_tax_calculation_id"]);
      var discountCentsRaw = pickOwnValue(data, ["discountCents", "discount_cents"]);
      var discountCodeRaw = pickOwnValue(data, ["discountCode", "discount_code"]);
      var totalCentsRaw = pickOwnValue(data, ["totalCents", "total_cents", "total"]);
      var deliveryEstimateRaw = pickOwnValue(data, ["deliveryEstimate", "delivery_estimate"]);

      var currency = String(currencyRaw || "USD").trim().toUpperCase() || "USD";
      var shippingOptions = normalizeShippingOptions(shippingOptionsRaw);
      var selectedShippingMethodId = normalizeShippingMethodId(selectedShippingMethodIdRaw || preferredShippingMethodId);
      var selectedShippingMethodName = normalizeShippingMethodName(selectedShippingMethodNameRaw || preferredShippingMethodName);
      var subtotalCents = getCartSubtotalCents(cart);

      var selectedOption = selectShippingOption(
        shippingOptions,
        selectedShippingMethodId || preferredShippingMethodId,
        deliveryEstimateRaw
      );

      var shippingCents = parseInt(shippingCentsRaw, 10);
      if (!isFinite(shippingCents)) shippingCents = 0;

      if (selectedOption) {
        if (!selectedShippingMethodId) {
          selectedShippingMethodId = normalizeShippingMethodId(selectedOption.shippingMethodId);
        }
        if (!selectedShippingMethodName) {
          selectedShippingMethodName = normalizeShippingMethodName(selectedOption.shippingMethodName);
        }
        if (selectedOption.shippingCents != null) {
          shippingCents = parseInt(selectedOption.shippingCents, 10);
        }
      }

      if (!selectedShippingMethodName && selectedShippingMethodId) {
        selectedShippingMethodName = prettyShippingMethodName(selectedShippingMethodId, "");
      }

      var taxCents = parseInt(taxCentsRaw, 10);
      if (!isFinite(taxCents)) taxCents = 0;
      var taxProvider = normalizeSimpleText(taxProviderRaw || "", 32).toLowerCase();
      var stripeTaxCalculationId = normalizeSimpleText(stripeTaxCalculationIdRaw || "", 120);

      var resolvedDiscount = resolveDiscountForSubtotal(
        subtotalCents,
        discountCodeRaw || formState.discount_code || loadDiscountCode() || "",
        discountCentsRaw
      );
      var discountCents = resolvedDiscount.cents;
      var discountCode = resolvedDiscount.code;

      var totalCents = parseInt(totalCentsRaw, 10);
      var computedTotalCents = subtotalCents + shippingCents + taxCents - discountCents;
      if (!isFinite(computedTotalCents) || computedTotalCents < 0) computedTotalCents = 0;
      if (!isFinite(totalCents)) {
        totalCents = computedTotalCents;
      } else if (totalCents > computedTotalCents) {
        // Keep checkout summary stable: subtotal (+shipping/tax) - discount.
        totalCents = computedTotalCents;
      }

      var deliveryEstimate = normalizeDeliveryEstimate(
        deliveryEstimateRaw || (selectedOption && selectedOption.deliveryEstimate)
      );

      return normalizeEstimateState({
        cartSig: cartSignature(cart),
        formSig: formSignature(formState),
        currency: currency,
        shippingCents: shippingCents,
        taxCents: taxCents,
        taxProvider: taxProvider,
        stripeTaxCalculationId: stripeTaxCalculationId,
        discountCents: discountCents,
        discountCode: discountCode,
        totalCents: totalCents,
        shippingOptions: shippingOptions,
        selectedShippingMethodId: selectedShippingMethodId,
        selectedShippingMethodName: selectedShippingMethodName,
        deliveryEstimate: deliveryEstimate
      });
    }

    function buildEstimateRequest(cart, formState) {
      var items = buildEstimateItems(cart);
      var req = {
        country_code: formState.country_code || "US",
        zip: formState.zip,
        address1: formState.address1,
        city: formState.city,
        items: items
      };

      if (formState.address2) req.address2 = formState.address2;
      if (formState.state_code) req.state_code = formState.state_code;
      var discountCode = normalizeDiscountCode(formState.discount_code || loadDiscountCode());
      if (discountCode) req.discount_code = discountCode;

      var shippingMethodId = normalizeShippingMethodId(preferredShippingMethodId || formState.shipping_method_id || "");
      if (shippingMethodId) req.shipping_method_id = shippingMethodId;

      return req;
    }

    function buildCheckoutRequest(cart, formState, currentEstimate) {
      var items = buildCheckoutItems(cart);
      var req = {
        items: items,
        full_name: formState.full_name,
        email: formState.email,
        address1: formState.address1,
        city: formState.city,
        zip: formState.zip,
        country_code: formState.country_code || "US"
      };

      if (formState.address2) req.address2 = formState.address2;
      if (formState.state_code) req.state_code = formState.state_code;
      var discountCode = normalizeDiscountCode(formState.discount_code || loadDiscountCode());
      if (discountCode) req.discount_code = discountCode;

      var methodId = normalizeShippingMethodId(
        preferredShippingMethodId ||
        (currentEstimate && currentEstimate.selectedShippingMethodId) ||
        ""
      );
      var methodName = normalizeShippingMethodName(
        preferredShippingMethodName ||
        (currentEstimate && currentEstimate.selectedShippingMethodName) ||
        ""
      );
      if (methodId) req.shipping_method_id = methodId;
      if (methodName) req.shipping_method_name = methodName;

      return req;
    }

    function runEstimate(opts) {
      var options = opts && typeof opts === "object" ? opts : {};
      var force = !!options.force;
      var showValidationErrors = !!options.showValidationErrors;
      var normalizeInputs = !!options.normalizeInputs;

      var cart = getCart();
      var rawCartItems = cart && Array.isArray(cart.items) ? cart.items : [];
      var items = buildEstimateItems(cart);
      if (!items.length) {
        estimateState = null;
        saveShippingEstimateState(null);
        clearShippingOptions();
        renderSummary(cart, null);
        if (showValidationErrors) {
          if (rawCartItems.length) {
            setStatus("Some cart items need to be re-added before checkout.", "error");
          } else {
            setStatus("Your cart is empty.", "error");
          }
        }
        setContinueEnabled();
        return Promise.resolve(null);
      }

      if (!isShopEnabled()) {
        estimateState = null;
        saveShippingEstimateState(null);
        clearShippingOptions();
        renderSummary(cart, null);
        if (showValidationErrors) setStatus("Shop server is not available right now.", "error");
        setContinueEnabled();
        return Promise.resolve(null);
      }

      var formState = readFormState();
      if (normalizeInputs) writeFormState(formState);
      saveShippingFormState(formState);

      var validationError = validateFormState(formState);
      if (validationError) {
        if (showValidationErrors) setStatus(validationError, "error");
        estimateState = null;
        saveShippingEstimateState(null);
        clearShippingOptions();
        renderSummary(cart, null);
        setContinueEnabled();
        return Promise.resolve(null);
      }

      if (!force && estimateMatches(cart, formState, estimateState)) {
        renderSummary(cart, estimateState);
        renderShippingOptions(estimateState);
        setStatus("", "");
        setContinueEnabled();
        return Promise.resolve(estimateState);
      }

      var reqId = ++estimateReqSeq;
      activeEstimateReqId = reqId;
      estimateInFlight = true;

      if (estimateAbortController && typeof estimateAbortController.abort === "function") {
        try {
          estimateAbortController.abort();
        } catch (_) {
          // ignore
        }
      }
      estimateAbortController = typeof AbortController === "function" ? new AbortController() : null;
      var estimateTimedOut = false;
      if (estimateTimeoutId) {
        clearTimeout(estimateTimeoutId);
        estimateTimeoutId = null;
      }
      if (estimateAbortController) {
        estimateTimeoutId = setTimeout(function () {
          estimateTimedOut = true;
          try { estimateAbortController.abort(); } catch (_) { /* ignore */ }
        }, 18000);
      }

      var req = buildEstimateRequest(cart, formState);
      var apiBase = getApiBase();

      setStatus("Calculating shipping...", "");
      calculateBtn.disabled = true;
      calculateBtn.setAttribute("aria-disabled", "true");
      continueBtn.disabled = true;
      continueBtn.setAttribute("aria-disabled", "true");

      var fetchOpts = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req)
      };
      if (estimateAbortController) fetchOpts.signal = estimateAbortController.signal;

      return fetch(apiBase + "/api/shop/estimate", fetchOpts)
        .then(function (res) {
          if (!res) return null;
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
          if (reqId !== activeEstimateReqId) return null;
          if (!data || !data.ok) throw new Error("Estimate failed.");

          var currentCart = getCart();
          var currentFormState = readFormState();
          if (!estimateMatches(currentCart, currentFormState, {
            cartSig: cartSignature(cart),
            formSig: formSignature(formState)
          })) {
            return null;
          }

          var normalized = normalizeEstimateResponse(data, currentCart, currentFormState);
          estimateState = normalized;

          preferredShippingMethodId = normalizeShippingMethodId(
            normalized && normalized.selectedShippingMethodId
          );
          preferredShippingMethodName = normalizeShippingMethodName(
            normalized && normalized.selectedShippingMethodName
          );

          var toStore = readFormState();
          toStore.shipping_method_id = preferredShippingMethodId;
          saveShippingFormState(toStore);
          saveShippingEstimateState(normalized);

          renderSummary(currentCart, normalized);
          renderShippingOptions(normalized);
          setStatus("", "");
          return normalized;
        })
        .catch(function (err) {
          if (reqId !== activeEstimateReqId) return null;
          if (err && err.name === "AbortError") {
            if (!estimateTimedOut) return null;
            err = new Error("Shipping calculation timed out. Please try again.");
          }

          var msg = err && err.message ? String(err.message) : "Estimate failed.";
          if (/failed to fetch|networkerror|load failed|err_connection/i.test(msg)) {
            msg = "Unable to reach the shop server right now. Please try again in a moment.";
          }

          estimateState = null;
          saveShippingEstimateState(null);
          clearShippingOptions();
          renderSummary(getCart(), null);
          setStatus(msg, "error");
          return null;
        })
        .finally(function () {
          if (reqId !== activeEstimateReqId) return;
          if (estimateTimeoutId) {
            clearTimeout(estimateTimeoutId);
            estimateTimeoutId = null;
          }
          estimateInFlight = false;
          activeEstimateReqId = 0;
          estimateAbortController = null;
          setContinueEnabled();
        });
    }

    function startCheckout(currentEstimate) {
      var cart = getCart();
      var rawCartItems = cart && Array.isArray(cart.items) ? cart.items : [];
      var items = buildCheckoutItems(cart);
      if (!items.length) {
        if (rawCartItems.length) {
          setStatus("Some cart items need to be re-added before checkout.", "error");
        } else {
          setStatus("Your cart is empty.", "error");
        }
        setContinueEnabled();
        return Promise.resolve();
      }

      if (!isShopEnabled()) {
        setStatus("Shop server is not available right now.", "error");
        setContinueEnabled();
        return Promise.resolve();
      }

      var formState = readFormState();
      writeFormState(formState);
      saveShippingFormState(formState);

      var validationError = validateFormState(formState);
      if (validationError) {
        setStatus(validationError, "error");
        setContinueEnabled();
        return Promise.resolve();
      }

      var req = buildCheckoutRequest(cart, formState, currentEstimate);
      if (!req.items || !req.items.length) {
        setStatus("This cart cannot be checked out yet.", "error");
        setContinueEnabled();
        return Promise.resolve();
      }

      var originalText = continueBtn.textContent;
      continueBtn.disabled = true;
      continueBtn.setAttribute("aria-disabled", "true");
      continueBtn.textContent = "Starting checkout...";
      setStatus("", "");
      clearCheckoutResultState();
      saveCheckoutAttemptState({ status: "starting", message: "Starting checkout..." });

      var apiBase = getApiBase();
      var reqId = ++checkoutReqSeq;
      activeCheckoutReqId = reqId;
      checkoutInFlight = true;

      if (checkoutAbortController && typeof checkoutAbortController.abort === "function") {
        try {
          checkoutAbortController.abort();
        } catch (_) {
          // ignore
        }
      }

      checkoutAbortController = typeof AbortController === "function" ? new AbortController() : null;
      var checkoutTimedOut = false;

      if (checkoutTimeoutId) {
        clearTimeout(checkoutTimeoutId);
        checkoutTimeoutId = null;
      }

      if (checkoutAbortController) {
        checkoutTimeoutId = setTimeout(function () {
          checkoutTimedOut = true;
          try { checkoutAbortController.abort(); } catch (_) { /* ignore */ }
        }, 45000);
      }

      return fetch(apiBase + "/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: checkoutAbortController ? checkoutAbortController.signal : undefined
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) {
              if (reqId !== activeCheckoutReqId) return null;
              if (!res.ok) {
                var msg = (data && data.detail) ? String(data.detail) : "Checkout failed.";
                throw new Error(msg);
              }
              return data;
            });
        })
        .then(function (data) {
          if (reqId !== activeCheckoutReqId) return null;
          var url = data && data.url ? String(data.url) : "";
          if (!url) throw new Error("Checkout URL missing.");
          if (window.location.hash !== "#checkout-shipping") {
            clearCheckoutAttemptState();
            return null;
          }
          setStatus("Redirecting...", "");
          saveCheckoutAttemptState({ status: "redirecting", message: "Redirecting to payment..." });
          window.location.assign(url);
        })
        .catch(function (err) {
          if (reqId !== activeCheckoutReqId) return null;

          var msg = err && err.message ? String(err.message) : "";
          if (err && err.name === "AbortError") {
            if (!checkoutTimedOut) {
              clearCheckoutAttemptState();
              return null;
            }
            msg = "Checkout timed out. Please try again.";
          }
          if (/failed to fetch|networkerror|load failed|err_connection/i.test(msg)) {
            msg = "Cannot reach the shop server at " + apiBase + ".";
          }

          // If the user left the shipping step, don't surface an error out of context.
          if (window.location.hash !== "#checkout-shipping") {
            clearCheckoutAttemptState();
            return null;
          }

          saveCheckoutAttemptState({ status: "failed", message: msg || "Checkout failed." });
          saveCheckoutResultState({ status: "failed", message: msg || "Checkout failed." });
          setStatus(msg || "Checkout failed.", "error");
        })
        .finally(function () {
          if (reqId !== activeCheckoutReqId) return;

          if (checkoutTimeoutId) {
            clearTimeout(checkoutTimeoutId);
            checkoutTimeoutId = null;
          }
          checkoutInFlight = false;
          activeCheckoutReqId = 0;
          checkoutAbortController = null;

          continueBtn.textContent = originalText;
          setContinueEnabled();
        });
    }

    function refreshStep() {
      var cart = getCart();
      var hasItems = !!(cart && Array.isArray(cart.items) && cart.items.length);
      var attemptState = loadCheckoutAttemptState();
      var resultState = loadCheckoutResultState();
      var atShipping = window.location.hash === "#checkout-shipping";
      var now = Date.now();
      var transientError = "";

      if (!hasItems) {
        if (atShipping && now - shippingStepMountedAt < 1200) {
          setStatus("Loading cart...", "");
          setTimeout(refreshStep, 250);
          return;
        }
        estimateState = null;
        saveShippingEstimateState(null);
        clearShippingOptions();
        renderSummary(cart, null);
        if (atShipping) {
          setStatus("Your cart is empty.", "error");
        } else {
          // Don't pre-fill an error on a hidden step; it can appear later even after cart has items.
          setStatus("", "");
        }
        setContinueEnabled();
        if (atShipping) {
          window.location.hash = "#cart";
        }
        return;
      }

      if (atShipping) {
        var existing = String(statusEl.textContent || "").trim();
        if (existing === "Your cart is empty." || existing === "Loading cart...") {
          setStatus("", "");
        }
      }

      if (atShipping && !countriesLoadedFromApi) {
        loadCheckoutCountries(false);
      }

      if (atShipping && attemptState) {
        var ageMs = now - (parseInt(attemptState.ts, 10) || 0);
        if ((attemptState.status === "starting" || attemptState.status === "redirecting") && ageMs > 15000) {
          transientError = CHECKOUT_STALE_ATTEMPT_MESSAGE;
          clearCheckoutAttemptState();
        }
      }

      if (atShipping) {
        if (transientError) {
          setStatus(transientError, "error");
        } else if (resultState && resultState.status === "failed" && resultState.message) {
          setStatus(resultState.message, "error");
        } else if (resultState && resultState.status === "cancel") {
          setStatus("Payment was canceled. Your cart is still saved.", "");
        }
      }

      var formState = readFormState();
      saveShippingFormState(formState);

      if (!estimateMatches(cart, formState, estimateState)) {
        estimateState = null;
      }

      renderSummary(cart, estimateState);
      renderShippingOptions(estimateState);
      setContinueEnabled();
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      e.stopPropagation();
    });

    var persistedForm = loadShippingFormState();
    writeFormState(persistedForm);
    preferredShippingMethodId = normalizeShippingMethodId(persistedForm.shipping_method_id || "");

    if (estimateState) {
      preferredShippingMethodId = normalizeShippingMethodId(
        estimateState.selectedShippingMethodId || preferredShippingMethodId
      );
      preferredShippingMethodName = normalizeShippingMethodName(estimateState.selectedShippingMethodName || "");
    }

    renderSummary(getCart(), estimateState);
    renderShippingOptions(estimateState);

      function onInputChange() {
        var cart = getCart();
        var formState = readFormState();
        saveShippingFormState(formState);

        if (estimateState && !estimateMatches(cart, formState, estimateState)) {
          estimateState = null;
          saveShippingEstimateState(null);
          clearShippingOptions();
        }

        // Keep summary stable (especially discount + estimated total) as inputs change.
        renderSummary(cart, estimateState);
        setStatus("", "");
        setContinueEnabled();
      }

    firstNameEl.addEventListener("input", onInputChange);
    lastNameEl.addEventListener("input", onInputChange);
    emailEl.addEventListener("input", onInputChange);
    address1El.addEventListener("input", onInputChange);
    address2El.addEventListener("input", onInputChange);
    cityEl.addEventListener("input", onInputChange);
    stateEl.addEventListener("input", onInputChange);
    postalEl.addEventListener("input", onInputChange);
    countryEl.addEventListener("change", function () {
      onInputChange();
    });

    firstNameEl.addEventListener("blur", function () {
      firstNameEl.value = normalizeSimpleText(firstNameEl.value, 120);
      onInputChange();
    });

    lastNameEl.addEventListener("blur", function () {
      lastNameEl.value = normalizeSimpleText(lastNameEl.value, 120);
      onInputChange();
    });

    emailEl.addEventListener("blur", function () {
      emailEl.value = normalizeSimpleText(emailEl.value, 254);
      onInputChange();
    });

    address1El.addEventListener("blur", function () {
      address1El.value = normalizeSimpleText(address1El.value, 200);
      onInputChange();
    });

    address2El.addEventListener("blur", function () {
      address2El.value = normalizeSimpleText(address2El.value, 200);
      onInputChange();
    });

    cityEl.addEventListener("blur", function () {
      cityEl.value = normalizeSimpleText(cityEl.value, 120);
      onInputChange();
    });

    stateEl.addEventListener("blur", function () {
      var countryCode = normalizeCountryCode(countryEl.value || "US") || "US";
      stateEl.value = normalizeStateCode(stateEl.value, countryCode);
      onInputChange();
    });

    postalEl.addEventListener("blur", function () {
      var countryCode = normalizeCountryCode(countryEl.value || "US") || "US";
      postalEl.value = normalizePostalCode(postalEl.value, countryCode);
      onInputChange();
    });

    continueBtn.addEventListener("click", function () {
      runEstimate({ force: false, showValidationErrors: true, normalizeInputs: true })
        .then(function (freshEstimate) {
          if (!freshEstimate) return;
          return startCheckout(freshEstimate);
        });
    });

    calculateBtn.addEventListener("click", function () {
      runEstimate({ force: true, showValidationErrors: true, normalizeInputs: true });
    });

    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#checkout-shipping") {
        shippingStepMountedAt = Date.now();
        refreshStep();
      }
    });
    window.addEventListener("hashchange", function () {
      if (window.location.hash !== "#checkout-shipping") {
        cancelActiveCheckout();
        setStatus("", "");
      }
    });

    window.addEventListener("pageshow", function () {
      if (window.location.hash === "#checkout-shipping") {
        shippingStepMountedAt = Date.now();
        refreshStep();
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && window.location.hash === "#checkout-shipping") {
        refreshStep();
      }
    });

    window.addEventListener("online", function () {
      if (window.location.hash === "#checkout-shipping") {
        refreshStep();
      }
    });

    window.addEventListener("melkapow:cart-updated", function () {
      if (window.location.hash === "#checkout-shipping") {
        refreshStep();
      }
    });

    window.addEventListener(DISCOUNT_CODE_EVENT, function () {
      onInputChange();
    });

    refreshStep();
  }

    function wireReceipt() {
      var receiptBox = document.getElementById("receiptBox");
      var statusMsg = document.getElementById("receiptStatusMsg");
      if (!receiptBox || !statusMsg) return;

      var emailNoteEl = document.getElementById("receiptEmailNote");
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

    function setStatus(text, state) {
      var msg = text || "";
      statusMsg.textContent = msg;
      statusMsg.hidden = !msg;
      if (state) {
        statusMsg.setAttribute("data-state", state);
      } else {
        statusMsg.removeAttribute("data-state");
      }
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

      if (elNumber) elNumber.textContent = String(r.orderNumber || r.sessionId || "--");

      var createdIso = String(r.created || "");
      var dateText = "--";
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
      var activeSid = String(r.sessionId || storageGet(LAST_SESSION_KEY) || "").trim();
      var shippingSnapshot = activeSid ? loadLastShippingSnapshot(activeSid) : null;

      var email = String(customer.email || "").trim();

      var billingName = String(customer.name || "").trim();
      if (shippingSnapshot && shippingSnapshot.full_name) {
        var bNorm = normalizeSimpleText(billingName, 120).toLowerCase();
        var snapNorm = normalizeSimpleText(shippingSnapshot.full_name, 120).toLowerCase();
        if (!bNorm) {
          billingName = shippingSnapshot.full_name;
        } else if (snapNorm && snapNorm !== bNorm && snapNorm.indexOf(bNorm) === 0 && snapNorm.length > bNorm.length + 1) {
          // Stripe sometimes returns only "First" in billing; prefer the full name we collected on the Shipping step.
          billingName = shippingSnapshot.full_name;
        }
      }

      var billingText = formatAddressBlock(billingName, customer.address);
      if (!billingText) billingText = formatAddressBlock(String(shipping.name || ""), shipping.address);
      if (email) billingText = joinNonEmpty([billingText, email], "\n");
      if (elBilling) elBilling.textContent = billingText || "--";

      var shippingText = formatAddressBlock(String(shipping.name || ""), shipping.address);
      var showShipping = !!shippingText;

      if (!showShipping && shippingSnapshot) {
        var snapAddr = {
          line1: shippingSnapshot.address1,
          line2: shippingSnapshot.address2,
          city: shippingSnapshot.city,
          state: shippingSnapshot.state_code,
          postal_code: shippingSnapshot.zip,
          country: shippingSnapshot.country_code
        };
        shippingText = formatAddressBlock(String(shippingSnapshot.full_name || ""), snapAddr);
        showShipping = !!shippingText;
      }

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
          tdUnit.textContent = isFinite(unit) && unit > 0 ? formatMoney(unit, currency) : "--";

          var tdTotal = document.createElement("td");
          tdTotal.className = "align-right receipt-mono";
          var lineTotal = parseInt(it.amountTotalCents, 10);
          tdTotal.textContent = isFinite(lineTotal) ? formatMoney(lineTotal, currency) : "--";

          tr.appendChild(tdItem);
          tr.appendChild(tdQty);
          tr.appendChild(tdUnit);
          tr.appendChild(tdTotal);
          elItemsBody.appendChild(tr);
        }
      }

      var subtotal = parseInt(r.amountSubtotalCents, 10);
      if (elSubtotal) elSubtotal.textContent = isFinite(subtotal) ? formatMoney(subtotal, currency) : "--";

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
      if (elTotal) elTotal.textContent = isFinite(total) ? formatMoney(total, currency) : "--";

      var payment = r.payment && typeof r.payment === "object" ? r.payment : {};
      if (elPaymentMethod) elPaymentMethod.textContent = formatPaymentLabel(payment) || "--";
	      if (elPaymentAmount) elPaymentAmount.textContent = isFinite(total) ? formatMoney(total, currency) : "--";
	    }
	
		      function showReceiptEmailNote() {
		        if (!emailNoteEl) return;
		        emailNoteEl.textContent = "Your receipt will be emailed automatically.";
		        emailNoteEl.hidden = false;
		      }
	
		    function refresh() {
		      var atSuccess = window.location.hash === "#checkout-success";
		      if (!atSuccess) {
		        setStatus("", "");
		        if (emailNoteEl) {
		          emailNoteEl.textContent = "";
		          emailNoteEl.hidden = true;
		        }
		        return;
		      }
		
		      var sessionId = String(storageGet(LAST_SESSION_KEY) || "").trim();
		      if (!sessionId) {
		        setHidden(receiptBox, true);
		        setStatus("Invoice details are unavailable. If you need help, contact us.", "error");
		        setLoading(false);
		        return;
      }

      if (lastLoadedSession === sessionId && !receiptBox.hidden) {
        setStatus("", "");
        setLoading(false);
        return;
      }
      lastLoadedSession = sessionId;

      if (emailNoteEl) {
        emailNoteEl.textContent = "";
        emailNoteEl.hidden = true;
      }

      setLoading(true);

      var apiBase = getApiBase();
      if (!apiBase || typeof fetch !== "function") {
        setHidden(receiptBox, true);
        setStatus("Cannot reach the shop server to load your invoice.", "error");
        setLoading(false);
        return;
      }

      setHidden(receiptBox, true);
      setStatus("", "");

      function fetchInvoiceWithRetry(attempt) {
        var controller = typeof AbortController === "function" ? new AbortController() : null;
        var timeoutId = null;
        if (controller) {
          timeoutId = setTimeout(function () {
            try { controller.abort(); } catch (_) { /* ignore */ }
          }, 15000);
        }

        return fetch(apiBase + "/api/shop/checkout/session?session_id=" + encodeURIComponent(sessionId), {
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
                  var err = new Error(msg);
                  err.status = res.status;
                  throw err;
                }
                return data;
              });
          })
          .catch(function (err) {
            var status = err && isFinite(err.status) ? parseInt(err.status, 10) : 0;
            var msg = String((err && err.message) || "").toLowerCase();
            var aborted = !!(err && err.name === "AbortError");
            var retryable =
              aborted ||
              status === 0 ||
              status === 429 ||
              status === 500 ||
              status === 502 ||
              status === 503 ||
              status === 504 ||
              /temporarily|timeout|timed out|unavailable|network|failed to fetch|connection/.test(msg);

            if (attempt < 2 && retryable) {
              return new Promise(function (resolve) { setTimeout(resolve, 550); })
                .then(function () { return fetchInvoiceWithRetry(attempt + 1); });
            }
            throw err;
          })
          .finally(function () {
            if (timeoutId) clearTimeout(timeoutId);
          });
      }

	      fetchInvoiceWithRetry(1)
	        .then(function (data) {
	          if (!data || !data.ok) throw new Error("Failed to load invoice.");
	          render(data);
	          showReceiptEmailNote();
	          if (data.partial) {
	            setStatus("Invoice loaded with limited details. Everything is saved and email confirmation is still being sent.", "");
	          } else {
	            setStatus("", "");
	          }
          setLoading(false);
        })
        .catch(function (err) {
          setHidden(receiptBox, true);
          var status = err && isFinite(err.status) ? parseInt(err.status, 10) : 0;
          if (status === 404) {
            setStatus("Invoice not found yet. Please refresh in a few seconds.", "error");
          } else {
            setStatus("Invoice details are unavailable right now. Please check your email for a receipt.", "error");
          }
          setLoading(false);
        });
    }

    window.addEventListener("hashchange", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && window.location.hash === "#checkout-success") refresh();
    });
    window.addEventListener("online", function () {
      if (window.location.hash === "#checkout-success") refresh();
    });
    refresh();
  }

    function wireCartDiscount() {
      var inputEl = document.getElementById("cartDiscountCode");
      var applyBtn = document.getElementById("cartDiscountApplyBtn");
      var statusEl = document.getElementById("cartDiscountStatus");
      var itemsSubtotalEl = document.getElementById("cartSummaryItemsSubtotal");
      var discountRowEl = document.getElementById("cartSummaryDiscountRow");
      var discountLabelEl = document.getElementById("cartSummaryDiscountLabel");
      var discountAmountEl = document.getElementById("cartSummaryDiscount");
      var totalEl = document.getElementById("cartTotal");
  
      // Keep the Shipping step order summary in sync so Cart -> Shipping doesn't "jump"
      // back to a pre-discount total before the Shipping step JS re-renders.
      var checkoutShippingItemsSubtotalEl = document.getElementById("checkoutShippingItemsSubtotal");
      var checkoutShippingShippingEl = document.getElementById("checkoutShippingSummaryShipping");
      var checkoutShippingTaxEl = document.getElementById("checkoutShippingSummaryTax");
      var checkoutShippingDiscountRowEl = document.getElementById("checkoutShippingSummaryDiscountRow");
      var checkoutShippingDiscountLabelEl = document.getElementById("checkoutShippingSummaryDiscountLabel");
      var checkoutShippingDiscountEl = document.getElementById("checkoutShippingSummaryDiscount");
      var checkoutShippingTotalEl = document.getElementById("checkoutShippingSummaryTotal");
      if (!inputEl || !applyBtn || !statusEl) return;

    if (applyBtn.__melkapowBound) return;
    applyBtn.__melkapowBound = true;

    var previewReqSeq = 0;
    var activePreviewReqId = 0;
    var previewAbortController = null;
    var suppressDiscountEvent = false;
    var lastPreviewRequestKey = "";

    function setStatus(message, state) {
      var text = String(message || "");
      statusEl.textContent = text;
      statusEl.hidden = !text;
      if (state) {
        statusEl.setAttribute("data-state", state);
      } else {
        statusEl.removeAttribute("data-state");
      }
    }

    function setApplyBusy(busy) {
      applyBtn.disabled = !!busy;
      applyBtn.setAttribute("aria-disabled", busy ? "true" : "false");
    }

    function saveDiscountCodeWithoutEcho(code) {
      suppressDiscountEvent = true;
      return saveDiscountCode(code);
    }

    function getCartSubtotal() {
      return getCartSubtotalCents(getCart());
    }

      function renderCartSummary(subtotalCents, discountCents, currency, discountCode) {
        var cur = String(currency || "USD").trim().toUpperCase() || "USD";
        var code = normalizeDiscountCode(discountCode || "");
        var subtotal = parseInt(subtotalCents, 10);
        if (!isFinite(subtotal) || subtotal < 0) subtotal = 0;

      var discount = parseInt(discountCents, 10);
      if (!isFinite(discount) || discount < 0) discount = 0;
      if (discount > subtotal) discount = subtotal;

      if (itemsSubtotalEl) {
        itemsSubtotalEl.textContent = formatMoney(subtotal, cur);
      }

      if (discountRowEl && discountAmountEl) {
        if (discount > 0) {
          discountRowEl.hidden = false;
          discountAmountEl.textContent = "-" + formatMoney(discount, cur);
          if (discountLabelEl) {
            discountLabelEl.textContent = code ? ("Discount (" + code + ")") : "Discount";
          }
        } else {
          discountRowEl.hidden = true;
          discountAmountEl.textContent = "—";
          if (discountLabelEl) discountLabelEl.textContent = "Discount";
        }
      }

        if (totalEl) {
          var total = subtotal - discount;
          if (total < 0) total = 0;
          totalEl.textContent = formatMoney(total, cur);
        }
  
        // Mirror the same discount-aware subtotal/total into the Shipping step summary.
        // Shipping/tax are intentionally shown as unknown until calculated.
        if (checkoutShippingItemsSubtotalEl) {
          checkoutShippingItemsSubtotalEl.textContent = formatMoney(subtotal, cur);
        }
        if (checkoutShippingShippingEl) checkoutShippingShippingEl.textContent = "--";
        if (checkoutShippingTaxEl) checkoutShippingTaxEl.textContent = "--";
        if (checkoutShippingDiscountRowEl && checkoutShippingDiscountEl) {
          if (discount > 0) {
            checkoutShippingDiscountRowEl.hidden = false;
            checkoutShippingDiscountEl.textContent = "-" + formatMoney(discount, cur);
            if (checkoutShippingDiscountLabelEl) {
              checkoutShippingDiscountLabelEl.textContent = code ? ("Discount (" + code + ")") : "Discount";
            }
          } else {
            checkoutShippingDiscountRowEl.hidden = true;
            checkoutShippingDiscountEl.textContent = "—";
            if (checkoutShippingDiscountLabelEl) checkoutShippingDiscountLabelEl.textContent = "Discount";
          }
        }
        if (checkoutShippingTotalEl) {
          var shipTotal = subtotal - discount;
          if (shipTotal < 0) shipTotal = 0;
          checkoutShippingTotalEl.textContent = formatMoney(shipTotal, cur);
        }
      }

    function requestDiscountPreview(code, subtotalCents) {
      if (previewAbortController && typeof previewAbortController.abort === "function") {
        try {
          previewAbortController.abort();
        } catch (_) {
          // ignore
        }
      }
      previewAbortController = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = null;
      if (previewAbortController) {
        timeoutId = setTimeout(function () {
          try { previewAbortController.abort(); } catch (_) { /* ignore */ }
        }, 12000);
      }

      var reqId = ++previewReqSeq;
      activePreviewReqId = reqId;

      var apiBase = getApiBase();
      var fetchOpts = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discount_code: code,
          subtotal_cents: subtotalCents
        })
      };
      if (previewAbortController) {
        fetchOpts.signal = previewAbortController.signal;
      }

      return fetch(apiBase + "/api/shop/discount/preview", fetchOpts)
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) {
              if (reqId !== activePreviewReqId) return null;
              if (!res.ok) {
                var msg = (data && data.detail) ? String(data.detail) : "Discount validation failed.";
                throw new Error(msg);
              }
              return data;
            });
        })
        .then(function (data) {
          if (reqId !== activePreviewReqId) return null;
          if (!data || !data.ok) throw new Error("Discount validation failed.");
          return data;
        })
        .finally(function () {
          if (timeoutId) clearTimeout(timeoutId);
          if (reqId !== activePreviewReqId) return;
          activePreviewReqId = 0;
          previewAbortController = null;
        });
    }

    function applyCode(rawCode, opts) {
      var options = opts && typeof opts === "object" ? opts : {};
      var showStatus = !!options.showStatus;
      var persist = options.persist !== false;

      var code = normalizeDiscountCode(rawCode);
      inputEl.value = code;

      var subtotalCents = getCartSubtotal();
      var requestKey = code ? (code + "|" + String(subtotalCents)) : "";
      if (!code) {
        var hadExisting = false;
        if (showStatus) {
          var existingCode = loadDiscountCode();
          if (existingCode) {
            hadExisting = true;
          } else {
            var existingPreview = loadDiscountPreviewState();
            if (existingPreview && existingPreview.code) hadExisting = true;
          }
        }

        if (persist) saveDiscountCodeWithoutEcho("");
        clearDiscountPreviewState();
        lastPreviewRequestKey = "";
        renderCartSummary(subtotalCents, 0, "USD", "");
        if (showStatus) {
          if (hadExisting) setStatus("Discount code cleared.", "");
          else setStatus("Enter a discount code.", "");
        } else {
          setStatus("", "");
        }
        return Promise.resolve(null);
      }

      if (!isShopEnabled()) {
        renderCartSummary(subtotalCents, 0, "USD", "");
        if (showStatus) setStatus("Cannot validate discount code right now.", "error");
        return Promise.resolve(null);
      }

      // For passive refreshes (hash/cart events), reuse cached preview when unchanged.
      if (!showStatus && !persist) {
        var cachedPreview = loadDiscountPreviewState();
        if (
          cachedPreview &&
          cachedPreview.code === code &&
          parseInt(cachedPreview.subtotalCents, 10) === subtotalCents
        ) {
          var cachedDiscount = parseInt(cachedPreview.discountCents, 10);
          if (!isFinite(cachedDiscount) || cachedDiscount < 0) cachedDiscount = 0;
          var cachedCurrency = String(cachedPreview.currency || "USD").trim().toUpperCase() || "USD";
          renderCartSummary(subtotalCents, cachedDiscount, cachedCurrency, code);
          setStatus("", "");
          return Promise.resolve(cachedPreview);
        }
        if (requestKey && requestKey === lastPreviewRequestKey) {
          return Promise.resolve(null);
        }
      }

      if (showStatus) setStatus("Applying discount...", "");
      setApplyBusy(true);

      return requestDiscountPreview(code, subtotalCents)
        .then(function (data) {
          if (!data) return null;

          var subtotal = parseInt(data.subtotalCents, 10);
          if (!isFinite(subtotal) || subtotal < 0) subtotal = subtotalCents;

          var discountCents = parseInt(data.discountCents, 10);
          if (!isFinite(discountCents) || discountCents < 0) discountCents = 0;

          var percentOff = parseInt(data.discountPercentOff, 10);
          if (!isFinite(percentOff) || percentOff < 0) percentOff = 0;

          var appliedCode = normalizeDiscountCode(data.discountCode || code);
          var currency = String(data.currency || "USD").trim().toUpperCase() || "USD";

          if (persist) saveDiscountCodeWithoutEcho(appliedCode);
          saveDiscountPreviewState({
            code: appliedCode,
            subtotalCents: subtotal,
            discountCents: discountCents,
            currency: currency
          });
          lastPreviewRequestKey = requestKey || (appliedCode + "|" + String(subtotal));
          renderCartSummary(subtotal, discountCents, currency, appliedCode);

          if (showStatus) {
            if (percentOff > 0) {
              setStatus(appliedCode + " applied (" + String(percentOff) + "% off).", "");
            } else {
              setStatus(appliedCode + " applied.", "");
            }
          } else {
            setStatus("", "");
          }
          return data;
        })
        .catch(function (err) {
          if (err && err.name === "AbortError") return null;

          var msg = err && err.message ? String(err.message) : "Discount validation failed.";
          if (/failed to fetch|networkerror|load failed|err_connection/i.test(msg)) {
            msg = "Unable to validate discount right now. Please try again.";
          }

          if (/discount code/i.test(msg) || /not valid/i.test(msg)) {
            saveDiscountCodeWithoutEcho("");
            clearDiscountPreviewState();
            lastPreviewRequestKey = "";
            inputEl.value = "";
            renderCartSummary(subtotalCents, 0, "USD", "");
            setStatus(msg, "error");
          } else if (showStatus) {
            setStatus(msg, "error");
          }

          return null;
        })
        .finally(function () {
          setApplyBusy(false);
        });
    }

    function refreshFromStoredCode() {
      var saved = loadDiscountCode();
      inputEl.value = saved;
      return applyCode(saved, { showStatus: false, persist: false });
    }

    applyBtn.addEventListener("click", function () {
      applyCode(inputEl.value, { showStatus: true, persist: true });
    });

    inputEl.addEventListener("keydown", function (e) {
      if (!e || e.key !== "Enter") return;
      e.preventDefault();
      applyCode(inputEl.value, { showStatus: true, persist: true });
    });

    inputEl.addEventListener("blur", function () {
      inputEl.value = normalizeDiscountCode(inputEl.value);
    });

    window.addEventListener(DISCOUNT_CODE_EVENT, function () {
      if (suppressDiscountEvent) {
        suppressDiscountEvent = false;
        return;
      }
      refreshFromStoredCode();
    });

    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#cart") refreshFromStoredCode();
    });

    window.addEventListener("melkapow:cart-updated", function () {
      if (window.location.hash === "#cart") {
        refreshFromStoredCode();
      }
    });

    renderCartSummary(getCartSubtotal(), 0, "USD", "");
    refreshFromStoredCode();
  }

  function wireCheckoutCancel() {
    var msgEl = document.getElementById("checkoutCancelMsg");
    if (!msgEl) return;

    function refresh() {
      if (window.location.hash !== "#checkout-cancel") return;
      var resultState = loadCheckoutResultState();
      var text = "No worries — your cart is still saved.";
      var state = "";
      if (resultState && resultState.status === "failed") {
        text = resultState.message || "Payment failed. Your cart is still saved.";
        state = "error";
      } else if (resultState && resultState.status === "cancel") {
        text = "Payment was canceled. Your cart is still saved.";
      } else if (resultState && (resultState.status === "starting" || resultState.status === "redirecting")) {
        text = "We couldn't confirm payment completion. Please check your email receipt before retrying.";
        state = "error";
      }
      msgEl.textContent = text;
      if (state) {
        msgEl.setAttribute("data-state", state);
      } else {
        msgEl.removeAttribute("data-state");
      }
    }

    window.addEventListener("hashchange", refresh);
    window.addEventListener("pageshow", refresh);
    refresh();
  }

  function wireCartCheckout() {
    var btn = document.getElementById("cartCheckoutBtn");
    if (!btn) return;

    if (btn.__melkapowBound) return;
    btn.__melkapowBound = true;

    var statusEl = document.getElementById("cartCheckoutStatus");

    function setStatus(message, state) {
      if (!statusEl) return;
      var text = message || "";
      statusEl.textContent = text;
      statusEl.hidden = !text;
      if (state) {
        statusEl.setAttribute("data-state", state);
      } else {
        statusEl.removeAttribute("data-state");
      }
    }

    function refresh() {
      var cart = getCart();
      var items = cart && Array.isArray(cart.items) ? cart.items : [];
      var hasItems = !!items.length;

      if (!hasItems) {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        setStatus("", "");
        return;
      }

      if (!isShopEnabled()) {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        setStatus("Shop server is not available right now.", "error");
        return;
      }

      btn.disabled = false;
      btn.setAttribute("aria-disabled", "false");
      var attemptState = loadCheckoutAttemptState();
      var transientError = "";
      if (attemptState) {
        var ageMs = Date.now() - (parseInt(attemptState.ts, 10) || 0);
        if ((attemptState.status === "starting" || attemptState.status === "redirecting") && ageMs > 15000) {
          transientError = CHECKOUT_STALE_ATTEMPT_MESSAGE;
          clearCheckoutAttemptState();
        }
      }
      var resultState = loadCheckoutResultState();
      if (resultState && resultState.status === "failed" && resultState.message) {
        setStatus(resultState.message, "error");
      } else if (resultState && resultState.status === "cancel") {
        setStatus("Payment was canceled. Your cart is still saved.", "");
      } else if (transientError) {
        setStatus(transientError, "error");
      } else {
        setStatus("", "");
      }
    }

    btn.addEventListener("click", function () {
      var cart = getCart();
      if (!cart.items || !cart.items.length) {
        setStatus("Your cart is empty.", "error");
        refresh();
        return;
      }

      if (!isShopEnabled()) {
        setStatus("Shop server is not available right now.", "error");
        refresh();
        return;
      }

      setStatus("", "");
      window.location.hash = "#checkout-shipping";
    });

    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#cart") refresh();
    });
    window.addEventListener("hashchange", function () {
      if (window.location.hash !== "#cart") setStatus("", "");
    });

    window.addEventListener("pageshow", function () {
      if (window.location.hash === "#cart") refresh();
    });

    window.addEventListener("melkapow:cart-updated", function () {
      if (window.location.hash === "#cart") refresh();
    });

    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      handleCheckoutReturn();
      wireCartDiscount();
      wireCartCheckout();
      wireShippingStep();
      wireCheckoutCancel();
      wireReceipt();
    });
  } else {
    handleCheckoutReturn();
    wireCartDiscount();
    wireCartCheckout();
    wireShippingStep();
    wireCheckoutCancel();
    wireReceipt();
  }
})();
