/**
 * engine/slide-edit.js
 *
 * In-place AI edit of a single slide (carousel OR single-ad variant).
 * Reads `pending_edit` from tasks.json, asks Claude to rewrite that one
 * slide's HTML given the operator's natural-language edit instruction,
 * re-renders at the correct viewport, writes the updated PNG, clears
 * pending_edit, returns status to pending_approval.
 *
 * Trigger from UI:
 *   PATCH tasks.json → pending_edit: { format, index, prompt }
 *   POST /api/engine → { module: "slide-edit" }
 */

const fs = require("fs");
const path = require("path");
const { read, write, log } = require("./state");
const claude = require("./claude-cli");

let chromium;
try {
  chromium = require("playwright").chromium;
} catch {
  chromium = null;
}

const OUT_DIR = path.join(__dirname, "..", "public", "generated-ads");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// Inline same-origin image paths as base64 data URLs — avoids Chromium's
// file:// cross-origin block when using page.setContent().
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

const VIEWPORTS = {
  carousel: { width: 1080, height: 1350 },
  single_ad: { width: 1080, height: 1080 },
};

function buildPrompt(slide, context, userInstruction) {
  return `You are editing ONE slide in a social media campaign. The operator wants a specific change — apply it precisely without rewriting more than you need to.

=== CAMPAIGN CONTEXT ===
Brand: ${context.brand}
Tone: ${context.tone}
Audience: ${context.audience}
Campaign: ${context.campaign_name}
Core hook: "${context.hook}"
${context.differentiators ? `Differentiators: ${context.differentiators}` : ""}
${context.do_not_say ? `Do NOT use: ${context.do_not_say}` : ""}

=== THIS SLIDE ===
Format: ${context.format} (${context.viewport.width}×${context.viewport.height}px)
Slide ${slide.index}${slide.title ? ` — "${slide.title}"` : ""}
Role: ${slide.role || "n/a"}

=== OPERATOR'S EDIT REQUEST ===
${userInstruction}

=== CURRENT HTML ===
\`\`\`html
${slide.html}
\`\`\`

=== INSTRUCTIONS ===
1. Apply the requested change precisely. Preserve everything else — same visual direction, same palette, same type system, same structure — unless the change explicitly asks you to alter them.
2. The output MUST remain a complete, self-contained HTML document that renders at EXACTLY ${context.viewport.width}×${context.viewport.height}px with overflow:hidden.
3. All CSS inline in a <style> tag. No external resources except Google Fonts via <link rel="stylesheet">.
4. Return ONLY the new HTML document. No prose, no code fences, no commentary before or after.`;
}

async function editWithClaude(slide, context, userInstruction) {
  if (!claude.isAvailable()) {
    throw new Error("Claude CLI not available — editing requires it");
  }
  const prompt = buildPrompt(slide, context, userInstruction);
  log(`→ Claude edit: slide ${slide.index} (${context.format}) · "${userInstruction.slice(0, 60)}"`);
  const raw = await claude.prompt(prompt, { timeoutMs: 180_000 });
  log(`← Claude returned ${raw.length} chars`);
  // Strip optional code fences
  let html = raw.trim();
  const fenced = html.match(/^```(?:html)?\s*([\s\S]*?)```\s*$/);
  if (fenced) html = fenced[1].trim();
  if (!html.toLowerCase().includes("<html")) {
    throw new Error("Claude returned non-HTML output");
  }
  return html;
}

async function renderOne(html, filePath, viewport) {
  if (!chromium) throw new Error("Playwright not installed");
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.setContent(rewritePublicPaths(html), { waitUntil: "networkidle" });
    await page.screenshot({ path: filePath, type: "png" });
  } finally {
    await browser.close();
  }
}

async function run() {
  const state = read();
  const edit = state.pending_edit;
  if (!edit) {
    log("no pending_edit in state — nothing to do");
    return;
  }
  const { format, index, prompt: userInstruction } = edit;
  log(`slide-edit booting // ${format} slide ${index}: "${userInstruction.slice(0, 80)}"`);

  write({ status: "generating_visuals" });

  // Locate the slide and build render context
  let slide;
  let outputPath;
  let publicPath;
  let viewport;
  let updatedList;
  let listField;

  // Higgsfield-rendered slides have no HTML to edit — guide operator to the
  // right action (toggle off + re-forge, or tweak the Higgsfield prompt).
  const strategyCheck = state.strategy || {};
  if (format === "carousel") {
    const outlineSlide = (strategyCheck.carousel_outline || []).find((s) => s.slide === index);
    if (outlineSlide?.higgsfield_rendered) {
      throw new Error(
        `slide ${index} was generated by Higgsfield — AI edit works only on HTML slides. Update the slide's Higgsfield prompt and re-forge, or toggle Higgsfield off to switch to HTML design.`,
      );
    }
  } else if (format === "single_ad") {
    const concept = (strategyCheck.single_ad_concepts || []).find((c) => c.variant === index);
    if (concept?.higgsfield_rendered) {
      throw new Error(
        `variant ${index} was generated by Higgsfield — AI edit works only on HTML variants. Update the Higgsfield prompt and re-forge, or toggle Higgsfield off.`,
      );
    }
  }

  if (format === "carousel") {
    const slides = state.html_slides || [];
    slide = slides.find((s) => s.index === index);
    if (!slide) throw new Error(`carousel slide ${index} not found`);
    const file = `slide_${String(index).padStart(2, "0")}.png`;
    outputPath = path.join(OUT_DIR, file);
    publicPath = `/generated-ads/${file}`;
    viewport = VIEWPORTS.carousel;
    updatedList = [...(state.generated_images || [])];
    listField = "generated_images";
  } else if (format === "single_ad") {
    const ads = state.html_single_ads || [];
    slide = ads.find((a) => a.variant === index);
    if (!slide) throw new Error(`single-ad variant ${index} not found`);
    // Normalize to the shape editWithClaude expects
    slide = { index: slide.variant, title: slide.concept, role: slide.concept, html: slide.html };
    const file = `ad_${String(index).padStart(2, "0")}.png`;
    outputPath = path.join(OUT_DIR, file);
    publicPath = `/generated-ads/${file}`;
    viewport = VIEWPORTS.single_ad;
    updatedList = [...(state.generated_single_ads || [])];
    listField = "generated_single_ads";
  } else {
    throw new Error(`unknown format: ${format}`);
  }

  // Build campaign context from brain + strategy
  const brain = state.brain || {};
  const strategy = state.strategy || {};
  const context = {
    format,
    viewport,
    brand: brain.business_name || "The Brand",
    tone: brain.tone || strategy.tone || "Confident, direct",
    audience: brain.target_audience || strategy.target_audience || "general",
    campaign_name: strategy.campaign_name || "Campaign",
    hook: strategy.hook || "",
    differentiators: brain.differentiators?.join(" · ") || "",
    do_not_say: brain.do_not_say || "",
  };

  const newHtml = await editWithClaude(slide, context, userInstruction);

  // Persist new HTML back into the correct state array
  if (format === "carousel") {
    const nextSlides = (state.html_slides || []).map((s) =>
      s.index === index ? { ...s, html: newHtml } : s,
    );
    write({ html_slides: nextSlides });
  } else {
    const nextAds = (state.html_single_ads || []).map((a) =>
      a.variant === index ? { ...a, html: newHtml } : a,
    );
    write({ html_single_ads: nextAds });
  }

  log(`re-rendering ${format} slide ${index}`);
  await renderOne(newHtml, outputPath, viewport);
  log(`✓ rendered ${publicPath}`);

  // Keep the generated image list intact (path is stable, PNG is overwritten).
  // Browsers cache by URL, so bump a cache-buster via the ?v= trick that the
  // UI already uses on preview URLs — nothing else to do here.

  write({
    approval_status: "pending",
    pending_edit: null,
    log: [`[edit] ${format} slide ${index} updated via claude`],
  });

  // An AI edit changes a creative, so its previous Jev score is stale.
  // Rescore before marking pending_approval. Falls back cleanly if no key.
  try {
    await require("./virality-score").run();
  } catch (e) {
    log(`slide-edit: virality-score failed non-fatally: ${e.message || e}`);
    write({ status: "pending_approval" });
  }
  log("slide edit complete");
}

run().catch((e) => {
  log(`slide-edit error: ${e.message || e}`);
  write({
    status: "pending_approval",
    pending_edit: null,
  });
});
