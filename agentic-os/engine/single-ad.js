/**
 * engine/single-ad.js
 *
 * Standalone pipeline for single-image Meta ads.
 * Design (Claude or template fallback) → render → write to tasks.json.
 *
 * Format: 1080×1080 (standard Meta feed ad). 3 variants per generation
 * so operator can A/B test hooks, layouts, and visual approaches.
 */

const fs = require("fs");
const path = require("path");
const { read, write, log } = require("./state");
const claude = require("./claude-cli");
const { processPending: processHiggsfieldPending } = require("./higgsfield-gen");

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

// Inline same-origin image paths as base64 data URLs — bypasses the Chromium
// file:// cross-origin restriction when using page.setContent().
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
const VIEWPORT = { width: 1080, height: 1080 };
const DSF = 2;

// ──────────────────────────────────────────────────────────────────────────────
// Claude-powered design
// ──────────────────────────────────────────────────────────────────────────────

function systemPrompt() {
  return `You are a senior art director at a top brand agency, designing single-image Meta ads for a real client brand. Not a demo. Not an AI showcase. Production work.

Your job: produce EXACTLY 3 ad variants as complete, self-contained HTML documents. Each renders at EXACTLY 1080×1080 pixels (Meta square feed ad format).

HARD CONSTRAINTS:
- Each variant is a FULL HTML document starting with <!doctype html>
- body width/height EXACTLY 1080px × 1080px with overflow:hidden — nothing scrolls
- All CSS inline in <style>. No external images, no <script>. Google Fonts via <link rel="stylesheet"> IS allowed and encouraged.

EACH AD MUST CONTAIN (composed per the concept's direction):
- A punchy OFFER / HEADLINE (4-10 words, massive type)
- A SOCIAL PROOF STAT if one is provided in the brand brief (never invent one — see below)
- CLEAR CTA (phrase OR button — depends on composition)
- Brand name small + subtle somewhere

══ ANTI-SLOP RULES — NON-NEGOTIABLE ══

Your output often reads as "AI-generated creative" and that is UNACCEPTABLE for client work. Kill these tells:

❌ Too many decorative micro-elements (dots, scanlines, brackets, corner marks, HUD chips, floating pills)
❌ Cyberpunk / terminal / "futuristic" theming applied to brands that aren't actually tech-brutalist
❌ Default neon (#00f0ff, #ff00e5, #b6ff00) when the brand has its own colors
❌ "V01 / VARIANT-1" HUD tags visible in the composition
❌ Multiple competing visual systems (gradient + geometric + 3 text effects + icons) all at once
❌ Cream backgrounds (#F4F1EA) + italic Georgia serif + terracotta accents
❌ Centered-everything with generic padding
❌ Fabricating stats or social proof numbers when none are provided — see rule below

✅ Do instead:
✅ ONE primary hero element per variant + ONE supporting visual element — not three competing systems
✅ 2-3 colors maximum, drawn from BRAND COLORS provided (not default neon unless the brand is actually tech-brutalist)
✅ ONE typeface family across all 3 variants
✅ MASSIVE type — hero text 180-280px on single ads (bigger than carousel because square format)
✅ Deliberate negative space; the ad should feel confident, not busy

══ VISUAL ELEMENTS REQUIRED — CLEAN ≠ PLAIN ══

"Clean copy" doesn't mean "pure text on a background." Every variant MUST include at least one substantial VISUAL element (not UI chrome) so the ad feels designed, not like a text document. Pick from:

- Large inline SVG geometric shape (circle, diagonal, arrow, bold form) — 300-700px, scaled as a HERO element
- Bold color-block composition (e.g. background split 50/50 or 60/40 into two brand colors)
- Oversized number as a graphic element (e.g. "48" for countdown, "10M+" as hero number)
- Simple data viz: horizontal bar, numbered steps row, progress ring, 2x2 or 3x3 grid of outcomes
- Icon-scale inline SVG (60-120px) paired with text
- Diagonal stripe or color band crossing the composition
- Operator-uploaded photo/logo if provided (use the <img> tag, no destructive filters)

VISUAL/TEXT RATIO: ~60% composition weight / ~40% text content.

Vary the visual device across the 3 variants — don't repeat the same device three times:
- V1 (proof-forward): oversized number treatment (e.g. "10M+" as giant hero graphic with small context around it)
- V2 (hook-forward): color-block composition with headline inset
- V3 (urgency-visual): bold geometric/diagonal shape + punchy copy — the most visually assertive of the three

TYPOGRAPHY — pick ONE Google Fonts pairing, use across all 3 variants:
- "Inter" 900 + 400 (clean modern SaaS, Linear/Stripe-style)
- "Instrument Serif" + "Inter" (editorial-modern mix)
- "Satoshi" or "Space Grotesk" bold + regular (confident geometric sans)
- "Fraunces" + "Inter" (serif hero with sans body)
- "Archivo Black" + regular (brutalist condensed)

VARIANT STRATEGY — 3 variants take DIFFERENT angles, honor the concept tags provided:
- Each variant's HTML must match its CONCEPT and HEADLINE/VISUAL DIRECTION from the brief
- Variants share palette + type family + grid; only composition varies

SOCIAL PROOF RULE: Only use social-proof numbers that appear in BRAND DIFFERENTIATORS. Do NOT fabricate stats. If no proof number is provided, lean on the offer and brand voice instead of inventing credibility.

OUTPUT FORMAT — exactly this structure, nothing else:

=== VARIANT 1 ===
CONCEPT: proof-forward
RATIONALE: 1 sentence (max 30 words) — WHY this angle for THIS brand given the campaign/competitor intel. The operator reads this to understand your strategic thinking.
\`\`\`html
<!doctype html>
<html>
<head>...<style>...</style></head>
<body>...</body>
</html>
\`\`\`

=== VARIANT 2 ===
CONCEPT: hook-forward
RATIONALE: ...
\`\`\`html
...
\`\`\`

=== VARIANT 3 ===
CONCEPT: urgency-visual
RATIONALE: ...
\`\`\`html
...
\`\`\`

Every variant's RATIONALE line is REQUIRED. Keep it to one sentence.
`;
}

function userPrompt(strategy, brain) {
  const brandName = brain?.business_name || "The Brand";
  const tone = brain?.tone || strategy?.tone || "Confident, direct";
  const audience = brain?.target_audience || strategy?.target_audience || "general";
  const diffs = brain?.differentiators?.length
    ? `\nBRAND DIFFERENTIATORS: ${brain.differentiators.join(" · ")}`
    : "";
  const offerings = brain?.offerings?.length
    ? `\nOFFERINGS: ${brain.offerings.join(" · ")}`
    : "";
  const cta = brain?.current_cta || "Learn more";
  const dnc = brain?.do_not_say
    ? `\nDO NOT USE: ${brain.do_not_say}`
    : "";

  const brandColors = brain?.brand_colors?.length
    ? `\n\nBRAND COLORS (use these as PRIMARY palette — not default neon):
${brain.brand_colors
  .slice(0, 6)
  .map((c) => `  ${c.hex}${c.role ? `  (${c.role})` : ""}`)
  .join("\n")}
Build the design system around these. Pair with white, off-white, charcoal, or black for neutrals as needed. Do NOT introduce neon accents unless the brand palette contains them.`
    : "\n\nBRAND COLORS: None provided — pick a disciplined 2-color palette matching the brand tone. Avoid default neon.";

  // Visual intel from competitor thumbnails
  const vi = strategy?.visual_intel;
  const visualIntelBlock = vi
    ? `\n\n══ COMPETITOR VISUAL CODES OBSERVED ══
After studying ${vi.per_ad?.length || 0} real competitor ad images:
- Composition dominant: ${vi.patterns.composition_dominant}
- Imagery dominant: ${vi.patterns.imagery_dominant}
- Palette vibe: ${vi.patterns.palette_vibe}
- Typography feel: ${vi.patterns.typography_feel}
- Text density: ${vi.patterns.text_density}
- Visual energy: ${vi.patterns.visual_energy}

DESIGN PRESCRIPTION (from visual analyst): ${vi.design_prescription}

Design each variant in a SIMILAR concept to the competitor set — same visual energy, same composition density, same imagery role. Do NOT copy specific layouts or text. Use OUR BRAND COLORS from above. Goal: our ads should feel native to this feed, not like generic AI output.`
    : "";

  const hook = strategy?.hook || `The ${brandName} shortcut`;
  const campaign = strategy?.campaign_name || "Launch campaign";

  // Operator-defined concepts live on strategy.single_ad_concepts.
  // Any variant with higgsfield_rendered:true is being produced by Higgsfield
  // as a finished image — the HTML designer skips those entirely.
  // If missing (first run on an older strategy), fall back to the 3 defaults.
  const allConcepts = Array.isArray(strategy?.single_ad_concepts) && strategy.single_ad_concepts.length
    ? strategy.single_ad_concepts
    : [
        {
          variant: 1,
          concept: "proof-forward",
          rationale: "Lead with social proof — stops the scroll",
          headline_direction: "Oversized stat as hero",
          visual_direction: "Minimal palette, type-first",
          image: null,
        },
        {
          variant: 2,
          concept: "hook-forward",
          rationale: "Classic direct-response hook",
          headline_direction: "Hero headline with offer",
          visual_direction: "High-contrast, bold sans",
          image: null,
        },
        {
          variant: 3,
          concept: "urgency-visual",
          rationale: "Scarcity + bold visual anchor",
          headline_direction: "Short urgent phrasing",
          visual_direction: "Geometric blocks, countdown motif",
          image: null,
        },
      ];
  // Only pass variants that are (a) ticked for this forge AND (b) not being
  // produced by Higgsfield.
  const concepts = allConcepts.filter(
    (c) => c.include_in_forge !== false && !c.higgsfield_rendered,
  );
  const skippedCount = allConcepts.length - concepts.length;
  const skippedNote = skippedCount
    ? `\n\nNOTE: ${skippedCount} variant(s) are being generated by a separate image pipeline (Higgsfield) OR were preserved by the operator (unticked for this forge) and are NOT in the brief below. Use ORIGINAL variant numbers (shown in each V marker) so they land in the right slot — do not renumber starting from 1.`
    : "";

  const conceptsStr = concepts
    .map((c) => {
      const img = c.image?.path
        ? `\n    ⚠ OPERATOR UPLOADED IMAGE: ${c.image.path}${c.image.note ? ` — note: "${c.image.note}"` : ""}\n    → You MUST include <img src="${c.image.path}"> prominently in V${c.variant}'s HTML. Compose boldly around it — hero crop, overlay, mask into shape, use as background with text overlay. Not a tiny corner thumbnail.`
        : "";
      return `  V${c.variant} · ${c.concept}
    RATIONALE: ${c.rationale}
    HEADLINE DIRECTION: ${c.headline_direction}
    VISUAL DIRECTION: ${c.visual_direction}${img}`;
    })
    .join("\n\n");

  const imagesCount = concepts.filter((c) => c.image?.path).length;
  const imageInstruction = imagesCount
    ? `\n\n══ IMAGE INTEGRATION — ABSOLUTE REQUIREMENT ══

${imagesCount} variant(s) above have an "OPERATOR UPLOADED IMAGE" line. Each one is a REAL IMAGE FILE that MUST appear in that variant's rendered HTML.

HARD RULES — your response WILL FAIL VALIDATION if you violate any of these:

1. For EVERY variant with an "OPERATOR UPLOADED IMAGE" line in its brief, the generated HTML MUST contain exactly one <img src="/uploads/..."> element referencing that exact path. If you don't include it, the response is rejected.

2. The <img> must be VISUALLY PROMINENT — it is the hero/primary visual of the composition. Minimum displayed size: at least 40% of the ad's width OR height. Not a corner icon, not a decorative background accent, not a thumbnail. The IMAGE is the ad; your text layers around/on top of it.

3. NEVER apply any of these CSS to the uploaded image:
   - filter: brightness(0), invert(1), grayscale(), sepia(), hue-rotate() — destroys the brand colors
   - opacity below 0.9 — makes it invisible/watermark
   - mix-blend-mode: multiply, difference, exclusion — distorts colors

4. Acceptable CSS on the uploaded image: width, height, object-fit (cover/contain), border-radius, box-shadow, position (relative/absolute), transform (scale/translate), aspect-ratio.

5. If operator note is "logo" → render at native colors, native aspect ratio, prominent header position, min 80px height.
   If operator note describes a product shot / portrait / lifestyle photo → make it the HERO (hero crop, background-fill with text overlay, or large inline hero block). Min 50% of frame.
   If operator note describes an abstract/texture/background image → use as background-fill behind text with sufficient contrast overlay.

6. Only ONE <img> per variant that has an uploaded image. No duplicates.

Before you output each variant's HTML, verify: does its HTML contain the exact <img src="..."> path from its brief? If not, add it before outputting.`
    : "";

  return `BRAND: ${brandName}
TONE: ${tone}
AUDIENCE: ${audience}${diffs}${offerings}
CURRENT CTA: ${cta}${dnc}${brandColors}${visualIntelBlock}

CAMPAIGN CONTEXT: ${campaign}
CORE HOOK: "${hook}"

ONLY use social-proof numbers that are grounded in BRAND DIFFERENTIATORS above. Do NOT invent made-up stats. If no proof numbers are provided, lean on tone and offer instead of fabricating credibility.${skippedNote}

=== ${concepts.length} AD CONCEPT(S) TO EXECUTE ===
${conceptsStr}${imageInstruction}

Design each of the ${concepts.length} variant(s) to match its concept exactly — same variant number, same concept tag. Set each variant's RATIONALE line to the rationale provided above. Return exactly the OUTPUT FORMAT specified — nothing else.`;
}

function extractVariants(raw) {
  if (!raw) return [];
  const variants = [];
  // Match: === VARIANT N === ... CONCEPT: xxx ... RATIONALE: xxx ... ```html ... ```
  const re =
    /===\s*VARIANT\s+(\d+)\s*===([\s\S]*?)```(?:html)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const variant = parseInt(m[1], 10);
    const metaBlock = m[2] || "";
    const html = (m[3] || "").trim();
    if (!html || !html.toLowerCase().includes("<html")) continue;

    const conceptMatch = metaBlock.match(/CONCEPT:\s*([^\n]+)/i);
    const rationaleMatch = metaBlock.match(/RATIONALE:\s*([^\n]+(?:\n(?!CONCEPT:|RATIONALE:|```)[^\n]+)*)/i);
    const concept = (conceptMatch?.[1] || "").trim() || `variant-${variant}`;
    const concept_rationale = (rationaleMatch?.[1] || "").trim();

    variants.push({ variant, concept, concept_rationale, html });
  }
  return variants.sort((a, b) => a.variant - b.variant);
}

async function viaClaude(strategy, brain) {
  if (!claude.isAvailable()) {
    log("claude CLI not detected — single-ad designer skipped");
    return null;
  }
  // How many variants is Claude actually responsible for?
  const toDesign = (strategy?.single_ad_concepts || []).filter(
    (c) => c.include_in_forge !== false && !c.higgsfield_rendered,
  );
  if (toDesign.length === 0) {
    log("all variants are Higgsfield-rendered — HTML designer not needed");
    return [];
  }
  const prompt = `${systemPrompt()}\n\n${userPrompt(strategy, brain)}`;
  log(
    `→ Claude CLI: designing ${toDesign.length} single-ad variant(s) (prompt=${prompt.length} chars) — ~45-60s`,
  );
  try {
    const raw = await claude.prompt(prompt, { timeoutMs: 300_000 });
    log(`← Claude CLI: ${raw.length} chars returned`);
    const variants = extractVariants(raw);
    if (variants.length < toDesign.length) {
      log(
        `Claude returned only ${variants.length}/${toDesign.length} variants — falling back to template`,
      );
      return null;
    }
    return variants.slice(0, toDesign.length);
  } catch (e) {
    log(`Claude single-ad error: ${e.message || e} — falling back to template`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Static template fallback
// ──────────────────────────────────────────────────────────────────────────────

// Disciplined palettes — real brand feel, not neon slop. Only used when the
// brain has no brand_colors; otherwise we build from those.
const DEFAULT_PALETTES = [
  // Modern dark (Linear/Vercel-ish)
  { bg: "#0a0a0a", fg: "#f5f5f5", accent: "#ffffff", muted: "#737373" },
  // Warm newspaper (editorial)
  { bg: "#f5f1ea", fg: "#1a1a1a", accent: "#1a1a1a", muted: "#8a8275" },
  // Startup bold (Stripe-ish)
  { bg: "#ffffff", fg: "#0a0a0a", accent: "#635bff", muted: "#6b7280" },
];

function paletteFromBrain(brain, idx) {
  const colors = brain?.brand_colors;
  if (!colors || colors.length === 0) return DEFAULT_PALETTES[idx % DEFAULT_PALETTES.length];
  // Build a palette from the brain's first 2 colors + sensible neutrals
  const primary = colors[0]?.hex || "#0a0a0a";
  const accent = colors[1]?.hex || primary;
  // Decide dark or light bg based on primary's luminance
  const r = parseInt(primary.slice(1, 3), 16);
  const g = parseInt(primary.slice(3, 5), 16);
  const b = parseInt(primary.slice(5, 7), 16);
  const lum = (r + g + b) / 3;
  const dark = lum < 128;
  return {
    bg: dark ? "#0a0a0a" : "#ffffff",
    fg: dark ? "#f5f5f5" : "#0a0a0a",
    accent: primary,
    accent2: accent,
    muted: dark ? "#737373" : "#6b7280",
  };
}

// Rough fit — pick a font size based on text length so hero copy doesn't overflow
function fitHeroSize(text, max = 160, min = 56) {
  const len = (text || "").length;
  if (len <= 12) return max;
  if (len <= 20) return 128;
  if (len <= 30) return 96;
  if (len <= 50) return 76;
  if (len <= 80) return 60;
  return min;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function templateVariant({ variant, concept, hero, sub, cta, brand, palette, isProof }) {
  const p = palette;
  const heroSize = fitHeroSize(hero, isProof ? 180 : 120, 48);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px; height: 1080px;
    background: ${p.bg};
    color: ${p.fg};
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    position: relative;
    overflow: hidden;
  }
  .frame {
    position: absolute; inset: 72px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .brand {
    font-size: 20px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: ${p.muted};
  }
  .hero {
    font-size: ${heroSize}px;
    line-height: 0.98;
    letter-spacing: -0.03em;
    font-weight: 900;
    color: ${p.fg};
    max-width: 100%;
    word-wrap: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
  }
  .hero .accent { color: ${p.accent}; }
  .sub {
    font-size: 28px;
    line-height: 1.35;
    color: ${p.muted};
    max-width: 760px;
    margin-top: 28px;
    font-weight: 400;
  }
  .cta {
    display: inline-flex; align-items: center; gap: 12px;
    padding: 22px 36px;
    background: ${p.accent};
    color: ${p.bg};
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    border-radius: 12px;
  }
</style>
</head>
<body>
  <div class="frame">
    <div class="brand">${escapeHtml(brand)}</div>
    <div>
      <div class="hero">${escapeHtml(hero)}</div>
      ${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ""}
    </div>
    <div>
      <span class="cta">${escapeHtml(cta)} →</span>
    </div>
  </div>
</body>
</html>`;
}

function templateVariants(strategy, brain) {
  const brand = brain?.business_name || "Your Brand";
  const cta = (brain?.current_cta || "Learn more").replace(/\.$/, "");
  // Keep hero copy SHORT (template can't layout long copy well). Trim aggressively.
  const fullHook = (strategy?.hook || "").trim();
  const shortHook = fullHook.length > 50
    ? fullHook.split(/[.!?]/)[0].slice(0, 50).trim()
    : fullHook || "The shortcut you've been waiting for";

  // Only use REAL stats from brain differentiators — do NOT fabricate.
  const realStat = brain?.differentiators?.find((d) => /\d/.test(d)) || "";

  // Skip any variant Higgsfield is producing OR unticked — template only
  // covers variants being actively regenerated via Claude HTML.
  const sourceConcepts = (strategy?.single_ad_concepts || []).filter(
    (c) => c.include_in_forge !== false && !c.higgsfield_rendered,
  );
  const defaults = [
    { concept: "proof-forward", rationale: `Lead with the social proof stat — competitors rarely lead with numbers, so a stat-first hero stops the scroll.` },
    { concept: "hook-forward", rationale: `Lead with the promise, let supporting detail follow — classic hook-driven direct response.` },
    { concept: "urgency-visual", rationale: `Short, confident framing — no cliché "LAST CHANCE" ribbon, just the offer with urgency implied in brevity.` },
  ];

  const list = sourceConcepts.length
    ? sourceConcepts
    : defaults.map((d, i) => ({ variant: i + 1, concept: d.concept, rationale: d.rationale }));

  return list.map((c, i) => {
    const concept = c.concept || defaults[i]?.concept || "variant";
    const isProof = concept.toLowerCase().includes("proof");
    const isHook = concept.toLowerCase().includes("hook");

    let hero, sub;
    if (isProof && realStat) {
      const m = realStat.match(/^([\d.]+[KMB]?\+?)\s*(.+)/i);
      if (m) {
        hero = m[1];
        sub = m[2].slice(0, 80);
      } else {
        hero = realStat.slice(0, 30);
        sub = shortHook;
      }
    } else if (isHook) {
      hero = shortHook;
      sub = realStat || "";
    } else {
      hero = shortHook;
      sub = realStat || "";
    }

    return {
      variant: c.variant || i + 1,
      concept,
      concept_rationale: c.rationale || defaults[i]?.rationale || "",
      html: templateVariant({
        variant: c.variant || i + 1,
        concept,
        hero,
        sub,
        cta,
        brand,
        palette: paletteFromBrain(brain, i),
        isProof,
      }),
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Render helpers
// ──────────────────────────────────────────────────────────────────────────────

// Merge newly-rendered entries into generated_single_ads while preserving
// any Higgsfield entries already in state.
function mergeAdsIntoState(entries) {
  const state = read();
  const existing = state.generated_single_ads || [];
  const variants = new Set(entries.map((e) => e.variant));
  const kept = existing.filter((e) => !variants.has(e.variant));
  const merged = [...kept, ...entries].sort((a, b) => a.variant - b.variant);
  write({ generated_single_ads: merged });
  return merged;
}

async function renderWithPlaywright(variants) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DSF });
  const page = await ctx.newPage();
  const outputs = [];
  for (const v of variants) {
    const file = `ad_${String(v.variant).padStart(2, "0")}.png`;
    const abs = path.join(OUT_DIR, file);
    await page.setContent(rewritePublicPaths(v.html), { waitUntil: "networkidle" });
    await page.screenshot({ path: abs, type: "png" });
    outputs.push({
      variant: v.variant,
      concept: v.concept,
      concept_rationale: v.concept_rationale || "",
      path: `/generated-ads/${file}`,
    });
    log(`rendered ad variant ${v.variant} // ${file}`);
    mergeAdsIntoState(outputs);
  }
  await browser.close();
  return outputs;
}

async function renderFallback(variants) {
  const outputs = [];
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  for (const v of variants) {
    const file = `ad_${String(v.variant).padStart(2, "0")}.png`;
    const abs = path.join(OUT_DIR, file);
    fs.writeFileSync(abs, png);
    fs.writeFileSync(abs.replace(/\.png$/, ".html"), v.html, "utf-8");
    outputs.push({
      variant: v.variant,
      concept: v.concept,
      concept_rationale: v.concept_rationale || "",
      path: `/generated-ads/${file}`,
    });
    log(`playwright absent — wrote placeholder+html for ad variant ${v.variant}`);
    mergeAdsIntoState(outputs);
  }
  return outputs;
}

// ──────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ──────────────────────────────────────────────────────────────────────────────

async function run() {
  const state = read();
  const brain = state.brain || {};

  if (!state.strategy?.campaign_name) {
    log("no strategy in state — run recon + strategy first");
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Only variants ticked for this forge are generated AND appear in the
  // output. Unticked variants are EXCLUDED entirely.
  const allConcepts = state.strategy?.single_ad_concepts || [];
  const toForge = allConcepts.filter((c) => c.include_in_forge !== false);
  const skippedCount = allConcepts.length - toForge.length;
  log(
    `single-ad booting // ${toForge.length}/${allConcepts.length} variant(s) ticked${
      skippedCount ? ` (${skippedCount} excluded from output)` : ""
    }`,
  );

  if (toForge.length === 0) {
    log("no variants ticked — nothing to forge");
    write({ status: "pending_approval", log: ["[single-ad] no variants ticked — skipped"] });
    return;
  }

  // Clear ALL ad PNG + HTML — only ticked variants will be regenerated,
  // and unticked variants should not linger on disk.
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (/^ad_.*\.(png|html)$/.test(f)) fs.unlinkSync(path.join(OUT_DIR, f));
  }

  // Reset Higgsfield flags on every variant. Ticked variants re-mark
  // themselves during this forge; unticked ones simply won't produce output.
  const resetConcepts = allConcepts.map((c) => {
    const { higgsfield_rendered, higgsfield_path, ...rest } = c;
    return rest;
  });

  write({
    status: "generating_visuals",
    generated_single_ads: [],
    strategy: { ...state.strategy, single_ad_concepts: resetConcepts },
  });

  // 0. Process any Higgsfield-toggled concepts — each produces a FINISHED
  //    ad PNG directly in /generated-ads/, marks that variant as
  //    higgsfield_rendered so the HTML designer skips it below.
  log("processing Higgsfield-toggled concepts (if any)");
  await processHiggsfieldPending("single_ad");

  // Re-read state so designer sees the Higgsfield flags
  const freshState = read();
  const strategy = freshState.strategy || {};

  const toDesign = (strategy.single_ad_concepts || []).filter(
    (c) => c.include_in_forge !== false && !c.higgsfield_rendered,
  );

  let variants = [];
  let source = "none";
  if (toDesign.length > 0) {
    const fromClaude = await viaClaude(strategy, brain);
    if (fromClaude && fromClaude.length > 0) {
      variants = fromClaude;
      source = "claude";
    } else {
      variants = templateVariants(strategy, brain);
      source = "template";
    }
    log(
      `single-ad designed via ${source} (${variants.length} variant${variants.length === 1 ? "" : "s"})`,
    );
  } else {
    log("every variant is Higgsfield-rendered — HTML designer skipped");
  }
  write({ html_single_ads: variants });

  if (variants.length > 0) {
    if (chromium) {
      await renderWithPlaywright(variants);
    } else {
      await renderFallback(variants);
    }
  }

  const finalAds = (read().generated_single_ads || []).sort(
    (a, b) => a.variant - b.variant,
  );

  write({
    approval_status: "pending",
    generated_single_ads: finalAds,
    log: [`single-ad forge complete // ${finalAds.length} variant(s) awaiting approval`],
  });

  // Hand off to virality-score — writes status "scoring" then "pending_approval".
  // If scoring fails or no key is set, falls back to "pending_approval" cleanly.
  try {
    await require("./virality-score").run();
  } catch (e) {
    log(`single-ad: virality-score failed non-fatally: ${e.message || e}`);
    write({ status: "pending_approval" });
  }
}

run().catch((e) => {
  log(`single-ad fatal: ${e.message || e}`);
  write({ status: "strategizing" });
});
