# Arrow Escape — Web Game (Procedural Long-Arrow Puzzle System)

A production-grade, modular implementation of the *Arrows – Puzzle Escape* mechanic, built web-first (one codebase → web / PWA → wrapped apps later via Capacitor, per `../docs/MASTER_PLAN.md`).

**Zero build step, zero dependencies, works from `file://` or any static server.**

## Play it

```bash
cd web
python3 -m http.server 8000     # then open http://localhost:8000
```

Or just open `index.html` directly in a browser.

## What's implemented

**Modular architecture (single responsibility per module):**

| Module | File | Responsibility |
|---|---|---|
| `AO.RNG` | `js/puzzle.js` | seeded deterministic PRNG (mulberry32) + helpers |
| `AO.Board` | `js/puzzle.js` | board layout engine — occupancy (EMPTY / arrow-id / WALL), head-ray queries, shaped boards (rect/circle/heart/cross/diamond/knight) |
| `AO.Paths` | `js/puzzle.js` | long-arrow path generator — random walk (90° turns, ≥2-cell segments, no 180° reversals, no self-intersection) + tail extension |
| `AO.Puzzle` | `js/puzzle.js` | puzzle generator — **dependency-first reverse construction** + filler pass; `validateSolvable` / `validateNoOverlap` |
| `AO.DependencyGraph` | `js/puzzle.js` | deps/dependents derived from the layout (X depends on Y ⇔ Y blocks X's head ray); DAG by construction; chain-depth metric |
| `AO.Difficulty` | `js/difficulty.js` | difficulty manager — board size, fill, arrow length range, start-ratio target per level |
| `AO.Hints` | `js/hints.js` | hint engine — earliest arrow in solution order still on the board |
| `AO.Renderer` | `js/renderer.js` | vector renderer — rounded-corner polylines, filled symmetric arrowheads, soft shadows, dashed hint rays (no sprites) |
| `AO.Engine` | `js/engine.js` | animation engine + state machine + pooled particles + input |
| `AO.Game` | `js/game.js` | facade for UI / keyboard / tests |

**The rule (same as the reference):** only arrows with a **fully open path** can leave the board. Tap an arrow → its whole path flies straight out in the direction its head points — but only if nothing blocks the route to the board edge. Collision = lost heart (3/3).

**Product features (matching the reference's feature set, all original implementations):**

| Feature | Details |
|---|---|
| **700-level library** | Deterministic procedural levels 1–700, easy → hard (Main Route) |
| **Main Route** | Guided easy-to-hard progression, auto-advances |
| **Random Play** | Fresh random board from the library; **New Board** loads another |
| **Challenge Mode** | 25 dedicated harder boards + **5:00 countdown timer** (fails on timeout) |
| **Hearts 3 / 3** | Shown top-center; collisions cost hearts; 0 = level failed |
| **Hint** | Highlights the next safe arrow + its exit path in red (3 per level) |
| **Time 05:00** | Timer in the header; counts down in Challenge |
| **Display: Mono / Color** | Mono = navy arrows; Color = each arrow gets its own hue |
| **Line Width: Thin / Normal / Bold** | Global stroke width setting |
| **Sound Off / On** | Synthesized WebAudio SFX |
| **Hints Off / On** | Disables the hint button |
| **Assist Cursor Off / On** | Pulsing dashed ring + direction chevron on the best safe arrow (win screen offers "Enable Assist Cursor") |
| **New Board** | Loads a fresh board from the library |
| **Fullscreen** | One-click fullscreen (F key) |
| **Choose Board** | Grid of all 700 levels, "Now Playing" indicator, star-progress marks |
| **Win screen** | "Level Clear! You solved the board." + Enable Assist Cursor / Home / Next Level |
| **Fail screens** | "Out of hearts" (collisions) and "Time's up!" (challenge) |
| **Zoom / pan** | Pinch zoom + wheel zoom on the board |
| **Mode tip toast** | "Level N is ready." on every board load |

**Generation guarantees (tested):**
- **Always solvable** — reverse-construction invariant + exact simulation validation
- **No overlaps / out-of-bounds / wall cells** — collision-checked occupancy
- **Deterministic** — same level number → identical puzzle (daily-challenge ready)
- **~89–92% of cells filled**, minimum 80% across 400 levels
- **Difficulty grows on 3 axes**: bigger boards (9 → 100 cells, monotonic), longer arrows (avg 2.4 → 7.7), deeper dependency chains (chain-bias placement links each new arrow into the previous arrow's head ray)

**Premium exit animation (~300 ms):** press phase (head scales up) → whole path accelerates (ease-in-cubic) → motion-blur ghosts + particle trail → pop burst + shockwave ring at the exit → micro shake + haptic tick → dependents **glow & pulse** (chain reaction). Undo = animated slide-back. Sounds: whoosh, pop, error, win, hint (all synthesized WebAudio, no files).

**Also:** hints (3), undo (3), light/dark themes, PWA (offline, installable), keyboard shortcuts (H/U/R/M/T), localStorage persistence, `tools/render-preview.py` for visual verification.

## Run the tests

```bash
node test/levels.test.js        # puzzle core: solvability, no-overlap, fill, chains, determinism, perf
node test/game.smoke.test.js    # full engine: boot, tap, hearts, undo, hint, win/lose, persistence
node test/animation.test.js     # exit sequence: press → travel → pop → chain-glow → undo slide-back
node test/directions.test.js    # arrows exit in all 4 directions
```

## Next steps (per master plan)

1. Deploy the PWA (Vercel/Cloudflare Pages) + submit to web portals (Poki, CrazyGames, GameDistribution).
2. Add rewarded ads behind hints/revives and a remove-ads IAP ($3.99).
3. Wrap with Capacitor (`npx cap add android/ios`) using the local bundle + native plugins (haptics, purchases, push) — no native game code.
4. Add daily challenge (deterministic seed already in place), leagues, cloud sync.
