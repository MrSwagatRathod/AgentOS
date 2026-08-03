/* Node test — verifies the exit-slide animation renders for ALL four directions
 * (up, right, down, left). Regression test for the bug where the sliding arrow
 * was never drawn because the grid cell was already EMPTY during the slide.
 * Run: node test/directions.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------- DOM / canvas mocks (same harness as other tests) ---------------- */
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

const rotations = []; /* spy on ctx.rotate to verify arrow orientation */
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

/* silence sound spam */
AO.Sound.play = () => {};

console.log('Direction animation test — slide must render for all 4 directions...\n');

/* Find the first level that has a removable arrow pointing in each direction */
const DIR_NAME = ['up', 'right', 'down', 'left'];
let found = {};
for (let lvl = 1; lvl <= 60 && Object.keys(found).length < 4; lvl++) {
  const lv = L.buildLevel(lvl);
  const list = L.removableArrows(lv.grid, lv.size);
  for (const a of list) {
    if (!found[a.dir]) {
      found[a.dir] = { level: lvl, cell: { x: a.x, y: a.y }, dir: a.dir };
    }
  }
}
for (let d = 0; d < 4; d++) {
  check('found a removable arrow for direction ' + DIR_NAME[d], !!found[d],
    'searched levels 1..60 — none removable in this direction (would be a generator bug)');
}

/* For each direction: start that level, tap the removable arrow, run frames,
 * and assert the SLIDING ARROW WAS ACTUALLY DRAWN (drawSliding reached) and
 * the arrow exited properly. */
for (let d = 0; d < 4; d++) {
  const info = found[d];
  if (!info) continue;
  const lvl = info.level;

  AO.Game.startLevel(lvl);
  runFrames(2);

  const S = AO.Game.getState();
  const before = AO.Game.debugSlideDraws();
  rotations.length = 0;
  const target = L.removableArrows(S.grid, S.size).find((a) => a.dir === d);
  check('level ' + lvl + ': removable ' + DIR_NAME[d] + ' arrow still present', !!target);

  AO.Game.tapCell(target.x, target.y);
  runFrames(6);   // during travel (~96-192 ms in)
  const during = AO.Game.debugSlideDraws();
  check(DIR_NAME[d] + ': sliding arrow rendered during travel (' + during + ' frames)',
    during > before, 'drawSliding was never reached — the exit animation is invisible');

  /* arrow orientation: the dominant rotation must equal (dir-1)*π/2 (+ small natural rot) */
  const expected = (d - 1) * Math.PI / 2;
  const okRot = rotations.some((r) => Math.abs(r - expected) < 0.12);
  check(DIR_NAME[d] + ': arrow drawn facing its direction (rot≈' + expected.toFixed(2) + ')',
    okRot, 'rotations seen: ' + rotations.slice(0, 8).map((r) => r.toFixed(2)).join(', '));

  runFrames(20);  // finish (~300 ms)
  const after = AO.Game.getState();
  check(DIR_NAME[d] + ': arrow fully exited (cell gone, removed count ok)',
    after.cells[target.y][target.x].state === 'gone' && after.removed === 1);

  /* sanity: the anim direction matches the tap */
  const S2 = AO.Game.getState();
  check(DIR_NAME[d] + ': arrow removed from grid', S2.grid[target.y][target.x] === L.EMPTY);
}

console.log('\n' + (failures === 0 ? 'ALL DIRECTION TESTS PASSED ✔' : failures + ' FAILURES ✘'));
process.exit(failures === 0 ? 0 : 1);
