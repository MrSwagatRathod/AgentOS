/* ============================================================================
 * Arrow Escape — Level generator & solver (pure JS, no DOM — unit-testable in Node)
 * ============================================================================
 * Construction guarantees every generated board is solvable:
 *   - We place arrows on an EMPTY board, and each newly placed arrow must have a
 *     clear path to the exit edge through the arrows already placed.
 *   - Reversing the placement order yields a valid removal sequence.
 *
 * Board cells:  -2 = wall / outside the playable shape
 *               -1 = empty (inside the shape)
 *                0..3 = arrow direction (up, right, down, left)
 *
 * Shaped boards (circle, diamond, heart, cross, knight) appear as levels grow —
 * matching the original game's non-rectangular layouts.
 */
(function (global) {
  'use strict';

  var UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
  var DIRS = ['up', 'right', 'down', 'left'];
  var DX = [0, 1, 0, -1];
  var DY = [-1, 0, 1, 0];
  var WALL = -2;
  var EMPTY = -1;

  /* Deterministic PRNG (mulberry32) — same level number => same board everywhere */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function emptyGrid(size) {
    var g = [];
    for (var y = 0; y < size; y++) {
      var row = [];
      for (var x = 0; x < size; x++) row.push(EMPTY);
      g.push(row);
    }
    return g;
  }

  function inBounds(size, x, y) { return x >= 0 && y >= 0 && x < size && y < size; }

  function countArrows(grid) {
    var n = 0;
    for (var y = 0; y < grid.length; y++)
      for (var x = 0; x < grid.length; x++)
        if (grid[y][x] >= 0) n++;
    return n;
  }

  function copyGrid(grid, size) {
    var g = emptyGrid(size);
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        g[y][x] = grid[y][x];
    return g;
  }

  /* Can an arrow in (x,y) pointing dir d exit the board, given current grid?
   * Walls (-2) mark the shape's boundary — reaching one means the arrow exits. */
  function pathClear(grid, size, x, y, d) {
    var nx = x + DX[d], ny = y + DY[d];
    while (inBounds(size, nx, ny)) {
      var v = grid[ny][nx];
      if (v === WALL) return true;   /* outside the shape = exit edge */
      if (v >= 0) return false;      /* another arrow blocks the path */
      nx += DX[d]; ny += DY[d];
    }
    return true;                     /* reached the grid edge */
  }

  /* All arrows that may be removed right now */
  function removableArrows(grid, size) {
    var list = [];
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        if (grid[y][x] >= 0 && pathClear(grid, size, x, y, grid[y][x]))
          list.push({ x: x, y: y, dir: grid[y][x] });
    return list;
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* Greedy solver (used for difficulty hints + tests) */
  function solveGreedy(grid0, size, seed) {
    var rng = mulberry32(seed || 1);
    var grid = copyGrid(grid0, size);
    var seq = [], guard = 0;
    while (countArrows(grid) > 0 && guard++ < 2000) {
      var list = removableArrows(grid, size);
      if (!list.length) return null;
      var pick = list[Math.floor(rng() * list.length)];
      grid[pick.y][pick.x] = EMPTY;
      seq.push({ x: pick.x, y: pick.y });
    }
    return countArrows(grid) === 0 ? seq : null;
  }

  /* Exact solver with memo + node budget (used by tests to double-check) */
  function solveAny(grid0, size, budget) {
    var grid = copyGrid(grid0, size);
    var visited = {};
    var nodes = 0;
    var limit = budget || 300000;
    function key() {
      var s = '';
      for (var y = 0; y < size; y++) { for (var x = 0; x < size; x++) s += grid[y][x] + ','; s += '|'; }
      return s;
    }
    function dfs() {
      if (++nodes > limit) return null;
      if (countArrows(grid) === 0) return [];
      var k = key();
      if (visited[k]) return null;
      visited[k] = 1;
      var list = removableArrows(grid, size);
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        grid[a.y][a.x] = EMPTY;
        var res = dfs();
        grid[a.y][a.x] = a.dir;
        if (res) return [{ x: a.x, y: a.y, dir: a.dir }].concat(res);
      }
      return null;
    }
    return dfs();
  }

  /* Validate a claimed removal sequence against the board */
  function validateSolution(grid0, size, seq) {
    var grid = copyGrid(grid0, size);
    for (var i = 0; i < seq.length; i++) {
      var a = seq[i];
      if (!inBounds(size, a.x, a.y)) return { ok: false, step: i, reason: 'out of bounds' };
      if (grid[a.y][a.x] < 0) return { ok: false, step: i, reason: 'cell empty or wall' };
      if (!pathClear(grid, size, a.x, a.y, grid[a.y][a.x]))
        return { ok: false, step: i, reason: 'path blocked' };
      grid[a.y][a.x] = EMPTY;
    }
    return { ok: countArrows(grid) === 0, step: i, reason: countArrows(grid) === 0 ? '' : 'arrows remain' };
  }

  /* ---------- board shapes ---------- */
  /* shape -> boolean mask (true = playable cell) */

  function maskRect(size) {
    var m = [];
    for (var y = 0; y < size; y++) { var r = []; for (var x = 0; x < size; x++) r.push(true); m.push(r); }
    return m;
  }

  function maskCircle(size) {
    var m = maskRect(size);
    var cx = (size - 1) / 2, cy = (size - 1) / 2;
    var r = size / 2 - 0.35;
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        m[y][x] = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) <= r * r;
    return m;
  }

  function maskDiamond(size) {
    var m = maskRect(size);
    var cx = (size - 1) / 2, cy = (size - 1) / 2;
    var r = Math.floor(size / 2) + 0.2;
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        m[y][x] = (Math.abs(x - cx) + Math.abs(y - cy)) <= r;
    return m;
  }

  function maskHeart(size) {
    var m = maskRect(size);
    var cx = (size - 1) / 2, cy = (size - 1) / 2;
    var R = size * 0.42;
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++) {
        var u = (x - cx) / R, v = (cy - y) / R;   /* v up-positive */
        var val = Math.pow(u * u + v * v - 1, 3) - u * u * v * v * v;
        m[y][x] = val <= 0.12;
      }
    return m;
  }

  function maskCross(size) {
    var m = maskRect(size);
    var cx = (size - 1) / 2, cy = (size - 1) / 2;
    var t = Math.floor(size * 0.28);
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        m[y][x] = (Math.abs(x - cx) <= t) || (Math.abs(y - cy) <= t);
    return m;
  }

  /* hand-coded 9x9 knight staircase (the classic "knight move" board shape) */
  var KNIGHT_9 = [
    [0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 1, 1]
  ];

  function maskKnight(size) {
    var m = maskRect(size);
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++) {
        var sy = Math.min(8, Math.floor(y * 9 / size));
        var sx = Math.min(8, Math.floor(x * 9 / size));
        m[y][x] = !!KNIGHT_9[sy][sx];
      }
    return m;
  }

  function makeMask(size, shape) {
    switch (shape) {
      case 'circle': return maskCircle(size);
      case 'diamond': return maskDiamond(size);
      case 'heart': return maskHeart(size);
      case 'cross': return maskCross(size);
      case 'knight': return maskKnight(size);
      default: return maskRect(size);
    }
  }

  function playableCount(mask) {
    var n = 0;
    for (var y = 0; y < mask.length; y++)
      for (var x = 0; x < mask.length; x++)
        if (mask[y][x]) n++;
    return n;
  }

  /* ---------- sweep orders ---------- */
  /* Order playable cells so that, when arrows are placed in this order, every
   * cell always has at least one direction whose ray is clear of already-placed
   * arrows — which guarantees very high fill (up to 100%) while keeping the
   * board solvable (reverse placement = valid removal order).
   *   row/col/diag families → arrows flow to one pair of edges (removal sweeps)
   *   ringIn  (center outward) → arrows point outward (removal: edge → center)
   *   ringOut (edge inward)    → arrows point inward  (removal: center → edge)
   */
  function orderCells(cells, size, mode) {
    var cx = (size - 1) / 2, cy = (size - 1) / 2;
    function ringKey(c) {
      var r = Math.max(Math.abs(c.x - cx), Math.abs(c.y - cy));
      return r * 4096 + (c.x * 17 + c.y * 13); /* within-ring tie-break */
    }
    var key;
    switch (mode) {
      case 'row':     key = function (c) { return c.y * size + c.x; }; break;
      case 'rowRev':  key = function (c) { return (size - 1 - c.y) * size + (size - 1 - c.x); }; break;
      case 'col':     key = function (c) { return c.x * size + c.y; }; break;
      case 'colRev':  key = function (c) { return (size - 1 - c.x) * size + (size - 1 - c.y); }; break;
      case 'diag':    key = function (c) { return (c.x + c.y) * size + c.x; }; break;
      case 'diagRev': key = function (c) { return (2 * size - 2 - c.x - c.y) * size + (size - 1 - c.x); }; break;
      case 'ringIn':  key = ringKey; break;
      case 'ringOut': key = function (c) { return -ringKey(c); }; break;
      default:        key = function (c) { return c.y * size + c.x; };
    }
    return cells.slice().sort(function (a, b) { return key(a) - key(b); });
  }

  /* ---------- generator ---------- */
  /* Reverse-construction generator with sweep orders. Always solvable:
   *   - pick exactly `density` (e.g. 0.90) of the playable cells to fill,
   *   - place arrows in a sweep order; each arrow points in a direction whose
   *     ray is clear of already-placed arrows,
   *   - reversing the placement order yields a valid removal sequence.
   * Complexity: `maxStartRatio` bounds how many arrows are removable at the
   * START (ratio = startRemovable / total); on exceed, re-roll with a fresh
   * seed and the next sweep mode (bounded retries). */
  function generate(size, density, seed, shape, opts) {
    opts = opts || {};
    var tries = opts._tries || 0;
    var modes = opts.modes || ['row'];
    var modeIdx = opts._modeIdx || 0;
    var mode = modes[modeIdx % modes.length];
    var rng = mulberry32(seed);
    var mask = makeMask(size, shape || 'rect');
    var grid = emptyGrid(size);
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        if (!mask[y][x]) grid[y][x] = WALL;

    var playable = [];
    for (var yy = 0; yy < size; yy++)
      for (var xx = 0; xx < size; xx++)
        if (mask[yy][xx]) playable.push({ x: xx, y: yy });

    var target = Math.round(playable.length * density);
    var minArrows = Math.min(target, Math.max(3, Math.floor(playable.length * 0.4)));

    /* which cells to fill (exactly `target`), then the sweep placement order */
    var chosen = shuffle(playable.slice(), rng).slice(0, target);
    var order = orderCells(chosen, size, mode);

    var placement = []; /* {x,y,dir} in placement order (= reverse removal order) */
    for (var i = 0; i < order.length; i++) {
      var cell = order[i];
      var valid = [];
      for (var d = 0; d < 4; d++)
        if (pathClear(grid, size, cell.x, cell.y, d)) valid.push(d);
      if (!valid.length) continue; /* rare with sweep orders — cell stays empty */
      var dir = valid[Math.floor(rng() * valid.length)];
      grid[cell.y][cell.x] = dir;
      placement.push({ x: cell.x, y: cell.y, dir: dir });
    }

    var retry = function () {
      return generate(size, density, (seed * 2654435761 + 97) >>> 0, shape, {
        _tries: tries + 1,
        _modeIdx: modeIdx + 1,
        modes: modes,
        maxStartRatio: opts.maxStartRatio,
        maxTries: opts.maxTries
      });
    };

    if (placement.length < minArrows) return retry();

    var board = {
      size: size,
      shape: shape || 'rect',
      mask: mask,
      grid: grid,
      solution: placement.slice().reverse() /* valid removal order */
    };

    /* complexity filter: too many instantly-removable arrows = trivial level */
    if (opts.maxStartRatio != null && tries < (opts.maxTries || 10)) {
      var ratio = removableArrows(grid, size).length / placement.length;
      if (ratio > opts.maxStartRatio) return retry();
    }

    return board;
  }

  /* Difficulty curve by level number.
   * - Board sizes/shapes ordered so PLAYABLE CELLS GROW every level:
   *   3x3(9) → 4x4(16) → 5x5(25) → 6x6(36) → circle8(44) → heart8(52) →
   *   cross9(65) → rect9(81) → rect10(100)
   * - density = 0.90: 90% of every board's cells are filled with arrows.
   * - Sweep modes rotate for variety; later bands include the harder inward
   *   (ringOut) construction. maxStartRatio shrinks over time => fewer obvious
   *   first moves => deeper dependency chains. */
  function levelParams(level) {
    var easy = ['row', 'rowRev', 'col', 'colRev', 'diag', 'diagRev'];
    var hard = ['rowRev', 'colRev', 'diagRev', 'ringIn', 'ringOut', 'ringOut'];
    if (level < 3)   return { size: 3, shape: 'rect', density: 0.88, maxStartRatio: 0.55, modes: easy };
    if (level < 6)   return { size: 4, shape: 'rect', density: 0.90, maxStartRatio: 0.48, modes: easy };
    if (level < 11)  return { size: 5, shape: 'rect', density: 0.90, maxStartRatio: 0.40, modes: easy };
    if (level < 19)  return { size: 6, shape: 'rect', density: 0.90, maxStartRatio: 0.34, modes: easy };
    if (level < 31)  return { size: 8, shape: 'circle', density: 0.90, maxStartRatio: 0.32, modes: easy };
    if (level < 46)  return { size: 8, shape: 'heart', density: 0.90, maxStartRatio: 0.30, modes: easy };
    if (level < 61)  return { size: 9, shape: 'cross', density: 0.90, maxStartRatio: 0.28, modes: hard };
    if (level < 81)  return { size: 9, shape: 'rect', density: 0.90, maxStartRatio: 0.26, modes: hard };
    if (level < 101) return { size: 10, shape: 'rect', density: 0.90, maxStartRatio: 0.24, modes: hard };
    return { size: 10, shape: 'rect', density: 0.90, maxStartRatio: 0.22, modes: hard };
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function buildLevel(level) {
    var p = levelParams(level);
    var seed = (level * 2654435761) ^ (p.size * 48271) ^ hashStr(p.shape) ^ Math.round(p.density * 1000);
    var mode = p.modes[(level - 1) % p.modes.length];
    return generate(p.size, p.density, seed >>> 0, p.shape,
      { sweepMode: mode, modes: p.modes, maxStartRatio: p.maxStartRatio, maxTries: 10 });
  }

  /* Next arrow to remove per the known solution (used by the hint system) */
  function nextSolutionArrow(grid, solution) {
    for (var i = 0; i < solution.length; i++) {
      var a = solution[i];
      if (grid[a.y] && grid[a.y][a.x] >= 0) return a;
    }
    return null;
  }

  global.AO = global.AO || {};
  global.AO.Levels = {
    UP: UP, RIGHT: RIGHT, DOWN: DOWN, LEFT: LEFT,
    WALL: WALL, EMPTY: EMPTY,
    DIRS: DIRS, DX: DX, DY: DY,
    mulberry32: mulberry32,
    emptyGrid: emptyGrid,
    makeMask: makeMask,
    playableCount: playableCount,
    pathClear: pathClear,
    removableArrows: removableArrows,
    solveGreedy: solveGreedy,
    solveAny: solveAny,
    validateSolution: validateSolution,
    generate: generate,
    orderCells: orderCells,
    levelParams: levelParams,
    buildLevel: buildLevel,
    nextSolutionArrow: nextSolutionArrow,
    countArrows: countArrows
  };
})(typeof window !== 'undefined' ? window : globalThis);
