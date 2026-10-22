/**
 * engine/orchestrator.js
 * Optional file-watcher. Polls tasks.json and auto-dispatches engine
 * scripts when the state asks for them. Useful when running the OS
 * fully headless — `npm run engine:watch`.
 */

const { spawn } = require("child_process");
const path = require("path");
const { read, log } = require("./state");

const TRIGGERS = {
  scraping: "scraper.js",
  generating_visuals: "renderer.js",
  deploying: "publisher.js",
};

const running = new Set();

function dispatch(status) {
  const script = TRIGGERS[status];
  if (!script || running.has(script)) return;
  running.add(script);
  log(`orchestrator → launching ${script}`);
  const child = spawn("node", [path.join(__dirname, script)], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  child.on("exit", (code) => {
    log(`orchestrator ← ${script} exited (${code})`);
    running.delete(script);
  });
}

log("orchestrator online // polling tasks.json every 1.5s");
setInterval(() => {
  const s = read();
  dispatch(s.status);
}, 1500);
