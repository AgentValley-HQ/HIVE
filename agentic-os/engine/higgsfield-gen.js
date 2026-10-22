/**
 * engine/higgsfield-gen.js
 *
 * Generate FULL FINISHED slides via Higgsfield MCP. When use_higgsfield is
 * checked on a slide/variant, Higgsfield produces the ENTIRE composed slide
 * (headline + body + CTA + brand palette + visual anchor baked into one
 * image) which is used AS-IS as the final creative — no HTML designer, no
 * Playwright render for that slide.
 *
 * Output lands directly in /public/generated-ads/{slide_XX|ad_XX}.png so
 * it appears alongside Playwright-rendered slides in the UI.
 */

const fs = require("fs");
const path = require("path");
const { read, write, log } = require("./state");
const claude = require("./claude-cli");

const OUT_DIR = path.join(__dirname, "..", "public", "generated-ads");

async function downloadImage(url, destPath) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) throw new Error("response too small — likely error");
    fs.writeFileSync(destPath, buf);
    return true;
  } catch (e) {
    log(`higgsfield: download failed — ${e.message}`);
    return false;
  }
}

// Tone → IMAGE-FIRST aesthetic brief. Each entry picks real image-driven
// campaigns as references (not type-first design studios). The output must
// be a REAL PHOTO or RICH ILLUSTRATION dominating the frame — text is a
// small overlay, not the main event.
function toneBrief(tone) {
  const t = (tone || "").toLowerCase();
  if (/(operator|dry|anti.?hype|direct|no.?nonsense|urgent|punchy)/.test(t)) {
    return {
      reference: "modern tech-brand image campaign in the style of Apple, Linear's hero shots, or Rivian — ONE striking photographic subject, sharp focus, premium production value, confident minimal text overlay",
      imagery: "high-end editorial photograph with ONE clear subject (object, person, scene, or product), shot on medium format, studio or location, cinematic depth of field",
      light: "controlled directional studio light with sculpting shadows, OR golden-hour location light; dramatic contrast between subject and background",
      colorMood: "deep moody tones with ONE punchy accent color (from brand palette); subject rim-lit, background darker",
      textTreatment: "small clean sans-serif text overlay in bottom-third or top-corner, 15-20% of frame height, white or brand-color against readable backdrop",
    };
  }
  if (/(editorial|premium|luxury|refined|serif|elevated|high.?end)/.test(t)) {
    return {
      reference: "luxury editorial campaign in the style of Vogue, Monocle, Aesop, or Hermès — a single evocative photograph with elegant serif text overlay, cinematic, atmospheric",
      imagery: "editorial fashion/lifestyle photograph, soft natural light, shot on film or film emulation, subtle grain, archival feel — person, architectural detail, or still-life depending on message",
      light: "soft directional window light, long gentle shadows, hazy atmospheric depth, cinematic warmth",
      colorMood: "warm desaturated earth tones + cream + deep ink, OR cool stormy palette; muted and sophisticated",
      textTreatment: "elegant light-weight serif overlay (Fraunces Light / Instrument Serif) in the lower-third, generous letter-spacing, small-caps secondary caption",
    };
  }
  if (/(startup|saas|tech|modern|clean|minimal|product)/.test(t)) {
    return {
      reference: "modern SaaS product campaign in the style of Figma, Airbnb, Framer, or Notion — hero product/scene photograph with light overlay text, bright and optimistic",
      imagery: "clean studio product shot OR optimistic lifestyle photograph of real people interacting with technology, bright natural light, modern setting, shallow depth of field",
      light: "soft diffused daylight, bright but not blown out, subtle gradient shadows, product-photography quality",
      colorMood: "bright airy palette with brand accent colors; crisp whites, soft neutrals, one bold brand pop",
      textTreatment: "modern sans overlay (Inter / Satoshi) in top-left or bottom-left corner, 15% of frame, high contrast against subject",
    };
  }
  if (/(energetic|bold|loud|activist|rebellious|punk|street)/.test(t)) {
    return {
      reference: "street/action campaign in the style of Nike, Patagonia, Off-White, or Carhartt WIP — kinetic subject, raw energy, heavy grain, bold text label overlay",
      imagery: "high-energy action photograph OR gritty street scene with a dominant human subject in motion, dramatic framing, documentary feel",
      light: "high-contrast directional lighting, warehouse shoot or raw sunlight, bold cast shadows, saturated highlights",
      colorMood: "high-contrast saturated palette with brand accents, raw and alive, not overly polished",
      textTreatment: "condensed brutalist caps overlay (Druk / Archivo Extra Condensed) as a vertical or edge label, bleeding past the frame, small CTA bar",
    };
  }
  // Default — confident modern image-driven ad
  return {
    reference: "premium contemporary brand campaign in the style of Apple, Allbirds, or Away — a single striking photograph with minimal elegant text overlay, considered production value",
    imagery: "cinematic photograph with ONE clear subject or scene, strong composition, atmospheric depth, agency-grade production",
    light: "controlled soft directional light with intentional shadows, cinematic grading",
    colorMood: "sophisticated palette dominated by image subject colors + ONE brand accent, moody or bright depending on message",
    textTreatment: "small modern sans overlay (Satoshi / GT America) in a quiet corner, 15-20% of frame, respects the image",
  };
}

// Role-based visual metaphor hints — give Claude a starting point for what
// to DEPICT in the image based on what the slide is trying to say.
function roleToVisualHint(role, headline) {
  const r = (role || "").toLowerCase();
  const h = (headline || "").toLowerCase();
  if (/hook|open|first/.test(r)) {
    return "An attention-stopping single hero image — a striking person, object, or scene that visually embodies the headline's tension. Not a stock photo. Think magazine opening spread.";
  }
  if (/problem|pain|cost|loss|fear/.test(r)) {
    return "A photograph that visually represents the problem/tension — could be metaphorical (crumbling, fading, obsolete objects) or literal (a frustrated person, a chaotic workspace, a broken artifact). Cinematic and emotionally resonant.";
  }
  if (/solution|answer|fix|how|product/.test(r)) {
    return "A clean focused image showing the solution in use — person doing the thing successfully, product in action, or an elegant visual of the transformation. Positive, aspirational, clear.";
  }
  if (/proof|stat|number|social|testimonial|authority/.test(r)) {
    return "A portrait-style photograph OR an elegant visualization — a confident human subject if the proof is testimonial, or an atmospheric scene with a single oversized number treated as a graphic element if the proof is statistical.";
  }
  if (/cta|close|action|join|book|sign/.test(r)) {
    return "A warm inviting image that visualizes the destination/outcome — the room they'll walk into, the result they'll get, the community they'll join. Should feel like an open door.";
  }
  // Default from headline
  if (/depreciat|dying|dead|obsolete|old|outdated/.test(h)) {
    return "A metaphorical image of decay or obsolescence — a cracked diploma, dusty old equipment, a fading photograph, a crumbling architectural detail. Cinematic, atmospheric, melancholic.";
  }
  if (/learn|master|skill|operator|build/.test(h)) {
    return "A photograph of focused work in progress — hands on a keyboard with cinematic lighting, a person deep in concentration, an atmospheric workspace scene. Documentary-style.";
  }
  return "A single evocative photograph or rich illustration that visually embodies the headline's core message. Specific subject, not an abstract gradient. Think editorial magazine, not stock photo.";
}

function buildPrompt(target, index, slide, brain, strategy, userPrompt) {
  const brandName = brain?.business_name || "the brand";
  const tone = brain?.tone || "confident, modern";
  const audience = brain?.target_audience || "general";
  const cta = brain?.current_cta || "";
  const brief = toneBrief(tone);

  const colorList = brain?.brand_colors?.slice(0, 5) || [];
  const hasColors = colorList.length > 0;
  const colorHexList = colorList.map((c) => c.hex).join(", ");
  const colorBlock = hasColors
    ? `BRAND PALETTE (MANDATORY — the generated image MUST use these exact hex colors as the dominant palette):
${colorList.map((c) => `  ${c.hex}${c.role ? ` (${c.role})` : ""}`).join("\n")}

HARD RULE: In the Higgsfield prompt you craft, include the exact hex codes verbatim (e.g. "dominant palette: ${colorHexList}"). Do NOT paraphrase them as "warm tones" or "navy and gold" — Higgsfield honors specific hex values much better than vague names. 2-3 colors maximum in the final composition.`
    : `BRAND PALETTE — not provided by operator. Pick a disciplined 2-color palette matching the brand tone (${tone}). Name specific hex codes in your Higgsfield prompt. Avoid default neon. 2-3 colors maximum in the final composition.`;

  const vi = strategy?.visual_intel;
  const marketContext = vi
    ? `\n\nMARKET VISUAL CONTEXT: Competitor feed observed — ${vi.patterns.visual_energy} energy, ${vi.patterns.imagery_dominant} imagery, ${vi.patterns.palette_vibe} palette. ${vi.design_prescription}`
    : "";

  const format =
    target === "carousel"
      ? "1080x1350 portrait (Instagram carousel slide, 4:5 aspect ratio)"
      : "1080x1080 square (Meta feed ad)";
  const aspect = target === "carousel" ? "4:5" : "1:1";

  const outlineLen = (strategy?.carousel_outline || []).length || 5;
  const copy =
    target === "carousel"
      ? {
          role: slide.role || "custom",
          headline: slide.title || "",
          body: slide.body || "",
          position: `Slide ${index} of ${outlineLen}`,
          slideBadge: `${String(index).padStart(2, "0")}/${String(outlineLen).padStart(2, "0")}`,
        }
      : {
          role: slide.concept || "custom",
          headline: slide.headline_direction || "",
          body: slide.visual_direction || "",
          position: `Variant ${index} of 3`,
          slideBadge: `V${String(index).padStart(2, "0")}`,
        };

  const operatorSteer = userPrompt?.trim()
    ? `\n\nOPERATOR'S ADDITIONAL VISUAL STEER (apply on top of defaults):\n"${userPrompt.trim()}"`
    : "";

  const closingSlideCta =
    target === "carousel" && /cta|close|action/i.test(copy.role) && cta
      ? `\n  - CTA (render as a button or pronounced callout in the composition): "${cta}"`
      : "";

  const visualHint = roleToVisualHint(copy.role, copy.headline);

  return `You are art-directing ONE stunning finished Instagram ad via the Higgsfield MCP tool. The operator is PAYING for Higgsfield credits — they expect a REAL IMAGE AD, not a basic text poster.

**THE OUTPUT MUST BE AN IMAGE AD, NOT A TYPOGRAPHIC POSTER.** Think Apple campaign, Nike spread, Vogue editorial — a cinematic photograph (or rich illustration) dominates the frame, with a small text overlay. NOT a text slide with a background.

This image ships AS-IS; there is no HTML or render step after you.

══ FORMAT ══

${format}  (aspect ratio ${aspect})

══ BRAND ══

Brand: ${brandName}
Tone: ${tone}
Audience: ${audience}
Campaign: ${strategy?.campaign_name || "Launch"}
Core hook: "${strategy?.hook || ""}"
${cta ? `CTA: ${cta}` : ""}

${colorBlock}${marketContext}

══ THIS SLIDE'S MESSAGE ══

Position: ${copy.position}
Role: ${copy.role}
Headline (small text overlay — NOT the hero): "${copy.headline}"
Supporting copy (even smaller caption): "${copy.body}"${closingSlideCta}

══ VISUAL CONCEPT — WHAT TO ACTUALLY DEPICT IN THE IMAGE ══

${visualHint}

Translate the slide's message into a SPECIFIC visual subject. Not an abstract gradient, not a texture, not a background. A real scene with a real subject.

Examples of good visual translation:
- Headline "Your degree is depreciating" → cinematic photo of a cracked, dust-covered diploma under a shaft of light, OR a graduate's cap sitting abandoned on a windowsill at golden hour
- Headline "10M+ learners" → a wide-angle photo of a diverse group focused in a workshop setting, warm atmospheric light
- Headline "Join the free workshop" → a photo of an inviting empty seat at a modern workspace, cinematic depth, warm backlight

Pick the visual subject BEFORE writing the Higgsfield prompt. Describe it specifically — subject, setting, time of day, composition — not just "a stylish image".

══ AESTHETIC DIRECTION — this is the look the image must hit ══

Reference: ${brief.reference}
Imagery style: ${brief.imagery}
Lighting / mood: ${brief.light}
Color mood: ${brief.colorMood}
Text treatment: ${brief.textTreatment}

══ COMPOSITION — IMAGE-FIRST, TEXT-OVERLAY ══

1. **IMAGE dominates 75-85% of the frame.** The photograph or illustration IS the ad. If you're asking yourself "where does the text go?" — AT THE EDGE, SMALL.
2. **Hero subject** — one clear focal point in the image (person, object, scene, moment). Not an abstract gradient. Not pure typography. Sharp focus on the subject, cinematic depth of field.
3. **Text overlay** sits in the lower-third, top-corner, or a quiet margin — NOT dominating the frame. Headline at ~15-20% of frame height, supporting copy half that size.
4. **Readability**: text sits on a part of the image with enough contrast — either a naturally darker area, or a subtle gradient overlay (soft dark gradient from bottom, 15-20% opacity, so text reads without obscuring the image).
5. **Brand mark**: small logo-type in a corner, 3% of frame height.
6. **Slide-index badge** "${copy.slideBadge}" tiny, corner-placed.
7. **Negative space is in the image's composition**, not the whole slide. Give the subject room to breathe within the frame.

**Think magazine ad spread, NOT PowerPoint slide.**

══ QUALITY MARKERS — bake these into the Higgsfield prompt ══

- "shot on medium format, Phase One IQ4 or Hasselblad X2D feel"
- "cinematic photograph, award-winning editorial campaign"
- "4K resolution, sharp focus on subject, shallow depth of field"
- "art-directed by Collins / Pentagram / Mother London"
- "subtle 35mm film grain, premium commercial production value"
- "atmospheric light, cinematic color grade"
- "no digital artifacts, no plastic skin, no 3D render, no AI aesthetic"

══ TEXT RENDERING — THE #1 FAILURE MODE OF AI IMAGE GENERATORS ══

Every character visible in the frame must be CRISP and LEGIBLE:
- The headline "${copy.headline}" appears verbatim as a text OVERLAY on the image.
- The supporting copy "${copy.body}" appears verbatim, smaller.
- NO lorem ipsum, NO fake Latin, NO gibberish — if the model can't render text cleanly, prefer OMITTING extra text over hallucinating.
- NO watermarks, NO "AI generated" marks.
- Letterforms must look typeset, not drawn by the image model.

If text rendering is unreliable, LEAN HARDER ON THE IMAGE — a magnificent image with no text is better than a mediocre image with garbled text.

══ NEGATIVE PROMPT (feed as \`negative_prompt\` parameter if the tool accepts it) ══

"text poster, typography poster, pure text slide, flat vector poster, PowerPoint slide, infographic, text-heavy, cluttered text, flat background, abstract gradient background, blurry, lowres, low quality, jpeg artifacts, oversaturated, oversharpened, watermark, signature, garbled text, misspelled text, warped letters, melted typography, extra fingers, deformed hands, uncanny valley, CGI render, plastic skin, 3D render, airbrush, stock photo feel, clipart, cartoon, anime, collage, generic AI style, default Midjourney look, cyberpunk neon, cyan magenta gradient"

══ YOUR TASK ══

1. **PICK THE VISUAL SUBJECT first.** Decide what the image shows — person, object, scene. Be specific. Write one sentence describing it.

2. **Craft ONE image-first Higgsfield prompt** structured roughly as:

   "[visual subject sentence]. [environment / setting / time of day]. [lighting + mood]. [camera / lens / film reference]. [compositional notes — where the subject sits in frame]. Small text overlay in the [position]: '${copy.headline}'. Small caption underneath: '${copy.body}'. Brand mark small in corner: '${brandName}'. Dominant palette: ${colorHexList || "chosen hex codes"}. [aesthetic reference]. ${aspect} aspect ratio. [quality markers]. Crisp legible typeset text, no garbled letters, no AI text artifacts, no additional text beyond specified."

3. Call \`mcp__claude_ai_Higgsfield__generate_image\` with:
   - Your crafted prompt
   - The HIGHEST-QUALITY model available — prefer "soul", "flux-pro", "flux-dev", or Higgsfield's premium image model
   - aspect_ratio: "${aspect}"
   - negative_prompt: use the NEGATIVE PROMPT block above
   - If the tool supports it: max steps/quality, 1 image
   If \`generate_image\` isn't right, try \`mcp__claude_ai_Higgsfield__ads_studio_generate\` — purpose-built for ad imagery.

4. Wait for completion. Use \`show_generations\` / \`job_status\` / \`get_run\` to retrieve the final URL.

5. Output EXACTLY one of these as the LAST line of your response — no code fences, no explanation after:

IMAGE_URL: <the direct image URL>

or on failure:

ERROR: <brief reason>

Prior reasoning + tool calls in your response are fine; the final line is what gets parsed.${operatorSteer}`;
}

function parseImageUrl(raw) {
  if (!raw) return null;
  const lines = raw.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const okMatch = line.match(/^IMAGE_URL:\s*(https?:\/\/\S+)/i);
    if (okMatch) return { url: okMatch[1], error: null };
    const errMatch = line.match(/^ERROR:\s*(.+)/i);
    if (errMatch) return { url: null, error: errMatch[1] };
  }
  return null;
}

/**
 * Generate ONE finished slide image via Higgsfield.
 * Saves directly to /generated-ads/{slide_XX|ad_XX}.png — this IS the final
 * creative, no further rendering happens for it.
 *
 * Returns the public path on success, null on failure.
 */
async function generateOne({ target, index, slide, brain, strategy, user_prompt }) {
  if (!claude.isAvailable()) {
    log("higgsfield: Claude CLI not available");
    return null;
  }

  const prompt = buildPrompt(target, index, slide, brain, strategy, user_prompt);
  log(
    `higgsfield: → Claude CLI for finished ${target} #${index} (prompt=${prompt.length} chars) — 60-180s`,
  );
  try {
    const raw = await claude.prompt(prompt, {
      timeoutMs: 360_000,
      skipPermissions: true,
    });
    log(`higgsfield: ← Claude returned ${raw.length} chars (${target} #${index})`);

    const parsed = parseImageUrl(raw);
    if (!parsed) {
      log(`higgsfield: ${target} #${index} — couldn't parse IMAGE_URL`);
      log(`higgsfield: last 300 chars: ${raw.slice(-300)}`);
      return null;
    }
    if (parsed.error) {
      log(`higgsfield: ${target} #${index} — Claude error: ${parsed.error}`);
      return null;
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const basename =
      target === "carousel"
        ? `slide_${String(index).padStart(2, "0")}.png`
        : `ad_${String(index).padStart(2, "0")}.png`;
    const abs = path.join(OUT_DIR, basename);
    const ok = await downloadImage(parsed.url, abs);
    if (!ok) return null;
    const publicPath = `/generated-ads/${basename}`;
    log(`higgsfield: ✓ ${target} #${index} finished slide → ${publicPath}`);
    return publicPath;
  } catch (e) {
    log(`higgsfield: ${target} #${index} fatal — ${e.message || e}`);
    return null;
  }
}

/**
 * Batch-process all toggled slides/concepts (use_higgsfield=true). Each one
 * gets a FULL finished slide image written directly to /generated-ads/. Those
 * slides are marked higgsfield_rendered:true + higgsfield_path:... so the
 * HTML designer + renderer skip them downstream.
 */
async function processPending(target /* "carousel" | "single_ad" */) {
  const state = read();
  const strategy = state.strategy || {};
  const brain = state.brain || {};

  const items =
    target === "carousel"
      ? (strategy.carousel_outline || []).map((s) => ({ s, idx: s.slide }))
      : (strategy.single_ad_concepts || []).map((c) => ({ s: c, idx: c.variant }));

  // Only generate for slides/variants that are BOTH (a) ticked for this forge
  // AND (b) toggled for Higgsfield. Unticked items are preserved as-is.
  const pending = items.filter(
    (x) => x.s.use_higgsfield && x.s.include_in_forge !== false,
  );
  if (pending.length === 0) {
    log(`higgsfield batch: no toggled ${target} items`);
    return [];
  }
  log(
    `higgsfield batch: generating ${pending.length} finished ${target} slide(s) in parallel`,
  );

  const results = await Promise.all(
    pending.map(async ({ s, idx }) => {
      const publicPath = await generateOne({
        target,
        index: idx,
        slide: s,
        brain,
        strategy,
        user_prompt: s.higgsfield_prompt,
      });
      return { idx, publicPath, slide: s };
    }),
  );

  const successes = results.filter((r) => r.publicPath);
  if (successes.length === 0) {
    log("higgsfield batch: all generations failed");
    return [];
  }

  // Mark successes on strategy slides AND write preliminary generated_images
  // entries so the UI shows them live while the rest of the forge runs.
  const latest = read();
  const latestStrategy = latest.strategy || {};

  if (target === "carousel") {
    const nextOutline = (latestStrategy.carousel_outline || []).map((s) => {
      const hit = successes.find((r) => r.idx === s.slide);
      if (!hit) return s;
      return {
        ...s,
        higgsfield_rendered: true,
        higgsfield_path: hit.publicPath,
      };
    });
    const existing = latest.generated_images || [];
    const higgsEntries = successes.map((r) => ({
      index: r.idx,
      path: r.publicPath,
      title: r.slide.title || "",
      source: "higgsfield",
    }));
    const filtered = existing.filter((e) => !successes.find((r) => r.idx === e.index));
    const merged = [...filtered, ...higgsEntries].sort((a, b) => a.index - b.index);
    write({
      strategy: { ...latestStrategy, carousel_outline: nextOutline },
      generated_images: merged,
      log: [`[higgsfield] forged ${successes.length} finished carousel slide(s)`],
    });
  } else {
    const nextConcepts = (latestStrategy.single_ad_concepts || []).map((c) => {
      const hit = successes.find((r) => r.idx === c.variant);
      if (!hit) return c;
      return {
        ...c,
        higgsfield_rendered: true,
        higgsfield_path: hit.publicPath,
      };
    });
    const existing = latest.generated_single_ads || [];
    const higgsEntries = successes.map((r) => ({
      variant: r.idx,
      concept: r.slide.concept || `variant-${r.idx}`,
      concept_rationale: r.slide.rationale || "",
      path: r.publicPath,
      source: "higgsfield",
    }));
    const filtered = existing.filter((e) => !successes.find((r) => r.idx === e.variant));
    const merged = [...filtered, ...higgsEntries].sort((a, b) => a.variant - b.variant);
    write({
      strategy: { ...latestStrategy, single_ad_concepts: nextConcepts },
      generated_single_ads: merged,
      log: [`[higgsfield] forged ${successes.length} finished single-ad variant(s)`],
    });
  }

  return successes;
}

/**
 * Standalone CLI entry — single-shot via pending_higgsfield payload.
 * The toggle flow uses processPending() from the forge scripts instead.
 */
async function run() {
  const state = read();
  const payload = state.pending_higgsfield;
  if (!payload) {
    log("higgsfield: no pending_higgsfield in state — nothing to do");
    return;
  }

  const { target, index, user_prompt } = payload;
  if (!target || !index) {
    log("higgsfield: payload missing target/index");
    write({ pending_higgsfield: null });
    return;
  }

  const strategy = state.strategy || {};
  const brain = state.brain || {};

  const slide =
    target === "carousel"
      ? (strategy.carousel_outline || []).find((s) => s.slide === index)
      : (strategy.single_ad_concepts || []).find((c) => c.variant === index);

  if (!slide) {
    log(`higgsfield: ${target} #${index} not found`);
    write({ pending_higgsfield: null });
    return;
  }

  const publicPath = await generateOne({
    target,
    index,
    slide,
    brain,
    strategy,
    user_prompt,
  });

  if (!publicPath) {
    write({ pending_higgsfield: null });
    return;
  }

  const latest = read();
  const latestStrategy = latest.strategy || {};
  if (target === "carousel") {
    const nextOutline = (latestStrategy.carousel_outline || []).map((s) =>
      s.slide === index
        ? { ...s, higgsfield_rendered: true, higgsfield_path: publicPath }
        : s,
    );
    const existing = latest.generated_images || [];
    const filtered = existing.filter((e) => e.index !== index);
    const merged = [
      ...filtered,
      { index, path: publicPath, title: slide.title || "", source: "higgsfield" },
    ].sort((a, b) => a.index - b.index);
    write({
      strategy: { ...latestStrategy, carousel_outline: nextOutline },
      generated_images: merged,
      pending_higgsfield: null,
      log: [`[higgsfield] forged finished carousel slide ${index}`],
    });
  } else {
    const nextConcepts = (latestStrategy.single_ad_concepts || []).map((c) =>
      c.variant === index
        ? { ...c, higgsfield_rendered: true, higgsfield_path: publicPath }
        : c,
    );
    const existing = latest.generated_single_ads || [];
    const filtered = existing.filter((e) => e.variant !== index);
    const merged = [
      ...filtered,
      {
        variant: index,
        concept: slide.concept || `variant-${index}`,
        concept_rationale: slide.rationale || "",
        path: publicPath,
        source: "higgsfield",
      },
    ].sort((a, b) => a.variant - b.variant);
    write({
      strategy: { ...latestStrategy, single_ad_concepts: nextConcepts },
      generated_single_ads: merged,
      pending_higgsfield: null,
      log: [`[higgsfield] forged finished ad variant ${index}`],
    });
  }
  log("higgsfield: complete");
}

module.exports = { processPending, generateOne };

if (require.main === module) {
  run().catch((e) => {
    log(`higgsfield: unhandled — ${e.message || e}`);
    write({ pending_higgsfield: null });
  });
}
