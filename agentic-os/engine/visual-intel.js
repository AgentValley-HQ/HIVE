/**
 * engine/visual-intel.js
 *
 * Downloads top competitor ad thumbnails and asks Claude to LOOK at them,
 * extracting visual patterns (composition, palette, typography feel, imagery
 * density). The resulting "visual intel" brief gets fed into the carousel
 * and single-ad designer prompts so our output matches the aesthetic density
 * that's actually working in this competitive set — not Claude's default
 * minimalist text-on-black defaults.
 *
 * Why this matters: the designer prompt alone keeps producing "AI slop" —
 * generic minimalist layouts. Giving Claude actual competitor images as
 * reference breaks it out of that default pattern.
 */

const fs = require("fs");
const path = require("path");
const { log } = require("./state");
const claude = require("./claude-cli");

const INTEL_DIR = path.join(__dirname, "..", "public", "intel-thumbs");

async function downloadImage(url, destPath) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0",
      },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return false; // likely error placeholder
    fs.writeFileSync(destPath, buf);
    return true;
  } catch {
    return false;
  }
}

function pickCandidates(scraped, max = 5) {
  // Prefer image ads (static — easier to describe) with real thumbnails,
  // sorted by engagement_score. Fall back to any with media.
  const withMedia = scraped.filter(
    (a) => (a.thumbnail_url || a.media_url) && a.media_type !== "none",
  );
  const images = withMedia.filter((a) => a.media_type === "image");
  const videos = withMedia.filter((a) => a.media_type === "video");
  const combined = [...images, ...videos]
    .sort((a, b) => b.engagement_score - a.engagement_score)
    .slice(0, max);
  return combined;
}

function buildPrompt(samples) {
  const sampleStr = samples
    .map(
      (s, i) =>
        `  ${i + 1}. ${s.localPath}  — Advertiser: ${s.ad.advertiser} · Platform: ${s.ad.platform.toUpperCase()} · Days live: ${s.ad.analytics?.days_running || "?"}d · Headline: ${(s.ad.headline || "(none)").slice(0, 80)}`,
    )
    .join("\n");

  return `You are a visual analyst studying competitor ads to inform OUR brand's design direction.

I've saved ${samples.length} competitor ad images to disk. Use the Read tool to view each image (they're PNG/JPG — Read handles images natively). Then analyze visual patterns across the set.

COMPETITOR AD IMAGES:
${sampleStr}

For each image, note briefly:
- Composition: text-dominant / image-dominant / hybrid-split
- Imagery type: product shot / human portrait / illustration / UI screenshot / abstract graphic / text-only
- Palette vibe: bold color blocks / monochrome / warm neutrals / neon / brand-colored
- Typography feel: huge sans-serif / editorial serif / mono / mixed
- Text density: single-word hero / short headline / full paragraph

Then SYNTHESIZE patterns across the set and write a tight design prescription for our designer.

Return ONLY valid JSON matching this exact shape — no prose, no fences:

{
  "per_ad": [
    {"advertiser": "...", "composition": "...", "imagery_type": "...", "palette_vibe": "...", "typography_feel": "...", "text_density": "...", "notable": "one specific detail that stands out"}
  ],
  "patterns": {
    "composition_dominant": "text-dominant | image-dominant | hybrid-split",
    "imagery_dominant": "product | portrait | illustration | screenshot | abstract | text-only",
    "palette_vibe": "bold color blocks | monochrome | warm neutrals | neon | mixed",
    "typography_feel": "huge sans / editorial serif / mono / mixed",
    "text_density": "single-word hero | short headline | full paragraph | mixed",
    "visual_energy": "high / medium / low — overall density of visual elements"
  },
  "design_prescription": "2-3 sentences for our designer: what visual direction would feel NATIVE in this market without copying any specific competitor. Reference what the dominant patterns are and what OUR ads need to lean into to compete visually (not stand out as 'AI generic')."
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

/**
 * Main entry. Downloads top thumbnails, calls Claude vision, returns intel.
 * Returns null if Claude unavailable or no scraped ads with media.
 */
async function extractVisualIntel(scraped) {
  if (!scraped?.length) {
    log("visual-intel: no scraped ads to analyze");
    return null;
  }
  if (!claude.isAvailable()) {
    log("visual-intel: Claude CLI not available — skipping");
    return null;
  }

  const candidates = pickCandidates(scraped, 5);
  if (!candidates.length) {
    log("visual-intel: no ads with media — skipping");
    return null;
  }

  fs.mkdirSync(INTEL_DIR, { recursive: true });
  // Clean prior intel-thumbs so disk doesn't accumulate
  for (const f of fs.readdirSync(INTEL_DIR)) {
    if (f.startsWith("thumb-")) fs.unlinkSync(path.join(INTEL_DIR, f));
  }

  log(`visual-intel: downloading ${candidates.length} competitor thumbnail(s)`);
  const samples = [];
  for (let i = 0; i < candidates.length; i++) {
    const ad = candidates[i];
    const url = ad.thumbnail_url || ad.media_url;
    const ext = (url.match(/\.(png|jpg|jpeg|webp|gif)(?:\?|$)/i) || [, "jpg"])[1];
    const file = `thumb-${String(i + 1).padStart(2, "0")}.${ext.toLowerCase()}`;
    const destAbs = path.join(INTEL_DIR, file);
    const ok = await downloadImage(url, destAbs);
    if (ok) {
      samples.push({ ad, localPath: destAbs });
    } else {
      log(`visual-intel: download failed for #${i + 1} (${ad.advertiser})`);
    }
  }

  if (!samples.length) {
    log("visual-intel: no thumbnails downloaded successfully — skipping");
    return null;
  }

  log(`visual-intel: asking Claude to analyze ${samples.length} thumbnail(s)`);
  try {
    const prompt = buildPrompt(samples);
    const raw = await claude.prompt(prompt, { timeoutMs: 180_000 });
    const parsed = extractJson(raw);
    if (!parsed?.patterns || !parsed?.design_prescription) {
      log("visual-intel: Claude output didn't match schema");
      return null;
    }
    log(
      `visual-intel: extracted — composition=${parsed.patterns.composition_dominant}, imagery=${parsed.patterns.imagery_dominant}, energy=${parsed.patterns.visual_energy}`,
    );
    return parsed;
  } catch (e) {
    log(`visual-intel: Claude error: ${e.message || e}`);
    return null;
  }
}

module.exports = { extractVisualIntel };
