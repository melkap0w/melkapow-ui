// assets/js/art_build.js
(function () {
  "use strict";

  function getArtList() {
    return Array.isArray(window.MELKAPOW_ART) ? window.MELKAPOW_ART : [];
  }

  function removeGeneratedArticles(mainEl) {
    var existing = mainEl.querySelectorAll('article[data-generated="art"]');
    for (var i = existing.length - 1; i >= 0; i--) {
      existing[i].parentNode.removeChild(existing[i]);
    }
  }

  function buildSlider(art) {
    var slides = Array.isArray(art.slides) ? art.slides.slice(0, 4) : [];
    if (slides.length === 0) return null;

    var slider = document.createElement("div");
    slider.className = "art-slider";

    var name = String(art.id) + "-slider";

    for (var i = 0; i < slides.length; i++) {
      var input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.id = String(art.id) + "-" + String(i + 1);
      if (i === 0) input.checked = true;
      slider.appendChild(input);
    }

    var slidesEl = document.createElement("div");
    slidesEl.className = "slides";

    for (var j = 0; j < slides.length; j++) {
      var img = document.createElement("img");
      img.src = slides[j].src;
      img.alt = slides[j].alt || art.title || "";
      img.decoding = "async";
      img.loading = "lazy";
      slidesEl.appendChild(img);
    }

    slider.appendChild(slidesEl);

    if (slides.length > 1) {
      for (var k = 0; k < slides.length; k++) {
        var nav = document.createElement("div");
        nav.className = "nav nav-" + String(k + 1);

        var prevIdx = (k - 1 + slides.length) % slides.length;
        var nextIdx = (k + 1) % slides.length;

        var prev = document.createElement("label");
        prev.htmlFor = String(art.id) + "-" + String(prevIdx + 1);
        prev.textContent = "\u276E";

        var next = document.createElement("label");
        next.htmlFor = String(art.id) + "-" + String(nextIdx + 1);
        next.textContent = "\u276F";

        nav.appendChild(prev);
        nav.appendChild(next);
        slider.appendChild(nav);
      }
    }

    return slider;
  }

  function buildArtArticle(art) {
    var article = document.createElement("article");
    article.id = "art-" + String(art.id);
    article.className = "from-gallery";
    article.setAttribute("data-generated", "art");

    var heading = document.createElement("h2");
    heading.className = "major";
    heading.textContent = art.title || "Artwork";
    article.appendChild(heading);

    var slider = buildSlider(art);
    if (slider) article.appendChild(slider);

    if (art.caption) {
      var caption = document.createElement("p");
      caption.className = "mt-2rem";
      caption.textContent = art.caption;
      article.appendChild(caption);
    }

    var actions = document.createElement("ul");
    actions.className = "actions";

    var liBuy = document.createElement("li");
    var aBuy = document.createElement("a");
    aBuy.href = "#";
    aBuy.className = "button primary";
    aBuy.textContent = "Buy me soon! lol";
    liBuy.appendChild(aBuy);

    var liBack = document.createElement("li");
    var aBack = document.createElement("a");
    aBack.href = "#work";
    aBack.className = "button";
    aBack.textContent = "Back to Gallery";
    liBack.appendChild(aBack);

    actions.appendChild(liBuy);
    actions.appendChild(liBack);
    article.appendChild(actions);

    return article;
  }

  function buildArtArticles() {
    var mainEl = document.getElementById("main");
    if (!mainEl) return;

    var list = getArtList();
    if (list.length === 0) return;

    removeGeneratedArticles(mainEl);

    var insertBefore = document.getElementById("about");
    for (var i = 0; i < list.length; i++) {
      var article = buildArtArticle(list[i]);
      mainEl.insertBefore(article, insertBefore);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildArtArticles);
  } else {
    buildArtArticles();
  }
})();

