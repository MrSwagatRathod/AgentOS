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

**Gameplay (long arrows):**
- Arrows are **winding multi-cell paths** (3–4 cells early → 8–16 later) with a filled head at one end
- Tap → the **whole path rigidly slides out** along the head direction if its head ray to the board edge is clear; wrong tap costs a heart (5 per level)
- Each level is a **dependency graph**: arrow X depends on every arrow whose cells block X's head ray — the puzzle is finding removable arrows (no dead ends: removability is monotone)

**Generation guarantees (tested):**
- **Always solvable** — reverse-construction invariant + exact simulation validation
- **No overlaps / out-of-bounds / wall cells** — collision-checked occupancy
- **Deterministic** — same level number → identical puzzle (daily-challenge ready)
- **~89–92% of cells filled**, minimum 80% across 400 levels
- **Difficulty grows on 3 axes**: bigger boards (9 → 100 cells, monotonic), longer arrows (avg 2.4 → 7.7), deeper dependency chains (chain-bias placement links each new arrow into the previous arrow's head ray)
- Chain-reaction placement deliberately creates dependencies instead of leaving them to chance

**Premium exit animation (~300 ms):** press phase (head scales up) → whole path accelerates (ease-in-cubic) → motion-blur ghosts + particle trail along the entire path → pop burst + shockwave ring at the exit → micro shake + haptic tick → dependents **glow & pulse** (chain reaction). Undo = animated slide-back. Sounds: whoosh, pop, error, win, hint (all synthesized WebAudio, no files).

**Also:** hearts (5), hints (3), undo (3), level select with stars, light/dark themes, PWA (offline, installable), keyboard shortcuts (H/U/R/M/T), localStorage persistence, `tools/render-preview.py` for visual verification.

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
