/**
 * engine/claude-cli.js
 *
 * Thin wrapper around the Claude Code CLI (`claude -p`). Uses the operator's
 * existing OAuth session (set up once via `claude login`) — no API key, no
 * per-token billing. Falls back silently if the CLI isn't installed.
 *
 * Setup for operator:
 *   1. npm install -g @anthropic-ai/claude-code
 *   2. claude login          (browser → sign in with email → paste code)
 *   3. Restart the agentic-os dev server
 */

const { spawn, spawnSync } = require("child_process");

const IS_WIN = process.platform === "win32";
const BIN = IS_WIN ? "claude.cmd" : "claude";
// Node ≥ 20 on Windows refuses to spawn .cmd/.bat without shell:true
// (CVE-2024-27980 mitigation). The args we pass (-p, --version) are static,
// and prompt content goes via stdin, so shell injection isn't a concern.
const SPAWN_OPTS = { windowsHide: true, shell: IS_WIN };

let _cached = null;
function isAvailable() {
  if (_cached !== null) return _cached;
  try {
    const r = spawnSync(BIN, ["--version"], {
      ...SPAWN_OPTS,
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 4000,
    });
    _cached = r.status === 0;
  } catch {
    _cached = false;
  }
  return _cached;
}

/**
 * Pipe a prompt into `claude -p` via stdin and resolve with stdout.
 * Rejects on non-zero exit, missing binary, or timeout.
 *
 * Options:
 *   timeoutMs       — kill the subprocess after this many ms (default 2 min)
 *   skipPermissions — pass --dangerously-skip-permissions so Claude can call
 *                     MCP tools (like Higgsfield) non-interactively. Only use
 *                     when the operator explicitly triggered the action.
 */
function prompt(text, { timeoutMs = 120_000, skipPermissions = false } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p"];
    if (skipPermissions) args.push("--dangerously-skip-permissions");

    let child;
    try {
      child = spawn(BIN, args, {
        ...SPAWN_OPTS,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      reject(new Error(`claude CLI not spawnable: ${e.message || e}`));
      return;
    }

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (out += chunk.toString("utf-8")));
    child.stderr.on("data", (chunk) => (err += chunk.toString("utf-8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude exited ${code}: ${err.trim().slice(0, 400)}`));
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}

module.exports = { isAvailable, prompt, BIN };
