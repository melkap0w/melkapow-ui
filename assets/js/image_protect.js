(() => {
  function isImageTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("img"));
  }

  function disableImageDragAndDrop() {
    document.querySelectorAll("img").forEach((img) => {
      img.setAttribute("draggable", "false");
    });
  }

  // Best-effort deterrents only:
  // - This does NOT prevent saving/screen-capture or scraping by non-compliant bots.
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!isImageTarget(event.target)) return;
      event.preventDefault();
    },
    { capture: true }
  );

  document.addEventListener(
    "dragstart",
    (event) => {
      if (!isImageTarget(event.target)) return;
      event.preventDefault();
    },
    { capture: true }
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", disableImageDragAndDrop);
  } else {
    disableImageDragAndDrop();
  }
})();
