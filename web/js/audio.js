/* ============================================================================
 * Arrow Escape — Audio (WebAudio synthesis, no audio files needed)
 * ============================================================================
 * Lazily creates the AudioContext on first user gesture (autoplay policy).
 */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;
  var noiseBuf = null;

  function ensure() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      /* white-noise buffer reused by all noise-based sounds */
      var len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ensure() || !enabled) return;
    var t0 = ctx.currentTime + (when || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, when, filterFrom, filterTo, q) {
    if (!ensure() || !enabled) return;
    var t0 = ctx.currentTime + (when || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(filterFrom || 1200, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo || filterFrom || 400), t0 + dur);
    f.Q.value = q || 1.2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  var SOUNDS = {
    tap:      function () { tone(520, 0.09, 'triangle', 0.28, 0, 780); },
    /* soft whoosh: rising filtered noise + a rising pitch sweep */
    slide:    function () {
      noise(0.24, 0.30, 0, 420, 2600, 1.3);
      tone(220, 0.24, 'sine', 0.16, 0.01, 780);
    },
    /* tiny pop when the arrow leaves the board */
    pop:      function () {
      tone(940, 0.06, 'triangle', 0.26, 0, 1480);
      noise(0.04, 0.10, 0, 1800, 3200, 1.5);
    },
    error:    function () { tone(210, 0.16, 'square', 0.16, 0, 120); noise(0.12, 0.1, 0, 500, 200, 1); },
    heart:    function () { tone(150, 0.22, 'sawtooth', 0.14, 0, 70); },
    win:      function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(f, 0.34, 'triangle', 0.22, i * 0.09);
        tone(f * 2, 0.22, 'sine', 0.08, i * 0.09 + 0.02);
      });
      noise(0.5, 0.06, 0.1, 3000, 6000, 0.8);
    },
    lose:     function () {
      [392, 330, 262, 196].forEach(function (f, i) {
        tone(f, 0.3, 'sine', 0.18, i * 0.12);
      });
      tone(130, 0.5, 'triangle', 0.15, 0.45, 90);
    },
    click:    function () { tone(880, 0.05, 'sine', 0.15); },
    undo:     function () { tone(440, 0.08, 'triangle', 0.18, 0, 320); },
    hint:     function () { [660, 880, 1100].forEach(function (f, i) { tone(f, 0.1, 'sine', 0.16, i * 0.06); }); },
    start:    function () { [392, 523, 659].forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.2, i * 0.05); }); }
  };

  global.AO = global.AO || {};
  global.AO.Sound = {
    play: function (name) {
      if (!enabled) return;
      if (!ensure()) return;
      var fn = SOUNDS[name];
      if (fn) fn();
    },
    unlock: function () { ensure(); },
    setEnabled: function (on) { enabled = on; },
    isEnabled: function () { return enabled; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
