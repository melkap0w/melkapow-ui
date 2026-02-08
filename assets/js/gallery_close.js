// assets/js/gallery_close.js
(function () {
  "use strict";

  function getActiveArticle() {
    var hash = window.location.hash || "";
    if (!hash || hash === "#" || !hash.startsWith("#")) return null;
    return document.getElementById(hash.slice(1));
  }

  function loadImgFromData(img) {
    if (!img) return;
    var src = img.getAttribute("data-src");
    if (!src) return;
    img.removeAttribute("data-src");
    img.src = src;
  }

  function hydrateImagesIn(root) {
    if (!root) return;
    var imgs = root.querySelectorAll("img[data-src]");
    for (var i = 0; i < imgs.length; i++) loadImgFromData(imgs[i]);
  }

  function getCheckedSlideIndex(slider) {
    if (!slider) return 0;
    var checked = slider.querySelector('input[type="radio"]:checked');
    if (!checked) return 0;
    var raw = checked.getAttribute("data-slide-index");
    var idx = parseInt(raw, 10);
    return isFinite(idx) && idx >= 0 ? idx : 0;
  }

  function loadSliderImage(slider, index) {
    if (!slider) return;
    var imgs = slider.querySelectorAll(".slides img");
    if (!imgs || index < 0 || index >= imgs.length) return;
    loadImgFromData(imgs[index]);
  }

  function wireLazySlider(slider) {
    if (!slider || slider.getAttribute("data-lazy-wired") === "true") return;
    slider.setAttribute("data-lazy-wired", "true");

    slider.addEventListener("change", function (e) {
      var target = e && e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "radio" || !target.checked) return;

      var raw = target.getAttribute("data-slide-index");
      var idx = parseInt(raw, 10);
      if (!isFinite(idx) || idx < 0) idx = 0;
      loadSliderImage(slider, idx);
    });
  }

  function hydrateActivePageImages() {
    var hash = window.location.hash || "";

    // Only start downloading thumbs when the user opens Gallery/Shop.
    if (hash === "#work") {
      hydrateImagesIn(document.getElementById("work"));
      return;
    }

    if (hash === "#shop") {
      hydrateImagesIn(document.getElementById("shop"));
      return;
    }

    // Only load full-res slides when the user opens a detail page.
    if (!hash.startsWith("#gallery-") && !hash.startsWith("#shop-")) return;

    var article = getActiveArticle();
    if (!article) return;

    var sliders = article.querySelectorAll(".art-slider");
    for (var i = 0; i < sliders.length; i++) {
      var slider = sliders[i];
      wireLazySlider(slider);
      loadSliderImage(slider, getCheckedSlideIndex(slider));
    }
  }

  function resetSliderToFirst(section) {
    var radios = section.querySelectorAll('input[type="radio"]');
    for (var i = 0; i < radios.length; i++) radios[i].checked = (i === 0);
  }

  function resetNonActiveArtSliders() {
    var activeHash = window.location.hash || "";
    var artSections = document.querySelectorAll('article[id^="gallery-"], article[id^="shop-"]');

    for (var i = 0; i < artSections.length; i++) {
      var section = artSections[i];
      if ("#" + section.id !== activeHash) {
        // Delay so the user never sees the jump.
        window.setTimeout(
          (function (s) {
            return function () {
              resetSliderToFirst(s);
            };
          })(section),
          150
        );
      }
    }
  }

  // Note: we intentionally do not preload thumbs on initial load anymore.
  // They begin downloading when the user opens the Gallery/Shop tabs.

  function hijackCloseToWork() {
    var main = document.querySelector("#main");
    if (!main) return;

    // Use capture so this runs before Dimension's own close handlers.
    main.addEventListener(
      "click",
      function (e) {
        var close = e.target.closest(".close");
        if (!close) return;

        var article = close.closest("article");
        if (!article) return;

        if (article.classList.contains("from-shop")) {
          e.preventDefault();
          e.stopPropagation();
          window.location.hash = "#shop";
          return;
        }

        // Only hijack X behavior for gallery detail pages.
        if (article.classList.contains("from-gallery")) {
          e.preventDefault();
          e.stopPropagation();
          window.location.hash = "#work";
        }
      },
      true
    );
  }

  window.addEventListener("hashchange", function () {
    resetNonActiveArtSliders();
    hydrateActivePageImages();
  });
  window.addEventListener("load", function () {
    resetNonActiveArtSliders();
    hijackCloseToWork();
    hydrateActivePageImages();
  });
})();
