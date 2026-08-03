/* ============================================================================
 * Arrow Escape — UI controller (DOM screens, modals, HUD, theme, settings)
 * ============================================================================
 * Depends on: AO.Game, AO.Sound, AO.Store (Store defined in main.js)
 */
(function (global) {
  'use strict';

  var E = {};
  var toastTimer = null;
  var lastBadgeLevel = 0;

  function $(id) { return document.getElementById(id); }

  function init() {
    ['screen-start', 'btn-play', 'btn-levels', 'btn-howto', 'btn-theme', 'btn-sound',
     'hud', 'level-badge', 'hearts', 'bottom-bar',
     'btn-menu', 'btn-undo', 'btn-hint', 'hint-count', 'btn-restart',
     'modal-menu', 'menu-continue', 'menu-restart', 'menu-levels', 'menu-howto', 'menu-theme', 'menu-sound',
     'overlay-win', 'win-title', 'win-sub', 'btn-next', 'btn-replay', 'btn-win-levels',
     'overlay-lose', 'btn-retry', 'btn-lose-levels', 'btn-lose-menu',
     'modal-levels', 'levels-close', 'level-grid',
     'modal-howto', 'howto-close', 'toast', 'meta-theme', 'icon-theme', 'icon-sound'
    ].forEach(function (id) { E[id] = $(id); });

    /* ---- start screen ---- */
    E['btn-play'].addEventListener('click', function () {
      clickFx();
      var level = Math.max(1, AO.Store.data.level || 1);
      AO.Game.startLevel(level);
    });
    E['btn-levels'].addEventListener('click', function () { clickFx(); openLevels(); });
    E['btn-howto'].addEventListener('click', function () { clickFx(); open('howto'); });

    /* ---- HUD ---- */
    E['btn-menu'].addEventListener('click', function () { clickFx(); open('menu'); });
    E['btn-undo'].addEventListener('click', function () { clickFx(); AO.Game.undo(); });
    E['btn-hint'].addEventListener('click', function () {
      clickFx();
      var S = AO.Game.getState();
      if (S.hintsLeft <= 0) toast('No hints left');
      else if (S.now < S.hintCooldownUntil) toast('Hint is recharging…');
      else AO.Game.hint();
    });
    E['btn-restart'].addEventListener('click', function () { clickFx(); AO.Game.restartLevel(); });

    /* ---- in-game menu ---- */
    E['menu-continue'].addEventListener('click', function () { clickFx(); closeAll(); });
    E['menu-restart'].addEventListener('click', function () { clickFx(); closeAll(); AO.Game.restartLevel(); });
    E['menu-levels'].addEventListener('click', function () { clickFx(); openLevels(); });
    E['menu-howto'].addEventListener('click', function () { clickFx(); open('howto'); });

    /* ---- win / lose ---- */
    E['btn-next'].addEventListener('click', function () { clickFx(); AO.Game.nextLevel(); });
    E['btn-replay'].addEventListener('click', function () { clickFx(); AO.Game.restartLevel(); });
    E['btn-win-levels'].addEventListener('click', function () { clickFx(); openLevels(); });
    E['btn-retry'].addEventListener('click', function () { clickFx(); AO.Game.restartLevel(); });
    E['btn-lose-levels'].addEventListener('click', function () { clickFx(); openLevels(); });
    E['btn-lose-menu'].addEventListener('click', function () { clickFx(); closeAll(); AO.Game.goMenu(); });

    /* ---- modal close buttons ---- */
    E['levels-close'].addEventListener('click', function () { clickFx(); closeAll(); });
    E['howto-close'].addEventListener('click', function () { clickFx(); closeAll(); });

    /* ---- theme & sound toggles ---- */
    bindToggle(E['btn-theme'], 'theme');
    bindToggle(E['menu-theme'], 'theme');
    bindToggle(E['btn-sound'], 'sound');
    bindToggle(E['menu-sound'], 'sound');

    /* close modals when tapping backdrop */
    ['modal-menu', 'modal-levels', 'modal-howto'].forEach(function (id) {
      E[id].addEventListener('pointerdown', function (e) {
        if (e.target === E[id]) { clickFx(); closeAll(); }
      });
    });

    /* initial paint */
    applyThemeUI();
    applySoundUI();
  }

  function bindToggle(btn, kind) {
    btn.addEventListener('click', function () {
      clickFx();
      if (kind === 'theme') {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        setTheme(next);
      } else {
        setSound(!AO.Sound.isEnabled());
      }
    });
  }

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    E['meta-theme'].setAttribute('content', t === 'dark' ? '#0b0b0d' : '#ffffff');
    AO.Store.set('theme', t);
    applyThemeUI();
    AO.Game.applyTheme();
  }

  function applyThemeUI() {
    var dark = document.documentElement.getAttribute('data-theme') !== 'light';
    /* swap icon: sun shown in dark mode (click to go light), moon in light mode */
    E['icon-theme'].innerHTML = dark
      ? '<circle cx="12" cy="12" r="4.4"/><path d="M12 2v2.6M12 19.4V22M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M2 12h2.6M19.4 12H22M4.9 19.1l1.9-1.9M17.2 6.8l1.9-1.9"/>'
      : '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
  }

  function setSound(on) {
    AO.Sound.setEnabled(on);
    AO.Store.set('sound', on);
    applySoundUI();
  }

  function applySoundUI() {
    var on = AO.Sound.isEnabled();
    E['icon-sound'].innerHTML = on
      ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'
      : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M23 9l-6 6M17 9l6 6"/>';
  }

  /* ---------- screens ---------- */

  function showMenu() {
    closeAll();
    E['screen-start'].classList.remove('hidden');
    E['hud'].classList.add('hidden');
    E['bottom-bar'].classList.add('hidden');
  }

  function showGame() {
    closeAll();
    E['screen-start'].classList.add('hidden');
    E['hud'].classList.remove('hidden');
    E['bottom-bar'].classList.remove('hidden');
    updateHUD(AO.Game.getState());
  }

  function showWin(level, hearts) {
    E['win-title'].textContent = 'Level ' + level + ' complete';
    var sub = 'Well done.';
    if (hearts >= 5) sub = 'Flawless — every heart kept!';
    else if (hearts >= 4) sub = 'Great — only one heart lost.';
    else if (hearts >= 2) sub = 'Nice — cleared with ' + hearts + ' hearts left.';
    E['win-sub'].textContent = sub;
    E['overlay-win'].classList.remove('hidden');
    AO.Store.recordWin(level, hearts);
  }

  function showLose(level) {
    E['overlay-lose'].classList.remove('hidden');
  }

  /* ---------- modals ---------- */

  function open(name) {
    closeAll();
    E['modal-' + name].classList.remove('hidden');
  }

  function closeAll() {
    ['overlay-win', 'overlay-lose', 'modal-menu', 'modal-levels', 'modal-howto'].forEach(function (id) {
      E[id].classList.add('hidden');
    });
  }

  /* ---------- HUD ---------- */

  function updateHUD(S) {
    /* hearts */
    var hearts = E['hearts'].children;
    for (var i = 0; i < hearts.length; i++) {
      hearts[i].classList.toggle('lost', i >= S.hearts);
    }
    /* level badge (bump animation on change) */
    if (S.level !== lastBadgeLevel) {
      lastBadgeLevel = S.level;
      E['level-badge'].textContent = 'Level ' + S.level;
      E['level-badge'].classList.remove('bump');
      void E['level-badge'].offsetWidth; /* restart CSS animation */
      E['level-badge'].classList.add('bump');
    }
    /* hint badge */
    E['hint-count'].textContent = S.hintsLeft;
    E['btn-hint'].classList.toggle('disabled', S.hintsLeft <= 0 || S.now < S.hintCooldownUntil);
    /* undo availability */
    E['btn-undo'].classList.toggle('disabled', S.undoStack.length === 0);
  }

  function updateUndo(count) {
    E['btn-undo'].classList.toggle('disabled', count === 0);
  }

  /* ---------- level select ---------- */

  function openLevels() {
    renderLevelSelect();
    closeAll();
    E['modal-levels'].classList.remove('hidden');
  }

  function renderLevelSelect() {
    var data = AO.Store.data;
    var unlocked = Math.max(1, data.level || 1);
    var maxShown = Math.max(12, unlocked + 5);
    var html = '';
    for (var n = 1; n <= maxShown; n++) {
      var stars = (data.stars && data.stars[n]) || 0;
      var cls = 'level-btn';
      if (n > unlocked) cls += ' locked';
      else if (n === unlocked) cls += ' current';
      else if (stars > 0) cls += ' done';
      html += '<button class="' + cls + '" data-level="' + n + '">' +
        '<span class="lvl-num">' + n + '</span>' +
        '<span class="lvl-stars">' +
        (n <= unlocked ? '★'.repeat(Math.min(3, stars)) + '<i>' + '★'.repeat(3 - Math.min(3, stars)) + '</i>' : '🔒') +
        '</span></button>';
    }
    E['level-grid'].innerHTML = html;
    E['level-grid'].querySelectorAll('.level-btn:not(.locked)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clickFx();
        closeAll();
        AO.Game.startLevel(parseInt(btn.getAttribute('data-level'), 10));
      });
    });
  }

  /* ---------- toast ---------- */

  function toast(msg) {
    E['toast'].textContent = msg;
    E['toast'].classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { E['toast'].classList.add('hidden'); }, 1800);
  }

  function clickFx() {
    if (AO.Sound) AO.Sound.play('click');
  }

  global.AO = global.AO || {};
  global.AO.UI = {
    init: init,
    showMenu: showMenu,
    showGame: showGame,
    showWin: showWin,
    showLose: showLose,
    updateHUD: updateHUD,
    updateUndo: updateUndo,
    openLevels: openLevels,
    renderLevelSelect: renderLevelSelect,
    setTheme: setTheme,
    closeAll: closeAll,
    toast: toast
  };
})(typeof window !== 'undefined' ? window : globalThis);
