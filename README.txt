# Melkapow Portfolio

A responsive, single-page portfolio website showcasing artwork, an about section, and an integrated contact form with  spam protection.  
Built using static HTML, CSS, and lightweight JavaScript. An optional FastAPI backend in `app/` powers the contact form and Printful-powered shop options.

---

## 🚀 Tech Stack

### **Frontend (Github Pages)**
- **HTML5** — structural layout, semantic sections
- **CSS3** — full custom stylesheet (`assets/css/main.css`)
- **JavaScript (vanilla + utilities)**  
  - `jquery.min.js`  
  - `browser.min.js`  
  - `breakpoints.min.js`  
  - `util.js`  
  - `main.js`  
Used for article transitions, animations, and responsive behavior.

### **Backend (Render)** (contact form, Stripe, Printful webhooks later, etc.)
- **FastAPI** — lives in `app/` (see `app/README.md` for setup)
  - `POST /api/contact` (email + Turnstile)
  - `GET /api/shop/catalog` (Printful product options)

### **Icons**
- **Font Awesome 6.5.0 (CDN)**  
  Social and brand icons used in header/footer navigation.

```html
<link rel="stylesheet"
 href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
