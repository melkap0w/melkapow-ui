import { expect, test, type Page } from "@playwright/test";

async function navigateHash(page: Page, hash: string): Promise<void> {
  const next = String(hash || "").trim();
  if (!next.startsWith("#")) throw new Error(`navigateHash expects "#...": got ${next}`);

  await page.evaluate((h) => {
    window.location.hash = h;
  }, next);

  const id = next.slice(1);
  if (!id) return;

  await expect(page.locator(`article#${id}`)).toBeVisible();
  await expect(page.locator(`article#${id}`)).toHaveClass(/active/);
}

test.describe("@dev Render-backed shop smoke (real API)", () => {
  test.describe.configure({ timeout: 180_000 });

  const apiBase = String(process.env.E2E_API_BASE || "").trim().replace(/\/+$/, "");
  test.skip(!apiBase, "Set E2E_API_BASE=http://localhost:8000 to run dev E2E.");

  test.beforeEach(async ({ page }) => {
    // When using the local static server (127.0.0.1), index.html won't override MELKAPOW_API_BASE.
    // This lets us drive the real dev backend in a deterministic way.
    await page.addInitScript((base) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).MELKAPOW_API_BASE = String(base || "").replace(/\/+$/, "");
      } catch (_) {
        // ignore
      }
      try {
        if (window.localStorage) window.localStorage.removeItem("melkapow_shop_catalog_v1");
      } catch (_) {
        // ignore
      }
    }, apiBase);
  });

  test("shop loads at least one catalog item (cold-start safe)", async ({ page }) => {
    await page.goto("/");
    await page
      .waitForFunction(() => !document.body.classList.contains("is-preload"), null, { timeout: 15_000 })
      .catch(() => {});

    await navigateHash(page, "#shop");

    const shopGallery = page.locator("#shopGallery");

    // Skeleton should show quickly (Render cold starts).
    await expect(shopGallery).toHaveAttribute("data-ready", "false", { timeout: 2_000 });

    // Render cold starts + Printful catalog rebuild can take time; wait for tiles.
    const firstTile = page.locator("#shopGallery a.gallery-item").first();
    await expect(firstTile).toBeVisible({ timeout: 120_000 });

    // Gallery should be marked ready and skeleton flags cleared.
    await expect(shopGallery).toHaveAttribute("data-ready", "true");
    await expect(shopGallery).not.toHaveAttribute("data-skeleton", "true");
  });
});
