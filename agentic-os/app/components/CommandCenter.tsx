"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Brain as BrainIcon,
  Target,
  Swords,
  Image as ImageIcon,
  Rocket,
  Cpu,
  ArrowUpRight,
  GripVertical,
  Lock,
} from "lucide-react";
import type { TaskState } from "../lib/types";

interface Props {
  tasks: TaskState | null;
  onPickAgent: (id: string) => void;
}

// ─── Stage geometry ──────────────────────────────────────────────────────
// Fixed-dimension stage so the SVG connector endpoints and the HTML core
// element share one coordinate system — no viewBox stretching surprises.
const STAGE_W = 1200;
const STAGE_H = 660;
const CORE_X = STAGE_W / 2;
const CORE_Y = STAGE_H / 2;
const CARD_W = 280;
// Was 130 — but the card's content (icon row + tagline + bottom arrow +
// p-4 padding) runs ~140px, so the ArrowUpRight at the bottom was being
// clipped by `overflow-hidden`. Especially visible when the status chip
// gets a longer label ("AWAITING YOU", "FORGING", "SCORING") that pushes
// the top row taller. 160 gives safe breathing room for every label.
const CARD_H = 160;
const CORE_R = 54; // radius of the core circle — connectors terminate at this edge

// ─── Agent registry ──────────────────────────────────────────────────────
interface Agent {
  id: string;
  label: string;
  tagline: string;
  Icon: typeof BrainIcon;
  accentHex: string;
  statusKey: "brain" | "radar" | "war" | "foundry" | "launch";
  // Starting position (top-left corner of the card)
  initial: { x: number; y: number };
}

const AGENTS: Agent[] = [
  {
    id: "brain",
    label: "Brain",
    tagline: "Brand DNA · Identity · Voice",
    Icon: BrainIcon,
    accentHex: "#ff8a00",
    statusKey: "brain",
    initial: { x: 60, y: 60 },
  },
  {
    id: "radar",
    label: "Intel Radar",
    tagline: "Scrape · Analyze · Pattern Match",
    Icon: Target,
    accentHex: "#5fb8e0",
    statusKey: "radar",
    initial: { x: STAGE_W - CARD_W - 60, y: 60 },
  },
  {
    id: "war",
    label: "War Room",
    tagline: "Strategy · Campaign Synthesis",
    Icon: Swords,
    accentHex: "#ff5c5c",
    statusKey: "war",
    initial: { x: STAGE_W - CARD_W - 60, y: STAGE_H - CARD_H - 170 },
  },
  {
    id: "foundry",
    label: "Brand Foundry",
    tagline: "Design · Generate · Forge",
    Icon: ImageIcon,
    accentHex: "#a98bff",
    statusKey: "foundry",
    initial: { x: (STAGE_W - CARD_W) / 2, y: STAGE_H - CARD_H - 40 },
  },
  {
    id: "launch",
    label: "Launchpad",
    tagline: "Prepare · Download · Deploy",
    Icon: Rocket,
    accentHex: "#5fd189",
    statusKey: "launch",
    initial: { x: 60, y: STAGE_H - CARD_H - 170 },
  },
];

export default function CommandCenter({ tasks, onPickAgent }: Props) {
  // Positions keyed by agent id. Each is the TOP-LEFT corner of its card.
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(
    () => Object.fromEntries(AGENTS.map((a) => [a.id, a.initial])),
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);

  // Scale the whole stage to fit the available width (keeps the 1200×660
  // virtual coordinate system intact — only the display shrinks).
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setScale(Math.min(1, w / STAGE_W, h / STAGE_H));
      }
    };
    compute();
    const obs = new ResizeObserver(compute);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Drag state is a ref so pointer-move doesn't trigger a re-render per pixel.
  // The actual position state does rerender — but only after we've computed
  // the next card center from the pointer delta.
  const dragRef = useRef<
    | {
        id: string;
        pointerId: number;
        offsetX: number; // pointer offset within the card
        offsetY: number;
        moved: boolean; // true if user dragged > threshold → suppress click
      }
    | null
  >(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      // Only react to primary button
      if (e.button !== 0) return;
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      // Scale factor — stage is a fixed virtual size (STAGE_W × STAGE_H) but
      // may be visually scaled by CSS. Convert pointer coords to virtual.
      const sx = STAGE_W / rect.width;
      const sy = STAGE_H / rect.height;
      const px = (e.clientX - rect.left) * sx;
      const py = (e.clientY - rect.top) * sy;
      const current = positions[id];
      dragRef.current = {
        id,
        pointerId: e.pointerId,
        offsetX: px - current.x,
        offsetY: py - current.y,
        moved: false,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [positions],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const sx = STAGE_W / rect.width;
    const sy = STAGE_H / rect.height;
    const px = (e.clientX - rect.left) * sx;
    const py = (e.clientY - rect.top) * sy;
    const nx = Math.max(0, Math.min(STAGE_W - CARD_W, px - drag.offsetX));
    const ny = Math.max(0, Math.min(STAGE_H - CARD_H, py - drag.offsetY));
    // Mark as moved after ~4px threshold so a quick click still fires
    const prev = positions[drag.id];
    if (Math.hypot(nx - prev.x, ny - prev.y) > 4) drag.moved = true;
    setPositions((p) => ({ ...p, [drag.id]: { x: nx, y: ny } }));
  }, [positions]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent, onClick: () => void) => {
      const drag = dragRef.current;
      if (drag && e.pointerId === drag.pointerId) {
        if (!drag.moved) onClick();
        dragRef.current = null;
      }
    },
    [],
  );

  // Which agent is CURRENTLY WORKING — derived from the pipeline status.
  // The active agent's card pulses and its connector pumps a flowing line
  // toward the core, giving a visible "signal flight" between the hub and
  // the agent that's doing work right now.
  const activeAgentId = useMemo((): string | null => {
    switch (tasks?.status) {
      case "scraping":
        return "radar";
      case "strategizing":
        return "war";
      case "generating_visuals":
        return "foundry";
      // Scoring is an extension of the forge — Jev is reasoning about the
      // creative Brand Foundry just produced. Keep Foundry pulsing so the
      // operator sees the hub is still working on their behalf.
      case "scoring":
        return "foundry";
      case "deploying":
        return "launch";
      default:
        return null;
    }
  }, [tasks?.status]);

  // Lock gate per agent — a downstream agent is LOCKED until the upstream
  // agent has produced the signal it depends on. The user sees a padlock
  // and a dim card; clicking still enters the agent so they can see its
  // empty state and the "waiting for X" message.
  const agentLocks = useMemo(() => {
    const brainReady = !!tasks?.brain?.business_name;
    const scraped = (tasks?.scraped_data?.length ?? 0) > 0;
    const strategy = !!(tasks?.strategy as { campaign_name?: string } | undefined)?.campaign_name;
    const outputs =
      (tasks?.generated_images?.length ?? 0) + (tasks?.generated_single_ads?.length ?? 0) > 0;
    const isScraping = tasks?.status === "scraping";
    return {
      brain: { locked: false, waitingFor: "" },
      radar: { locked: !brainReady, waitingFor: "Brain setup" },
      // War Room needs scrape data to synthesize from. Locked WHILE scraping,
      // unlocks the moment scraping produces data (status flips to strategizing
      // or scraped_data populates).
      war: { locked: isScraping || (!scraped && !strategy), waitingFor: "Intel Radar scrape" },
      foundry: { locked: !strategy, waitingFor: "War Room strategy" },
      launch: { locked: !outputs, waitingFor: "Brand Foundry output" },
    } as Record<string, { locked: boolean; waitingFor: string }>;
  }, [tasks]);

  // Detect lock → unlock transitions and briefly flash the unlocking card.
  const prevLockRef = useRef<Record<string, boolean>>({});
  const [recentlyUnlocked, setRecentlyUnlocked] = useState<string[]>([]);
  useEffect(() => {
    const unlocked: string[] = [];
    for (const [id, state] of Object.entries(agentLocks)) {
      if (prevLockRef.current[id] === true && state.locked === false) {
        unlocked.push(id);
      }
      prevLockRef.current[id] = state.locked;
    }
    if (unlocked.length > 0) {
      setRecentlyUnlocked((prev) => Array.from(new Set([...prev, ...unlocked])));
      const t = setTimeout(() => {
        setRecentlyUnlocked((prev) => prev.filter((id) => !unlocked.includes(id)));
      }, 2800);
      return () => clearTimeout(t);
    }
  }, [agentLocks]);

  // Live status per agent
  const agentStatus = useMemo(() => {
    const brainReady = !!tasks?.brain?.business_name;
    const scraped = tasks?.scraped_data?.length ?? 0;
    const strategy = (tasks?.strategy as { campaign_name?: string } | undefined)?.campaign_name;
    const carouselCount = tasks?.generated_images?.length ?? 0;
    const adCount = tasks?.generated_single_ads?.length ?? 0;
    const pending = tasks?.status === "pending_approval";
    // The active one gets a "WORKING" label regardless of its base state.
    // During the scoring step, Foundry's label becomes SCORING so the operator
    // sees Jev's work rather than a stale FORGING label.
    const scoring = tasks?.status === "scoring";
    const workingLabels: Record<string, string> = {
      radar: "SCRAPING",
      war: "SYNTHESIZING",
      foundry: scoring ? "SCORING" : "FORGING",
      launch: "DEPLOYING",
    };
    const base = {
      brain: { label: brainReady ? "ONLINE" : "SETUP", tone: brainReady ? "online" : "idle" },
      radar: { label: scraped > 0 ? "ONLINE" : "STANDBY", tone: scraped > 0 ? "online" : "idle" },
      war: { label: strategy ? "ONLINE" : "LOCKED", tone: strategy ? "online" : "locked" },
      foundry: {
        label: carouselCount + adCount > 0 ? "ONLINE" : "IDLE",
        tone: carouselCount + adCount > 0 ? "online" : "idle",
      },
      launch: {
        label: pending ? "AWAITING YOU" : carouselCount + adCount > 0 ? "READY" : "EMPTY",
        tone: pending ? "attention" : carouselCount + adCount > 0 ? "online" : "idle",
      },
    } as Record<Agent["statusKey"], { label: string; tone: "online" | "idle" | "locked" | "attention" | "working" }>;
    if (activeAgentId && base[activeAgentId as Agent["statusKey"]]) {
      base[activeAgentId as Agent["statusKey"]] = {
        label: workingLabels[activeAgentId] || "WORKING",
        tone: "working",
      };
    }
    // Locked override — if a locked agent isn't actively working, mark it LOCKED
    // so the card shows the padlock chip.
    for (const [id, lock] of Object.entries(agentLocks)) {
      if (lock.locked && id !== activeAgentId) {
        base[id as Agent["statusKey"]] = { label: "LOCKED", tone: "locked" };
      }
    }
    return base;
  }, [tasks, activeAgentId, agentLocks]);

  const brandName = (tasks?.brain?.business_name || "AWAITING OPERATOR").toUpperCase();

  // Compute connector path between core and a card's nearest edge, as an
  // SVG quadratic bezier. Called from render — pure fn of position state.
  const connectorPath = (cardX: number, cardY: number) => {
    const cardCenterX = cardX + CARD_W / 2;
    const cardCenterY = cardY + CARD_H / 2;
    // Direction vector from core to card center
    const dx = cardCenterX - CORE_X;
    const dy = cardCenterY - CORE_Y;
    const dist = Math.hypot(dx, dy) || 1;
    // Core edge point (start of line, radius out from core center)
    const sx = CORE_X + (dx / dist) * CORE_R;
    const sy = CORE_Y + (dy / dist) * CORE_R;
    // Terminator at the card's edge closest to the core
    // Pick the side (left/right/top/bottom) based on dominant direction
    let ex: number, ey: number;
    const slope = Math.abs(dy / dx);
    if (slope < CARD_H / CARD_W) {
      // Terminate on left or right edge
      ex = dx > 0 ? cardX : cardX + CARD_W;
      ey = cardCenterY - (dy / dx) * (cardCenterX - ex);
    } else {
      // Terminate on top or bottom edge
      ey = dy > 0 ? cardY : cardY + CARD_H;
      ex = cardCenterX - (dx / dy) * (cardCenterY - ey);
    }
    // Control point — bowed perpendicular to the direction for a soft curve
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const nx = -dy / dist;
    const ny = dx / dist;
    const bow = Math.min(dist * 0.12, 60);
    const cx = mx + nx * bow;
    const cy = my + ny * bow;
    return { d: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`, ex, ey };
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Subtle neutral grid — no orange ambient glow, no radial wash */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        />
        <ParticleDots />
      </div>

      {/* Compact brand badge — the big wordmark header was crowding the stage.
          Brand name sits inline in the top corner so the agent cards get the
          full vertical real estate. */}
      <div className="relative z-20 shrink-0 flex items-center justify-between px-6 pt-3 pb-1 text-[10px] tracking-[0.4em] text-white/40">
        <span>AGENTIC OS</span>
        <span className="text-white/60">{brandName}</span>
      </div>

      {/* Radial stage — the inner div is a fixed 1200×660 virtual canvas.
          The outer wrapper measures available space and we transform:scale()
          the inner to fit. Virtual coords stay 1200×660 so SVG + HTML share
          one coordinate system — only the display scales. */}
      <div
        ref={stageWrapRef}
        className="relative flex-1 overflow-hidden flex items-center justify-center"
      >
        <div
          ref={stageRef}
          className="relative"
          style={{
            width: `${STAGE_W}px`,
            height: `${STAGE_H}px`,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
          onPointerMove={onPointerMove}
        >
          {/* SVG at exactly STAGE_W × STAGE_H — 1:1 with viewBox, no scaling */}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={STAGE_W}
            height={STAGE_H}
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          >
            <defs>
              {AGENTS.map((a) => (
                <linearGradient
                  key={a.id}
                  id={`conn-${a.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#ffb347" stopOpacity="0.9" />
                  <stop offset="100%" stopColor={a.accentHex} stopOpacity="0.7" />
                </linearGradient>
              ))}
              <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff8a00" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#ff8a00" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Core halo */}
            <circle cx={CORE_X} cy={CORE_Y} r="220" fill="url(#core-glow)" />

            {/* Dashed orbital rings — centered exactly at core center */}
            <circle cx={CORE_X} cy={CORE_Y} r="110" fill="none" stroke="rgba(255,138,0,0.3)" strokeWidth="1" strokeDasharray="3 5" />
            <circle cx={CORE_X} cy={CORE_Y} r="82" fill="none" stroke="rgba(255,138,0,0.42)" strokeWidth="1" strokeDasharray="2 4" />
            <circle cx={CORE_X} cy={CORE_Y} r="60" fill="none" stroke="rgba(255,138,0,0.55)" strokeWidth="1" />

            {/* Connector arcs — live-recomputed from positions. If the agent
                is active (working), overlay a flowing dashed line on top of
                the static gradient line to show data moving to the core. */}
            {AGENTS.map((a) => {
              const pos = positions[a.id];
              const { d, ex, ey } = connectorPath(pos.x, pos.y);
              const isActive = activeAgentId === a.id;
              const isLocked = agentLocks[a.id]?.locked ?? false;
              // Locked connector → dim + dashed, no gradient (data path not yet alive).
              // Active connector → base dimmed, flow line overlaid.
              // Idle connector → solid gradient.
              const baseOpacity = isLocked ? 0.18 : isActive ? 0.4 : 1;
              return (
                <g key={a.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isLocked ? "rgba(255,255,255,0.3)" : `url(#conn-${a.id})`}
                    strokeWidth="1.5"
                    strokeDasharray={isLocked ? "3 5" : undefined}
                    opacity={baseOpacity}
                  />
                  {isActive && (
                    <path
                      d={d}
                      fill="none"
                      stroke={a.accentHex}
                      strokeWidth="2.5"
                      strokeDasharray="8 24"
                      strokeLinecap="round"
                      className="cc-flow-line"
                      style={{ filter: `drop-shadow(0 0 4px ${a.accentHex})` }}
                    />
                  )}
                  <circle
                    cx={ex}
                    cy={ey}
                    r={isActive ? 12 : 7}
                    fill={isLocked ? "rgba(255,255,255,0.3)" : a.accentHex}
                    opacity={isActive ? 0.35 : isLocked ? 0.3 : 0.18}
                    className={isActive ? "cc-dot-pulse" : undefined}
                  />
                  <circle
                    cx={ex}
                    cy={ey}
                    r="3.5"
                    fill={isLocked ? "rgba(255,255,255,0.4)" : a.accentHex}
                  />
                </g>
              );
            })}
          </svg>

          {/* HIVE CORE — the CPU circle is positioned FIRST, dead-center at
              (CORE_X, CORE_Y). The label sits SEPARATELY underneath so the
              label's width can't push the circle off-center. */}
          <div
            className="pointer-events-none absolute flex items-center justify-center rounded-full border-2 border-neon-orange/70 bg-black shadow-[0_0_60px_rgba(255,138,0,0.5)]"
            style={{
              left: CORE_X,
              top: CORE_Y,
              width: CORE_R * 2,
              height: CORE_R * 2,
              transform: "translate(-50%, -50%)",
            }}
          >
            <Cpu className="h-10 w-10 text-neon-orange animate-pulseGlow" />
          </div>
          {/* Label is a second absolute element — anchored below the core */}
          <div
            className="pointer-events-none absolute text-center"
            style={{
              left: CORE_X,
              top: CORE_Y + CORE_R + 14,
              transform: "translateX(-50%)",
            }}
          >
            <div className="text-xs font-bold tracking-[0.3em] text-neon-orange whitespace-nowrap">
              HIVE CORE
            </div>
            <div className="mt-1 text-[9px] tracking-[0.35em] text-white/40 whitespace-nowrap">
              COORDINATE · EXECUTE · LEARN
            </div>
          </div>

          {/* Draggable agent cards */}
          {AGENTS.map((a, i) => {
            const pos = positions[a.id];
            const st = agentStatus[a.statusKey];
            const isActive = activeAgentId === a.id;
            const lock = agentLocks[a.id];
            const justUnlocked = recentlyUnlocked.includes(a.id);
            return (
              <div
                key={a.id}
                className="absolute select-none touch-none"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: CARD_W,
                  height: CARD_H,
                }}
                onPointerDown={(e) => onPointerDown(e, a.id)}
                onPointerUp={(e) => onPointerUp(e, () => onPickAgent(a.id))}
                onPointerCancel={() => (dragRef.current = null)}
              >
                <AgentCard
                  index={i + 1}
                  label={a.label}
                  tagline={a.tagline}
                  Icon={a.Icon}
                  accentHex={a.accentHex}
                  status={st}
                  isActive={isActive}
                  isLocked={lock?.locked ?? false}
                  waitingFor={lock?.waitingFor ?? ""}
                  justUnlocked={justUnlocked}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom hint — stays in flow, won't overlap draggable cards */}
      <div className="relative z-10 shrink-0 py-3 text-center text-[10px] tracking-[0.4em] text-white/35">
        5 AGENTS · 1 OPERATOR · DRAG TO REPOSITION · CLICK TO ENTER
      </div>
    </div>
  );
}

// ─── Agent card ──────────────────────────────────────────────────────────
function AgentCard({
  index,
  label,
  tagline,
  Icon,
  accentHex,
  status,
  isActive,
  isLocked,
  waitingFor,
  justUnlocked,
}: {
  index: number;
  label: string;
  tagline: string;
  Icon: typeof BrainIcon;
  accentHex: string;
  status: { label: string; tone: "online" | "idle" | "locked" | "attention" | "working" };
  isActive: boolean;
  isLocked: boolean;
  waitingFor: string;
  justUnlocked: boolean;
}) {
  const chipStyle: React.CSSProperties =
    status.tone === "working"
      ? {
          color: accentHex,
          borderColor: `${accentHex}80`,
          background: `${accentHex}18`,
        }
      : status.tone === "locked"
      ? { color: "#6a6a6a", borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.025)" }
      : status.tone === "online" || status.tone === "attention"
      ? { color: "#9a9a9a", borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.05)" }
      : { color: "#6a6a6a", borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.015)" };

  // Compose className — three visual states layered: locked (dim), active
  // (pulsing bright), just-unlocked (brief flash). Not mutually exclusive
  // but priority is locked > active > unlocked.
  const cardClass = isLocked
    ? "opacity-55 saturate-50"
    : isActive
    ? "cc-card-pulse"
    : justUnlocked
    ? "cc-unlock-flash"
    : "";

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-xl border bg-black/85 p-4 backdrop-blur transition-all hover:shadow-lg cursor-grab active:cursor-grabbing ${cardClass}`}
      style={
        isLocked
          ? {
              borderColor: "rgba(255,255,255,0.1)",
              boxShadow: "inset 0 0 40px rgba(0,0,0,0.5)",
            }
          : isActive
          ? {
              borderColor: accentHex,
              boxShadow: `0 0 36px ${accentHex}66, 0 0 90px ${accentHex}28, inset 0 0 40px ${accentHex}18`,
            }
          : {
              borderColor: `${accentHex}55`,
              boxShadow: `0 0 24px ${accentHex}14, inset 0 0 40px ${accentHex}08`,
            }
      }
    >
      {/* Locked overlay — padlock watermark + "WAITING FOR X" caption */}
      {isLocked && (
        <>
          <Lock className="pointer-events-none absolute right-3 top-3 h-3.5 w-3.5 text-white/40" />
          <div className="pointer-events-none absolute inset-x-4 bottom-3 text-[9px] tracking-[0.25em] text-white/40">
            WAITING · {waitingFor.toUpperCase()}
          </div>
        </>
      )}
      {/* Soft inner glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 10% 0%, ${accentHex}22, transparent 60%)`,
        }}
      />

      {/* Drag affordance — tiny grip in the top-right corner. Hidden when
          locked so it doesn't fight the padlock icon for that same spot. */}
      {!isLocked && (
        <GripVertical
          className="pointer-events-none absolute right-2 top-2 h-3 w-3 text-hive-muted/40"
        />
      )}

      {/* Top row: icon + title + status chip */}
      <div className="relative flex items-start justify-between gap-3 pr-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg border"
            style={{
              borderColor: `${accentHex}66`,
              background: `${accentHex}15`,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: accentHex }} />
          </div>
          <div>
            <div className="text-sm font-bold text-white">{label}</div>
            <div className="mt-0.5 text-[9px] tracking-[0.3em] text-hive-muted">
              AGENT · {String(index).padStart(2, "0")}
            </div>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[9px] font-semibold tracking-widest whitespace-nowrap"
          style={chipStyle}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: chipStyle.color }}
          />
          {status.label}
        </span>
      </div>

      {/* Tagline */}
      <div className="relative mt-3 text-[11px] text-hive-muted/90">{tagline}</div>

      {/* Arrow — hidden when locked (space reused for the WAITING caption) */}
      {!isLocked && (
        <div className="relative mt-2 flex justify-end">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full border"
            style={{
              borderColor: `${accentHex}66`,
              color: accentHex,
            }}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Particle dots ───────────────────────────────────────────────────────
function ParticleDots() {
  const dots = useMemo(() => {
    const arr: { x: number; y: number; size: number; opacity: number }[] = [];
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32;
      return seed / 2 ** 32;
    };
    for (let i = 0; i < 60; i++) {
      arr.push({
        x: rand() * 100,
        y: rand() * 100,
        size: 1 + rand() * 2,
        opacity: 0.1 + rand() * 0.4,
      });
    }
    return arr;
  }, []);

  // Suppress SSR mismatch warning — these are purely decorative and the
  // seeded RNG produces identical output on server + client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <>
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white/60 animate-pulseGlow"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity * 0.6,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </>
  );
}
