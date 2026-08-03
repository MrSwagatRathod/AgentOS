/* Node smoke test — drives the REAL game code with a mocked DOM/canvas.
 * Verifies: boot, level build, tap logic, hearts, undo, hint, win/lose
 * transitions, persistence. Run: node test/game.smoke.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------- DOM / canvas mocks ---------------- */
function makeClassList(el) {
  return {
    add: (c) => el._cls.add(c),
    remove: (c) => el._cls.delete(c),
    toggle: (c, force) => {
      const want = force === undefined ? !el._cls.has(c) : !!force;
      if (want) el._cls.add(c); else el._cls.delete(c);
      return want;
    },
    contains: (c) => el._cls.has(c)
  };
}

function makeEl(id) {
  const el = {
    id,
    _cls: new Set(),
    textContent: '',
    innerHTML: '',
    children: [],
    style: {},
    dataset: {},
    listeners: {},
    addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
    removeEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 700 }; }
  };
  el.classList = makeClassList(el);
  return el;
}

const elements = {};
function getEl(id) {
  if (!elements[id]) elements[id] = makeEl(id);
  return elements[id];
}

/* canvas element with proxy 2D context */
const canvas = makeEl('board');
const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p === 'measureText') return () => ({ width: 0 });
    if (p === 'canvas') return canvas;
    if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (typeof p === 'string' && !(p in t)) return () => {};
    return t[p];
  },
  set(t, p, v) { t[p] = v; return true; }
});
canvas.getContext = () => ctx;
canvas.parentElement = { clientWidth: 420, clientHeight: 760 };
elements['board'] = canvas; /* document.getElementById('board') must return this */

/* localStorage */
const storage = new Map();
const localStorageMock = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k)
};

/* animation frames driver */
let frameIndex = 0;
const rafQueue = [];
function raf(fn) { rafQueue.push(fn); return rafQueue.length; }
function runFrames(n, stepMs = 16) {
  for (let i = 0; i < n; i++) {
    const fns = rafQueue.splice(0, rafQueue.length);
    frameIndex++;
    fns.forEach((fn) => fn(frameIndex * stepMs));
  }
}

/* --------------- sandbox --------------- */
const windowObj = {
  addEventListener() {},
  removeEventListener() {}
};
const sandbox = {
  window: windowObj,
  globalThis: null, /* set below */
  document: {
    readyState: 'complete',
    documentElement: { attrs: { 'data-theme': 'dark' }, getAttribute(k) { return this.attrs[k] || null; }, setAttribute(k, v) { this.attrs[k] = v; } },
    getElementById: getEl,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => makeEl('created')
  },
  navigator: {},
  localStorage: localStorageMock,
  performance: { now: () => frameIndex * 16 },
  requestAnimationFrame: raf,
  cancelAnimationFrame() {},
  setTimeout, clearTimeout,
  console
};
sandbox.globalThis = sandbox;
sandbox.window.window = windowObj;
sandbox.window.document = sandbox.document;
sandbox.window.navigator = sandbox.navigator;
sandbox.window.localStorage = localStorageMock;
sandbox.window.performance = sandbox.performance;
sandbox.window.requestAnimationFrame = raf;
sandbox.window.cancelAnimationFrame = () => {};
sandbox.window.setTimeout = setTimeout;
sandbox.window.clearTimeout = clearTimeout;
sandbox.window.AudioContext = undefined;
sandbox.window.webkitAudioContext = undefined;

vm.createContext(sandbox);
const files = ['levels.js', 'audio.js', 'game.js', 'ui.js'];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}
/* mirror window.AO onto the context global object so bare `AO` identifiers
 * resolve at runtime — exactly like a browser global. Then boot main.js. */
sandbox.AO = sandbox.window.AO;
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8'),
  sandbox, { filename: 'main.js' }
);

const AO = sandbox.window.AO;
const L = AO.Levels;

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✔ ' + name);
  else { failures++; console.error('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
}
function tapRemovable() {
  const S = AO.Game.getState();
  const list = L.removableArrows(S.grid, S.size);
  if (!list.length) return false;
  AO.Game.tapCell(list[0].x, list[0].y);
  return true;
}
function findBlockedCell() {
  const S = AO.Game.getState();
  for (let y = 0; y < S.size; y++)
    for (let x = 0; x < S.size; x++)
      if (S.grid[y][x] !== -1 && !L.pathClear(S.grid, S.size, x, y, S.grid[y][x])) return { x, y };
  return null;
}

console.log('Game smoke test — booting real code with mocked DOM/canvas...\n');

// boot should have happened synchronously (readyState === 'complete')
check('AO namespace populated', !!(AO && AO.Game && AO.UI && AO.Store && AO.Sound && AO.Levels));
check('boot: UI.init ran (start screen visible)', getEl('screen-start').classList.contains('hidden') === false);
check('boot: default theme light', sandbox.document.documentElement.attrs['data-theme'] === 'light');

// menu phase renders the demo board without throwing
runFrames(10);
check('menu frames render without throwing', true);

// --- Level 1 playthrough ---
AO.Game.startLevel(1);
{
  const S = AO.Game.getState();
  check('startLevel(1) -> playing', S.phase === 'playing');
  check('HUD updated (level badge)', getEl('level-badge').textContent === 'Level 1');
  check('5 hearts shown', S.hearts === 5);
  check('board size 3, shape rect', S.size === 3 && S.shape === 'rect');
  const total = L.countArrows(S.grid);
  check('level 1 has arrows (' + total + ')', total >= 2 && total <= 9);

  // tap a removable arrow
  const first = L.removableArrows(S.grid, S.size)[0];
  AO.Game.tapCell(first.x, first.y);
  check('removable tap removes arrow', S.removed === 1 && S.grid[first.y][first.x] === -1);
  check('undo stack recorded', S.undoStack.length === 1);
  runFrames(40); // let the slide animation finish
  check('slide anim completes -> cell gone', S.cells[first.y][first.x].state === 'gone');

  // undo restores it
  AO.Game.undo();
  check('undo restores arrow', S.grid[first.y][first.x] === first.dir && S.removed === 0);
  runFrames(5);

  // tap a blocked arrow -> heart lost
  const blocked = findBlockedCell();
  if (blocked) {
    AO.Game.tapCell(blocked.x, blocked.y);
    check('blocked tap costs a heart', S.hearts === 4);
    check('blocked arrow stays on board', S.grid[blocked.y][blocked.x] !== -1);
  } else {
    console.log('  (no blocked cell in level 1 — skipping blocked-tap assertion)');
  }

  // hint
  const hintsBefore = S.hintsLeft;
  AO.Game.hint();
  check('hint consumes one hint', S.hintsLeft === hintsBefore - 1);
  check('hint highlights a removable arrow', !!S.hintArrow);

  // clear the board
  let guard = 0;
  while (S.phase === 'playing' && guard++ < 100) {
    if (!tapRemovable()) break; /* board empty — win transition fires below */
    runFrames(30);
  }
  runFrames(50); /* let the win transition fire after the last slide (0.54s) */
  check('all arrows removed', S.removed === S.total, S.removed + ' / ' + S.total);
  check('board cleared (win phase reached)', S.phase === 'won');
  check('store: level advanced to 2', (AO.Store.data.level || 0) >= 2);
  check('store: stars recorded for level 1', (AO.Store.data.stars[1] || 0) >= 1);
  check('win overlay shown', getEl('overlay-win').classList.contains('hidden') === false);
}

// --- Level 2, then force a loss ---
AO.Game.startLevel(2);
{
  const S = AO.Game.getState();
  check('startLevel(2) resets state (hearts 5, undo 0, hints 3)',
    S.hearts === 5 && S.undoStack.length === 0 && S.hintsLeft === 3 && S.phase === 'playing');

  // drain hearts: set to 1, tap blocked arrows
  S.hearts = 1;
  let lost = false;
  for (let i = 0; i < 6 && S.phase === 'playing'; i++) {
    const b = findBlockedCell();
    if (!b) break;
    AO.Game.tapCell(b.x, b.y);
    runFrames(60);
    if (S.phase === 'lost') { lost = true; break; }
  }
  check('loss phase reached when hearts hit 0', lost && S.phase === 'lost');
  check('lose overlay shown', getEl('overlay-lose').classList.contains('hidden') === false);

  // retry from the lose screen
  AO.Game.restartLevel();
  check('retry restarts same level', S.phase === 'playing' && S.hearts === 5 && S.level === 2);
}

// --- nextLevel & menu ---
{
  AO.Game.nextLevel();
  const S = AO.Game.getState();
  check('nextLevel -> level 3', S.level === 3 && S.phase === 'playing');
  AO.Game.goMenu();
  check('goMenu returns to menu screen', S.phase === 'menu' && getEl('screen-start').classList.contains('hidden') === false);
}

// --- persistence across reload ---
{
  const savedRaw = localStorageMock.getItem('arrowEscape.v1');
  check('storage populated', !!savedRaw);
  const saved = JSON.parse(savedRaw);
  /* level 1 was won (advances to 2), level 2 was lost (does NOT advance to 3) */
  check('localStorage persisted (level == 2, not beyond loss)', saved.level === 2);
  check('localStorage persisted (stars for 1; none for lost level 2)', !!saved.stars[1] && !saved.stars[2]);
}

// --- deterministic daily-puzzle style generation across sizes ---
{
  let ok = true;
  for (let lvl = 1; lvl <= 40; lvl++) {
    const a = L.buildLevel(lvl), b = L.buildLevel(lvl);
    if (JSON.stringify(a.grid) !== JSON.stringify(b.grid)) { ok = false; break; }
  }
  check('generation deterministic (levels 1..40)', ok);
}

console.log('\n' + (failures === 0 ? 'ALL GAME SMOKE TESTS PASSED ✔' : failures + ' FAILURES ✘'));
process.exit(failures === 0 ? 0 : 1);
