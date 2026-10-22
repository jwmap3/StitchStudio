/* Stitch Studio — realistic thread renderer.
   Draws stitches as rounded threads: soft shadow, dark edges, body shaded by
   direction (sheen) and a specular highlight. Stitches are batched by colour
   layer and stitch angle so tens of thousands of stitches draw quickly. */
(function (root) {
  'use strict';
  const R = {};
  const BUCKETS = 18;                       // angle buckets over 180°
  const LIGHT = -0.95;                      // light from upper-left (radians)

  function rgb(hex) { const n = parseInt(String(hex).replace('#', ''), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function css(c, a) { return a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function scale(c, f) { return c.map(v => Math.max(0, Math.min(255, v * f))); }
  function mix(c, t, a) { return c.map((v, i) => v + (t[i] - v) * a); }

  // per bucket shading: threads lying across the light are brighter (sheen)
  function shades(base) {
    const L = lum(base), out = [];
    for (let b = 0; b < BUCKETS; b++) {
      const ang = (b + 0.5) / BUCKETS * Math.PI;           // 0..PI
      const s = Math.abs(Math.sin(ang - LIGHT));             // 1 = perpendicular to light
      const f = 0.78 + 0.34 * s;
      const body = scale(base, f);
      const edge = scale(base, 0.52 + 0.1 * s);
      const hiA = (L < 0.12 ? 0.10 : L > 0.85 ? 0.55 : 0.32) * (0.35 + 0.65 * s);
      const hi = mix(body, [255, 255, 255], 0.55);
      out.push({ body: css(body), edge: css(edge), hi: css(hi, hiA) });
    }
    return out;
  }

  /* layers: [{color:'#rrggbb', lines:[[[x,y],...], ...]}] in sewing order (mm)
     view: {s, x, y} px per mm + offset ; opt: {thread(mm), limit(stitches)} */
  R.draw = function (ctx, layers, view, opt) {
    opt = opt || {};
    const w = Math.max(0.7, (opt.thread || 0.42) * view.s);
    const sh = Math.max(0.5, 0.07 * view.s);
    let budget = opt.limit == null ? Infinity : opt.limit;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const X = p => p[0] * view.s + view.x, Y = p => p[1] * view.s + view.y;
    for (const layer of layers) {
      if (budget <= 0) break;
      const sd = shades(rgb(layer.color));
      let paths, shadow, used = 0;
      const reset = () => { paths = []; for (let b = 0; b < BUCKETS; b++) paths.push(new Path2D()); shadow = new Path2D(); used = 0; };
      // draw in sewing order: flush every few hundred stitches so later stitches sit on top of earlier ones
      const flush = () => {
        if (!used) return;
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = w * 1.1; ctx.stroke(shadow);
        for (let b = 0; b < BUCKETS; b++) { ctx.strokeStyle = sd[b].edge; ctx.lineWidth = w; ctx.stroke(paths[b]); }
        for (let b = 0; b < BUCKETS; b++) { ctx.strokeStyle = sd[b].body; ctx.lineWidth = w * 0.7; ctx.stroke(paths[b]); }
        if (w > 1.6) for (let b = 0; b < BUCKETS; b++) { ctx.strokeStyle = sd[b].hi; ctx.lineWidth = Math.max(0.6, w * 0.22); ctx.stroke(paths[b]); }
        reset();
      };
      reset();
      for (const ln of layer.lines) {
        if (budget <= 0) break;
        if (used > 600) flush();
        for (let i = 1; i < ln.length; i++) {
          if (budget-- <= 0) break;
          const a = ln[i - 1], c = ln[i];
          const x0 = X(a), y0 = Y(a), x1 = X(c), y1 = Y(c);
          const dx = x1 - x0, dy = y1 - y0;
          if (dx * dx + dy * dy < 0.04) continue;
          let ang = Math.atan2(dy, dx); if (ang < 0) ang += Math.PI; if (ang >= Math.PI) ang -= Math.PI;
          const b = Math.min(BUCKETS - 1, Math.floor(ang / Math.PI * BUCKETS));
          paths[b].moveTo(x0, y0); paths[b].lineTo(x1, y1);
          shadow.moveTo(x0 + sh, y0 + sh * 1.3); shadow.lineTo(x1 + sh, y1 + sh * 1.3);
          used++;
        }
      }
      flush();
    }
    ctx.restore();
  };

  // subtle woven fabric texture
  const patCache = {};
  R.fabric = function (ctx, color) {
    if (patCache[color]) return patCache[color];
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d'); const base = rgb(color);
    g.fillStyle = css(base); g.fillRect(0, 0, 8, 8);
    const dk = lum(base) > 0.5 ? scale(base, 0.93) : scale(base, 1.25).map(v => Math.min(255, v + 6));
    g.fillStyle = css(dk, 0.6);
    for (let i = 0; i < 8; i += 2) { g.fillRect(i, 0, 1, 8); }
    g.fillStyle = css(dk, 0.35);
    for (let j = 1; j < 8; j += 2) { g.fillRect(0, j, 8, 1); }
    return (patCache[color] = ctx.createPattern(c, 'repeat'));
  };

  root.Render = R;
})(typeof window !== 'undefined' ? window : globalThis);
