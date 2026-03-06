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
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Deep within",
    caption: "I see you, do you see me?",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Eye" },
      { src: "__IMAGE_REMOVED__", alt: "Eye detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Eye detail 2" }
    //  { src: "__IMAGE_REMOVED__", alt: "Eye detail 3" }
    ]
  },
  {
    id: "birthoflife",
    title: "Birth of life",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Birth of life",
    caption: "Where source converges with creation.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Birth of life" },
      { src: "__IMAGE_REMOVED__", alt: "Birth of life detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Birth of life detail 2" },
     // { src: "__IMAGE_REMOVED__", alt: "Birth of life detail 3" }
    ]
  },
  {
    id: "home",
    title: "Home",
    productInfo: { collection: "grandeur", dimensions: '24" H x 36" W x 1.5" D' },
    thumb: "__IMAGE_REMOVED__",
    alt: "Home",
    caption: "What would you create if you could not speak.", // I've been looking for you my whole life.
    slides: [ 
      { src: "__IMAGE_REMOVED__", alt: "Home" },
      { src: "__IMAGE_REMOVED__", alt: "Home detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Home detail 2" },
      //{ src: "__IMAGE_REMOVED__", alt: "Home detail 3" }
    ]
  },
  {
    id: "lostintranslation",
    title: "Lost in Translation",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Lost in translation",
    caption: "Trapped in between fractured realities",
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
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Weaving",
    caption: "Creation weaves into living form.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Weaving" },
      { src: "__IMAGE_REMOVED__", alt: "Weaving detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Weaving detail 2" },
      { src: "__IMAGE_REMOVED__", alt: "Weaving detail 3" }
    ]
  },
  {
    id: "whirlpool",
    title: "Transmutation",
    galleryTitle: "Transmutation",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Whirlpool",
    caption: "Release what consumes you, allow yourself to be rebuilt.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Whirlpool" },
      { src: "__IMAGE_REMOVED__", alt: "Whirlpool detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Whirlpool detail 2" },
      //{ src: "__IMAGE_REMOVED__", alt: "Whirlpool detail 3" }
    ]
  },
  {
    id: "purge",
    title: "Purge",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Purge",
    caption: "The one who haunts, I see you.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Purge" }
    ]
  },
  {
    id: "strip_raw",
    title: "Stripped Raw",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Strip Raw",
    caption: "Stripped Raw of everything you ever were.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Strip Raw" }
    ]
  },
  {
    id: "war_within",
    title: "The war within",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "War within",
    caption: "What hides in color.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "War within" },
      { src: "__IMAGE_REMOVED__", alt: "War within detail 1" },     
       { src: "__IMAGE_REMOVED__", alt: "War within detail 2" }
    ]
  },
  {
    id: "giver",
    title: "Giver",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Giver",
    caption: "Can you receive what is given.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Giver" },
      { src: "__IMAGE_REMOVED__", alt: "Giver detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Giver detail 2" }
    ]
  },  
  {
    id: "kundalini",
    title: "Kundalini",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Kundalini",
    caption: "What forms beneath breathes life.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Kundalini" },
      { src: "__IMAGE_REMOVED__", alt: "Kundalini detail 1" }
    ]
  },
  {
    id: "mother",
    title: "Mother",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Mother",
    caption: "Tear into the womb of creation.",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Mother" },
      { src: "__IMAGE_REMOVED__", alt: "Mother detail 1" }
    ]
  },
  {
    id: "nowayout",
    title: "No Way Out",
    productInfo: { collection: "grandeur" },
    // Use the full-res work image as the thumb source so the UI can fall back
    // gracefully even if a dedicated thumbnail hasn't been generated yet.
    thumb: "__IMAGE_REMOVED__",
    alt: "No Way Out",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "No Way Out" },
      { src: "__IMAGE_REMOVED__", alt: "No Way Out detail 1" }
    ]
  },
  {
    id: "transition",
    title: "Transition",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "Transition",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "Transition" },
      { src: "__IMAGE_REMOVED__", alt: "Transition detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "Transition detail 2" }
    ]
  },
  {
    id: "whatbecomes",
    title: "What Becomes",
    productInfo: { collection: "grandeur" },
    thumb: "__IMAGE_REMOVED__",
    alt: "What Becomes",
    slides: [
      { src: "__IMAGE_REMOVED__", alt: "What Becomes" },
      { src: "__IMAGE_REMOVED__", alt: "What Becomes detail 1" },
      { src: "__IMAGE_REMOVED__", alt: "What Becomes detail 2" }
    ]
  }
];
