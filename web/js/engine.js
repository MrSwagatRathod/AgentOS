/* ============================================================================
 * Arrow Escape — Game Engine
 * ----------------------------------------------------------------------------
 * Responsibilities:
 *   - game state machine (menu / playing / won / lost)
 *   - live arrow records (on-board, sliding anims, glow, flash, shake)
 *   - animation engine: rigid-path exit slide (press → stretch → accelerate →
 *     blur → exit), undo slide-back, chain-reaction unlock pulses
 *   - particle pool (object reuse, no per-frame allocations)
 *   - input (tap hit-test against long arrow paths)
 *   - rendering loop (grid, arrows, hint, particles, screen feedback)
 * Depends on: AO.Puzzle, AO.DependencyGraph, AO.Hints, AO.Renderer, AO.Sound
 * ========================================================================== */
(function (global) {
  'use strict';

  var Puzzle = (global.AO || {}).Puzzle;
  var Renderer = (global.AO || {}).Renderer;
  var Hints = (global.AO || {}).Hints;
  var Sound = (global.AO || {}).Sound;

  var MAX_HEARTS = 5;
  var MAX_UNDO = 3;
  var HINTS_PER_LEVEL = 3;
  var HINT_COOLDOWN = 5000;
  var HINT_DURATION = 9000;
  var SLIDE_MS = 0.30;         /* exit travel 200-300 ms */
  var PRESS_MS = 0.06;         /* press/select phase */
  var UNSLIDE_MS = 0.22;       /* undo slide-back */
  var CHAIN_GLOW_MS = 0.7;     /* newly-unlocked arrows pulse */

  /* ---------- state ---------- */
  var S = {
    phase: 'menu',
    level: 1,
    size: 3,
    shape: 'rect',
    puzzle: null,
    live: [],            // live[id] = {onBoard, state, t0, fromOff, toOff, rev, glowPulse, flash, shake}
    removedCount: 0,
    total: 0,
    hearts: MAX_HEARTS,
    undoStack: [],       // {id, toOff}
    hintsLeft: HINTS_PER_LEVEL,
    hintCooldownUntil: 0,
    hintArrowId: null,
    hintUntil: 0,
    winAt: 0,
    loseAt: 0,
    now: 0
  };

  var canvas, ctx, W = 0, H = 0, dpr = 1;
  var board = { x: 0, y: 0, w: 0, h: 0, cell: 0, pad: 0 };
  var anims = [];        // sliding arrows: {id, t0, dur, from, to, rev}
  var parts = [];        // particle pool (reused objects)
  var shake = 0, flash = 0;
  var lastTs = 0;
  var demoPuzzle = null;
  var debugSlideDraws = 0;
  var RAINBOW = ['#1c3253', '#ff3b30', '#8a93a6', '#c4ccda'];

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInCubic(t) { return t * t * t; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }

  function haptic(pattern) {
    if (global.navigator && typeof global.navigator.vibrate === 'function') {
      try { global.navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
  }

  function cellCenterPx(x, y) {
    return {
      x: board.x + board.pad + (x + 0.5) * board.cell,
      y: board.y + board.pad + (y + 0.5) * board.cell
    };
  }

  /* px distance along `dir` from a point to the board edge (+ margin) */
  function edgeDist(px, py, dir) {
    if (dir === 1) return (board.x + board.w) - px;
    if (dir === 3) return px - board.x;
    if (dir === 2) return (board.y + board.h) - py;
    return py - board.y;
  }

  /* total offset the whole path must travel to fully exit the board */
  function exitOffset(arrow) {
    var max = 0;
    for (var i = 0; i < arrow.cells.length; i++) {
      var c = cellCenterPx(arrow.cells[i].x, arrow.cells[i].y);
      max = Math.max(max, edgeDist(c.x, c.y, arrow.dir));
    }
    return max + board.cell * 0.7;
  }

  /* ---------- level lifecycle ---------- */
  function buildLevel(level) {
    var puzzle = Puzzle.buildLevel(level);
    S.level = level;
    S.size = puzzle.size;
    S.shape = puzzle.shape;
    S.puzzle = puzzle;
    S.removedCount = 0;
    S.total = puzzle.arrows.length;
    S.hearts = MAX_HEARTS;
    S.undoStack = [];
    S.hintsLeft = HINTS_PER_LEVEL;
    S.hintCooldownUntil = 0;
    S.hintArrowId = null;
    S.winAt = 0;
    S.loseAt = 0;
    S.live = [];
    for (var i = 0; i < puzzle.arrows.length; i++) {
      S.live.push({ onBoard: true, state: 'idle', t0: 0, fromOff: 0, toOff: 0, rev: false, glowPulse: 0, flash: 0, shake: 0 });
    }
    layout();
    buildRenderData(puzzle);
    debugSlideDraws = 0;
  }

  /* per-arrow vector render data: base pixel points + rounded-corner path */
  function buildRenderData(puzzle) {
    for (var i = 0; i < puzzle.arrows.length; i++) {
      var a = puzzle.arrows[i];
      a.pts = [];
      for (var j = 0; j < a.cells.length; j++) {
        var c = cellCenterPx(a.cells[j].x, a.cells[j].y);
        a.pts.push({ x: c.x, y: c.y });
      }
      a.path = Renderer.buildPath(a.pts, board.cell * 0.48);
      var head = cellCenterPx(a.end.x, a.end.y);
      a.hx = head.x;
      a.hy = head.y;
    }
  }

  function startLevel(level) {
    buildLevel(level);
    S.phase = 'playing';
    Sound.play('start');
    if (global.AO.UI) { global.AO.UI.showGame(); global.AO.UI.updateHUD(S); }
  }

  function restartLevel() { startLevel(S.level); }
  function nextLevel() { startLevel(S.level + 1); }
  function goMenu() {
    S.phase = 'menu';
    if (global.AO.UI) global.AO.UI.showMenu();
  }

  /* ---------- player actions ---------- */
  /* Tap an arrow by cell coordinate (pointer events + tests). */
  function tapCell(x, y) {
    if (S.phase !== 'playing' || !S.puzzle) return;
    var id = S.puzzle.board.arrowIdAt(x, y);
    if (id == null) return; /* empty / wall — no-op */
    var live = S.live[id];
    if (live.state !== 'idle') return;
    var arrow = S.puzzle.arrows[id];

    if (S.puzzle.board.headRayClear(arrow.end.x, arrow.end.y, arrow.dir, id)) {
      doRemove(id);
    } else {
      wrongTap(live);
    }
  }

  function doRemove(id) {
    var puzzle = S.puzzle;
    var arrow = puzzle.arrows[id];
    var live = S.live[id];

    puzzle.board.vacate(arrow);
    live.onBoard = true; /* still drawn until the slide finishes */
    live.state = 'sliding';
    live.t0 = S.now;
    live.fromOff = 0;
    live.toOff = exitOffset(arrow);
    live.rev = false;
    S.removedCount++;
    S.undoStack.push({ id: id, toOff: live.toOff });
    if (S.undoStack.length > MAX_UNDO) S.undoStack.shift();

    if (S.hintArrowId === id) S.hintArrowId = null;

    anims.push({ id: id, t0: S.now, dur: SLIDE_MS, from: 0, to: live.toOff, rev: false });

    Sound.play('slide');
    haptic(8);
    if (S.removedCount >= S.total) S.winAt = S.now + SLIDE_MS + 0.30;
    if (global.AO.UI) { global.AO.UI.updateHUD(S); global.AO.UI.updateUndo(S.undoStack.length); }
  }

  function wrongTap(live) {
    live.shake = 1;
    live.flash = 1;
    flash = 1;
    shake = Math.max(shake, 0.6);
    S.hearts--;
    haptic(45);
    Sound.play('error');
    if (S.hearts <= 0) {
      S.loseAt = S.now + 0.65;
      Sound.play('lose');
    } else {
      Sound.play('heart');
    }
    if (global.AO.UI) global.AO.UI.updateHUD(S);
  }

  /* called when a slide animation finishes */
  function onSlideDone(anim) {
    var live = S.live[anim.id];
    if (!live) return;
    if (anim.rev) {
      /* undo slide-back finished — arrow is home */
      live.state = 'idle';
      return;
    }
    live.state = 'gone';
    live.onBoard = false;

    /* pop burst at the exit point */
    var a = S.puzzle.arrows[anim.id];
    var head = { x: a.hx, y: a.hy };
    spawnPop(clampExit(head.x + Puzzle.DX[a.dir] * anim.to, a.hx), clampExit(head.y + Puzzle.DY[a.dir] * anim.to, a.hy));
    Sound.play('pop');
    haptic(6);
    shake = Math.max(shake, 0.12);

    /* chain reaction: dependents (arrows blocked by this one) glow & pulse */
    var deps = S.puzzle.dependents[anim.id] || [];
    for (var i = 0; i < deps.length; i++) {
      var dLive = S.live[deps[i]];
      if (dLive && dLive.onBoard) dLive.glowPulse = S.now;
    }
  }

  function clampExit(v, center) {
    /* keep the burst near the board edge even if the head flew off-screen */
    var edge = Math.max(board.x - 20, Math.min(board.x + board.w + 20, v));
    return edge;
  }

  function undo() {
    if (S.phase !== 'playing' || !S.undoStack.length) return;
    var rec = S.undoStack.pop();
    var puzzle = S.puzzle;
    var arrow = puzzle.arrows[rec.id];
    var live = S.live[rec.id];

    puzzle.board.occupy(arrow);
    live.onBoard = true;
    live.state = 'sliding';
    live.t0 = S.now;
    live.fromOff = rec.toOff;
    live.toOff = 0;
    live.rev = true;
    live.glowPulse = 0;
    S.removedCount--;
    S.winAt = 0;
    anims.push({ id: rec.id, t0: S.now, dur: UNSLIDE_MS, from: rec.toOff, to: 0, rev: true });
    Sound.play('undo');
    if (global.AO.UI) { global.AO.UI.updateHUD(S); global.AO.UI.updateUndo(S.undoStack.length); }
  }

  function hint() {
    if (S.phase !== 'playing') return;
    if (S.hintsLeft <= 0 || S.now < S.hintCooldownUntil) return;
    var hid = Hints.findNext(S);
    if (hid == null) return;
    S.hintArrowId = hid;
    S.hintUntil = S.now + HINT_DURATION;
    S.hintsLeft--;
    S.hintCooldownUntil = S.now + HINT_COOLDOWN;
    Sound.play('hint');
    if (global.AO.UI) global.AO.UI.updateHUD(S);
  }

  /* ---------- particles (pooled) ---------- */
  function spawn(p) {
    if (parts.length >= 320) parts.shift();
    parts.push(p);
  }

  function spawnTrail(px, py, dir) {
    var back = -dir;
    spawn({
      x: px + (Math.random() - 0.5) * board.cell * 0.3,
      y: py + (Math.random() - 0.5) * board.cell * 0.3,
      vx: Puzzle.DX[back] * (30 + Math.random() * 80) + (Math.random() - 0.5) * 50,
      vy: Puzzle.DY[back] * (30 + Math.random() * 80) + (Math.random() - 0.5) * 50,
      life: 0.16 + Math.random() * 0.12,
      age: 0,
      size: board.cell * (0.08 + Math.random() * 0.09),
      color: RAINBOW[(Math.random() * RAINBOW.length) | 0],
      trail: true
    });
  }

  function spawnPop(x, y) {
    spawn({ x: x, y: y, vx: 0, vy: 0, life: 0.24, age: 0, size: board.cell * 0.9, color: 'rgba(28,50,83,0.25)', ring: true });
    for (var i = 0; i < 9; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 140;
      spawn({
        x: x + (Math.random() - 0.5) * board.cell * 0.3,
        y: y + (Math.random() - 0.5) * board.cell * 0.3,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0.24 + Math.random() * 0.2,
        age: 0,
        size: 1.6 + Math.random() * 2.6,
        color: RAINBOW[(Math.random() * RAINBOW.length) | 0]
      });
    }
  }

  function spawnConfetti(x, y, count) {
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 220;
      spawn({
        x: x, y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 60,
        life: 0.9 + Math.random() * 0.9,
        age: 0,
        size: 2 + Math.random() * 3,
        color: RAINBOW[(Math.random() * RAINBOW.length) | 0],
        grav: 220
      });
    }
  }

  /* ---------- canvas ---------- */
  function setup() {
    canvas = document.getElementById('board');
    ctx = canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onPointer);
    document.addEventListener('pointerdown', function once() {
      if (Sound.unlock) Sound.unlock();
    }, { once: true });
    lastTs = performance.now() / 1000;
    requestAnimationFrame(loop);
  }

  function resize() {
    var stage = canvas.parentElement;
    W = stage.clientWidth;
    H = stage.clientHeight;
    dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    layout();
    if (S.puzzle) buildRenderData(S.puzzle);
  }

  function layout() {
    if (!S.size) return;
    var availW = W * 0.94;
    var availH = H * 0.84;
    var cell = Math.floor(Math.min(availW, availH) / (S.size + 1.6));
    cell = Math.min(cell, 96);
    var pad = Math.round(cell * 0.7);
    board.cell = cell;
    board.pad = pad;
    board.w = S.size * cell + pad * 2;
    board.h = S.size * cell + pad * 2;
    board.x = Math.round((W - board.w) / 2);
    board.y = Math.round((H - board.h) / 2) + 6;
  }

  function onPointer(e) {
    if (S.phase !== 'playing') return;
    var rect = canvas.getBoundingClientRect();
    var px = (e.clientX - rect.left) * (W / rect.width);
    var py = (e.clientY - rect.top) * (H / rect.height);
    var x = Math.floor((px - board.x - board.pad) / board.cell);
    var y = Math.floor((py - board.y - board.pad) / board.cell);
    var id = S.puzzle.board.arrowIdAt(x, y);
    if (id != null) {
      e.preventDefault();
      tapCell(x, y);
    }
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    var t = (document.documentElement.getAttribute('data-theme')) || 'light';
    Renderer.setTheme(t);
  }

  /* ---------- drawing ---------- */
  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = Renderer.palette().grid;
    ctx.lineWidth = 1;
    for (var y = 0; y < S.size; y++) {
      for (var x = 0; x < S.size; x++) {
        if (S.puzzle.board.mask[y][x]) {
          var c = cellCenterPx(x, y);
          ctx.strokeRect(c.x - board.cell / 2 + 1, c.y - board.cell / 2 + 1, board.cell - 2, board.cell - 2);
        }
      }
    }
    ctx.restore();
  }

  function drawArrowState(id, alphaMul, offsetX, offsetY) {
    var a = S.puzzle.arrows[id];
    var live = S.live[id];
    var opts = {
      alpha: alphaMul,
      ox: offsetX,
      oy: offsetY,
      headScale: 1
    };
    if (live.glowPulse && S.now - live.glowPulse < CHAIN_GLOW_MS) {
      var gt = (S.now - live.glowPulse) / CHAIN_GLOW_MS;
      var gv = Math.sin(gt * Math.PI);
      opts.headScale = 1 + gv * 0.18;
    }
    Renderer.drawArrow(ctx, a.path, a.hx, a.hy, a.dir, board.cell, opts);
  }

  function drawSliding(anim) {
    var live = S.live[anim.id];
    var a = S.puzzle.arrows[anim.id];
    var t = clamp((S.now - anim.t0) / anim.dur, 0, 1);

    var off;
    if (anim.rev) {
      /* undo: slide back from `from` to 0, ease-out (fast start, soft landing) */
      off = anim.from * (1 - easeOutCubic(t));
    } else {
      /* press phase: small scale-up before motion */
      if (t < PRESS_MS / SLIDE_MS) {
        var p = t / (PRESS_MS / SLIDE_MS);
        var s = 1 + 0.12 * p;
        Renderer.drawArrow(ctx, a.path, a.hx, a.hy, a.dir, board.cell,
          { alpha: 1, ox: 0, oy: 0, headScale: s });
        return;
      }
      /* accelerate: ease-in-cubic */
      off = anim.to * easeInCubic(t);
    }

    var dx = Puzzle.DX[a.dir] * off;
    var dy = Puzzle.DY[a.dir] * off;
    var alpha = anim.rev ? 1 : 1 - Math.max(0, (t - 0.85)) * 6.6;

    /* motion blur ghosts (forward travel only) */
    if (!anim.rev && t > 0.05) {
      for (var g = 1; g <= 3; g++) {
        var gOff = off - g * board.cell * 0.22 * t;
        if (gOff <= 0) continue;
        Renderer.drawArrow(ctx, a.path, a.hx, a.hy, a.dir, board.cell, {
          alpha: alpha * (0.20 - g * 0.05),
          ox: dx - Puzzle.DX[a.dir] * (off - gOff),
          oy: dy - Puzzle.DY[a.dir] * (off - gOff),
          shadow: false
        });
      }
    }

    drawArrowState(anim.id, alpha, dx, dy);

    /* particle trail from every other path cell */
    if (Math.random() < 0.9) {
      var step = 2;
      for (var i = 0; i < a.pts.length; i += step) {
        if (Math.random() < 0.45) {
          spawnTrail(a.pts[i].x + dx, a.pts[i].y + dy, a.dir);
        }
      }
    }
    debugSlideDraws++;
  }

  function drawParticles() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var t = p.age / p.life;
      ctx.save();
      if (p.ring) {
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + t * 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.2 + t * 0.8), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = (p.trail ? 0.6 : 1) * (1 - t);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawHintHighlight() {
    var id = S.hintArrowId;
    if (id == null || S.now >= S.hintUntil) return;
    var live = S.live[id];
    if (!live || !live.onBoard || live.state !== 'idle') return;
    var a = S.puzzle.arrows[id];
    var pulse = 0.5 + 0.5 * Math.sin(S.now * 9);
    /* red ray cells */
    var ray = S.puzzle.board.headRayCells(a.end.x, a.end.y, a.dir, a.id);
    var rayPts = [{ x: a.hx, y: a.hy }];
    for (var i = 0; i < ray.length; i++) {
      var c = cellCenterPx(ray[i].x, ray[i].y);
      rayPts.push({ x: c.x, y: c.y });
    }
    Renderer.drawHintArrow(ctx, a, a.path, a.hx, a.hy, board.cell, rayPts, pulse);
  }

  function drawDemo() {
    if (!demoPuzzle) return;
    var savedPuzzle = S.puzzle, savedSize = S.size;
    S.puzzle = demoPuzzle;
    S.size = demoPuzzle.size;
    layout();
    if (!demoPuzzle.arrows[0] || !demoPuzzle.arrows[0].path) buildRenderData(demoPuzzle);
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (var i = 0; i < demoPuzzle.arrows.length; i++) {
      var a = demoPuzzle.arrows[i];
      Renderer.drawArrow(ctx, a.path, a.hx, a.hy, a.dir, board.cell, {});
    }
    ctx.restore();
    S.puzzle = savedPuzzle;
    S.size = savedSize;
    layout();
  }

  function loop(ts) {
    var now = ts / 1000;
    var dt = Math.min(0.05, now - (lastTs || now));
    lastTs = now;
    S.now = now;

    /* ---- update animations ---- */
    for (var i = anims.length - 1; i >= 0; i--) {
      var a = anims[i];
      if (now - a.t0 >= a.dur) {
        anims.splice(i, 1);
        onSlideDone(a);
      }
    }

    /* ---- update particles ---- */
    for (var j = parts.length - 1; j >= 0; j--) {
      var p = parts[j];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(j, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
    }

    /* ---- update cell feedback ---- */
    if (S.live) {
      for (var k = 0; k < S.live.length; k++) {
        var L = S.live[k];
        if (L.shake > 0) L.shake = Math.max(0, L.shake - dt * 4);
        if (L.flash > 0) L.flash = Math.max(0, L.flash - dt * 5);
      }
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 2.2);
    if (flash > 0) flash = Math.max(0, flash - dt * 3);

    /* ---- phase transitions ---- */
    if (S.phase === 'playing' && S.winAt && now >= S.winAt && !anims.length) {
      S.phase = 'won';
      Sound.play('win');
      haptic([10, 30, 12, 30, 60]);
      spawnConfetti(board.x + board.w / 2, board.y + board.h / 2, 60);
      if (global.AO.UI) {
        global.AO.UI.updateHUD(S);
        global.AO.UI.showWin(S.level, S.hearts);
      }
    }
    if (S.phase === 'playing' && S.loseAt && now >= S.loseAt) {
      S.phase = 'lost';
      if (global.AO.UI) global.AO.UI.showLose(S.level);
    }
    if (S.phase === 'playing' && S.hintArrowId != null && now >= S.hintUntil) {
      S.hintArrowId = null;
      if (global.AO.UI) global.AO.UI.updateHUD(S);
    }

    /* ---- draw ---- */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var shx = 0, shy = 0;
    if (shake > 0) {
      shx = (Math.random() - 0.5) * 7 * shake;
      shy = (Math.random() - 0.5) * 7 * shake;
    }
    ctx.save();
    ctx.translate(shx, shy);

    if (S.phase === 'menu') {
      drawDemo();
    } else if (S.puzzle) {
      drawGrid();
      /* idle arrows first, then sliding arrows on top */
      for (var m = 0; m < S.live.length; m++) {
        if (S.live[m].onBoard && S.live[m].state === 'idle') {
          /* subtle flash overlay for wrong taps */
          if (S.live[m].flash > 0) {
            var a2 = S.puzzle.arrows[m];
            ctx.save();
            ctx.globalAlpha = S.live[m].flash * 0.22;
            ctx.fillStyle = '#ff3b30';
            for (var c2 = 0; c2 < a2.cells.length; c2++) {
              var cc = cellCenterPx(a2.cells[c2].x, a2.cells[c2].y);
              ctx.fillRect(cc.x - board.cell / 2, cc.y - board.cell / 2, board.cell, board.cell);
            }
            ctx.restore();
          }
          drawArrowState(m, 1, 0, 0);
        }
      }
      drawHintHighlight();
      for (var n = 0; n < anims.length; n++) drawSliding(anims[n]);
    }

    drawParticles();
    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,59,48,' + (flash * 0.10).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    requestAnimationFrame(loop);
  }

  /* ---------- public API ---------- */
  global.AO = global.AO || {};
  global.AO.Engine = {
    startLevel: startLevel,
    restartLevel: restartLevel,
    nextLevel: nextLevel,
    goMenu: goMenu,
    undo: undo,
    hint: hint,
    tapCell: tapCell,
    applyTheme: applyTheme,
    setup: setup,
    isPlaying: function () { return S.phase === 'playing'; },
    getState: function () { return S; },
    debugAnims: function () { return anims; },
    debugParts: function () { return parts; },
    debugSlideDraws: function () { return debugSlideDraws; },
    debugRemovable: function () { return Hints.findRemovable(S); },
    MAX_HEARTS: MAX_HEARTS
  };

  /* decorative demo puzzle for the menu screen */
  (function initDemo() {
    var lv = Puzzle.buildLevel(1);
    demoPuzzle = lv;
  })();
})(typeof window !== 'undefined' ? window : globalThis);
