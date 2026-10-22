/* Stitch Studio — editor UI */
(function () {
  'use strict';
  const S = window.Stitch, T = window.Trace;
  const $ = s => document.querySelector(s);
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const sheet = $('#sheet');

  // ---------------- state
  // Hoops for the Husqvarna Viking DESIGNER TOPAZ 30 (max stitch field 360 × 200 mm)
  const MAXF = { w: 360, h: 200 };
  const HOOPS = [
    { id: 'splendid', name: 'Splendid Square', w: 120, h: 120, tag: 'Included with Topaz 30' },
    { id: 'royal', name: 'Royal', w: 360, h: 200, tag: 'Included with Topaz 30' },
    { id: 'crown', name: 'Crown', w: 260, h: 200, tag: 'Optional' },
    { id: 'jewel', name: 'Jewel', w: 240, h: 150, tag: 'Optional' },
    { id: 'metal180', name: 'Metal hoop', w: 180, h: 130, tag: 'Optional' },
    { id: 'small100', name: 'Small square', w: 100, h: 100, tag: 'Optional (4 × 4 in)' },
    { id: 'custom', name: 'Custom size', w: 150, h: 150, tag: 'Up to 360 × 200 mm' },
  ];
  // full thread chart: common 40 wt embroidery thread shades (generic names)
  const CHART = [
    ['#ffffff','White'],['#f4f1e8','Eggshell'],['#e8dcc0','Ivory'],['#d9c7a1','Cream'],['#c8b48a','Khaki'],['#a68a5b','Tan'],['#8a6a3e','Light brown'],['#6b4a2b','Brown'],['#4a3020','Dark brown'],['#2e1e14','Chocolate'],
    ['#fff200','Lemon'],['#ffd23f','Sunflower'],['#f2c12e','Yellow gold'],['#f2a900','Gold'],['#d49b2a','Old gold'],['#b8862b','Antique gold'],['#ffb347','Light orange'],['#f28c28','Orange'],['#e35205','Burnt orange'],['#c4441c','Rust'],
    ['#ff8a80','Coral'],['#f45b5b','Salmon'],['#e8112d','Bright red'],['#c8102e','Red'],['#a6192e','Cardinal'],['#8b0f14','Maroon'],['#6d0f1a','Burgundy'],['#4a0d14','Oxblood'],['#f8c8d8','Baby pink'],['#f4a6c1','Pink'],
    ['#e5007e','Hot pink'],['#b5175b','Raspberry'],['#d8b4e2','Lavender'],['#9b59b6','Orchid'],['#6a2c91','Purple'],['#4b1d6b','Dark purple'],['#c6e2f5','Ice blue'],['#89c4f4','Sky blue'],['#3a8fd9','Medium blue'],['#2648a8','Royal blue'],
    ['#1f3a93','Blue'],['#0b2a5b','Navy'],['#0a1a33','Midnight'],['#00a3ad','Teal'],['#007a78','Dark teal'],['#7fd6c4','Mint'],['#a8e05f','Lime'],['#6abf4b','Kelly green'],['#2e7d32','Green'],['#1b4d2b','Forest'],
    ['#556b2f','Olive'],['#3d4a26','Army green'],['#e0e0e0','Silver gray'],['#c0c0c0','Light gray'],['#9e9e9e','Gray'],['#7a7a7a','Pewter'],['#5a5a5a','Charcoal'],['#3a3a3a','Dark charcoal'],['#1e1e1e','Off black'],['#000000','Black']];
  const nearestThread = hex => { const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; let best = CHART[0], bd = Infinity; for (const c of CHART) { const m = parseInt(c[0].slice(1), 16), dr = (m >> 16 & 255) - r, dg = (m >> 8 & 255) - g, db = (m & 255) - b, rm = (r + (m >> 16 & 255)) / 2; const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db; if (d < bd) { bd = d; best = c; } } return best; };
  // "My threads": 7 personal quick-access colours, saved on the device
  const FAV_DEFAULT = ['#000000', '#ffffff', '#c8102e', '#f2a900', '#0b2a5b', '#e35205', '#7a7a7a'];
  let favs = (() => { try { const v = JSON.parse(localStorage.getItem('ss_favs')); if (Array.isArray(v) && v.length === 7) return v; } catch (e) {} return FAV_DEFAULT.slice(); })();
  const saveFavs = () => { try { localStorage.setItem('ss_favs', JSON.stringify(favs)); } catch (e) {} };
  const threadName = hex => { const c = CHART.find(x => x[0] === hex); return c ? c[1] : hex; };
  let favEdit = -1;   // slot being edited in the Pick panel
  const THREADS = ['#000000', '#ffffff', '#c8102e', '#8b0f14', '#f2a900', '#ffd23f', '#e35205', '#8a5a2b', '#5c3a1e', '#1f3a93', '#0b2a5b', '#2e7d32', '#6abf4b', '#7a7a7a', '#c0c0c0', '#f4a6c1', '#6a2c91', '#00a3ad'];
  let doc = newDoc();
  let tool = 'select', selId = null, selNode = -1, preview = false, progress = 1;
  let draft = null;              // shape being drawn {type, loops|points}
  const brush = { mode: 'satin', size: 3, passes: 1 };   // stitch brushes
  let satinMode = 'center';      // 'center' | 'rails' (point–counterpoint)
  let fillMode = 'points';       // 'points' | 'quick' (Quick Draw)
  let quickTol = 40;
  let stroke = null;             // live brush stroke
  let drawKind = 'fill';         // Draw tool: fill | satin | run
  let fillTrace = 'freehand';    // Draw → Fill: 'freehand' (lasso) | 'points'
  const pick = { scope: 'area', tol: 40, density: 0.32, style: 'satin', thread: null };   // Pick tool
  let imgMove = false;           // drag the picture instead of the view
  const IN = 25.4;
  const inch = mm => (mm / IN).toFixed(2);
  const cache = new Map();       // id -> {key, pieces}
  let view = { s: 4, x: 0, y: 0 }; // px per mm, offset px
  const undoStack = [], redoStack = [];
  let bgImg = null;

  function newDoc() {
    return { name: 'Untitled', hoopId: 'splendid', hoopRot: false, customHoop: { w: 150, h: 150 }, width: 100, objects: [], nextId: 1, bg: null, bgOpacity: 0.55, satinWidth: 3, realistic: true, fabric: '#e9e7e1' };
  }
  const hoopDef = () => HOOPS.find(h => h.id === doc.hoopId) || HOOPS[0];
  const hoop = () => {
    const d = hoopDef(); let w = d.w, h = d.h;
    if (d.id === 'custom') { w = Math.min(MAXF.w, Math.max(20, (doc.customHoop || {}).w || 150)); h = Math.min(MAXF.w, Math.max(20, (doc.customHoop || {}).h || 150)); if (Math.min(w, h) > MAXF.h) { if (w < h) w = MAXF.h; else h = MAXF.h; } }
    return doc.hoopRot ? { name: d.name, w: h, h: w } : { name: d.name, w, h };
  };
  // does the design (bounds in mm) fit the chosen hoop? (either way round, since the machine can rotate designs)
  function fitInfo(d) {
    const h = hoop(); if (!d.count) return null;
    const w = d.bounds[2] - d.bounds[0], hh = d.bounds[3] - d.bounds[1];
    const fits = (w <= h.w + 0.01 && hh <= h.h + 0.01), fitsRot = (hh <= h.w + 0.01 && w <= h.h + 0.01);
    const machine = (w <= MAXF.w && hh <= MAXF.h) || (hh <= MAXF.w && w <= MAXF.h);
    return { fits, fitsRot, machine, w, h: hh };
  }
  const sel = () => doc.objects.find(o => o.id === selId) || null;

  // ---------------- persistence + undo
  const snapshot = () => JSON.stringify({ objects: doc.objects, nextId: doc.nextId });
  function commit() {
    undoStack.push(lastSnap); if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0; lastSnap = snapshot(); autosave(); updateUndo();
  }
  let lastSnap = snapshot();
  function restore(snap) { const d = JSON.parse(snap); doc.objects = d.objects; doc.nextId = d.nextId; lastSnap = snap; if (!sel()) selId = null; cache.clear(); autosave(); updateUndo(); renderSheet(); draw(); }
  function undo() { if (!undoStack.length) return; redoStack.push(lastSnap); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(lastSnap); restore(redoStack.pop()); }
  function updateUndo() { $('#bUndo').disabled = !undoStack.length; $('#bRedo').disabled = !redoStack.length; }
  function autosave() {
    try { localStorage.setItem('ss_doc', JSON.stringify(doc)); }
    catch (e) { try { const d = Object.assign({}, doc, { bg: null }); localStorage.setItem('ss_doc', JSON.stringify(d)); } catch (e2) {} }
  }
  function loadSaved() {
    try { const s = localStorage.getItem('ss_doc'); if (s) { doc = Object.assign(newDoc(), JSON.parse(s)); } } catch (e) {}
    if (typeof doc.hoop === 'number' && !doc.hoopIdSet) { doc.hoopId = ['small100', 'splendid', 'metal180', 'crown', 'royal'][doc.hoop] || 'splendid'; delete doc.hoop; }
    lastSnap = snapshot();
    if (doc.bg) loadBg(doc.bg.src, false);
  }

  // ---------------- view
  let lastSize = null;
  function resize() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    // keep what was in the middle of the screen in the middle when the panel opens/closes
    if (lastSize && (lastSize[0] !== r.width || lastSize[1] !== r.height)) {
      view.x += (r.width - lastSize[0]) / 2; view.y += (r.height - lastSize[1]) / 2;
      const h = hoop(), hw = h.w * view.s, hh = h.h * view.s;
      if (hw < r.width && hh < r.height && (view.x > r.width || view.x + hw < 0 || view.y > r.height || view.y + hh < 0)) { lastSize = [r.width, r.height]; fit(); }
    }
    lastSize = [r.width, r.height];
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function fit() {
    const r = cv.getBoundingClientRect(), h = hoop();
    view.s = Math.min((r.width - 30) / h.w, (r.height - 30) / h.h);
    view.x = r.width / 2 - h.w / 2 * view.s; view.y = r.height / 2 - h.h / 2 * view.s;
    draw();
  }
  const toMM = (px, py) => [(px - view.x) / view.s, (py - view.y) / view.s];
  const toPX = (p) => [p[0] * view.s + view.x, p[1] * view.s + view.y];

  // ---------------- stitches per object (cached)
  function pieces(o) {
    const key = JSON.stringify(o);
    const c = cache.get(o.id);
    if (c && c.key === key) return c.pieces;
    let p = [];
    try { p = S.objectPieces(o); } catch (e) { console.error(e); }
    cache.set(o.id, { key, pieces: p });
    return p;
  }
  function design() {
    const objs = doc.objects.filter(o => !o.hidden);
    // build with the cached pieces
    const fake = objs.map(o => Object.assign({}, o, { __p: pieces(o) }));
    const orig = S.objectPieces;
    S.objectPieces = o => o.__p || orig(o);
    try { return S.build(fake); } finally { S.objectPieces = orig; }
  }

  // ---------------- drawing
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
  function shade(hex, f, mixW) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    r = Math.min(255, r * f); g = Math.min(255, g * f); b = Math.min(255, b * f);
    if (mixW) { r += (255 - r) * mixW; g += (255 - g) * mixW; b += (255 - b) * mixW; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawNow(); }); }
  function drawNow() {
    const r = cv.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    const h = hoop();
    // hoop / fabric
    const [hx, hy] = toPX([0, 0]);
    const real = preview || doc.realistic !== false;
    ctx.fillStyle = real ? Render.fabric(ctx, doc.fabric || '#e9e7e1') : '#1b1e25';
    ctx.fillRect(hx, hy, h.w * view.s, h.h * view.s);
    const lightFab = real && parseInt((doc.fabric || '#e9e7e1').slice(1), 16) > 0x808080;
    if (!preview) {
      // inch grid: quarter inches faint, whole inches stronger, numbered along the top and left
      const q = IN / 4, showQ = q * view.s > 9;
      ctx.lineWidth = 1;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = real ? (lightFab ? (pass ? 'rgba(0,0,0,.16)' : 'rgba(0,0,0,.06)') : (pass ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)')) : (pass ? '#3a4150' : '#242934'); ctx.beginPath();
        for (let x = q, k = 1; x < h.w; x += q, k++) { if ((k % 4 === 0) !== !!pass || (!pass && !showQ)) continue; const [a] = toPX([x, 0]); ctx.moveTo(a, hy); ctx.lineTo(a, hy + h.h * view.s); }
        for (let y = q, k = 1; y < h.h; y += q, k++) { if ((k % 4 === 0) !== !!pass || (!pass && !showQ)) continue; const [, b] = toPX([0, y]); ctx.moveTo(hx, b); ctx.lineTo(hx + h.w * view.s, b); }
        ctx.stroke();
      }
      ctx.fillStyle = real && lightFab ? 'rgba(0,0,0,.45)' : '#7b8494'; ctx.font = '11px system-ui, sans-serif';
      for (let k = 1; k * IN < h.w; k++) { const [a] = toPX([k * IN, 0]); ctx.fillText(k + '"', a + 3, hy + 12); }
      for (let k = 1; k * IN < h.h; k++) { const [, b] = toPX([0, k * IN]); ctx.fillText(k + '"', hx + 3, b - 3); }
    }
    ctx.strokeStyle = '#5b6372'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
    ctx.strokeRect(hx, hy, h.w * view.s, h.h * view.s); ctx.setLineDash([]);
    // background image
    if (bgImg && doc.bg && !preview) {
      ctx.globalAlpha = doc.bgOpacity;
      const b = doc.bg, [x, y] = toPX([b.x, b.y]);
      ctx.drawImage(bgImg, x, y, b.w * view.s, b.h * view.s);
      ctx.globalAlpha = 1;
    }
    if (preview) drawPreview(); else drawDesign();
    drawDraft();
  }

  function drawDesign() {
    if (doc.realistic !== false) {
      const layers = [];
      for (const o of doc.objects) {
        if (o.hidden) continue;
        const lines = pieces(o).filter(pc => pc.kind !== 'underlay').map(pc => pc.pts);
        if (lines.length) layers.push({ color: o.color, lines });
      }
      Render.draw(ctx, layers, view, { thread: 0.42 });
      const o = sel();
      if (o) drawHandles(o);
      return;
    }
    const lw = Math.max(0.6, Math.min(1.6, view.s * 0.12));
    for (const o of doc.objects) {
      if (o.hidden) continue;
      const P = pieces(o);
      ctx.strokeStyle = o.color; ctx.lineWidth = lw; ctx.globalAlpha = o.id === selId || selId === null ? 1 : 0.55;
      ctx.beginPath();
      for (const pc of P) {
        if (pc.kind === 'underlay') continue;
        pc.pts.forEach((p, i) => { const [x, y] = toPX(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const o = sel();
    if (o) drawHandles(o);
  }

  function shapeNodes(o) {
    if (o.type === 'fill') return o.paths.flatMap((l, li) => l.map((p, pi) => ({ p, li, pi })));
    if (o.type === 'satin' || o.type === 'run') return o.points.map((p, pi) => ({ p, li: 0, pi }));
    if (o.type === 'text') return [{ p: [o.x, o.y], li: 0, pi: 0 }];
    if (o.type === 'stitches') return [];
    return [];
  }
  function drawHandles(o) {
    ctx.save();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#f2b134'; ctx.setLineDash([5, 4]);
    if (o.type === 'fill') o.paths.forEach(l => { ctx.beginPath(); l.forEach((p, i) => { const [x, y] = toPX(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); });
    if (o.type === 'fill' && !o.flow && tool === 'pick') {
      const bb = bbox(o); if (bb) {
        const c = toPX([(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]), L = Math.min(140, Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) * view.s * 0.35), an = (o.angle || 0) * Math.PI / 180;
        ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = '#4cc2ff'; ctx.lineWidth = 3;
        const ax = Math.cos(an) * L, ay = Math.sin(an) * L;
        ctx.beginPath(); ctx.moveTo(c[0] - ax, c[1] - ay); ctx.lineTo(c[0] + ax, c[1] + ay);
        [[1, 1], [-1, -1]].forEach(([sx]) => { const ex = c[0] + ax * sx, ey = c[1] + ay * sx, b2 = an + (sx > 0 ? 0 : Math.PI); ctx.moveTo(ex, ey); ctx.lineTo(ex - 12 * Math.cos(b2 - .45), ey - 12 * Math.sin(b2 - .45)); ctx.moveTo(ex, ey); ctx.lineTo(ex - 12 * Math.cos(b2 + .45), ey - 12 * Math.sin(b2 + .45)); });
        ctx.stroke(); ctx.restore();
      }
    }
    if (o.type === 'fill' && o.flow) { ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = '#4cc2ff'; ctx.lineWidth = 2.5; o.flow.forEach(g => { ctx.beginPath(); g.forEach((p, i) => { const [x, y] = toPX(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); const a = g[g.length - 2] || g[0], b = g[g.length - 1], [bx, by] = toPX(b), [ax, ay] = toPX(a), an = Math.atan2(by - ay, bx - ax); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 10 * Math.cos(an - .5), by - 10 * Math.sin(an - .5)); ctx.moveTo(bx, by); ctx.lineTo(bx - 10 * Math.cos(an + .5), by - 10 * Math.sin(an + .5)); ctx.stroke(); }); ctx.restore(); }
    if (o.type === 'satin' || o.type === 'run') {
      ctx.beginPath(); o.points.forEach((p, i) => { const [x, y] = toPX(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      if (o.type === 'satin' && o.mode !== 'rails') {
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(242,177,52,.5)';
        o.points.forEach(p => { const [x, y] = toPX(p); ctx.beginPath(); ctx.arc(x, y, (p[2] || o.width || 3) / 2 * view.s, 0, Math.PI * 2); ctx.stroke(); });
      }
    }
    if (o.type === 'text' || o.type === 'stitches') {
      const bb = bbox(o); if (bb) { const [a, b] = toPX([bb[0], bb[1]]), [c, d] = toPX([bb[2], bb[3]]); ctx.strokeRect(a - 4, b - 4, c - a + 8, d - b + 8); }
    }
    ctx.setLineDash([]);
    // shrink the dots when points sit close together on screen so they don't hide the shape
    const NS = shapeNodes(o).map(n => toPX(n.p)); let gap = Infinity;
    for (let i = 1; i < NS.length; i++) gap = Math.min(gap, Math.hypot(NS[i][0] - NS[i - 1][0], NS[i][1] - NS[i - 1][1]) || Infinity);
    const dotR = Math.max(2.5, Math.min(7, gap / 2.6));
    if (o.type !== 'text' || true) shapeNodes(o).forEach((n, i) => {
      const [x, y] = toPX(n.p);
      ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2);
      const on = o.type === 'text' ? false : flatIndex(o, n) === selNode;
      ctx.fillStyle = on ? '#f2b134' : '#ffffff'; ctx.fill();
      ctx.lineWidth = dotR > 4 ? 2 : 1; ctx.strokeStyle = '#16181d'; ctx.stroke();
    });
    ctx.restore();
  }
  // tap on an edge of the selected shape -> new point there
  function insertPoint(o, p) {
    const tol = 12 / view.s;
    const lists = o.type === 'fill' ? o.paths.map(l => [l, true]) : [[o.points, false]];
    let best = null;
    lists.forEach(([l, closed]) => {
      const n = closed ? l.length : l.length - 1;
      for (let i = 0; i < n; i++) {
        const a = l[i], b = l[(i + 1) % l.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
        const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
        if (d < tol && t > 0.05 && t < 0.95 && (!best || d < best.d)) best = { l, i, d, q: [a[0] + t * dx, a[1] + t * dy] };
      }
    });
    if (!best) return false;
    const np = o.type === 'satin' ? [best.q[0], best.q[1], best.l[best.i][2]] : best.q;
    best.l.splice(best.i + 1, 0, np);
    selNode = o.type === 'fill' ? flatIndex(o, { li: o.paths.indexOf(best.l), pi: best.i + 1 }) : best.i + 1;
    commit(); renderSheet(); draw(); toast('Point added — drag it into place');
    return true;
  }
  function flatIndex(o, n) { if (o.type !== 'fill') return n.pi; let k = 0; for (let i = 0; i < n.li; i++) k += o.paths[i].length; return k + n.pi; }
  function nodeAt(o, k) { if (o.type !== 'fill') return { li: 0, pi: k }; for (let li = 0; li < o.paths.length; li++) { if (k < o.paths[li].length) return { li, pi: k }; k -= o.paths[li].length; } return null; }

  function drawDraft() {
    if (stroke && stroke.length && tool === 'fill') {
      ctx.save(); ctx.lineJoin = 'round'; ctx.beginPath();
      stroke.forEach((p, i) => { const [x, y] = toPX(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
      ctx.fillStyle = hexA(currentColor, 0.35); ctx.fill(); ctx.strokeStyle = '#f2b134'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    } else if (stroke && stroke.length) {
      ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
      const isPick = tool === 'pick';
      const wmm = isPick || brush.mode === 'line' || brush.mode === 'flow' ? 0 : brush.size;
      ctx.strokeStyle = isPick ? '#4cc2ff' : brush.mode === 'erase' ? 'rgba(255,255,255,.35)' : brush.mode === 'flow' ? '#4cc2ff' : hexA(currentColor, 0.55);
      ctx.lineWidth = Math.max(2, wmm * view.s);
      ctx.beginPath(); stroke.forEach((p, i) => { const [x, y] = toPX(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.restore();
    }
    if (!draft) return;
    ctx.save();
    ctx.strokeStyle = '#f2b134'; ctx.fillStyle = 'rgba(242,177,52,.18)'; ctx.lineWidth = 2;
    if (draft.type === 'fill') {
      draft.loops.forEach((l, li) => {
        if (!l.length) return;
        ctx.beginPath(); l.forEach((p, i) => { const [x, y] = toPX(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        if (li < draft.loops.length - 1) ctx.closePath();
        ctx.stroke();
        l.forEach((p, i) => { const [x, y] = toPX(p); ctx.beginPath(); ctx.arc(x, y, i === 0 ? 9 : 5, 0, 7); ctx.fillStyle = i === 0 ? '#f2b134' : '#fff'; ctx.fill(); });
      });
    } else {
      ctx.beginPath(); draft.points.forEach((p, i) => { const [x, y] = toPX(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      draft.points.forEach(p => {
        const [x, y] = toPX(p);
        if (draft.type === 'satin' && !draft.rails) { ctx.beginPath(); ctx.arc(x, y, p[2] / 2 * view.s, 0, 7); ctx.strokeStyle = 'rgba(242,177,52,.6)'; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fillStyle = draft.rails ? (draft.points.indexOf(p) % 2 ? '#4cc2ff' : '#ff7a59') : '#fff'; ctx.fill();
      });
    }
    ctx.restore();
  }

  let previewCache = null;
  function drawPreview() {
    if (!previewCache) previewCache = design();
    const d = previewCache;
    const layers = []; let ci = 0, cur = null, line = null;
    const newLayer = () => { cur = { color: d.colors[ci] ? d.colors[ci].color : '#000000', lines: [] }; layers.push(cur); line = null; };
    newLayer();
    for (const s2 of d.stitches) {
      if (s2.c === 3) { ci++; newLayer(); continue; }
      if (s2.c === 0) { if (!line) { line = []; cur.lines.push(line); } line.push([s2.x, s2.y]); }
      else { line = [[s2.x, s2.y]]; cur.lines.push(line); }
    }
    Render.draw(ctx, layers, view, { thread: 0.42, limit: Math.round(d.count * progress) });
  }


  // ---------------- hit testing
  function pointInLoops(p, loops) {
    let inside = false;
    for (const l of loops) for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const a = l[i], b = l[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function distToPolyline(p, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
    return best;
  }
  function bbox(o) {
    let pts = [];
    if (o.type === 'fill') pts = o.paths.flat();
    else if (o.type === 'text') pts = (o.glyphs || []).flatMap(g => g.paths.flat());
    else if (o.type === 'stitches') pts = o.lines.flat();
    else pts = o.points;
    if (!pts.length) return null;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    pts.forEach(p => { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); });
    return [a, b, c, d];
  }
  function hitObject(p) {
    const tol = 10 / view.s;
    for (let i = doc.objects.length - 1; i >= 0; i--) {
      const o = doc.objects[i]; if (o.hidden) continue;
      if (o.type === 'fill' && pointInLoops(p, o.paths)) return o;
      if (o.type === 'text' || o.type === 'stitches') { const bb = bbox(o); if (bb && p[0] >= bb[0] - tol && p[0] <= bb[2] + tol && p[1] >= bb[1] - tol && p[1] <= bb[3] + tol) return o; }
      if (o.type === 'satin' && distToPolyline(p, o.points) < Math.max(tol, (o.points[0] && o.points[0][2] || 3) / 2)) return o;
      if (o.type === 'run' && distToPolyline(p, o.points) < tol) return o;
    }
    return null;
  }
  function hitNode(o, p) {
    const tol = 16 / view.s; let best = -1, bd = tol;
    shapeNodes(o).forEach(n => { const d = Math.hypot(n.p[0] - p[0], n.p[1] - p[1]); if (d < bd) { bd = d; best = o.type === 'text' ? 0 : flatIndex(o, n); } });
    return best;
  }

  // ---------------- pointer handling (1 finger = tool, 2 fingers = pan/zoom)
  const pointers = new Map();
  let gesture = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      stroke = null;
      gesture = { type: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v: Object.assign({}, view), moved: true };
      return;
    }
    const p = toMM(e.offsetX, e.offsetY);
    gesture = { type: 'tap', start: [e.offsetX, e.offsetY], p, moved: false, v: Object.assign({}, view) };
    if (imgMove && doc.bg && !preview) { gesture.type = 'moveimg'; gesture.last = p; return; }
    if (!preview && !draft && tool !== 'brush' && tool !== 'select') {
      const so = sel();
      if (so && so.type !== 'text') { const k = hitNode(so, p); if (k >= 0) { gesture.type = 'node'; gesture.k = k; selNode = k; renderSheet(); draw(); return; } }
    }
    if (tool === 'brush' && !preview) { gesture.type = 'brush'; stroke = [p]; draw(); return; }
    if (tool === 'pick' && !preview) { gesture.type = 'pickstroke'; stroke = [p]; return; }
    if (tool === 'fill' && fillTrace === 'freehand' && !preview) { gesture.type = 'lasso'; stroke = [p]; draw(); return; }
    if (tool === 'select' && !preview) {
      const o = sel();
      if (o) {
        const k = hitNode(o, p);
        if (k >= 0) { gesture.type = 'node'; gesture.k = k; selNode = o.type === 'text' ? -1 : k; draw(); return; }
        if (hitObject(p) === o) { gesture.type = 'moveobj'; gesture.last = p; return; }
      }
    }
    if (draft && (tool === 'fill' || tool === 'satin' || tool === 'run')) {
      // drag an existing draft node
      const list = draft.type === 'fill' ? draft.loops[draft.loops.length - 1] : draft.points;
      const tol = 16 / view.s;
      const k = list.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol);
      if (k >= 0 && !(draft.type === 'fill' && k === 0 && list.length >= 3)) { gesture.type = 'draftnode'; gesture.k = k; gesture.list = list; }
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (!gesture) return;
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const s = Math.max(0.5, Math.min(120, gesture.v.s * d / gesture.d));
      const mm = [(gesture.c[0] - gesture.v.x) / gesture.v.s, (gesture.c[1] - gesture.v.y) / gesture.v.s];
      view.s = s; view.x = c[0] - mm[0] * s; view.y = c[1] - mm[1] * s; draw(); return;
    }
    if (gesture.type === 'moveimg') { const p = toMM(e.offsetX, e.offsetY); doc.bg.x += p[0] - gesture.last[0]; doc.bg.y += p[1] - gesture.last[1]; gesture.last = p; gesture.moved = true; draw(); return; }
    if (gesture.type === 'pickstroke' && stroke) {
      if (!gesture.moved && Math.hypot(e.offsetX - gesture.start[0], e.offsetY - gesture.start[1]) > 8) gesture.moved = true;
      const p = toMM(e.offsetX, e.offsetY), l = stroke[stroke.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.15) { stroke.push(p); if (gesture.moved) draw(); }
      return;
    }
    if ((gesture.type === 'brush' || gesture.type === 'lasso') && stroke) {
      const p = toMM(e.offsetX, e.offsetY), l = stroke[stroke.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.12) { stroke.push(p); draw(); }
      return;
    }
    const dx = e.offsetX - gesture.start[0], dy = e.offsetY - gesture.start[1];
    if (!gesture.moved && Math.hypot(dx, dy) > 6) gesture.moved = true;
    if (!gesture.moved) return;
    const p = toMM(e.offsetX, e.offsetY);
    if (gesture.type === 'node') {
      const o = sel();
      if (o.type === 'text') { o.x = p[0]; o.y = p[1]; layoutText(o); }
      else { const n = nodeAt(o, gesture.k); const arr = o.type === 'fill' ? o.paths[n.li] : o.points; arr[n.pi][0] = p[0]; arr[n.pi][1] = p[1]; }
      draw(); return;
    }
    if (gesture.type === 'moveobj') {
      const o = sel(), ddx = p[0] - gesture.last[0], ddy = p[1] - gesture.last[1]; gesture.last = p;
      translate(o, ddx, ddy); draw(); return;
    }
    if (gesture.type === 'draftnode') { gesture.list[gesture.k][0] = p[0]; gesture.list[gesture.k][1] = p[1]; draw(); return; }
    // pan
    gesture.type = 'pan';
    view.x = gesture.v.x + dx; view.y = gesture.v.y + dy; draw();
  });
  const endPointer = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'pinch') { if (pointers.size === 0) gesture = null; return; }
    const g = gesture; gesture = null;
    if (g.type === 'node' || g.type === 'moveobj') { if (g.moved) commit(); return; }
    if (g.type === 'draftnode') { if (!g.moved) onTap(g.p); return; }
    if (g.type === 'moveimg') { autosave(); if (window.__imgSheet) renderImageSheet(); return; }
    if (g.type === 'lasso') { const st = stroke; stroke = null; finishLasso(st); return; }
    if (g.type === 'pickstroke') { const st = stroke; stroke = null; if (!g.moved) pickTap(g.p); else pickDirection(st); return; }
    if (g.type === 'brush') { const st = stroke; stroke = null; if (st && st.length) finishBrush(st); else draw(); return; }
    if (!g.moved && g.type === 'tap') onTap(g.p);
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const s = Math.max(0.5, Math.min(120, view.s * Math.exp(-e.deltaY * 0.0015)));
    const mm = toMM(e.offsetX, e.offsetY); view.s = s; view.x = e.offsetX - mm[0] * s; view.y = e.offsetY - mm[1] * s; draw();
  }, { passive: false });

  function translate(o, dx, dy) {
    if (o.type === 'fill') { o.paths.forEach(l => l.forEach(q => { q[0] += dx; q[1] += dy; })); (o.flow || []).forEach(l => l.forEach(q => { q[0] += dx; q[1] += dy; })); }
    else if (o.type === 'stitches') o.lines.forEach(l => l.forEach(q => { q[0] += dx; q[1] += dy; }));
    else if (o.type === 'text') { o.x += dx; o.y += dy; o.glyphs.forEach(g => g.paths.forEach(l => l.forEach(q => { q[0] += dx; q[1] += dy; }))); }
    else o.points.forEach(q => { q[0] += dx; q[1] += dy; });
  }

  function onTap(p) {
    if (preview) return;
    if (tool === 'select' && sel() && sel().type !== 'text' && insertPoint(sel(), p)) return;
    if (tool === 'select' || tool === 'layers' || tool === 'auto') {
      const o = hitObject(p);
      selId = o ? o.id : null; selNode = -1;
      if (o && tool !== 'select') setTool('select', true);
      renderSheet(); draw(); return;
    }
    if (tool === 'fill' && fillMode === 'quick') { quickDraw(p); return; }
    if (tool === 'fill' && fillTrace === 'freehand') return;
    if (tool === 'fill') {
      if (!draft) draft = { type: 'fill', loops: [[]] };
      const l = draft.loops[draft.loops.length - 1];
      if (l.length >= 3 && Math.hypot(l[0][0] - p[0], l[0][1] - p[1]) < 14 / view.s) { finishDraft(); return; }
      l.push([p[0], p[1]]); renderSheet(); draw(); return;
    }
    if (tool === 'satin') { if (!draft) draft = { type: 'satin', points: [], rails: satinMode === 'rails' }; draft.points.push([p[0], p[1], doc.satinWidth]); if (draft.rails) hint(draft.points.length % 2 ? 'Now tap the opposite edge' : 'Tap the first edge again, a little further along'); renderSheet(); draw(); return; }
    if (tool === 'run') { if (!draft) draft = { type: 'run', points: [] }; draft.points.push([p[0], p[1]]); renderSheet(); draw(); return; }
    if (tool === 'text') { textAt = p; renderSheet(); draw(); return; }
  }

  // ---------------- objects
  let currentColor = '#c8102e';
  function addObject(o) {
    o.id = doc.nextId++; o.color = o.color || currentColor;
    doc.objects.push(o); selId = o.id; selNode = -1; commit(); renderSheet(); draw();
    return o;
  }
  function tracedFill(loops, name) {
    const satin = pick.style === 'satin';
    addObject({ type: 'fill', name, paths: loops, angle: 0, spacing: pick.density, stitchLen: satin ? 12 : 3.5, underlay: true, pullComp: satin ? 0.15 : 0.2, satinLook: satin, color: currentColor });
    setTool('pick', true);
    hint('Drag the white dots to adjust the outline, or swipe across the shape to set the thread direction');
  }
  function finishLasso(st) {
    if (!st || st.length < 4) { draw(); return; }
    let loop = T.simplify(st.map(q => [q[0], q[1]]), Math.max(0.2, 3 / view.s));
    if (Math.abs(T.area(loop)) < 1) { toast('Trace all the way around the part you want'); draw(); return; }
    tracedFill([loop], 'Traced ' + currentColor);
  }
  function finishDraft() {
    if (!draft) return;
    if (draft.type === 'fill') {
      const loops = draft.loops.filter(l => l.length >= 3);
      if (!loops.length) { toast('A fill needs at least 3 points'); return; }
      draft = null; tracedFill(loops, 'Traced ' + currentColor); return;
    } else if (draft.type === 'satin') {
      if (draft.points.length < (draft.rails ? 4 : 2)) { toast(draft.rails ? 'Tap at least 2 pairs of edge points' : 'A satin column needs at least 2 points'); return; }
      if (draft.rails && draft.points.length % 2) draft.points.pop();
      addObject(Object.assign({ type: 'satin', name: draft.rails ? 'Satin (point–counterpoint)' : 'Satin', points: draft.points, spacing: 0.4, underlay: true, pullComp: 0.15 }, draft.rails ? { mode: 'rails' } : {}));
    } else {
      if (draft.points.length < 2) { toast('A line needs at least 2 points'); return; }
      addObject({ type: 'run', name: 'Line', points: draft.points, stitchLen: 2.5, passes: 1, curve: true });
    }
    draft = null; setTool('select', true);
  }

  // ---------------- stitch brushes
  function simplifyOpen(pts, eps) {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-9;
    let bi = -1, bd = 0;
    for (let i = 1; i < pts.length - 1; i++) { const p = pts[i]; const dd = d > 1e-6 ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / d : Math.hypot(p[0] - a[0], p[1] - a[1]); if (dd > bd) { bd = dd; bi = i; } }
    if (bd <= eps) return [a, b];
    return simplifyOpen(pts.slice(0, bi + 1), eps).slice(0, -1).concat(simplifyOpen(pts.slice(bi), eps));
  }
  // paint (or erase) a round brush stroke into a fill's outline by rasterising and re-tracing
  function paintFill(o, st, erase) {
    const PX = 10;
    const all = (o ? o.paths.flat() : []).concat(st);
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    all.forEach(p => { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); });
    const m = brush.size + 2; a -= m; b -= m; c += m; d += m;
    let k = PX; const maxDim = 2400; if ((c - a) * k > maxDim || (d - b) * k > maxDim) k = maxDim / Math.max(c - a, d - b);
    const w = Math.ceil((c - a) * k), h = Math.ceil((d - b) * k);
    const can = document.createElement('canvas'); can.width = w; can.height = h;
    const g = can.getContext('2d');
    const P = q => [(q[0] - a) * k, (q[1] - b) * k];
    if (o) { g.fillStyle = '#000'; g.beginPath(); o.paths.forEach(l => l.forEach((q, i) => { const [x, y] = P(q); i ? g.lineTo(x, y) : g.moveTo(x, y); })); g.fill('evenodd'); }
    g.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineCap = g.lineJoin = 'round'; g.lineWidth = brush.size * k;
    if (st.length === 1) { const [x, y] = P(st[0]); g.beginPath(); g.arc(x, y, brush.size * k / 2, 0, 7); g.fill(); }
    else { g.beginPath(); st.forEach((q, i) => { const [x, y] = P(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    const data = g.getImageData(0, 0, w, h).data, M = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) M[i] = data[i * 4 + 3] > 127 ? 1 : 0;
    return T.contours(M, w, h).map(l => T.simplify(l, 0.5)).filter(l => Math.abs(T.area(l)) > 3).map(l => l.map(q => [a + q[0] / k, b + q[1] / k]));
  }
  function finishBrush(st) {
    const o = sel();
    if (brush.mode === 'satin' || brush.mode === 'line') {
      if (st.length < 2) { draw(); return; }
      const pts = simplifyOpen(st, 0.25);
      if (brush.mode === 'satin') addObject({ type: 'satin', name: 'Satin brush', points: pts.map(p => [p[0], p[1], brush.size]), spacing: 0.4, underlay: true, pullComp: 0.15 });
      else addObject({ type: 'run', name: brush.passes === 3 ? 'Bean line' : 'Line', points: pts.map(p => [p[0], p[1]]), stitchLen: 2.2, passes: brush.passes, curve: true });
      return;
    }
    if (brush.mode === 'flow') {
      if (!o || o.type !== 'fill') { toast('Select a fill first, then draw how the thread should flow'); draw(); return; }
      if (st.length < 2) { draw(); return; }
      o.flow = (o.flow || []).concat([simplifyOpen(st, 0.3).map(p => [p[0], p[1]])]);
      commit(); renderSheet(); draw(); toast('Stitches now follow your flow lines'); return;
    }
    // fill paint / erase
    const target = o && o.type === 'fill' ? o : null;
    if (brush.mode === 'erase' && !target) { toast('Select a fill to erase from'); draw(); return; }
    const loops = paintFill(target, st, brush.mode === 'erase');
    if (target) {
      if (!loops.length) { doc.objects = doc.objects.filter(x => x !== target); selId = null; commit(); renderSheet(); draw(); return; }
      target.paths = loops; commit(); draw();
    } else if (loops.length) addObject({ type: 'fill', name: 'Painted fill', paths: loops, angle: 45, spacing: 0.4, stitchLen: 3.5, underlay: true, pullComp: 0.2 });
    else draw();
  }

  // ---------------- Quick Draw: tap a colour area of the picture to trace it
  let quickCache = null;
  function quickDraw(p) {
    const r = traceColour(p, 'area', quickTol); if (!r) return;
    addObject({ type: 'fill', name: 'Quick Draw', paths: r.loops, angle: 45, spacing: 0.4, stitchLen: 3.5, underlay: true, pullComp: 0.2, color: r.col });
    setTool('fill', true); toast('Traced — tap another area, or Select to fine-tune');
  }
  function traceColour(p, scope, tolerance) {
    if (!bgImg || !doc.bg) { toast('Open an image first (menu → Open image)'); return null; }
    const b = doc.bg;
    if (!quickCache || quickCache.img !== bgImg) {
      const sc = Math.min(1, 1100 / Math.max(bgImg.naturalWidth, bgImg.naturalHeight));
      const w = Math.round(bgImg.naturalWidth * sc), h = Math.round(bgImg.naturalHeight * sc);
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g = c2.getContext('2d'); g.drawImage(bgImg, 0, 0, w, h);
      quickCache = { img: bgImg, w, h, px: g.getImageData(0, 0, w, h).data };
    }
    const { w, h, px } = quickCache;
    const x0 = Math.floor((p[0] - b.x) / b.w * w), y0 = Math.floor((p[1] - b.y) / b.h * h);
    if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) { toast('Tap inside the picture'); return null; }
    const i0 = (y0 * w + x0) * 4;
    if (px[i0 + 3] < 128) { toast('That spot is transparent'); return null; }
    const ref = [px[i0], px[i0 + 1], px[i0 + 2]];
    const M = new Uint8Array(w * h), stk = [y0 * w + x0];
    let n = 0, sr = 0, sg = 0, sb = 0;
    const tol = tolerance * 3;
    if (scope === 'colour') {
      stk.length = 0;
      for (let i = 0; i < w * h; i++) { const j = i * 4; if (px[j + 3] >= 128 && Math.abs(px[j] - ref[0]) + Math.abs(px[j + 1] - ref[1]) + Math.abs(px[j + 2] - ref[2]) <= tol) { M[i] = 1; n++; sr += px[j]; sg += px[j + 1]; sb += px[j + 2]; } }
    }
    while (stk.length) {
      const i = stk.pop(); if (M[i]) continue;
      const j = i * 4;
      if (px[j + 3] < 128 || Math.abs(px[j] - ref[0]) + Math.abs(px[j + 1] - ref[1]) + Math.abs(px[j + 2] - ref[2]) > tol) continue;
      M[i] = 1; n++; sr += px[j]; sg += px[j + 1]; sb += px[j + 2];
      const x = i % w, y = (i - x) / w;
      if (x > 0) stk.push(i - 1); if (x < w - 1) stk.push(i + 1); if (y > 0) stk.push(i - w); if (y < h - 1) stk.push(i + w);
    }
    if (n < 6) { toast('Area too small — raise the tolerance'); return null; }
    // close pin-holes from anti-aliasing
    const L = new Int16Array(w * h); for (let i = 0; i < w * h; i++) L[i] = M[i] ? 1 : 0;
    const L2 = T.majority(L, w, h, 2);
    for (let i = 0; i < w * h; i++) M[i] = L2[i] === 1 ? 1 : 0;
    const mm = b.w / w;
    const loops = T.contours(M, w, h).map(l => T.simplify(l, 0.6)).filter(l => Math.abs(T.area(l)) * mm * mm > 1.0).map(l => l.map(q => [b.x + q[0] * mm, b.y + q[1] * mm]));
    if (!loops.length) { toast('Nothing to trace there'); return null; }
    const col = '#' + [sr, sg, sb].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
    return { loops, col };
  }

  // ---------------- Pick tool: tap a colour -> layer, swipe -> thread direction
  function pickTap(p) {
    busy(true);
    setTimeout(() => {
      const r = traceColour(p, pick.scope, pick.tol);
      busy(false);
      if (!r) return;
      const satin = pick.style === 'satin';
      addObject({ type: 'fill', name: (pick.scope === 'colour' ? 'Colour ' : 'Area ') + (pick.thread ? threadName(pick.thread) : r.col), paths: r.loops, angle: 0, spacing: pick.density, stitchLen: satin ? 12 : 3.5, underlay: true, pullComp: satin ? 0.15 : 0.2, satinLook: satin, color: pick.thread || r.col });
      hint('Now swipe across the shape the way the thread should run');
    }, 20);
  }
  function pickDirection(st) {
    const o = sel();
    if (!o || o.type !== 'fill') { toast('Tap a colour first, then swipe'); draw(); return; }
    if (!st || st.length < 2) { draw(); return; }
    const a = st[0], b = st[st.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1) { draw(); return; }
    let dev = 0; for (const q of st) dev = Math.max(dev, Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / L);
    if (dev / L < 0.1) { delete o.flow; let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180; o.angle = Math.round(ang); toast('Thread direction ' + o.angle + '°'); }
    else { o.flow = [simplifyOpen(st, 0.3).map(q => [q[0], q[1]])]; toast('Thread follows your curve'); }
    commit(); renderSheet(); draw();
  }

  // ---------------- text (glyphs traced from the phone's fonts)
  let textAt = null;
  const FONTS = [
    { label: 'Block (bold sans)', css: '800 {px}px system-ui, Roboto, Arial, sans-serif' },
    { label: 'Varsity (serif bold)', css: '800 {px}px Georgia, "Noto Serif", serif' },
    { label: 'Script', css: 'italic 600 {px}px "Dancing Script", "Brush Script MT", cursive' },
    { label: 'Condensed', css: '700 {px}px "Roboto Condensed", "Arial Narrow", sans-serif-condensed, sans-serif' },
    { label: 'Classic serif', css: '600 {px}px "Times New Roman", "Noto Serif", serif' },
    { label: 'Monospace', css: '700 {px}px "Roboto Mono", monospace' },
  ];
  function layoutText(o) {
    const PXMM = 14; // trace resolution (px per mm)
    const fpx = Math.round(o.size * PXMM * 1.35);
    const font = FONTS[o.font || 0].css.replace('{px}', fpx);
    const mc = document.createElement('canvas').getContext('2d');
    mc.font = font;
    const chars = [...(o.text || '')];
    const adv = chars.map(ch => mc.measureText(ch).width / PXMM + (o.spacingLetters || 0));
    const total = adv.reduce((a, b) => a + b, 0);
    const glyphs = [];
    let s = -total / 2;
    chars.forEach((ch, i) => {
      const mid = s + adv[i] / 2; s += adv[i];
      if (!ch.trim()) return;
      const w = Math.ceil(mc.measureText(ch).width + fpx * 0.6), h = Math.ceil(fpx * 1.5);
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const g = c2.getContext('2d'); g.font = font; g.fillStyle = '#000'; g.textBaseline = 'alphabetic';
      const bx = fpx * 0.3, by = fpx * 1.1;
      g.fillText(ch, bx, by);
      const data = g.getImageData(0, 0, w, h).data;
      const M = new Uint8Array(w * h);
      for (let k = 0; k < w * h; k++) M[k] = data[k * 4 + 3] > 110 ? 1 : 0;
      const cw = mc.measureText(ch).width;
      let loops = T.contours(M, w, h).map(l => T.simplify(l, 0.6)).filter(l => Math.abs(T.area(l)) > 6);
      // glyph-local mm: origin at glyph's horizontal centre on the baseline
      const R = Math.abs(o.bend || 0) < 2 ? 0 : 2000 / o.bend;   // bend > 0 arches up, < 0 smiles down
      let gx, gy, a = 0;
      if (Math.abs(R) < 1) { gx = o.x + mid; gy = o.y; }
      else { a = mid / R; gx = o.x + R * Math.sin(a); gy = o.y + R - R * Math.cos(a); }
      const ca = Math.cos(a), sa = Math.sin(a);
      loops = loops.map(l => l.map(q => {
        const lx = (q[0] - bx - cw / 2) / PXMM, ly = (q[1] - by) / PXMM;
        return [gx + lx * ca - ly * sa, gy + lx * sa + ly * ca];
      }));
      if (loops.length) glyphs.push({ paths: loops, angle: a * 180 / Math.PI + (o.style === 'fill' ? 45 : 0) });
    });
    o.glyphs = glyphs;
  }

  // ---------------- auto-digitize
  function autoDigitize(opts) {
    if (!bgImg || !doc.bg) { toast('Open an image first (menu → Open image)'); return; }
    busy(true);
    setTimeout(() => {
      try {
        const b = doc.bg;
        const maxPx = { normal: 700, high: 1000, max: 1400 }[opts.quality || 'normal'];
        const sc = Math.min(1, maxPx / Math.max(bgImg.naturalWidth, bgImg.naturalHeight));
        const w = Math.max(8, Math.round(bgImg.naturalWidth * sc)), h = Math.max(8, Math.round(bgImg.naturalHeight * sc));
        const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
        const g = c2.getContext('2d'); g.drawImage(bgImg, 0, 0, w, h);
        const px = g.getImageData(0, 0, w, h).data;
        const n = w * h;
        const mask = new Uint8Array(n);
        for (let i = 0; i < n; i++) mask[i] = px[i * 4 + 3] >= 128 ? 1 : 0;
        if (opts.dropBg) {
          // flood-fill from the border through pixels similar to the corner colours
          const corners = [0, w - 1, (h - 1) * w, n - 1].filter(i => mask[i]);
          if (corners.length) {
            const ref = corners.map(i => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
            const near = i => ref.some(r => Math.abs(px[i * 4] - r[0]) + Math.abs(px[i * 4 + 1] - r[1]) + Math.abs(px[i * 4 + 2] - r[2]) < 60);
            const st = [];
            for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); }
            for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
            const seen = new Uint8Array(n);
            while (st.length) {
              const i = st.pop(); if (seen[i]) continue; seen[i] = 1;
              if (!mask[i] || !near(i)) continue;
              mask[i] = 0;
              const x = i % w, y = (i - x) / w;
              if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w);
            }
          }
        }
        const K = opts.colors;
        let C = T.kmeans(px, n, K, mask);
        let L = T.assign(px, n, C, mask);
        L = T.majority(L, w, h, C.length); L = T.majority(L, w, h, C.length);
        const mmPerPx = b.w / w;
        const minArea = Math.max(4, Math.round((opts.detail / mmPerPx) ** 2));
        L = T.despeckle(L, w, h, C.length, minArea);
        // order: biggest areas first (they sit underneath)
        const areas = C.map((_, k) => { let a = 0; for (let i = 0; i < n; i++) if (L[i] === k) a++; return a; });
        const order = C.map((_, k) => k).filter(k => areas[k] > 0).sort((a, b2) => areas[b2] - areas[a]);
        const rank = new Int16Array(C.length); order.forEach((k, r) => rank[k] = r);
        const ANG = [45, -45, 0, 90, 30, -60, 15, -30];
        const made = [], outlines = [];
        const pcaAngle = loops => { let sx = 0, sy = 0, n2 = 0; loops.forEach(l => l.forEach(q => { sx += q[0]; sy += q[1]; n2++; })); const mx = sx / n2, my = sy / n2; let a = 0, b2 = 0, c = 0; loops.forEach(l => l.forEach(q => { const dx = q[0] - mx, dy = q[1] - my; a += dx * dx; b2 += dx * dy; c += dy * dy; })); return 0.5 * Math.atan2(2 * b2, a - c) * 180 / Math.PI; };
        const perim = loops => loops.reduce((t, l) => t + l.reduce((u, q, i2) => u + Math.hypot(q[0] - l[(i2 + 1) % l.length][0], q[1] - l[(i2 + 1) % l.length][1]), 0), 0);
        // group colour clusters that land on the same thread
        const colOf = k => '#' + C[k].map(v => v.toString(16).padStart(2, '0')).join('');
        const groups = [];
        order.forEach(k => {
          let col = colOf(k), nm = null;
          if (opts.snap !== false) { const t = nearestThread(col); col = t[0]; nm = t[1]; }
          let g2 = groups.find(x => x.col === col);
          if (!g2) { g2 = { col, nm: nm || ('Auto colour ' + (groups.length + 1)), ks: [] }; groups.push(g2); }
          g2.ks.push(k);
        });
        const grank = new Int16Array(C.length); groups.forEach((g2, r) => g2.ks.forEach(k => grank[k] = r));
        // chamfer distance transform (half-width of a shape, in px)
        const dist = M => { const D = new Float32Array(n); for (let i = 0; i < n; i++) D[i] = M[i] ? 1e9 : 0;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!D[i]) continue; let v = D[i]; if (x) v = Math.min(v, D[i - 1] + 1); if (y) v = Math.min(v, D[i - w] + 1); if (x && y) v = Math.min(v, D[i - w - 1] + 1.414); if (y && x < w - 1) v = Math.min(v, D[i - w + 1] + 1.414); D[i] = v; }
          for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!D[i]) continue; let v = D[i]; if (x < w - 1) v = Math.min(v, D[i + 1] + 1); if (y < h - 1) v = Math.min(v, D[i + w] + 1); if (x < w - 1 && y < h - 1) v = Math.min(v, D[i + w + 1] + 1.414); if (y < h - 1 && x) v = Math.min(v, D[i + w - 1] + 1.414); D[i] = v; }
          return D; };
        const outlineLines = [];
        groups.forEach((g2, r) => {
          let M = new Uint8Array(n);
          for (let i = 0; i < n; i++) M[i] = L[i] >= 0 && grank[L[i]] === r ? 1 : 0;
          // how wide are the thick parts? (95th percentile of the half-width over the area)
          const D = dist(M); const vals = []; for (let i = 0; i < n; i += 3) if (M[i]) vals.push(D[i]);
          vals.sort((a, b3) => a - b3); const wide = vals.length ? 2 * vals[Math.floor(vals.length * 0.99)] * mmPerPx : 0;
          // underlap: tuck under colours sewn later
          const Dl = T.dilate(M, w, h, 1);
          for (let i = 0; i < n; i++) if (Dl[i] && !M[i] && L[i] >= 0 && grank[L[i]] > r) M[i] = 1;
          const loops = T.contours(M, w, h).map(l => T.simplify(l, opts.smooth || 0.7)).filter(l => Math.abs(T.area(l)) * mmPerPx * mmPerPx > 0.3)
            .map(l => l.map(q => [b.x + q[0] * mmPerPx, b.y + q[1] * mmPerPx]));
          if (!loops.length) return;
          // satin shine where the parts are narrow enough for clean satin (< 7 mm); tatami for big areas
          const satin = opts.style === 'satin' || (opts.style === 'mixed' && wide < 7);
          const long = pcaAngle(loops);
          let angle = opts.dir === 'fixed' ? opts.angle : opts.dir === 'varied' ? ANG[r % ANG.length] : (satin ? long + 90 : long + 45);
          angle = ((Math.round(angle) + 90) % 180 + 180) % 180 - 90;
          const dens = opts.density || 0.4;
          made.push({ type: 'fill', name: g2.nm + (satin ? ' · satin' : ' · tatami'), paths: loops, angle, spacing: satin ? dens : Math.max(dens, 0.3), stitchLen: satin ? 12 : 3.5, underlay: opts.underlay !== false, pullComp: opts.pull == null ? 0.2 : opts.pull, satinLook: satin, color: g2.col, auto: true });
          if (opts.outline && opts.outline !== 'none') loops.forEach(l => { if (perim([l]) > 6) outlineLines.push(l); });
        });
        if (outlineLines.length) {
          const lines = outlineLines.map(l => {
            const R = S.resamplePolyline(l, 2.0, true);
            if (opts.outline !== 'bean') return R;
            const o2 = [R[0]]; for (let i = 1; i < R.length; i++) o2.push(R[i], R[i - 1], R[i]); return o2;
          });
          // nearest-neighbour order to keep trims down
          const ordered = []; let cur = null; const left = lines.slice();
          while (left.length) { let bi = 0, bd = Infinity; if (cur) left.forEach((l, i) => { const d = Math.hypot(l[0][0] - cur[0], l[0][1] - cur[1]); if (d < bd) { bd = d; bi = i; } }); const l = left.splice(bi, 1)[0]; ordered.push(l); cur = l[l.length - 1]; }
          outlines.push({ type: 'stitches', name: 'Outline (' + (opts.outline === 'bean' ? 'bold' : 'thin') + ')', lines: ordered, color: opts.outlineColor || '#000000', auto: true });
        }
        if (opts.replace) doc.objects = doc.objects.filter(o => !o.auto);
        made.concat(outlines).forEach(o => { o.id = doc.nextId++; doc.objects.push(o); });
        selId = null; commit(); renderSheet(); toast(`Created ${made.length} thread layers${outlines.length ? ' + outline' : ''} — tap any to fine-tune`);
      } catch (e) { console.error(e); toast('Auto-digitize failed: ' + e.message); }
      busy(false); draw();
    }, 30);
  }

  // ---------------- files
  function loadBg(src, place) {
    const img = new Image();
    img.onload = () => {
      bgImg = img;
      if (place) {
        const h = hoop(), ar = img.naturalHeight / img.naturalWidth;
        let w = Math.min(doc.width, h.w), hh = w * ar;
        if (hh > h.h) { hh = h.h; w = hh / ar; }
        doc.bg = { src, x: (h.w - w) / 2, y: (h.h - hh) / 2, w, h: hh };
        autosave();
      }
      draw();
    };
    img.src = src;
  }
  function saveBytes(name, bytes, mime) {
    if (window.AndroidBridge && window.AndroidBridge.saveFile) {
      let bin = ''; const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      const ok = window.AndroidBridge.saveFile(name, btoa(bin), mime);
      toast(ok ? `Saved to Downloads/StitchStudio: ${name}` : 'Could not save the file');
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Downloaded ' + name);
  }
  const safeName = () => (doc.name || 'design').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'design';
  function exportFile(kind) {
    const d = design();
    if (!d.count) { toast('Nothing to export yet'); return; }
    const fi = fitInfo(d);
    if (fi && !fi.machine && !confirm('This design is bigger than the Topaz 30 can stitch (14.17 × 7.87 in). Export anyway?')) return;
    if (fi && fi.machine && !fi.fits && !fi.fitsRot) toast('Heads up: the design is bigger than the ' + hoopDef().name + ' hoop');
    const bytes = kind === 'vp3' ? S.writeVP3(d) : S.writeDST(d, doc.name);
    saveBytes(safeName() + '.' + kind, bytes, 'application/octet-stream');
  }

  // ---------------- UI helpers
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
  function busy(on) { $('#busy').classList.toggle('on', on); }
  function hint(s) { $('#hint').textContent = s || ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function slider(label, key, min, max, step, val, unit, onInput) {
    const id = 'r_' + key;
    return { html: `<div class="row"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="val" id="${id}_v">${fmt(val, step)}${unit}</span></div>`, bind: () => {
      const el = $('#' + id); el.addEventListener('input', () => { $('#' + id + '_v').textContent = fmt(+el.value, step) + unit; onInput(+el.value, false); });
      el.addEventListener('change', () => onInput(+el.value, true));
    } };
  }
  const fmt = (v, step) => step >= 1 ? String(Math.round(v)) : (+v).toFixed(step >= 0.1 ? 1 : 2);
  function colorPicker(cur, onPick) {
    const id = 'cp' + Math.random().toString(36).slice(2, 7);
    const html = `<div class="small" style="margin:0 0 4px">My threads</div><div class="swatches" style="margin-bottom:8px" id="${id}f">${favs.map(c => `<button class="sw ${c === cur ? 'on' : ''}" data-c="${c}" style="background:${c}" title="${threadName(c)}" aria-label="${threadName(c)}"></button>`).join('')}</div><div class="swatches" id="${id}">${THREADS.map(c => `<button class="sw ${c === cur ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}<span class="sw swc" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"><input type="color" value="${cur}"></span><button class="btn sm" data-more="1" style="border-radius:999px">All ${CHART.length} threads ▾</button></div><div class="swatches" id="${id}x" style="display:none;margin-top:8px">${CHART.map(([c, nm]) => `<button class="sw ${c === cur ? 'on' : ''}" data-c="${c}" style="background:${c};width:30px;height:30px" aria-label="${nm}" title="${nm}"></button>`).join('')}</div>`;
    return { html, bind: () => {
      const box = $('#' + id);
      box.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => onPick(b.dataset.c)));
      $('#' + id + 'f').querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => onPick(b.dataset.c)));
      const xb = $('#' + id + 'x');
      xb.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { onPick(b.dataset.c); toast(b.title); }));
      box.querySelector('[data-more]').addEventListener('click', e => { const open = xb.style.display === 'none'; xb.style.display = open ? 'flex' : 'none'; e.target.textContent = open ? 'Fewer ▴' : `All ${CHART.length} threads ▾`; });
      box.querySelector('input').addEventListener('change', e => onPick(e.target.value));
    } };
  }
  function mount(parts) {
    sheet.innerHTML = parts.map(p => typeof p === 'string' ? p : p.html).join(''); parts.forEach(p => p.bind && p.bind());
    syncSheetBar();
  }
  // panel size: 'min' (just the bar), 'normal', 'max'
  let sheetSize = (() => { try { return localStorage.getItem('ss_sheet') || 'normal'; } catch (e) { return 'normal'; } })();
  function syncSheetBar() {
    const has = sheet.innerHTML.trim() !== '';
    $('#sheetBar').classList.toggle('show', has);
    const h = sheet.querySelector('h3'); $('#sheetTitle').textContent = h ? h.textContent : 'Tools';
    const app = $('#app'); app.classList.toggle('sheet-min', sheetSize === 'min'); app.classList.toggle('sheet-max', sheetSize === 'max');
  }
  function setSheetSize(z) { sheetSize = z; try { localStorage.setItem('ss_sheet', z); } catch (e) {} syncSheetBar(); }
  const btn = (id, label, cls) => `<button class="btn ${cls || ''}" id="${id}">${label}</button>`;
  const on = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };

  function setTool(t, keepSel) {
    if (draft && t !== tool) draft = null;
    if (t === 'fill' || t === 'satin' || t === 'run') drawKind = t;
    tool = t; if (!keepSel && t !== 'select' && t !== 'layers' && t !== 'brush' && t !== 'pick') selId = null;
    document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === t || (b.dataset.tool === 'draw' && t === drawKind)));
    renderSheet(); draw();
  }

  // ---------------- bottom sheet per context
  function renderSheet() {
    hint('');
    if (preview) return renderPreviewSheet();
    if (tool === 'fill' || tool === 'satin' || tool === 'run') return renderDrawSheet();
    if (tool === 'brush') return renderBrushSheet();
    if (tool === 'pick') return renderPickSheet();
    if (tool === 'text') return renderTextSheet(null);
    if (tool === 'auto') return renderAutoSheet();
    if (tool === 'layers') return renderLayers();
    const o = sel();
    if (!o) { sheet.innerHTML = ''; syncSheetBar(); hint(doc.objects.length ? 'Tap a shape to edit it' : 'Open an image from the menu, then trace it or tap Auto'); return; }
    renderProps(o);
  }

  function renderPickSheet() {
    const o = sel();
    const step2 = o && o.type === 'fill';
    hint(!bgImg ? 'Open an image first (menu → Open image)' : step2 ? 'Swipe across the shape to set the thread direction · tap another colour for the next layer' : 'Tap a colour in your picture');
    const favRow = `<div class="row" style="align-items:flex-start"><label style="padding-top:6px">My threads</label><div style="flex:1"><div class="swatches" id="pkFav">${favs.map((c, i) => `<button class="sw ${favEdit === i ? 'on' : (pick.thread === c && favEdit < 0 ? 'on' : '')}" data-i="${i}" style="background:${c};position:relative" title="${threadName(c)}" aria-label="${threadName(c)}">${favEdit >= 0 ? `<span style="position:absolute;right:-4px;top:-6px;font-size:11px;background:var(--panel2);border-radius:8px;padding:0 4px">${i + 1}</span>` : ''}</button>`).join('')}<button class="btn sm" id="pkFavEdit">${favEdit >= 0 ? 'Done' : 'Edit'}</button></div>
      <div class="small" style="margin-top:4px">${favEdit >= 0 ? `Slot ${favEdit + 1}: tap a thread below to put it here` : pick.thread ? `New picks use <b>${threadName(pick.thread)}</b> · tap it again to use picture colours` : 'Tap one to stitch your picks in that thread · Edit to choose your 7'}</div></div></div>`;
    const parts = ['<div class="sec"><h3>Pick colour → swipe direction</h3>', favRow];
    if (favEdit >= 0) parts.push(`<div class="swatches" id="pkChart" style="margin:4px 0 10px">${CHART.map(([c, nm]) => `<button class="sw ${c === favs[favEdit] ? 'on' : ''}" data-c="${c}" style="background:${c};width:30px;height:30px" title="${nm}" aria-label="${nm}"></button>`).join('')}<span class="sw swc" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);width:30px;height:30px"><input type="color" id="pkFavCustom" value="${favs[favEdit]}"></span></div>`);
    parts.push(
      `<div class="row"><label>Pick</label><div class="toggle" id="pkScope"><button data-v="area" class="${pick.scope === 'area' ? 'on' : ''}">Touching area</button><button data-v="colour" class="${pick.scope === 'colour' ? 'on' : ''}">Whole colour</button></div></div>`,
      `<div class="row"><label>Stitch</label><div class="toggle" id="pkStyle"><button data-v="satin" class="${pick.style === 'satin' ? 'on' : ''}">Satin look</button><button data-v="tatami" class="${pick.style !== 'satin' ? 'on' : ''}">Tatami</button></div></div>`,
      densityPresets(step2 ? o : null),
      slider('Tolerance', 'pkt', 5, 120, 1, pick.tol, '', v => pick.tol = v));
    if (step2) {
      parts.push(`</div><div class="sec"><h3>${esc(o.name || 'Layer')} · ${o.flow ? 'curved flow' : (o.angle || 0) + '°'}</h3>`);
      parts.push(colorPicker(o.color, c => { o.color = c; currentColor = c; commit(); renderSheet(); draw(); }));
      parts.push(`<div class="btns" style="margin-top:10px">${o.flow ? btn('pkStraight', 'Make straight') : ''}${btn('pkNext', 'Next colour', 'primary')}${btn('pkDel', 'Delete layer', 'danger')}</div>`);
    }
    parts.push('<p class="small" style="margin:8px 0 0">Pick big background colours first and details last. One finger: tap = pick a colour, swipe = thread direction of the selected layer (select any layer in Layers to re-aim it). Two fingers: move/zoom.</p></div>');
    mount(parts);
    const tg = (id, fn) => $('#' + id).querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { fn(b2.dataset.v); renderSheet(); }));
    tg('pkScope', v => pick.scope = v);
    $('#pkFav').querySelectorAll('[data-i]').forEach(b2 => b2.addEventListener('click', () => {
      const i = +b2.dataset.i, c = favs[i];
      if (favEdit >= 0) { favEdit = i; renderSheet(); return; }
      pick.thread = pick.thread === c ? null : c;
      if (pick.thread && step2) { o.color = c; currentColor = c; commit(); draw(); }
      if (pick.thread) toast(threadName(c));
      renderSheet();
    }));
    on('pkFavEdit', () => { favEdit = favEdit >= 0 ? -1 : 0; renderSheet(); });
    const pc = $('#pkChart');
    if (pc) {
      const setFav = c => { const old = favs[favEdit]; favs[favEdit] = c; if (pick.thread === old) pick.thread = c; saveFavs(); toast(`Slot ${favEdit + 1}: ${threadName(c)}`); favEdit = Math.min(6, favEdit + 1); renderSheet(); };
      pc.querySelectorAll('[data-c]').forEach(b2 => b2.addEventListener('click', () => setFav(b2.dataset.c)));
      $('#pkFavCustom').addEventListener('change', e => setFav(e.target.value));
    }
    tg('pkStyle', v => { pick.style = v; if (step2) { o.satinLook = v === 'satin'; o.stitchLen = o.satinLook ? 12 : 3.5; commit(); draw(); } });
    $('#dPre').querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { pick.density = +b2.dataset.v; if (step2) { o.spacing = pick.density; commit(); draw(); } renderSheet(); }));
    on('pkNext', () => { selId = null; renderSheet(); draw(); });
    on('pkStraight', () => { delete o.flow; commit(); renderSheet(); draw(); });
    on('pkDel', () => { doc.objects = doc.objects.filter(x => x !== o); selId = null; commit(); renderSheet(); draw(); });
  }

  function renderImageSheet() {
    window.__imgSheet = true;
    if (!doc.bg) { mount([`<div class="sec"><h3>Image</h3><p class="small">No image yet.</p><div class="btns">${btn('iOpen', 'Open image', 'primary')}</div></div>`]); on('iOpen', () => $('#fImage').click()); return; }
    const b = doc.bg;
    const parts = [`<div class="sec"><h3>Image size (inches)</h3>
      <div class="row"><label>Width</label><input type="number" id="iW" step="0.05" min="0.2" value="${inch(b.w)}"><span class="val">in</span></div>
      <div class="row"><label>Height</label><input type="number" id="iH" step="0.05" min="0.2" value="${inch(b.h)}"><span class="val">in</span></div>
      <p class="small" style="margin:0 0 6px">Proportions stay locked. Hoop: ${inch(hoop().w)} × ${inch(hoop().h)} in.</p>`,
      slider('Image fade', 'iO', 0, 1, 0.05, doc.bgOpacity, '', v => { doc.bgOpacity = v; draw(); }),
      `<div class="btns" style="margin-top:8px">${btn('iFit', 'Fit to hoop')}${btn('iCen', 'Center')}<button class="btn ${imgMove ? 'primary' : ''}" id="iMove">${imgMove ? 'Moving image — tap to stop' : 'Move image'}</button>${btn('iDone', 'Done')}</div></div>`];
    mount(parts);
    const setW = (wmm) => { const ar = b.h / b.w, cx = b.x + b.w / 2, cy = b.y + b.h / 2; b.w = wmm; b.h = wmm * ar; b.x = cx - b.w / 2; b.y = cy - b.h / 2; doc.width = b.w; autosave(); draw(); };
    $('#iW').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) { setW(v * IN); $('#iH').value = inch(b.h); } });
    $('#iH').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) { setW(v * IN * b.w / b.h); $('#iW').value = inch(b.w); } });
    on('iFit', () => { const h = hoop(), ar = b.h / b.w; let w = h.w * 0.94, hh = w * ar; if (hh > h.h * 0.94) { hh = h.h * 0.94; w = hh / ar; } b.w = w; b.h = hh; b.x = (h.w - w) / 2; b.y = (h.h - hh) / 2; autosave(); renderImageSheet(); draw(); });
    on('iCen', () => { const h = hoop(); b.x = (h.w - b.w) / 2; b.y = (h.h - b.h) / 2; autosave(); draw(); });
    on('iMove', () => { imgMove = !imgMove; renderImageSheet(); });
    on('iDone', () => { imgMove = false; window.__imgSheet = false; renderSheet(); });
  }

  function renderBrushSheet() {
    const tips = { satin: 'Paint a satin column with your finger', line: 'Paint a running-stitch line', fill: 'Paint an area. With a fill selected, you add to it', erase: 'Select a fill, then rub out parts of it', flow: 'Select a fill, then draw the direction the thread should flow' };
    hint(tips[brush.mode]);
    const modes = [['satin', 'Satin'], ['line', 'Line'], ['fill', 'Fill'], ['erase', 'Erase'], ['flow', 'Flow']];
    const parts = ['<div class="sec"><h3>Stitch brush</h3>',
      `<div class="toggle" id="bMode" style="display:flex">${modes.map(([k, l]) => `<button data-v="${k}" class="${brush.mode === k ? 'on' : ''}" style="flex:1">${l}</button>`).join('')}</div>`];
    if (brush.mode === 'satin' || brush.mode === 'fill' || brush.mode === 'erase') parts.push(slider('Brush size', 'bs', 0.8, brush.mode === 'satin' ? 8 : 20, 0.1, brush.size, ' mm', v => brush.size = v));
    if (brush.mode === 'line') parts.push(`<div class="row"><label>Thickness</label><div class="toggle" id="bPass"><button data-v="1" class="${brush.passes === 1 ? 'on' : ''}">Single</button><button data-v="3" class="${brush.passes === 3 ? 'on' : ''}">Triple (bean)</button></div></div>`);
    if (brush.mode !== 'erase' && brush.mode !== 'flow') parts.push(colorPicker(currentColor, c => { currentColor = c; renderSheet(); }));
    const o = sel();
    if (brush.mode === 'flow' && o && o.type === 'fill') parts.push(`<div class="btns" style="margin-top:10px">${btn('bClearFlow', 'Clear flow lines')}</div>`);
    parts.push(`<p class="small" style="margin:8px 0 0">${o ? 'Editing: ' + esc(o.name || o.type) + ' — ' : ''}one finger paints, two fingers move the view.</p></div>`);
    mount(parts);
    $('#bMode').querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { brush.mode = b2.dataset.v; if (brush.mode === 'satin' && brush.size > 8) brush.size = 3; renderSheet(); }));
    const bp = $('#bPass'); if (bp) bp.querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { brush.passes = +b2.dataset.v; renderSheet(); }));
    on('bClearFlow', () => { delete o.flow; commit(); renderSheet(); draw(); });
  }

  function renderDrawSheet() {
    const names = { fill: 'Fill area', satin: 'Satin column', run: 'Line (running stitch)' };
    const tips = { fill: 'Tap around the shape. Tap the first point to close it.', satin: 'Tap along the middle of the column. Set the width first.', run: 'Tap along the line.' };
    hint(tips[tool]);
    fillMode = 'points';
    const parts = [`<div class="sec"><div class="toggle" id="dKind" style="display:flex;margin-bottom:8px">${[['fill', 'Fill'], ['satin', 'Satin'], ['run', 'Line']].map(([k, l]) => `<button data-v="${k}" class="${tool === k ? 'on' : ''}" style="flex:1">${l}</button>`).join('')}</div><h3>${names[tool]}</h3>`];
    if (tool === 'fill') {
      if (fillTrace === 'freehand') hint('Pick a colour, then trace around the part with your finger');
      parts.push(`<div class="row"><label>Trace</label><div class="toggle" id="fTrace"><button data-v="freehand" class="${fillTrace === 'freehand' ? 'on' : ''}">Freehand</button><button data-v="points" class="${fillTrace === 'points' ? 'on' : ''}">Tap points</button></div></div>`);
      parts.push(`<div class="row"><label>Stitch</label><div class="toggle" id="fStyle"><button data-v="satin" class="${pick.style === 'satin' ? 'on' : ''}">Satin look</button><button data-v="tatami" class="${pick.style !== 'satin' ? 'on' : ''}">Tatami</button></div></div>`);
      parts.push(densityPresets(null));
    }
    if (tool === 'satin') parts.push(`<div class="row"><label>Method</label><div class="toggle" id="sMode"><button data-v="center" class="${satinMode === 'center' ? 'on' : ''}">Centre line</button><button data-v="rails" class="${satinMode === 'rails' ? 'on' : ''}">Point–counterpoint</button></div></div>`);
    if (tool === 'satin' && satinMode === 'rails') hint('Tap one edge, then the opposite edge, and keep alternating along the column');
    if (!(tool === 'fill' && fillMode === 'quick')) parts.push(colorPicker(currentColor, c => { currentColor = c; renderSheet(); }));
    if (tool === 'satin' && satinMode === 'center') parts.push(slider('Column width', 'sw', 0.8, 8, 0.1, doc.satinWidth, ' mm', (v) => { doc.satinWidth = v; if (draft && draft.points.length) draft.points[draft.points.length - 1][2] = v; draw(); }));
    if (!(tool === 'fill' && fillTrace === 'freehand')) parts.push(`<div class="btns" style="margin-top:10px">${btn('dDone', 'Done', 'primary')}${tool === 'fill' ? btn('dHole', 'Add hole') : ''}${btn('dBack', 'Undo point')}${btn('dCancel', 'Cancel', 'danger')}</div></div>`);
    if (tool === 'fill' && fillTrace === 'freehand') parts.push('</div>');
    mount(parts);
    $('#dKind').querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => setTool(b2.dataset.v)));
    const ft = $('#fTrace'); if (ft) ft.querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { fillTrace = b2.dataset.v; draft = null; renderSheet(); draw(); }));
    const fs = $('#fStyle'); if (fs) fs.querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { pick.style = b2.dataset.v; renderSheet(); }));
    const dp = $('#dPre'); if (dp) dp.querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { pick.density = +b2.dataset.v; renderSheet(); }));
    const fm = $('#fMode'); if (fm) fm.querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { fillMode = b2.dataset.v; draft = null; renderSheet(); draw(); }));
    const sm = $('#sMode'); if (sm) sm.querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { satinMode = b2.dataset.v; draft = null; renderSheet(); draw(); }));
    on('dDone', finishDraft);
    on('dHole', () => { if (!draft || draft.loops[draft.loops.length - 1].length < 3) { toast('Finish the outer shape first'); return; } draft.loops.push([]); hint('Now tap around the hole'); draw(); });
    on('dBack', () => { if (!draft) return; const l = draft.type === 'fill' ? draft.loops[draft.loops.length - 1] : draft.points; l.pop(); draw(); });
    on('dCancel', () => { draft = null; setTool('select'); });
  }

  function renderProps(o) {
    const set = (k, v, final) => { o[k] = v; if (o.type === 'text' && ['size', 'bend', 'font', 'text', 'style', 'spacingLetters'].includes(k)) layoutText(o); draw(); if (final) commit(); };
    const parts = [`<div class="sec"><h3>${esc(o.name || o.type)} · ${{ fill: 'Fill', satin: 'Satin', run: 'Line', text: 'Text', stitches: 'Imported stitches' }[o.type]}</h3>`];
    parts.push(colorPicker(o.color, c => { o.color = c; currentColor = c; commit(); renderSheet(); draw(); }));
    if (o.type === 'stitches') parts.push('<p class="small" style="margin:8px 0 0">Imported stitches are kept exactly as they were digitized. Drag inside the box to move them; change the thread colour above; use Sew earlier / later to set the order.</p>');
    parts.push('</div><div class="sec"><h3>Stitches</h3>');
    if (o.type === 'fill') {
      parts.push(slider('Angle', 'ang', -90, 90, 1, o.angle || 0, '°', (v, f) => set('angle', v, f)));
      parts.push(`<div class="row"><label>Style</label><div class="toggle" id="tLook"><button data-v="satin" class="${o.satinLook ? 'on' : ''}">Satin look</button><button data-v="tatami" class="${!o.satinLook ? 'on' : ''}">Tatami</button></div></div>`);
      parts.push(densityPresets(o));
      parts.push(slider('Density', 'den', 0.15, 1.2, 0.01, o.spacing || 0.4, ' mm', (v, f) => set('spacing', v, f)));
      parts.push(slider('Stitch length', 'sl', 1.5, 7, 0.1, o.stitchLen || 3.5, ' mm', (v, f) => set('stitchLen', v, f)));
      parts.push(slider('Pull comp', 'pc', 0, 0.6, 0.01, o.pullComp == null ? 0.2 : o.pullComp, ' mm', (v, f) => set('pullComp', v, f)));
    }
    if (o.type === 'fill' && o.flow) parts.push(`<p class="small" style="margin:4px 0">Stitches follow ${o.flow.length} flow line${o.flow.length > 1 ? 's' : ''} (angle is ignored). <button class="btn sm" id="pClearFlow">Clear flow</button></p>`);
    if (o.type === 'fill') parts.push(`<p class="small" style="margin:4px 0">Tip: use <b>Brush → Flow</b> to curve the stitch direction.</p>`);
    if (o.type === 'satin' && o.mode !== 'rails') {
      const k = selNode >= 0 && selNode < o.points.length ? selNode : -1;
      const w0 = k >= 0 ? o.points[k][2] : o.points.reduce((a, p) => a + p[2], 0) / o.points.length;
      parts.push(slider(k >= 0 ? `Width (point ${k + 1})` : 'Width (all)', 'w', 0.6, 8, 0.1, w0, ' mm', (v, f) => { if (k >= 0) o.points[k][2] = v; else o.points.forEach(p => p[2] = v); draw(); if (f) commit(); }));
    }
    if (o.type === 'satin') {
      parts.push(densityPresets(o));
      parts.push(slider('Density', 'den', 0.12, 1, 0.01, o.spacing || 0.4, ' mm', (v, f) => set('spacing', v, f)));
      parts.push(slider('Pull comp', 'pc', 0, 0.5, 0.01, o.pullComp == null ? 0.15 : o.pullComp, ' mm', (v, f) => set('pullComp', v, f)));
    }
    if (o.type === 'run') {
      parts.push(slider('Stitch length', 'sl', 0.8, 5, 0.1, o.stitchLen || 2.5, ' mm', (v, f) => set('stitchLen', v, f)));
      parts.push(`<div class="row"><label>Thickness</label><div class="toggle" id="tPass"><button data-v="1" class="${(o.passes || 1) === 1 ? 'on' : ''}">Single</button><button data-v="3" class="${o.passes === 3 ? 'on' : ''}">Triple (bean)</button></div></div>`);
      parts.push(`<div class="row"><label>Shape</label><div class="toggle" id="tCurve"><button data-v="1" class="${o.curve !== false ? 'on' : ''}">Curved</button><button data-v="0" class="${o.curve === false ? 'on' : ''}">Straight</button></div></div>`);
    }
    if (o.type === 'text') {
      parts.push(`<div class="row"><label>Text</label><input type="text" id="tText" value="${esc(o.text)}"></div>`);
      parts.push(`<div class="row"><label>Font</label><select id="tFont">${FONTS.map((f, i) => `<option value="${i}" ${i === (o.font || 0) ? 'selected' : ''}>${f.label}</option>`).join('')}</select></div>`);
      parts.push(slider('Letter height', 'ts', 4, 60, 0.5, o.size, ' mm', (v, f) => set('size', v, f)));
      parts.push(slider('Arch', 'ta', -100, 100, 1, o.bend || 0, '', (v, f) => set('bend', v, f)));
      parts.push(slider('Spacing', 'tl', -2, 6, 0.1, o.spacingLetters || 0, ' mm', (v, f) => set('spacingLetters', v, f)));
      parts.push(densityPresets(o));
      parts.push(slider('Density', 'den', 0.15, 0.8, 0.01, o.spacing || 0.38, ' mm', (v, f) => set('spacing', v, f)));
      parts.push(`<div class="row"><label>Style</label><div class="toggle" id="tStyle"><button data-v="satin" class="${o.style !== 'fill' ? 'on' : ''}">Satin look</button><button data-v="fill" class="${o.style === 'fill' ? 'on' : ''}">Fill</button></div></div>`);
    }
    if (o.type !== 'run' && o.type !== 'stitches') parts.push(`<div class="row"><label>Underlay</label><div class="toggle" id="tUnder"><button data-v="1" class="${o.underlay !== false ? 'on' : ''}">On</button><button data-v="0" class="${o.underlay === false ? 'on' : ''}">Off</button></div></div>`);
    parts.push(`</div><div class="sec"><div class="btns">${btn('pUp', 'Sew earlier')}${btn('pDown', 'Sew later')}${btn('pDup', 'Duplicate')}${o.type !== 'text' && o.type !== 'stitches' ? btn('pDelNode', 'Delete point') : ''}${btn('pDel', 'Delete', 'danger')}</div>
      <p class="small" style="margin:10px 0 0">${o.type === 'stitches' ? 'Drag inside the box to move.' : 'Drag white dots to reshape.'} Drag inside the shape to move it. Two fingers to zoom.</p></div>`);
    mount(parts);
    const tog = (id, fn) => { const el = $('#' + id); if (el) el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { fn(b.dataset.v); commit(); renderSheet(); draw(); })); };
    tog('tPass', v => o.passes = +v); tog('tCurve', v => o.curve = v === '1'); tog('tUnder', v => o.underlay = v === '1');
    tog('tStyle', v => { o.style = v; layoutText(o); });
    tog('tLook', v => { o.satinLook = v === 'satin'; o.stitchLen = o.satinLook ? 12 : 3.5; o.pullComp = o.satinLook ? 0.15 : 0.2; });
    const dp = $('#dPre'); if (dp) dp.querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { o.spacing = +b2.dataset.v; commit(); renderSheet(); draw(); }));
    const tt = $('#tText'); if (tt) { tt.addEventListener('input', () => { o.text = tt.value; layoutText(o); draw(); }); tt.addEventListener('change', () => commit()); }
    const tf = $('#tFont'); if (tf) tf.addEventListener('change', () => { o.font = +tf.value; layoutText(o); commit(); draw(); });
    on('pClearFlow', () => { delete o.flow; commit(); renderSheet(); draw(); });
    on('pDel', () => { doc.objects = doc.objects.filter(x => x !== o); selId = null; commit(); renderSheet(); draw(); });
    on('pDup', () => { const c = JSON.parse(JSON.stringify(o)); delete c.id; translate(c, 3, 3); addObject(c); });
    on('pUp', () => move(o, -1)); on('pDown', () => move(o, 1));
    on('pDelNode', () => {
      if (selNode < 0) { toast('Tap a point first'); return; }
      const n = nodeAt(o, selNode); const arr = o.type === 'fill' ? o.paths[n.li] : o.points;
      if (arr.length <= (o.type === 'fill' ? 3 : 2)) { toast('Too few points left'); return; }
      arr.splice(n.pi, 1); selNode = -1; commit(); renderSheet(); draw();
    });
  }
  const DENS = [['Standard', 0.40], ['Dense', 0.32], ['Extra dense', 0.25], ['Max', 0.18]];
  function densityPresets(o) {
    const cur = o ? (o.spacing || 0.4) : pick.density;
    return `<div class="row"><label>Density</label><div class="toggle" id="dPre" style="flex:1;display:flex">${DENS.map(([l, v]) => `<button data-v="${v}" class="${Math.abs(cur - v) < 0.005 ? 'on' : ''}" style="flex:1;padding:8px 4px;font-size:13px">${l}</button>`).join('')}</div></div>`;
  }
  function move(o, d) {
    const i = doc.objects.indexOf(o), j = i + d; if (j < 0 || j >= doc.objects.length) return;
    doc.objects.splice(i, 1); doc.objects.splice(j, 0, o); commit(); renderSheet(); draw();
  }

  function renderTextSheet() {
    hint(textAt ? '' : 'Tap where the middle of the text should go');
    const st = renderTextSheet.st || (renderTextSheet.st = { text: 'TEXT', font: 0, size: 10, arc: 0, style: 'satin' });
    const parts = ['<div class="sec"><h3>Lettering</h3>',
      `<div class="row"><label>Text</label><input type="text" id="nText" value="${esc(st.text)}"></div>`,
      `<div class="row"><label>Font</label><select id="nFont">${FONTS.map((f, i) => `<option value="${i}" ${i === st.font ? 'selected' : ''}>${f.label}</option>`).join('')}</select></div>`,
      slider('Letter height', 'ns', 4, 60, 0.5, st.size, ' mm', v => st.size = v),
      colorPicker(currentColor, c => { currentColor = c; renderSheet(); }),
      `<div class="btns" style="margin-top:10px">${btn('nAdd', 'Add text', 'primary')}</div></div>`];
    mount(parts);
    $('#nText').addEventListener('input', e => st.text = e.target.value);
    $('#nFont').addEventListener('change', e => st.font = +e.target.value);
    on('nAdd', () => {
      if (!st.text.trim()) { toast('Type some text'); return; }
      const h = hoop(); const p = textAt || [h.w / 2, h.h / 2];
      const o = { type: 'text', name: 'Text: ' + st.text.slice(0, 14), text: st.text, font: st.font, size: st.size, bend: 0, x: p[0], y: p[1], style: 'satin', spacing: 0.38, underlay: true, pullComp: 0.12 };
      layoutText(o); textAt = null; addObject(o); setTool('select', true);
    });
  }

  function renderAutoSheet() {
    const st = renderAutoSheet.st || (renderAutoSheet.st = { colors: 6, detail: 0.6, dropBg: true, style: 'mixed', density: 0.32, dir: 'shape', angle: 45, underlay: true, pull: 0.2, snap: true, outline: 'none', outlineColor: '#000000', quality: 'high', smooth: 0.7, replace: true, opacity: 1 });
    const tg = (id, label, val, opts) => `<div class="row"><label>${label}</label><div class="toggle" id="${id}" style="flex:1;display:flex">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(val) === String(v) ? 'on' : ''}" style="flex:1;padding:8px 4px;font-size:13px">${l}</button>`).join('')}</div></div>`;
    const parts = ['<div class="sec"><h3>Auto-digitize</h3>',
      '<p class="small" style="margin:0 0 6px">Turns the picture into stitch layers, one per thread colour. Tap any layer afterwards to fine-tune it by hand.</p>',
      `<div class="row"><label>Image size</label><span style="flex:1">${doc.bg ? inch(doc.bg.w) + ' × ' + inch(doc.bg.h) + ' in' : '—'}</span><button class="btn sm" id="aSize">Set inches</button></div>`,
      `<div class="btns" style="margin:6px 0 2px">${btn('aGo', 'Auto-digitize', 'primary')}${btn('aImg', 'Open image')}</div></div>`,
      '<div class="sec"><h3>Colours</h3>',
      slider('Thread colours', 'ac', 2, 24, 1, st.colors, '', v => st.colors = v),
      tg('aSnap', 'Match to', st.snap ? 1 : 0, [[1, 'Thread chart'], [0, 'Exact image']]),
      tg('aBg', 'Background', st.dropBg ? 1 : 0, [[1, 'Remove'], [0, 'Keep']]),
      '</div><div class="sec"><h3>Stitch look</h3>',
      tg('aStyle', 'Style', st.style, [['mixed', 'Mixed'], ['satin', 'Satin shine'], ['tatami', 'Tatami']]),
      '<p class="small" style="margin:0 0 4px">Mixed = satin shine on narrow parts and lettering, tatami on big areas (how pros do it).</p>',
      tg('aDen', 'Density', st.density, [[0.4, 'Standard'], [0.32, 'Dense'], [0.25, 'Extra'], [0.18, 'Max']]),
      tg('aDir', 'Direction', st.dir, [['shape', 'Follow shape'], ['fixed', 'One angle'], ['varied', 'Varied']])];
    if (st.dir === 'fixed') parts.push(slider('Angle', 'aAng', -90, 90, 1, st.angle, '°', v => st.angle = v));
    parts.push(tg('aUnder', 'Underlay', st.underlay ? 1 : 0, [[1, 'On'], [0, 'Off']]),
      slider('Pull comp', 'aPull', 0, 0.5, 0.01, st.pull, ' mm', v => st.pull = v),
      '</div><div class="sec"><h3>Outline</h3>',
      tg('aOut', 'Outline', st.outline, [['none', 'None'], ['run', 'Thin'], ['bean', 'Bold']]),
      '<p class="small" style="margin:0 0 4px">Outlines every colour edge. Best for simple logos and lettering; leave off for detailed artwork.</p>');
    if (st.outline !== 'none') parts.push(colorPicker(st.outlineColor, c => { st.outlineColor = c; renderSheet(); }));
    parts.push('</div><div class="sec"><h3>Detail</h3>',
      tg('aQ', 'Quality', st.quality, [['normal', 'Normal'], ['high', 'High'], ['max', 'Max']]),
      slider('Smallest detail', 'ad', 0.3, 3, 0.1, st.detail, ' mm', v => st.detail = v),
      slider('Edge smoothing', 'asm', 0.3, 2, 0.1, st.smooth, '', v => st.smooth = v),
      tg('aRep', 'Re-run', st.replace ? 1 : 0, [[1, 'Replace last auto'], [0, 'Add on top']]),
      slider('Image fade', 'ao', 0, 1, 0.05, doc.bgOpacity, '', v => { doc.bgOpacity = v; draw(); }),
      `<div class="btns" style="margin-top:10px">${btn('aGo2', 'Auto-digitize', 'primary')}</div></div>`);
    mount(parts);
    const bindT = (id, fn) => { const el = $('#' + id); if (el) el.querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { fn(b2.dataset.v); renderSheet(); })); };
    bindT('aSnap', v => st.snap = v === '1'); bindT('aBg', v => st.dropBg = v === '1'); bindT('aStyle', v => st.style = v);
    bindT('aDen', v => st.density = +v); bindT('aDir', v => st.dir = v); bindT('aUnder', v => st.underlay = v === '1');
    bindT('aOut', v => st.outline = v); bindT('aQ', v => st.quality = v); bindT('aRep', v => st.replace = v === '1');
    on('aGo', () => autoDigitize(st)); on('aGo2', () => autoDigitize(st));
    on('aSize', () => renderImageSheet());
    on('aImg', () => $('#fImage').click());
  }


  function renderLayers() {
    if (!doc.objects.length) { mount(['<div class="sec"><h3>Sew order</h3><p class="small">No shapes yet.</p></div>']); return; }
    const parts = ['<div class="sec"><h3>Sew order (top sews first)</h3>'];
    doc.objects.forEach((o, i) => {
      const P = pieces(o); let n = 0; P.forEach(p => n += p.pts.length);
      parts.push(`<div class="layer ${o.id === selId ? 'on' : ''}" data-id="${o.id}"><span class="dot" style="background:${o.color}"></span><span class="nm">${esc(o.name || o.type)}<br><span class="meta">${{ fill: 'Fill', satin: 'Satin', run: 'Line', text: 'Text', stitches: 'Imported stitches' }[o.type]} · ${n.toLocaleString()} st</span></span>
        <button class="ib" data-a="up" aria-label="Sew earlier"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
        <button class="ib" data-a="down" aria-label="Sew later"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
        <button class="ib" data-a="eye" aria-label="Show or hide"><svg viewBox="0 0 24 24">${o.hidden ? '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1"/>' : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'}</svg></button></div>`);
    });
    parts.push('</div>');
    mount(parts);
    sheet.querySelectorAll('.layer').forEach(el => {
      const o = doc.objects.find(x => x.id === +el.dataset.id);
      el.addEventListener('click', e => {
        const a = e.target.closest('button'); if (a) { e.stopPropagation(); if (a.dataset.a === 'up') move(o, -1); else if (a.dataset.a === 'down') move(o, 1); else { o.hidden = !o.hidden; commit(); renderSheet(); draw(); } return; }
        selId = o.id; selNode = -1; renderSheet(); draw();
      });
    });
  }

  const FABRICS = [['#f4f3ef', 'White'], ['#e9e7e1', 'Natural'], ['#1a1a1c', 'Black'], ['#1c2541', 'Navy'], ['#2648a8', 'Royal blue'], ['#8e1b1b', 'Red'], ['#7d8086', 'Gray'], ['#c8b48a', 'Khaki'], ['#2f4f2f', 'Forest']];
  function renderPreviewSheet() {
    const d = previewCache || (previewCache = design());
    const b = d.bounds, wmm = b[2] - b[0], hmm = b[3] - b[1];
    const mins = Math.round(d.count / 600 + d.trims * 0.1 + d.colors.length * 0.5);
    const parts = ['<div class="sec"><h3>Realistic preview</h3>',
      slider('Sew-out', 'pp', 0, 100, 1, Math.round(progress * 100), '%', v => { progress = v / 100; draw(); }),
      `${(() => { const fi = fitInfo(d); return fi ? `<p class="small" style="margin:0 0 8px;color:${fi.fits || fi.fitsRot ? 'var(--ok)' : '#ff8a8d'}">${fi.fits ? '✓ Fits the ' + hoopDef().name + ' hoop' : fi.fitsRot ? '⟳ Fits the ' + hoopDef().name + ' hoop if rotated' : fi.machine ? '✗ Too big for the ' + hoopDef().name + ' hoop — pick a bigger hoop' : '✗ Bigger than the Topaz 30 can stitch (14.17 × 7.87 in)'}</p>` : ''; })()}<div class="stats"><span>Stitches</span><b>${d.count.toLocaleString()}</b><span>Size</span><b>${(wmm / 25.4).toFixed(2)} × ${(hmm / 25.4).toFixed(2)} in</b><span>Thread changes</span><b>${d.colors.length}</b><span>Trims</span><b>${d.trims}</b><span>Est. sew time</span><b>~${mins} min</b></div>`,
      `<div class="swatches" style="margin-top:10px">${d.colors.map((c, i) => `<span class="sw" title="${i + 1}" style="background:${c.color}"></span>`).join('')}</div>`,
      `<h3 style="margin-top:14px">Fabric</h3><div class="swatches" id="fabSw">${FABRICS.map(([c, n]) => `<button class="sw ${c === (doc.fabric || '#e9e7e1') ? 'on' : ''}" data-f="${c}" style="background:${c}" aria-label="${n}" title="${n}"></button>`).join('')}</div>`,
      `<div class="btns" style="margin-top:12px">${btn('xVp3', 'Export VP3', 'primary')}${btn('xDst', 'Export DST')}</div></div>`];
    mount(parts);
    on('xVp3', () => exportFile('vp3')); on('xDst', () => exportFile('dst'));
    sheet.querySelectorAll('[data-f]').forEach(b2 => b2.addEventListener('click', () => { doc.fabric = b2.dataset.f; autosave(); renderSheet(); draw(); }));
  }

  function renderHoopSheet() {
    hint('');
    const cur = hoopDef();
    const parts = ['<div class="sec"><h3>Hoop · Designer Topaz 30</h3>'];
    HOOPS.forEach(h => {
      const on = h.id === cur.id;
      const dims = h.id === 'custom' ? `${inch((doc.customHoop || {}).w || 150)} × ${inch((doc.customHoop || {}).h || 150)} in` : `${inch(h.w)} × ${inch(h.h)} in · ${h.w} × ${h.h} mm`;
      parts.push(`<div class="layer ${on ? 'on' : ''}" data-hoop="${h.id}" style="cursor:pointer"><span class="dot" style="border-radius:6px;background:${on ? 'var(--accent)' : 'transparent'}"></span><span class="nm"><b>${h.name}</b> — ${dims}<br><span class="meta">${h.tag}</span></span></div>`);
    });
    if (cur.id === 'custom') parts.push(`<div class="row"><label>Width</label><input type="number" id="cW" step="0.1" min="0.8" max="14.17" value="${inch((doc.customHoop || {}).w || 150)}"><span class="val">in</span></div><div class="row"><label>Height</label><input type="number" id="cH" step="0.1" min="0.8" max="14.17" value="${inch((doc.customHoop || {}).h || 150)}"><span class="val">in</span></div><p class="small" style="margin:0">The Topaz 30 can stitch up to 14.17 × 7.87 in (360 × 200 mm).</p>`);
    parts.push(`<div class="row"><label>Orientation</label><div class="toggle" id="hRot"><button data-v="0" class="${!doc.hoopRot ? 'on' : ''}">${hoopDef().w >= hoopDef().h ? 'Landscape' : 'Normal'}</button><button data-v="1" class="${doc.hoopRot ? 'on' : ''}">${hoopDef().w >= hoopDef().h ? 'Portrait' : 'Rotated'}</button></div></div>`);
    const fi = fitInfo(design());
    if (fi) parts.push(`<p class="small" style="margin:6px 0 0;color:${fi.fits ? 'var(--ok)' : '#ff8a8d'}">${fi.fits ? '✓ Your design (' + inch(fi.w) + ' × ' + inch(fi.h) + ' in) fits this hoop.' : (fi.fitsRot ? '⟳ Fits if you rotate the hoop.' : '✗ Your design (' + inch(fi.w) + ' × ' + inch(fi.h) + ' in) is bigger than this hoop.')}</p>`);
    parts.push(`<div class="btns" style="margin-top:10px">${btn('hDone', 'Done', 'primary')}${btn('hMore', 'Resize design…')}</div></div>`);
    mount(parts);
    sheet.querySelectorAll('[data-hoop]').forEach(el => el.addEventListener('click', () => { doc.hoopId = el.dataset.hoop; autosave(); updateHoopChip(); fit(); renderHoopSheet(); }));
    $('#hRot').querySelectorAll('button').forEach(b2 => b2.addEventListener('click', () => { doc.hoopRot = b2.dataset.v === '1'; autosave(); updateHoopChip(); fit(); renderHoopSheet(); }));
    const cw = $('#cW'), ch = $('#cH');
    const setC = () => { doc.customHoop = { w: Math.min(MAXF.w, parseFloat(cw.value) * IN || 150), h: Math.min(MAXF.w, parseFloat(ch.value) * IN || 150) }; autosave(); updateHoopChip(); fit(); };
    if (cw) { cw.addEventListener('change', setC); ch.addEventListener('change', setC); }
    on('hDone', () => renderSheet());
    on('hMore', () => renderSizeSheet());
  }
  function updateHoopChip() { const h = hoop(), c = $('#hoopChip'); if (c) c.textContent = `${hoopDef().name} · ${inch(h.w)} × ${inch(h.h)} in ▾`; }

  function renderSizeSheet() {
    const parts = ['<div class="sec"><h3>Design</h3>', `<div class="row"><label>Hoop</label><button class="btn" id="hPick" style="flex:1;text-align:left">${hoopDef().name} · ${inch(hoop().w)} × ${inch(hoop().h)} in</button></div>`,
      `<div class="row"><label>Design name</label><input type="text" id="hName" value="${esc(doc.name)}"></div>`,
      '<h3 style="margin-top:14px">Resize whole design</h3>',
      `<div class="row"><label>Width</label><input type="number" id="hWin" step="0.05" min="0.2" value="${(() => { const d = design(); return d.count ? inch(d.bounds[2] - d.bounds[0]) : ''; })()}"><span class="val">in</span></div>`,
      slider('Scale', 'hs', 25, 300, 1, 100, '%', () => {}),
      `<div class="btns">${btn('hApply', 'Apply scale', 'primary')}${btn('hClose', 'Close')}</div></div>`];
    mount(parts);
    on('hPick', () => renderHoopSheet());
    $('#hName').addEventListener('change', e => { doc.name = e.target.value || 'Untitled'; $('#title').textContent = doc.name; autosave(); });
    on('hApply', () => {
      let k = +$('#r_hs').value / 100;
      const wIn = parseFloat($('#hWin').value), d0 = design();
      if (k === 1 && wIn > 0 && d0.count) k = wIn * IN / (d0.bounds[2] - d0.bounds[0]);
      if (!k || Math.abs(k - 1) < 0.001) return;
      const h = hoop(), cx = h.w / 2, cy = h.h / 2, f = q => { q[0] = cx + (q[0] - cx) * k; q[1] = cy + (q[1] - cy) * k; };
      doc.objects.forEach(o => {
        if (o.type === 'fill') { o.paths.forEach(l => l.forEach(f)); (o.flow || []).forEach(l => l.forEach(f)); }
        else if (o.type === 'stitches') o.lines.forEach(l => l.forEach(f));
        else if (o.type === 'text') { const q = [o.x, o.y]; f(q); o.x = q[0]; o.y = q[1]; o.size *= k; if (o.bend) o.bend /= k; layoutText(o); }
        else o.points.forEach(q => { f(q); if (o.type === 'satin') q[2] *= k; });
      });
      if (doc.bg) { const q = [doc.bg.x, doc.bg.y]; f(q); doc.bg.x = q[0]; doc.bg.y = q[1]; doc.bg.w *= k; doc.bg.h *= k; }
      commit(); toast('Scaled to ' + Math.round(k * 100) + '%'); renderSizeSheet(); draw();
    });
    on('hClose', () => renderSheet());
  }

  function renderHelp() {
    mount([`<div class="sec"><h3>How to use</h3><div class="small" style="color:var(--text);line-height:1.5">
      <b>1. Open your image</b> (menu → Open image). Set its size under <b>Auto</b>.<br>
      <b>2a. Auto:</b> pick the number of thread colours and tap Auto-digitize. You get one fill layer per colour.<br>
      <b>2b. By hand:</b> <b>Fill</b> = tap around an area. <b>Satin</b> = tap down the middle of a column (borders, letters). <b>Line</b> = running stitch for details. <b>Text</b> = lettering, arched if you like.<br>
      <b>3. Fine-tune:</b> tap a shape, then change angle, density, stitch length, pull comp, underlay, colour. Drag dots to reshape.<br>
      <b>4. Order:</b> Layers → arrows. Background shapes first, outlines and details last.<br>
      <b>5. Check</b> with the eye button (realistic preview + sew-out slider), then <b>Export VP3</b>. Files go to your Downloads folder.<br><br>
      Tips: density 0.4 mm is standard; 0.35 for small text. Keep satin columns between 1 and 7 mm wide. Pull comp 0.2 mm keeps fills from shrinking.</div>
      <div class="btns" style="margin-top:10px">${btn('helpClose', 'Got it', 'primary')}</div></div>`]);
    on('helpClose', () => renderSheet());
  }

  // ---------------- wiring
  document.querySelectorAll('#tools button').forEach(b => b.addEventListener('click', () => {
    if (preview) { preview = false; $('#bPreview').classList.remove('on'); }
    imgMove = false; window.__imgSheet = false;
    setTool(b.dataset.tool === 'draw' ? drawKind : b.dataset.tool);
  }));
  $('#bUndo').addEventListener('click', undo);
  $('#bRedo').addEventListener('click', redo);
  $('#bFit').addEventListener('click', fit);
  const setRealBtn = () => $('#bReal').classList.toggle('on', doc.realistic !== false);
  $('#bReal').addEventListener('click', () => { doc.realistic = doc.realistic === false; setRealBtn(); autosave(); draw(); toast(doc.realistic ? 'Realistic thread view' : 'Simple line view (faster)'); });
  $('#bPreview').addEventListener('click', () => {
    preview = !preview; previewCache = null; progress = 1; draft = null;
    $('#bPreview').classList.toggle('on', preview);
    if (preview) busy(true);
    setTimeout(() => { if (preview) previewCache = design(); busy(false); renderSheet(); draw(); }, 20);
  });
  $('#bMenu').addEventListener('click', () => $('#menu').classList.add('open'));
  $('#menu').addEventListener('click', e => {
    const mi = e.target.closest('.mi');
    if (!mi && e.target.closest('.panel')) return;
    $('#menu').classList.remove('open');
    if (!mi) return;
    const a = mi.dataset.act;
    if (a === 'image') $('#fImage').click();
    if (a === 'embfile') $('#fEmb').click();
    if (a === 'vp3') exportFile('vp3');
    if (a === 'dst') exportFile('dst');
    if (a === 'size') { preview = false; renderSizeSheet(); }
    if (a === 'imgsize') { preview = false; $('#bPreview').classList.remove('on'); renderImageSheet(); }
    if (a === 'help') renderHelp();
    if (a === 'save') {
      const data = JSON.stringify(Object.assign({ app: 'StitchStudio', v: 1 }, doc));
      saveBytes(safeName() + '.stitch.json', new TextEncoder().encode(data), 'application/json');
    }
    if (a === 'open') $('#fProject').click();
    if (a === 'new') {
      if (doc.objects.length && !confirm('Start a new design? Unsaved changes will be lost.')) return;
      doc = newDoc(); bgImg = null; cache.clear(); selId = null; draft = null; undoStack.length = redoStack.length = 0; lastSnap = snapshot();
      autosave(); updateUndo(); $('#title').textContent = doc.name; updateHoopChip(); fit(); renderSheet();
    }
  });
  $('#fImage').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { loadBg(r.result, true); if (doc.name === 'Untitled') { doc.name = f.name.replace(/\.[^.]+$/, ''); $('#title').textContent = doc.name; } setTool('auto'); toast('Image loaded — trace it by hand or tap Auto-digitize'); };
    r.readAsDataURL(f); e.target.value = '';
  });
  $('#fEmb').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const buf = new Uint8Array(r.result), ext = f.name.split('.').pop().toLowerCase();
        const res = ext === 'dst' ? S.readDST(buf) : S.readVP3(buf);
        let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
        res.blocks.forEach(bl => bl.lines.forEach(l => l.forEach(q => { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); })));
        if (a === Infinity) { toast('No stitches found in that file'); return; }
        const h = hoop(), dx = h.w / 2 - (a + c) / 2, dy = h.h / 2 - (b + d) / 2;
        const base = f.name.replace(/\.[^.]+$/, '');
        let added = 0;
        res.blocks.forEach((bl, i) => {
          bl.lines.forEach(l => l.forEach(q => { q[0] += dx; q[1] += dy; }));
          const o = { type: 'stitches', name: base + ' · ' + (bl.name && !bl.name.startsWith('#') ? bl.name : 'colour ' + (i + 1)), lines: bl.lines, color: bl.color, id: doc.nextId++ };
          doc.objects.push(o); added++;
        });
        selId = null; commit(); renderSheet(); draw();
        const wIn = (c - a) / IN, hIn = (d - b) / IN;
        toast(`Added ${added} layer${added > 1 ? 's' : ''} from ${f.name} (${wIn.toFixed(2)} × ${hIn.toFixed(2)} in)`);
        if (c - a > h.w || d - b > h.h) setTimeout(() => toast('Heads up: it is bigger than the current hoop'), 2800);
      } catch (err) { console.error(err); toast('Could not read that file: ' + err.message); }
    };
    r.readAsArrayBuffer(f); e.target.value = '';
  });
  $('#fProject').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        doc = Object.assign(newDoc(), d); delete doc.app; delete doc.v;
        cache.clear(); selId = null; undoStack.length = redoStack.length = 0; lastSnap = snapshot(); updateUndo();
        bgImg = null; if (doc.bg) loadBg(doc.bg.src, false);
        if (typeof doc.hoop === 'number') { doc.hoopId = ['small100', 'splendid', 'metal180', 'crown', 'royal'][doc.hoop] || 'splendid'; delete doc.hoop; }
        $('#title').textContent = doc.name; updateHoopChip(); autosave(); fit(); renderSheet(); toast('Project opened');
      } catch (err) { toast('That file is not a Stitch Studio project'); }
    };
    r.readAsText(f); e.target.value = '';
  });
  $('#hoopChip').addEventListener('click', () => { if (preview) { preview = false; $('#bPreview').classList.remove('on'); draw(); } renderHoopSheet(); });
  $('#sMin').addEventListener('click', () => setSheetSize(sheetSize === 'max' ? 'normal' : 'min'));
  $('#sMax').addEventListener('click', () => setSheetSize(sheetSize === 'min' ? 'normal' : 'max'));
  $('#sheetTitle').addEventListener('click', () => setSheetSize(sheetSize === 'min' ? 'normal' : 'min'));
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe($('#stage'));

  // ---------------- start
  loadSaved();
  $('#title').textContent = doc.name;
  updateHoopChip();
  setRealBtn();
  updateUndo();
  setTool('select');
  requestAnimationFrame(() => { resize(); fit(); });
  window.__ss = { drawNow, zoom: (x, y, f) => { const r = cv.getBoundingClientRect(); view.s *= f; view.x = r.width / 2 - x * view.s; view.y = r.height / 2 - y * view.s; draw(); }, toPX, draft: () => draft, ptrs: () => pointers.size, doc: () => doc, design, autoDigitize, layoutText, setTool, addObject, exportFile, finishDraft };
})();
