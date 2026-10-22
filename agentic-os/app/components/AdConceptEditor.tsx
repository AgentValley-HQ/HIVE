"use client";

import { useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Wand2,
  X,
  Loader2,
  Image as ImageIcon,
  Lightbulb,
  Target as TargetIcon,
  Palette,
} from "lucide-react";
import type { AdConcept } from "../lib/types";
import HiggsfieldToggle from "./HiggsfieldToggle";

interface Props {
  concepts: AdConcept[];
  onChange: (next: AdConcept[]) => Promise<void>;
  onRegenerate: (prompt: string) => Promise<void>;
  regenerating: boolean;
}

export default function AdConceptEditor({
  concepts,
  onChange,
  onRegenerate,
  regenerating,
}: Props) {
  const [steerPrompt, setSteerPrompt] = useState("");
  const [showSteer, setShowSteer] = useState(false);

  const updateConcept = async (index: number, patch: Partial<AdConcept>) => {
    const next = concepts.map((c, i) =>
      i === index ? { ...c, ...patch, user_edited: true } : c,
    );
    await onChange(next);
  };

  const addConcept = async () => {
    const newConcept: AdConcept = {
      variant: concepts.length + 1,
      concept: "custom",
      rationale: "Explain why this angle works for the brand.",
      headline_direction: "What should the hero text say?",
      visual_direction: "What should the composition feel like?",
      image: null,
      user_edited: true,
    };
    const next = [...concepts, newConcept].map((c, i) => ({
      ...c,
      variant: i + 1,
    }));
    await onChange(next);
  };

  const deleteConcept = async (index: number) => {
    const next = concepts
      .filter((_, i) => i !== index)
      .map((c, i) => ({ ...c, variant: i + 1 }));
    await onChange(next);
  };

  const uploadImage = async (index: number, file: File) => {
    const concept = concepts[index];
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slide", `ad-v${concept.variant}`);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      alert("upload failed");
      return;
    }
    const data = (await res.json()) as { path: string };
    await updateConcept(index, {
      image: { path: data.path, note: concept.image?.note || "" },
    });
  };

  const removeImage = async (index: number) => {
    await updateConcept(index, { image: null });
  };

  const quickRegen = async () => {
    await onRegenerate("");
  };

  const submitSteered = async () => {
    const p = steerPrompt.trim();
    if (!p) return;
    await onRegenerate(p);
    setSteerPrompt("");
    setShowSteer(false);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] tracking-widest text-hive-muted">
          {concepts.length} CONCEPT{concepts.length === 1 ? "" : "S"} ·{" "}
          <span className="text-neon-amber">EDITABLE</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={quickRegen}
            className="btn-neon btn-amber !py-1.5 !px-3 text-[10px]"
            disabled={regenerating}
            title="Ask Claude for a different take on all 3 ad angles"
          >
            {regenerating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                REGENERATING...
              </>
            ) : (
              <>
                <Wand2 className="h-3 w-3" />
                REGENERATE WITH AI
              </>
            )}
          </button>
          <button
            onClick={() => setShowSteer((v) => !v)}
            className={`!py-1.5 !px-2 text-[10px] rounded border transition ${
              showSteer
                ? "border-neon-amber/60 text-neon-amber bg-neon-amber/10"
                : "border-hive-grid text-hive-muted hover:text-neon-amber hover:border-neon-amber/40"
            }`}
            disabled={regenerating}
            title="Give Claude a specific direction"
          >
            STEER
          </button>
          <button
            onClick={addConcept}
            className="btn-neon !py-1.5 !px-3 text-[10px]"
            disabled={regenerating}
          >
            <Plus className="h-3 w-3" />
            ADD VARIANT
          </button>
        </div>
      </div>

      {/* Steer box */}
      {showSteer && (
        <div className="rounded-md border border-neon-amber/30 bg-neon-amber/5 p-3 fade-in">
          <div className="text-[9px] tracking-[0.3em] text-neon-amber mb-2">
            STEER THE REGENERATION
          </div>
          <textarea
            className="input-neon font-mono text-xs min-h-[70px]"
            placeholder='e.g. "Make all 3 variants more product-focused — this is a B2C sunglasses brand"  OR  "Try customer-testimonial, before/after, and influencer-quote angles"'
            value={steerPrompt}
            onChange={(e) => setSteerPrompt(e.target.value)}
            disabled={regenerating}
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setShowSteer(false)}
              className="btn-neon btn-danger !py-1 !px-3 text-[10px]"
              disabled={regenerating}
            >
              CANCEL
            </button>
            <button
              onClick={submitSteered}
              className="btn-neon btn-amber !py-1 !px-3 text-[10px]"
              disabled={!steerPrompt.trim() || regenerating}
            >
              <Wand2 className="h-3 w-3" />
              APPLY STEER
            </button>
          </div>
        </div>
      )}

      {/* Concept cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {concepts.map((c, i) => (
          <ConceptCard
            key={`${c.variant}-${i}`}
            index={i}
            concept={c}
            onUpdate={(patch) => updateConcept(i, patch)}
            onDelete={() => deleteConcept(i)}
            onUploadImage={(f) => uploadImage(i, f)}
            onRemoveImage={() => removeImage(i)}
          />
        ))}
      </div>
    </div>
  );
}

function ConceptCard({
  index,
  concept,
  onUpdate,
  onDelete,
  onUploadImage,
  onRemoveImage,
}: {
  index: number;
  concept: AdConcept;
  onUpdate: (patch: Partial<AdConcept>) => Promise<void>;
  onDelete: () => Promise<void>;
  onUploadImage: (file: File) => Promise<void>;
  onRemoveImage: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div className="flex flex-col rounded-md border border-neon-amber/20 bg-hive-void/60 p-3 transition hover:border-neon-amber/40">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded border border-neon-amber/40 bg-neon-amber/5 text-sm font-bold text-neon-amber">
            V{concept.variant}
          </div>
          <input
            className="bg-transparent text-[11px] font-semibold tracking-widest text-neon-amber uppercase outline-none border-b border-transparent focus:border-neon-amber/40 w-32"
            value={concept.concept}
            onChange={(e) => onUpdate({ concept: e.target.value })}
            placeholder="concept tag"
          />
          <label
            className="ml-1 flex cursor-pointer items-center gap-1 rounded border border-dashed border-hive-grid px-1.5 py-0.5 hover:border-neon-lime/50"
            title={
              concept.include_in_forge === false
                ? "Unticked — FORGE will SKIP this variant and keep its current ad untouched"
                : "Ticked — FORGE will generate this variant"
            }
          >
            <input
              type="checkbox"
              checked={concept.include_in_forge !== false}
              onChange={(e) => onUpdate({ include_in_forge: e.target.checked })}
              className="h-3 w-3 cursor-pointer accent-neon-lime"
            />
            <span className="text-[8px] tracking-[0.25em] text-hive-muted">
              FORGE
            </span>
          </label>
        </div>
        <button
          onClick={onDelete}
          className="text-hive-muted hover:text-neon-magenta transition"
          title="Delete this variant"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Rationale */}
      <div className="mt-3 rounded border border-neon-amber/15 bg-neon-amber/5 p-2">
        <div className="flex items-center gap-1 text-[8px] tracking-[0.25em] text-neon-amber mb-1">
          <Lightbulb className="h-2.5 w-2.5" />
          WHY THIS ANGLE
        </div>
        <textarea
          className="w-full bg-transparent text-[11px] italic text-white/85 outline-none placeholder:text-hive-muted/50 resize-none"
          rows={2}
          value={concept.rationale}
          onChange={(e) => onUpdate({ rationale: e.target.value })}
          placeholder="Why this works for the brand given competitors..."
        />
      </div>

      {/* Headline direction */}
      <div className="mt-2">
        <div className="flex items-center gap-1 text-[8px] tracking-[0.25em] text-hive-muted mb-1">
          <TargetIcon className="h-2.5 w-2.5" />
          HEADLINE DIRECTION
        </div>
        <textarea
          className="input-neon !py-1.5 text-[11px] resize-none"
          rows={2}
          value={concept.headline_direction}
          onChange={(e) => onUpdate({ headline_direction: e.target.value })}
          placeholder="What should the hero text communicate?"
        />
      </div>

      {/* Visual direction */}
      <div className="mt-2">
        <div className="flex items-center gap-1 text-[8px] tracking-[0.25em] text-hive-muted mb-1">
          <Palette className="h-2.5 w-2.5" />
          VISUAL DIRECTION
        </div>
        <textarea
          className="input-neon !py-1.5 text-[11px] resize-none"
          rows={2}
          value={concept.visual_direction}
          onChange={(e) => onUpdate({ visual_direction: e.target.value })}
          placeholder="What should the composition feel like?"
        />
      </div>

      {/* Image upload */}
      <div className="mt-auto pt-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setUploading(true);
            try {
              await onUploadImage(f);
            } finally {
              setUploading(false);
              if (fileRef.current) fileRef.current.value = "";
            }
          }}
        />

        {concept.image?.path ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded border border-neon-lime/30 bg-neon-lime/5 p-1 pr-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={concept.image.path}
                alt=""
                className="h-10 w-10 rounded object-cover"
              />
              <span className="flex-1 text-[10px] text-neon-lime truncate">
                {concept.image.path.split("/").pop()}
              </span>
              <button
                onClick={onRemoveImage}
                className="text-hive-muted hover:text-neon-magenta"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <input
              className="input-neon !py-1 text-[10px]"
              placeholder="How should Claude use this image?"
              value={concept.image.note || ""}
              onChange={(e) =>
                onUpdate({
                  image: concept.image
                    ? { ...concept.image, note: e.target.value }
                    : null,
                })
              }
            />
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full inline-flex items-center justify-center gap-1 rounded border border-dashed border-hive-grid px-2 py-2 text-[10px] tracking-widest text-hive-muted transition hover:border-neon-amber/50 hover:text-neon-amber"
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ImageIcon className="h-3 w-3" />
            )}
            UPLOAD PRODUCT SHOT
          </button>
        )}
        <div className="mt-2">
          <HiggsfieldToggle
            enabled={!!concept.use_higgsfield}
            prompt={concept.higgsfield_prompt || ""}
            hasImage={!!concept.higgsfield_rendered}
            onToggle={(v) => onUpdate({ use_higgsfield: v })}
            onPromptChange={(v) => onUpdate({ higgsfield_prompt: v })}
          />
        </div>
      </div>

      {concept.user_edited && (
        <div className="mt-1 text-right text-[8px] tracking-widest text-neon-lime">
          EDITED
        </div>
      )}
    </div>
  );
}
