"use client";

import { useMemo, useState } from "react";
import {
  Megaphone,
  Globe2,
  Beaker,
  Target as TargetIcon,
  Info,
  Sparkles,
  Loader2,
  RefreshCw,
  Users,
  Film,
  ArrowRight,
  Flame,
  Image as ImageIcon,
  Columns3,
} from "lucide-react";
import type { TaskState, AdPlaybook, PlatformPlan, CreativeAngle, Strategy, AdConcept, OutlineSlide } from "../lib/types";

// A creative is a carousel when its format mentions "carousel" (case-insensitive).
// Everything else is treated as a single-image ad.
function isCarouselCreative(c: CreativeAngle): boolean {
  return /carousel/i.test(c.format || "");
}

interface Props {
  tasks: TaskState | null;
  // When the operator clicks "GENERATE ADS IN FOUNDRY", we need to switch
  // the top-level tab over to the Brand Foundry so they see the forge start.
  onNavigate?: (tabId: string) => void;
}

type Period = "daily" | "weekly" | "monthly";
type Tab = "meta" | "google" | "experimental";

function toMonthly(amount: number, period: Period): number {
  if (period === "daily") return amount * 30;
  if (period === "weekly") return amount * 4.33;
  return amount;
}
function fromMonthly(monthly: number, period: Period): number {
  if (period === "daily") return monthly / 30;
  if (period === "weekly") return monthly / 4.33;
  return monthly;
}
function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

// ─── Static budget-tier → campaign-shape mapping ─────────────────────────
function metaCampaignShape(monthly: number) {
  if (monthly < 500) return "Boosted Posts";
  if (monthly < 2000) return "Engagement + Traffic";
  if (monthly < 10000) return "Conversions (CBO)";
  return "Advantage+ Shopping + ASC";
}
function googleCampaignShape(monthly: number) {
  if (monthly < 500) return "Search — brand terms only";
  if (monthly < 2000) return "Search — brand + category";
  if (monthly < 10000) return "Performance Max + Search";
  return "Performance Max + Search + Display";
}

export default function AdBudgetStrategy({ tasks, onNavigate }: Props) {
  const [budget, setBudget] = useState<number>(1500);
  const [period, setPeriod] = useState<Period>("monthly");
  const [tab, setTab] = useState<Tab>("meta");
  const [generating, setGenerating] = useState(false);
  const [forging, setForging] = useState<Tab | null>(null);
  // Per-platform Higgsfield preference. When ON, the concepts shipped to
  // Brand Foundry get `use_higgsfield: true` so the Foundry forge uses
  // Higgsfield's image model instead of the HTML renderer.
  const [useHiggsfield, setUseHiggsfield] = useState<Record<Tab, boolean>>({
    meta: false,
    google: false,
    experimental: false,
  });

  const monthly = toMonthly(budget, period);

  const platformSignal = useMemo(() => {
    const ads = tasks?.scraped_data ?? [];
    const meta = ads.filter((a) => a.platform === "meta").length;
    const google = ads.filter((a) => a.platform === "google").length;
    const total = meta + google;
    return {
      meta,
      google,
      total,
      metaShare: total > 0 ? meta / total : 0.5,
      googleShare: total > 0 ? google / total : 0.5,
    };
  }, [tasks]);

  const split = useMemo(() => {
    const { metaShare, googleShare, total } = platformSignal;
    if (monthly < 500) {
      if (metaShare > googleShare)
        return { meta: 100, google: 0, test: 0, note: "At this budget, consolidate on Meta — competitor concentration is highest there." };
      if (googleShare > metaShare)
        return { meta: 0, google: 100, test: 0, note: "At this budget, consolidate on Google — competitor concentration is highest there." };
      return { meta: 100, google: 0, test: 0, note: "At this budget, consolidate on Meta — fewer moving parts, easier to see what's working." };
    }
    const base = total > 0
      ? { meta: Math.round(metaShare * 85), google: Math.round(googleShare * 85) }
      : { meta: 50, google: 40 };
    const test = Math.max(0, 100 - base.meta - base.google);
    let note = "";
    if (metaShare > 0.65) note = `Meta weighted higher — ${Math.round(metaShare * 100)}% of competitor ads are running there, that's where the audience is.`;
    else if (googleShare > 0.65) note = `Google weighted higher — ${Math.round(googleShare * 100)}% of competitor ads are running there, intent-driven traffic.`;
    else if (total > 0) note = "Roughly even split — competitors are present on both platforms, cover both channels.";
    else note = "No competitor data yet — default even split. Re-run recon to tune this.";
    return { meta: base.meta, google: base.google, test, note };
  }, [platformSignal, monthly]);

  const monthlyByPlatform = {
    meta: (monthly * split.meta) / 100,
    google: (monthly * split.google) / 100,
    experimental: (monthly * split.test) / 100,
  };

  const playbook: AdPlaybook | undefined = (tasks?.strategy as Strategy | undefined)?.creative_playbook;
  const hasStrategy = !!(tasks?.strategy as Strategy | undefined)?.campaign_name;

  // Transform a platform's CreativeAngles into AdConcepts that Brand Foundry
  // understands, patch strategy.single_ad_concepts, trigger the single-ad
  // forge in the background, then jump to the Foundry tab so the operator
  // watches the generation happen live.
  const forgeInFoundry = async (
    platform: Tab,
    plan: PlatformPlan,
  ) => {
    setForging(platform);
    const higgs = useHiggsfield[platform];
    try {
      // Split the playbook's creatives by format — carousels go to Brand
      // Foundry's carousel pipeline, single images to the single-ad pipeline.
      // Each type gets its own engine spawn so they can run in parallel.
      const singleCreatives = plan.creatives.filter((c) => !isCarouselCreative(c));
      const carouselCreatives = plan.creatives.filter((c) => isCarouselCreative(c));

      const currentStrategy = (tasks?.strategy ?? {}) as Strategy;
      const strategyPatch: Partial<Strategy> = {};

      // ─── Single-image creatives → single_ad_concepts ────────────────
      if (singleCreatives.length > 0) {
        const concepts: AdConcept[] = singleCreatives.map((c, i) => ({
          variant: i + 1,
          concept: c.concept,
          rationale: c.why_it_works,
          headline_direction: c.angle,
          visual_direction: `${c.format} — targeting ${c.audience}. CTA: "${c.cta}".`,
          image: null,
          include_in_forge: true,
          user_edited: false,
          use_higgsfield: higgs || undefined,
          higgsfield_prompt: higgs
            ? `${c.angle}. Audience: ${c.audience}. CTA on image: "${c.cta}". ${c.format}.`
            : undefined,
        }));
        strategyPatch.single_ad_concepts = concepts;
      }

      // ─── Carousel creative → carousel_outline ───────────────────────
      // Brand Foundry holds ONE carousel at a time. If the platform suggested
      // multiple carousel creatives, we take the first (log a note). If the
      // carousel's `slides` array is missing (shouldn't happen with the new
      // prompt), we synthesize a 1-slide placeholder from the angle.
      if (carouselCreatives.length > 0) {
        const chosen = carouselCreatives[0];
        const specs = chosen.slides && chosen.slides.length > 0
          ? chosen.slides
          : [{ slide: 1, title: chosen.concept, body: chosen.angle, role: "hook" }];
        const outline: OutlineSlide[] = specs.map((s, i) => ({
          slide: s.slide ?? i + 1,
          title: s.title,
          body: s.body,
          role: s.role || "custom",
          rationale: chosen.why_it_works,
          image: null,
          include_in_forge: true,
          user_edited: false,
          use_higgsfield: higgs || undefined,
          higgsfield_prompt: higgs
            ? `${s.title}. ${s.body}. Audience: ${chosen.audience}. CTA: "${chosen.cta}". Carousel slide ${s.slide ?? i + 1}.`
            : undefined,
        }));
        strategyPatch.carousel_outline = outline;
      }

      const logParts: string[] = [];
      if (singleCreatives.length)
        logParts.push(`${singleCreatives.length} single ad${singleCreatives.length === 1 ? "" : "s"}`);
      if (carouselCreatives.length) {
        const slideCount = carouselCreatives[0].slides?.length ?? 1;
        logParts.push(`1 carousel (${slideCount} slides)`);
      }
      const summary = logParts.join(" + ") || "nothing";

      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy: { ...currentStrategy, ...strategyPatch },
          log: [
            `[war-room] loaded ${summary} from ${platform.toUpperCase()} playbook${
              higgs ? " · HIGGSFIELD mode" : ""
            } · auto-forging`,
          ],
        }),
      });

      // Fire the engines that have content. If both types are present, both
      // run concurrently — each writes to its own PNG set, Brand Foundry's
      // UI picks up both as they land.
      const engineCalls: Promise<unknown>[] = [];
      if (singleCreatives.length > 0) {
        engineCalls.push(
          fetch("/api/engine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ module: "single-ad" }),
          }),
        );
      }
      if (carouselCreatives.length > 0) {
        engineCalls.push(
          fetch("/api/engine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ module: "forge-carousel" }),
          }),
        );
      }
      await Promise.all(engineCalls);

      onNavigate?.("foundry");
    } catch (e) {
      console.error("forgeInFoundry failed", e);
    } finally {
      setTimeout(() => setForging(null), 1800);
    }
  };

  const generatePlaybook = async () => {
    setGenerating(true);
    try {
      // Mark state so we have a hint something is running (useful for logs).
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          log: ["[war-room] generating creative playbook from scraped competitor data"],
        }),
      });
      await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: "ad-playbook" }),
      });
      // The engine runs in the background; parent's polling will pick up the
      // playbook when it lands. Keep spinner for ~4s so the operator sees
      // intent, then let polling take over.
      setTimeout(() => setGenerating(false), 4000);
    } catch (e) {
      console.error("playbook gen failed", e);
      setGenerating(false);
    }
  };

  const presets: { label: string; monthly: number }[] = [
    { label: "$500", monthly: 500 },
    { label: "$1.5k", monthly: 1500 },
    { label: "$5k", monthly: 5000 },
    { label: "$15k", monthly: 15000 },
    { label: "$50k", monthly: 50000 },
  ];

  const activePlan: PlatformPlan | undefined =
    playbook?.[tab === "experimental" ? "experimental" : (tab as "meta" | "google")];
  const activeMonthly =
    tab === "meta" ? monthlyByPlatform.meta : tab === "google" ? monthlyByPlatform.google : monthlyByPlatform.experimental;
  const activeShare = tab === "meta" ? split.meta : tab === "google" ? split.google : split.test;

  return (
    <div className="space-y-5">
      {/* Budget input row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[9px] tracking-[0.3em] text-white/40">
            YOUR AD BUDGET
          </label>
          <div className="mt-1 flex items-center gap-2 rounded-md border border-white/15 bg-black/50 px-3 py-2">
            <span className="text-xl font-bold text-white">$</span>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
              className="flex-1 bg-transparent text-xl font-bold text-white outline-none"
            />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="rounded border border-white/15 bg-black/60 px-2 py-1 text-[10px] tracking-widest uppercase text-white outline-none"
            >
              <option value="daily">/ DAY</option>
              <option value="weekly">/ WEEK</option>
              <option value="monthly">/ MONTH</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setPeriod("monthly");
                setBudget(p.monthly);
              }}
              className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] tracking-widest text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {p.label}/mo
            </button>
          ))}
        </div>
      </div>

      {/* Monthly equivalent + rationale */}
      <div className="rounded-md border border-white/10 bg-black/40 p-3">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-white/60" />
          <div className="flex-1 text-[11px] leading-relaxed text-white/70">
            Recommendation sized for{" "}
            <span className="font-bold text-white">{fmtMoney(monthly)}/month</span>
            {period !== "monthly" && (
              <span className="text-white/50">
                {" "}(≈ {fmtMoney(fromMonthly(monthly, "daily"))}/day)
              </span>
            )}
            . {split.note}
          </div>
        </div>
      </div>

      {/* Spend allocation bar */}
      <div>
        <div className="mb-2 flex items-center justify-between text-[10px] tracking-[0.3em] text-white/40">
          <span>SPEND ALLOCATION</span>
          <span>{platformSignal.total} COMPETITOR ADS ANALYZED</span>
        </div>
        <div className="flex h-9 overflow-hidden rounded-md border border-white/15 bg-black/50">
          {split.meta > 0 && (
            <AllocSegment icon={Megaphone} label="META" pct={split.meta} />
          )}
          {split.google > 0 && (
            <AllocSegment icon={Globe2} label="GOOGLE" pct={split.google} />
          )}
          {split.test > 0 && (
            <AllocSegment icon={Beaker} label="TEST" pct={split.test} />
          )}
        </div>
      </div>

      {/* Playbook gate — generate button if we don't have one yet */}
      {!playbook && hasStrategy && (
        <div className="rounded-md border border-dashed border-white/20 bg-white/[0.02] p-5 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-white/60" />
          <div className="mt-3 text-xs font-semibold tracking-widest text-white">
            NO CREATIVE PLAYBOOK YET
          </div>
          <div className="mt-1 text-[11px] text-white/60 max-w-md mx-auto">
            Claude will study your {platformSignal.total} scraped competitor ads and write 3 Meta + 3 Google + 1 experimental creative angles — each with rationale grounded in the real patterns competitors are running.
          </div>
          <button
            onClick={generatePlaybook}
            disabled={generating || platformSignal.total === 0}
            className="btn-neon mt-4 inline-flex items-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                SYNTHESIZING…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                GENERATE PLAYBOOK
              </>
            )}
          </button>
          {platformSignal.total === 0 && (
            <div className="mt-2 text-[10px] tracking-widest text-white/40">
              Run recon from Intel Radar first — nothing to analyze yet.
            </div>
          )}
        </div>
      )}

      {/* Playbook tabs */}
      {playbook && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 rounded-md border border-white/10 bg-black/40 p-1">
              <TabButton active={tab === "meta"} onClick={() => setTab("meta")} Icon={Megaphone} label="META" count={playbook.meta.creatives.length} pct={split.meta} />
              <TabButton active={tab === "google"} onClick={() => setTab("google")} Icon={Globe2} label="GOOGLE" count={playbook.google.creatives.length} pct={split.google} />
              <TabButton active={tab === "experimental"} onClick={() => setTab("experimental")} Icon={Beaker} label="TEST" count={playbook.experimental.creatives.length} pct={split.test} />
            </div>
            <button
              onClick={generatePlaybook}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] tracking-widest text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
              title="Regenerate playbook from latest scraped data"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              REGEN
            </button>
          </div>

          {activePlan && (
            <PlanPanel
              plan={activePlan}
              platform={tab}
              monthlyBudget={activeMonthly}
              sharePct={activeShare}
              campaignShape={
                tab === "meta"
                  ? metaCampaignShape(monthlyByPlatform.meta)
                  : tab === "google"
                  ? googleCampaignShape(monthlyByPlatform.google)
                  : activePlan.campaign_type
              }
              forging={forging === tab}
              onForge={() => forgeInFoundry(tab, activePlan)}
              useHiggs={useHiggsfield[tab]}
              onToggleHiggs={(v) => setUseHiggsfield((p) => ({ ...p, [tab]: v }))}
            />
          )}

          <div className="text-right text-[9px] tracking-widest text-white/30">
            PLAYBOOK · GENERATED {playbook.generated_at ? new Date(playbook.generated_at).toLocaleString() : "—"} · FROM {playbook.based_on?.competitor_ads ?? 0} ADS
          </div>
        </div>
      )}

      {/* Rules of engagement */}
      <div className="rounded-md border border-white/10 bg-black/40 p-4">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-white/60">
          <TargetIcon className="h-3 w-3" />
          RULES OF ENGAGEMENT
        </div>
        <ul className="mt-3 space-y-1.5 text-[11px] text-white/70">
          <li>· Run each creative for ≥7 days before judging — Meta learning phase needs 50+ events.</li>
          <li>· Kill any creative under CTR 0.7% (Meta) or 2.5% (Google Search) after 1k impressions.</li>
          <li>· Reinvest winners within 72h — scale budgets by 20% per day, not more (triggers relearn).</li>
          <li>· Refresh creative every {monthly < 2000 ? "3–4 weeks" : monthly < 10000 ? "2–3 weeks" : "7–10 days"} to beat fatigue.</li>
          <li>· Report weekly on <span className="text-white">CPM · CTR · CPA · ROAS</span>; monthly on <span className="text-white">incremental lift</span>.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function AllocSegment({
  icon: Icon,
  label,
  pct,
}: {
  icon: typeof Megaphone;
  label: string;
  pct: number;
}) {
  return (
    <div
      className="flex items-center justify-center gap-1.5 border-r border-black/40 bg-gradient-to-r from-white/18 to-white/8 text-[10px] font-bold tracking-widest text-white"
      style={{ width: `${pct}%` }}
    >
      <Icon className="h-3 w-3" /> {label} · {pct}%
    </div>
  );
}

function TabButton({
  active,
  onClick,
  Icon,
  label,
  count,
  pct,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Megaphone;
  label: string;
  count: number;
  pct: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded px-3 py-1.5 text-[10px] font-semibold tracking-widest transition ${
        active ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/80"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
      <span className="text-[9px] text-white/50">· {pct}% · {count}</span>
    </button>
  );
}

function PlanPanel({
  plan,
  platform,
  monthlyBudget,
  sharePct,
  campaignShape,
  forging,
  onForge,
  useHiggs,
  onToggleHiggs,
}: {
  plan: PlatformPlan;
  platform: Tab;
  monthlyBudget: number;
  sharePct: number;
  campaignShape: string;
  forging: boolean;
  onForge: () => void;
  useHiggs: boolean;
  onToggleHiggs: (v: boolean) => void;
}) {
  const platformLabel = platform === "meta" ? "META" : platform === "google" ? "GOOGLE" : "TEST";
  const n = plan.creatives.length;
  const singleCount = plan.creatives.filter((c) => !isCarouselCreative(c)).length;
  const carouselCount = plan.creatives.filter((c) => isCarouselCreative(c)).length;
  const shipSummary: string = [
    singleCount > 0 ? `${singleCount} SINGLE AD${singleCount === 1 ? "" : "S"}` : "",
    carouselCount > 0 ? `${carouselCount} CAROUSEL` : "",
  ]
    .filter(Boolean)
    .join(" + ");
  return (
    <div className="space-y-4">
      {/* Why we're spending here */}
      <div className="rounded-md border border-white/12 bg-black/50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-[9px] tracking-[0.3em] text-white/40">
              WHY SPEND HERE
            </div>
            <div className="mt-1.5 text-[12px] leading-relaxed text-white/85">
              {plan.rationale}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-white">{fmtMoney(monthlyBudget)}</div>
            <div className="text-[9px] tracking-widest text-white/40">/MO · {sharePct}% OF BUDGET</div>
            <div className="mt-0.5 text-[10px] text-white/60">
              ≈ {fmtMoney(monthlyBudget / 30)}/day
            </div>
          </div>
        </div>
      </div>

      {/* Campaign + targeting */}
      <div className="grid gap-3 md:grid-cols-2">
        <InfoBlock label="CAMPAIGN TYPE" value={campaignShape} />
        <InfoBlock label="TARGETING" value={plan.targeting} />
      </div>

      {/* Creative angles */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] tracking-[0.3em] text-white/40">
          <Sparkles className="h-3 w-3" />
          CREATIVE ANGLES · {n} TO LAUNCH
        </div>
        <div className="grid gap-3">
          {plan.creatives.map((c, i) => (
            <CreativeCard key={i} index={i + 1} creative={c} />
          ))}
        </div>
      </div>

      {/* Primary CTA — ship these creatives to Brand Foundry + auto-forge */}
      <div className="rounded-md border border-white/15 bg-white/[0.03] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[240px]">
            <div className="text-[11px] font-semibold tracking-widest text-white">
              SHIP {shipSummary || `${n} AD${n === 1 ? "" : "S"}`} TO BRAND FOUNDRY
            </div>
            <div className="mt-1 text-[10px] text-white/55">
              {carouselCount > 0 && singleCount > 0
                ? "Carousel ships to the carousel pipeline, single ads ship to the single-ad pipeline — both forge in parallel."
                : carouselCount > 0
                ? "Ships to the Brand Foundry carousel pipeline — auto-fires the carousel forge."
                : "Ships to the Brand Foundry single-ad pipeline — auto-fires the single-ad forge."}{" "}
              You&apos;ll jump to the Foundry to watch each ad render live.
            </div>
          </div>
          <button
            onClick={onForge}
            disabled={forging || n === 0}
            className="btn-neon inline-flex items-center gap-2"
            title={`Load ${n} ${platformLabel} creative${n === 1 ? "" : "s"} into Brand Foundry and auto-forge`}
          >
            {forging ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                SHIPPING…
              </>
            ) : (
              <>
                <Flame className="h-3.5 w-3.5" />
                GENERATE IN FOUNDRY
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>

        {/* Higgsfield toggle — upgrade from HTML renderer to the premium
            image model. Operator opts in per-platform. */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded border p-3 transition ${
            useHiggs
              ? "border-white/35 bg-white/[0.04]"
              : "border-dashed border-white/15 hover:border-white/25"
          }`}
        >
          <input
            type="checkbox"
            checked={useHiggs}
            onChange={(e) => onToggleHiggs(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-white"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-white">
              <Sparkles className="h-3 w-3" />
              RENDER WITH HIGGSFIELD
              {useHiggs && (
                <span className="rounded border border-white/25 bg-white/5 px-1.5 py-[1px] text-[8px] tracking-widest text-white/80">
                  ON
                </span>
              )}
            </div>
            <div className="mt-1 text-[10px] leading-relaxed text-white/55">
              {useHiggs ? (
                <>
                  Each ad will be rendered by Higgsfield&apos;s premium image model (uses credits · ~60–180s per ad). The playbook&apos;s angle + CTA + audience become the Higgsfield brief.
                </>
              ) : (
                <>
                  Off — Brand Foundry uses the built-in HTML renderer (fast, free, text-based). Flip ON to use Higgsfield&apos;s image model instead for photo-grade creative.
                </>
              )}
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/40 p-3">
      <div className="text-[9px] tracking-[0.3em] text-white/40">{label}</div>
      <div className="mt-1 text-[12px] text-white/85">{value}</div>
    </div>
  );
}

function CreativeCard({ index, creative }: { index: number; creative: CreativeAngle }) {
  const isCarousel = isCarouselCreative(creative);
  const slideCount = creative.slides?.length ?? 0;
  return (
    <div className="rounded-md border border-white/12 bg-black/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/20 bg-white/5 text-[11px] font-bold text-white">
            {String(index).padStart(2, "0")}
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-widest text-white uppercase">
              {creative.concept}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/50">
              {creative.format}
              {/* Routing badge — operator sees at a glance which Foundry
                  pipeline this will land in. */}
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-[1px] text-[9px] tracking-widest ${
                  isCarousel
                    ? "border-white/25 bg-white/[0.06] text-white/80"
                    : "border-white/15 bg-white/[0.03] text-white/60"
                }`}
                title={
                  isCarousel
                    ? `Routes to Brand Foundry carousel pipeline${slideCount ? ` · ${slideCount} slides` : ""}`
                    : "Routes to Brand Foundry single-ad pipeline"
                }
              >
                {isCarousel ? <Columns3 className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                → {isCarousel ? "CAROUSEL" : "SINGLE AD"}
              </span>
            </div>
          </div>
        </div>
        {creative.cta && (
          <span className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-1 text-[9px] font-semibold tracking-widest text-white/80 whitespace-nowrap">
            <ArrowRight className="h-2.5 w-2.5" />
            {creative.cta}
          </span>
        )}
      </div>

      <div className="mt-3 text-[12px] leading-relaxed text-white/85">
        <span className="text-white/40 text-[9px] tracking-[0.25em] mr-2">ANGLE</span>
        {creative.angle}
      </div>

      <div className="mt-2.5 rounded border border-white/8 bg-black/30 p-2.5">
        <div className="flex items-start gap-2">
          <Film className="h-3 w-3 shrink-0 mt-0.5 text-white/40" />
          <div className="flex-1">
            <div className="text-[9px] tracking-[0.3em] text-white/40">WHY IT WILL WORK</div>
            <div className="mt-1 text-[11px] italic leading-relaxed text-white/70">
              {creative.why_it_works}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-start gap-2">
        <Users className="h-3 w-3 shrink-0 mt-0.5 text-white/40" />
        <div className="text-[10px] text-white/60">
          <span className="text-white/40 tracking-[0.25em] text-[9px] mr-1.5">AUDIENCE</span>
          {creative.audience}
        </div>
      </div>
    </div>
  );
}
