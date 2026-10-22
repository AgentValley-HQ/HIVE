// engine/jev-mock.js
// Content-aware deterministic mock for the Jev scorer.
// Activated when TYPESAFE_API_KEY=mock in .env.local — jev-client.js routes
// here instead of hitting the real API. Zero network calls, zero cost.
//
// The scores aren't random — they're computed from features of the actual
// creative text (headline length, slop keywords, hook patterns, brand match).
// So re-forging the same slide produces the same score, and different
// creatives genuinely score differently — enough to see the Launchpad
// ranking + flags + hook detection behave realistically.

const MODEL = "jev-mock-1.0.0";

// ───────────────────────────── keyword banks ─────────────────────────────

// Phrases that mark a creative as reading like generic AI slop.
const SLOP_PHRASES = [
  "unlock", "level up", "game-changer", "game changing", "revolutionary",
  "seamless", "cutting-edge", "world-class", "best-in-class", "transform your",
  "unleash", "harness", "empower", "synergy", "paradigm", "disrupt",
  "take your", "to the next level", "elevate your", "supercharge",
  "limitless", "endless possibilities", "redefine", "reimagine",
];

// Signals the hook is proof-forward (number, stat, testimonial).
const PROOF_SIGNALS = /\b(\d{2,}[kmb]?\+?|%|million|billion|users?|customers?|rated|reviews?|trusted by|chosen by|loved by|\d+-star)\b/i;

// Signals the hook is urgency / offer-driven.
const URGENCY_SIGNALS = /\b(now|today|limited|only|last chance|ends|expires|hurry|don't miss|final hours?|while supplies last)\b/i;
const OFFER_SIGNALS = /\b(free|save|off|deal|discount|\$\d|%\s*off|bonus|gift)\b/i;

// Signals a contrarian hook (challenges a belief).
const CONTRARIAN_SIGNALS = /\b(stop|don't|forget|myth|lie|wrong|everyone|nobody|you've been|most people)\b/i;

// Curiosity signals (opens a loop).
const CURIOSITY_SIGNALS = /\b(why|how|what if|the real reason|secret|hidden|nobody tells you|actually|here's)\b|\?/i;

// Pain signals (names a problem).
const PAIN_SIGNALS = /\b(stuck|tired|frustrated|struggling|wasting|broken|slow|hard|exhausted|burned out|overwhelmed|lost)\b/i;

// ───────────────────────────── helpers ─────────────────────────────

function creativeText(creative) {
  const parts = [];
  if (!creative || typeof creative !== "object") return "";
  if (typeof creative === "string") return creative;
  for (const k of ["concept", "headline", "body", "visual", "cta", "audience"]) {
    if (typeof creative[k] === "string") parts.push(creative[k]);
  }
  if (Array.isArray(creative.slides)) {
    for (const s of creative.slides) {
      if (s?.title) parts.push(s.title);
      if (s?.body) parts.push(s.body);
      if (s?.visual) parts.push(s.visual);
    }
  }
  return parts.join(" ").toLowerCase();
}

function brandText(market) {
  const b = market?.brand || {};
  const parts = [b.business_name, b.value_prop, b.tone, ...(b.differentiators || [])];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function doNotSayText(market) {
  return (market?.brand?.do_not_say || "").toLowerCase();
}

// Count how many phrases from a list appear in text.
function hits(text, list) {
  if (!text) return 0;
  let n = 0;
  for (const phrase of list) if (text.includes(phrase)) n++;
  return n;
}

// Normalise to 0..1 with a soft ceiling.
function squash(n, scale) {
  return Math.max(0, Math.min(1, n / scale));
}

// Deterministic 0..1 noise seeded by a string — adds the tiny bit of
// variance that makes scores feel like judgment instead of pure arithmetic.
function noise(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map to 0..1, keep it small (±0.08 range)
  return (((h >>> 0) % 10000) / 10000 - 0.5) * 0.16;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

// ───────────────────────────── scorers per question ─────────────────────

const NOUL_SCORERS = {
  proven_pattern(creative, market) {
    const text = creativeText(creative);
    const provenHooks = (market?.proven_ads || [])
      .map((p) => (p.hook || "").toLowerCase())
      .filter(Boolean);
    // Count shared non-trivial words between creative and competitor hooks.
    const creativeWords = new Set(text.split(/\W+/).filter((w) => w.length > 4));
    let overlap = 0;
    for (const hook of provenHooks) {
      const words = hook.split(/\W+/).filter((w) => w.length > 4);
      for (const w of words) if (creativeWords.has(w)) overlap++;
    }
    const base = squash(overlap, 8);
    return clamp01(base + noise("proven|" + text));
  },

  stands_out(creative, market) {
    const text = creativeText(creative);
    const pattern = NOUL_SCORERS.proven_pattern(creative, market);
    // Inverse of overlap, boosted by presence of specific numbers / counterintuitive words
    const specifics = (text.match(/\d/g) || []).length;
    const contrarian = CONTRARIAN_SIGNALS.test(text) ? 0.2 : 0;
    const base = (1 - pattern) * 0.7 + squash(specifics, 10) * 0.3 + contrarian;
    return clamp01(base + noise("stands|" + text));
  },

  fills_gap(creative, market) {
    const text = creativeText(creative);
    const gaps = (market?.competitive_gaps || []).join(" ").toLowerCase();
    if (!gaps) return clamp01(0.3 + noise("gap|" + text));
    const gapWords = new Set(gaps.split(/\W+/).filter((w) => w.length > 4));
    let hit = 0;
    for (const w of text.split(/\W+/)) if (gapWords.has(w)) hit++;
    return clamp01(squash(hit, 6) + noise("gap|" + text));
  },

  share_worthy(creative) {
    const text = creativeText(creative);
    const curiosity = CURIOSITY_SIGNALS.test(text) ? 0.25 : 0;
    const contrarian = CONTRARIAN_SIGNALS.test(text) ? 0.25 : 0;
    const specific = PROOF_SIGNALS.test(text) ? 0.2 : 0;
    const base = 0.3 + curiosity + contrarian + specific;
    return clamp01(base + noise("share|" + text));
  },

  on_brand(creative, market) {
    const text = creativeText(creative);
    const brand = brandText(market);
    const forbidden = doNotSayText(market);
    const brandWords = new Set(brand.split(/\W+/).filter((w) => w.length > 4));
    let match = 0;
    for (const w of text.split(/\W+/)) if (brandWords.has(w)) match++;
    let base = 0.55 + squash(match, 6) * 0.35;
    if (forbidden) {
      const forbiddenWords = forbidden.split(/\W+/).filter((w) => w.length > 4);
      for (const w of forbiddenWords) if (w && text.includes(w)) base -= 0.4;
    }
    return clamp01(base + noise("brand|" + text));
  },

  slop(creative) {
    const text = creativeText(creative);
    const slopHits = hits(text, SLOP_PHRASES);
    // Vague + no numbers = sloppier
    const specifics = (text.match(/\d/g) || []).length;
    const vague = specifics < 2 ? 0.15 : 0;
    const base = squash(slopHits, 3) + vague;
    return clamp01(base + noise("slop|" + text));
  },
};

const SCORE_SCORERS = {
  scroll_stop(creative, _market, levels) {
    const text = creativeText(creative);
    // Punchy hooks score higher. Reward: short headlines, specific numbers,
    // contrarian openings, question marks.
    const headline = (creative.headline || creative.concept || "").toLowerCase();
    const len = headline.length;
    let s = 0.3;
    if (len > 0 && len <= 40) s += 0.3;
    else if (len <= 60) s += 0.15;
    if (PROOF_SIGNALS.test(headline)) s += 0.2;
    if (CONTRARIAN_SIGNALS.test(headline)) s += 0.15;
    if (CURIOSITY_SIGNALS.test(headline)) s += 0.1;
    if (URGENCY_SIGNALS.test(headline)) s += 0.05;
    s = clamp01(s + noise("stop|" + text));
    return Math.round(s * (levels - 1));
  },

  clarity(creative, _market, levels) {
    const text = creativeText(creative);
    // Short sentences + concrete nouns = clear. Buzzwords + abstract = unclear.
    const slopPenalty = hits(text, SLOP_PHRASES) > 2 ? 0.2 : 0;
    const avgWordLen = text ? text.split(/\s+/).reduce((a, w) => a + w.length, 0) / Math.max(1, text.split(/\s+/).length) : 5;
    const concise = avgWordLen < 6 ? 0.25 : avgWordLen < 7.5 ? 0.1 : 0;
    const bodyLen = (creative.body || "").length;
    const notTooLong = bodyLen > 0 && bodyLen < 200 ? 0.2 : 0;
    const s = clamp01(0.4 + concise + notTooLong - slopPenalty + noise("clarity|" + text));
    return Math.round(s * (levels - 1));
  },
};

// For choice questions we return { choice: <key>, confidence: 0..1 }.
const CHOICE_SCORERS = {
  hook_type(creative, _market, criteria) {
    const text = creativeText(creative);
    const headline = (creative.headline || creative.concept || "").toLowerCase();
    const scores = {
      proof: PROOF_SIGNALS.test(headline) ? 1 : 0,
      pain: PAIN_SIGNALS.test(headline) ? 1 : 0,
      offer: OFFER_SIGNALS.test(headline) ? 1 : 0,
      contrarian: CONTRARIAN_SIGNALS.test(headline) ? 1 : 0,
      curiosity: CURIOSITY_SIGNALS.test(headline) ? 1 : 0,
    };
    const available = Object.keys(criteria);
    // Prefer whichever available option has the highest signal, default curiosity
    let best = available[0] || "curiosity";
    let bestScore = -1;
    for (const key of available) {
      const s = scores[key] ?? 0;
      if (s > bestScore) { bestScore = s; best = key; }
    }
    const confidence = clamp01(0.55 + bestScore * 0.3 + noise("hook|" + text));
    return { choice: best, confidence };
  },

  closest_angle(creative, market, criteria) {
    const text = creativeText(creative);
    const provenAds = market?.proven_ads || [];
    // Score each proven ad by word overlap with the creative.
    const creativeWords = new Set(text.split(/\W+/).filter((w) => w.length > 4));
    let bestKey = "none";
    let bestScore = 0;
    provenAds.slice(0, 30).forEach((p, i) => {
      const key = `ad_${i}`;
      if (!criteria[key]) return;
      const hookWords = (p.hook || "").toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      const angleWords = (p.angle || "").toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      let overlap = 0;
      for (const w of hookWords) if (creativeWords.has(w)) overlap++;
      for (const w of angleWords) if (creativeWords.has(w)) overlap++;
      if (overlap > bestScore) { bestScore = overlap; bestKey = key; }
    });
    const confidence = bestScore > 0
      ? clamp01(0.5 + squash(bestScore, 6) * 0.4 + noise("angle|" + text))
      : clamp01(0.4 + noise("angle|" + text));
    return { choice: bestKey, confidence };
  },
};

// ───────────────────────────── public API ─────────────────────────────

/**
 * Same signature as jev.ask() — returns { model, answers, usage }.
 * `questions` is the same shape as the real API expects.
 */
async function ask(state, questions, opts = {}) {
  const creative = state?.creative ?? state;
  const market = state?.market ?? {};

  const answers = {};
  for (const [name, q] of Object.entries(questions || {})) {
    if (q.type === "noul") {
      const scorer = NOUL_SCORERS[name];
      const value = scorer ? scorer(creative, market) : 0.5 + noise(name + "|" + creativeText(creative));
      answers[name] = { type: "noul", noul: Number(value.toFixed(3)) };
    } else if (q.type === "score") {
      // Determine level count from the criteria array length.
      const levels = Array.isArray(q.criteria) ? q.criteria.length : 5;
      const scorer = SCORE_SCORERS[name];
      const score = scorer ? scorer(creative, market, levels) : Math.floor(levels / 2);
      const legend = {};
      (q.criteria || []).forEach((label, i) => { legend[i] = label; });
      answers[name] = { type: "score", score, legend };
    } else if (q.type === "choice") {
      const scorer = CHOICE_SCORERS[name];
      const criteria = q.criteria || {};
      const result = scorer
        ? scorer(creative, market, criteria)
        : { choice: Object.keys(criteria)[0] || "none", confidence: 0.5 };
      answers[name] = { type: "choice", choice: result.choice, confidence: Number(result.confidence.toFixed(3)) };
    } else {
      // Unknown question type — safe fallback
      answers[name] = { type: q.type || "unknown" };
    }
  }

  // Simulate a short think so the UI shows the SCORING state before results land.
  await new Promise((r) => setTimeout(r, 400 + Math.random() * 900));

  return {
    model: MODEL,
    answers,
    usage: { input_tokens: 0, output_tokens: 0, mock: true },
  };
}

function available() { return true; }

module.exports = { ask, available, MODEL };
