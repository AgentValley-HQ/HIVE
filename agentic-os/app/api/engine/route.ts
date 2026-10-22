import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "scraper",
  "renderer",
  "publisher",
  "single-ad",
  "slide-edit",
  "outline-regen",
  "forge-carousel",
  "ad-concepts-regen",
  "higgsfield-gen",
  "ad-playbook",
  "virality-score",
  "market-summary",
]);

export async function POST(req: Request) {
  const { module } = (await req.json()) as { module?: string };
  if (!module || !ALLOWED.has(module)) {
    return NextResponse.json({ ok: false, error: "unknown module" }, { status: 400 });
  }

  const script = path.join(process.cwd(), "engine", `${module}.js`);
  const child = spawn("node", [script], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  return NextResponse.json({ ok: true, module, pid: child.pid });
}
