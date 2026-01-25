// assets/js/art_build.js
(function () {
  "use strict";

  function getArtList() {
    return Array.isArray(window.MELKAPOW_ART) ? window.MELKAPOW_ART : [];
  }

  function formatMoney(cents) {
    var n = parseInt(cents, 10);
    if (!isFinite(n)) n = 0;
    return "$" + (n / 100).toFixed(2);
  }

  function removeGeneratedArticles(mainEl) {
    var existing = mainEl.querySelectorAll('article[data-generated="art"]');
    for (var i = existing.length - 1; i >= 0; i--) {
      existing[i].parentNode.removeChild(existing[i]);
    }
  }

  function normalizeLegacySizeId(optionId) {
    var id = String(optionId || "");
    if (!id) return "";
    return id.replace(/^canvas-/, "").replace(/^print-/, "");
  }

  function mapLegacyOptionsToSizes(options) {
    var list = Array.isArray(options) ? options : [];
    var sizes = [];

    for (var i = 0; i < list.length; i++) {
      var opt = list[i];
      if (!opt || !opt.id) continue;

      var sizeId = normalizeLegacySizeId(opt.id);
      if (!sizeId) continue;

      sizes.push({
        id: sizeId,
        label: opt.label || sizeId,
        priceCents: parseInt(opt.priceCents, 10) || 0
      });
    }

    return sizes;
  }

  function getCatalogForArt(art) {
    var defaults = window.MELKAPOW_PRODUCTS_DEFAULT || {};
    var src = art && art.products ? art.products : defaults;

    var finishesRaw = Array.isArray(src.finishes)
      ? src.finishes
      : (Array.isArray(defaults.finishes) ? defaults.finishes : null);

    // Back-compat: if someone still uses { canvas: [], prints: [] }.
    if (!finishesRaw) {
      var canvas = Array.isArray(src.canvas) ? src.canvas : (Array.isArray(defaults.canvas) ? defaults.canvas : []);
      var prints = Array.isArray(src.prints) ? src.prints : (Array.isArray(defaults.prints) ? defaults.prints : []);

      finishesRaw = [];
      if (prints.length) {
        finishesRaw.push({
          id: "fine-art-paper",
          label: "Fine Art Paper",
          sizes: mapLegacyOptionsToSizes(prints)
        });
      }
      if (canvas.length) {
        finishesRaw.push({
          id: "stretched-canvas",
          label: "Stretched Canvas",
          sizes: mapLegacyOptionsToSizes(canvas)
        });
      }
    }

    var finishes = [];
    for (var i = 0; i < finishesRaw.length; i++) {
      var f = finishesRaw[i] || {};
      if (!f.id) continue;

      var sizesRaw = Array.isArray(f.sizes) ? f.sizes : [];
      var sizes = [];
      for (var j = 0; j < sizesRaw.length; j++) {
        var s = sizesRaw[j] || {};
        if (!s.id) continue;

        sizes.push({
          id: String(s.id),
          label: String(s.label || s.id),
          priceCents: parseInt(s.priceCents, 10) || 0
        });
      }

      if (!sizes.length) continue;

      finishes.push({
        id: String(f.id),
        label: String(f.label || f.id),
        sizes: sizes
      });
    }

    return { finishes: finishes };
  }

  function setPurchaseStatus(statusEl, message) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
  }

  function buildPurchaseBox(art) {
    var catalog = getCatalogForArt(art);
    if (!catalog.finishes.length) return null;

    var box = document.createElement("div");
    box.className = "box purchase-box";

    var heading = document.createElement("h3");
    heading.textContent = "Buy Options";
    box.appendChild(heading);

    var form = document.createElement("form");
    form.className = "purchase-form";
    form.action = "#";
    form.addEventListener("submit", function (e) { e.preventDefault(); });

    var status = document.createElement("p");
    status.className = "purchase-status align-center";
    status.setAttribute("aria-live", "polite");

    var finishById = {};
    for (var i = 0; i < catalog.finishes.length; i++) {
      finishById[catalog.finishes[i].id] = catalog.finishes[i];
    }

    var fields = document.createElement("div");
    fields.className = "fields";

    var fieldFinish = document.createElement("div");
    fieldFinish.className = "field";

    var finishId = "buy-" + String(art.id) + "-finish";
    var finishLabel = document.createElement("label");
    finishLabel.htmlFor = finishId;
    finishLabel.textContent = "Finish";

    var finishSelect = document.createElement("select");
    finishSelect.id = finishId;
    finishSelect.name = "finish";
    finishSelect.className = "purchase-select purchase-select-finish";

    var finishPlaceholder = document.createElement("option");
    finishPlaceholder.value = "";
    finishPlaceholder.textContent = "Select a finish…";
    finishSelect.appendChild(finishPlaceholder);

    for (var f = 0; f < catalog.finishes.length; f++) {
      var finish = catalog.finishes[f];
      var opt = document.createElement("option");
      opt.value = finish.id;
      opt.textContent = finish.label;
      finishSelect.appendChild(opt);
    }

    fieldFinish.appendChild(finishLabel);
    fieldFinish.appendChild(finishSelect);

    var fieldSize = document.createElement("div");
    fieldSize.className = "field";

    var sizeId = "buy-" + String(art.id) + "-size";
    var sizeLabel = document.createElement("label");
    sizeLabel.htmlFor = sizeId;
    sizeLabel.textContent = "Size";

    var sizeSelect = document.createElement("select");
    sizeSelect.id = sizeId;
    sizeSelect.name = "size";
    sizeSelect.disabled = true;
    sizeSelect.className = "purchase-select purchase-select-size";

    fieldSize.appendChild(sizeLabel);
    fieldSize.appendChild(sizeSelect);

    var currentFinish = null;
    var sizeById = {};

    function setSizeOptions(finishObj) {
      currentFinish = finishObj || null;
      sizeById = {};

      sizeSelect.innerHTML = "";

      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = finishObj ? "Select a size…" : "Select a finish first…";
      sizeSelect.appendChild(placeholder);

      if (!finishObj) {
        sizeSelect.disabled = true;
        return;
      }

      sizeSelect.disabled = false;

      for (var s = 0; s < finishObj.sizes.length; s++) {
        var size = finishObj.sizes[s];
        sizeById[size.id] = size;

        var o = document.createElement("option");
        o.value = size.id;
        o.textContent = size.label + " — " + formatMoney(size.priceCents);
        sizeSelect.appendChild(o);
      }
    }

    setSizeOptions(null);

    finishSelect.addEventListener("change", function () {
      setPurchaseStatus(status, "");
      var selected = finishSelect.value || "";
      setSizeOptions(selected ? finishById[selected] : null);
    });

    var fieldQty = document.createElement("div");
    fieldQty.className = "field";

    var qtyId = "buy-" + String(art.id) + "-qty";
    var qtyLabel = document.createElement("label");
    qtyLabel.htmlFor = qtyId;
    qtyLabel.textContent = "Quantity";

    var qty = document.createElement("input");
    qty.type = "number";
    qty.min = "1";
    qty.max = "99";
    qty.value = "1";
    qty.id = qtyId;
    qty.name = "qty";
    qty.className = "purchase-qty";

    fieldQty.appendChild(qtyLabel);
    fieldQty.appendChild(qty);

    fields.appendChild(fieldFinish);
    fields.appendChild(fieldSize);
    fields.appendChild(fieldQty);
    form.appendChild(fields);

    var actions = document.createElement("ul");
    actions.className = "actions";

    var liAdd = document.createElement("li");
    var btnAdd = document.createElement("button");
    btnAdd.type = "button";
    btnAdd.className = "button primary";
    btnAdd.textContent = "Add to Cart";
    liAdd.appendChild(btnAdd);
    actions.appendChild(liAdd);

    form.appendChild(actions);

    btnAdd.addEventListener("click", function () {
      setPurchaseStatus(status, "");

      if (!currentFinish) {
        setPurchaseStatus(status, "Please select a finish.");
        return;
      }

      var selectedSizeId = sizeSelect.value || "";
      if (!selectedSizeId) {
        setPurchaseStatus(status, "Please select a size.");
        return;
      }

      var chosenSize = sizeById[selectedSizeId];
      if (!chosenSize) {
        setPurchaseStatus(status, "That size isn't available right now.");
        return;
      }

      if (!window.MELKAPOW_CART || typeof window.MELKAPOW_CART.add !== "function") {
        setPurchaseStatus(status, "Cart isn't available on this page.");
        return;
      }

      var qtyVal = parseInt(qty.value, 10);
      if (!isFinite(qtyVal) || qtyVal < 1) qtyVal = 1;
      if (qtyVal > 99) qtyVal = 99;

      var optionId = currentFinish.id + "::" + chosenSize.id;
      var optionLabel = currentFinish.label + " — " + chosenSize.label;

      window.MELKAPOW_CART.add({
        artId: art.id,
        title: art.title,
        thumb: art.thumb,
        optionId: optionId,
        optionLabel: optionLabel,
        finishId: currentFinish.id,
        finishLabel: currentFinish.label,
        sizeId: chosenSize.id,
        sizeLabel: chosenSize.label,
        priceCents: chosenSize.priceCents,
        qty: qtyVal
      });

      setPurchaseStatus(status, "Added to cart.");

      // Reset controls back to defaults for the next add.
      finishSelect.value = "";
      qty.value = "1";
      setSizeOptions(null);
    });

    box.appendChild(form);

    box.appendChild(status);
    return box;
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
      caption.className = "mt-2rem art-caption";
      caption.textContent = art.caption;
      article.appendChild(caption);
    }

    var purchase = buildPurchaseBox(art);
    if (purchase) article.appendChild(purchase);

    var actions = document.createElement("ul");
    actions.className = "actions";

    var liCart = document.createElement("li");
    var aCart = document.createElement("a");
    aCart.href = "#cart";
    aCart.className = "button primary";
    aCart.textContent = "View Cart";
    liCart.appendChild(aCart);

    var liBack = document.createElement("li");
    var aBack = document.createElement("a");
    aBack.href = "#work";
    aBack.className = "button";
    aBack.textContent = "Back to Gallery";
    liBack.appendChild(aBack);

    actions.appendChild(liBack);
    actions.appendChild(liCart);
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
