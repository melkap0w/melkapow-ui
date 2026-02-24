import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 4173);
const baseURL = String(process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, "");
const startWebServer = !process.env.E2E_BASE_URL;
const apiBase = String(process.env.E2E_API_BASE || process.env.MELKAPOW_API_BASE || process.env.API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const timeoutMs = Number(process.env.E2E_TEST_TIMEOUT_MS || 90_000);
const expectTimeoutMs = Number(process.env.E2E_EXPECT_TIMEOUT_MS || 15_000);

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup",
  metadata: {
    FRONTEND_BASE_URL: baseURL,
    API_BASE: apiBase || "mocked/same-origin (@smoke)",
  },
  timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 90_000,
  expect: { timeout: Number.isFinite(expectTimeoutMs) && expectTimeoutMs > 0 ? expectTimeoutMs : 15_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: startWebServer
    ? {
        command: `python3 -m http.server ${port} --bind 127.0.0.1`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
