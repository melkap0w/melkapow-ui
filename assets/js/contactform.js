// Melkapow custom behavior (kept out of template main.js)
(function () {
  "use strict";

  // ----- Contact form reset when leaving #contact -----
  function resetContactIfLeaving(prevHash, nextHash) {
    if (prevHash !== "#contact") return;      // only if we are leaving contact
    if (nextHash === "#contact") return;      // still on contact, do nothing

    var form = document.querySelector("#contact form");
    if (!form) return;

    // tiny delay so it doesn't fight the template hide animation
    setTimeout(function () {
      form.reset();
    }, 150);
  }

  // Track hash transitions
  var lastHash = window.location.hash || "";

  window.addEventListener("hashchange", function () {
    var nextHash = window.location.hash || "";
    resetContactIfLeaving(lastHash, nextHash);
    lastHash = nextHash;
  });

  // Also reset on load if contact isn't active (keeps it clean if user had stale inputs cached)
  window.addEventListener("load", function () {
    var currentHash = window.location.hash || "";
    if (currentHash !== "#contact") {
      var form = document.querySelector("#contact form");
      if (form) form.reset();
    }
  });

  // ----- Reset art sliders when leaving an art page -----
  function resetSlider(section) {
    var radios = section.querySelectorAll('input[type="radio"]');
    for (var i = 0; i < radios.length; i++) radios[i].checked = (i === 0);
  }

  var artSections = document.querySelectorAll('article[id^="art-"]');

  function resetNonActiveArtSliders() {
    var activeHash = window.location.hash || "";
    for (var i = 0; i < artSections.length; i++) {
      var section = artSections[i];
      if ("#" + section.id !== activeHash) {
        // delay so user never sees the jump
        setTimeout((function (s) {
          return function () { resetSlider(s); };
        })(section), 150);
      }
    }
  }

  window.addEventListener("hashchange", resetNonActiveArtSliders);
  window.addEventListener("load", resetNonActiveArtSliders);

    // ----- Warm cache for Work thumbnails after the home page is loaded -----
    window.addEventListener("load", function () {
    var thumbs = [
        "__IMAGE_REMOVED__",
        "__IMAGE_REMOVED__",
        "__IMAGE_REMOVED__",
        "__IMAGE_REMOVED__",
        "__IMAGE_REMOVED__",
        "__IMAGE_REMOVED__",
    ];

    var run = function () {
        thumbs.forEach(function (src) {
        var img = new Image();
        img.decoding = "async";
        img.src = src;
        });
    };

    if ("requestIdleCallback" in window) window.requestIdleCallback(run);
    else setTimeout(run, 500);
    });


})();
