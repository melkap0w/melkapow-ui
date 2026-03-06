# Purchase Test Plan (Manual + Automated)

This repo is a static frontend plus a FastAPI backend (`app/`) for shop + payments.

Related docs:

- `docs/system_process.md` (system overview, IDs, API contracts, Firestore model, event flows, ops runbooks)
- `app/ORDER_EVENT_SYSTEM.md` (deep dive on the Firestore snapshot + events + outbox model)

## What “E2E” means here (3 layers)

You’ll get the best confidence by running three tiers:

### A) Smoke tests (fast, safe)

Goal: “the site works” without relying on Stripe/Printful availability.

- Backend: `GET /api/health` returns `{ ok: true }`
- Frontend: Playwright smoke test that mocks the backend endpoints so no real orders/emails are sent:

```bash
npm i
npm run e2e:install
npm run e2e:smoke
```

### A2) Dev API warm-up + smoke (Render cold-start safe)

Goal: prove the deployed **dev backend** is awake and can serve the shop catalog (read-only), while still driving the UI.

This run does a targeted warm-up that polls `GET $E2E_API_BASE/api/health` for up to ~90 seconds (Render cold start),
then opens the site and waits for at least 1 shop tile to render.

```bash
E2E_API_BASE="http://localhost:8000" npm run e2e:dev
```

Tuning knobs:

- `E2E_WARMUP_MAX_MS=90000` (default)
- `E2E_WARMUP_ATTEMPT_TIMEOUT_MS=180000` (default)
- `E2E_WARMUP_ENABLED=false` (disable warm-up)

CI: the GitHub Actions workflow `/.github/workflows/e2e.yml` exposes this as a manual job (`workflow_dispatch`).

### B) True E2E (real integrations, slower)

Goal: prove the full checkout + webhook pipeline works against real services.

- Stripe in **test mode**: complete a real test checkout and confirm redirect back to `/#checkout-success`
- Backend: confirm an order snapshot/event is stored (Firestore)
- Printful: POST recorded real webhook payloads into `POST /api/printful/webhook` and confirm order/event updates + idempotency

Safety knobs for staging/dev:

- `EMAIL_OVERRIDE_TO="hello@example.com"` (redirect all outbound email)
- `PRINTFUL_WRITE_ENABLED="false"` unless you explicitly want auto-submit to Printful
- Keep `ALERT_EMAIL_ENABLED="false"` until you want alert spam during testing

### C) Contract tests (integration safety)

Goal: catch payload/response shape changes early so the frontend and webhooks don’t silently break.

- Backend unit/contract suite:

```bash
cd app
poetry run pytest -q
```

- Optional: import `postman/melkapow_pytest_http.postman_collection.json` into Postman for HTTP-level scenarios.

## Automated Tests (Backend)

Run:

```bash
cd app
PYTHONPATH=src ./.venv/bin/python -m pytest
```

Coverage highlights:

- Alert emails include an environment-tagged `FAILURE (DEV|PROD):` subject and throttle per dedupe key.
- Client crash/slow-load reporting endpoint triggers an alert email.
- User-error validations for shop estimate + contact form return correct HTTP error codes.
- Missing Stripe secret key triggers an alert and returns `503` for checkout attempts.

## Manual Tests (Frontend Purchase Flow)

### Cart + Discount

1. Add an item to cart.
1. Apply a valid coupon code:
   - Discount row appears.
   - Estimated total decreases.
1. Apply an invalid coupon code:
   - Error shown.
   - Discount row hidden (or discount = 0).
1. Remove/clear the coupon:
   - Discount row hidden.
   - Total returns to subtotal (+ any shipping/tax when applicable).
1. Refresh the page:
   - Cart contents persist for the session.
   - Discount code persists (if expected).

### Shipping Estimate

1. Navigate to Shipping.
1. Enter a valid address and ZIP/postal code.
1. Calculate shipping (or trigger estimate):
   - Shipping options appear (or a selected method is shown).
   - Tax/shipping populate.
   - Estimated total matches: `items subtotal + shipping + tax - discount`.
1. Negative: enter invalid/missing ZIP:
   - User-friendly error appears.
   - Page does not crash.

### Continue To Payment (Critical UX)

1. With a discount applied, click “Continue to Payment”.
1. Confirm the Shipping page **does not visually jump** back to the pre-discount total during redirect.
   - If Stripe totals differ from the local estimate, the UI should not “undo” the discount in the summary.

### Stripe Checkout

1. Confirm redirect to Stripe succeeds.
1. Confirm line items, shipping, tax, and discount are correct on Stripe.
1. Cancel payment:
   - Site returns with cancel state.
   - Cart remains intact.
1. Successful payment (Stripe test card):
   - Site returns with success state.
   - Invoice/receipt loads.
   - Receipt email is delivered (webhook or fallback).

### Reload/Back/Forward Behavior

1. Reload Shipping page mid-checkout:
   - Cart and form state should restore.
   - No crashes; user can proceed.
1. Back/forward navigation:
   - UI doesn’t duplicate requests excessively or lose state unexpectedly.

## Failure Injection (Staging/Dev Only)

These are “shit hits the fan” validations to ensure you get notified.

### Backend Down / Unreachable

1. Point `MELKAPOW_API_BASE` to an invalid host or stop the backend.
1. Verify:
   - Shop shows “unavailable” states without JS crashes.
   - No infinite loading spinners.

### Stripe Misconfiguration

1. Unset `STRIPE_SK` in the backend environment.
1. Attempt checkout.
1. Verify:
   - Checkout is blocked with a clear message.
   - A `FAILURE (DEV|PROD):` alert email is sent (deduped).

### Stripe Webhook Misconfiguration

1. Unset `STRIPE_WEBHOOK_SECRET`.
1. Hit `POST /api/stripe/webhook` (or trigger a webhook).
1. Verify a `FAILURE (DEV|PROD):` alert email is sent (deduped).

### Printful Misconfiguration

1. Unset `PRINTFUL_API_TOKEN`.
1. Load catalog / run estimate.
1. Verify:
   - Customer sees “temporarily unavailable”.
   - A `FAILURE (DEV|PROD):` alert email is sent when appropriate.

### Slow Requests

1. Simulate slow backend responses (network throttling or injected delay).
1. Verify `ALERT_SLOW_REQUEST_MS` triggers a `FAILURE (DEV|PROD):` alert email when exceeded (deduped).
