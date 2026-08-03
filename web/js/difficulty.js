/* ============================================================================
 * Arrow Escape — Difficulty Manager
 * ----------------------------------------------------------------------------
 * Maps level number → generation parameters for the 700-level main library,
 * plus the 25-board Challenge set. Difficulty grows along three axes:
 * board size (9 → 100 cells), arrow length (2-4 → 8-16 cells), and logic
 * density (start-ratio target shrinks slowly).
 * ========================================================================== */
(function (global) {
  'use strict';

  function levelParams(level) {
    if (level < 3)   return { size: 3, shape: 'rect',   fill: 0.80, minFill: 0.70, lenMin: 2, lenMax: 4,  maxArrows: 10, maxStartRatio: 1.0 };
    if (level < 6)   return { size: 4, shape: 'rect',   fill: 0.85, minFill: 0.75, lenMin: 3, lenMax: 5,  maxArrows: 14, maxStartRatio: 0.9 };
    if (level < 11)  return { size: 5, shape: 'rect',   fill: 0.88, minFill: 0.80, lenMin: 3, lenMax: 6,  maxArrows: 18, maxStartRatio: 0.85 };
    if (level < 19)  return { size: 6, shape: 'rect',   fill: 0.90, minFill: 0.82, lenMin: 4, lenMax: 7,  maxArrows: 22, maxStartRatio: 0.8 };
    if (level < 31)  return { size: 8, shape: 'circle', fill: 0.90, minFill: 0.82, lenMin: 4, lenMax: 8,  maxArrows: 22, maxStartRatio: 0.75 };
    if (level < 46)  return { size: 8, shape: 'heart',  fill: 0.90, minFill: 0.82, lenMin: 5, lenMax: 9,  maxArrows: 24, maxStartRatio: 0.7 };
    if (level < 61)  return { size: 9, shape: 'cross',  fill: 0.90, minFill: 0.82, lenMin: 5, lenMax: 10, maxArrows: 26, maxStartRatio: 0.65 };
    if (level < 81)  return { size: 9, shape: 'rect',   fill: 0.90, minFill: 0.84, lenMin: 6, lenMax: 11, maxArrows: 28, maxStartRatio: 0.6 };
    if (level < 101) return { size: 10, shape: 'rect',  fill: 0.90, minFill: 0.84, lenMin: 7, lenMax: 13, maxArrows: 30, maxStartRatio: 0.58 };
    if (level < 151) return { size: 10, shape: 'rect',  fill: 0.90, minFill: 0.84, lenMin: 7, lenMax: 14, maxArrows: 32, maxStartRatio: 0.56 };
    if (level < 201) return { size: 10, shape: 'rect',  fill: 0.90, minFill: 0.84, lenMin: 8, lenMax: 15, maxArrows: 32, maxStartRatio: 0.54 };
    if (level < 251) return { size: 10, shape: 'rect',  fill: 0.90, minFill: 0.84, lenMin: 8, lenMax: 15, maxArrows: 34, maxStartRatio: 0.52 };
    if (level < 301) return { size: 10, shape: 'rect',  fill: 0.90, minFill: 0.84, lenMin: 8, lenMax: 16, maxArrows: 34, maxStartRatio: 0.50 };
    if (level < 401) return { size: 10, shape: 'rect',  fill: 0.90, minFill: 0.84, lenMin: 9, lenMax: 16, maxArrows: 34, maxStartRatio: 0.48 };
    if (level < 501) return { size: 10, shape: 'rect',  fill: 0.90, minFill: 0.84, lenMin: 9, lenMax: 17, maxArrows: 36, maxStartRatio: 0.46 };
    if (level < 601) return { size: 10, shape: 'rect',  fill: 0.90, minFill: 0.84, lenMin: 10, lenMax: 17, maxArrows: 36, maxStartRatio: 0.44 };
    return { size: 10, shape: 'rect', fill: 0.90, minFill: 0.84, lenMin: 10, lenMax: 18, maxArrows: 38, maxStartRatio: 0.42 };
  }

  /* 25 dedicated Challenge boards — harder, denser, longer arrows. */
  function challengeParams(index) {
    var base = levelParams(400 + index * 12);
    base.fill = Math.max(base.fill, 0.90);
    return base;
  }

  function label(level) {
    if (level < 6) return 'easy';
    if (level < 19) return 'medium';
    if (level < 46) return 'hard';
    if (level < 81) return 'expert';
    return 'master';
  }

  global.AO = global.AO || {};
  global.AO.Difficulty = {
    levelParams: levelParams,
    challengeParams: challengeParams,
    label: label
  };
})(typeof window !== 'undefined' ? window : globalThis);
