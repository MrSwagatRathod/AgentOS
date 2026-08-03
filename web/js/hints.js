/* ============================================================================
 * Arrow Escape — Hint Engine
 * ----------------------------------------------------------------------------
 * Chooses the best arrow to highlight when the player asks for a hint.
 * Strategy: pick the earliest arrow in the SOLUTION ORDER that is still on the
 * board — by the reverse-construction invariant it is always removable, and it
 * progresses the dependency chain toward the win condition.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* state: engine state containing puzzle + live arrow records.
   * Returns the ARROW ID of the best hint (earliest in solution order that is
   * still on the board and idle) or null. */
  function findNext(state) {
    if (!state || !state.puzzle) return null;
    var order = state.puzzle.removalOrder;
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      var a = state.live[id];
      if (a && a.onBoard && a.state === 'idle') return id;
    }
    return null;
  }

  /* Ids of all arrows whose head ray is currently clear (removable NOW). */
  function findRemovable(state) {
    var out = [];
    var board = state.puzzle.board;
    for (var i = 0; i < state.puzzle.arrows.length; i++) {
      var a = state.live[i];
      if (!a || !a.onBoard || a.state !== 'idle') continue;
      var p = state.puzzle.arrows[i];
      if (board.headRayClear(p.end.x, p.end.y, p.dir, p.id)) out.push(p.id);
    }
    return out;
  }

  global.AO = global.AO || {};
  global.AO.Hints = { findNext: findNext, findRemovable: findRemovable };
})(typeof window !== 'undefined' ? window : globalThis);
