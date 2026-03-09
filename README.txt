# Melkapow Portfolio
 HTML, CSS, Python and JavaScript. 

---

## 🚀 Tech Stack

### **Frontend (CloudFlare pages)**
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


### High-level architecture diagram
```text
Browser (Static site: example.com / preview)
  |
  |  (catalog, estimate, checkout, receipt)
  v
FastAPI (api-dev / api)
  |\
  | \--> Stripe API (create checkout session)
  |      |
  |      +--> Stripe Checkout (redirect)
  |      |
  |      +--> Stripe webhook --> POST /api/stripe/webhook (signed)
  |
  \--> Printful API (catalog, estimate-costs, shipping/rates, create order)
         |
         +--> Printful webhook --> POST /api/printful/webhook (token + optional signature)
