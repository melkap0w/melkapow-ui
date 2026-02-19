// assets/js/failure_reporting.js
(function () {
  "use strict";

  var STORAGE_PREFIX = "melkapow_client_failure_sent_v1:";
  var SLOW_LOAD_THRESHOLD_MS = 20000;

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

    // In production we intentionally require MELKAPOW_API_BASE to avoid accidental posts.
    return "";
  }

  function safeJsonStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return "";
    }
  }

  function sha16(text) {
    // Small non-crypto hash (djb2) for client-side dedupe keys.
    var str = String(text || "");
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h >>> 0;
    }
    var hex = h.toString(16);
    while (hex.length < 8) hex = "0" + hex;
    return hex.slice(0, 8);
  }

  function shouldSendOnce(key) {
    var k = STORAGE_PREFIX + String(key || "");
    if (!k) return false;
    try {
      if (window.sessionStorage.getItem(k)) return false;
      window.sessionStorage.setItem(k, "1");
      return true;
    } catch (_) {
      return true;
    }
  }

  function pageRef() {
    // Avoid querystrings which may contain session ids or other sensitive info.
    return String(location.origin || "") + String(location.pathname || "") + String(location.hash || "");
  }

  function postFailure(payload) {
    var apiBase = getApiBase();
    if (!apiBase) return;
    if (typeof fetch !== "function") return;

    var data = payload && typeof payload === "object" ? payload : {};
    if (!data.kind || !data.message) return;

    try {
      fetch(apiBase + "/api/client/failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: safeJsonStringify(data),
        // Best-effort even during navigation/unload.
        keepalive: true
      }).catch(function () { /* ignore */ });
    } catch (_) {
      // ignore
    }
  }

  function report(kind, message, extra) {
    var k = String(kind || "").trim().toLowerCase();
    if (!k) k = "client";
    var msg = String(message || "").trim();
    if (!msg) return;

    var page = pageRef();
    var dedupeKey = sha16(k + "|" + msg + "|" + page);
    if (!shouldSendOnce(dedupeKey)) return;

    var payload = {
      kind: k.slice(0, 40),
      message: msg.slice(0, 500),
      page: page.slice(0, 300)
    };

    try {
      payload.user_agent = String(navigator.userAgent || "").slice(0, 300);
    } catch (_) {
      // ignore
    }

    if (extra && typeof extra === "object") {
      // Allow callers to provide a long stack trace without stuffing it into `extra`.
      try {
        if (typeof extra.stack === "string" && extra.stack.trim()) {
          payload.stack = String(extra.stack).slice(0, 4000);
        }
      } catch (_) {
        // ignore
      }

      var out = {};
      var keys = Object.keys(extra);
      for (var i = 0; i < keys.length && i < 25; i++) {
        var key = String(keys[i] || "").trim();
        if (!key) continue;
        if (key === "stack") continue;
        var val = String(extra[key] || "").trim();
        if (!val) continue;
        out[key.slice(0, 60)] = val.slice(0, 240);
      }
      if (Object.keys(out).length) payload.extra = out;
    }

    postFailure(payload);
  }

  window.addEventListener("error", function (event) {
    if (!event) return;

    var message = String(event.message || "").trim() || "Unhandled error";
    var stack = "";
    try {
      if (event.error && event.error.stack) stack = String(event.error.stack || "");
    } catch (_) {
      stack = "";
    }

    report("js-error", message, {
      source: String(event.filename || ""),
      lineno: String(event.lineno || ""),
      colno: String(event.colno || ""),
      stack: stack
    });
  });

  window.addEventListener("unhandledrejection", function (event) {
    if (!event) return;
    var reason = event.reason;
    var message = "";
    var stack = "";
    try {
      if (reason && typeof reason === "object") {
        message = String(reason.message || reason.toString() || "");
        stack = String(reason.stack || "");
      } else {
        message = String(reason || "");
      }
    } catch (_) {
      message = "Unhandled promise rejection";
      stack = "";
    }

    report("unhandledrejection", message || "Unhandled promise rejection", { stack: stack });
  });

  window.addEventListener("load", function () {
    if (!("performance" in window)) return;
    if (typeof performance.getEntriesByType !== "function") return;

    var nav = null;
    try {
      var entries = performance.getEntriesByType("navigation");
      if (entries && entries.length) nav = entries[0];
    } catch (_) {
      nav = null;
    }
    if (!nav || typeof nav.duration !== "number") return;
    if (nav.duration < SLOW_LOAD_THRESHOLD_MS) return;

    report("slow-load", "Slow page load", {
      duration_ms: String(Math.round(nav.duration)),
      dom_content_loaded_ms: String(Math.round(nav.domContentLoadedEventEnd || 0)),
      response_end_ms: String(Math.round(nav.responseEnd || 0))
    });
  });
})();
