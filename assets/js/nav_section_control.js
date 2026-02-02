(function () {
  "use strict";

  function normalizeHash(hash) {
    if (typeof hash !== "string") return "";
    var trimmed = hash.split("?")[0].trim();
    return trimmed.startsWith("#") ? trimmed : "";
  }

  function handleNavClick(event) {
    var target = event.target.closest("a");
    if (!target) return;

    var href = target.getAttribute("href") || "";
    if (!href.startsWith("#")) return;

    var normalized = normalizeHash(href);
    if (normalized !== "#shop" && normalized !== "#work") return;

    event.preventDefault();
    event.stopPropagation();

    if (location.hash !== normalized) {
      location.hash = normalized;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var nav = document.querySelector("#header nav");
    if (!nav) return;

    nav.addEventListener("click", handleNavClick);
  });
})();
