// assets/js/gallery_art_build.js
(function () {
  "use strict";

  var PLACEHOLDER_IMG_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  function getArtList() {
    return Array.isArray(window.MELKAPOW_ART) ? window.MELKAPOW_ART : [];
  }

  function removeGeneratedArticles(mainEl) {
    var existing = mainEl.querySelectorAll('article[data-generated="gallery-art"]');
    for (var i = existing.length - 1; i >= 0; i--) {
      existing[i].parentNode.removeChild(existing[i]);
    }
  }

  function setMultilineText(el, text) {
    if (!el) return;

    var raw = String(text || "");
    raw = raw.replace(/<br\s*\/?>/gi, "\n").replace(/\\n/g, "\n");

    var lines = raw.split(/\r?\n/);
    el.textContent = "";

    for (var i = 0; i < lines.length; i++) {
      if (i) el.appendChild(document.createElement("br"));
      el.appendChild(document.createTextNode(lines[i]));
    }
  }

  function buildSlider(art) {
    var slides = Array.isArray(art.slides) ? art.slides.slice(0, 4) : [];
    if (slides.length === 0) return null;

    var slider = document.createElement("div");
    slider.className = "art-slider";

    var name = String(art.id) + "-gallery-slider";

    for (var i = 0; i < slides.length; i++) {
      var input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.id = "gallery-" + String(art.id) + "-" + String(i + 1);
      input.setAttribute("data-slide-index", String(i));
      if (i === 0) input.checked = true;
      slider.appendChild(input);
    }

    var slidesEl = document.createElement("div");
    slidesEl.className = "slides";

    for (var j = 0; j < slides.length; j++) {
      var img = document.createElement("img");
      img.src = PLACEHOLDER_IMG_SRC;
      img.setAttribute("data-src", slides[j].src);
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
        prev.htmlFor = "gallery-" + String(art.id) + "-" + String(prevIdx + 1);
        prev.textContent = "\u276E";

        var next = document.createElement("label");
        next.htmlFor = "gallery-" + String(art.id) + "-" + String(nextIdx + 1);
        next.textContent = "\u276F";

        nav.appendChild(prev);
        nav.appendChild(next);
        slider.appendChild(nav);
      }
    }

    return slider;
  }

  function createProductDetailsBox(art) {
    if (!art) return null;

    var info = art.productInfo && typeof art.productInfo === "object" ? art.productInfo : null;
    var collectionRaw = info && info.collection ? String(info.collection).trim().toLowerCase() : "";
    var collection = collectionRaw === "classic" || collectionRaw === "grandeur" ? collectionRaw : "grandeur";

    var defaultDims = collection === "classic" ? '36" H x 48" W x 0.75" D' : '36" H x 38" W x 1.5" D';
    var dims = info && info.dimensions ? String(info.dimensions).trim() : "";
    if (!dims) dims = defaultDims;

    var collectionLabel = collection === "classic" ? "Classic Collection" : "Grandeur Collection";
    var lines = [
      "Gallery quality canvas, kiln dried stretcher bars",
      "Dimensions: " + dims,
      "Material: Canvas & Wood",
      "Content: 100% Cotton Duck",
      "Net Weight: 12 Ounces (343g) Primed & 6 Ounces (172g) Un-Primed"
    ];

    var box = document.createElement("div");
    box.className = "box purchase-box";

    var desc = document.createElement("div");
    desc.className = "purchase-description";

    var heading = document.createElement("h4");
    heading.textContent = collectionLabel;
    desc.appendChild(heading);

    var list = document.createElement("ul");
    list.className = "purchase-description-list";
    lines.forEach(function (line) {
      var li = document.createElement("li");
      li.textContent = line;
      list.appendChild(li);
    });
    desc.appendChild(list);

    box.appendChild(desc);
    return box;
  }

  function buildArtArticle(art) {
    var article = document.createElement("article");
    article.id = "gallery-" + String(art.id);
    article.className = "from-gallery";
    article.setAttribute("data-generated", "gallery-art");

    var heading = document.createElement("h2");
    heading.className = "major";
    heading.textContent = art.title || "Artwork";
    article.appendChild(heading);

    var slider = buildSlider(art);
    if (slider) article.appendChild(slider);

    if (art.caption) {
      var caption = document.createElement("p");
      caption.className = "mt-2rem art-caption";
      setMultilineText(caption, art.caption);
      article.appendChild(caption);
    }

    var details = createProductDetailsBox(art);
    if (details) article.appendChild(details);

    var actions = document.createElement("ul");
    actions.className = "actions";

    var liBack = document.createElement("li");
    var aBack = document.createElement("a");
    aBack.href = "#work";
    aBack.className = "button";
    aBack.textContent = "Back to Gallery";
    liBack.appendChild(aBack);

    actions.appendChild(liBack);

    var liSold = document.createElement("li");
    var btnSold = document.createElement("button");
    btnSold.type = "button";
    btnSold.className = "button sold-out";
    btnSold.textContent = "Contact for Purchase";
    btnSold.disabled = true;
    btnSold.setAttribute("aria-disabled", "true");
    liSold.appendChild(btnSold);
    actions.appendChild(liSold);
    article.appendChild(actions);

    return article;
  }

  function buildGalleryArtArticles() {
    var mainEl = document.getElementById("main");
    if (!mainEl) return;

    var list = getArtList();
    if (list.length === 0) return;

    removeGeneratedArticles(mainEl);

    var insertBefore = document.getElementById("shop") || document.getElementById("about");

    for (var i = 0; i < list.length; i++) {
      var art = list[i];
      if (!art || !art.id) continue;
      var article = buildArtArticle(art);
      if (insertBefore) mainEl.insertBefore(article, insertBefore);
      else mainEl.appendChild(article);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildGalleryArtArticles);
  } else {
    buildGalleryArtArticles();
  }
})();
