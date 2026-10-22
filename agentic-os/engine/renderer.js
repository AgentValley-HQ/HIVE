/**
 * engine/renderer.js
 * Takes html_slides from tasks.json, renders each at 1080x1350 via
 * Playwright, saves PNGs to /public/generated-ads, and promotes
 * state to pending_approval.
 *
 * If Playwright isn't installed yet, we write the HTML next to the
 * expected PNG path and emit a blank placeholder so the pipeline
 * still advances cleanly.
 */

const fs = require("fs");
const path = require("path");
const { read, write, log } = require("./state");

let chromium;
try {
  chromium = require("playwright").chromium;
} catch {
  chromium = null;
}

const OUT_DIR = path.join(__dirname, "..", "public", "generated-ads");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

function ensureDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/**
 * Playwright's page.setContent() has no base URL, and Chromium blocks file://
 * fetches from about:blank origin for security. Simplest robust fix: inline
 * the image bytes as base64 data URLs so no network fetch is needed.
 */
function rewritePublicPaths(html) {
  return html.replace(
    /(src|href)=(["'])(\/(?:uploads|generated-ads|intel-thumbs)\/[^"']+)\2/g,
    (orig, attr, quote, pathAbs) => {
      try {
        const absDisk = path.join(PUBLIC_DIR, pathAbs);
        if (!fs.existsSync(absDisk)) return orig;
        const ext = path.extname(absDisk).toLowerCase();
        const mime = MIME_BY_EXT[ext] || "application/octet-stream";
        const b64 = fs.readFileSync(absDisk).toString("base64");
        return `${attr}=${quote}data:${mime};base64,${b64}${quote}`;
      } catch {
        return orig;
      }
    },
  );
}

// Merge newly-rendered entries into generated_images, preserving any
// Higgsfield-generated entries that are already there.
function mergeIntoState(entries) {
  const state = read();
  const existing = state.generated_images || [];
  const indexes = new Set(entries.map((e) => e.index));
  const kept = existing.filter((e) => !indexes.has(e.index));
  const merged = [...kept, ...entries].sort((a, b) => a.index - b.index);
  write({ generated_images: merged });
  return merged;
}

async function renderWithPlaywright(slides) {
  // --allow-file-access-from-files lets setContent() pages load file:// URLs
  // (needed for /uploads/ images rewritten via pathToFileURL).
  const browser = await chromium.launch({
    headless: true,
    args: ["--allow-file-access-from-files"],
  });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const outputs = [];
  for (const s of slides) {
    const file = `slide_${String(s.index).padStart(2, "0")}.png`;
    const abs = path.join(OUT_DIR, file);
    const html = rewritePublicPaths(s.html);
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({ path: abs, type: "png", omitBackground: false });
    outputs.push({ index: s.index, path: `/generated-ads/${file}`, title: s.title });
    log(`rendered slide ${s.index} // ${file}`);
    // Update tasks.json after each render so the UI shows progress live —
    // but preserve any Higgsfield-generated entries already in state.
    mergeIntoState(outputs);
  }
  await browser.close();
  return outputs;
}

async function renderFallback(slides) {
  const outputs = [];
  for (const s of slides) {
    const file = `slide_${String(s.index).padStart(2, "0")}.png`;
    const abs = path.join(OUT_DIR, file);
    // Minimal 1x1 transparent PNG as placeholder.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    fs.writeFileSync(abs, png);
    fs.writeFileSync(abs.replace(/\.png$/, ".html"), s.html, "utf-8");
    outputs.push({ index: s.index, path: `/generated-ads/${file}`, title: s.title });
    log(`playwright absent — wrote placeholder+html for slide ${s.index}`);
    mergeIntoState(outputs);
    await new Promise((r) => setTimeout(r, 300));
  }
  return outputs;
}

async function run() {
  const state = read();
  const slides = state.html_slides || [];
  const existingImages = state.generated_images || [];
  const higgsfieldOnly = slides.length === 0 && existingImages.length > 0;

  log(
    `renderer booting // ${slides.length} HTML slide(s) + ${existingImages.length} pre-rendered`,
  );

  if (slides.length === 0 && existingImages.length === 0) {
    log("nothing to render — aborting");
    write({ status: "strategizing" });
    return;
  }

  ensureDir();

  // Only wipe HTML files + slide PNGs that AREN'T already in generated_images
  // (those are Higgsfield outputs written during this forge — don't delete them).
  const keep = new Set(
    existingImages.map((e) => path.basename(e.path || "")).filter(Boolean),
  );
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (/^slide_.*\.html$/.test(f)) {
      fs.unlinkSync(path.join(OUT_DIR, f));
    } else if (/^slide_.*\.png$/.test(f) && !keep.has(f)) {
      fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }

  write({ status: "generating_visuals" });

  if (higgsfieldOnly) {
    log("every slide was produced by Higgsfield — skipping Playwright");
  } else {
    const outputs = chromium
      ? await renderWithPlaywright(slides)
      : await renderFallback(slides);
    mergeIntoState(outputs);
  }

  const final = (read().generated_images || []).sort((a, b) => a.index - b.index);
  write({
    approval_status: "pending",
    generated_images: final,
    log: [`forge complete // ${final.length} frames awaiting human review`],
  });

  // Hand off to virality-score — it writes status "scoring" then
  // "pending_approval" when done, or straight to "pending_approval" when
  // TYPESAFE_API_KEY isn't set. Never blocks the pipeline on scoring.
  try {
    await require("./virality-score").run();
  } catch (e) {
    log(`renderer: virality-score failed non-fatally: ${e.message || e}`);
    write({ status: "pending_approval" });
  }
}

run().catch((e) => {
  log(`renderer error: ${e.message || e}`);
  write({ status: "strategizing" });
});
