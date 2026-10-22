import type { Brain } from "./types";

// Human-friendly markdown mirror of the Brain shape. Section headers are the
// canonical parse keys — rename at your peril, both import and export use these.
const SECTION_TO_FIELD: Record<string, keyof Brain> = {
  "What You Do": "what_you_do",
  "Value Prop": "value_prop",
  "Target Audience": "target_audience",
  "Tone": "tone",
  "Differentiators": "differentiators",
  "Offerings": "offerings",
  "Website": "website",
  "Socials": "socials",
  "Current CTA": "current_cta",
  "Do Not Say": "do_not_say",
};

const LIST_FIELDS: Set<keyof Brain> = new Set(["differentiators", "offerings"]);

export const BRAIN_TEMPLATE = `# Your Business Name

## What You Do
One sentence on what the business actually does.

## Value Prop
The reason someone switches to you — the "why bother" line.

## Target Audience
Who you serve. Be specific.

## Tone
Three to five words. Example: Confident · operator · dry wit.

## Differentiators
- First thing nobody else does
- Second thing
- Third thing

## Offerings
- Product or service 1
- Product or service 2

## Website
https://your-site.com

## Socials
@yourhandle · linkedin.com/in/you

## Current CTA
What you ask people to do. Example: Book a demo.

## Do Not Say
Banned phrases and off-brand angles. Example: "revolutionary", "game-changer".
`;

export function brainToMarkdown(brain: Brain): string {
  const lines: string[] = [];
  lines.push(`# ${brain.business_name || "Untitled Brand"}`);
  lines.push("");
  for (const [header, field] of Object.entries(SECTION_TO_FIELD)) {
    const value = brain[field];
    lines.push(`## ${header}`);
    if (LIST_FIELDS.has(field) && Array.isArray(value)) {
      if (value.length === 0) lines.push("");
      else value.forEach((v) => lines.push(`- ${v}`));
    } else {
      lines.push(String(value || "").trim() || "");
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

export function parseBrainMarkdown(md: string): Partial<Brain> {
  const brain: Partial<Brain> = {};
  const lines = md.replace(/\r\n/g, "\n").split("\n");

  // H1 → business_name
  const h1 = lines.find((l) => /^#\s+\S/.test(l));
  if (h1) {
    const name = h1.replace(/^#\s+/, "").trim();
    if (name && name.toLowerCase() !== "your business name") brain.business_name = name;
  }

  // Walk H2 sections
  let currentField: keyof Brain | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentField) return;
    const raw = buffer.join("\n").trim();
    if (!raw) {
      buffer = [];
      return;
    }
    if (LIST_FIELDS.has(currentField)) {
      const items = raw
        .split("\n")
        .map((l) => l.replace(/^[-*+]\s*/, "").trim())
        .filter(Boolean);
      (brain as Record<string, unknown>)[currentField] = items;
    } else {
      (brain as Record<string, unknown>)[currentField] = raw;
    }
    buffer = [];
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      const header = h2[1].trim();
      currentField = SECTION_TO_FIELD[header] ?? null;
      continue;
    }
    if (currentField) buffer.push(line);
  }
  flush();

  return brain;
}
