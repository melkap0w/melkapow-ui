import type { FullConfig } from "@playwright/test";

function envBool(name: string, defaultValue = false): boolean {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "y" || raw === "on";
}

function envInt(name: string, defaultValue: number): number {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : defaultValue;
}

function normalizeUrlBase(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms | 0)));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch (_) {
          // ignore
        }
      }, Math.max(250, timeoutMs | 0))
    : null;

  try {
    // Node 18+ has global fetch. (Playwright requires Node 18+ in modern versions.)
    return await fetch(url, { method: "GET", cache: "no-store", signal: controller ? controller.signal : undefined });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function warmupRenderApi(apiBase: string, opts: { maxWaitMs: number; attemptTimeoutMs: number }): Promise<void> {
  const base = normalizeUrlBase(apiBase);
  if (!base) return;

  const maxWaitMs = Math.max(1_000, opts.maxWaitMs | 0);
  const attemptTimeoutMs = Math.max(250, opts.attemptTimeoutMs | 0);
  const healthUrl = `${base}/api/health`;

  const startedAt = Date.now();
  let attempt = 0;
  let delayMs = 750;
  let lastStatus = "";

  // Render cold starts can take ~60s+; keep retrying until maxWaitMs.
  while (Date.now() - startedAt < maxWaitMs) {
    attempt += 1;
    try {
      const res = await fetchWithTimeout(healthUrl, attemptTimeoutMs);
      const status = res.status;
      if (res.ok) {
        // Best-effort: validate JSON shape, but don't fail if it's not JSON.
        try {
          const data = (await res.json()) as unknown;
          if (data && typeof data === "object" && "ok" in (data as Record<string, unknown>)) {
            const ok = Boolean((data as Record<string, unknown>).ok);
            if (!ok) throw new Error("health-ok-false");
          }
        } catch (_) {
          // ignore
        }
        console.log(`[warmup] api ready: ${healthUrl} (attempt ${attempt})`);
        return;
      }
      lastStatus = `http_${status}`;
    } catch (err) {
      const e = err as { name?: string; message?: string } | null;
      const name = (e && e.name) || "";
      lastStatus = name === "AbortError" ? "timeout" : "network";
    }

    const elapsedMs = Date.now() - startedAt;
    const remainingMs = maxWaitMs - elapsedMs;
    if (remainingMs <= 0) break;

    const waitMs = Math.min(delayMs, remainingMs);
    console.log(`[warmup] waiting ${waitMs}ms for ${healthUrl} (${lastStatus}, attempt ${attempt})`);
    await sleep(waitMs);
    delayMs = Math.min(5_000, Math.round(delayMs * 1.6));
  }

  throw new Error(`[warmup] api not ready after ${maxWaitMs}ms: ${healthUrl} (last=${lastStatus})`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const apiBase =
    normalizeUrlBase(process.env.E2E_API_BASE || "") ||
    normalizeUrlBase(process.env.MELKAPOW_API_BASE || "") ||
    normalizeUrlBase(process.env.API_BASE_URL || "");

  const enabled = envBool("E2E_WARMUP_ENABLED", Boolean(apiBase));
  if (!enabled) return;

  if (!apiBase) {
    console.warn("[warmup] enabled but E2E_API_BASE is not set; skipping warm-up");
    return;
  }

  const maxWaitMs = envInt("E2E_WARMUP_MAX_MS", 180_000);
  const attemptTimeoutMs = envInt("E2E_WARMUP_ATTEMPT_TIMEOUT_MS", 8_000);

  console.log(`[warmup] Render cold-start warm-up: apiBase=${apiBase} maxWaitMs=${maxWaitMs}`);
  await warmupRenderApi(apiBase, { maxWaitMs, attemptTimeoutMs });
}

