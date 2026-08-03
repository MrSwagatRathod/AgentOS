/* Node test — verifies long arrows exit in ALL FOUR directions (up/right/down/left)
 * and that the sliding path is actually rendered while traveling.
 * Run: node test/directions.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

const rotations = [];
const canvas = makeEl('board');
const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p === 'measureText') return () => ({ width: 0 });
    if (p === 'canvas') return canvas;
    if (p === 'rotate') return (a) => { rotations.push(a); };
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
const raf = (fn) => { rafQueue.push(fn); return rafQueue.length; };
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
const check = (name, cond, extra) => {
  if (cond) console.log('  ✔ ' + name);
  else { failures++; console.error('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
};
AO.Sound.play = () => {};

const DIR_NAME = ['up', 'right', 'down', 'left'];

/* Find a removable arrow for each head direction across levels 1..120 */
const found = {};
for (let lvl = 1; lvl <= 120 && Object.keys(found).length < 4; lvl++) {
  const p = P.buildLevel(lvl);
  const sim = p.board.clone();
  /* removable = head ray clear (excluding own id) */
  for (const a of p.arrows) {
    if (!found[a.dir] && sim.headRayClear(a.end.x, a.end.y, a.dir, a.id)) {
      found[a.dir] = { level: lvl, id: a.id };
    }
  }
}

for (let d = 0; d < 4; d++) {
  const info = found[d];
  if (!info) { check(DIR_NAME[d] + ': found a removable arrow', false, 'none across levels 1..120'); continue; }
  AO.Game.startLevel(info.level);
  runFrames(3);
  const S = AO.Game.getState();
  const a = S.puzzle.arrows[info.id];
  const before = AO.Game.debugSlideDraws();
  AO.Game.tapCell(a.cells[0].x, a.cells[0].y);
  runFrames(7); // during travel
  const during = AO.Game.debugSlideDraws();
  check(DIR_NAME[d] + ' (L' + info.level + '): sliding path rendered during travel',
    during > before, 'drawSliding never reached');
  runFrames(20); // finish
  const S2 = AO.Game.getState();
  check(DIR_NAME[d] + ': arrow fully exited', !S2.live[info.id].onBoard);
  check(DIR_NAME[d] + ': removed from occupancy', S2.puzzle.board.arrowIdAt(a.cells[0].x, a.cells[0].y) == null);
}

console.log('\n' + (failures === 0 ? 'ALL DIRECTION TESTS PASSED ✔' : failures + ' FAILURES ✘'));
process.exit(failures === 0 ? 0 : 1);
