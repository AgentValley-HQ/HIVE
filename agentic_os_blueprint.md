# Agentic OS: Autonomous Marketing Orchestrator
**Product Requirements Document & Build Blueprint**

## 1. System Overview
This project is a fully autonomous, local-first marketing agency operating via a Next.js dashboard. It uses a "File-Watcher Bridge" architecture. The frontend UI communicates with a local backend by reading/writing to a `tasks.json` file. **Claude Code** (running locally in the terminal) acts as the autonomous engine, executing Playwright scripts, generating HTML/CSS carousels, and updating the JSON state.

**Constraint Checklist & Rules for Claude Code:**
- ❌ NO paid APIs (No OpenAI, No Anthropic API keys, No Midjourney).
- ✅ ALL reasoning is done by Claude Code reading prompts/files in the terminal.
- ✅ ALL image generation is done via local HTML/CSS-to-PNG rendering using Playwright.
- ✅ ALL web scraping is done locally via headless Playwright.

## 2. Tech Stack
- **Frontend / UI:** Next.js (App Router), React, Tailwind CSS, Lucide React (for icons). Theme: Dark mode, futuristic, neon-accents.
- **Backend / Engine:** Node.js, Playwright (for scraping and image rendering), File System (`fs`) module.
- **State Management:** Local `tasks.json` file polling.

## 3. Directory Structure
Please scaffold the project to match this exact structure:
```text
/agentic-os
  ├── /app                 # Next.js UI
  │   ├── /page.tsx        # Main dashboard (4-tab layout)
  │   ├── /components      # Radar, WarRoom, Foundry, Launchpad components
  ├── /public
  │   └── /generated-ads   # Output folder for PNG carousels
  ├── /engine              # The Node.js Playwright scripts
  │   ├── scraper.js       # Scrapes Meta/LinkedIn Ad library
  │   ├── renderer.js      # Converts HTML templates to PNG carousels
  │   ├── publisher.js     # Auto-posts to social media
  │   └── templates.js     # HTML/CSS string templates for carousels
  ├── tasks.json           # The Bridge: State manager
  └── tailwind.config.js
```

## 4. The State Machine (`tasks.json` Schema)
The entire app revolves around this JSON file. The UI writes commands, Claude/Node executes them, and updates the status.
```json
{
  "target_urls": ["https://competitor.com"],
  "status": "idle", 
  "scraped_data": [],
  "strategy": {},
  "html_slides": [],
  "generated_images": [],
  "approval_status": "pending" 
}
```
*Valid Statuses:* `idle` -> `scraping` -> `strategizing` -> `generating_visuals` -> `pending_approval` -> `deploying` -> `complete`.

## 5. Build Steps for Claude Code

### Step 1: Initialize the UI Shell
- Create the Next.js app with Tailwind CSS.
- Build a dark-themed dashboard layout with a sidebar containing 4 tabs: **Intel Radar**, **War Room**, **Carousel Foundry**, and **Launchpad**.
- Set up a React `useEffect` hook in the main page to poll `tasks.json` every 2 seconds and store it in local state.

### Step 2: Build the Intel Radar (Scraping Module)
- **UI:** A form to input competitor URLs and a "Commence Recon" button. Clicking it updates `tasks.json` status to `scraping`.
- **Engine:** Write `engine/scraper.js` using Playwright. It should read `target_urls`, simulate a visit to a generic ad library, extract dummy text (for now), save it to `scraped_data`, and change status to `strategizing`.

### Step 3: Build the War Room & Foundry (Generation)
- **UI:** Display the `strategy` object in a tactical split-screen view.
- **Engine:** Write `engine/renderer.js`. This script must:
  1. Take HTML strings from `html_slides`.
  2. Open a headless Playwright browser set to `1080x1350` viewport.
  3. Render the HTML and save high-res screenshots to `/public/generated-ads/slide_1.png`, etc.
  4. Update status to `pending_approval` and append the file paths to `generated_images`.

### Step 4: Build the Launchpad (HITL Approval)
- **UI:** If status is `pending_approval`, display the PNGs from `/public/generated-ads/` in a carousel UI.
- Add two buttons: "Reject" (sets status back to `strategizing`) and "Approve & Deploy" (sets status to `deploying`).

### Step 5: The Auto-Poster (Deploy Module)
- **Engine:** Write `engine/publisher.js` using Playwright. When status hits `deploying`, it should launch a browser, navigate to a mock social media URL, log "Uploading images...", and mark the final status as `complete`.