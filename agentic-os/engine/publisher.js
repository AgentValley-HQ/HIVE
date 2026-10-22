/**
 * engine/publisher.js
 * Simulated auto-poster. Launches a headless Playwright browser,
 * navigates to a mock social media endpoint, logs the upload motion,
 * and marks the pipeline complete.
 */

const { read, write, log } = require("./state");

let chromium;
try {
  chromium = require("playwright").chromium;
} catch {
  chromium = null;
}

const MOCK_URL = "https://example.com/";

async function run() {
  const state = read();
  const imgs = state.generated_images || [];
  log(`publisher booting // ${imgs.length} asset(s)`);

  if (!imgs.length) {
    log("no payload — aborting");
    write({ status: "pending_approval" });
    return;
  }

  write({ status: "deploying" });

  if (chromium) {
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      log(`navigating to mock endpoint ${MOCK_URL}`);
      await page.goto(MOCK_URL, { timeout: 15000, waitUntil: "domcontentloaded" }).catch(() => undefined);
      for (const img of imgs) {
        log(`uploading ${img.path} (${img.title})`);
        await new Promise((r) => setTimeout(r, 600));
      }
      await browser.close();
    } catch (e) {
      log(`playwright warn: ${e.message || e}`);
    }
  } else {
    for (const img of imgs) {
      log(`uploading (simulated) ${img.path}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  log("deployment complete // all channels pinged");
  write({
    status: "complete",
    approval_status: "approved",
    log: ["mission complete // pipeline returning to idle in 5s"],
  });

  await new Promise((r) => setTimeout(r, 5000));
  write({
    status: "idle",
    scraped_data: [],
    strategy: {},
    html_slides: [],
    generated_images: [],
    approval_status: "pending",
    log: ["[reset] pipeline returned to idle"],
  });
}

run().catch((e) => {
  log(`publisher error: ${e.message || e}`);
  write({ status: "pending_approval" });
});
