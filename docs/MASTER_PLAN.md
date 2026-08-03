# MASTER PLAN — Web-First Arrow Puzzle → $1B Gaming Company

**Product:** "Arrows – Puzzle Escape"-style grid logic game (a clone of the *mechanics*, built as an original product)
**Build philosophy:** ONE web codebase (HTML5/JS) → deployed as a website/PWA → *wrapped* (not rewritten) into Android & iOS apps via Capacitor. **Zero native game code.**
**Ambition:** Grow from a solo/2-person prototype to a $100M+ revenue studio worth $1B+ (like Easybrain, sold for $1.2B [3](https://www.pocketgamer.biz/miniclip-snaps-up-easybrain-from-embracer-for-12bn/)).

> **Interpretation note:** "Without creating an Android game or iOS game" is honored literally — we build the game once for the web and package the same code into store apps with a thin native shell (Capacitor). We never write Swift/Kotlin game code.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Market & Competitive Intelligence](#2-market--competitive-intelligence)
3. [The Game — Complete Deconstruction](#3-the-game--complete-deconstruction)
4. [Legal & Store-Policy Reality Check](#4-legal--store-policy-reality-check)
5. [Product Strategy & Differentiation](#5-product-strategy--differentiation)
6. [Technology Architecture (Web-First)](#6-technology-architecture-web-first)
7. [Monetization Strategy](#7-monetization-strategy)
8. [Distribution & User Acquisition](#8-distribution--user-acquisition)
9. [LiveOps & Retention Engine](#9-liveops--retention-engine)
10. [Team, Org & Budget](#10-team-org--budget)
11. [Financial Model & Path to $1B](#11-financial-model--path-to-1b)
12. [KPIs & Decision Gates](#12-kpis--decision-gates)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [90-Day Action Plan](#14-90-day-action-plan)
15. [Sources](#15-sources)

---

## 1. Executive Summary

**The game.** A minimalist logic puzzle: a grid of arrows points in four directions. Tap an arrow and it slides off the board **only if its path to the edge is clear**. Wrong tap = lost heart (3 hearts per level). Clear the board to win. Hints available. No timer. Calm, satisfying, instantly understandable. This is one of the highest-leverage casual game formats on mobile today: two near-identical titles (Lessmore GmbH's *Arrows – Puzzle Escape* and Easybrain's *Arrow Puzzle*) have together surpassed **150M+ downloads** and 2.8M reviews at 4.8★ [1](https://play.google.com/store/apps/details?id=com.ecffri.arrows) [2](https://play.google.com/store/apps/details?id=com.easybrain.arrow.puzzle.game).

**The market.** Puzzle is the biggest, stickiest casual genre: ~$21B revenue in 2024 growing toward $26B [5](https://www.amraandelma.com/puzzle-marketing-statistics); 28% of all mobile game downloads; 1.2B puzzle players; 63% of mobile gamers play puzzles weekly [5](https://www.amraandelma.com/puzzle-marketing-statistics). Block puzzle games specifically print money — Block Blast! earned **$127M in ad revenue in 5 months (2026)** and ~$600K–$1M/day total [4](https://gameworldobserver.com/2026/07/06/in-2025-mobile-game-advertising-revenue-exceeded-12-billion-analytics) [11](https://www.apptunix.com/blog/develop-a-game-like-block-blast/). Easybrain (same genre, same audience) generated **$308.6M net sales in FY2024** with **$126.5M EBIT** and was acquired by Miniclip/Tencent for **$1.2B** [3](https://www.pocketgamer.biz/miniclip-snaps-up-easybrain-from-embracer-for-12bn/).

**The strategy.** Web-first build gives us four structural advantages over native-only competitors:

1. **Speed & cost** — one codebase, one team; prototype in weeks, not months; MVP for ~$30–50K.
2. **Zero store-fee channel** — the web build sells direct (Stripe), avoiding the 15–30% Apple/Google cut and unlocking 100% margin on web revenue.
3. **Free distribution** — Poki, CrazyGames, GameDistribution, Playgama, itch.io, Facebook Instant Games reach 100M+ monthly players on rev-share (60/40–80/20 in the developer's favor) [9](https://playgama.com/blog/general/effective-strategies-for-monetizing-html5-games/).
4. **Playable-ads engine** — a web game *is* a playable ad; our own game becomes our cheapest UA creative.

**The formula to $1B** (same playbook as Easybrain): (1) ship a best-in-class puzzle hit → (2) build a repeatable game/level pipeline and UA engine → (3) turn one hit into a portfolio of 5–10 casual puzzle titles on the same codebase → (4) scale to $100M+/yr revenue → exit or IPO at 3–5× revenue. Section 11 models this in numbers.

---

## 2. Market & Competitive Intelligence

### 2.1 Genre economics (2025–2026 data)

| Metric | Value | Source |
|---|---|---|
| Global puzzle game revenue (2024) | $21B+ (projected $26B) | [5](https://www.amraandelma.com/puzzle-marketing-statistics) |
| Casual games total (2025) | $24.2B; 31B downloads | [8](https://www.linkedin.com/pulse/top-10-casual-games-2025-road-ahead-2028-alex-tai-rws1c) |
| Mobile games IAP total (2025) | ~$81.75B (+1.3% YoY; downloads −7.2%) | [7](https://app.cinevva.com/guides/casual-games-trends-2026) |
| Puzzle share of game downloads | 28% (iOS+Android) | [5](https://www.amraandelma.com/puzzle-marketing-statistics) |
| Puzzle players globally | 1.2B+; 63% of mobile gamers play weekly | [5](https://www.amraandelma.com/puzzle-marketing-statistics) |
| Avg puzzle session length | 13 min (above mobile average) | [5](https://www.amraandelma.com/puzzle-marketing-statistics) |
| Hybrid-casual puzzle (2025) | Only casual segment to grow IAP, +20% to $4.2B | [7](https://app.cinevva.com/guides/casual-games-trends-2026) |
| 2025 mobile game ad revenue | $12B+; 2.4T ad impressions | [4](https://gameworldobserver.com/2026/07/06/in-2025-mobile-game-advertising-revenue-exceeded-12-billion-analytics) |
| Top ad earners (Jan–May 2026) | Block Blast! $127M; Easybrain (publisher) $117.3M | [4](https://gameworldobserver.com/2026/07/06/in-2025-mobile-game-advertising-revenue-exceeded-12-billion-analytics) |

### 2.2 Direct competitors (the two games you linked)

| | **Arrows – Puzzle Escape** (Lessmore GmbH) | **Arrow Puzzle** (Easybrain) |
|---|---|---|
| Downloads | 100M+ | 50M+ |
| Rating / reviews | 4.8★ / 1.8M | 4.8★ / 1.0M |
| Monetization | Ads (interstitial every ~2nd level, skippable), $9.99 remove-ads IAP | Ads, IAP, daily/monthly challenges, trophies, tournaments |
| Key features | Dark mode, hints, hearts, thousands of handcrafted levels | Daily challenges, monthly trophies, tournaments/leagues, hints, no timer |
| Est. revenue class | >$500K (AppMagic estimate) | >$10K–$1M class (AppMagic); Easybrain portfolio drives $117M ad rev/5mo [4](https://gameworldobserver.com/2026/07/06/in-2025-mobile-game-advertising-revenue-exceeded-12-billion-analytics) [17](https://appmagic.rocks/publisher/easybrain/1_7473634688510685864/?hl=en) |

**Key review intel (gold dust for our design):** players love the calm, clean, no-timer design and dark mode; they *hate* ad frequency ("ad after every other level… insane") and the $9.99 remove-ads price ("ludicrous and greedy") [1](https://play.google.com/store/apps/details?id=com.ecffri.arrows). That is a direct pricing/UX playbook for us: **advertise less, price remove-ads at $2.99–$4.99, and win the reviews war.**

### 2.3 Why this is winnable

- **Mechanics are copyable** (see §4): the ruleset is not copyrightable, so the barrier is *execution*, not IP. We execute better: better difficulty curve, better juice, better pricing, better ads policy, better LiveOps.
- **The category winner is beatable on taste**: both incumbents are relatively bare-bones (the reviews prove it). A polished, fair-monetized, live-ops-rich version can take #1 in the subgenre.
- **The web channel is uncontested**: neither title has a serious web/PWA presence. We can own "arrow puzzle" on web search, web portals, and cross-promotion — a distribution moat they don't have.

---

## 3. The Game — Complete Deconstruction

### 3.1 Core rules (the spec to clone)

1. Board: N×N grid (grows from 3×3 to 10×10+), each cell holds an arrow pointing ↑ ↓ ← →.
2. Tap an arrow → it slides out of the grid along its pointing direction **if every cell in that direction to the board edge is empty**.
3. If the path is blocked → **lose one heart** (3 hearts per level); the arrow does not move. (Some versions: any wrong tap costs a heart; verify in playtesting.)
4. Remove every arrow to win the level. No timer, no moves limit.
5. Hint button highlights a currently-removable arrow.
6. Lives/hearts refresh per level (or a global lives system — competitors use per-level hearts; per-level is friendlier → we use per-level).

### 3.2 Why the loop is a hit (design theory)

- **Zero onboarding** — one tap teaches the rule; "show a wrong tap, lose a heart" is self-explanatory.
- **Dopamine architecture** — every successful escape is a micro-win; the *escape animation + haptic tick* is the reward. Juiciness is the entire game-feel surface.
- **Near-miss tension** — 1 heart left, one wrong tap from restart → emotion without a timer.
- **Spatial planning depth** — solvable levels have a strict removal order; good levels punish greedy first moves. Depth per level: 3–15 moves.
- **Session fit** — 30–90 second levels; perfect for the 13-min average puzzle session and for interstitial ad placement.

### 3.3 Feature checklist (from both apps + our upgrades)

| Feature | Competitors | Ours (V1) | Ours (V2+) |
|---|---|---|---|
| Level progression (thousands) | ✅ | 1,000 curated + procedural | Weekly drops, 10K+ |
| Hint system | ✅ (cooldown) | ✅ rewarded-optional | Smart hint (explains *why*) |
| Hearts (3/level) | ✅ | ✅ + Zen Mode (no hearts) | — |
| Dark mode | ✅ | ✅ (3 themes: light/dark/AMOLED) | Custom themes |
| Daily challenge + streak | Easybrain ✅ | ✅ | Monthly events |
| Leagues / tournaments | 2026 update ✅ | — | ✅ Weekly league |
| Undo button | ❌ | ✅ (limited: 3/level) | — |
| No-ads / IAP | ✅ ($9.99) | ✅ ($2.99–4.99) | Subscription pass |
| Progress sync / cloud | partial | ✅ (anonymous + optional account) | — |
| Shareable results | ❌ | ✅ "I beat level 500 in 14s" cards | — |
| Accessibility | ❌ | ✅ large-tap mode, reduced motion, colorblind-safe arrows | — |

### 3.4 Level design system (our unfair advantage)

- **Procedural generation + solver validation.** Generate candidate grids, run a solver to verify solvability, then classify difficulty by: solution length, branching factor, number of "trap" cells (arrows whose removal would seem legal but is premature), and minimum hearts risk.
- **Handcrafted signpost levels.** 30–50 hand-tuned levels per chapter that teach each new pattern (chains, forks, dead-ends, perimeter-first traps).
- **Deterministic daily puzzle.** Seeded generation → every player worldwide gets the same daily level (needed for leaderboards/events).
- **Difficulty calibration.** Target: 80% solve rate with hints available; D1-to-D7 pacing verified in soft launch (§12 gates).

---

## 4. Legal & Store-Policy Reality Check

### 4.1 IP: what's legal to clone

- **Game mechanics/rules are not copyrightable.** The "tap an arrow whose path is clear" ruleset, grids, and level formats are fair game — this is exactly how 100M+ download clones like Block Blast! coexist with Tetris-style forebears.
- **What you may NOT copy:** the name "Arrows" (trademark/ASO confusion), icon/art/sounds/fonts, store listing text, the exact level layouts as *creative expression* (re-implement our own generator — do not rip their levels), and anything from their marketing assets.
- **Action:** pick a distinct working title (e.g., "Arrow Out!", "Clear the Way", "Escape the Arrows"), original art direction (own palette/font/icon), and register our trademark early.

### 4.2 Store policy: the #1 existential risk for wrapped web apps

Google and Apple actively reject "thin wrapper" apps — apps that are just a website in a WebView with no real functionality. Google has **purged wrapped/WebView apps** that didn't meet quality/update standards [15](https://www.reddit.com/r/webdev/comments/1gwc79y/latest_tech_for_wrapping_a_web_app_into/). **Our compliance playbook (non-negotiable):**

1. **Bundle the web build locally** — the app must run fully offline from packaged assets; never an iframe pointing at a remote URL.
2. **Native plugins, not web hacks** — real haptics, push notifications, in-app purchases (StoreKit/Play Billing), in-app review, App Tracking Transparency prompt, share sheet.
3. **Distinct mobile UX** — full-screen game canvas, native status bar, safe-area handling, no browser chrome, no visible "website" chrome; splash screens + adaptive icons.
4. **Continuous updates** — ship new levels/events at least monthly; respond to reviews; keep rating >4.5.
5. **Own the domain/content** and comply with Play's "Webview" policy and App Store Guideline 4.2 (minimum functionality) — our game has deep, unique functionality, so we qualify if we execute the above.

### 4.3 Privacy & kids' compliance

- Rating "Everyone" → **GDPR-K/COPPA exposure**: use Google UMP consent + IAB TCF, restrict personalized ads for minors, no behavioral targeting for under-13 (use kid-safe mediation buckets).
- iOS: ATT prompt via plugin; SKAdNetwork for attribution (no IDFA).
- Privacy policy + data-safety forms (Play) and App Privacy "nutrition label" (App Store) — Easybrain shares device IDs and more [2](https://play.google.com/store/apps/details?id=com.easybrain.arrow.puzzle.game); we should be **more private** and say so in our marketing (a genuine differentiator).

---

## 5. Product Strategy & Differentiation

### 5.1 Positioning

> **"The fair, beautiful arrow puzzle."** Same instant fun as the incumbents, with half the ads, a third of the remove-ads price, dark mode done right, and a daily-challenge/league meta that keeps you coming back.

### 5.2 Core loop → meta loop

- **Core:** Tap → escape animation → (wrong tap?) → board clears → win screen (stars, time, moves).
- **Meta (V1+):** Level stars → chapter unlocks → daily challenge streaks → weekly league promotion → trophy collection → seasonal themes.

### 5.3 Release phases

| Phase | Scope | Why |
|---|---|---|
| **V1 (MVP)** | Core game, 1,000 levels, hints, hearts, dark mode, undo, PWA offline, analytics, web ads | Validate fun + KPI targets |
| **V1.5** | Daily challenge + streaks, remove-ads IAP, themes, share cards, Android wrap | Monetization + store launch |
| **V2** | iOS wrap, leagues/tournaments, subscriptions, cloud sync, events, 5K levels | Retention + ARPDAU growth |
| **V3+** | Seasonal events, cosmetics/collectibles, friend leaderboards, Zen mode, localization (12+ languages), portfolio engine | $100M+ scale path |

---

## 6. Technology Architecture (Web-First)

### 6.1 Stack recommendation

```
┌─────────────────────────────────────────────────────────┐
│  ONE codebase: TypeScript + Vite                         │
│  ├─ Game core: pure TS (grid model, solver, generator)   │  ← headless, unit-tested
│  ├─ Renderer: Phaser 3 (WebGL/Canvas) or PixiJS 8        │  ← 60fps, one code path
│  └─ UI shell: minimal DOM overlay (menus, HUD, shop)     │
├─────────────────────────────────────────────────────────┤
│  Web deploy: PWA (service worker, manifest, offline)     │
│   → our domain + web portals + web ads + Stripe D2C      │
├─────────────────────────────────────────────────────────┤
│  Capacitor 7 wrapper (thin native shell, NO native game) │
│  ├─ android/  (Android System WebView)                   │
│  └─ ios/      (WKWebView)                                │
│  Plugins: haptics, purchases (RevenueCat), push, ads,    │
│  ATT, in-app review, share, splash                       │
├─────────────────────────────────────────────────────────┤
│  Backend (Supabase/Postgres): progress sync, daily seed, │
│  leaderboards, events config, entitlements               │
│  Analytics: GA4 + PostHog; MMP: AppsFlyer (SKAN 4)       │
│  Ads: AdMob + AppLovin MAX mediation (rewarded, inter)   │
└─────────────────────────────────────────────────────────┘
```

**Why Phaser 3 (or PixiJS) + Capacitor, and not a native engine:** the user's constraint is *no native game code*. Phaser/Pixi run identically in the browser, Android WebView, and iOS WKWebView. Capacitor is the industry-standard wrapper (~70% of new cross-platform projects [14](https://moldstud.com/articles/p-best-practices-for-choosing-between-capacitor-and-cordova-a-comprehensive-guide)) and is explicitly the recommended path for PWA→store packaging [16](https://dev.to/okoye_ndidiamaka_5e3b7d30/from-pwa-to-native-app-how-to-turn-your-progressive-web-app-into-a-full-fledged-mobile-experience-200i).

### 6.2 Performance budget (mobile WebView)

- Bundle ≤ 3MB gzipped; assets inlined/sprited; code-split shop/meta.
- 60fps on mid-tier (Snapdragon 6xx-class): transform/GPU-composited animations, object pooling for particles, no layout thrash, adaptive effects (disable particle trails on low-end).
- iOS WKWebView: `WKWebView` over `UIWebView` (default), `contentInsetAdjustmentBehavior`, audio unlocked on first tap.
- Android: target WebView version, dark-mode meta theme-color, overscroll disabled, `user-scalable=no`.

### 6.3 Game core (headless & testable)

- Pure TS modules: `Board`, `Arrow`, `Solver` (validates removability + finds any win sequence), `Generator` (seeded), `Difficulty` (classifier), `LevelPack`, `SaveState`.
- Property-based tests (fast-check) for solver/generator invariants: every generated level is solvable; every "removable" check is provably correct.
- Deterministic RNG (e.g., mulberry32) so daily challenges and A/B level packs are reproducible across clients and servers.

### 6.4 Backend & data

- **Supabase (Postgres):** anonymous auth → optional email/Apple/Google; progress sync; daily-seed clock; leaderboards (weekly league buckets); remote config for level packs and ad frequency.
- **Events schema (V1):** `level_start`, `level_win`, `level_fail`, `wrong_tap`, `hint_used`, `heart_lost`, `ad_rewarded_started/completed`, `iap_purchased`, `session_start/end`, `level_retry`. Funnels: install → tutorial-complete → level 10 → level 50 → D7 → payer.
- **Anti-fraud:** server-validate rewarded-ad completion callbacks before granting hints/revives; cap hint redemption rates.

### 6.5 CI/CD & release

- GitHub Actions: lint → unit tests → build web → build Capacitor Android (Gradle) → upload to Play internal testing; iOS via Fastlane + GitHub Actions on a macOS runner (Xcode signing with Fastlane match).
- Web: Vercel/Cloudflare Pages + CDN; immutable hashed assets; instant rollback.
- Store releases from the **same tag** that produced the web build — one artifact, three surfaces (web, Play, App Store).

---

## 7. Monetization Strategy

### 7.1 Model: hybrid (ads + IAP + subscription + web D2C)

Industry benchmark: casual ARPDAU **$0.08–$0.15**; rewarded eCPM **$15–28 (US), $8–15 (EU), $1–3 (tier-3)**; rewarded opt-in rate **50–65%**; fill rate >95% via mediation [10](https://playgama.com/blog/main/10-ways-to-monetize-html5-games-that-actually-work-in-2026/). Block Blast! proves pure-ads can hit $600K–1M/day at scale [11](https://www.apptunix.com/blog/develop-a-game-like-block-blast/) [13](https://www.capermint.com/blog/develop-a-game-like-block-blast/) — but we add IAP to hedge ad-eCPM volatility and lift ARPDAU [7](https://app.cinevva.com/guides/casual-games-trends-2026).

### 7.2 Ad placements (respectful = our differentiator)

| Placement | Frequency | Notes |
|---|---|---|
| Rewarded: hint | Tap-to-opt-in | Also: +1 heart revive, daily-challenge retry, theme unlock, coin doubler |
| Interstitial | After level win, **every 3rd level**; max 6/day; 60s+ cooldown | Competitor does every-2nd and gets called "insane" [1](https://play.google.com/store/apps/details?id=com.ecffri.arrows) → we do fewer |
| Banner | Menu screen only (not gameplay) | Lowest eCPM, highest annoyance ratio → optional, off for payers |
| Playable/end-card | n/a in-game | Our own ads *elsewhere* are our cheapest UA |

### 7.3 IAP & subscription

| SKU | Price | Rationale |
|---|---|---|
| Remove Ads (lifetime) | **$3.99** (web $2.99) | Competitor charges $9.99 and is mocked for it → undercut 60% |
| Unlimited Hints pack | $1.99 | Cheap entry SKU, high conversion |
| Gold Pass (monthly) | $2.99/mo | No ads + daily rewards + exclusive themes + early levels |
| Starter pack (coins/themes) | $0.99–$1.99 | Low-friction first purchase |
| Coins (for hints/revives) | $0.99 / $4.99 / $9.99 | Rechargeable currency for whales |

### 7.4 Web direct-to-consumer (the 30% fee killer)

- On **web/PWA**: full D2C store via Stripe — lifetime pro $6.99, subscription $2.99/mo with 3–5% processing vs 15–30% store fees [10](https://playgama.com/blog/main/10-ways-to-monetize-html5-games-that-actually-work-in-2026/). Web revenue is ~100% margin.
- **Apple rule:** digital unlockables inside the iOS app *must* use Apple IAP (no D2C links in-app) — so the iOS app uses IAP; the D2C channel lives on web/marketing emails ("get Pro 30% cheaper on the web").
- Cross-sell: web players who hit level 50 get an in-game web offer; store players get web-only bonuses.

### 7.5 Web portal distribution (extra revenue stream)

Poki, CrazyGames, GameDistribution, Playgama, LINE, Facebook Instant Games: 40M–650M monthly players, rev-share 60/40–80/20 in developer's favor [9](https://playgama.com/blog/general/effective-strategies-for-monetizing-html5-games/). Ship the same build with their SDK shims (our ad layer abstracts the provider). This is free revenue + free brand reach + cheap live focus-group for level difficulty.

---

## 8. Distribution & User Acquisition

### 8.1 Channels & sequencing

| Channel | When | Share of installs (target, yr 1) | Notes |
|---|---|---|---|
| Google Play (wrapped) | Month 4+ | 40% | Main volume; ASO on "arrow puzzle", "logic puzzle" |
| App Store (wrapped) | Month 6+ | 20% | Higher ARPDAU; review-gate: must be excellent |
| Web (PWA + portals) | Month 2+ | 25% | Zero store fees; SEO "arrow puzzle game"; portals |
| Paid UA (Meta/UAC/TikTok) | Month 5+ | 15% → grows | Playable-ads creative (see 8.3) |

### 8.2 ASO (store listing)

- Title/keywords: pick a name that ranks for "arrow puzzle" **without** infringing (e.g., "Arrow Out! – Logic Puzzle"). Keyword field, short description, screenshots (7), video trailer (15–30s), A/B icon tests (Google Play experiments).
- Localize listing for top-10 revenue countries: US, DE, GB, FR, JP, BR, IN, KR, TR, MX.

### 8.3 Creative strategy (the money-maker)

- **Playable ads:** 15–20s interactive "tap the arrow, don't lose a heart" — the game *is* the ad. Conversion is naturally high because comprehension is instant.
- **TikTok/Reels/Shorts organic:** "oddly satisfying" 15s clips of boards clearing in slow-mo with haptics sound design; "only 3% can solve level 347" hooks; zero-budget test → scale winners with paid.
- **Screenshot-style static ads** for Meta (cheap, A/B on hook).
- **Influencer:** micro-creators in the "calming games" niche (cozy gaming) — very low CPM, high affinity with our 25–44 demo [5](https://www.amraandelma.com/puzzle-marketing-statistics).

### 8.4 UA benchmarks & guardrails

- Puzzle CPI tier-1: **$1.5–3.0**; blended target CAC < $0.80 at scale via organic+web mix.
- Decision gates: LTV:CAC ≥ 2.5 by day 90 before scaling spend; kill creative below 2× install-rate median within 2 weeks.
- MMP + SKAdNetwork 4 for iOS; Google Play Install attribution on Android; web attribution via PostHog/UTM — **single north-star dashboard** for all three surfaces.
- Cross-promo engine (year 2+): our portfolio's own traffic becomes the cheapest UA — exactly what Easybrain/Minipclip scale with [3](https://www.pocketgamer.biz/miniclip-snaps-up-easybrain-from-embracer-for-12bn/).

---

## 9. LiveOps & Retention Engine

Retention benchmarks: puzzle D30 retention ~18% (above industry) [5](https://www.amraandelma.com/puzzle-marketing-statistics); daily-challenge features lift retention ~40% [5](https://www.amraandelma.com/puzzle-marketing-statistics); hybrid-casual meta lifts LTV ~21% [8](https://www.linkedin.com/pulse/top-10-casual-games-2025-road-ahead-2028-alex-tai-rws1c).

### 9.1 LiveOps calendar (from V1.5)

- **Daily:** deterministic daily puzzle, streak counter, first-win reward.
- **Weekly:** league/tournament bracket (promote/relegate, trophy + coins rewards) — both incumbents added leagues in 2026, confirming demand [1](https://play.google.com/store/apps/details?id=com.ecffri.arrows) [2](https://play.google.com/store/apps/details?id=com.easybrain.arrow.puzzle.game).
- **Monthly:** themed event (e.g., "Mirror March": mirrored boards), trophy collection album, season pass window.
- **Continuous:** level-pack drops (50–100/week), balance tuning via analytics, A/B tests (ad frequency, pricing, hint costs).
- **Push:** 2–3/week max, personalized ("Your 7-day streak is safe — solve today's puzzle").
- **Social:** shareable level cards, "challenge a friend" deep links, screenshot-worthy win screens.

### 9.2 Retention mechanics checklist

Undo (limited), Zen Mode (no hearts, no fail), hint pedagogy (explains why an arrow is safe), difficulty floor/ceiling caps, "almost won" mercy system (never force-fail a 1-arrow board), streak protection (1 free streak-repair per week), cloud sync (multi-device).

---

## 10. Team, Org & Budget

### 10.1 Phased team plan

| Phase | Team | Monthly burn |
|---|---|---|
| **MVP (mo 1–3)** | 1–2 devs (TS/Phaser), freelance artist/sound | $10–20K |
| **Soft launch (mo 4–6)** | +1 monetization/data, +0.5 designer, part-time UA | $30–45K |
| **Global launch (mo 7–12)** | 6–8: dev ×3, art, backend, UA ×2, data/liveops | $60–90K |
| **Scale (yr 2)** | 12–18: add ASO, community, QA, more UA | $150–250K |
| **Portfolio era (yr 3+)** | 30–60 (Easybrain ran ~250 for $308M rev [3](https://www.pocketgamer.biz/miniclip-snaps-up-easybrain-from-embracer-for-12bn/)) | $500K–1M |

### 10.2 Budget & funding path

- **Pre-seed:** $50–150K (own funds/angels) — get through soft launch with KPIs.
- **Seed:** $1–3M at 100K+ DAU & LTV:CAC ≥ 2.5 — scale UA + iOS + team.
- **Series A:** $8–15M at 1M+ DAU — portfolio expansion (2nd/3rd titles), global UA.
- **Series B / profitability:** $30–50M or cash-flow fund at $50M+ revenue.
- **Exit corridor (yr 4–6):** trade sale at 3–5× revenue (Easybrain precedent: $308M rev → $1.2B [3](https://www.pocketgamer.biz/miniclip-snaps-up-easybrain-from-embracer-for-12bn/)) or IPO if cash-flow positive at scale.

---

## 11. Financial Model & Path to $1B

Full numbers in [`FINANCIAL_MODEL.csv`](./FINANCIAL_MODEL.csv). Assumptions are deliberately conservative vs. the genre (Block Blast! hits $0.10+ ARPDAU at 40M+ DAU [11](https://www.apptunix.com/blog/develop-a-game-like-block-blast/); casual ARPDAU benchmark $0.08–0.15 [10](https://playgama.com/blog/main/10-ways-to-monetize-html5-games-that-actually-work-in-2026/)).

### 11.1 Base case (5-year)

| Year | Cumulative installs | Avg DAU | ARPDAU | Revenue | UA spend | Ops | EBITDA | Est. valuation (4× rev) |
|---|---|---|---|---|---|---|---|---|
| 1 | 8M | 180K | $0.05 | $3.3M | $2.4M | $1.2M | −$0.3M | — |
| 2 | 30M | 650K | $0.065 | $15.4M | $6.0M | $3.5M | $5.9M | $62M |
| 3 | 90M | 1.8M | $0.08 | $52.6M | $18M | $10M | $24.6M | $210M |
| 4 | 220M | 4.0M | $0.09 | $131M | $38M | $22M | $71M | $524M |
| 5 | 450M | 7.5M | $0.10 | $274M | $70M | $40M | $164M | **$1.1B** |

*(Valuation at 4× revenue mirrors Easybrain's actual $1.2B / $308M ≈ 3.9× [3](https://www.pocketgamer.biz/miniclip-snaps-up-easybrain-from-embracer-for-12bn/). Revenue mix assumed ~65% ads / 25% IAP / 10% web D2C, converging to 55/30/15 as the portfolio matures.)*

### 11.2 Sensitivity

- **Conservative** (slower install growth, ARPDAU $0.04→$0.09): Year-5 revenue ~$131M → valuation ~$530M (still a nine-figure outcome).
- **Base:** Year-5 revenue ~$274M → valuation ~$1.1B (the plan's target).
- **Aggressive** (Block Blast-style ARPDAU $0.12 at 18M DAU, 2nd title launched): Year-5 revenue ~$788M → valuation ~$3.2B.
- **Key sensitivities:** D30 retention (±1pt ≈ ±8% LTV), ARPDAU (±$0.01 ≈ ±$27M/yr at 7.5M DAU), CPI (±$0.3 ≈ ±$15M/yr UA at 50M installs/yr).

### 11.3 Unit economics (targets)

- Blended CPI: $0.80 → LTV (D90): $2.20+ → **LTV:CAC 2.75**
- Payer conversion: 2.5–4% (puzzle norm [5](https://www.amraandelma.com/puzzle-marketing-statistics)); ARPPU: $8–14/yr
- Payback: < 60 days on blended; ROAS D30 ≥ 60%, D90 ≥ 100% before scaling a cohort

---

## 12. KPIs & Decision Gates

| Metric | Soft-launch gate (mo 4–6) | Scale gate (mo 12) | Studio gate (yr 2) |
|---|---|---|---|
| D1 retention | ≥ 40% | ≥ 45% | ≥ 45% |
| D7 retention | ≥ 15% | ≥ 18% | ≥ 20% |
| D30 retention | ≥ 8% | ≥ 10% | ≥ 12% |
| ARPDAU | ≥ $0.05 | ≥ $0.08 | ≥ $0.10 |
| LTV:CAC (D90) | ≥ 2.0 | ≥ 2.5 | ≥ 3.0 |
| Ad opt-in rate | ≥ 50% | ≥ 55% | ≥ 60% |
| Crash-free sessions | ≥ 99% | ≥ 99.5% | ≥ 99.5% |
| Store rating | 4.6+ | 4.7+ | 4.7+ |
| Avg session | 8–15 min | 10–15 min | 10+ min |
| Paying player share | 1.5%+ | 2.5%+ | 3%+ |

**Kill / pivot rules:** if D1 < 35% or D7 < 12% after 5 weeks of soft launch, iterate on difficulty curve + onboarding before spending more UA. If ARPDAU < $0.03, rework ad cadence/IAP mix. If store policy rejection hits the wrapper (unlikely if §4.2 executed), pivot to PWA-first marketing while fixing compliance.

---

## 13. Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Store rejection of "webview wrapper"** | High | §4.2 playbook: local bundle, native plugins, real functionality, frequent updates; test with 20-tester closed test early [15](https://www.reddit.com/r/webdev/comments/1gwc79y/latest_tech_for_wrapping_a_web_app_into/) |
| 2 | **Incumbents (Easybrain/Lessmore) respond** | Medium | They're big and slow on this subgenre; we win on price, ads policy, web presence, speed |
| 3 | **Ad-eCPM volatility / ad-market pressure** | Medium | Hybrid IAP+subscription+D2C mix; mediation (AdMob + AppLovin MAX + others) [13](https://www.capermint.com/blog/develop-a-game-like-block-blast/) |
| 4 | **UA costs rise (SKAN, privacy)** | Medium | Playable-ads organic engine, web SEO, cross-promo portfolio, low-CPI tier-2/3 markets |
| 5 | **Retention plateau after level exhaustion** | Medium | Procedural generator + daily/weekly/monthly LiveOps + Zen mode |
| 6 | **IP/trademark disputes** | Low | Own name/art/code; never reuse their assets or level layouts |
| 7 | **Kids'/privacy regulation** | Medium | UMP/TCF consent, no personalized ads for minors, data-minimal architecture (competitive advantage) |
| 8 | **Apple 30% / policy on D2C** | Low | D2C lives on web; in-app purchases use Apple IAP; clear marketing messaging |
| 9 | **Single-game dependence** | Medium | Portfolio engine from year 2: same codebase → Sudoku/Nonogram/Blockudoku-style titles (Easybrain's exact playbook [3](https://www.pocketgamer.biz/miniclip-snaps-up-easybrain-from-embracer-for-12bn/)) |

---

## 14. 90-Day Action Plan

**Weeks 1–2 — Deconstruction & core**
- Play 50+ levels of both competitors; write a rules spec + level-pattern catalog.
- Build headless game core (TS): Board, Solver, Generator, Difficulty classifier. Unit tests green.
- Pick name/domain; check trademark; draft icon direction (do not copy theirs).

**Weeks 3–4 — Playable prototype**
- Renderer (Phaser/Pixi) with core loop: tap → slide animation → win/lose, 3 hearts, hints, undo.
- Juice pass: easing, particles, sound, haptics (web vibration + Capacitor later).
- Generate 500 validated levels; manual difficulty pass on 50.

**Weeks 5–6 — Web product**
- PWA (manifest, offline, installable), dark mode, menu/HUD, progress save (localStorage → Supabase later).
- Analytics events + funnels; web ad shim (abstracted provider).
- Ship to itch.io; apply to CrazyGames, Poki, GameDistribution, Playgama [9](https://playgama.com/blog/general/effective-strategies-for-monetizing-html5-games/).

**Weeks 7–8 — Android wrap (soft launch)**
- Capacitor init + Android; haptics, purchases (RevenueCat), AdMob/MAX, in-app review, splash/icon.
- Google Play closed test (20 testers) → internal → production (3–4 low-CPI markets: IN, BR, PH).
- Set up Firebase/GA4 + PostHog; AppsFlyer + SKAN config.

**Weeks 9–10 — KPI iteration**
- Daily challenge + streaks; remove-ads IAP ($3.99); interstitial cadence A/B (every 2nd vs 3rd level).
- Optimize D1/D7: onboarding polish, difficulty curve tuning, mercy system.

**Weeks 11–12 — Global launch + iOS**
- Global Google Play release; ASO complete (title, screenshots, video, localized listing top-10 markets).
- iOS: Xcode build via Fastlane, TestFlight, App Review submission (expect a 4.2 review — be ready with the compliance story).
- Start paid UA at $1–2K/day on best playable creative; launch TikTok organic channel.
- Stand up web store (Stripe) D2C offers.

**Month 4–6 — Scale**
- Weekly level drops; monthly event #1; weekly league; push notifications.
- UA scale to $10–20K/day gated on LTV:CAC ≥ 2.5; expand to EU/US.
- Begin title #2 (same engine) when hit #1 hits 500K+ DAU.

---

## 15. Sources

1. Google Play — *Arrows – Puzzle Escape* (Lessmore GmbH): mechanics, features, reviews, 100M+ downloads. https://play.google.com/store/apps/details?id=com.ecffri.arrows
2. Google Play — *Arrow Puzzle* (Easybrain): mechanics, daily challenges, tournaments, 50M+ downloads. https://play.google.com/store/apps/details?id=com.easybrain.arrow.puzzle.game
3. PocketGamer.biz — *Miniclip purchases Easybrain from Embracer for $1.2bn* (revenue $308.6M, EBIT $126.5M, UA = 45% of sales, 1.5B downloads, 16M DAU). https://www.pocketgamer.biz/miniclip-snaps-up-easybrain-from-embracer-for-12bn/
4. Game World Observer — *2025 mobile game ad revenue $12B; Block Blast! $127M and Easybrain $117.3M ad revenue Jan–May 2026.* https://gameworldobserver.com/2026/07/06/in-2025-mobile-game-advertising-revenue-exceeded-12-billion-analytics
5. Amra & Elma — *Top 20 Puzzle Marketing Statistics 2025* ($21B market, 28% of downloads, 1.2B players, 18% D30, daily-challenge +40% retention). https://www.amraandelma.com/puzzle-marketing-statistics
6. Mobidictum — *AppMagic casual games report 2025* (Puzzle $8.2B, only top genre to grow, +7.6% YoY). https://mobidictum.com/appmagic-casual-games-report-2025-summary/
7. Cinevva — *Casual Games Trends in 2026* (IAP $81.75B, downloads −7.2%, hybrid-casual +20% to $4.2B). https://app.cinevva.com/guides/casual-games-trends-2026
8. LinkedIn (Alex Tai) — *Top 10 Casual Games of 2025* ($24.2B casual, hybrid-casual +430% puzzle growth, meta LTV +21%). https://www.linkedin.com/pulse/top-10-casual-games-2025-road-ahead-2028-alex-tai-rws1c
9. Playgama — *Monetizing HTML5 Games* (portal rev-share table: Poki, CrazyGames, GameDistribution, Playgama, LINE). https://playgama.com/blog/general/effective-strategies-for-monetizing-html5-games/
10. Playgama — *10 Ways to Monetize HTML5 Games That Actually Work in 2026* (ARPDAU/eCPM/opt-in benchmarks; D2C 3–5% fees). https://playgama.com/blog/main/10-ways-to-monetize-html5-games-that-actually-work-in-2026/
11. Apptunix — *Build a Puzzle Game Like Block Blast* (200M downloads, 40M DAU, $600K–$1M/day ads). https://www.apptunix.com/blog/develop-a-game-like-block-blast/
12. Digital Turbine — *Hungry Studio case study* (+8% ARPDAU, #1 puzzle US). https://www.digitalturbine.com/case-studies/hungry-studio-hit-8-arpdau-in-one-month-with-dt-exchange
13. Capermint — *Develop a Game Like Block Blast* (ad-only monetization analysis, mediation stack). https://www.capermint.com/blog/develop-a-game-like-block-blast/
14. MoldStud — *Capacitor vs Cordova* (70% of new cross-platform projects use Capacitor). https://moldstud.com/articles/p-best-practices-for-choosing-between-capacitor-and-cordova-a-comprehensive-guide
15. Reddit r/webdev — *Latest tech for wrapping a Web App into iOS/Android* (store purge of WebView wrappers, 20-tester quota). https://www.reddit.com/r/webdev/comments/1gwc79y/latest_tech_for_wrapping_a_web_app_into/
16. DEV Community — *From PWA to Native App* (Capacitor 5-step workflow). https://dev.to/okoye_ndidiamaka_5e3b7d30/from-pwa-to-native-app-how-to-turn-your-progressive-web-app-into-a-full-fledged-mobile-experience-200i
17. AppMagic — *Easybrain performance overview* (portfolio, downloads, revenue classes). https://appmagic.rocks/publisher/easybrain/1_7473634688510685864/?hl=en
