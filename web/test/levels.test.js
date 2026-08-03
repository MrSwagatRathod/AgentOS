/* Node test for the level generator/solver — run: node test/levels.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load levels.js into a sandbox (it attaches to globalThis when no window)
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'levels.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const L = sandbox.globalThis.AO.Levels;

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  ✔ ' + name); }
  else { failures++; console.error('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('Levels library loaded. Running generator + solver tests...\n');

// 1) Determinism
{
  console.log('[1] Determinism');
  const a = L.buildLevel(42);
  const b = L.buildLevel(42);
  check('same level -> identical board', JSON.stringify(a.grid) === JSON.stringify(b.grid));
  check('same level -> identical solution', JSON.stringify(a.solution) === JSON.stringify(b.solution));
}

// 2) All levels 1..600 are solvable (exact solver) and the construction witness is valid
{
  console.log('[2] Solvability of levels 1..600 (incl. shaped boards)');
  let exactFail = 0, witnessFail = 0, emptyStart = 0, counts = {}, shapes = {};
  for (let lvl = 1; lvl <= 600; lvl++) {
    const lv = L.buildLevel(lvl);
    const size = lv.size;
    if (size < 3 || size > 10) { check('size sane', false, 'level ' + lvl + ' size ' + size); continue; }
    counts[size] = (counts[size] || 0) + 1;
    shapes[lv.shape] = (shapes[lv.shape] || 0) + 1;

    // every shape must have a reasonable number of playable cells
    const playable = L.playableCount(lv.mask);
    if (playable < 6) { check('playable cells >= 6', false, 'L' + lvl + ' ' + lv.shape + ' has ' + playable); }

    // construction witness must be a valid removal order
    const v = L.validateSolution(lv.grid, size, lv.solution);
    if (!v.ok) { witnessFail++; if (witnessFail <= 3) check('witness valid L' + lvl, false, JSON.stringify(v)); }

    // independent exact solver must find SOME solution
    const sol = L.solveAny(lv.grid, size, 300000);
    if (!sol) { exactFail++; if (exactFail <= 3) check('exact solve L' + lvl, false, 'no solution found'); }

    // at least one arrow removable at start
    if (L.removableArrows(lv.grid, size).length === 0) { emptyStart++; check('start removable L' + lvl, false); }
  }
  check('all witnesses valid (600/600)', witnessFail === 0, witnessFail + ' failed');
  check('all levels solvable via exact solver', exactFail === 0, exactFail + ' failed');
  check('every level has ≥1 removable arrow at start', emptyStart === 0, emptyStart + ' failed');
  console.log('      sizes used: ' + Object.keys(counts).sort((a, b) => a - b).map(s => s + 'x' + s + '=' + counts[s]).join(', '));
  console.log('      shapes used: ' + Object.keys(shapes).map(s => s + '=' + shapes[s]).join(', '));
}

// 2b) Shaped boards: walls only outside the mask; every non-wall cell reachable
{
  console.log('[2b] Shape mask sanity');
  let bad = 0, playableTot = 0;
  for (let lvl = 1; lvl <= 300; lvl++) {
    const lv = L.buildLevel(lvl);
    playableTot += L.playableCount(lv.mask);
    for (let y = 0; y < lv.size; y++) {
      for (let x = 0; x < lv.size; x++) {
        const isPlayable = lv.mask[y][x];
        const cell = lv.grid[y][x];
        if (isPlayable && cell === L.WALL) { bad++; break; }
        if (!isPlayable && cell !== L.WALL) { bad++; break; }
      }
      if (bad) break;
    }
  }
  check('mask and grid agree on walls for levels 1..300', bad === 0, bad + ' mismatches');
  check('average playable cells per level is sane', playableTot / 300 > 10, 'avg ' + (playableTot / 300).toFixed(1));
}

// 3) Greedy solver agrees on easy boards; nextSolutionArrow returns on-board arrows
{
  console.log('[3] Helper correctness');
  let bad = 0;
  for (let lvl = 1; lvl <= 300; lvl++) {
    const lv = L.buildLevel(lvl);
    const next = L.nextSolutionArrow(lv.grid, lv.solution);
    if (!next || lv.grid[next.y][next.x] === -1) { bad++; break; }
    // the hinted arrow must be removable right now (it's the first in solution order)
    if (!L.pathClear(lv.grid, lv.size, next.x, next.y, lv.grid[next.y][next.x])) { bad++; break; }
  }
  check('nextSolutionArrow always returns a currently-removable arrow', bad === 0, bad + ' failures');
}

// 4) Greedy solver finds solutions for all (as a fast secondary check)
{
  console.log('[4] Greedy solver (fast check, levels 1..600)');
  let fail = 0;
  for (let lvl = 1; lvl <= 600; lvl++) {
    const lv = L.buildLevel(lvl);
    if (!L.solveGreedy(lv.grid, lv.size, lvl)) fail++;
  }
  check('greedy solves all levels', fail === 0, fail + ' failed');
}

// 5) Negative test: a deliberately unsolvable board is rejected
{
  console.log('[5] Negative cases');
  const g = L.emptyGrid(3);
  // all arrows pointing into each other: center blocks everyone
  g[0][0] = L.RIGHT; g[0][1] = L.RIGHT; g[0][2] = L.LEFT;  // row 0: → → ←  (0,2) points left into (0,1)
  g[1][0] = L.DOWN;  g[1][1] = L.DOWN;  g[1][2] = L.DOWN;  // row 1: ↓ ↓ ↓ blocked below? (2,x) empty so ↓ clears... 
  // make (2,*) arrows point UP so every path is blocked
  g[2][0] = L.UP;    g[2][1] = L.UP;    g[2][2] = L.UP;
  const sol = L.solveAny(g, 3, 100000);
  check('blocked 3x3 has no solution', sol === null || sol === undefined || sol.length === 0, sol ? 'found solution ' + sol.length : '');
}

// 6) Performance smoke
{
  console.log('[6] Performance');
  const t0 = Date.now();
  for (let lvl = 1; lvl <= 2000; lvl++) L.buildLevel(lvl);
  const ms = Date.now() - t0;
  check('2000 levels generated in ' + ms + 'ms (fast enough for instant play)', ms < 5000, ms + 'ms');
}

console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED ✔' : failures + ' FAILURES ✘'));
process.exit(failures === 0 ? 0 : 1);
