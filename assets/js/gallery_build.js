// assets/js/gallery_build.js
(function () {
  "use strict";

  var PLACEHOLDER_IMG_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  var THUMB_DIR = "__IMAGE_REMOVED__";

  function $(sel) { return document.querySelector(sel); }

  function isRemoteUrl(url) {
    var s = String(url || "");
    return /^https?:\/\//i.test(s) || /^data:/i.test(s);
  }

  function basename(path) {
    var raw = String(path || "");
    if (!raw) return "";
    var clean = raw.split("?")[0].split("#")[0];
    var parts = clean.split("/");
    return parts.length ? parts[parts.length - 1] : clean;
  }

  function toThumbUrl(src) {
    var raw = String(src || "").trim();
    if (!raw) return "";
    if (isRemoteUrl(raw)) return raw;
    if (raw.indexOf("/thumbnails/") !== -1) return raw;

    var file = basename(raw);
    if (!file) return raw;
    return THUMB_DIR + file;
  }

  function buildGallery() {
    var wrap = $("#gallery");
    if (!wrap || !window.MELKAPOW_ART) return;

    wrap.innerHTML = "";

    window.MELKAPOW_ART.forEach(function (art) {
      var url = "#gallery-" + String(art.id);
      var fullThumbSrc = String(
        (art && (art.thumb || (art.slides && art.slides[0] && art.slides[0].src))) || ""
      ).trim();
      var thumbSrc = toThumbUrl(fullThumbSrc);

      var a = document.createElement("a");
      a.className = "gallery-item";
      a.href = url;

      var img = document.createElement("img");
      img.src = PLACEHOLDER_IMG_SRC;
      img.setAttribute("data-src", thumbSrc || fullThumbSrc);
      img.alt = art.alt || art.title;
      img.loading = "lazy";
      img.decoding = "async";

      if (thumbSrc && fullThumbSrc && thumbSrc !== fullThumbSrc) {
        img.setAttribute("data-fallback-src", fullThumbSrc);
        img.addEventListener("error", function onError() {
          img.removeEventListener("error", onError);
          var fallback = img.getAttribute("data-fallback-src");
          if (fallback) img.src = fallback;
        });
      }

      var cap = document.createElement("span");
      cap.className = "caption";
      cap.textContent = art.galleryTitle || art.title;

      a.appendChild(img);
      a.appendChild(cap);
      wrap.appendChild(a);
    });
  }

  document.addEventListener("DOMContentLoaded", buildGallery);
})();
