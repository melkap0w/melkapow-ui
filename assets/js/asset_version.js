// assets/js/asset_version.js
(function () {
  "use strict";

  function readQueryParam(url, key) {
    var raw = String(url || "");
    var qIndex = raw.indexOf("?");
    if (qIndex < 0) return "";
    var query = raw.slice(qIndex + 1).split("#")[0];
    if (!query) return "";
    var pairs = query.split("&");
    for (var i = 0; i < pairs.length; i++) {
      var pair = String(pairs[i] || "");
      if (!pair) continue;
      if (pair.indexOf(key + "=") !== 0) continue;
      var val = pair.slice((key + "=").length);
      try {
        val = decodeURIComponent(val);
      } catch (_) {
        // ignore
      }
      val = String(val || "").trim();
      if (val) return val;
    }
    return "";
  }

  function detectAssetVersionFromCss() {
    try {
      var links = document.getElementsByTagName("link");
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        if (!link) continue;
        var rel = String(link.getAttribute("rel") || "").toLowerCase();
        if (rel !== "stylesheet") continue;
        var href = String(link.getAttribute("href") || "");
        if (!href) continue;
        if (href.indexOf("assets/css/main.css") === -1) continue;
        var v = readQueryParam(href, "v");
        if (v) return v;
      }
    } catch (_) {
      // ignore
    }
    return "";
  }

  function isRemoteUrl(raw) {
    return /^(data:|https?:\/\/|\/\/)/i.test(String(raw || "").trim());
  }

  function versionedAssetUrl(url) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    if (isRemoteUrl(raw)) return raw;

    var version = String(window.MELKAPOW_ASSET_VERSION || "").trim();
    if (!version) return raw;

    var hashIndex = raw.indexOf("#");
    var hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
    var withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
    var queryIndex = withoutHash.indexOf("?");
    var path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    var query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";

    var pairs = query ? query.split("&").filter(Boolean) : [];
    var nextPairs = [];
    var replaced = false;

    for (var i = 0; i < pairs.length; i++) {
      var pair = String(pairs[i] || "");
      if (!pair) continue;
      if (pair.indexOf("v=") === 0) {
        nextPairs.push("v=" + encodeURIComponent(version));
        replaced = true;
        continue;
      }
      nextPairs.push(pair);
    }

    if (!replaced) nextPairs.push("v=" + encodeURIComponent(version));
    return path + "?" + nextPairs.join("&") + hash;
  }

  if (!String(window.MELKAPOW_ASSET_VERSION || "").trim()) {
    var detected = detectAssetVersionFromCss();
    if (detected) window.MELKAPOW_ASSET_VERSION = detected;
  }

  window.melkapowVersionedAssetUrl = versionedAssetUrl;
})();

