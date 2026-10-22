"use client";

// Score card shown on each creative in Launchpad.
// Reads tasks.virality written by engine/virality-score.js.

import type { ViralityScore } from "@/app/lib/types";

const FLAG_LABEL: Record<string, string> = {
  off_brand: "Off brand",
  reads_like_slop: "Reads generic",
  blends_in: "Blends in with competitors",
};

function Bar({ label, value }: { label: string; value: number | null | undefined }) {
  const pct = value == null ? null : Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-24 shrink-0 uppercase tracking-wider text-white/50">{label}</span>
      <div className="h-1 flex-1 bg-white/10">
        {pct != null && <div className="h-1 bg-white" style={{ width: `${pct}%` }} />}
      </div>
      <span className="w-8 text-right tabular-nums text-white/70">{pct ?? "-"}</span>
    </div>
  );
}

export default function ViralityScoreCard({
  score,
  rank,
  marketSource,
}: {
  score?: ViralityScore | null;
  rank?: number;
  marketSource?: string;
}) {
  if (!score) {
    return <div className="panel p-3 text-[11px] text-white/40">NOT SCORED</div>;
  }

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{score.hive ?? "-"}</span>
          <span className="text-[11px] uppercase tracking-wider text-white/50">Hive score</span>
        </div>
        {rank != null && <span className="chip">#{rank}</span>}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="uppercase tracking-wider text-white/50">Market fit</div>
          <div className="tabular-nums">
            {marketSource === "real" ? score.market ?? "-" : "No real intel"}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-white/50">Craft</div>
          <div className="tabular-nums">{score.craft ?? "-"}</div>
        </div>
      </div>

      <div className="space-y-1">
        <Bar label="Scroll stop" value={score.parts.scroll_stop} />
        <Bar label="Share worthy" value={score.parts.share_worthy} />
        <Bar label="Clarity" value={score.parts.clarity} />
        <Bar label="Stands out" value={score.parts.stands_out} />
        <Bar label="Proven pattern" value={score.parts.proven_pattern} />
        <Bar label="Fills a gap" value={score.parts.fills_gap} />
      </div>

      {score.hook_type && (
        <div className="text-[11px] text-white/60">
          Hook: <span className="text-white">{score.hook_type.choice}</span>
        </div>
      )}

      {score.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {score.flags.map((f) => (
            <span key={f} className="chip border-red-500/50 text-red-300">
              {FLAG_LABEL[f] ?? f}
            </span>
          ))}
        </div>
      )}

      {marketSource !== "real" && (
        <div className="text-[10px] text-amber-300/80">
          Market fit hidden: Intel Radar data is synthetic or empty. Craft score only.
        </div>
      )}
    </div>
  );
}
