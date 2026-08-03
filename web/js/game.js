/* ============================================================================
 * Arrow Escape — Game Facade
 * ----------------------------------------------------------------------------
 * Public API used by the UI, boot code, and tests. Thin wrapper over
 * AO.Engine so screens/keyboard/main never depend on engine internals.
 * ========================================================================== */
(function (global) {
  'use strict';

  var Engine = (global.AO || {}).Engine;

  global.AO = global.AO || {};
  global.AO.Game = {
    startLevel: function (l) { Engine.startLevel(l); },
    restartLevel: function () { Engine.restartLevel(); },
    nextLevel: function () { Engine.nextLevel(); },
    goMenu: function () { Engine.goMenu(); },
    undo: function () { Engine.undo(); },
    hint: function () { Engine.hint(); },
    tapCell: function (x, y) { Engine.tapCell(x, y); },
    applyTheme: function () { Engine.applyTheme(); },
    setup: function () { Engine.setup(); },
    isPlaying: function () { return Engine.isPlaying(); },
    getState: function () { return Engine.getState(); },
    debugAnims: function () { return Engine.debugAnims(); },
    debugParts: function () { return Engine.debugParts(); },
    debugSlideDraws: function () { return Engine.debugSlideDraws(); },
    debugRemovable: function () { return Engine.debugRemovable(); },
    MAX_HEARTS: Engine.MAX_HEARTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
