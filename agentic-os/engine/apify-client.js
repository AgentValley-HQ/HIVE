/**
 * Minimal Apify REST client — uses the run-sync-get-dataset-items endpoint
 * so one call fires the actor, waits for completion, and returns the dataset.
 *
 * Docs: https://docs.apify.com/api/v2#tag/Actor-runsRun-actor-synchronously-and-get-dataset-items
 */

const config = require("./apify.config");

const BASE = "https://api.apify.com/v2";

function hasToken() {
  return Boolean(process.env.APIFY_TOKEN);
}

async function runActor(actorId, input, { signal } = {}) {
  if (!hasToken()) {
    throw new Error("APIFY_TOKEN not set — add it to .env.local");
  }

  const url = `${BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(
    process.env.APIFY_TOKEN,
  )}&timeout=${config.RUN_TIMEOUT_SECS}&format=json&clean=true`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Apify ${actorId} → HTTP ${res.status} ${res.statusText}${body ? ` · ${body.slice(0, 300)}` : ""}`,
    );
  }

  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

module.exports = { runActor, hasToken };
