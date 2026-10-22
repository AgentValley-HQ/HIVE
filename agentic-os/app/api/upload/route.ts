import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "slide-images");
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per upload
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function sanitizeFilename(name: string): string {
  // Strip any path components and dangerous characters.
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 60);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const slideRaw = form.get("slide");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file field" }, { status: 400 });
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported mime type: ${file.type}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const slideHint = slideRaw ? sanitizeFilename(String(slideRaw)) : "x";
  const safeOriginal = sanitizeFilename(file.name) || "upload";
  const filename = `slide-${slideHint}-${Date.now()}-${safeOriginal}`;
  const abs = path.join(UPLOAD_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(abs, buffer);

  return NextResponse.json({
    path: `/uploads/slide-images/${filename}`,
    size: buffer.length,
    mime: file.type,
  });
}
