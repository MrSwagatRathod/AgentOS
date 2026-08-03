# Arrow Escape — Web Game (MVP)

A complete, self-contained HTML5 implementation of the *Arrows – Puzzle Escape* mechanics, built web-first (one codebase → web / PWA → wrapped apps later via Capacitor, per `../docs/MASTER_PLAN.md`).

**Zero build step, zero dependencies, works from `file://` or any static server.**

## Play it

```bash
cd web
python3 -m http.server 8000     # then open http://localhost:8000
```

Or just open `index.html` directly in a browser.

## What's implemented

- ✅ **Minimalist UI matching "Arrows – Puzzle Escape" (Lessmore)**: thin black arrows on white, 5 red hearts, "Level N" indicator, red-highlighted hint paths, light + dark themes
- ✅ **Shaped boards like the original**: rectangular early, then circular (11+), diamond (19+), heart (31+), knight (46+), cross (61+)
- ✅ Procedural level generator (reverse-construction, **guaranteed solvable**) + difficulty curve (3×3 → 10×10, 1000s of levels)
- ✅ Core rules: tap an arrow → it slides out if its path to the edge is clear; blocked tap = lose a heart (5/level)
- ✅ Hearts, hints (highlight safe arrow + its red path), undo (3/level), restart, next level
- ✅ Win/lose flows, level select with progress + stars
- ✅ **Premium exit animation stack** (~300 ms per move): tap-scale 1.0→1.1 (55 ms select) → squash & stretch launch → ease-in-cubic acceleration (240 ms) → motion-blur ghosts + soft shadow + fading particle trail → pop burst on exit → micro camera shake + haptic tick → newly-unlocked arrows **glow & pulse once** (chain-reaction feedback)
- ✅ Haptics (navigator.vibrate): tick on remove, strong buzz on wrong tap, pattern on win
- ✅ Sounds: soft "whoosh" on launch, "pop" on exit, error/heart-loss/win/undo/hint (all synthesized)
- ✅ Canvas rendering with juice: slide animations, particles, screen shake, red flash, win confetti
- ✅ Synthesized WebAudio sounds (no audio files), mute toggle
- ✅ Touch + mouse + keyboard (H hint · U undo · R restart · M sound · T theme)
- ✅ Progress persisted in localStorage; deterministic levels (same level number = same board — future daily-challenge ready)
- ✅ PWA: manifest + service worker (offline installable), generated 192/512 PNG icons (white bg, black arrow, red heart)
- ✅ `tools/render-preview.py` — renders UI mockups of any level for visual verification

## Code layout

| File | Purpose |
|---|---|
| `index.html` | Shell, HUD, screens/modals (inline SVG icons) |
| `css/style.css` | Design system: dark/light themes, cards, buttons, level grid |
| `js/levels.js` | **Pure** generator + solver (no DOM — Node-testable) |
| `js/audio.js` | WebAudio synth SFX |
| `js/game.js` | Canvas engine: state machine, rendering, animations, input |
| `js/ui.js` | DOM screens, modals, HUD, theme/sound toggles |
| `js/main.js` | Boot, localStorage store, keyboard shortcuts, SW registration |
| `sw.js`, `manifest.webmanifest`, `favicon.svg`, `assets/` | PWA + icons |
| `tools/gen-icon.js` | Pure-Node PNG icon generator (zlib + manual PNG encoding) |
| `test/levels.test.js` | Solvability/determinism/perf tests for the generator |
| `test/game.smoke.test.js` | Full game smoke test (mocked DOM/canvas): tap/heart/undo/hint/win/lose/persistence |

## Run the tests

```bash
node test/levels.test.js      # generator correctness: 600 levels exact-solved, determinism, perf
node test/game.smoke.test.js  # boots the real game in a mock DOM and plays through it
```

## Next steps (per master plan)

1. Deploy the PWA (Vercel/Cloudflare Pages) + submit to web portals (Poki, CrazyGames, GameDistribution).
2. Add rewarded ads behind hints/revives and a remove-ads IAP ($3.99).
3. Wrap with Capacitor (`npx cap add android/ios`) using the local bundle + native plugins (haptics, purchases, push) — no native game code.
4. Add daily challenge (deterministic seed already in place), leagues, cloud sync.
