"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain as BrainIcon,
  Save,
  Sparkles,
  Users,
  Megaphone,
  Rocket,
  Globe,
  Zap,
  AlertTriangle,
  Plus,
  Trash2,
  Check,
  Upload,
  Download,
  FileText,
  Palette,
  Loader2,
  X,
} from "lucide-react";
import type { TaskState, Brain as BrainType, BrandColor } from "../lib/types";
import { Header } from "./IntelRadar";
import { brainToMarkdown, parseBrainMarkdown, BRAIN_TEMPLATE } from "../lib/brainMd";

interface Props {
  tasks: TaskState | null;
  updateTasks: (patch: Partial<TaskState>) => Promise<void>;
}

const EMPTY_BRAIN: BrainType = {
  business_name: "",
  what_you_do: "",
  value_prop: "",
  target_audience: "",
  tone: "",
  differentiators: [],
  offerings: [],
  website: "",
  socials: "",
  current_cta: "",
  do_not_say: "",
  brand_colors: [],
};

export default function Brain({ tasks, updateTasks }: Props) {
  const [brain, setBrain] = useState<BrainType>(EMPTY_BRAIN);
  const [newDiff, setNewDiff] = useState("");
  const [newOffer, setNewOffer] = useState("");
  const [saved, setSaved] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [detectingColors, setDetectingColors] = useState(false);
  const [colorMsg, setColorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const detectColors = async () => {
    const url = brain.website?.trim();
    if (!url) {
      setColorMsg("add a website URL first");
      setTimeout(() => setColorMsg(null), 2500);
      return;
    }
    setDetectingColors(true);
    setColorMsg(null);
    try {
      const res = await fetch("/api/detect-colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "failed" }));
        setColorMsg(`error: ${err.error || res.statusText}`);
        setTimeout(() => setColorMsg(null), 4000);
        return;
      }
      const data = (await res.json()) as { colors: BrandColor[] };
      setBrain({ ...brain, brand_colors: data.colors });
      setColorMsg(`detected ${data.colors.length} brand color${data.colors.length === 1 ? "" : "s"}`);
      setTimeout(() => setColorMsg(null), 3000);
    } catch (e) {
      setColorMsg(`error: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setColorMsg(null), 4000);
    } finally {
      setDetectingColors(false);
    }
  };

  const removeColor = (idx: number) => {
    setBrain({
      ...brain,
      brand_colors: (brain.brand_colors || []).filter((_, i) => i !== idx),
    });
  };

  const addColor = () => {
    setBrain({
      ...brain,
      brand_colors: [...(brain.brand_colors || []), { hex: "#000000", role: "custom" }],
    });
  };

  const downloadBlob = (filename: string, content: string, mime = "text/markdown") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onUpload = async (file: File) => {
    const text = await file.text();
    const parsed = parseBrainMarkdown(text);
    const merged: BrainType = { ...brain, ...parsed };
    setBrain(merged);
    const filled = Object.keys(parsed).length;
    setImportMsg(`imported ${filled} field${filled === 1 ? "" : "s"} from ${file.name}`);
    setTimeout(() => setImportMsg(null), 4000);
  };

  const exportMd = () => {
    const slug = (brain.business_name || "brand")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    downloadBlob(`${slug || "brand"}.brain.md`, brainToMarkdown(brain));
  };

  const downloadTemplate = () => {
    downloadBlob("template.brain.md", BRAIN_TEMPLATE);
  };

  useEffect(() => {
    const b = tasks?.brain;
    if (b && Object.keys(b).length > 0) {
      setBrain({ ...EMPTY_BRAIN, ...(b as BrainType) });
    }
  }, [tasks]);

  const save = async () => {
    await updateTasks({
      brain,
      log: [`[brain] profile saved for "${brain.business_name || "unnamed brand"}"`],
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const addDiff = () => {
    const v = newDiff.trim();
    if (!v) return;
    setBrain({ ...brain, differentiators: [...brain.differentiators, v] });
    setNewDiff("");
  };

  const addOffer = () => {
    const v = newOffer.trim();
    if (!v) return;
    setBrain({ ...brain, offerings: [...brain.offerings, v] });
    setNewOffer("");
  };

  const filledCount = Object.values(brain).filter((v) =>
    Array.isArray(v) ? v.length > 0 : String(v).trim().length > 0,
  ).length;
  const totalFields = Object.keys(brain).length;
  const completeness = Math.round((filledCount / totalFields) * 100);

  return (
    <div className="space-y-6">
      <div className="panel bracket relative overflow-hidden p-6">
        <div className="absolute right-6 top-6 flex items-center gap-3">
          <div className="text-right">
            <div className="text-[9px] tracking-[0.3em] text-hive-muted">
              BRAIN COMPLETENESS
            </div>
            <div className="text-xl font-bold text-neon-violet neon-text">
              {completeness}%
            </div>
          </div>
          <div className="h-14 w-14 rounded-full border-2 border-neon-violet/40 flex items-center justify-center">
            <BrainIcon className="h-6 w-6 text-neon-violet animate-pulseGlow" />
          </div>
        </div>

        <Header
          icon={<BrainIcon className="h-4 w-4" />}
          title="BRAIN // YOUR BUSINESS"
          kicker="MOD.00 // CORE IDENTITY"
        />
        <div className="mt-3 max-w-2xl text-xs text-hive-muted">
          Everything in this panel is fed into Claude when it synthesizes
          strategy from competitor intel. The richer the brain, the sharper the
          campaigns.
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            className="btn-neon"
            onClick={() => fileRef.current?.click()}
            title="Upload a .brain.md file to populate the form"
          >
            <Upload className="h-4 w-4" />
            UPLOAD .BRAIN.MD
          </button>
          <button
            className="btn-neon"
            onClick={exportMd}
            title="Download current brain as .brain.md"
          >
            <Download className="h-4 w-4" />
            EXPORT
          </button>
          <button
            className="btn-neon"
            onClick={downloadTemplate}
            title="Download the blank template to fill in"
          >
            <FileText className="h-4 w-4" />
            TEMPLATE
          </button>
          {importMsg && (
            <span className="ml-2 text-[10px] tracking-widest text-neon-lime fade-in">
              {importMsg}
            </span>
          )}
        </div>

        <div className="mt-6 grid grid-cols-12 gap-5">
          <div className="col-span-12 md:col-span-6">
            <Field
              label="BUSINESS NAME"
              icon={<Zap className="h-3 w-3" />}
              value={brain.business_name}
              onChange={(v) => setBrain({ ...brain, business_name: v })}
              placeholder="H.I.V.E"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Field
              label="WEBSITE"
              icon={<Globe className="h-3 w-3" />}
              value={brain.website}
              onChange={(v) => setBrain({ ...brain, website: v })}
              placeholder="https://buildthebrand.co"
            />
          </div>

          <div className="col-span-12">
            <Field
              label="WHAT YOU DO (ONE SENTENCE)"
              icon={<Sparkles className="h-3 w-3" />}
              value={brain.what_you_do}
              onChange={(v) => setBrain({ ...brain, what_you_do: v })}
              placeholder="Autonomous local-first marketing agency powered by Claude Code and headless Playwright."
              textarea
            />
          </div>

          <div className="col-span-12">
            <Field
              label="CORE VALUE PROP (THE 'WHY SWITCH')"
              icon={<Rocket className="h-3 w-3" />}
              value={brain.value_prop}
              onChange={(v) => setBrain({ ...brain, value_prop: v })}
              placeholder="Replace your $4k/mo agency with a laptop that runs the stack while you sleep."
              textarea
            />
          </div>

          <div className="col-span-12 md:col-span-6">
            <Field
              label="TARGET AUDIENCE"
              icon={<Users className="h-3 w-3" />}
              value={brain.target_audience}
              onChange={(v) => setBrain({ ...brain, target_audience: v })}
              placeholder="Technical founders, indie hackers, marketing ops leads"
              textarea
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Field
              label="BRAND TONE / VOICE"
              icon={<Megaphone className="h-3 w-3" />}
              value={brain.tone}
              onChange={(v) => setBrain({ ...brain, tone: v })}
              placeholder="Confident · operator · dry wit"
              textarea
            />
          </div>

          <div className="col-span-12 md:col-span-6">
            <ListField
              label="DIFFERENTIATORS (WHAT MAKES YOU UNIQUE)"
              items={brain.differentiators}
              value={newDiff}
              onChange={setNewDiff}
              onAdd={addDiff}
              onRemove={(i) =>
                setBrain({
                  ...brain,
                  differentiators: brain.differentiators.filter((_, idx) => idx !== i),
                })
              }
              placeholder="Zero paid APIs"
              accent="violet"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <ListField
              label="OFFERINGS / PRODUCTS"
              items={brain.offerings}
              value={newOffer}
              onChange={setNewOffer}
              onAdd={addOffer}
              onRemove={(i) =>
                setBrain({
                  ...brain,
                  offerings: brain.offerings.filter((_, idx) => idx !== i),
                })
              }
              placeholder="Weekly carousel pipeline"
              accent="cyan"
            />
          </div>

          <div className="col-span-12 md:col-span-6">
            <Field
              label="SOCIAL HANDLES"
              icon={<Globe className="h-3 w-3" />}
              value={brain.socials}
              onChange={(v) => setBrain({ ...brain, socials: v })}
              placeholder="@buildthebrand · linkedin.com/in/swanand"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Field
              label="CURRENT CTA"
              icon={<Rocket className="h-3 w-3" />}
              value={brain.current_cta}
              onChange={(v) => setBrain({ ...brain, current_cta: v })}
              placeholder="Fork the repo"
            />
          </div>

          <div className="col-span-12">
            <Field
              label="DO NOT SAY (BANNED PHRASES, OFF-BRAND ANGLES)"
              icon={<AlertTriangle className="h-3 w-3" />}
              value={brain.do_not_say}
              onChange={(v) => setBrain({ ...brain, do_not_say: v })}
              placeholder='"revolutionary", "game-changer", generic AI buzzwords'
              textarea
            />
          </div>

          {/* Brand colors — auto-detected or manual */}
          <div className="col-span-12">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[9px] tracking-[0.3em] text-hive-muted">
                <Palette className="h-3 w-3" />
                BRAND COLORS · USED PRIMARILY IN GENERATED CREATIVE
              </div>
              <div className="flex items-center gap-2">
                {colorMsg && (
                  <span className="text-[10px] tracking-widest text-neon-lime fade-in">
                    {colorMsg}
                  </span>
                )}
                <button
                  onClick={detectColors}
                  disabled={detectingColors || !brain.website?.trim()}
                  className="btn-neon btn-magenta !py-1 !px-2 text-[10px]"
                  title={
                    brain.website?.trim()
                      ? "Playwright visits your site and extracts dominant colors"
                      : "Set a website URL above first"
                  }
                >
                  {detectingColors ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      DETECTING...
                    </>
                  ) : (
                    <>
                      <Palette className="h-3 w-3" />
                      DETECT FROM WEBSITE
                    </>
                  )}
                </button>
                <button
                  onClick={addColor}
                  className="btn-neon !py-1 !px-2 text-[10px]"
                >
                  <Plus className="h-3 w-3" />
                  ADD
                </button>
              </div>
            </div>

            {brain.brand_colors && brain.brand_colors.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {brain.brand_colors.map((c, i) => (
                  <div
                    key={i}
                    className="group flex items-center gap-2 rounded border border-neon-cyan/15 bg-hive-void/60 p-1.5 pr-2"
                  >
                    <input
                      type="color"
                      value={c.hex}
                      onChange={(e) => {
                        const next = [...(brain.brand_colors || [])];
                        next[i] = { ...c, hex: e.target.value };
                        setBrain({ ...brain, brand_colors: next });
                      }}
                      className="h-9 w-9 cursor-pointer rounded border-0 bg-transparent"
                      title="Click to change color"
                    />
                    <div className="flex flex-col">
                      <input
                        value={c.hex}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          if (!/^#[0-9a-f]{6}$/i.test(v) && v !== "") return;
                          const next = [...(brain.brand_colors || [])];
                          next[i] = { ...c, hex: v || "#000000" };
                          setBrain({ ...brain, brand_colors: next });
                        }}
                        className="bg-transparent text-[11px] font-mono text-white outline-none w-20"
                      />
                      <input
                        value={c.role || ""}
                        onChange={(e) => {
                          const next = [...(brain.brand_colors || [])];
                          next[i] = { ...c, role: e.target.value };
                          setBrain({ ...brain, brand_colors: next });
                        }}
                        className="bg-transparent text-[9px] tracking-widest text-hive-muted outline-none w-20"
                        placeholder="role"
                      />
                    </div>
                    <button
                      onClick={() => removeColor(i)}
                      className="text-hive-muted hover:text-neon-magenta opacity-0 group-hover:opacity-100 transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-neon-cyan/15 p-3 text-center text-[10px] tracking-widest text-hive-muted">
                NO BRAND COLORS SET · Click DETECT FROM WEBSITE above
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-neon-cyan/10 pt-4">
          <div className="text-[10px] tracking-widest text-hive-muted">
            Brain is persisted to <span className="text-neon-cyan">tasks.json</span>{" "}
            and passed to every strategy synthesis.
          </div>
          <button className="btn-neon" onClick={save}>
            {saved ? (
              <>
                <Check className="h-4 w-4" />
                SAVED
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                SAVE BRAIN
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[9px] tracking-[0.3em] text-hive-muted mb-1.5">
        {icon}
        {label}
      </div>
      {textarea ? (
        <textarea
          className="input-neon"
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className="input-neon"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function ListField({
  label,
  items,
  value,
  onChange,
  onAdd,
  onRemove,
  placeholder,
  accent,
}: {
  label: string;
  items: string[];
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  placeholder?: string;
  accent: "cyan" | "violet";
}) {
  const color =
    accent === "violet"
      ? "border-neon-violet/40 text-neon-violet bg-neon-violet/5"
      : "border-neon-cyan/40 text-neon-cyan bg-neon-cyan/5";
  return (
    <div>
      <div className="text-[9px] tracking-[0.3em] text-hive-muted mb-1.5">
        {label}
      </div>
      <div className="flex gap-2">
        <input
          className="input-neon"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
          placeholder={placeholder}
        />
        <button className="btn-neon" onClick={onAdd}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] ${color}`}
            >
              {it}
              <button
                onClick={() => onRemove(i)}
                className="opacity-50 hover:opacity-100 transition"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
