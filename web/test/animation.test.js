/* Node test — verifies the premium exit-animation stack:
 *   press scale phase → ease-in travel → motion-blur/trail → pop on exit →
 *   chain-reaction glow on newly-unlocked arrows → sounds (slide/pop)
 * Run: node test/animation.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------- DOM / canvas mocks (same as game.smoke.test.js) ---------------- */
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
  window: { addEventListener() {}, removeEventListener() {} },
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
for (const f of ['levels.js', 'audio.js', 'game.js', 'ui.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox, { filename: f });
}
sandbox.AO = sandbox.window.AO;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8'), sandbox, { filename: 'main.js' });

const AO = sandbox.window.AO;
const L = AO.Levels;

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  ✔ ' + name);
  else { failures++; console.error('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
};

/* spy on sounds */
const played = [];
const origPlay = AO.Sound.play;
AO.Sound.play = (n) => { played.push(n); return origPlay(n); };

function removableCells() {
  const S = AO.Game.getState();
  return L.removableArrows(S.grid, S.size).map((a) => a.x + ',' + a.y);
}

console.log('Animation stack test — press, travel, pop, chain-glow, sounds...\n');
runFrames(5);
AO.Game.startLevel(1);
runFrames(3);
played.length = 0;
vibrateCalls.length = 0;

const S0 = AO.Game.getState();
const before = removableCells();
const first = L.removableArrows(S0.grid, S0.size)[0];
AO.Game.tapCell(first.x, first.y);

/* --- press phase (elapsed < 55ms) --- */
runFrames(2); // +32ms
{
  const S = AO.Game.getState();
  const anims = AO.Game.debugAnims();
  check('anim created on tap', anims.length === 1);
  check('cell state = sliding during press', S.cells[first.y][first.x].state === 'sliding');
  check('slide whoosh played at tap', played.includes('slide'));
  check('haptic tick on tap', vibrateCalls.some((p) => p === 8 || (Array.isArray(p) && p[0] === 8) || (Array.isArray(p) && p.includes(8))));
  check('no trail particles during press phase', AO.Game.debugParts().length === 0, 'trail leaked early');
}

/* --- travel phase: arrow accelerates, trail appears --- */
runFrames(5); // +80ms → elapsed ~112ms
{
  check('anim still active during travel', AO.Game.debugAnims().length === 1);
  check('trail particles spawned during travel', AO.Game.debugParts().length > 0);
}

/* --- after ~300ms: exit complete --- */
runFrames(14); // +224ms → total elapsed ~368ms
{
  const S = AO.Game.getState();
  const anims = AO.Game.debugAnims();
  check('anim removed after travel', anims.length === 0);
  check('cell gone after exit', S.cells[first.y][first.x].state === 'gone');
  check('pop sound played on exit', played.includes('pop'));
  check('pop burst particles spawned on exit', AO.Game.debugParts().length > 0);

  /* chain-reaction glow: arrows that became removable must be pulsing */
  const after = removableCells();
  const newly = after.filter((k) => !before.includes(k) && k !== first.x + ',' + first.y);
  if (newly.length) {
    let allPulsing = true;
    for (const k of newly) {
      const [x, y] = k.split(',').map(Number);
      const t = S.now - S.cells[y][x].glowPulse;
      if (!(S.cells[y][x].glowPulse > 0 && t >= 0 && t < 1.0)) allPulsing = false;
    }
    check('newly-unlocked arrows glow (chain reaction)', allPulsing, JSON.stringify(newly));
  } else {
    console.log('  (level 1 first move unlocked no new arrows — chain-glow n/a, skipping)');
  }
}

/* --- wrong tap still shakes + haptics --- */
{
  const S = AO.Game.getState();
  const blocked = (() => {
    for (let y = 0; y < S.size; y++)
      for (let x = 0; x < S.size; x++)
        if (S.grid[y][x] >= 0 && !L.pathClear(S.grid, S.size, x, y, S.grid[y][x])) return { x, y };
    return null;
  })();
  if (blocked) {
    const before = vibrateCalls.length;
    AO.Game.tapCell(blocked.x, blocked.y);
    check('wrong tap vibrates (strong)', vibrateCalls.length > before && vibrateCalls[vibrateCalls.length - 1] === 45);
    check('heart lost on wrong tap', S.hearts === 4);
  }
}

function partsLen() {
  return AO.Game.debugParts().length;
}

console.log('\n' + (failures === 0 ? 'ALL ANIMATION TESTS PASSED ✔' : failures + ' FAILURES ✘'));
process.exit(failures === 0 ? 0 : 1);
