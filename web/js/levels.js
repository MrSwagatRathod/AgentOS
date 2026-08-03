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

  /* ---------- generator ---------- */
  /* Reverse-construction generator. Always solvable.
   * Only playable (non-wall) cells receive arrows; walls act as exit edges.
   *
   * Two complexity levers:
   *   1. INWARD DIRECTION BIAS (`opts.inwardBias`): when placing an arrow we try
   *      directions pointing toward the board center first. Inward-pointing
   *      arrows are naturally blocked at the start of the level, so fewer
   *      arrows are instantly removable => deeper dependency chains.
   *   2. START-RATIO FILTER (`opts.maxStartRatio`): if too many arrows are
   *      removable at the start (ratio = startRemovable / total), re-roll with
   *      a derived seed (bounded retries). */
  function generate(size, density, seed, shape, opts) {
    opts = opts || {};
    var tries = opts._tries || 0;
    var bias = opts.inwardBias || 0;
    var rng = mulberry32(seed);
    var mask = makeMask(size, shape || 'rect');
    var grid = emptyGrid(size);
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        if (!mask[y][x]) grid[y][x] = WALL;

    var placement = []; /* {x,y,dir} in placement order (= reverse removal order) */
    var playable = playableCount(mask);
    var target = Math.round(playable * density);
    var minArrows = Math.min(target, Math.max(3, Math.floor(playable * 0.45)));
    var ccx = (size - 1) / 2, ccy = (size - 1) / 2;

    /* pool of empty playable cells */
    var empty = [];
    for (var yy = 0; yy < size; yy++)
      for (var xx = 0; xx < size; xx++)
        if (mask[yy][xx]) empty.push({ x: xx, y: yy });
    shuffle(empty, rng);

    var attempts = 0;
    while (placement.length < target && empty.length > 0 && attempts++ < 8000) {
      var cell = empty.pop();
      var dirs = [UP, RIGHT, DOWN, LEFT];
      /* sort directions: strongest "toward center" first */
      if (bias > 0) {
        dirs.sort(function (a, b) {
          var wa = 1 + bias * Math.max(0, (ccx - cell.x) * DX[a] + (ccy - cell.y) * DY[a]) / (size / 2);
          var wb = 1 + bias * Math.max(0, (ccx - cell.x) * DX[b] + (ccy - cell.y) * DY[b]) / (size / 2);
          return wb - wa;
        });
      } else {
        shuffle(dirs, rng);
      }
      var placedDir = -1;
      for (var i = 0; i < dirs.length; i++) {
        if (pathClear(grid, size, cell.x, cell.y, dirs[i])) { placedDir = dirs[i]; break; }
      }
      if (placedDir === -1) continue; /* permanently blocked — already dropped from pool */
      grid[cell.y][cell.x] = placedDir;
      placement.push({ x: cell.x, y: cell.y, dir: placedDir });
    }

    /* too sparse (density target not reached) — retry with lower density, bounded */
    if (placement.length < minArrows && tries < 16) {
      return generate(size, Math.max(0.40, density - 0.02), (seed * 2654435761 + 97) >>> 0, shape,
        { _tries: tries + 1, maxStartRatio: opts.maxStartRatio, maxTries: opts.maxTries, inwardBias: bias });
    }
    if (placement.length < 2) {
      /* last-resort safety: never return an unplayable board */
      return generate(size, Math.max(0.40, density - 0.05), (seed * 2654435761 + 97) >>> 0, shape,
        { _tries: tries + 1, maxStartRatio: opts.maxStartRatio, maxTries: opts.maxTries, inwardBias: bias });
    }

    var board = {
      size: size,
      shape: shape || 'rect',
      mask: mask,
      grid: grid,
      solution: placement.slice().reverse() /* valid removal order */
    };

    /* complexity filter: too many instantly-removable arrows = trivial level */
    if (opts.maxStartRatio != null && tries < (opts.maxTries || 14)) {
      var startRemovable = removableArrows(grid, size).length;
      if (startRemovable / placement.length > opts.maxStartRatio) {
        return generate(size, density, (seed * 2654435761 + 97) >>> 0, shape,
          { _tries: tries + 1, maxStartRatio: opts.maxStartRatio, maxTries: opts.maxTries, inwardBias: bias });
      }
    }

    return board;
  }

  /* Difficulty curve by level number.
   * - Board sizes/shapes are ordered so PLAYABLE CELLS GROW every level:
   *   3x3(9) → 4x4(16) → 5x5(25) → 6x6(36) → circle8(44) → heart8(52) →
   *   cross9(65) → rect9(81) → rect10(100)
   * - Density ramps WITHIN each band so every consecutive level is denser
   *   (more arrows each level), staying below each board's fill saturation.
   * - inwardBias ≈ 0.6 makes most arrows point inward => few obvious first
   *   moves; maxStartRatio shrinks over time => deeper dependency chains. */
  function levelParams(level) {
    /* maxStartRatio values are calibrated to what inward-bias construction can
     * actually achieve (bigger boards have a higher structural floor). */
    if (level < 3)   return { size: 3, shape: 'rect', density: 0.72 + (level - 1) * 0.06, maxStartRatio: 0.50 };
    if (level < 6)   return { size: 4, shape: 'rect', density: 0.70 + (level - 3) * 0.02, maxStartRatio: 0.40 };
    if (level < 11)  return { size: 5, shape: 'rect', density: 0.68 + (level - 6) * 0.015, maxStartRatio: 0.38 };
    if (level < 19)  return { size: 6, shape: 'rect', density: 0.66 + (level - 11) * 0.01, maxStartRatio: 0.36 };
    if (level < 31)  return { size: 8, shape: 'circle', density: 0.64 + (level - 19) * 0.006, maxStartRatio: 0.35 };
    if (level < 46)  return { size: 8, shape: 'heart', density: 0.62 + (level - 31) * 0.005, maxStartRatio: 0.34 };
    if (level < 61)  return { size: 9, shape: 'cross', density: 0.62 + (level - 46) * 0.004, maxStartRatio: 0.34 };
    if (level < 81)  return { size: 9, shape: 'rect', density: 0.63 + (level - 61) * 0.003, maxStartRatio: 0.37 };
    if (level < 101) return { size: 10, shape: 'rect', density: 0.61 + (level - 81) * 0.002, maxStartRatio: 0.40 };
    return { size: 10, shape: 'rect', density: Math.min(0.64, 0.63 + Math.floor((level - 100) / 20) * 0.004),
             maxStartRatio: 0.39 };
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function buildLevel(level) {
    var p = levelParams(level);
    var seed = (level * 2654435761) ^ (p.size * 48271) ^ hashStr(p.shape) ^ Math.round(p.density * 1000);
    return generate(p.size, p.density, seed >>> 0, p.shape,
      { maxStartRatio: p.maxStartRatio, maxTries: 14, inwardBias: 0.6 });
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
    levelParams: levelParams,
    buildLevel: buildLevel,
    nextSolutionArrow: nextSolutionArrow,
    countArrows: countArrows
  };
})(typeof window !== 'undefined' ? window : globalThis);
