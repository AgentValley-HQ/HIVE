"use client";

import { useMemo, useState } from "react";
import {
  Rocket,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Timer,
  Share2,
  Wand2,
  Download,
  Copy,
  ExternalLink,
  Instagram,
  Linkedin,
  Twitter,
  Megaphone,
  Globe2,
} from "lucide-react";
import type { TaskState } from "../lib/types";
import { Header } from "./IntelRadar";
import EditModal from "./EditModal";
import ViralityScoreCard from "./ViralityScoreCard";

interface Props {
  tasks: TaskState | null;
  updateTasks: (patch: Partial<TaskState>) => Promise<void>;
}

// ─── Platform registry ───────────────────────────────────────────────────
// Each entry is a one-click deploy flow: open the platform's composer in a
// new tab, auto-download the asset(s), and copy a pre-made caption.
type Platform = {
  key: string;
  name: string;
  Icon: typeof Instagram;
  composerUrl: (caption: string) => string;
  supports: "carousel" | "single_ad" | "both";
  blurb: string;
};

const PLATFORMS: Platform[] = [
  {
    key: "instagram",
    name: "Instagram",
    Icon: Instagram,
    // IG has no direct web composer with text pre-fill — opens app/web home.
    // Operator pastes caption after upload.
    composerUrl: () => "https://www.instagram.com/",
    supports: "both",
    blurb: "Carousel or single — IG home opens, caption copied",
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    Icon: Linkedin,
    composerUrl: () => "https://www.linkedin.com/feed/?shareActive=true",
    supports: "both",
    blurb: "Share dialog opens — attach files + paste caption",
  },
  {
    key: "x",
    name: "X / Twitter",
    Icon: Twitter,
    composerUrl: (c) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(c.slice(0, 260))}`,
    supports: "both",
    blurb: "Compose dialog pre-filled with caption",
  },
  {
    key: "meta_ads",
    name: "Meta Ads Manager",
    Icon: Megaphone,
    composerUrl: () =>
      "https://business.facebook.com/adsmanager/manage/campaigns?act=all",
    supports: "single_ad",
    blurb: "Meta Ads Manager — paid campaign setup",
  },
  {
    key: "google_ads",
    name: "Google Ads",
    Icon: Globe2,
    composerUrl: () => "https://ads.google.com/aw/campaigns",
    supports: "single_ad",
    blurb: "Google Ads — Display or Discovery campaign",
  },
];

// ─── Caption helpers ─────────────────────────────────────────────────────
function buildCaption(
  tasks: TaskState | null,
  format: "carousel" | "single",
  platform: string,
): string {
  const strategy = tasks?.strategy || {};
  const brain = tasks?.brain || {};
  const brandName = brain.business_name || "";
  const hook = strategy.hook || "";
  const campaign = strategy.campaign_name || "";
  const cta = brain.current_cta || "Learn more.";

  // Platform-tailored body
  const base = [hook, campaign ? `— ${campaign}` : ""].filter(Boolean).join(" ");

  if (platform === "x") {
    // 280 chars max — tight
    return [base, cta].filter(Boolean).join(" ").slice(0, 275);
  }

  // Instagram / LinkedIn — longer, hashtag-friendly
  const diffs = brain.differentiators?.slice(0, 3).join(" · ") || "";
  const parts = [
    base,
    diffs ? `\n\n${diffs}` : "",
    cta ? `\n\n→ ${cta}` : "",
    brandName ? `\n\n#${brandName.replace(/\s+/g, "")}` : "",
  ].filter(Boolean);

  // Carousel captions can be richer — tell them to swipe
  if (format === "carousel") {
    parts.splice(1, 0, "\n\n(Swipe →)");
  }

  return parts.join("");
}

// ─── Download helpers ────────────────────────────────────────────────────
async function downloadOne(path: string, filename: string) {
  const res = await fetch(path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadAll(
  imgs: { path: string; filename: string }[],
) {
  // Browsers rate-limit sequential downloads — stagger ~250ms per file.
  for (let i = 0; i < imgs.length; i++) {
    const { path, filename } = imgs[i];
    await downloadOne(path, filename);
    await new Promise((r) => setTimeout(r, 250));
  }
}

export default function Launchpad({ tasks, updateTasks }: Props) {
  const carouselImgs = tasks?.generated_images ?? [];
  const singleAdsRaw = tasks?.generated_single_ads ?? [];
  const status = tasks?.status ?? "idle";
  const [idx, setIdx] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  // Rank single ads by Jev score (best first) when a playbook has been
  // generated — unranked variants fall to the end.
  const rankOf = (variant: number) =>
    tasks?.virality?.single_ad_ranking?.find((r) => r.index === variant)?.rank ?? 999;
  const singleAds = useMemo(
    () => [...singleAdsRaw].sort((a, b) => rankOf(a.variant) - rankOf(b.variant)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [singleAdsRaw, tasks?.virality?.single_ad_ranking],
  );
  const [format, setFormat] = useState<"carousel" | "single">(
    singleAds.length > 0 && carouselImgs.length === 0 ? "single" : "carousel",
  );
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);

  const imgs =
    format === "carousel"
      ? carouselImgs.map((i) => ({ path: i.path, label: i.title, key: i.index }))
      : singleAds.map((a) => ({
          path: a.path,
          label: a.concept,
          key: a.variant,
        }));
  const active = imgs[idx];

  // Virality score + market source for the active item.
  const marketSource = tasks?.virality?.market_source;
  const activeScore =
    format === "carousel"
      ? tasks?.virality?.carousel ?? null
      : active
      ? tasks?.virality?.single_ads?.[String(active.key)] ?? null
      : null;
  const activeRank =
    format === "single" && active ? rankOf(active.key) : undefined;

  const brandSlug = useMemo(
    () =>
      (tasks?.brain?.business_name || "hive")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "hive",
    [tasks?.brain?.business_name],
  );

  const reject = async () => {
    await updateTasks({
      status: "strategizing",
      approval_status: "rejected",
      log: ["[launchpad] rejected // returned to war room"],
    });
  };

  const approve = async () => {
    await updateTasks({
      status: "pending_approval",
      approval_status: "approved",
      log: ["[launchpad] approved // ready for manual publish"],
    });
  };

  const applyEdit = async (prompt: string) => {
    const target = imgs[idx];
    if (!target) return;
    const editFormat = format === "carousel" ? "carousel" : "single_ad";
    await updateTasks({
      pending_edit: {
        format: editFormat,
        index: target.key,
        prompt,
        requested_at: new Date().toISOString(),
      },
      status: "generating_visuals",
      log: [`[launchpad] edit requested on ${editFormat} ${target.key}: "${prompt.slice(0, 80)}"`],
    });
    await fetch("/api/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "slide-edit" }),
    }).catch(() => undefined);
  };

  const prev = () => setIdx((i) => (imgs.length ? (i - 1 + imgs.length) % imgs.length : 0));
  const next = () => setIdx((i) => (imgs.length ? (i + 1) % imgs.length : 0));

  const downloadCurrent = async () => {
    if (!active) return;
    const ext = active.path.split(".").pop() || "png";
    const filename =
      format === "carousel"
        ? `${brandSlug}_carousel_slide-${String(active.key).padStart(2, "0")}.${ext}`
        : `${brandSlug}_ad_v${String(active.key).padStart(2, "0")}.${ext}`;
    await downloadOne(active.path, filename);
  };

  const downloadAllAssets = async () => {
    const bundle = imgs.map((img) => {
      const ext = img.path.split(".").pop() || "png";
      return {
        path: img.path,
        filename:
          format === "carousel"
            ? `${brandSlug}_carousel_slide-${String(img.key).padStart(2, "0")}.${ext}`
            : `${brandSlug}_ad_v${String(img.key).padStart(2, "0")}.${ext}`,
      };
    });
    await downloadAll(bundle);
  };

  // Deploy to a platform: download assets + copy caption + open composer.
  const deployTo = async (platform: Platform) => {
    const caption = buildCaption(tasks, format, platform.key);
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedPlatform(platform.key);
      setTimeout(() => setCopiedPlatform(null), 2500);
    } catch {
      // ignore — some browsers block clipboard outside user gesture; the
      // user initiated this click so it should work in practice.
    }
    // Download the asset(s) so the operator can drag-drop into the composer.
    await downloadAllAssets();
    // Open the platform composer last (after download started).
    window.open(platform.composerUrl(caption), "_blank", "noopener,noreferrer");
  };

  const copyCaption = async () => {
    const caption = buildCaption(tasks, format, "instagram");
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedPlatform("manual");
      setTimeout(() => setCopiedPlatform(null), 2500);
    } catch {}
  };

  const showApproval = status === "pending_approval";
  const showDeploying = status === "deploying";
  const showComplete = status === "complete";

  const platformsForFormat = PLATFORMS.filter(
    (p) => p.supports === "both" || p.supports === (format === "carousel" ? "carousel" : "single_ad"),
  );

  return (
    <div className="grid h-full grid-cols-12 gap-6">
      {/* Preview + approve/download */}
      <div className="col-span-12 lg:col-span-7">
        <div className="panel bracket relative h-full overflow-hidden p-5">
          <Header
            icon={<Rocket className="h-4 w-4" />}
            title={format === "carousel" ? "DEPLOY CAROUSEL" : "DEPLOY SINGLE AD"}
            kicker="MOD.04 // LAUNCHPAD"
          />

          {carouselImgs.length > 0 && singleAds.length > 0 && (
            <div className="mt-4 flex gap-2 text-[10px] tracking-widest">
              <button
                onClick={() => {
                  setFormat("carousel");
                  setIdx(0);
                }}
                className={`rounded px-3 py-1.5 border transition ${
                  format === "carousel"
                    ? "border-neon-cyan/60 text-neon-cyan bg-neon-cyan/10"
                    : "border-hive-grid text-hive-muted hover:text-white"
                }`}
              >
                CAROUSEL · {carouselImgs.length}
              </button>
              <button
                onClick={() => {
                  setFormat("single");
                  setIdx(0);
                }}
                className={`rounded px-3 py-1.5 border transition ${
                  format === "single"
                    ? "border-neon-amber/60 text-neon-amber bg-neon-amber/10"
                    : "border-hive-grid text-hive-muted hover:text-white"
                }`}
              >
                SINGLE AD · {singleAds.length}
              </button>
            </div>
          )}

          {imgs.length === 0 ? (
            <div className="mt-6 flex h-[460px] items-center justify-center rounded-md border border-dashed border-neon-cyan/20">
              <div className="text-center">
                <Rocket className="mx-auto h-8 w-8 text-hive-muted" />
                <div className="mt-3 text-xs tracking-widest text-hive-muted">
                  AWAITING FORGE OUTPUT
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="relative mx-auto flex max-w-[420px] items-center">
                <button
                  onClick={prev}
                  className="absolute -left-10 top-1/2 -translate-y-1/2 rounded-full border border-neon-cyan/40 bg-hive-void/70 p-2 text-neon-cyan transition hover:bg-neon-cyan/10"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div
                  className={`relative w-full overflow-hidden rounded-lg border bg-black ${
                    format === "carousel"
                      ? "aspect-[4/5] border-neon-magenta/40 shadow-neon-magenta"
                      : "aspect-square border-neon-amber/40"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${active?.path}?v=${Date.now().toString().slice(0, -4)}`}
                    alt={active?.label}
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
                  <div
                    className={`absolute left-3 top-3 chip ${
                      format === "carousel"
                        ? "border-neon-magenta/40 text-neon-magenta"
                        : "border-neon-amber/40 text-neon-amber"
                    }`}
                  >
                    {format === "carousel" ? "SLIDE" : "VARIANT"}{" "}
                    {String(idx + 1).padStart(2, "0")} / {imgs.length}
                  </div>
                  <div className="absolute left-3 right-3 bottom-3 text-sm font-bold text-white neon-text uppercase truncate">
                    {active?.label}
                  </div>
                </div>
                <button
                  onClick={next}
                  className="absolute -right-10 top-1/2 -translate-y-1/2 rounded-full border border-neon-cyan/40 bg-hive-void/70 p-2 text-neon-cyan transition hover:bg-neon-cyan/10"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex items-center justify-center gap-1.5">
                {imgs.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === idx
                        ? "w-6 bg-neon-cyan shadow-neon-cyan"
                        : "w-2 bg-hive-muted/40"
                    }`}
                  />
                ))}
              </div>

              {/* Jev virality score for the currently-previewed creative. */}
              {(activeScore || status === "scoring") && (
                <div className="mt-5 mx-auto max-w-md">
                  {status === "scoring" && !activeScore ? (
                    <div className="panel p-3 text-center text-[11px] tracking-widest text-white/50">
                      SCORING…
                    </div>
                  ) : (
                    <ViralityScoreCard
                      score={activeScore}
                      rank={activeRank}
                      marketSource={marketSource}
                    />
                  )}
                </div>
              )}

              {/* Primary actions — always visible when there's output */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={downloadCurrent}
                  className="btn-neon btn-amber"
                  title="Download this slide/variant as PNG"
                >
                  <Download className="h-4 w-4" />
                  THIS SLIDE
                </button>
                <button
                  onClick={downloadAllAssets}
                  className="btn-neon"
                  title="Download every slide/variant"
                >
                  <Download className="h-4 w-4" />
                  DOWNLOAD ALL ({imgs.length})
                </button>
                {showApproval && (
                  <>
                    <button
                      onClick={() => setEditOpen(true)}
                      className="btn-neon btn-magenta"
                      title="AI edit this slide in place"
                    >
                      <Wand2 className="h-4 w-4" />
                      EDIT WITH AI
                    </button>
                    <button onClick={approve} className="btn-neon btn-lime">
                      <CheckCircle2 className="h-4 w-4" />
                      APPROVE
                    </button>
                    <button onClick={reject} className="btn-neon btn-danger">
                      <XCircle className="h-4 w-4" />
                      REJECT
                    </button>
                  </>
                )}
              </div>

              {showDeploying && <DeployingBanner />}
              {showComplete && <CompleteBanner />}
            </div>
          )}
        </div>
      </div>

      {/* Deploy platforms + manifest */}
      <div className="col-span-12 lg:col-span-5 space-y-6">
        {/* Deploy to platforms */}
        <div className="panel bracket p-5">
          <Header
            icon={<Share2 className="h-4 w-4" />}
            title="DEPLOY TO PLATFORM"
            kicker={format === "carousel" ? "ORGANIC POST" : "PAID AD · SOCIAL"}
          />
          <div className="mt-2 text-[10px] tracking-widest text-hive-muted">
            Caption copies to clipboard · assets download · platform opens in a new tab.
          </div>
          <div className="mt-4 space-y-2">
            {imgs.length === 0 && (
              <div className="rounded-md border border-dashed border-neon-cyan/20 p-3 text-center text-[10px] tracking-widest text-hive-muted">
                FORGE SOMETHING FIRST
              </div>
            )}
            {imgs.length > 0 &&
              platformsForFormat.map((p) => {
                const copied = copiedPlatform === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => deployTo(p)}
                    className="group flex w-full items-center justify-between rounded-md border border-neon-cyan/20 bg-hive-void/60 p-3 text-left transition hover:border-neon-cyan/50 hover:bg-neon-cyan/5"
                  >
                    <div className="flex items-center gap-3">
                      <p.Icon className="h-4 w-4 text-neon-cyan group-hover:text-neon-orange" />
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {p.name}
                        </div>
                        <div className="text-[10px] tracking-widest text-hive-muted">
                          {p.blurb}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {copied && (
                        <span className="chip border-neon-lime/40 text-neon-lime">
                          COPIED
                        </span>
                      )}
                      <ExternalLink className="h-3.5 w-3.5 text-hive-muted group-hover:text-neon-cyan" />
                    </div>
                  </button>
                );
              })}
          </div>
          {imgs.length > 0 && (
            <button
              onClick={copyCaption}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded border border-dashed border-neon-cyan/30 py-2 text-[10px] tracking-widest text-neon-cyan transition hover:bg-neon-cyan/5"
            >
              <Copy className="h-3 w-3" />
              {copiedPlatform === "manual" ? "COPIED TO CLIPBOARD" : "COPY CAPTION ONLY"}
            </button>
          )}
        </div>

        {/* Approval state */}
        <div className="panel bracket p-5">
          <Header
            icon={<Timer className="h-4 w-4" />}
            title="APPROVAL STATE"
            kicker="HUMAN-IN-THE-LOOP"
          />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <StateCell
              label="PENDING"
              active={tasks?.approval_status === "pending"}
              color="amber"
            />
            <StateCell
              label="APPROVED"
              active={tasks?.approval_status === "approved"}
              color="lime"
            />
            <StateCell
              label="REJECTED"
              active={tasks?.approval_status === "rejected"}
              color="magenta"
            />
          </div>
        </div>

        {/* Payload manifest */}
        <div className="panel bracket p-5">
          <Header
            icon={<Rocket className="h-4 w-4" />}
            title="PAYLOAD MANIFEST"
            kicker="FILES READY FOR UPLOAD"
          />
          <div className="mt-3 max-h-[180px] space-y-1.5 overflow-y-auto">
            {imgs.length === 0 && (
              <div className="rounded-md border border-dashed border-neon-cyan/20 p-3 text-center text-[10px] tracking-widest text-hive-muted">
                EMPTY
              </div>
            )}
            {imgs.map((img) => (
              <div
                key={img.key}
                className="flex items-center justify-between rounded border border-neon-cyan/10 bg-black/40 px-2 py-1.5 font-mono text-[10px]"
              >
                <span className="truncate text-neon-cyan/80">{img.path}</span>
                <span className="text-neon-lime">OK</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <EditModal
        open={editOpen && !!active}
        format={format === "carousel" ? "carousel" : "single_ad"}
        index={imgs[idx]?.key ?? idx + 1}
        previewPath={active?.path ?? ""}
        label={active?.label ?? ""}
        onClose={() => setEditOpen(false)}
        onApply={applyEdit}
      />
    </div>
  );
}

function StateCell({
  label,
  active,
  color,
}: {
  label: string;
  active: boolean;
  color: "amber" | "lime" | "magenta";
}) {
  const base =
    color === "amber"
      ? "text-neon-amber border-neon-amber/50"
      : color === "lime"
      ? "text-neon-lime border-neon-lime/50"
      : "text-neon-magenta border-neon-magenta/50";
  return (
    <div
      className={`rounded-md border p-3 transition ${
        active ? `${base} bg-current/5 shadow-neon-cyan` : "border-hive-grid text-hive-muted"
      }`}
    >
      <div className="text-[10px] tracking-widest">{label}</div>
      <div className="mt-1 text-[9px] opacity-80">{active ? "● LOCKED" : "○ IDLE"}</div>
    </div>
  );
}

function DeployingBanner() {
  return (
    <div className="mt-6 overflow-hidden rounded-md border border-neon-lime/40 bg-neon-lime/5 p-4">
      <div className="flex items-center gap-3">
        <Rocket className="h-5 w-5 text-neon-lime animate-float" />
        <div className="text-xs tracking-widest text-neon-lime">
          DEPLOYING PAYLOAD // AUTOMATION ACTIVE
        </div>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-black/50">
        <div className="h-full w-1/2 bg-gradient-to-r from-neon-lime to-neon-cyan animate-pulseGlow" />
      </div>
    </div>
  );
}

function CompleteBanner() {
  return (
    <div className="mt-6 rounded-md border border-neon-lime/50 bg-neon-lime/5 p-5 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-neon-lime animate-pulseGlow" />
      <div className="mt-2 text-sm font-bold tracking-widest text-neon-lime neon-text">
        MISSION COMPLETE
      </div>
      <div className="mt-1 text-[10px] tracking-widest text-hive-muted">
        PAYLOAD DELIVERED · HIVE RETURNING TO IDLE
      </div>
    </div>
  );
}
