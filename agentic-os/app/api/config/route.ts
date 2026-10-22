import { NextResponse } from "next/server";
import { spawnSync } from "child_process";

export const dynamic = "force-dynamic";

function claudeCliAvailable(): boolean {
  const isWin = process.platform === "win32";
  const bin = isWin ? "claude.cmd" : "claude";
  try {
    const r = spawnSync(bin, ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 3000,
      windowsHide: true,
      shell: isWin, // Node refuses to spawn .cmd without shell:true on Windows
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

export async function GET() {
  return NextResponse.json({
    apify_enabled: Boolean(process.env.APIFY_TOKEN),
    claude_enabled: claudeCliAvailable(),
  });
}
