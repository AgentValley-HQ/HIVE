"use client";

import { useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Wand2,
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  GripVertical,
  Lightbulb,
} from "lucide-react";
import type { OutlineSlide } from "../lib/types";
import HiggsfieldToggle from "./HiggsfieldToggle";

interface Props {
  outline: OutlineSlide[];
  onChange: (next: OutlineSlide[]) => Promise<void>;
  onRegenerate: (prompt: string) => Promise<void>;
  regenerating: boolean;
}

const ROLES = ["hook", "problem", "solution", "proof", "cta", "custom"];

export default function OutlineEditor({
  outline,
  onChange,
  onRegenerate,
  regenerating,
}: Props) {
  const [regenPrompt, setRegenPrompt] = useState("");
  const [showSteer, setShowSteer] = useState(false);

  const updateSlide = async (index: number, patch: Partial<OutlineSlide>) => {
    const next = outline.map((s, i) =>
      i === index ? { ...s, ...patch, user_edited: true } : s,
    );
    await onChange(next);
  };

  const addSlide = async (afterIndex?: number) => {
    const insertAt = afterIndex === undefined ? outline.length : afterIndex + 1;
    const newSlide: OutlineSlide = {
      slide: 0,
      title: "New Slide",
      body: "Describe what this slide should say.",
      role: "custom",
      user_edited: true,
    };
    const nextRaw = [
      ...outline.slice(0, insertAt),
      newSlide,
      ...outline.slice(insertAt),
    ];
    // Renumber
    const next = nextRaw.map((s, i) => ({ ...s, slide: i + 1 }));
    await onChange(next);
  };

  const deleteSlide = async (index: number) => {
    const nextRaw = outline.filter((_, i) => i !== index);
    const next = nextRaw.map((s, i) => ({ ...s, slide: i + 1 }));
    await onChange(next);
  };

  const moveSlide = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= outline.length) return;
    const nextRaw = [...outline];
    [nextRaw[index], nextRaw[target]] = [nextRaw[target], nextRaw[index]];
    const next = nextRaw.map((s, i) => ({ ...s, slide: i + 1 }));
    await onChange(next);
  };

  const uploadImage = async (index: number, file: File) => {
    const slide = outline[index];
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slide", String(slide.slide));
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      alert("upload failed");
      return;
    }
    const data = (await res.json()) as { path: string };
    await updateSlide(index, {
      image: { path: data.path, note: slide.image?.note || "" },
    });
  };

  const removeImage = async (index: number) => {
    await updateSlide(index, { image: null });
  };

  // One-click regenerate — empty prompt means "give me a fresh take, no specific direction"
  const quickRegen = async () => {
    await onRegenerate("Rewrite the outline with a different angle and structure. Keep the same campaign intent but try a new narrative arc.");
  };

  const submitSteeredRegen = async () => {
    const prompt = regenPrompt.trim();
    if (!prompt) return;
    await onRegenerate(prompt);
    setRegenPrompt("");
    setShowSteer(false);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] tracking-widest text-hive-muted">
          {outline.length} SLIDE{outline.length === 1 ? "" : "S"} ·{" "}
          <span className="text-neon-cyan">EDITABLE</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Primary: one-click regenerate. No prompt needed. */}
          <button
            onClick={quickRegen}
            className="btn-neon btn-magenta !py-1.5 !px-3 text-[10px]"
            disabled={regenerating}
            title="Ask Claude for a different take on the outline — no prompt required"
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
          {/* Advanced: steer the regeneration with a prompt */}
          <button
            onClick={() => setShowSteer((v) => !v)}
            className={`!py-1.5 !px-2 text-[10px] rounded border transition ${
              showSteer
                ? "border-neon-magenta/60 text-neon-magenta bg-neon-magenta/10"
                : "border-hive-grid text-hive-muted hover:text-neon-magenta hover:border-neon-magenta/40"
            }`}
            disabled={regenerating}
            title="Give Claude a specific steering direction"
          >
            STEER
          </button>
          <button
            onClick={() => addSlide()}
            className="btn-neon !py-1.5 !px-3 text-[10px]"
            disabled={regenerating}
          >
            <Plus className="h-3 w-3" />
            ADD SLIDE
          </button>
        </div>
      </div>

      {/* Advanced steer box — collapsed by default */}
      {showSteer && (
        <div className="rounded-md border border-neon-magenta/30 bg-neon-magenta/5 p-3 fade-in">
          <div className="text-[9px] tracking-[0.3em] text-neon-magenta mb-2">
            STEER THE REGENERATION · Tell Claude the specific direction
          </div>
          <textarea
            className="input-neon font-mono text-xs min-h-[70px]"
            placeholder='e.g. "Make the carousel more story-driven, start with a customer win on slide 1"  OR  "Try a problem-agitate-solve structure instead"'
            value={regenPrompt}
            onChange={(e) => setRegenPrompt(e.target.value)}
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
              onClick={submitSteeredRegen}
              className="btn-neon btn-magenta !py-1 !px-3 text-[10px]"
              disabled={!regenPrompt.trim() || regenerating}
            >
              <Wand2 className="h-3 w-3" />
              APPLY STEER
            </button>
          </div>
        </div>
      )}

      {/* Slides */}
      <div className="space-y-2">
        {outline.map((s, i) => (
          <SlideRow
            key={`${s.slide}-${i}`}
            index={i}
            slide={s}
            canMoveUp={i > 0}
            canMoveDown={i < outline.length - 1}
            onUpdate={(patch) => updateSlide(i, patch)}
            onDelete={() => deleteSlide(i)}
            onMoveUp={() => moveSlide(i, -1)}
            onMoveDown={() => moveSlide(i, 1)}
            onInsertAfter={() => addSlide(i)}
            onUploadImage={(file) => uploadImage(i, file)}
            onRemoveImage={() => removeImage(i)}
          />
        ))}
      </div>
    </div>
  );
}

function SlideRow({
  index,
  slide,
  canMoveUp,
  canMoveDown,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onInsertAfter,
  onUploadImage,
  onRemoveImage,
}: {
  index: number;
  slide: OutlineSlide;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdate: (patch: Partial<OutlineSlide>) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
  onInsertAfter: () => Promise<void>;
  onUploadImage: (file: File) => Promise<void>;
  onRemoveImage: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div className="rounded-md border border-neon-cyan/15 bg-hive-void/60 p-3 transition hover:border-neon-cyan/30">
      <div className="flex items-start gap-3">
        {/* Drag handle + slide number + forge tick */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-hive-muted hover:text-neon-cyan disabled:opacity-20"
            title="Move up"
          >
            <GripVertical className="h-3 w-3 rotate-90" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded border border-neon-cyan/40 bg-neon-cyan/5 text-sm font-bold text-neon-cyan">
            {slide.slide}
          </div>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-hive-muted hover:text-neon-cyan disabled:opacity-20"
            title="Move down"
          >
            <GripVertical className="h-3 w-3 -rotate-90" />
          </button>
          <label
            className="mt-1 flex cursor-pointer flex-col items-center gap-0.5"
            title={
              slide.include_in_forge === false
                ? "Unticked — FORGE will SKIP this slide and keep its current creative untouched"
                : "Ticked — FORGE will generate this slide"
            }
          >
            <input
              type="checkbox"
              checked={slide.include_in_forge !== false}
              onChange={(e) => onUpdate({ include_in_forge: e.target.checked })}
              className="h-3.5 w-3.5 cursor-pointer accent-neon-lime"
            />
            <span className="text-[7px] tracking-[0.2em] text-hive-muted">
              FORGE
            </span>
          </label>
        </div>

        {/* Fields */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex gap-2">
            <input
              className="input-neon !py-1.5 text-sm font-semibold"
              value={slide.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="Slide title"
            />
            <select
              value={ROLES.includes(slide.role) ? slide.role : "custom"}
              onChange={(e) => onUpdate({ role: e.target.value })}
              className="rounded border border-neon-cyan/30 bg-hive-void/80 px-2 py-1 text-[10px] tracking-widest uppercase text-neon-cyan outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r} className="bg-hive-void">
                  {r.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="input-neon !py-2 text-[11px]"
            rows={2}
            value={slide.body}
            onChange={(e) => onUpdate({ body: e.target.value })}
            placeholder="What should this slide say?"
          />

          {/* AI's strategic rationale for this slide (editable) */}
          {(slide.rationale || slide.user_edited) && (
            <div className="flex items-start gap-2 rounded border border-neon-amber/15 bg-neon-amber/5 p-2">
              <Lightbulb className="h-3 w-3 shrink-0 mt-0.5 text-neon-amber" />
              <div className="min-w-0 flex-1">
                <div className="text-[8px] tracking-[0.25em] text-neon-amber mb-0.5">
                  WHY THIS SLIDE
                </div>
                <input
                  className="w-full bg-transparent text-[11px] italic text-white/80 outline-none placeholder:text-hive-muted/50"
                  value={slide.rationale || ""}
                  onChange={(e) => onUpdate({ rationale: e.target.value })}
                  placeholder="Why does this slide exist in the narrative?"
                />
              </div>
            </div>
          )}

          {/* Image attachment */}
          <div className="flex items-center gap-2 pt-1">
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

            {slide.image?.path ? (
              <>
                <div className="flex items-center gap-2 rounded border border-neon-lime/30 bg-neon-lime/5 p-1 pr-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.image.path}
                    alt=""
                    className="h-8 w-8 rounded object-cover"
                  />
                  <span className="text-[10px] text-neon-lime truncate max-w-[180px]">
                    {slide.image.path.split("/").pop()}
                  </span>
                  <button
                    onClick={onRemoveImage}
                    className="text-hive-muted hover:text-neon-magenta"
                    title="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <input
                  className="input-neon !py-1 text-[11px] flex-1"
                  placeholder="How should Claude use this image? (optional)"
                  value={slide.image.note || ""}
                  onChange={(e) =>
                    onUpdate({
                      image: slide.image
                        ? { ...slide.image, note: e.target.value }
                        : null,
                    })
                  }
                />
              </>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 rounded border border-dashed border-hive-grid px-2 py-1 text-[10px] tracking-widest text-hive-muted transition hover:border-neon-cyan/50 hover:text-neon-cyan"
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ImageIcon className="h-3 w-3" />
                )}
                UPLOAD IMAGE
              </button>
            )}
          </div>
          <div className="mt-2">
            <HiggsfieldToggle
              enabled={!!slide.use_higgsfield}
              prompt={slide.higgsfield_prompt || ""}
              hasImage={!!slide.higgsfield_rendered}
              onToggle={(v) => onUpdate({ use_higgsfield: v })}
              onPromptChange={(v) => onUpdate({ higgsfield_prompt: v })}
            />
          </div>
        </div>

        {/* Right-side actions */}
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={onDelete}
            className="text-hive-muted hover:text-neon-magenta transition"
            title="Delete slide"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onInsertAfter}
            className="text-hive-muted hover:text-neon-cyan transition"
            title="Insert slide below"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {slide.user_edited && (
            <span className="text-[8px] tracking-widest text-neon-lime">
              EDITED
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
