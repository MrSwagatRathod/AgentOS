/* Node test — Procedural Long-Arrow Puzzle System (puzzle core).
 * Run: node test/levels.test.js
 * Verifies: module loading, determinism, solvability (exact simulation),
 * no overlaps, fill guarantee, arrow length growth, dependency chains,
 * direction coverage, difficulty curve, performance.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { globalThis: {} };
vm.createContext(sandbox);
for (const f of ['puzzle.js', 'difficulty.js', 'hints.js', 'renderer.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox, { filename: f });
}
const AO = sandbox.globalThis.AO;
const P = AO.Puzzle;
const D = AO.Difficulty;

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✔ ' + name);
  else { failures++; console.error('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('Puzzle system loaded:', Object.keys(AO).join(', '), '\n');

// 1) Modules
{
  console.log('[1] Module surface');
  check('AO.RNG / Board / Paths / Puzzle / DependencyGraph / Difficulty / Hints / Renderer exist',
    !!(AO.RNG && AO.Board && AO.Paths && AO.Puzzle && AO.DependencyGraph && AO.Difficulty && AO.Hints && AO.Renderer));
  check('Puzzle.validateSolvable / validateNoOverlap / buildLevel exist',
    typeof P.validateSolvable === 'function' && typeof P.validateNoOverlap === 'function' && typeof P.buildLevel === 'function');
}

// 2) Determinism
{
  console.log('[2] Determinism (same level -> identical puzzle)');
  let ok = true;
  for (let lvl = 1; lvl <= 50; lvl++) {
    const a = P.buildLevel(lvl), b = P.buildLevel(lvl);
    if (JSON.stringify(a.gridOf !== undefined ? a.gridOf() : a.arrows.map((x) => x.cells)) !==
        JSON.stringify(b.arrows.map((x) => x.cells))) { ok = false; break; }
    if (JSON.stringify(a.removalOrder) !== JSON.stringify(b.removalOrder)) { ok = false; break; }
    if (JSON.stringify(a.board.grid) !== JSON.stringify(b.board.grid)) { ok = false; break; }
  }
  check('levels 1..50 are deterministic', ok);
}

// 3) Solvability + no overlap + fill across levels 1..400
{
  console.log('[3] Solvability / overlap / fill (levels 1..400)');
  let unsolved = 0, overlap = 0, fillSum = 0, minFill = 1, n = 0, under80 = 0;
  const lenSums = {}, chainSums = {};
  for (let lvl = 1; lvl <= 400; lvl++) {
    const p = P.buildLevel(lvl);
    const v1 = P.validateSolvable(p);
    const v2 = P.validateNoOverlap(p);
    if (!v1.ok) { unsolved++; if (unsolved <= 3) check('solvable L' + lvl, false, JSON.stringify(v1)); }
    if (!v2.ok) overlap++;
    fillSum += p.stats.fill; n++;
    minFill = Math.min(minFill, p.stats.fill);
    if (p.stats.fill < 0.80) under80++;
    const band = lvl < 30 ? 'early' : lvl < 100 ? 'mid' : 'late';
    lenSums[band] = (lenSums[band] || 0) + p.stats.avgLen;
    chainSums[band] = (chainSums[band] || 0) + p.stats.chainDepth;
  }
  check('all 400 levels solvable via simulation', unsolved === 0, unsolved + ' unsolvable');
  check('no path overlaps / out-of-bounds / wall cells', overlap === 0, overlap + ' violations');
  check('average fill >= 0.88 (' + (fillSum / n * 100).toFixed(1) + '%)', fillSum / n >= 0.88);
  check('every level >= 80% filled', under80 === 0, under80 + ' levels < 80% (min ' + (minFill * 100).toFixed(0) + '%)');

  // 4) Long arrows + growth
  console.log('[4] Long arrows & difficulty growth');
  const EARLY = lenSums.early / 29, LATE = lenSums.late / 300;
  check('late levels have longer arrows than early (' + EARLY.toFixed(1) + ' → ' + LATE.toFixed(1) + ')',
    LATE > EARLY * 1.4);
  check('every level has at least one multi-cell (length>=3) arrow', (() => {
    for (let lvl = 1; lvl <= 400; lvl++) {
      const p = P.buildLevel(lvl);
      if (p.stats.maxLen < 3) return false;
    }
    return true;
  })());
  check('dependency chains exist (avg chain depth >= 2)', (() => {
    let s = 0;
    for (let lvl = 1; lvl <= 100; lvl++) s += P.buildLevel(lvl).stats.chainDepth;
    return s / 100 >= 2;
  })(), '');
  check('late levels have deeper chains than early', chainSums.late / 300 >= chainSums.early / 29);
}

// 5) Direction coverage (arrows point all 4 ways)
{
  console.log('[5] Direction coverage');
  const seen = {};
  for (let lvl = 1; lvl <= 120 && Object.keys(seen).length < 4; lvl++) {
    const p = P.buildLevel(lvl);
    for (const a of p.arrows) seen[a.dir] = true;
  }
  check('arrows point up/right/down/left across levels', Object.keys(seen).length === 4,
    'missing: ' + [0, 1, 2, 3].filter((d) => !seen[d]).join(','));
}

// 6) Difficulty curve — board cells grow monotonically
{
  console.log('[6] Difficulty curve');
  let prevCells = 0, dips = 0;
  for (let lvl = 1; lvl <= 300; lvl++) {
    const p = P.buildLevel(lvl);
    const cells = p.board.playableCount();
    if (lvl > 1 && cells < prevCells) dips++;
    prevCells = cells;
  }
  check('playable cells never shrink across levels 1..300', dips === 0, dips + ' dips');
}

// 7) Performance
{
  console.log('[7] Performance');
  const t0 = Date.now();
  for (let lvl = 1; lvl <= 300; lvl++) P.buildLevel(lvl);
  const ms = Date.now() - t0;
  check('300 levels built in ' + (ms / 1000).toFixed(1) + 's (< 30s)', ms < 30000, ms + 'ms');
}

console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED ✔' : failures + ' FAILURES ✘'));
process.exit(failures === 0 ? 0 : 1);
