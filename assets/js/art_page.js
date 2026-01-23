// assets/js/art_page.js
(function () {
  "use strict";

  console.log("✅ art_page.js loaded", location.href);

  function $(sel) { return document.querySelector(sel); }

  function getArtId() {
    var url = new URL(window.location.href);
    return url.searchParams.get("id");
  }

  function findArt(id) {
    var list = window.MELKAPOW_ART || [];
    return list.find(function (a) { return a.id === id; });
  }

  function setActiveDot(dots, idx) {
    dots.forEach(function (d, i) {
      if (i === idx) d.classList.add("is-active");
      else d.classList.remove("is-active");
    });
  }

  function clampIndex(i, n) {
    if (n <= 0) return 0;
    i = i % n;
    if (i < 0) i += n;
    return i;
  }

  function buildArtPage() {
    console.log("✅ buildArtPage starting");

    var id = getArtId();
    var art = findArt(id);

    var titleEl = document.getElementById("artTitle");
    var capEl = document.getElementById("artCaption");
    var track = document.getElementById("slidesTrack");
    var dotsWrap = document.getElementById("artDots");
    var prevBtn = document.getElementById("btnPrev");
    var nextBtn = document.getElementById("btnNext");

    if (!titleEl || !capEl || !track || !dotsWrap || !prevBtn || !nextBtn) {
      console.error("❌ Missing required elements on page", {
        titleEl: !!titleEl, capEl: !!capEl, track: !!track,
        dotsWrap: !!dotsWrap, prevBtn: !!prevBtn, nextBtn: !!nextBtn
      });
      return;
    }

    if (!art) {
      titleEl.textContent = "NOT FOUND";
      capEl.textContent = "No art found for id=" + id;
      track.innerHTML = "<div style='padding:1rem'>No slides.</div>";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    titleEl.textContent = art.title;
    capEl.textContent = art.caption || "";

    track.innerHTML = "";
    dotsWrap.innerHTML = "";

    art.slides.forEach(function (s) {
      var slide = document.createElement("div");
      slide.className = "slide";

      var img = document.createElement("img");
      img.src = s.src;
      img.alt = s.alt || art.title;
      img.loading = "lazy";
      img.decoding = "async";

      slide.appendChild(img);
      track.appendChild(slide);
    });

    console.log("✅ Slides built:", art.slides.length);

    var n = art.slides.length;
    var idx = 0;

    var dots = [];
    for (var i = 0; i < n; i++) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "art-dot";
      b.setAttribute("aria-label", "Go to slide " + (i + 1));
      (function (target) {
        b.addEventListener("click", function () {
          idx = target;
          render();
        });
      })(i);
      dotsWrap.appendChild(b);
      dots.push(b);
    }

    function render() {
      idx = clampIndex(idx, n);
      track.style.transform = "translateX(" + (-idx * 100) + "%)";
      setActiveDot(dots, idx);
    }

    prevBtn.addEventListener("click", function () {
      idx -= 1;
      render();
    });

    nextBtn.addEventListener("click", function () {
      idx += 1;
      render();
    });

    window.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { idx -= 1; render(); }
      if (e.key === "ArrowRight") { idx += 1; render(); }
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", buildArtPage);
})();
