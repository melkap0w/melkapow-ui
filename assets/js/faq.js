(() => {
  const TO_TOP_SHOW_AFTER_PX = 220;
  const TO_TOP_ARTICLE_IDS = new Set(["faq", "shipping", "terms"]);

  function getFaqArticle() {
    return document.getElementById("faq");
  }

  function getToTopFab() {
    return document.getElementById("toTopFab");
  }

  function getActiveArticleId() {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#")) return "";
    return hash.slice(1);
  }

  function getActiveArticle() {
    const id = getActiveArticleId();
    if (!id) return null;
    return document.getElementById(id);
  }

  function resetFaqScroll(behavior = "auto") {
    const article = getFaqArticle();
    if (!article) return;
    article.scrollTo({ top: 0, behavior });
  }

  function isElementScrollableY(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll") return false;
    return element.scrollHeight > element.clientHeight + 1;
  }

  function updateToTopFabVisibility() {
    const fab = getToTopFab();
    if (!fab) return;

    const activeId = getActiveArticleId();
    const article = getActiveArticle();
    if (!TO_TOP_ARTICLE_IDS.has(activeId) || !article) {
      fab.hidden = true;
      return;
    }

    const scrollTop = isElementScrollableY(article) ? article.scrollTop : window.scrollY;
    fab.hidden = scrollTop <= TO_TOP_SHOW_AFTER_PX;
  }

  function scrollFaqTo(targetId) {
    const article = getFaqArticle();
    const target = document.getElementById(targetId);
    if (!article || !target) return;

    // Prefer scrolling within the FAQ article when it has its own scroll.
    if (article.scrollHeight > article.clientHeight) {
      const articleRect = article.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const top = Math.max(0, targetRect.top - articleRect.top + article.scrollTop - 16);
      article.scrollTo({ top, behavior: "smooth" });
      return;
    }

    // Fallback: let the browser pick the closest scroll container.
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollActiveToTop(behavior = "smooth") {
    const activeId = getActiveArticleId();
    const article = getActiveArticle();
    if (!article || !TO_TOP_ARTICLE_IDS.has(activeId)) return;

    if (isElementScrollableY(article)) {
      article.scrollTo({ top: 0, behavior });
      return;
    }

    window.scrollTo({ top: 0, behavior });
  }

  document.addEventListener(
    "click",
    (event) => {
      const clickTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!clickTarget) return;

      const toTopButton = clickTarget.closest("#toTopFab");
      if (toTopButton) {
        event.preventDefault();
        event.stopPropagation();
        scrollActiveToTop("smooth");
        updateToTopFabVisibility();
        return;
      }

      const link = clickTarget.closest("a[data-faq-target]");
      if (!link) return;

      const targetId = link.getAttribute("data-faq-target");
      if (!targetId) return;

      event.preventDefault();
      scrollFaqTo(targetId);
    },
    { capture: true }
  );

  window.addEventListener("scroll", updateToTopFabVisibility, { passive: true });

  for (const id of TO_TOP_ARTICLE_IDS) {
    const article = document.getElementById(id);
    if (!article) continue;
    article.addEventListener("scroll", updateToTopFabVisibility, { passive: true });
  }

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#faq") resetFaqScroll("auto");
    updateToTopFabVisibility();
  });

  if (window.location.hash === "#faq") resetFaqScroll("auto");
  updateToTopFabVisibility();
})();
