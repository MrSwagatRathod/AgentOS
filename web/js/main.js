/* ============================================================================
 * Arrow Escape — boot, persistence, keyboard shortcuts, PWA service worker
 * ========================================================================== */
(function (global) {
  'use strict';

  var STORE_KEY = 'arrowEscape.v1';

  var defaultData = {
    level: 1,            /* furthest unlocked level (main route progress) */
    stars: {},           /* level -> best hearts kept (1..3) */
    mode: 'main',
    theme: 'light',
    sound: true,
    hints: true,
    display: 'mono',
    lineWidth: 'normal',
    assistCursor: false
  };

  var data = load();

  function load() {
    var saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    } catch (e) { /* corrupted — start fresh */ }
    var d = Object.assign({}, defaultData, saved);
    if (!d.stars || typeof d.stars !== 'object') d.stars = {};
    return d;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  global.AO = global.AO || {};
  global.AO.Store = {
    data: data,
    get: function (k) { return data[k]; },
    set: function (k, v) { data[k] = v; save(); },
    recordWin: function (level, hearts) {
      var stars = Math.max(1, Math.min(3, hearts));
      var prev = data.stars[level] || 0;
      data.stars[level] = Math.max(prev, stars);
      data.level = Math.max(data.level, level + 1);
      save();
    }
  };

  /* ---------- boot ---------- */
  function boot() {
    document.documentElement.setAttribute('data-theme', data.theme === 'light' ? 'light' : 'dark');
    if (data.sound === false) AO.Sound.setEnabled(false);
    AO.Game.setColorMode(data.display || 'mono');
    AO.Game.setLineWidth(data.lineWidth || 'normal');
    AO.Game.setHintsEnabled(data.hints !== false);
    AO.Game.setAssistCursor(!!data.assistCursor);

    AO.UI.init();
    AO.Game.applyTheme();
    AO.Game.setup();

    /* start in the saved mode/level */
    if (data.mode === 'challenge') {
      AO.Game.startLevel(1, 'challenge');
    } else if (data.mode === 'random') {
      AO.Game.startLevel(1 + Math.floor(Math.random() * AO.Game.LEVEL_COUNT), 'random');
    } else {
      AO.Game.startLevel(Math.max(1, data.level || 1), 'main');
    }

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
        case 'm': case 'M': {
          var on = !AO.Sound.isEnabled();
          AO.Sound.setEnabled(on); AO.Store.set('sound', on);
          break;
        }
        case 't': case 'T': {
          var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          AO.Store.set('theme', next);
          AO.Game.applyTheme();
          break;
        }
        case 'Escape': {
          var m = document.querySelector('.modal:not(.hidden), .overlay:not(.hidden)');
          if (m) AO.UI.closeAll();
          break;
        }
        case 'Enter': {
          var open = document.querySelector('.modal:not(.hidden), .overlay:not(.hidden)');
          if (!open && AO.Game.isPlaying()) { /* let buttons handle themselves */ }
          break;
        }
      }
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
