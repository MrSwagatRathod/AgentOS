# AgentOS — Web-First Casual Puzzle Studio

Building an **"Arrows – Puzzle Escape"-style arrow puzzle game** as a single web codebase, wrapped (not rewritten) into Android & iOS apps via Capacitor — with the ambition of scaling into a $1B+ gaming company.

## What's here

| Path | What it is |
|---|---|
| [`web/`](web/) | **The playable game** — self-contained HTML5/PWA, zero build step. Open `web/index.html` or `python3 -m http.server` in `web/`. |
| [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) | The complete business & product plan: game deconstruction, legal/store-policy reality check, web-first architecture, monetization, UA, LiveOps, team/budget, KPIs, risks, 90-day action plan |
| [`docs/FINANCIAL_MODEL.csv`](docs/FINANCIAL_MODEL.csv) | 5-year financial model across Conservative / Base / Aggressive scenarios |

## Quick start

```bash
cd web
node test/levels.test.js      # generator: 600 levels guaranteed solvable + determinism + perf
node test/game.smoke.test.js  # boots the real game (mock DOM) and plays through it
python3 -m http.server 8000   # play at http://localhost:8000
```

## Game features (MVP already shipped)

- Tap arrows whose path to the edge is clear to slide them off the board — wrong taps cost hearts
- Procedural, solver-validated level generator with a difficulty curve (3×3 → 10×10, endless levels)
- Hints, undo, 3 hearts, stars, level select, progress saved locally
- Canvas juice (slide animations, particles, confetti, screen shake), synthesized WebAudio SFX
- Light/dark themes, keyboard shortcuts, PWA (offline, installable, generated icons)

## Core strategy in one line

Build the game **once** for the web → ship as PWA + web portals → wrap the same artifact with Capacitor for Google Play and the App Store → monetize with hybrid ads/IAP + store-fee-free web D2C → scale into a portfolio of casual puzzle titles (Easybrain playbook: $308M revenue → $1.2B acquisition by Miniclip/Tencent).
