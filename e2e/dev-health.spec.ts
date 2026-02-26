import { expect, test } from "@playwright/test";

function normalizeBase(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

test.describe("@dev Deployed API readiness", () => {
  const apiBase = normalizeBase(process.env.E2E_API_BASE || "");
  test.skip(!apiBase, "Set E2E_API_BASE to run deployed API checks.");

  test("reports Stripe webhook + Firestore ready", async ({ request }) => {
    const res = await request.get(`${apiBase}/api/health`);
    expect(res.ok()).toBeTruthy();

    const body = (await res.json()) as any;
    expect(body).toMatchObject({ ok: true });

    // Stripe webhook is the source-of-truth trigger for paid orders.
    if (body?.stripe?.enabled) {
      expect(Boolean(body.stripe.webhookConfigured)).toBeTruthy();
    }

    // Firestore is required for idempotent order persistence/outbox.
    if (body?.firestore?.enabled) {
      expect(Boolean(body.firestore.clientReady)).toBeTruthy();
    }
  });
});

