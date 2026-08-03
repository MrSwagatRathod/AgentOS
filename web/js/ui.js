/* ============================================================================
 * Arrow Escape — UI controller (ArrowsGo-style)
 * Handles: top bar (level, hearts, mode tabs, hint, timer, new board,
 * fullscreen, settings), bottom bar (choose board, restart), modals
 * (settings / level select 700 / challenge 25), win & lose overlays, toasts.
 * Depends on: AO.Game, AO.Sound, AO.Store
 * ========================================================================== */
(function (global) {
  'use strict';

  var E = {};
  var toastTimer = null;
  var lastBadgeLevel = 0;

  function $(id) { return document.getElementById(id); }

  function init() {
    ['level-badge', 'hearts-text', 'mode-tabs', 'timer', 'time-val',
     'btn-hint', 'btn-newboard', 'btn-fullscreen', 'btn-settings',
     'btn-chooseboard', 'btn-restart',
     'modal-settings', 'settings-close', 'seg-display', 'seg-linewidth', 'seg-sound', 'seg-hints', 'seg-assist',
     'modal-levels', 'levels-close', 'levels-title', 'now-playing', 'level-grid',
     'modal-challenge', 'challenge-close', 'challenge-grid',
     'overlay-win', 'btn-assist', 'btn-win-home', 'btn-next',
     'overlay-lose', 'lose-title', 'lose-sub', 'btn-retry', 'btn-lose-home', 'btn-lose-levels',
     'toast', 'meta-theme'
    ].forEach(function (id) { E[id] = $(id); });

    /* ---- mode tabs ---- */
    E['mode-tabs'].querySelectorAll('.mode-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clickFx();
        var mode = btn.getAttribute('data-mode');
        AO.Game.switchMode(mode);
        setActiveTab(mode);
      });
    });

    /* ---- top bar actions ---- */
    E['btn-hint'].addEventListener('click', function () {
      clickFx();
      var S = AO.Game.getState();
      if (!S.hintsEnabled) { toast('Hints are off (Settings)'); return; }
      if (S.hintsLeft <= 0) toast('No hints left');
      else if (S.now < S.hintCooldownUntil) toast('Hint is recharging…');
      else AO.Game.hint();
    });
    E['btn-newboard'].addEventListener('click', function () { clickFx(); AO.Game.newBoard(); });
    E['btn-fullscreen'].addEventListener('click', function () { clickFx(); toggleFullscreen(); });
    E['btn-settings'].addEventListener('click', function () { clickFx(); closeAll(); open('settings'); });

    /* ---- bottom bar ---- */
    E['btn-chooseboard'].addEventListener('click', function () {
      clickFx();
      var S = AO.Game.getState();
      if (S.mode === 'challenge') openChallenge();
      else openLevels();
    });
    E['btn-restart'].addEventListener('click', function () { clickFx(); AO.Game.restartLevel(); });

    /* ---- settings close ---- */
    E['settings-close'].addEventListener('click', function () { clickFx(); closeAll(); });

    /* ---- level select ---- */
    E['levels-close'].addEventListener('click', function () { clickFx(); closeAll(); });

    /* ---- challenge select ---- */
    E['challenge-close'].addEventListener('click', function () { clickFx(); closeAll(); });

    /* ---- win / lose ---- */
    E['btn-next'].addEventListener('click', function () { clickFx(); AO.Game.nextLevel(); });
    E['btn-assist'].addEventListener('click', function () {
      clickFx();
      AO.Game.setAssistCursor(true);
      AO.Store.set('assistCursor', true);
      syncSeg(E['seg-assist'], 'on');
      closeAll();
    });
    E['btn-win-home'].addEventListener('click', function () { clickFx(); AO.Game.goMenu(); setActiveTab('main'); });
    E['btn-retry'].addEventListener('click', function () { clickFx(); AO.Game.restartLevel(); });
    E['btn-lose-home'].addEventListener('click', function () { clickFx(); AO.Game.goMenu(); setActiveTab('main'); });
    E['btn-lose-levels'].addEventListener('click', function () { clickFx(); openLevels(); });

    /* ---- segmented controls (settings) ---- */
    wireSeg(E['seg-display'], function (v) {
      AO.Store.set('display', v);
      AO.Game.setColorMode(v);
    });
    wireSeg(E['seg-linewidth'], function (v) {
      AO.Store.set('lineWidth', v);
      AO.Game.setLineWidth(v);
    });
    wireSeg(E['seg-sound'], function (v) {
      var on = v === 'on';
      AO.Store.set('sound', on);
      AO.Sound.setEnabled(on);
    });
    wireSeg(E['seg-hints'], function (v) {
      var on = v === 'on';
      AO.Store.set('hints', on);
      AO.Game.setHintsEnabled(on);
    });
    wireSeg(E['seg-assist'], function (v) {
      var on = v === 'on';
      AO.Store.set('assistCursor', on);
      AO.Game.setAssistCursor(on);
    });

    /* close modals on backdrop tap */
    ['modal-settings', 'modal-levels', 'modal-challenge'].forEach(function (id) {
      E[id].addEventListener('pointerdown', function (e) {
        if (e.target === E[id]) { clickFx(); closeAll(); }
      });
    });

    /* keyboard: F = fullscreen */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    });

    /* initial paint */
    applySettingsUI();
  }

  /* ---------- settings ---------- */
  function applySettingsUI() {
    var data = AO.Store.data;
    syncSeg(E['seg-display'], data.display || 'mono');
    syncSeg(E['seg-linewidth'], data.lineWidth || 'normal');
    syncSeg(E['seg-sound'], data.sound ? 'on' : 'off');
    syncSeg(E['seg-hints'], data.hints === false ? 'off' : 'on');
    syncSeg(E['seg-assist'], data.assistCursor ? 'on' : 'off');
    setActiveTab(data.mode || 'main');
  }

  function wireSeg(segEl, onChange) {
    segEl.querySelectorAll('.seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clickFx();
        syncSeg(segEl, btn.getAttribute('data-val'));
        onChange(btn.getAttribute('data-val'));
      });
    });
  }

  function syncSeg(segEl, val) {
    segEl.querySelectorAll('.seg-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-val') === val);
    });
  }

  function setActiveTab(mode) {
    E['mode-tabs'].querySelectorAll('.mode-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
  }

  /* ---------- screens ---------- */
  function showGame() {
    closeAll();
    var S = AO.Game.getState();
    setActiveTab(S.mode);
    updateHUD(S);
  }

  function showWin(S) {
    E['overlay-win'].classList.remove('hidden');
    AO.Store.recordWin(S.level, S.hearts);
  }

  function showLose(S) {
    if (S.loseReason === 'time') {
      E['lose-title'].textContent = "Time's up!";
      E['lose-sub'].textContent = 'You ran out of time. Try again — or pick a different board.';
    } else {
      E['lose-title'].textContent = 'Out of hearts';
      E['lose-sub'].textContent = 'Collisions cost hearts. Read the board, then tap.';
    }
    E['overlay-lose'].classList.remove('hidden');
  }

  function open(name) {
    closeAll();
    E['modal-' + name].classList.remove('hidden');
  }

  function closeAll() {
    ['overlay-win', 'overlay-lose', 'modal-settings', 'modal-levels', 'modal-challenge'].forEach(function (id) {
      E[id].classList.add('hidden');
    });
  }

  /* ---------- HUD ---------- */
  function updateHUD(S) {
    /* level badge + bump */
    if (S.level !== lastBadgeLevel) {
      lastBadgeLevel = S.level;
      E['level-badge'].textContent = 'Level ' + S.level;
      E['level-badge'].classList.remove('bump');
      void E['level-badge'].offsetWidth;
      E['level-badge'].classList.add('bump');
    }
    /* hearts */
    E['hearts-text'].textContent = S.hearts + ' / ' + AO.Game.MAX_HEARTS;
    /* timer */
    var mm = Math.floor(S.timerLeft / 60);
    var ss = Math.floor(S.timerLeft % 60);
    E['time-val'].textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    E['timer'].classList.toggle('warning', S.timerLeft <= 30);
    /* hint availability */
    E['btn-hint'].classList.toggle('disabled',
      !S.hintsEnabled || S.hintsLeft <= 0 || S.now < S.hintCooldownUntil);
    /* restart enabled */
    E['btn-restart'].classList.remove('disabled');
  }

  /* ---------- level select ---------- */
  function openLevels() {
    var data = AO.Store.data;
    E['levels-title'].textContent = 'Levels';
    E['now-playing'].textContent = '700 Levels · Now Playing: ' + String(AO.Game.getState().level).padStart(2, '0');
    var unlocked = Math.max(1, data.level || 1);
    var html = '';
    for (var n = 1; n <= AO.Game.LEVEL_COUNT; n++) {
      var cls = 'level-btn';
      if (n === AO.Game.getState().level) cls += ' current';
      else if (n < unlocked) cls += ' done';
      html += '<button class="' + cls + '" data-level="' + n + '">' + n + '</button>';
    }
    E['level-grid'].innerHTML = html;
    E['level-grid'].querySelectorAll('.level-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clickFx();
        closeAll();
        AO.Game.startLevel(parseInt(btn.getAttribute('data-level'), 10), AO.Game.getState().mode);
      });
    });
    closeAll();
    E['modal-levels'].classList.remove('hidden');
  }

  /* ---------- challenge select ---------- */
  function openChallenge() {
    var html = '';
    for (var n = 1; n <= AO.Game.CHALLENGE_COUNT; n++) {
      html += '<button class="level-btn" data-c="' + n + '">' + n + '</button>';
    }
    E['challenge-grid'].innerHTML = html;
    E['challenge-grid'].querySelectorAll('.level-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clickFx();
        closeAll();
        AO.Game.startLevel(parseInt(btn.getAttribute('data-c'), 10), 'challenge');
        setActiveTab('challenge');
      });
    });
    closeAll();
    E['modal-challenge'].classList.remove('hidden');
  }

  /* ---------- fullscreen ---------- */
  function toggleFullscreen() {
    var el = document.documentElement;
    var doc = document;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { try { req.call(el); } catch (e) { /* not supported */ } }
    } else {
      var exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) { try { exit.call(doc); } catch (e) { /* ignore */ } }
    }
  }

  /* ---------- toast ---------- */
  function toast(msg) {
    E['toast'].textContent = msg;
    E['toast'].classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { E['toast'].classList.add('hidden'); }, 2000);
  }

  function clickFx() {
    if (AO.Sound) AO.Sound.play('click');
  }

  global.AO = global.AO || {};
  global.AO.UI = {
    init: init,
    showGame: showGame,
    showWin: showWin,
    showLose: showLose,
    updateHUD: updateHUD,
    openLevels: openLevels,
    openChallenge: openChallenge,
    closeAll: closeAll,
    toast: toast
  };
})(typeof window !== 'undefined' ? window : globalThis);
