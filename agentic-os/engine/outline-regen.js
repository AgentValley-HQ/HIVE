/**
 * engine/outline-regen.js
 *
 * Regenerate just the carousel outline (5-slide outline) via Claude.
 * Operator supplies a steering prompt (via pending_edit.prompt with index=0).
 * Replaces strategy.carousel_outline — does NOT touch strategy fields outside
 * the outline. HTML slides are cleared so the next FORGE CAROUSEL re-designs.
 */

const { read, write, log } = require("./state");
const claude = require("./claude-cli");

function buildPrompt(brain, strategy, scraped, userSteer) {
  const outline = strategy.carousel_outline || [];
  const outlineStr = outline
    .map((s) => `  ${s.slide}. [${s.role}] ${s.title} — ${s.body}`)
    .join("\n");

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

  return `You are regenerating ONLY the carousel outline for an existing campaign. Nothing else about the strategy changes.

=== BRAND BRAIN ===
${brainStr || "(no brain profile)"}

=== CURRENT CAMPAIGN ===
Campaign: ${strategy.campaign_name || "—"}
Hook: ${strategy.hook || "—"}
Tone: ${strategy.tone || brain?.tone || "—"}
Audience: ${strategy.target_audience || brain?.target_audience || "—"}

=== COMPETITOR INTEL (${(scraped || []).length} ads) ===
${scrapedStr || "(none)"}

=== PREVIOUS OUTLINE (do not just copy this) ===
${outlineStr || "(none)"}

=== OPERATOR'S STEER ===
${userSteer}

Produce a FRESH ${outline.length || 5}-slide outline that applies the operator's steer. Each slide has a clear role in the narrative. Keep slide copy tight (<30 words body, <6 words title).

Return ONLY valid JSON matching this exact shape — no prose, no fences:

{
  "carousel_outline": [
    {"slide": 1, "title": "string, 2-5 words", "body": "string, 1-2 sentences", "role": "hook | problem | solution | proof | cta | custom", "rationale": "WHY this slide exists — 1 sentence, max 25 words, reference competitor patterns when relevant"},
    {"slide": 2, ...},
    ...
  ]
}

Every slide's "rationale" is REQUIRED — the operator reads these in the War Room to understand the strategic thinking.`;
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
  if (!edit || edit.index !== 0 || edit.format !== "carousel") {
    log("no outline-regen pending_edit in state — nothing to do");
    return;
  }

  if (!claude.isAvailable()) {
    log("claude CLI not available — outline regenerate requires it");
    write({ status: "pending_approval", pending_edit: null });
    return;
  }

  log(`outline-regen booting // steer="${edit.prompt.slice(0, 80)}"`);

  const strategy = state.strategy || {};
  const brain = state.brain || {};
  const scraped = state.scraped_data || [];

  const prompt = buildPrompt(brain, strategy, scraped, edit.prompt);
  log(`→ Claude: regenerating outline (prompt=${prompt.length} chars)`);
  try {
    const raw = await claude.prompt(prompt, { timeoutMs: 120_000 });
    log(`← Claude returned ${raw.length} chars`);
    const parsed = extractJson(raw);
    const newOutline = parsed?.carousel_outline;
    if (!Array.isArray(newOutline) || newOutline.length === 0) {
      log("Claude output didn't match schema — bailing without changes");
      write({ status: "pending_approval", pending_edit: null });
      return;
    }

    // Preserve any uploaded images at the matching slide index (so images
    // survive a regenerate).
    const prevImages = new Map(
      (strategy.carousel_outline || []).map((s) => [s.slide, s.image]),
    );
    const merged = newOutline.map((s, i) => ({
      slide: i + 1,
      title: s.title || `Slide ${i + 1}`,
      body: s.body || "",
      role: s.role || "custom",
      rationale: s.rationale || "",
      image: prevImages.get(s.slide) || prevImages.get(i + 1) || null,
      user_edited: false,
    }));

    write({
      strategy: { ...strategy, carousel_outline: merged },
      html_slides: [], // force re-design on next FORGE CAROUSEL
      status: "pending_approval",
      pending_edit: null,
      log: [`[outline-regen] rewrote ${merged.length}-slide outline`],
    });
    log("outline regenerated");
  } catch (e) {
    log(`outline-regen error: ${e.message || e}`);
    write({ status: "pending_approval", pending_edit: null });
  }
}

run().catch((e) => {
  log(`outline-regen fatal: ${e.message || e}`);
  write({ status: "pending_approval", pending_edit: null });
});
