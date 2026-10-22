/**
 * engine/ad-playbook.js
 *
 * Generates a per-platform CREATIVE PLAYBOOK from (brain, strategy,
 * scraped competitor ads). For each of Meta / Google / Experimental,
 * Claude produces:
 *   - a budget-allocation rationale ("why we're spending here")
 *   - campaign type + targeting direction
 *   - 3 (or 1 for experimental) specific creative angles with WHY it works
 *     grounded in the competitor patterns we actually scraped
 *
 * Writes to tasks.strategy.creative_playbook. Called via:
 *   POST /api/engine { module: "ad-playbook" }
 */

const { read, write, log } = require("./state");
const claude = require("./claude-cli");

function brainSummary(brain) {
  if (!brain || Object.keys(brain).length === 0) {
    return "(no brain profile set)";
  }
  const lines = [];
  if (brain.business_name) lines.push(`Business: ${brain.business_name}`);
  if (brain.what_you_do) lines.push(`What they do: ${brain.what_you_do}`);
  if (brain.value_prop) lines.push(`Value prop: ${brain.value_prop}`);
  if (brain.target_audience) lines.push(`Audience: ${brain.target_audience}`);
  if (brain.tone) lines.push(`Tone: ${brain.tone}`);
  if (brain.differentiators?.length)
    lines.push(`Differentiators: ${brain.differentiators.join("; ")}`);
  if (brain.offerings?.length) lines.push(`Offerings: ${brain.offerings.join("; ")}`);
  if (brain.current_cta) lines.push(`Current CTA: ${brain.current_cta}`);
  return lines.join("\n");
}

function strategySummary(strategy) {
  const lines = [];
  if (strategy.campaign_name) lines.push(`Campaign: ${strategy.campaign_name}`);
  if (strategy.hook) lines.push(`Core hook: "${strategy.hook}"`);
  if (strategy.objective) lines.push(`Objective: ${strategy.objective}`);
  if (strategy.target_audience) lines.push(`Audience: ${strategy.target_audience}`);
  if (strategy.pillars?.length) lines.push(`Pillars: ${strategy.pillars.join(" · ")}`);
  if (strategy.winning_patterns?.length)
    lines.push(`Winning patterns observed:\n  - ${strategy.winning_patterns.join("\n  - ")}`);
  if (strategy.competitive_gaps?.length)
    lines.push(`Gaps to exploit:\n  - ${strategy.competitive_gaps.join("\n  - ")}`);
  return lines.join("\n");
}

// Group scraped ads by platform so Claude sees the per-channel patterns.
function adsByPlatform(scraped) {
  if (!scraped?.length) return { meta: [], google: [] };
  const meta = scraped.filter((a) => a.platform === "meta");
  const google = scraped.filter((a) => a.platform === "google");
  return { meta, google };
}

function formatAds(ads, max = 15) {
  if (!ads?.length) return "(none scraped)";
  return ads
    .slice(0, max)
    .map((a, i) => {
      const headline = (a.headline || "").replace(/\{\{[\w.]+\}\}/g, "").slice(0, 160);
      const body = (a.body || "").replace(/\{\{[\w.]+\}\}/g, "").slice(0, 220);
      const cta = a.cta ? ` · CTA: "${a.cta}"` : "";
      const d = a.analytics?.days_running ? ` · ${a.analytics.days_running}d running` : "";
      const media = a.media_type ? ` · ${a.media_type}` : "";
      return `${i + 1}. ${a.advertiser}${d}${media}${cta}\n   HEADLINE: "${headline}"${
        body && body !== headline ? `\n   BODY: "${body}"` : ""
      }`;
    })
    .join("\n");
}

function systemPrompt() {
  return `You are a senior growth strategist writing a PAID MEDIA CREATIVE PLAYBOOK for a brand.
You will be given (1) the operator's brand profile, (2) the campaign strategy already synthesized, and (3) competitor ads scraped separately from META Ads Library and GOOGLE Ads Transparency Center.

Your job: produce a per-platform creative plan — 3 specific creatives for META, 3 for GOOGLE, and 1 for EXPERIMENTAL (adjacent channels like TikTok Image Ads / LinkedIn Sponsored / Reddit Promoted Image). Each creative must be:
- Grounded in a REAL pattern you observed from the scraped competitor ads for that platform (quote or reference it).
- Mapped to the operator's differentiators — explain how it uses what the brand uniquely has.
- Explain WHO it reaches and WHY that audience will click.

⚠️ CRITICAL CONSTRAINT — IMAGE ADS ONLY ⚠️
This system can only generate STATIC IMAGES. Do NOT suggest video, animated, motion, cinemagraph, GIF, Reels, Stories-with-motion, carousel-with-video, or any creative with a time dimension. Every creative you suggest MUST be a single static image or a multi-image carousel. If a competitor pattern you want to reference used video, re-interpret it as a single still-frame image equivalent.

⚠️ CAROUSELS MUST INCLUDE A SLIDES BREAKDOWN ⚠️
If a creative's "format" value contains the word "carousel", you MUST include a "slides" array in that creative with N slide objects (where N is the number stated in the format — e.g. "Carousel · 5 images" means 5 slide objects). Each slide object must have {slide, title, body, role}. Roles should be from: "hook", "problem", "solution", "proof", "cta", "custom". If the format is a single image, OMIT the slides field.

RESPOND WITH ONLY VALID JSON matching this exact shape — no prose before/after, no code fences:

{
  "meta": {
    "rationale": "2 sentences — why spend here, grounded in what competitors are doing on Meta",
    "campaign_type": "e.g. 'Advantage+ Shopping (CBO)' / 'Conversions - Single CBO' / 'Engagement + Traffic'",
    "targeting": "1-2 sentences — audience segments, interests, lookalikes, exclusions",
    "creatives": [
      {
        "concept": "3-5 word tag — e.g. 'Proof-stat hero'",
        "angle": "1 sentence — what the IMAGE depicts and the overlay text / headline",
        "why_it_works": "2-3 sentences — reference a specific competitor pattern you saw, then explain how our brand twists it",
        "audience": "1 sentence — specific segment this hits (not generic)",
        "format": "IMAGE ONLY — one of: 'Single image · 1:1 (feed)', 'Single image · 4:5 (feed)', 'Single image · 9:16 (story still)', 'Carousel · 5 images'",
        "cta": "The action — e.g. 'Book Free Workshop'",
        "slides": "ONLY INCLUDE IF format contains 'carousel'. Array of N slide objects: [{\"slide\": 1, \"title\": \"short title\", \"body\": \"1-sentence body\", \"role\": \"hook\"}, ...]. Omit this field entirely for single-image formats."
      },
      { "concept": "...", "angle": "...", "why_it_works": "...", "audience": "...", "format": "...", "cta": "..." },
      { "concept": "...", "angle": "...", "why_it_works": "...", "audience": "...", "format": "...", "cta": "..." }
    ]
  },
  "google": {
    "rationale": "...",
    "campaign_type": "e.g. 'Performance Max (image assets)' / 'Discovery - Image' / 'Display - Retargeting'",
    "targeting": "1-2 sentences — keyword themes, intent levels, audience signals",
    "creatives": [
      { "concept": "...", "angle": "...", "why_it_works": "...", "audience": "...", "format": "IMAGE ONLY — one of: 'Display 1200x628', 'Display 1080x1080', 'Discovery image 1:1', 'PMax image asset 1200x628', 'PMax image asset 1200x1200'", "cta": "..." },
      { "concept": "...", "angle": "...", "why_it_works": "...", "audience": "...", "format": "...", "cta": "..." },
      { "concept": "...", "angle": "...", "why_it_works": "...", "audience": "...", "format": "...", "cta": "..." }
    ]
  },
  "experimental": {
    "rationale": "2 sentences — why worth the small budget, which adjacent channel + why. IMAGE-ONLY channels only (TikTok Image Ads, LinkedIn Single Image, Reddit Promoted Image, Pinterest Promoted Pin). Do NOT recommend TikTok Spark Ads or any video-centric placement.",
    "campaign_type": "e.g. 'LinkedIn Sponsored Content - Single Image' / 'Pinterest Promoted Pin' / 'Reddit Promoted Image'",
    "targeting": "1-2 sentences — specific to the chosen experimental channel",
    "creatives": [
      { "concept": "...", "angle": "...", "why_it_works": "...", "audience": "...", "format": "IMAGE ONLY — e.g. 'LinkedIn Single Image 1200x627', 'Pinterest Pin 1000x1500', 'Reddit Image 1200x628'", "cta": "..." }
    ]
  }
}

RULES:
- Reference REAL competitor patterns from the scraped data — say things like "Sunrise Mentors ran their 'Book Free Webinar' angle for 390 days, that mechanic works in this category" rather than vague "proof-forward works".
- Each creative must have a DIFFERENT angle — proof / hook / urgency / FOMO / testimonial / demo / problem-agitation. Don't repeat.
- Honor the brand's DO-NOT-SAY list — never recommend an angle that violates it.
- If a platform has zero scraped ads, say so in the rationale and recommend based on category conventions.
- EVERY format value MUST explicitly say "image" or be a known static-image placement — if you catch yourself typing "video", stop and rewrite as a still image.
- The "angle" field should describe both the IMAGE SUBJECT (what we see) and the OVERLAY TEXT (what it says), since every ad renders as a single still frame.`;
}

function userPrompt(brain, strategy, scraped) {
  const { meta, google } = adsByPlatform(scraped);
  return `=== OPERATOR BRAIN ===
${brainSummary(brain)}

=== CAMPAIGN STRATEGY (already synthesized by War Room) ===
${strategySummary(strategy)}

=== META COMPETITOR ADS (${meta.length} scraped) ===
${formatAds(meta)}

=== GOOGLE COMPETITOR ADS (${google.length} scraped) ===
${formatAds(google)}

Synthesize the per-platform creative playbook. Return JSON only — no prose, no fences.`;
}

function extractJson(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first < 0 || last < 0 || last < first) return null;
  try {
    return JSON.parse(t.slice(first, last + 1));
  } catch {
    return null;
  }
}

function validatePlaybook(p) {
  if (!p || typeof p !== "object") return false;
  for (const key of ["meta", "google", "experimental"]) {
    const plan = p[key];
    if (!plan || typeof plan !== "object") return false;
    if (!plan.rationale || !plan.campaign_type || !Array.isArray(plan.creatives)) return false;
    if (plan.creatives.length === 0) return false;
    for (const c of plan.creatives) {
      if (!c.concept || !c.angle || !c.why_it_works) return false;
    }
  }
  return true;
}

async function run() {
  const state = read();
  const brain = state.brain || {};
  const strategy = state.strategy || {};
  const scraped = state.scraped_data || [];

  if (!strategy.campaign_name) {
    log("ad-playbook: no strategy in state — run recon + strategize first");
    return;
  }
  if (!claude.isAvailable()) {
    log("ad-playbook: Claude CLI not available");
    return;
  }

  log(
    `ad-playbook: synthesizing from ${scraped.length} competitor ads (meta=${
      scraped.filter((a) => a.platform === "meta").length
    } · google=${scraped.filter((a) => a.platform === "google").length})`,
  );

  const prompt = `${systemPrompt()}\n\n${userPrompt(brain, strategy, scraped)}`;
  log(`ad-playbook: → Claude CLI (prompt=${prompt.length} chars) — ~45-90s`);
  try {
    const raw = await claude.prompt(prompt, { timeoutMs: 300_000 });
    log(`ad-playbook: ← Claude returned ${raw.length} chars`);
    const parsed = extractJson(raw);
    if (!validatePlaybook(parsed)) {
      log("ad-playbook: malformed response — see last 300 chars");
      log(raw.slice(-300));
      return;
    }
    const playbook = {
      ...parsed,
      generated_at: new Date().toISOString(),
      based_on: {
        competitor_ads: scraped.length,
        meta_sample: scraped.filter((a) => a.platform === "meta").length,
        google_sample: scraped.filter((a) => a.platform === "google").length,
      },
    };
    const latest = read();
    const latestStrategy = latest.strategy || {};
    write({
      strategy: { ...latestStrategy, creative_playbook: playbook },
      log: [
        `[ad-playbook] generated — meta=${playbook.meta.creatives.length} · google=${playbook.google.creatives.length} · test=${playbook.experimental.creatives.length}`,
      ],
    });
    log("ad-playbook: ✓ written to strategy.creative_playbook");
  } catch (e) {
    log(`ad-playbook: error — ${e.message || e}`);
  }
}

run().catch((e) => {
  log(`ad-playbook: fatal — ${e.message || e}`);
});
