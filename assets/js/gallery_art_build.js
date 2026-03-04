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
		    var specs = [
		      { label: "Media", value: "Acrylic" },
		      { label: "Dimensions", value: dims },
		   //   { label: "Canvas Depth", value: "1.5\u2033 (3.81 cm)" },
		      { label: "Material", value: "Gallery Canvas & Wood" },
		      { label: "Content", value: "100% Cotton Duck" },
		      { label: "Component", value: "Kiln dried stretcher" },
		      { label: "Net Weight", value: "12 Ounces (343g) Primed & 6 Ounces (172g) Un-Primed" }
		    ];

    var box = document.createElement("div");
    box.className = "box purchase-box";

    var desc = document.createElement("div");
    desc.className = "purchase-description";

    var heading = document.createElement("h4");
	    heading.textContent = collectionLabel;
	    desc.appendChild(heading);

	    var dl = document.createElement("dl");
	    dl.className = "purchase-specs";
	    specs.forEach(function (row) {
      if (!row || !row.label || !row.value) return;
      var dt = document.createElement("dt");
      dt.textContent = String(row.label);
      var dd = document.createElement("dd");
      dd.textContent = String(row.value);
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    desc.appendChild(dl);

    box.appendChild(desc);
    return box;
  }

  function populateArtArticle(article, art) {
    if (!article || !art) return;
    if (article.getAttribute("data-rendered") === "true") return;

    var closeEl = null;
    var children = article.children;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child && child.classList && child.classList.contains("close")) {
        closeEl = child;
        break;
      }
    }
    if (closeEl && closeEl.parentNode) closeEl.parentNode.removeChild(closeEl);

    article.textContent = "";
    article.className = "from-gallery";
    article.setAttribute("data-generated", "gallery-art");
    article.setAttribute("data-rendered", "true");

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
    liSold.className = "purchase-unavailable-action";
    liSold.hidden = true;
    var btnSold = document.createElement("button");
    btnSold.type = "button";
    btnSold.className = "button sold-out";
    btnSold.textContent = "Unavailable";
    btnSold.disabled = true;
    btnSold.setAttribute("aria-disabled", "true");
    liSold.appendChild(btnSold);
    actions.appendChild(liSold);
    article.appendChild(actions);

    if (closeEl) article.appendChild(closeEl);
  }

  function findArtById(id) {
    var list = getArtList();
    var needle = String(id || "");
    if (!needle) return null;

    for (var i = 0; i < list.length; i++) {
      var art = list[i];
      if (!art || !art.id) continue;
      if (String(art.id) === needle) return art;
    }

    return null;
  }

  function ensurePlaceholders() {
    var mainEl = document.getElementById("main");
    if (!mainEl) return;

    var list = getArtList();
    if (list.length === 0) return;

    removeGeneratedArticles(mainEl);

    var insertBefore = document.getElementById("shop") || document.getElementById("about");

    for (var i = 0; i < list.length; i++) {
      var art = list[i];
      if (!art || !art.id) continue;

      var article = document.createElement("article");
      article.id = "gallery-" + String(art.id);
      article.className = "from-gallery";
      article.setAttribute("data-generated", "gallery-art");
      article.setAttribute("data-rendered", "false");

      var heading = document.createElement("h2");
      heading.className = "major";
      heading.textContent = art.title || "Artwork";
      article.appendChild(heading);

      var note = document.createElement("p");
      note.className = "align-center";
      note.textContent = "Loading…";
      article.appendChild(note);

      if (insertBefore) mainEl.insertBefore(article, insertBefore);
      else mainEl.appendChild(article);
    }
  }

  function ensureRenderedForHash(hash) {
    var h = String(hash || "");
    if (!h.startsWith("#gallery-")) return;

    var id = h.slice("#gallery-".length);
    if (!id) return;

    var art = findArtById(id);
    if (!art) return;

    var article = document.getElementById("gallery-" + String(id));
    if (!article) return;
    populateArtArticle(article, art);
  }

  function handleHashChange() {
    ensureRenderedForHash(window.location.hash || "");
  }

  function init() {
    ensurePlaceholders();
    ensureRenderedForHash(window.location.hash || "");
    window.addEventListener("hashchange", handleHashChange, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
