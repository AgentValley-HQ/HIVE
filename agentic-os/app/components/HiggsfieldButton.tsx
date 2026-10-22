"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

interface Props {
  target: "carousel" | "single_ad";
  index: number;
}

/**
 * Button that triggers Higgsfield image generation for a specific slide or
 * ad variant. Writes `pending_higgsfield` to tasks.json then spawns the
 * engine/higgsfield-gen.js script via /api/engine. The engine downloads the
 * generated image into /public/uploads/slide-images/ and attaches it to the
 * slide/concept's `image` field — the parent editor's polled state will
 * pick up the change automatically.
 */
export default function HiggsfieldButton({ target, index }: Props) {
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState("");

  const submit = async () => {
    setBusy(true);
    try {
      // Patch pending_higgsfield onto tasks.json
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending_higgsfield: {
            target,
            index,
            user_prompt: prompt.trim() || undefined,
            requested_at: new Date().toISOString(),
          },
          log: [
            `[higgsfield] gen requested for ${target} ${index}${
              prompt.trim() ? `: "${prompt.slice(0, 60)}"` : ""
            }`,
          ],
        }),
      });
      // Spawn the engine
      await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: "higgsfield-gen" }),
      });
      setShowPrompt(false);
      setPrompt("");
      // Keep spinner for a few seconds so the operator sees the request landed —
      // the actual engine runs in the background and image appears via polling.
      setTimeout(() => setBusy(false), 2500);
    } catch (e) {
      console.error("higgsfield gen failed", e);
      setBusy(false);
    }
  };

  if (showPrompt) {
    return (
      <div className="w-full rounded border border-neon-violet/40 bg-neon-violet/5 p-2 space-y-2">
        <div className="text-[9px] tracking-[0.3em] text-neon-violet">
          HIGGSFIELD IMAGE PROMPT (optional)
        </div>
        <textarea
          className="input-neon !py-1.5 text-[11px]"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Describe the image (optional). Leave blank for auto-crafted prompt from slide context.'
          autoFocus
          disabled={busy}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setShowPrompt(false);
              setPrompt("");
            }}
            className="btn-neon btn-danger !py-1 !px-2 text-[10px]"
            disabled={busy}
          >
            CANCEL
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="btn-neon btn-magenta !py-1 !px-2 text-[10px]"
          >
            {busy ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                SPAWNING...
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                GENERATE
              </>
            )}
          </button>
        </div>
        <div className="text-[9px] tracking-widest text-hive-muted">
          Runs in background. Image appears on this slide when ready (~60-180s).
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowPrompt(true)}
      className="inline-flex items-center gap-1 rounded border border-dashed border-neon-violet/40 px-2 py-1 text-[10px] tracking-widest text-neon-violet transition hover:border-neon-violet hover:bg-neon-violet/10"
      title="Generate an image via Higgsfield (uses your Claude.ai integration)"
    >
      <Sparkles className="h-3 w-3" />
      GEN WITH HIGGSFIELD
    </button>
  );
}
