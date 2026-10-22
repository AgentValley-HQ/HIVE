"use client";

import { useEffect } from "react";
import {
  X,
  ExternalLink,
  Heart,
  Eye,
  Hash,
  CalendarClock,
  MousePointerClick,
  Play,
} from "lucide-react";
import type { ScrapedAd } from "../lib/types";

interface Props {
  ad: ScrapedAd | null;
  onClose: () => void;
}

export default function AdLightbox({ ad, onClose }: Props) {
  // ESC to close
  useEffect(() => {
    if (!ad) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [ad, onClose]);

  if (!ad) return null;

  const hasMedia = ad.media_url && ad.media_type !== "none";
  const isDynamic = /\{\{[\w.]+\}\}/.test(ad.body || "") || /\{\{[\w.]+\}\}/.test(ad.headline || "");
  const cleanBody = (ad.body || "").replace(/\{\{[\w.]+\}\}/g, "[DYNAMIC]");
  const cleanHeadline = (ad.headline || "").replace(/\{\{[\w.]+\}\}/g, "[DYNAMIC]");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md fade-in p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-neon-cyan/30 bg-hive-void shadow-neon-cyan md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full border border-neon-cyan/40 bg-black/70 p-2 text-neon-cyan transition hover:bg-neon-cyan/20"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Media */}
        <div className="relative flex min-h-[300px] items-center justify-center bg-black md:w-[55%] md:min-h-[480px]">
          {ad.media_type === "video" && ad.media_url ? (
            <video
              key={ad.media_url}
              src={ad.media_url}
              poster={ad.thumbnail_url || undefined}
              controls
              autoPlay
              loop
              muted
              playsInline
              className="h-full max-h-[85vh] w-full object-contain"
            />
          ) : ad.media_type === "image" && ad.media_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ad.media_url}
              alt={cleanHeadline}
              className="h-full max-h-[85vh] w-full object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-hive-muted">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-hive-grid">
                <Play className="h-8 w-8" />
              </div>
              <div className="text-xs tracking-widest">
                {isDynamic ? "DYNAMIC CATALOG AD" : "NO CREATIVE AVAILABLE"}
              </div>
              <div className="max-w-xs text-[11px] text-hive-muted/70">
                {isDynamic
                  ? "Creative is personalized per impression — Meta doesn't expose a canonical version in the public library."
                  : "This ad's media could not be extracted."}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 md:w-[45%]">
          {/* Header */}
          <div className="flex items-center gap-3">
            {ad.advertiser_avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ad.advertiser_avatar}
                alt={ad.advertiser}
                className="h-10 w-10 rounded-full border border-neon-cyan/40 object-cover"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">
                {ad.advertiser}
              </div>
              <div className="flex items-center gap-2 text-[9px] tracking-widest text-hive-muted">
                <span className="rounded border border-neon-cyan/40 px-1.5 py-0.5 text-neon-cyan uppercase">
                  {ad.platform}
                </span>
                {ad.is_active !== false && (
                  <span className="inline-flex items-center gap-1 text-neon-lime">
                    <span className="h-1.5 w-1.5 rounded-full bg-neon-lime animate-pulseGlow" />
                    LIVE
                  </span>
                )}
                {ad.media_type && ad.media_type !== "none" && (
                  <span className="text-neon-magenta uppercase">
                    {ad.media_type}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Headline + body */}
          <div className="mt-5">
            <div className="text-[9px] tracking-[0.3em] text-hive-muted">
              HEADLINE
            </div>
            <div className="mt-1 text-base font-semibold text-neon-cyan neon-text">
              {cleanHeadline || "—"}
            </div>
          </div>

          {cleanBody && cleanBody !== cleanHeadline && (
            <div className="mt-4">
              <div className="text-[9px] tracking-[0.3em] text-hive-muted">
                BODY COPY
              </div>
              <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-white/90">
                {cleanBody}
              </div>
            </div>
          )}

          {/* Meta grid */}
          <div className="mt-5 grid grid-cols-2 gap-2 text-[10px] tracking-widest">
            <MetaRow
              icon={<MousePointerClick className="h-3 w-3" />}
              label="CTA"
              value={ad.cta || "—"}
            />
            <MetaRow
              icon={<CalendarClock className="h-3 w-3" />}
              label="DAYS LIVE"
              value={ad.analytics?.days_running ? `${ad.analytics.days_running}D` : "—"}
            />
            <MetaRow
              icon={<Heart className="h-3 w-3" />}
              label="SCORE"
              value={String(ad.engagement_score)}
            />
            <MetaRow
              icon={<Eye className="h-3 w-3" />}
              label="IMPRESSIONS"
              value={ad.analytics?.impressions ? formatNum(ad.analytics.impressions) : "PRIVATE"}
            />
          </div>

          {/* Tags */}
          {ad.tags?.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {ad.tags.filter(Boolean).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded border border-neon-magenta/30 bg-neon-magenta/5 px-1.5 py-0.5 text-[9px] tracking-widest text-neon-magenta"
                >
                  <Hash className="h-2.5 w-2.5" />
                  {t.toUpperCase()}
                </span>
              ))}
            </div>
          )}

          {/* Links */}
          <div className="mt-auto grid grid-cols-1 gap-2 pt-6">
            {ad.landing_url && (
              <a
                href={ad.landing_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-neon justify-center"
              >
                <ExternalLink className="h-4 w-4" />
                VISIT LANDING PAGE
              </a>
            )}
            {ad.library_url && (
              <a
                href={ad.library_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-neon btn-magenta justify-center"
              >
                <ExternalLink className="h-4 w-4" />
                VIEW ORIGINAL ON META
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border border-neon-cyan/15 bg-black/40 p-2">
      <div className="flex items-center gap-1 text-hive-muted">
        {icon}
        <span className="text-[9px]">{label}</span>
      </div>
      <div className="mt-0.5 truncate text-xs text-white">{value}</div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
