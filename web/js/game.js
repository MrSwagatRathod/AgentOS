/* ============================================================================
 * Arrow Escape — Game Facade
 * ----------------------------------------------------------------------------
 * Public API used by the UI, boot code, and tests. Thin wrapper over
 * AO.Engine + AO.Renderer so screens/keyboard/main never depend on internals.
 * ========================================================================== */
(function (global) {
  'use strict';

  var Engine = (global.AO || {}).Engine;
  var Renderer = (global.AO || {}).Renderer;

  global.AO = global.AO || {};
  global.AO.Game = {
    startLevel: function (l, mode) { Engine.startLevel(l, mode); },
    restartLevel: function () { Engine.restartLevel(); },
    nextLevel: function () { Engine.nextLevel(); },
    goMenu: function () { Engine.goMenu(); },
    switchMode: function (mode) { Engine.switchMode(mode); },
    newBoard: function () { Engine.newBoard(); },
    undo: function () { Engine.undo(); },
    hint: function () { Engine.hint(); },
    setHintsEnabled: function (on) { Engine.setHintsEnabled(on); },
    setAssistCursor: function (on) { Engine.setAssistCursor(on); },
    setColorMode: function (mode) { Renderer.setColorMode(mode); },
    setLineWidth: function (w) { Renderer.setLineWidth(w); },
    tapCell: function (x, y) { Engine.tapCell(x, y); },
    applyTheme: function () { Engine.applyTheme(); },
    setup: function () { Engine.setup(); },
    isPlaying: function () { return Engine.isPlaying(); },
    getState: function () { return Engine.getState(); },
    debugAnims: function () { return Engine.debugAnims(); },
    debugParts: function () { return Engine.debugParts(); },
    debugSlideDraws: function () { return Engine.debugSlideDraws(); },
    debugRemovable: function () { return Engine.debugRemovable(); },
    MAX_HEARTS: Engine.MAX_HEARTS,
    LEVEL_COUNT: Engine.LEVEL_COUNT,
    CHALLENGE_COUNT: Engine.CHALLENGE_COUNT
  };
})(typeof window !== 'undefined' ? window : globalThis);
