/* Node test — verifies the long-arrow exit animation stack:
 *   press phase → accelerate travel → motion-blur/trail → pop on exit →
 *   chain-reaction glow on dependents → undo slide-back
 * Run: node test/animation.test.js
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
const raf = (fn) => { rafQueue.push(fn); return rafQueue.length; };
function runFrames(n, stepMs = 16) {
  for (let i = 0; i < n; i++) {
    const fns = rafQueue.splice(0, rafQueue.length);
    frameIndex++;
    fns.forEach((fn) => fn(frameIndex * stepMs));
  }
}

const vibrateCalls = [];
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
  navigator: { vibrate: (p) => { vibrateCalls.push(p); return true; } },
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

const played = [];
const origPlay = AO.Sound.play;
AO.Sound.play = (n) => { played.push(n); return origPlay(n); };

function tapFirstRemovable() {
  const ids = AO.Game.debugRemovable();
  if (!ids.length) return null;
  const id = ids[0];
  const S = AO.Game.getState();
  const a = S.puzzle.arrows[id];
  AO.Game.tapCell(a.cells[0].x, a.cells[0].y);
  return id;
}

console.log('Animation stack test — long-arrow exit sequence...\n');
runFrames(5);
AO.Game.startLevel(1);
runFrames(3);
played.length = 0;
vibrateCalls.length = 0;

const id = tapFirstRemovable();
check('found a removable arrow to tap', id != null);
const S0 = AO.Game.getState();
const target = S0.puzzle.arrows[id];

/* --- press phase --- */
runFrames(2); // +32ms (< press 60ms)
{
  check('slide anim created on tap', AO.Game.debugAnims().length === 1);
  check('whoosh played at tap', played.includes('slide'));
  check('haptic tick at tap', vibrateCalls.some((v) => v === 8));
}

/* --- travel phase --- */
runFrames(5); // +80ms → ~112ms in
{
  check('anim still active during travel', AO.Game.debugAnims().length === 1);
  check('slide arrow actually rendered (debugSlideDraws > 0)', AO.Game.debugSlideDraws() > 0);
  check('trail particles spawned', AO.Game.debugParts().length > 0);
}

/* --- after exit (~300ms) --- */
runFrames(14); // +224ms → ~336ms
{
  const S = AO.Game.getState();
  check('anim removed after exit', AO.Game.debugAnims().length === 0);
  check('arrow exited (onBoard false)', !S.live[id].onBoard);
  check('pop sound played on exit', played.includes('pop'));
  check('pop burst particles spawned', AO.Game.debugParts().length > 0);

  /* chain reaction: dependents of the removed arrow should be glowing */
  const dependents = S.puzzle.dependents[id] || [];
  if (dependents.length) {
    let allGlow = true;
    for (const dep of dependents) {
      if (!S.live[dep] || !S.live[dep].onBoard) continue;
      const t = S.now - S.live[dep].glowPulse;
      if (!(S.live[dep].glowPulse > 0 && t >= 0 && t < 1.5)) allGlow = false;
    }
    check('dependents glow (chain reaction)', allGlow);
  } else {
    console.log('  (no dependents for this arrow — chain-glow n/a)');
  }
}

/* --- undo: slide-back animation --- */
{
  const S = AO.Game.getState();
  const animsBefore = AO.Game.debugAnims().length;
  AO.Game.undo();
  const anims = AO.Game.debugAnims();
  check('undo creates a reverse slide-back anim', anims.length === animsBefore + 1 && anims[anims.length - 1].rev === true);
  runFrames(16); // ~256ms
  const S2 = AO.Game.getState();
  check('arrow restored after slide-back', S2.live[id].onBoard && S2.removedCount === 0);
  check('board occupancy restored', S2.puzzle.board.arrowIdAt(target.cells[0].x, target.cells[0].y) === id);
}

console.log('\n' + (failures === 0 ? 'ALL ANIMATION TESTS PASSED ✔' : failures + ' FAILURES ✘'));
process.exit(failures === 0 ? 0 : 1);
