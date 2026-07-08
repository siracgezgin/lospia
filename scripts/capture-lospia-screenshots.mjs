// Capture real Lospia app screenshots as visual reference for the Remotion demo.
//
// Local-only. Logs into the LOCAL dev server with the demo-safe workspace user
// and screenshots the product surfaces (board, list, calendar, modules, task
// detail). Output → remotion/assets/screenshots/. No production, no real
// customer data — the demo workspace is seeded, sanitized sample content.
//
// Usage: node scripts/capture-lospia-screenshots.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "remotion/assets/screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL || "elif@demo.lospia.test";
const PASSWORD = process.env.DEMO_PASSWORD || "LospiaDemo!2026";

const VIEWPORT = { width: 1600, height: 1000 };

async function shoot(page, path, name, waitFor) {
  const url = `${BASE}${path}`;
  const status = { name, path, file: `${name}.png`, ok: false, note: "" };
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    if (waitFor) {
      try {
        await page.waitForSelector(waitFor, { timeout: 8000 });
      } catch {
        status.note = `selector "${waitFor}" not found`;
      }
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    status.ok = true;
    status.httpStatus = resp?.status() ?? null;
    console.log(`✓ ${name} ← ${path}`);
  } catch (err) {
    status.note = String(err.message || err);
    console.log(`✗ ${name} ← ${path}: ${status.note}`);
  }
  return status;
}

const results = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await context.newPage();

// ── Login ────────────────────────────────────────────────────────────
console.log(`Logging in as ${EMAIL} …`);
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="identifier"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(2000);
const loggedIn = !page.url().includes("/login");
console.log(loggedIn ? `Logged in → ${page.url()}` : `WARNING: still on login (${page.url()})`);

// ── Capture product surfaces ─────────────────────────────────────────
results.push(await shoot(page, "/board", "board-reference", '[data-col]'));
results.push(await shoot(page, "/list", "list-reference", "table"));
results.push(await shoot(page, "/calendar", "calendar-reference", "main"));
results.push(await shoot(page, "/modules", "modules-reference", "main"));
results.push(await shoot(page, "/dashboard", "dashboard-reference", "main"));
results.push(await shoot(page, "/rules", "rules-reference", "main"));

// ── Task detail: open the approval-flow task the demo script showcases ─
// Prefer "Numune Revizyon Kontrolü" (owner/due/approval story); fall back to
// the first card if the title can't be located.
const DETAIL_TASK_TITLE = process.env.DETAIL_TASK_TITLE || "Numune Revizyon Kontrolü";
try {
  await page.goto(`${BASE}/board`, { waitUntil: "networkidle" });
  await page.waitForSelector('[aria-label^="Görev detayını aç"]', { timeout: 8000 });
  const byTitle = page.locator('[aria-label^="Görev detayını aç"]', { hasText: DETAIL_TASK_TITLE }).first();
  const target = (await byTitle.count()) ? byTitle : page.locator('[aria-label^="Görev detayını aç"]').first();
  await target.click();
  await page.waitForURL(/\/tasks\//, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "task-detail-reference.png") });
  results.push({ name: "task-detail-reference", path: page.url().replace(BASE, ""), file: "task-detail-reference.png", ok: true });
  console.log(`✓ task-detail-reference (opened "${DETAIL_TASK_TITLE}")`);
} catch (err) {
  results.push({ name: "task-detail-reference", path: "/tasks/:id", file: "task-detail-reference.png", ok: false, note: String(err.message || err) });
  console.log("✗ task-detail-reference:", err.message || err);
}

await browser.close();

const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl: BASE,
  account: EMAIL,
  viewport: VIEWPORT,
  note: "Real local Lospia app screenshots from the seeded demo-safe workspace. Used as visual source of truth for the Remotion demo UI recreation. No production or real customer data.",
  loggedIn,
  screenshots: results,
};
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nManifest → ${join(OUT, "manifest.json")}`);
console.log(`Captured ${results.filter((r) => r.ok).length}/${results.length} surfaces.`);
