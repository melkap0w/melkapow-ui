// assets/js/gallery_close.js
(function () {
  "use strict";

  function resetSliderToFirst(section) {
    var radios = section.querySelectorAll('input[type="radio"]');
    for (var i = 0; i < radios.length; i++) radios[i].checked = (i === 0);
  }

  function resetNonActiveArtSliders() {
    var activeHash = window.location.hash || "";
    var artSections = document.querySelectorAll('article[id^="art-"]');

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

  function warmThumbCache() {
    var thumbs = [];
    var list = Array.isArray(window.MELKAPOW_ART) ? window.MELKAPOW_ART : [];

    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].thumb) thumbs.push(list[i].thumb);
    }

    if (thumbs.length === 0) return;

    var run = function () {
      for (var j = 0; j < thumbs.length; j++) {
        var img = new Image();
        img.decoding = "async";
        img.src = thumbs[j];
      }
    };

    if ("requestIdleCallback" in window) window.requestIdleCallback(run);
    else window.setTimeout(run, 500);
  }

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

  window.addEventListener("hashchange", resetNonActiveArtSliders);
  window.addEventListener("load", function () {
    resetNonActiveArtSliders();
    warmThumbCache();
    hijackCloseToWork();
  });
})();
