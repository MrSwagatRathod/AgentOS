/* ============================================================================
 * Arrow Escape — Difficulty Manager
 * ----------------------------------------------------------------------------
 * Maps level number → generation parameters. Difficulty increases along THREE
 * independent axes (never by randomness alone):
 *   1. BOARD: larger boards / more playable cells (monotonic growth)
 *   2. ARROWS: longer paths (3-4 cells → 9-16 cells)
 *   3. LOGIC: fewer instantly-removable arrows (maxStartRatio shrinks) and
 *      denser boards → deeper dependency chains + misleading removable arrows
 * ========================================================================== */
(function (global) {
  'use strict';

  /* Board schedule chosen so PLAYABLE CELLS grow with every band:
   *   3x3(9) → 4x4(16) → 5x5(25) → 6x6(36) → circle8(44) → heart8(52) →
   *   cross9(65) → rect9(81) → rect10(100)
   * Fill stays ~0.88-0.92 (long paths can pack ~90% of cells).
   * maxStartRatio values are calibrated so retries rarely burn out. */
  function levelParams(level) {
    if (level < 3)   return { size: 3, shape: 'rect',  fill: 0.80, minFill: 0.70, lenMin: 2, lenMax: 4, maxArrows: 10, maxStartRatio: 1.0 };
    if (level < 6)   return { size: 4, shape: 'rect',  fill: 0.85, minFill: 0.75, lenMin: 3, lenMax: 5, maxArrows: 14, maxStartRatio: 0.9 };
    if (level < 11)  return { size: 5, shape: 'rect',  fill: 0.88, minFill: 0.80, lenMin: 3, lenMax: 6, maxArrows: 18, maxStartRatio: 0.8 };
    if (level < 19)  return { size: 6, shape: 'rect',  fill: 0.90, minFill: 0.82, lenMin: 4, lenMax: 7, maxArrows: 22, maxStartRatio: 0.7 };
    if (level < 31)  return { size: 8, shape: 'circle', fill: 0.90, minFill: 0.82, lenMin: 4, lenMax: 8, maxArrows: 22, maxStartRatio: 0.6 };
    if (level < 46)  return { size: 8, shape: 'heart', fill: 0.90, minFill: 0.82, lenMin: 5, lenMax: 9, maxArrows: 24, maxStartRatio: 0.55 };
    if (level < 61)  return { size: 9, shape: 'cross', fill: 0.90, minFill: 0.82, lenMin: 5, lenMax: 10, maxArrows: 26, maxStartRatio: 0.55 };
    if (level < 81)  return { size: 9, shape: 'rect',  fill: 0.90, minFill: 0.84, lenMin: 6, lenMax: 11, maxArrows: 28, maxStartRatio: 0.70 };
    if (level < 101) return { size: 10, shape: 'rect', fill: 0.90, minFill: 0.84, lenMin: 7, lenMax: 13, maxArrows: 30, maxStartRatio: 0.68 };
    return { size: 10, shape: 'rect', fill: 0.90, minFill: 0.84, lenMin: 8, lenMax: 16, maxArrows: 32, maxStartRatio: 0.66 };
  }

  /* Human-readable difficulty label (used by tests + future UI). */
  function label(level) {
    if (level < 6) return 'easy';
    if (level < 19) return 'medium';
    if (level < 46) return 'hard';
    if (level < 81) return 'expert';
    return 'master';
  }

  global.AO = global.AO || {};
  global.AO.Difficulty = { levelParams: levelParams, label: label };
})(typeof window !== 'undefined' ? window : globalThis);
