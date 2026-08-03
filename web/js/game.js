/* ============================================================================
 * Arrow Escape — game engine (canvas rendering, state machine, animation loop)
 * UI style: minimalist — thin black arrows on white, red hearts, red hint paths
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
      trail: 'rgba(21,21,21,0.18)'
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
      trail: 'rgba(245,245,247,0.2)'
    }
  };

  var MAX_HEARTS = 5;          /* matches the original: five red hearts */
  var MAX_UNDO = 3;
  var HINTS_PER_LEVEL = 3;
  var HINT_COOLDOWN = 5000;
  var HINT_DURATION = 9000;
  var SLIDE_DUR = 0.26;
  var WRONG_DUR = 0.22;

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
    cells: null,          // render mirrors: {dir, state, t0, shake, flash}
    winAt: 0,
    loseAt: 0,
    now: 0
  };

  var canvas, ctx, W = 0, H = 0, dpr = 1;
  var board = { x: 0, y: 0, w: 0, h: 0, cell: 0, pad: 0 };
  var palette = PALETTES.light;
  var anims = [];       // {type:'slide', cell, from, to, dir, t0, dur}
  var parts = [];       // particles
  var shake = 0;        // 0..1 screen shake
  var flash = 0;        // 0..1 red flash
  var lastTs = 0;
  var demoBoard = null; // decorative board on menu

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInCubic(t) { return t * t * t; }

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
        row.push({ dir: S.grid[y][x], state: 'idle', t0: 0, shake: 0, flash: 0 });
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
      S.grid[y][x] = EMPTY;
      cell.state = 'sliding';
      cell.t0 = S.now;
      S.removed++;
      S.undoStack.push({ x: x, y: y, dir: dir });
      if (S.hintArrow && S.hintArrow.x === x && S.hintArrow.y === y) S.hintArrow = null;

      var c = cellCenter(x, y);
      var end = slideEnd(c.x, c.y, dir);
      anims.push({ type: 'slide', x: x, y: y, fromX: c.x, fromY: c.y, toX: end.x, toY: end.y, dir: dir, t0: S.now, dur: SLIDE_DUR });

      Sound.play('slide');
      spawnTrail(c.x, c.y, dir, board.cell);
      spawnParts(c.x, c.y, dir);

      if (S.removed >= S.total) S.winAt = S.now + SLIDE_DUR + 0.28;
      if (global.AO.UI) { global.AO.UI.updateHUD(S); global.AO.UI.updateUndo(S.undoStack.length); }
    } else {
      /* wrong tap — lose a heart */
      cell.shake = 1;
      cell.flash = 1;
      flash = 1;
      shake = Math.max(shake, 0.5);
      S.hearts--;
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

  function undo() {
    if (S.phase !== 'playing') return;
    if (!S.undoStack.length) return;
    var m = S.undoStack.pop();
    S.grid[m.y][m.x] = m.dir;
    var cell = S.cells[m.y][m.x];
    cell.state = 'idle';
    cell.t0 = 0;
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
  function spawnParts(x, y, dir) {
    var n = 10;
    var back = -dir; /* particles drift opposite to slide direction */
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 110;
      parts.push({
        x: x + (Math.random() - 0.5) * board.cell * 0.4,
        y: y + (Math.random() - 0.5) * board.cell * 0.4,
        vx: Levels.DX[back] * (50 + Math.random() * 70) + Math.cos(ang) * sp * 0.6,
        vy: Levels.DY[back] * (50 + Math.random() * 70) + Math.sin(ang) * sp * 0.6,
        life: 0.3 + Math.random() * 0.25,
        age: 0,
        size: 1.6 + Math.random() * 2.4,
        color: palette.confetti[Math.floor(Math.random() * palette.confetti.length)]
      });
    }
  }

  function spawnConfetti(x, y, count) {
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 220;
      parts.push({
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

  function spawnTrail(x, y, dir, cell) {
    var c = palette.trail;
    for (var i = 0; i < 4; i++) {
      parts.push({
        x: x + Levels.DX[dir] * cell * 0.25 * i,
        y: y + Levels.DY[dir] * cell * 0.25 * i,
        vx: Levels.DX[dir] * 30, vy: Levels.DY[dir] * 30,
        life: 0.22, age: 0, size: cell * 0.28, color: c, trail: true
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
  /* Minimal arrow: rounded shaft + triangular head, pointing RIGHT before rotation */
  function drawArrowShape(cx, cy, dir, cell, color, alpha, scale) {
    ctx.save();
    ctx.translate(cx, cy);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    ctx.rotate((dir - 1) * Math.PI / 2);
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
    /* small arrowhead at the exit end */
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

    /* sliding arrow */
    if (m.state === 'sliding') {
      var t = clamp((S.now - m.t0) / SLIDE_DUR, 0, 1);
      var e = easeInCubic(t);
      var px = lerp(m.fromX, m.toX, e);
      var py = lerp(m.fromY, m.toY, e);
      drawArrowShape(px, py, m.dir, c, palette.arrow, 1 - t * t);
      return;
    }

    /* hint: red path first, then red arrow */
    var hinted = S.hintArrow && S.hintArrow.x === x && S.hintArrow.y === y && S.now < S.hintUntil;
    if (hinted) drawHintPath(x, y);

    var wobble = m.shake > 0 ? Math.sin(S.now * 60) * 4 * m.shake : 0;
    var color = hinted ? palette.arrowHint : palette.arrow;
    var scale = hinted ? 1 + 0.06 * (0.5 + 0.5 * Math.sin(S.now * 9)) : 1;

    if (m.flash > 0) {
      ctx.save();
      ctx.globalAlpha = m.flash * 0.22;
      ctx.fillStyle = palette.danger;
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      ctx.restore();
    }

    drawArrowShape(cx + wobble, cy, dir, c, color, 1, scale);
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
      for (var x = 0; x < S.size; x++) row.push({ dir: S.grid[y][x], state: 'idle', t0: 0, shake: 0, flash: 0 });
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
      ctx.globalAlpha = (p.trail ? 0.5 : 1) * (1 - t);
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

    /* update anims/particles/cells */
    for (var i = anims.length - 1; i >= 0; i--) {
      var a = anims[i];
      if (now - a.t0 >= a.dur) {
        var c = S.cells[a.y][a.x];
        if (c) c.state = 'gone';
        anims.splice(i, 1);
      }
    }
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

    /* phase transitions */
    if (S.phase === 'playing' && S.winAt && now >= S.winAt && !anims.length) {
      S.phase = 'won';
      Sound.play('win');
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

    /* draw */
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
    setup: setup,
    MAX_HEARTS: MAX_HEARTS
  };

  /* decorative demo board for the menu */
  (function initDemo() {
    var lv = Levels.buildLevel(1);
    demoBoard = { size: lv.size, shape: lv.shape, mask: lv.mask, grid: lv.grid };
  })();
})(typeof window !== 'undefined' ? window : globalThis);
