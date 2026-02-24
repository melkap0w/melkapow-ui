import { expect, test, type Page } from "@playwright/test";

function isoNow(): string {
  return new Date().toISOString();
}

async function navigateHash(page: Page, hash: string): Promise<void> {
  const next = String(hash || "").trim();
  if (!next.startsWith("#")) throw new Error(`navigateHash expects "#...": got ${next}`);

  // This site uses hash-based article navigation (HTML5UP Dimension). Clicking nav links can be flaky
  // in headless mode because the header is hidden when an article is open (wrapper intercepts clicks).
  await page.evaluate((h) => {
    window.location.hash = h;
  }, next);

  const id = next.slice(1);
  if (!id) return;

  await expect(page.locator(`article#${id}`)).toBeVisible();
  await expect(page.locator(`article#${id}`)).toHaveClass(/active/);
}

test.describe("@smoke frontend purchase flow (mocked API)", () => {
  test.beforeEach(async ({ page }) => {
    // Force same-origin API calls so the smoke test can fully mock the backend without CORS noise.
    await page.addInitScript(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).MELKAPOW_API_BASE = window.location.origin;
      } catch (_) {
        // ignore
      }
    });

    const sessionId = "cs_test_1234567890";

    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...headers,
      },
      body: JSON.stringify(body),
    });

    await page.route("**/api/health", async (route) => {
      await route.fulfill(json({ ok: true, ts: isoNow() }));
    });

    await page.route("**/api/shop/catalog**", async (route) => {
      await route.fulfill(
        json({
          ok: true,
          provider: "stub",
          products: {
            eye: {
              finishes: [
                {
                  id: "fine-art-paper",
                  label: "Fine Art Paper",
                  sizes: [
                    {
                      id: "8x10",
                      label: '8" x 10"',
                      priceCents: 3500,
                      currency: "USD",
                      printfulSyncVariantId: 1001,
                      printfulVariantId: 2001,
                      printfulProductId: 3001,
                    },
                    {
                      id: "11x14",
                      label: '11" x 14"',
                      priceCents: 5000,
                      currency: "USD",
                      printfulSyncVariantId: 1002,
                      printfulVariantId: 2002,
                      printfulProductId: 3001,
                    },
                  ],
                },
                {
                  id: "stretched-canvas",
                  label: "Stretched Canvas",
                  sizes: [
                    {
                      id: "12x16",
                      label: '12" x 16"',
                      priceCents: 18000,
                      currency: "USD",
                      printfulSyncVariantId: 1101,
                      printfulVariantId: 2101,
                      printfulProductId: 3101,
                    },
                  ],
                },
              ],
            },
          },
          stale: false,
          ts: isoNow(),
        }),
      );
    });

    await page.route("**/api/shop/checkout/countries**", async (route) => {
      await route.fulfill(
        json({
          ok: true,
          provider: "stub",
          countries: [
            { code: "US", name: "United States" },
            { code: "CA", name: "Canada" },
          ],
          allowedCodes: ["US", "CA"],
          source: "stub",
          warning: null,
          printful: { stale: false, error: null },
          ts: isoNow(),
        }),
      );
    });

    await page.route("**/api/shop/estimate", async (route) => {
      await route.fulfill(
        json({
          ok: true,
          currency: "USD",
          shippingOptions: [
            {
              shippingMethodId: "STANDARD",
              shippingMethodName: "Standard",
              shippingCents: 695,
              deliveryEstimate: { minDays: 5, maxDays: 8 },
            },
          ],
          selectedShippingMethodId: "STANDARD",
          selectedShippingMethodName: "Standard",
          shippingCents: 695,
          taxCents: 0,
          taxProvider: "stub",
          discountCents: 0,
          discountCode: "",
          totalCents: 4195,
          deliveryEstimate: { minDays: 5, maxDays: 8 },
          ts: isoNow(),
        }),
      );
    });

    await page.route("**/api/shop/checkout", async (route) => {
      const origin = new URL(route.request().url()).origin;
      const url = `${origin}/?checkout=success&session_id=${encodeURIComponent(sessionId)}#checkout-success`;
      await route.fulfill(json({ ok: true, url }));
    });

    await page.route("**/api/shop/checkout/session**", async (route) => {
      await route.fulfill(
        json({
          ok: true,
          sessionId,
          orderNumber: "MKP-TEST",
          created: isoNow(),
          currency: "USD",
          customer: { name: "Test Buyer", email: "buyer@example.com" },
          shipping: {
            name: "Test Buyer",
            email: "buyer@example.com",
            address: {
              line1: "123 Test St",
              city: "San Francisco",
              state: "CA",
              postal_code: "94107",
              country: "US",
            },
          },
          items: [
            {
              description: 'What lives within — Fine Art Paper · 8" x 10"',
              quantity: 1,
              amountCents: 3500,
              currency: "USD",
            },
          ],
          subtotalCents: 3500,
          shippingCents: 695,
          taxCents: 0,
          discountCents: 0,
          totalCents: 4195,
          payment: { type: "card", brand: "visa", last4: "4242" },
        }),
      );
    });
  });

  test("site loads, gallery renders, cart + checkout success flow works", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "MELKAPOW" })).toBeVisible();
    await page
      .waitForFunction(() => !document.body.classList.contains("is-preload"), null, { timeout: 10_000 })
      .catch(() => {});

    const health = await page.evaluate(async () => {
      const res = await fetch(window.location.origin + "/api/health", { method: "GET" });
      return res.json();
    });
    expect(health).toMatchObject({ ok: true });

    await navigateHash(page, "#work");
    await expect
      .poll(async () => page.locator("#gallery a.gallery-item").count())
      .toBeGreaterThan(3);

    await navigateHash(page, "#shop");
    await expect(page.locator("#shopGallery a.gallery-item")).toHaveCount(1, { timeout: 30_000 });

    const shopHref = await page.locator("#shopGallery a.gallery-item").first().getAttribute("href");
    expect(shopHref).toBe("#shop-eye");
    await navigateHash(page, "#shop-eye");
    await expect(page.locator("article#shop-eye")).toBeVisible();

    await page.locator("#buy-eye-finish").selectOption({ index: 1 });
    await page.locator("#buy-eye-size").selectOption({ index: 1 });
    await page.locator("article#shop-eye").getByRole("button", { name: "Add to Cart" }).click();
    await expect(page.locator("article#shop-eye .purchase-status")).toContainText("Added to cart.");

    await navigateHash(page, "#cart");
    await expect(page.locator("#cartEmpty")).toBeHidden();
    await expect(page.locator("#cartItems .cart-remove")).toHaveCount(1);

    await page.locator("#cartCheckoutBtn").click();
    await expect(page.locator("article#checkout-shipping")).toBeVisible();

    await page.locator("#checkoutShippingFirstName").fill("Test");
    await page.locator("#checkoutShippingLastName").fill("Buyer");
    await page.locator("#checkoutShippingEmail").fill("buyer@example.com");
    await page.locator("#checkoutShippingAddress1").fill("123 Test St");
    await page.locator("#checkoutShippingCity").fill("San Francisco");
    await page.locator("#checkoutShippingState").fill("CA");
    await page.locator("#checkoutShippingPostal").fill("94107");

    await expect(page.locator("#checkoutShippingContinueBtn")).toBeEnabled();
    await page.locator("#checkoutShippingContinueBtn").click();
    await page.waitForURL(/#checkout-success$/);

    await expect(page.locator("#receiptNumber")).toContainText("MKP-TEST");
  });
});
