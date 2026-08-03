/* ============================================================================
 * Arrow Escape — Puzzle Core
 * ----------------------------------------------------------------------------
 * Modules in this file:
 *   AO.RNG             seeded deterministic PRNG + helpers
 *   AO.Board           board layout engine (occupancy: EMPTY / arrow-id / WALL)
 *   AO.Paths           long-arrow path generator (random walk + tail extension)
 *   AO.Puzzle          puzzle generator (dependency-first, reverse-construction)
 *   AO.DependencyGraph dependency graph builder + solver/validator
 *
 * Generation pipeline (per the master spec):
 *   choose board → place arrows in REVERSE removal order → validate solvability
 *   → derive dependency graph → measure stats (fill, depth, start-removables)
 *
 * KEY INVARIANT (why every puzzle is solvable):
 *   Arrows are placed in reverse removal order. When an arrow is placed, its
 *   HEAD RAY (the ray from its head cell, along the arrowhead direction, to the
 *   board edge) must not pass through ANY already-placed arrow's cells.
 *   Therefore, removing arrows in the reverse of the placement order always
 *   finds each arrow's ray clear of every arrow still on the board.
 *
 * The dependency graph is DERIVED from the layout, never hand-picked:
 *   arrow X depends on arrow Y  <=>  Y occupies a cell in X's head ray.
 *   Because Y was placed after X, edges only run from earlier-placed arrows to
 *   later-placed arrows → the graph is a DAG by construction (no cycles).
 * ========================================================================== */
(function (global) {
  'use strict';

  var UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
  var DX = [0, 1, 0, -1];
  var DY = [-1, 0, 1, 0];
  var OPP = [DOWN, LEFT, UP, RIGHT];
  var WALL = -2;
  var EMPTY = -1;

  /* ============================= AO.RNG ============================= */
  /* mulberry32 — tiny, deterministic, good-enough distribution. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ============================= shapes ============================= */
  function maskRect(size) {
    var m = [];
    for (var y = 0; y < size; y++) { var r = []; for (var x = 0; x < size; x++) r.push(true); m.push(r); }
    return m;
  }
  function maskCircle(size) {
    var m = maskRect(size);
    var cx = (size - 1) / 2, cy = (size - 1) / 2, r = size / 2 - 0.35;
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        m[y][x] = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) <= r * r;
    return m;
  }
  function maskDiamond(size) {
    var m = maskRect(size);
    var cx = (size - 1) / 2, cy = (size - 1) / 2, r = Math.floor(size / 2) + 0.2;
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        m[y][x] = (Math.abs(x - cx) + Math.abs(y - cy)) <= r;
    return m;
  }
  function maskHeart(size) {
    var m = maskRect(size);
    var cx = (size - 1) / 2, cy = (size - 1) / 2, R = size * 0.42;
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++) {
        var u = (x - cx) / R, v = (cy - y) / R;
        m[y][x] = (Math.pow(u * u + v * v - 1, 3) - u * u * v * v * v) <= 0.12;
      }
    return m;
  }
  function maskCross(size) {
    var m = maskRect(size);
    var cx = (size - 1) / 2, cy = (size - 1) / 2, t = Math.floor(size * 0.28);
    for (var y = 0; y < size; y++)
      for (var x = 0; x < size; x++)
        m[y][x] = (Math.abs(x - cx) <= t) || (Math.abs(y - cy) <= t);
    return m;
  }
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

  /* ============================= AO.Board ============================= */
  /* Occupancy grid: WALL (-2) outside the shape, EMPTY (-1), or arrow id (>=0). */
  function Board(size, shape) {
    this.size = size;
    this.shape = shape || 'rect';
    this.mask = makeMask(size, this.shape);
    this.grid = [];
    for (var y = 0; y < size; y++) {
      var row = [];
      for (var x = 0; x < size; x++) row.push(this.mask[y][x] ? EMPTY : WALL);
      this.grid.push(row);
    }
  }
  Board.prototype.inBounds = function (x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; };
  Board.prototype.get = function (x, y) { return this.inBounds(x, y) ? this.grid[y][x] : WALL; };
  Board.prototype.isFree = function (x, y) { return this.inBounds(x, y) && this.grid[y][x] === EMPTY; };
  Board.prototype.occupy = function (arrow) {
    for (var i = 0; i < arrow.cells.length; i++) {
      var c = arrow.cells[i];
      this.grid[c.y][c.x] = arrow.id;
    }
  };
  Board.prototype.vacate = function (arrow) {
    for (var i = 0; i < arrow.cells.length; i++) {
      var c = arrow.cells[i];
      if (this.grid[c.y][c.x] === arrow.id) this.grid[c.y][c.x] = EMPTY;
    }
  };
  Board.prototype.countOccupied = function () {
    var n = 0;
    for (var y = 0; y < this.size; y++)
      for (var x = 0; x < this.size; x++)
        if (this.grid[y][x] >= 0) n++;
    return n;
  };
  Board.prototype.playableCount = function () { return playableCount(this.mask); };
  Board.prototype.arrowIdAt = function (x, y) { var v = this.get(x, y); return v >= 0 ? v : null; };
  /* Is the head ray (from (x,y) along dir to the edge) free of OTHER arrows?
   * Walls are exit edges (the arrow flies out there). Cells belonging to
   * `ignoreId` (the arrow's OWN path) never block — the whole path vacates
   * simultaneously when the arrow is tapped. */
  Board.prototype.headRayClear = function (x, y, dir, ignoreId) {
    var nx = x + DX[dir], ny = y + DY[dir];
    while (this.inBounds(nx, ny)) {
      var v = this.grid[ny][nx];
      if (v === WALL) return true;
      if (v !== EMPTY && v !== ignoreId) return false;
      nx += DX[dir]; ny += DY[dir];
    }
    return true;
  };
  /* Cells in the head ray (including the blocking arrow ids, excluding the
   * arrow's own cells). Used by the dependency graph and the hint renderer. */
  Board.prototype.headRayCells = function (x, y, dir, ignoreId) {
    var cells = [], nx = x + DX[dir], ny = y + DY[dir];
    while (this.inBounds(nx, ny)) {
      var v = this.grid[ny][nx];
      if (v === WALL) break;
      if (v === ignoreId) { nx += DX[dir]; ny += DY[dir]; continue; }
      cells.push({ x: nx, y: ny, owner: v });
      if (v !== EMPTY) break;
      nx += DX[dir]; ny += DY[dir];
    }
    return cells;
  };
  Board.prototype.emptyCells = function () {
    var out = [];
    for (var y = 0; y < this.size; y++)
      for (var x = 0; x < this.size; x++)
        if (this.grid[y][x] === EMPTY) out.push({ x: x, y: y });
    return out;
  };
  Board.prototype.clone = function () {
    var b = new Board(this.size, this.shape);
    for (var y = 0; y < this.size; y++)
      for (var x = 0; x < this.size; x++)
        b.grid[y][x] = this.grid[y][x];
    return b;
  };

  /* ============================= AO.Paths ============================= */
  /* Long-arrow path generation: random walk with smooth 90° turns, then a
   * tail extension to hit the requested length. Head ray must stay clear of
   * already-placed arrows (reverse-construction invariant). */
  function freeNeighbors(board, cell, used) {
    var out = [];
    for (var d = 0; d < 4; d++) {
      var nx = cell.x + DX[d], ny = cell.y + DY[d];
      var k = nx + ',' + ny;
      if (board.isFree(nx, ny) && !used[k]) out.push({ x: nx, y: ny, d: d });
    }
    return out;
  }

  /* Random walk from `start`. Segments are >= 2 cells (no tiny zigzags),
   * turns are 90° only, no 180° reversals, no self-intersection. */
  function walk(board, start, lenMin, rng) {
    var cells = [{ x: start.x, y: start.y }];
    var used = {};
    used[start.x + ',' + start.y] = 1;
    var cur = start;
    var dir = randInt(rng, 0, 3);
    var straight = 0;
    var guard = 0;

    while (cells.length < lenMin && guard++ < 200) {
      var next = null;

      /* 40% chance to turn (only after a run of >= 2 straight cells) */
      if (straight >= 2 && rng() < 0.4) {
        var perp = [dir === UP || dir === DOWN ? RIGHT : UP,
                    dir === UP || dir === DOWN ? LEFT : DOWN];
        shuffle(perp, rng);
        for (var i = 0; i < perp.length; i++) {
          var d = perp[i];
          var c = { x: cur.x + DX[d], y: cur.y + DY[d] };
          var k = c.x + ',' + c.y;
          if (board.isFree(c.x, c.y) && !used[k]) { next = c; dir = d; straight = 0; break; }
        }
      }

      /* else keep going straight */
      if (!next) {
        var c2 = { x: cur.x + DX[dir], y: cur.y + DY[dir] };
        var k2 = c2.x + ',' + c2.y;
        if (board.isFree(c2.x, c2.y) && !used[k2]) next = c2;
      }

      /* last resort: any free perpendicular direction */
      if (!next) {
        var ds = shuffle([0, 1, 2, 3].slice(), rng);
        for (var j = 0; j < ds.length; j++) {
          if (ds[j] === OPP[dir]) continue;
          var c3 = { x: cur.x + DX[ds[j]], y: cur.y + DY[ds[j]] };
          var k3 = c3.x + ',' + c3.y;
          if (board.isFree(c3.x, c3.y) && !used[k3]) { next = c3; dir = ds[j]; straight = 0; break; }
        }
      }

      if (!next) break;
      cells.push(next);
      used[next.x + ',' + next.y] = 1;
      straight++;
      cur = next;
    }

    if (cells.length < 2) return null;
    /* head direction = direction of the LAST step (into the head cell) */
    var last = cells[cells.length - 1], prev = cells[cells.length - 2];
    var headDir = (last.x - prev.x) === 1 ? RIGHT : (last.x - prev.x) === -1 ? LEFT
      : (last.y - prev.y) === 1 ? DOWN : UP;
    return { cells: cells, dir: headDir };
  }

  /* Prepend extra cells to the TAIL (start) of the path to reach the target
   * total length. Tail cells never affect removability (only the head ray
   * does), so this is a free way to boost board fill. */
  function extendTail(board, cells, targetLen, rng) {
    var used = {};
    for (var i = 0; i < cells.length; i++) used[cells[i].x + ',' + cells[i].y] = 1;
    var tail = [];
    var cur = cells[0];
    while (cells.length + tail.length < targetLen) {
      var nb = freeNeighbors(board, cur, used);
      if (!nb.length) break;
      var n = pick(rng, nb);
      tail.push({ x: n.x, y: n.y });
      used[n.x + ',' + n.y] = 1;
      cur = n;
    }
    return tail.reverse().concat(cells);
  }

  /* Generate one arrow path on `board` (which already contains all previously
   * placed arrows). Returns { cells, dir } or null after MAX_ATTEMPTS.
   * `preferCells` (optional) biases the START cell: cells inside the previous
   * arrow's head ray are chosen first, which deliberately makes the new arrow
   * BLOCK that ray → a real dependency link → deep chains, not random ones. */
  function generateArrow(board, lenMin, lenMax, rng, preferCells) {
    var MAX_ATTEMPTS = 30;
    var MIN_LEN = Math.max(2, lenMin);
    for (var t = 0; t < MAX_ATTEMPTS; t++) {
      var empties = board.emptyCells();
      if (!empties.length) return null;
      var start;
      if (preferCells && preferCells.length) {
        /* prefer a cell inside the previous arrow's head ray (still empty) */
        var pool = preferCells.filter(function (c) { return board.isFree(c.x, c.y); });
        start = pool.length ? pick(rng, pool) : pick(rng, empties);
      } else {
        start = pick(rng, empties);
      }
      var w = walk(board, start, MIN_LEN, rng);
      if (!w) continue;

      var head = w.cells[w.cells.length - 1];
      /* own cells are not on the board yet — plain clear check is correct */
      if (!board.headRayClear(head.x, head.y, w.dir)) continue;

      var total = randInt(rng, lenMin, lenMax);
      var cells = extendTail(board, w.cells, total, rng);
      return { cells: cells, dir: w.dir };
    }
    return null;
  }

  /* ============================= AO.DependencyGraph ============================= */
  /* Build deps/dependents from the final layout:
   *   deps[arrowId]        = arrows whose cells lie in this arrow's head ray
   *   dependents[arrowId]  = arrows that depend on this arrow */
  function buildGraph(board, arrows) {
    var deps = {}, dependents = {};
    for (var i = 0; i < arrows.length; i++) { deps[arrows[i].id] = []; dependents[arrows[i].id] = []; }
    for (var j = 0; j < arrows.length; j++) {
      var a = arrows[j];
      var ray = board.headRayCells(a.end.x, a.end.y, a.dir, a.id);
      var seen = {};
      for (var k = 0; k < ray.length; k++) {
        var owner = ray[k].owner;
        if (owner >= 0 && owner !== a.id && !seen[owner]) {
          seen[owner] = 1;
          deps[a.id].push(owner);
          dependents[owner].push(a.id);
        }
      }
    }
    return { deps: deps, dependents: dependents };
  }

  /* ============================= AO.Puzzle ============================= */
  /* Generate a puzzle:
   *   opts: { fill, minFill, lenMin, lenMax, maxArrows, maxStartRatio }
   * Returns null if fill target unreachable (caller retries with new seed). */
  function generate(size, shape, opts, seed) {
    var rng = mulberry32(seed);
    var board = new Board(size, shape);
    var playable = board.playableCount();
    var fillTarget = opts.fill;
    var minFill = opts.minFill || fillTarget - 0.06;
    var arrows = [];
    var placementOrder = [];
    var failStreak = 0;
    var maxArrows = opts.maxArrows || 40;
    var lastRay = null; /* empty cells inside the previous arrow's head ray */

    while (board.countOccupied() / playable < fillTarget && arrows.length < maxArrows && failStreak < 30) {
      /* adaptive length: when placement keeps failing, allow shorter arrows so
       * small leftover pockets still get filled (keeps fill high on shapes
       * like the cross that fragment into narrow regions) */
      var lenMinEff = opts.lenMin;
      if (failStreak > 12) lenMinEff = Math.max(2, opts.lenMin - 2);
      if (failStreak > 24) lenMinEff = 2;

      var a = generateArrow(board, lenMinEff, opts.lenMax, rng, lastRay);
      if (!a) { failStreak++; continue; }
      failStreak = 0;
      var id = arrows.length;
      var arrow = {
        id: id,
        cells: a.cells,
        start: a.cells[0],
        end: a.cells[a.cells.length - 1],
        dir: a.dir,
        length: a.cells.length,
        removalIndex: -1
      };
      board.occupy(arrow);
      arrows.push(arrow);
      placementOrder.push(id);

      /* next arrow will try to start inside THIS arrow's head ray (chain link) */
      var ray = board.headRayCells(arrow.end.x, arrow.end.y, arrow.dir, id);
      lastRay = ray.filter(function (c) { return c.owner === EMPTY; })
        .map(function (c) { return { x: c.x, y: c.y }; });
    }

    /* filler pass: close remaining gaps with 1-cell arrows. Each filler
     * points along a ray that is clear of every already-placed arrow (edge
     * cells always qualify), so it is removable and keeps the board solvable. */
    var empties = board.emptyCells();
    shuffle(empties, rng);
    for (var f = 0; f < empties.length && arrows.length < maxArrows; f++) {
      var cell = empties[f];
      if (!board.isFree(cell.x, cell.y)) continue;
      var dirs = shuffle([UP, RIGHT, DOWN, LEFT], rng);
      for (var dd = 0; dd < 4; dd++) {
        if (board.headRayClear(cell.x, cell.y, dirs[dd])) {
          var fId = arrows.length;
          board.occupy({ id: fId, cells: [cell] });
          arrows.push({ id: fId, cells: [cell], start: cell, end: cell, dir: dirs[dd], length: 1, removalIndex: -1 });
          placementOrder.push(fId);
          break;
        }
      }
    }

    var fill = board.countOccupied() / playable;
    if (fill < minFill || arrows.length < 2) return null;

    /* removal order = reverse of physical placement order */
    for (var k = 0; k < arrows.length; k++) {
      arrows[placementOrder[k]].removalIndex = arrows.length - 1 - k;
    }
    var removalOrder = placementOrder.slice().reverse();

    var graph = buildGraph(board, arrows);
    var startRemovable = arrows.filter(function (a) { return graph.deps[a.id].length === 0; }).length;
    var maxDeps = 0, maxLen = 0, minLen = Infinity, lenSum = 0;
    for (var m = 0; m < arrows.length; m++) {
      var ar = arrows[m];
      if (graph.deps[ar.id].length > maxDeps) maxDeps = graph.deps[ar.id].length;
      if (ar.length > maxLen) maxLen = ar.length;
      if (ar.length < minLen) minLen = ar.length;
      lenSum += ar.length;
    }

    /* longest dependency chain: DP over the DAG. Edges go dep → dependent,
     * so we can process arrows in REVERSE placement order (dependents are
     * always placed before their deps? no — deps are placed LATER). The graph
     * is acyclic; compute longest path via memoized DFS. */
    var memo = {};
    function chainLen(id) {
      if (memo[id] != null) return memo[id];
      var best = 1;
      var ds = graph.deps[id];
      for (var q = 0; q < ds.length; q++) {
        var l = 1 + chainLen(ds[q]);
        if (l > best) best = l;
      }
      memo[id] = best;
      return best;
    }
    var chainDepth = 0;
    for (var mm = 0; mm < arrows.length; mm++) {
      var cl = chainLen(arrows[mm].id);
      if (cl > chainDepth) chainDepth = cl;
    }

    return {
      size: size,
      shape: shape,
      board: board,
      arrows: arrows,
      removalOrder: removalOrder,
      deps: graph.deps,
      dependents: graph.dependents,
      stats: {
        fill: fill,
        count: arrows.length,
        avgLen: arrows.length ? lenSum / arrows.length : 0,
        minLen: minLen === Infinity ? 0 : minLen,
        maxLen: maxLen,
        maxDeps: maxDeps,
        chainDepth: chainDepth,
        startRemovable: startRemovable,
        startRatio: arrows.length ? startRemovable / arrows.length : 1
      }
    };
  }

  /* Build a level by difficulty params with bounded deterministic retries. */
  function buildLevel(level, difficulty) {
    var D = difficulty || global.AO.Difficulty;
    var p = D.levelParams(level);
    var best = null;
    var seed = (level * 2654435761) ^ (p.size * 48271) ^ hashStr(p.shape) ^ 0x9E3779B9;
    for (var tryIdx = 0; tryIdx < 10; tryIdx++) {
      var puzzle = generate(p.size, p.shape, p, seed >>> 0);
      if (puzzle) {
        if (!best || puzzle.stats.fill > best.stats.fill) best = puzzle;
        var ratioOk = p.maxStartRatio == null || puzzle.stats.startRatio <= p.maxStartRatio;
        if (ratioOk && puzzle.stats.fill >= p.minFill) return puzzle;
      }
      seed = (seed * 2654435761 + 97) >>> 0;
    }
    if (best) return best;
    /* absolute fallback: a trivial 3x3 that always works */
    return generate(3, 'rect', { fill: 0.5, minFill: 0.3, lenMin: 2, lenMax: 3, maxArrows: 8 }, seed >>> 0);
  }

  /* Simulation: replay the removal order and verify every arrow's head ray is
   * clear at removal time. Also proves monotone solvability. */
  function validateSolvable(puzzle) {
    var sim = puzzle.board.clone();
    for (var i = 0; i < puzzle.removalOrder.length; i++) {
      var id = puzzle.removalOrder[i];
      var a = puzzle.arrows[id];
      if (!sim.headRayClear(a.end.x, a.end.y, a.dir, id)) return { ok: false, step: i, id: id };
      sim.vacate(a);
    }
    return { ok: sim.countOccupied() === 0 };
  }

  /* Every cell belongs to at most one arrow, all in bounds, none on walls. */
  function validateNoOverlap(puzzle) {
    var seen = {};
    for (var i = 0; i < puzzle.arrows.length; i++) {
      var a = puzzle.arrows[i];
      for (var j = 0; j < a.cells.length; j++) {
        var c = a.cells[j];
        var k = c.x + ',' + c.y;
        if (seen[k]) return { ok: false, reason: 'overlap at ' + k, id: a.id };
        seen[k] = 1;
        if (!puzzle.board.inBounds(c.x, c.y)) return { ok: false, reason: 'out of bounds' };
        if (puzzle.board.mask[c.y] && !puzzle.board.mask[c.y][c.x]) return { ok: false, reason: 'on wall' };
      }
    }
    return { ok: true };
  }

  global.AO = global.AO || {};
  global.AO.RNG = { mulberry32: mulberry32, shuffle: shuffle, randInt: randInt, pick: pick };
  global.AO.Board = Board;
  global.AO.Paths = { generateArrow: generateArrow };
  global.AO.Puzzle = {
    generate: generate,
    buildLevel: buildLevel,
    validateSolvable: validateSolvable,
    validateNoOverlap: validateNoOverlap,
    WALL: WALL, EMPTY: EMPTY,
    UP: UP, RIGHT: RIGHT, DOWN: DOWN, LEFT: LEFT,
    DX: DX, DY: DY, OPP: OPP,
    makeMask: makeMask,
    playableCount: playableCount
  };
  global.AO.DependencyGraph = { build: buildGraph };
})(typeof window !== 'undefined' ? window : globalThis);
