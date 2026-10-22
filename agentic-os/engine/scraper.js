/**
 * engine/scraper.js
 *
 * Flow:
 *   1. Load tasks.json → target_urls
 *   2. For each URL: route to Apify Meta scraper + Google scraper (both run)
 *   3. Normalize each ad to ScrapedAd shape
 *   4. Fallback to synthetic data if APIFY_TOKEN is missing or an actor fails
 *   5. Synthesize strategy locally (no paid LLM APIs) and write to tasks.json
 */

const path = require("path");
const fs = require("fs");

// Load .env.local manually so this works both via `node engine/scraper.js`
// and when spawned from Next.js API routes.
(function loadEnv() {
  const file = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
})();

const { read, write, log } = require("./state");
const { runActor, hasToken } = require("./apify-client");
const { synthesize } = require("./strategist");
const { design } = require("./carousel-designer");
const { resolveToAdLibraryUrl } = require("./url-resolver");
const { extractVisualIntel } = require("./visual-intel");
const config = require("./apify.config");

// ──────────────────────────────────────────────────────────────────────────────
// URL utilities
// ──────────────────────────────────────────────────────────────────────────────

function hostnameOf(url) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function brandFrom(url) {
  return hostnameOf(url)
    .split(".")[0]
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function rootDomain(url) {
  const h = hostnameOf(url);
  const parts = h.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : h;
}

// ──────────────────────────────────────────────────────────────────────────────
// Apify output → ScrapedAd normalizers
// ──────────────────────────────────────────────────────────────────────────────

function normalizeMetaAd(raw, sourceUrl) {
  // apify/facebook-ads-scraper rich schema. snapshot.cards[] holds the actual
  // creative — videoSdUrl / originalImageUrl / videoPreviewImageUrl etc.
  const snapshot = raw.snapshot || raw.ad_snapshot || {};
  const card = (snapshot.cards && snapshot.cards[0]) || {};

  // Copy fields prefer card-level (richer) over snapshot-level
  const title =
    card.title ||
    snapshot.title ||
    snapshot.linkDescription ||
    raw.ad_creative_link_title ||
    raw.title ||
    "";
  const body =
    card.body ||
    snapshot.body?.text ||
    (typeof snapshot.body === "string" ? snapshot.body : "") ||
    snapshot.caption ||
    snapshot.linkDescription ||
    raw.ad_creative_body ||
    raw.body ||
    "";
  const cta =
    card.ctaText ||
    snapshot.ctaText ||
    snapshot.cta_text ||
    raw.cta_text ||
    snapshot.call_to_action?.value ||
    "Learn more";

  // Media extraction — Meta puts media in three different places depending on
  // ad type: carousel ads have snapshot.cards[], single video ads have
  // snapshot.videos[], single image ads have snapshot.images[].
  const firstVideo = (snapshot.videos && snapshot.videos[0]) || {};
  const firstImage = (snapshot.images && snapshot.images[0]) || {};

  let media_type = "none";
  let media_url = "";
  let thumbnail_url = "";

  const videoSrc =
    card.videoSdUrl || card.videoHdUrl || firstVideo.videoSdUrl || firstVideo.videoHdUrl;
  const videoPoster = card.videoPreviewImageUrl || firstVideo.videoPreviewImageUrl;
  const imageSrc =
    card.originalImageUrl ||
    card.resizedImageUrl ||
    firstImage.originalImageUrl ||
    firstImage.resizedImageUrl;
  const imagePreview =
    card.resizedImageUrl ||
    card.originalImageUrl ||
    firstImage.resizedImageUrl ||
    firstImage.originalImageUrl;

  if (videoSrc) {
    media_type = "video";
    media_url = videoSrc;
    thumbnail_url = videoPoster || imagePreview || "";
  } else if (imageSrc) {
    media_type = "image";
    media_url = imageSrc;
    thumbnail_url = imagePreview || imageSrc;
  }

  // Platforms — top-level publisherPlatform OR publisherPlatforms[]
  const platformsRaw =
    raw.publisherPlatform || raw.publisherPlatforms || raw.publisher_platforms || [];
  const platforms = Array.isArray(platformsRaw) ? platformsRaw : [platformsRaw];

  const impressions = Number(raw.impressions?.upper_bound || raw.impressions?.lower_bound || 0);
  const spend = Number(raw.spend?.upper_bound || raw.spend?.lower_bound || 0);

  // Dates: scraper returns Unix seconds (number) OR ISO string — handle both
  const parseDate = (d) => {
    if (!d) return null;
    if (typeof d === "number") return new Date(d * 1000);
    return new Date(d);
  };
  const startDate = parseDate(raw.startDate || raw.ad_delivery_start_time);
  const endDate = parseDate(raw.endDate || raw.ad_delivery_stop_time);
  const daysRunning = startDate
    ? Math.max(
        1,
        Math.floor(
          ((endDate || new Date()).getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  // Permanent deep link to the specific ad on Meta Ad Library
  const adArchiveId = raw.adArchiveID || raw.adArchiveId || raw.adId;
  const library_url = adArchiveId
    ? `https://www.facebook.com/ads/library/?id=${adArchiveId}`
    : "";

  return {
    advertiser: raw.pageName || snapshot.pageName || snapshot.page_name || brandFrom(sourceUrl),
    headline: (title || body || "").slice(0, 140) || "Untitled creative",
    body: (body || title || "").slice(0, 1200),
    cta,
    tags: platforms.map((p) => String(p).toLowerCase()).filter(Boolean),
    engagement_score: Math.min(99, 40 + Math.floor(daysRunning / 2)),
    source_url: sourceUrl,
    platform: "meta",
    analytics: {
      likes: 0,
      comments: 0,
      shares: 0,
      impressions,
      estimated_leads: Math.floor(impressions * 0.0008),
      estimated_spend_usd: spend,
      ctr: 0,
      days_running: daysRunning,
    },
    media_type,
    media_url,
    thumbnail_url,
    landing_url: card.linkUrl || snapshot.linkUrl || "",
    library_url,
    advertiser_avatar: snapshot.pageProfilePictureUrl || "",
    is_active: raw.isActive !== false,
  };
}

function normalizeGoogleAd(raw, sourceUrl) {
  // memo23/google-ad-transparency-scraper-cheerio returns top-level fields plus
  // a variations[] array. Headlines/images are frequently in variations[] rather
  // than at the top level — iterate to find the richest one.
  const variations = Array.isArray(raw.variations) ? raw.variations : [];

  // Pick the variation with the most content as the "canonical" one.
  const bestVar =
    variations.find((v) => v.headline && v.description) ||
    variations.find((v) => v.headline) ||
    variations.find((v) => v.image || v.videoUrl) ||
    variations[0] ||
    {};

  const headline =
    raw.headline || raw.longHeadline || bestVar.headline || bestVar.longHeadline || "";
  const body =
    raw.description || bestVar.description || bestVar.body || "";
  const cta = raw.callToAction || bestVar.callToAction || "Visit site";

  // Media: images and videos live inside variations[].
  const varWithImage = variations.find((v) => v.image);
  const varWithVideo = variations.find((v) => v.videoUrl || v.youtubeVideoId);

  let media_type = "none";
  let media_url = "";
  let thumbnail_url = "";
  if (varWithVideo) {
    media_type = "video";
    media_url = varWithVideo.videoUrl || "";
    thumbnail_url =
      varWithVideo.thumbnailUrl ||
      varWithVideo.image ||
      raw.previewUrl ||
      "";
  } else if (varWithImage) {
    media_type = "image";
    media_url = varWithImage.image || "";
    thumbnail_url = varWithImage.thumbnailUrl || varWithImage.image || "";
  } else if (raw.previewUrl) {
    // Fallback — some ads only have previewUrl at the top level
    media_type = "image";
    media_url = raw.previewUrl;
    thumbnail_url = raw.previewUrl;
  }

  const daysRunning =
    typeof raw.numServedDays === "number"
      ? raw.numServedDays
      : raw.firstShown && raw.lastShown
      ? Math.max(
          1,
          Math.floor(
            (new Date(raw.lastShown).getTime() - new Date(raw.firstShown).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 0;

  // Still-live if last-shown is within the last 7 days
  const isActive = raw.lastShown
    ? (Date.now() - new Date(raw.lastShown).getTime()) / (1000 * 60 * 60 * 24) <= 7
    : true;

  const regions = Array.isArray(raw.creativeRegions) ? raw.creativeRegions : [];
  const format = String(raw.format || "display").toLowerCase();

  // Leave headline/body empty when the ad is truly asset-only — the UI shows a
  // nicer "— Image/video only, no ad copy —" fallback than a hardcoded string.
  const headlineOut = (headline || "").slice(0, 140);
  const bodyOut = (body || "").slice(0, 1200);

  return {
    advertiser:
      raw.advertiserName || raw.advertiserLegalName || brandFrom(sourceUrl),
    headline: headlineOut,
    body: bodyOut !== headlineOut ? bodyOut : "",
    cta,
    tags: [format, ...regions.slice(0, 2)].filter(Boolean).map((t) => String(t).toLowerCase()),
    engagement_score: Math.min(99, 35 + Math.floor(daysRunning / 2)),
    source_url: sourceUrl,
    platform: "google",
    analytics: {
      likes: 0,
      comments: 0,
      shares: 0,
      impressions: 0,
      estimated_leads: 0,
      estimated_spend_usd: 0,
      ctr: 0,
      days_running: daysRunning,
    },
    media_type,
    media_url,
    thumbnail_url,
    landing_url:
      bestVar.destinationUrl ||
      (Array.isArray(raw.landingUrls) ? raw.landingUrls[0] : "") ||
      "",
    library_url: raw.adUrl || "", // permanent Google Transparency Center deep link
    advertiser_avatar: bestVar.logoUrl || "",
    is_active: isActive,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Synthetic fallback
// ──────────────────────────────────────────────────────────────────────────────

const SYNTHETIC_HEADLINES = [
  "The 90-second founder loop that killed our churn",
  "We fired our agency. Here's the stack that replaced them.",
  "Why your CAC is lying to you (and the one metric that isn't)",
  "The 'boring' content format quietly out-earning every reel",
  "Operator's note: 4 hooks we'd never run in 2026",
  "Stop writing captions. Start writing cold opens.",
  "The post we almost deleted — then it did 1.2M views",
];
const TAG_POOL = ["founder-led", "performance", "edutainment", "contrarian", "operator", "story", "demo", "ugc"];
const PLATFORMS = ["meta", "linkedin", "google", "tiktok", "x"];
const CTAS = ["Book a demo", "Start free", "Join waitlist", "Download guide", "Watch demo"];

function seeded(seed) {
  let x = seed * 9301 + 49297;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

function syntheticAd(url, i) {
  const rnd = seeded(i + 1);
  const headline = SYNTHETIC_HEADLINES[i % SYNTHETIC_HEADLINES.length];
  const tags = [TAG_POOL[i % TAG_POOL.length], TAG_POOL[(i + 3) % TAG_POOL.length]];
  const advertiser = brandFrom(url);
  const platform = PLATFORMS[i % PLATFORMS.length];
  const likes = Math.floor(400 + rnd() * 18000);
  const impressions = Math.floor(likes * (60 + rnd() * 180));
  const ctr = Math.round((0.8 + rnd() * 4.2) * 100) / 100;
  const clicks = Math.floor((impressions * ctr) / 100);
  return {
    advertiser,
    headline,
    body: `${advertiser} is leaning into a story-first carousel structure — slide 1 is a pattern interrupt, slide 2 reframes the pain, slide 3-4 are proof, slide 5 is a CTA.`,
    cta: CTAS[i % CTAS.length],
    tags,
    engagement_score: Math.min(99, Math.round(((likes / impressions) * 10000 + ctr * 10) / 2)),
    source_url: url,
    platform,
    // Mark placeholders so market-summary + virality-score can tell real
    // competitor intel from fallback data (we don't want to score craft
    // against invented competitors).
    synthetic: true,
    analytics: {
      likes,
      comments: Math.floor(likes * (0.02 + rnd() * 0.06)),
      shares: Math.floor(likes * (0.01 + rnd() * 0.04)),
      impressions,
      estimated_leads: Math.floor(clicks * (0.03 + rnd() * 0.08)),
      estimated_spend_usd: Math.floor((impressions / 1000) * (6 + rnd() * 14)),
      ctr,
      days_running: Math.floor(3 + rnd() * 45),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Platform dispatchers
// ──────────────────────────────────────────────────────────────────────────────

async function scrapeMeta(url, country) {
  // Try the precise path first: resolve input → Facebook Page ID → Ad Library
  // URL that targets exactly that advertiser (no keyword noise).
  const resolved = await resolveToAdLibraryUrl(url, country, { log });

  let searchUrl;
  let label;
  if (resolved?.adsLibraryUrl) {
    searchUrl = resolved.adsLibraryUrl;
    label = resolved.pageId
      ? `page_id=${resolved.pageId} (${resolved.inputType})`
      : "direct Ad Library URL";
  } else {
    // Fallback: brand-name keyword search. Noisy, but better than empty.
    const brand = brandFrom(url);
    searchUrl = config.meta.buildSearchUrl(brand, country);
    label = `KEYWORD "${brand}" — may be noisy (no Page ID resolved)`;
    log(`⚠️ falling back to keyword search for ${url}`);
  }

  log(`→ Apify Meta: ${config.meta.actor} · ${label} · country=${country}`);
  const input = config.meta.input({
    startUrls: [searchUrl],
    resultsLimit: config.MAX_ADS_PER_TARGET,
  });
  const items = await runActor(config.meta.actor, input);
  log(`← Meta returned ${items.length} ad(s)`);
  return items.map((r) => normalizeMetaAd(r, url));
}

async function scrapeGoogle(url, country) {
  const domain = rootDomain(url);
  const input = config.google.input({
    domain,
    resultsLimit: config.MAX_ADS_PER_TARGET,
    country,
  });
  // Note if we had to fall back to a global search because the chosen country
  // isn't in Google Transparency's supported region set.
  const regionNote =
    input.region === country ? country : `anywhere (${country} not supported by Google)`;
  log(`→ Apify Google: ${config.google.actor} · "${domain}" · region=${regionNote}`);
  const items = await runActor(config.google.actor, input);
  log(`← Google returned ${items.length} ad(s)`);
  return items.map((r) => normalizeGoogleAd(r, url));
}

async function scrapeUrl(url, country) {
  const results = [];
  // Fire both platforms in parallel; let one succeed even if the other fails.
  const [meta, google] = await Promise.allSettled([
    scrapeMeta(url, country),
    scrapeGoogle(url, country),
  ]);
  if (meta.status === "fulfilled") results.push(...meta.value);
  else log(`meta failed for ${url}: ${meta.reason?.message || meta.reason}`);
  if (google.status === "fulfilled") results.push(...google.value);
  else log(`google failed for ${url}: ${google.reason?.message || google.reason}`);
  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// Strategy synthesis (unchanged — works on real OR synthetic ads)
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// Orchestrator — strategy synthesis lives in engine/strategist.js
// ──────────────────────────────────────────────────────────────────────────────

async function run() {
  const state = read();
  const urls = state.target_urls || [];
  const brain = state.brain || {};
  const country = state.country || "IN";
  log(`scraper booting // ${urls.length} target(s) · market=${country}`);

  if (!urls.length) {
    log("no targets — aborting");
    write({ status: "idle" });
    return;
  }

  write({ status: "scraping", scraped_data: [] });

  const useApify = hasToken();
  log(
    useApify
      ? "APIFY_TOKEN detected → real Meta + Google scrape"
      : "APIFY_TOKEN missing → synthetic fallback (add to .env.local for real data)",
  );

  const scraped = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    log(`sweeping ${url}`);
    let batch = [];

    if (useApify) {
      try {
        batch = await scrapeUrl(url, country);
      } catch (e) {
        log(`apify unavailable for ${url}: ${e.message || e} — falling back to synthetic`);
      }
    }

    if (!batch.length) {
      // Fallback: 2-3 synthetic ads so the pipeline still flows.
      const n = 2 + (i % 2);
      for (let k = 0; k < n; k++) batch.push(syntheticAd(url, scraped.length + k));
    }

    scraped.push(...batch);
    write({ scraped_data: [...scraped] });
    await new Promise((r) => setTimeout(r, 350));
  }

  log(`recon complete // ${scraped.length} ad signal(s) captured`);

  // Timestamp the scrape so the Jev scorer knows when to rebuild its
  // compact market summary (market-summary.js compares its own built_at
  // against this value).
  write({ status: "strategizing", scraped_at: new Date().toISOString() });

  // Step 1: Visual intel — have Claude look at competitor thumbnails and
  // extract the dominant visual codes so our designers aren't flying blind.
  log("extracting visual intel from competitor thumbnails");
  const visualIntel = await extractVisualIntel(scraped);
  if (visualIntel) {
    log(`visual intel ready // ${visualIntel.patterns.visual_energy} energy, ${visualIntel.patterns.composition_dominant}`);
  }

  const brainFields = Object.keys(brain).length;
  log(`strategist booting // brain has ${brainFields} field(s), ${scraped.length} ad(s) in context`);

  const { strategy: baseStrategy, source: stratSource } = await synthesize(brain, scraped, { log });
  // Attach the visual intel to the strategy so designers downstream can read it
  const strategy = { ...baseStrategy, visual_intel: visualIntel || undefined };
  write({
    strategy,
    log: [`strategy ready via ${stratSource} // ${strategy.carousel_outline.length} slides outlined`],
  });

  // Build the compact MarketSummary now that strategy (and its
  // winning_patterns + competitive_gaps) is written. The Jev scorer reads
  // this on every forge; building it once keeps per-score calls light.
  try {
    await require("./market-summary").build();
  } catch (e) {
    log(`market-summary build failed non-fatally: ${e.message || e}`);
  }

  log("designing carousel slides");
  const { slides: html_slides, source: designSource } = await design(strategy, brain, { log });

  write({
    html_slides,
    log: [`slides designed via ${designSource}`],
  });

  // Pipeline is done — the operator now reviews the strategy in War Room and
  // triggers a FORGE from Brand Foundry when ready. Clearing the status back
  // to "idle" stops the sidebar from showing a perpetually-active indicator
  // and the Command Center's "SYNTHESIZING" pulse. Without this write the UI
  // keeps looking like something is still regenerating.
  write({
    status: "idle",
    log: ["war room primed — awaiting operator ignition"],
  });
}

run().catch((e) => {
  log(`scraper fatal: ${e.message || e}`);
  write({ status: "idle" });
});
