/**
 * Apify actor configuration. Swap actor IDs here to change scraping backends
 * without touching application code.
 *
 * APIFY_TOKEN is read from process.env — set it in .env.local at the repo root:
 *   APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Pricing (as of Oct 2026, FREE tier):
 *   Meta  — apify/facebook-ads-scraper              → $0.0058 / ad
 *   Google — memo23/google-ad-transparency-scraper-cheerio → $0.002 / ad
 */

module.exports = {
  // Hard cap on ads per competitor URL so a single recon can't blow a budget.
  MAX_ADS_PER_TARGET: 10,

  // How long to wait for an Apify actor run to finish (seconds).
  RUN_TIMEOUT_SECS: 180,

  meta: {
    actor: "apify~facebook-ads-scraper",
    // Build a Meta Ad Library search URL from a brand/domain.
    // country must be a 2-letter code recognized by Meta Ad Library (IN, US, GB, ...)
    // or "ALL" for a global search.
    buildSearchUrl(brand, country = "IN") {
      const q = encodeURIComponent(brand);
      const c = country === "ALL" ? "ALL" : country;
      return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${c}&q=${q}&search_type=keyword_unordered&media_type=all`;
    },
    input({ startUrls, resultsLimit }) {
      return {
        startUrls: startUrls.map((url) => ({ url })),
        resultsLimit,
        activeStatus: "active",
        isDetailsPerAd: true,
      };
    },
  },

  google: {
    actor: "memo23~google-ad-transparency-scraper-cheerio",
    // Google Transparency only supports a fixed set of regions. India, Brazil,
    // Japan, UAE etc. are NOT in that list — fall back to "anywhere" for those
    // so the scrape still returns something instead of 400ing.
    // Allowed list observed from actor validation error.
    GOOGLE_ALLOWED_REGIONS: new Set([
      "US", "GB", "CA", "AU", "DE", "FR", "IT", "ES", "NL", "BE",
      "SE", "NO", "DK", "FI", "PL", "PT", "IE", "AT", "CH", "NZ",
      "ZA", "GR", "LU", "IS", "LT", "LV", "EE", "CZ", "SK", "HU",
      "RO", "BG", "SI", "HR", "CY", "MT",
    ]),
    input({ domain, resultsLimit, country = "US" }) {
      let region;
      if (!country || country === "ALL") {
        region = "anywhere";
      } else if (this.GOOGLE_ALLOWED_REGIONS.has(country)) {
        region = country;
      } else {
        region = "anywhere";
      }
      return {
        domains: [domain],
        region,
        maxItems: resultsLimit,
      };
    },
  },
};
