/* Stitch Studio Desktop — PC shell around the shared editor (app.js).
   Adds: menus, docked layers panel with drag-to-reorder, rulers, status bar,
   keyboard shortcuts, drag & drop, clipboard, sew-out simulation, PNG mockups,
   production worksheet, save-to-folder. */
(function () {
  'use strict';
  const SS = window.SS; if (!SS) return;
  const $ = s => document.querySelector(s);
  const IN = 25.4, ACTUAL = 96 / 25.4;   // CSS px per mm at 100%
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inch = mm => (mm / IN).toFixed(2);
  const TYPE = { fill: 'Fill', satin: 'Satin', run: 'Line', text: 'Text', stitches: 'Stitches', import: 'Imported design' };

  // ---------------- dropdown menus
  const closeDD = () => { document.querySelectorAll('.dd.open').forEach(d => d.classList.remove('open')); document.querySelectorAll('.mb.open').forEach(b => b.classList.remove('open')); };
  document.querySelectorAll('[data-dd]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); const dd = $('#' + b.dataset.dd), was = dd.classList.contains('open'); closeDD(); $('#menu').classList.remove('open');
    if (was) return; const r = b.getBoundingClientRect(); dd.style.left = r.left + 'px'; dd.style.top = r.bottom + 2 + 'px'; dd.classList.add('open'); b.classList.add('open');
  }));
  $('#bMenu').addEventListener('click', closeDD);
  document.addEventListener('click', e => { if (!e.target.closest('.dd')) closeDD(); });
  document.querySelectorAll('.dd [data-cmd]').forEach(b => b.addEventListener('click', () => { closeDD(); run(b.dataset.cmd); }));

  // ---------------- commands
  let clip = null;
  const selObj = () => SS.sel();
  function moveTo(o, idx) { const d = SS.doc(), i = d.objects.indexOf(o); if (i < 0) return; d.objects.splice(i, 1); d.objects.splice(Math.max(0, Math.min(d.objects.length, idx)), 0, o); SS.commit(); SS.renderSheet(); SS.draw(); }
  function centerOf(o) { const b = SS.bbox(o); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null; }
  function run(cmd) {
    const o = selObj(), d = SS.doc(), h = SS.hoop();
    switch (cmd) {
      case 'undo': SS.undo(); break;
      case 'redo': SS.redo(); break;
      case 'copy': if (o) { clip = JSON.stringify(o); SS.toast('Copied ' + (o.name || TYPE[o.type])); } break;
      case 'paste': if (clip) { const c = JSON.parse(clip); delete c.id; SS.translate(c, 4, 4); SS.addObject(c); clip = JSON.stringify(c); } break;
      case 'dup': if (o) { const c = JSON.parse(JSON.stringify(o)); delete c.id; SS.translate(c, 4, 4); SS.addObject(c); } break;
      case 'del': if (o) { d.objects = d.objects.filter(x => x !== o); SS.select(null); SS.commit(); } break;
      case 'earlier': if (o) SS.move(o, -1); break;
      case 'later': if (o) SS.move(o, 1); break;
      case 'first': if (o) moveTo(o, 0); break;
      case 'last': if (o) moveTo(o, d.objects.length); break;
      case 'center': if (o) { const c = centerOf(o); SS.translate(o, h.w / 2 - c[0], h.h / 2 - c[1]); SS.commit(); SS.draw(); } break;
      case 'centerAll': { const ds = SS.design(); if (!ds.count) break; const b = ds.bounds, dx = h.w / 2 - (b[0] + b[2]) / 2, dy = h.h / 2 - (b[1] + b[3]) / 2; d.objects.forEach(x => SS.translate(x, dx, dy)); SS.commit(); SS.draw(); break; }
      case 'deselect': SS.select(null); break;
      case 'fit': SS.fit(); break;
      case 'actual': SS.zoomTo(ACTUAL); break;
      case 'zin': SS.zoomTo(SS.view().s * 1.25); break;
      case 'zout': SS.zoomTo(SS.view().s / 1.25); break;
      case 'real': $('#bReal').click(); break;
      case 'preview': $('#bPreview').click(); break;
      case 'sim': toggleSim(); break;
      case 'pic': SS.toggleBg(); break;
      case 'fabric': fabricModal(); break;
      case 'hoop': $('#hoopChip').click(); break;
      case 'png': exportPNG(); break;
      case 'sheet': worksheet(); break;
      case 'saveas': saveProject(true); break;
      case 'threads': threadModal(); break;
      case 'keys': keysModal(); break;
      case 'guide': document.querySelector('#menu [data-act=help]').click(); break;
    }
  }

  // ---------------- toolbar buttons
  $('#pOpen').addEventListener('click', openProject);
  $('#pSave').addEventListener('click', () => saveProject(false));
  $('#pVp3').addEventListener('click', () => SS.exportFile('vp3'));
  $('#pDst').addEventListener('click', () => SS.exportFile('dst'));
  $('#zoomSel').addEventListener('change', e => { const v = e.target.value; if (v === 'fit') SS.fit(); else if (v) SS.zoomTo(ACTUAL * +v); e.target.value = ''; });
  $('#lUp').addEventListener('click', () => run('earlier'));
  $('#lDown').addEventListener('click', () => run('later'));
  $('#lDup').addEventListener('click', () => run('dup'));
  $('#lDel').addEventListener('click', () => run('del'));

  // ---------------- keyboard shortcuts
  let spaceDown = false;
  const typing = e => /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range';
  window.addEventListener('keydown', e => {
    if (typing(e)) return;
    const k = e.key, c = e.ctrlKey || e.metaKey;
    if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
    if (c && k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); run('undo'); return; }
    if (c && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); run('redo'); return; }
    if (c && k.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
    if (c && k.toLowerCase() === 'o') { e.preventDefault(); openProject(); return; }
    if (c && k.toLowerCase() === 'e') { e.preventDefault(); SS.exportFile('vp3'); return; }
    if (c && k.toLowerCase() === 'n') { e.preventDefault(); document.querySelector('#menu [data-act=new]').click(); return; }
    if (c && k.toLowerCase() === 'c' && e.shiftKey) { e.preventDefault(); run('center'); return; }
    if (c && k.toLowerCase() === 'c') { if (selObj()) { e.preventDefault(); run('copy'); } return; }
    if (c && k.toLowerCase() === 'v') { return; }   // handled by paste event (pictures) / below
    if (c && k.toLowerCase() === 'd') { e.preventDefault(); run('dup'); return; }
    if (c && (k === '0')) { e.preventDefault(); run('fit'); return; }
    if (c && (k === '1')) { e.preventDefault(); run('actual'); return; }
    if (c && (k === '=' || k === '+')) { e.preventDefault(); run('zin'); return; }
    if (c && (k === '-' || k === '_')) { e.preventDefault(); run('zout'); return; }
    if (c) return;
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); run('del'); return; }
    if (k === 'Escape') { run('deselect'); return; }
    if (k === '[') { run(e.shiftKey ? 'first' : 'earlier'); return; }
    if (k === ']') { run(e.shiftKey ? 'last' : 'later'); return; }
    if (k === '{') { run('first'); return; }
    if (k === '}') { run('last'); return; }
    if (k === '?') { keysModal(); return; }
    if (k.startsWith('Arrow')) { const o = selObj(); if (!o) return; e.preventDefault(); const st = e.shiftKey ? 1 : 0.1; SS.translate(o, k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0); SS.draw(); clearTimeout(nudgeT); nudgeT = setTimeout(() => SS.commit(), 500); return; }
    const tools = { v: 'select', i: 'pick', b: 'brush', d: 'draw', t: 'text', a: 'auto', l: 'layers' };
    const t = tools[k.toLowerCase()]; if (t) { document.querySelector(`#tools [data-tool=${t}]`).click(); return; }
    if (k.toLowerCase() === 'r') run('real');
    if (k.toLowerCase() === 'p') run('preview');
    if (k.toLowerCase() === 'g') run('sim');
    if (k.toLowerCase() === 'h') run('pic');
  });
  let nudgeT = 0;
  window.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });

  // ---------------- pan with space-drag or middle mouse (captured before the editor sees it)
  const stage = $('#stage'); let panning = null;
  stage.addEventListener('pointerdown', e => {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault(); e.stopPropagation(); panning = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); stage.style.cursor = 'grabbing';
    }
  }, true);
  stage.addEventListener('pointermove', e => { if (panning) { e.stopPropagation(); SS.pan(e.clientX - panning.x, e.clientY - panning.y); panning = { x: e.clientX, y: e.clientY }; } }, true);
  stage.addEventListener('pointerup', e => { if (panning) { e.stopPropagation(); panning = null; stage.style.cursor = ''; } }, true);
  stage.addEventListener('auxclick', e => e.preventDefault());

  // ---------------- right-click context menu
  const ctx = document.createElement('div'); ctx.className = 'dd'; document.body.appendChild(ctx);
  SS.cv.addEventListener('contextmenu', e => {
    e.preventDefault(); closeDD();
    const r = SS.cv.getBoundingClientRect(), p = SS.toMM(e.clientX - r.left, e.clientY - r.top), o = SS.hitObject(p);
    if (o) SS.select(o.id);
    ctx.innerHTML = o ? `<div class="small" style="padding:4px 10px">${esc(o.name || TYPE[o.type])}</div>
      <button class="it" data-c="copy">Copy<span class="k">Ctrl+C</span></button><button class="it" data-c="dup">Duplicate<span class="k">Ctrl+D</span></button>
      <button class="it" data-c="center">Center in hoop</button><hr>
      <button class="it" data-c="first">Sew first</button><button class="it" data-c="earlier">Sew earlier</button><button class="it" data-c="later">Sew later</button><button class="it" data-c="last">Sew last</button><hr>
      <button class="it" data-c="del">Delete<span class="k">Del</span></button>`
      : `${clip ? '<button class="it" data-c="paste">Paste layer<span class="k">Ctrl+V</span></button>' : ''}<button class="it" data-c="fit">Fit hoop</button><button class="it" data-c="centerAll">Center whole design</button><button class="it" data-c="pic">Show / hide picture</button>`;
    ctx.style.left = e.clientX + 'px'; ctx.style.top = e.clientY + 'px'; ctx.classList.add('open');
    ctx.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { ctx.classList.remove('open'); run(b.dataset.c); }));
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.dd')) ctx.classList.remove('open'); });

  // ---------------- clipboard: paste a picture (screenshot / copied image) or a copied layer
  window.addEventListener('paste', e => {
    if (typing(e)) return;
    const items = [...(e.clipboardData ? e.clipboardData.items : [])], img = items.find(i => i.type.startsWith('image/'));
    if (img) { const f = img.getAsFile(), r = new FileReader(); r.onload = () => { SS.loadImageDataURL(r.result, 'Pasted picture'); SS.toast('Picture pasted — trace it or Auto-digitize'); }; r.readAsDataURL(f); e.preventDefault(); return; }
    if (clip) { run('paste'); e.preventDefault(); }
  });

  // ---------------- drag & drop files
  let dragDepth = 0;
  window.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#drop').classList.add('on'); } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('on'); } });
  window.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); dragDepth = 0; $('#drop').classList.remove('on');
    [...e.dataTransfer.files].forEach(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (f.type.startsWith('image/')) SS.openFileInput('#fImage', f);
      else if (ext === 'vp3' || ext === 'dst') SS.openFileInput('#fEmb', f);
      else if (ext === 'json' || ext === 'stitch') SS.openFileInput('#fProject', f);
      else SS.toast('Not a file Stitch Studio can open: ' + f.name);
    });
  });

  // ---------------- save / open with real files (File System Access API when available)
  let fileHandle = null;
  async function saveProject(asNew) {
    const data = JSON.stringify(Object.assign({ app: 'StitchStudio', v: 1 }, SS.doc()));
    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle || asNew) fileHandle = await showSaveFilePicker({ suggestedName: SS.safeName() + '.stitch.json', types: [{ description: 'Stitch Studio project', accept: { 'application/json': ['.json'] } }] });
        const w = await fileHandle.createWritable(); await w.write(data); await w.close();
        SS.toast('Saved ' + fileHandle.name); return;
      } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    SS.saveBytes(SS.safeName() + '.stitch.json', new TextEncoder().encode(data), 'application/json');
  }
  async function openProject() {
    if (window.showOpenFilePicker) {
      try {
        const [h] = await showOpenFilePicker({ types: [{ description: 'Stitch Studio project', accept: { 'application/json': ['.json'] } }] });
        const f = await h.getFile(); const d = JSON.parse(await f.text()); delete d.app; delete d.v;
        SS.setDoc(d); fileHandle = h; SS.toast('Opened ' + f.name); return;
      } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    $('#fProject').click();
  }

  // ---------------- layers panel (always visible), drag to reorder
  let layerSig = '', dragFrom = null;
  function renderLayers() {
    const d = SS.doc(), sid = SS.selId();
    const sig = JSON.stringify(d.objects.map(o => [o.id, o.name, o.color, o.hidden, o.type, o.blocks ? o.blocks.map(b => b.color) : 0])) + '|' + sid;
    if (sig === layerSig) return; layerSig = sig;
    const box = $('#pcLayers');
    if (!d.objects.length) { box.innerHTML = '<div class="small" style="padding:12px">No layers yet. Open a picture (Ctrl+O / drop it here), then trace it, Pick colours or Auto-digitize.</div>'; return; }
    box.innerHTML = d.objects.map((o, i) => {
      const dot = o.type === 'import' ? `conic-gradient(${o.blocks.map((b, k) => `${b.color} ${k / o.blocks.length * 100}% ${(k + 1) / o.blocks.length * 100}%`).join(',')})` : o.color;
      return `<div class="lr ${o.id === sid ? 'on' : ''} ${o.hidden ? 'hid' : ''}" draggable="true" data-id="${o.id}">
        <span class="num">${i + 1}</span><span class="dot" style="background:${dot}"></span>
        <span class="nm"><b>${esc(o.name || TYPE[o.type])}</b><small>${TYPE[o.type] || o.type}${o.type === 'fill' ? (o.satinLook ? ' · satin' : ' · tatami') : ''}</small></span>
        <button class="eye" data-eye="1" title="Show / hide"><svg viewBox="0 0 24 24">${o.hidden ? '<path d="M3 3l18 18"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" opacity=".4"/>' : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'}</svg></button></div>`;
    }).join('');
    box.querySelectorAll('.lr').forEach(el => {
      const o = d.objects.find(x => x.id === +el.dataset.id);
      el.addEventListener('click', e => { if (e.target.closest('[data-eye]')) { o.hidden = !o.hidden; SS.commit(); SS.draw(); return; } SS.select(o.id); });
      el.addEventListener('dblclick', e => { if (e.target.closest('[data-eye]')) return; const n = prompt('Layer name', o.name || ''); if (n != null) { o.name = n; SS.commit(); SS.renderSheet(); SS.draw(); } });
      el.addEventListener('dragstart', e => { dragFrom = o; e.dataTransfer.effectAllowed = 'move'; });
      el.addEventListener('dragover', e => { if (dragFrom) { e.preventDefault(); el.classList.add('dragover'); } });
      el.addEventListener('dragleave', () => el.classList.remove('dragover'));
      el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('dragover'); if (dragFrom && dragFrom !== o) { moveTo(dragFrom, d.objects.indexOf(o)); } dragFrom = null; });
    });
  }

  // ---------------- status bar + rulers
  let statSig = '', statT = 0, cursor = null;
  function updateStats() {
    const d = SS.doc(), sig = JSON.stringify(d.objects.map(o => [o.id, o.hidden, o.color])) + d.objects.length + (SS.doc().nextId) + '|' + JSON.stringify(SS.hoop());
    if (sig === statSig) return; statSig = sig;
    clearTimeout(statT); statT = setTimeout(() => {
      let ds; try { ds = SS.design(); } catch (e) { return; }
      const b = ds.bounds;
      $('#stN').textContent = ds.count.toLocaleString(); $('#stC').textContent = ds.colors.length; $('#stT').textContent = ds.trims;
      $('#stS').textContent = ds.count ? `${inch(b[2] - b[0])} × ${inch(b[3] - b[1])} in` : '–';
      $('#stM').textContent = ds.count ? '~' + Math.round(ds.count / 600 + ds.trims * 0.1 + ds.colors.length * 0.5) + ' min' : '–';
      const fi = SS.fitInfo(ds), el = $('#stFit');
      el.className = fi ? (fi.fits || fi.fitsRot ? 'fit-ok' : 'fit-bad') : '';
      el.textContent = fi ? (fi.fits ? '✓ fits ' + SS.hoopDef().name : fi.fitsRot ? '⟳ fits ' + SS.hoopDef().name + ' if rotated' : fi.machine ? '✗ too big for ' + SS.hoopDef().name : '✗ bigger than the Topaz 30 field') : '';
    }, 350);
  }
  function rulers() {
    const v = SS.view(), dpr = window.devicePixelRatio || 1;
    const draw1 = (cv, horiz) => {
      const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#1b1e25'; g.fillRect(0, 0, r.width, r.height);
      g.strokeStyle = '#4a5163'; g.fillStyle = '#98a1b1'; g.font = '10px system-ui'; g.lineWidth = 1;
      const len = horiz ? r.width : r.height, off = horiz ? v.x : v.y, ppi = v.s * IN;
      const step = ppi > 160 ? 1 / 16 : ppi > 80 ? 1 / 8 : ppi > 40 ? 1 / 4 : ppi > 18 ? 1 / 2 : 1;
      const start = Math.floor(-off / ppi / step) * step;
      g.beginPath();
      for (let t = start; t * ppi + off < len; t += step) {
        const p = Math.round(t * ppi + off) + 0.5; if (p < 0) continue;
        const whole = Math.abs(t - Math.round(t)) < 1e-6, half = Math.abs(t * 2 - Math.round(t * 2)) < 1e-6;
        const L = whole ? 22 : half ? 11 : 6;
        if (horiz) { g.moveTo(p, 22); g.lineTo(p, 22 - L); } else { g.moveTo(22, p); g.lineTo(22 - L, p); }
        if (whole) { if (horiz) g.fillText(Math.round(t) + '"', p + 3, 10); else { g.save(); g.translate(10, p + 3); g.rotate(-Math.PI / 2); g.fillText(Math.round(t) + '"', -18, 0); g.restore(); } }
      }
      g.stroke();
      if (cursor) { const c = horiz ? cursor[0] * v.s + v.x : cursor[1] * v.s + v.y; g.strokeStyle = '#f2b134'; g.beginPath(); if (horiz) { g.moveTo(c, 0); g.lineTo(c, 22); } else { g.moveTo(0, c); g.lineTo(22, c); } g.stroke(); }
    };
    draw1($('#rulerT'), true); draw1($('#rulerL'), false);
    $('#stZ').textContent = Math.round(v.s / ACTUAL * 100) + '%';
  }
  SS.cv.addEventListener('pointermove', e => {
    const r = SS.cv.getBoundingClientRect(); cursor = SS.toMM(e.clientX - r.left, e.clientY - r.top);
    $('#stX').textContent = inch(cursor[0]) + '"'; $('#stY').textContent = inch(cursor[1]) + '"'; rulers();
  });
  SS.cv.addEventListener('pointerleave', () => { cursor = null; rulers(); });
  window.onSSDraw = () => { renderLayers(); updateStats(); rulers(); syncToolbar(); };
  window.addEventListener('resize', () => setTimeout(rulers, 50));
  function syncToolbar() { $('#simPlay').classList.toggle('on', !!sim); }

  // ---------------- sew-out simulation
  let sim = null;
  function toggleSim() {
    if (sim) { cancelAnimationFrame(sim.raf); sim = null; syncToolbar(); return; }
    SS.setPreview(true);
    setTimeout(() => {
      const ds = SS.design(); if (!ds.count) { SS.toast('Nothing to simulate yet'); return; }
      let p = SS.progress(); if (p >= 0.999) p = 0;
      sim = { last: performance.now(), p, n: ds.count };
      const tick = t => {
        if (!sim) return;
        const dt = (t - sim.last) / 1000; sim.last = t;
        sim.p = Math.min(1, sim.p + dt * (+$('#simSpeed').value) / sim.n);
        SS.setProgress(sim.p); $('#simPos').value = Math.round(sim.p * 1000);
        if (sim.p >= 1) { sim = null; syncToolbar(); return; }
        sim.raf = requestAnimationFrame(tick);
      };
      sim.raf = requestAnimationFrame(tick); syncToolbar();
    }, 60);
  }
  $('#simPlay').addEventListener('click', toggleSim);
  $('#simPos').addEventListener('input', e => { if (sim) toggleSim(); SS.setPreview(true); SS.setProgress(+e.target.value / 1000); });

  // ---------------- realistic PNG mockup
  function renderMockup(pxPerMm, withFabric) {
    const ds = SS.design(); if (!ds.count) return null;
    const b = ds.bounds, m = 4, w = Math.ceil((b[2] - b[0] + 2 * m) * pxPerMm), h = Math.ceil((b[3] - b[1] + 2 * m) * pxPerMm);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (withFabric) { g.fillStyle = SS.Render.fabric(g, SS.doc().fabric || '#e9e7e1'); g.fillRect(0, 0, w, h); }
    const layers = []; let ci = 0, cur = null, line = null;
    const nl = () => { cur = { color: ds.colors[ci] ? ds.colors[ci].color : '#000', lines: [] }; layers.push(cur); line = null; };
    nl();
    for (const s of ds.stitches) { if (s.c === 3) { ci++; nl(); continue; } if (s.c === 0) { if (!line) { line = []; cur.lines.push(line); } line.push([s.x, s.y]); } else { line = [[s.x, s.y]]; cur.lines.push(line); } }
    SS.Render.draw(g, layers, { s: pxPerMm, x: (m - b[0]) * pxPerMm, y: (m - b[1]) * pxPerMm }, { thread: 0.46 });
    return c;
  }
  function exportPNG() {
    SS.busy(true);
    setTimeout(() => {
      const c = renderMockup(24, true); SS.busy(false);
      if (!c) { SS.toast('Nothing to export yet'); return; }
      c.toBlob(async bl => { const buf = new Uint8Array(await bl.arrayBuffer()); SS.saveBytes(SS.safeName() + '_mockup.png', buf, 'image/png'); }, 'image/png');
    }, 30);
  }

  // ---------------- production worksheet (print / save as PDF)
  function colourStops(ds) {
    const out = []; let ci = 0, n = 0, tr = 0;
    for (const s of ds.stitches) { if (s.c === 3) { out.push({ c: ds.colors[ci], n, tr }); ci++; n = 0; tr = 0; } else if (s.c === 0) n++; else if (s.c === 2) tr++; }
    out.push({ c: ds.colors[ci], n, tr });
    return out.filter(x => x.c && x.n);
  }
  function worksheet() {
    const ds = SS.design(); if (!ds.count) { SS.toast('Nothing to print yet'); return; }
    const c = renderMockup(14, true), img = c ? c.toDataURL('image/png') : '';
    const b = ds.bounds, d = SS.doc(), stops = colourStops(ds);
    const rows = stops.map((s, i) => { const t = SS.nearestThread(s.c.color); return `<tr><td>${i + 1}</td><td><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${s.c.color};border:1px solid #999;vertical-align:middle"></span></td><td>${esc(s.c.name && !s.c.name.startsWith('#') ? s.c.name : t[1])}</td><td>${s.c.color}</td><td>${t[1]}</td><td style="text-align:right">${s.n.toLocaleString()}</td></tr>`; }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.name)} — worksheet</title><style>
      body{font:13px system-ui,Segoe UI,Arial;margin:24px;color:#111} h1{font-size:20px;margin:0 0 4px} .muted{color:#666}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start} img{max-width:100%;border:1px solid #ddd;border-radius:6px}
      table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left} th{background:#f4f4f4}
      .stats td:first-child{color:#666;width:45%} @media print{button{display:none}}</style></head><body>
      <button onclick="print()" style="float:right;padding:8px 14px">Print / Save as PDF</button>
      <h1>${esc(d.name)}</h1><div class="muted">Stitch Studio production worksheet · ${new Date().toLocaleDateString()}</div><br>
      <div class="grid"><div><img src="${img}"></div><div><table class="stats">
      <tr><td>Size</td><td><b>${inch(b[2] - b[0])} × ${inch(b[3] - b[1])} in</b> (${(b[2] - b[0]).toFixed(1)} × ${(b[3] - b[1]).toFixed(1)} mm)</td></tr>
      <tr><td>Stitches</td><td><b>${ds.count.toLocaleString()}</b></td></tr><tr><td>Thread changes</td><td>${stops.length}</td></tr>
      <tr><td>Trims</td><td>${ds.trims}</td></tr><tr><td>Hoop</td><td>${esc(SS.hoopDef().name)} (${inch(SS.hoop().w)} × ${inch(SS.hoop().h)} in)</td></tr>
      <tr><td>Est. sew time</td><td>~${Math.round(ds.count / 600 + ds.trims * 0.1 + stops.length * 0.5)} min at 600 spm</td></tr>
      <tr><td>Machine</td><td>Husqvarna Viking Designer Topaz 30 · VP3</td></tr></table></div></div>
      <h2 style="font-size:15px;margin-top:22px">Thread sequence</h2>
      <table><tr><th>#</th><th></th><th>Colour</th><th>Hex</th><th>Nearest chart thread</th><th style="text-align:right">Stitches</th></tr>${rows}</table>
      <p class="muted" style="margin-top:18px">Stabilizer: cutaway for dense satin. Needle 75/11. 40 wt polyester or rayon on top, 60–90 wt bobbin.</p></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { SS.toast('Allow pop-ups to open the worksheet'); return; }
    w.document.write(html); w.document.close();
  }

  // ---------------- small dialogs
  function modal(html) { $('#modalBox').innerHTML = html + '<div class="btns" style="margin-top:14px;justify-content:flex-end"><button class="btn primary" id="mClose">Close</button></div>'; $('#modal').classList.add('open'); $('#mClose').onclick = () => $('#modal').classList.remove('open'); }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.remove('open'); });
  function keysModal() {
    const K = [['V / I / B / D / T / A / L', 'Select, Pick, Brush, Draw, Text, Auto, Order'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+S / Ctrl+Shift+S', 'Save / Save as (choose a folder)'], ['Ctrl+O', 'Open project'], ['Ctrl+E', 'Export VP3'], ['Ctrl+C / Ctrl+V', 'Copy / paste layer · Ctrl+V also pastes a screenshot as the picture'], ['Ctrl+D', 'Duplicate layer'], ['Del', 'Delete layer'], ['Arrows / Shift+Arrows', 'Nudge 0.1 mm / 1 mm'], ['[  ]  /  Shift+[  ]', 'Sew earlier / later / first / last'], ['Ctrl+Shift+C', 'Center layer in hoop'], ['Ctrl+0 / Ctrl+1', 'Fit hoop / actual size'], ['Ctrl+ + / Ctrl+ −, mouse wheel', 'Zoom'], ['Space+drag or middle mouse', 'Pan'], ['R / P / G / H', 'Realistic view / Preview / Play simulation / Hide picture'], ['Right-click', 'Layer menu'], ['Double-click a layer', 'Rename it'], ['Esc', 'Deselect / cancel']];
    modal('<h2>Keyboard shortcuts</h2><table>' + K.map(([k, v]) => `<tr><td style="white-space:nowrap"><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('') + '</table>');
  }
  function threadModal() {
    const ds = SS.design(); if (!ds.count) { SS.toast('Nothing yet'); return; }
    modal('<h2>Thread sequence</h2><table>' + colourStops(ds).map((s, i) => { const t = SS.nearestThread(s.c.color); return `<tr><td>${i + 1}</td><td><span class="sw" style="display:inline-block;background:${s.c.color}"></span></td><td>${esc(s.c.name && !s.c.name.startsWith('#') ? s.c.name : t[1])}</td><td class="small">${s.c.color} · nearest ${t[1]}</td><td style="text-align:right">${s.n.toLocaleString()} st</td></tr>`; }).join('') + '</table>');
  }
  function fabricModal() {
    const F = [['#f4f3ef', 'White'], ['#e9e7e1', 'Natural'], ['#1a1a1c', 'Black'], ['#1c2541', 'Navy'], ['#2648a8', 'Royal blue'], ['#8e1b1b', 'Red'], ['#7d8086', 'Gray'], ['#c8b48a', 'Khaki'], ['#2f4f2f', 'Forest'], ['#4a2c5e', 'Purple'], ['#c96a1b', 'Orange'], ['#5a3b24', 'Brown']];
    modal('<h2>Fabric colour</h2><div class="swatches">' + F.map(([c, n]) => `<button class="sw" data-f="${c}" title="${n}" style="width:40px;height:40px;background:${c}"></button>`).join('') + '</div>');
    $('#modalBox').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { SS.doc().fabric = b.dataset.f; SS.autosave(); SS.draw(); $('#modal').classList.remove('open'); }));
  }

  // ---------------- start
  document.body.classList.add('pc');
  setTimeout(() => { SS.fit(); renderLayers(); updateStats(); rulers(); }, 60);
})();
