/**
 * engine/url-resolver.js
 *
 * The "smart router" for Meta recon inputs. Operator can paste any of:
 *   1. A Meta Ad Library URL (facebook.com/ads/library/?...)        → used directly
 *   2. A Facebook Page URL (facebook.com/<handle>)                   → resolved to numeric Page ID
 *   3. A website domain (brand.com)                                  → Playwright scrapes the homepage
 *                                                                     for a facebook.com link, then resolves
 *
 * Why: Meta Ad Library's keyword search is noisy — it matches ad text loosely
 * and surfaces unrelated advertisers. Searching by `view_all_page_id=<id>`
 * locks the query to ONE specific advertiser's ads. This module turns any
 * input into that precise URL.
 *
 * Resolver actor: automation-lab/facebook-url-to-id-resolver
 *   Cost: $0.005/run + $0.0016/resolved ID (FREE tier)
 */

const { runActor } = require("./apify-client");

let chromium;
try {
  chromium = require("playwright").chromium;
} catch {
  chromium = null;
}

const RESOLVER_ACTOR = "automation-lab~facebook-url-to-id-resolver";

/**
 * Classify what kind of URL the operator pasted.
 * Returns one of: "ads_library" | "fb_page" | "website"
 */
function classifyUrl(url) {
  const normalized = String(url || "").trim();
  const lower = normalized.toLowerCase();
  if (!lower) return { type: "unknown", url: normalized };

  if (lower.includes("facebook.com/ads/library")) {
    return { type: "ads_library", url: normalized };
  }
  // facebook.com/<handle> (not /ads/library and not just the root)
  const fbPageMatch = lower.match(/facebook\.com\/([^/?#]+)/);
  if (fbPageMatch && fbPageMatch[1] && fbPageMatch[1] !== "ads") {
    return { type: "fb_page", url: normalized };
  }
  return { type: "website", url: normalized };
}

/**
 * Visit a website's homepage with headless Playwright and extract the first
 * meaningful facebook.com link (ignoring share widgets and tracking pixels).
 */
async function extractFbPageFromWebsite(url, log) {
  if (!chromium) {
    log?.(`playwright missing — can't scrape ${url} for FB link`);
    return null;
  }
  const target = url.startsWith("http") ? url : `https://${url}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    });
    const page = await ctx.newPage();
    await page.goto(target, { timeout: 20000, waitUntil: "domcontentloaded" });

    const fbLinks = await page.$$eval('a[href*="facebook.com"]', (anchors) =>
      anchors
        .map((a) => a.href)
        .filter((h) => {
          const l = h.toLowerCase();
          // Skip share widgets, tracking pixels, and the generic root
          return (
            !l.includes("/sharer") &&
            !l.includes("/share.php") &&
            !l.includes("/plugins/") &&
            !l.includes("/tr?") &&
            !l.match(/facebook\.com\/?(\?|$)/)
          );
        }),
    );

    await browser.close();
    const picked = fbLinks[0] || null;
    if (picked) log?.(`found FB link on ${url}: ${picked}`);
    else log?.(`no FB link found in ${url} homepage`);
    return picked;
  } catch (e) {
    if (browser) await browser.close().catch(() => undefined);
    log?.(`website scrape error for ${url}: ${e.message || e}`);
    return null;
  }
}

/**
 * Resolve a Facebook Page URL to its numeric Page ID via Apify.
 * Returns the ID string or null.
 */
async function resolveFbPageToId(fbUrl, log) {
  log?.(`→ Apify resolver: ${fbUrl}`);
  try {
    const items = await runActor(RESOLVER_ACTOR, {
      startUrls: [{ url: fbUrl }],
      maxItems: 1,
    });
    // The actor emits status "resolved" on success; be tolerant of other
    // positive-sounding values just in case the schema shifts.
    const OK = new Set(["resolved", "success", "ok"]);
    const resolved = items.find(
      (i) => OK.has(String(i.status)) && (i.facebookId || i.id),
    );
    const id = resolved?.facebookId || resolved?.id || null;
    log?.(`← resolver returned Page ID: ${id || "<none>"}`);
    return id;
  } catch (e) {
    log?.(`resolver error: ${e.message || e}`);
    return null;
  }
}

function buildAdLibraryUrlByPageId(pageId, country = "IN") {
  const c = country === "ALL" ? "ALL" : country;
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${c}&view_all_page_id=${encodeURIComponent(
    pageId,
  )}&is_targeted_country=false`;
}

/**
 * Top-level entry point. Takes any input URL and returns a precise Meta Ad
 * Library URL locked to one advertiser, or null if resolution fails.
 *
 * Returns: { adsLibraryUrl, pageId, resolvedFbUrl, inputType }
 */
async function resolveToAdLibraryUrl(inputUrl, country, { log } = {}) {
  const cls = classifyUrl(inputUrl);

  if (cls.type === "ads_library") {
    log?.(`${inputUrl} → direct Ad Library URL (no resolution needed)`);
    return {
      adsLibraryUrl: inputUrl,
      pageId: null,
      resolvedFbUrl: inputUrl,
      inputType: "ads_library",
    };
  }

  let fbUrl = null;
  if (cls.type === "fb_page") {
    fbUrl = inputUrl;
  } else if (cls.type === "website") {
    log?.(`${inputUrl} is a website — looking for its Facebook page`);
    fbUrl = await extractFbPageFromWebsite(inputUrl, log);
    if (!fbUrl) return null;
  } else {
    return null;
  }

  const pageId = await resolveFbPageToId(fbUrl, log);
  if (!pageId) return null;

  return {
    adsLibraryUrl: buildAdLibraryUrlByPageId(pageId, country),
    pageId,
    resolvedFbUrl: fbUrl,
    inputType: cls.type,
  };
}

module.exports = {
  classifyUrl,
  resolveToAdLibraryUrl,
  buildAdLibraryUrlByPageId,
};
