/* Stitch Studio — realistic thread renderer.
   Draws stitches as rounded threads: soft shadow, dark edges, body shaded by
   direction (sheen) and a specular highlight. Stitches are batched by colour
   layer and stitch angle so tens of thousands of stitches draw quickly. */
(function (root) {
  'use strict';
  const R = {};
  const BUCKETS = 18, VAR = [0.965, 1.0, 1.035];   // 3 brightness variants per direction                       // angle buckets over 180°
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
  // ===== GPU renderer: every stitch is a lit, twisted thread (Kajiya-Kay sheen, rounded ends, cast shadows)
  const G = { ok: null };
  function glInit() {
    if (G.ok !== null) return G.ok;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
      if (!gl) return (G.ok = false);
      const vs = `#version 300 es
      layout(location=0) in vec2 corner;            // x: 0..1 along, y: -1..1 across
      layout(location=1) in vec4 seg;               // x0 y0 x1 y1 (device px)
      layout(location=2) in vec4 col;               // rgb + seed
      uniform vec2 res; uniform float hw; uniform float grow; uniform vec2 off;
      out vec2 vA; out float vT; out float vLen; out vec3 vCol; out float vSeed; out vec2 vDir;
      void main(){
        vec2 p0=seg.xy, p1=seg.zw, d=p1-p0; float L=max(length(d),0.001); vec2 t=d/L, n=vec2(-t.y,t.x);
        float h=hw*grow, ext=h;
        float a=mix(-ext, L+ext, corner.x);
        vec2 p=p0+t*a+n*corner.y*h+off;
        vA=vec2(a, L); vT=corner.y; vLen=L; vCol=col.rgb; vSeed=col.a; vDir=t;
        gl_Position=vec4(p.x/res.x*2.0-1.0, 1.0-p.y/res.y*2.0, 0.0, 1.0);
      }`;
      const fs = `#version 300 es
      precision highp float;
      in vec2 vA; in float vT; in float vLen; in vec3 vCol; in float vSeed; in vec2 vDir;
      uniform float hw; uniform float pxmm; uniform float shadowPass; uniform float grow;
      out vec4 o;
      void main(){
        float h=hw*grow;
        float a=vA.x, L=vA.y;
        float across=vT*h;                               // px from centre line
        float e=min(a, L-a);                             // px from nearest end (negative past the end)
        // capsule with a gentle taper where the thread dives into the fabric
        float shrink=mix(0.55,1.0,smoothstep(-0.2*hw, 1.4*hw, e));
        float ec=max(-e,0.0);
        float r=sqrt(across*across+ec*ec)/(h*shrink);
        if(r>1.0) discard;
        if(shadowPass>0.5){
          float s=(1.0-r); o=vec4(0.0,0.0,0.0,0.24*s*s); return;
        }
        float t=clamp(across/(hw*shrink),-1.0,1.0);
        float nz=sqrt(max(1.0-t*t,0.0));
        vec2 perp=vec2(-vDir.y,vDir.x);
        vec3 N=normalize(vec3(perp*t, nz));
        vec3 Lg=normalize(vec3(-0.45,-0.62,0.65));
        vec3 V=vec3(0.0,0.0,1.0), H=normalize(Lg+V), T=vec3(vDir,0.0);
        float ndl=max(dot(N,Lg),0.0);
        float diff=0.66+0.42*ndl;
        float th=dot(T,H), sinTH=sqrt(max(1.0-th*th,0.0));
        // twisted ply: diagonal grooves along the thread
        float amm=a/pxmm;
        float ply=0.5+0.5*sin((amm/0.33+t*0.85)*6.2832+vSeed*6.0);
        float plyAmt=smoothstep(2.5,7.0,hw)*0.16;
        float spec=pow(sinTH,48.0)*smoothstep(-0.1,0.5,ndl)*(1.0-plyAmt*1.6*(1.0-ply));
        float lum=dot(vCol,vec3(0.2126,0.7152,0.0722));
        vec3 base=vCol*(0.96+0.08*vSeed);
        vec3 c=base*diff*(1.0-plyAmt+plyAmt*2.0*ply*0.5+plyAmt*0.5);
        c+=mix(base,vec3(1.0,0.98,0.94),0.6)*spec*(0.28+0.5*smoothstep(0.03,0.5,lum));
        // occlusion: dark where the thread enters the fabric and along its sides
        float ao=mix(0.62,1.0,smoothstep(0.0,2.0*hw,e))*(0.84+0.16*nz);
        c*=ao;
        float aa=clamp((1.0-r)*max(h,1.6)/0.7,0.0,1.0);
        o=vec4(c*aa, aa);
      }`;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
      const U = n => gl.getUniformLocation(prog, n);
      Object.assign(G, { ok: true, c, gl, prog, vao, ib, u: { res: U('res'), hw: U('hw'), grow: U('grow'), off: U('off'), pxmm: U('pxmm'), shadowPass: U('shadowPass') }, cap: 0 });
    } catch (e) { console.warn('WebGL thread renderer unavailable:', e); G.ok = false; }
    return G.ok;
  }
  function drawGL(ctx, layers, view, opt) {
    const W = ctx.canvas.width, H = ctx.canvas.height, m = ctx.getTransform(), dpr = m.a || 1;
    const { c, gl, u } = G;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const s = view.s * dpr, ox = view.x * dpr + m.e * 0, oy = view.y * dpr;
    const hw = Math.max(1.1, Math.max(opt.thread || 0.46, 0.54) * s / 2);   // thread flattens on fabric: ~0.54 mm wide
    let budget = opt.limit == null ? Infinity : opt.limit;
    // pack instances (device px), split per colour layer
    let total = 0; layers.forEach(l => l.lines.forEach(ln => total += Math.max(0, ln.length - 1)));
    total = Math.min(total, budget);
    if (G.cap < total) { G.cap = Math.ceil(total * 1.25) + 1024; G.buf = new Float32Array(G.cap * 8); }
    const buf = G.buf, ranges = []; let n = 0;
    let seed = 0.37;
    for (const layer of layers) {
      if (budget <= 0) break;
      const rgbc = rgb(layer.color).map(v => v / 255), start = n;
      for (const ln of layer.lines) {
        if (budget <= 0) break;
        for (let i = 1; i < ln.length; i++) {
          if (budget-- <= 0) break;
          const a = ln[i - 1], b = ln[i];
          const x0 = a[0] * s + ox, y0 = a[1] * s + oy, x1 = b[0] * s + ox, y1 = b[1] * s + oy;
          if ((x0 < -50 && x1 < -50) || (y0 < -50 && y1 < -50) || (x0 > W + 50 && x1 > W + 50) || (y0 > H + 50 && y1 > H + 50)) continue;
          seed = (seed * 9301 + 49297) % 233280 / 233280;
          const k = n * 8; buf[k] = x0; buf[k + 1] = y0; buf[k + 2] = x1; buf[k + 3] = y1; buf[k + 4] = rgbc[0]; buf[k + 5] = rgbc[1]; buf[k + 6] = rgbc[2]; buf[k + 7] = seed; n++;
        }
      }
      if (n > start) ranges.push([start, n - start]);
    }
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (n) {
      gl.useProgram(G.prog); gl.bindVertexArray(G.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.ib); gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, n * 8), gl.STREAM_DRAW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(u.res, W, H); gl.uniform1f(u.hw, hw); gl.uniform1f(u.pxmm, s);
      const shOff = Math.max(0.6, 0.11 * s);
      for (const [st, cnt] of ranges) {
        // cast shadow of this colour onto everything sewn before it, then the threads themselves
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, st * 32); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, st * 32 + 16);
        gl.uniform1f(u.shadowPass, 1); gl.uniform1f(u.grow, 1.7); gl.uniform2f(u.off, shOff * 0.8, shOff * 1.2);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cnt);
        gl.uniform1f(u.shadowPass, 0); gl.uniform1f(u.grow, 1.0); gl.uniform2f(u.off, 0, 0);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cnt);
      }
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, 0, 0); ctx.restore();
  }
  R.gpu = () => glInit();
  R.draw = function (ctx, layers, view, opt) {
    opt = opt || {};
    if (!R.forceCPU && glInit()) { try { drawGL(ctx, layers, view, opt); return; } catch (e) { console.warn(e); G.ok = false; } }
    R.drawCPU(ctx, layers, view, opt);
  };
  R.drawCPU = function (ctx, layers, view, opt) {
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
      const lod = w < 1.3 ? 0 : w < 2.4 ? 1 : 2;   // 0 = overview, 1 = medium, 2 = full thread detail
      const flush = () => {
        if (!used) return;
        ctx.lineCap = 'round';
        if (lod === 0) { for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].body; ctx.lineWidth = w * 1.05; ctx.stroke(P.full[b]); } reset(); return; }
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = w * 1.15; ctx.stroke(P.shadow);
        for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].edge; ctx.lineWidth = w; ctx.stroke(P.full[b]); }
        if (lod === 1) { for (let b = 0; b < NB; b++) { ctx.strokeStyle = sd[b].mid; ctx.lineWidth = w * 0.62; ctx.stroke(P.body[b]); } reset(); return; }
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
        if (used > (lod === 0 ? 4000 : 500)) flush();
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
          if (lod === 0) { used++; continue; }
          inset(P.body[b], x0, y0, x1, y1, e * 0.5);
          if (lod === 1) { P.shadow.moveTo(x0 + sh, y0 + sh * 1.3); P.shadow.lineTo(x1 + sh, y1 + sh * 1.3); used++; continue; }
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
