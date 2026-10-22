// engine/jev-client.js
// Minimal client for TypeSafe Jev (System One API).
// Same pattern as apify-client.js: reads .env.local itself, returns null
// when no key is set so the pipeline keeps running without scores.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && v && !process.env[k]) process.env[k] = v;
  }
}
loadEnv();

// Pin a version so scores stay comparable across campaigns.
// Override with JEV_MODEL in .env.local when you choose to upgrade.
const MODEL = process.env.JEV_MODEL || "jev-1.13.0";

// Setting TYPESAFE_API_KEY=mock in .env.local routes every call through the
// local content-aware mock (engine/jev-mock.js) — no network, no cost. The
// mock derives scores from actual creative text so Launchpad shows real
// variation across slides/variants.
function isMock() {
  return (process.env.TYPESAFE_API_KEY || "").trim().toLowerCase() === "mock";
}

function available() {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask Jev a set of typed questions about one state.
 * @param {string|object|array} state
 * @param {object} questions  { name: { type, instructions, criteria } }
 * @param {object} opts       { assets, images, model, retries, timeoutMs }
 * @returns {Promise<object|null>} { model, answers, usage } or null if no key
 */
async function ask(state, questions, opts = {}) {
  if (!available()) return null;

  // Mock mode short-circuits before any network setup — returns the same
  // response shape as the real API so virality-score.js can't tell the
  // difference.
  if (isMock()) {
    const mock = require("./jev-mock");
    return mock.ask(state, questions, opts);
  }

  const { assets, images = false, model = MODEL, retries = 2, timeoutMs = 20000 } = opts;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
  };
  // Image input is an opt-in, experimental header on TypeSafe's side.
  if (images) headers["TypeSafe-Danger-Zone-Images"] = "true";

  const payload = { model, state, questions };
  if (assets) payload.assets = assets;
  const body = JSON.stringify(payload);

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(ENDPOINT, { method: "POST", headers, body, signal: ctrl.signal });

      // Fatal: do not retry.
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error("Jev: API key rejected"), { fatal: true });
      }
      if (res.status === 422) {
        const t = await res.text();
        throw Object.assign(new Error(`Jev: invalid request ${t.slice(0, 400)}`), { fatal: true });
      }

      // Transient: back off and retry.
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        lastErr = new Error(`Jev: HTTP ${res.status}`);
        await sleep(ra > 0 ? ra * 1000 : 600 * 2 ** attempt);
        continue;
      }

      if (!res.ok) throw Object.assign(new Error(`Jev: HTTP ${res.status}`), { fatal: true });
      return await res.json();
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e; // network error or timeout
      await sleep(600 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("Jev: out of retries");
}

// Helpers to turn answers into 0..1 numbers.
function noul(answers, name) {
  const a = answers?.[name];
  return a && a.type === "noul" ? a.noul : null;
}

function score01(answers, name) {
  const a = answers?.[name];
  if (!a || a.type !== "score") return null;
  const levels = Object.keys(a.legend || {}).length;
  return levels > 1 ? a.score / (levels - 1) : null;
}

function choice(answers, name) {
  const a = answers?.[name];
  return a && a.type === "choice" ? { choice: a.choice, confidence: a.confidence } : null;
}

module.exports = { ask, available, isMock, noul, score01, choice, MODEL };
