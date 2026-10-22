/**
 * HTML/CSS carousel templates. Each slide is a self-contained HTML
 * document rendered at 1080×1350 by Playwright.
 */

const PALETTES = [
  { bg: "#040509", accent: "#00f0ff", accent2: "#ff00e5", text: "#eafcff" },
  { bg: "#0a0b14", accent: "#ff00e5", accent2: "#b6ff00", text: "#fff0fa" },
  { bg: "#06070d", accent: "#b6ff00", accent2: "#00f0ff", text: "#f3ffd8" },
  { bg: "#070812", accent: "#ffb020", accent2: "#ff00e5", text: "#fff3dc" },
  { bg: "#040509", accent: "#9b5cff", accent2: "#00f0ff", text: "#ece3ff" },
];

function page({ title, body, kicker, slideNum, totalSlides, campaign, palette }) {
  const p = palette;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1350px;
    background: ${p.bg};
    color: ${p.text};
    font-family: ui-monospace, Menlo, Consolas, monospace;
    position: relative;
    overflow: hidden;
    background-image:
      radial-gradient(circle at 20% 10%, ${p.accent}22, transparent 45%),
      radial-gradient(circle at 85% 90%, ${p.accent2}1a, transparent 50%),
      linear-gradient(${p.accent}0f 1px, transparent 1px),
      linear-gradient(90deg, ${p.accent}0f 1px, transparent 1px);
    background-size: auto, auto, 48px 48px, 48px 48px;
  }
  .frame {
    position: absolute;
    inset: 48px;
    border: 1px solid ${p.accent}55;
    border-radius: 18px;
    padding: 72px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: inset 0 0 60px ${p.accent}11, 0 0 80px ${p.accent}22;
  }
  .corner {
    position: absolute;
    width: 42px;
    height: 42px;
    border-color: ${p.accent};
    border-style: solid;
  }
  .corner.tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
  .corner.tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
  .corner.bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
  .corner.br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }
  .kicker {
    display: inline-flex;
    gap: 14px;
    align-items: center;
    font-size: 18px;
    letter-spacing: 0.4em;
    color: ${p.accent};
    text-transform: uppercase;
  }
  .kicker .dot {
    width: 10px; height: 10px; border-radius: 999px;
    background: ${p.accent};
    box-shadow: 0 0 20px ${p.accent};
  }
  .brand {
    position: absolute; top: 48px; right: 72px;
    font-size: 16px; letter-spacing: 0.4em;
    color: ${p.accent2};
    text-transform: uppercase;
  }
  .title {
    font-size: 92px;
    line-height: 1.02;
    letter-spacing: -0.015em;
    color: ${p.text};
    text-shadow: 0 0 24px ${p.accent}66;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-weight: 800;
  }
  .body {
    font-size: 30px;
    line-height: 1.4;
    color: ${p.text}cc;
    max-width: 820px;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-size: 18px;
    letter-spacing: 0.4em;
    color: ${p.accent}bb;
    text-transform: uppercase;
  }
  .pager {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }
  .pager .pill {
    width: 10px; height: 10px; border-radius: 999px;
    background: ${p.accent}44;
    border: 1px solid ${p.accent}66;
  }
  .pager .pill.active {
    width: 32px;
    background: ${p.accent};
    box-shadow: 0 0 16px ${p.accent};
  }
  .big-num {
    position: absolute;
    right: 72px;
    bottom: 110px;
    font-size: 320px;
    line-height: 0.8;
    font-weight: 900;
    color: ${p.accent}18;
    letter-spacing: -0.04em;
    font-family: ui-sans-serif, system-ui, sans-serif;
    pointer-events: none;
  }
  .campaign {
    font-size: 14px;
    letter-spacing: 0.5em;
    color: ${p.accent2};
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="frame">
    <span class="corner tl"></span>
    <span class="corner tr"></span>
    <span class="corner bl"></span>
    <span class="corner br"></span>

    <div class="brand">H.I.V.E // OS</div>

    <div class="big-num">${String(slideNum).padStart(2, "0")}</div>

    <div>
      <div class="kicker"><span class="dot"></span> ${kicker}</div>
    </div>

    <div style="display:flex; flex-direction:column; gap:40px;">
      <div class="title">${title}</div>
      <div class="body">${body}</div>
    </div>

    <div class="footer">
      <div class="campaign">${campaign}</div>
      <div class="pager">
        ${Array.from({ length: totalSlides })
          .map((_, i) => `<span class="pill ${i + 1 === slideNum ? "active" : ""}"></span>`)
          .join("")}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildHtmlSlides(strategy) {
  const outline = strategy.carousel_outline || [];
  return outline.map((s, i) => {
    const palette = PALETTES[i % PALETTES.length];
    const kicker = `${s.role} // slide ${s.slide}`;
    const html = page({
      title: s.title,
      body: s.body,
      kicker,
      slideNum: s.slide,
      totalSlides: outline.length,
      campaign: strategy.campaign_name,
      palette,
    });
    return { index: s.slide, title: s.title, html };
  });
}

module.exports = { buildHtmlSlides };
