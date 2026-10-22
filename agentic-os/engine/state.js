const fs = require("fs");
const path = require("path");

const TASKS_PATH = path.join(__dirname, "..", "tasks.json");
const TMP_PATH = TASKS_PATH + ".tmp";

// Atomic write — stage the full payload into a sibling .tmp file, then
// rename over the real file. fs.renameSync is atomic on NTFS + ext4, so a
// concurrent reader either sees the OLD complete file or the NEW complete
// file — never a half-written one. This kills the "readTasks sees invalid
// JSON mid-write → falls back to DEFAULT_STATE → wipes everything" bug.
function atomicWriteSync(data) {
  fs.writeFileSync(TMP_PATH, data, "utf-8");
  fs.renameSync(TMP_PATH, TASKS_PATH);
}

// Read with retry — if we catch an in-flight write (rare now that the writer
// is atomic, but still possible on slow disks), retry briefly rather than
// nuking the file to defaults.
function read() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = fs.readFileSync(TASKS_PATH, "utf-8");
      if (!raw.trim()) throw new Error("empty tasks.json");
      return JSON.parse(raw);
    } catch (e) {
      if (attempt < 2) {
        // Tiny spin — give the writer time to finish rename.
        const start = Date.now();
        while (Date.now() - start < 20) { /* ~20ms */ }
        continue;
      }
      // Only after 3 failed attempts do we fall back — AND we do NOT write
      // DEFAULT_STATE back to disk. Just return it in-memory so callers
      // don't crash. Preserves whatever's on disk for operator inspection.
      return {
        target_urls: [],
        status: "idle",
        scraped_data: [],
        strategy: {},
        html_slides: [],
        generated_images: [],
        approval_status: "pending",
        log: [],
      };
    }
  }
}

function write(patch) {
  const current = read();
  const next = {
    ...current,
    ...patch,
    log: [
      ...(current.log || []).slice(-80),
      ...(patch.log || []),
    ],
    updated_at: new Date().toISOString(),
  };
  atomicWriteSync(JSON.stringify(next, null, 2));
  return next;
}

function log(line) {
  const stamp = new Date().toISOString().split("T")[1].split(".")[0];
  const formatted = `[${stamp}] ${line}`;
  console.log(formatted);
  write({ log: [formatted] });
}

module.exports = { read, write, log, TASKS_PATH };
