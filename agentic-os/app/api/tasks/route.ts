import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { TaskState } from "@/app/lib/types";

export const dynamic = "force-dynamic";

const TASKS_PATH = path.join(process.cwd(), "tasks.json");
const TMP_PATH = TASKS_PATH + ".tmp";

const DEFAULT_STATE: TaskState = {
  brain: {},
  target_urls: [],
  country: "IN",
  status: "idle",
  scraped_data: [],
  strategy: {},
  html_slides: [],
  generated_images: [],
  approval_status: "pending",
  log: ["[boot] tasks.json initialized"],
  updated_at: new Date().toISOString(),
};

// Atomic write — write to .tmp then rename over the real file so a
// concurrent reader never sees a half-written tasks.json. Prevents the
// "catch block wipes everything to DEFAULT_STATE on invalid JSON" bug.
async function atomicWrite(data: string) {
  await fs.writeFile(TMP_PATH, data, "utf-8");
  await fs.rename(TMP_PATH, TASKS_PATH);
}

// Read with retry — if an engine subprocess is mid-write and we somehow
// catch an invalid-JSON window, retry briefly instead of destroying state.
// The retry gives atomic renames time to settle.
async function readTasks(): Promise<TaskState> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await fs.readFile(TASKS_PATH, "utf-8");
      if (!raw.trim()) throw new Error("empty tasks.json");
      const parsed = JSON.parse(raw) as TaskState;
      // Backfill fields added after the file was created.
      if (!parsed.brain) parsed.brain = {};
      if (!parsed.country) parsed.country = "IN";
      return parsed;
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      // Only after 3 failures — AND only when the file truly doesn't exist
      // — initialize fresh. If the file exists but is unreadable (half-written
      // / permission issue), do NOT overwrite it — preserve for inspection.
      try {
        await fs.access(TASKS_PATH);
        // File exists but we can't read it — refuse to clobber. Return
        // defaults in-memory so API callers don't crash.
        console.error("[tasks] file exists but unreadable, returning defaults IN-MEMORY (not writing)");
        return { ...DEFAULT_STATE };
      } catch {
        // File really doesn't exist — safe to initialize.
        await atomicWrite(JSON.stringify(DEFAULT_STATE, null, 2));
        return DEFAULT_STATE;
      }
    }
  }
  // Unreachable — the loop either returns or throws past attempt 2.
  return { ...DEFAULT_STATE };
}

async function writeTasks(state: TaskState) {
  await atomicWrite(JSON.stringify(state, null, 2));
}

export async function GET() {
  const state = await readTasks();
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  const patch = (await req.json()) as Partial<TaskState>;
  const current = await readTasks();
  const next: TaskState = {
    ...current,
    ...patch,
    log: [
      ...(current.log ?? []).slice(-80),
      ...(patch.log ?? []),
    ],
    updated_at: new Date().toISOString(),
  };
  await writeTasks(next);
  return NextResponse.json(next);
}

export async function DELETE() {
  await writeTasks({ ...DEFAULT_STATE, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
