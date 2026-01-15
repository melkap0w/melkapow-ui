// assets/js/gallery-close.js
(function () {
  window.addEventListener('load', function () {
    var main = document.querySelector('#main');
    if (!main) return;

    // Use capture so this runs before Dimension's own close handlers
    main.addEventListener(
      'click',
      function (e) {
        var close = e.target.closest('.close');
        if (!close) return;

        var article = close.closest('article');
        if (!article) return;

        // Only hijack X behavior for gallery detail pages
        if (article.classList.contains('from-gallery')) {
          e.preventDefault();
          e.stopPropagation();
          // Go back to the Work/Gallery page
          location.hash = '#work';
        }
      },
      true // capture phase
    );
  });
})();
