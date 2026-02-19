# Purchase Test Plan (Manual + Automated)

This repo is a static frontend plus a FastAPI backend (`app/`) for shop + payments.

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
