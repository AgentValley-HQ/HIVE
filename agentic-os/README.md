# H.I.V.E // Agentic OS

An autonomous, **local-first** marketing orchestrator. One operator, five agents, one state file.

The Next.js dashboard is the cockpit. Node.js engine scripts are the workers. Claude Code CLI is the reasoning layer (OAuth, no API key). Apify is the only paid dependency (optional). Playwright turns HTML into print-grade images. Higgsfield MCP (optional) renders photo-grade ad creative.

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Architecture — the three layers](#architecture--the-three-layers)
5. [The state bridge: `tasks.json`](#the-state-bridge-tasksjson)
6. [The five agents](#the-five-agents)
7. [Pipeline — end to end](#pipeline--end-to-end)
8. [How carousels are generated](#how-carousels-are-generated)
9. [How single ads are generated](#how-single-ads-are-generated)
10. [How Claude is connected (no API key)](#how-claude-is-connected-no-api-key)
11. [How Apify is used (API token)](#how-apify-is-used-api-token)
12. [How Higgsfield is used (optional, image-grade ads)](#how-higgsfield-is-used-optional-image-grade-ads)
13. [War Room → Ad Budget Strategy → Foundry handoff](#war-room--ad-budget-strategy--foundry-handoff)
14. [Config files](#config-files)
15. [Environment variables](#environment-variables)
16. [Install & run](#install--run)
17. [Scripts](#scripts)
18. [Troubleshooting](#troubleshooting)
19. [Design principles](#design-principles)

---

## What it does

Given a short brand profile (the "Brain") and a few competitor URLs, H.I.V.E:

1. **Scrapes** competitor ads from the Meta Ad Library and Google Ads Transparency Center.
2. **Analyzes** them for winning patterns, competitive gaps, and visual language.
3. **Synthesizes** a campaign strategy (hook, pillars, audience, 5-slide carousel outline, 3 single-ad variants) using Claude.
4. **Writes** an ad-spend playbook — per-platform (Meta / Google / Experimental) creative angles grounded in the real competitor data, with budget allocation guidance.
5. **Generates** the final creative — HTML+CSS slides rendered to 1080×1350 PNG by Playwright, or finished image ads via Higgsfield.
6. **Approves** everything through a human-in-the-loop UI with inline AI edits.
7. **Deploys** — downloads, pre-filled captions, platform composer deep links for Instagram, LinkedIn, X, Meta Ads Manager, Google Ads.

Everything persists in a single JSON file (`tasks.json`). No database.

---

## Tech stack

### Frontend
- **Next.js 14** (App Router, React 18, TypeScript strict mode)
- **Tailwind CSS** with a custom orange-on-black theme + CSS 3D transforms
- **Lucide React** icons
- Custom in-house components only — no component library

### Backend (engine)
- **Node.js** scripts invoked as subprocesses from the Next.js API routes
- **Playwright** (headless Chromium) for HTML → PNG rendering
- **Apify REST API** for competitor ad scraping (optional)
- **Claude Code CLI** for all AI reasoning (OAuth, no key)
- **Higgsfield MCP** (via Claude) for photo-grade image generation (optional)

### Persistence
- A single JSON file: `tasks.json` (git-ignored)
- Generated PNGs land in `public/generated-ads/`
- Uploaded brand assets land in `public/uploads/`

### Dependencies (from `package.json`)
```json
{
  "next": "14.2.5",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "lucide-react": "^0.408.0",
  "playwright": "^1.46.0"
}
```
Dev deps: `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `@types/*`.

No ORM, no auth provider, no analytics SDK, no state manager. The simplicity is deliberate.

---

## Project structure

```
agentic-os/
├── app/                                # Next.js App Router
│   ├── layout.tsx                      # Root layout + global imports
│   ├── page.tsx                        # Main dashboard: sidebar + header + agent switch
│   ├── globals.css                     # Theme tokens, panel styles, animations
│   ├── api/
│   │   ├── tasks/route.ts              # GET/POST tasks.json (the one bridge)
│   │   ├── engine/route.ts             # POST → spawns an engine subprocess
│   │   ├── upload/route.ts             # Multipart upload → /public/uploads/
│   │   ├── config/route.ts             # Reports Apify/Claude availability
│   │   └── detect-colors/route.ts      # Playwright scrape of a brand site for palette
│   ├── components/
│   │   ├── CommandCenter.tsx           # 3D agent hub (radial, draggable)
│   │   ├── Brain.tsx                   # Brand profile editor + import/export
│   │   ├── IntelRadar.tsx              # Target URLs, scrape launcher, scraped ads review
│   │   ├── WarRoom.tsx                 # Strategy display + AD BUDGET STRATEGY panel
│   │   ├── AdBudgetStrategy.tsx        # Budget split + Claude playbook tabs
│   │   ├── CarouselFoundry.tsx         # Carousel outline + single-ad concepts editors
│   │   ├── OutlineEditor.tsx           # Per-slide editor with Higgsfield toggle
│   │   ├── AdConceptEditor.tsx         # Per-variant single-ad editor
│   │   ├── HiggsfieldToggle.tsx        # Per-slide "render with Higgsfield" switch
│   │   ├── HiggsfieldButton.tsx        # On-demand single-slide Higgsfield gen
│   │   ├── EditModal.tsx               # Prompt-driven AI edit modal
│   │   ├── Launchpad.tsx               # Preview + approve + download + deploy
│   │   └── AdLightbox.tsx              # Full-screen scraped ad preview
│   └── lib/
│       ├── types.ts                    # All TypeScript interfaces (shared contract)
│       └── brainMd.ts                  # .brain.md import/export logic
│
├── engine/                             # Node.js workers (NOT included in tsc build)
│   ├── state.js                        # read()/write()/log() against tasks.json
│   ├── claude-cli.js                   # Spawns `claude -p` via OAuth session
│   ├── apify-client.js                 # Minimal Apify REST client
│   ├── apify.config.js                 # Actor IDs + per-actor input shape
│   ├── url-resolver.js                 # Website domain → Meta Page URL → numeric Page ID
│   ├── scraper.js                      # Fires Meta + Google scrapers, normalizes
│   ├── visual-intel.js                 # Claude vision pass on competitor thumbs
│   ├── strategist.js                   # Claude: brain + ads → strategy JSON
│   ├── ad-playbook.js                  # Claude: strategy + ads → per-platform playbook
│   ├── carousel-designer.js            # Claude: outline + brain → bespoke HTML/CSS slides
│   ├── forge-carousel.js               # Orchestrates designer + renderer
│   ├── renderer.js                     # Playwright: HTML slides → PNG
│   ├── single-ad.js                    # Full single-ad pipeline (design + render)
│   ├── outline-regen.js                # Regenerate outline from a prompt
│   ├── ad-concepts-regen.js            # Regenerate single-ad concepts from a prompt
│   ├── slide-edit.js                   # AI edit of a single slide/variant in place
│   ├── higgsfield-gen.js               # Higgsfield MCP → finished image ads
│   ├── templates.js                    # Deterministic HTML templates (fallback)
│   ├── publisher.js                    # Placeholder "deploy" step
│   └── orchestrator.js                 # Optional: watches tasks.json for status changes
│
├── public/
│   ├── generated-ads/                  # slide_XX.png, ad_XX.png output
│   ├── uploads/                        # Operator-uploaded images (logos, product shots)
│   └── intel-thumbs/                   # Downloaded competitor ad thumbnails
│
├── tasks.json                          # THE state file (git-ignored)
├── .env.local                          # APIFY_TOKEN here (git-ignored)
├── .env.local.example                  # Template
├── tailwind.config.js                  # Color tokens, box-shadow, keyframes
├── next.config.js                      # Next.js config (minimal)
├── tsconfig.json                       # TS strict mode, excludes /engine
└── package.json                        # Deps + scripts
```

The `/engine` folder is **intentionally excluded** from the TypeScript build (`tsconfig.json#exclude`). Those files are plain CommonJS Node scripts spawned as subprocesses — they share no code with the React app except through `tasks.json`.

---

## Architecture — the three layers

### Layer 1 — UI (Next.js app)
The React dashboard writes to `tasks.json` via `POST /api/tasks` and reads via `GET /api/tasks`. It also triggers engine runs via `POST /api/engine`. The UI polls `tasks.json` every 1–2 seconds so engine progress shows up live.

### Layer 2 — API routes (`/app/api/*`)
Thin HTTP wrappers around either the state file or a child_process spawn. Nothing clever here — they exist so the UI never touches `tasks.json` or `child_process` directly.

### Layer 3 — Engine (Node.js workers)
Standalone scripts that read/write `tasks.json` directly. Each one does one job (scrape, strategize, design, render, publish). They're spawned detached from the API route and immediately return — the UI watches progress via polling.

```
┌─────────────────────────┐         ┌───────────────────┐
│   Next.js UI (React)    │ ─────►  │  /api/tasks (R/W) │ ─────► tasks.json
│                         │ ─────►  │  /api/engine POST │ ──┐
└─────────────────────────┘         └───────────────────┘   │
             ▲                                              ▼
             │ polls every 1-2s                   spawn('node', 'engine/X.js')
             │                                              │
             └──────────── tasks.json ◄────── reads/writes ─┘
```

**Why this split?** The UI stays snappy (never blocks on AI calls). Engine scripts can be heavy (Playwright, Claude, Apify) without affecting the dashboard. If the dev server restarts, in-flight engine jobs continue because they're detached.

---

## The state bridge: `tasks.json`

A single JSON object holds **everything**: brand profile, target URLs, scraped ads, strategy, carousel outline, generated image paths, approval status, operation log.

Shape (abridged — full types in [`app/lib/types.ts`](app/lib/types.ts)):

```ts
{
  "brain": {                            // Brand profile (operator input)
    "business_name": "...",
    "what_you_do": "...",
    "value_prop": "...",
    "target_audience": "...",
    "tone": "...",
    "differentiators": ["..."],
    "offerings": ["..."],
    "current_cta": "...",
    "do_not_say": "...",
    "brand_colors": [{ "hex": "#...", "role": "primary" }]
  },
  "target_urls": [...],                 // Competitor URLs for scraping
  "country": "IN",                      // 2-letter country code for Meta Ad Library
  "status": "pending_approval",         // One of 7 pipeline states
  "scraped_data": [ScrapedAd, ...],     // Raw ad data from Apify
  "strategy": {
    "campaign_name": "...",
    "hook": "...",
    "pillars": [...],
    "rationale": "...",
    "competitive_gaps": [...],
    "winning_patterns": [...],
    "expected_outcomes": [...],
    "carousel_outline": [OutlineSlide, ...],  // Editable 5-slide outline
    "single_ad_concepts": [AdConcept, ...],   // Editable 3 ad variants
    "visual_intel": { ... },                  // Vision-pass output
    "creative_playbook": {                    // Ad budget playbook (Claude)
      "meta": { rationale, campaign_type, targeting, creatives: [...] },
      "google": { ... },
      "experimental": { ... }
    }
  },
  "html_slides": [                      // Rendered HTML (output of designer)
    { "index": 1, "title": "...", "html": "<!doctype html>..." }
  ],
  "html_single_ads": [...],
  "generated_images": [                 // Final PNG paths
    { "index": 1, "path": "/generated-ads/slide_01.png", "source": "playwright" }
  ],
  "generated_single_ads": [...],
  "approval_status": "pending",
  "pending_edit": null,                 // Transient — triggers slide-edit engine
  "pending_higgsfield": null,           // Transient — triggers higgsfield-gen engine
  "log": ["[13:42:01] renderer: ✓ slide 1"],  // Last 80 lines
  "updated_at": "2025-10-21T13:42:01.123Z"
}
```

All reads: `JSON.parse(fs.readFileSync('tasks.json'))`.
All writes: shallow merge + atomic write.
Transient fields like `pending_edit` are cleared by the engine after processing.

---

## The five agents

Each is a top-level view in the dashboard, exposed from a left sidebar + a 3D **Command Center** hub.

| # | Agent | Purpose | Primary data it owns |
|---|---|---|---|
| 01 | **Brain** | Capture brand identity — business, value prop, tone, audience, differentiators, current CTA, do-not-say list, brand colors | `tasks.brain` |
| 02 | **Intel Radar** | Configure competitor target URLs, trigger scrape, review scraped ads with visuals | `tasks.target_urls`, `tasks.scraped_data` |
| 03 | **War Room** | Display strategy synthesized by Claude; **Ad Budget Strategy** panel with per-platform playbook + budget allocator | `tasks.strategy` (including `creative_playbook`) |
| 04 | **Brand Foundry** | Edit the carousel outline (5 slides) and single-ad concepts (3 variants); forge PNGs; mix HTML renders with Higgsfield images | `tasks.strategy.carousel_outline`, `tasks.strategy.single_ad_concepts`, `tasks.generated_images`, `tasks.generated_single_ads` |
| 05 | **Launchpad** | Preview, approve, download, deploy to Instagram / LinkedIn / X / Meta Ads Manager / Google Ads | `tasks.approval_status`, deployment UI |

Plus the **Command Center** (HQ hub): a 3D CSS-perspective view with 5 draggable agent cards orbiting a central "HIVE CORE". Live status chips show each agent's state (SETUP / STANDBY / ONLINE / WORKING / LOCKED). The active agent pulses, its connector arc pumps a flowing dashed line to the core. Agents are locked progressively — War Room unlocks when scrape data arrives, Foundry when strategy is synthesized, Launchpad when creative is generated.

---

## Pipeline — end to end

```
idle
  │
  │ operator fills Brain + Intel Radar targets, clicks SCRAPE
  ▼
scraping         ◄── engine/scraper.js
  │ Meta + Google scrapes run in parallel via Apify REST
  │ Each ad normalized to ScrapedAd shape
  │ Visual intel pass: Claude analyzes competitor thumbnails
  ▼
strategizing     ◄── engine/strategist.js (chained from scraper)
  │ Claude synthesizes campaign + outline + ad concepts
  │ Writes tasks.strategy
  ▼
generating_visuals  ◄── engine/forge-carousel.js  OR  engine/single-ad.js
  │ Carousel designer: Claude writes bespoke HTML/CSS for each slide
  │ Higgsfield (if toggled) renders finished image slides
  │ Playwright renders HTML slides → PNG at 1080×1350
  │ Mixed-mode: some slides from Higgsfield, others from Playwright
  ▼
pending_approval
  │ Operator reviews in Launchpad
  │ Can inline-edit via EditModal (triggers slide-edit)
  │ Approves → downloads PNGs + copies caption + opens platform composer
  ▼
deploying         ◄── engine/publisher.js (placeholder)
  ▼
complete
```

All transitions are driven by `status` writes in `tasks.json`. The UI reflects the state live via its 1–2s polling.

---

## How carousels are generated

End-to-end for a 5-slide Instagram carousel at 1080×1350:

### 1. Strategy produces an outline
When `engine/strategist.js` runs, it asks Claude for `carousel_outline` with 5 entries:
```json
{ "slide": 1, "title": "Your degree is depreciating.", "body": "...", "role": "hook", "rationale": "..." }
```
Operator can edit any field in Brand Foundry's **Outline Editor** before forging.

### 2. Per-slide controls
Each slide row has:
- A **FORGE** checkbox (`include_in_forge`) — only ticked slides regenerate
- A **Higgsfield toggle** (`use_higgsfield`) — if on, the entire finished slide is rendered by Higgsfield's image model (text, visuals, palette baked in); if off, the slide goes through the HTML designer + Playwright pipeline
- An **Upload Image** button — attaches an operator-provided image to the slide
- A **GENERATE NOW** button (HiggsfieldButton) — fires on-demand Higgsfield gen for just that one slide

### 3. Click FORGE → `engine/forge-carousel.js` runs
```
1. Clear all slide_*.png in /public/generated-ads/
2. Reset higgsfield flags on all ticked slides
3. Call engine/higgsfield-gen.js → processPending('carousel')
   • For each slide with use_higgsfield=true && include_in_forge=true,
     Claude crafts an image-first prompt (via engine/higgsfield-gen.js's
     tone-mapped art direction briefs: operator / editorial / startup /
     street / default) and calls the Higgsfield MCP via the Claude CLI
     (--dangerously-skip-permissions required for MCP tool access)
   • Finished slide PNG lands DIRECTLY in /public/generated-ads/slide_XX.png
   • Slide marked higgsfield_rendered: true
4. Call engine/carousel-designer.js → design()
   • Claude writes bespoke HTML + CSS for every slide that's ticked
     but NOT marked higgsfield_rendered
   • Each slide is a complete <!doctype html>...</html> at 1080×1350px
   • System prompt enforces anti-slop rules, brand palette, typography pairings,
     visual metaphors; weaves in competitor visual intel for context
5. Call engine/renderer.js (spawned as subprocess)
   • Playwright headless Chromium with viewport 1080×1350, deviceScaleFactor 2
   • page.setContent(html, { waitUntil: 'networkidle' })
   • Inlines /uploads/, /generated-ads/, /intel-thumbs/ images as base64
     data URLs to bypass Chromium's file:// cross-origin block
   • page.screenshot() → /public/generated-ads/slide_XX.png
   • Merges output with any Higgsfield-generated entries in state
6. Status → pending_approval
```

### 4. Review + edit + download
In Launchpad:
- Preview carousel with chevron navigation
- **EDIT WITH AI** — prompt modal → `engine/slide-edit.js` → Claude rewrites that single slide's HTML in place → Playwright re-renders → PNG replaces previous
- **DOWNLOAD ALL** / **THIS SLIDE** — browser download of PNGs
- **DEPLOY TO PLATFORM** — IG / LinkedIn / X buttons that copy an auto-composed caption to clipboard, download the asset(s), and open the platform's composer in a new tab

---

## How single ads are generated

Nearly identical to carousels, but for 1080×1080 single ads with 3 variants.

### 1. `strategy.single_ad_concepts` has 3 entries
Each with `concept`, `rationale`, `headline_direction`, `visual_direction`, plus the same per-row controls (FORGE tick, Higgsfield toggle, image upload).

### 2. Click FORGE → `engine/single-ad.js`
```
1. Clear ad_*.png in /public/generated-ads/
2. Reset higgsfield flags on ticked variants
3. Higgsfield batch (parallel) for toggled variants
4. Claude writes HTML for non-Higgsfield variants (3 variants max,
   enforces visual anti-slop rules + brand palette + ONE hero element)
5. Playwright renders at viewport 1080×1080
6. Final generated_single_ads = merge(higgsfield, playwright)
7. Status → pending_approval
```

### 3. Launchpad deploy
Single ads also offer **Meta Ads Manager** and **Google Ads** deploy buttons (opens the respective ad manager + downloads asset + copies caption).

---

## How Claude is connected (no API key)

H.I.V.E uses the **Claude Code CLI** via the operator's existing OAuth session — **no API key, no per-token billing**. This is unusual and worth explaining.

### Setup (one-time, by operator)
```bash
npm install -g @anthropic-ai/claude-code
claude login        # opens browser → sign in → paste code back
```

That stores an OAuth refresh token on disk, which the `claude` CLI uses to authenticate every subsequent call.

### How the engine calls Claude
Every AI step spawns `claude -p` as a child process and pipes the prompt into stdin:

```js
// engine/claude-cli.js (abridged)
const { spawn } = require("child_process");

function prompt(text, { timeoutMs = 120_000, skipPermissions = false } = {}) {
  const args = ["-p"];
  if (skipPermissions) args.push("--dangerously-skip-permissions");
  const child = spawn("claude.cmd", args, {
    windowsHide: true,
    shell: true,            // required on Windows for .cmd/.bat (CVE-2024-27980)
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.write(text);
  child.stdin.end();
  // ... accumulate stdout, resolve on exit
}
```

`claude -p` reads the prompt from stdin and returns the model's response on stdout. All reasoning cost is covered by the operator's Claude.ai subscription — no API billing, no key management.

### `--dangerously-skip-permissions`
Required ONLY when Claude needs to invoke MCP tools (like Higgsfield) non-interactively. Without this flag, the CLI prompts in-terminal for permission — fatal when the engine runs headless. The flag is set only in `engine/higgsfield-gen.js` where it's intentional and operator-triggered.

### Where Claude is called
| Engine module | What it asks Claude |
|---|---|
| `strategist.js` | Brain + scraped ads → full strategy JSON |
| `visual-intel.js` | Vision pass on competitor ad thumbnails → style patterns |
| `ad-playbook.js` | Strategy + ads → per-platform creative playbook (Meta/Google/Experimental) |
| `carousel-designer.js` | Outline + brand → bespoke HTML/CSS for each slide |
| `single-ad.js` | Concepts + brand → bespoke HTML/CSS for each variant |
| `outline-regen.js` | Prompt + existing outline → rewritten outline |
| `ad-concepts-regen.js` | Prompt + concepts → rewritten concepts |
| `slide-edit.js` | Edit prompt + single slide HTML → rewritten HTML |
| `higgsfield-gen.js` | Art-direction brief → crafts Higgsfield prompt + calls MCP |

Every one of these has a deterministic local-template fallback if the CLI isn't installed or returns malformed output. Nothing is a hard dependency.

---

## How Apify is used (API token)

Scraping is the one place H.I.V.E talks to a paid third-party API.

### Setup
```bash
# .env.local at repo root
APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
Get yours at https://console.apify.com/settings/integrations. The `.env.local` is git-ignored.

### How the token is loaded
`engine/scraper.js` parses `.env.local` manually at startup (so it works both via `node engine/scraper.js` and when spawned from `/api/engine`):
```js
for (const line of fs.readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const [k, v] = line.split("=");
  if (k && v) process.env[k.trim()] = v.trim();
}
```

### Actors used
Configured in [`engine/apify.config.js`](engine/apify.config.js):

| Platform | Actor ID | Cost (as of writing) |
|---|---|---|
| Meta Ad Library | `apify~facebook-ads-scraper` | ~$0.0058 / ad |
| Google Ads Transparency | `memo23~google-ad-transparency-scraper-cheerio` | ~$0.002 / ad |
| URL resolver (website → Meta Page ID) | `automation-lab~facebook-url-to-id-resolver` | ~$0.001 / lookup |

A hard cap of **10 ads per competitor** (`MAX_ADS_PER_TARGET`) protects against budget blowouts.

### Endpoint
We use Apify's **run-sync-get-dataset-items** so one HTTP call runs the actor, waits, and returns the dataset:
```
POST https://api.apify.com/v2/acts/{actorId}/run-sync-get-dataset-items
     ?token={APIFY_TOKEN}&timeout=180&format=json&clean=true
```
No webhooks, no polling loop — synchronous for simplicity.

### Fallback
If `APIFY_TOKEN` is missing OR an actor fails, `scraper.js` falls back to synthetic placeholder ads so the pipeline still advances and you can see the UI flow.

---

## How Higgsfield is used (optional, image-grade ads)

Higgsfield is an AI image/video generation platform exposed to Claude as an MCP (Model Context Protocol) server. H.I.V.E uses it ONLY when the operator opts in per-slide via a toggle — never automatically — because it consumes credits.

### How the toggle flow works
1. Operator ticks "FORGE WHOLE SLIDE WITH HIGGSFIELD" on a carousel slide or ad variant
2. On FORGE, `engine/higgsfield-gen.js` runs for each toggled slide
3. It constructs an art-direction brief (image subject + aesthetic references + brand palette + typography + lighting + composition rules + negative prompt) using the `toneBrief()` + `roleToVisualHint()` helpers
4. Spawns `claude -p --dangerously-skip-permissions` with the brief
5. Claude invokes the Higgsfield MCP tool (`mcp__claude_ai_Higgsfield__generate_image`), waits for completion, returns the final image URL
6. H.I.V.E downloads the image and writes it DIRECTLY to `/public/generated-ads/slide_XX.png` (bypassing HTML designer + Playwright for that slide)
7. The slide is marked `higgsfield_rendered: true` so the Claude designer + Playwright renderer skip it

### Mixed mode
A single carousel can mix Higgsfield slides (rich photo-grade) with HTML-rendered slides (type-first) in any combination. All five end up in the same `generated_images` array.

### War Room → Foundry handoff with Higgsfield
From the Ad Budget Strategy panel, each platform tab has a "RENDER WITH HIGGSFIELD" toggle. When ON, clicking **GENERATE IN FOUNDRY** ships the playbook creatives to Brand Foundry with `use_higgsfield: true` + a pre-seeded `higgsfield_prompt` on every concept — the subsequent forge then routes those variants through the Higgsfield pipeline automatically.

---

## War Room → Ad Budget Strategy → Foundry handoff

The newest major flow — gives the operator a true "set a budget, approve the plan, generate the ads" path.

```
Operator sets budget ($10,000/mo)
  │
  │ UI computes split: META 50% / GOOGLE 40% / TEST 10%
  │ weighted by competitor-platform concentration from scraped_data
  ▼
Click GENERATE PLAYBOOK
  │
  │ engine/ad-playbook.js runs
  │ Claude writes 3 Meta + 3 Google + 1 Experimental creative angles,
  │ each grounded in a REAL competitor pattern from scraped_data,
  │ mapped to brand differentiators, IMAGE-ONLY formats
  │ Carousel-format creatives include a slides[] breakdown
  ▼
Playbook rendered as tabs: META | GOOGLE | TEST
  │
  │ Each creative card shows:
  │ • Concept + format + routing badge (→ SINGLE AD or → CAROUSEL)
  │ • CTA pill
  │ • Angle (what the image depicts + overlay text)
  │ • WHY IT WILL WORK (competitor-grounded reasoning)
  │ • Audience (specific segment)
  ▼
Optional: toggle RENDER WITH HIGGSFIELD per platform
  │
  ▼
Click GENERATE IN FOUNDRY (per tab)
  │
  │ AdBudgetStrategy partitions creatives by format:
  │ • Single ads → mapped to AdConcept[] → single_ad_concepts
  │ • Carousels  → first carousel's slides → OutlineSlide[] → carousel_outline
  │ Patches tasks.json with both arrays in one shot
  │ Spawns engines in parallel: single-ad + forge-carousel
  │ Navigates operator to Brand Foundry
  ▼
Brand Foundry forges both pipelines concurrently
  │ Operator watches progress live
  ▼
Launchpad: approve, download, deploy
```

---

## Config files

### `tailwind.config.js`
- **Color tokens**: `neon.{cyan,magenta,lime,amber,violet}` all remap to neutral whites/grays so agent chambers read as minimal black-and-white. Only `neon.{orange,ember,glow,deep,burnt}` keep orange values — reserved for the Command Center hub. `hive.{black,void,panel,grid,edge,muted}` for backgrounds. `agent.{brain,radar,war,foundry,launch}` for per-agent subtle accent colors in the hub.
- **Box shadows**: neutral white glows + Command-Center-specific orange glows.
- **Keyframes**: `scan`, `pulseGlow`, `float`, `marquee`, `flicker`, `gridShift`, `orbit`, `tilt3d`.

### `globals.css`
- Base theme (near-black body, subtle white grid, orange reserved for Command Center only)
- Reusable components: `.panel`, `.bracket`, `.btn-neon`, `.btn-magenta`, `.btn-lime`, `.btn-amber`, `.btn-danger`, `.input-neon`, `.chip`, `.neon-text`, `.radar-sweep`
- Command Center 3D helpers: `.cc-stage`, `.cc-floor`, `.cc-node`, `.cc-pedestal`, `.cc-rim`, `.cc-arc`, `.cc-glow`, `.cc-card-pulse`, `.cc-dot-pulse`, `.cc-flow-line`, `.cc-unlock-flash`

### `next.config.js`
Minimal — `reactStrictMode: true`, nothing else.

### `tsconfig.json`
Strict TypeScript, `moduleResolution: "bundler"`, path alias `@/*` → repo root. **Excludes `/engine`** from the build — those are plain JS.

### `engine/apify.config.js`
Actor IDs + per-actor input builders. Change scraping backends here without touching application code.

---

## Environment variables

Only one required, and it's optional-ish (fallbacks exist).

| Variable | Required | Where | Purpose |
|---|---|---|---|
| `APIFY_TOKEN` | For real scraping | `.env.local` | Auth for Apify REST actor runs. Without it, scraper uses synthetic data |

Claude is authenticated via its OWN local CLI (`claude login`) — nothing in `.env.local`. Higgsfield is accessed through Claude's MCP configuration — again, nothing in `.env.local`.

### `.env.local` setup
```bash
# From .env.local.example
APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
File is git-ignored. Never commit secrets.

---

## Install & run

### Prerequisites
- Node.js ≥ 20
- A Claude.ai account (for the CLI OAuth)
- Optional: an Apify account for real scraping
- Optional: Higgsfield MCP enabled in your Claude Code setup

### One-time setup
```bash
# 1. Install dependencies
npm install

# 2. Install Playwright's headless Chromium (needed for HTML → PNG rendering)
npx playwright install chromium

# 3. Install + log in to the Claude Code CLI
npm install -g @anthropic-ai/claude-code
claude login     # browser flow — one-time OAuth

# 4. (Optional) Add your Apify token for real scraping
cp .env.local.example .env.local
# Edit .env.local → paste your APIFY_TOKEN

# 5. (Optional) Enable Higgsfield MCP in Claude Code settings
#    See https://docs.claude.com/docs/model-context-protocol
```

### Run the dev server
```bash
npm run dev
# → http://localhost:3000
```

The dashboard opens on the Command Center hub. Click any agent to enter. Start with Brain → fill in your brand profile → go to Intel Radar → add competitor URLs → click SCRAPE. Everything else cascades from there.

### Production build
```bash
npm run build
npm start
```

---

## Scripts

From `package.json`:

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | Next.js lint |
| `npm run engine:scrape` | Run `engine/scraper.js` directly (pulls `target_urls`, writes `scraped_data` + strategy + HTML slides) |
| `npm run engine:render` | Run `engine/renderer.js` directly (renders `html_slides` → PNG) |
| `npm run engine:single-ad` | Run `engine/single-ad.js` (full single-ad pipeline) |
| `npm run engine:slide-edit` | Run `engine/slide-edit.js` (expects `pending_edit` in state) |
| `npm run engine:publish` | Run `engine/publisher.js` (placeholder deploy) |
| `npm run engine:watch` | Run `engine/orchestrator.js` — watches `tasks.json` and auto-dispatches engines on status changes |

The UI's buttons also fire these engines via `POST /api/engine { module: "<name>" }` — you don't normally need to run them manually.

---

## Troubleshooting

### "APIFY · OFFLINE" in the top header
Your `APIFY_TOKEN` is missing or invalid. Check `.env.local`. Scraper will use synthetic data as fallback.

### "CLAUDE · OFFLINE" in the top header
The `claude` CLI isn't installed or you haven't logged in. Run `claude login`. Engine modules will use deterministic templates as fallback.

### Carousel slides render but look like text posters
The Claude HTML designer produced valid HTML, but you probably want the richer Higgsfield output. Toggle **FORGE WHOLE SLIDE WITH HIGGSFIELD** on each slide you want upgraded (uses Higgsfield credits).

### "Permission to use mcp__claude_ai_Higgsfield__generate_image was not granted"
`engine/higgsfield-gen.js` needs `--dangerously-skip-permissions`. This is already set; if you forked and reset the flag, add it back.

### Port 3000 already in use
Kill the stale process:
```bash
# Windows
netstat -ano | findstr :3000 | findstr LISTENING
taskkill //PID <pid> //F

# macOS/Linux
lsof -ti:3000 | xargs kill -9
```

### Fresh install, nothing shows
`tasks.json` doesn't exist yet. It's created on first `POST /api/tasks` or first engine run. Just open the UI and fill out the Brain — the file writes itself.

### "unknown module" from `/api/engine`
Check [`app/api/engine/route.ts`](app/api/engine/route.ts) — the `ALLOWED` set must include the module name you're passing. Add it there if you created a new engine script.

---

## Design principles

- **Single source of truth**: everything in `tasks.json`. No database, no cache layer, no state manager.
- **Local-first**: all AI reasoning via your own Claude CLI session. No OpenAI keys, no Anthropic API keys, no vendor lock.
- **Progressive enhancement**: every engine has a deterministic fallback. The pipeline advances even if Claude, Apify, or Higgsfield is unavailable.
- **Operator-approved**: nothing publishes without a human click. All AI output is editable in place.
- **Subprocess architecture**: UI stays responsive during heavy AI/render work because engines run detached.
- **No framework lock-in on engines**: `/engine` is plain CommonJS Node — you could call these scripts from a cron job, a CLI, a different web framework, whatever.
