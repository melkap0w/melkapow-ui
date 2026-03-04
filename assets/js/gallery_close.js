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

    try { img.loading = "eager"; } catch (_) {}

    var fallback = img.getAttribute("data-fallback-src");
    if (fallback) {
      img.addEventListener("error", function onError() {
        img.removeEventListener("error", onError);
        img.removeAttribute("data-fallback-src");
        img.src = fallback;
      });
    }

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

  function getSliderImages(slider) {
    if (!slider) return [];
    return slider.querySelectorAll(".slides img");
  }

  function isImageLoaded(img) {
    if (!img) return false;
    return !!(img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
  }

  function clearForcedVisibility(slider) {
    var imgs = getSliderImages(slider);
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!img) continue;
      if (img.getAttribute("data-force-visible") !== "true") continue;
      img.removeAttribute("data-force-visible");
      img.style.opacity = "";
      img.style.transform = "";
      img.style.zIndex = "";
    }
  }

  function setForceVisible(img, enabled) {
    if (!img) return;
    if (enabled) {
      img.setAttribute("data-force-visible", "true");
      img.style.opacity = "1";
      img.style.transform = "translateX(0)";
      img.style.zIndex = "2";
      return;
    }
    if (img.getAttribute("data-force-visible") !== "true") return;
    img.removeAttribute("data-force-visible");
    img.style.opacity = "";
    img.style.transform = "";
    img.style.zIndex = "";
  }

  function releaseForceVisible(img) {
    if (!img) return;
    if (img.getAttribute("data-force-visible") !== "true") return;

    // Fade out the previous slide on top of the next one to avoid blank flashes.
    img.style.zIndex = "2";
    img.style.opacity = "0";
    img.style.transform = "translateX(10px)";

    window.setTimeout(function () {
      setForceVisible(img, false);
    }, 320);
  }

  function loadSliderImage(slider, index) {
    var imgs = getSliderImages(slider);
    if (!imgs || index < 0 || index >= imgs.length) return null;
    var img = imgs[index];
    loadImgFromData(img);
    return img;
  }

  function wireLazySlider(slider) {
    if (!slider || slider.getAttribute("data-lazy-wired") === "true") return;
    slider.setAttribute("data-lazy-wired", "true");
    slider.__melkapowActiveSlideIndex = getCheckedSlideIndex(slider);

    slider.addEventListener("change", function (e) {
      var target = e && e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "radio" || !target.checked) return;

      clearForcedVisibility(slider);

      var raw = target.getAttribute("data-slide-index");
      var idx = parseInt(raw, 10);
      if (!isFinite(idx) || idx < 0) idx = 0;

      var prevIdx = parseInt(slider.__melkapowActiveSlideIndex, 10);
      if (!isFinite(prevIdx) || prevIdx < 0) prevIdx = idx;
      slider.__melkapowActiveSlideIndex = idx;

      var prevImg = loadSliderImage(slider, prevIdx);
      var nextImg = loadSliderImage(slider, idx);

      // Preload adjacent slides so navigation doesn't flash a blank frame.
      loadSliderImage(slider, idx + 1);
      loadSliderImage(slider, idx - 1);

      if (!nextImg || !prevImg || nextImg === prevImg) return;
      if (isImageLoaded(nextImg)) return;

      // Keep the previous slide visible until the next image has loaded.
      setForceVisible(prevImg, true);

      var cleaned = false;
      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        releaseForceVisible(prevImg);
      }

      nextImg.addEventListener("load", cleanup, { once: true });
      nextImg.addEventListener("error", cleanup, { once: true });
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

    // Detail pages: only load the active slide image.
    if (hash.startsWith("#gallery-") || hash.startsWith("#shop-")) {
      var article = getActiveArticle();
      if (!article) return;

      var sliders = article.querySelectorAll(".art-slider");
      for (var i = 0; i < sliders.length; i++) {
        var slider = sliders[i];
        wireLazySlider(slider);
        var idx = getCheckedSlideIndex(slider);
        slider.__melkapowActiveSlideIndex = idx;
        loadSliderImage(slider, idx);
        loadSliderImage(slider, idx + 1);
      }
      return;
    }

    // Other pages (Intro/About/etc): hydrate inline images when opened.
    var other = getActiveArticle();
    if (other && other.tagName === "ARTICLE") hydrateImagesIn(other);
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
