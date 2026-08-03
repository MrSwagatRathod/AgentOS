/* ============================================================================
 * Arrow Escape — game engine (canvas rendering, state machine, animation loop)
 * UI style: minimalist — thin black arrows on white, red hearts, red hint paths
 *
 * Exit animation stack (premium feel, ~300 ms total per move):
 *   Tap → select (press scale 1.0→1.1, 50-60 ms) → squash & stretch launch →
 *   accelerate with ease-in-cubic → motion blur + shadow + particle trail →
 *   leave board → pop burst + micro shake + haptic → newly-unlocked arrows
 *   glow & pulse once (chain-reaction feedback).
 * Depends on: AO.Levels, AO.Sound, AO.UI (UI wired at boot in main.js)
 */
(function (global) {
  'use strict';

  var Levels = (global.AO || {}).Levels;
  var Sound = (global.AO || {}).Sound;
  var WALL = Levels.WALL;
  var EMPTY = Levels.EMPTY;

  var PALETTES = {
    light: {
      bg: '#ffffff',
      arrow: '#151515',
      arrowHint: '#ff3b30',
      cellFill: '#fbfbfb',
      cellLine: '#ececec',
      hintLine: '#ff3b30',
      danger: '#ff3b30',
      confetti: ['#151515', '#ff3b30', '#8a8a8a', '#c8c8c8'],
      shadow: 'rgba(0,0,0,0.10)',
      glow: 'rgba(255,59,48,0.30)',
      trail: 'rgba(21,21,21,0.35)'
    },
    dark: {
      bg: '#0b0b0d',
      arrow: '#f5f5f7',
      arrowHint: '#ff453a',
      cellFill: '#101013',
      cellLine: '#232327',
      hintLine: '#ff453a',
      danger: '#ff453a',
      confetti: ['#f5f5f7', '#ff453a', '#8a8a90', '#55555c'],
      shadow: 'rgba(0,0,0,0.5)',
      glow: 'rgba(255,69,58,0.35)',
      trail: 'rgba(245,245,247,0.4)'
    }
  };

  var MAX_HEARTS = 5;          /* matches the original: five red hearts */
  var MAX_UNDO = 3;
  var HINTS_PER_LEVEL = 3;
  var HINT_COOLDOWN = 5000;
  var HINT_DURATION = 9000;

  /* ---- exit animation timing (spec: total ≈250-350ms) ---- */
  var PRESS_MS = 0.055;        /* selection: 50-60 ms */
  var TRAVEL_MS = 0.24;        /* exit travel: 220-280 ms, ease-in cubic */
  var SLIDE_TOTAL = PRESS_MS + TRAVEL_MS;   /* ≈295 ms */
  var CHAIN_GLOW_MS = 0.6;     /* newly-unlocked arrows pulse for 600 ms */

  /* ---------- mutable game state ---------- */
  var S = {
    phase: 'menu',        // menu | playing | won | lost
    level: 1,
    size: 3,
    shape: 'rect',
    mask: null,           // boolean grid of playable cells
    grid: null,           // WALL | EMPTY | dir index
    solution: null,       // removal order (from generator)
    total: 0,
    removed: 0,
    hearts: MAX_HEARTS,
    undoStack: [],
    hintsLeft: HINTS_PER_LEVEL,
    hintCooldownUntil: 0,
    hintArrow: null,      // {x,y} currently highlighted
    hintUntil: 0,
    cells: null,          // render mirrors: {dir, state, t0, shake, flash, glowPulse}
    winAt: 0,
    loseAt: 0,
    now: 0
  };

  var canvas, ctx, W = 0, H = 0, dpr = 1;
  var board = { x: 0, y: 0, w: 0, h: 0, cell: 0, pad: 0 };
  var palette = PALETTES.light;
  var anims = [];       // {type:'slide', x, y, dir, fromX, fromY, toX, toY, t0, dur, oldRemovable}
  var animsByCell = {}; // "x,y" -> anim (built each frame)
  var parts = [];       // particles
  var shake = 0;        // 0..1 screen shake
  var flash = 0;        // 0..1 red flash
  var lastTs = 0;
  var demoBoard = null; // decorative board on menu

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInCubic(t) { return t * t * t; }

  function haptic(pattern) {
    if (global.navigator && typeof global.navigator.vibrate === 'function') {
      try { global.navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
    }
  }

  function cellCenter(x, y) {
    return {
      x: board.x + board.pad + (x + 0.5) * board.cell,
      y: board.y + board.pad + (y + 0.5) * board.cell
    };
  }

  function slideEnd(x, y, dir) {
    var e = board.cell * 1.15;
    var dx = Levels.DX[dir], dy = Levels.DY[dir];
    var k = 0;
    if (dx > 0) k = (board.x + board.w - x) + e;
    else if (dx < 0) k = (x - board.x) + e;
    else if (dy > 0) k = (board.y + board.h - y) + e;
    else k = (y - board.y) + e;
    return { x: x + dx * k, y: y + dy * k };
  }

  function inBoard(px, py) {
    return px >= board.x && px <= board.x + board.w && py >= board.y && py <= board.y + board.h;
  }

  function hitTest(px, py) {
    if (!inBoard(px, py)) return null;
    var cx = Math.floor((px - board.x - board.pad) / board.cell);
    var cy = Math.floor((py - board.y - board.pad) / board.cell);
    if (cx < 0 || cy < 0 || cx >= S.size || cy >= S.size) return null;
    return { x: cx, y: cy };
  }

  /* ---------- level lifecycle ---------- */
  function buildLevel(level) {
    var lv = Levels.buildLevel(level);
    S.level = level;
    S.size = lv.size;
    S.shape = lv.shape;
    S.mask = lv.mask;
    S.grid = lv.grid;
    S.solution = lv.solution;
    S.total = Levels.countArrows(S.grid);
    S.removed = 0;
    S.hearts = MAX_HEARTS;
    S.undoStack = [];
    S.hintsLeft = HINTS_PER_LEVEL;
    S.hintCooldownUntil = 0;
    S.hintArrow = null;
    S.winAt = 0;
    S.loseAt = 0;
    S.cells = [];
    for (var y = 0; y < S.size; y++) {
      var row = [];
      for (var x = 0; x < S.size; x++) {
        row.push({ dir: S.grid[y][x], state: 'idle', t0: 0, shake: 0, flash: 0, glowPulse: 0 });
      }
      S.cells.push(row);
    }
    layout();
  }

  function startLevel(level) {
    buildLevel(level);
    S.phase = 'playing';
    Sound.play('start');
    if (global.AO.UI) {
      global.AO.UI.showGame();
      global.AO.UI.updateHUD(S);
    }
  }

  function restartLevel() { startLevel(S.level); }
  function nextLevel() { startLevel(S.level + 1); }

  function goMenu() {
    S.phase = 'menu';
    if (global.AO.UI) global.AO.UI.showMenu();
  }

  function isRemovable(x, y) {
    if (S.grid[y][x] < 0) return false;
    return Levels.pathClear(S.grid, S.size, x, y, S.grid[y][x]);
  }

  /* ---------- player actions ---------- */
  function tapCell(x, y) {
    if (S.phase !== 'playing' || S.grid[y][x] < 0) return;
    var cell = S.cells[y][x];
    if (cell.state !== 'idle') return;

    if (isRemovable(x, y)) {
      var dir = S.grid[y][x];

      /* snapshot which arrows were ALREADY removable BEFORE this removal —
       * used later to detect newly-unlocked arrows for the chain-reaction glow */
      var oldRemovable = {};
      var list = Levels.removableArrows(S.grid, S.size);
      for (var i = 0; i < list.length; i++) oldRemovable[list[i].x + ',' + list[i].y] = 1;

      S.grid[y][x] = EMPTY;
      cell.state = 'sliding';
      cell.t0 = S.now;
      S.removed++;
      S.undoStack.push({ x: x, y: y, dir: dir });
      if (S.hintArrow && S.hintArrow.x === x && S.hintArrow.y === y) S.hintArrow = null;

      var c = cellCenter(x, y);
      var end = slideEnd(c.x, c.y, dir);
      anims.push({
        type: 'slide', x: x, y: y, dir: dir,
        fromX: c.x, fromY: c.y, toX: end.x, toY: end.y,
        t0: S.now, dur: SLIDE_TOTAL,
        oldRemovable: oldRemovable
      });

      Sound.play('slide');   /* soft whoosh at launch */
      haptic(8);             /* tiny tick */
      if (S.removed >= S.total) S.winAt = S.now + SLIDE_TOTAL + 0.28;
      if (global.AO.UI) { global.AO.UI.updateHUD(S); global.AO.UI.updateUndo(S.undoStack.length); }
    } else {
      /* wrong tap — lose a heart */
      cell.shake = 1;
      cell.flash = 1;
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
  }

  /* called when an arrow finishes its exit animation */
  function onSlideDone(a) {
    var cell = S.cells[a.y][a.x];
    if (cell) cell.state = 'gone';

    /* pop burst at the exit point (just outside the board) */
    spawnPop(a.toX, a.toY, a.dir);
    Sound.play('pop');
    haptic(6);
    shake = Math.max(shake, 0.12);   /* 1-2 px camera kiss */

    /* chain reaction: arrows that became removable now glow & pulse once */
    var list = Levels.removableArrows(S.grid, S.size);
    for (var i = 0; i < list.length; i++) {
      var k = list[i].x + ',' + list[i].y;
      if (!a.oldRemovable[k]) {
        S.cells[list[i].y][list[i].x].glowPulse = S.now;
      }
    }
  }

  function undo() {
    if (S.phase !== 'playing') return;
    if (!S.undoStack.length) return;
    var m = S.undoStack.pop();
    S.grid[m.y][m.x] = m.dir;
    var cell = S.cells[m.y][m.x];
    cell.state = 'idle';
    cell.t0 = 0;
    cell.glowPulse = 0;
    S.removed--;
    S.winAt = 0;
    Sound.play('undo');
    if (global.AO.UI) { global.AO.UI.updateHUD(S); global.AO.UI.updateUndo(S.undoStack.length); }
  }

  function hint() {
    if (S.phase !== 'playing') return;
    if (S.hintsLeft <= 0 || S.now < S.hintCooldownUntil) return;
    var next = Levels.nextSolutionArrow(S.grid, S.solution);
    if (!next) return;
    S.hintArrow = next;
    S.hintUntil = S.now + HINT_DURATION;
    S.hintsLeft--;
    S.hintCooldownUntil = S.now + HINT_COOLDOWN;
    Sound.play('hint');
    if (global.AO.UI) global.AO.UI.updateHUD(S);
  }

  /* ---------- particles ---------- */
  function pushParticle(p) {
    if (parts.length < 160) parts.push(p);
  }

  function spawnTrail(x, y, dir, cell) {
    var back = -dir;
    pushParticle({
      x: x + (Math.random() - 0.5) * cell * 0.3,
      y: y + (Math.random() - 0.5) * cell * 0.3,
      vx: Levels.DX[back] * (30 + Math.random() * 60) + (Math.random() - 0.5) * 40,
      vy: Levels.DY[back] * (30 + Math.random() * 60) + (Math.random() - 0.5) * 40,
      life: 0.16 + Math.random() * 0.08,   /* trail fades over 150-200 ms */
      age: 0,
      size: cell * (0.10 + Math.random() * 0.08),
      color: palette.trail,
      trail: true
    });
  }

  function spawnPop(x, y, dir) {
    var n = 6;
    var back = -dir;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = 30 + Math.random() * 110;
      pushParticle({
        x: x + (Math.random() - 0.5) * board.cell * 0.3,
        y: y + (Math.random() - 0.5) * board.cell * 0.3,
        vx: Levels.DX[back] * (40 + Math.random() * 50) + Math.cos(ang) * sp * 0.7,
        vy: Levels.DY[back] * (40 + Math.random() * 50) + Math.sin(ang) * sp * 0.7,
        life: 0.22 + Math.random() * 0.18,
        age: 0,
        size: 1.4 + Math.random() * 2.2,
        color: palette.confetti[Math.floor(Math.random() * palette.confetti.length)]
      });
    }
  }

  function spawnConfetti(x, y, count) {
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 220;
      pushParticle({
        x: x, y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 60,
        life: 0.9 + Math.random() * 0.9,
        age: 0,
        size: 2 + Math.random() * 3,
        color: palette.confetti[Math.floor(Math.random() * palette.confetti.length)],
        grav: 220
      });
    }
  }

  /* ---------- canvas setup ---------- */
  function setup() {
    canvas = document.getElementById('board');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
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
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    layout();
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
    var cell = hitTest(px, py);
    if (cell) {
      e.preventDefault();
      tapCell(cell.x, cell.y);
    }
  }

  /* ---------- palette ---------- */
  function applyTheme() {
    var theme = document.documentElement.getAttribute('data-theme') || 'light';
    palette = PALETTES[theme] || PALETTES.light;
  }

  /* ---------- drawing ---------- */
  /* Minimal arrow: rounded shaft + triangular head, pointing RIGHT before rotation.
   * scaleX/scaleY allow squash & stretch; rot is a small z-rotation (radians). */
  function drawArrowShape(cx, cy, dir, cell, color, alpha, scaleX, scaleY, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    var sx = scaleX == null ? 1 : scaleX;
    var sy = scaleY == null ? 1 : scaleY;
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.rotate((dir - 1) * Math.PI / 2 + (rot || 0));
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var u = cell;
    /* shaft */
    ctx.lineWidth = Math.max(2, u * 0.21);
    ctx.beginPath();
    ctx.moveTo(-u * 0.34, 0);
    ctx.lineTo(u * 0.05, 0);
    ctx.stroke();
    /* head */
    ctx.beginPath();
    ctx.moveTo(u * 0.36, 0);
    ctx.lineTo(-u * 0.02, -u * 0.185);
    ctx.lineTo(-u * 0.02, u * 0.185);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* soft shadow that follows the arrow */
  function drawArrowShadow(cx, cy, cell) {
    ctx.save();
    ctx.fillStyle = palette.shadow;
    ctx.beginPath();
    ctx.ellipse(cx + cell * 0.06, cy + cell * 0.10, cell * 0.20, cell * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* motion-blur ghosts trailing behind a fast-moving arrow */
  function drawBlurGhosts(a, cx, cy, dir, t, cell, color) {
    var back = -dir;
    for (var i = 1; i <= 3; i++) {
      var off = t * cell * 0.10 * i;
      var alpha = (1 - i / 3) * 0.22 * t;
      if (alpha <= 0.02) continue;
      drawArrowShape(
        cx - Levels.DX[back] * off,
        cy - Levels.DY[back] * off,
        dir, cell, color, alpha, 0.96, 0.96, 0
      );
    }
  }

  /* Red path from the hinted arrow to the exit edge */
  function drawHintPath(ax, ay) {
    var dir = S.grid[ay][ax];
    var c0 = cellCenter(ax, ay);
    var nx = ax + Levels.DX[dir], ny = ay + Levels.DY[dir];
    var lx = ax, ly = ay;
    while (lx !== nx || ly !== ny) {
      lx = nx; ly = ny;
      if (!(nx >= 0 && ny >= 0 && nx < S.size && ny < S.size)) break;
      if (S.grid[ny][nx] === WALL) break;
      if (S.grid[ny][nx] >= 0) break;
      nx += Levels.DX[dir]; ny += Levels.DY[dir];
    }
    var c1 = cellCenter(lx, ly);
    var pulse = 0.5 + 0.5 * Math.sin(S.now * 9);
    ctx.save();
    ctx.strokeStyle = palette.hintLine;
    ctx.globalAlpha = 0.30 + pulse * 0.45;
    ctx.lineWidth = Math.max(2, board.cell * 0.075);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.stroke();
    var ang = Math.atan2(c1.y - c0.y, c1.x - c0.x);
    var hs = board.cell * 0.16;
    ctx.fillStyle = palette.hintLine;
    ctx.beginPath();
    ctx.moveTo(c1.x + Math.cos(ang) * hs, c1.y + Math.sin(ang) * hs);
    ctx.lineTo(c1.x + Math.cos(ang + 2.6) * hs, c1.y + Math.sin(ang + 2.6) * hs);
    ctx.lineTo(c1.x + Math.cos(ang - 2.6) * hs, c1.y + Math.sin(ang - 2.6) * hs);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* draw a sliding arrow through its full press → launch → travel sequence */
  function drawSliding(x, y, a) {
    var u = board.cell;
    var elapsed = S.now - a.t0;
    var cx, cy, sx, sy, rot, alpha;

    if (elapsed < PRESS_MS) {
      /* 1. SELECTION: scale 1.0 → 1.1 with a hint of stretch (50-60 ms) */
      var p = elapsed / PRESS_MS;
      var s = 1 + 0.10 * p;
      cx = a.fromX; cy = a.fromY;
      sx = s * (1 + 0.05 * p);
      sy = s * (1 - 0.05 * p);
      rot = 0;
      alpha = 1;
      drawArrowShadow(cx, cy, u);
      drawArrowShape(cx, cy, a.dir, u, palette.arrow, alpha, sx, sy, rot);
      return;
    }

    /* 2-4. LAUNCH + TRAVEL: ease-in cubic acceleration */
    var t = clamp((elapsed - PRESS_MS) / TRAVEL_MS, 0, 1);
    var e = easeInCubic(t);
    cx = lerp(a.fromX, a.toX, e);
    cy = lerp(a.fromY, a.toY, e);

    /* squash & stretch: stretched along motion at launch, settles as it exits */
    var stretch = (1 - t) * 0.16;
    sx = 1 + stretch + 0.03;
    sy = 1 - stretch * 0.65;

    /* slight natural rotation (2-5°), peaking mid-flight */
    rot = Math.sin(t * Math.PI) * 0.055;

    /* fade out during the final 15% */
    alpha = 1 - Math.max(0, (t - 0.85)) * 6.6;

    drawArrowShadow(cx, cy, u);
    drawBlurGhosts(a, cx, cy, a.dir, t, u, palette.arrow);
    drawArrowShape(cx, cy, a.dir, u, palette.arrow, alpha, sx, sy, rot);
  }

  function drawCell(x, y) {
    var dir = S.grid[y][x];
    if (dir === WALL) return; /* outside the shape — draw nothing */

    var c = board.cell;
    var cx = board.x + board.pad + (x + 0.5) * c;
    var cy = board.y + board.pad + (y + 0.5) * c;
    var m = S.cells[y][x];

    /* subtle cell square */
    var s = c - Math.max(1, c * 0.03);
    ctx.fillStyle = palette.cellFill;
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.strokeStyle = palette.cellLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);

    if (m.state === 'gone' || dir === EMPTY) return;

    /* sliding arrow — full press/launch/travel sequence */
    if (m.state === 'sliding') {
      var a = animsByCell[x + ',' + y];
      if (a) drawSliding(x, y, a);
      return;
    }

    /* idle arrow */
    var hinted = S.hintArrow && S.hintArrow.x === x && S.hintArrow.y === y && S.now < S.hintUntil;
    if (hinted) drawHintPath(x, y);

    var wobble = m.shake > 0 ? Math.sin(S.now * 60) * 4 * m.shake : 0;
    var color = hinted ? palette.arrowHint : palette.arrow;
    var scale = 1;

    /* chain-reaction glow: newly-unlocked arrows pulse once */
    var gp = m.glowPulse;
    if (gp && S.now - gp < CHAIN_GLOW_MS) {
      var gt = (S.now - gp) / CHAIN_GLOW_MS;           /* 0 → 1 */
      var gv = Math.sin(gt * Math.PI);                 /* 0 → 1 → 0 */
      ctx.save();
      ctx.globalAlpha = gv * 0.30;
      ctx.fillStyle = palette.glow;
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      scale *= 1 + gv * 0.10;
    }

    if (m.flash > 0) {
      ctx.save();
      ctx.globalAlpha = m.flash * 0.22;
      ctx.fillStyle = palette.danger;
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      ctx.restore();
    }

    drawArrowShape(cx + wobble, cy, dir, c, color, 1, scale, scale, 0);
  }

  function drawBoard() {
    for (var y = 0; y < S.size; y++)
      for (var x = 0; x < S.size; x++)
        drawCell(x, y);
  }

  function drawDemo() {
    var savedSize = S.size, savedCells = S.cells, savedGrid = S.grid, savedMask = S.mask, savedShape = S.shape;
    S.size = demoBoard.size;
    S.shape = demoBoard.shape;
    S.mask = demoBoard.mask;
    S.grid = demoBoard.grid;
    layout();
    S.cells = [];
    for (var y = 0; y < S.size; y++) {
      var row = [];
      for (var x = 0; x < S.size; x++) row.push({ dir: S.grid[y][x], state: 'idle', t0: 0, shake: 0, flash: 0, glowPulse: 0 });
      S.cells.push(row);
    }
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawBoard();
    ctx.restore();
    S.size = savedSize; S.cells = savedCells; S.grid = savedGrid; S.mask = savedMask; S.shape = savedShape;
    layout();
  }

  function drawParticles() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var t = p.age / p.life;
      ctx.save();
      ctx.globalAlpha = (p.trail ? 0.6 : 1) * (1 - t);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function loop(ts) {
    var now = ts / 1000;
    var dt = Math.min(0.05, now - (lastTs || now));
    lastTs = now;
    S.now = now;

    /* --- update anims --- */
    animsByCell = {};
    for (var i = anims.length - 1; i >= 0; i--) {
      var a = anims[i];
      animsByCell[a.x + ',' + a.y] = a;
      var el = now - a.t0;
      if (el >= a.dur) {
        anims.splice(i, 1);
        delete animsByCell[a.x + ',' + a.y];
        onSlideDone(a);
        continue;
      }
      /* emit a short fading particle trail behind the moving arrow */
      if (el > PRESS_MS) {
        var t = (el - PRESS_MS) / TRAVEL_MS;
        var e = easeInCubic(clamp(t, 0, 1));
        var px = lerp(a.fromX, a.toX, e);
        var py = lerp(a.fromY, a.toY, e);
        if (Math.random() < 0.65) spawnTrail(px, py, a.dir, board.cell);
      }
    }

    /* --- update particles --- */
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

    /* --- update cells --- */
    if (S.cells) {
      for (var y = 0; y < S.size; y++)
        for (var x = 0; x < S.size; x++) {
          var cell = S.cells[y][x];
          if (cell.shake > 0) cell.shake = Math.max(0, cell.shake - dt * 4);
          if (cell.flash > 0) cell.flash = Math.max(0, cell.flash - dt * 5);
        }
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 2.2);
    if (flash > 0) flash = Math.max(0, flash - dt * 3);

    /* --- phase transitions --- */
    if (S.phase === 'playing' && S.winAt && now >= S.winAt && !anims.length) {
      S.phase = 'won';
      Sound.play('win');
      haptic([10, 30, 12, 30, 60]);
      for (var w = 0; w < 3; w++) {
        spawnConfetti(board.x + board.w / 2 + (w - 1) * board.w * 0.28, board.y + board.h / 2, 22);
      }
      if (global.AO.UI) {
        global.AO.UI.updateHUD(S);
        global.AO.UI.showWin(S.level, S.hearts);
      }
    }
    if (S.phase === 'playing' && S.loseAt && now >= S.loseAt) {
      S.phase = 'lost';
      if (global.AO.UI) global.AO.UI.showLose(S.level);
    }
    if (S.phase === 'playing' && S.hintArrow && now >= S.hintUntil) {
      S.hintArrow = null;
      if (global.AO.UI) global.AO.UI.updateHUD(S);
    }

    /* --- draw --- */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var shx = 0, shy = 0;
    if (shake > 0) {
      shx = (Math.random() - 0.5) * 7 * shake;
      shy = (Math.random() - 0.5) * 7 * shake;
    }
    ctx.save();
    ctx.translate(shx, shy);

    if (S.phase === 'menu' && demoBoard) drawDemo();
    else drawBoard();

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
  global.AO.Game = {
    startLevel: startLevel,
    restartLevel: restartLevel,
    nextLevel: nextLevel,
    goMenu: goMenu,
    undo: undo,
    hint: hint,
    tapCell: tapCell,
    applyTheme: applyTheme,
    isPlaying: function () { return S.phase === 'playing'; },
    getState: function () { return S; },
    debugAnims: function () { return anims; },
    debugParts: function () { return parts; },
    setup: setup,
    MAX_HEARTS: MAX_HEARTS
  };

  /* decorative demo board for the menu */
  (function initDemo() {
    var lv = Levels.buildLevel(1);
    demoBoard = { size: lv.size, shape: lv.shape, mask: lv.mask, grid: lv.grid };
  })();
})(typeof window !== 'undefined' ? window : globalThis);
