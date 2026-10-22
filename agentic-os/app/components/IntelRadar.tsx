"use client";

import { useState } from "react";
import {
  Radar as RadarIcon,
  Target,
  Trash2,
  Plus,
  Rss,
  Database,
  TrendingUp,
  Hash,
  Heart,
  Eye,
  MousePointerClick,
  DollarSign,
  CalendarClock,
  LayoutList,
  ListPlus,
  Play,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import type { TaskState, ScrapedAd, Platform } from "../lib/types";
import AdLightbox from "./AdLightbox";

interface Props {
  tasks: TaskState | null;
  updateTasks: (patch: Partial<TaskState>) => Promise<void>;
}

const SUGGESTIONS = [
  "https://linear.app",
  "https://notion.so",
  "https://cal.com",
  "https://vercel.com",
  "https://stripe.com",
];

const COUNTRIES: { code: string; label: string }[] = [
  { code: "IN", label: "India" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "BR", label: "Brazil" },
  { code: "AE", label: "UAE" },
  { code: "SG", label: "Singapore" },
  { code: "JP", label: "Japan" },
  { code: "MX", label: "Mexico" },
  { code: "ALL", label: "All countries" },
];

export default function IntelRadar({ tasks, updateTasks }: Props) {
  const [input, setInput] = useState("");
  const [bulk, setBulk] = useState("");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [previewAd, setPreviewAd] = useState<ScrapedAd | null>(null);

  const urls = tasks?.target_urls ?? [];
  const scraped = tasks?.scraped_data ?? [];
  const country = tasks?.country ?? "IN";
  const isScraping = tasks?.status === "scraping";

  const setCountry = async (code: string) => {
    await updateTasks({ country: code });
  };

  const addUrl = async () => {
    const v = input.trim();
    if (!v) return;
    const next = Array.from(new Set([...urls, v]));
    await updateTasks({ target_urls: next });
    setInput("");
  };

  const addBulk = async () => {
    const lines = bulk
      .split(/[\n,\s]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const next = Array.from(new Set([...urls, ...lines]));
    await updateTasks({ target_urls: next });
    setBulk("");
  };

  const addSuggestion = async (u: string) => {
    if (urls.includes(u)) return;
    await updateTasks({ target_urls: [...urls, u] });
  };

  const removeUrl = async (u: string) => {
    await updateTasks({ target_urls: urls.filter((x) => x !== u) });
  };

  const clearAll = async () => {
    await updateTasks({ target_urls: [] });
  };

  const commence = async () => {
    if (!urls.length) return;
    await updateTasks({
      status: "scraping",
      scraped_data: [],
      log: [`[radar] recon commenced on ${urls.length} target(s)`],
    });
    fetch("/api/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "scraper" }),
    }).catch(() => undefined);
  };

  const totalLeads = scraped.reduce((a, s) => a + (s.analytics?.estimated_leads ?? 0), 0);
  const totalSpend = scraped.reduce((a, s) => a + (s.analytics?.estimated_spend_usd ?? 0), 0);
  const avgCtr =
    scraped.length > 0
      ? Math.round(
          (scraped.reduce((a, s) => a + (s.analytics?.ctr ?? 0), 0) / scraped.length) * 100,
        ) / 100
      : 0;

  return (
    <div className="h-full space-y-6">
    <div className="grid grid-cols-12 gap-6">
      {/* Left: input + target list */}
      <div className="col-span-12 lg:col-span-5 space-y-6">
        <div className="panel bracket p-5">
          <Header
            icon={<RadarIcon className="h-4 w-4" />}
            title="RECON TARGETS"
            kicker="MOD.01 // INTEL RADAR"
          />

          <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] tracking-widest">
            <button
              onClick={() => setMode("single")}
              className={`flex items-center gap-1.5 rounded px-2 py-1 border transition ${
                mode === "single"
                  ? "border-neon-cyan/60 text-neon-cyan bg-neon-cyan/10"
                  : "border-hive-grid text-hive-muted hover:text-white"
              }`}
            >
              <Plus className="h-3 w-3" />
              SINGLE
            </button>
            <button
              onClick={() => setMode("bulk")}
              className={`flex items-center gap-1.5 rounded px-2 py-1 border transition ${
                mode === "bulk"
                  ? "border-neon-magenta/60 text-neon-magenta bg-neon-magenta/10"
                  : "border-hive-grid text-hive-muted hover:text-white"
              }`}
            >
              <LayoutList className="h-3 w-3" />
              BULK PASTE
            </button>

            <div className="ml-2 flex items-center gap-1.5">
              <span className="text-hive-muted">MARKET:</span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="rounded border border-neon-cyan/40 bg-hive-void/80 px-2 py-1 text-[10px] tracking-widest text-neon-cyan outline-none hover:border-neon-cyan transition"
                title="Country/market used for Meta Ad Library search"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code} className="bg-hive-void text-white">
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="ml-auto text-hive-muted">{urls.length} LOCKED</div>
          </div>

          {mode === "single" ? (
            <div className="mt-3 flex gap-2">
              <input
                className="input-neon"
                placeholder="facebook.com/competitor  OR  competitor.com  OR  Ad Library URL"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUrl()}
              />
              <button className="btn-neon" onClick={addUrl} aria-label="Add target">
                <Plus className="h-4 w-4" />
                LOCK
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <textarea
                className="input-neon font-mono"
                rows={5}
                placeholder={`facebook.com/brand-a\nbrand-b.com\nhttps://facebook.com/ads/library/?view_all_page_id=12345`}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <div className="text-[10px] tracking-widest text-hive-muted">
                  ONE URL PER LINE · COMMAS OK
                </div>
                <button className="btn-neon btn-magenta" onClick={addBulk}>
                  <ListPlus className="h-4 w-4" />
                  LOCK ALL
                </button>
              </div>
            </div>
          )}

          <div className="mt-2 space-y-0.5 text-[9px] tracking-wider text-hive-muted leading-relaxed">
            <div>
              <span className="text-neon-lime">BEST ·</span> FB page URL
              (facebook.com/handle) → exact advertiser match
            </div>
            <div>
              <span className="text-neon-cyan">OK ·</span> Website domain
              (brand.com) → we auto-find their FB page
            </div>
            <div>
              <span className="text-neon-cyan">OK ·</span> Ad Library URL
              (facebook.com/ads/library/?...) → used directly
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="text-[9px] tracking-[0.3em] text-hive-muted self-center mr-1">
              QUICK ADD:
            </span>
            {SUGGESTIONS.map((s) => {
              const added = urls.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => addSuggestion(s)}
                  disabled={added}
                  className={`text-[10px] tracking-wider px-2 py-1 rounded border transition ${
                    added
                      ? "border-neon-lime/40 text-neon-lime/60 cursor-not-allowed"
                      : "border-hive-grid text-hive-muted hover:border-neon-cyan/50 hover:text-neon-cyan"
                  }`}
                >
                  {added ? "✓ " : "+ "}
                  {s.replace("https://", "")}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {urls.length === 0 && (
              <div className="rounded-md border border-dashed border-neon-cyan/20 p-6 text-center text-xs tracking-widest text-hive-muted">
                NO TARGETS LOCKED
              </div>
            )}
            {urls.map((u, i) => (
              <div
                key={u}
                className="flex items-center justify-between rounded-md border border-neon-cyan/15 bg-hive-panel/50 px-3 py-2"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Target className="h-3.5 w-3.5 text-neon-magenta shrink-0" />
                  <span className="text-[10px] tracking-widest text-hive-muted">
                    TGT.{String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate text-xs text-white">{u}</span>
                </div>
                <button
                  onClick={() => removeUrl(u)}
                  className="text-hive-muted hover:text-neon-magenta transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={commence}
              disabled={urls.length === 0 || isScraping}
              className="btn-neon btn-magenta flex-1 justify-center"
            >
              <Rss className="h-4 w-4" />
              {isScraping ? "RECON IN PROGRESS..." : `COMMENCE RECON · ${urls.length}`}
            </button>
            {urls.length > 0 && !isScraping && (
              <button
                onClick={clearAll}
                className="btn-neon btn-danger"
                title="Clear all targets"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <StatPanel
          scraped={scraped.length}
          targets={urls.length}
          totalLeads={totalLeads}
          totalSpend={totalSpend}
          avgCtr={avgCtr}
        />
      </div>

      {/* Right: radar + results */}
      <div className="col-span-12 lg:col-span-7 space-y-6">
        <div className="panel bracket relative overflow-hidden p-5">
          <Header
            icon={<RadarIcon className="h-4 w-4" />}
            title="LIVE SIGNAL SWEEP"
            kicker="BAND // 2.4GHZ · ENCRYPTED"
          />
          <div className="relative mt-5 aspect-square w-full max-w-[380px] mx-auto">
            <RadarCircles />
            {isScraping && <div className="radar-sweep rounded-full" />}
            {scraped.slice(0, 12).map((s, i) => {
              const angle = (i / Math.max(scraped.length, 1)) * Math.PI * 2;
              const r = 30 + (s.engagement_score % 60);
              const x = 50 + Math.cos(angle) * r;
              const y = 50 + Math.sin(angle) * r;
              return (
                <div
                  key={i}
                  className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon-magenta shadow-neon-magenta animate-pulseGlow"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  title={s.advertiser}
                />
              );
            })}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-[9px] tracking-[0.3em] text-hive-muted">
                  SIGNALS
                </div>
                <div className="text-3xl font-bold neon-text text-neon-cyan">
                  {String(scraped.length).padStart(2, "0")}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    {/* Scraped Ad Library — full-width grid below the main 12-col row */}
    <AdLibrary ads={scraped} onPreview={(ad) => setPreviewAd(ad)} />

    <AdLightbox ad={previewAd} onClose={() => setPreviewAd(null)} />
    </div>
  );
}

// ─── Library view ────────────────────────────────────────────────────────────

type SortKey = "score" | "days" | "recent";
type PlatformFilter = "all" | Platform;

function AdLibrary({
  ads,
  onPreview,
}: {
  ads: ScrapedAd[];
  onPreview: (ad: ScrapedAd) => void;
}) {
  const [filter, setFilter] = useState<PlatformFilter>("all");
  const [sort, setSort] = useState<SortKey>("score");
  const [query, setQuery] = useState("");

  const platformCounts = ads.reduce<Record<string, number>>((acc, a) => {
    acc[a.platform] = (acc[a.platform] || 0) + 1;
    return acc;
  }, {});

  const filtered = ads
    .filter((a) => (filter === "all" ? true : a.platform === filter))
    .filter((a) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        a.advertiser.toLowerCase().includes(q) ||
        a.headline.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "score") return b.engagement_score - a.engagement_score;
      if (sort === "days")
        return (b.analytics?.days_running || 0) - (a.analytics?.days_running || 0);
      // recent — items with newest start-date first; fallback to days_running
      return (a.analytics?.days_running || 0) - (b.analytics?.days_running || 0);
    });

  if (ads.length === 0) {
    return (
      <div className="panel bracket p-8 text-center">
        <Database className="mx-auto h-8 w-8 text-hive-muted" />
        <div className="mt-3 text-xs tracking-widest text-hive-muted">
          NO AD LIBRARY YET
        </div>
        <div className="mt-1 text-[10px] text-hive-muted/70">
          Lock a target above and COMMENCE RECON to populate.
        </div>
      </div>
    );
  }

  return (
    <div className="panel bracket p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] tracking-[0.3em] text-hive-muted">
            MOD.01 // AD LIBRARY
          </div>
          <div className="mt-1 flex items-center gap-2 text-neon-cyan">
            <Database className="h-4 w-4" />
            <span className="text-sm font-semibold tracking-[0.2em] uppercase">
              SCRAPED AD LIBRARY
            </span>
            <span className="text-[11px] text-hive-muted ml-1">
              · {filtered.length} of {ads.length}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Platform filter chips */}
          <div className="flex items-center gap-1 rounded border border-hive-grid p-0.5">
            {(["all", "meta", "google", "tiktok", "linkedin"] as const)
              .filter((p) => p === "all" || platformCounts[p])
              .map((p) => (
                <button
                  key={p}
                  onClick={() => setFilter(p as PlatformFilter)}
                  className={`rounded px-2 py-1 text-[10px] tracking-widest transition ${
                    filter === p
                      ? "bg-neon-cyan/15 text-neon-cyan"
                      : "text-hive-muted hover:text-white"
                  }`}
                >
                  {p.toUpperCase()}
                  {p !== "all" && (
                    <span className="ml-1 text-[9px] opacity-70">
                      {platformCounts[p]}
                    </span>
                  )}
                </button>
              ))}
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-neon-cyan/30 bg-hive-void/80 px-2 py-1 text-[10px] tracking-widest text-neon-cyan outline-none"
          >
            <option value="score" className="bg-hive-void">SORT: SCORE</option>
            <option value="days" className="bg-hive-void">SORT: DAYS LIVE</option>
            <option value="recent" className="bg-hive-void">SORT: RECENT</option>
          </select>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search copy or advertiser..."
            className="input-neon !py-1 text-[11px] w-56"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((a, i) => (
          <AdLibraryCard
            key={`${a.library_url || a.source_url}-${i}`}
            ad={a}
            onPreview={() => onPreview(a)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="mt-5 rounded-md border border-dashed border-neon-cyan/15 p-6 text-center text-xs tracking-widest text-hive-muted">
          NO ADS MATCH FILTER
        </div>
      )}
    </div>
  );
}

function AdLibraryCard({
  ad,
  onPreview,
}: {
  ad: ScrapedAd;
  onPreview: () => void;
}) {
  const { text: headline, isDynamic: headlineDyn } = cleanText(ad.headline);
  const { isDynamic: bodyDyn } = cleanText(ad.body);
  const isDynamic = headlineDyn || bodyDyn;
  const hasMedia = !!ad.media_url && ad.media_type !== "none";

  return (
    <div
      className="group fade-in flex flex-col overflow-hidden rounded-md border border-neon-cyan/15 bg-hive-void/60 transition hover:border-neon-cyan/50 hover:shadow-neon-cyan cursor-pointer"
      onClick={onPreview}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPreview()}
    >
      {/* Big thumbnail */}
      <div className="relative aspect-[4/5] overflow-hidden bg-black">
        {hasMedia && ad.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.thumbnail_url}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-105"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-hive-muted">
            <ImageIcon className="h-10 w-10 opacity-40" />
          </div>
        )}
        {ad.media_type === "video" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full border border-white/40 bg-black/50 p-2 backdrop-blur">
              <Play className="h-5 w-5 text-white" />
            </div>
          </div>
        )}
        {/* Top-left: platform badge */}
        <div className="pointer-events-none absolute left-2 top-2">
          <PlatformBadge platform={ad.platform} />
        </div>
        {/* Top-right: score */}
        <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full border border-neon-amber/40 bg-black/70 px-2 py-0.5 text-[10px] font-bold text-neon-amber backdrop-blur">
          <TrendingUp className="h-2.5 w-2.5" />
          {ad.engagement_score}
        </div>
        {/* Open-external icon */}
        {ad.library_url && (
          <a
            href={ad.library_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 right-2 rounded-full border border-white/30 bg-black/60 p-1 text-white/70 opacity-0 transition hover:text-white group-hover:opacity-100 backdrop-blur"
            title="View original on Meta/Google"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Metadata */}
      <div className="flex-1 p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-white">
            {ad.advertiser}
          </span>
          {isDynamic && (
            <span className="shrink-0 rounded border border-neon-amber/40 bg-neon-amber/10 px-1 py-0.5 text-[8px] tracking-widest uppercase text-neon-amber">
              DPA
            </span>
          )}
        </div>
        {headline ? (
          <div className="text-[11px] text-neon-cyan/90 line-clamp-2">
            {headline}
          </div>
        ) : (
          <div className="text-[10px] italic text-hive-muted">
            — No copy, image/video only —
          </div>
        )}
        <div className="flex items-center justify-between pt-1 text-[9px] tracking-widest text-hive-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-2.5 w-2.5" />
            {ad.analytics?.days_running || 0}D LIVE
          </span>
          {ad.is_active && (
            <span className="inline-flex items-center gap-1 text-neon-lime">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-lime animate-pulseGlow" />
              ACTIVE
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function cleanText(s: string): { text: string; isDynamic: boolean } {
  if (!s) return { text: "", isDynamic: false };
  // Meta's DPA ads inject {{product.name}} / {{product.brand}} placeholders.
  const isDynamic = /\{\{[\w.]+\}\}/.test(s);
  const text = s.replace(/\{\{[\w.]+\}\}/g, "").replace(/\s+/g, " ").trim();
  return { text, isDynamic };
}

function AdCard({
  ad,
  index,
  onPreview,
}: {
  ad: ScrapedAd;
  index: number;
  onPreview: () => void;
}) {
  const a = ad.analytics;
  const { text: headline, isDynamic: headlineDyn } = cleanText(ad.headline);
  const { text: body, isDynamic: bodyDyn } = cleanText(ad.body);
  const isDynamic = headlineDyn || bodyDyn;
  const hasRealMetrics =
    a && (a.likes > 0 || a.impressions > 0 || a.ctr > 0 || a.estimated_spend_usd > 0);
  const hasMedia = !!ad.media_url && ad.media_type !== "none";

  return (
    <div
      className="group fade-in rounded-md border border-neon-cyan/15 bg-hive-void/60 p-3 transition hover:border-neon-cyan/40 hover:shadow-neon-cyan cursor-pointer"
      onClick={onPreview}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPreview()}
    >
      <div className="flex items-start gap-3">
        {/* Inline thumbnail */}
        <div className="relative shrink-0">
          <div className="h-16 w-16 overflow-hidden rounded-md border border-neon-cyan/20 bg-black">
            {hasMedia && ad.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ad.thumbnail_url}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-hive-muted">
                <ImageIcon className="h-5 w-5" />
              </div>
            )}
          </div>
          {ad.media_type === "video" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-full bg-black/60 p-1">
                <Play className="h-3 w-3 text-white" />
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="chip">#{String(index + 1).padStart(2, "0")}</span>
            <PlatformBadge platform={ad.platform} />
            <span className="text-xs font-semibold text-white truncate">
              {ad.advertiser}
            </span>
            {isDynamic && (
              <span className="inline-block rounded border border-neon-amber/40 bg-neon-amber/10 px-1.5 py-0.5 text-[8px] tracking-[0.2em] uppercase text-neon-amber">
                DYNAMIC CATALOG
              </span>
            )}
            {ad.library_url && (
              <a
                href={ad.library_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-hive-muted hover:text-neon-cyan transition"
                title="View original on Meta Ad Library"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {headline ? (
            <div className="mt-1.5 text-[11px] text-neon-cyan/90">{headline}</div>
          ) : (
            <div className="mt-1.5 text-[10px] italic text-hive-muted">
              {isDynamic
                ? "— Dynamic product ad (copy varies per impression) —"
                : "— Image/video only, no ad copy —"}
            </div>
          )}
          {body && body !== headline && (
            <div className="mt-1 text-[11px] text-hive-muted line-clamp-2">
              {body}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1 text-neon-amber">
            <TrendingUp className="h-3 w-3" />
            <span className="text-sm font-bold">{ad.engagement_score}</span>
          </div>
          <div className="text-[9px] tracking-widest text-hive-muted mt-0.5">
            SCORE
          </div>
        </div>
      </div>

      {hasRealMetrics ? (
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          <Metric
            icon={<Heart className="h-3 w-3" />}
            label="LIKES"
            value={formatNum(a!.likes)}
            color="text-neon-magenta"
          />
          <Metric
            icon={<Eye className="h-3 w-3" />}
            label="IMPR"
            value={formatNum(a!.impressions)}
            color="text-neon-cyan"
          />
          <Metric
            icon={<MousePointerClick className="h-3 w-3" />}
            label="CTR"
            value={`${a!.ctr}%`}
            color="text-neon-lime"
          />
          <Metric
            icon={<Target className="h-3 w-3" />}
            label="LEADS"
            value={formatNum(a!.estimated_leads)}
            color="text-neon-amber"
          />
          <Metric
            icon={<DollarSign className="h-3 w-3" />}
            label="SPEND"
            value={`$${formatNum(a!.estimated_spend_usd)}`}
            color="text-neon-violet"
          />
        </div>
      ) : a ? (
        <div className="mt-3 rounded border border-hive-grid bg-black/30 px-2.5 py-1.5 text-[9px] tracking-widest text-hive-muted">
          ENGAGEMENT PRIVATE · PUBLIC LIBRARY ONLY EXPOSES CREATIVE + LONGEVITY
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {ad.tags.filter(Boolean).slice(0, 5).map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-[9px] tracking-widest text-neon-magenta"
          >
            <Hash className="h-2.5 w-2.5" />
            {t.toUpperCase()}
          </span>
        ))}
        {a && a.days_running > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[9px] tracking-widest text-hive-muted">
            <CalendarClock className="h-2.5 w-2.5" />
            {a.days_running}D LIVE
          </span>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded border border-neon-cyan/10 bg-black/30 p-1.5 text-center">
      <div className={`flex items-center justify-center gap-1 ${color}`}>
        {icon}
        <span className="text-[11px] font-bold">{value}</span>
      </div>
      <div className="mt-0.5 text-[8px] tracking-widest text-hive-muted">
        {label}
      </div>
    </div>
  );
}

function PlatformBadge({ platform }: { platform: Platform }) {
  const styles: Record<Platform, string> = {
    meta: "border-neon-cyan/40 text-neon-cyan",
    linkedin: "border-neon-violet/40 text-neon-violet",
    google: "border-neon-amber/40 text-neon-amber",
    tiktok: "border-neon-magenta/40 text-neon-magenta",
    x: "border-neon-lime/40 text-neon-lime",
  };
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[8px] tracking-[0.2em] uppercase ${styles[platform]}`}
    >
      {platform}
    </span>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function RadarCircles() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0">
      <defs>
        <radialGradient id="rgrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,240,255,0.14)" />
          <stop offset="100%" stopColor="rgba(0,240,255,0)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#rgrad)" />
      {[48, 36, 24, 12].map((r) => (
        <circle
          key={r}
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="rgba(0,240,255,0.25)"
          strokeWidth="0.3"
        />
      ))}
      <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(0,240,255,0.2)" strokeWidth="0.3" />
      <line x1="50" y1="2" x2="50" y2="98" stroke="rgba(0,240,255,0.2)" strokeWidth="0.3" />
      <circle cx="50" cy="50" r="1.2" fill="#00f0ff" />
    </svg>
  );
}

function StatPanel({
  scraped,
  targets,
  totalLeads,
  totalSpend,
  avgCtr,
}: {
  scraped: number;
  targets: number;
  totalLeads: number;
  totalSpend: number;
  avgCtr: number;
}) {
  const stats = [
    { label: "TARGETS", value: targets, color: "text-neon-cyan" },
    { label: "ADS", value: scraped, color: "text-neon-magenta" },
    { label: "AVG CTR", value: `${avgCtr}%`, color: "text-neon-lime" },
    { label: "EST. LEADS", value: formatNum(totalLeads), color: "text-neon-amber" },
    { label: "OBS. SPEND", value: `$${formatNum(totalSpend)}`, color: "text-neon-violet" },
    { label: "UPTIME", value: "100%", color: "text-neon-lime" },
  ];
  return (
    <div className="panel bracket p-5">
      <Header
        icon={<TrendingUp className="h-4 w-4" />}
        title="OPS TELEMETRY"
        kicker="LIVE // 2S POLL"
      />
      <div className="mt-4 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-md border border-neon-cyan/15 bg-hive-void/50 p-2.5"
          >
            <div className="text-[9px] tracking-[0.3em] text-hive-muted">
              {s.label}
            </div>
            <div className={`mt-1 text-lg font-bold ${s.color} neon-text`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Header({
  icon,
  title,
  kicker,
}: {
  icon: React.ReactNode;
  title: string;
  kicker: string;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[9px] tracking-[0.3em] text-hive-muted">
          {kicker}
        </div>
        <div className="mt-1 flex items-center gap-2 text-neon-cyan">
          {icon}
          <span className="text-sm font-semibold tracking-[0.2em] uppercase">
            {title}
          </span>
        </div>
      </div>
      <div className="h-2 w-2 rounded-full bg-neon-lime animate-pulseGlow shadow-neon-lime" />
    </div>
  );
}
