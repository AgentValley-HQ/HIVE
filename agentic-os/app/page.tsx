"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain as BrainIcon,
  Radar,
  Swords,
  Flame,
  Rocket,
  Activity,
  Satellite,
  Shield,
  Hexagon,
  Home as HomeIcon,
  Lock,
  Users,
} from "lucide-react";
import Brain from "./components/Brain";
import IntelRadar from "./components/IntelRadar";
import WarRoom from "./components/WarRoom";
import CarouselFoundry from "./components/CarouselFoundry";
import Launchpad from "./components/Launchpad";
import CommandCenter from "./components/CommandCenter";
import type { TaskState, StatusValue } from "./lib/types";

// COMMAND is the hub — only tab that gets the orange highlight. Everything
// else uses neutral whites/grays so the overall UI reads as calm and the
// Command Center stands out as the showpiece.
const TABS = [
  { id: "command", label: "Command Center", subtitle: "HQ · Hub", icon: HomeIcon, accentHex: "#ff8a00" },
  { id: "brain", label: "Brain", subtitle: "Identity · Memory", icon: BrainIcon, accentHex: "#ffffff" },
  { id: "radar", label: "Intel Radar", subtitle: "Scrape · Analyze", icon: Radar, accentHex: "#ffffff" },
  { id: "war", label: "War Room", subtitle: "Strategy · Campaigns", icon: Swords, accentHex: "#ffffff" },
  { id: "foundry", label: "Brand Foundry", subtitle: "Generate · Forge", icon: Flame, accentHex: "#ffffff" },
  { id: "launch", label: "Launchpad", subtitle: "Build · Deploy", icon: Rocket, accentHex: "#ffffff" },
];

const STATUS_FLOW: StatusValue[] = [
  "idle",
  "scraping",
  "strategizing",
  "generating_visuals",
  "scoring",
  "pending_approval",
  "deploying",
  "complete",
];

const STATUS_META: Record<StatusValue, { color: string; label: string }> = {
  idle: { color: "text-hive-muted", label: "SYSTEM IDLE" },
  scraping: { color: "text-neon-cyan", label: "SCRAPING TARGETS" },
  strategizing: { color: "text-neon-violet", label: "STRATEGY SYNTHESIS" },
  generating_visuals: { color: "text-neon-amber", label: "FORGING VISUALS" },
  scoring: { color: "text-neon-amber", label: "SCORING VIRALITY" },
  pending_approval: { color: "text-neon-magenta", label: "AWAITING HUMAN" },
  deploying: { color: "text-neon-lime", label: "DEPLOYING PAYLOAD" },
  complete: { color: "text-neon-lime", label: "MISSION COMPLETE" },
};

export default function Home() {
  const [tasks, setTasks] = useState<TaskState | null>(null);
  const [activeTab, setActiveTab] = useState<string>("command");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [bootPhase, setBootPhase] = useState(0);
  const [apifyEnabled, setApifyEnabled] = useState<boolean | null>(null);
  const [claudeEnabled, setClaudeEnabled] = useState<boolean | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as TaskState;
      setTasks(data);
      setLastSync(new Date());
    } catch {
      // ignore transient failures
    }
  }, []);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { apify_enabled: boolean; claude_enabled: boolean }) => {
        setApifyEnabled(d.apify_enabled);
        setClaudeEnabled(d.claude_enabled);
      })
      .catch(() => {
        setApifyEnabled(false);
        setClaudeEnabled(false);
      });
  }, []);

  // Boot animation
  useEffect(() => {
    const timers = [
      setTimeout(() => setBootPhase(1), 200),
      setTimeout(() => setBootPhase(2), 600),
      setTimeout(() => setBootPhase(3), 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Poll tasks.json — faster (1s) when the pipeline is actively working, so
  // the UI reflects progress tightly instead of lagging by up to 2 seconds.
  const isActive =
    tasks?.status === "scraping" ||
    tasks?.status === "strategizing" ||
    tasks?.status === "generating_visuals" ||
    tasks?.status === "scoring" ||
    tasks?.status === "deploying";

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, isActive ? 1000 : 2000);
    return () => clearInterval(interval);
  }, [fetchTasks, isActive]);

  const updateTasks = useCallback(
    async (patch: Partial<TaskState>) => {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      fetchTasks();
    },
    [fetchTasks],
  );

  const status: StatusValue = tasks?.status ?? "idle";
  const meta = STATUS_META[status];
  const stageIdx = STATUS_FLOW.indexOf(status);

  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      {/* Side rail — neutral white-on-black */}
      <aside className="relative z-20 flex h-full w-64 flex-col border-r border-white/8 bg-black/90 backdrop-blur">
        {/* Brand mark — minimal, just the hexagon + name */}
        <div className="p-5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center">
              <Hexagon className="h-9 w-9 text-white" strokeWidth={1.5} />
              <Hexagon
                className="absolute h-5 w-5 text-white"
                strokeWidth={1.5}
                style={{ transform: "rotate(30deg)" }}
              />
            </div>
            <div className="text-xl font-bold tracking-tight text-white">
              H.I.V.E
            </div>
          </div>
        </div>

        {/* Nav tabs — Command Center is the only item that gets the orange
            accent; all others use neutral white/gray treatment. Locked tabs
            get a padlock icon and a dimmer look until their prerequisite
            agent produces output. */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isCommand = tab.id === "command";
            // Lock gate — same logic as Command Center.
            const brainReady = !!tasks?.brain?.business_name;
            const scraped = (tasks?.scraped_data?.length ?? 0) > 0;
            const strategy = !!(tasks?.strategy as Partial<{ campaign_name: string }>)?.campaign_name;
            const outputs =
              (tasks?.generated_images?.length ?? 0) + (tasks?.generated_single_ads?.length ?? 0) > 0;
            const isScraping = tasks?.status === "scraping";
            const isLocked =
              (tab.id === "radar" && !brainReady) ||
              (tab.id === "war" && (isScraping || (!scraped && !strategy))) ||
              (tab.id === "foundry" && !strategy) ||
              (tab.id === "launch" && !outputs);

            const tabHasFreshContent =
              !isActive &&
              !isLocked &&
              ((tab.id === "radar" && (tasks?.scraped_data?.length ?? 0) > 0) ||
                (tab.id === "war" && !!(tasks?.strategy as Partial<{ campaign_name: string }>)?.campaign_name) ||
                (tab.id === "foundry" &&
                  ((tasks?.generated_images?.length ?? 0) > 0 ||
                    (tasks?.generated_single_ads?.length ?? 0) > 0)) ||
                (tab.id === "launch" &&
                  (tasks?.status === "pending_approval" || tasks?.status === "scoring")));

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                  isActive
                    ? isCommand
                      ? "bg-neon-orange/8 border border-neon-orange/40"
                      : "bg-white/5 border border-white/15"
                    : "border border-transparent hover:bg-white/[0.03]"
                } ${isLocked ? "opacity-45" : ""}`}
                title={isLocked ? "Locked — upstream agent hasn't produced input yet" : undefined}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition"
                  style={{
                    borderColor:
                      isActive && isCommand
                        ? "rgba(255,138,0,0.55)"
                        : isActive
                        ? "rgba(255,255,255,0.3)"
                        : "rgba(255,255,255,0.1)",
                    background:
                      isActive && isCommand
                        ? "rgba(255,138,0,0.12)"
                        : "transparent",
                  }}
                >
                  <Icon
                    className="h-4 w-4"
                    style={{
                      color:
                        isActive && isCommand
                          ? "#ff8a00"
                          : isActive
                          ? "#ffffff"
                          : "rgba(255,255,255,0.4)",
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`flex items-center gap-1.5 text-xs font-semibold ${
                      isActive ? "text-white" : "text-white/60 group-hover:text-white/90"
                    }`}
                  >
                    {tab.label}
                    {isLocked && <Lock className="h-3 w-3 text-white/50" />}
                  </div>
                  <div className="text-[10px] tracking-wide text-white/35">
                    {tab.subtitle}
                  </div>
                </div>
                {tabHasFreshContent && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-white animate-pulseGlow"
                    title="Fresh content"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Pipeline state — neutral white */}
        <div className="border-t border-white/8 p-4">
          <div className="text-[9px] tracking-[0.3em] text-white/40 mb-2.5">
            PIPELINE STATE
          </div>
          <div className="space-y-1.5">
            {STATUS_FLOW.map((s, i) => {
              const isDone = i < stageIdx;
              const isCurrent = i === stageIdx;
              return (
                <div
                  key={s}
                  className="flex items-center gap-2 text-[10px] tracking-wide"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isCurrent
                        ? "bg-white animate-pulseGlow"
                        : isDone
                        ? "bg-white/50"
                        : "bg-white/15"
                    }`}
                  />
                  <span
                    className={
                      isCurrent
                        ? "text-white"
                        : isDone
                        ? "text-white/60"
                        : "text-white/30"
                    }
                  >
                    {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-white/8 p-3 flex items-center justify-between text-[9px] tracking-widest text-white/40">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3" />
            SECURE
          </div>
          <div className="flex items-center gap-1.5">
            <Satellite className="h-3 w-3" />
            {lastSync ? lastSync.toLocaleTimeString() : "--:--:--"}
          </div>
        </div>
      </aside>

      {/* Main stage */}
      <main className="relative flex-1 overflow-hidden">
        {/* Top HUD bar — neutral white/gray, no orange */}
        <header className="relative z-10 flex items-center justify-between border-b border-white/8 bg-black/80 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <StatusPill
              icon={<Activity className="h-3 w-3" />}
              label={meta.label}
            />
            <StatusPill
              icon={<Users className="h-3 w-3" />}
              label="5 AGENTS ONLINE"
            />
          </div>
          <div className="flex items-center gap-3 text-[10px] tracking-widest text-white/50">
            <ServiceDot label="API" ok={true} />
            <ServiceDot label="Claude" ok={claudeEnabled ?? false} />
            <ServiceDot label="Live" ok={true} />
            <ServiceDot label="Node" ok={true} />
            <ServiceDot label="Playwright" ok={true} />
          </div>
        </header>

        {/* Content */}
        <section className="relative z-0 h-[calc(100%-49px)] overflow-y-auto p-6">
          {bootPhase < 3 ? (
            <BootSequence phase={bootPhase} />
          ) : (
            <div className="fade-in h-full">
              {activeTab === "command" && (
                <CommandCenter tasks={tasks} onPickAgent={(id) => setActiveTab(id)} />
              )}
              {activeTab === "brain" && (
                <Brain tasks={tasks} updateTasks={updateTasks} />
              )}
              {activeTab === "radar" && (
                <IntelRadar tasks={tasks} updateTasks={updateTasks} />
              )}
              {activeTab === "war" && (
                <WarRoom
                  tasks={tasks}
                  updateTasks={updateTasks}
                  onNavigate={(tabId) => setActiveTab(tabId)}
                />
              )}
              {activeTab === "foundry" && (
                <CarouselFoundry tasks={tasks} updateTasks={updateTasks} />
              )}
              {activeTab === "launch" && (
                <Launchpad tasks={tasks} updateTasks={updateTasks} />
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function BootSequence({ phase }: { phase: number }) {
  const lines = [
    "> initializing H.I.V.E agentic kernel ...",
    "> handshaking with Node::Playwright engine ...",
    "> opening tasks.json bridge channel ...",
    "> arming local marketing autonomy stack ...",
    "> ready. operator interface online.",
  ];
  return (
    <div className="flex h-full items-center justify-center">
      <div className="panel bracket w-[480px] p-6">
        <div className="text-[10px] tracking-[0.3em] text-neon-cyan mb-3">
          BOOT SEQUENCE // PHASE {phase + 1}/3
        </div>
        <div className="font-mono text-xs leading-relaxed text-neon-cyan/90">
          {lines.slice(0, phase + 2).map((l, i) => (
            <div key={i} className="fade-in">
              {l}
              {i === phase + 1 && (
                <span className="ml-1 inline-block h-3 w-2 bg-neon-cyan animate-pulseGlow" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Neutral status pill — white text + white border, subtle translucent bg.
function StatusPill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold tracking-widest text-white/80"
    >
      <span className="text-white/70">{icon}</span>
      {label}
    </span>
  );
}

// Service status dot — white when connected, dim gray when not.
function ServiceDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          ok ? "bg-white animate-pulseGlow" : "bg-white/15"
        }`}
      />
      <span className={ok ? "text-white/70" : "text-white/30"}>{label}</span>
    </div>
  );
}
