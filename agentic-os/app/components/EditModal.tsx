"use client";

import { useEffect, useState } from "react";
import { X, Wand2, Loader2, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  format: "carousel" | "single_ad";
  index: number;
  previewPath: string;
  label: string;
  onClose: () => void;
  onApply: (prompt: string) => Promise<void>;
}

const QUICK_PROMPTS: Record<"carousel" | "single_ad", string[]> = {
  carousel: [
    "Shorter headline",
    "More urgent tone",
    "Change the CTA to be more actionable",
    "Simplify the visual — less busy",
    "Make the body copy punchier",
  ],
  single_ad: [
    "Make the social proof stat bigger",
    "More urgent / FOMO framing",
    "Swap primary color to green",
    "Shorten the headline",
    "Add a stronger CTA button",
  ],
};

export default function EditModal({
  open,
  format,
  index,
  previewPath,
  label,
  onClose,
  onApply,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (open) {
      setPrompt("");
      setSubmitting(false);
    }
  }, [open, format, index]);

  if (!open) return null;

  const apply = async () => {
    const text = prompt.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await onApply(text);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const label_short = format === "carousel" ? "Slide" : "Variant";
  const aspect = format === "carousel" ? "aspect-[4/5]" : "aspect-square";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md fade-in p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-neon-violet/40 bg-hive-void shadow-neon-magenta md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => !submitting && onClose()}
          className="absolute right-3 top-3 z-10 rounded-full border border-neon-violet/40 bg-black/70 p-2 text-neon-violet transition hover:bg-neon-violet/20 disabled:opacity-40"
          aria-label="Close"
          disabled={submitting}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Preview */}
        <div className="relative flex items-center justify-center bg-black p-4 md:w-[45%]">
          <div
            className={`${aspect} w-full max-w-[320px] overflow-hidden rounded-lg border border-neon-cyan/30`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${previewPath}?v=${Date.now().toString().slice(0, -4)}`}
              alt={label}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {/* Edit form */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 md:w-[55%]">
          <div className="flex items-center gap-2 text-neon-violet">
            <Wand2 className="h-4 w-4" />
            <div className="text-[10px] tracking-[0.3em]">AI EDIT</div>
          </div>
          <div className="mt-1 text-base font-semibold text-white">
            Edit {label_short} {String(index).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[11px] text-hive-muted">
            Describe the change in plain English. Claude will rewrite just this
            one {label_short.toLowerCase()} and re-render — the rest stay
            untouched.
          </div>

          <textarea
            className="input-neon mt-4 min-h-[120px] font-mono text-xs"
            placeholder={`e.g. "Make the headline punchier and change the CTA to 'Start Free Trial'"`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={submitting}
            autoFocus
          />

          <div className="mt-3">
            <div className="text-[9px] tracking-[0.3em] text-hive-muted mb-2">
              QUICK PROMPTS
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS[format].map((p) => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  disabled={submitting}
                  className="rounded border border-hive-grid px-2 py-1 text-[10px] text-hive-muted transition hover:border-neon-violet/50 hover:text-neon-violet disabled:opacity-40"
                >
                  <Sparkles className="mr-1 inline h-2.5 w-2.5" />
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 pt-6">
            <div className="text-[10px] tracking-widest text-hive-muted">
              {submitting
                ? "Claude is editing — this takes ~15-25s"
                : "⌘ + Enter to apply"}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => !submitting && onClose()}
                className="btn-neon btn-danger"
                disabled={submitting}
              >
                CANCEL
              </button>
              <button
                onClick={apply}
                disabled={!prompt.trim() || submitting}
                className="btn-neon btn-magenta"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    EDITING...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    APPLY EDIT
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
