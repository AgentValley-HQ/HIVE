// engine/virality-score.js
// The scoring step. Runs after generating_visuals, before pending_approval.
//   status: generating_visuals -> scoring -> pending_approval
// Scores the carousel as one creative and each single ad on its own.
// No TYPESAFE_API_KEY? It skips scoring and moves straight to pending_approval.

const state = require("./state");
const jev = require("./jev-client");
const market = require("./market-summary");

// ---------- the questions ----------
// Market questions compare the creative to Intel Radar.
// Craft questions judge the creative on its own.

const MARKET_QUESTIONS = (summary) => ({
  proven_pattern: {
    type: "noul",
    instructions: "The creative uses a persuasion pattern that appears in market.proven_ads or market.winning_patterns.",
    criteria: {
      true: "Clearly reuses an angle, hook style or offer type competitors keep running",
      false: "Uses an angle not seen in the market data",
    },
  },
  stands_out: {
    type: "noul",
    instructions: "Shown next to the competitor ads in market.proven_ads, this creative would look and read noticeably different.",
    criteria: {
      true: "A viewer scrolling past competitor ads would notice this one as different",
      false: "It blends in with what competitors already run, including market.visual_language.overused",
    },
  },
  fills_gap: {
    type: "noul",
    instructions: "The creative directly attacks one of market.competitive_gaps.",
  },
  closest_angle: {
    type: "choice",
    instructions: "Which competitor angle in market.proven_ads is this creative closest to?",
    criteria: Object.fromEntries([
      ...(summary.proven_ads || []).slice(0, 30).map((p, i) => [`ad_${i}`, `${p.competitor}: ${p.angle}`]),
      ["none", "Not close to any of them"],
    ]),
  },
});

const CRAFT_QUESTIONS = {
  scroll_stop: {
    type: "score",
    instructions: "How likely is the first glance at this creative to stop someone scrolling a social feed?",
    criteria: [
      "Easy to scroll past, nothing grabs attention",
      "Mildly interesting, most people keep scrolling",
      "Some people stop, the hook is decent",
      "Most target viewers stop, the hook is strong",
      "Very hard to scroll past, the hook is sharp and specific",
    ],
  },
  share_worthy: {
    type: "noul",
    instructions: "A person in the target audience would send this to a friend or save it.",
  },
  clarity: {
    type: "score",
    instructions: "How quickly is the main message understood?",
    criteria: [
      "Confusing, the message is unclear",
      "Understood only after reading closely",
      "Understood in a few seconds",
      "Understood at a glance",
    ],
  },
  on_brand: {
    type: "noul",
    instructions: "The creative matches market.brand.tone and does not say anything listed in market.brand.do_not_say.",
  },
  slop: {
    type: "noul",
    instructions: "The creative reads as generic or obviously AI-made: vague claims, buzzwords, stock phrasing.",
  },
  hook_type: {
    type: "choice",
    instructions: "What kind of hook does the creative lead with?",
    criteria: {
      curiosity: "Opens a question or gap the viewer wants closed",
      pain: "Names a problem the viewer feels",
      proof: "Leads with a result, number or testimonial",
      offer: "Leads with a deal, price or freebie",
      contrarian: "Challenges a common belief",
    },
  },
};

// ---------- the blend ----------
// Starting weights. Replace these once the feedback loop has real results.
const WEIGHTS = {
  market: { proven_pattern: 0.35, stands_out: 0.4, fills_gap: 0.25 },
  craft: { scroll_stop: 0.3, share_worthy: 0.35, clarity: 0.2, slop_inverse: 0.15 },
  layers: { market: 0.4, craft: 0.6 },
};

function weighted(parts, weights) {
  let sum = 0, w = 0;
  for (const [k, wt] of Object.entries(weights)) {
    if (typeof parts[k] === "number") { sum += parts[k] * wt; w += wt; }
  }
  return w ? sum / w : null;
}

function blend(answers, marketUsable) {
  const m = {
    proven_pattern: jev.noul(answers, "proven_pattern"),
    stands_out: jev.noul(answers, "stands_out"),
    fills_gap: jev.noul(answers, "fills_gap"),
  };
  const slop = jev.noul(answers, "slop");
  const c = {
    scroll_stop: jev.score01(answers, "scroll_stop"),
    share_worthy: jev.noul(answers, "share_worthy"),
    clarity: jev.score01(answers, "clarity"),
    slop_inverse: slop == null ? null : 1 - slop,
  };

  const market = marketUsable ? weighted(m, WEIGHTS.market) : null;
  const craft = weighted(c, WEIGHTS.craft);
  const hive = weighted({ market, craft }, WEIGHTS.layers);

  const onBrand = jev.noul(answers, "on_brand");
  const flags = [];
  if (onBrand != null && onBrand < 0.5) flags.push("off_brand");
  if (slop != null && slop > 0.5) flags.push("reads_like_slop");
  if (m.proven_pattern != null && m.proven_pattern > 0.7 && m.stands_out != null && m.stands_out < 0.4) {
    flags.push("blends_in");
  }

  return {
    hive: hive == null ? null : Math.round(hive * 100),
    market: market == null ? null : Math.round(market * 100),
    craft: craft == null ? null : Math.round(craft * 100),
    parts: { ...m, ...c, on_brand: onBrand, slop },
    hook_type: jev.choice(answers, "hook_type"),
    closest_angle: jev.choice(answers, "closest_angle"),
    flags,
  };
}

// ---------- creative descriptions ----------
// Jev reads text. Each creative becomes a short text description.

function carouselCreative(t) {
  const outline = t.strategy?.carousel_outline || [];
  if (!outline.length || !(t.generated_images || []).length) return null;
  return {
    format: "instagram_carousel",
    audience: t.brain?.target_audience || "",
    cta: t.brain?.current_cta || "",
    slides: outline
      .filter((s) => s.include_in_forge !== false)
      .map((s) => ({ role: s.role, title: s.title, body: s.body, visual: s.visual_direction || s.higgsfield_prompt || "" })),
  };
}

function singleAdCreatives(t) {
  const concepts = t.strategy?.single_ad_concepts || [];
  return (t.generated_single_ads || []).map((img, i) => {
    const variant = img.variant || img.index || i + 1;
    const c = concepts[variant - 1] || {};
    return {
      index: variant,
      creative: {
        format: "single_image_ad",
        audience: t.brain?.target_audience || "",
        cta: t.brain?.current_cta || "",
        concept: c.concept || "",
        headline: c.headline || c.headline_direction || "",
        visual: c.visual_direction || c.higgsfield_prompt || "",
      },
    };
  });
}

// ---------- main ----------

async function run() {
  const t0 = state.read();

  if (!jev.available()) {
    state.log("virality-score: TYPESAFE_API_KEY not set, skipping scores");
    state.write({ status: "pending_approval" });
    return;
  }

  if (jev.isMock && jev.isMock()) {
    state.log("virality-score: MOCK mode (TYPESAFE_API_KEY=mock) — no network, deterministic content-aware scores");
  }

  state.write({ status: "scoring" });

  // Reuse the saved summary unless a newer scrape has happened.
  let summary = t0.strategy?.market_summary;
  if (!summary || (t0.scraped_at && summary.data_quality?.built_at < t0.scraped_at)) {
    summary = await market.build();
  }
  const marketUsable = summary.data_quality?.source === "real" && (summary.proven_ads || []).length > 0;
  const questions = marketUsable
    ? { ...MARKET_QUESTIONS(summary), ...CRAFT_QUESTIONS }
    : { ...CRAFT_QUESTIONS };

  const t = state.read();
  const jobs = [];

  const carousel = carouselCreative(t);
  if (carousel) jobs.push({ kind: "carousel", key: "carousel", creative: carousel });
  for (const s of singleAdCreatives(t)) jobs.push({ kind: "single", key: s.index, creative: s.creative });

  const results = { carousel: null, single_ads: {} };

  // All questions go in one request per creative. Jev answers them in parallel.
  await Promise.all(jobs.map(async (job) => {
    try {
      const res = await jev.ask({ creative: job.creative, market: summary }, questions);
      const scored = { ...blend(res.answers, marketUsable), model: res.model, scored_at: new Date().toISOString() };
      if (job.kind === "carousel") results.carousel = scored;
      else results.single_ads[job.key] = scored;
      state.log(`virality-score: OK ${job.kind} ${job.key} -> ${scored.hive ?? "n/a"}`);
    } catch (e) {
      state.log(`virality-score: FAIL ${job.kind} ${job.key}: ${e.message}`);
    }
  }));

  // Rank single ads best first. Arrays are not reordered, only ranked.
  const ranked = Object.entries(results.single_ads)
    .sort(([, a], [, b]) => (b.hive ?? -1) - (a.hive ?? -1))
    .map(([index], i) => ({ index: Number(index), rank: i + 1 }));

  const latest = state.read();
  state.write({
    virality: {
      market_usable: marketUsable,
      market_source: summary.data_quality?.source,
      weights: WEIGHTS,
      carousel: results.carousel,
      single_ads: results.single_ads,
      single_ad_ranking: ranked,
    },
    status: latest.status === "scoring" ? "pending_approval" : latest.status,
  });
}

module.exports = { run, blend, WEIGHTS };

if (require.main === module) {
  run().catch((e) => {
    state.log(`virality-score: ERROR ${e.message}`);
    // Never block the pipeline on scoring.
    state.write({ status: "pending_approval" });
    process.exit(1);
  });
}
