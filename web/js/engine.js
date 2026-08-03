/* ============================================================================
 * Arrow Escape — Game Engine (ArrowsGo-style product layer)
 * ----------------------------------------------------------------------------
 * Responsibilities:
 *   - game state machine (playing / won / lost)
 *   - three modes: main route (levels 1..700 in order), random play (fresh
 *     board from the library), challenge (25 boards, 5-minute timer)
 *   - live arrow records + rigid-path exit animation (press → accelerate →
 *     blur → exit), undo slide-back, chain-reaction unlock pulses
 *   - pooled particles, camera shake, input (tap + pinch zoom + wheel zoom)
 *   - assist cursor (highlights the best safe arrow when enabled)
 * Depends on: AO.Puzzle, AO.DependencyGraph, AO.Hints, AO.Renderer, AO.Sound,
 * AO.Difficulty
 * ========================================================================== */
(function (global) {
  'use strict';

  var Puzzle = (global.AO || {}).Puzzle;
  var Renderer = (global.AO || {}).Renderer;
  var Hints = (global.AO || {}).Hints;
  var Sound = (global.AO || {}).Sound;
  var Difficulty = (global.AO || {}).Difficulty;

  var MAX_HEARTS = 3;          /* ArrowsGo: 3 / 3 */
  var MAX_UNDO = 3;
  var HINTS_PER_LEVEL = 3;
  var HINT_COOLDOWN = 5000;
  var HINT_DURATION = 9000;
  var SLIDE_MS = 0.30;
  var PRESS_MS = 0.06;
  var UNSLIDE_MS = 0.22;
  var CHAIN_GLOW_MS = 0.7;
  var TIME_LIMIT = 300;        /* 5:00 */
  var LEVEL_COUNT = 700;
  var CHALLENGE_COUNT = 25;
  var RAINBOW = ['#1c3253', '#ff3b30', '#8a93a6', '#c4ccda'];

  /* ---------- state ---------- */
  var S = {
    phase: 'menu',             // menu | playing | won | lost
    mode: 'main',              // main | random | challenge
    level: 1,
    size: 3,
    shape: 'rect',
    puzzle: null,
    live: [],
    removedCount: 0,
    total: 0,
    hearts: MAX_HEARTS,
    undoStack: [],
    hintsLeft: HINTS_PER_LEVEL,
    hintCooldownUntil: 0,
    hintArrowId: null,
    hintUntil: 0,
    hintsEnabled: true,
    assistCursor: false,
    timerLeft: TIME_LIMIT,
    timerEnabled: false,
    loseReason: 'hearts',      // hearts | time
    winAt: 0,
    loseAt: 0,
    now: 0,
    zoom: 1,
    panX: 0,
    panY: 0
  };

  var canvas, ctx, W = 0, H = 0, dpr = 1;
  var board = { x: 0, y: 0, w: 0, h: 0, cell: 0, pad: 0 };
  var anims = [];
  var parts = [];
  var shake = 0, flash = 0;
  var lastTs = 0;
  var demoPuzzle = null;
  var debugSlideDraws = 0;
  var pointers = {};           // active pointer map for pinch/zoom
  var pinchDist = 0;
  var wheelScale = 1;

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

  /* screen coords → board coords (inverse of zoom/pan) */
  function toBoardCoords(px, py) {
    return { x: (px - S.panX) / S.zoom, y: (py - S.panY) / S.zoom };
  }

  function cellCenterPx(x, y) {
    return {
      x: board.x + board.pad + (x + 0.5) * board.cell,
      y: board.y + board.pad + (y + 0.5) * board.cell
    };
  }

  function edgeDist(px, py, dir) {
    if (dir === 1) return (board.x + board.w) - px;
    if (dir === 3) return px - board.x;
    if (dir === 2) return (board.y + board.h) - py;
    return py - board.y;
  }

  function exitOffset(arrow) {
    var max = 0;
    for (var i = 0; i < arrow.cells.length; i++) {
      var c = cellCenterPx(arrow.cells[i].x, arrow.cells[i].y);
      max = Math.max(max, edgeDist(c.x, c.y, arrow.dir));
    }
    return max + board.cell * 0.7;
  }

  /* ---------- level lifecycle ---------- */
  function paramsFor(level, mode) {
    return mode === 'challenge'
      ? Difficulty.challengeParams(level)
      : Difficulty.levelParams(level);
  }

  function buildLevel(level, mode) {
    var params = paramsFor(level, mode || 'main');
    var puzzle = Puzzle.buildLevel(level, params);
    S.mode = mode || 'main';
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
    S.loseReason = 'hearts';
    S.timerLeft = TIME_LIMIT;
    S.timerEnabled = (S.mode === 'challenge');
    S.live = [];
    for (var i = 0; i < puzzle.arrows.length; i++) {
      S.live.push({ onBoard: true, state: 'idle', t0: 0, fromOff: 0, toOff: 0, rev: false, glowPulse: 0, flash: 0, shake: 0 });
    }
    layout();
    buildRenderData(puzzle);
    debugSlideDraws = 0;
    if (global.AO.UI) global.AO.UI.updateHUD(S);
  }

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

  function startLevel(level, mode) {
    buildLevel(level, mode);
    S.phase = 'playing';
    Sound.play('start');
    if (global.AO.UI) {
      global.AO.UI.showGame();
      global.AO.UI.updateHUD(S);
      global.AO.UI.toast('Level ' + level + ' is ready.');
    }
  }

  function restartLevel() { startLevel(S.level, S.mode); }

  function nextLevel() {
    if (S.mode === 'random') {
      startLevel(randomLevel(), 'random');
    } else if (S.mode === 'challenge') {
      startLevel((S.level % CHALLENGE_COUNT) + 1, 'challenge');
    } else {
      startLevel(Math.min(LEVEL_COUNT, S.level + 1), 'main');
    }
  }

  function randomLevel() {
    return 1 + Math.floor(Math.random() * LEVEL_COUNT);
  }

  function newBoard() {
    startLevel(randomLevel(), S.mode === 'main' ? 'main' : S.mode);
  }

  function switchMode(mode) {
    if (mode === 'main') startLevel(1, 'main');
    else if (mode === 'random') startLevel(randomLevel(), 'random');
    else startLevel(1, 'challenge');
  }

  function goMenu() { switchMode('main'); }

  /* ---------- player actions ---------- */
  function tapCell(x, y) {
    if (S.phase !== 'playing' || !S.puzzle) return;
    var id = S.puzzle.board.arrowIdAt(x, y);
    if (id == null) return;
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
    live.onBoard = true;
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
    if (global.AO.UI) global.AO.UI.updateHUD(S);
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
      S.loseReason = 'hearts';
      Sound.play('lose');
    } else {
      Sound.play('heart');
    }
    if (global.AO.UI) global.AO.UI.updateHUD(S);
  }

  function onSlideDone(anim) {
    var live = S.live[anim.id];
    if (!live) return;
    if (anim.rev) { live.state = 'idle'; return; }
    live.state = 'gone';
    live.onBoard = false;

    var a = S.puzzle.arrows[anim.id];
    spawnPop(clampEdge(a.hx + Puzzle.DX[a.dir] * anim.to), clampEdge(a.hy + Puzzle.DY[a.dir] * anim.to));
    Sound.play('pop');
    haptic(6);
    shake = Math.max(shake, 0.12);

    var deps = S.puzzle.dependents[anim.id] || [];
    for (var i = 0; i < deps.length; i++) {
      var dLive = S.live[deps[i]];
      if (dLive && dLive.onBoard) dLive.glowPulse = S.now;
    }
  }

  function clampEdge(v) {
    return Math.max(board.x - 20, Math.min(board.x + board.w + 20, v));
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
    if (global.AO.UI) global.AO.UI.updateHUD(S);
  }

  function hint() {
    if (S.phase !== 'playing') return;
    if (!S.hintsEnabled) return;
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

  function setHintsEnabled(on) {
    S.hintsEnabled = on;
    if (!on) S.hintArrowId = null;
  }

  function setAssistCursor(on) { S.assistCursor = on; }

  /* ---------- particles ---------- */
  function spawn(p) { if (parts.length >= 320) parts.shift(); parts.push(p); }

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
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
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
    var availW = W * 0.92;
    var availH = H * 0.78;
    var cell = Math.floor(Math.min(availW, availH) / (S.size + 1.6));
    cell = Math.min(cell, 96);
    var pad = Math.round(cell * 0.7);
    board.cell = cell;
    board.pad = pad;
    board.w = S.size * cell + pad * 2;
    board.h = S.size * cell + pad * 2;
    board.x = Math.round((W - board.w) / 2);
    board.y = Math.round((H - board.h) / 2) + 8;
  }

  /* ---------- input: tap / pinch-zoom / wheel-zoom ---------- */
  function onPointerDown(e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, moved: 0 };
    if (Object.keys(pointers).length === 2) {
      var ids = Object.keys(pointers);
      pinchDist = Math.hypot(pointers[ids[0]].x - pointers[ids[1]].x,
        pointers[ids[0]].y - pointers[ids[1]].y);
    }
  }

  function onPointerMove(e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.moved += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX; p.y = e.clientY;

    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
      var dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (pinchDist > 0) {
        var scale = dist / pinchDist;
        setZoom(S.zoom * scale, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      }
      pinchDist = dist;
    }
  }

  function onPointerUp(e) {
    var p = pointers[e.pointerId];
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinchDist = 0;
    /* tap if the pointer barely moved */
    if (p && p.moved < 10 && S.phase === 'playing') {
      var rect = canvas.getBoundingClientRect();
      var sx = (e.clientX - rect.left) * (W / rect.width);
      var sy = (e.clientY - rect.top) * (H / rect.height);
      var bc = toBoardCoords(sx, sy);
      var x = Math.floor((bc.x - board.x - board.pad) / board.cell);
      var y = Math.floor((bc.y - board.y - board.pad) / board.cell);
      var id = S.puzzle.board.arrowIdAt(x, y);
      if (id != null) tapCell(x, y);
    }
  }

  function onWheel(e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var sx = (e.clientX - rect.left) * (W / rect.width);
    var sy = (e.clientY - rect.top) * (H / rect.height);
    var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom(S.zoom * factor, sx, sy);
  }

  function setZoom(z, cx, cy) {
    var nz = clamp(z, 0.4, 3);
    if (nz === S.zoom) return;
    /* zoom around screen point (cx, cy) */
    var k = nz / S.zoom;
    S.panX = cx - (cx - S.panX) * k;
    S.panY = cy - (cy - S.panY) * k;
    S.zoom = nz;
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
    var opts = { alpha: alphaMul, ox: offsetX, oy: offsetY, headScale: 1, color: Renderer.arrowColor(id) };
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
    var off, dx, dy, alpha;

    if (anim.rev) {
      off = anim.from * (1 - easeOutCubic(t));
      dx = Puzzle.DX[a.dir] * off;
      dy = Puzzle.DY[a.dir] * off;
      alpha = 1;
    } else {
      if (t < PRESS_MS / SLIDE_MS) {
        var p = t / (PRESS_MS / SLIDE_MS);
        Renderer.drawArrow(ctx, a.path, a.hx, a.hy, a.dir, board.cell,
          { alpha: 1, ox: 0, oy: 0, headScale: 1 + 0.12 * p });
        return;
      }
      off = anim.to * easeInCubic(t);
      dx = Puzzle.DX[a.dir] * off;
      dy = Puzzle.DY[a.dir] * off;
      alpha = 1 - Math.max(0, (t - 0.85)) * 6.6;
      /* motion blur ghosts */
      if (t > 0.05) {
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
    }

    drawArrowState(anim.id, alpha, dx, dy);

    if (!anim.rev && Math.random() < 0.9) {
      var step = 2;
      for (var i = 0; i < a.pts.length; i += step) {
        if (Math.random() < 0.45) spawnTrail(a.pts[i].x + dx, a.pts[i].y + dy, a.dir);
      }
    }
    debugSlideDraws++;
  }

  function drawAssistCursor() {
    if (!S.assistCursor || S.phase !== 'playing') return;
    var id = Hints.findNext(S);
    if (id == null) return;
    var a = S.puzzle.arrows[id];
    var pulse = 0.5 + 0.5 * Math.sin(S.now * 6);
    var c = cellCenterPx(a.end.x, a.end.y);
    ctx.save();
    ctx.globalAlpha = 0.45 + pulse * 0.35;
    ctx.strokeStyle = Renderer.palette().hint;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([board.cell * 0.18, board.cell * 0.14]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, board.cell * (0.55 + pulse * 0.1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    /* little direction chevron inside */
    var dir = a.dir, off = board.cell * 0.3;
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = Renderer.palette().hint;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c.x - Puzzle.DX[dir] * off * 0.4, c.y - Puzzle.DY[dir] * off * 0.4);
    ctx.lineTo(c.x + Puzzle.DX[dir] * off, c.y + Puzzle.DY[dir] * off);
    ctx.stroke();
    ctx.restore();
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

    /* timer (challenge mode) */
    if (S.phase === 'playing' && S.timerEnabled) {
      S.timerLeft = Math.max(0, S.timerLeft - dt);
      if (S.timerLeft <= 0) {
        S.phase = 'lost';
        S.loseReason = 'time';
        Sound.play('lose');
        if (global.AO.UI) global.AO.UI.showLose(S);
      }
    }

    /* animations */
    for (var i = anims.length - 1; i >= 0; i--) {
      var a = anims[i];
      if (now - a.t0 >= a.dur) {
        anims.splice(i, 1);
        onSlideDone(a);
      }
    }

    /* particles */
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

    /* live feedback decay */
    if (S.live) {
      for (var k = 0; k < S.live.length; k++) {
        var L = S.live[k];
        if (L.shake > 0) L.shake = Math.max(0, L.shake - dt * 4);
        if (L.flash > 0) L.flash = Math.max(0, L.flash - dt * 5);
      }
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 2.2);
    if (flash > 0) flash = Math.max(0, flash - dt * 3);

    /* phase transitions */
    if (S.phase === 'playing' && S.winAt && now >= S.winAt && !anims.length) {
      S.phase = 'won';
      Sound.play('win');
      haptic([10, 30, 12, 30, 60]);
      spawnConfetti(board.x + board.w / 2, board.y + board.h / 2, 60);
      if (global.AO.UI) {
        global.AO.UI.updateHUD(S);
        global.AO.UI.showWin(S);
      }
    }
    if (S.phase === 'playing' && S.loseAt && now >= S.loseAt) {
      S.phase = 'lost';
      if (global.AO.UI) global.AO.UI.showLose(S);
    }
    if (S.phase === 'playing' && S.hintArrowId != null && now >= S.hintUntil) {
      S.hintArrowId = null;
      if (global.AO.UI) global.AO.UI.updateHUD(S);
    }

    /* draw */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = Renderer.palette().bg;
    ctx.fillRect(0, 0, W, H);

    var shx = 0, shy = 0;
    if (shake > 0) {
      shx = (Math.random() - 0.5) * 7 * shake;
      shy = (Math.random() - 0.5) * 7 * shake;
    }

    ctx.save();
    ctx.translate(S.panX + shx, S.panY + shy);
    ctx.scale(S.zoom, S.zoom);

    if (S.phase === 'menu' && demoPuzzle) {
      drawDemo();
    } else if (S.puzzle) {
      drawGrid();
      for (var m = 0; m < S.live.length; m++) {
        if (S.live[m].onBoard && S.live[m].state === 'idle') {
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
      drawAssistCursor();
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
    switchMode: switchMode,
    newBoard: newBoard,
    undo: undo,
    hint: hint,
    setHintsEnabled: setHintsEnabled,
    setAssistCursor: setAssistCursor,
    tapCell: tapCell,
    applyTheme: applyTheme,
    setup: setup,
    isPlaying: function () { return S.phase === 'playing'; },
    getState: function () { return S; },
    debugAnims: function () { return anims; },
    debugParts: function () { return parts; },
    debugSlideDraws: function () { return debugSlideDraws; },
    debugRemovable: function () { return Hints.findRemovable(S); },
    MAX_HEARTS: MAX_HEARTS,
    LEVEL_COUNT: LEVEL_COUNT,
    CHALLENGE_COUNT: CHALLENGE_COUNT
  };

  (function initDemo() {
    demoPuzzle = Puzzle.buildLevel(1);
  })();
})(typeof window !== 'undefined' ? window : globalThis);
