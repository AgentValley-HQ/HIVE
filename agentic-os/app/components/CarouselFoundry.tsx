"use client";

import {
  Flame,
  Image as ImageIcon,
  Hammer,
  Code2,
  Lightbulb,
  Columns3,
  Megaphone,
} from "lucide-react";
import type {
  TaskState,
  Strategy,
  OutlineSlide,
  AdConcept,
} from "../lib/types";
import { Header } from "./IntelRadar";
import OutlineEditor from "./OutlineEditor";
import AdConceptEditor from "./AdConceptEditor";

interface Props {
  tasks: TaskState | null;
  updateTasks: (patch: Partial<TaskState>) => Promise<void>;
}

export default function CarouselFoundry({ tasks, updateTasks }: Props) {
  const slides = tasks?.html_slides ?? [];
  const imgs = tasks?.generated_images ?? [];
  const singleAds = tasks?.generated_single_ads ?? [];
  const isGenerating = tasks?.status === "generating_visuals";
  const strategy = (tasks?.strategy ?? {}) as Partial<Strategy>;
  const hasStrategy = !!strategy.campaign_name;
  // Forge is available whenever we have a strategy AND nothing else is
  // actively running. Disable only during states where the engine is busy
  // (so parallel forges don't clobber each other's writes). The old gate
  // was an allowlist that relied on scraper leaving status stuck at
  // "strategizing" — fragile and inverted intent.
  const BUSY: readonly string[] = [
    "scraping",
    "strategizing",
    "generating_visuals",
    "scoring",
  ];
  const canForge = hasStrategy && !BUSY.includes(tasks?.status ?? "");

  // ─── Handlers moved from War Room ─────────────────────────────────────────
  const forgeCarousel = async () => {
    await updateTasks({
      status: "generating_visuals",
      html_slides: [],
      log: ["[foundry] carousel forge triggered (re-design from current outline)"],
    });
    fetch("/api/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "forge-carousel" }),
    }).catch(() => undefined);
  };

  const forgeSingleAd = async () => {
    await updateTasks({
      status: "generating_visuals",
      log: ["[foundry] single-ad forge triggered (3 variants)"],
    });
    fetch("/api/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "single-ad" }),
    }).catch(() => undefined);
  };

  const updateOutline = async (nextOutline: OutlineSlide[]) => {
    await updateTasks({
      strategy: { ...strategy, carousel_outline: nextOutline } as Strategy,
    });
  };

  const regenerateOutline = async (prompt: string) => {
    await updateTasks({
      status: "strategizing",
      log: [`[foundry] outline regenerate: "${prompt.slice(0, 80) || "(no steer)"}"`],
      pending_edit: {
        format: "carousel",
        index: 0,
        prompt,
        requested_at: new Date().toISOString(),
      },
    });
    fetch("/api/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "outline-regen" }),
    }).catch(() => undefined);
  };

  const updateAdConcepts = async (nextConcepts: AdConcept[]) => {
    await updateTasks({
      strategy: { ...strategy, single_ad_concepts: nextConcepts } as Strategy,
    });
  };

  const regenerateAdConcepts = async (prompt: string) => {
    await updateTasks({
      status: "strategizing",
      log: [`[foundry] ad concepts regenerate: "${prompt.slice(0, 80) || "(no steer)"}"`],
      pending_edit: {
        format: "single_ad",
        index: 0,
        prompt,
        requested_at: new Date().toISOString(),
      },
    });
    fetch("/api/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "ad-concepts-regen" }),
    }).catch(() => undefined);
  };

  // Empty state when no strategy exists yet (recon hasn't been run or completed)
  if (!hasStrategy) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="panel bracket p-8 text-center max-w-md">
          <Hammer className="mx-auto h-10 w-10 text-hive-muted" />
          <div className="mt-4 text-sm font-semibold tracking-[0.2em] text-hive-muted">
            FOUNDRY EMPTY
          </div>
          <div className="mt-2 text-xs text-hive-muted">
            Run recon from the Intel Radar first. The outline, ad concepts and
            forge controls will appear here once Claude synthesizes the strategy.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
    {/* ─── Carousel outline editor ─── */}
    <div className="panel bracket p-5">
      <Header
        icon={<Columns3 className="h-4 w-4" />}
        title="CAROUSEL OUTLINE"
        kicker="EDIT · ADD · REORDER · REGENERATE"
      />
      <div className="mt-4">
        <OutlineEditor
          outline={(strategy.carousel_outline ?? []) as OutlineSlide[]}
          onChange={updateOutline}
          onRegenerate={regenerateOutline}
          regenerating={tasks?.status === "strategizing"}
        />
      </div>
    </div>

    {/* ─── Ad concepts editor ─── */}
    <div className="panel bracket p-5">
      <Header
        icon={<ImageIcon className="h-4 w-4" />}
        title="AD CONCEPTS · 3 VARIANTS"
        kicker="SINGLE AD STRATEGY · UPLOAD PRODUCT SHOTS HERE"
      />
      <div className="mt-4">
        <AdConceptEditor
          concepts={(strategy.single_ad_concepts ?? []) as AdConcept[]}
          onChange={updateAdConcepts}
          onRegenerate={regenerateAdConcepts}
          regenerating={tasks?.status === "strategizing"}
        />
      </div>
    </div>

    {/* ─── Forge triggers ─── */}
    <div className="panel bracket p-5">
      <Header
        icon={<Megaphone className="h-4 w-4" />}
        title="EXECUTE // FORGE CREATIVE"
        kicker="PICK A FORMAT · BOTH CAN RUN"
      />
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-md border border-neon-lime/20 bg-hive-void/40 p-4">
          <div className="flex items-center gap-2 text-neon-lime">
            <Columns3 className="h-4 w-4" />
            <span className="text-xs font-semibold tracking-widest">
              CAROUSEL · {(strategy.carousel_outline || []).length} SLIDES
            </span>
          </div>
          <div className="mt-2 text-[11px] text-hive-muted">
            Instagram-style carousel at{" "}
            <span className="text-neon-cyan">1080×1350</span>. Narrative hook
            → problem → solution → proof → CTA.
          </div>
          <button
            className="btn-neon btn-lime mt-3 w-full justify-center"
            onClick={forgeCarousel}
            disabled={!canForge}
          >
            <Flame className="h-4 w-4" />
            {tasks?.status === "generating_visuals"
              ? "FORGING..."
              : "FORGE CAROUSEL"}
          </button>
        </div>

        <div className="rounded-md border border-neon-amber/20 bg-hive-void/40 p-4">
          <div className="flex items-center gap-2 text-neon-amber">
            <ImageIcon className="h-4 w-4" />
            <span className="text-xs font-semibold tracking-widest">
              SINGLE AD · {(strategy.single_ad_concepts || []).length || 3}{" "}
              VARIANTS
            </span>
          </div>
          <div className="mt-2 text-[11px] text-hive-muted">
            Meta square feed ad at{" "}
            <span className="text-neon-cyan">1080×1080</span>. Variants for A/B
            testing from the concepts above.
          </div>
          <button
            className="btn-neon btn-amber mt-3 w-full justify-center"
            onClick={forgeSingleAd}
            disabled={!canForge}
          >
            <ImageIcon className="h-4 w-4" />
            {tasks?.status === "generating_visuals"
              ? "FORGING..."
              : "FORGE SINGLE AD"}
          </button>
        </div>
      </div>
    </div>

    {/* ─── State + rendered output ─── */}
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-6 space-y-6">
        <div className="panel bracket p-5">
          <Header
            icon={<Hammer className="h-4 w-4" />}
            title="FOUNDRY STATE"
            kicker="MOD.03 // CREATIVE FOUNDRY"
          />
          <div className="mt-5 grid grid-cols-4 gap-2">
            <StatBox label="SLIDES" value={slides.length} color="cyan" />
            <StatBox label="CAROUSEL PNG" value={imgs.length} color="magenta" />
            <StatBox label="SINGLE ADS" value={singleAds.length} color="amber" />
            <StatBox
              label="FORMATS"
              value={<span className="text-xs">2×</span>}
              color="amber"
            />
          </div>

          {isGenerating && (
            <div className="mt-5 overflow-hidden rounded-md border border-neon-amber/30 bg-neon-amber/5 p-3">
              <div className="flex items-center gap-2 text-neon-amber">
                <Flame className="h-4 w-4 animate-pulseGlow" />
                <span className="text-[10px] tracking-widest">
                  FORGE ACTIVE // RENDERING {slides.length} FRAMES
                </span>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/50">
                <div
                  className="h-full bg-gradient-to-r from-neon-amber via-neon-magenta to-neon-cyan animate-pulseGlow"
                  style={{
                    width: slides.length
                      ? `${(imgs.length / slides.length) * 100}%`
                      : "20%",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="panel bracket p-5">
          <Header
            icon={<Code2 className="h-4 w-4" />}
            title="HTML TEMPLATES"
            kicker="RAW SLIDE SOURCE"
          />
          <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {slides.length === 0 && (
              <div className="rounded-md border border-dashed border-neon-cyan/20 p-6 text-center text-xs tracking-widest text-hive-muted">
                NO SLIDE SOURCE LOADED
              </div>
            )}
            {slides.map((s) => (
              <details
                key={s.index}
                className="group rounded-md border border-neon-cyan/15 bg-hive-void/60 overflow-hidden"
              >
                <summary className="cursor-pointer list-none p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="chip">
                        SLIDE {String(s.index).padStart(2, "0")}
                      </span>
                      <span className="text-xs font-semibold text-white">
                        {s.title}
                      </span>
                    </div>
                    <span className="text-[10px] tracking-widest text-hive-muted group-open:text-neon-cyan">
                      ▸ VIEW HTML
                    </span>
                  </div>
                </summary>
                <pre className="max-h-[160px] overflow-auto border-t border-neon-cyan/10 bg-black/50 p-3 text-[10px] text-neon-cyan/70">
                  <code>{s.html}</code>
                </pre>
              </details>
            ))}
          </div>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-6">
        <div className="panel bracket p-5 h-full">
          <Header
            icon={<ImageIcon className="h-4 w-4" />}
            title="RENDERED FRAMES"
            kicker="PNG OUTPUT // /public/generated-ads"
          />
          {imgs.length === 0 ? (
            <div className="mt-5 flex h-[320px] items-center justify-center rounded-md border border-dashed border-neon-cyan/20">
              <div className="text-center">
                <Flame className="mx-auto h-6 w-6 text-hive-muted" />
                <div className="mt-2 text-xs tracking-widest text-hive-muted">
                  NO FRAMES RENDERED
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3">
              {imgs.map((img) => (
                <FramePreview key={img.index} path={img.path} index={img.index} title={img.title} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Single-ad variants — only shown when single-ad generation has run */}
    {singleAds.length > 0 && (
      <div className="panel bracket p-5">
        <Header
          icon={<ImageIcon className="h-4 w-4" />}
          title="SINGLE AD · 3 VARIANTS"
          kicker="MOD.03 // 1080×1080 META FEED"
        />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {singleAds.map((ad) => (
            <AdVariantPreview
              key={ad.variant}
              path={ad.path}
              variant={ad.variant}
              concept={ad.concept}
              rationale={ad.concept_rationale}
            />
          ))}
        </div>
      </div>
    )}
    </div>
  );
}

function AdVariantPreview({
  path,
  variant,
  concept,
  rationale,
}: {
  path: string;
  variant: number;
  concept: string;
  rationale?: string;
}) {
  const src = `${path}?v=${Date.now().toString().slice(0, -4)}`;
  return (
    <div className="group flex flex-col overflow-hidden rounded-md border border-neon-amber/30 bg-black">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Variant ${variant}`}
          className="aspect-square w-full object-cover opacity-95 transition group-hover:opacity-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
          <span className="chip border-neon-amber/40 text-neon-amber">
            V{String(variant).padStart(2, "0")}
          </span>
          <span className="text-[9px] font-bold tracking-widest text-white truncate max-w-[160px] uppercase">
            {concept}
          </span>
        </div>
      </div>
      {rationale && (
        <div className="flex items-start gap-2 border-t border-neon-amber/20 bg-neon-amber/5 p-2.5">
          <Lightbulb className="h-3 w-3 shrink-0 mt-0.5 text-neon-amber" />
          <div className="min-w-0 flex-1">
            <div className="text-[8px] tracking-[0.25em] text-neon-amber mb-0.5">
              WHY THIS ANGLE
            </div>
            <div className="text-[11px] italic text-white/85 leading-relaxed">
              {rationale}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color: "cyan" | "magenta" | "amber";
}) {
  const colorClass =
    color === "cyan"
      ? "text-neon-cyan"
      : color === "magenta"
      ? "text-neon-magenta"
      : "text-neon-amber";
  return (
    <div className="rounded-md border border-neon-cyan/15 bg-hive-void/50 p-3">
      <div className="text-[9px] tracking-[0.3em] text-hive-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold neon-text ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

function FramePreview({
  path,
  index,
  title,
}: {
  path: string;
  index: number;
  title: string;
}) {
  // Append a timestamp so updates bust the cache.
  const src = `${path}?v=${Date.now().toString().slice(0, -4)}`;
  return (
    <div className="group relative overflow-hidden rounded-md border border-neon-cyan/20 bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        className="aspect-[4/5] w-full object-cover opacity-90 transition group-hover:opacity-100 group-hover:scale-105"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
        <span className="chip">#{String(index).padStart(2, "0")}</span>
        <span className="text-[9px] font-bold tracking-widest text-white truncate max-w-[100px]">
          {title}
        </span>
      </div>
    </div>
  );
}
