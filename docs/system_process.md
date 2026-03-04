# Melkapow System Process (Frontend + FastAPI + Stripe + Printful + Firestore)

This document is the “source of truth” for how orders move through the Melkapow system end-to-end: architecture, identifiers, API contracts, Firestore model, webhook/event flows, and ops/debugging.

Related docs (deep dives / how-to):

- `app/ORDER_EVENT_SYSTEM.md` (detailed order snapshot + events + outbox/dedupe + webhook inbox)
- `docs/purchase_test_plan.md` (manual + automated test plan; E2E tiers)
- `app/.env.example` (all configuration flags; safe defaults for dev)

---

## 1) System overview

### What the product is

Melkapow is:

- **Static frontend**: `index.html`, `art.html`, `assets/*` (served via Pages)
- **FastAPI backend**: `app/src/app/main.py` (deployed; also runnable locally)
- **Firestore**: server-side persistence for order snapshots/events/outbox (no client access)
- **3rd parties**:
  - **Stripe**: Checkout + signed webhooks (payment confirmation is canonical)
  - **Printful**: catalog + shipping estimates + fulfillment + webhooks
  - **Email provider**: SMTP (default) or Resend HTTPS

### Environments (DEV vs PROD)

**Frontend**

- PROD: `example.com` (see `CNAME`)
- DEV/preview origins may include Pages/GitHub URLs (also allowed via `ALLOWED_ORIGINS`)

**Backend**

- DEV: `http://localhost:8000`
- PROD: `http://localhost:8000`

**Config differences that matter**

- Stripe keys:
  - DEV typically uses **Stripe test keys**
  - PROD uses **Stripe live keys**
  - `STRIPE_WEBHOOK_SECRET` must be set in the environment for Stripe webhooks to be considered “configured” (`GET /api/health`)
- Printful writes:
  - Printful **mutating calls** are gated by `PRINTFUL_WRITE_ENABLED`
  - If `PRINTFUL_WRITE_ENABLED` is *unset*, the backend defaults to:
    - DEV: write disabled
    - PROD: write enabled
  - You can still run read-only catalog/estimates without enabling writes.
- Safety knobs (recommended in DEV):
  - `EMAIL_OVERRIDE_TO` to redirect all outbound mail to a safe inbox
  - `PRINTFUL_SUBMIT_CONFIRM=false` to create **draft** Printful orders (not submitted to fulfillment)
  - `ALERT_EMAIL_ENABLED=false` until you want alert spam during testing

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

FastAPI <-> Firestore
  - Order snapshot (query-friendly)
  - Events (append-only)
  - notification_dedupe outbox (exactly-once emails)
  - printful_webhook_inbox + orphan storage (replay/debug)

FastAPI --> Email provider (SMTP or Resend)
  - Receipt/invoice (Stripe webhook)
  - Shipment/delivered (Printful webhook milestones)
  - Alerts (optional)
```

### Frontend → Backend → Webhooks → Firestore → Ops

Important system invariants:

- **The thank-you page is never a source-of-truth trigger.**
  - Orders + receipt emails are **webhook-driven** (`POST /api/stripe/webhook`).
- **Printful webhooks must not create orders.**
  - If a Printful event arrives before Stripe confirms payment, it is stored as an orphan for later reconciliation.
- **Emails must be exactly-once.**
  - Firestore `notification_dedupe/…` is the source of truth for “was email X already sent?”

### Caching / deploy gotchas (static assets)

This repo ships an `_headers` file that caches `/assets/*` as long-lived immutable content. That means:

- If you change any `assets/*` file, you must **bump the `?v=` query string** in the HTML that references it, otherwise users may keep old cached JS/CSS.

### Frontend API base resolution (how the browser finds the backend)

The frontend uses `window.MELKAPOW_API_BASE` as the canonical API base URL.

- Local dev:
  - `localhost`/`127.0.0.1` uses `http://127.0.0.1:8000`
  - private IPs (phone testing on Wi‑Fi) use `http(s)://<your-ip>:8000`
- Hosted:
  - `index.html` loads `assets/js/runtime-config.js` and then sets `window.MELKAPOW_API_BASE` from:
    - `window.MELKAPOW_RUNTIME_CONFIG.MELKAPOW_API_BASE` (or `API_BASE_URL`)
    - or an already-injected `window.MELKAPOW_API_BASE`
  - If nothing is injected, the site intentionally leaves it empty so the shop/contact show “unavailable” states instead of accidentally posting to the wrong environment.

---

## 2) Core entities + IDs (primary keys everywhere)

### Orders (Stripe ↔ Printful ↔ Firestore)

These identifiers exist in different systems:

- **Stripe Checkout Session ID**: `cs_test_...` / `cs_live_...` (frontend redirect + webhook payload)
- **Stripe Payment Intent ID**: `pi_...` (charge/refund/dispute correlation; stored on snapshot)
- **Stripe Event ID**: `evt_...` (used for webhook/event dedupe)
- **Internal order number** (Melkapow): `MKP-XXXXXXXXXX`
  - Deterministic and derived from the Stripe session id (and optionally `cart_digest`)
  - This must remain stable: it is used as the join key across systems
- **Printful Order ID**: numeric string/id returned by Printful order create and present in Printful webhooks
- **Printful `external_id`** (for Printful *orders*): set to the internal order number (the join key)

### Customers

- **Email** (primary customer identifier)
  - Preferred: shipping-step email saved to Stripe metadata (`ship_email`) so it matches what the customer typed on the site
  - Fallbacks: Stripe `customer_email` / `customer_details.email` / Firestore lookup
- **Name / address / phone**: stored on the Firestore snapshot under `shippingAddress` (server-side only)

### Correlation / mapping rules (how we join everything)

The system join key is the internal order number:

- `orderNumber` (internal): derived by `_stripe_order_number(session_id, cart_digest)` → `MKP-...`
- Printful order create: `external_id = orderNumber`
- Firestore:
  - Snapshot contains `orderNumber` and `orderId` (internal)
  - Snapshot document id is a safe slug of the internal id (do not assume doc id == orderNumber)

### Printful product mapping (catalog → art)

Printful store products are mapped to frontend “art ids”:

- Preferred: Printful product `external_id = "{artId}::{finishId}"`
- Fallback: parse the product name into `{artId, finishId}` heuristically

### Idempotency primitives

- `cart_digest`: deterministic hash of cart + shipping selection + discount → used for Stripe Checkout idempotency.
- `payload_hash` (sha256): used for dedupe and inbox storage (webhooks/outbox).
- `dedupeKey`: deterministic key for exactly-once email outbox entries (per order + milestone).

---

## 3) API surface area (FastAPI endpoints)

### Conventions

- Success responses are JSON with `"ok": true` (and other fields).
- Errors use FastAPI’s `HTTPException` → JSON `{ "detail": "..." }` with a non-2xx status.
- Many endpoints are rate-limited via server-side IP-based rate limiting.

### Auth types

- **Public**: no auth (CORS restricted)
- **Admin**: `ADMIN_API_TOKEN`
  - Accepted via `Authorization: Bearer <token>` or `X-Admin-Token: <token>` or `?admin_token=<token>`
- **Stripe webhook**: verified by `Stripe-Signature` header + `STRIPE_WEBHOOK_SECRET`
- **Printful webhook**:
  - Required: `PRINTFUL_WEBHOOK_SK` via query `?token=...` or `Authorization: Bearer ...` or `X-Printful-Webhook-Token: ...`
  - Optional: HMAC signature verification when enabled (`PRINTFUL_WEBHOOK_SIGNING_SECRET`)

---

### Health / meta

#### `GET /`

- Auth: public
- Response:
  ```json
  { "ok": true, "service": "melkapow-api", "ts": "2026-03-04T01:23:45Z" }
  ```
- Side effects: none
- Errors: none expected
- Idempotency: idempotent

#### `GET /api/health`

- Auth: public
- Response (shape):
  ```json
  {
    "ok": true,
    "ts": "...",
    "envName": "DEV",
    "gitSha": null,
    "configVersion": "2026-02-22-printful-v2",
    "printful": { "enabled": true, "writeEnabled": false, "submitConfirm": true },
    "stripe": { "enabled": true, "webhookConfigured": true, "receiptEmailEnabled": true },
    "email": { "provider": "smtp", "overrideEnabled": false, "alertsEnabled": false },
    "firestore": { "enabled": true, "collection": "printful_webhooks", "clientReady": true }
  }
  ```
- Side effects:
  - Triggers one-time lazy initialization of Firestore client so readiness is explicit
- Errors:
  - Should still return `ok:true` even if providers are down; provider state is reflected in fields
- Idempotency: idempotent

#### `POST /api/client/failure`

- Auth: public
- Request:
  ```json
  {
    "kind": "slow-load",
    "message": "Home page took 9s",
    "page": "https://example.com/",
    "stack": "…",
    "user_agent": "Mozilla/5.0 …",
    "extra": { "timingMs": "9000" }
  }
  ```
- Response: `{ "ok": true }`
- Side effects:
  - Sends an **alert email** (deduped) if alerts are enabled
- Errors:
  - `429` when rate-limited
- Idempotency:
  - Alert email is deduped by a hash of `(kind, message, page)` (slow-load is deduped by page)

---

### Contact

#### `POST /api/contact`

- Auth: public (+ optional Turnstile verification)
- Request:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "message": "Hello!",
    "turnstile_token": "…",
    "website": ""
  }
  ```
- Response: `{ "ok": true }`
- Side effects:
  - Sends an email to `CONTACT_TO`
- Errors:
  - `400` invalid submission / captcha required / captcha failed
  - `429` rate-limited
  - `502` email provider failure
  - `503` email not configured
- Idempotency:
  - No dedupe; treat as “send once per user submit”

---

### Catalog / shop read-only

#### `GET /api/shop/status?refresh=false`

- Auth: public
- Response (shape):
  ```json
  {
    "ok": true,
    "provider": "printful",
    "enabled": true,
    "storeIdConfigured": true,
    "catalog": { "stale": false, "lastOkTs": 1234567890 },
    "token": { "ok": true, "hasOrdersRead": true },
    "lastRequest": { "ok": true, "statusCode": 200, "ts": 1234567890 }
  }
  ```
- Side effects:
  - With `refresh=true`, forces a Printful scope/token check and returns extra diagnostics
- Errors:
  - `429` rate-limited
- Idempotency: idempotent

#### `GET /api/shop/checkout/countries?refresh=false`

- Auth: public
- Response (shape):
  ```json
  {
    "ok": true,
    "provider": "printful+stripe",
    "countries": [{ "code": "US", "name": "United States" }],
    "allowedCodes": ["US"],
    "source": "printful|stripe|static",
    "warning": null,
    "printful": { "stale": false, "error": null },
    "ts": "..."
  }
  ```
- Side effects:
  - With `refresh=true`, may force Printful policy fetch
- Errors:
  - `429` rate-limited
- Idempotency: idempotent

#### `GET /api/shop/catalog`

- Auth: public
- Response (shape):
  ```json
  { "ok": true, "provider": "printful", "products": { "artId": { "finishes": [] } }, "stale": false, "ts": "..." }
  ```
- Side effects:
  - Reads from Printful and/or cached catalog; no writes
- Errors:
  - `503` “Shop temporarily unavailable.” (includes `Retry-After: 15` in some cases)
- Idempotency: idempotent

---

### Discounts

#### `POST /api/shop/discount/preview`

- Auth: public
- Request:
  ```json
  { "discount_code": "MELKA20", "subtotal_cents": 12300 }
  ```
- Response:
  ```json
  {
    "ok": true,
    "currency": "USD",
    "subtotalCents": 12300,
    "discountCents": 2460,
    "discountCode": "MELKA20",
    "discountPercentOff": 20,
    "totalCents": 9840,
    "ts": "..."
  }
  ```
- Side effects: none
- Errors:
  - `400` invalid discount code
- Idempotency: idempotent

---

### Address validation + shipping/tax estimates

#### `POST /api/shop/address/validate`

- Auth: public
- Request:
  ```json
  {
    "country_code": "US",
    "state_code": "CA",
    "zip": "94107",
    "address1": "1 Main St",
    "address2": "",
    "city": "San Francisco"
  }
  ```
- Response (Stripe Tax enabled and configured):
  ```json
  {
    "ok": true,
    "provider": "stripe_tax",
    "enabled": true,
    "valid": true,
    "message": "Address looks valid.",
    "calculationId": "txcalc_...",
    "normalized": { "country_code": "US", "state_code": "CA", "zip": "94107", "city": "San Francisco", "address1": "1 Main St" }
  }
  ```
- Side effects:
  - Calls Stripe Tax Calculations API as a validation probe (best-effort)
- Errors:
  - `400` missing/invalid postal code / state for US
  - Returns `ok:true` with `enabled:false` when Stripe tax validation is not configured
- Idempotency: idempotent

#### `POST /api/shop/estimate`

- Auth: public
- Request:
  ```json
  {
    "country_code": "US",
    "state_code": "CA",
    "zip": "94107",
    "address1": "1 Main St",
    "address2": "",
    "city": "San Francisco",
    "discount_code": "MELKA20",
    "shipping_method_id": "STANDARD",
    "items": [{ "printful_sync_variant_id": 12345, "quantity": 1 }]
  }
  ```
- Response (shape):
  ```json
  {
    "ok": true,
    "provider": "printful",
    "currency": "USD",
    "subtotalCents": 10000,
    "shippingCents": 1200,
    "taxCents": 900,
    "taxProvider": "stripe",
    "stripeTaxCalculationId": "txcalc_...",
    "discountCents": 2000,
    "discountCode": "MELKA20",
    "discountPercentOff": 20,
    "totalCents": 10100,
    "shippingOptions": [],
    "selectedShippingMethodId": "STANDARD",
    "selectedShippingMethodName": "Standard",
    "ts": "..."
  }
  ```
- Side effects:
  - Calls Printful estimate endpoints (`/orders/estimate-costs`, optionally `/shipping/rates`)
  - Optionally calls Stripe Tax Calculations API (if enabled/configured) to compute taxes
- Errors:
  - `400` invalid input / discount code / items missing variant ids
  - `403` when Printful token is missing `orders/read` scope (estimates disabled)
  - `503` provider temporarily unavailable (Printful/Stripe tax)
- Idempotency: idempotent (read-only calls)

---

### Checkout + receipt rendering

#### `POST /api/shop/checkout`

- Auth: public
- Request:
  ```json
  {
    "items": [{ "printful_sync_variant_id": 12345, "quantity": 1, "art_id": "mother", "title": "Mother" }],
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "address1": "1 Main St",
    "address2": "",
    "city": "San Francisco",
    "country_code": "US",
    "state_code": "CA",
    "zip": "94107",
    "discount_code": "MELKA20",
    "shipping_method_id": "STANDARD",
    "shipping_method_name": "Standard"
  }
  ```
- Response:
  ```json
  { "ok": true, "provider": "stripe", "id": "cs_test_...", "url": "https://checkout.stripe.com/..." }
  ```
- Side effects:
  - Calls Printful catalog to validate pricing (server does not trust client prices)
  - Calls Printful estimate endpoints to align Stripe shipping totals with the shipping step
  - Calls Stripe to create a Checkout session (idempotent via Stripe idempotency key)
  - Best-effort logs a `stripe.checkout.session.created` event to Firestore for debugging/email fallback
- Errors:
  - `503` when `STRIPE_SK` missing (payments disabled)
  - `400` invalid address/email/shipping method, mixed currencies, invalid discount code
  - `503` when Stripe/Printful temporarily unavailable
- Idempotency:
  - Stripe session creation uses a deterministic idempotency key derived from the request parameters (`cart_digest`), so retries should return the same session when inputs are identical.

#### `GET /api/shop/checkout/session?session_id=cs_...`

- Auth: public
- Purpose: fetch a **sanitized** receipt/invoice summary for the thank-you page.
- Response: a receipt-like JSON document (includes `orderNumber`, totals, line items, shipping)
- Side effects:
  - Calls Stripe to fetch the Checkout session (and optionally line items + PaymentIntent)
  - If Stripe shipping details are missing, best-effort fills shipping from Firestore snapshot
  - Uses an in-memory receipt cache (TTL: `CHECKOUT_RECEIPT_CACHE_TTL_SECONDS`)
- Errors:
  - `400` invalid session id
  - `404` session not owned by this app (`metadata.source != "melkapow"`)
  - `503` Stripe temporarily unavailable
- Idempotency: idempotent

#### `POST /api/shop/checkout/session/email`

- Auth:
  - Public calls are accepted but *do not send* customer email (hard rule)
  - Admin-only when `force=true`
- Request:
  ```json
  { "session_id": "cs_test_...", "force": true }
  ```
- Response:
  - If not forced: `{ "ok": true, "skipped": true, "reason": "stripe_webhook" }`
  - If forced: `{ "ok": true, "emailed": true, "email": "jane@example.com", "orderId": "MKP-..." }`
- Side effects:
  - Admin-only: sends a receipt email (prefer Firestore invoice snapshot; fallback to rebuilding from Stripe)
  - Appends an audit event to Firestore (`admin.receipt.resend`)
- Errors:
  - `401/403` missing/invalid admin token (when forced)
  - `429` resend throttle
  - `503` Stripe/Firestore/email temporarily unavailable
- Idempotency:
  - This endpoint is not the canonical source of truth; webhook-driven outbox is.

---

### Webhooks (canonical event ingestion)

#### `POST /api/stripe/webhook`

- Auth: Stripe signature verification (`Stripe-Signature` + `STRIPE_WEBHOOK_SECRET`)
- Listens to:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - Financial: `charge.refunded`, `charge.dispute.*`
- Request:
  - Raw Stripe event JSON (minimal example):
    ```json
    {
      "id": "evt_123",
      "type": "checkout.session.completed",
      "created": 1700000000,
      "data": { "object": { "id": "cs_test_123", "metadata": { "source": "melkapow" } } }
    }
    ```
- Response (shape):
  - Checkout events:
    ```json
    { "ok": true, "emailed": true, "receiptDeduped": false, "printful": { "ok": true, "submitted": false, "reason": "printful_write_disabled" } }
    ```
  - Skipped events:
    ```json
    { "ok": true, "skipped": true, "reason": "unsupported_event" }
    ```
- Side effects (checkout events):
  - Verify signature and parse payload
  - Load session + PaymentIntent from Stripe
  - Derive internal `orderNumber` (`MKP-...`)
  - Firestore transaction: append event + update snapshot + reserve receipt-email outbox (exactly-once)
  - Persist an immutable invoice snapshot (`invoices/…`) (best-effort)
  - Send receipt email if reserved and enabled
  - Optionally submit Printful order after payment (idempotent via outbox)
- Errors / retry behavior:
  - Returns `400` for invalid signature/payload
  - Returns `503` for transient processing failures (Stripe will retry)
  - Returns `500` for unexpected errors (Stripe will retry)
- Idempotency:
  - Firestore event ids are deterministic (provider event id + payload hash)
  - Receipt emails are exactly-once via Firestore outbox + PaymentIntent metadata marker

#### `POST /api/printful/webhook` (also available at `POST /printful/webhook`)

- Auth:
  - Required token (`PRINTFUL_WEBHOOK_SK`)
  - Optional signature verification (`PRINTFUL_WEBHOOK_SIGNING_SECRET`)
- Request:
  - Raw Printful webhook JSON (shape varies by v1/v2; minimal example):
    ```json
    {
      "type": "shipment_sent",
      "data": {
        "order": { "id": "123456789", "external_id": "MKP-ABCDE12345", "recipient": { "email": "jane@example.com" } },
        "shipment": { "tracking_number": "1Z999...", "tracking_url": "https://carrier.example/track/..." }
      }
    }
    ```
- Response (shape):
  ```json
  { "ok": true, "eventKind": "shipped", "orderRef": "MKP-ABCDE12345", "scheduled": 1, "deduped": 0, "firestore": { "ok": true } }
  ```
- Side effects:
  - Normalize v1/v2 Printful payloads into canonical milestone kinds
  - Persist raw payload in `printful_webhook_inbox` (for replay/debug)
  - Firestore transaction (when enabled): append event + update snapshot milestones + reserve email outbox
  - If email outbox reserved and `SHIPMENT_EMAIL_ENABLED=true`, send shipment/delivered email
- Errors / retry behavior:
  - `401` invalid signature (if signature enforcement is enabled and headers are present)
  - `403` invalid/missing token
  - `400` invalid payload
  - For “can’t match this order yet”, returns `200 ok` and stores an orphan (prevents infinite Printful retries)
- Idempotency:
  - Event doc ids are deterministic, duplicates/out-of-order converge
  - Emails are exactly-once via `notification_dedupe/…`

---

### Admin / ops

All `/api/_admin/*` endpoints require `ADMIN_API_TOKEN`.

Guidance:

- Prefer `dry_run=true` first when available.
- Assume admin endpoints are “sharp tools”: they can create emails, Printful orders, and Firestore state.

#### `POST /api/_admin/firestore/test`

- Auth: admin
- Request: none
- Response:
  ```json
  { "ok": true, "collection": "printful_webhooks", "docId": "admin_test", "ts": "..." }
  ```
- Side effects:
  - Writes/merges `{FIRESTORE_ORDERS_COLLECTION}/admin_test`
- Errors:
  - `503` Firestore unavailable/misconfigured
- Idempotency:
  - Safe to re-run (merge write)

#### `GET /api/_admin/firestore/orders/recent?limit=20`

- Auth: admin
- Query params:
  - `limit` (1–50; default 20)
- Response (shape):
  ```json
  { "ok": true, "limit": 20, "collection": "printful_webhooks", "orders": [{ "orderId": "MKP-...", "createdAt": "..." }] }
  ```
- Side effects: none
- Errors:
  - `503` Firestore query failure
- Idempotency: idempotent

#### `GET /api/_admin/firestore/order?order_ref=MKP-...&include=events,notification_dedupe&limit=10`

- Auth: admin
- Query params:
  - `order_ref` (preferred) or `external_id`
  - `session_id` (alternative lookup by Stripe session id)
  - `include`: comma-separated `{events,notification_dedupe,issues}` (also supports legacy values)
  - `limit` (1–50; default 10)
- Response (shape):
  ```json
  {
    "ok": true,
    "collection": "printful_webhooks",
    "orderId": "MKP-...",
    "docId": "mkp-...",
    "order": { "orderNumber": "MKP-...", "status": "SHIPPED" },
    "events": [{ "docId": "evt_...", "data": { "eventType": "stripe.order.created" } }],
    "notificationDedupe": [{ "docId": "dedupe_...", "data": { "status": "sent" } }]
  }
  ```
- Side effects: none
- Errors:
  - `400` missing lookup params
  - `404` order not found
  - `503` Firestore unavailable
- Idempotency: idempotent

#### `POST /api/_admin/order/email/resend`

- Auth: admin
- Purpose: re-send customer emails (receipt/shipped/delivered) using a **request id** for safe dedupe
- Request:
  ```json
  { "order_ref": "MKP-...", "kind": "receipt", "request_id": "req_20260304_001", "dry_run": false }
  ```
- Response (shape):
  - When reserved/scheduled:
    ```json
    { "ok": true, "reserved": true, "scheduled": true, "dedupeKey": "…", "to": "you@example.com", "kind": "receipt" }
    ```
  - When deduped:
    ```json
    { "ok": true, "deduped": true, "reserved": false, "dedupeKey": "…", "to": "you@example.com" }
    ```
- Side effects:
  - Reserves an outbox record under `{order}/notification_dedupe/{dedupeKey}` (`eventKind=admin_resend_*`)
  - Schedules email send via FastAPI background tasks
- Errors:
  - `400` missing params / missing tracking details for shipped/delivered templates
  - `404` order not found
  - `503` Firestore/email provider unavailable
- Idempotency:
  - Idempotent per `(order_ref, kind, request_id)` via outbox dedupe key

#### `POST /api/_admin/order/printful/retry-submit`

- Auth: admin
- Purpose: force re-submit Printful order creation for a paid order (after Stripe payment)
- Request:
  ```json
  { "order_ref": "MKP-...", "dry_run": false }
  ```
- Side effects:
  - Calls Stripe to load the original paid Checkout session
  - Calls Printful order create (honors `PRINTFUL_SUBMIT_CONFIRM`)
  - Uses outbox/dedupe to avoid duplicates
- Response (shape):
  - When submitted:
    ```json
    { "ok": true, "submitted": true, "printfulOrderId": "123456789", "dedupeKey": "…" }
    ```
  - When deduped (already exists / already submitted):
    ```json
    { "ok": true, "deduped": true, "reason": "printful_order_exists", "printfulOrderId": "123456789" }
    ```
- Errors:
  - `403` Printful writes disabled
  - `400` order not paid / missing session id
  - `503` Stripe/Printful/Firestore unavailable
- Idempotency:
  - Idempotent via `notification_dedupe/{printful_submit}` + snapshot check

#### `POST /api/_admin/reconcile/printful/submit`

- Auth: admin
- Purpose: detect paid orders missing Printful order id and open an issue + (optionally) alert
- Intended use: scheduled “job” in PROD (does **not** submit to Printful)
- Request:
  ```json
  {
    "min_age_minutes": 10,
    "limit": 50,
    "scan_limit": 500,
    "dry_run": true,
    "include_dev": false,
    "send_alerts": true
  }
  ```
- Response (shape):
  ```json
  { "ok": true, "dryRun": true, "env": "PROD", "checked": 120, "candidates": [{ "orderId": "MKP-...", "issueId": "…" }] }
  ```
- Side effects (when `dry_run=false`):
  - Creates/updates `{order}/issues/{issueId}` (`printful_submit_missing`)
  - Optionally reserves/sends an admin alert exactly-once via `{order}/notification_dedupe/…`
- Errors:
  - `503` Firestore unavailable
- Idempotency:
  - Safe to run repeatedly; issue updates and alerts are deduped via deterministic ids/outbox keys

#### `POST /api/_admin/order/issue/resolve`

- Auth: admin
- Purpose: resolve an ops issue record
- Request:
  ```json
  { "order_ref": "MKP-...", "issue_id": "issue_printful_submit_failed:...", "note": "Resolved manually" }
  ```
- Response:
  ```json
  { "ok": true, "orderId": "MKP-...", "issueId": "issue_...", "status": "resolved" }
  ```
- Side effects:
  - Writes `{order}/issues/{issueId}` (merge)
- Errors:
  - `400/503` invalid input / Firestore unavailable
- Idempotency: idempotent

#### `POST /api/_admin/printful/orders/from-stripe`

- Auth: admin
- Purpose: create a Printful order directly from a paid Stripe session
- Safety: defaults to `confirm=false` (draft order)
- Request:
  ```json
  { "session_id": "cs_test_...", "confirm": false, "shipping": "STANDARD" }
  ```
- Response (shape):
  ```json
  { "ok": true, "confirm": false, "printful": { "id": "123456789", "external_id": "MKP-..." } }
  ```
- Side effects:
  - Calls Printful `POST /orders`
  - Best-effort logs create result into Firestore events
- Errors:
  - `400` Stripe session missing cart metadata / recipient details
  - `403` Printful token missing `orders/write` or writes disabled
  - `503` Stripe/Printful unavailable
- Idempotency:
  - **Not inherently idempotent**; repeated calls can create duplicate Printful orders if Printful accepts them. Use carefully.

#### `POST /api/_admin/printful/order/reconcile`

- Auth: admin
- Purpose: backfill missed/late Printful milestone emails by fetching current Printful state
- Request:
  ```json
  { "order_ref": "MKP-...", "printful_order_id": "", "event_kinds": "label_created,shipped,delivered", "dry_run": true }
  ```
- Response (shape):
  ```json
  {
    "ok": true,
    "dryRun": true,
    "orderRef": "MKP-...",
    "printfulOrderId": "123456789",
    "eventKindsRequested": ["label_created", "shipped", "delivered"],
    "results": [{ "eventKind": "shipped", "decision": { "allow": true, "reason": "create" } }]
  }
  ```
- Side effects:
  - Fetches Printful `/orders/{id}`
  - Reserves outbox entries (deduped) and optionally schedules emails
- Errors:
  - `400` missing printful order id and not found in events
  - `503` Firestore/Printful unavailable
- Idempotency:
  - Idempotent for email sends via `notification_dedupe/{milestone}` keys

#### `POST /api/_admin/shipment-email/test`

- Auth: admin
- Purpose: send a test shipment email (template preview) to a chosen address
- Request:
  ```json
  { "to_addr": "you@example.com", "order_ref": "MKP-TESTSHIP", "event_kind": "shipped", "dry_run": true }
  ```
- Response:
  - When `dry_run=true`: includes rendered subject/body/html
  - When `dry_run=false`: `{ "ok": true, "sent": true, "to": "you@example.com" }`
- Side effects:
  - Sends an email (when not dry run)
- Errors:
  - `503` email provider not configured/unavailable
- Idempotency: not idempotent

---

## 4) Firestore data model

This section documents *what we store* and *why*.

Firestore is required for the “real” order system (events + outbox + exact-once emails). If Firestore is disabled/unavailable, webhook processing will fail with `503` and Stripe/Printful will retry (which is desirable, because we don’t want silent order loss).

### Collections (top-level)

- `FIRESTORE_ORDERS_COLLECTION` (default: `printful_webhooks`)
  - One document per internal order id (`orderId` / `orderNumber` like `MKP-...`)
  - Doc id is a safe slug; do not assume it equals `orderNumber`
- `FIRESTORE_PRINTFUL_WEBHOOK_INBOX_COLLECTION` (default: `printful_webhook_inbox`)
  - Raw Printful webhook payloads for replay/debug (append-only)
- `FIRESTORE_PRINTFUL_ORPHAN_EVENTS_COLLECTION` (default: `printful_orphan_events`)
  - Printful events that could not be matched to an order yet (append-only)

### Document ID formats (how we dedupe)

- Order snapshot: `{FIRESTORE_ORDERS_COLLECTION}/{orderDocId}`
  - `orderDocId` is derived from the internal order id with a safe slug function (do not assume it equals `MKP-...`)
- Order events: `{order}/events/{eventId}`
  - `eventId` is deterministic per provider event (provider event id + payload hash), so duplicates map to the same doc
- Email outbox: `{order}/notification_dedupe/{dedupeKey}`
  - `dedupeKey` is deterministic per `(orderRef, eventKind)` (receipt/shipped/delivered/admin_alert/etc)
- Issues: `{order}/issues/{issueId}`
  - `issueId` is deterministic per `(orderRef, issueKind, episodeKey)`
- Invoices: `{order}/invoices/{invoiceId}`
  - `invoiceId` is derived from `paymentIntentId`/`checkoutSessionId` and is treated as immutable once written
- Printful webhook inbox: `{printful_webhook_inbox}/{inboxDocId}`
  - `inboxDocId` is deterministic from a payload hash so the same webhook payload can be stored/located reliably
- Printful orphan events: `{printful_orphan_events}/{orphanId}`
  - `orphanId` uses the same deterministic event id strategy as the main event log

### Order snapshot document (`{orders}/{orderDocId}`)

Purpose: query-friendly, current state for dashboards/admin/debugging.

Key fields (representative):

- Identifiers:
  - `orderId` (string; internal; typically `MKP-...`)
  - `orderNumber` (string; internal; typically `MKP-...`)
  - `checkoutSessionId` (string; Stripe `cs_...`)
  - `paymentIntentId` (string; Stripe `pi_...`)
- Financials (ints in cents + currency string):
  - `amountSubtotalCents`, `amountShippingCents`, `amountDiscountCents`, `amountTaxCents`, `amountTotalCents`
  - `currency` (`"USD"`, etc)
- Status:
  - `orderStatus` (monotonic Stripe/Printful lifecycle rank: created → label → shipped → delivered)
  - `status` (Printful fulfillment status derived from milestones: submitted → shipped → delivered, with terminal guardrails)
- Shipping:
  - `shippingAddress` (map: `{name,email?,phone?,line1,line2?,city,state,postalCode,country}`)
  - `shippingMethod` (map: `{id,name}`)
- Items:
  - `items[]` (array of canonical checkout items including Printful variant ids and quantity)
- Printful: `printful.{orderId, externalId, status, dashboardUrl?, hold?}`
- Milestones:
  - `m` map of canonical booleans (e.g. `shipped`, `delivered`, `onHold`)
  - `t` map of canonical timestamps (e.g. `shippedAt`, `deliveredAt`)
- Email markers (query-friendly): `emails.{receiptSentAt, shippingSentAt, deliveredSentAt}`
- `anomalies[]` for invariant violations (e.g. cancel after shipped)

### Subcollections under an order doc

- `{order}/events` (`FIRESTORE_ORDER_EVENTS_SUBCOLLECTION`, default: `events`)
  - Append-only audit log (Stripe + Printful + internal/admin), deduped via deterministic `eventId`
- `{order}/notification_dedupe`
  - Exactly-once outbox entries for receipts, shipped, delivered, and admin alerts/resends
  - Source of truth for “did we already send this email?”
- `{order}/issues`
  - Durable ops issues (e.g. `printful_submit_failed`, `printful_submit_missing`)
- `{order}/invoices`
  - Immutable receipt/invoice snapshots (best-effort)
- Legacy/optional:
  - `{order}/event_log`, `{order}/printful_events`, `{order}/printful_orders`

### Typical writes (who writes what)

- Order snapshot:
  - Stripe webhook (`POST /api/stripe/webhook`) creates/updates the canonical paid order snapshot.
  - Printful webhook (`POST /api/printful/webhook`) updates fulfillment milestones/status.
  - Admin endpoints update issues/outbox and can backfill milestone emails.
- Events subcollection:
  - Stripe webhook, Printful webhook, and admin reconciliation all append deduped events.
- notification_dedupe outbox:
  - Stripe webhook reserves/sends receipt email.
  - Printful webhook reserves/sends shipped/delivered emails.
  - Admin endpoints reserve/schedule resends and alerts.
- Printful inbox/orphans:
  - Printful webhook stores raw payloads and stores orphans when order matching is impossible.

### Typical reads (who consumes what)

- Frontend never reads Firestore directly.
- Backend reads Firestore to:
  - fill missing receipt shipping details (thank-you page)
  - load invoice snapshots for resend/rebuild
  - dedupe emails and reconcile order state
- Admin/ops reads Firestore via `/api/_admin/firestore/*` endpoints.

### Event-sourcing vs snapshot behavior

- This system stores **both**:
  - a small snapshot doc for “current state”
  - an append-only event log for audit/debugging/replay
- When conflicts happen:
  - Snapshot moves forward monotonically (by rank / milestones).
  - Exactly-once behaviors (emails, Printful submit) are controlled by the outbox in `notification_dedupe/…`.

### Indexes required

The code intentionally avoids composite-index-heavy queries. Typical access patterns:

- Recent orders: order by `createdAt` (single-field index is automatic)
- Find by session id: `where("checkoutSessionId" == sid).limit(1)` (single-field index is automatic)
- Admin reconcile scans a bounded set of recent docs and filters in-process to avoid composite indexes.

### Source of truth rules

- **Payment confirmation**: Stripe webhook (`checkout.session.completed`) is canonical.
- **Fulfillment milestones**: Printful webhooks are canonical for shipped/delivered/on-hold.
- **Emails**: `notification_dedupe/…` is canonical for exactly-once sends.
- **Audit**: `events/…` and Printful inbox/orphans are the audit trail; snapshot is the query view.

---

## 5) Event flow map (what triggers what)

This is the “if X happens, then Y fires, then Z is written” section.

### Customer checkout flow (canonical)

Trigger: customer clicks “Continue to payment” on the shipping page.

1. Frontend → `POST /api/shop/checkout`
   - Backend validates cart pricing against Printful catalog and creates Stripe Checkout session.
2. Browser redirects to Stripe Checkout
3. Stripe sends webhook → `POST /api/stripe/webhook` (signed)
4. Backend:
   - verifies signature + loads Stripe session + PaymentIntent
   - derives `orderNumber = MKP-...`
   - Firestore transaction:
     - append `stripe.order.created` event
     - upsert order snapshot (`createdAt`, totals, customer, items)
     - reserve `notification_dedupe/{order_created}` outbox (exactly once)
   - persists invoice snapshot (best-effort)
   - sends receipt email if reserved + enabled
   - submits Printful order if enabled + write-permitted (idempotent outbox)

Failure/retry strategy:

- Stripe retries 5xx/timeout webhook responses automatically.
- Our handler is safe to retry due to deterministic event ids and outbox dedupe.

### Printful fulfillment flow (after payment)

Trigger: backend submits Printful order after Stripe webhook confirms payment.

1. Stripe webhook → `_stripe_submit_printful_order_after_payment`
2. Backend reserves `notification_dedupe/{printful_submit}` outbox
3. Backend calls Printful `POST /orders?confirm={true|false}`
4. Backend updates Firestore snapshot with `printful.orderId` and marks outbox `sent`
5. Printful starts fulfillment and emits webhooks

Failure/retry strategy:

- If Printful create fails, outbox is marked `failed` and an ops issue is created (`issues/…`).
- Admin can retry submission (`POST /api/_admin/order/printful/retry-submit`).

### Shipping/delivery milestone flow (customer notifications)

Trigger: Printful sends shipment events to `POST /api/printful/webhook`.

1. Backend verifies token (+ signature when enabled)
2. Store raw payload in `printful_webhook_inbox` (for replay)
3. Normalize event to canonical milestone kind:
   - `label_created`, `shipped`, `delivered` (plus hold/fail/cancel handling)
4. Firestore transaction:
   - append event to `events/…` (deduped)
   - update snapshot milestones (`m`/`t`) + derived fulfillment `status`
   - reserve `notification_dedupe/{milestone}` outbox exactly-once
5. If reserved and enabled, send shipment/delivered email

Failure/retry strategy:

- Webhook duplicates/out-of-order are expected; milestones are monotonic (with on-hold toggle rules).
- If the order snapshot doesn’t exist yet, the event is stored as an orphan and returns 200 OK.

### Refund / chargeback flow (Stripe financial events)

Trigger: Stripe sends `charge.refunded` or `charge.dispute.*` to `POST /api/stripe/webhook`.

1. Append an auditable event in `events/…` (deduped)
2. Update snapshot flags (refunded/dispute fields)
3. Create/resolve `issues/…` records for admin workflows
4. Optionally reserve/send admin alert emails exactly-once via outbox

---

## 6) Milestones + state machine

Two “state machines” exist:

### A) `orderStatus` (monotonic rank)

Ranked statuses:

`UNKNOWN → PENDING → ORDER_CREATED → SHIPPING_LABEL_CREATED → ORDER_SHIPPED → ORDER_DELIVERED`

Transition triggers (event kinds):

- `order_created` → `ORDER_CREATED`
- `label_created` → `SHIPPING_LABEL_CREATED`
- `shipped` → `ORDER_SHIPPED`
- `delivered` → `ORDER_DELIVERED`

Rule: **never move backwards**; out-of-order webhooks converge to the max rank.

### B) Printful fulfillment `status` (derived from milestones)

Canonical milestone booleans live in:

- `m.{orderCreated, shipped, delivered, failed, canceled, onHold}`
- `t.{orderCreatedAt, shippedAt, deliveredAt, onHoldAt, releasedAt}`

Derived fulfillment `status` priority:

`FAILED > CANCELED > DELIVERED > SHIPPED > ON_HOLD > IN_FULFILLMENT > SUBMITTED_TO_PRINTFUL`

Duplicates/out-of-order handling:

- milestones only move forward (`false → true`), except `onHold` which is computed from timestamps
- guardrails prevent impossible regressions (e.g., cancel after delivered becomes an anomaly instead of overwriting state)

---

## 7) Webhook handling rules

### Stripe

- **Signature verification is mandatory** when `STRIPE_WEBHOOK_SECRET` is set.
- The backend only processes the events it understands; others are acknowledged (`ok:true`) and ignored.
- Dedupe strategy:
  - Firestore event ids are deterministic by provider event id + payload hash
  - Receipt emails are exactly-once via Firestore outbox and a PaymentIntent metadata marker

Replay:

- Use Stripe dashboard “resend event” into the webhook endpoint.
- Safe due to dedupe/outbox.

### Printful

- Webhook endpoint requires an explicit token (`PRINTFUL_WEBHOOK_SK`).
- Optional signature verification when signature headers are present and enabled.
- Orphans:
  - If we can’t map the event to an order snapshot, we store it in `printful_orphan_events` and return 200.

Replay:

- Re-send from Printful dashboard, or use admin reconcile:
  - `POST /api/_admin/printful/order/reconcile` fetches current Printful order state and schedules missing milestone emails (deduped).

---

## 8) Background jobs / scheduled tasks (if any)

There is no always-on job runner in the backend; however, the system supports:

- **FastAPI BackgroundTasks** for sending emails after outbox reservation.
- **Recommended scheduled job (PROD)**:
  - Call `POST /api/_admin/reconcile/printful/submit` periodically (cron) to detect paid orders missing Printful submission.
- Startup best-effort checks:
  - a daemon thread probes Printful scopes and initializes Firestore so `/api/health` reflects readiness.

---

## 9) Observability + debugging

### Health + diagnostics endpoints

- `GET /api/health`:
  - Check `stripe.webhookConfigured`, `printful.writeEnabled`, `email.provider`, `firestore.clientReady`
- `GET /api/shop/status?refresh=true`:
  - Verify Printful token scopes (especially `orders/read` for estimates and `orders/write` for submissions)

### Key log events to grep for

The backend emits structured log events. Useful ones during checkout + fulfillment debugging:

- `stripe_webhook_received` / `stripe_webhook_done`
- `printful_webhook_done`
- `email_sent` (receipt/shipment/alerts; recipients may be redacted unless enabled)
- `printful_catalog_build_start` / `printful_catalog_build_ok`

### Common playbooks

**“Payments aren’t enabled yet” (503 from checkout)**

- Backend missing `STRIPE_SK` / `STRIPE_SECRET_KEY`
- Check `GET /api/health` → `stripe.enabled`

**“webhookConfigured:false” on `/api/health`**

- `STRIPE_WEBHOOK_SECRET` is missing/blank in that environment
- Set it and redeploy/restart

**Stripe tax estimation errors (e.g., head office address missing)**

- Configure Stripe Tax settings (test mode) **or** disable automatic tax:
  - `STRIPE_AUTOMATIC_TAX=false` and/or `STRIPE_TAX_CALCULATIONS=false`

**Shipping estimate fails with 403**

- Printful token missing `orders/read` scope (required for `/orders/estimate-costs`)
- Fix token scopes and re-check `GET /api/shop/status?refresh=true`

**Order paid but no Printful order**

- Check Firestore order snapshot:
  - `GET /api/_admin/firestore/order?order_ref=...&include=events,notification_dedupe,issues`
- Run reconcile:
  - `POST /api/_admin/reconcile/printful/submit` (creates an issue + optional admin alert)
- Retry submit (only when safe):
  - `POST /api/_admin/order/printful/retry-submit`

**Shipment email not sent**

- Confirm `SHIPMENT_EMAIL_ENABLED=true`
- Check `notification_dedupe/{shipped|delivered}` docs for status/attempts
- If webhook was missed, run:
  - `POST /api/_admin/printful/order/reconcile`

### How to test locally

- Backend: `cd app && poetry run uvicorn app.main:app --reload --app-dir src --port 8000 --env-file .env`
- Stripe:
  - Use Stripe CLI to forward webhooks to `http://127.0.0.1:8000/api/stripe/webhook`
- Printful:
  - Configure webhook to `.../api/printful/webhook?token=PRINTFUL_WEBHOOK_SK`
  - Use `app/webhooks` as a starting point for v2 webhook setup
- E2E:
  - See `docs/purchase_test_plan.md` (smoke → dev warm-up → true E2E)
- HTTP scenarios:
  - Import `postman/melkapow_pytest_http.postman_collection.json`

---

## 10) Security + access controls

### Secrets & configuration

- All secrets live in env vars (see `app/.env.example`).
- Never commit `app/.env`.
- Use `EMAIL_OVERRIDE_TO` in dev/staging to prevent emailing real customers.

### Webhook security

- Stripe webhooks require signature verification.
- Printful webhook endpoint requires a token and can additionally verify an HMAC signature.

### Admin endpoints

- Protected by `ADMIN_API_TOKEN`.
- Prefer long random tokens; rotate if leaked.

### CORS

- Origins are allowlisted (`ALLOWED_ORIGINS`).
- Local dev allows `localhost` / `127.0.0.1` on any port.

### Firestore access model

- Firestore is server-only (service account). The frontend never talks to Firestore directly.
- Treat Firestore as sensitive: it contains PII (shipping address, emails).
