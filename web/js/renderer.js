/* ============================================================================
 * Arrow Escape — Vector Renderer
 * ----------------------------------------------------------------------------
 * Draws long arrows as single continuous vector paths:
 *   - rounded caps & joins, uniform stroke
 *   - smooth 90° corner bends (quadratic curves), never hard corners
 *   - filled, clean, symmetric arrowhead scaled with stroke width
 *   - soft offset shadow (no ctx.shadowBlur — cheaper on mobile GPUs)
 * No sprites — everything is canvas vector paths.
 * ========================================================================== */
(function (global) {
  'use strict';

  var THEMES = {
    light: {
      arrow: '#1c3253',          /* dark navy on white */
      hint: '#ff3b30',
      grid: '#eef1f6',
      shadow: 'rgba(28, 50, 83, 0.14)',
      glow: 'rgba(255, 59, 48, 0.30)'
    },
    dark: {
      arrow: '#e8edf7',
      hint: '#ff453a',
      grid: '#1c1c22',
      shadow: 'rgba(0, 0, 0, 0.5)',
      glow: 'rgba(255, 69, 58, 0.35)'
    }
  };

  var theme = THEMES.light;

  function setTheme(name) { theme = THEMES[name] || THEMES.light; }
  function palette() { return theme; }

  /* ---- precomputed rounded-corner path for an arrow ---- */
  /* pts: [{x,y}...] cell centers of the path; returns draw commands:
   *   { move: {x,y}, line: [pt,...], quads: [{c:{x,y}, e:{x,y}}...] } */
  function buildPath(pts, radius) {
    var n = pts.length;
    if (n < 3) return { move: pts[0] || { x: 0, y: 0 }, line: pts.slice(1), quads: [] };

    var line = [];
    var quads = [];
    var move = { x: pts[0].x, y: pts[0].y };
    var prev = pts[0];
    for (var i = 1; i < n - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var d1 = Math.hypot(b.x - a.x, b.y - a.y);
      var d2 = Math.hypot(c.x - b.x, c.y - b.y);
      var r = Math.min(radius, d1 * 0.5, d2 * 0.5);
      if (r < 1) {
        line.push(b);
        prev = b;
        continue;
      }
      /* entry point on segment a→b, exit point on segment b→c */
      var e1 = { x: b.x - (b.x - a.x) / d1 * r, y: b.y - (b.y - a.y) / d1 * r };
      var e2 = { x: b.x + (c.x - b.x) / d2 * r, y: b.y + (c.y - b.y) / d2 * r };
      line.push(e1);
      quads.push({ c: b, e: e2 });
    }
    line.push(pts[n - 1]);
    return { move: move, line: line, quads: quads };
  }

  /* Stroke a precomputed path with the given style. */
  function strokePath(ctx, path, color, width, alpha, offsetX, offsetY) {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(path.move.x, path.move.y);
    for (var i = 0; i < path.line.length; i++) ctx.lineTo(path.line[i].x, path.line[i].y);
    for (var j = 0; j < path.quads.length; j++) {
      ctx.quadraticCurveTo(path.quads[j].c.x, path.quads[j].c.y, path.quads[j].e.x, path.quads[j].e.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* Filled arrowhead at the head cell, pointing `dir`. */
  function drawHead(ctx, hx, hy, dir, cell, color, alpha, offsetX, offsetY, scale) {
    var s = scale == null ? 1 : scale;
    var len = cell * 0.52 * s;   /* head length (tip sticks out of the cell) */
    var back = cell * 0.20 * s;
    var halfW = cell * 0.19 * s;
    var ux = 0, uy = 0, px = 0, py = 0;
    if (dir === 0) { uy = -1; py = 1; }
    else if (dir === 1) { ux = 1; px = -1; }
    else if (dir === 2) { uy = 1; py = -1; }
    else { ux = -1; px = 1; }

    var tx = hx + ux * len;
    var ty = hy + uy * len;
    var bx = hx - ux * back;
    var by = hy - uy * back;
    var wx = px * halfW, wy = py * halfW;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx + wx, by + wy);
    ctx.lineTo(bx - wx, by - wy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* Full arrow draw: soft shadow underlay + main stroke + arrowhead. */
  function drawArrow(ctx, path, hx, hy, dir, cell, opts) {
    opts = opts || {};
    var color = opts.color || theme.arrow;
    var alpha = opts.alpha == null ? 1 : opts.alpha;
    var width = opts.width || Math.max(3, cell * 0.22);
    var ox = opts.ox || 0, oy = opts.oy || 0;

    if (opts.shadow !== false) {
      /* soft shadow: wider, darker stroke offset by 2px (fast, no blur) */
      ctx.save();
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = theme.shadow;
      ctx.lineWidth = width + 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(path.move.x + ox, path.move.y + oy + 2.5);
      for (var i = 0; i < path.line.length; i++) ctx.lineTo(path.line[i].x + ox, path.line[i].y + oy + 2.5);
      for (var j = 0; j < path.quads.length; j++) {
        ctx.quadraticCurveTo(path.quads[j].c.x + ox, path.quads[j].c.y + oy + 2.5,
          path.quads[j].e.x + ox, path.quads[j].e.y + oy + 2.5);
      }
      ctx.stroke();
      ctx.restore();
    }

    strokePath(ctx, path, color, width, alpha, ox, oy);
    drawHead(ctx, hx, hy, dir, cell, color, alpha, ox, oy, opts.headScale);
  }

  /* Draw the hint: the arrow in red + its head ray as a dashed line. */
  function drawHintArrow(ctx, arrow, path, hx, hy, cell, rayPts, pulse) {
    var alpha = 0.75 + pulse * 0.25;
    drawArrow(ctx, path, hx, hy, arrow.dir, cell, { color: theme.hint, alpha: alpha, width: cell * 0.26 });
    /* dashed head-ray guide */
    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.35;
    ctx.strokeStyle = theme.hint;
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.setLineDash([cell * 0.28, cell * 0.2]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < rayPts.length; i++) {
      if (i === 0) ctx.moveTo(rayPts[i].x, rayPts[i].y);
      else ctx.lineTo(rayPts[i].x, rayPts[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  global.AO = global.AO || {};
  global.AO.Renderer = {
    setTheme: setTheme,
    palette: palette,
    buildPath: buildPath,
    strokePath: strokePath,
    drawHead: drawHead,
    drawArrow: drawArrow,
    drawHintArrow: drawHintArrow
  };
})(typeof window !== 'undefined' ? window : globalThis);
