/**
 * engine/carousel-designer.js
 *
 * Asks Claude Code CLI to design 5 bespoke HTML slides for the carousel.
 * Each slide is a complete, self-contained HTML document rendered at 1080×1350
 * by Playwright. Falls back to the static palette templates in templates.js if
 * Claude is unavailable or returns malformed output.
 *
 * Why this exists: static templates all look the same. Claude writes fresh
 * layouts, type scales, and color systems per campaign, informed by the brand's
 * tone and the strategic rationale.
 */

const claude = require("./claude-cli");
const { buildHtmlSlides: templateFallback } = require("./templates");

function systemPrompt() {
  return `You are a senior art director at a top brand design agency, designing a carousel for a real client brand that will run as paid media. Not a demo. Not an AI showcase. Production work that goes in front of their target audience.

Your job: design 5 slides as COMPLETE, self-contained HTML documents, each rendering at EXACTLY 1080×1350 pixels (standard Instagram portrait carousel format).

HARD CONSTRAINTS:
- Each slide is a FULL HTML document starting with <!doctype html>
- Set body width/height to EXACTLY 1080px × 1350px with overflow:hidden — nothing scrolls
- ALL CSS inline in a <style> tag. No external stylesheets, no <script>, no external images
- Google Fonts via <link rel="stylesheet" href="https://fonts.googleapis.com/..."> IS allowed and encouraged for typography
- Each slide must include its slide number small + discreet (e.g. "01/05" in a corner)
- Include the brand name small + subtle somewhere (header or footer)

══ ANTI-SLOP RULES — NON-NEGOTIABLE ══

Your output often looks like "AI-generated creative" and that is UNACCEPTABLE for this client work. The tells to kill:

❌ Too many decorative micro-elements competing: dots, scanlines, brackets, grid overlays, corner marks, HUD chips, tag pills
❌ Cyberpunk / terminal / "futuristic" theming applied to brands that aren't actually tech-brutalist
❌ Default neon palette (cyan/magenta/lime) when the brand's actual colors are different
❌ "V01 / VARIANT-1 / SLIDE-01" HUD-style metadata plastered everywhere
❌ Multiple floating badges, chips, pills, "LIVE" indicators
❌ Default-Claude cream backgrounds (#F4F1EA) + Georgia serif + italic terracotta accents
❌ Centered-everything with generous padding and nothing else
❌ Multiple competing visual systems in one slide (gradient + photo + geometric + 3 text effects)

✅ Do instead:
✅ ONE primary hero element per slide (massive type OR a chart/graphic OR a stat) + ONE supporting visual element — not three competing systems
✅ 2-3 colors maximum, drawn from the BRAND COLORS provided (not neon unless the brand actually is a crypto/dev tool)
✅ ONE typeface family across all 5 slides
✅ MASSIVE type scale — hero headlines 120-200px, body 32-42px, labels 14-18px
✅ Deliberate negative space. The slide should feel confident, not busy
✅ If a decorative element doesn't serve the message, DELETE IT

══ VISUAL ELEMENTS REQUIRED — CLEAN ≠ PLAIN ══

"Clean, minimal copy" is NOT the same as "pure text on a background." Every slide MUST have at least one substantial VISUAL element (not UI chrome) that makes the composition feel designed, not like a text document. Pick from:

- Large inline SVG geometric shape (circle, diagonal, arrow, blob) — 300-600px, scaled as a HERO element
- Bold color-block composition (e.g. background split 60/40 into two brand colors, or diagonal split)
- Oversized number treated as a design element (e.g. a huge "01" or "10M+" as a graphic, not just text)
- Simple data viz: horizontal bar chart, numbered circles in a row, progress ring, 3x3 block grid, calendar grid
- Icon-scale inline SVG illustration (simple geometric, 60-120px)
- Diagonal stripe/band crossing the composition
- Grid of 3-6 small cards/blocks representing data points or steps
- Framed image/photo region using <img> if operator uploaded one; otherwise a colored block in that aspect

VISUAL/TEXT RATIO: Aim for ~60% composition weight (visual + spatial design) / ~40% text. Clean copy with a strong visual anchor BEATS dense copy with weak visuals.

Vary visual elements across the 5 slides — don't repeat the same device. Example progression:
- Slide 1 (hook): oversized number or symbol
- Slide 2 (problem): diagonal split with 2 color blocks
- Slide 3 (solution): grid of small blocks representing features
- Slide 4 (proof): horizontal bar or ring chart with stats
- Slide 5 (cta): bold color block + hero text + arrow motif

TYPOGRAPHY — pick ONE Google Fonts pairing and use across all 5 slides:
- "Inter" 900 + 400 — clean modern SaaS, Linear/Stripe-style
- "Instrument Serif" + "Inter" — editorial-modern mix, strong hero + clean body
- "Satoshi" or "Space Grotesk" bold + regular — confident geometric sans
- "Fraunces" + "Inter" — serif hero with sans body, premium feel
- "Archivo" 900 + regular — brutalist condensed sans
Match the pick to brand tone: minimal/premium → serif; operator/startup → geometric sans; editorial → serif + sans mix.

TONE → DESIGN DIRECTION:
- Operator / dry wit / anti-hype → minimal, type-first, 2 colors, zero decoration, deliberate blank space
- Energetic / urgent → bold color blocks (brand palette), big arrows, confident sans
- Editorial / premium → serif hero, generous whitespace, 1 subtle accent color
- Startup / modern → clean sans-serif, strong grid, brand accent sparingly

OUTPUT FORMAT — exactly this structure, nothing else. No commentary, no markdown prose, just the 5 blocks:

=== SLIDE 1 ===
\`\`\`html
<!doctype html>
<html>
<head>...<style>...</style></head>
<body>...</body>
</html>
\`\`\`

=== SLIDE 2 ===
\`\`\`html
...
\`\`\`

=== SLIDE 3 ===
\`\`\`html
...
\`\`\`

=== SLIDE 4 ===
\`\`\`html
...
\`\`\`

=== SLIDE 5 ===
\`\`\`html
...
\`\`\`
`;
}

function userPrompt(strategy, brain) {
  // Only design slides that (a) are ticked for this forge AND (b) aren't
  // being produced by Higgsfield.
  const outline = (strategy.carousel_outline || []).filter(
    (s) => s.include_in_forge !== false && !s.higgsfield_rendered,
  );
  const brandName = brain?.business_name || "The Brand";
  const tone = brain?.tone || strategy.tone || "Confident, direct";
  const audience = brain?.target_audience || strategy.target_audience || "general";

  const slides = outline
    .map((s) => {
      const base = `  SLIDE ${s.slide} (${s.role}) — Title: "${s.title}" — Body: "${s.body}"`;
      if (s.image?.path) {
        const note = s.image.note ? ` — operator note: "${s.image.note}"` : "";
        return (
          `${base}\n    ⚠ OPERATOR UPLOADED IMAGE: ${s.image.path}${note}\n` +
          `    → You MUST reference this image in slide ${s.slide}'s HTML via <img src="${s.image.path}" ...>. ` +
          `Compose the layout around it (hero image, inline block, mask into a shape, use as background with overlay — your call based on the slide's role).`
        );
      }
      return base;
    })
    .join("\n");

  const slidesWithImages = outline.filter((s) => s.image?.path).length;
  const imageInstruction = slidesWithImages
    ? `\n\n══ IMAGE INTEGRATION — ABSOLUTE REQUIREMENT ══

${slidesWithImages} slide(s) above have an "OPERATOR UPLOADED IMAGE" line. Each is a REAL IMAGE FILE that MUST appear in that slide's rendered HTML.

HARD RULES — your response WILL FAIL VALIDATION if you violate any:

1. For EVERY slide with an "OPERATOR UPLOADED IMAGE" line, the generated HTML MUST contain exactly one <img src="/uploads/..."> element referencing that exact path. No image = rejected response.

2. The <img> must be VISUALLY PROMINENT — hero/primary visual of the composition. Minimum displayed size: at least 40% of the slide's width OR height. Not a corner icon, not a decorative background accent, not a thumbnail. The image IS the slide; text layers around/on top of it.

3. NEVER apply any of these CSS to the uploaded image:
   - filter: brightness(0), invert(1), grayscale(), sepia(), hue-rotate() — destroys brand colors
   - opacity below 0.9 — makes it invisible/watermark
   - mix-blend-mode: multiply, difference, exclusion — distorts colors

4. Acceptable CSS on uploaded images: width, height, object-fit (cover/contain), border-radius, box-shadow, position, transform (scale/translate), aspect-ratio.

5. Interpret the operator note:
   - "logo" → native colors, native aspect ratio, prominent position, min 80px height
   - product shot / portrait / lifestyle photo → HERO element (hero crop or background-fill with text overlay). Min 50% of frame
   - texture / background / abstract → background-fill with contrast overlay for text legibility

6. Only ONE <img> per slide. No duplicates.

Before outputting each slide's HTML, verify: does its HTML contain the exact <img src="..."> path from its brief? If not, add it before outputting.

Images are same-origin — no CORS issues.`
    : "";

  const diffs = brain?.differentiators?.length
    ? `\nBRAND DIFFERENTIATORS: ${brain.differentiators.join(" · ")}`
    : "";
  const dnc = brain?.do_not_say
    ? `\nDO NOT USE: ${brain.do_not_say}`
    : "";

  // Brand colors — override any default/neon palette the model wants to reach for
  const brandColors = brain?.brand_colors?.length
    ? `\n\nBRAND COLORS (use these as the PRIMARY palette — not neon cyan/magenta defaults):
${brain.brand_colors
  .slice(0, 6)
  .map((c) => `  ${c.hex}${c.role ? `  (${c.role})` : ""}`)
  .join("\n")}
Build the design system around these. If more neutrals are needed, pair with off-white (#f8f8f8), charcoal (#1a1a1a), or true black (#000). Do NOT introduce neon accents unless the brand palette itself contains them.`
    : "\n\nBRAND COLORS: None provided — pick a disciplined 2-color palette appropriate to the brand tone. Avoid default neon cyan/magenta.";

  // Visual intel from competitor thumbnails — grounds design in what's actually working
  const vi = strategy.visual_intel;
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

Design in a SIMILAR concept to the competitor set — same visual energy level, same composition density, same imagery role. Do NOT copy specific layouts or text. Use OUR BRAND COLORS from above (not competitor colors). The goal: our carousel should look like it belongs in the same feed as the winners, not like a generic AI-generated outlier.`
    : "";

  const skipped = (strategy.carousel_outline || []).filter((s) => s.higgsfield_rendered);
  const skippedNote = skipped.length
    ? `\n\nNOTE: ${skipped.length} slide(s) in this carousel are being generated by a separate image pipeline (Higgsfield) and are NOT in the brief below. The slides below are the ones YOU must design. Use the ORIGINAL slide numbers (shown in each SLIDE N heading) so they land correctly in the final sequence — do not renumber starting from 1.`
    : "";

  return `BRAND: ${brandName}
TONE: ${tone}
AUDIENCE: ${audience}${diffs}${dnc}${brandColors}${visualIntelBlock}

CAMPAIGN: ${strategy.campaign_name}
CORE HOOK: "${strategy.hook}"
WHY: ${strategy.rationale}${skippedNote}

OUTLINE — ${outline.length} slide(s) for YOU to design (use these exact words — do not rewrite the copy, just design around it):
${slides}${imageInstruction}

Design the ${outline.length} slide(s). Pick ONE Google Fonts typography pairing from the system prompt, ONE palette from the BRAND COLORS, and commit across all slides. Return exactly the OUTPUT FORMAT specified — nothing else.`;
}

function extractSlides(raw) {
  if (!raw) return [];
  const slides = [];
  // Match "=== SLIDE N ===" ... ```html ... ```
  const re = /===\s*SLIDE\s+(\d+)\s*===[\s\S]*?```(?:html)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const index = parseInt(m[1], 10);
    const html = m[2].trim();
    if (html && html.toLowerCase().includes("<html")) {
      slides.push({ index, html });
    }
  }
  return slides.sort((a, b) => a.index - b.index);
}

async function viaClaudeCLI(strategy, brain, log) {
  if (!claude.isAvailable()) {
    log?.("claude CLI not detected — carousel designer skipped");
    return null;
  }
  // Only design slides that (a) are ticked for this forge AND (b) aren't
  // being produced by Higgsfield.
  const toDesign = (strategy.carousel_outline || []).filter(
    (s) => s.include_in_forge !== false && !s.higgsfield_rendered,
  );
  if (toDesign.length === 0) {
    log?.("all slides are Higgsfield-rendered — HTML designer not needed");
    return [];
  }

  const prompt = `${systemPrompt()}\n\n${userPrompt(strategy, brain)}`;
  log?.(
    `→ Claude CLI: designing ${toDesign.length} bespoke slide(s) (prompt=${prompt.length} chars) — this takes ~60-90s`,
  );

  try {
    const raw = await claude.prompt(prompt, { timeoutMs: 360_000 });
    log?.(`← Claude CLI: ${raw.length} chars returned`);
    const extracted = extractSlides(raw);
    if (extracted.length < toDesign.length) {
      log?.(
        `Claude returned only ${extracted.length}/${toDesign.length} slide(s) — falling back to template`,
      );
      return null;
    }

    // Match extracted HTML back to the ORIGINAL slide numbers.
    const slides = toDesign.map((o, i) => {
      const match =
        extracted.find((e) => e.index === o.slide) || extracted[i];
      return {
        index: o.slide,
        title: o.title,
        html: match?.html || "",
      };
    });

    if (slides.some((s) => !s.html)) {
      log?.("one or more slides came back empty — falling back to template");
      return null;
    }

    return slides;
  } catch (e) {
    log?.(`Claude designer error: ${e.message || e} — falling back to template`);
    return null;
  }
}

async function design(strategy, brain, { log } = {}) {
  const toDesign = (strategy.carousel_outline || []).filter(
    (s) => s.include_in_forge !== false && !s.higgsfield_rendered,
  );
  if (toDesign.length === 0) {
    log?.("no slides left for HTML designer — all ticked slides are Higgsfield-rendered (or all unticked)");
    return { slides: [], source: "higgsfield_all" };
  }
  const fromClaude = await viaClaudeCLI(strategy, brain, log);
  if (fromClaude && fromClaude.length > 0) {
    log?.(`carousel designed by Claude (${fromClaude.length} bespoke slide(s))`);
    return { slides: fromClaude, source: "claude" };
  }
  // Template fallback only covers the slides that would've gone through Claude.
  const allTemplate = templateFallback(strategy);
  const designedIndexes = new Set(toDesign.map((s) => s.slide));
  const slides = allTemplate.filter((s) => designedIndexes.has(s.index));
  log?.(`carousel built from static template (${slides.length} slide(s))`);
  return { slides, source: "template" };
}

module.exports = { design };
