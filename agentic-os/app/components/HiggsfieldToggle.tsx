"use client";

import { Sparkles, Check, Clock } from "lucide-react";

interface Props {
  enabled: boolean;
  prompt: string;
  hasImage: boolean;
  onToggle: (next: boolean) => void;
  onPromptChange: (next: string) => void;
}

/**
 * Per-slide toggle: when checked, the entire finished slide (headline + body
 * + CTA + visual + brand palette, all composed into one image) is generated
 * by Higgsfield at forge time. The Claude HTML designer and Playwright
 * renderer are bypassed for that slide.
 *
 * Does NOT trigger generation on click — only sets `use_higgsfield` + the
 * optional prompt. Generation runs on the next FORGE.
 */
export default function HiggsfieldToggle({
  enabled,
  prompt,
  hasImage,
  onToggle,
  onPromptChange,
}: Props) {
  return (
    <div
      className={`rounded border p-2 transition ${
        enabled
          ? "border-neon-violet/50 bg-neon-violet/5"
          : "border-dashed border-hive-grid hover:border-neon-violet/30"
      }`}
    >
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-neon-violet"
        />
        <Sparkles
          className={`h-3 w-3 ${
            enabled ? "text-neon-violet" : "text-hive-muted"
          }`}
        />
        <span
          className={`flex-1 text-[10px] tracking-widest ${
            enabled ? "text-neon-violet" : "text-hive-muted"
          }`}
        >
          FORGE WHOLE SLIDE WITH HIGGSFIELD
        </span>
        {enabled && (
          <span className="inline-flex items-center gap-1 text-[9px] tracking-widest">
            {hasImage ? (
              <>
                <Check className="h-2.5 w-2.5 text-neon-lime" />
                <span className="text-neon-lime">RENDERED</span>
              </>
            ) : (
              <>
                <Clock className="h-2.5 w-2.5 text-neon-amber" />
                <span className="text-neon-amber">ON NEXT FORGE</span>
              </>
            )}
          </span>
        )}
      </label>

      {enabled && (
        <div className="mt-2">
          <input
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Extra visual steer (optional — e.g. 'editorial magazine cover, serif hero, cream background')"
            className="input-neon !py-1 text-[10px] font-mono"
          />
          <div className="mt-1 text-[9px] tracking-widest text-hive-muted">
            {hasImage
              ? "Finished slide already rendered by Higgsfield. Click FORGE again to re-generate."
              : "On FORGE, Higgsfield composes the WHOLE slide (text + visual) as one image — Claude HTML designer is skipped for this slide. Adds ~60-180s."}
          </div>
        </div>
      )}
    </div>
  );
}
