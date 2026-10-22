/**
 * engine/ad-concepts-regen.js
 *
 * Regenerate strategy.single_ad_concepts (the 3 ad angles that drive FORGE
 * SINGLE AD). Operator-supplied steering prompt comes in via pending_edit
 * with format='single_ad' and index=0.
 *
 * Does NOT touch the carousel outline, strategy fields outside concepts,
 * or any already-rendered PNGs. Clears html_single_ads so the next FORGE
 * SINGLE AD designs fresh HTML from the new concepts.
 */

const { read, write, log } = require("./state");
const claude = require("./claude-cli");

function buildPrompt(brain, strategy, scraped, userSteer) {
  const concepts = strategy.single_ad_concepts || [];
  const conceptsStr = concepts.length
    ? concepts
        .map(
          (c) =>
            `  V${c.variant} · ${c.concept}: ${c.rationale} | HOOK: ${c.headline_direction} | VISUAL: ${c.visual_direction}`,
        )
        .join("\n")
    : "(none yet)";

  const brainStr = Object.entries(brain || {})
    .filter(([, v]) => v && (Array.isArray(v) ? v.length : String(v).trim()))
    .map(([k, v]) => `  ${k}: ${Array.isArray(v) ? v.join("; ") : v}`)
    .join("\n");

  const scrapedStr = (scraped || [])
    .slice(0, 10)
    .map(
      (a, i) =>
        `  ${i + 1}. [${a.platform}] ${a.advertiser}: "${(a.headline || "").slice(0, 100)}"`,
    )
    .join("\n");

  const steer =
    userSteer && userSteer.trim()
      ? userSteer.trim()
      : "Give the operator 3 fundamentally different angles than the current concepts — new hooks, new visual directions. Still grounded in the brand + competitor intel.";

  return `You are regenerating ONLY the single-ad CONCEPTS for an existing campaign. Nothing else about the strategy changes.

=== BRAND BRAIN ===
${brainStr || "(no brain profile)"}

=== CAMPAIGN ===
Campaign: ${strategy.campaign_name || "—"}
Hook: ${strategy.hook || "—"}
Tone: ${strategy.tone || brain?.tone || "—"}
Audience: ${strategy.target_audience || brain?.target_audience || "—"}

=== COMPETITOR INTEL (${(scraped || []).length} ads) ===
${scrapedStr || "(none)"}

=== CURRENT CONCEPTS (do not just copy these) ===
${conceptsStr}

=== OPERATOR'S STEER ===
${steer}

Produce 3 FRESH ad concepts applying the operator's steer. Each is a strategic angle for a 1080×1080 Meta feed ad — not the HTML, just the thinking.

Return ONLY valid JSON matching this exact shape — no prose, no fences:

{
  "single_ad_concepts": [
    {
      "variant": 1,
      "concept": "short tag like 'proof-forward' or 'customer-story' or 'contrarian-stance'",
      "rationale": "WHY this angle for THIS brand given competitors — 1 sentence, max 30 words",
      "headline_direction": "what the hero hook should communicate — 1 line",
      "visual_direction": "what the composition should feel like — type, palette, imagery — 1-2 lines"
    },
    {"variant": 2, ...},
    {"variant": 3, ...}
  ]
}`;
}

function extractJson(text) {
  if (!text) return null;
  let t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  if (fenced) t = fenced[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first < 0 || last < 0 || last < first) return null;
  try {
    return JSON.parse(t.slice(first, last + 1));
  } catch {
    return null;
  }
}

async function run() {
  const state = read();
  const edit = state.pending_edit;
  if (!edit || edit.index !== 0 || edit.format !== "single_ad") {
    log("no ad-concepts-regen pending_edit in state — nothing to do");
    return;
  }

  if (!claude.isAvailable()) {
    log("claude CLI not available — ad-concepts regenerate requires it");
    write({ status: "pending_approval", pending_edit: null });
    return;
  }

  log(`ad-concepts-regen booting // steer="${(edit.prompt || "").slice(0, 80)}"`);

  const strategy = state.strategy || {};
  const brain = state.brain || {};
  const scraped = state.scraped_data || [];

  const prompt = buildPrompt(brain, strategy, scraped, edit.prompt);
  log(`→ Claude: regenerating ad concepts (prompt=${prompt.length} chars)`);
  try {
    const raw = await claude.prompt(prompt, { timeoutMs: 120_000 });
    log(`← Claude returned ${raw.length} chars`);
    const parsed = extractJson(raw);
    const next = parsed?.single_ad_concepts;
    if (!Array.isArray(next) || next.length === 0) {
      log("Claude output didn't match schema — bailing without changes");
      write({ status: "pending_approval", pending_edit: null });
      return;
    }

    // Preserve any uploaded images at matching variant positions.
    const prevImages = new Map(
      (strategy.single_ad_concepts || []).map((c) => [c.variant, c.image]),
    );
    const merged = next.map((c, i) => ({
      variant: i + 1,
      concept: c.concept || `variant-${i + 1}`,
      rationale: c.rationale || "",
      headline_direction: c.headline_direction || "",
      visual_direction: c.visual_direction || "",
      image: prevImages.get(c.variant) || prevImages.get(i + 1) || null,
      user_edited: false,
    }));

    write({
      strategy: { ...strategy, single_ad_concepts: merged },
      html_single_ads: [], // force re-design on next FORGE SINGLE AD
      status: "pending_approval",
      pending_edit: null,
      log: [`[ad-concepts-regen] rewrote ${merged.length} ad concepts`],
    });
    log("ad concepts regenerated");
  } catch (e) {
    log(`ad-concepts-regen error: ${e.message || e}`);
    write({ status: "pending_approval", pending_edit: null });
  }
}

run().catch((e) => {
  log(`ad-concepts-regen fatal: ${e.message || e}`);
  write({ status: "pending_approval", pending_edit: null });
});
