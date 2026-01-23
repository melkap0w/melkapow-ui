// assets/js/gallery_build.js
(function () {
  "use strict";

  function $(sel) { return document.querySelector(sel); }

  function buildGallery() {
    var wrap = $("#gallery");
    if (!wrap || !window.MELKAPOW_ART) return;

    wrap.innerHTML = "";

    window.MELKAPOW_ART.forEach(function (art) {
      var url = "#art-" + String(art.id);

      var a = document.createElement("a");
      a.className = "gallery-item";
      a.href = url;

      var img = document.createElement("img");
      img.src = art.thumb;
      img.alt = art.alt || art.title;
      img.loading = "lazy";
      img.decoding = "async";

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
