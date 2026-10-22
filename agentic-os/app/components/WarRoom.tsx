"use client";

import {
  Swords,
  Users,
  PlayCircle,
  Lightbulb,
  Crosshair,
  Trophy,
  Target as TargetIcon,
  Sparkles,
  ArrowRight,
  Radar,
  Brain as BrainIcon,
  Hammer,
  Loader2,
  Wallet,
  Eye,
} from "lucide-react";
import type { TaskState, Strategy } from "../lib/types";
import { Header } from "./IntelRadar";
import AdBudgetStrategy from "./AdBudgetStrategy";

interface Props {
  tasks: TaskState | null;
  updateTasks: (patch: Partial<TaskState>) => Promise<void>;
  onNavigate?: (tabId: string) => void;
}

export default function WarRoom({ tasks, onNavigate }: Props) {
  const strategy = (tasks?.strategy ?? {}) as Partial<Strategy>;
  const hasStrategy = !!strategy.campaign_name;

  // Live progress states while recon/strategy is in flight — so the operator
  // sees the pipeline move instead of staring at a static empty state.
  if (!hasStrategy) {
    const status = tasks?.status ?? "idle";
    const scrapedCount = tasks?.scraped_data?.length ?? 0;
    const targetCount = tasks?.target_urls?.length ?? 0;
    const lastLog = (tasks?.log ?? []).slice().reverse().find((l) => !!l) || "";

    const PIPELINE: {
      key: string;
      label: string;
      icon: React.ReactNode;
      activeWhen: string[];
    }[] = [
      { key: "scraping", label: "SCRAPING TARGETS", icon: <Radar className="h-3.5 w-3.5" />, activeWhen: ["scraping"] },
      { key: "strategizing", label: "CLAUDE SYNTHESIZING STRATEGY", icon: <BrainIcon className="h-3.5 w-3.5" />, activeWhen: ["strategizing"] },
      { key: "generating_visuals", label: "DESIGNING CAROUSEL SLIDES", icon: <Hammer className="h-3.5 w-3.5" />, activeWhen: ["generating_visuals"] },
    ];
    const activeIdx = PIPELINE.findIndex((p) => p.activeWhen.includes(status));
    const isActive = activeIdx >= 0;

    return (
      <div className="flex h-full items-center justify-center">
        <div className="panel bracket p-8 text-center max-w-xl w-full">
          {isActive ? (
            <Loader2 className="mx-auto h-10 w-10 text-neon-cyan animate-spin" />
          ) : (
            <Swords className="mx-auto h-10 w-10 text-hive-muted" />
          )}
          <div
            className={`mt-4 text-sm font-semibold tracking-[0.2em] ${
              isActive ? "text-neon-cyan neon-text" : "text-hive-muted"
            }`}
          >
            {isActive ? PIPELINE[activeIdx].label : "WAR ROOM EMPTY"}
          </div>
          <div className="mt-2 text-xs text-hive-muted">
            {isActive
              ? status === "scraping"
                ? `Scraping ${targetCount} target${targetCount === 1 ? "" : "s"} · ${scrapedCount} ad${scrapedCount === 1 ? "" : "s"} captured so far`
                : status === "strategizing"
                ? `Analyzing ${scrapedCount} competitor ad${scrapedCount === 1 ? "" : "s"} + your brain profile`
                : "Claude is writing bespoke HTML/CSS for 5 slides — this takes ~60-90 seconds"
              : "Run recon from the Intel Radar first. Strategy, rationale, competitive gaps and the carousel outline will materialize here."}
          </div>

          {isActive && (
            <>
              {/* Pipeline step dots */}
              <div className="mt-6 flex items-center justify-center gap-3">
                {PIPELINE.map((p, i) => {
                  const done = activeIdx > i;
                  const current = activeIdx === i;
                  return (
                    <div
                      key={p.key}
                      className={`flex items-center gap-1.5 rounded px-2 py-1 border text-[9px] tracking-widest ${
                        current
                          ? "border-neon-cyan/60 text-neon-cyan bg-neon-cyan/5"
                          : done
                          ? "border-neon-lime/40 text-neon-lime/80"
                          : "border-hive-grid text-hive-muted"
                      }`}
                    >
                      {p.icon}
                      {p.label.split(" ")[0]}
                    </div>
                  );
                })}
              </div>
              {lastLog && (
                <div className="mt-5 rounded-md border border-neon-cyan/10 bg-black/40 p-2 font-mono text-[10px] text-neon-cyan/70">
                  {lastLog}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* The WHY — top banner */}
      <div className="panel bracket relative overflow-hidden p-6">
        <div className="absolute right-6 top-6 flex items-center gap-2">
          <span className="pill text-neon-magenta">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulseGlow" />
            CLAUDE SYNTHESIS
          </span>
        </div>
        <Header
          icon={<Lightbulb className="h-4 w-4" />}
          title="WHY THIS CAMPAIGN"
          kicker="MOD.02 // WAR ROOM · STRATEGIC RATIONALE"
        />
        <div className="mt-5 grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <div className="text-[9px] tracking-[0.3em] text-hive-muted">
              CAMPAIGN
            </div>
            <div className="mt-1 text-2xl font-bold text-neon-cyan neon-text">
              {strategy.campaign_name}
            </div>
            <div className="mt-4 text-[9px] tracking-[0.3em] text-hive-muted">
              RATIONALE
            </div>
            <div className="mt-2 text-sm leading-relaxed text-white/90">
              {strategy.rationale}
            </div>
            <div className="mt-5 rounded-md border border-neon-magenta/30 bg-neon-magenta/5 p-4">
              <div className="text-[9px] tracking-[0.3em] text-hive-muted">
                CORE HOOK
              </div>
              <div className="mt-1.5 text-base text-white neon-text-magenta">
                &ldquo;{strategy.hook}&rdquo;
              </div>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4 space-y-3">
            <MiniField label="OBJECTIVE" value={strategy.objective!} />
            <MiniField label="TONE" value={strategy.tone!} />
            <MiniField label="AUDIENCE" value={strategy.target_audience!} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Competitive gaps */}
        <div className="col-span-12 lg:col-span-6">
          <div className="panel bracket p-5 h-full">
            <Header
              icon={<Crosshair className="h-4 w-4" />}
              title="COMPETITIVE GAPS"
              kicker="WHERE WE ATTACK"
            />
            <div className="mt-4 space-y-2">
              {(strategy.competitive_gaps ?? []).map((g, i) => (
                <div
                  key={i}
                  className="group flex items-start gap-3 rounded-md border border-neon-magenta/15 bg-hive-void/60 p-3 transition hover:border-neon-magenta/40"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-neon-magenta/40 bg-neon-magenta/5 text-[10px] font-bold text-neon-magenta">
                    0{i + 1}
                  </div>
                  <div className="text-[12px] leading-relaxed text-white/90">
                    {g}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Winning patterns */}
        <div className="col-span-12 lg:col-span-6">
          <div className="panel bracket p-5 h-full">
            <Header
              icon={<Trophy className="h-4 w-4" />}
              title="WINNING PATTERNS"
              kicker="EXTRACTED FROM TOP ADS"
            />
            <div className="mt-4 space-y-2">
              {(strategy.winning_patterns ?? []).map((p, i) => (
                <div
                  key={i}
                  className="group flex items-start gap-3 rounded-md border border-neon-lime/15 bg-hive-void/60 p-3 transition hover:border-neon-lime/40"
                >
                  <Sparkles className="h-4 w-4 text-neon-lime shrink-0 mt-0.5" />
                  <div className="text-[12px] leading-relaxed text-white/90">
                    {p}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Expected outcomes */}
        <div className="col-span-12 lg:col-span-5">
          <div className="panel bracket p-5 h-full">
            <Header
              icon={<TargetIcon className="h-4 w-4" />}
              title="EXPECTED OUTCOMES"
              kicker="KPI TARGETS // WHAT GOOD LOOKS LIKE"
            />
            <div className="mt-4 space-y-2">
              {(strategy.expected_outcomes ?? []).map((o, i) => (
                <div
                  key={i}
                  className="rounded-md border border-neon-cyan/15 bg-hive-void/60 p-3"
                >
                  <div className="text-[10px] tracking-widest text-hive-muted">
                    {o.metric}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-neon-cyan">
                    <ArrowRight className="h-3 w-3" />
                    <span className="text-sm font-bold neon-text">
                      {o.target}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content pillars */}
        <div className="col-span-12 lg:col-span-7">
          <div className="panel bracket p-5 h-full">
            <Header
              icon={<Users className="h-4 w-4" />}
              title="CONTENT PILLARS"
              kicker="FOUR-POST STRUCTURE"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(strategy.pillars ?? []).map((p, i) => (
                <div
                  key={i}
                  className="rounded-md border border-neon-cyan/15 bg-hive-void/60 p-3"
                >
                  <div className="text-[9px] tracking-[0.3em] text-hive-muted">
                    PILLAR 0{i + 1}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-neon-cyan neon-text">
                    {p}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* NOTE: Carousel outline, Ad concepts, and the FORGE triggers now live
          in the Carousel Foundry (MOD.03). War Room = strategic brief only. */}

      {/* Visual intel — what Claude saw in competitor ad images */}
      {strategy.visual_intel && (
        <div className="panel bracket p-5">
          <Header
            icon={<Eye className="h-4 w-4" />}
            title="VISUAL CODES OBSERVED"
            kicker="FROM COMPETITOR AD IMAGES · CLAUDE VISION"
          />
          <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-2 text-[10px] tracking-widest">
            <VisualCode label="COMPOSITION" value={strategy.visual_intel.patterns.composition_dominant} />
            <VisualCode label="IMAGERY" value={strategy.visual_intel.patterns.imagery_dominant} />
            <VisualCode label="PALETTE" value={strategy.visual_intel.patterns.palette_vibe} />
            <VisualCode label="TYPOGRAPHY" value={strategy.visual_intel.patterns.typography_feel} />
            <VisualCode label="TEXT DENSITY" value={strategy.visual_intel.patterns.text_density} />
            <VisualCode label="ENERGY" value={strategy.visual_intel.patterns.visual_energy} tone="amber" />
          </div>
          <div className="mt-4 rounded-md border border-neon-amber/30 bg-neon-amber/5 p-3">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-3 w-3 shrink-0 mt-0.5 text-neon-amber" />
              <div>
                <div className="text-[9px] tracking-[0.3em] text-neon-amber mb-1">
                  DESIGN PRESCRIPTION
                </div>
                <div className="text-[12px] italic text-white/90 leading-relaxed">
                  {strategy.visual_intel.design_prescription}
                </div>
              </div>
            </div>
          </div>
          {strategy.visual_intel.per_ad?.length > 0 && (
            <details className="mt-3 group">
              <summary className="cursor-pointer list-none text-[10px] tracking-widest text-hive-muted hover:text-neon-cyan">
                ▸ PER-AD BREAKDOWN ({strategy.visual_intel.per_ad.length})
              </summary>
              <div className="mt-2 space-y-1.5">
                {strategy.visual_intel.per_ad.map((a, i) => (
                  <div
                    key={i}
                    className="rounded border border-neon-cyan/10 bg-black/40 p-2 text-[10px]"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="chip">#{String(i + 1).padStart(2, "0")}</span>
                      <span className="font-semibold text-white">{a.advertiser}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-0.5 text-hive-muted">
                      <div><span className="text-hive-muted/60">composition:</span> {a.composition}</div>
                      <div><span className="text-hive-muted/60">imagery:</span> {a.imagery_type}</div>
                      <div><span className="text-hive-muted/60">palette:</span> {a.palette_vibe}</div>
                      <div><span className="text-hive-muted/60">typography:</span> {a.typography_feel}</div>
                      <div><span className="text-hive-muted/60">text density:</span> {a.text_density}</div>
                      <div className="col-span-2 md:col-span-3 italic text-neon-cyan/80">↳ {a.notable}</div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Ad budget strategy — tells the operator HOW to deploy a budget
          across Meta vs Google based on where competitors are actually running. */}
      <div className="panel bracket p-5">
        <Header
          icon={<Wallet className="h-4 w-4" />}
          title="AD BUDGET STRATEGY"
          kicker="WHERE TO SPEND · HOW MUCH · WHAT CAMPAIGN"
        />
        <div className="mt-4">
          <AdBudgetStrategy tasks={tasks} onNavigate={onNavigate} />
        </div>
      </div>

      {/* Ops log */}
      {tasks?.log && tasks.log.length > 0 && (
        <div className="panel bracket p-5">
          <Header
            icon={<PlayCircle className="h-4 w-4" />}
            title="OPS LOG"
            kicker="TAIL -F TASKS.JSON"
          />
          <div className="mt-3 max-h-[160px] overflow-y-auto rounded-md border border-neon-cyan/10 bg-black/40 p-3 font-mono text-[10px] text-neon-cyan/80">
            {tasks.log.slice(-20).map((line, i) => (
              <div key={i} className="whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neon-cyan/15 bg-hive-void/60 p-3">
      <div className="text-[9px] tracking-[0.3em] text-hive-muted">{label}</div>
      <div className="mt-1 text-xs text-neon-cyan">{value}</div>
    </div>
  );
}

function VisualCode({
  label,
  value,
  tone = "cyan",
}: {
  label: string;
  value: string;
  tone?: "cyan" | "amber";
}) {
  const color = tone === "amber" ? "text-neon-amber" : "text-neon-cyan";
  return (
    <div className="rounded-md border border-neon-cyan/15 bg-hive-void/60 p-2">
      <div className="text-[9px] tracking-widest text-hive-muted">{label}</div>
      <div className={`mt-1 text-xs font-semibold uppercase ${color}`}>
        {value}
      </div>
    </div>
  );
}
