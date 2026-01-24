// assets/js/art_data.js
// Add new artwork by adding ONE object here. Everything else auto-builds.

// Default shop options (edit these anytime).
// Prices are stored in cents to avoid floating point issues (USD).
//
// Structure:
// - finishes[]: shown in the "Finish" dropdown
// - each finish has sizes[]: shown in the "Size" dropdown after finish selection
window.MELKAPOW_PRODUCTS_DEFAULT = {
  finishes: [
    {
      id: "fine-art-paper",
      label: "Fine Art Paper",
      sizes: [
        { id: "5x7", label: '5" x 7"', priceCents: 2500 },
        { id: "8x10", label: '8" x 10"', priceCents: 3500 },
        { id: "11x14", label: '11" x 14"', priceCents: 5000 }
      ]
    },
    {
      id: "stretched-canvas",
      label: "Stretched Canvas",
      sizes: [
        { id: "8x10", label: '8" x 10"', priceCents: 12000 },
        { id: "12x16", label: '12" x 16"', priceCents: 18000 },
        { id: "18x24", label: '18" x 24"', priceCents: 26000 }
      ]
    }
  ]
};

window.MELKAPOW_ART = [
  {
    id: "eye",
    title: "What lives within",
    thumb: "__IMAGE_REMOVED__",
    alt: "Deep within",
    caption: "I see you, do you see me?",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Eye" },
      { src: "__IMAGE_REMOVED__", alt: "Eye detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Eye detail 2" },
      { src: "__IMAGE_REMOVED__", alt: "Eye detail 3" }
    ]
  },
  {
    id: "birthoflife",
    title: "Birth of life",
    thumb: "__IMAGE_REMOVED__",
    alt: "Birth of life",
    caption: "When life meets creation.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Birth of life" },
      { src: "__IMAGE_REMOVED__", alt: "Birth of life detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Birth of life detail 2" },
      { src: "__IMAGE_REMOVED__", alt: "Birth of life detail 3" }
    ]
  },
  {
    id: "home",
    title: "Home",
    thumb: "__IMAGE_REMOVED__",
    alt: "Home",
    caption: "I've been looking for you my whole life.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Home" } //,
      //{ src: "__IMAGE_REMOVED__", alt: "Home detail 1" },
      //{ src: "__IMAGE_REMOVED__", alt: "Home detail 2" },
      //{ src: "__IMAGE_REMOVED__", alt: "Home detail 3" }
    ]
  },
  {
    id: "lostintranslation",
    title: "Lost in Translation",
    thumb: "__IMAGE_REMOVED__",
    alt: "Lost in translation",
    caption: "Trapped in between layers of dimensions.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Lost main" },
      { src: "__IMAGE_REMOVED__", alt: "Lost detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Lost detail 2" },
      // { src: "__IMAGE_REMOVED__", alt: "Lost detail 3" }
    ]
  },
  {
    id: "weaving",
    title: "Interlacing Frequencies",
    galleryTitle: "Interlacing Frequencies",
    thumb: "__IMAGE_REMOVED__",
    alt: "Weaving",
    caption: "Layered creation and expansion.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Weaving" },
      { src: "__IMAGE_REMOVED__", alt: "Weaving detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Weaving detail 2" },
      { src: "__IMAGE_REMOVED__", alt: "Weaving detail 3" }
    ]
  },
  {
    id: "whirlpool",
    title: "Trasmutation Vortex",
    galleryTitle: "Trasmutation Vortex",
    thumb: "__IMAGE_REMOVED__",
    alt: "Whirlpool",
    caption: "Release what consumes you, allow yourself to be rebuilt.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Whirlpool" },
      { src: "__IMAGE_REMOVED__", alt: "Whirlpool detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Whirlpool detail 2" },
      //{ src: "__IMAGE_REMOVED__", alt: "Whirlpool detail 3" }
    ]
  }
];
