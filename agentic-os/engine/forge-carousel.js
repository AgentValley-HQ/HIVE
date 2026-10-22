/**
 * engine/forge-carousel.js
 *
 * Full carousel forge: designer (Claude writes HTML from current outline)
 * + renderer (Playwright → PNG). Used when operator clicks FORGE CAROUSEL
 * after editing the outline — ensures any outline changes or uploaded
 * images flow into the final creative.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { read, write, log } = require("./state");
const { design } = require("./carousel-designer");
const { processPending: processHiggsfieldPending } = require("./higgsfield-gen");

function runNode(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [path.join(__dirname, script)], {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
      windowsHide: true,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)),
    );
    child.on("error", reject);
  });
}

async function run() {
  const state = read();
  const strategy = state.strategy || {};
  const brain = state.brain || {};
  const outline = strategy.carousel_outline || [];

  if (!outline.length) {
    log("no outline in strategy — abort");
    write({ status: "pending_approval" });
    return;
  }

  // Only slides with the tick ON go through generation AND appear in the
  // output. Unticked slides are EXCLUDED entirely — the operator's intent
  // is "forge only these", not "preserve the others".
  const toForge = outline.filter((s) => s.include_in_forge !== false);
  const skippedCount = outline.length - toForge.length;
  log(
    `forge-carousel booting // ${toForge.length}/${outline.length} slides ticked${
      skippedCount ? ` (${skippedCount} excluded from output)` : ""
    }`,
  );

  if (toForge.length === 0) {
    log("no slides ticked — nothing to forge");
    write({ status: "pending_approval", log: ["[forge] no slides ticked — skipped"] });
    return;
  }

  // Clear ALL slide PNGs + HTMLs. Only ticked slides will be regenerated,
  // so unticked slide files should not linger on disk.
  const OUT_DIR = path.join(__dirname, "..", "public", "generated-ads");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (/^slide_.*\.(png|html)$/.test(f)) fs.unlinkSync(path.join(OUT_DIR, f));
  }

  // Reset Higgsfield flags on every slide — nothing is being preserved.
  // Ticked slides re-mark themselves during this forge; unticked ones
  // simply won't produce output.
  const resetOutline = outline.map((s) => {
    const { higgsfield_rendered, higgsfield_path, ...rest } = s;
    return rest;
  });

  write({
    status: "generating_visuals",
    html_slides: [],
    generated_images: [],
    strategy: { ...strategy, carousel_outline: resetOutline },
  });

  // 0. Higgsfield batch — toggled slides get a FINISHED PNG written directly
  //    to /generated-ads/, and are marked higgsfield_rendered:true so the
  //    designer + renderer skip them.
  log("processing Higgsfield-toggled slides (if any)");
  await processHiggsfieldPending("carousel");

  // Re-read state so the designer sees the fresh higgsfield_rendered flags
  const freshState = read();
  const freshStrategy = freshState.strategy || {};

  // 1. Design — Claude writes HTML for the non-Higgsfield slides only
  log("designing non-Higgsfield slides");
  const { slides, source } = await design(freshStrategy, brain, { log });
  write({ html_slides: slides, log: [`[forge] designed via ${source}`] });

  // 2. Render — renderer.js reads html_slides, Playwright → PNG, and MERGES
  //    with existing Higgsfield generated_images rather than overwriting.
  log("rendering slides to PNG");
  await runNode("renderer.js");

  log("forge-carousel complete");
}

run().catch((e) => {
  log(`forge-carousel fatal: ${e.message || e}`);
  write({ status: "strategizing" });
});
