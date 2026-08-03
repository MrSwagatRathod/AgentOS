/* Node smoke test — drives the REAL engine with a mocked DOM/canvas.
 * Verifies: boot, long-arrow level build, tap/remove, undo, hearts, hint,
 * win/lose transitions, persistence. Run: node test/game.smoke.test.js
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
    id, _cls: new Set(), textContent: '', innerHTML: '', children: [],
    style: {}, dataset: {}, listeners: {},
    addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
    removeEventListener() {}, getAttribute() { return null; }, setAttribute() {},
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 700 }; }
  };
  el.classList = makeClassList(el);
  return el;
}
const elements = {};
const getEl = (id) => (elements[id] || (elements[id] = makeEl(id)));

const canvas = makeEl('board');
const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p === 'measureText') return () => ({ width: 0 });
    if (p === 'canvas') return canvas;
    if (typeof p === 'string' && !(p in t)) return () => {};
    return t[p];
  },
  set(t, p, v) { t[p] = v; return true; }
});
canvas.getContext = () => ctx;
canvas.parentElement = { clientWidth: 420, clientHeight: 760 };
elements['board'] = canvas;

const storage = new Map();
const localStorageMock = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k)
};

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

const sandbox = {
  window: { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 2 },
  globalThis: null,
  document: {
    readyState: 'complete',
    documentElement: { attrs: { 'data-theme': 'light' }, getAttribute(k) { return this.attrs[k] || null; }, setAttribute(k, v) { this.attrs[k] = v; } },
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
sandbox.window.navigator = sandbox.navigator;
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = localStorageMock;
sandbox.window.performance = sandbox.performance;
sandbox.window.requestAnimationFrame = raf;
sandbox.window.setTimeout = setTimeout;
sandbox.window.clearTimeout = clearTimeout;

vm.createContext(sandbox);
for (const f of ['puzzle.js', 'difficulty.js', 'hints.js', 'renderer.js', 'audio.js', 'engine.js', 'ui.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox, { filename: f });
}
sandbox.AO = sandbox.window.AO;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8'), sandbox, { filename: 'game.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8'), sandbox, { filename: 'main.js' });

const AO = sandbox.window.AO;
const P = AO.Puzzle;

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✔ ' + name);
  else { failures++; console.error('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
}

function removableIds() {
  return AO.Game.debugRemovable();
}
function tapArrow(id) {
  const S = AO.Game.getState();
  const a = S.puzzle.arrows[id];
  AO.Game.tapCell(a.cells[0].x, a.cells[0].y);
}
function blockedIds() {
  const S = AO.Game.getState();
  const rem = new Set(removableIds());
  return S.puzzle.arrows.filter((a) => !rem.has(a.id) && S.live[a.id].onBoard && S.live[a.id].state === 'idle').map((a) => a.id);
}

console.log('Game smoke test — long-arrow engine with mocked DOM/canvas...\n');
runFrames(5);

check('modules booted (AO populated)', !!(AO.Game && AO.Engine && AO.Puzzle && AO.Renderer && AO.Hints && AO.Store && AO.UI));
check('boot: start screen visible', getEl('screen-start').classList.contains('hidden') === false);
runFrames(10);
check('menu frames render without throwing', true);

// --- Level 1 playthrough ---
AO.Game.startLevel(1);
{
  const S = AO.Game.getState();
  check('startLevel(1) -> playing', S.phase === 'playing');
  check('level badge updated', getEl('level-badge').textContent === 'Level 1');
  check('5 hearts', S.hearts === 5);
  check('puzzle has long arrows (multi-cell paths)', (() => {
    for (const a of S.puzzle.arrows) if (a.length >= 3) return true;
    return false;
  })());
  const total = S.total;
  check('total arrows >= 2', total >= 2);

  // remove the first removable arrow
  const rem = removableIds();
  check('at least one removable arrow at start', rem.length >= 1);
  tapArrow(rem[0]);
  const S2 = AO.Game.getState();
  check('removed count increments', S2.removedCount === 1);
  check('undo stack recorded', S2.undoStack.length === 1);
  runFrames(30); // let the slide finish (~300ms)
  check('arrow exited (onBoard false)', (() => {
    const s = AO.Game.getState();
    return !s.live[rem[0]].onBoard;
  })());

  // undo
  AO.Game.undo();
  check('undo restores arrow to board', (() => {
    const s = AO.Game.getState();
    return s.live[rem[0]].onBoard && s.removedCount === 0;
  })());
  runFrames(20);

  // hint
  const hintsBefore = AO.Game.getState().hintsLeft;
  AO.Game.hint();
  check('hint consumes one hint', AO.Game.getState().hintsLeft === hintsBefore - 1);
  check('hint arrow set', AO.Game.getState().hintArrowId != null);

  // wrong tap loses a heart
  const blocked = blockedIds();
  if (blocked.length) {
    tapArrow(blocked[0]);
    check('blocked tap costs a heart', AO.Game.getState().hearts === 4);
    check('blocked arrow stays', (() => {
      const s = AO.Game.getState();
      return s.live[blocked[0]].onBoard;
    })());
  } else {
    console.log('  (no blocked arrow in level 1 — skipping wrong-tap assertion)');
  }

  // clear the board
  let guard = 0;
  while (AO.Game.getState().phase === 'playing' && guard++ < 200) {
    const ids = removableIds();
    if (!ids.length) break;
    tapArrow(ids[0]);
    runFrames(22);
  }
  runFrames(30);
  const S3 = AO.Game.getState();
  check('board cleared (win)', S3.phase === 'won' && S3.removedCount === S3.total);
  check('store: level advanced', (AO.Store.data.level || 0) >= 2);
  check('win overlay shown', getEl('overlay-win').classList.contains('hidden') === false);
}

// --- Level 2, force a loss ---
AO.Game.startLevel(2);
{
  const S = AO.Game.getState();
  check('startLevel(2) resets state (hearts 5, hints 3, undo 0)',
    S.hearts === 5 && S.hintsLeft === 3 && S.undoStack.length === 0 && S.phase === 'playing');

  // drain hearts via wrong taps
  let lost = false;
  for (let i = 0; i < 8 && !lost; i++) {
    const b = blockedIds();
    if (!b.length) break;
    tapArrow(b[0]);
    runFrames(45);
    if (AO.Game.getState().phase === 'lost') lost = true;
  }
  check('loss reached when hearts hit 0', lost);
  check('lose overlay shown', getEl('overlay-lose').classList.contains('hidden') === false);

  AO.Game.restartLevel();
  const S2 = AO.Game.getState();
  check('retry restarts same level', S2.phase === 'playing' && S2.hearts === 5 && S2.level === 2);
}

// --- nextLevel & menu ---
{
  AO.Game.nextLevel();
  check('nextLevel -> level 3', AO.Game.getState().level === 3);
  AO.Game.goMenu();
  check('goMenu returns to menu', AO.Game.getState().phase === 'menu');
}

// --- persistence ---
{
  const saved = JSON.parse(localStorageMock.getItem('arrowEscape.v1'));
  check('localStorage persisted (level == 2, lost level 2 does not advance)',
    saved.level === 2 && !!saved.stars[1] && !saved.stars[2]);
}

console.log('\n' + (failures === 0 ? 'ALL GAME SMOKE TESTS PASSED ✔' : failures + ' FAILURES ✘'));
process.exit(failures === 0 ? 0 : 1);
