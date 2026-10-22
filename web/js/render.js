/* Stitch Studio — realistic thread renderer.
   Draws stitches as rounded threads: soft shadow, dark edges, body shaded by
   direction (sheen) and a specular highlight. Stitches are batched by colour
   layer and stitch angle so tens of thousands of stitches draw quickly. */
(function (root) {
  'use strict';
  const R = {};
  const BUCKETS = 18, VAR = [0.9, 1.0, 1.09];   // 3 brightness variants per direction                       // angle buckets over 180°
  const LIGHT = -0.95;                      // light from upper-left (radians)

  function rgb(hex) { const n = parseInt(String(hex).replace('#', ''), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function css(c, a) { return a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function scale(c, f) { return c.map(v => Math.max(0, Math.min(255, v * f))); }
  function mix(c, t, a) { return c.map((v, i) => v + (t[i] - v) * a); }

  // per bucket shading: threads lying across the light are brighter (sheen)
  function shades(base0) {
    const out = [];
    for (let v = 0; v < VAR.length; v++) for (let b = 0; b < BUCKETS; b++) {
      const base = scale(base0, VAR[v]), L = lum(base);
      const k = 0.18 + 0.82 * Math.min(1, lum(base0) * 1.6);   // dark threads get a much subtler sheen
      const ang = (b + 0.5) / BUCKETS * Math.PI;
      const s = Math.abs(Math.sin(ang - LIGHT));              // 1 = stitch lies across the light
      const f = 0.74 + 0.36 * s;
      const hiA = (L < 0.12 ? 0.14 : L > 0.85 ? 0.6 : 0.42) * (0.3 + 0.7 * s);
      out.push({
        edge: css(scale(base, 0.42 + 0.08 * s)),               // where the thread dives into the fabric
        body: css(scale(base, f * 0.86)),                      // thread body
        mid: css(mix(scale(base, f), [255, 245, 225], (0.06 + 0.10 * s) * k)),   // rounded crown
        c1: css(mix(scale(base, f * 1.04), [255, 248, 230], (0.16 + 0.12 * s) * k), 0.85),   // centre light, outer
        c2: css(mix(scale(base, f * 1.08), [255, 250, 236], (0.30 + 0.16 * s) * k), 0.8),    // centre light, inner
        c3: css(mix(scale(base, f * 1.1), [255, 252, 244], (0.52 + 0.18 * s) * k), 0.55 + 0.3 * s), // hottest streak
        ply: css(scale(base, 0.62 + 0.1 * s), 0.55),           // twist grooves
        hi: css(mix(scale(base, f), [255, 250, 235], 0.6 * k), hiA) // specular glint
      });
    }
    return out;
  }

  // shorten a segment symmetrically by fraction t of its length at each end
  function inset(p, x0, y0, x1, y1, t) { const dx = (x1 - x0) * t, dy = (y1 - y0) * t; p.moveTo(x0 + dx, y0 + dy); p.lineTo(x1 - dx, y1 - dy); }

  /* layers: [{color:'#rrggbb', lines:[[[x,y],...], ...]}] in sewing order (mm)
     view: {s, x, y} px per mm + offset ; opt: {thread(mm), limit(stitches)} */
  R.draw = function (ctx, layers, view, opt) {
    opt = opt || {};
    const w = Math.max(0.7, (opt.thread || 0.42) * view.s);
    const sh = Math.max(0.5, 0.08 * view.s);
    let budget = opt.limit == null ? Infinity : opt.limit;
    ctx.save();
    ctx.lineJoin = 'round';
    const X = p => p[0] * view.s + view.x, Y = p => p[1] * view.s + view.y;
    for (const layer of layers) {
      if (budget <= 0) break;
      const sd = shades(rgb(layer.color));
      let P, used = 0;
      const NB = BUCKETS * VAR.length; const mk = () => { const a = []; for (let b = 0; b < NB; b++) a.push(new Path2D()); return a; };
      const reset = () => { P = { full: mk(), body: mk(), mid: mk(), c1: mk(), c2: mk(), c3: mk(), hi: mk(), shadow: new Path2D() }; used = 0; };
      const flush = () => {
        if (!used) return;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = w * 1.15; ctx.stroke(P.shadow);
        for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].edge; ctx.lineWidth = w; ctx.stroke(P.full[b]); }
        for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].body; ctx.lineWidth = w * 0.72; ctx.stroke(P.body[b]); }
        for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].mid; ctx.lineWidth = w * 0.5; ctx.stroke(P.mid[b]); }
        // light down the centre of the column: brighter, narrower bands toward the middle of each stitch
        for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].c1; ctx.lineWidth = w * 0.56; ctx.stroke(P.c1[b]); }
        for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].c2; ctx.lineWidth = w * 0.5; ctx.stroke(P.c2[b]); }
        for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].c3; ctx.lineWidth = w * 0.42; ctx.stroke(P.c3[b]); }
        if (w > 1.4) for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].hi; ctx.lineWidth = Math.max(0.6, w * 0.2); ctx.stroke(P.hi[b]); }
        reset();
      };
      reset();
      for (const ln of layer.lines) {
        if (budget <= 0) break;
        if (used > 500) flush();
        for (let i = 1; i < ln.length; i++) {
          if (budget-- <= 0) break;
          const a = ln[i - 1], c = ln[i];
          const x0 = X(a), y0 = Y(a), x1 = X(c), y1 = Y(c);
          const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
          if (L2 < 0.04) continue;
          let ang = Math.atan2(dy, dx); if (ang < 0) ang += Math.PI; if (ang >= Math.PI) ang -= Math.PI;
          const h = (Math.imul(i + 1, 2654435761) ^ Math.imul(ln.length + 7, 40503)) >>> 0; const b = (h % 3) * BUCKETS + Math.min(BUCKETS - 1, Math.floor(ang / Math.PI * BUCKETS));
          const len = Math.sqrt(L2), e = Math.min(0.35, w * 0.55 / len);   // end darkening scales with thread width
          P.full[b].moveTo(x0, y0); P.full[b].lineTo(x1, y1);
          inset(P.body[b], x0, y0, x1, y1, e * 0.5);
          inset(P.mid[b], x0, y0, x1, y1, Math.min(0.4, e * 1.2 + 0.08));
          // centre band: only on stitches long enough to read as a column (satin), with a little natural jitter
          if (len > w * 2.5) {
            const j = ((h >>> 8) % 100) / 100 * 0.05 - 0.025;
            const sx = (x1 - x0) * j, sy = (y1 - y0) * j;
            inset(P.c1[b], x0 + sx, y0 + sy, x1 + sx, y1 + sy, 0.24);
            inset(P.c2[b], x0 + sx, y0 + sy, x1 + sx, y1 + sy, 0.33);
            inset(P.c3[b], x0 + sx, y0 + sy, x1 + sx, y1 + sy, 0.41);
          }
          // glint sits slightly towards the light, on the crown of the thread
          const ox = -w * 0.12, oy = -w * 0.16;
          inset(P.hi[b], x0 + ox, y0 + oy, x1 + ox, y1 + oy, Math.min(0.42, e * 1.6 + 0.16));
          P.shadow.moveTo(x0 + sh, y0 + sh * 1.3); P.shadow.lineTo(x1 + sh, y1 + sh * 1.3);
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
