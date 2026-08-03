/* ============================================================================
 * Arrow Escape — boot, persistence, keyboard shortcuts, PWA service worker
 * ============================================================================
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'arrowEscape.v1';

  var defaultData = {
    level: 1,          /* furthest unlocked level */
    stars: {},         /* level -> best stars (1..3) */
    theme: 'light',
    sound: true
  };

  var data = load();

  function load() {
    var saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    } catch (e) { /* corrupted storage — start fresh */ }
    var d = Object.assign({}, defaultData, saved);
    if (!d.stars || typeof d.stars !== 'object') d.stars = {};
    return d;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) { /* private mode etc. — ignore */ }
  }

  /* ---------- public store API ---------- */
  global.AO = global.AO || {};
  global.AO.Store = {
    data: data,
    get: function (k) { return data[k]; },
    set: function (k, v) { data[k] = v; save(); },
    recordWin: function (level, stars) {
      var prev = data.stars[level] || 0;
      data.stars[level] = Math.max(prev, Math.min(3, stars));
      data.level = Math.max(data.level, level + 1);
      save();
    }
  };

  /* ---------- boot ---------- */
  function boot() {
    /* apply persisted theme before first paint */
    document.documentElement.setAttribute('data-theme', data.theme === 'light' ? 'light' : 'dark');
    if (data.sound === false) AO.Sound.setEnabled(false);

    AO.UI.init();
    AO.Game.applyTheme();
    AO.Game.setup();
    AO.UI.showMenu();

    bindKeys();
    registerSW();
  }

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      switch (e.key) {
        case 'h': case 'H': if (AO.Game.isPlaying()) AO.Game.hint(); break;
        case 'u': case 'U': if (AO.Game.isPlaying()) AO.Game.undo(); break;
        case 'r': case 'R': if (AO.Game.isPlaying()) AO.Game.restartLevel(); break;
        case 'm': case 'M': AO.UI.setSound(!AO.Sound.isEnabled()); break;
        case 't': case 'T': {
          var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          AO.UI.setTheme(next);
          break;
        }
        case 'Escape': {
          var m = document.querySelector('.modal:not(.hidden), .overlay:not(.hidden)');
          if (m) { AO.UI.closeAll ? AO.UI.closeAll() : document.querySelectorAll('.modal,.overlay').forEach(function (el) { el.classList.add('hidden'); }); }
          else if (AO.Game.isPlaying()) AO.Game.goMenu();
          break;
        }
        case 'Enter': {
          var modal = document.querySelector('.modal:not(.hidden)');
          if (modal) { /* let buttons handle themselves */ }
          else if (!document.getElementById('screen-start').classList.contains('hidden')) {
            AO.Game.startLevel(Math.max(1, data.level || 1));
          }
          break;
        }
      }
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline PWA optional */ });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
