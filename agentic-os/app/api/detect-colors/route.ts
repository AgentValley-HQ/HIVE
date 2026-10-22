import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Dynamic import so a missing Playwright install doesn't kill the dev server.
async function getChromium() {
  try {
    const mod = await import("playwright");
    return mod.chromium;
  } catch {
    return null;
  }
}

interface ColorSample {
  color: string;
  role: string;
}

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m) return null;
  const [, r, g, b, a] = m;
  // Treat fully transparent as not-a-color
  if (a !== undefined && parseFloat(a) < 0.5) return null;
  const hex =
    "#" +
    [r, g, b]
      .map((x) => parseInt(x).toString(16).padStart(2, "0"))
      .join("");
  return hex.toLowerCase();
}

function isNeutral(hex: string): boolean {
  // Skip pure black, pure white, and near-neutral grays — these aren't "brand" colors.
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Neutral: R,G,B within 10 of each other AND luminance is extreme
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread < 15) {
    const lum = (r + g + b) / 3;
    return lum < 25 || lum > 240; // near-black or near-white
  }
  return false;
}

export async function POST(req: Request) {
  const { url } = (await req.json()) as { url?: string };
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  const target = url.startsWith("http") ? url : `https://${url}`;

  const chromium = await getChromium();
  if (!chromium) {
    return NextResponse.json(
      { error: "playwright not installed on server" },
      { status: 500 },
    );
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    });
    const page = await ctx.newPage();
    await page.goto(target, { timeout: 20_000, waitUntil: "domcontentloaded" });
    // Give JS-rendered pages a moment to paint
    await page.waitForTimeout(1500);

    const rawSamples: ColorSample[] = await page.evaluate(() => {
      const samples: { color: string; role: string }[] = [];

      // CTAs
      document
        .querySelectorAll("button, a[class*=button], a[class*=btn], a[class*=cta], [role=button]")
        .forEach((el) => {
          const s = getComputedStyle(el as Element);
          samples.push({ role: "cta_bg", color: s.backgroundColor });
          samples.push({ role: "cta_fg", color: s.color });
        });

      // Headings
      document.querySelectorAll("h1, h2").forEach((el) => {
        const s = getComputedStyle(el as Element);
        samples.push({ role: "heading", color: s.color });
      });

      // Nav/header
      document
        .querySelectorAll("header, nav, [class*=header], [class*=navbar]")
        .forEach((el) => {
          const s = getComputedStyle(el as Element);
          samples.push({ role: "nav_bg", color: s.backgroundColor });
        });

      // Hero sections (first viewport)
      document
        .querySelectorAll("[class*=hero], [class*=banner], section:first-of-type")
        .forEach((el) => {
          const s = getComputedStyle(el as Element);
          samples.push({ role: "hero_bg", color: s.backgroundColor });
          samples.push({ role: "hero_fg", color: s.color });
        });

      // CSS variables on :root
      const rootStyle = getComputedStyle(document.documentElement);
      // CSSStyleDeclaration is iterable in modern browsers
      for (let i = 0; i < rootStyle.length; i++) {
        const prop = rootStyle.item(i);
        if (/^--.*(?:color|primary|secondary|accent|brand|theme)/i.test(prop)) {
          const val = rootStyle.getPropertyValue(prop).trim();
          samples.push({ role: `var:${prop}`, color: val });
        }
      }

      // Body as final fallback
      const bodyStyle = getComputedStyle(document.body);
      samples.push({ role: "body_bg", color: bodyStyle.backgroundColor });
      samples.push({ role: "body_fg", color: bodyStyle.color });

      return samples;
    });

    await browser.close();
    browser = null;

    // Normalize rgb/rgba → hex, strip transparent/neutral, dedupe + weight by frequency
    const weighted = new Map<string, { count: number; roles: Set<string> }>();
    for (const { color, role } of rawSamples) {
      let hex: string | null = null;
      if (color.startsWith("#")) hex = color.toLowerCase();
      else hex = rgbToHex(color);
      if (!hex || hex.length !== 7) continue;
      if (isNeutral(hex)) continue;

      const bucket = weighted.get(hex) || { count: 0, roles: new Set<string>() };
      bucket.count += 1;
      bucket.roles.add(role);
      weighted.set(hex, bucket);
    }

    const sorted = Array.from(weighted.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);

    const colors = sorted.map(([hex, meta]) => {
      // Pick the most "semantic" role to label this with
      const rolesArr = Array.from(meta.roles);
      let role: string | undefined;
      if (rolesArr.some((r) => r.startsWith("var:"))) {
        role = rolesArr.find((r) => r.startsWith("var:"))!.replace("var:--", "");
      } else if (rolesArr.includes("cta_bg")) role = "primary (cta)";
      else if (rolesArr.includes("hero_bg")) role = "hero";
      else if (rolesArr.includes("heading")) role = "heading";
      else if (rolesArr.includes("nav_bg")) role = "nav";
      else role = rolesArr[0];
      return { hex, role };
    });

    return NextResponse.json({ colors, source: target });
  } catch (e: unknown) {
    if (browser) await browser.close().catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
